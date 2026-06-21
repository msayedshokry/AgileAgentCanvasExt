// ─── Scheduler Webview Controls ───────────────────────────────────────────────
// Message types and event emitter for the Pause/Resume/Status UI in the Kanban
// toolbar. The webview sends 'setSchedulerState' and the extension replies with
// 'schedulerState' updates.
//
// Issue: #16 — Scheduler Webview Controls

import { EventEmitter } from 'events';
import { autoScheduler, SchedulerState, type DisplayState } from './auto-scheduler';
import { createLogger } from '../utils/logger';
import { isContinuousModeEnabled, setContinuousMode } from './kanban-settings';

const logger = createLogger('scheduler-webview-controls');

export interface SchedulerStateMessage {
  state: SchedulerState;
  /** P1 #6: User-facing display state for the continuous-mode contract. */
  displayState: DisplayState;
  /** P1 #6: why the scheduler last paused (for tooltip/details). */
  pauseReason?: string;
  nextUp: string | null;
  inProgress: string[];
  enabled: boolean;
  /** Audit gap #50 — stories paused at the user's request (not by budget/circuit). */
  pausedStories: Array<{ id: string; reason?: string; pausedAt: number }>;
  /** P1 #6: whether continuous mode is currently toggled on. */
  continuousMode: boolean;
}

// ── Message types ────────────────────────────────────────────────────────────

export const MSG_SCHEDULER_STATE = 'schedulerState';
export const MSG_SET_SCHEDULER_STATE = 'setSchedulerState';

export type SetSchedulerStatePayload = {
  type: typeof MSG_SET_SCHEDULER_STATE;
  action: 'pause' | 'resume' | 'toggle' | 'stop' | 'pauseStory' | 'resumeStory' | 'setContinuousMode';
  /** Required when action is `pauseStory` / `resumeStory`. */
  artifactId?: string;
  /** Optional reason recorded on the scheduler's pausedStoryIds entry. */
  reason?: string;
  /** P1 #6: value for setContinuousMode action. */
  enabled?: boolean;
};

// ── Controls ─────────────────────────────────────────────────────────────────

export class SchedulerWebviewControls extends EventEmitter {
  private bound = false;

  /** Begin listening to scheduler state changes and push to webview. */
  start(): void {
    if (this.bound) return;
    autoScheduler.on('stateChange', this.rebuildAndEmit);
    autoScheduler.on('started', this.rebuildAndEmit);
    autoScheduler.on('completed', this.rebuildAndEmit);
    autoScheduler.on('queueEmpty', this.rebuildAndEmit);
    // Audit gap #50 — the existing `stateChange` listener already re-broadcasts
    // after every pauseStory/resumeStory (those emit `stateChange` with same
    // from/to), so the webview re-renders ⏸ badges / resume buttons without
    // polling. No extra listener needed.
    this.bound = true;
    logger.info('Scheduler webview controls started');
  }

  stop(): void {
    if (!this.bound) return;
    autoScheduler.off('stateChange', this.rebuildAndEmit);
    autoScheduler.off('started', this.rebuildAndEmit);
    autoScheduler.off('completed', this.rebuildAndEmit);
    autoScheduler.off('queueEmpty', this.rebuildAndEmit);
    this.bound = false;
  }

  /** Handle a setSchedulerState message from the webview. */
  handleSetState(payload: SetSchedulerStatePayload): void {
    switch (payload.action) {
      case 'pause':  autoScheduler.pause(); break;
      case 'resume':
        // resume() only works from 'paused' — if idle, start instead.
        if (autoScheduler.getState() === 'idle') autoScheduler.start();
        else autoScheduler.resume();
        break;
      case 'toggle':
        if (autoScheduler.isRunning()) autoScheduler.pause();
        else if (autoScheduler.getState() === 'idle') autoScheduler.start();
        else autoScheduler.resume();
        break;
      case 'stop':   autoScheduler.stop(); break;
      // P1 #6: toggle continuous mode via VS Code setting.
      // ON → start scheduler if idle/paused; OFF → stop scheduler.
      case 'setContinuousMode': {
        if (typeof payload.enabled === 'boolean') {
          void setContinuousMode(payload.enabled);
          if (payload.enabled) {
            if (autoScheduler.getState() === 'idle') autoScheduler.start();
            else if (autoScheduler.getState() === 'paused') autoScheduler.resume();
          } else {
            autoScheduler.stop();
          }
          this.rebuildAndEmit();
        }
        break;
      }
      // Audit gap #50 — per-story pause/resume.
      case 'pauseStory': {
        if (!payload.artifactId) {
          logger.warn('[scheduler-webview-controls] pauseStory missing artifactId');
          break;
        }
        autoScheduler.pauseStory(payload.artifactId, payload.reason);
        break;
      }
      case 'resumeStory': {
        if (!payload.artifactId) {
          logger.warn('[scheduler-webview-controls] resumeStory missing artifactId');
          break;
        }
        autoScheduler.resumeStory(payload.artifactId);
        break;
      }
    }
  }

  /** Build the current state message for the webview. */
  buildStateMessage(): SchedulerStateMessage {
    const state = autoScheduler.getState();
    const next = autoScheduler.pickNext();
    return {
      state,
      displayState: autoScheduler.getDisplayState(),
      pauseReason: autoScheduler.getPauseReason(),
      nextUp: next?.id ?? null,
      inProgress: autoScheduler.getInProgressIds(),
      enabled: state !== 'idle',
      pausedStories: autoScheduler.getPausedStories(),
      continuousMode: isContinuousModeEnabled(),
    };
  }

  // ── Event handlers ───────────────────────────────────────────────────────

  private rebuildAndEmit = () => this.emit(MSG_SCHEDULER_STATE, this.buildStateMessage());
}

export const schedulerWebviewControls = new SchedulerWebviewControls();
