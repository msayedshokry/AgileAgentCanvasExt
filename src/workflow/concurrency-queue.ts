import { createLogger } from '../utils/logger';
const logger = createLogger('concurrency-queue');

export interface LockEntry {
  artifactId: string;
  agentName: string;
  lockedAt: Date;
  acquiredBy: string; // session/request ID
}

interface QueuedRequest {
  requestId: string;
  agentName: string;
  resolve: (entry: LockEntry) => void;
  reject: (err: Error) => void;
}

export class ConcurrencyQueue {
  private locks = new Map<string, LockEntry>();
  private queue = new Map<string, QueuedRequest[]>();

  tryAcquire(artifactId: string, agentName: string, requestId: string): LockEntry | null {
    if (this.locks.has(artifactId)) return null;
    const entry: LockEntry = { artifactId, agentName, lockedAt: new Date(), acquiredBy: requestId };
    this.locks.set(artifactId, entry);
    logger.debug('Lock acquired', { artifactId, agentName, requestId });
    return entry;
  }

  async acquire(
    artifactId: string,
    agentName: string,
    requestId: string,
    timeoutMs = 30000
  ): Promise<LockEntry> {
    const existing = this.tryAcquire(artifactId, agentName, requestId);
    if (existing) return existing;

    return new Promise((resolve, reject) => {
      if (!this.queue.has(artifactId)) {
        this.queue.set(artifactId, []);
      }
      this.queue.get(artifactId)!.push({ requestId, agentName, resolve, reject });

      setTimeout(() => {
        const waiting = this.queue.get(artifactId) || [];
        const idx = waiting.findIndex(w => w.requestId === requestId);
        if (idx >= 0) waiting.splice(idx, 1);
        reject(new Error(`Timeout waiting for lock on ${artifactId} after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  release(artifactId: string): void {
    this.locks.delete(artifactId);
    logger.debug('Lock released', { artifactId });

    const waiting = this.queue.get(artifactId);
    if (!waiting?.length) {
      this.queue.delete(artifactId);
      return;
    }

    // Grant lock to next waiter (FIFO)
    while (waiting.length > 0) {
      const next = waiting.shift()!;
      const entry = this.tryAcquire(artifactId, next.agentName, next.requestId);
      if (entry) {
        next.resolve(entry);
        break;
      }
      next.reject(new Error('Lock acquisition failed after release'));
    }

    if (waiting.length === 0) {
      this.queue.delete(artifactId);
    }
  }

  isLocked(artifactId: string): boolean {
    return this.locks.has(artifactId);
  }

  getLock(artifactId: string): LockEntry | undefined {
    return this.locks.get(artifactId);
  }

  releaseByRequestId(requestId: string): void {
    for (const [artifactId, entry] of this.locks.entries()) {
      if (entry.acquiredBy === requestId) {
        this.release(artifactId);
      }
    }
  }

  /** List all currently held lock entries (for debugging). */
  listLocks(): LockEntry[] {
    return Array.from(this.locks.values());
  }

  /** Release all locks — used to recover from stale locks after killed terminals. */
  releaseAll(): void {
    const artifactIds = Array.from(this.locks.keys());
    for (const id of artifactIds) {
      this.release(id);
    }
    this.queue.clear();
    logger.info(`[ConcurrencyQueue] Released all ${artifactIds.length} stale lock(s)`);
  }
}

export const concurrencyQueue = new ConcurrencyQueue();
