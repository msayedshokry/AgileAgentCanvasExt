// ─── Lead agent: runbook, plan checks and loop guards ───────────────────────
// The lead (chief of staff) owns an epic. It never implements: each run reads
// the epic, its stories and the team, and answers with a `lead` block in its
// verdict — new stories to propose, who takes which story, and what happens
// next. It is woken again whenever one of the epic's stories finishes.
// See docs/plans/2026-11-25-agent-board-protocol.md, D5 and flow E. Pure.

import type { LeadPlan } from './board-actions';
import { LIMITS } from './board-actions';
import type { TeamAgent } from './agent-team';

export const LEAD_WORKFLOW = 'aac-lead-dispatch';
export const MAX_LEAD_RUNS_PER_EPIC = 20;
export const MAX_IDLE_LEAD_RUNS = 2;

export interface EpicStory {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly assignee?: string;
}

/** Why the lead is running now. */
export type LeadWake =
  | { readonly kind: 'start' }
  | { readonly kind: 'goal'; readonly goal: string }
  | { readonly kind: 'finished'; readonly updates: readonly string[] };

export function describeWake(wake: LeadWake): string {
  switch (wake.kind) {
    case 'start': return 'You were just given this epic. Plan it and hand out the first stories.';
    case 'goal': return `The user gave you this goal; this epic was created for it:\n\n${wake.goal}`;
    case 'finished': return `Since your last run:\n${wake.updates.map((u) => `- ${u}`).join('\n')}`;
  }
}

/** The lead's task, passed as the run's workflow definition. */
export function buildLeadRunbook(stories: readonly EpicStory[], roster: readonly TeamAgent[], wake: LeadWake): string {
  const members = roster.filter((a) => !a.lead);
  const team = members.length
    ? members.map((a) => `| \`${a.id}\` | ${a.name}${a.kind === 'person' ? ' (person)' : ''} | ${a.role ?? '—'} |`).join('\n')
    : '| — | (no other agents yet: propose stories and ask the user to add agents) | |';
  const board = stories.length
    ? stories.map((s) => `| \`${s.id}\` | ${s.title} | ${s.status} | ${s.assignee ?? 'unassigned'} |`).join('\n')
    : '| — | (no stories yet) | | |';
  return `# Lead: plan and hand out this epic

You are this team's lead. You plan and coordinate; you never implement, edit code, or mark anything done. Each run, read the epic and its stories, decide the next step, write your verdict, and stop.

## What happened
${describeWake(wake)}

## The team (hand stories only to these ids)
| id | name | role |
|---|---|---|
${team}

## The epic's stories
| id | title | status | assignee |
|---|---|---|---|
${board}

## Your verdict
Write verdict \`COMPLETED\` with a \`"lead"\` object:
\`\`\`json
{
  "verdict": "COMPLETED",
  "summary": "One line: what you decided and why.",
  "lead": {
    "stories": [{ "ref": "a", "title": "…", "description": "…", "acceptance": ["…"] }],
    "assign": [{ "card": "a", "to": "<agent id>", "why": "…" }],
    "next": "wait"
  }
}
\`\`\`
- \`stories\`: new stories this epic needs (up to ${LIMITS.leadStories}). Give each a short \`ref\`; the user approves them before they become cards. Don't repeat stories that already exist.
- \`assign\`: who takes which story, by story id or by the \`ref\` of a story you propose in this run (up to ${LIMITS.leadAssignments}). Match the work to the agent's role. Only ready stories are started; give a one-line \`why\`. A member marked (person) is a human: assigning to them asks them in their Inbox and starts nothing, so give people only work an agent can't do.
- \`next\`: \`"wait"\` to be woken when a story finishes; \`"review"\` when every story is done and the epic's goal is met (the user then checks it and marks it done); \`"ask"\` when you need the user — put your questions in \`"board": {"questions": [...]}\`.
- Don't reassign a story that is running. If a story stopped, read its notes and decide: reassign it, split it, or ask.
`;
}

export interface LeadEffects {
  readonly propose: LeadPlan['stories'];
  /** Assignments to existing stories, ready to apply. */
  readonly assignNow: ReadonlyArray<{ card: string; to: TeamAgent; why?: string }>;
  /** Assignments to stories proposed in this run, applied once they are approved. */
  readonly assignOnApproval: ReadonlyArray<{ ref: string; to: TeamAgent; why?: string }>;
  readonly next: LeadPlan['next'];
  /** What was refused, in plain words, for the epic's notes. */
  readonly refused: readonly string[];
}

