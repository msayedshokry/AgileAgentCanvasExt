import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { AgentTerminal } from './AgentTerminal';
import { TERMINAL_MSG } from '@ext-src/views/terminal-protocol';

const writeSpy = vi.fn();
const disposeSpy = vi.fn();
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function(this: any) {
    this.open = vi.fn();
    this.write = writeSpy;
    this.dispose = disposeSpy;
    this.onData = vi.fn();
    this.loadAddon = vi.fn();
    this.clear = vi.fn();
    this.cols = 80;
    this.rows = 24;
  }),
}));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: vi.fn().mockImplementation(function(this: any) { this.fit = vi.fn(); }) }));

const postMessage = vi.fn();
vi.mock('../vscodeApi', () => ({ vscode: { postMessage: (m: unknown) => postMessage(m) } }));

beforeEach(() => { writeSpy.mockClear(); postMessage.mockClear(); cleanup(); });

describe('AgentTerminal', () => {
  it('posts terminal:open on mount and terminal:close on unmount', () => {
    const { unmount } = render(<AgentTerminal sessionId="a1" />);
    expect(postMessage).toHaveBeenCalledWith({ type: TERMINAL_MSG.open, sessionId: 'a1' });
    unmount();
    expect(postMessage).toHaveBeenCalledWith({ type: TERMINAL_MSG.close, sessionId: 'a1' });
  });
  it('writes incoming data chunks for its sessionId to the terminal', () => {
    render(<AgentTerminal sessionId="a1" />);
    window.dispatchEvent(new MessageEvent('message', { data: { type: TERMINAL_MSG.data, sessionId: 'a1', chunk: 'hi' } }));
    expect(writeSpy).toHaveBeenCalledWith('hi');
  });
  it('ignores chunks for other sessions', () => {
    render(<AgentTerminal sessionId="a1" />);
    window.dispatchEvent(new MessageEvent('message', { data: { type: TERMINAL_MSG.data, sessionId: 'OTHER', chunk: 'no' } }));
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
