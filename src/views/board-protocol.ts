// ─── Board protocol: applying what agents ask of the board ──────────────────
// Every finished run's verdict arrives here (terminal-executor `agentVerdicts`).
// The pure planner (workflow/harness/board-effects.ts) decides what to do; this
// file does it against the card store, the Inbox, the team file and the
// proposal review. Answers to questions come back through `kanban:answerQuestions`.
// See docs/plans/2026-11-25-agent-board-protocol.md (D2, flows A–D).

import * as vscode from 'vscode';
import type { ArtifactStore } from '../state/artifact-store';
import type { ArtifactChanges } from '../types';
import { agentVerdicts, setEpicContextResolver, terminalExecutor, type AgentVerdictEvent } from '../workflow/terminal-executor';
import { liveQuestions, registerBoardLive } from './board-live';
import { normalizeQuestion } from '../workflow/board-live/live-questions';
import { answerFollowUp, appendNote, planBoardEffects, type BoardEffect } from '../workflow/harness/board-effects';
import { readAgentNotes, type AgentNote } from '../workflow/harness/agent-brief';
import { readEpicContext, validateEpicContext, type EpicContext } from '../workflow/harness/epic-context';
import { assignedAgent, capacityOf, isPerson, readAgentTeam, withAssignment, writeAgentTeam, type AgentTeam } from '../workflow/harness/agent-team';
import { agentWaitAlert, setAgentResolver } from '../workflow/kanban-orchestrator';
import { getHarnessAdapter } from '../workflow/harness/harness-adapters';
import { goalDecomposer, type ProposedStory } from '../workflow/goal-decomposer';
import { getOutputFolder } from '../workflow/kanban-verdict';
import { dismissNeedsYou, needsYouList, notifyNeedsYou, type AttentionExtra, type AttentionKind } from './needs-you';
import { followUpSender } from './follow-up-messages';
import { createLogger } from '../utils/logger';
import { errMsg } from '../utils/error';

const logger = createLogger('board-protocol');
const CONFIG = 'agileagentcanvas';

/** Inbox key for a card's pending proposals (separate from the card's own entry). */
export const proposalKey = (cardId: string) => `PROPOSALS-${cardId}`;

export interface BoardProtocolDeps {
  readonly store: Pick<ArtifactStore, 'findArtifactById' | 'updateArtifact' | 'getEpics'>;
  readonly readTeam: () => AgentTeam;
  readonly writeTeam: (team: AgentTeam) => void;
  readonly notify: (key: string, kind: AttentionKind, reason: string, extra?: AttentionExtra) => void;
  readonly propose: (summary: string, source: { cardId: string; agent: string }, stories: ProposedStory[]) => { id: string };
  readonly autoApprove: () => boolean;
  /** Approve every story of a proposal and turn them into cards. */
  readonly approveAll: (goalId: string) => Promise<void>;
  readonly now: () => Date;
}

/** The epic a card belongs to: itself when it is an epic, else the epic holding it. */
export function epicOf(store: Pick<ArtifactStore, 'getEpics'>, cardId: string): string | undefined {
  for (const epic of store.getEpics()) {
    if (epic.id === cardId) return epic.id;
    if ((epic.stories ?? []).some((s) => s.id === cardId)) return epic.id;
  }
  return undefined;
}

/** The context attached to a card's epic, for its brief. */
export function epicContextFor(store: Pick<ArtifactStore, 'getEpics'>, cardId: string): { epicId: string; context: EpicContext } | undefined {
  const epicId = epicOf(store, cardId);
  const context = epicId ? readEpicContext(store.getEpics().find((e) => e.id === epicId)) : undefined;
  return epicId && context ? { epicId, context } : undefined;
}

/** Save an epic's context from its detail panel. */
export async function saveEpicContext(store: ArtifactStore, epicId: string, raw: unknown, post: (m: Record<string, unknown>) => void): Promise<void> {
  if (!store.getEpics().some((e) => e.id === epicId)) {
    post({ type: 'kanban:epicContextError', artifactId: epicId, error: 'That epic no longer exists.' });
    return;
  }
  const result = validateEpicContext(raw);
  if ('error' in result) {
    post({ type: 'kanban:epicContextError', artifactId: epicId, error: result.error });
    return;
  }
  await store.updateArtifact('epic', epicId, { metadata: { agentContext: result.context } } as ArtifactChanges);
  post({ type: 'kanban:epicContextSaved', artifactId: epicId, context: result.context });
}

