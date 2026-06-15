// ─── Unit tests: autonomous-git ───────────────────────────────────────────────
// Covers: maybeBranch returns the new branch name + fires onBranch hook when
// git is available (happy path) and returns null when git is unavailable
// (most common error path).

import { describe, it, expect, vi } from 'vitest';
import { AutonomousGit, type GitRunner, type GitHooks } from './autonomous-git';

function makeRunner(available: boolean, runImpl?: GitRunner['run']): GitRunner {
  return {
    isAvailable: async () => available,
    run: runImpl ?? (async () => ''),
  };
}

describe('AutonomousGit', () => {
  it('happy: maybeBranch creates the branch and fires onBranch when git is available', async () => {
    const g = new AutonomousGit();
    const run = vi.fn(async (args: string[]) => {
      // First call rev-parse --verify fails → branch doesn't exist yet
      if (args[0] === 'rev-parse') throw new Error('not found');
      return ''; // checkout -b succeeds
    });
    const hooks: GitHooks = { onBranch: vi.fn(), onCommit: vi.fn(), onPR: vi.fn() };
    g.setRunner(makeRunner(true, run));
    g.setHooks(hooks);

    const branch = await g.maybeBranch('S-1', '/tmp');
    expect(branch).toBe('aac/story-S-1');
    expect(hooks.onBranch).toHaveBeenCalledWith('S-1', 'aac/story-S-1');
    expect(run).toHaveBeenCalledWith(['checkout', '-b', 'aac/story-S-1'], '/tmp');
  });

  it('error: maybeBranch returns null when git is not available', async () => {
    const g = new AutonomousGit();
    const hooks: GitHooks = { onBranch: vi.fn(), onCommit: vi.fn(), onPR: vi.fn() };
    g.setRunner(makeRunner(false));
    g.setHooks(hooks);
    const branch = await g.maybeBranch('S-2', '/tmp');
    expect(branch).toBeNull();
    expect(hooks.onBranch).not.toHaveBeenCalled();
  });
});
