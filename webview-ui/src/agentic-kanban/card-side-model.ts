// ─── What the card page's side panel says ────────────────────────────────────
// Pure helpers: the card's state in one sentence, readable names for run
// steps and checks, and which CLI and model the card runs on.

import { normalizeToKanbanColumn, type KanbanItem } from '../components/kanban/KanbanTypes';
import { assigneeFor, type AgentTeamView } from './agent-team-view';

export type Tone = 'idle' | 'working' | 'waiting' | 'stopped' | 'review' | 'done';

export interface CardState {
  readonly tone: Tone;
  readonly title: string;
  readonly detail?: string;
}

function elapsed(fromIso: string | undefined, now: number): string | undefined {
  const start = fromIso ? Date.parse(fromIso) : NaN;
  if (Number.isNaN(start)) return undefined;
  const s = Math.max(0, Math.round((now - start) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** The card's state now, as one sentence: what is happening and who has the next move. */
export function cardState(item: KanbanItem, opts: { questions?: number; agentName?: string; now?: number } = {}): CardState {
  const who = item.assignee?.name ?? opts.agentName ?? 'The agent';
  const run = item.agentState;
  const column = normalizeToKanbanColumn(item.status);
  if (item.assignee?.person) {
    return column === 'done' ? { tone: 'done', title: 'Done' } : { tone: 'idle', title: `${item.assignee.name} works this by hand` };
  }
  if (opts.questions || run?.failure?.kind === 'needs-answer') {
    const n = opts.questions ?? 0;
    return { tone: 'waiting', title: 'Waiting for your answer', detail: n ? `${who} asked ${n} question${n === 1 ? '' : 's'}` : undefined };
  }
  if (run?.status === 'running') {
    const time = elapsed(run.startedAt, opts.now ?? Date.now());
    return { tone: 'working', title: `${who} is working${time ? ` · ${time}` : ''}`, detail: item.progressLine };
  }
  if (run?.status === 'queued') return { tone: 'working', title: 'Queued, starts when a slot frees up' };
  if (run?.status === 'interrupted' || run?.status === 'failed') {
    return { tone: 'stopped', title: run.failure ? `Stopped: ${run.failure.title}` : 'The last run stopped', detail: run.failure?.detail };
  }
  if (column === 'review') return { tone: 'review', title: 'Ready for your review' };
  if (column === 'done') return { tone: 'done', title: 'Done' };
  if ((item.blockedBy ?? 0) > 0 || item.hasCycle) return { tone: 'stopped', title: 'Blocked by other cards' };
  return { tone: 'idle', title: column === 'in-progress' ? 'In progress, no agent running' : 'Not started' };
}

const STEP_LABEL: Record<string, string> = {
  'aac-kanban-dev-executor': 'Implement',
  'aac-kanban-review-guard': 'Review',
  'aac-lead-dispatch': 'Plan the epic',
  'sprint-planning': 'Sprint planning',
  'dev-story': 'Implement',
  'code-review': 'Review',
};

/** "aac-kanban-dev-executor" → "Implement"; unknown ids read as words. */
export function stepLabel(workflowId: string): string {
  return STEP_LABEL[workflowId] ?? sentence(workflowId.replace(/^aac-(kanban-)?/, ''));
}

const CHECK_LABEL: Record<string, string> = {
  'schema-conformance': 'Fits the artifact schema',
  'required-fields': 'Required fields are filled',
  'no-placeholders': 'No placeholder text',
  'epic-status-valid-lane': 'Epic status matches its column',
};

/** A harness policy id as a check a person can read. */
export function checkLabel(policyId: string): string {
  return CHECK_LABEL[policyId] ?? sentence(policyId);
}

function sentence(id: string): string {
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : id;
}

/** Which CLI and model run this card: its assigned agent's, or the board default. */
export function runsOn(team: AgentTeamView | undefined, artifactId: string, fallbackProvider?: string): string | undefined {
  const agent = team ? assigneeFor(team, artifactId) : undefined;
  if (agent?.kind === 'person') return undefined;
  const harness = agent?.harness ?? fallbackProvider;
  if (!harness) return undefined;
  const label = team?.installed.find((c) => c.id === harness)?.label ?? harness;
  return agent?.model ? `${label} · ${agent.model}` : label;
}
