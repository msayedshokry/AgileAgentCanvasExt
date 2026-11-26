// ─── Lead coordinator: runs the lead agent and applies its plan ─────────────
// An epic assigned to the team's lead is not implemented: the orchestrator
// hands it here. The lead runs the `aac-lead-dispatch` workflow (runbook from
// workflow/harness/lead-plan.ts), and this file applies its plan: proposed
// stories go to approval (or straight to cards with auto-approve), stories are
// assigned and started, the epic moves to review when the lead says the goal
// is met. Each story that finishes wakes the lead again, within LeadGuard's
// limits. See docs/plans/2026-11-25-agent-board-protocol.md, D5 and flow E.

import * as vscode from 'vscode';
import type { ArtifactStore } from '../state/artifact-store';
import type { ArtifactChanges } from '../types';
import type { KanbanVerdict } from '../workflow/kanban-verdict';
import { getOutputFolder } from '../workflow/kanban-verdict';
import { kanbanOrchestrator, kanbanProgress, setLeadHandler, type KanbanProgressEvent } from '../workflow/kanban-orchestrator';
import { terminalExecutor } from '../workflow/terminal-executor';
import { goalDecomposer, type ProposedGoal, type ProposedStory } from '../workflow/goal-decomposer';
import { isPerson, leadAgent, readAgentTeam, withAssignment, writeAgentTeam, type AgentTeam } from '../workflow/harness/agent-team';
import {
  buildLeadRunbook, LEAD_WORKFLOW, LeadGuard, planLeadEffects, type EpicStory, type LeadWake,
} from '../workflow/harness/lead-plan';
import { appendNote } from '../workflow/harness/board-effects';
import { readAgentNotes, type AgentNote } from '../workflow/harness/agent-brief';
import { dismissNeedsYou, notifyNeedsYou, type AttentionExtra, type AttentionKind } from './needs-you';
import { createLogger } from '../utils/logger';
import { errMsg } from '../utils/error';

const logger = createLogger('lead-coordinator');
/** Stories a single lead run may start at once; the lead starts more on later wakes. */
export const MAX_STARTS_PER_LEAD_RUN = 3;

export interface LeadCoordinatorDeps {
  readonly store: Pick<ArtifactStore, 'findArtifactById' | 'updateArtifact' | 'getEpics' | 'createEpic'>;
  readonly readTeam: () => AgentTeam;
  readonly writeTeam: (team: AgentTeam) => void;
  readonly runLead: (epic: Record<string, unknown>, runbook: string) => Promise<KanbanVerdict>;
  readonly startStory: (story: Record<string, unknown>) => void;
  readonly propose: (summary: string, source: { cardId: string; agent: string }, stories: ProposedStory[]) => { id: string };
  readonly autoApprove: () => boolean;
  readonly approveAll: (goalId: string) => Promise<void>;
  readonly notify: (key: string, kind: AttentionKind, reason: string, extra?: AttentionExtra) => void;
  readonly dismiss?: (key: string) => void;
  readonly now: () => Date;
}

export class LeadCoordinator {
  private readonly guard = new LeadGuard();
  /** Proposal goal id → the epic and the lead's assignments waiting on approval. */
  private readonly awaiting = new Map<string, { epicId: string; byRef: Map<string, { to: string; why?: string }> }>();

  constructor(private readonly deps: LeadCoordinatorDeps) {}

  /** True when this card is an epic assigned to the team's lead. */
  owns(artifact: { id?: unknown; type?: unknown } | undefined): boolean {
    if (!artifact || typeof artifact.id !== 'string') return false;
    const team = this.deps.readTeam();
    const lead = leadAgent(team);
    const isEpic = artifact.type === 'epic' || this.deps.store.getEpics().some((e) => e.id === artifact.id);
    return !!lead && isEpic && team.assignments[artifact.id] === lead.id;
  }

  /** The epic was started (dragged, run, or assigned to the lead). */
  async start(epicId: string): Promise<void> {
    this.guard.reset(epicId);
    await this.wake(epicId, { kind: 'start' });
  }

