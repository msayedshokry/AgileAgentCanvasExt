// ─── Lane Transition Engine ─────────────────────────────────────────────────
// Status-based transition rules engine for the Agentic Kanban.
//
// When a card is dragged between columns, this engine:
//   1. Finds the matching transition rule
//   2. Acquires a concurrency lock on the artifact
//   3. Updates the artifact status in the store
//   4. Optionally launches a BMAD workflow (e.g., dev-story, code-review)
//   5. Releases the lock after workflow completes
//
// E4: Pre-flight harness validation (harnessEngine.evaluate)
// E3: Trace recording (traceRecorder.record)

import { createLogger } from '../utils/logger';
const logger = createLogger('lane-transitions');
import * as vscode from 'vscode';
import { ArtifactStore } from '../state/artifact-store';
import { WorkflowExecutor } from './workflow-executor';
import { concurrencyQueue } from './concurrency-queue';
import { BmadModel } from '../chat/ai-provider';
import { harnessEngine } from '../harness/policy-engine';
import { harnessFeedback } from '../harness/harness-feedback';
import { terminalExecutor } from './terminal-executor';
import { getA2AOutboundClient } from '../acp/agent-bus/a2a-outbound-client';
import { isKanbanAutoAdvanceEnabled } from './kanban-settings';
import { kanbanOrchestrator } from './kanban-orchestrator';

// Project-standard error-to-string pattern
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface TransitionRule {
  artifactType: string;
  fromStatus: string;
  toStatus: string;
  /** BMAD workflow ID from WORKFLOW_REGISTRY (e.g., 'dev-story', 'code-review') */
  workflowId?: string | null;
  /** Alternative workflow ID for autonomous/terminal execution (e.g., 'aac-kanban-dev-executor') */
  terminalWorkflowId?: string | null;
  confirmWithUser?: boolean;
  preFlightValidation?: boolean;
  /** Remote A2A agent URL to delegate this transition to.
   *  When set, the transition sends the artifact as an A2A message
   *  to the remote agent and polls for completion instead of launching
   *  a local workflow. Overrides workflowId/terminalWorkflowId.
   *  Example: 'https://my-agent.example.com/agent-card.json' */
  a2aRemoteUrl?: string;
}

export const TRANSITION_RULES: TransitionRule[] = [
  // Backlog → Ready for Dev
  { artifactType: 'story',  fromStatus: 'backlog',       toStatus: 'ready-for-dev', workflowId: 'story-enhancement', confirmWithUser: true },
  { artifactType: 'epic',   fromStatus: 'backlog',       toStatus: 'ready-for-dev', workflowId: 'epic-enhancement', confirmWithUser: true },
  { artifactType: 'prd',    fromStatus: 'draft',         toStatus: 'ready',         workflowId: 'create-prd', confirmWithUser: true },

  // Ready for Dev → In Progress (dev-story for interactive, dev-executor for autonomous terminal)
  { artifactType: 'story',  fromStatus: 'ready-for-dev', toStatus: 'in-progress',   workflowId: 'dev-story', terminalWorkflowId: 'aac-kanban-dev-executor', confirmWithUser: true, preFlightValidation: true },
  { artifactType: 'epic',   fromStatus: 'ready-for-dev', toStatus: 'in-progress',   workflowId: 'sprint-planning', confirmWithUser: true, preFlightValidation: true },

  // In Progress → Review
  { artifactType: 'story',  fromStatus: 'in-progress',   toStatus: 'review',        workflowId: 'code-review', confirmWithUser: true, preFlightValidation: true },

  // Review → Done (review-guard for autonomous terminal only; interactive skips)
  { artifactType: 'story',  fromStatus: 'review',        toStatus: 'done',          workflowId: null, terminalWorkflowId: 'aac-kanban-review-guard', confirmWithUser: false },

  // ── Blocked status transitions ─────────────────────────────────────────
  // Blocked → In Progress (unblock and resume)
  { artifactType: 'story',  fromStatus: 'blocked',       toStatus: 'in-progress',   workflowId: null, confirmWithUser: true },
  { artifactType: 'epic',   fromStatus: 'blocked',       toStatus: 'in-progress',   workflowId: null, confirmWithUser: true },

  // In Progress → Blocked (mark as blocked)
  { artifactType: 'story',  fromStatus: 'in-progress',   toStatus: 'blocked',       workflowId: null, confirmWithUser: true },
  { artifactType: 'epic',   fromStatus: 'in-progress',   toStatus: 'blocked',       workflowId: null, confirmWithUser: true },

  // Ready-for-Dev → Blocked (mark as blocked before starting)
  { artifactType: 'story',  fromStatus: 'ready-for-dev', toStatus: 'blocked',       workflowId: null, confirmWithUser: true },

  // ── Reopen transitions ─────────────────────────────────────────────────
  // Done → Backlog (reopen a completed story)
  { artifactType: 'story',  fromStatus: 'done',          toStatus: 'backlog',       workflowId: null, confirmWithUser: true },
  // Done → In Progress (reopen into active development)
  { artifactType: 'story',  fromStatus: 'done',          toStatus: 'in-progress',   workflowId: null, confirmWithUser: true },

  // Review → Backlog (move back from review without completing)
  { artifactType: 'story',  fromStatus: 'review',        toStatus: 'backlog',       workflowId: null, confirmWithUser: true },
  // Review → In Progress (revert from review to dev)
  { artifactType: 'story',  fromStatus: 'review',        toStatus: 'in-progress',   workflowId: null, confirmWithUser: true },
];

