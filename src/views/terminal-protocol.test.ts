import { describe, it, expect } from 'vitest';
import { isTerminalInbound, TERMINAL_MSG } from './terminal-protocol';

describe('terminal protocol', () => {
  it('exposes stable message-type constants for both directions', () => {
    expect(TERMINAL_MSG.snapshot).toBe('terminal:snapshot');
    expect(TERMINAL_MSG.data).toBe('terminal:data');
    expect(TERMINAL_MSG.exit).toBe('terminal:exit');
    expect(TERMINAL_MSG.capabilities).toBe('terminal:capabilities');
    expect(TERMINAL_MSG.open).toBe('terminal:open');
    expect(TERMINAL_MSG.input).toBe('terminal:input');
    expect(TERMINAL_MSG.close).toBe('terminal:close');
    expect(TERMINAL_MSG.kill).toBe('terminal:kill');
  });
  it('narrows inbound (webview→ext) messages', () => {
    expect(isTerminalInbound({ type: 'terminal:open', sessionId: 's1' })).toBe(true);
    expect(isTerminalInbound({ type: 'terminal:input', sessionId: 's1', data: 'ls\r' })).toBe(true);
    expect(isTerminalInbound({ type: 'terminal:data', sessionId: 's1', chunk: 'x' })).toBe(false);
  });
});
