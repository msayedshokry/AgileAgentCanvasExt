// ─── Autonomous Git Branch & Commit ───────────────────────────────────────────
// Auto-creates a git branch before dev execution, auto-commits after COMPLETED,
// auto-creates PR after APPROVED. All ops are configurable via VS Code settings
// and gracefully no-op if git is missing.
//
// Issue: #17 — Autonomous Git Branch & Commit

import { createLogger } from '../utils/logger';

const logger = createLogger('autonomous-git');

// ── Types ────────────────────────────────────────────────────────────────────

export interface GitConfig {
  autoBranch: boolean;
  autoCommit: boolean;
  autoPR: boolean;
}

export interface GitRunner {
  /** Returns true if git is available on PATH. */
  isAvailable(): Promise<boolean>;
  /** Run a git command. Resolves with stdout, rejects on non-zero exit. */
  run(args: string[], cwd?: string): Promise<string>;
  /** Create a PR. Returns the PR URL. */
  createPR?(title: string, body: string, base: string): Promise<string>;
}

/** A single file changed in a commit. */
export interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

/** Structured diff data for in-canvas review (P0 #3). */
export interface CommitDiff {
  sha: string;
  storyId: string;
  message: string;
  files: DiffFile[];
  diff: string;       // raw unified diff text
}

export interface GitHooks {
  onBranch: (storyId: string, branchName: string) => void;
  onCommit: (storyId: string, sha: string) => void;
  onPR:     (storyId: string, url: string) => void;
  /** Fires after maybeCommit when a structured diff is available for in-canvas review. */
  onCommitDiff?: (storyId: string, diff: CommitDiff) => void;
}

// ── Operations ───────────────────────────────────────────────────────────────

export class AutonomousGit {
  private config: GitConfig = { autoBranch: true, autoCommit: true, autoPR: false };
  private runner: GitRunner | null = null;
  private hooks: GitHooks | null = null;
  private gitAvailable: boolean | null = null;

