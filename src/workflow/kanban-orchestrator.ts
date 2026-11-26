// ─── Kanban Orchestrator ────────────────────────────────────────────────────
// Drives a story card autonomously through the agile lanes when auto-advance is
// enabled:
//
//   in-progress ──dev-executor──▶ COMPLETED ──▶ review ──review-guard──▶ APPROVED ──▶ done
//                     │ BLOCKED                       │ NEEDS_FIXES            │ BLOCKED/UNKNOWN
//                     ▼                               ▼                        ▼
//                   stop                  re-implement (loop, capped)        stop
//
// Each step runs the appropriate lane agent (in-chat when a Copilot session is
// available, otherwise via the terminal CLI) and reads its structured verdict.
// On an uncertain verdict (UNKNOWN) the loop STOPS and surfaces to the user —
// it never advances a card on a verdict it cannot read.

import { createLogger } from '../utils/logger';
import type { ArtifactChanges } from '../types';
const logger = createLogger('kanban-orchestrator');
import * as vscode from 'vscode';
import type { ArtifactStore } from '../state/artifact-store';
import type { WorkflowExecutor } from './workflow-executor';
import type { BmadModel } from '../chat/ai-provider';
import type { TransitionResult } from './lane-transitions';
import { concurrencyQueue } from './concurrency-queue';
import { AgentSlots, priorityRank } from './harness/agent-slots';
import { getKanbanMaxIterations, isApprovalCheckpointEnabled } from './kanban-settings';
import { harnessEngine } from '../harness/policy-engine';
import type { KanbanVerdict, KanbanFixRequest, KanbanVerdictKind } from './kanban-verdict';
import { circuitBreaker } from './circuit-breaker';
import { budgetEnforcer } from './budget-enforcer';
import { autoRetryEngine } from './auto-retry-engine';
import { autonomousGit } from './autonomous-git';
import { TerminalExecutor } from './terminal-executor';
import { runViaLanguageModel } from './harness/headless-lm-run';
import { classifyAgentFailure, type AgentFailure } from './harness/agent-failure';
import { decideRetry } from './harness/retry-policy';
import { finishApprovedCard, prepareCardWorkspace, verifyCard } from './harness/card-isolation';
import { verifyFixRequest } from './harness/verify-gate';
import type { CardWorktree } from './harness/card-worktree';
import { agentHealthMonitor } from './agent-health-monitor';
import {
  ChatProgressTracker,
  createChatHealthChecks,
  requireChatPathContext,
} from './terminal-health-checks';

import { errMsg } from '../utils/error';
import { personBlockReason } from './harness/agent-team';

/** A pending approval checkpoint is denied after this long (webview closed, user away). */
export const APPROVAL_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Wrap a `vscode.ChatResponseStream` so that every chunk-emitter also
 * ticks a {@link ChatProgressTracker}. We only proxy the streaming
 * methods that indicate real progress; one-shot config / metadata calls
 * (e.g. `push`, `reference`) don't count as "activity" for stall
 * detection.
 *
 * Exported (not just module-local) so the focused Proxy unit test in
 * `chat-stream-proxy.test.ts` can import the helper directly without
 * touching the full KanbanOrchestrator wiring.
 *
 * Issue: #32 — chat stream stall detection.
 */
export function wrapStreamForProgress(
  stream: vscode.ChatResponseStream,
  tracker: ChatProgressTracker,
): vscode.ChatResponseStream {
  return new Proxy(stream, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== 'function') return original;
      // Methods we treat as "activity" — every chunk they emit means the
      // model is still producing output. Anything else (push, reference,
      // button, etc.) we leave untouched so it doesn't tick falsely.
      // `markdownWithVulnerabilities` is the security-warning variant of
      // `markdown` and counts as real model output (#32 stall review).
      const STREAMING_METHODS: Record<string, true> = {
        markdown: true,
        markdownWithVulnerabilities: true,
        anchor: true,
        filetree: true,
        progress: true,
      };
      if (!STREAMING_METHODS[prop as string]) {
        // Non-streaming pass-through — `original` is already bound to
        // target through Reflect.get, so no extra `.bind(target)` hop.
        // (Reviewer nit: previously returned `original.bind(target)`,
        // which was redundant and added one allocation per call.)
        return original;
      }
      // Streaming method — tick the tracker, then forward. We still
      // forcibly re-bind `target` here in case the underlying method
      // is a getter that re-resolves on access (defensive).
      return (...args: unknown[]) => {
        tracker.markActivity();
        return original.apply(target, args);
      };
    },
  });
}

export interface OrchestratorContext {
  model?: BmadModel;
  stream?: vscode.ChatResponseStream;
  token?: vscode.CancellationToken;
}