const RUNNING = new Set(['in-progress', 'review', 'in-review']);

export function planLeadEffects(plan: LeadPlan, stories: readonly EpicStory[], roster: readonly TeamAgent[]): LeadEffects {
  const refused: string[] = [];
  const existing = new Set(stories.map((s) => s.title.trim().toLowerCase()));
  const propose = plan.stories.filter((s) => {
    if (existing.has(s.title.trim().toLowerCase())) { refused.push(`story "${s.title}" already exists`); return false; }
    return true;
  });
  const refs = new Set(propose.map((s) => s.ref));
  const assignNow: Array<{ card: string; to: TeamAgent; why?: string }> = [];
  const assignOnApproval: Array<{ ref: string; to: TeamAgent; why?: string }> = [];
  for (const a of plan.assign) {
    const to = roster.find((r) => r.id === a.to);
    const why = a.why ? { why: a.why } : {};
    if (!to) { refused.push(`assigning ${a.card} to "${a.to}", who is not on the team`); continue; }
    if (to.lead) { refused.push(`assigning ${a.card} to the lead itself`); continue; }
    if (refs.has(a.card)) { assignOnApproval.push({ ref: a.card, to, ...why }); continue; }
    const story = stories.find((s) => s.id === a.card);
    if (!story) { refused.push(`assigning ${a.card}, which is not a story in this epic`); continue; }
    if (RUNNING.has(story.status)) { refused.push(`reassigning ${a.card} while it is running`); continue; }
    if (story.status === 'done') { refused.push(`assigning ${a.card}, which is done`); continue; }
    assignNow.push({ card: a.card, to, ...why });
  }
  return { propose, assignNow, assignOnApproval, next: plan.next, refused };
}

/** Per-epic loop guard: caps runs, merges wakes while a run is going, stops a lead that keeps doing nothing. */
export class LeadGuard {
  private readonly epics = new Map<string, { runs: number; idle: number; running: boolean; pending: string[] }>();

  private state(epicId: string) {
    let s = this.epics.get(epicId);
    if (!s) { s = { runs: 0, idle: 0, running: false, pending: [] }; this.epics.set(epicId, s); }
    return s;
  }

  /** Ask to wake the lead. Returns 'run' to start now, 'queued' if a run is going, or why it is refused. */
  request(epicId: string, update?: string): 'run' | 'queued' | 'limit' | 'idle' {
    const s = this.state(epicId);
    if (update) s.pending.push(update);
    if (s.running) return 'queued';
    if (s.runs >= MAX_LEAD_RUNS_PER_EPIC) return 'limit';
    if (s.idle >= MAX_IDLE_LEAD_RUNS) return 'idle';
    s.running = true;
    s.runs++;
    return 'run';
  }

  /** Updates gathered since the last run (cleared). */
  takeUpdates(epicId: string): string[] {
    const s = this.state(epicId);
    const updates = s.pending;
    s.pending = [];
    return updates;
  }

  /** Record a finished lead run; returns true when wakes arrived meanwhile and it should run again. */
  finish(epicId: string, didSomething: boolean): boolean {
    const s = this.state(epicId);
    s.running = false;
    s.idle = didSomething ? 0 : s.idle + 1;
    return s.pending.length > 0;
  }

  /** The user stepped in (answered, reassigned, restarted): the lead may try again. */
  reset(epicId: string): void {
    const s = this.state(epicId);
    s.idle = 0;
    s.runs = 0;
  }

  runs(epicId: string): number {
    return this.state(epicId).runs;
  }
}

/**
 * Dragging an epic into In Progress runs nothing unless a lead agent owns it:
 * agents work stories. Say so, instead of a silent "Moved".
 */
export function epicStartedWithoutLeadNotice(move: { isEpic: boolean; toStatus: string; leadOwns: boolean }): string | undefined {
  if (!move.isEpic || move.toStatus !== 'in-progress' || move.leadOwns) return undefined;
  return 'Epic marked in progress, but nothing ran: agents work stories. Drag its stories to In Progress, or add a lead in Agents to plan the epic.';
}
