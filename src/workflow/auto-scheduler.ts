// ─── Auto-Scheduler Core Loop ────────────────────────────────────────────────
// Polls for ready-for-dev stories and picks the highest-priority one when
// WIP capacity exists. Resumes immediately when a story completes.
//
// Issue: #8 — Auto-Scheduler Core Loop

import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';
import { circuitBreaker } from './circuit-breaker';
import { budgetEnforcer } from './budget-enforcer';

const logger = createLogger('auto-scheduler');

// ── Types ────────────────────────────────────────────────────────────────────

export type SchedulerState = 'idle' | 'active' | 'paused';

export interface SchedulerStory {
  id: string;
  status: string;
  priority?: string;
  /** Set to true if this story is currently being executed by the scheduler. */
  inProgress?: boolean;
}

export interface SchedulerEvents {
  stateChange: { from: SchedulerState; to: SchedulerState };
  started: { storyId: string };
  completed: { storyId: string };
  queueEmpty: void;
}

export type StoryRunner = (storyId: string) => Promise<boolean>;

const PRIORITY_ORDER: Record<string, number> = {
  'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3,
  'must-have': 4, 'should-have': 5, 'could-have': 6, "won't-have": 7,
};

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_WIP_LIMIT = 3;

// ── Scheduler ────────────────────────────────────────────────────────────────

export class AutoScheduler extends EventEmitter {
  private state: SchedulerState = 'idle';
  private pollIntervalMs: number;
  private wipLimit: number;
  private stories: SchedulerStory[] = [];
  private runStory: StoryRunner | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inProgressIds = new Set<string>();
  /** Audit gap #50 — per-story pause map. Stories here are skipped by pickNext() and persist across restarts. */
  private pausedStoryIds: Map<string, { reason?: string; pausedAt: number }> = new Map();

  constructor(pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS, wipLimit: number = DEFAULT_WIP_LIMIT) {
    super();
    this.pollIntervalMs = pollIntervalMs;
    this.wipLimit = wipLimit;
  }

  // ── Wiring ──────────────────────────────────────────────────────────────

  setStories(stories: SchedulerStory[]): void {
    this.stories = stories;
  }

  /** Restore in-progress IDs (for state persistence). */
  setInProgressIds(ids: string[]): void {
    this.inProgressIds = new Set(ids);
  }

  // ── Per-story pause/resume (audit gap #50) ───────────────────────────────

  /** Mark a story as paused. The scheduler will skip it during pickNext() until
   *  `resumeStory()` is called. Idempotent. */
  pauseStory(artifactId: string, reason?: string): void {
    this.pausedStoryIds.set(artifactId, { reason, pausedAt: Date.now() });
    logger.info(`AutoScheduler paused story ${artifactId}`, { reason });
    this.emit('stateChange', { from: this.state, to: this.state });
  }

  /** Unpause a story so the scheduler picks it up again on the next tick. Idempotent. */
  resumeStory(artifactId: string): void {
    if (!this.pausedStoryIds.delete(artifactId)) return;
    logger.info(`AutoScheduler resumed story ${artifactId}`);
    this.emit('stateChange', { from: this.state, to: this.state });
    // Tick immediately so the story doesn't wait for the next interval (#50 follow-through).
    if (this.state === 'active') {
      setImmediate(() => this.tick());
    }
  }

  /** Per-story query. */
  isStoryPaused(artifactId: string): boolean {
    return this.pausedStoryIds.has(artifactId);
  }

  /** Snapshot of paused stories with their reason + pausedAt timestamp. */
  getPausedStories(): Array<{ id: string; reason?: string; pausedAt: number }> {
    return Array.from(this.pausedStoryIds, ([id, meta]) => ({ id, ...meta }));
  }

  setRunner(fn: StoryRunner): void {
    this.runStory = fn;
  }

  setWipLimit(n: number): void {
    if (n < 1) throw new Error('WIP limit must be ≥ 1');
    this.wipLimit = n;
  }

