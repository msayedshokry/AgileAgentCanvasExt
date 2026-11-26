import { describe, it, expect, vi } from 'vitest';
import { prTransitions, PrWatcher, type PrSnapshot } from './pr-watch';

const open = (failing: string[] = []): PrSnapshot => ({ state: 'OPEN', failing });

describe('prTransitions', () => {
  it('fires on a change, not a state', () => {
    expect(prTransitions(undefined, { state: 'MERGED', failing: [] })).toEqual([]);
    expect(prTransitions(open(), { state: 'MERGED', failing: [] })).toEqual([{ event: 'pr.merged' }]);
    expect(prTransitions(open(['lint']), open(['lint', 'test']))).toEqual([{ event: 'pr.checks-failed', checks: ['test'] }]);
    expect(prTransitions(open(['lint']), open(['lint']))).toEqual([]);
  });
});

describe('PrWatcher', () => {
  it('sets a baseline first, then reports merges and stops watching merged PRs', async () => {
    const states: PrSnapshot[] = [open(), open(['test']), { state: 'MERGED', failing: [] }];
    const emit = vi.fn();
    const w = new PrWatcher(async () => states.shift(), emit);
    w.watch('S-1', 0);
    await w.poll(1);
    expect(emit).not.toHaveBeenCalled();
    await w.poll(2);
    expect(emit).toHaveBeenCalledWith('S-1', { event: 'pr.checks-failed', checks: ['test'] });
    await w.poll(3);
    expect(emit).toHaveBeenLastCalledWith('S-1', { event: 'pr.merged' });
    expect(w.watching()).toEqual([]);
  });

  it('skips cards without a PR and keeps going when gh fails', async () => {
    const emit = vi.fn();
    const w = new PrWatcher(async (id) => { if (id === 'bad') throw new Error('gh missing'); return undefined; }, emit);
    w.watch('bad', 0);
    w.watch('none', 0);
    await w.poll(1);
    expect(w.watching()).toEqual(['bad', 'none']);
  });

  it('stops watching after a week', async () => {
    const w = new PrWatcher(async () => open(), vi.fn());
    w.watch('S-1', 0);
    await w.poll(8 * 24 * 60 * 60_000);
    expect(w.watching()).toEqual([]);
  });
});
