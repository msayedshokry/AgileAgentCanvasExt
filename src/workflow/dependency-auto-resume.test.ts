// ─── Unit tests: dependency-auto-resume ────────────────────────────────────────
// Covers: onArtifactChanges auto-transitions a blocked story to ready-for-dev
// when its blocker is done (happy path) and does nothing when no change
// is to "done" (most common error path).

import { describe, it, expect, vi } from 'vitest';
import { DependencyAutoResume } from './dependency-auto-resume';

describe('DependencyAutoResume', () => {
  it('happy: a "done" change auto-transitions its blocked dependent to ready-for-dev', async () => {
    const dar = new DependencyAutoResume();
    const updater = vi.fn(async (_id: string, _status: string) => {});
    dar.setStatusUpdater(updater);

    const transitioned = await dar.onArtifactChanges(
      [{ artifactId: 'S-1', toStatus: 'done' }],
      [
        { id: 'S-1', dependencies: { blocks: ['S-2'] } },
        { id: 'S-2', dependencies: { blockedBy: ['S-1'] } },
      ],
    );
    expect(transitioned).toEqual(['S-2']);
    expect(updater).toHaveBeenCalledWith('S-2', 'ready-for-dev');
  });

  it('error: no-op when the batch contains no transitions to "done"', async () => {
    const dar = new DependencyAutoResume();
    const updater = vi.fn();
    dar.setStatusUpdater(updater);
    const transitioned = await dar.onArtifactChanges(
      [{ artifactId: 'S-1', toStatus: 'in-progress' }],
      [{ id: 'S-1' }, { id: 'S-2', dependencies: { blockedBy: ['S-1'] } }],
    );
    expect(transitioned).toEqual([]);
    expect(updater).not.toHaveBeenCalled();
  });
});
