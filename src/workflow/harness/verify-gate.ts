// ─── Verify gate ─────────────────────────────────────────────────────────────
// A card must not reach review on the agent's word alone: after the implement
// step, the project's own test command runs in the card's working copy. A
// failure becomes a fix request for the next implement iteration.
//
// The command comes from the user's settings or their project-context.md
// (both under their control in a trusted workspace), so it is run through
// the shell like they would type it.

import * as cp from 'child_process';

export interface VerifyResult {
  readonly passed: boolean;
  readonly command: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly durationMs: number;
  /** Last lines of combined output (for the fix request and the card). */
  readonly tail: string;
}

const TAIL_CHARS = 4000;
/** ANSI colour codes (ESC [ … m); built from a string so the source has no raw control char. */
const ANSI_SGR = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

export function runVerifyCommand(
  command: string,
  cwd: string,
  timeoutMs = 15 * 60 * 1000,
  signal?: AbortSignal,
): Promise<VerifyResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;
    let killed = false;
    let done = false;
    const isWindows = process.platform === 'win32';
    // POSIX: own process group, so a kill reaches the test runner the shell
    // started (killing only `sh` leaves it running with our pipes open).
    const child = cp.spawn(command, {
      cwd, shell: true, windowsHide: true, detached: !isWindows,
      env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
    });
    const append = (chunk: Buffer) => {
      output = (output + chunk.toString('utf-8')).slice(-TAIL_CHARS * 4);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    const signalTree = (sig: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (isWindows) cp.spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        else process.kill(-child.pid, sig);
      } catch { /* already gone */ }
    };
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      signal?.removeEventListener('abort', onAbort);
      const tail = output.replace(ANSI_SGR, '').trim().slice(-TAIL_CHARS);
      resolve({ passed: code === 0 && !timedOut && !killed, command, exitCode: code, timedOut, durationMs: Date.now() - started, tail });
    };
    const kill = () => {
      if (killed || done) return;
      killed = true;
      signalTree('SIGTERM');
      // Escalate, then stop waiting for streams a stubborn grandchild may hold.
      forceTimer = setTimeout(() => {
        signalTree('SIGKILL');
        child.stdout?.destroy();
        child.stderr?.destroy();
        finish(null);
      }, 2000);
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    const onAbort = () => kill();
    signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (err) => { output += `\n${err.message}`; finish(null); });
    child.on('close', (code) => finish(code));
  });
}

/** Fix request handed to the next implement iteration when verification fails. */
export function verifyFixRequest(result: VerifyResult): { failing_criterion: string; reproduction: string; reverify_with: string } {
  return {
    failing_criterion: result.timedOut
      ? `Verification timed out: \`${result.command}\``
      : `Verification failed (exit ${result.exitCode}): \`${result.command}\``,
    reproduction: result.tail || '(no output)',
    reverify_with: result.command,
  };
}
