// ─── Unit tests: circuit-breaker ──────────────────────────────────────────────
// Covers: 4 consecutive failures open the circuit (happy path) and
// canRun returns false while circuit is open (most common error path).

import { describe, it, expect } from 'vitest';
import { CircuitBreaker } from './circuit-breaker';

describe('CircuitBreaker', () => {
  it('happy: 4 consecutive failures open the circuit and emit "opened"', () => {
    const cb = new CircuitBreaker();
    cb.setConfig({ threshold: 4, cooldownMs: 60_000 });
    const opens: any[] = [];
    cb.on('opened', e => opens.push(e));

    for (let i = 0; i < 4; i++) cb.recordFailure('wf-1', 'transient');
    expect(cb.getStatus('wf-1')?.state).toBe('open');
    expect(opens).toHaveLength(1);
  });

  it('error: canRun returns false while circuit is open; reset() restores it', () => {
    const cb = new CircuitBreaker();
    cb.setConfig({ threshold: 1, cooldownMs: 60_000 });
    cb.recordFailure('wf-2');
    expect(cb.canRun('wf-2')).toBe(false);
    cb.reset('wf-2');
    expect(cb.canRun('wf-2')).toBe(true);
    expect(cb.getStatus('wf-2')?.state).toBe('closed');
  });
});
