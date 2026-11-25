// ─── Board protocol: applying what agents ask of the board ──────────────────
// Every finished run's verdict arrives here (terminal-executor `agentVerdicts`).
// The pure planner (workflow/harness/board-effects.ts) decides what to do; this
// file does it against the card store, the Inbox, the team file and the
// proposal review. Answers to questions come back through `kanban:answerQuestions`.
// See docs/plans/2026-11-25-agent-board-protocol.md (D2, flows A–D).

import * as vscode from 'vscode';
import type { ArtifactStore } from '../state/artifact-store';
import type { ArtifactChanges } from '../types';
import { agentVerdicts, type AgentVerdictEvent } from '../workflow/terminal-executor';
import { answerFollowUp, appendNote, planBoardEffects, type BoardEffect } from '../workflow/harness/board-effects';
import { readAgentNotes, type AgentNote } from '../workflow/harness/agent-brief';
import { readAgentTeam, withAssignment, writeAgentTeam, type AgentTeam } from '../workflow/harness/agent-team';
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
    case 'questions':
      deps.notify(cardId, 'question', `${effect.author} asks ${effect.questions.length === 1 ? 'a question' : `${effect.questions.length} questions`}`, { details: effect.questions });
      return;
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
  await followUpSender(store).submit(cardId, answerFollowUp(item.details ?? [], answer), post);
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
  const onReviewed = (goal: { source?: { cardId: string } }) => {
    const cardId = goal.source?.cardId;
    if (cardId && !goalDecomposer.pendingReview().some((g) => g.source?.cardId === cardId)) dismissNeedsYou(proposalKey(cardId));
  };
  goalDecomposer.on('reviewed', onReviewed);
  context.subscriptions.push({ dispose: () => goalDecomposer.off('reviewed', onReviewed) });
}
