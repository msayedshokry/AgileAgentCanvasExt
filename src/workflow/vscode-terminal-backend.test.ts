import { describe, it, expect, vi } from 'vitest';
import { VsCodeTerminalBackend } from './vscode-terminal-backend';

function fakeExecutor() {
  const cbs = new Map<string, (c: string) => void>();
  return {
    attachWebviewStream: (id: string, cb: (c: string) => void) => { cbs.set(id, cb); return { dispose: () => cbs.delete(id) }; },
    getTerminalOutput: (_id: string) => 'SNAP',
    killTerminal: vi.fn(async () => {}),
    _emit: (id: string, c: string) => cbs.get(id)?.(c),
  };
}

describe('VsCodeTerminalBackend', () => {
  it('is output-only', () => {
    expect(new VsCodeTerminalBackend(fakeExecutor() as any).supportsInput).toBe(false);
  });
  it('delegates snapshot + stream + kill to terminalExecutor', async () => {
    const ex = fakeExecutor();
    const b = new VsCodeTerminalBackend(ex as any);
    expect(b.getSnapshot('a1')).toBe('SNAP');
    const onData = vi.fn();
    b.attach('a1', onData);
    ex._emit('a1', 'chunk');
    expect(onData).toHaveBeenCalledWith('chunk');
    await b.kill('a1');
    expect(ex.killTerminal).toHaveBeenCalledWith('a1');
  });
  it('write() is a safe no-op', () => {
    expect(() => new VsCodeTerminalBackend(fakeExecutor() as any).write('a1', 'ls\r')).not.toThrow();
  });
});
