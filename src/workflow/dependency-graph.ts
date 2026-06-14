// ─── Dependency Graph Builder ────────────────────────────────────────────────
// Builds a directed dependency graph from StoryDependencies and provides
// queries for blocking/blocked stories and circular dependency detection.
//
// Issue: #3 — Dependency Graph Builder
// Docs:   docs/methodology.md § Autonomy / Dependency Graph Builder

import { createLogger } from '../utils/logger';

const logger = createLogger('dependency-graph');

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Minimal story shape needed to build the dependency graph.
 * Accepts both the rich BMAD interface and plain objects.
 */
export interface StoryRef {
  id: string;
  dependencies?: {
    blockedBy?: (string | { storyId: string })[];
    blocks?: (string | { storyId: string })[];
  };
}

/**
 * Result of a circular dependency detection.
 */
export interface CycleResult {
  /** Whether at least one cycle was found. */
  hasCycle: boolean;
  /** All cycles found, each as an ordered chain of story IDs. */
  cycles: string[][];
}

// ── Graph ────────────────────────────────────────────────────────────────────

/**
 * Directed dependency graph of stories.
 *
 * Edge direction:  A → B  means "A blocks B" (B depends on A).
 *   - `blockedBy` lists stories this one depends on → they block this one.
 *   - `blocks` lists stories that depend on this one → this one blocks them.
 */
export class DependencyGraph {
  /** adjacency: source blocks target.  source.storyId → target.storyId  */
  private adjacency = new Map<string, Set<string>>();
  /** reverse adjacency: target is blocked by source. */
  private reverse = new Map<string, Set<string>>();
  /** Set of all known story IDs. */
  private allIds = new Set<string>();
  /** Cached cycle detection result. Invalidate on build(). */
  private cachedCycles: CycleResult | null = null;

  // ── Build ───────────────────────────────────────────────────────────────

  /** Build the graph from an array of stories. Call this before querying. */
  build(stories: StoryRef[]): void {
    this.cachedCycles = null;
    this.clear();

    // First pass: register all IDs
    for (const story of stories) {
      this.allIds.add(story.id);
    }

    // Second pass: add edges
    for (const story of stories) {
      const deps = story.dependencies;
      if (!deps) continue;

      // blockedBy: these stories block us → edge from them to us
      if (deps.blockedBy) {
        for (const ref of deps.blockedBy) {
          const blockerId = typeof ref === 'string' ? ref : ref.storyId;
          if (blockerId && blockerId !== story.id) {
            this.addEdge(blockerId, story.id);
          }
        }
      }

      // blocks: we block these stories → edge from us to them
      if (deps.blocks) {
        for (const ref of deps.blocks) {
          const blockedId = typeof ref === 'string' ? ref : ref.storyId;
          if (blockedId && blockedId !== story.id) {
            this.addEdge(story.id, blockedId);
          }
        }
      }
    }

    logger.debug('Graph built', { nodes: this.allIds.size, edges: this.countEdges() });
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  /** Returns all stories that DIRECTLY block the given story. */
  getDirectBlockers(id: string): string[] {
    return Array.from(this.reverse.get(id) ?? []);
  }

  /** Returns all stories that are DIRECTLY blocked by the given story. */
  getDirectBlocked(id: string): string[] {
    return Array.from(this.adjacency.get(id) ?? []);
  }

  /**
   * Returns all stories that block the given story (transitive closure).
   * A → B → C means getBlockingStories(C) returns [B, A].
   */
  getBlockingStories(id: string): string[] {
    if (!this.allIds.has(id)) return [];
    return this.transitiveClosureReverse(id);
  }

  /**
   * Returns all stories blocked by the given story (transitive closure).
   * A → B → C means getBlockedStories(A) returns [B, C].
   */
  getBlockedStories(id: string): string[] {
    if (!this.allIds.has(id)) return [];
    return this.transitiveClosureForward(id);
  }

  /** Detect circular dependencies. Returns all cycles found. Result is cached
   *  until the next `build()` call — safe to call frequently. */
  detectCycles(): CycleResult {
    if (this.cachedCycles) return this.cachedCycles;

    const cycles: string[][] = [];
    const WHITE = 0; // unvisited
    const GRAY = 1;  // in current DFS path
    const BLACK = 2; // fully processed

    const color = new Map<string, number>();
    const parent = new Map<string, string | null>();

    for (const id of this.allIds) {
      color.set(id, WHITE);
      parent.set(id, null);
    }

    const dfs = (node: string) => {
      color.set(node, GRAY);
      const neighbors = this.adjacency.get(node) ?? new Set();

      for (const neighbor of neighbors) {
        if (!this.allIds.has(neighbor)) continue;
        const neighborColor = color.get(neighbor) ?? WHITE;

        if (neighborColor === GRAY) {
          // Found a cycle — backtrack to extract the chain.
          const cycle: string[] = [neighbor, node];
          let current = node;
          while (parent.get(current) && parent.get(current) !== neighbor) {
            current = parent.get(current)!;
            cycle.push(current);
          }
          cycle.reverse();
          cycles.push(cycle);
        } else if (neighborColor === WHITE) {
          parent.set(neighbor, node);
          dfs(neighbor);
        }
      }

      color.set(node, BLACK);
    };

    for (const id of this.allIds) {
      if (color.get(id) === WHITE) {
        dfs(id);
      }
    }

    this.cachedCycles = { hasCycle: cycles.length > 0, cycles };
    return this.cachedCycles;
  }

  /** Check if a specific story is part of any cycle. Uses cached result. */
  isInCycle(id: string): boolean {
    const { cycles } = this.detectCycles();
    return cycles.some(cycle => cycle.includes(id));
  }

  /** Return the number of nodes in the graph. */
  get nodeCount(): number {
    return this.allIds.size;
  }

  /** Return the number of edges in the graph. */
  get edgeCount(): number {
    return this.countEdges();
  }

  /** List all story IDs in the graph. */
  get storyIds(): string[] {
    return Array.from(this.allIds);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** Clear the graph state. */
  clear(): void {
    this.adjacency.clear();
    this.reverse.clear();
    this.allIds.clear();
  }

  private addEdge(from: string, to: string): void {
    if (!this.adjacency.has(from)) this.adjacency.set(from, new Set());
    this.adjacency.get(from)!.add(to);
    if (!this.reverse.has(to)) this.reverse.set(to, new Set());
    this.reverse.get(to)!.add(from);
    this.allIds.add(from);
    this.allIds.add(to);
  }

  private countEdges(): number {
    let count = 0;
    for (const targets of this.adjacency.values()) {
      count += targets.size;
    }
    return count;
  }

  /** BFS-based transitive closure following the forward edges. */
  private transitiveClosureForward(start: string): string[] {
    const visited = new Set<string>();
    const queue: string[] = [];
    const result: string[] = [];

    visited.add(start);
    queue.push(start);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = this.adjacency.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
            result.push(neighbor);
          }
        }
      }
    }

    return result;
  }

  /** BFS-based transitive closure following the reverse edges. */
  private transitiveClosureReverse(start: string): string[] {
    const visited = new Set<string>();
    const queue: string[] = [];
    const result: string[] = [];

    visited.add(start);
    queue.push(start);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const blockers = this.reverse.get(current);
      if (blockers) {
        for (const blocker of blockers) {
          if (!visited.has(blocker)) {
            visited.add(blocker);
            queue.push(blocker);
            result.push(blocker);
          }
        }
      }
    }

    return result;
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const dependencyGraph = new DependencyGraph();