  /** The user typed a goal while a lead exists: make an epic for it and give it to the lead. */
  async planGoal(goal: string): Promise<string | undefined> {
    const team = this.deps.readTeam();
    const lead = leadAgent(team);
    if (!lead) return undefined;
    const epic = this.deps.store.createEpic();
    await this.deps.store.updateArtifact('epic', epic.id, { title: `Goal: ${goal.slice(0, 60)}`, goal, status: 'in-progress' } as ArtifactChanges);
    this.deps.writeTeam(withAssignment(team, epic.id, lead.id));
    await this.wake(epic.id, { kind: 'goal', goal });
    return epic.id;
  }

  /** A story under a lead epic finished or stopped. */
  async storyEnded(evt: KanbanProgressEvent): Promise<void> {
    const status = evt.agentState.status;
    if (status !== 'completed' && status !== 'interrupted' && status !== 'failed') return;
    const epicId = this.epicOfStory(evt.artifactId);
    if (!epicId || !this.owns({ id: epicId, type: 'epic' })) return;
    const title = String(this.deps.store.findArtifactById(evt.artifactId)?.artifact?.title ?? evt.artifactId);
    const what = status === 'completed' ? 'finished and is done' : `stopped: ${evt.agentState.failure?.title ?? 'no reason given'}`;
    await this.wake(epicId, { kind: 'finished', updates: [] }, `${evt.artifactId} "${title}" ${what}`);
  }

  /** A person moved their story to done by hand: clear their Inbox entry and wake the lead as for any finished story. */
  async storyMovedToDone(storyId: string): Promise<void> {
    const team = this.deps.readTeam();
    const member = team.agents.find((a) => a.id === team.assignments[storyId]);
    if (!isPerson(member)) return; // agents' stories wake the lead through their run's end
    this.deps.dismiss?.(storyId);
    const epicId = this.epicOfStory(storyId);
    if (!epicId || !this.owns({ id: epicId, type: 'epic' })) return;
    const title = String(this.deps.store.findArtifactById(storyId)?.artifact?.title ?? storyId);
    await this.wake(epicId, { kind: 'finished', updates: [] }, `${storyId} "${title}" was finished by ${member!.name} and is done`);
  }

  /** Proposed stories were approved and created: apply the lead's assignments that waited on them. */
  async storiesCreated(goal: ProposedGoal, persistedIds: readonly string[]): Promise<void> {
    const waiting = this.awaiting.get(goal.id);
    if (!waiting) return;
    this.awaiting.delete(goal.id);
    if (persistedIds.length !== goal.approvedStories.length) {
      await this.note(waiting.epicId, 'Board', 'Some approved stories could not be created, so the lead\'s assignments for them were not applied.');
      return;
    }
    const assign = goal.approvedStories.flatMap((s, i) => {
      const ref = s.id.split(':').pop() ?? '';
      const target = waiting.byRef.get(ref);
      return target ? [{ card: persistedIds[i], ...target }] : [];
    });
    await this.assignAndStart(waiting.epicId, assign);
  }

  private epicOfStory(storyId: string): string | undefined {
    return this.deps.store.getEpics().find((e) => (e.stories ?? []).some((s) => s.id === storyId))?.id;
  }

  private storiesOf(epicId: string): EpicStory[] {
    const team = this.deps.readTeam();
    const epic = this.deps.store.getEpics().find((e) => e.id === epicId);
    return (epic?.stories ?? []).map((s) => ({
      id: s.id, title: s.title, status: String(s.status ?? 'backlog'),
      ...(team.assignments[s.id] ? { assignee: team.assignments[s.id] } : {}),
    }));
  }

