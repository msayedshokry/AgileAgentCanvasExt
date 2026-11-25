// ─── Run watchdog ────────────────────────────────────────────────────────────
// Decides when a running agent should be stopped. A flat wall-clock timeout
// kills long healthy runs and waits the full window on a stuck one, so runs
// are judged on silence instead:
//   idle     no terminal output for `idleMs` — the agent is stuck or waiting
//            on a prompt nobody will answer
//   ceiling  a generous absolute bound so a chatty loop cannot run forever
// Pure: no vscode, no timers — the caller polls with the current time.

export interface WatchdogPolicy {
  /** Stop after this long without output. 0 disables the idle check. */
  readonly idleMs: number;
  /** Stop after this long in total, however active. 0 disables the ceiling. */
  readonly ceilingMs: number;
}

export interface WatchdogState {
  readonly startedAt: number;
  /** Last time the agent produced output; `startedAt` when it has produced none. */
  readonly lastOutputAt: number;
}

export type WatchdogDecision =
  | { readonly kind: 'ok' }
  | { readonly kind: 'stop'; readonly reason: 'idle' | 'ceiling'; readonly summary: string };

const MINUTE_MS = 60_000;

export const DEFAULT_WATCHDOG_POLICY: WatchdogPolicy = {
  idleMs: 15 * MINUTE_MS,
  ceilingMs: 120 * MINUTE_MS,
};

function minutes(ms: number): number {
  return Math.max(1, Math.round(ms / MINUTE_MS));
}

/** The decision for one poll tick. The ceiling wins when both have tripped. */
export function checkWatchdog(now: number, state: WatchdogState, policy: WatchdogPolicy): WatchdogDecision {
  if (policy.ceilingMs > 0 && now - state.startedAt >= policy.ceilingMs) {
    return {
      kind: 'stop',
      reason: 'ceiling',
      summary: `No verdict within ${minutes(policy.ceilingMs)}m (run time limit) — agent stopped`,
    };
  }
  const lastActivity = Math.max(state.startedAt, state.lastOutputAt);
  if (policy.idleMs > 0 && now - lastActivity >= policy.idleMs) {
    return {
      kind: 'stop',
      reason: 'idle',
      summary: `No verdict and no agent output for ${minutes(policy.idleMs)}m — agent stopped as stuck`,
    };
  }
  return { kind: 'ok' };
}

/**
 * Policy from user settings (minutes). Invalid or missing values fall back to
 * the defaults; 0 disables a check. An explicit caller timeout acts as the
 * ceiling, so existing callers that pass `timeoutMs` keep their bound.
 */
export function resolveWatchdogPolicy(
  settings: { idleMinutes?: unknown; maxRunMinutes?: unknown },
  explicitTimeoutMs?: number,
): WatchdogPolicy {
  const asMs = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v * MINUTE_MS : fallback;
  const ceilingMs = explicitTimeoutMs !== undefined
    ? explicitTimeoutMs
    : asMs(settings.maxRunMinutes, DEFAULT_WATCHDOG_POLICY.ceilingMs);
  return { idleMs: asMs(settings.idleMinutes, DEFAULT_WATCHDOG_POLICY.idleMs), ceilingMs };
}
