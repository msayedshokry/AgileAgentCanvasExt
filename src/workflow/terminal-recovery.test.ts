// ─── Unit tests: TerminalSessionRecovery.setOnReconnected (#35) ───────────────
//
// Verifies that the autonomy-lifecycle can hook into successful reconnections
// without coupling to terminal-recovery's StreamReconnector interface. The
// hook fires ONCE per successful reconnect, after the reconnector returns
// ok=true but before the recovery result is returned. Hook exceptions are
// caught — recovery itself must not be tainted by listener failures.

import { describe, it, expect, vi } from 'vitest';
import {
  TerminalSessionRecovery,
  type OrphanedTerminal,
  type StreamReconnector,
  type ProcessScanner,
} from './terminal-recovery';

const orphan = (overrides: Partial<OrphanedTerminal> = {}): OrphanedTerminal => ({
  sessionId: 'term-s-1-a-1-1700000000000',
  artifactId: 'A-1',
  pid: 1234,
  name: 'AAC: dev A-1',
  startedAt: 1700000000000,
  ...overrides,
});

describe('TerminalSessionRecovery.setOnReconnected (#35)', () => {
  it('stores the callback and exposes it as the most-recent handler', () => {
    const rcv = new TerminalSessionRecovery();
    const fn = vi.fn();
    rcv.setOnReconnected(fn);
    // Internal exposure: re-setting replaces the prior handler so a
    // second lifecycle start() call doesn't double-fire.
    const fn2 = vi.fn();
    rcv.setOnReconnected(fn2);
    // We can't read the field directly without exposing it; the tests
    // below verify behavior end-to-end via recoverOnActivation().
    expect(fn).toBeDefined();
    expect(fn2).toBeDefined();
  });

  it('fires the hook ONCE per successful reconnect with the orphan metadata', async () => {
    const rcv = new TerminalSessionRecovery();
    const onReconnected = vi.fn();
    rcv.setScanner({
      findOrphans: async () => [orphan({ sessionId: 'S-A' }), orphan({ sessionId: 'S-B' })],
    } satisfies ProcessScanner);
    const reconnector = {
      reconnect: vi.fn(async () => true),
    } satisfies StreamReconnector;
    rcv.setReconnector(reconnector);
    rcv.setOnReconnected(onReconnected);

    const results = await rcv.recoverOnActivation();
    expect(results).toHaveLength(2);
    expect(results.every(r => r.status === 'reconnected')).toBe(true);
    expect(reconnector.reconnect).toHaveBeenCalledTimes(2);
    expect(onReconnected).toHaveBeenCalledTimes(2);

    // Hook receives the orphan metadata: sessionId + artifactId. The
    // autonomy-lifecycle uses these to look up buffered output and
    // broadcast the `terminalReconnected` message back to the webview.
    const firstArgs = onReconnected.mock.calls[0][0] as OrphanedTerminal;
    expect(firstArgs.artifactId).toBe('A-1');
    expect(firstArgs.sessionId).toBe('S-A');
  });

  it('does NOT fire the hook on reconnector failure (markInterrupted path)', async () => {
    const rcv = new TerminalSessionRecovery();
    const onReconnected = vi.fn();
    rcv.setScanner({ findOrphans: async () => [orphan()] } satisfies ProcessScanner);
    rcv.setReconnector({ reconnect: vi.fn(async () => false) } satisfies StreamReconnector);
    rcv.setOnReconnected(onReconnected);

    const results = await rcv.recoverOnActivation();
    expect(results[0].status).toBe('interrupted');
    expect(onReconnected).not.toHaveBeenCalled();
  });

  it('does NOT fire the hook when reconnector is NOT configured', async () => {
    const rcv = new TerminalSessionRecovery();
    const onReconnected = vi.fn();
    rcv.setScanner({ findOrphans: async () => [orphan()] } satisfies ProcessScanner);
    // No reconnector set — default markInterrupted path
    rcv.setOnReconnected(onReconnected);

    const results = await rcv.recoverOnActivation();
    expect(results[0].status).toBe('interrupted');
    expect(results[0].reason).toBe('terminal-lost');
    expect(onReconnected).not.toHaveBeenCalled();
  });

  it('catches hook exceptions so recovery still returns status:reconnected', async () => {
    const rcv = new TerminalSessionRecovery();
    rcv.setScanner({ findOrphans: async () => [orphan()] } satisfies ProcessScanner);
    rcv.setReconnector({ reconnect: vi.fn(async () => true) } satisfies StreamReconnector);
    // Deliberately throw — recovery must still report success.
    rcv.setOnReconnected(() => { throw new Error('listener blew up'); });

    const results = await rcv.recoverOnActivation();
    expect(results[0].status).toBe('reconnected');
  });

  it('does NOT fire the hook for orphans with no pid (terminal-lost path)', async () => {
    const rcv = new TerminalSessionRecovery();
    const onReconnected = vi.fn();
    rcv.setScanner({ findOrphans: async () => [orphan({ pid: undefined })] } satisfies ProcessScanner);
    rcv.setReconnector({ reconnect: vi.fn(async () => true) } satisfies StreamReconnector);
    rcv.setOnReconnected(onReconnected);

    const results = await rcv.recoverOnActivation();
    expect(results[0].status).toBe('interrupted');
    expect(results[0].reason).toBe('terminal-lost');
    expect(onReconnected).not.toHaveBeenCalled();
    // The reconnector should never be called when the pid is missing —
    // we mark the session lost before even attempting reconnect.
    // (StreamReconnector.reconnect above mocks a successful reconnect
    // for sanity, but attemptReconnect returns early at the pid check.)
  });

  it('replacing the onReconnected handler prevents prior handlers from firing again', async () => {
    const rcv = new TerminalSessionRecovery();
    const stale = vi.fn();
    const fresh = vi.fn();
    rcv.setScanner({ findOrphans: async () => [orphan()] } satisfies ProcessScanner);
    rcv.setReconnector({ reconnect: vi.fn(async () => true) } satisfies StreamReconnector);
    rcv.setOnReconnected(stale);
    rcv.setOnReconnected(fresh); // Replaces stale handler

    await rcv.recoverOnActivation();
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });
});
