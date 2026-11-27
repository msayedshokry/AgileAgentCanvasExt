import { describe, it, expect } from 'vitest';
import { singleFlight } from './single-flight';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('singleFlight', () => {
  it('runs one at a time and once more for calls made while running', async () => {
    const gates = [deferred(), deferred()];
    let started = 0;
    const run = singleFlight(() => gates[started++].promise);

    const first = run();
    const second = run();
    const third = run();
    expect(started).toBe(1);

    gates[0].resolve();
    await Promise.resolve(); await Promise.resolve();
    expect(started).toBe(2);
    gates[1].resolve();
    await Promise.all([first, second, third]);
    expect(started).toBe(2);
  });

  it('starts fresh after a run fails', async () => {
    let calls = 0;
    const run = singleFlight(async () => { calls++; if (calls === 1) throw new Error('boom'); });
    await expect(run()).rejects.toThrow('boom');
    await run();
    expect(calls).toBe(2);
  });
});
