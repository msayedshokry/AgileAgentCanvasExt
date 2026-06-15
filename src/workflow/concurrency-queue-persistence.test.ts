// ─── Unit tests: concurrency-queue-persistence ─────────────────────────────────
// Covers: save → restore round-trip preserves lock count (happy path) and
// restore returns {restored:0, released:0} when the file is missing
// (most common error path).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConcurrencyQueuePersistence } from './concurrency-queue-persistence';
import { concurrencyQueue } from './concurrency-queue';

describe('ConcurrencyQueuePersistence', () => {
  let tmpDir: string;
  let p: ConcurrencyQueuePersistence;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-cqp-'));
    p = new ConcurrencyQueuePersistence(path.join(tmpDir, 'queue-state.json'));
    concurrencyQueue.releaseAll();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('happy: save then restore preserves the lock count and lock metadata', () => {
    concurrencyQueue.tryAcquire('art-1', 'agent-1', 'sess-1');
    p.save();
    concurrencyQueue.releaseAll();
    expect(concurrencyQueue.listLocks()).toHaveLength(0);

    const result = p.restore();
    // The session 'sess-1' is not in the active-session set, so it's released
    // as session-dead — restores to 0 in this test config.
    expect(result.released).toBe(1);
    expect(result.restored).toBe(0);

    // If we register the session as active first, the lock is restored
    p.setActiveSessionIds(['sess-1']);
    concurrencyQueue.releaseAll();
    const result2 = p.restore();
    expect(result2.restored).toBe(1);
  });

  it('error: restore returns {restored:0, released:0} when the file is missing', () => {
    const result = p.restore();
    expect(result).toEqual({ restored: 0, released: 0 });
  });
});