async function addNote(deps: BoardProtocolDeps, cardId: string, author: string, text: string): Promise<void> {
  const found = deps.store.findArtifactById(cardId);
  if (!found) return;
  const note: AgentNote = { author, text, at: deps.now().toISOString().slice(0, 16).replace('T', ' ') };
  await deps.store.updateArtifact(found.type, cardId, { metadata: { agentNotes: appendNote(readAgentNotes(found.artifact), note) } } as ArtifactChanges);
}

async function applyEffect(deps: BoardProtocolDeps, cardId: string, effect: BoardEffect): Promise<void> {
  switch (effect.type) {
    case 'note':
      await addNote(deps, cardId, effect.author, effect.text);
      return;
    case 'questions': {
      // A question the user already answered during the run (board_ask) is not asked again.
      const answered = liveQuestions.takeAnswered(cardId);
      const open = effect.questions.filter((q) => !answered.has(normalizeQuestion(q)));
      if (open.length === 0) return;
      deps.notify(cardId, 'question', `${effect.author} asks ${open.length === 1 ? 'a question' : `${open.length} questions`}`, { details: open });
      return;
    }
    case 'proposals': {
      const epicId = epicOf(deps.store, cardId);
      const stories: ProposedStory[] = effect.proposals.map((p, i) => ({
        id: `${cardId}-p${Date.now()}-${i}`,
        title: p.title,
        description: [p.description, p.why ? `Why: ${p.why}` : ''].filter(Boolean).join('\n\n'),
        ...(epicId ? { epicId } : {}),
      }));
      const goal = deps.propose(`Proposed by ${effect.author} while working on ${cardId}`, { cardId, agent: effect.author }, stories);
      if (deps.autoApprove()) {
        await deps.approveAll(goal.id);
        await addNote(deps, cardId, 'Board', `Created ${stories.length} card(s) ${effect.author} proposed (auto-approve is on).`);
      } else {
        deps.notify(proposalKey(cardId), 'proposal', `${effect.author} proposes ${stories.length} new card${stories.length === 1 ? '' : 's'}`, {
          cardId, details: stories.map((s) => s.title),
        });
      }
      return;
    }
    case 'handoff':
      deps.writeTeam(withAssignment(deps.readTeam(), cardId, effect.to.id));
      await addNote(deps, cardId, effect.from, `Handed off to ${effect.to.name}${effect.note ? `: ${effect.note}` : '.'}`);
      return;
  }
}

/** Apply one finished run's board requests. Never throws: a failed effect is logged and noted. */
export async function applyAgentVerdict(deps: BoardProtocolDeps, evt: AgentVerdictEvent): Promise<void> {
  const fallbackAuthor = getHarnessAdapter(evt.agent?.harness ?? '')?.label ?? 'The agent';
  const effects = planBoardEffects({ verdict: evt.verdict, agent: evt.agent, fallbackAuthor, roster: deps.readTeam().agents });
  for (const effect of effects) {
    try {
      await applyEffect(deps, evt.artifactId, effect);
    } catch (err) {
      logger.warn(`[BoardProtocol] ${effect.type} on ${evt.artifactId} failed: ${errMsg(err)}`);
    }
  }
}

/** The user answered a card's questions: send the agent a follow-up in the same conversation. */
export async function answerQuestions(store: ArtifactStore, cardId: string, answer: string, post: (m: Record<string, unknown>) => void): Promise<boolean> {
  const item = needsYouList().find((i) => i.artifactId === cardId && i.kind === 'question');
  if (!item || !answer.trim()) return false;
  // An agent still waiting in board_ask gets the answer in its current run.
  if (liveQuestions.answer(cardId, answer.trim())) {
    await addNote(defaultDeps(store), cardId, 'You', answer.trim());
    post({ type: 'kanban:cardNotesChanged', artifactId: cardId });
  } else {
    await followUpSender(store).submit(cardId, answerFollowUp(item.details ?? [], answer), post, { note: answer.trim() });
  }
  dismissNeedsYou(cardId);
  return true;
}