export interface KanbanProgressEvent {
  artifactId: string;
  agentState: {
    status: 'running' | 'completed' | 'failed' | 'interrupted' | 'idle' | 'queued';
    agentRole?: string;
    workflowId?: string;
    /** Why the run stopped, in plain words, with the actions that fix it. */
    failure?: AgentFailure;
  };
}

/**
 * Fired as the orchestrator advances a card. The Agentic Kanban view forwards
 * these to the webview so badges and columns stay live during a long run.
 */
export const kanbanProgress = new vscode.EventEmitter<KanbanProgressEvent>();
/** A card has waited AGENT_WAIT_ALERT_MS for its busy agent (raised in the Inbox). */
export const agentWaitAlert = new vscode.EventEmitter<{ artifactId: string; agent: string }>();

const DEV_WORKFLOW = 'aac-kanban-dev-executor';
const REVIEW_WORKFLOW = 'aac-kanban-review-guard';

/** Takes epics owned by the team's lead agent instead of the dev → review loop (views/lead-coordinator.ts). */
export interface LeadHandler {
  owns(artifact: { id?: unknown; type?: unknown }): boolean;
  start(artifact: { id?: unknown; type?: unknown }): Promise<TransitionResult>;
}

// Module state, not instance state: the lead coordinator registers during
// activation, before initializeKanbanOrchestrator() creates the instance.
let leadHandler: LeadHandler | undefined;

export function setLeadHandler(handler: LeadHandler | undefined): void {
  leadHandler = handler;
}

/** The named agent a card runs on, with its capacity (views/lead-coordinator.ts registers it). */
export type AgentResolver = (cardId: string) => { agentId: string; name: string; capacity: number; person?: boolean } | undefined;
let agentResolver: AgentResolver | undefined;
/** Runs per agent, so an agent with capacity 1 works one card at a time (harness/agent-slots.ts). */
export const agentSlots = new AgentSlots();
/** A card waiting this long for its agent raises an Inbox entry. */
export const AGENT_WAIT_ALERT_MS = 30 * 60_000;

export function setAgentResolver(resolver: AgentResolver | undefined): void {
  agentResolver = resolver;
}

export class KanbanOrchestrator {

  // #26: Per-artifact abort controllers for cancel/abort.
  private abortControllers = new Map<string, AbortController>();
  /** Column each active run started from (where a lost run returns the card). */
  private runStartStatus = new Map<string, string>();
  /** Card worktree each active run works in (absent = the workspace itself). */
  private runWorktree = new Map<string, CardWorktree>();

  /**
   * Language-model fallback for machines with no CLI harness: runs the step
   * through executeLaneTransition with a headless stream, cancelled with the run.
   */
  private lmRunnerFor(workflowId: string, artifact: unknown, artifactId: string): () => Promise<KanbanVerdict> {
    return () => runViaLanguageModel(this.executor, workflowId, artifact, this.store, {
      signal: this.abortControllers.get(artifactId)?.signal,
      sessionId: `lm-${workflowId}-${artifactId}-${Date.now()}`,
    });
  }
  // Audit gap #50 — per-story pause resolvers. When pauseStory() is called
  // for a story that's currently mid-flight, the loop awaits the resolve
  // function at the next iteration boundary (does NOT abort, does NOT kill
  // terminal — preserves the in-progress state for resume).
  private pausedResolvers: Map<string, () => void> = new Map();
  // P1 #5: pending approval promisers (resolves to true/false).
  private approvalResolvers: Map<string, (approved: boolean) => void> = new Map();

  constructor(
    private store: ArtifactStore,
    private executor: WorkflowExecutor,
    private terminalExecutor: TerminalExecutor
  ) {}

  /** Signal the autonomous loop to stop for a given artifact. Idempotent.
   *  Kills the running terminal (if any), signals the AbortController, and
   *  releases the concurrency lock. Returns true if an active run was
   *  signalled, false if no run was found.
   *
   *  Gap #46: previously only signalled the AbortController — the terminal
   *  kept running, the lock stayed held, and the verdict file could be
   *  written orphaned. Now we kill the terminal first, then signal. */
  /** Abort every active autonomous run (Stop All Agents). Returns how many were signalled. */
  abortAll(): number {
    let count = 0;
    for (const artifactId of Array.from(this.abortControllers.keys())) {
      if (this.abort(artifactId)) count++;
    }
    return count;
  }

  abort(artifactId: string): boolean {
    // Kill the running terminal so the CLI agent stops immediately.
    // Idempotent — killTerminal is a no-op if no terminal is active.
    this.terminalExecutor.killTerminal(artifactId);
    // P1 #5: resolve any pending approval checkpoint to prevent the
    // autonomous loop from deadlocking (requestApproval Promise hangs
    // while the abort killed the terminal outside the try/catch).
    this.resolveApproval(artifactId, false);
    const ctrl = this.abortControllers.get(artifactId);
    if (ctrl) {
      ctrl.abort();
      this.abortControllers.delete(artifactId);
      logger.info(`[Orchestrator] Abort signalled + terminal killed for ${artifactId}`);
      return true;
    }
    return false;
  }

