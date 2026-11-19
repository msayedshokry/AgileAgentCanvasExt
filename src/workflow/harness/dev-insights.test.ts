import { describe, it, expect } from 'vitest';
import { computeMetrics, renderMetricsMarkdown, renderReleaseNotes, storiesFromCommitSubjects, formatDuration } from './dev-insights';
import type { RunHistoryEntry } from './run-history';

const run = (artifactId: string, harness: string, verdict: string, start: number, mins: number): RunHistoryEntry => ({
  runId: `${artifactId}-${start}`, artifactId, workflowId: 'w', harness, verdict, startedAt: start, finishedAt: start + mins * 60000,
});

const H: RunHistoryEntry[] = [
  run('S-1', 'claude', 'COMPLETED', 0, 10),
  run('S-1', 'claude', 'NEEDS_FIXES', 10 * 60000, 5),
  run('S-1', 'claude', 'COMPLETED', 20 * 60000, 10),
  run('S-1', 'codex', 'APPROVED', 40 * 60000, 5),
  run('S-2', 'codex', 'UNKNOWN', 0, 2),
  { ...run('S-3', 'none', 'BLOCKED', 0, 0) },
];

describe('computeMetrics', () => {
  it('summarises success per agent, fix cycles and lead time per story', () => {
    const m = computeMetrics(H);
    expect(m.totalRuns).toBe(5);                   // blocked-before-launch runs are not agent runs
    expect(m.successRate).toBeCloseTo(3 / 5);
    expect(m.harnesses.find((h) => h.harness === 'claude')).toMatchObject({ runs: 3, succeeded: 2 });
    expect(m.stories.find((s) => s.artifactId === 'S-1')).toMatchObject({ runs: 4, fixCycles: 1, done: true, leadTimeMs: 45 * 60000 });
    expect(m.stories.find((s) => s.artifactId === 'S-2')).toMatchObject({ done: false, leadTimeMs: undefined });
    expect(m.failures).toEqual({ NEEDS_FIXES: 1, UNKNOWN: 1 });
    expect(m.medianLeadTimeMs).toBe(45 * 60000);
  });

  it('renders a markdown report with costs when known', () => {
    const md = renderMetricsMarkdown(computeMetrics(H), new Map([['S-1', 1.234]]));
    expect(md).toContain('| claude | 3 | 67% |');
    expect(md).toContain('| S-1 ✓ | 4 | 1 | 45m | $1.23 |');
  });

  it('formats durations', () => {
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(3 * 3600 * 1000)).toBe('3.0h');
  });
});

describe('renderReleaseNotes', () => {
  it('groups done stories by epic with a one-line summary', () => {
    const md = renderReleaseNotes([
      { id: 'S-1', title: 'Login', epicTitle: 'Auth', description: 'Users sign in with email.\nMore.' },
      { id: 'S-2', title: 'Logout', epicTitle: 'Auth' },
      { id: 'S-9', title: 'Fix typo' },
    ], 'Release 0.6.0');
    expect(md).toBe([
      '# Release 0.6.0', '', '## Auth', '',
      '- **Login** (S-1) — Users sign in with email.',
      '- **Logout** (S-2)', '',
      '## Other changes', '', '- **Fix typo** (S-9)', '',
    ].join('\n'));
  });

  it('says so when nothing was completed', () => {
    expect(renderReleaseNotes([])).toMatch(/No stories/);
  });
});

describe('storiesFromCommitSubjects', () => {
  it('extracts story ids from agent commits, newest first, once each', () => {
    expect(storiesFromCommitSubjects([
      'agent: aac-kanban-dev-executor completed S-3',
      'fix: human change',
      'agent: aac-kanban-dev-executor completed S-1',
      'agent: aac-kanban-dev-executor completed S-3',
    ])).toEqual(['S-3', 'S-1']);
  });
});