export interface TransitionResult {
  ok: boolean;
  workflowLaunched?: boolean;
  status: 'complete' | 'moved_without_workflow' | 'blocked' | 'terminal_launched' | 'delegated_to_a2a';
  blockedBy?: string[];
  /** Terminal session ID when execution was launched via terminal CLI */
  terminalSessionId?: string;
  /** A2A remote task ID when execution was delegated to a remote agent */
  a2aTaskId?: string;
}

export class LaneTransitionEngine {
  /** Active A2A polling timers (keyed by artifactId) for cleanup on dispose */
  private a2aPollTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Max A2A poll duration (30 minutes default) */
  private readonly A2A_MAX_POLL_MS = 30 * 60 * 1000;
  /** A2A poll interval (15 seconds) */
  private readonly A2A_POLL_INTERVAL_MS = 15_000;

  constructor(private store: ArtifactStore, private executor: WorkflowExecutor) {}

  async handleTransition(
    artifactId: string,
    fromStatus: string,
    toStatus: string,
    artifactType: string,
    model?: BmadModel,
    stream?: vscode.ChatResponseStream,
    token?: vscode.CancellationToken
  ): Promise<TransitionResult> {
    const found = this.store.findArtifactById(artifactId);
    if (!found) {
      return { ok: false, status: 'blocked', blockedBy: ['Artifact not found'] };
    }

    // P1 #13: reject drops where the client's `fromStatus` doesn't match the
    // artifact's actual `status` in the store. A stale or malicious client
    // that passes an old fromStatus would otherwise write a column update
    // that the user didn't intend, because the card has been moved by an
    // agent workflow or another webview since the UI rendered.
    // Use explicit undefined check (not truthiness) so an empty-string or
    // falsy status still validates correctly.
    if ('status' in (found.artifact ?? {}) && found.artifact?.status !== fromStatus) {
      return {
        ok: false,
        status: 'blocked',
        blockedBy: [`Status mismatch: artifact is currently "${found.artifact?.status}", not "${fromStatus}"`],
      };
    }

    const rule = this.findRule(artifactType, fromStatus, toStatus);

    // Pre-flight validation — runs harness policies before allowing the transition
    if (rule?.preFlightValidation) {
      const issues = await harnessEngine.evaluate({
        artifactType, artifactId, artifact: found.artifact
      }, 'pre-flight');
      if (issues.filter(r => !r.passed && r.severity === 'blocking').length > 0) {
        return { ok: false, status: 'blocked', blockedBy: issues.map(i => i.policyId) };
      }
    }

    // ── Autonomous auto-advance ───────────────────────────────────────────
    // When auto-advance is enabled and a story enters In-Progress, hand off to
    // the orchestrator, which drives implement → review → done (re-implementing
    // on NEEDS_FIXES) and manages its own concurrency lock for the whole loop.
    // When auto-advance is OFF this is skipped and the single-shot path below
    // runs — the user then moves the card to the next column manually.
    if (
      isKanbanAutoAdvanceEnabled() &&
      artifactType === 'story' &&
      toStatus === 'in-progress' &&
      kanbanOrchestrator
    ) {
      return await kanbanOrchestrator.runAutonomous(found.artifact, { model, stream, token });
    }

    // Check concurrency
    if (concurrencyQueue.isLocked(artifactId)) {
      return { ok: false, status: 'blocked', blockedBy: ['Artifact is currently being processed by another agent'] };
    }

    // Acquire lock — held for the entire transition + workflow execution
    const lock = concurrencyQueue.tryAcquire(artifactId, 'lane-transition', `transition-${artifactId}-${Date.now()}`);
    if (!lock) {
      return { ok: false, status: 'blocked', blockedBy: ['Could not acquire concurrency lock'] };
    }

    try {
      // Update artifact status
      await this.store.updateArtifact(artifactType, artifactId, { status: toStatus });

      // Auto-launch workflow if rule specifies one.
      // A2A remote delegation takes priority over local workflows.
      if (rule?.workflowId || rule?.terminalWorkflowId || rule?.a2aRemoteUrl) {
        // P1 #8: one-time preference — when `agileagentcanvas.kanbanSkipConfirm`
        // is true OR YOLO mode is on, skip the per-drop confirm modal entirely.
        // The user sets this once and never sees a Run/Skip prompt again.
        const shouldConfirm = rule.confirmWithUser && !this.isYoloMode() && !this.isKanbanSkipConfirm();
        if (shouldConfirm) {
          const label = rule.a2aRemoteUrl
            ? `Remote agent at ${rule.a2aRemoteUrl}`
            : (rule.workflowId || rule.terminalWorkflowId)!;
          const confirmed = await this.promptUser(found.artifact, label);
          if (!confirmed) {
            return { ok: true, workflowLaunched: false, status: 'moved_without_workflow' };
          }
        }

        // ── A2A Remote Delegation Path ─────────────────────────────────
        if (rule?.a2aRemoteUrl) {
          return await this.delegateToRemoteA2A(
            rule.a2aRemoteUrl,
            found.artifact,
            artifactId
          );
        }

        // ── Local Workflow Path ────────────────────────────────────────
        // E2: Launch workflow via executeLaneTransition (chat session) or
        // TerminalExecutor (headless CLI agent) depending on availability.
        //
        // Some transitions only define a terminalWorkflowId (e.g. review→done
        // runs review-guard with no interactive workflowId). Resolve a single
        // id for each path so those autonomous-only rules still fire — the
        // previous `rule.workflowId!` assumption silently dropped them.
        const chatWorkflowId = (rule.workflowId || rule.terminalWorkflowId)!;
        const terminalWorkflowId = (rule.terminalWorkflowId || rule.workflowId)!;
        if (model && stream) {
          // Active Copilot Chat session — execute in-chat with streaming
          await this.executor.executeLaneTransition(
            chatWorkflowId,
            found.artifact,
            this.store,
            model,
            stream,
            token
          );
        } else {
          // No chat session — execute via terminal CLI provider.
          // Lock is released when the terminal closes via callback, NOT here.
          const sessionId = await terminalExecutor.executeTerminalWorkflow(
            terminalWorkflowId,
            found.artifact,
            this.store
          );
          if (sessionId) {
            logger.info(
              `[E2] Launched terminal execution for ${terminalWorkflowId} on ${artifactId} (session: ${sessionId})`
            );
            return { ok: true, workflowLaunched: true, status: 'terminal_launched', terminalSessionId: sessionId };
          } else {
            logger.warn(
              `[E2] Failed to launch terminal execution for ${terminalWorkflowId} on ${artifactId}`
            );
          }
        }
      }

      // ── Continuous governance evaluation ───────────────────────────────
      // After workflow execution, run continuous policies to detect patterns
      // (repeated errors, stuck loops) that need correction.
      if (rule?.workflowId && !rule?.a2aRemoteUrl) {
        try {
          const sessionId = found?.artifact?.sessionId || `harness-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          // evaluate() already calls harnessFeedback.recordEvaluation() internally
          await harnessEngine.evaluate(
            { artifactType, artifactId, artifact: found.artifact, sessionId },
            'continuous'
          );
        } catch (err) {
          // Non-blocking — continuous evaluation is advisory
          logger.debug(`[Harness] Continuous eval failed: ${errMsg(err)}`);
        }
      }

      return { ok: true, workflowLaunched: !!(rule?.workflowId || rule?.terminalWorkflowId || rule?.a2aRemoteUrl), status: 'complete' };
    } catch (error) {
      logger.error('Transition execution failed', { artifactId, error: errMsg(error) });
      return { ok: false, status: 'blocked', blockedBy: [errMsg(error)] };
    } finally {
      // Lock released AFTER workflow completes (or fails).
      // Exception: terminal execution keeps the lock — released by terminal
      // executor when the terminal closes.
      const session = terminalExecutor.getTerminalSession(artifactId);
      if (!session) {
        concurrencyQueue.release(artifactId);
      }
    }
  }

  /**
   * Delegate a transition to a remote A2A agent.
   * Sends the artifact context as a message, returns immediately,
   * and starts background polling to track remote task completion.
   */
  private async delegateToRemoteA2A(
    a2aRemoteUrl: string,
    artifact: any,
    artifactId: string
  ): Promise<TransitionResult> {
    const client = getA2AOutboundClient();
    const artifactType = artifact?.type || 'unknown';

    // Build a message describing the transition and artifact
    const message = this.buildA2AMessage(artifact, artifactId);

    try {
      logger.info(
        `[A2A] Delegating transition for ${artifactId} to ${a2aRemoteUrl}`
      );

      // Send the message to the remote agent
      const task = await client.sendMessage(a2aRemoteUrl, message, {
        artifactId,
        artifactType,
        source: 'agile-agent-canvas-kanban',
      });

      logger.info(
        `[A2A] Remote task created: ${task.id} (state: ${task.status.state})`
      );

      // Store A2A metadata on the artifact so the kanban can show progress
      try {
        await this.store.updateArtifact(artifactType, artifactId, {
          metadata: {
            ...(artifact?.metadata || {}),
            a2aTaskId: task.id,
            a2aStatus: task.status.state,
            a2aRemoteUrl,
            a2aDelegatedAt: new Date().toISOString(),
          },
        } as any);
      } catch (metaErr) {
        logger.debug(
          `[A2A] Could not write A2A metadata to artifact ${artifactId}: ${errMsg(metaErr)}`
        );
      }

      // Start background polling to track remote completion
      this.startA2APolling(
        a2aRemoteUrl,
        task.id,
        artifactId,
        artifactType,
        Date.now()
      );

      return {
        ok: true,
        workflowLaunched: true,
        status: 'delegated_to_a2a',
        a2aTaskId: task.id,
      };
    } catch (error) {
      const msg = errMsg(error);
      logger.error(
        `[A2A] Remote delegation failed for ${artifactId}: ${msg}`
      );
      return {
        ok: false,
        status: 'blocked',
        blockedBy: [`A2A delegation failed: ${msg}`],
      };
    }
  }

  /**
   * Start a background polling loop that periodically checks the status of
   * a remote A2A task. When the task reaches a terminal state, updates the
   * artifact metadata and clears the polling timer.
   *
   * Uses recursive setTimeout (not setInterval) so polling pauses naturally
   * while a network request is in-flight, preventing request pile-up.
   */
  private startA2APolling(
    a2aRemoteUrl: string,
    taskId: string,
    artifactId: string,
    artifactType: string,
    startedAt: number
  ): void {
    // Clear any existing poll timer for this artifact
    this.clearA2APolling(artifactId);

    const poll = async () => {
      const elapsed = Date.now() - startedAt;

      // Stop polling if max duration exceeded
      if (elapsed >= this.A2A_MAX_POLL_MS) {
        logger.warn(
          `[A2A] Polling timed out for task ${taskId} on ${artifactId} after ${elapsed}ms`
        );
        await this.updateA2AArtifactStatus(
          artifactId, artifactType, 'polling_timed_out'
        );
        this.a2aPollTimers.delete(artifactId);
        return;
      }

      try {
        const client = getA2AOutboundClient();
        const task = await client.getTask(a2aRemoteUrl, taskId);
        const state = task.status.state;

        logger.debug(
          `[A2A] Polled task ${taskId}: ${state} (${elapsed}ms elapsed)`
        );

        // Update artifact metadata with latest state
        await this.updateA2AArtifactStatus(artifactId, artifactType, state);

        // Check for terminal state
        const terminal: string[] = [
          'completed', 'failed', 'canceled', 'rejected', 'auth-required',
        ];
        if (terminal.includes(state)) {
          logger.info(
            `[A2A] Remote task ${taskId} reached terminal state: ${state} (${elapsed}ms)`
          );
          this.a2aPollTimers.delete(artifactId);
          // Lock already released by handleTransition's finally block
          return;
        }
      } catch (err) {
        logger.debug(
          `[A2A] Poll attempt failed for task ${taskId}: ${errMsg(err)}`
        );
        // Continue polling — transient errors shouldn't kill the loop
      }

      // Schedule next poll
      const timer = setTimeout(poll, this.A2A_POLL_INTERVAL_MS);
      this.a2aPollTimers.set(artifactId, timer);
    };

    // Start first poll immediately
    const timer = setTimeout(poll, this.A2A_POLL_INTERVAL_MS);
    this.a2aPollTimers.set(artifactId, timer);
  }

  /**
   * Update artifact metadata with the current A2A task state.
   */
  private async updateA2AArtifactStatus(
    artifactId: string,
    artifactType: string,
    a2aState: string
  ): Promise<void> {
    try {
      const found = this.store.findArtifactById(artifactId);
      if (!found) return;

      const existing = found.artifact?.metadata || {};
      await this.store.updateArtifact(artifactType, artifactId, {
        metadata: {
          ...existing,
          a2aStatus: a2aState,
          a2aLastPolledAt: new Date().toISOString(),
        },
      } as any);
    } catch (err) {
      logger.debug(
        `[A2A] Could not update A2A status for ${artifactId}: ${errMsg(err)}`
      );
    }
  }

  /**
   * Cancel background A2A polling for an artifact.
   */
  private clearA2APolling(artifactId: string): void {
    const existing = this.a2aPollTimers.get(artifactId);
    if (existing) {
      clearTimeout(existing);
      this.a2aPollTimers.delete(artifactId);
    }
  }

  /**
   * Cancel all active A2A polling timers. Call on extension deactivation.
   */
  cancelAllA2APolling(): void {
    for (const [artifactId, timer] of this.a2aPollTimers) {
      clearTimeout(timer);
      logger.debug(`[A2A] Cancelled polling for ${artifactId}`);
    }
    this.a2aPollTimers.clear();
  }

  /**
   * Build a text message describing the artifact context for a remote A2A agent.
   */
  private buildA2AMessage(artifact: any, artifactId: string): string {
    const type = artifact?.type || 'unknown';
    const title = artifact?.title || artifact?.id || artifactId;
    const description = artifact?.description || '';

    return [
      `Kanban transition triggered for ${type} "${title}".`,
      '',
      `## Artifact: ${title}`,
      `- Type: ${type}`,
      `- ID: ${artifactId}`,
      description ? `- Description: ${description}` : '',
      '',
      '## Context',
      '```json',
      JSON.stringify(artifact, null, 2),
      '```',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private isYoloMode(): boolean {
    return vscode.workspace.getConfiguration('agileagentcanvas').get('yoloMode', false);
  }

  /** P1 #8: check whether kanban confirm modals should be skipped globally. */
  private isKanbanSkipConfirm(): boolean {
    return vscode.workspace.getConfiguration('agileagentcanvas').get('kanbanSkipConfirm', false);
  }

  private findRule(type: string, from: string, to: string): TransitionRule | undefined {
    return TRANSITION_RULES.find(r =>
      r.artifactType === type && r.fromStatus === from && r.toStatus === to
    );
  }

  private async promptUser(artifact: any, workflowId: string): Promise<boolean> {
    const typeLabel = artifact?.type || 'artifact';
    const idLabel = artifact?.id || '';
    const result = await vscode.window.showInformationMessage(
      `Run "${workflowId}" workflow on ${typeLabel} "${idLabel}"?`,
      { modal: true },
      'Run', 'Skip'
    );
    return result === 'Run';
  }
}

// Singleton instance (initialized in extension.ts after WorkflowExecutor is created)
export let laneTransitionEngine: LaneTransitionEngine;

export function initializeLaneTransitionEngine(store: ArtifactStore, executor: WorkflowExecutor): void {
  laneTransitionEngine = new LaneTransitionEngine(store, executor);
}
