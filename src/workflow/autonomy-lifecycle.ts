// ─── Autonomy Lifecycle Orchestrator ──────────────────────────────────────────
// Single entry point that wires all 17 autonomy modules into the extension
// activation lifecycle. Called from extension.ts after artifacts are loaded
// and on every project switch.
//
// Issue: #21 — Wire Autonomy modules into extension activation lifecycle

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { ArtifactStore } from '../state/artifact-store';

import { agentHealthMonitor } from './agent-health-monitor';
import { autoRecovery } from './auto-recovery';
import { autoScheduler, type SchedulerStory } from './auto-scheduler';
import { schedulerWebviewControls, MSG_SCHEDULER_STATE } from './scheduler-webview-controls';
import { schedulerStatePersistence } from './scheduler-state-persistence';
import { budgetEnforcer } from './budget-enforcer';
import { circuitBreaker } from './circuit-breaker';
import { terminalExecutor } from './terminal-executor';
import { concurrencyQueue } from './concurrency-queue';
import { goalDecomposer, type ProposedStory } from './goal-decomposer';
import { dependencyAutoResume } from './dependency-auto-resume';
import { terminalSessionRecovery } from './terminal-recovery';
import { kanbanDependencyVisualizer, StoryWithTitle } from './kanban-dep-visualizer';
import { dependencyGraph, type StoryRef } from './dependency-graph';
import { autoRetryEngine } from './auto-retry-engine';
import { autonomousGit, type GitRunner } from './autonomous-git';
import { failureClassifier } from './failure-classifier';
import { costTracker } from '../chat/cost-tracker';
import { ConcurrencyQueuePersistence, setupAutoSave as setupConcurrencyAutoSave } from './concurrency-queue-persistence';
import { crossArtifactHarnessDetector } from '../harness/cross-artifact-detector';
import { harnessEngine, type HarnessFindingsEvent } from '../harness/policy-engine';
import { kanbanOrchestrator, type OrchestratorContext } from './kanban-orchestrator';
import { isKanbanAutoAdvanceEnabled } from './kanban-settings';

const logger = createLogger('autonomy-lifecycle');

import { errMsg } from '../utils/error';

