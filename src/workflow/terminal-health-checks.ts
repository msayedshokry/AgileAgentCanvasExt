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
    async check() {
      try {
        const lastOutput = await terminal.getLastOutputTime();
        const elapsed = Date.now() - lastOutput;
        if (elapsed > timeoutMs * 3) return 'dead';
        if (elapsed > timeoutMs) return 'degraded';
        return 'healthy';
      } catch (err) {
        logger.warn('Output progress check threw', { error: String(err) });
        return 'degraded';
      }
    },
  };
}

/** Check 3: Has the artifact been modified within artifactStaleMs? */
export function artifactChangeCheck(artifact: ArtifactLikeForHealth, timeoutMs: number = DEFAULT_ARTIFACT_STALE_MS): HealthCheck {
  return {
    label: 'artifact-change',
    async check() {
      try {
        const lastModified = await artifact.getLastModifiedTime();
        const elapsed = Date.now() - lastModified;
        if (elapsed > timeoutMs * 3) return 'dead';
        if (elapsed > timeoutMs) return 'degraded';
        return 'healthy';
      } catch (err) {
        logger.warn('Artifact change check threw', { error: String(err) });
        return 'degraded';
      }
    },
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
