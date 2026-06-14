// ─── Goal-to-Stories Decomposer ───────────────────────────────────────────────
// Accepts high-level goals via the Kanban toolbar, queues them for review, and
// (after approval) feeds them to the AutoScheduler for execution.
//
// Issue: #19 — Goal-to-Stories Decomposer

import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';

const logger = createLogger('goal-decomposer');

// ── Types ────────────────────────────────────────────────────────────────────

export type GoalStatus = 'pending' | 'decomposing' | 'review' | 'approved' | 'rejected' | 'dispatched';

export interface ProposedStory {
  id: string;
  title: string;
  description?: string;
  priority?: string;
  /** Files/artifacts this story would touch. */
  scope?: string[];
  /** Set when the user rejects. */
  rejectionReason?: string;
}

export interface ProposedGoal {
  id: string;
  goal: string;
  submittedAt: number;
  status: GoalStatus;
  proposedStories: ProposedStory[];
  approvedStories: ProposedStory[];
  rejectedStories: ProposedStory[];
  submittedBy?: string;
}

export interface DecomposerHooks {
  /** Hook to actually decompose the goal into stories. */
  decompose(goal: string): Promise<ProposedStory[]>;
  /** Hook to persist a new approved story as an artifact. */
  persistStory(story: ProposedStory): Promise<string>;
  /** Hook to notify AutoScheduler of a new ready-for-dev story. */
  notifyScheduler?(storyId: string): void;
}

// ── Decomposer ───────────────────────────────────────────────────────────────

export class GoalDecomposer extends EventEmitter {
  private goals = new Map<string, ProposedGoal>();
  private hooks: DecomposerHooks | null = null;
  private idCounter = 0;

  setHooks(hooks: DecomposerHooks): void { this.hooks = hooks; }

  /** Submit a new goal. Returns the goal ID. */
  async submit(goal: string, submittedBy?: string): Promise<string> {
    if (!this.hooks) throw new Error('Decomposer hooks not set');
    const id = `goal-${Date.now()}-${++this.idCounter}`;
    const proposed: ProposedGoal = {
      id,
      goal,
      submittedAt: Date.now(),
      status: 'decomposing',
      proposedStories: [],
      approvedStories: [],
      rejectedStories: [],
      submittedBy,
    };
    this.goals.set(id, proposed);
    this.emit('submitted', proposed);
    logger.info('Goal submitted', { id, goalLength: goal.length });

    try {
      const stories = await this.hooks.decompose(goal);
      proposed.proposedStories = stories;
      proposed.status = 'review';
      this.emit('readyForReview', proposed);
      logger.info('Goal decomposed into stories', { id, count: stories.length });
    } catch (err) {
      proposed.status = 'rejected';
      logger.warn('Goal decomposition failed', { id, error: String(err) });
      this.emit('decompositionFailed', proposed);
    }
    return id;
  }

  /** Approve a subset of proposed stories. Reject the rest. */
  async approveStories(goalId: string, storyIds: string[]): Promise<ProposedGoal> {
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error(`Goal not found: ${goalId}`);
    if (goal.status !== 'review') throw new Error(`Goal not in review state: ${goal.status}`);

    if (!this.hooks) throw new Error('Decomposer hooks not set');
    const approvedSet = new Set(storyIds);
    for (const story of goal.proposedStories) {
      if (approvedSet.has(story.id)) {
        goal.approvedStories.push(story);
      } else {
        story.rejectionReason = 'Not selected during review';
        goal.rejectedStories.push(story);
      }
    }
    goal.status = goal.approvedStories.length > 0 ? 'approved' : 'rejected';
    this.emit('reviewed', goal);
    return goal;
  }

  /** Dispatch approved stories to the artifact store + scheduler. */
  async dispatch(goalId: string): Promise<string[]> {
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error(`Goal not found: ${goalId}`);
    if (goal.status !== 'approved') throw new Error(`Goal not approved: ${goal.status}`);
    if (!this.hooks) throw new Error('Decomposer hooks not set');

    const persistedIds: string[] = [];
    for (const story of goal.approvedStories) {
      try {
        const id = await this.hooks.persistStory(story);
        persistedIds.push(id);
        if (this.hooks.notifyScheduler) this.hooks.notifyScheduler(id);
      } catch (err) {
        logger.warn('Failed to persist story', { storyId: story.id, error: String(err) });
      }
    }
    goal.status = 'dispatched';
    this.emit('dispatched', { goal, persistedIds });
    return persistedIds;
  }

  getGoal(goalId: string): ProposedGoal | undefined {
    return this.goals.get(goalId);
  }

  listGoals(): ProposedGoal[] {
    return Array.from(this.goals.values());
  }
}

export const goalDecomposer = new GoalDecomposer();