  setConfig(config: Partial<GitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setRunner(runner: GitRunner): void { this.runner = runner; }
  setHooks(hooks: GitHooks): void { this.hooks = hooks; }

  /** Branch name convention: aac/story-{id}. */
  branchNameFor(storyId: string): string {
    return `aac/story-${storyId.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
  }

  /** Create a branch if configured and git is available. */
  async maybeBranch(storyId: string, cwd: string): Promise<string | null> {
    if (!this.config.autoBranch) return null;
    const ok = await this.ensureGit();
    if (!ok) return null;

    const name = this.branchNameFor(storyId);
    try {
      // Check if branch already exists
      await this.runner!.run(['rev-parse', '--verify', name], cwd);
      logger.info('Branch already exists', { name });
    } catch {
      // Doesn't exist — create it
      try {
        await this.runner!.run(['checkout', '-b', name], cwd);
        logger.info('Branch created', { name });
      } catch (err) {
        logger.warn('Failed to create branch', { name, error: String(err) });
        return null;
      }
    }
    this.hooks?.onBranch(storyId, name);
    return name;
  }

  /** Commit all current changes with a structured message. */
  async maybeCommit(storyId: string, workflowId: string, cwd: string): Promise<string | null> {
    if (!this.config.autoCommit) return null;
    const ok = await this.ensureGit();
    if (!ok) return null;

    const message = `agent: ${workflowId} completed ${storyId}`;
    try {
      // Stage all changes (including untracked)
      await this.runner!.run(['add', '-A'], cwd);
      // Commit
      const out = await this.runner!.run(['commit', '-m', message, '--allow-empty'], cwd);
      const sha = this.parseCommitSha(out) ?? 'unknown';
      logger.info('Commit created', { storyId, sha, message });
      this.hooks?.onCommit(storyId, sha);

      // P0 #3: in-canvas diff review — compute structured diff data after
      // the commit and fire the onCommitDiff hook so the webview can render
      // the agent's changes as a reviewable diff without leaving the canvas.
      if (this.hooks?.onCommitDiff && sha !== 'unknown') {
        this.getCommitDiff(storyId, sha, cwd).then(diff => {
          if (diff) this.hooks!.onCommitDiff!(storyId, diff);
        }).catch(err => {
          logger.warn('Failed to compute commit diff', { storyId, sha, error: String(err) });
        });
      }
      return sha;
    } catch (err) {
      logger.warn('Commit failed', { storyId, error: String(err) });
      return null;
    }
  }

  /**
   * Compute structured diff data for a commit (P0 #3).
   * Uses git show for the unified diff and git diff-tree for per-file stats.
   * Returns null if git commands fail (e.g. root commit with no parent).
   */
  async getCommitDiff(storyId: string, sha: string, cwd: string): Promise<CommitDiff | null> {
    if (!this.runner) return null;
    try {
      // Commit message
      let message = '';
      try {
        message = (await this.runner.run(['log', '-1', '--format=%s', sha], cwd)).trim();
      } catch { /* keep empty */ }

      // Per-file additions/deletions (numstat: "adds\tdels\tpath" per line)
      let numstatOut = '';
      try {
        numstatOut = (await this.runner.run(['diff-tree', '--no-commit-id', '--numstat', '-r', sha], cwd)).trim();
      } catch { /* keep empty */ }

      // Per-file status (A/M/D/R\tpath per line)
      let nameStatusOut = '';
      try {
        nameStatusOut = (await this.runner.run(['diff-tree', '--no-commit-id', '--name-status', '-r', sha], cwd)).trim();
      } catch { /* keep empty */ }

      // Unified diff (exclude commit header with --format=)
      let diffOut = '';
      try {
        diffOut = await this.runner.run(['show', '--format=', sha], cwd);
      } catch { /* keep empty */ }

      // Parse file list: walk numstat and name-status lines in lockstep
      const numstatLines = numstatOut ? numstatOut.split('\n').filter(Boolean) : [];
      const nameStatusLines = nameStatusOut ? nameStatusOut.split('\n').filter(Boolean) : [];
      const files: DiffFile[] = [];
      for (let i = 0; i < numstatLines.length; i++) {
        const parts = numstatLines[i].split('\t');
        if (parts.length < 3) continue;
        const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
        const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
        const filePath = parts[2];
        // Parse status from name-status output (same index)
        let status: DiffFile['status'] = 'modified';
        if (i < nameStatusLines.length) {
          const rawStatus = nameStatusLines[i][0];
          if (rawStatus === 'A') status = 'added';
          else if (rawStatus === 'D') status = 'deleted';
          else if (rawStatus === 'R') status = 'renamed';
          else status = 'modified';
        }
        files.push({ path: filePath, status, additions, deletions });
      }

      return { sha, storyId, message, files, diff: diffOut };
    } catch (err) {
      logger.warn('getCommitDiff failed', { storyId, sha, error: String(err) });
      return null;
    }
  }

  /** Create a PR if configured. */
  async maybePR(storyId: string, title: string, body: string, cwd: string): Promise<string | null> {
    if (!this.config.autoPR) return null;
    const ok = await this.ensureGit();
    if (!ok || !this.runner?.createPR) return null;

    const branch = this.branchNameFor(storyId);
    try {
      const url = await this.runner.createPR(title, body, branch);
      logger.info('PR created', { storyId, url });
      this.hooks?.onPR(storyId, url);
      return url;
    } catch (err) {
      logger.warn('PR creation failed', { storyId, error: String(err) });
      return null;
    }
  }

  private async ensureGit(): Promise<boolean> {
    if (this.gitAvailable !== null) return this.gitAvailable;
    if (!this.runner) { this.gitAvailable = false; return false; }
    try {
      this.gitAvailable = await this.runner.isAvailable();
    } catch {
      this.gitAvailable = false;
    }
    if (!this.gitAvailable) {
      logger.warn('Git not available on PATH — auto-git operations disabled');
    }
    return this.gitAvailable;
  }

  private parseCommitSha(stdout: string): string | null {
    // git commit -m prints "[branch sha] message" when run in a normal repo,
    // or just the SHA on some configs. Be permissive.
    const m = stdout.match(/\b([0-9a-f]{7,40})\b/);
    return m ? m[1] : null;
  }
}

export const autonomousGit = new AutonomousGit();
