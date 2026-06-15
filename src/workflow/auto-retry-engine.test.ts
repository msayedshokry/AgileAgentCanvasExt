// ─── Unit tests: auto-retry-engine ───────────────────────────────────────────
// Covers: transient failure → success after retry (happy path) and
// permanent failure → no retries (most common error path).

import { describe, it, expect, vi } from 'vitest';
import { AutoRetryEngine } from './auto-retry-engine';

describe('AutoRetryEngine', () => {
  it('happy: succeeds on second attempt after one transient failure', async () => {
    const engine = new AutoRetryEngine();
    engine.setConfig({ maxRetries: 3, initialDelayMs: 1, backoffMultiplier: 1 });
    let calls = 0;
    const work = vi.fn(async () => {
      calls++;
      if (calls < 2) throw new Error('ETIMEDOUT connection reset');
    });
    const result = await engine.run('S-1', work);
    expect(result.succeeded).toBe(true);
    expect(result.totalAttempts).toBe(2);
    expect(result.attempts[0].category).toBe('transient');
  });

  it('error: permanent failure (schema validation) skips retries', async () => {
    const engine = new AutoRetryEngine();
    engine.setConfig({ maxRetries: 3, initialDelayMs: 1, backoffMultiplier: 1 });
    const work = vi.fn(async () => { throw new Error('schema validation failed: missing field'); });
    const result = await engine.run('S-2', work);
    expect(result.succeeded).toBe(false);
    expect(result.totalAttempts).toBe(1); // no retry
    expect(result.finalCategory).toBe('permanent');
  });
});
