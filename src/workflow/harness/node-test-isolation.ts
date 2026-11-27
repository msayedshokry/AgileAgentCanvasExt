// ─── Node test runs inside a Windows sandbox ────────────────────────────────
// Codex's Windows sandbox (posture "sandboxed") refuses to let a sandboxed
// process start further processes, so `node --test` — which runs every test
// file in its own child process — dies with `spawn EPERM` before any test
// runs. `--test-isolation=none` runs the files in-process instead (checked
// with codex-cli 0.163 and Node 24: EPERM without it, all tests pass with it).
// Node before 22.8 rejects the flag in NODE_OPTIONS and then refuses to start
// at all, so it is only set when the user's Node is new enough.

import * as cp from 'child_process';
import type { PermissionPosture } from './harness-adapters';

/** NODE_OPTIONS value that keeps `node --test` from spawning child processes. */
export const IN_PROCESS_NODE_TESTS = '--test-isolation=none';

const MIN_MAJOR = 22;
const MIN_MINOR = 8;
const PROBE_TIMEOUT_MS = 5000;

/** True when `version` (e.g. "v24.11.1") accepts --test-isolation. */
export function supportsTestIsolation(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\./.exec(version.trim());
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > MIN_MAJOR || (major === MIN_MAJOR && minor >= MIN_MINOR);
}

/** Whether an agent run should be told to run Node tests in-process. */
export function shouldRunNodeTestsInProcess(
  platform: NodeJS.Platform,
  posture: PermissionPosture,
  nodeVersion: string | undefined,
): boolean {
  return platform === 'win32' && posture === 'sandboxed' && !!nodeVersion && supportsTestIsolation(nodeVersion);
}

let cachedVersion: Promise<string | undefined> | undefined;

/** The `node` on PATH (what the agent's shell will run), probed once per session. */
export function userNodeVersion(): Promise<string | undefined> {
  cachedVersion ??= new Promise((resolve) => {
    cp.execFile('node', ['--version'], { timeout: PROBE_TIMEOUT_MS, windowsHide: true }, (err, stdout) => {
      resolve(err ? undefined : String(stdout).trim());
    });
  });
  return cachedVersion;
}