  // ── Per-story pause/resume (audit gap #50) ───────────────────────────────

  /** Mark a story as paused. If a runAutonomous() loop is currently executing
   *  this artifactId, it will block at the next iteration boundary (terminal
   *  stays alive, lock stays held) until `resumeStory()` is called. */
  pauseStory(artifactId: string, reason?: string): void {
    if (this.pausedResolvers.has(artifactId)) return; // already paused
    // Store a placeholder resolver — replaced with a real Promise.resolve()
    // when the loop reaches the iteration boundary.
    this.pausedResolvers.set(artifactId, () => {
      logger.debug(`[Orchestrator] Pause released for ${artifactId} (placeholder)`);
    });
    logger.info(`[Orchestrator] Pause requested for ${artifactId}`, { reason });
  }

  /** Unpause a story. Resolves the pending loop await (no-op if not paused). */
  resumeStory(artifactId: string): void {
    const resolver = this.pausedResolvers.get(artifactId);
    if (!resolver) return;
    resolver();
    this.pausedResolvers.delete(artifactId);
    logger.info(`[Orchestrator] Resume called for ${artifactId}`);
  }

  /** Per-story query. */
  isStoryPaused(artifactId: string): boolean {
    return this.pausedResolvers.has(artifactId);
  }

  /** Block at the iteration boundary if the story is paused.
   *  Resolves immediately if not paused. The placeholder resolver is replaced
   *  with the real Promise resolver on first entry, so resumeStory() always
   *  unblocks the actual loop await (not a stale placeholder). */
  private async checkPause(artifactId: string): Promise<void> {
    if (!this.pausedResolvers.has(artifactId)) return;
    await new Promise<void>(resolve => {
      // Always store the LATEST resolve so resumeStory() unblocks the
      // loop that's actually awaiting right now.
      this.pausedResolvers.set(artifactId, resolve);
    });
  }