/** File name for persisted terminal session metadata. */
const TERMINAL_SESSIONS_FILE = 'terminal-sessions.json';

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

    // 5) Budget enforcer — push initial status to webview; wire pause/
    //    unpause callbacks to the scheduler so polling stops when budget
    //    is exceeded and resumes when the user unpauses.
    this.broadcast({ type: 'budgetStatus', ...budgetEnforcer.getStatus() });
    budgetEnforcer.setOnPaused(() => autoScheduler.pause());
    budgetEnforcer.setOnUnpaused(() => autoScheduler.resume());

    // 6) Circuit breaker — broadcast on state transitions. Also push the
    //    current status of ALL circuits on startup so the webview knows about
    //    any circuits that were already open from a previous session (#36).
    circuitBreaker.on('opened', (status: any) => {
      this.broadcast({ type: 'circuitStatus', ...status });
    });
    circuitBreaker.on('closed', (status: any) => {
      this.broadcast({ type: 'circuitStatus', ...status });
    });
    circuitBreaker.on('halfOpen', (status: any) => {
      this.broadcast({ type: 'circuitStatus', ...status });
    });
    for (const status of circuitBreaker.listAll()) {
      this.broadcast({ type: 'circuitStatus', ...status });
    }

    // 7) Goal decomposer — broadcast on events
    goalDecomposer.on('submitted', (g) => this.broadcast({ type: 'goalSubmitted', goal: g }));
    goalDecomposer.on('readyForReview', (g) => this.broadcast({ type: 'goalReadyForReview', goal: g }));
    goalDecomposer.on('reviewed', (g) => this.broadcast({ type: 'goalReviewed', goal: g }));
    goalDecomposer.on('dispatched', (payload) => this.broadcast({ type: 'goalDispatched', ...payload }));

    // 8) Wire the AutoScheduler story runner to actually execute stories.
    //    When auto-advance is enabled, each ready-for-dev story picked up
    //    by the scheduler is handed to the KanbanOrchestrator for the full
    //    implement→review→done loop. When auto-advance is off, stories are
    //    skipped (the user moves cards manually).
    autoScheduler.setRunner(async (storyId: string): Promise<boolean> => {
      if (!this.store) return false;
      const found = this.store.findArtifactById(storyId);
      if (!found || !isKanbanAutoAdvanceEnabled()) return false;

      // Guard: circuit breaker must allow this workflow type
      const devWf = 'aac-kanban-dev-executor';
      if (!circuitBreaker.canRun(devWf)) {
        logger.warn(`[Autonomy] Circuit open for ${devWf} — skipping ${storyId}`);
        return false;
      }

      // Guard: budget must not be exceeded
      if (!budgetEnforcer.canStart(storyId)) {
        logger.warn(`[Autonomy] Budget exceeded — skipping ${storyId}`);
        return false;
      }

      try {
        const ctx: OrchestratorContext = {};
        const result = await kanbanOrchestrator.runAutonomous(found.artifact, ctx);
        return result.ok;
      } catch (err) {
        logger.error(`[Autonomy] Scheduler runner failed for ${storyId}: ${errMsg(err)}`);
        return false;
      }
    });

    // 9) Wire Goal Decomposer hooks so the toolbar "Submit Goal" flow
    //    actually works end-to-end.
    this.wireGoalDecomposerHooks();

    // 10) Auto-resume on dependency completion. The ArtifactStore change
    //    event now passes actual change deltas and story data so blocked
    //    stories auto-transition to ready-for-dev when their blockers complete.
    //    #44: debounced at 300ms to avoid O(n) rebuilds on rapid changes.
    if (this.store) {
      let depDebounceTimer: ReturnType<typeof setTimeout> | null = null;
      this.artifactChangeUnsub = this.store.onDidChangeArtifacts(() => {
        if (depDebounceTimer) clearTimeout(depDebounceTimer);
        depDebounceTimer = setTimeout(() => {
          depDebounceTimer = null;
          const { changes, stories } = this.extractDependencyData();
          dependencyAutoResume.onArtifactChanges(changes, stories).catch(err => {
            logger.debug('Auto-resume failed', { error: errMsg(err) });
          });
          // Recompute Blocked-by-N badges and push to the webview.
          this.pushDependencyBadges();
        }, 300);
      });
    }

    // Push initial dependency badges so the kanban renders with up-to-date
    // "Blocked by N" badges right after activation.
    this.pushDependencyBadges();

    // 11) Recover orphaned terminal sessions. The scanner now checks both
    //     in-memory terminals AND persisted session metadata so sessions
    //     survive VS Code restarts.
    terminalSessionRecovery.setScanner({
      findOrphans: () => this.scanOrphanedTerminalSessions(),
    });
    terminalSessionRecovery.setReconnector({
      reconnect: async (orphan) => {
        // Issue #33: actually re-attach to the terminal by matching name.
        // Scan all open VS Code terminals for one whose name matches the
        // orphaned session's name ("AAC: {workflowId} {artifactId}").
        try {
          const terminals = vscode.window.terminals;
          const matchName = orphan.name;
          const terminal = terminals.find(t => t.name === matchName);
          if (!terminal) {
            logger.warn(`[Autonomy] No matching terminal found for reconnection: ${matchName}`);
            return false;
          }

          // Check that the terminal's processId is still alive
          const pid = await terminal.processId;
          if (pid === undefined) {
            logger.warn(`[Autonomy] Terminal process dead for: ${matchName}`);
            return false;
          }

          // Re-attach onDidWriteData listener by re-creating the terminal
          // session entry. The existing terminal is alive — we just need
          // to re-register it with the terminalExecutor.
          logger.info(`[Autonomy] Reconnected to terminal: ${matchName} (pid: ${pid})`);

          // Register health checks for the reconnected session
          const adapter = {
            isAlive: () => true,
            getLastOutputTime: () => Date.now(),
          };
          const { createTerminalHealthChecks } = require('./terminal-health-checks');
          for (const check of createTerminalHealthChecks(adapter, { lastModified: Date.now(), getLastModifiedTime: () => Date.now() })) {
            agentHealthMonitor.registerCheck(orphan.sessionId, check);
          }

          return true;
        } catch (err) {
          logger.warn(`[Autonomy] Reconnection failed for ${orphan.name}: ${errMsg(err)}`);
          return false;
        }
      },
    });
    terminalSessionRecovery.setInterruptedReporter((artifactId, reason) => {
      this.broadcast({ type: 'agentStateUpdated', artifactId, agentState: { status: 'interrupted', interruptionReason: reason } });
    });
    terminalSessionRecovery.recoverOnActivation().catch(err => {
      logger.warn('Terminal recovery failed', { error: String(err) });
    });

    // 12) Auto-retry engine — configure defaults. The KanbanOrchestrator's
    //     runStep now wraps workflow execution in autoRetryEngine.run() so
    //     transient failures are retried with exponential backoff.
    autoRetryEngine.setConfig({ maxRetries: 3, initialDelayMs: 1_000, backoffMultiplier: 2 });

    // 13) Autonomous Git — configure hooks that broadcast branch/commit/PR
    //     events to the webview. The git runner is injected by extension.ts
    //     via hooks.gitRunner. The KanbanOrchestrator now calls maybeBranch(),
    //     maybeCommit(), and maybePR() during autonomous runs.
    autonomousGit.setConfig({ autoBranch: true, autoCommit: true, autoPR: false });
    if (this.hooks.gitRunner) autonomousGit.setRunner(this.hooks.gitRunner);
    autonomousGit.setHooks({
      onBranch: (storyId, branchName) => this.broadcast({ type: 'gitBranch', storyId, branchName }),
      onCommit: (storyId, sha) => this.broadcast({ type: 'gitCommit', storyId, sha }),
      onPR:     (storyId, url) => this.broadcast({ type: 'gitPR', storyId, url }),
    });

    // 14) Cost tracker — wire log path into the output folder. Subscribe to
    //     cost-recorded events so the budget status is refreshed in the
    //     webview after every LLM call (regardless of output folder config).
    if (this.hooks?.outputFolder) {
      costTracker.setLogPath(path.join(this.hooks.outputFolder, 'cost-tracking.jsonl'));
    }
    costTracker.setOnCostRecorded(() => {
      this.broadcast({ type: 'budgetStatus', ...budgetEnforcer.getStatus() });
    });

    // 15) Concurrency queue persistence — restore on activation, auto-save
    //     on every lock change.
    this.concurrencyPersistence = new ConcurrencyQueuePersistence(
      path.join(this.hooks.outputFolder, 'concurrency-queue-state.json'),
    );
    this.concurrencyPersistence.restore();
    setupConcurrencyAutoSave(this.concurrencyPersistence);

    // 16) Cross-artifact harness pattern detector — subscribe to harness
    //     engine findings, accumulate them (capped sliding window), and
    //     broadcast systemic patterns to the webview when the same policy
    //     fails on ≥3 artifacts. #43: Restore persisted findings on startup.
    crossArtifactHarnessDetector.setThreshold(3);
    this.restoreHarnessFindings();
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
    // #43: Persist accumulated harness findings before clearing.
    this.persistHarnessFindings();
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
    autoScheduler.setStories(stories as SchedulerStory[]);
  }

  /**
   * Wire the goal decomposer hooks so the toolbar "Submit Goal" flow works.
   * decompose: uses VS Code LM API to break the goal into proposed stories.
   * persistStory: creates a story in the artifact store.
   * notifyScheduler: adds the story ID to the scheduler's story list.
   */
  private wireGoalDecomposerHooks(): void {
    if (!this.store) return;
    const store = this.store;

    goalDecomposer.setHooks({
      decompose: async (goal: string): Promise<ProposedStory[]> => {
        try {
          const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
          // Fallback: accept any available model
          const available = models?.length ? models : await vscode.lm.selectChatModels({});
          if (!available?.length) {
            logger.warn('[Autonomy] No LM available for goal decomposition');
            this.broadcast({
              type: 'goalSubmitError',
              error: 'No language model available. Goal decomposed into a single story — review and refine manually.',
            });
            return [{
              id: `proposed-${Date.now()}-1`,
              title: goal.slice(0, 80),
              description: 'LLM not available — please refine manually.',
            }];
          }

          const lm = available[0];
          const messages = [
            vscode.LanguageModelChatMessage.User(
              `Break this high-level goal into 2-5 concrete, actionable user stories. ` +
              `Return ONLY a JSON array of objects with keys: id, title, description, priority. ` +
              `No explanation, no markdown, no code fences.\n\nGoal: ${goal}`
            ),
          ];
          const response = await lm.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
          let text = '';
          for await (const chunk of response.text) { text += chunk; }

          const match = text.match(/\[[\s\S]*\]/);
          if (match) {
            const parsed = JSON.parse(match[0]) as ProposedStory[];
            return parsed.slice(0, 5).map((s, i) => ({
              id: s.id || `proposed-${Date.now()}-${i + 1}`,
              title: s.title || `Story ${i + 1}`,
              description: s.description,
              priority: s.priority,
            }));
          }
        } catch (err) {
          logger.warn(`[Autonomy] Goal decomposition failed: ${errMsg(err)}`);
        }
        // Fallback: single story with the goal as title (#25)
        this.broadcast({
          type: 'goalSubmitError',
          error: 'Goal decomposition failed — returning a single story placeholder. Review and refine manually.',
        });
        return [{
          id: `proposed-${Date.now()}-1`,
          title: goal.slice(0, 80),
          description: 'Auto-generated from goal. Refine as needed.',
        }];
      },

      persistStory: async (story: ProposedStory): Promise<string> => {
        const created = store.createStory(undefined);
        await store.updateArtifact('story', created.id, {
          title: story.title,
          description: story.description || '',
          metadata: { priority: story.priority },
        });
        return created.id;
      },

      notifyScheduler: (storyId: string) => {
        // Re-seed the scheduler with the fresh story universe
        const stories = autoScheduler.getStories();
        stories.push({
          id: storyId,
          status: 'ready-for-dev',
          priority: 'should-have',
        } as SchedulerStory);
        autoScheduler.setStories(stories);
        this.broadcast({
          type: 'goalStoryPersisted',
          storyId,
          status: 'ready-for-dev',
        });
      },
    });
  }

  /**
   * Extract artifact changes and story references from the live store.
   * Used by dependency auto-resume to detect blocker completions.
   */
  private extractDependencyData(): {
    changes: Array<{ artifactId: string; toStatus?: string }>;
    stories: StoryRef[];
  } {
    if (!this.store) return { changes: [], stories: [] };
    try {
      const state = this.store.getState();
      const epics = (state?.epics ?? []) as Array<any>;
      const stories: StoryRef[] = [];
      const changes: Array<{ artifactId: string; toStatus?: string }> = [];

      for (const epic of epics) {
        for (const story of (epic.stories ?? [])) {
          stories.push({
            id: story.id,
            dependencies: story.dependencies,
          });
          changes.push({
            artifactId: story.id,
            toStatus: story.status,
          });
        }
      }
      return { changes, stories };
    } catch {
      return { changes: [], stories: [] };
    }
  }

  /**
   * Scan for orphaned terminal sessions from both in-memory terminals and
   * persisted metadata. Sessions survive VS Code restarts via the persisted
   * file so recovery can mark them as interrupted.
   */
  private async scanOrphanedTerminalSessions(): Promise<Array<{
    sessionId: string;
    artifactId: string;
    pid?: number;
    name: string;
    startedAt: number;
  }>> {
    // 1) In-memory terminals (still active in this session)
    const live = terminalExecutor.findOrphanedSessions();

    // 2) Persisted sessions from disk (from a prior VS Code session)
    const persisted = this.loadPersistedTerminalSessions();

    // Merge: live sessions take priority; persisted sessions only added if
    // they aren't already in the live list.
    const liveIds = new Set(live.map(s => s.sessionId));
    for (const s of persisted) {
      if (!liveIds.has(s.sessionId)) {
        live.push(s);
      }
    }

    return live;
  }

  /** Persist terminal session metadata to the output folder. */
  private persistTerminalSessions(
    sessions: Array<{ sessionId: string; artifactId: string; pid?: number; name: string; startedAt: number }>,
  ): void {
    if (!this.hooks?.outputFolder) return;
    try {
      const filePath = path.join(this.hooks.outputFolder, TERMINAL_SESSIONS_FILE);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(sessions, null, 2), 'utf-8');
    } catch (err) {
      logger.debug(`Failed to persist terminal sessions: ${errMsg(err)}`);
    }
  }

  /** Load persisted terminal session metadata from the output folder. */
  private loadPersistedTerminalSessions(): Array<{
    sessionId: string;
    artifactId: string;
    pid?: number;
    name: string;
    startedAt: number;
  }> {
    if (!this.hooks?.outputFolder) return [];
    try {
      const filePath = path.join(this.hooks.outputFolder, TERMINAL_SESSIONS_FILE);
      if (!fs.existsSync(filePath)) return [];
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (!Array.isArray(data)) return [];
      return data;
    } catch (err) {
      logger.debug(`Failed to load persisted terminal sessions: ${errMsg(err)}`);
      return [];
    }
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

  // #43: Persist/restore harness findings across restarts.
  private static readonly HARNESS_FINDINGS_FILE = 'harness-findings.json';

  private persistHarnessFindings(): void {
    if (!this.hooks?.outputFolder) return;
    try {
      const filePath = path.join(this.hooks.outputFolder, AutonomyLifecycle.HARNESS_FINDINGS_FILE);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(this.accumulatedFindings, null, 2), 'utf-8');
    } catch (err) {
      logger.debug(`Failed to persist harness findings: ${errMsg(err)}`);
    }
  }

  private restoreHarnessFindings(): void {
    if (!this.hooks?.outputFolder) return;
    try {
      const filePath = path.join(this.hooks.outputFolder, AutonomyLifecycle.HARNESS_FINDINGS_FILE);
      if (!fs.existsSync(filePath)) return;
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(data)) {
        this.accumulatedFindings = data;
        logger.info('Restored harness findings', { count: data.length });
      }
    } catch (err) {
      logger.debug(`Failed to restore harness findings: ${errMsg(err)}`);
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