  private async wake(epicId: string, wake: LeadWake, update?: string): Promise<void> {
    const decision = this.guard.request(epicId, update);
    if (decision === 'queued') return;
    if (decision !== 'run') {
      const why = decision === 'limit'
        ? `The lead has run ${this.guard.runs(epicId)} times on this epic and stopped. Look at the epic, then start it again to give the lead more runs.`
        : 'The lead ran twice without assigning or asking anything, so it stopped. Look at the epic, then start it again.';
      this.deps.notify(epicId, 'stopped', why);
      return;
    }
    const updates = this.guard.takeUpdates(epicId);
    const effectiveWake: LeadWake = updates.length ? { kind: 'finished', updates } : wake;
    let didSomething = false;
    try {
      didSomething = await this.runOnce(epicId, effectiveWake);
    } catch (err) {
      logger.warn(`[Lead] run on ${epicId} failed: ${errMsg(err)}`);
      this.deps.notify(epicId, 'stopped', `The lead's run failed: ${errMsg(err)}`);
    }
    if (this.guard.finish(epicId, didSomething)) await this.wake(epicId, { kind: 'finished', updates: [] });
  }

  /** One lead run; returns true when the lead assigned, proposed, asked or finished something. */
  private async runOnce(epicId: string, wake: LeadWake): Promise<boolean> {
    const found = this.deps.store.findArtifactById(epicId);
    if (!found) return false;
    const team = this.deps.readTeam();
    const stories = this.storiesOf(epicId);
    const verdict = await this.deps.runLead(found.artifact, buildLeadRunbook(stories, team.agents, wake));
    const lead = leadAgent(team);
    if (verdict.summary) await this.note(epicId, lead?.name ?? 'Lead', verdict.summary);
    const asked = (verdict.board?.questions.length ?? 0) > 0; // raised by the board protocol applier
    if (!verdict.lead) {
      if (verdict.verdict !== 'COMPLETED') this.deps.notify(epicId, 'stopped', `The lead's run ended ${verdict.verdict}${verdict.summary ? `: ${verdict.summary}` : ''}`);
      return asked;
    }

    const effects = planLeadEffects(verdict.lead, stories, team.agents);
    if (effects.refused.length) await this.note(epicId, 'Board', `Not applied from the lead's plan: ${effects.refused.join('; ')}.`);

    if (effects.propose.length) {
      const proposed: ProposedStory[] = effects.propose.map((s) => ({
        id: `lead:${epicId}:${s.ref}`, title: s.title, epicId,
        ...(s.description ? { description: s.description } : {}),
        ...(s.acceptance?.length ? { acceptance: [...s.acceptance] } : {}),
      }));
      const goal = this.deps.propose(`${lead?.name ?? 'The lead'} plans ${proposed.length} stor${proposed.length === 1 ? 'y' : 'ies'} for ${epicId}`, { cardId: epicId, agent: lead?.name ?? 'Lead' }, proposed);
      this.awaiting.set(goal.id, {
        epicId,
        byRef: new Map(effects.assignOnApproval.map((a) => [a.ref, { to: a.to.id, ...(a.why ? { why: a.why } : {}) }])),
      });
      if (this.deps.autoApprove()) await this.deps.approveAll(goal.id); // storiesCreated applies the assignments
      else this.deps.notify(`PROPOSALS-${epicId}`, 'proposal', `${lead?.name ?? 'The lead'} proposes ${proposed.length} new stor${proposed.length === 1 ? 'y' : 'ies'}`, {
        cardId: epicId, details: proposed.map((p) => p.title),
      });
    }

    await this.assignAndStart(epicId, effects.assignNow.map((a) => ({ card: a.card, to: a.to.id, ...(a.why ? { why: a.why } : {}) })));

    if (effects.next === 'review') {
      await this.deps.store.updateArtifact(found.type, epicId, { status: 'review' } as ArtifactChanges);
      this.deps.notify(epicId, 'approval', `${lead?.name ?? 'The lead'} says this epic's goal is met. Check it and mark it done.`);
    }
    return effects.propose.length > 0 || effects.assignNow.length > 0 || effects.next !== 'wait' || asked;
  }

