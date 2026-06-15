// ─── Unit tests: auto-scheduler ───────────────────────────────────────────────
// Covers: pickNext selects highest-priority ready-for-dev (happy path) and
// setWipLimit rejects zero/negative (most common error path).

import { describe, it, expect } from 'vitest';
import { AutoScheduler } from './auto-scheduler';

describe('AutoScheduler', () => {
  it('happy: pickNext returns the highest-priority ready-for-dev story', () => {
    const sch = new AutoScheduler(60_000, 3);
    sch.setStories([
      { id: 'S-1', status: 'ready-for-dev', priority: 'P2' },
      { id: 'S-2', status: 'ready-for-dev', priority: 'P0' },
      { id: 'S-3', status: 'backlog', priority: 'P0' },        // not ready
      { id: 'S-4', status: 'ready-for-dev', priority: 'P1' },
    ]);
    expect(sch.pickNext()?.id).toBe('S-2');
  });

  it('error: setWipLimit throws on values below 1', () => {
    const sch = new AutoScheduler();
    expect(() => sch.setWipLimit(0)).toThrow();
    expect(() => sch.setWipLimit(-1)).toThrow();
  });
});
