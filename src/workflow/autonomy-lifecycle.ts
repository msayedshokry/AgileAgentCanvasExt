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
import { kanbanDependencyVisualizer, StoryWithTitle } from './kanban-dep-visualizer';
import { dependencyGraph } from './dependency-graph';
import { autoRetryEngine } from './auto-retry-engine';
import { autonomousGit, type GitRunner } from './autonomous-git';
import { failureClassifier } from './failure-classifier';
import { costTracker } from '../chat/cost-tracker';
import { ConcurrencyQueuePersistence, setupAutoSave as setupConcurrencyAutoSave } from './concurrency-queue-persistence';
import { crossArtifactHarnessDetector } from '../harness/cross-artifact-detector';
import { harnessEngine, type HarnessFindingsEvent } from '../harness/policy-engine';

const logger = createLogger('autonomy-lifecycle');

/**
 * Compute a stable fingerprint for a set of correlated patterns so we can
 * skip re-broadcasting duplicate systemicIssue messages to the webview.
 * Uses sorted policyId:count:severity tuples — deterministic and compact.
 */
function systemicIssueFingerprint(patterns: Array<{ policyId: string; count: number; severity: string }>): string {
  return patterns
    .map(p => `${p.policyId}:${p.count}:${p.severity}`)
    .sort()
    .join('|');
}

