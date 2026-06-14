// ─── Scheduler Webview Controls ───────────────────────────────────────────────
// Message types and event emitter for the Pause/Resume/Status UI in the Kanban
// toolbar. The webview sends 'setSchedulerState' and the extension replies with
// 'schedulerState' updates.
//
// Issue: #16 — Scheduler Webview Controls

import { EventEmitter } from 'events';
import { autoScheduler, SchedulerState } from './auto-scheduler';
import { createLogger } from '../utils/logger';

const logger = createLogger('scheduler-webview-controls');

export interface SchedulerStateMessage {
  state: SchedulerState;
  nextUp: string | null;
  inProgress: string[];
  enabled: boolean;
}

// ── Message types ────────────────────────────────────────────────────────────

export const MSG_SCHEDULER_STATE = 'schedulerState';
export const MSG_SET_SCHEDULER_STATE = 'setSchedulerState';

export type SetSchedulerStatePayload = {
  type: typeof MSG_SET_SCHEDULER_STATE;
  action: 'pause' | 'resume' | 'toggle' | 'stop';
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
    }
  }

  /** Build the current state message for the webview. */
  buildStateMessage(): SchedulerStateMessage {
    const state = autoScheduler.getState();
    const next = autoScheduler.pickNext();
    return {
      state,
      nextUp: next?.id ?? null,
      inProgress: autoScheduler.getInProgressIds(),
      enabled: state !== 'idle',
    };
  }

  // ── Event handlers ───────────────────────────────────────────────────────

  private rebuildAndEmit = () => this.emit(MSG_SCHEDULER_STATE, this.buildStateMessage());
}

export const schedulerWebviewControls = new SchedulerWebviewControls();
