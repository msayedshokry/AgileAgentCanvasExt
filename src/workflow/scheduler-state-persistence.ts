// ─── Scheduler State Persistence ──────────────────────────────────────────────
// Serializes AutoScheduler state (enabled/paused/queued story IDs) to a JSON
// file in the output folder. Restores on extension activation.
//
// Issue: #15 — Scheduler State Persistence

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';
import { autoScheduler, SchedulerState, SchedulerStory } from './auto-scheduler';

const logger = createLogger('scheduler-state-persistence');

export interface PersistedSchedulerState {
  version: 1;
  savedAt: number;
  enabled: boolean;
  paused: boolean;
  queue: string[];
  inProgress: string[];
  wipLimit: number;
  pollIntervalMs: number;
}

export class SchedulerStatePersistence {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? '';
  }

  setFilePath(p: string): void {
    this.filePath = p;
  }

  save(): void {
    if (!this.filePath) return;
    const state: PersistedSchedulerState = {
      version: 1,
      savedAt: Date.now(),
      enabled: autoScheduler.isRunning(),
      paused: autoScheduler.getState() === 'paused',
      queue: (autoScheduler as any).stories
        ?.filter((s: SchedulerStory) => s.status === 'ready-for-dev')
        ?.map((s: SchedulerStory) => s.id) ?? [],
      inProgress: autoScheduler.getInProgressIds(),
      wipLimit: (autoScheduler as any).wipLimit ?? 3,
      pollIntervalMs: (autoScheduler as any).pollIntervalMs ?? 5000,
    };
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      logger.warn('Failed to save scheduler state', { error: String(err) });
    }
  }

  /** Restore state from disk. Returns true if restored, false on missing/corrupt. */
  restore(): { restored: boolean; state?: PersistedSchedulerState } {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      return { restored: false };
    }
    let state: PersistedSchedulerState;
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      state = JSON.parse(content) as PersistedSchedulerState;
      if (state.version !== 1) {
        logger.warn('Unsupported scheduler state version', { version: state.version });
        return { restored: false };
      }
    } catch (err) {
      logger.warn('Failed to read scheduler state', { error: String(err) });
      return { restored: false };
    }

    try {
      autoScheduler.setWipLimit(state.wipLimit);
      autoScheduler.setPollIntervalMs(state.pollIntervalMs);
      if (state.paused && state.enabled) {
        autoScheduler.start();
        autoScheduler.pause();
      } else if (state.enabled) {
        autoScheduler.start();
      } else {
        autoScheduler.stop();
      }
      logger.info('Scheduler state restored', { enabled: state.enabled, paused: state.paused, queueLen: state.queue.length });
      return { restored: true, state };
    } catch (err) {
      logger.warn('Failed to apply scheduler state', { error: String(err) });
      return { restored: false };
    }
  }

  clear(): void {
    if (this.filePath && fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }
}

export const schedulerStatePersistence = new SchedulerStatePersistence();