  private async assignAndStart(epicId: string, assign: ReadonlyArray<{ card: string; to: string; why?: string }>): Promise<void> {
    if (assign.length === 0) return;
    let team = this.deps.readTeam();
    for (const a of assign) team = withAssignment(team, a.card, a.to);
    this.deps.writeTeam(team);
    let started = 0;
    const leadName = leadAgent(team)?.name ?? 'Lead';
    let forPeople = 0;
    for (const a of assign) {
      const member = team.agents.find((x) => x.id === a.to);
      const name = member?.name ?? a.to;
      await this.note(a.card, leadName, `Assigned to ${name}${a.why ? `: ${a.why}` : '.'}`);
      const story = this.deps.store.findArtifactById(a.card);
      if (isPerson(member)) {
        // A person works the card themselves; moving it to done wakes the lead (storyMovedToDone).
        forPeople++;
        const title = String(story?.artifact?.title ?? a.card);
        this.deps.notify(a.card, 'assigned', `${leadName} assigned ${name} "${title}"`, a.why ? { details: [a.why] } : undefined);
        continue;
      }
      const status = String(story?.artifact?.status ?? '');
      if (story && (status === 'ready-for-dev' || status === 'backlog' || status === 'ready') && started < MAX_STARTS_PER_LEAD_RUN) {
        started++;
        this.deps.startStory(story.artifact);
      }
    }
    const waiting = assign.length - forPeople - started;
    if (waiting > 0) {
      await this.note(epicId, 'Board', `${waiting} assigned stor${waiting === 1 ? 'y waits' : 'ies wait'} to start (at most ${MAX_STARTS_PER_LEAD_RUN} start per lead run, and only ready stories).`);
    }
  }

  private async note(cardId: string, author: string, text: string): Promise<void> {
    const found = this.deps.store.findArtifactById(cardId);
    if (!found) return;
    const note: AgentNote = { author, text, at: this.deps.now().toISOString().slice(0, 16).replace('T', ' ') };
    await this.deps.store.updateArtifact(found.type, cardId, { metadata: { agentNotes: appendNote(readAgentNotes(found.artifact), note) } } as ArtifactChanges);
  }
}

let coordinator: LeadCoordinator | undefined;

export function leadCoordinator(): LeadCoordinator | undefined {
  return coordinator;
}

/** Wire the lead: the orchestrator hands lead epics here, finished stories wake it, approvals apply its assignments. */
export function registerLeadCoordinator(context: vscode.ExtensionContext, store: ArtifactStore): LeadCoordinator {
  const deps: LeadCoordinatorDeps = {
    store,
    readTeam: () => readAgentTeam(getOutputFolder()).team,
    writeTeam: (team) => writeAgentTeam(getOutputFolder(), team),
    runLead: (epic, runbook) => terminalExecutor.executeAndAwaitVerdict(LEAD_WORKFLOW, epic as never, undefined, { skillContent: runbook, turnContext: runbook }),
    startStory: (story) => { void kanbanOrchestrator.runAutonomous(story, {}).catch((err) => logger.warn(`[Lead] could not start ${String(story.id)}: ${errMsg(err)}`)); },
    propose: (summary, source, stories) => goalDecomposer.proposeStories(summary, source, stories),
    autoApprove: () => vscode.workspace.getConfiguration('agileagentcanvas').get<boolean>('agents.autoApproveProposals', false) === true,
    approveAll: async (goalId) => {
      const goal = goalDecomposer.getGoal(goalId);
      if (!goal) return;
      await goalDecomposer.approveStories(goalId, goal.proposedStories.map((s) => s.id));
      await goalDecomposer.dispatch(goalId);
    },
    notify: (key, kind, reason, extra) => notifyNeedsYou(key, kind, reason, extra),
    dismiss: (key) => dismissNeedsYou(key),
    now: () => new Date(),
  };
  coordinator = new LeadCoordinator(deps);
  const c = coordinator;
  setLeadHandler({
    owns: (artifact) => c.owns(artifact),
    start: async (artifact) => {
      void c.start(String(artifact.id));
      return { ok: true, workflowLaunched: true, status: 'complete' };
    },
  });
  const onDispatched = (payload: { goal: ProposedGoal; persistedIds: string[] }) => { void c.storiesCreated(payload.goal, payload.persistedIds); };
  goalDecomposer.on('dispatched', onDispatched);
  context.subscriptions.push(
    kanbanProgress.event((evt) => { void c.storyEnded(evt); }),
    { dispose: () => { goalDecomposer.off('dispatched', onDispatched); setLeadHandler(undefined); coordinator = undefined; } },
  );
  return coordinator;
}
