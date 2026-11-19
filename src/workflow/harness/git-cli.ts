// ─── git / gh CLI runner ─────────────────────────────────────────────────────
// Real implementation of the GitRunner that autonomous-git.ts expects (it was
// never provided in production, so auto-commit/PR silently did nothing).
// execFile with an argument array: no shell, no quoting issues.

import * as cp from 'child_process';
import type { GitRunner } from '../autonomous-git';

const GIT_TIMEOUT_MS = 60_000;

export interface ExecResult { stdout: string; stderr: string; code: number }

export function execTool(tool: string, args: readonly string[], cwd?: string, timeoutMs = GIT_TIMEOUT_MS): Promise<ExecResult> {
  return new Promise((resolve) => {
    cp.execFile(tool, [...args], { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') || (err && !stderr ? err.message : ''), code });
    });
  });
}

async function must(tool: string, args: readonly string[], cwd?: string): Promise<string> {
  const r = await execTool(tool, args, cwd);
  if (r.code !== 0) throw new Error(`${tool} ${args[0]} failed: ${(r.stderr || r.stdout).trim().slice(0, 500)}`);
  return r.stdout;
}

/** GitRunner backed by the git and gh CLIs. `cwd` is used for PR creation. */
export function createGitCliRunner(defaultCwd?: () => string | undefined): GitRunner {
  return {
    isAvailable: async () => (await execTool('git', ['--version'])).code === 0,
    run: (args, cwd) => must('git', args, cwd ?? defaultCwd?.()),
    createPR: async (title, body, branch) => {
      const cwd = defaultCwd?.();
      if ((await execTool('gh', ['--version'])).code !== 0) throw new Error('GitHub CLI (gh) is not installed');
      await must('git', ['push', '-u', 'origin', branch], cwd);
      const out = await must('gh', ['pr', 'create', '--head', branch, '--title', title, '--body', body], cwd);
      return out.trim().split('\n').pop() ?? '';
    },
  };
}
