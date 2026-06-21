import { describe, it, expect, vi } from 'vitest';
import { NodePtyTerminalBackend } from './node-pty-terminal-backend';

function mockPty() {
  const onDataCb = vi.fn<(cb: (d: string) => void) => void>();
  const writeFn = vi.fn();
  const killFn = vi.fn();
  const spawnFn = vi.fn(() => ({
    onData: onDataCb,
    onExit: vi.fn(),
    write: writeFn,
    kill: killFn,
  }));
  return { spawn: spawnFn, onDataCb, writeFn, killFn } as any;
}

describe('NodePtyTerminalBackend', () => {
  it('supports input when node-pty is provided', () => {
    const pty = mockPty();
    const b = new NodePtyTerminalBackend(pty);
    expect(b.supportsInput).toBe(true);
  });

  it('spawns, streams output, and forwards write()', () => {
    const pty = mockPty();
    const b = new NodePtyTerminalBackend(pty);
    b.spawnSession('a1', 'bash', [], '/tmp');

    expect(pty.spawn).toHaveBeenCalledTimes(1);
    const backendCb = pty.onDataCb.mock.calls[0][0] as (d: string) => void;

    const onData = vi.fn();
    b.attach('a1', onData);

    // Simulate PTY output
    backendCb('hello');
    expect(onData).toHaveBeenCalledWith('hello');

    b.write('a1', 'ls\r');
    expect(pty.writeFn).toHaveBeenCalledWith('ls\r');
  });

  it('getSnapshot returns accumulated output', () => {
    const pty = mockPty();
    const b = new NodePtyTerminalBackend(pty);
    b.spawnSession('a2', 'bash', [], '/tmp');

    const backendCb = pty.onDataCb.mock.calls[0][0] as (d: string) => void;
    backendCb('abc');
    backendCb('def');
    expect(b.getSnapshot('a2')).toBe('abcdef');
  });

  it('kill cleans up the session', async () => {
    const pty = mockPty();
    const b = new NodePtyTerminalBackend(pty);
    b.spawnSession('a3', 'bash', [], '/tmp');
    await b.kill('a3');
    expect(pty.killFn).toHaveBeenCalled();
    expect(b.getSnapshot('a3')).toBe('');
  });

  it('write and spawn are safe no-ops when no pty session exists', () => {
    const pty = mockPty();
    const b = new NodePtyTerminalBackend(pty);
    // No session spawned — write and kill should not throw
    expect(() => b.write('x', 'ls\r')).not.toThrow();
    expect(b.getSnapshot('nonexistent')).toBe('');
  });
});
