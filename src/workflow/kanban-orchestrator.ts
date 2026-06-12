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
import { terminalExecutor } from './terminal-executor';
import { getKanbanMaxIterations } from './kanban-settings';
import type { KanbanVerdict, KanbanFixRequest } from './kanban-verdict';

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
      for (let iter = 1; iter <= maxIter; iter++) {
        logger.info(`[Orchestrator] ${id} iteration ${iter}/${maxIter}`);

        // ── 1. DEV: implement + test ──────────────────────────────────────
        await this.setStatus(type, id, 'in-progress');
        this.emit(id, 'running', 'Crafter', DEV_WORKFLOW);
        const dev = await this.runStep(DEV_WORKFLOW, type, id, ctx);

        if (dev.verdict !== 'COMPLETED') {
          return await this.stop(id, `Dev gate returned ${dev.verdict}`, dev);
        }

        // ── 2. REVIEW: verify against acceptance criteria ─────────────────
        await this.setStatus(type, id, 'review');
        this.emit(id, 'running', 'Reviewer', REVIEW_WORKFLOW);
        const review = await this.runStep(REVIEW_WORKFLOW, type, id, ctx);

        if (review.verdict === 'APPROVED') {
          await this.setStatus(type, id, 'done');
          this.emit(id, 'completed', 'Reviewer', REVIEW_WORKFLOW);
          logger.info(`[Orchestrator] ${id} APPROVED → done (iteration ${iter})`);
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
      this.emit(id, 'failed');
      return { ok: false, status: 'blocked', blockedBy: [errMsg(err)] };
    } finally {
      concurrencyQueue.release(id);
    }
  }

  /**
   * Run one workflow step, choosing in-chat (if a Copilot session is available)
   * or the terminal CLI path. Both return a normalized verdict.
   */
  private async runStep(
    workflowId: string,
    type: string,
    id: string,
    ctx: OrchestratorContext
  ): Promise<KanbanVerdict> {
    const artifact = this.store.findArtifactById(id)?.artifact ?? { id, type };

    if (ctx.model && ctx.stream && ctx.token) {
      return await this.executor.executeLaneTransition(
        workflowId, artifact, this.store, ctx.model, ctx.stream, ctx.token
      );
    }

    const skillContent = this.executor.getWorkflowSkillContent(workflowId);
    return await terminalExecutor.executeAndAwaitVerdict(
      workflowId, artifact, this.store, { skillContent }
    );
  }

  private async setStatus(type: string, id: string, status: string): Promise<void> {
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
    logger.warn(`[Orchestrator] ${id} stopped: ${detail}`);
    this.emit(id, 'interrupted');
    try {
      vscode.window.showWarningMessage(`Autonomous run stopped for ${id}: ${detail}`);
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
