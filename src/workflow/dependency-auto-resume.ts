// ─── Dependency Auto-Resume on Completion ─────────────────────────────────────
// Hooks into artifact changes. When a story moves to "done", uses the
// DependencyGraph to find blocked stories and auto-transitions them to
// "ready-for-dev".
//
// Issue: #7 — Dependency Auto-Resume on Completion

import { dependencyGraph, StoryRef } from './dependency-graph';
import { createLogger } from '../utils/logger';

const logger = createLogger('dependency-auto-resume');

export type ArtifactChange = {
  artifactId: string;
  fromStatus?: string;
  toStatus?: string;
};

export type StatusUpdater = (artifactId: string, newStatus: string) => Promise<void> | void;

export class DependencyAutoResume {
  private updater: StatusUpdater | null = null;

  /** Register the function used to actually update artifact status. */
  setStatusUpdater(fn: StatusUpdater): void {
    this.updater = fn;
  }

  /**
   * Process a batch of artifact changes. When any artifact transitions
   * to "done", find stories blocked only by that artifact (or chain of
   * completed ones) and move them to "ready-for-dev".
   */
  async onArtifactChanges(changes: ArtifactChange[], stories: StoryRef[]): Promise<string[]> {
    dependencyGraph.build(stories);
    const transitioned: string[] = [];
    const doneIds = new Set(
      changes.filter(c => c.toStatus === 'done' || c.toStatus === 'complete').map(c => c.artifactId),
    );

    if (doneIds.size === 0) return transitioned;

    // Build a quick lookup of current statuses
    const statusById = new Map<string, string>();
    for (const c of changes) {
      if (c.toStatus) statusById.set(c.artifactId, c.toStatus);
    }
    for (const s of stories) {
      const id = s.id;
      if (!statusById.has(id)) {
        const deps = s.dependencies as { status?: string } | undefined;
        statusById.set(id, deps?.status ?? 'backlog');
      }
    }

    for (const story of stories) {
      if (transitioned.includes(story.id)) continue;
      const current = statusById.get(story.id) ?? 'backlog';
      // Only auto-transition blocked stories that are still in 'blocked' or 'backlog'
      if (current !== 'blocked' && current !== 'backlog') continue;

      // Direct blockers
      const blockers = dependencyGraph.getDirectBlockers(story.id);
      if (blockers.length === 0) continue;

      // Auto-transition if all direct blockers are done
      const allDone = blockers.every(b => doneIds.has(b) || statusById.get(b) === 'done' || statusById.get(b) === 'complete');
      if (!allDone) continue;

      try {
        if (this.updater) await this.updater(story.id, 'ready-for-dev');
        transitioned.push(story.id);
        statusById.set(story.id, 'ready-for-dev');
        logger.info('Auto-transitioned blocked story to ready-for-dev', {
          storyId: story.id,
          completedBlockers: blockers,
        });
      } catch (err) {
        logger.warn('Failed to auto-transition story', { storyId: story.id, error: String(err) });
      }
    }

    return transitioned;
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const dependencyAutoResume = new DependencyAutoResume();
