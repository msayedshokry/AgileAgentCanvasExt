import { describe, it, expect } from 'vitest';
import { LiveQuestions } from './live-questions';

function fakeTimer() {
  const pending = new Map<number, () => void>();
  let next = 0;
  return {
    timer: { set: (fn: () => void) => { pending.set(++next, fn); return next; }, clear: (h: unknown) => { pending.delete(h as number); } },
    fireAll: () => { for (const [id, fn] of [...pending]) { pending.delete(id); fn(); } },
    count: () => pending.size,
  };
}

describe('LiveQuestions', () => {
  it('hands the answer to the waiting agent', async () => {
    const t = fakeTimer();
    const q = new LiveQuestions(t.timer);
    const wait = q.ask('S-1');
    expect(q.isWaiting('S-1')).toBe(true);
    expect(q.answer('S-1', '12')).toBe(true);
    expect(await wait).toBe('12');
    expect(q.isWaiting('S-1')).toBe(false);
    expect(t.count()).toBe(0);
  });

  it('gives up after the wait, so the agent ends its run and asks in the verdict', async () => {
    const t = fakeTimer();
    const q = new LiveQuestions(t.timer);
    const wait = q.ask('S-1');
    t.fireAll();
    expect(await wait).toBeUndefined();
    expect(q.answer('S-1', 'late')).toBe(false);
  });

  it('ends an earlier wait on the same card, and on cancel', async () => {
    const q = new LiveQuestions(fakeTimer().timer);
    const first = q.ask('S-1');
    const second = q.ask('S-1');
    expect(await first).toBeUndefined();
    q.cancel('S-1');
    expect(await second).toBeUndefined();
  });
});
