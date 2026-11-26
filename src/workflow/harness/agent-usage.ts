// ─── Usage per agent ─────────────────────────────────────────────────────────
// (docs/plans/2026-11-26-agent-board-live.md, L6.) Totals per agent from the
// run history: runs, how many succeeded, time spent, tokens and cards
// touched, for today, the last 7 days and the last 30. Tokens and time only;
// no prices (they go stale). Runs on an unassigned card count under the CLI
// that ran them. Pure.

import type { RunHistoryEntry } from './run-history';

export type UsageWindow = 'today' | 'week' | 'month';

export interface UsageTotals {
  readonly runs: number;
  readonly succeeded: number;
  readonly timeMs: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly cards: number;
}

export interface AgentUsage {
  /** Agent name, or "<harness> (no assignee)". */
  readonly who: string;
  readonly windows: Readonly<Record<UsageWindow, UsageTotals>>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SUCCESS = new Set(['COMPLETED', 'APPROVED']);
const EMPTY: UsageTotals = { runs: 0, succeeded: 0, timeMs: 0, tokensIn: 0, tokensOut: 0, cards: 0 };

function windowStart(window: UsageWindow, now: number): number {
  if (window === 'today') return new Date(now).setHours(0, 0, 0, 0);
  return now - (window === 'week' ? 7 : 30) * DAY_MS;
}

function total(entries: readonly RunHistoryEntry[]): UsageTotals {
  if (entries.length === 0) return EMPTY;
  return {
    runs: entries.length,
    succeeded: entries.filter((e) => SUCCESS.has(e.verdict)).length,
    timeMs: entries.reduce((t, e) => t + Math.max(0, e.finishedAt - e.startedAt), 0),
    tokensIn: entries.reduce((t, e) => t + (e.usage ? e.usage.input + e.usage.cacheRead + e.usage.cacheWrite : 0), 0),
    tokensOut: entries.reduce((t, e) => t + (e.usage?.output ?? 0), 0),
    cards: new Set(entries.map((e) => e.artifactId)).size,
  };
}

/** Usage per agent, busiest this month first. Runs that never started (harness "none") are left out. */
export function usageByAgent(entries: readonly RunHistoryEntry[], now: number): AgentUsage[] {
  const monthStart = windowStart('month', now);
  const byWho = new Map<string, RunHistoryEntry[]>();
  for (const e of entries) {
    if (e.harness === 'none' || e.finishedAt < monthStart) continue;
    const who = e.agent ?? `${e.harness} (no assignee)`;
    byWho.set(who, [...(byWho.get(who) ?? []), e]);
  }
  return [...byWho.entries()]
    .map(([who, list]): AgentUsage => ({
      who,
      windows: {
        today: total(list.filter((e) => e.finishedAt >= windowStart('today', now))),
        week: total(list.filter((e) => e.finishedAt >= windowStart('week', now))),
        month: total(list),
      },
    }))
    .sort((a, b) => b.windows.month.runs - a.windows.month.runs || a.who.localeCompare(b.who));
}
