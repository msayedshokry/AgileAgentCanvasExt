// ─── Agent Health Monitor ────────────────────────────────────────────────────
// Monitors agent sessions through registered health checks and fires state
// transitions (healthy → degraded → dead) so the scheduler, auto-recovery,
// and circuit breaker can react to agent health changes.
//
// Issue: #2 — Agent Health Monitor Framework
// Docs:   docs/methodology.md § Autonomy / Agent Health Monitor

import { EventEmitter } from 'events';
import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';

const logger = createLogger('agent-health-monitor');

const CONFIG_KEY = 'agileagentcanvas';
const HEALTH_CHECK_INTERVAL_SETTING = 'kanban.healthCheckIntervalMs';
const DEFAULT_INTERVAL_MS = 30_000; // 30 seconds

// ── Types ────────────────────────────────────────────────────────────────────

export type HealthState = 'healthy' | 'degraded' | 'dead';

export interface HealthCheck {
  /** Run a single health check. Must not throw — catch internally. */
  check(): Promise<HealthState>;
  /** Human-readable label for logs / UI (e.g. "Terminal process alive"). */
  label: string;
}

export interface HealthTransitionEvent {
  sessionId: string;
  oldState: HealthState;
  newState: HealthState;
  checkLabel: string;
  /** Unix-epoch timestamp of the transition. */
  timestamp: number;
}

export interface SessionHealthState {
  sessionId: string;
  currentState: HealthState;
  /** Checks registered for this session (label → check). */
  checks: Map<string, HealthCheck>;
  /** Consecutive degraded/dead results (for dead-after-N). */
  consecutiveUnhealthy: number;
  /** Timestamp of the last transition. */
  lastTransitionAt: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Number of consecutive unhealthy results before marking a session as dead. */
const DEAD_AFTER_CONSECUTIVE = 3;

// ── Health Monitor ───────────────────────────────────────────────────────────

export class AgentHealthMonitor extends EventEmitter {
  private sessions = new Map<string, SessionHealthState>();
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(intervalMs?: number) {
    super();
    this.intervalMs = intervalMs ?? getHealthCheckInterval();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Register a health check for a session. If the session doesn't exist yet,
   * it is created in `healthy` state. Registering a check with the same label
   * replaces any existing check.
   */
  registerCheck(sessionId: string, check: HealthCheck): void {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        currentState: 'healthy' as HealthState,
        checks: new Map(),
        consecutiveUnhealthy: 0,
        lastTransitionAt: Date.now(),
      };
      this.sessions.set(sessionId, session);
    }
    session.checks.set(check.label, check);
    logger.debug('Health check registered', { sessionId, label: check.label });
  }

  /** Remove a specific check by label, or all checks for a session if label is omitted. */
  deregisterCheck(sessionId: string, label?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (label) {
      session.checks.delete(label);
      logger.debug('Health check deregistered', { sessionId, label });
      // If no checks left, remove the session entirely.
      if (session.checks.size === 0) {
        this.sessions.delete(sessionId);
        logger.debug('Session removed (no checks remain)', { sessionId });
      }
    } else {
      this.sessions.delete(sessionId);
      logger.debug('All health checks deregistered for session', { sessionId });
    }
  }

  /** Start the polling loop. Safe to call multiple times (idempotent). */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.runAllChecks(), this.intervalMs);
    this.timer.unref?.(); // Don't keep the process alive just for this timer.
    logger.info('Health monitor started', { intervalMs: this.intervalMs });
  }

  /** Stop the polling loop. Safe to call multiple times (idempotent). */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    logger.info('Health monitor stopped');
  }

  /** Returns whether the polling loop is currently active. */
  isRunning(): boolean {
    return this.timer !== null;
  }

  /** Get the current health state for a session (undefined if unknown). */
  getState(sessionId: string): HealthState | undefined {
    return this.sessions.get(sessionId)?.currentState;
  }

  /** Get the full session state (for debugging / UI). */
  getSession(sessionId: string): SessionHealthState | undefined {
    return this.sessions.get(sessionId);
  }

  /** Return all tracked session IDs. */
  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /** Return all tracked sessions (for serialization / debugging). */
  listAllSessions(): SessionHealthState[] {
    return Array.from(this.sessions.values());
  }

  /** Manually reset a session's health back to healthy (e.g. after recovery). */
  resetSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.currentState = 'healthy';
    session.consecutiveUnhealthy = 0;
    session.lastTransitionAt = Date.now();
    logger.info('Session health reset', { sessionId });
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async runAllChecks(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.runChecksForSession(sessionId);
    }
  }

  private async runChecksForSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.checks.size === 0) {
      // Session was removed or has no checks — clean up.
      if (session?.checks.size === 0) {
        this.sessions.delete(sessionId);
      }
      return;
    }

    // Run all registered checks in parallel.
    const results = await Promise.allSettled(
      Array.from(session.checks.entries()).map(async ([label, check]) => {
        try {
          const result = await check.check();
          return { label, result };
        } catch (err) {
          logger.warn('Health check threw', { sessionId, label, error: String(err) });
          return { label, result: 'degraded' as HealthState };
        }
      }),
    );

    // Determine the aggregate state: worst result wins.
    let worstResult: HealthState = 'healthy';
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.result === 'dead') worstResult = 'dead';
        else if (r.value.result === 'degraded' && worstResult !== 'dead') worstResult = 'degraded';
      }
    }

    // Transition logic.
    const oldState = session.currentState;
    if (worstResult === 'healthy') {
      session.consecutiveUnhealthy = 0;
    } else {
      session.consecutiveUnhealthy++;
    }

    // Dead after N consecutive unhealthy results.
    if (session.consecutiveUnhealthy >= DEAD_AFTER_CONSECUTIVE) {
      worstResult = 'dead';
    }

    if (worstResult !== oldState) {
      session.currentState = worstResult;
      session.lastTransitionAt = Date.now();
      const checkLabel = results
        .filter((r): r is PromiseFulfilledResult<{ label: string; result: HealthState }> => r.status === 'fulfilled')
        .filter(r => r.value.result === worstResult)
        .map(r => r.value.label)
        .join(', ');

      const event: HealthTransitionEvent = {
        sessionId,
        oldState,
        newState: worstResult,
        checkLabel,
        timestamp: session.lastTransitionAt,
      };

      logger.warn('Health state transition', event);
      this.emit('transition', event);
      this.emit(worstResult, event); // Also emit specific state events.

      // Dead sessions are cleaned up — they no longer need monitoring.
      if (worstResult === 'dead') {
        this.sessions.delete(sessionId);
        logger.info('Dead session removed from monitor', { sessionId });
      }
    }
  }
}

// ── Configuration ────────────────────────────────────────────────────────────

function getHealthCheckInterval(): number {
  const v = vscode.workspace
    .getConfiguration(CONFIG_KEY)
    .get<number>(HEALTH_CHECK_INTERVAL_SETTING, DEFAULT_INTERVAL_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_INTERVAL_MS;
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const agentHealthMonitor = new AgentHealthMonitor();
