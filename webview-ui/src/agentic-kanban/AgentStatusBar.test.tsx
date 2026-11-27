import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const posted: Array<Record<string, unknown>> = [];
vi.mock('../vscodeApi', () => ({ vscode: { postMessage: (m: Record<string, unknown>) => posted.push(m) } }));

import { AgentStatusBar } from './AgentStatusBar';

const statusRequests = () => posted.filter((m) => m.type === 'harness:getStatus').length;
const reply = () => act(() => {
  window.dispatchEvent(new MessageEvent('message', { data: {
    type: 'harness:status', harnesses: [], configured: 'auto', posture: 'sandboxed',
    resolved: { kind: 'none', label: 'No agent available', reason: '' },
  } }));
});

describe('AgentStatusBar', () => {
  beforeEach(() => { posted.length = 0; });

  it('checks the agent again when you come back to the board, so a sign-in elsewhere shows up', () => {
    render(<AgentStatusBar compact />);
    expect(statusRequests()).toBe(1);
    reply();

    act(() => { window.dispatchEvent(new Event('focus')); });

    expect(statusRequests()).toBe(2);
  });

  it('does not ask again while a check is still running', () => {
    render(<AgentStatusBar compact />);
    reply();
    act(() => { window.dispatchEvent(new Event('focus')); });
    act(() => { window.dispatchEvent(new Event('focus')); });

    expect(statusRequests()).toBe(2);
  });
});
