import { describe, it, expect, vi } from 'vitest';
import { TerminalSessionRouter } from './terminal-session-router';
import { TERMINAL_MSG } from './terminal-protocol';

function fakeBackend() {
  const cbs = new Map<string, (c: string) => void>();
  return {
    supportsInput: false,
    attach: (id: string, cb: (c: string) => void) => { cbs.set(id, cb); return { dispose: () => cbs.delete(id) }; },
    getSnapshot: () => 'SNAP',
    write: vi.fn(),
    kill: vi.fn(async () => {}),
    _emit: (id: string, c: string) => cbs.get(id)?.(c),
  };
}

describe('TerminalSessionRouter', () => {
  it('on open: posts a snapshot then streams data chunks', () => {
    const be = fakeBackend();
    const post = vi.fn();
    const r = new TerminalSessionRouter(be as any, post);
    r.handle({ type: TERMINAL_MSG.open, sessionId: 'a1' });
    expect(post).toHaveBeenCalledWith({ type: TERMINAL_MSG.snapshot, sessionId: 'a1', data: 'SNAP' });
    be._emit('a1', 'xyz');
    expect(post).toHaveBeenCalledWith({ type: TERMINAL_MSG.data, sessionId: 'a1', chunk: 'xyz' });
  });
  it('on input: forwards to backend.write', () => {
    const be = fakeBackend();
    const r = new TerminalSessionRouter(be as any, vi.fn());
    r.handle({ type: TERMINAL_MSG.input, sessionId: 'a1', data: 'ls\r' });
    expect(be.write).toHaveBeenCalledWith('a1', 'ls\r');
  });
  it('on close: detaches the stream (no more data posts)', () => {
    const be = fakeBackend();
    const post = vi.fn();
    const r = new TerminalSessionRouter(be as any, post);
    r.handle({ type: TERMINAL_MSG.open, sessionId: 'a1' });
    r.handle({ type: TERMINAL_MSG.close, sessionId: 'a1' });
    post.mockClear();
    be._emit('a1', 'late');
    expect(post).not.toHaveBeenCalled();
  });
  it('emitExit posts terminal:exit outbound', () => {
    const post = vi.fn();
    const r = new TerminalSessionRouter(fakeBackend() as any, post);
    r.emitExit('a1', 0);
    expect(post).toHaveBeenCalledWith({ type: TERMINAL_MSG.exit, sessionId: 'a1', code: 0 });
  });
});
