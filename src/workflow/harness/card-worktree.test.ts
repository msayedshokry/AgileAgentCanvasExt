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
}, 30_000);  // real git: slow on loaded CI runners
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe('card worktrees', { timeout: 30_000 }, () => {
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
  it('starts a card from a chosen branch instead of the checked-out one', async () => {
    await sh(['branch', 'develop']);
    fs.writeFileSync(path.join(repo, 'main-only.txt'), 'x\n');
    await sh(['add', '-A']);
    await sh(['commit', '-q', '-m', 'main moves on']);
    const wt = await prepareWorktree(git, repo, 'S-5', '.ctx', 'develop');
    expect(fs.existsSync(path.join(wt.path, 'main-only.txt'))).toBe(false);
    expect(fs.existsSync(path.join(wt.path, 'a.txt'))).toBe(true);
  });

  it('merges into the chosen branch without switching or changing your checkout', async () => {
    await sh(['branch', 'develop']);
    const wt = await prepareWorktree(git, repo, 'S-6', '.ctx', 'develop');
    fs.writeFileSync(path.join(wt.path, 'feature.txt'), 'new\n');
    const outcome = await mergeWorktree(git, repo, wt, 'agent: done S-6', 'develop');
    expect(outcome.kind).toBe('merged');
    expect(await sh(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main');
    expect(fs.existsSync(path.join(repo, 'feature.txt'))).toBe(false);
    expect(await sh(['show', 'develop:feature.txt'])).toBe('new');
    expect(await sh(['worktree', 'list'])).not.toContain('.merge-');
  });

  it('merges into the checked-out branch when the chosen branch is the one you are on', async () => {
    const wt = await prepareWorktree(git, repo, 'S-7', '.ctx', 'main');
    fs.writeFileSync(path.join(wt.path, 'f.txt'), 'f\n');
    expect((await mergeWorktree(git, repo, wt, 'agent: done S-7', 'main')).kind).toBe('merged');
    expect(fs.existsSync(path.join(repo, 'f.txt'))).toBe(true);
  });

  it('says so when the chosen branch is checked out in another worktree', async () => {
    await sh(['branch', 'develop']);
    await sh(['worktree', 'add', '-q', path.join(base, 'other'), 'develop']);
    const wt = await prepareWorktree(git, repo, 'S-8', '.ctx', 'develop');
    fs.writeFileSync(path.join(wt.path, 'g.txt'), 'g\n');
    const outcome = await mergeWorktree(git, repo, wt, 'agent: done S-8', 'develop');
    expect(outcome.kind).toBe('unavailable');
  });
});
