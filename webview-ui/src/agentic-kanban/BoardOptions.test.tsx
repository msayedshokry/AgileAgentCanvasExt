import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';

const posted: Array<Record<string, unknown>> = [];
vi.mock('../vscodeApi', () => ({ vscode: { postMessage: (m: Record<string, unknown>) => posted.push(m) } }));

import { BoardOptions, optionsFromStatus } from './BoardOptions';

const status = (extra: Record<string, unknown> = {}) => ({
  type: 'harness:status', harnesses: [], configured: 'auto', posture: 'sandboxed',
  resolved: { kind: 'none', label: 'No agent available', reason: '' },
  isolation: 'worktree', delivery: 'merge', branch: 'main', ...extra,
});
const deliver = (data: Record<string, unknown>) => act(() => {
  window.dispatchEvent(new MessageEvent('message', { data }));
});

describe('optionsFromStatus', () => {
  it('reads the options from a status message and ignores other messages', () => {
    expect(optionsFromStatus(status())).toEqual({ isolation: 'worktree', delivery: 'merge', posture: 'sandboxed', branch: 'main' });
    expect(optionsFromStatus({ type: 'kanban:update' })).toBeNull();
  });

  it('falls back to the safe defaults when a value is missing', () => {
    expect(optionsFromStatus({ type: 'harness:status' })).toEqual({ isolation: 'worktree', delivery: 'merge', posture: 'sandboxed' });
  });
});

describe('BoardOptions', () => {
  beforeEach(() => { posted.length = 0; });

  it('shows each option as a chip with its current value', () => {
    render(<BoardOptions />);
    deliver(status());
    expect(screen.getByRole('button', { name: 'Where cards run: Own branch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Branch: main' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'When you approve: Merge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Permissions: Sandboxed' })).toBeInTheDocument();
  });

  it('saves a choice picked from a chip menu', () => {
    render(<BoardOptions />);
    deliver(status());
    fireEvent.click(screen.getByRole('button', { name: 'When you approve: Merge' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Pull request/ }));
    expect(posted).toContainEqual({ type: 'harness:setDelivery', delivery: 'pr' });
    expect(screen.getByRole('button', { name: 'When you approve: Pull request' })).toBeInTheDocument();
  });

  it('hides the approve choice when agents work in your checkout, since there is no branch to land', () => {
    render(<BoardOptions />);
    deliver(status({ isolation: 'none' }));
    expect(screen.queryByRole('button', { name: /When you approve/ })).not.toBeInTheDocument();
  });

  it('has no branch chip outside a git repository', () => {
    render(<BoardOptions />);
    deliver(status({ branch: undefined }));
    expect(screen.queryByRole('button', { name: /^Branch:/ })).not.toBeInTheDocument();
  });
});