/** Optional hooks the host extension supplies. */
export interface AutonomyLifecycleHooks {
  /** Broadcast a message to all open Agentic Kanban / Canvas webviews. */
  broadcast: (message: any) => void;
  /** Path to the output folder (for state persistence). */
  outputFolder: string;
  /** Optional git runner for autonomous branch/commit/PR (issue #17). */
  gitRunner?: GitRunner;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export class AutonomyLifecycle extends EventEmitter {
  private started = false;
  private hooks: AutonomyLifecycleHooks | null = null;
  private store: ArtifactStore | null = null;
  private artifactChangeUnsub: vscode.Disposable | null = null;
  private concurrencyPersistence: ConcurrencyQueuePersistence | null = null;
  /** Accumulated findings across harness evaluations for cross-artifact correlation.
   *  Capped at MAX_ACCUMULATED_FINDINGS (sliding window) to prevent unbounded growth. */
  private static readonly MAX_ACCUMULATED_FINDINGS = 200;
  private accumulatedFindings: HarnessFindingsEvent['findings'] = [];
  /** Reference to the harnessEngine 'findings' listener for cleanup in stop(). */
  private harnessFindingsListener: ((event: HarnessFindingsEvent) => void) | null = null;
  /** Fingerprint of the last broadcast systemic patterns to skip duplicate broadcasts. */
  private lastSystemicFingerprint: string | null = null;

  /** Configure hooks and store. Call before start(). */
  configure(hooks: AutonomyLifecycleHooks, store: ArtifactStore): void {
    this.hooks = hooks;
    this.store = store;
  }

  /** Start the autonomy stack. Idempotent. */
  start(): void {
    // Reset cross-scenario state on every configure+start cycle so tests
    // don't see accumulated findings from a previous scenario.
    this.accumulatedFindings = [];
    this.lastSystemicFingerprint = null;

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
        // Issue: Wire dependency data flow — recompute blockedBy/hasCycle/
        // blockerTitles and push to the webview so the KanbanCard badge stays
        // in sync with the latest dependency graph.
        this.pushDependencyBadges();
      });
    }

    // Push initial dependency badges so the kanban renders with up-to-date
    // "Blocked by N" badges right after activation.
    this.pushDependencyBadges();

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

    // 11) Auto-retry engine — configure defaults. The scheduler calls
    //     engine.run() when executing workflows; circuit breaker (#20)
    //     queries failureClassifier internally before retrying.
    //     failureClassifier (#14) is used transitively — no separate wiring.
    autoRetryEngine.setConfig({ maxRetries: 3, initialDelayMs: 1_000, backoffMultiplier: 2 });

    // 12) Autonomous Git — configure hooks that broadcast branch/commit/PR
    //     events to the webview. The git runner is injected by extension.ts
    //     via hooks.gitRunner.
    autonomousGit.setConfig({ autoBranch: true, autoCommit: true, autoPR: false });
    if (this.hooks.gitRunner) autonomousGit.setRunner(this.hooks.gitRunner);
    autonomousGit.setHooks({
      onBranch: (storyId, branchName) => this.broadcast({ type: 'gitBranch', storyId, branchName }),
      onCommit: (storyId, sha) => this.broadcast({ type: 'gitCommit', storyId, sha }),
      onPR:     (storyId, url) => this.broadcast({ type: 'gitPR', storyId, url }),
    });

    // 13) Cost tracker — wire log path into the output folder. The AI
    //     provider must call costTracker.record() on every LLM completion;
    //     that wiring lives in ai-provider.ts (outside lifecycle scope).
    if (this.hooks?.outputFolder) {
      costTracker.setLogPath(path.join(this.hooks.outputFolder, 'cost-tracking.jsonl'));
    }

    // 14) Concurrency queue persistence — restore on activation, auto-save
    //     on every lock change.
    this.concurrencyPersistence = new ConcurrencyQueuePersistence(
      path.join(this.hooks.outputFolder, 'concurrency-queue-state.json'),
    );
    this.concurrencyPersistence.restore();
    setupConcurrencyAutoSave(this.concurrencyPersistence);

    // 15) Cross-artifact harness pattern detector — subscribe to harness
    //     engine findings, accumulate them (capped sliding window), and
    //     broadcast systemic patterns to the webview when the same policy
    //     fails on ≥3 artifacts.
    crossArtifactHarnessDetector.setThreshold(3);
    this.harnessFindingsListener = (event: HarnessFindingsEvent) => {
      this.accumulatedFindings.push(...event.findings);
      // Sliding window cap: keep only the most recent MAX entries
      if (this.accumulatedFindings.length > AutonomyLifecycle.MAX_ACCUMULATED_FINDINGS) {
        this.accumulatedFindings = this.accumulatedFindings.slice(
          -AutonomyLifecycle.MAX_ACCUMULATED_FINDINGS,
        );
      }
      const result = crossArtifactHarnessDetector.correlate(this.accumulatedFindings);
      if (result.hasSystemicIssues) {
        // Deduplicate: skip re-broadcast if patterns haven't changed.
        const fingerprint = systemicIssueFingerprint(result.patterns);
        if (fingerprint === this.lastSystemicFingerprint) return;
        this.lastSystemicFingerprint = fingerprint;
        this.broadcast({
          type: 'systemicIssue',
          artifactId: event.artifactId,
          artifactType: event.artifactType,
          patterns: result.patterns,
        });
      } else if (this.lastSystemicFingerprint !== null) {
        // Patterns cleared — reset fingerprint so the next detection broadcasts immediately.
        this.lastSystemicFingerprint = null;
      }
    };
    harnessEngine.on('findings', this.harnessFindingsListener);

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
    if (this.concurrencyPersistence) {
      this.concurrencyPersistence.save();
      this.concurrencyPersistence = null;
    }
    if (this.harnessFindingsListener) {
      harnessEngine.off('findings', this.harnessFindingsListener);
      this.harnessFindingsListener = null;
    }
    this.accumulatedFindings = [];
    this.lastSystemicFingerprint = null;
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

  /**
   * Walk the live ArtifactStore, rebuild the dependency graph from every
   * story's `dependencies` field, and broadcast a compact
   * `updateDependencyBadges` payload so the Agentic Kanban webview can
   * render "🔗 Blocked by N" / "⛔ Blocked by N" badges without needing to
   * re-walk the graph itself.
   *
   * Called from start() and on every artifact change. The `badges` field
   * uses the KanbanItem field names directly (blockedBy / hasCycle /
   * blockerTitles) so the webview can merge them into cards without a
   * translation layer. The internal `count` from BlockedByBadge maps to
   * `blockedBy` here; see kanban-dep-visualizer.ts.
   */
  pushDependencyBadges(): void {
    if (!this.store) return;
    try {
      const state = this.store.getState();
      const epics = (state?.epics ?? []) as Array<any>;
      const stories: Array<{ id: string; title?: string; dependencies?: any }> = [];
      for (const epic of epics) {
        for (const story of (epic.stories ?? [])) {
          stories.push({
            id: story.id,
            title: story.title,
            dependencies: story.dependencies,
          });
        }
      }
      if (stories.length === 0) {
        this.broadcast({ type: 'updateDependencyBadges', badges: [] });
        return;
      }

      // Build the graph + load titles for tooltip rendering
      const refs = stories.map(s => ({ id: s.id, dependencies: s.dependencies }));
      dependencyGraph.build(refs);
      const withTitles: StoryWithTitle[] = stories.map(s => ({ id: s.id, title: s.title }));
      kanbanDependencyVisualizer.loadStories(withTitles);

      const badges = stories
        .map(s => {
          const badge = kanbanDependencyVisualizer.getBlockedByBadge(s.id);
          if (!badge) return null;
          return {
            id: s.id,
            blockedBy: badge.count,           // map visualizer's `count` → KanbanItem.blockedBy
            hasCycle: badge.hasCycle,
            blockerTitles: badge.previewTitles,
          };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null && b.blockedBy > 0);

      this.broadcast({ type: 'updateDependencyBadges', badges });
    } catch (err) {
      // Never let a malformed dependencies field kill the whole kanban
      // render. The webview keeps whatever badges it had previously.
      logger.warn('pushDependencyBadges failed', { error: String(err) });
    }
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
    // Emit on the EventEmitter so tests (and internal listeners) can
    // observe broadcasts without intercepting hooks.broadcast.
    this.emit('broadcast', message);
    try {
      this.hooks?.broadcast(message);
    } catch (err) {
      logger.debug('Broadcast failed', { error: String(err) });
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const autonomyLifecycle = new AutonomyLifecycle();
