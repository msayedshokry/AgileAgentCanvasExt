import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({ EventEmitter: class { event = () => ({ dispose: () => undefined }); fire() { /* noop */ } } }));
vi.mock('../workflow/kanban-orchestrator', () => ({ kanbanProgress: { event: () => ({ dispose: () => undefined }) } }));
vi.mock('../workflow/auto-scheduler', () => ({ autoScheduler: { on: vi.fn(), off: vi.fn(), getPausedStories: () => [] } }));

import { NeedsYouTracker } from './needs-you';

describe('NeedsYouTracker', () => {
  it('adds stopped runs with their plain-language reason and clears them when work resumes', () => {
    const t = new NeedsYouTracker();
    expect(t.onProgress({ artifactId: 'S-1', agentState: { status: 'interrupted', failure: { kind: 'signed-out', title: 'Signed out', detail: '', actions: [] } } }, 1)).toBe(true);
    expect(t.list()).toEqual([{ artifactId: 'S-1', kind: 'stopped', reason: 'Signed out', since: 1 }]);
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

  it('labels each item with what kind of decision it needs', () => {
    const t = new NeedsYouTracker();
    t.onProgress({ artifactId: 'S-2', agentState: { status: 'interrupted', agentRole: 'approval-needed' } as never }, 1);
    t.syncPaused([{ id: 'S-3', reason: 'Failed 3 runs', pausedAt: 2 }]);
    t.notify('AUTOPILOT-nightly', 'autopilot', 'Autopilot "Nightly": BLOCKED', 3);
    expect(t.list().map((i) => i.kind)).toEqual(['approval', 'paused', 'autopilot']);
  });

  it('updates an item whose reason changes but keeps when it first needed you', () => {
    const t = new NeedsYouTracker();
    t.notify('AUTOPILOT-nightly', 'autopilot', 'first problem', 1);
    expect(t.notify('AUTOPILOT-nightly', 'autopilot', 'first problem', 5)).toBe(false);
    expect(t.notify('AUTOPILOT-nightly', 'autopilot', 'second problem', 9)).toBe(true);
    expect(t.list()).toEqual([{ artifactId: 'AUTOPILOT-nightly', kind: 'autopilot', reason: 'second problem', since: 1 }]);
  });

  it('ignores repeats and supports dismiss', () => {
    const t = new NeedsYouTracker();
    const evt = { artifactId: 'S-1', agentState: { status: 'failed' as const } };
    expect(t.onProgress(evt)).toBe(true);
    expect(t.onProgress(evt)).toBe(false);
    expect(t.dismiss('S-1')).toBe(true);
  });
});

describe('NeedsYouTracker — questions and proposals', () => {
  it('keeps a question when the same run then reports a stop', () => {
    const t = new NeedsYouTracker();
    t.notify('S-1', 'question', 'Dev asks a question', 1, { details: ['8 or 12?'] });
    expect(t.onProgress({ artifactId: 'S-1', agentState: { status: 'interrupted' } })).toBe(false);
    expect(t.list()).toEqual([{ artifactId: 'S-1', kind: 'question', reason: 'Dev asks a question', since: 1, details: ['8 or 12?'] }]);
    expect(t.onProgress({ artifactId: 'S-1', agentState: { status: 'running' } })).toBe(true);
    expect(t.list()).toEqual([]);
  });

  it('keeps a card\'s proposals as a separate entry that names the card', () => {
    const t = new NeedsYouTracker();
    t.notify('PROPOSALS-S-1', 'proposal', 'Dev proposes 2 new cards', 1, { cardId: 'S-1', details: ['A', 'B'] });
    t.onProgress({ artifactId: 'S-1', agentState: { status: 'failed' } });
    expect(t.list().map((i) => [i.artifactId, i.kind, i.cardId ?? i.artifactId])).toEqual([
      ['PROPOSALS-S-1', 'proposal', 'S-1'], ['S-1', 'stopped', 'S-1'],
    ]);
  });
});
