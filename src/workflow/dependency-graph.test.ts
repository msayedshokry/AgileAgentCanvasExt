// ─── Unit tests: dependency-graph ─────────────────────────────────────────────
// Covers: getDirectBlockers + transitive closure (happy path) and
// cycle detection (most common error path).

import { describe, it, expect } from 'vitest';
import { DependencyGraph } from './dependency-graph';

describe('DependencyGraph', () => {
  it('happy: build + getDirectBlockers + getBlockingStories transitive', () => {
    const g = new DependencyGraph();
    g.build([
      { id: 'A', dependencies: { blocks: ['B'] } },
      { id: 'B', dependencies: { blockedBy: ['A'], blocks: ['C'] } },
      { id: 'C', dependencies: { blockedBy: ['B'] } },
    ]);
    expect(g.nodeCount).toBe(3);
    expect(g.edgeCount).toBe(2);
    expect(g.getDirectBlockers('B')).toEqual(['A']);
    expect(g.getDirectBlockers('C')).toEqual(['B']);
    // C is transitively blocked by A and B
    expect(g.getBlockingStories('C').sort()).toEqual(['A', 'B']);
  });

  it('error: detectCycles returns the cycle and isInCycle is true for both nodes', () => {
    const g = new DependencyGraph();
    g.build([
      { id: 'X', dependencies: { blocks: ['Y'] } },
      { id: 'Y', dependencies: { blocks: ['X'] } },
    ]);
    const cycles = g.detectCycles();
    expect(cycles.hasCycle).toBe(true);
    expect(cycles.cycles.length).toBeGreaterThan(0);
    expect(g.isInCycle('X')).toBe(true);
    expect(g.isInCycle('Y')).toBe(true);
  });
});
