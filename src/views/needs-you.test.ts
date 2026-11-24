import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({ EventEmitter: class { event = () => ({ dispose: () => undefined }); fire() { /* noop */ } } }));
vi.mock('../workflow/kanban-orchestrator', () => ({ kanbanProgress: { event: () => ({ dispose: () => undefined }) } }));
vi.mock('../workflow/auto-scheduler', () => ({ autoScheduler: { on: vi.fn(), off: vi.fn(), getPausedStories: () => [] } }));

import { NeedsYouTracker } from './needs-you';

describe('NeedsYouTracker', () => {
  it('adds stopped runs with their plain-language reason and clears them when work resumes', () => {
    const t = new NeedsYouTracker();
    expect(t.onProgress({ artifactId: 'S-1', agentState: { status: 'interrupted', failure: { kind: 'signed-out', title: 'Signed out', detail: '', actions: [] } } }, 1)).toBe(true);
    expect(t.list()).toEqual([{ artifactId: 'S-1', reason: 'Signed out', since: 1 }]);
    expect(t.onProgress({ artifactId: 'S-1', agentState: { status: 'running' } })).toBe(true);
    expect(t.list()).toEqual([]);
  });

  it('tracks approval checkpoints and scheduler-paused stories, oldest first', () => {
    const t = new NeedsYouTracker();
    t.onProgress({ artifactId: 'S-2', agentState: { status: 'interrupted', agentRole: 'approval-needed' } as never }, 5);
    t.syncPaused([{ id: 'S-3', reason: 'Failed 3 runs in a row', pausedAt: 2 }]);
    expect(t.list().map((i) => [i.artifactId, i.reason])).toEqual([
      ['S-3', 'Paused: Failed 3 runs in a row'],
      ['S-2', 'Approval needed to continue'],
    ]);
  });

  it('ignores repeats and supports dismiss', () => {
    const t = new NeedsYouTracker();
    const evt = { artifactId: 'S-1', agentState: { status: 'failed' as const } };
    expect(t.onProgress(evt)).toBe(true);
    expect(t.onProgress(evt)).toBe(false);
    expect(t.dismiss('S-1')).toBe(true);
  });
});
