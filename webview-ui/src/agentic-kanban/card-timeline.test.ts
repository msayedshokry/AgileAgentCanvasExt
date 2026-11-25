import { describe, it, expect } from 'vitest';
import { buildCardTimeline, formatTokens, groupByDay, totalUsage, type TimelineRun } from './card-timeline';

const at = (hhmm: string) => Date.parse(`2026-11-25T${hhmm}:00Z`);
const iso = (hhmm: string) => new Date(at(hhmm)).toISOString();
const run = (runId: string, from: string, to: string, verdict = 'COMPLETED'): TimelineRun =>
  ({ runId, workflowId: 'aac-kanban-dev-executor', harness: 'claude', verdict, startedAt: at(from), finishedAt: at(to) });

describe('buildCardTimeline', () => {
  it('orders runs, commits and loose steps newest first', () => {
    const feed = buildCardTimeline({
      runs: [run('r1', '09:00', '09:10')],
      commits: [{ sha: 'abc', subject: 'agent commit', date: iso('09:11') }],
      trace: [{ ts: iso('08:00'), type: 'decision', summary: 'before any run' }],
    });
    expect(feed.map((e) => e.kind)).toEqual(['commit', 'run', 'step']);
  });

  it('nests trace steps under the run they happened in, oldest step first', () => {
    const feed = buildCardTimeline({
      runs: [run('r1', '09:00', '09:10'), run('r2', '10:00', '10:10')],
      commits: [],
      trace: [
        { ts: iso('10:05'), type: 'tool', summary: 'second run, later' },
        { ts: iso('09:02'), type: 'tool', summary: 'first run' },
        { ts: iso('10:01'), type: 'tool', summary: 'second run, earlier' },
      ],
    });
    const [r2, r1] = feed;
    expect(r2.kind === 'run' && r2.steps.map((s) => s.summary)).toEqual(['second run, earlier', 'second run, later']);
    expect(r1.kind === 'run' && r1.steps.map((s) => s.summary)).toEqual(['first run']);
  });

  it('puts the run in progress first and gives it the steps since it started', () => {
    const feed = buildCardTimeline({
      runs: [run('r1', '09:00', '09:10')],
      commits: [],
      trace: [{ ts: iso('11:01'), type: 'tool', summary: 'editing login.ts' }, { ts: iso('09:05'), type: 'tool', summary: 'old' }],
      runningSince: at('11:00'),
    });
    expect(feed[0]).toEqual({ kind: 'running', at: at('11:00'), steps: [{ ts: iso('11:01'), type: 'tool', summary: 'editing login.ts' }] });
    expect(feed[1].kind === 'run' && feed[1].steps).toHaveLength(1);
  });

  it('returns an empty feed for a card with no history', () => {
    expect(buildCardTimeline({ runs: [], commits: [], trace: [] })).toEqual([]);
  });
});

describe('groupByDay', () => {
  it('labels today and yesterday and keeps feed order', () => {
    const now = new Date(2026, 10, 25, 15, 0).getTime();
    const today = new Date(2026, 10, 25, 9, 0).getTime();
    const yesterday = new Date(2026, 10, 24, 9, 0).getTime();
    const older = new Date(2026, 10, 20, 9, 0).getTime();
    const step = (t: number) => ({ kind: 'step' as const, at: t, step: { ts: '', type: 't', summary: '' } });
    const days = groupByDay([step(today), step(today - 1), step(yesterday), step(older)], now);
    expect(days.map((d) => [d.label, d.entries.length])).toEqual([
      ['Today', 2], ['Yesterday', 1], [new Date(older).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), 1],
    ]);
  });
});

describe('formatTokens / totalUsage', () => {
  it('shortens token counts', () => {
    expect([820, 1234, 12_345, 1_400_000].map(formatTokens)).toEqual(['820', '1.2k', '12k', '1.4M']);
  });

  it('sums read and written tokens over the runs that reported usage', () => {
    const usage = { input: 10, output: 5, cacheRead: 100, cacheWrite: 20 };
    expect(totalUsage([{ ...run('r1', '09:00', '09:10'), usage }, run('r2', '10:00', '10:10'), { ...run('r3', '11:00', '11:10'), usage }]))
      .toEqual({ read: 260, written: 10 });
    expect(totalUsage([run('r1', '09:00', '09:10')])).toBeUndefined();
  });
});
