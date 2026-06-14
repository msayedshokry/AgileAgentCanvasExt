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

export interface GitHooks {
  onBranch: (storyId: string, branchName: string) => void;
  onCommit: (storyId: string, sha: string) => void;
  onPR:     (storyId: string, url: string) => void;
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
      return sha;
    } catch (err) {
      logger.warn('Commit failed', { storyId, error: String(err) });
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
