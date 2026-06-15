// ─── Unit tests: agent-health-monitor ────────────────────────────────────────
// Covers: registerCheck + start/stop lifecycle (happy path) and
// deregister-removes-empty-session behavior (most common error path).
//
// Uses vi.useFakeTimers so the polling loop is deterministic and the test
// doesn't race against the real event loop.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentHealthMonitor, type HealthCheck, type HealthState } from './agent-health-monitor';

function makeCheck(result: HealthState, label = 'check'): HealthCheck {
  return { label, check: async () => result };
}

describe('AgentHealthMonitor', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('happy: registerCheck, start, and emits transition when check returns dead', async () => {
    vi.useFakeTimers();
    const mon = new AgentHealthMonitor(10);
    const events: any[] = [];
    mon.on('transition', e => events.push(e));

    mon.registerCheck('s1', makeCheck('dead', 'terminal-alive'));
    mon.start();
    // Advance the fake clock past 3 polls (DEAD_AFTER_CONSECUTIVE) plus headroom
    await vi.advanceTimersByTimeAsync(60);
    mon.stop();

    // Session was removed once it crossed into 'dead'
    expect(mon.listSessions()).not.toContain('s1');
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].newState).toBe('dead');
  });

  it('error: deregistering the last check removes the session entirely', () => {
    const mon = new AgentHealthMonitor();
    mon.registerCheck('s2', makeCheck('healthy'));
    expect(mon.listSessions()).toContain('s2');
    mon.deregisterCheck('s2', 'check');
    expect(mon.listSessions()).not.toContain('s2');
    expect(mon.getState('s2')).toBeUndefined();
  });
});
