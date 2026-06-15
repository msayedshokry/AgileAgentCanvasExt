// ─── Terminal Agent Health Checks ─────────────────────────────────────────────
// Three health checks for terminal-based agents:
//   1. Process liveness (is the shell process still running?)
//   2. Output progress (has new output appeared within progressTimeoutMs?)
//   3. Artifact change (has the artifact been modified within artifactStaleMs?)
//
// Issue: #9 — Terminal Agent Health Checks

import { HealthCheck } from './agent-health-monitor';
import { createLogger } from '../utils/logger';

const logger = createLogger('terminal-health-checks');

const DEFAULT_PROGRESS_TIMEOUT_MS = 60_000; // 1 min
const DEFAULT_ARTIFACT_STALE_MS = 5 * 60_000; // 5 min

// ── Types ────────────────────────────────────────────────────────────────────

/** Minimal terminal interface — what TerminalExecutor exposes. */
export interface TerminalLike {
  /** Whether the underlying process is still alive. */
  isAlive(): boolean | Promise<boolean>;
  /** Time of the most recent output (ms epoch). */
  getLastOutputTime(): number | Promise<number>;
}

/** Minimal artifact interface. */
export interface ArtifactLikeForHealth {
  lastModified?: number;
  /** Unix epoch ms of last artifact change. */
  getLastModifiedTime(): number | Promise<number>;
}

export interface TerminalHealthCheckOptions {
  progressTimeoutMs?: number;
  artifactStaleMs?: number;
}

// ── Checks ───────────────────────────────────────────────────────────────────

/** Check 1: Is the terminal process still alive? */
export function processLivenessCheck(terminal: TerminalLike): HealthCheck {
  return {
    label: 'process-liveness',
    async check() {
      try {
        const alive = await terminal.isAlive();
        return alive ? 'healthy' : 'dead';
      } catch (err) {
        logger.warn('Process liveness check threw', { error: String(err) });
        return 'degraded';
      }
    },
  };
}

/** Check 2: Has the terminal produced output within progressTimeoutMs? */
export function outputProgressCheck(terminal: TerminalLike, timeoutMs: number = DEFAULT_PROGRESS_TIMEOUT_MS): HealthCheck {
  return {
    label: 'output-progress',
    check: () => safeCheck(async () => {
      const lastOutput = await terminal.getLastOutputTime();
      const elapsed = Date.now() - lastOutput;
      return elapsed > timeoutMs ? 'degraded' : 'healthy';
    }, 'output-progress'),
  };
}

/** Check 3: Has the artifact been modified within artifactStaleMs? */
export function artifactChangeCheck(artifact: ArtifactLikeForHealth, timeoutMs: number = DEFAULT_ARTIFACT_STALE_MS): HealthCheck {
  return {
    label: 'artifact-change',
    check: () => safeCheck(async () => {
      const lastModified = await artifact.getLastModifiedTime();
      const elapsed = Date.now() - lastModified;
      return elapsed > timeoutMs ? 'degraded' : 'healthy';
    }, 'artifact-change'),
  };
}

/** Bundle all three checks for a single terminal + artifact pair. */
export function createTerminalHealthChecks(
  terminal: TerminalLike,
  artifact: ArtifactLikeForHealth,
  options: TerminalHealthCheckOptions = {},
): HealthCheck[] {
  return [
    processLivenessCheck(terminal),
    outputProgressCheck(terminal, options.progressTimeoutMs),
    artifactChangeCheck(artifact, options.artifactStaleMs),
  ];
}

// ─── Chat Agent Health Checks ───────────────────────────────────────────────

/** Options for chat health checks. */
export interface ChatHealthCheckOptions {
  /** Timeout for session elapsed time threshold (default 300 s for chat). */
  sessionTimeoutMs?: number;
}

/**
 * Create health checks for an in-chat (Copilot) agent session.
 *
 * Chat sessions are harder to monitor than terminals since we don't
 * have direct process access or streaming feedback. These checks
 * measure total elapsed time since session creation (no output-progress
 * feedback available). They act as a hang-detection timeout:
 *   - Within sessionTimeoutMs: healthy
 *   - Between sessionTimeoutMs and 3× sessionTimeoutMs: degraded
 *   - After 3× sessionTimeoutMs: dead
 *
 * Unlike terminal checks, there's no process-liveness check since VS Code
 * manages the Copilot process lifecycle. If the session exceeds the timeout
 * without completing, it's flagged as degraded and eventually dead.
 *
 * Note: lastOutputAt is set once at creation and never updated because the
 * current architecture doesn't stream output progress back to health checks.
 */
export function createChatHealthChecks(
  _artifact: any,
  options: ChatHealthCheckOptions = {},
): HealthCheck[] {
  const sessionTimeoutMs = options.sessionTimeoutMs ?? 300_000; // 5 min for chat
  const startedAt = Date.now();

  return [
    {
      label: 'chat-session-elapsed',
      check: async () => {
        const elapsed = Date.now() - startedAt;
        if (elapsed > sessionTimeoutMs * 3) return 'dead';
        if (elapsed > sessionTimeoutMs) return 'degraded';
        return 'healthy';
      },
    },
  ];
}

/** Shared try/catch wrapper — returns 'degraded' on error. */
async function safeCheck(fn: () => Promise<'healthy' | 'degraded'>, label: string): Promise<'healthy' | 'degraded'> {
  try {
    return await fn();
  } catch (err) {
    logger.warn(`${label} check threw`, { error: String(err) });
    return 'degraded';
  }
}
