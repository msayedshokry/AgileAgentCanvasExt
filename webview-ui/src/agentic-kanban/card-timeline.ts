// One activity feed per card: runs, agent commits and trace steps in a single
// dated list, newest first. Trace steps nest under the run they happened in,
// so a run opens to show what it did; steps of the run in progress collect
// under a "running now" entry. Pure: no React, no vscode.

import type { AgentFailureInfo } from '../components/kanban/KanbanTypes';

/** One context source a run was given (names and sizes only — see context-receipt.ts). */
export interface ContextSource {
  kind: string;
  name: string;
  chars: number;
  hash: string;
  delivery: 'inline' | 'discovered' | 'resumed';
}

export interface TimelineRun {
  runId: string;
  workflowId: string;
  harness: string;
  /** Name of the agent the card was assigned to for this run. */
  agent?: string;
  /** Model the agent asked its CLI for. */
  model?: string;
  /** Tokens the run used, when the harness reports them (Claude Code). */
  usage?: RunUsage;
  /** What the agent asked of the board in its verdict (counts). */
  board?: { questions: number; proposals: number; handoffTo?: string; assigned?: number; notes: boolean; dropped?: string[] };
  verdict: string;
  summary?: string;
  startedAt: number;
  finishedAt: number;
  failure?: AgentFailureInfo;
  context?: ContextSource[];
}

export interface RunUsage { input: number; output: number; cacheRead: number; cacheWrite: number }

/** "Asked 2 questions · Proposed 1 card · Handed off to reviewer", or nothing. */
export function describeBoard(board: TimelineRun['board']): string | undefined {
  if (!board) return undefined;
  const parts = [
    board.questions ? `Asked ${board.questions} question${board.questions === 1 ? '' : 's'}` : '',
    board.proposals ? `Proposed ${board.proposals} card${board.proposals === 1 ? '' : 's'}` : '',
    board.assigned ? `Assigned ${board.assigned} stor${board.assigned === 1 ? 'y' : 'ies'}` : '',
    board.handoffTo ? `Handed off to ${board.handoffTo}` : '',
    board.dropped?.length ? `${board.dropped.length} request${board.dropped.length === 1 ? '' : 's'} ignored` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

/** "820", "12.3k", "1.4M". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Tokens read (fresh + cached) and written by the model, summed over runs. */
export function totalUsage(runs: readonly TimelineRun[]): { read: number; written: number } | undefined {
  const withUsage = runs.filter((r) => r.usage);
  if (withUsage.length === 0) return undefined;
  return withUsage.reduce((acc, { usage: u }) => ({
    read: acc.read + u!.input + u!.cacheRead + u!.cacheWrite,
    written: acc.written + u!.output,
  }), { read: 0, written: 0 });
}

export interface AgentCommit { sha: string; subject: string; date: string; files?: string[] }

export interface TraceStep { ts: string; type: string; summary: string; isError?: boolean }

/** A note an agent, the lead or the board left on the card ('YYYY-MM-DD HH:MM', UTC). */
export interface CardNote { author: string; text: string; at: string }

export function noteTime(at: string): number {
  const t = Date.parse(`${at.replace(' ', 'T')}:00Z`);
  return Number.isNaN(t) ? 0 : t;
}

export type TimelineEntry =
  | { kind: 'running'; at: number; steps: TraceStep[] }
  | { kind: 'run'; at: number; run: TimelineRun; steps: TraceStep[] }
  | { kind: 'commit'; at: number; commit: AgentCommit }
  | { kind: 'step'; at: number; step: TraceStep }
  | { kind: 'note'; at: number; note: CardNote };

export interface TimelineInput {
  runs: readonly TimelineRun[];
  commits: readonly AgentCommit[];
  trace: readonly TraceStep[];
  notes?: readonly CardNote[];
  /** Start of the run in progress (epoch ms), when the card's agent is running. */
  runningSince?: number;
}

function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export function buildCardTimeline({ runs, commits, trace, notes = [], runningSince }: TimelineInput): TimelineEntry[] {
  const runSteps = new Map<string, TraceStep[]>(runs.map((r) => [r.runId, []]));
  const runningSteps: TraceStep[] = [];
  const loose: TimelineEntry[] = [];

  for (const step of trace) {
    const t = timeOf(step.ts);
    if (runningSince !== undefined && t >= runningSince) {
      runningSteps.push(step);
      continue;
    }
    const owner = runs.find((r) => t >= r.startedAt && t <= r.finishedAt);
    if (owner) runSteps.get(owner.runId)!.push(step);
    else loose.push({ kind: 'step', at: t, step });
  }

  const byTime = (a: TraceStep, b: TraceStep) => timeOf(a.ts) - timeOf(b.ts);
  const entries: TimelineEntry[] = [
    ...runs.map((run): TimelineEntry => ({ kind: 'run', at: run.finishedAt, run, steps: runSteps.get(run.runId)!.sort(byTime) })),
    ...commits.map((commit): TimelineEntry => ({ kind: 'commit', at: timeOf(commit.date), commit })),
    ...loose,
    ...notes.map((note): TimelineEntry => ({ kind: 'note', at: noteTime(note.at), note })),
  ];
  entries.sort((a, b) => b.at - a.at);
  return runningSince === undefined
    ? entries
    : [{ kind: 'running', at: runningSince, steps: runningSteps.sort(byTime) }, ...entries];
}

export interface TimelineDay { label: string; entries: TimelineEntry[] }

const DAY_MS = 24 * 60 * 60 * 1000;

function dayLabel(at: number, now: number): string {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (at >= startOfToday) return 'Today';
  if (at >= startOfToday - DAY_MS) return 'Yesterday';
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Groups an already-sorted feed under day headings, keeping its order. */
export function groupByDay(entries: readonly TimelineEntry[], now: number): TimelineDay[] {
  const days: TimelineDay[] = [];
  for (const entry of entries) {
    const label = dayLabel(entry.at, now);
    const last = days[days.length - 1];
    if (last?.label === label) last.entries.push(entry);
    else days.push({ label, entries: [entry] });
  }
  return days;
}