  /**
   * Drive a story autonomously: implement → review → done, re-implementing on
   * NEEDS_FIXES, until APPROVED, BLOCKED/UNKNOWN, or the iteration cap is hit.
   * Owns the concurrency lock for the entire loop.
   */
  async runAutonomous(artifact: any, ctx: OrchestratorContext): Promise<TransitionResult> {
    const id = artifact?.id;
    const type = artifact?.type || 'story';
    if (!id) {
      return { ok: false, status: 'blocked', blockedBy: ['Artifact has no id'] };
    }
    // An epic given to the lead agent is planned and handed out, not implemented.
    if (leadHandler?.owns(artifact)) return leadHandler.start(artifact);
    // A card assigned to a person is theirs to work; the board never starts an agent on it.
    const assignee = agentResolver?.(id);
    if (assignee?.person) return { ok: false, status: 'blocked', blockedBy: [personBlockReason(assignee.name)] };

    if (concurrencyQueue.isLocked(id)) {
      return { ok: false, status: 'blocked', blockedBy: ['Artifact is already being processed'] };
    }
    const lock = concurrencyQueue.tryAcquire(id, 'kanban-orchestrator', `orch-${id}-${Date.now()}`);
    if (!lock) {
      return { ok: false, status: 'blocked', blockedBy: ['Could not acquire concurrency lock'] };
    }

    const maxIter = getKanbanMaxIterations();

    // #26: Create an abort controller so kanban:abandonExecution can stop the loop.
    const ac = new AbortController();
    this.abortControllers.set(id, ac);
    this.runStartStatus.set(id, (artifact?.status as string) || 'ready-for-dev');
    let releaseSlot: (() => void) | undefined;

    try {
      // ── Agent capacity: wait until the card's agent has room ────────────
      const who = assignee;
      if (who) {
        let alert: ReturnType<typeof setTimeout> | undefined;
        try {
          releaseSlot = await agentSlots.acquire(
            { agentId: who.agentId, capacity: who.capacity, cardId: id, rank: priorityRank(artifact?.priority), signal: ac.signal },
            (busy) => {
              this.emit(id, 'queued', `Waiting for ${who.name} (${busy} of ${who.capacity} busy)`);
              alert = setTimeout(() => agentWaitAlert.fire({ artifactId: id, agent: who.name }), AGENT_WAIT_ALERT_MS);
            },
          );
        } catch {
          return await this.stop(id, 'Aborted by user');
        } finally {
          if (alert) clearTimeout(alert);
        }
      }

      // ── Pre-flight guardrails ──────────────────────────────────────────
      // Check circuit breaker before starting — don't waste cycles on a
      // workflow type that's repeatedly failing.
      if (!circuitBreaker.canRun(DEV_WORKFLOW)) {
        return await this.stop(id, `Circuit breaker open for ${DEV_WORKFLOW} — manual reset required`);
      }

      // Check budget before starting — don't start if caps are exceeded.
      if (!budgetEnforcer.canStart(id)) {
        const status = budgetEnforcer.getStatus(id);
        return await this.stop(id, `Budget exceeded: ${status.bannerMessage ?? 'cap hit'}`);
      }

      // ── Isolation: each card works in its own git worktree + branch, so
      //    parallel cards never share files and the user's checkout is never
      //    switched. Falls back to the workspace (legacy auto-branch) without git.
      const workspaceCwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? process.cwd();
      const worktree = await prepareCardWorkspace(id);
      if (worktree) this.runWorktree.set(id, worktree);
      else await autonomousGit.maybeBranch(id, workspaceCwd);
      const cwd = worktree?.path ?? workspaceCwd;

      for (let iter = 1; iter <= maxIter; iter++) {
        // #26: Check abort signal before each iteration.
        if (ac.signal.aborted) {
          return await this.stop(id, 'Aborted by user');
        }

        // Audit gap #50 — pause checkpoint at iteration boundary. The loop
        // blocks here if pauseStory() was called, preserving terminal + lock
        // so resumeStory() picks up exactly where we left off.
        await this.checkPause(id);

        logger.info(`[Orchestrator] ${id} iteration ${iter}/${maxIter}`);

        // ── Guard: re-check circuit before each dev attempt ───────────
        if (!circuitBreaker.canRun(DEV_WORKFLOW)) {
          return await this.stop(id, `Circuit breaker opened during run for ${DEV_WORKFLOW}`);
        }
        if (!budgetEnforcer.canStart(id)) {
          return await this.stop(id, 'Budget exceeded during run');
        }

        // ── 1. DEV: implement + test ──────────────────────────────────
        await this.setStatus(type, id, 'in-progress');
        this.emit(id, 'running', 'Crafter', DEV_WORKFLOW);
        const dev = await this.runStepGuarded(DEV_WORKFLOW, type, id, ctx);
        if (ac.signal.aborted) {
          return await this.stop(id, 'Aborted by user');
        }

        if (dev.verdict !== 'COMPLETED') {
          return await this.stop(id, `Dev gate returned ${dev.verdict}`, dev);
        }

        // ── Verify gate: the project's own tests, not the agent's word ──
        const verify = await verifyCard(cwd, ac.signal);
        if (ac.signal.aborted) {
          return await this.stop(id, 'Aborted by user');
        }
        if (verify && !verify.passed) {
          logger.info(`[Orchestrator] ${id} verification failed (${verify.command}) → re-implement`);
          await this.attachFixRequests(type, id, [verifyFixRequest(verify)]);
          if (iter === maxIter) {
            return await this.stop(id, `Tests still failing after ${maxIter} attempt(s): ${verify.command}`,
              { verdict: 'BLOCKED', summary: verify.tail.slice(-1500) });
          }
          continue;
        }

        // ── Auto-git: commit after successful dev ────────────────────
        await autonomousGit.maybeCommit(id, DEV_WORKFLOW, cwd);

        // ── Guard: re-check circuit before review ────────────────────
        if (!circuitBreaker.canRun(REVIEW_WORKFLOW)) {
          return await this.stop(id, `Circuit breaker open for ${REVIEW_WORKFLOW}`);
        }
        if (!budgetEnforcer.canStart(id)) {
          return await this.stop(id, 'Budget exceeded before review');
        }

        // ── 2. REVIEW: verify against acceptance criteria ─────────────
        await this.setStatus(type, id, 'review');
        this.emit(id, 'running', 'Reviewer', REVIEW_WORKFLOW);
        const review = await this.runStepGuarded(REVIEW_WORKFLOW, type, id, ctx);
        if (ac.signal.aborted) {
          return await this.stop(id, 'Aborted by user');
        }

        if (review.verdict === 'APPROVED') {
          // Bring the card's branch home: merge, or push + PR when configured.
          const wt = this.runWorktree.get(id);
          if (wt) {
            const finished = await finishApprovedCard(wt, (artifact?.title as string) || id);
            if (!finished.ok) {
              return await this.stop(id, finished.message);
            }
            logger.info(`[Orchestrator] ${id}: ${finished.message}`);
            this.runWorktree.delete(id);
          }
          await this.setStatus(type, id, 'done');
          this.emit(id, 'completed', 'Reviewer', REVIEW_WORKFLOW);
          logger.info(`[Orchestrator] ${id} APPROVED → done (iteration ${iter})`);

          // ── Auto-git: create PR after approval (maybePR internally
          //     checks config.autoPR and returns null if disabled).
          const title = (artifact?.title as string) || id;
          const body = `Autonomous run completed: ${DEV_WORKFLOW} → ${REVIEW_WORKFLOW} (${iter} iteration(s))`;
          if (!wt) await autonomousGit.maybePR(id, title, body, cwd);

          return { ok: true, workflowLaunched: true, status: 'complete' };
        }

        if (review.verdict === 'NEEDS_FIXES') {
          await this.attachFixRequests(type, id, review.fixRequests);
          logger.info(`[Orchestrator] ${id} NEEDS_FIXES → re-implement (next iteration)`);
          continue; // loop back to in-progress
        }

        // BLOCKED / UNKNOWN
        return await this.stop(id, `Review gate returned ${review.verdict}`, review);
      }

      return await this.stop(id, `Reached max iterations (${maxIter}) without approval`);
    } catch (err) {
      logger.error(`[Orchestrator] ${id} failed: ${errMsg(err)}`);
      // Record the failure with circuit breaker so repeated failures open the circuit
      circuitBreaker.recordFailure(DEV_WORKFLOW, errMsg(err));
      this.emit(id, 'failed');
      return { ok: false, status: 'blocked', blockedBy: [errMsg(err)] };
    } finally {
      // #26: Clean up the abort controller.
      this.abortControllers.delete(id);
      this.runStartStatus.delete(id);
      this.runWorktree.delete(id);
      // Audit gap #50 — clean up any outstanding pause resolver so a future
      // runAutonomous() for the same artifactId doesn't inherit stale state.
      this.pausedResolvers.delete(id);
      // P1 #5: resolve any pending approval with denied on abort/cancel
      // to prevent deadlock (the finally block can't execute while the
      // Promise is still awaiting, so resolve it now).
      this.resolveApproval(id, false);
      releaseSlot?.();
      concurrencyQueue.release(id);
    }
  }

