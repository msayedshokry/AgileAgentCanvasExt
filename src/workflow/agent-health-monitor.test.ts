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

  // ── Regression: the "minutes of nothing then failure" bug ────────────────
  // Headless CLI agents (pi, opencode, claude) can legitimately run for
  // minutes with NO terminal output (model latency, tool execution). The
  // output-progress/artifact-change checks only ever return 'degraded' —
  // they have no ground truth about the process. The monitor used to force-
  // promote degraded-only sessions to 'dead' after 3 consecutive unhealthy
  // polls (~2–3 min at the 30s interval), which made AutoRecovery KILL the
  // terminal of a working agent and fail the kanban card. A quiet-but-alive
  // session must stay 'degraded'; only checks with real ground truth
  // (process liveness, explicit 3× stall thresholds) may return 'dead'.
  it('regression: degraded-only session is never escalated to dead (quiet headless agents must not be killed)', async () => {
    vi.useFakeTimers();
    const mon = new AgentHealthMonitor(10);
    const events: any[] = [];
    mon.on('transition', e => events.push(e));

    // Simulates a terminal agent with no output for a long time: the
    // output-progress check only ever returns 'degraded'.
    mon.registerCheck('quiet-agent', makeCheck('degraded', 'output-progress'));
    mon.start();
    // Run WAY past the old 3-consecutive-poll escalation window.
    await vi.advanceTimersByTimeAsync(10_000);
    mon.stop();

    // Session is still tracked and merely degraded — NOT dead, NOT killed.
    expect(mon.getState('quiet-agent')).toBe('degraded');
    expect(events.filter(e => e.newState === 'dead')).toHaveLength(0);
    // It transitioned to degraded exactly once (no event spam while steady).
    expect(events.filter(e => e.newState === 'degraded')).toHaveLength(1);
  });

  it('regression: a session recovers from degraded when activity resumes', async () => {
    vi.useFakeTimers();
    const mon = new AgentHealthMonitor(10);
    const events: any[] = [];
    mon.on('transition', e => events.push(e));

    let result: HealthState = 'degraded';
    mon.registerCheck('recovering', { label: 'output-progress', check: async () => result });
    mon.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(mon.getState('recovering')).toBe('degraded');

    // Output resumes (a chunk of terminal data arrived) → back to healthy.
    result = 'healthy';
    await vi.advanceTimersByTimeAsync(100);
    mon.stop();

    expect(mon.getState('recovering')).toBe('healthy');
    expect(events.filter(e => e.newState === 'dead')).toHaveLength(0);
  });
});
