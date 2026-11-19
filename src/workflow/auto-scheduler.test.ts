// ─── Unit tests: auto-scheduler ───────────────────────────────────────────────
// Covers: pickNext selects highest-priority ready-for-dev (happy path) and
// setWipLimit rejects zero/negative (most common error path).

import { describe, it, expect } from 'vitest';
import { AutoScheduler, MAX_STORY_ATTEMPTS, STORY_RETRY_COOLDOWN_MS } from './auto-scheduler';

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

describe('AutoScheduler — failed-story back-off', () => {
  it('backs a failed story off, then pauses it after MAX_STORY_ATTEMPTS failures in a row', () => {
    const s = new AutoScheduler();
    s.setStories([{ id: 'S-1', status: 'ready-for-dev' }, { id: 'S-2', status: 'ready-for-dev' }]);
    const t0 = 1_000_000;

    s.recordOutcome('S-1', false, t0);
    expect(s.pickNext(t0 + 1)?.id).toBe('S-2');                                  // S-1 cooling down
    expect(s.pickNext(t0 + STORY_RETRY_COOLDOWN_MS + 1)?.id).toBe('S-1');       // back-off over

    s.recordOutcome('S-1', false, t0);
    s.recordOutcome('S-1', false, t0);
    expect(s.getFailureCount('S-1')).toBe(MAX_STORY_ATTEMPTS);
    expect(s.isStoryPaused('S-1')).toBe(true);

    s.resumeStory('S-1');
    expect(s.getFailureCount('S-1')).toBe(0);
    expect(s.pickNext(t0 + 1)?.id).toBe('S-1');
  });

  it('a success clears the failure count', () => {
    const s = new AutoScheduler();
    s.recordOutcome('S-1', false, 0);
    s.recordOutcome('S-1', true, 0);
    expect(s.getFailureCount('S-1')).toBe(0);
  });
});