  /**
   * Run one workflow step with retry, circuit breaker, and budget guards.
   * Wraps the inner execution in autoRetryEngine so transient failures are
   * retried with exponential backoff. Permanent failures and unknown failures
   * skip retries.
   *
   * Chooses the execution path based on context:
   *   - Chat path (ctx.model + ctx.stream present): uses executeLaneTransition
   *     for in-Copilot execution, registers health checks for the session.
   *   - Terminal path (no chat context): uses terminalExecutor.executeAndAwaitVerdict
   *     for headless CLI execution.
   */
  private async runStepGuarded(
    workflowId: string,
    type: string,
    id: string,
    ctx: OrchestratorContext
  ): Promise<KanbanVerdict> {
    const artifact = this.store.findArtifactById(id)?.artifact ?? { id, type };

    // ── Early exit: if circuit is open or budget exceeded, don't enter the
    //    retry loop at all. These conditions won't resolve during backoff.
    if (!circuitBreaker.canRun(workflowId)) {
      return { verdict: 'BLOCKED', summary: `Circuit breaker open for ${workflowId}` };
    }
    if (!budgetEnforcer.canStart(id)) {
      const status = budgetEnforcer.getStatus(id);
      return { verdict: 'BLOCKED', summary: status.bannerMessage ?? `Budget exceeded for ${id}` };
    }

    // P1 #5: approval checkpoint — when the user has opted in, evaluate
    // harness pre-flight policies before proceeding. If blocking failures
    // exist, pause execution and ask the user in-canvas.
    if (isApprovalCheckpointEnabled()) {
      const preFlightResults = await harnessEngine.evaluate(
        { artifactType: type, artifactId: id, artifact },
        'pre-flight',
      );
      const blockingFailures = preFlightResults.filter(
        (r): boolean => !r.passed && r.severity === 'blocking',
      );
      if (blockingFailures.length > 0) {
        const failureSummary = blockingFailures
          .map((r) => `${r.policyId}: ${r.failures.join('; ')}`)
          .join(' | ');
        logger.info(`[Orchestrator] ${id}: approval checkpoint triggered — ${blockingFailures.length} blocking policy failure(s)`);

        // Broadcast to webview and await user response
        const approved = await this.requestApproval(id, workflowId, blockingFailures);
        if (!approved) {
          logger.info(`[Orchestrator] ${id}: user denied approval`);
          return {
            verdict: 'BLOCKED',
            summary: `User denied: ${failureSummary}`,
          };
        }
        logger.info(`[Orchestrator] ${id}: user approved — proceeding despite harness warnings`);
      }
    }

    // Determine execution path: chat (in-Copilot) vs terminal (headless CLI)
    const useChatPath = !!ctx.model && !!ctx.stream;

    let captured: KanbanVerdict | undefined;

    const retryResult = await autoRetryEngine.run(id, async () => {
      // Re-check circuit + budget inside each retry attempt, since
      // backoff delays can be long enough for state to change.
      if (!circuitBreaker.canRun(workflowId)) {
        throw new Error(`Circuit breaker open for ${workflowId}`);
      }
      if (!budgetEnforcer.canStart(id)) {
        throw new Error(`Budget exceeded for ${id}`);
      }

      if (useChatPath) {
        // ── Chat path (in-Copilot) ────────────────────────────────────────
        // Issue #32 reviewer followup: tighten the supplier so `tracker`
        // is required when `model` + `stream` are present. requireChatPathContext
        // throws synchronously if `tracker` is missing; autoRetryEngine.run
        // catches that error and converts it into a UNKNOWN verdict so the
        // orchestrator surfaces it cleanly to the user.
        //
        // Invariant: useChatPath guarantees ctx.model && ctx.stream are
        // both truthy. requireChatPathContext only returns `null` for the
        // terminal-path case (model || stream falsy), which we're not in,
        // so the call either returns a ChatPathContext or throws. The
        // non-null assertion narrows the union for the call sites below.
        const chatInputs = requireChatPathContext(ctx)!;
        const chatSessionId = `chat-${workflowId}-${id}-${Date.now()}`;
        const tracker = chatInputs.tracker;
        const proxiedStream = wrapStreamForProgress(chatInputs.stream, tracker);
        // Register health checks for in-chat agent session (now includes
        // `chat-stream-progress` because a tracker was supplied).
        const chatChecks = createChatHealthChecks(artifact, {}, tracker);
        for (const check of chatChecks) {
          agentHealthMonitor.registerCheck(chatSessionId, check);
        }

        try {
          const verdict = await this.executor.executeLaneTransition(
            workflowId, artifact, this.store, chatInputs.model, proxiedStream, chatInputs.token, chatSessionId
          );
          captured = verdict;
        } finally {
          agentHealthMonitor.deregisterCheck(chatSessionId);
        }
      } else {
        // ── Terminal path (headless CLI) ──────────────────────────────────
        const verdict = await this.terminalExecutor.executeAndAwaitVerdict(
          workflowId, artifact, this.store, { lmRunner: this.lmRunnerFor(workflowId, artifact, id), signal: this.abortControllers.get(id)?.signal, revertStatusOnInterrupt: this.runStartStatus.get(id), cwd: this.runWorktree.get(id)?.path },
        );
        captured = verdict;
      }

      // Record success only for clearly successful verdicts
      if (captured && (captured.verdict === 'COMPLETED' || captured.verdict === 'APPROVED')) {
        circuitBreaker.recordSuccess(workflowId);
      }
    });

    // ── Gap #47: UNKNOWN verdict retry ────────────────────────────────────
    // Placed INSIDE the `retryResult.succeeded` branch so it fires BEFORE
    // `return captured` (the previous placement after the return was dead
    // code — a non-throwing work function with a UNKNOWN result hit the
    // early return and never reached the retry).
    //
    // When the terminal closes without a verdict file (network blip, CLI
    // crash, disk-flush race), executeAndAwaitVerdict returns UNKNOWN.
    // The autoRetryEngine doesn't retry UNKNOWN because the work function
    // didn't throw — the verdict IS the result. We give it ONE more
    // attempt with a fresh terminal before surfacing to the orchestrator,
    // but only when the failure is transient (see retry-policy.ts): a
    // signed-out agent or a spent quota fails the same way again.
    if (retryResult.succeeded && captured) {
      const retry = captured.verdict === 'UNKNOWN'
        ? decideRetry(captured.summary, this.abortControllers.get(id)?.signal.aborted === true)
        : undefined;
      if (retry && !retry.retry) {
        logger.info(`[Orchestrator] ${id}: UNKNOWN verdict not retried — ${retry.reason}`);
      }
      if (retry?.retry && await this.waitBeforeRetry(id, retry.delayMs)) {
        logger.warn(`[Orchestrator] ${id}: UNKNOWN verdict on first attempt — retrying once (${retry.reason})`);
        try {
          if (useChatPath) {
            const chatInputs = requireChatPathContext(ctx)!;
            const retrySessionId = `chat-retry-${workflowId}-${id}-${Date.now()}`;
            const tracker = chatInputs.tracker;
            const proxiedStream = wrapStreamForProgress(chatInputs.stream, tracker);
            const chatChecks = createChatHealthChecks(artifact, {}, tracker);
            for (const check of chatChecks) {
              agentHealthMonitor.registerCheck(retrySessionId, check);
            }
            try {
              captured = await this.executor.executeLaneTransition(
                workflowId, artifact, this.store, chatInputs.model, proxiedStream, chatInputs.token, retrySessionId
              );
            } finally {
              agentHealthMonitor.deregisterCheck(retrySessionId);
            }
          } else {
            captured = await this.terminalExecutor.executeAndAwaitVerdict(
              workflowId, artifact, this.store, { lmRunner: this.lmRunnerFor(workflowId, artifact, id), signal: this.abortControllers.get(id)?.signal, revertStatusOnInterrupt: this.runStartStatus.get(id), cwd: this.runWorktree.get(id)?.path },
            );
          }
          if (captured && (captured.verdict === 'COMPLETED' || captured.verdict === 'APPROVED')) {
            circuitBreaker.recordSuccess(workflowId);
            logger.info(`[Orchestrator] ${id}: UNKNOWN retry succeeded → ${captured.verdict}`);
            return captured;
          }
        } catch (retryErr) {
          logger.warn(`[Orchestrator] ${id}: UNKNOWN retry threw: ${errMsg(retryErr)}`);
        }
      }
      // Repeated "no verdict" runs are an infrastructure failure (CLI not
      // signed in, crashing, ignoring the contract): feed the circuit breaker
      // so the board stops relaunching it. Aborts are not failures.
      if (captured.verdict === 'UNKNOWN' && !this.abortControllers.get(id)?.signal.aborted) {
        circuitBreaker.recordFailure(workflowId, captured.summary ?? 'no verdict');
      }
      return captured;
    }

    const lastErr = retryResult.attempts.at(-1)?.error;
    circuitBreaker.recordFailure(workflowId, errMsg(lastErr));
    return {
      verdict: 'UNKNOWN',
      summary: `Retries exhausted: ${errMsg(lastErr)}`,
    } as unknown as KanbanVerdict;
  }

