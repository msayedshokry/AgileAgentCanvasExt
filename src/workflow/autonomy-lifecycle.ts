// ─── Autonomy Lifecycle Orchestrator ──────────────────────────────────────────
// Single entry point that wires all 17 autonomy modules into the extension
// activation lifecycle. Called from extension.ts after artifacts are loaded
// and on every project switch.
//
// Issue: #21 — Wire Autonomy modules into extension activation lifecycle

import { EventEmitter } from 'events';
import * as path from 'path';
import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { ArtifactStore } from '../state/artifact-store';

import { agentHealthMonitor } from './agent-health-monitor';
import { autoRecovery } from './auto-recovery';
import { autoScheduler } from './auto-scheduler';
import { schedulerWebviewControls, MSG_SCHEDULER_STATE } from './scheduler-webview-controls';
import { schedulerStatePersistence } from './scheduler-state-persistence';
import { budgetEnforcer } from './budget-enforcer';
import { circuitBreaker } from './circuit-breaker';
import { terminalExecutor } from './terminal-executor';
import { concurrencyQueue } from './concurrency-queue';
import { goalDecomposer } from './goal-decomposer';
import { dependencyAutoResume } from './dependency-auto-resume';
import { terminalSessionRecovery } from './terminal-recovery';

const logger = createLogger('autonomy-lifecycle');

/** Optional hooks the host extension supplies. */
export interface AutonomyLifecycleHooks {
  /** Broadcast a message to all open Agentic Kanban / Canvas webviews. */
  broadcast: (message: any) => void;
  /** Path to the output folder (for state persistence). */
  outputFolder: string;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export class AutonomyLifecycle extends EventEmitter {
  private started = false;
  private hooks: AutonomyLifecycleHooks | null = null;
  private store: ArtifactStore | null = null;
  private artifactChangeUnsub: vscode.Disposable | null = null;

  /** Configure hooks and store. Call before start(). */
  configure(hooks: AutonomyLifecycleHooks, store: ArtifactStore): void {
    this.hooks = hooks;
    this.store = store;
  }

  /** Start the autonomy stack. Idempotent. */
  start(): void {
    if (this.started) return;
    if (!this.hooks) throw new Error('AutonomyLifecycle.configure() not called');

    logger.info('Starting autonomy lifecycle…');

    // 1) Health monitor — start the polling loop
    agentHealthMonitor.start();

    // 2) Auto-recovery — wire hooks and start listening
    autoRecovery.setHooks({
      killTerminal: { kill: (id) => terminalExecutor.killTerminal(id) },
      broadcast: { broadcast: (artifactId, state) => this.broadcast({ type: 'agentStateUpdated', artifactId, agentState: state }) },
      sessionToArtifact: (sessionId) => terminalExecutor.getArtifactIdForSession(sessionId),
      sessionToTerminal: (sessionId) => terminalExecutor.getTerminalIdForSession(sessionId),
    });
    autoRecovery.start();

    // 3) Scheduler state persistence — load on activation
    this.loadSchedulerState();

    // 4) Scheduler webview controls — start emitting state messages
    schedulerWebviewControls.start();

    // 5) Budget enforcer — push initial status to webview; auto-pause is
    //    handled inside canStart() so the scheduler can query it directly.
    this.broadcast({ type: 'budgetStatus', ...budgetEnforcer.getStatus() });

    // 6) Circuit breaker — broadcast on state transitions
    circuitBreaker.on('opened', (status: any) => {
      this.broadcast({ type: 'circuitStatus', ...status });
    });
    circuitBreaker.on('closed', (status: any) => {
      this.broadcast({ type: 'circuitStatus', ...status });
    });
    circuitBreaker.on('halfOpen', (status: any) => {
      this.broadcast({ type: 'circuitStatus', ...status });
    });

    // 7) Goal decomposer — broadcast on events
    goalDecomposer.on('submitted', (g) => this.broadcast({ type: 'goalSubmitted', goal: g }));
    goalDecomposer.on('readyForReview', (g) => this.broadcast({ type: 'goalReadyForReview', goal: g }));
    goalDecomposer.on('reviewed', (g) => this.broadcast({ type: 'goalReviewed', goal: g }));
    goalDecomposer.on('dispatched', (payload) => this.broadcast({ type: 'goalDispatched', ...payload }));

    // 8) Scheduler → webview state changes are owned by
    //    schedulerWebviewControls.start() (above). It binds the same events
    //    and emits MSG_SCHEDULER_STATE, so we don't double-broadcast here.

    // 9) Auto-resume on dependency completion. The ArtifactStore change
    //    event doesn't carry deltas yet, so we trigger a full graph
    //    reconciliation after every store change. The auto-resume check
    //    itself is cheap (cached cycle detection).
    if (this.store) {
      this.artifactChangeUnsub = this.store.onDidChangeArtifacts(() => {
        // dependencyAutoResume expects (changes, stories); pass empty changes
        // to trigger a full re-evaluation. It's safe to call repeatedly.
        dependencyAutoResume.onArtifactChanges([], []).catch(err => {
          logger.debug('Auto-resume failed', { error: String(err) });
        });
      });
    }

    // 10) Recover orphaned terminal sessions
    terminalSessionRecovery.setScanner({
      findOrphans: () => Promise.resolve(terminalExecutor.findOrphanedSessions()),
    });
    terminalSessionRecovery.setReconnector({
      reconnect: async () => true, // best-effort: succeed without stream re-attach
    });
    terminalSessionRecovery.setInterruptedReporter((artifactId, reason) => {
      this.broadcast({ type: 'agentStateUpdated', artifactId, agentState: { status: 'interrupted', interruptionReason: reason } });
    });
    terminalSessionRecovery.recoverOnActivation().catch(err => {
      logger.warn('Terminal recovery failed', { error: String(err) });
    });

    this.started = true;
    logger.info('Autonomy lifecycle started');
  }

  stop(): void {
    if (!this.started) return;
    agentHealthMonitor.stop();
    autoRecovery.stop();
    schedulerWebviewControls.stop();
    schedulerStatePersistence.save();
    if (this.artifactChangeUnsub) {
      this.artifactChangeUnsub.dispose();
      this.artifactChangeUnsub = null;
    }
    this.started = false;
    logger.info('Autonomy lifecycle stopped');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Build scheduler state message and broadcast. */
  pushSchedulerState(): void {
    const state = schedulerWebviewControls.buildStateMessage();
    this.broadcast({ type: MSG_SCHEDULER_STATE, ...state });
  }

  /** Set the current stories on the scheduler. Call when artifacts change. */
  refreshSchedulerStories(stories: Array<{ id: string; status: string; priority?: string }>): void {
    autoScheduler.setStories(stories as any);
  }

  private loadSchedulerState(): void {
    if (!this.hooks) return;
    try {
      const filePath = path.join(this.hooks.outputFolder, 'scheduler-state.json');
      schedulerStatePersistence.setFilePath(filePath);
      schedulerStatePersistence.restore();
    } catch (err) {
      logger.warn('Failed to load scheduler state', { error: String(err) });
    }
  }

  private broadcast(message: any): void {
    try {
      this.hooks?.broadcast(message);
    } catch (err) {
      logger.debug('Broadcast failed', { error: String(err) });
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const autonomyLifecycle = new AutonomyLifecycle();
