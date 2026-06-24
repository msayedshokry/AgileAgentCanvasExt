// ─── Visual Plan Service ─────────────────────────────────────────────────────
// Singleton EventEmitter service: generate / get / list / comment / approve /
// requestChanges. Mirrors the GoalDecomposer pattern (goal-decomposer.ts).

import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';
import { visualPlanStore } from '../state/visual-plan-store';
import type {
  VisualPlan,
  VisualPlanGenerateRequest,
  VisualPlanHooks,
  PlanTask,
} from '../types/visual-plan';

const logger = createLogger('visual-plan-service');

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function now(): number {
  return Date.now();
}

// ── Service ──────────────────────────────────────────────────────────────────

export class VisualPlanService extends EventEmitter {
  private hooks: VisualPlanHooks | null = null;

  setHooks(hooks: VisualPlanHooks): void {
    this.hooks = hooks;
  }

  /** Generate a new VisualPlan by calling the AI provider. */
  async generate(request: VisualPlanGenerateRequest): Promise<string> {
    if (!this.hooks) throw new Error('VisualPlan hooks not set');

    const id = generateId();
    const plan: VisualPlan = {
      id,
      title: request.goal.slice(0, 80),
      goal: request.goal,
      status: 'generating',
      createdAt: now(),
      updatedAt: now(),
      sourceArtifactId: request.sourceArtifactId,
      sections: [],
      comments: [],
    };

    // Persist in generating state so the webview can show a spinner
    await visualPlanStore.save(plan);
    logger.info('VisualPlan generation started', { id, goalLength: request.goal.length });

    try {
      const generated = await this.hooks.generate(request);
      // Merge generated fields into the stub plan
      plan.title = generated.title || plan.title;
      plan.sections = generated.sections || [];
      plan.targets = generated.targets;
      plan.status = 'pending';
      plan.updatedAt = now();
      await visualPlanStore.save(plan);

      this.emit('ready', plan);
      logger.info('VisualPlan generated', { id, sections: plan.sections.length });
    } catch (err) {
      plan.status = 'failed';
      plan.updatedAt = now();
      await visualPlanStore.save(plan);
      this.emit('failed', plan, String(err));
      logger.warn('VisualPlan generation failed', { id, error: String(err) });
    }

    return id;
  }

  get(id: string): VisualPlan | undefined {
    return visualPlanStore.get(id);
  }

  list(): VisualPlan[] {
    return visualPlanStore.list();
  }

  /** Add a comment to a plan section. */
  async addComment(
    planId: string,
    sectionId: string,
    body: string,
    author?: string
  ): Promise<VisualPlan> {
    const plan = visualPlanStore.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    const comment = {
      id: `comment-${now()}-${Math.random().toString(36).slice(2, 6)}`,
      sectionId,
      body,
      author,
      createdAt: now(),
    };
    plan.comments.push(comment);
    plan.updatedAt = now();
    await visualPlanStore.save(plan);
    logger.info('Comment added to plan', { planId, sectionId });
    return plan;
  }

  /** Request changes — sets status to changes-requested. */
  async requestChanges(
    planId: string,
    changes: { sectionId: string; body: string }[]
  ): Promise<VisualPlan> {
    const plan = visualPlanStore.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.status !== 'pending' && plan.status !== 'changes-requested') {
      throw new Error(`Plan not in reviewable state: ${plan.status}`);
    }

    for (const c of changes) {
      plan.comments.push({
        id: `change-${now()}-${Math.random().toString(36).slice(2, 6)}`,
        sectionId: c.sectionId,
        body: c.body,
        createdAt: now(),
      });
    }
    plan.status = 'changes-requested';
    plan.updatedAt = now();
    await visualPlanStore.save(plan);
    this.emit('changesRequested', plan);
    logger.info('Changes requested on plan', { planId, changeCount: changes.length });
    return plan;
  }

  /** Approve selected tasks and dispatch them. */
  async approve(planId: string, taskIds: string[]): Promise<string[]> {
    const plan = visualPlanStore.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.status !== 'pending' && plan.status !== 'changes-requested') {
      throw new Error(`Plan not in reviewable state: ${plan.status}`);
    }
    if (!this.hooks) throw new Error('VisualPlan hooks not set');

    const taskSection = plan.sections.find(
      (s): s is { id: string; kind: 'tasks'; tasks: PlanTask[] } => s.kind === 'tasks'
    );
    const approvedSet = new Set(taskIds);
    const tasksToApprove = taskSection
      ? taskSection.tasks.filter((t) => approvedSet.has(t.id))
      : [];

    const persistedIds: string[] = [];
    for (const task of tasksToApprove) {
      try {
        const id = await this.hooks.persistTask(task, planId);
        persistedIds.push(id);
        if (this.hooks.notifyScheduler) this.hooks.notifyScheduler(id);
      } catch (err) {
        logger.warn('Failed to persist task', { taskId: task.id, error: String(err) });
      }
    }

    plan.status = persistedIds.length > 0 ? 'dispatched' : 'approved';
    plan.updatedAt = now();
    await visualPlanStore.save(plan);
    this.emit('dispatched', { plan, persistedIds });
    logger.info('Plan dispatched', { planId, dispatchedCount: persistedIds.length });
    return persistedIds;
  }
}

export const visualPlanService = new VisualPlanService();
