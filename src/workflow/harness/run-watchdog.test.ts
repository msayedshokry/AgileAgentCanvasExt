import { describe, it, expect } from 'vitest';
import { checkWatchdog, resolveWatchdogPolicy, DEFAULT_WATCHDOG_POLICY } from './run-watchdog';

const MIN = 60_000;
const policy = { idleMs: 10 * MIN, ceilingMs: 60 * MIN };

describe('checkWatchdog', () => {
  it('keeps a run that is past the old 20-minute limit but still producing output', () => {
    const d = checkWatchdog(45 * MIN, { startedAt: 0, lastOutputAt: 44 * MIN }, policy);
    expect(d.kind).toBe('ok');
  });

  it('stops a run that has been silent for the idle window', () => {
    const d = checkWatchdog(25 * MIN, { startedAt: 0, lastOutputAt: 15 * MIN }, policy);
    expect(d).toMatchObject({ kind: 'stop', reason: 'idle' });
    if (d.kind === 'stop') expect(d.summary).toContain('10m');
  });

  it('counts silence from the start when the agent never produced output', () => {
    expect(checkWatchdog(10 * MIN, { startedAt: 0, lastOutputAt: 0 }, policy)).toMatchObject({ reason: 'idle' });
    expect(checkWatchdog(9 * MIN, { startedAt: 0, lastOutputAt: 0 }, policy).kind).toBe('ok');
  });

  it('stops an active run at the ceiling, and the ceiling wins over idle', () => {
    expect(checkWatchdog(60 * MIN, { startedAt: 0, lastOutputAt: 59 * MIN }, policy)).toMatchObject({ reason: 'ceiling' });
    expect(checkWatchdog(70 * MIN, { startedAt: 0, lastOutputAt: 0 }, policy)).toMatchObject({ reason: 'ceiling' });
  });

  it('never stops when both checks are disabled', () => {
    expect(checkWatchdog(1e9, { startedAt: 0, lastOutputAt: 0 }, { idleMs: 0, ceilingMs: 0 }).kind).toBe('ok');
  });
});

describe('resolveWatchdogPolicy', () => {
  it('uses defaults for missing or invalid settings', () => {
    expect(resolveWatchdogPolicy({})).toEqual(DEFAULT_WATCHDOG_POLICY);
    expect(resolveWatchdogPolicy({ idleMinutes: -1, maxRunMinutes: 'x' })).toEqual(DEFAULT_WATCHDOG_POLICY);
  });

  it('converts minutes and allows 0 to disable a check', () => {
    expect(resolveWatchdogPolicy({ idleMinutes: 5, maxRunMinutes: 0 })).toEqual({ idleMs: 5 * MIN, ceilingMs: 0 });
  });

  it('treats an explicit caller timeout as the ceiling', () => {
    expect(resolveWatchdogPolicy({ maxRunMinutes: 90 }, 3000).ceilingMs).toBe(3000);
  });
});
