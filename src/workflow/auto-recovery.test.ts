// ─── Unit tests: auto-recovery ───────────────────────────────────────────────
// Covers: hooks wiring + dead-transition handler invokes kill/broadcast/release
// (happy path) and tolerates a throwing kill hook (most common error path).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoRecovery } from './auto-recovery';
import { concurrencyQueue } from './concurrency-queue';
import { agentHealthMonitor } from './agent-health-monitor';

describe('AutoRecovery', () => {
  beforeEach(() => {
    concurrencyQueue.releaseAll();
    agentHealthMonitor.stop();
  });

  afterEach(() => {
    agentHealthMonitor.stop();
  });

  it('happy: on dead transition, kills terminal, releases lock, broadcasts failed', async () => {
    const rec = new AutoRecovery();
    const kill = vi.fn(async () => {});
    const broadcast = vi.fn();

    rec.setHooks({
      killTerminal: { kill },
      broadcast: { broadcast },
      sessionToArtifact: (sid) => (sid === 'sess-1' ? 'art-1' : undefined),
      sessionToTerminal: (sid) => `${sid}-term`,
    });

    rec.start();

    // Hold a lock so release() has something to do
    const lock = concurrencyQueue.tryAcquire('art-1', 'agent', 'sess-1');
    expect(lock).not.toBeNull();

    // Fire a synthetic dead transition
    agentHealthMonitor.emit('dead', {
      sessionId: 'sess-1',
      oldState: 'degraded',
      newState: 'dead',
      checkLabel: 'terminal-alive',
      timestamp: Date.now(),
    });

    // Allow the async handler to complete (no real timer dependency)
    await new Promise(r => setImmediate(r));

    expect(kill).toHaveBeenCalledWith('sess-1-term');
    expect(broadcast).toHaveBeenCalledWith('art-1', expect.objectContaining({ status: 'failed' }));
    expect(concurrencyQueue.isLocked('art-1')).toBe(false);

    rec.stop();
  });

  it('error: a throwing kill hook does not block lock release or broadcast', async () => {
    const rec = new AutoRecovery();
    const broadcast = vi.fn();
    rec.setHooks({
      killTerminal: { kill: async () => { throw new Error('kill failed'); } },
      broadcast: { broadcast },
      sessionToArtifact: () => 'art-2',
      sessionToTerminal: () => 'term-2',
    });
    rec.start();

    concurrencyQueue.tryAcquire('art-2', 'agent', 'sess-2');
    agentHealthMonitor.emit('dead', {
      sessionId: 'sess-2', oldState: 'degraded', newState: 'dead',
      checkLabel: 'check', timestamp: Date.now(),
    });
    await new Promise(r => setImmediate(r));

    // Lock should still be released and broadcast should still fire
    expect(concurrencyQueue.isLocked('art-2')).toBe(false);
    expect(broadcast).toHaveBeenCalled();
    rec.stop();
  });
});
