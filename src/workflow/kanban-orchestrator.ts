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
const logger = createLogger('kanban-orchestrator');
import * as vscode from 'vscode';
import type { ArtifactStore } from '../state/artifact-store';
import type { WorkflowExecutor } from './workflow-executor';
import type { BmadModel } from '../chat/ai-provider';
import type { TransitionResult } from './lane-transitions';
import { concurrencyQueue } from './concurrency-queue';
import { getKanbanMaxIterations } from './kanban-settings';
import type { KanbanVerdict, KanbanFixRequest } from './kanban-verdict';
import { circuitBreaker } from './circuit-breaker';
import { budgetEnforcer } from './budget-enforcer';
import { autoRetryEngine } from './auto-retry-engine';
import { autonomousGit } from './autonomous-git';

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface OrchestratorContext {
  model?: BmadModel;
  stream?: vscode.ChatResponseStream;
  token?: vscode.CancellationToken;
}

export interface KanbanProgressEvent {
  artifactId: string;
  agentState: {
    status: 'running' | 'completed' | 'failed' | 'interrupted' | 'idle';
    agentRole?: string;
    workflowId?: string;
  };
}

/**
 * Fired as the orchestrator advances a card. The Agentic Kanban view forwards
 * these to the webview so badges and columns stay live during a long run.
 */
export const kanbanProgress = new vscode.EventEmitter<KanbanProgressEvent>();

const DEV_WORKFLOW = 'aac-kanban-dev-executor';
const REVIEW_WORKFLOW = 'aac-kanban-review-guard';

export class KanbanOrchestrator {
  constructor(
    private store: ArtifactStore,
    private executor: WorkflowExecutor
  ) {}

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

    if (concurrencyQueue.isLocked(id)) {
      return { ok: false, status: 'blocked', blockedBy: ['Artifact is already being processed'] };
    }
    const lock = concurrencyQueue.tryAcquire(id, 'kanban-orchestrator', `orch-${id}-${Date.now()}`);
    if (!lock) {
      return { ok: false, status: 'blocked', blockedBy: ['Could not acquire concurrency lock'] };
    }

    const maxIter = getKanbanMaxIterations();

    try {
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

      // ── Auto-git: create a branch before dev work ───────────────────────
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? process.cwd();
      await autonomousGit.maybeBranch(id, cwd);

      for (let iter = 1; iter <= maxIter; iter++) {
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

        if (dev.verdict !== 'COMPLETED') {
          return await this.stop(id, `Dev gate returned ${dev.verdict}`, dev);
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

        if (review.verdict === 'APPROVED') {
          await this.setStatus(type, id, 'done');
          this.emit(id, 'completed', 'Reviewer', REVIEW_WORKFLOW);
          logger.info(`[Orchestrator] ${id} APPROVED → done (iteration ${iter})`);

          // ── Auto-git: create PR after approval (maybePR internally
          //     checks config.autoPR and returns null if disabled).
          const title = (artifact?.title as string) || id;
          const body = `Autonomous run completed: ${DEV_WORKFLOW} → ${REVIEW_WORKFLOW} (${iter} iteration(s))`;
          await autonomousGit.maybePR(id, title, body, cwd);

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
      concurrencyQueue.release(id);
    }
  }

  /**
   * Run one workflow step with retry, circuit breaker, and budget guards.
   * Wraps the inner execution in autoRetryEngine so transient failures are
   * retried with exponential backoff. Permanent failures and unknown failures
   * skip retries.
   */
  private async runStepGuarded(
    workflowId: string,
    type: string,
    id: string,
    ctx: OrchestratorContext
  ): Promise<KanbanVerdict> {
    // Resolve artifact from store for executeLaneTransition
    const artifact = this.store.findArtifactById(id)?.artifact ?? { id, type };

    // Closure-captured so autoRetryEngine (WorkFn returns void) can pass
    // the real verdict back out.
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

      // Only call recordSuccess when the workflow actually ran successfully
      const verdict = await this.executor.executeLaneTransition(
        workflowId, artifact, this.store, ctx.model, ctx.stream, ctx.token
      );
      captured = verdict;

      // Record success only for clearly successful verdicts
      if (verdict.verdict === 'COMPLETED' || verdict.verdict === 'APPROVED') {
        circuitBreaker.recordSuccess(workflowId);
      }
    });

    if (retryResult.succeeded && captured) {
      return captured;
    }

    const lastErr = retryResult.attempts.at(-1)?.error;
    circuitBreaker.recordFailure(workflowId, errMsg(lastErr));
    return {
      verdict: 'UNKNOWN',
      summary: `Retries exhausted: ${errMsg(lastErr)}`,
    } as unknown as KanbanVerdict;
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
    await this.store.updateArtifact(type, id, { status });
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
      await this.store.updateArtifact(type, id, { metadata: { fixRequests } } as any);
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
    this.emit(id, 'interrupted');
    try {
      vscode.window.showWarningMessage(
        `Autonomous run stopped for ${id}: ${detail}${diagnosticHint}`
      );
    } catch {
      // window API may be unavailable (e.g. in tests)
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
  executor: WorkflowExecutor
): void {
  kanbanOrchestrator = new KanbanOrchestrator(store, executor);
}
