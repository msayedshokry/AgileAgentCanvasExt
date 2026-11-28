// ─── One question to an agent CLI ────────────────────────────────────────────
// Ask the board's agent CLI (Claude Code, Codex, Gemini, …) for one answer and
// get the text back, for features like "Build with AI" that need a reply, not
// a run. The CLI starts in an empty temporary folder with the sandboxed
// posture, so it can only write there, and is told to write its answer to a
// file in it: that works the same for every CLI, whatever it prints.

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { HarnessAdapter } from './harness-adapters';
import { buildCommandLine, type LaunchSpec, type ShellKind } from './shell-command';

export const CLI_ASK_TIMEOUT_MS = 3 * 60_000;
const ANSWER_FILE = 'answer.json';

export interface CliAskOptions {
  readonly adapter: HarnessAdapter;
  /** Resolved executable for the adapter. */
  readonly binary: string;
  readonly prompt: string;
  readonly timeoutMs?: number;
  readonly platform?: NodeJS.Platform;
}

export type CliAskResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: string };

/** The prompt plus where to write the answer. */
export function withAnswerFile(prompt: string, answerPath: string): string {
  return `${prompt}\n\nWrite your answer (only the JSON object) to this file, creating it: ${answerPath.replace(/\\/g, '/')}\nDo not create or change any other file. Do not run commands.`;
}

/** The launch for one question, with the prompt delivered the way the adapter expects. */
export function askLaunch(adapter: HarnessAdapter, binary: string, dir: string): LaunchSpec {
  const promptFile = path.join(dir, 'prompt.md');
  const spec = adapter.buildLaunch({ binary, promptFile, resultPath: path.join(dir, ANSWER_FILE), posture: 'sandboxed', workspaceDir: dir });
  return adapter.delivery === 'stdin' ? { ...spec, stdinFile: promptFile } : spec;
}

/** Stop the shell and the CLI under it (killing only the shell leaves the CLI running). */
function killTree(child: cp.ChildProcess, platform: NodeJS.Platform): void {
  if (child.pid === undefined) return;
  if (platform === 'win32') {
    // Synchronous, so the tree is gone before the caller moves on.
    cp.spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}

function shellFor(platform: NodeJS.Platform): { kind: ShellKind; exe: string; args: (line: string) => string[] } {
  return platform === 'win32'
    ? { kind: 'powershell', exe: 'powershell.exe', args: (line) => ['-NoProfile', '-NonInteractive', '-Command', line] }
    : { kind: 'posix', exe: '/bin/sh', args: (line) => ['-c', line] };
}

/** Ask once; resolves with the answer file's text (or what the CLI printed). Never throws. */
export async function askCli(opts: CliAskOptions): Promise<CliAskResult> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-ask-'));
  const answerPath = path.join(dir, ANSWER_FILE);
  try {
    fs.writeFileSync(path.join(dir, 'prompt.md'), withAnswerFile(opts.prompt, answerPath), 'utf-8');
    const platform = opts.platform ?? process.platform;
    const shell = shellFor(platform);
    const line = buildCommandLine(askLaunch(opts.adapter, opts.binary, dir), shell.kind);
    const run = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolve) => {
      // Its own process group on posix, so a timeout can stop the whole tree.
      const child = cp.spawn(shell.exe, shell.args(line), { cwd: dir, windowsHide: true, detached: platform !== 'win32' });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (code: number | null, timedOut: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ code, stdout, stderr, timedOut });
      };
      // On timeout, answer now: a CLI holding the pipes open would delay 'close'.
      const timer = setTimeout(() => { killTree(child, platform); finish(null, true); }, opts.timeoutMs ?? CLI_ASK_TIMEOUT_MS);
      child.stdout?.on('data', (d) => { stdout += String(d); });
      child.stderr?.on('data', (d) => { stderr += String(d); });
      child.on('error', (err) => { stderr += err.message; });
      child.on('close', (code) => finish(code, false));
    });
    if (fs.existsSync(answerPath)) return { ok: true, text: fs.readFileSync(answerPath, 'utf-8') };
    if (run.timedOut) return { ok: false, error: `${opts.adapter.label} did not answer within ${Math.round((opts.timeoutMs ?? CLI_ASK_TIMEOUT_MS) / 1000)} seconds.` };
    if (run.code === 0 && run.stdout.trim()) return { ok: true, text: run.stdout };
    const detail = (run.stderr || run.stdout).trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 300);
    return { ok: false, error: `${opts.adapter.label} gave no answer${detail ? `: ${detail}` : '.'}` };
  } catch (err) {
    return { ok: false, error: `${opts.adapter.label} could not be started: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    // A just-killed CLI can hold the folder for a moment on Windows; a leftover
    // temp folder is harmless, so cleanup never fails the answer.
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* best effort */ }
  }
}
