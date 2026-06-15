// ─── Unit tests: terminal-health-checks ───────────────────────────────────────
// Covers: createChatHealthChecks and createTerminalHealthChecks

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChatHealthChecks, createTerminalHealthChecks } from './terminal-health-checks';

describe('createChatHealthChecks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a chat-session-elapsed check', () => {
    const checks = createChatHealthChecks({ id: 'S-1' });
    expect(checks).toHaveLength(1);
    expect(checks[0].label).toBe('chat-session-elapsed');
  });

  it('returns healthy when elapsed time is within session timeout', async () => {
    const checks = createChatHealthChecks({ id: 'S-1' }, { sessionTimeoutMs: 300_000 });
    const result = await checks[0].check();
    expect(result).toBe('healthy');
  });

  it('returns degraded when elapsed time exceeds session timeout', async () => {
    const checks = createChatHealthChecks({ id: 'S-1' }, { sessionTimeoutMs: 100 });
    // Advance time past the session timeout
    vi.advanceTimersByTime(200);
    const result = await checks[0].check();
    expect(result).toBe('degraded');
  });

  it('returns dead when elapsed time exceeds 3x session timeout', async () => {
    const checks = createChatHealthChecks({ id: 'S-1' }, { sessionTimeoutMs: 100 });
    // Advance time past 3x the session timeout
    vi.advanceTimersByTime(500);
    const result = await checks[0].check();
    expect(result).toBe('dead');
  });

  it('uses default session timeout of 300s when not specified', async () => {
    const checks = createChatHealthChecks({ id: 'S-1' });
    // After 4 minutes (240s) — within default 300s timeout
    vi.advanceTimersByTime(240_000);
    expect(await checks[0].check()).toBe('healthy');
    // After 6 minutes (360s) — past default 300s timeout
    vi.advanceTimersByTime(120_000);
    expect(await checks[0].check()).toBe('degraded');
  });
});

describe('createTerminalHealthChecks', () => {
  it('returns process-liveness, output-progress, and artifact-change checks', () => {
    const terminal = { isAlive: () => true, getLastOutputTime: () => Date.now() };
    const artifact = { lastModified: Date.now(), getLastModifiedTime: () => Date.now() };
    const checks = createTerminalHealthChecks(terminal, artifact);
    expect(checks).toHaveLength(3);
    expect(checks.map(c => c.label)).toEqual([
      'process-liveness',
      'output-progress',
      'artifact-change',
    ]);
  });
});
