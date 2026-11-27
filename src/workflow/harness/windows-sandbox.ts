// ─── Codex inside the Windows sandbox ───────────────────────────────────────
// Codex's Windows sandbox (posture "sandboxed") runs commands under a
// restricted token. Two things it cannot start, both checked with codex-cli
// 0.163 on 2026-11-27:
//
// 1. Child processes of `node --test`, which runs every test file in its own
//    process: it dies with `spawn EPERM` before any test runs.
//    `--test-isolation=none` runs the files in-process instead. Node before
//    22.8 rejects the flag in NODE_OPTIONS and then refuses to start at all,
//    so it is only set when the user's Node is new enough.
// 2. Store app aliases in %LOCALAPPDATA%\Microsoft\WindowsApps. Codex picks
//    the Store pwsh.exe there as its shell when it is on PATH, and every
//    command then fails with "CreateProcessAsUserW failed: 5 (Access is
//    denied.)". Without that folder on PATH it uses Windows PowerShell, and
//    nothing in it could have been launched inside the sandbox anyway.

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

const WINDOWS_APPS_DIR = /[\\/]microsoft[\\/]windowsapps[\\/]?$/i;

/**
 * The PATH a sandboxed Codex run should get: the environment's PATH without
 * the Store app-alias folder, under the variable name the environment uses
 * (`Path` on Windows). Undefined when there is nothing to remove.
 */
export function pathWithoutWindowsApps(env: Readonly<Record<string, string | undefined>>): Record<string, string> | undefined {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH');
  const value = key ? env[key] : undefined;
  if (!key || !value) return undefined;
  const entries = value.split(';');
  const kept = entries.filter((entry) => !WINDOWS_APPS_DIR.test(entry.trim()));
  return kept.length === entries.length ? undefined : { [key]: kept.join(';') };
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
