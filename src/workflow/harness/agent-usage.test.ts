import { describe, it, expect } from 'vitest';
import { usageByAgent } from './agent-usage';
import type { RunHistoryEntry } from './run-history';

const now = new Date(2026, 10, 26, 15, 0).getTime();
const hoursAgo = (h: number) => now - h * 3600_000;
const run = (over: Partial<RunHistoryEntry>): RunHistoryEntry => ({
  runId: Math.random().toString(36), artifactId: 'S-1', workflowId: 'w', harness: 'claude', verdict: 'COMPLETED',
  startedAt: hoursAgo(1) - 60_000, finishedAt: hoursAgo(1), ...over,
});

describe('usageByAgent', () => {
  it('totals runs, successes, time, tokens and cards per agent for today, the week and the month', () => {
    const [dev] = usageByAgent([
      run({ agent: 'Dev', usage: { input: 10, output: 5, cacheRead: 100, cacheWrite: 20 } }),
      run({ agent: 'Dev', artifactId: 'S-2', verdict: 'BLOCKED', startedAt: hoursAgo(50) - 120_000, finishedAt: hoursAgo(50) }),
      run({ agent: 'Dev', startedAt: hoursAgo(24 * 20) - 1000, finishedAt: hoursAgo(24 * 20) }),
    ], now);
    expect(dev.who).toBe('Dev');
    expect(dev.windows.today).toEqual({ runs: 1, succeeded: 1, timeMs: 60_000, tokensIn: 130, tokensOut: 5, cards: 1 });
    expect(dev.windows.week).toMatchObject({ runs: 2, succeeded: 1, cards: 2, timeMs: 180_000 });
    expect(dev.windows.month).toMatchObject({ runs: 3, cards: 2 });
  });

  it('counts unassigned runs under their CLI, leaves out runs that never started and runs older than a month', () => {
    const usage = usageByAgent([
      run({}),
      run({ harness: 'none', verdict: 'BLOCKED' }),
      run({ agent: 'Old', finishedAt: hoursAgo(24 * 40) }),
    ], now);
    expect(usage.map((u) => u.who)).toEqual(['claude (no assignee)']);
  });

  it('puts the busiest agent first', () => {
    expect(usageByAgent([run({ agent: 'A' }), run({ agent: 'B' }), run({ agent: 'B' })], now).map((u) => u.who)).toEqual(['B', 'A']);
  });
});
