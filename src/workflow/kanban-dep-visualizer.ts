// ─── Kanban Dependency Visualization ───────────────────────────────────────────
// Provides the data for UI to render "Blocked by N" badges with tooltips,
// detail-panel Blocks/Blocked-by sections, and circular dependency warnings.
//
// Issue: #10 — Dependency Visualization in Kanban

import { dependencyGraph, StoryRef } from './dependency-graph';
import { createLogger } from '../utils/logger';

const logger = createLogger('kanban-dep-visualizer');

// ── Types ────────────────────────────────────────────────────────────────────

export interface StoryWithTitle extends StoryRef {
  title?: string;
}

export interface BlockedByBadge {
  /** Number of stories blocking this one. */
  count: number;
  /** Title tooltip text listing blocking story titles. */
  tooltip: string;
  /** Whether any blocker is in a cycle (renders amber banner). */
  hasCycle: boolean;
  /** First few blocking story titles for the badge label. */
  previewTitles: string[];
}

export interface DependencyPanelData {
  /** Stories this one blocks. */
  blocks: Array<{ id: string; title?: string }>;
  /** Stories that block this one. */
  blockedBy: Array<{ id: string; title?: string }>;
  /** Whether this story is in a circular dependency. */
  inCycle: boolean;
}

const MAX_PREVIEW_TITLES = 3;

// ── Visualizer ───────────────────────────────────────────────────────────────

export class KanbanDependencyVisualizer {
  private stories: Map<string, StoryWithTitle> = new Map();

  /** Load the set of stories to resolve IDs → titles. */
  loadStories(stories: StoryWithTitle[]): void {
    this.stories.clear();
    for (const s of stories) {
      this.stories.set(s.id, s);
    }
  }

  /** Get the "Blocked by N" badge data for a single card. */
  getBlockedByBadge(storyId: string): BlockedByBadge | null {
    const blockers = dependencyGraph.getDirectBlockers(storyId);
    if (blockers.length === 0) return null;

    const titles = blockers
      .map(id => this.stories.get(id)?.title ?? id)
      .filter(Boolean);
    const previewTitles = titles.slice(0, MAX_PREVIEW_TITLES);
    const hasCycle = dependencyGraph.isInCycle(storyId);

    const tooltip = hasCycle
      ? `Blocked by ${blockers.length} (circular dependency): ${titles.join(', ')}`
      : `Blocked by: ${titles.join(', ')}`;

    return { count: blockers.length, tooltip, hasCycle, previewTitles };
  }

  /** Get the full Blocks / Blocked-by panel data for a story. */
  getPanelData(storyId: string): DependencyPanelData {
    const blocksIds = dependencyGraph.getDirectBlocked(storyId);
    const blockersIds = dependencyGraph.getDirectBlockers(storyId);
    return {
      blocks: blocksIds.map(id => ({ id, title: this.stories.get(id)?.title })),
      blockedBy: blockersIds.map(id => ({ id, title: this.stories.get(id)?.title })),
      inCycle: dependencyGraph.isInCycle(storyId),
    };
  }

  /** Build the circular dependency warning banner text for a card. */
  getCycleWarning(storyId: string): string | null {
    if (!dependencyGraph.isInCycle(storyId)) return null;
    const cycle = dependencyGraph.detectCycles().cycles.find(c => c.includes(storyId));
    if (!cycle) return null;
    const titles = cycle.map(id => this.stories.get(id)?.title ?? id);
    return `⚠ Circular dependency: ${titles.join(' → ')} → ${titles[0]}`;
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const kanbanDependencyVisualizer = new KanbanDependencyVisualizer();
