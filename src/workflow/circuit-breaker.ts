// ─── Circuit Breaker for Repeated Failures ─────────────────────────────────────
// Tracks failures per workflow type across all artifacts. When a workflow
// fails N times (default 5), the circuit opens and prevents auto-starts for
// that type until manually reset.
//
// Issue: #20 — Circuit Breaker for Repeated Failures

import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';

const logger = createLogger('circuit-breaker');

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  threshold: number; // consecutive failures before opening
  /** When in open state, time after which to transition to half-open. */
  cooldownMs: number;
}

export interface CircuitStatus {
  workflowId: string;
  state: CircuitState;
  failureCount: number;
  lastFailureAt?: number;
  lastFailureReason?: string;
  openedAt?: number;
}

// ── Breaker ──────────────────────────────────────────────────────────────────

export class CircuitBreaker extends EventEmitter {
  private config: CircuitBreakerConfig = { threshold: 5, cooldownMs: 5 * 60_000 };
  /** workflowId → state */
  private states = new Map<string, CircuitStatus>();

  setConfig(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  /** Record a failure for a workflow type. May open the circuit. */
  recordFailure(workflowId: string, reason?: string): CircuitStatus {
    let status = this.states.get(workflowId);
    if (!status) {
      status = { workflowId, state: 'closed', failureCount: 0 };
      this.states.set(workflowId, status);
    }

    // If we're in open state but cooldown has passed, transition to half-open
    if (status.state === 'open' && this.cooldownElapsed(status)) {
      status.state = 'half-open';
      this.emit('halfOpen', status);
      logger.info('Circuit moved to half-open', { workflowId });
    }

    status.failureCount++;
    status.lastFailureAt = Date.now();
    status.lastFailureReason = reason;

    if (status.state === 'half-open') {
      // A failure in half-open immediately re-opens
      status.state = 'open';
      status.openedAt = Date.now();
      this.emit('opened', status);
      logger.warn('Circuit re-opened from half-open', { workflowId, reason });
    } else if (status.failureCount >= this.config.threshold) {
      status.state = 'open';
      status.openedAt = Date.now();
      this.emit('opened', status);
      logger.warn('Circuit opened', { workflowId, count: status.failureCount, reason });
    }

    return status;
  }

  /** Record a success — resets the failure count and closes the circuit. */
  recordSuccess(workflowId: string): CircuitStatus {
    let status = this.states.get(workflowId);
    if (!status) {
      status = { workflowId, state: 'closed', failureCount: 0 };
      this.states.set(workflowId, status);
      return status;
    }
    if (status.state !== 'closed') {
      logger.info('Circuit closed after success', { workflowId });
      this.emit('closed', status);
    }
    status.state = 'closed';
    status.failureCount = 0;
    status.openedAt = undefined;
    return status;
  }

  /** Check if a workflow is allowed to run. False when circuit is open. */
  canRun(workflowId: string): boolean {
    let status = this.states.get(workflowId);
    if (!status) return true;

    // Auto-transition open → half-open after cooldown
    if (status.state === 'open' && this.cooldownElapsed(status)) {
      status.state = 'half-open';
      this.emit('halfOpen', status);
      logger.info('Circuit moved to half-open (lazy)', { workflowId });
    }

    return status.state !== 'open';
  }

  /** Manually reset a circuit back to closed. */
  reset(workflowId: string): void {
    const status = this.states.get(workflowId);
    if (!status) return;
    const wasOpen = status.state !== 'closed';
    status.state = 'closed';
    status.failureCount = 0;
    status.openedAt = undefined;
    if (wasOpen) this.emit('closed', status);
    logger.info('Circuit manually reset', { workflowId });
  }

  /** Get status of a workflow's circuit. */
  getStatus(workflowId: string): CircuitStatus | undefined {
    return this.states.get(workflowId);
  }

  /** Get all circuit statuses. */
  listAll(): CircuitStatus[] {
    return Array.from(this.states.values());
  }

  /** List workflows whose circuits are currently open. */
  listOpen(): CircuitStatus[] {
    return this.listAll().filter(s => s.state === 'open');
  }

  /** Reset all circuits. */
  resetAll(): void {
    for (const id of Array.from(this.states.keys())) {
      this.reset(id);
    }
  }

  private cooldownElapsed(status: CircuitStatus): boolean {
    if (!status.openedAt) return false;
    return Date.now() - status.openedAt >= this.config.cooldownMs;
  }
}

export const circuitBreaker = new CircuitBreaker();