function defaultDeps(store: ArtifactStore): BoardProtocolDeps {
  return {
    store,
    readTeam: () => readAgentTeam(getOutputFolder()).team,
    writeTeam: (team) => writeAgentTeam(getOutputFolder(), team),
    notify: (key, kind, reason, extra) => notifyNeedsYou(key, kind, reason, extra),
    propose: (summary, source, stories) => goalDecomposer.proposeStories(summary, source, stories),
    autoApprove: () => vscode.workspace.getConfiguration(CONFIG).get<boolean>('agents.autoApproveProposals', false) === true,
    approveAll: async (goalId) => {
      const goal = goalDecomposer.getGoal(goalId);
      if (!goal) return;
      await goalDecomposer.approveStories(goalId, goal.proposedStories.map((s) => s.id));
      await goalDecomposer.dispatch(goalId);
    },
    now: () => new Date(),
  };
}

/** Board messages for questions and proposals. Returns true when the message was ours. */
export async function handleBoardProtocolMessage(
  message: { type: string; [key: string]: unknown },
  store: ArtifactStore,
  webview?: vscode.Webview,
): Promise<boolean> {
  const post = (m: Record<string, unknown>) => { void webview?.postMessage(m); };
  const cardId = typeof message.artifactId === 'string' ? message.artifactId : undefined;
  try {
    switch (message.type) {
      case 'kanban:answerQuestions':
        if (cardId && typeof message.answer === 'string') await answerQuestions(store, cardId, message.answer, post);
        return true;
      case 'kanban:getEpicContext':
        if (cardId) post({ type: 'kanban:epicContext', artifactId: cardId, context: epicContextFor(store, cardId)?.context ?? null });
        return true;
      case 'kanban:saveEpicContext':
        if (cardId) await saveEpicContext(store, cardId, message.context, post);
        return true;
      case 'kanban:reviewProposals': {
        if (!cardId) return true;
        const goal = goalDecomposer.pendingReview().find((g) => g.source?.cardId === cardId);
        if (goal) post({ type: 'kanban:openProposalReview', goal });
        else dismissNeedsYou(proposalKey(cardId)); // already reviewed elsewhere
        return true;
      }
      default:
        return false;
    }
  } catch (err) {
    logger.warn(`${message.type} failed: ${errMsg(err)}`);
    void vscode.window.showErrorMessage(`Agile Agent Canvas: ${errMsg(err)}`);
    return true;
  }
}

/** Wire the applier to every finished run, and clear proposal entries once they are reviewed. */
export function registerBoardProtocol(context: vscode.ExtensionContext, store: ArtifactStore): void {
  const deps = defaultDeps(store);
  context.subscriptions.push(agentVerdicts.event((evt) => { void applyAgentVerdict(deps, evt); }));
  // Board tools during a run (Claude Code, Codex): same applier, so both channels behave the same.
  registerBoardLive(context, {
    store,
    readTeam: deps.readTeam,
    apply: (evt) => applyAgentVerdict(deps, evt),
    notifyQuestion: (cardId, reason, questions) => notifyNeedsYou(cardId, 'question', reason, { details: questions }),
    dismiss: (cardId) => dismissNeedsYou(cardId),
    takeMessages: (cardId) => followUpSender(store).takeForRun(cardId),
  }, (cardId) => terminalExecutor.noteActivity(cardId));
  // Context the user attached to the card's epic goes into every run's brief (L9).
  setEpicContextResolver((cardId) => epicContextFor(store, cardId));
  context.subscriptions.push({ dispose: () => setEpicContextResolver(undefined) });
  // Capacity: the orchestrator asks which agent a card runs on, and how many runs it may have.
  setAgentResolver((cardId) => {
    const agent = assignedAgent(deps.readTeam(), cardId);
    return agent ? { agentId: agent.id, name: agent.name, capacity: capacityOf(agent), ...(isPerson(agent) ? { person: true } : {}) } : undefined;
  });
  context.subscriptions.push(
    agentWaitAlert.event(({ artifactId, agent }) => notifyNeedsYou(artifactId, 'paused', `Waiting over 30 minutes for ${agent}, who is busy. Raise ${agent}'s capacity or assign the card to another agent.`)),
    { dispose: () => setAgentResolver(undefined) },
  );
  const onReviewed = (goal: { source?: { cardId: string } }) => {
    const cardId = goal.source?.cardId;
    if (cardId && !goalDecomposer.pendingReview().some((g) => g.source?.cardId === cardId)) dismissNeedsYou(proposalKey(cardId));
  };
  goalDecomposer.on('reviewed', onReviewed);
  context.subscriptions.push({ dispose: () => goalDecomposer.off('reviewed', onReviewed) });
}
