// Runs against a real temporary git repository (git is required by the
// extension's auto-git features anyway).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execTool } from './git-cli';
import { isGitRepo, mergeWorktree, prepareWorktree, removeWorktree, worktreePathFor, type Git } from './card-worktree';

const git: Git = (args, cwd) => execTool('git', args, cwd);
let base: string;
let repo: string;

async function sh(args: string[], cwd = repo) {
  const r = await git(args, cwd);
  if (r.code !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

beforeEach(async () => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aac-wt-')));
  repo = path.join(base, 'app');
  fs.mkdirSync(repo);
  await sh(['init', '-q', '-b', 'main']);
  await sh(['config', 'user.email', 't@example.com']);
  await sh(['config', 'user.name', 'Test']);
  await sh(['config', 'commit.gpgsign', 'false']);
  await sh(['config', 'core.autocrlf', 'false']);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
  await sh(['add', '-A']);
  await sh(['commit', '-q', '-m', 'init']);
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe('card worktrees', () => {
  it('creates a sibling worktree on its own branch without touching the main checkout', async () => {
    expect(await isGitRepo(git, repo)).toBe(true);
    const wt = await prepareWorktree(git, repo, 'S-1', '.agileagentcanvas-context');
    expect(wt.path).toBe(worktreePathFor(repo, 'S-1'));
    expect(wt.path.startsWith(repo + path.sep)).toBe(false);
    expect(await sh(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main');
    expect(await sh(['rev-parse', '--abbrev-ref', 'HEAD'], wt.path)).toBe('aac/story-S-1');
    // Run scratch never gets committed from any worktree.
    fs.mkdirSync(path.join(wt.path, '.agileagentcanvas-context', '_terminal-output'), { recursive: true });
    fs.writeFileSync(path.join(wt.path, '.agileagentcanvas-context', '_terminal-output', 'v.json'), '{}');
    expect(await sh(['status', '--porcelain'], wt.path)).toBe('');
    // Reuse on second call.
    expect((await prepareWorktree(git, repo, 'S-1', '.agileagentcanvas-context')).path).toBe(wt.path);
  });

  it('merges the card branch back on approval and cleans up', async () => {
    const wt = await prepareWorktree(git, repo, 'S-2', '.ctx');
    fs.writeFileSync(path.join(wt.path, 'b.txt'), 'agent work\n');
    const outcome = await mergeWorktree(git, repo, wt, 'agent: done S-2');
    expect(outcome.kind).toBe('merged');
    expect(fs.readFileSync(path.join(repo, 'b.txt'), 'utf-8')).toBe('agent work\n');
    await removeWorktree(git, repo, wt, true);
    expect(fs.existsSync(wt.path)).toBe(false);
    expect((await git(['rev-parse', '--verify', '--quiet', 'refs/heads/aac/story-S-2'], repo)).code).not.toBe(0);
  });

  it('reports a conflict and leaves the main checkout clean', async () => {
    const wt = await prepareWorktree(git, repo, 'S-3', '.ctx');
    fs.writeFileSync(path.join(wt.path, 'a.txt'), 'agent version\n');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'human version\n');
    await sh(['commit', '-q', '-am', 'human edit']);
    const outcome = await mergeWorktree(git, repo, wt, 'agent: done S-3');
    expect(outcome.kind).toBe('conflict');
    expect(await sh(['status', '--porcelain'])).toBe('');
    expect(fs.readFileSync(path.join(repo, 'a.txt'), 'utf-8')).toBe('human version\n');
  });

  it('nothing to merge when the agent changed nothing', async () => {
    const wt = await prepareWorktree(git, repo, 'S-4', '.ctx');
    expect((await mergeWorktree(git, repo, wt, 'agent: done S-4')).kind).toBe('nothing-to-merge');
  });
});
