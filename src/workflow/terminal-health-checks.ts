// ─── Terminal Agent Health Checks ─────────────────────────────────────────────
// Three health checks for terminal-based agents:
//   1. Process liveness (is the shell process still running?)
//   2. Output progress (has new output appeared within progressTimeoutMs?)
//   3. Artifact change (has the artifact been modified within artifactStaleMs?)
//
// Issue: #9 — Terminal Agent Health Checks

import type * as vscode from 'vscode';
import { HealthCheck } from './agent-health-monitor';
import type { BmadModel } from '../chat/ai-provider';
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

/**
 * Strongly typed context bundle for a chat-path execution step. Whenever
 * the orchestrator sees `ctx.stream` and `ctx.model` it must also supply a
 * tracker — without one, the chat-stream-progress check has no real signal
 * and would silently revert to the legacy elapsed-only shape. We type
 * this as a single unit so future maintainers cannot accidentally omit
 * the tracker when constructing a chat context.
 *
 * Issue: #32 reviewer followup — tighten `Supplier<ChatProgressTracker>`
 * so `tracker` is required whenever `stream` is set.
 */
export interface ChatPathContext {
  model: BmadModel;
  stream: vscode.ChatResponseStream;
  token?: vscode.CancellationToken;
  tracker: ChatProgressTracker;
}

/**
 * Runtime narrowing helper for the OrchestratorContext that
 * `KanbanOrchestrator.runStepGuarded` consumes. Returns `null` for the
 * terminal path (no model/stream). Returns a fully typed `ChatPathContext`
 * for the chat path, OR THROWS if `stream` is set but `tracker` is missing
 * — preserving the #32 invariant that real chat execution has real
 * activity timestamps.
 *
 * A future maintainer who writes `ctx = { model, stream }` without a
 * tracker will hit this error at runtime; the compile-time signal comes
 * from `ChatPathContext` being a single typed unit rather than four
 * loose optional fields.
 */
export function requireChatPathContext(
  ctx: { model?: unknown; stream?: unknown; token?: unknown; tracker?: unknown },
): ChatPathContext | null {
  if (!ctx.model || !ctx.stream) {
    return null; // terminal path
  }
  if (
    !ctx.tracker ||
    typeof (ctx.tracker as { markActivity?: unknown }).markActivity !== 'function'
  ) {
    throw new Error(
      'Chat path requires `tracker: ChatProgressTracker` in OrchestratorContext ' +
      'when `model` and `stream` are set. Provide a `ChatProgressTracker` instance ' +
      'so the chat-stream-progress health check has real activity timestamps.',
    );
  }
  return {
    model: ctx.model as ChatPathContext['model'],
    stream: ctx.stream as ChatPathContext['stream'],
    token: ctx.token as ChatPathContext['token'],
    tracker: ctx.tracker as ChatPathContext['tracker'],
  };
}

/**
 * Stateful tracker for in-chat (Copilot) agent activity. The orchestrator
 * (or any other owner of the chat session lifecycle) calls
 * `markActivity()` whenever a chunk of streaming output arrives; the
 * health check reads `getLastActivity()` to detect stalls.
 *
 * Issue: #32 — In-chat session health monitoring (stream stall detection).
 *
 * Without this tracker the only signal available to a chat health check
 * is `Date.now() - startedAt`, which can't distinguish "slow" from "stalled".
 */
export class ChatProgressTracker {
  private lastActivityAt: number = Date.now();
  private activityCount = 0;

  /** Call on every chunk of streaming output from the chat session. */
  markActivity(): void {
    this.lastActivityAt = Date.now();
    this.activityCount++;
  }

  /** Time of the most recent activity (ms epoch). Defaults to construction
   *  time so a brand-new tracker is already considered "active" until the
   *  first stall window elapses without any marks. */
  getLastActivity(): number {
    return this.lastActivityAt;
  }

  /** Total activity marks since construction (debug/observability). */
  getActivityCount(): number {
    return this.activityCount;
  }
}

/** Options for chat health checks. */
export interface ChatHealthCheckOptions {
  /** Timeout for session elapsed time threshold (default 300 s for chat). */
  sessionTimeoutMs?: number;
  /**
   * Maximum gap allowed between streaming activity marks before the
   * session is considered stalled. Default 60_000 (one minute) per #32.
   * Only used when `tracker` is provided.
   */
  outputStallMs?: number;
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
  tracker?: ChatProgressTracker,
): HealthCheck[] {
  const sessionTimeoutMs = options.sessionTimeoutMs ?? 300_000; // 5 min for chat
  const outputStallMs = options.outputStallMs ?? 60_000;        // 1 min for stalls (#32)
  const startedAt = Date.now();

  const checks: HealthCheck[] = [
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

  if (tracker) {
    checks.push({
      label: 'chat-stream-progress',
      // Local try/catch (instead of safeCheck) so we can keep the 'dead'
      // transition for the 3× stall boundary — safeCheck's signature only
      // allows 'healthy'|'degraded'. Errors degrade to 'degraded' just
      // like the wrapped checks do, so a disposed tracker still fails
      // soft without throwing into the monitor poll loop.
      check: async () => {
        try {
          const lastActivity = tracker.getLastActivity();
          const stallMs = Date.now() - lastActivity;
          if (stallMs > outputStallMs * 3) return 'dead';
          if (stallMs > outputStallMs) return 'degraded';
          return 'healthy';
        } catch (err) {
          logger.warn('chat-stream-progress check threw', { error: String(err) });
          return 'degraded';
        }
      },
    });
  }

  return checks;
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
