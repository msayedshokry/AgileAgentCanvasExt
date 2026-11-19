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

/** Create (or reuse) the card's worktree on its own branch, based on the current HEAD. */
export async function prepareWorktree(git: Git, repoRoot: string, artifactId: string, outputFolderName: string): Promise<CardWorktree> {
  const branch = branchFor(artifactId);
  const wtPath = worktreePathFor(repoRoot, artifactId);
  await excludeScratch(git, repoRoot, outputFolderName);
  if (fs.existsSync(path.join(wtPath, '.git'))) return { artifactId, branch, path: wtPath };
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  const branchExists = (await git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], repoRoot)).code === 0;
  const args = branchExists ? ['worktree', 'add', wtPath, branch] : ['worktree', 'add', '-b', branch, wtPath, 'HEAD'];
  const r = await git(args, repoRoot);
  if (r.code !== 0) throw new Error(`Could not create a worktree for ${artifactId}: ${(r.stderr || r.stdout).trim()}`);
  return { artifactId, branch, path: wtPath };
}

export type MergeOutcome =
  | { readonly kind: 'merged'; readonly sha: string }
  | { readonly kind: 'nothing-to-merge' }
  | { readonly kind: 'conflict'; readonly detail: string };

/** Commit leftovers in the worktree, then merge its branch into the repo's current branch. Aborts cleanly on conflict. */
export async function mergeWorktree(git: Git, repoRoot: string, wt: CardWorktree, message: string): Promise<MergeOutcome> {
  await git(['add', '-A'], wt.path);
  await git(['commit', '-m', message], wt.path);  // no-op when clean
  const ahead = await git(['rev-list', '--count', `HEAD..${wt.branch}`], repoRoot);
  if (ahead.code === 0 && ahead.stdout.trim() === '0') return { kind: 'nothing-to-merge' };
  const r = await git(['merge', '--no-ff', '--no-edit', '-m', `Merge ${wt.branch}: ${message}`, wt.branch], repoRoot);
  if (r.code !== 0) {
    await git(['merge', '--abort'], repoRoot);
    return { kind: 'conflict', detail: (r.stdout + r.stderr).trim().slice(0, 600) };
  }
  const sha = (await git(['rev-parse', 'HEAD'], repoRoot)).stdout.trim();
  return { kind: 'merged', sha };
}

/** Remove the worktree folder; delete the branch only when it is fully merged. */
export async function removeWorktree(git: Git, repoRoot: string, wt: CardWorktree, deleteBranch: boolean): Promise<void> {
  await git(['worktree', 'remove', '--force', wt.path], repoRoot);
  if (deleteBranch) await git(['branch', '-d', wt.branch], repoRoot);
}