  /**
   * Wait out a retry delay (rate limit, provider outage). Resolves false when
   * the card's run is aborted meanwhile, so Stop never triggers a retry.
   */
  private waitBeforeRetry(id: string, delayMs: number): Promise<boolean> {
    const signal = this.abortControllers.get(id)?.signal;
    if (signal?.aborted) return Promise.resolve(false);
    if (delayMs <= 0) return Promise.resolve(true);
    logger.info(`[Orchestrator] ${id}: waiting ${Math.round(delayMs / 1000)}s before retrying`);
    return new Promise((resolve) => {
      const onAbort = () => { clearTimeout(timer); resolve(false); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(true); }, delayMs);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  // ── Approval checkpoint (P1 #5) ──────────────────────────────────────────

  /**
   * Broadcast an approval request to the webview and await the user's response.
   * Uses the kanbanProgress emitter to reach the message handler, which
   * broadcasts kanban:approvalNeeded to the webview. The response comes back
   * via kanban:approvalResponse → resolveApproval().
   */
  private async requestApproval(
    id: string,
    workflowId: string,
    failures: Array<{ policyId: string; failures: string[]; severity: string }>,
  ): Promise<boolean> {
    // Clean up any stale resolver from a previous run
    this.approvalResolvers.delete(id);

    // Broadcast to webview via the kanbanProgress emitter
    try {
      kanbanProgress.fire({
        artifactId: id,
        agentState: {
          status: 'interrupted',
          agentRole: 'approval-needed',
          workflowId,
          approvalDetails: {
            workflowId,
            policyFailures: failures.map(f => ({
              policyId: f.policyId,
              failures: f.failures,
            })),
          },
        } as any, // progressive: approvalDetails not yet in KanbanProgressEvent union
      });
    } catch {
      // emitter may be disposed
    }

    return new Promise<boolean>(resolve => {
      const timer = setTimeout(() => {
        if (this.approvalResolvers.get(id) === settle) {
          logger.warn(`[Orchestrator] ${id}: approval request timed out — treating as denied`);
          this.approvalResolvers.delete(id);
          resolve(false);
        }
      }, APPROVAL_TIMEOUT_MS);
      const settle = (approved: boolean) => {
        clearTimeout(timer);
        resolve(approved);
      };
      this.approvalResolvers.set(id, settle);
    });
  }

  /** Resolve a pending approval checkpoint (called by message handler). */
  resolveApproval(artifactId: string, approved: boolean): boolean {
    const resolver = this.approvalResolvers.get(artifactId);
    if (resolver) {
      resolver(approved);
      this.approvalResolvers.delete(artifactId);
      return true;
    }
    return false;
  }

  private async setStatus(type: string, id: string, status: string): Promise<void> {
    // P0 #4 note: this setStatus call is the authoritative column update.
    // It mutates the store, which fires `onDidChangeArtifacts` in the
    // AgenticKanbanViewProvider, which posts `updateArtifacts` to the
    // webview. The webview's `updateArtifacts` handler preserves
    // `agentState` and `lockInfo` from the previous items, so the card
    // moves to the new column WITHOUT losing its running/queued/interrupted
    // badge. The subsequent `kanbanProgress` emit then arrives as
    // `agentStateUpdated` and is a no-op for `status`. There is no race in
    // practice — the store update and the progress event are sequential.
    // Typed: status-only patch on the artifact at runtime (Epic via auto-advance,
    // but `type` is a dynamic string, so widen to the distributive Partial<BmadArtifact>).
    await this.store.updateArtifact(type, id, { status } as ArtifactChanges);
  }

  private async attachFixRequests(
    type: string,
    id: string,
    fixRequests?: KanbanFixRequest[]
  ): Promise<void> {
    if (!fixRequests?.length) return;
    try {
      // Stored under metadata; the story update path lifts metadata fields to
      // the top level, so the next dev run sees `fixRequests` in the artifact.
      // Typed: metadata-only path of BmadArtifactChange (fixRequests envelope).
      // Replaces the prior Record<string, unknown> structural cast with the
      // typed metadata envelope from types/index.ts.
      await this.store.updateArtifact(type, id, { metadata: { fixRequests } } as ArtifactChanges);
    } catch (err) {
      logger.debug(`[Orchestrator] Could not attach fixRequests to ${id}: ${errMsg(err)}`);
    }
  }

  private async stop(
    id: string,
    reason: string,
    verdict?: KanbanVerdict
  ): Promise<TransitionResult> {
    const detail = verdict?.summary ? `${reason} — ${verdict.summary}` : reason;
    // Surface diagnostic info for UNKNOWN verdicts so the user can act on them.
    const diagnosticHint = verdict?.verdict === 'UNKNOWN'
      ? ' (No structured verdict was produced. Check the terminal output or trace for details.)'
      : '';
    logger.warn(`[Orchestrator] ${id} stopped: ${detail}${diagnosticHint}`);

    // ponytail: revert the card to the previous column on UNKNOWN/BLOCKED so
    // the user can re-drag to retry. Without this the card sits silently in
    // in-progress / review with no path forward and no way to recover
    // without abandoning the artifact entirely. NEEDS_FIXES is excluded \u2014
    // the dev loop handles re-implementation via `continue`.
    let revertMessage = '';
    const nonSuccessVerdicts: KanbanVerdictKind[] = ['UNKNOWN', 'BLOCKED'];
    if (verdict && nonSuccessVerdicts.includes(verdict.verdict)) {
      try {
        const found = this.store.findArtifactById(id);
        const current = found?.artifact?.status as string | undefined;
        const revertTarget =
          // ponytail: orchestrator now sets 'in-review' (schema-canonical
          // value) when advancing to the review gate; older on-disk values
          // may still be the legacy 'review' alias, so revert accepts both.
          current === 'in-review' || current === 'review' ? 'in-progress' :
          current === 'in-progress' ? 'ready-for-dev' :
          null;
        if (revertTarget && current && found) {
          await this.setStatus(found.type, id, revertTarget);
          revertMessage = ` Card reverted to ${revertTarget} \u2014 drag again to retry.`;
          logger.info(`[Orchestrator] ${id} reverted ${current} \u2192 ${revertTarget}`);
        }
      } catch (err) {
        logger.warn(`[Orchestrator] ${id} revert failed: ${errMsg(err)}`);
      }
    }

    // An agent that stopped to ask the user waits for an answer in the Inbox
    // (views/board-protocol.ts); that is not a failure, so no warning popup.
    const questions = verdict?.board?.questions ?? [];
    const failure = questions.length > 0
      ? { kind: 'needs-answer' as const, title: 'Waiting for your answer', detail: questions.map((q) => `- ${q}`).join('\n'), actions: [] }
      : classifyAgentFailure(`${verdict?.summary ?? ''}\n${reason}`);
    try {
      kanbanProgress.fire({ artifactId: id, agentState: { status: 'interrupted', failure } });
    } catch {
      // emitter may be disposed
    }
    if (questions.length === 0) {
      try {
        vscode.window.showWarningMessage(
          `Autonomous run stopped for ${id}: ${detail}${diagnosticHint}${revertMessage}`
        );
      } catch {
        // window API may be unavailable (e.g. in tests)
      }
    }
    return { ok: false, status: 'blocked', blockedBy: [detail] };
  }

  private emit(
    artifactId: string,
    status: KanbanProgressEvent['agentState']['status'],
    agentRole?: string,
    workflowId?: string
  ): void {
    try {
      kanbanProgress.fire({ artifactId, agentState: { status, agentRole, workflowId } });
    } catch {
      // emitter may be disposed
    }
  }
}

// Singleton — initialized in extension.ts after WorkflowExecutor is created.
export let kanbanOrchestrator: KanbanOrchestrator;

export function initializeKanbanOrchestrator(
  store: ArtifactStore,
  executor: WorkflowExecutor,
  terminalExecutor?: TerminalExecutor
): void {
  // Import terminalExecutor lazily if not provided (backward compat for tests)
  if (!terminalExecutor) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- intentional lazy load: avoids a load-order cycle and keeps it off the activation path
    const { terminalExecutor: te } = require('./terminal-executor');
    kanbanOrchestrator = new KanbanOrchestrator(store, executor, te);
  } else {
    kanbanOrchestrator = new KanbanOrchestrator(store, executor, terminalExecutor);
  }
}
