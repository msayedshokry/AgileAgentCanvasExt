// ─── Unit tests: concurrency-queue ────────────────────────────────────────────
// Covers: tryAcquire + release round-trip grants the next waiter (happy path)
// and a second tryAcquire on the same artifact returns null (most common
// error path — contention).

import { describe, it, expect, beforeEach } from 'vitest';
import { ConcurrencyQueue } from './concurrency-queue';

describe('ConcurrencyQueue', () => {
  let q: ConcurrencyQueue;
  beforeEach(() => { q = new ConcurrencyQueue(); });

  it('happy: tryAcquire + release grants the queued waiter the lock (FIFO)', async () => {
    const a = q.tryAcquire('X', 'agent-1', 'req-1');
    expect(a).not.toBeNull();
    expect(q.isLocked('X')).toBe(true);

    // Queue a waiter
    const waiter = q.acquire('X', 'agent-2', 'req-2', 5000);

    // Release the initial lock — waiter should now resolve
    q.release('X');
    const entry = await waiter;
    expect(entry.acquiredBy).toBe('req-2');
    expect(q.isLocked('X')).toBe(true);
    q.release('X');
  });

  it('error: a second tryAcquire on the same artifact returns null (contention)', () => {
    expect(q.tryAcquire('Y', 'a', 'r1')).not.toBeNull();
    expect(q.tryAcquire('Y', 'a', 'r2')).toBeNull();
    expect(q.listLocks()).toHaveLength(1);
  });
});