  setPollIntervalMs(ms: number): void {
    if (ms < 100) throw new Error('Poll interval must be ≥ 100ms');
    this.pollIntervalMs = ms;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  start(): void {
    if (this.state === 'active') return;
    this.setState('active');
    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
    this.timer.unref?.();
    // Run an immediate tick to pick up work without waiting
    this.tick();
    logger.info('AutoScheduler started', { pollMs: this.pollIntervalMs, wipLimit: this.wipLimit });
  }

  pause(): void {
    if (this.state !== 'active') return;
    this.setState('paused');
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    logger.info('AutoScheduler paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.setState('active');
    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
    this.timer.unref?.();
    // Run an immediate tick to pick up work without waiting (#34)
    this.tick();
    logger.info('AutoScheduler resumed');
  }

  stop(): void {
    if (this.state === 'idle') return;
    this.setState('idle');
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.inProgressIds.clear();
    logger.info('AutoScheduler stopped');
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  getState(): SchedulerState {
    return this.state;
  }

  isRunning(): boolean {
    return this.state === 'active';
  }

  getInProgressIds(): string[] {
    return Array.from(this.inProgressIds);
  }

  /** Get all known stories (for persistence layers). */
  getStories(): SchedulerStory[] {
    return [...this.stories];
  }

  /** Get the current WIP limit. */
  getWipLimit(): number {
    return this.wipLimit;
  }

  /** Get the current polling interval (ms). */
  getPollIntervalMs(): number {
    return this.pollIntervalMs;
  }

  /** Pick the highest-priority ready-for-dev story that isn't in progress or paused. */
  pickNext(): SchedulerStory | null {
    const ready = this.stories
      .filter(s =>
        s.status === 'ready-for-dev'
        && !this.inProgressIds.has(s.id)
        // Audit gap #50 — exclude per-story paused stories.
        && !this.pausedStoryIds.has(s.id)
      )
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority ?? ''] ?? 99;
        const pb = PRIORITY_ORDER[b.priority ?? ''] ?? 99;
        if (pa !== pb) return pa - pb;
        return a.id.localeCompare(b.id);
      });
    return ready[0] ?? null;
  }

  /** Notify the scheduler that a story completed — may immediately pick the next one. */
  async notifyCompletion(storyId: string): Promise<void> {
    this.inProgressIds.delete(storyId);
    this.emit('completed', { storyId });
    // Immediately try to pick the next story
    if (this.state === 'active') await this.tick();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private setState(next: SchedulerState): void {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    this.emit('stateChange', { from: prev, to: next });
  }

  private async tick(): Promise<void> {
    if (this.state !== 'active') return;
    if (this.inProgressIds.size >= this.wipLimit) return;
    if (!this.runStory) return;

    // ── Budget pause check ─────────────────────────────────────────────
    // If the budget enforcer is paused (cap hit), pause the scheduler's
    // timer so it stops polling. The scheduler is resumed when the user
    // calls budgetEnforcer.unpause() (wired in autonomy-lifecycle.ts).
    if (budgetEnforcer.isPaused()) {
      logger.info('Budget enforcer is paused — scheduler tick bailing out');
      this.pause();
      return;
    }

    const next = this.pickNext();
    if (!next) {
      this.emit('queueEmpty');
      return;
    }

    this.inProgressIds.add(next.id);
    // Audit gap #50 — defensive re-check: race-condition guard in case pauseStory was
    // called between pickNext() (above) and the runner dispatch (below). If paused
    // mid-tick, we drop the story so it isn't picked up by the runner this cycle.
    if (this.pausedStoryIds.has(next.id)) {
      logger.debug(`Scheduler: story ${next.id} paused mid-tick — skipping`);
      this.inProgressIds.delete(next.id);
      return;
    }

    // ── Pre-flight guardrails ────────────────────────────────────────────
    // Circuit breaker: skip stories whose workflow type is currently open.
    const devWf = 'aac-kanban-dev-executor';
    if (!circuitBreaker.canRun(devWf)) {
      logger.debug('Scheduler: circuit open — skipping tick', { wf: devWf });
      this.inProgressIds.delete(next.id);
      return;
    }

    // Budget: skip if the daily or per-story cap is exceeded.
    if (!budgetEnforcer.canStart(next.id)) {
      logger.debug('Scheduler: budget exceeded — skipping story', { storyId: next.id });
      this.inProgressIds.delete(next.id);
      return;
    }

    this.emit('started', { storyId: next.id });
    logger.debug('Scheduler starting story', { storyId: next.id, inProgress: this.inProgressIds.size });

    try {
      await this.runStory(next.id);
    } catch (err) {
      logger.warn('Story runner threw', { storyId: next.id, error: String(err) });
    } finally {
      this.inProgressIds.delete(next.id);
      this.emit('completed', { storyId: next.id });
    }

    // Immediately try to pick the next one (in cascading fashion)
    if (this.state === 'active' && this.inProgressIds.size < this.wipLimit) {
      // schedule on next microtask to avoid deep recursion
      setImmediate(() => this.tick());
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const autoScheduler = new AutoScheduler();
