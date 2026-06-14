// ─── Concurrency Queue Persistence ───────────────────────────────────────────
// Serializes ConcurrencyQueue state to disk and restores on extension
// activation. Releases stale locks from invalidated sessions.
//
// Issue: #6 — Concurrency Queue Persistence

import * as fs from 'fs';
import * as path from 'path';
import { concurrencyQueue, LockEntry } from './concurrency-queue';
import { createLogger } from '../utils/logger';

const logger = createLogger('concurrency-queue-persistence');

/** Persisted state schema. */
export interface PersistedQueueState {
  version: 1;
  savedAt: number;
  locks: Array<{
    artifactId: string;
    agentName: string;
    lockedAt: string;
    acquiredBy: string;
  }>;
}

const STALE_LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

export class ConcurrencyQueuePersistence {
  private filePath: string;
  /** Set of session IDs known to be active — used to detect stale locks. */
  private activeSessionIds = new Set<string>();

  constructor(filePath?: string) {
    this.filePath = filePath ?? '';
  }

  setFilePath(filePath: string): void {
    this.filePath = filePath;
  }

  setActiveSessionIds(ids: string[]): void {
    this.activeSessionIds = new Set(ids);
  }

  registerActiveSession(sessionId: string): void {
    this.activeSessionIds.add(sessionId);
  }

  unregisterActiveSession(sessionId: string): void {
    this.activeSessionIds.delete(sessionId);
  }

  /** Serialize the current queue state to disk. */
  save(): void {
    if (!this.filePath) return;
    const locks = concurrencyQueue.listLocks().map(l => ({
      artifactId: l.artifactId,
      agentName: l.agentName,
      lockedAt: l.lockedAt.toISOString(),
      acquiredBy: l.acquiredBy,
    }));
    const state: PersistedQueueState = { version: 1, savedAt: Date.now(), locks };
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      logger.warn('Failed to save queue state', { error: String(err) });
    }
  }

  /**
   * Restore queue state from disk. Detects and releases locks whose
   * `acquiredBy` session is no longer active or which have aged past
   * STALE_LOCK_TIMEOUT_MS.
   */
  restore(): { restored: number; released: number } {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      return { restored: 0, released: 0 };
    }
    let state: PersistedQueueState;
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      state = JSON.parse(content) as PersistedQueueState;
    } catch (err) {
      logger.warn('Failed to read queue state', { error: String(err) });
      return { restored: 0, released: 0 };
    }

    let restored = 0;
    let released = 0;
    const now = Date.now();
    for (const lock of state.locks ?? []) {
      const lockedAtMs = new Date(lock.lockedAt).getTime();
      const isStale = (now - lockedAtMs) > STALE_LOCK_TIMEOUT_MS;
      const sessionDead = lock.acquiredBy && !this.activeSessionIds.has(lock.acquiredBy);

      if (isStale || sessionDead) {
        concurrencyQueue.release(lock.artifactId);
        released++;
        logger.info('Released stale lock on restore', {
          artifactId: lock.artifactId,
          reason: isStale ? 'aged' : 'session-dead',
        });
      } else {
        // Re-acquire the lock to put it back in the queue map
        concurrencyQueue.tryAcquire(lock.artifactId, lock.agentName, lock.acquiredBy);
        restored++;
      }
    }
    logger.info('Queue state restored', { restored, released });
    return { restored, released };
  }

  /** Delete the persistence file (e.g., on uninstall). */
  clear(): void {
    if (this.filePath && fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }
}

// ── Convenience hook to save on every lock change ────────────────────────────

export function setupAutoSave(persistence: ConcurrencyQueuePersistence, debounceMs = 1000): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const trigger = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => persistence.save(), debounceMs);
  };
  // Patch tryAcquire/release to trigger save
  const queue = concurrencyQueue as any;
  const origTry = queue.tryAcquire;
  const origRelease = queue.release;
  queue.tryAcquire = function (id: string, agent: string, req: string) {
    const r = origTry.call(this, id, agent, req);
    if (r) trigger();
    return r;
  };
  queue.release = function (id: string) {
    origRelease.call(this, id);
    trigger();
  };
}
