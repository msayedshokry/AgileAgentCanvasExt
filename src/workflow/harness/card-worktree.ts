// ─── One git worktree per running card ──────────────────────────────────────
// Agents working on several cards at once in one checkout overwrite each
// other, and the old auto-branch did `git checkout -b` in the user's own
// checkout. Each card instead gets its own worktree + branch next to the
// repo; on approval the branch is merged back (or pushed for a PR), and the
// worktree is removed. Git access is injected so the rules are unit-tested.

import * as fs from 'fs';
import * as path from 'path';

export type Git = (args: readonly string[], cwd: string) => Promise<{ stdout: string; stderr: string; code: number }>;

export interface CardWorktree {
  readonly artifactId: string;
  readonly branch: string;
  readonly path: string;
}

export function branchFor(artifactId: string): string {
  return `aac/story-${artifactId.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
}

/** Sibling folder of the repo: `<parent>/<repo>.aac-worktrees/<id>` (outside the repo, so watchers and tools ignore it). */
export function worktreePathFor(repoRoot: string, artifactId: string): string {
  return path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}.aac-worktrees`, artifactId.replace(/[^a-zA-Z0-9._-]/g, '-'));
}

export async function isGitRepo(git: Git, root: string): Promise<boolean> {
  const r = await git(['rev-parse', '--is-inside-work-tree'], root);
  return r.code === 0 && r.stdout.trim() === 'true';
}

/** Keep run scratch files (prompts, verdicts) out of commits in every worktree. */
async function excludeScratch(git: Git, root: string, outputFolderName: string): Promise<void> {
  const r = await git(['rev-parse', '--git-common-dir'], root);
  if (r.code !== 0) return;
  const common = path.resolve(root, r.stdout.trim());
  const exclude = path.join(common, 'info', 'exclude');
  const pattern = `/${outputFolderName.replace(/\\/g, '/')}/_terminal-output/`;
  let text = '';
  try { text = fs.readFileSync(exclude, 'utf-8'); } catch { /* no file yet */ }
  if (!text.split(/\r?\n/).includes(pattern)) {
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    fs.appendFileSync(exclude, `${text && !text.endsWith('\n') ? '\n' : ''}# Agile Agent Canvas run scratch\n${pattern}\n`);
  }
}

/** Create (or reuse) the card's worktree on its own branch, started from `base` (the current HEAD by default). */
export async function prepareWorktree(git: Git, repoRoot: string, artifactId: string, outputFolderName: string, base = 'HEAD'): Promise<CardWorktree> {
  const branch = branchFor(artifactId);
  const wtPath = worktreePathFor(repoRoot, artifactId);
  await excludeScratch(git, repoRoot, outputFolderName);
  if (fs.existsSync(path.join(wtPath, '.git'))) return { artifactId, branch, path: wtPath };
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  const branchExists = (await git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], repoRoot)).code === 0;
  const args = branchExists ? ['worktree', 'add', wtPath, branch] : ['worktree', 'add', '-b', branch, wtPath, base];
  const r = await git(args, repoRoot);
  if (r.code !== 0) throw new Error(`Could not create a worktree for ${artifactId}: ${(r.stderr || r.stdout).trim()}`);
  return { artifactId, branch, path: wtPath };
}

export type MergeOutcome =
  | { readonly kind: 'merged'; readonly sha: string }
  | { readonly kind: 'nothing-to-merge' }
  | { readonly kind: 'conflict'; readonly detail: string }
  /** The target branch could not be opened (e.g. it is checked out in another worktree). */
  | { readonly kind: 'unavailable'; readonly detail: string };

/** The branch checked out in `cwd`, or undefined (detached HEAD, not a repo). */
export async function checkedOutBranch(git: Git, cwd: string): Promise<string | undefined> {
  const r = await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  const name = r.code === 0 ? r.stdout.trim() : '';
  return name && name !== 'HEAD' ? name : undefined;
}

/** Merge the card branch into whatever is checked out in `cwd`. Aborts cleanly on conflict. */
async function mergeInto(git: Git, cwd: string, wt: CardWorktree, message: string): Promise<MergeOutcome> {
  const ahead = await git(['rev-list', '--count', `HEAD..${wt.branch}`], cwd);
  if (ahead.code === 0 && ahead.stdout.trim() === '0') return { kind: 'nothing-to-merge' };
  const r = await git(['merge', '--no-ff', '--no-edit', '-m', `Merge ${wt.branch}: ${message}`, wt.branch], cwd);
  if (r.code !== 0) {
    await git(['merge', '--abort'], cwd);
    return { kind: 'conflict', detail: (r.stdout + r.stderr).trim().slice(0, 600) };
  }
  const sha = (await git(['rev-parse', 'HEAD'], cwd)).stdout.trim();
  return { kind: 'merged', sha };
}

/**
 * Commit leftovers in the worktree, then merge its branch into `into` (the
 * repo's checked-out branch by default). Another branch is merged in a
 * temporary worktree, so your checkout is never switched or changed.
 */
export async function mergeWorktree(git: Git, repoRoot: string, wt: CardWorktree, message: string, into?: string): Promise<MergeOutcome> {
  await git(['add', '-A'], wt.path);
  await git(['commit', '-m', message], wt.path);  // no-op when clean
  if (!into || into === (await checkedOutBranch(git, repoRoot))) return mergeInto(git, repoRoot, wt, message);
  const tmp = path.join(path.dirname(wt.path), `.merge-${into.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
  const add = await git(['worktree', 'add', tmp, into], repoRoot);
  if (add.code !== 0) {
    await git(['worktree', 'remove', '--force', tmp], repoRoot);
    return { kind: 'unavailable', detail: (add.stderr || add.stdout).trim().slice(0, 400) };
  }
  try {
    return await mergeInto(git, tmp, wt, message);
  } finally {
    await git(['worktree', 'remove', '--force', tmp], repoRoot);
  }
}

/** Remove the worktree folder; delete the branch only when it is fully merged. */
export async function removeWorktree(git: Git, repoRoot: string, wt: CardWorktree, deleteBranch: boolean): Promise<void> {
  await git(['worktree', 'remove', '--force', wt.path], repoRoot);
  if (deleteBranch) await git(['branch', '-d', wt.branch], repoRoot);  // refuses unless merged into HEAD: kept otherwise
}
