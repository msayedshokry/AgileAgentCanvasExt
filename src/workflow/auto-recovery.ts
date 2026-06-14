// ─── Auto-Recovery on Health Failure ──────────────────────────────────────────
// When AgentHealthMonitor detects a 'dead' agent, auto-recover:
//   1. Kill the terminal
//   2. Release the concurrency lock
//   3. Mark session as failed in trace recorder
//   4. Push agentStateUpdated to webview
//
// Issue: #13 — Auto-Recovery on Health Failure

import { agentHealthMonitor, HealthTransitionEvent } from './agent-health-monitor';
import { concurrencyQueue } from './concurrency-queue';
import { createLogger } from '../utils/logger';

const logger = createLogger('auto-recovery');

// ── Hook Interfaces ──────────────────────────────────────────────────────────

export interface TerminalKiller {
  kill(terminalId: string): Promise<void>;
}

export interface AgentStateBroadcaster {
  broadcast(artifactId: string, state: { status: 'failed'; reason: string }): void;
}

export interface RecoveryHooks {
  killTerminal: TerminalKiller;
  broadcast: AgentStateBroadcaster;
  /** Map from sessionId to artifactId — needed to translate health events. */
  sessionToArtifact: (sessionId: string) => string | undefined;
  /** Map from sessionId to terminalId — for killing. */
  sessionToTerminal: (sessionId: string) => string | undefined;
}

// ── Recovery Coordinator ─────────────────────────────────────────────────────

export class AutoRecovery {
  private hooks: RecoveryHooks | null = null;
  private bound = false;

  setHooks(hooks: RecoveryHooks): void {
    this.hooks = hooks;
  }

  /** Begin listening for 'dead' transitions. Idempotent. */
  start(): void {
    if (this.bound) return;
    agentHealthMonitor.on('dead', this.onDeadTransition);
    this.bound = true;
    logger.info('AutoRecovery started');
  }

  stop(): void {
    if (!this.bound) return;
    agentHealthMonitor.off('dead', this.onDeadTransition);
    this.bound = false;
    logger.info('AutoRecovery stopped');
  }

  private onDeadTransition = async (event: HealthTransitionEvent) => {
    if (!this.hooks) return;
    const { sessionId, checkLabel } = event;
    const artifactId = this.hooks.sessionToArtifact(sessionId);
    const terminalId = this.hooks.sessionToTerminal(sessionId);

    logger.warn('Auto-recovery triggered', { sessionId, artifactId, terminalId, checkLabel });

    // 1. Kill the terminal
    if (terminalId) {
      try {
        await this.hooks.killTerminal.kill(terminalId);
        logger.info('Terminal killed', { terminalId });
      } catch (err) {
        logger.warn('Failed to kill terminal', { terminalId, error: String(err) });
      }
    }

    // 2. Release the concurrency lock
    if (artifactId) {
      try {
        concurrencyQueue.release(artifactId);
        logger.info('Lock released', { artifactId });
      } catch (err) {
        logger.warn('Failed to release lock', { artifactId, error: String(err) });
      }
    }

    // 3 & 4. Broadcast failed state
    if (artifactId) {
      const reason = `Agent stopped responding: ${checkLabel}`;
      try {
        this.hooks.broadcast.broadcast(artifactId, { status: 'failed', reason });
      } catch (err) {
        logger.warn('Failed to broadcast state', { artifactId, error: String(err) });
      }
    }
  };
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const autoRecovery = new AutoRecovery();
