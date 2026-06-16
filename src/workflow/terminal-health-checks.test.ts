// ─── Unit tests: ChatProgressTracker + createChatHealthChecks (#32) ──────────
// Locks in:
//   1. ChatProgressTracker.markActivity advances `lastActivityAt` and
//      increments `activityCount`.
//   2. createChatHealthChecks w/o tracker emits only `chat-session-elapsed`.
//   3. createChatHealthChecks w/ tracker emits a second check
//      `chat-stream-progress` that escalates from healthy → degraded → dead
//      as the gap between activity marks crosses the stall window.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ChatProgressTracker,
  createChatHealthChecks,
} from './terminal-health-checks';

describe('ChatProgressTracker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with lastActivityAt = construction time and zero count', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T00:00:00Z'));
    const tracker = new ChatProgressTracker();
    expect(tracker.getLastActivity()).toBe(Date.parse('2026-06-16T00:00:00Z'));
    expect(tracker.getActivityCount()).toBe(0);
  });

  it('markActivity updates lastActivityAt and bumps count', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T00:00:00Z'));
    const tracker = new ChatProgressTracker();
    vi.setSystemTime(new Date('2026-06-16T00:00:01Z'));
    tracker.markActivity();
    expect(tracker.getLastActivity()).toBe(Date.parse('2026-06-16T00:00:01Z'));
    expect(tracker.getActivityCount()).toBe(1);
    vi.setSystemTime(new Date('2026-06-16T00:00:02Z'));
    tracker.markActivity();
    expect(tracker.getActivityCount()).toBe(2);
    expect(tracker.getLastActivity()).toBe(Date.parse('2026-06-16T00:00:02Z'));
  });

  it('multiple marks keep the LATEST one, not the earliest', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T00:00:00Z'));
    const tracker = new ChatProgressTracker();
    vi.setSystemTime(new Date('2026-06-16T00:00:05Z'));
    tracker.markActivity();
    vi.setSystemTime(new Date('2026-06-16T00:00:30Z'));
    tracker.markActivity();
    vi.setSystemTime(new Date('2026-06-16T00:01:00Z'));
    // No new marks for 30s — stall window check should use the 30s mark, not 5s
    const gap = Date.now() - tracker.getLastActivity();
    expect(gap).toBe(30_000);
  });
});

describe('createChatHealthChecks w/ vs w/o tracker (#32)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('without tracker: emits only the chat-session-elapsed check', () => {
    vi.useFakeTimers();
    const checks = createChatHealthChecks({});
    expect(checks.map(c => c.label)).toEqual(['chat-session-elapsed']);
  });

  it('with tracker: emits BOTH elapsed + stream-progress checks', () => {
    vi.useFakeTimers();
    const tracker = new ChatProgressTracker();
    const checks = createChatHealthChecks({}, {}, tracker);
    expect(checks.map(c => c.label)).toEqual([
      'chat-session-elapsed',
      'chat-stream-progress',
    ]);
  });

  it('stream-progress returns healthy when activity was just marked', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T00:00:00Z'));
    const tracker = new ChatProgressTracker();
    vi.setSystemTime(new Date('2026-06-16T00:00:30Z'));
    tracker.markActivity();
    // 30s after the last mark with default 60s outputStallMs — still healthy
    vi.setSystemTime(new Date('2026-06-16T00:01:00Z'));
    const checks = createChatHealthChecks({}, {}, tracker);
    const streamCheck = checks.find(c => c.label === 'chat-stream-progress')!;
    expect(await streamCheck.check()).toBe('healthy');
  });

  it('stream-progress returns degraded past outputStallMs but under 3x', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T00:00:00Z'));
    const tracker = new ChatProgressTracker();
    vi.setSystemTime(new Date('2026-06-16T00:00:00Z'));
    tracker.markActivity();
    // 65s after the last mark — past the 60s default outputStallMs
    vi.setSystemTime(new Date('2026-06-16T00:01:05Z'));
    const checks = createChatHealthChecks({}, {}, tracker);
    const streamCheck = checks.find(c => c.label === 'chat-stream-progress')!;
    expect(await streamCheck.check()).toBe('degraded');
  });

  it('stream-progress returns dead past 3x outputStallMs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T00:00:00Z'));
    const tracker = new ChatProgressTracker();
    vi.setSystemTime(new Date('2026-06-16T00:00:00Z'));
    tracker.markActivity();
    // 200s after the last mark — past 3x the 60s default
    vi.setSystemTime(new Date('2026-06-16T00:03:20Z'));
    const checks = createChatHealthChecks({}, {}, tracker);
    const streamCheck = checks.find(c => c.label === 'chat-stream-progress')!;
    expect(await streamCheck.check()).toBe('dead');
  });

  it('stream-progress respects custom outputStallMs option', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T00:00:00Z'));
    const tracker = new ChatProgressTracker();
    tracker.markActivity();
    // 5s gap with outputStallMs=2s → 'degraded'
    vi.setSystemTime(new Date('2026-06-16T00:00:05Z'));
    const checks = createChatHealthChecks(
      {},
      { outputStallMs: 2_000 },
      tracker,
    );
    const streamCheck = checks.find(c => c.label === 'chat-stream-progress')!;
    expect(await streamCheck.check()).toBe('degraded');
  });

  it('backwards-compat: omitting tracker keeps legacy 1-check shape', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T00:00:00Z'));
    const checks = createChatHealthChecks({});
    expect(checks).toHaveLength(1);
    expect(checks[0].label).toBe('chat-session-elapsed');
    // Advance deterministic fake clock 6 min past construction — just past
    // the default 5 min sessionTimeoutMs threshold. (3× that would be
    // 'dead'; we stay under it so the assertion can confirm 'degraded'.)
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(await checks[0].check()).toBe('degraded');
  });
});
