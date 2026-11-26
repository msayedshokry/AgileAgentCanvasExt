import { describe, it, expect } from 'vitest';
import { AgentSlots, priorityRank } from './agent-slots';

const req = (cardId: string, rank = 3, capacity = 1, signal?: AbortSignal) => ({ agentId: 'dev', capacity, cardId, rank, signal });

describe('AgentSlots', () => {
  it('lets one card run at a time by default and starts the next when it finishes', async () => {
    const slots = new AgentSlots();
    const releaseA = await slots.acquire(req('A'));
    const waits: number[] = [];
    let bStarted = false;
    const b = slots.acquire(req('B'), (busy) => waits.push(busy)).then((r) => { bStarted = true; return r; });
    await Promise.resolve();
    expect(bStarted).toBe(false);
    expect(waits).toEqual([1]);
    expect(slots.queued('dev')).toEqual(['B']);
    releaseA();
    await b;
    expect(bStarted).toBe(true);
    expect(slots.busy('dev')).toBe(1);
  });

  it('starts waiting cards by priority, then in arrival order', async () => {
    const slots = new AgentSlots();
    const release = await slots.acquire(req('A'));
    const order: string[] = [];
    const later = ['low', 'urgent', 'normal'].map((id) =>
      slots.acquire(req(id, id === 'urgent' ? 0 : id === 'normal' ? 2 : 3)).then((r) => { order.push(id); r(); }));
    release();
    await Promise.all(later);
    expect(order).toEqual(['urgent', 'normal', 'low']);
  });

  it('honours a higher capacity', async () => {
    const slots = new AgentSlots();
    await slots.acquire(req('A', 3, 2));
    await slots.acquire(req('B', 3, 2));
    expect(slots.busy('dev')).toBe(2);
  });

  it('takes a stopped card out of the line', async () => {
    const slots = new AgentSlots();
    const release = await slots.acquire(req('A'));
    const ac = new AbortController();
    const b = slots.acquire(req('B', 3, 1, ac.signal));
    ac.abort();
    await expect(b).rejects.toThrow('aborted');
    expect(slots.queued('dev')).toEqual([]);
    release();
    expect(slots.busy('dev')).toBe(0);
  });

  it('ignores a second release', async () => {
    const slots = new AgentSlots();
    const release = await slots.acquire(req('A'));
    release();
    release();
    expect(slots.busy('dev')).toBe(0);
  });
});

describe('priorityRank', () => {
  it('ranks P0 and must-have first, unknown in the middle', () => {
    expect([priorityRank('P0'), priorityRank('should-have'), priorityRank(undefined), priorityRank("won't-have")]).toEqual([0, 1, 3, 4]);
  });
});
