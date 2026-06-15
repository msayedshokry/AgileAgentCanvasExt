// ─── Unit tests: kanban-dep-visualizer ────────────────────────────────────────
// Covers: loadStories + getBlockedByBadge returns preview titles (happy path)
// and returns null when story has no blockers (most common error path).

import { describe, it, expect, beforeEach } from 'vitest';
import { KanbanDependencyVisualizer } from './kanban-dep-visualizer';
import { dependencyGraph } from './dependency-graph';

describe('KanbanDependencyVisualizer', () => {
  beforeEach(() => dependencyGraph.clear());

  it('happy: getBlockedByBadge returns count, tooltip, and preview titles for a blocked story', () => {
    dependencyGraph.build([
      { id: 'A', dependencies: { blocks: ['B'] } },
      { id: 'B' },
    ]);
    const v = new KanbanDependencyVisualizer();
    v.loadStories([{ id: 'A', title: 'Story A' }, { id: 'B', title: 'Story B' }]);

    const badge = v.getBlockedByBadge('B');
    expect(badge).not.toBeNull();
    expect(badge!.count).toBe(1);
    expect(badge!.previewTitles).toEqual(['Story A']);
    expect(badge!.hasCycle).toBe(false);
  });

  it('error: getBlockedByBadge returns null for an unblocked story', () => {
    dependencyGraph.build([{ id: 'X' }, { id: 'Y' }]);
    const v = new KanbanDependencyVisualizer();
    v.loadStories([{ id: 'X' }, { id: 'Y' }]);
    expect(v.getBlockedByBadge('X')).toBeNull();
    expect(v.getBlockedByBadge('Y')).toBeNull();
  });
});
