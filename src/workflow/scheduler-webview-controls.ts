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
    autoScheduler.on('stateChange', this.onStateChange);
    autoScheduler.on('started', this.onStarted);
    autoScheduler.on('completed', this.onCompleted);
    autoScheduler.on('queueEmpty', this.onQueueEmpty);
    this.bound = true;
    logger.info('Scheduler webview controls started');
  }

  stop(): void {
    if (!this.bound) return;
    autoScheduler.off('stateChange', this.onStateChange);
    autoScheduler.off('started', this.onStarted);
    autoScheduler.off('completed', this.onCompleted);
    autoScheduler.off('queueEmpty', this.onQueueEmpty);
    this.bound = false;
  }

  /** Handle a setSchedulerState message from the webview. */
  handleSetState(payload: SetSchedulerStatePayload): void {
    switch (payload.action) {
      case 'pause':  autoScheduler.pause(); break;
      case 'resume': autoScheduler.resume(); break;
      case 'toggle':
        if (autoScheduler.isRunning()) autoScheduler.pause();
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

  private onStateChange = () => this.emit(MSG_SCHEDULER_STATE, this.buildStateMessage());
  private onStarted = () => this.emit(MSG_SCHEDULER_STATE, this.buildStateMessage());
  private onCompleted = () => this.emit(MSG_SCHEDULER_STATE, this.buildStateMessage());
  private onQueueEmpty = () => this.emit(MSG_SCHEDULER_STATE, this.buildStateMessage());
}

export const schedulerWebviewControls = new SchedulerWebviewControls();
