// ─── Unit tests: autonomy-lifecycle ─────────────────────────────────────────────
// Covers: pushDependencyBadges walks the store's epics[].stories and broadcasts
// the expected IPC payload (happy path) and broadcasts an empty array when
// the store has no epics (most common error path).
//
// Scoped to pushDependencyBadges only — the full lifecycle wires 14 modules
// and the unit-of-interest is the IPC payload shape we just shipped.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutonomyLifecycle } from './autonomy-lifecycle';
import { dependencyGraph } from './dependency-graph';

function makeStore(epics: any[]) {
  return {
    getState: () => ({ epics }),
  } as any;
}

describe('AutonomyLifecycle.pushDependencyBadges', () => {
  beforeEach(() => {
    dependencyGraph.clear();
  });

  it('happy: walks epics[].stories and broadcasts updateDependencyBadges with blocked counts', () => {
    const lc = new AutonomyLifecycle();
    const broadcast = vi.fn();
    lc.configure({ broadcast, outputFolder: '/tmp' }, makeStore([
      {
        id: 'E-1',
        stories: [
          { id: 'S-1', title: 'Story 1', dependencies: { blocks: ['S-2'] } },
          { id: 'S-2', title: 'Story 2' },
        ],
      },
    ]));

    lc.pushDependencyBadges();
    expect(broadcast).toHaveBeenCalledWith({
      type: 'updateDependencyBadges',
      badges: expect.arrayContaining([
        expect.objectContaining({ id: 'S-2', blockedBy: 1, hasCycle: false }),
      ]),
    });
    // S-1 has no blockers
    const allBadges = broadcast.mock.calls[0][0].badges;
    expect(allBadges.find((b: any) => b.id === 'S-1')).toBeUndefined();
  });

  it('error: broadcasts an empty badges array when the store has no epics', () => {
    const lc = new AutonomyLifecycle();
    const broadcast = vi.fn();
    lc.configure({ broadcast, outputFolder: '/tmp' }, makeStore([]));
    lc.pushDependencyBadges();
    expect(broadcast).toHaveBeenCalledWith({ type: 'updateDependencyBadges', badges: [] });
  });
});
