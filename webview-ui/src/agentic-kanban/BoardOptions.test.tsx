import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';

const posted: Array<Record<string, unknown>> = [];
vi.mock('../vscodeApi', () => ({ vscode: { postMessage: (m: Record<string, unknown>) => posted.push(m) } }));

import { BoardOptions, optionsFromStatus } from './BoardOptions';

const status = (extra: Record<string, unknown> = {}) => ({
  type: 'harness:status', harnesses: [], configured: 'auto', posture: 'sandboxed',
  resolved: { kind: 'none', label: 'No agent available', reason: '' },
  isolation: 'worktree', delivery: 'merge', branch: 'main', branches: ['main', 'develop'], isGit: true, hasGh: true, ...extra,
});
const deliver = (data: Record<string, unknown>) => act(() => {
  window.dispatchEvent(new MessageEvent('message', { data }));
});
const chip = (name: string | RegExp) => screen.getByRole('button', { name });
const open = (name: string | RegExp) => fireEvent.click(chip(name));

describe('optionsFromStatus', () => {
  it('reads the options from a status message and ignores other messages', () => {
    expect(optionsFromStatus(status())).toEqual({
      isolation: 'worktree', delivery: 'merge', posture: 'sandboxed', branch: 'main',
      branches: ['main', 'develop'], remoteBranches: [], isGit: true, hasGh: true,
    });
    expect(optionsFromStatus({ type: 'kanban:update' })).toBeNull();
  });

  it('falls back to the safe defaults when a value is missing', () => {
    expect(optionsFromStatus({ type: 'harness:status' })).toMatchObject({ isolation: 'worktree', delivery: 'merge', posture: 'sandboxed', branches: [] });
  });
});

describe('BoardOptions', () => {
  beforeEach(() => { posted.length = 0; });

  it('shows each option as a chip with its current value', () => {
    render(<BoardOptions />);
    deliver(status());
    expect(chip('Where cards run: Own branch')).toBeTruthy();
    expect(chip('Cards start from: main')).toBeTruthy();
    expect(chip('When you approve: Merge')).toBeTruthy();
    expect(chip('Permissions: Sandboxed')).toBeTruthy();
  });

  it('saves a choice picked from a chip menu', () => {
    render(<BoardOptions />);
    deliver(status());
    open('When you approve: Merge');
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Pull request/ }));
    expect(posted).toContainEqual({ type: 'harness:setDelivery', delivery: 'pr' });
    expect(chip('When you approve: Pull request')).toBeTruthy();
  });

  it('lets you pick the branch cards start from, and go back to the checked-out one', () => {
    render(<BoardOptions />);
    deliver(status());
    open('Cards start from: main');
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^develop/ }));
    expect(posted).toContainEqual({ type: 'harness:setBaseBranch', branch: 'develop' });
    open('Cards start from: develop');
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^main/ }));
    expect(posted).toContainEqual({ type: 'harness:setBaseBranch', branch: '' });
  });

  it('offers branches that are only on origin, and says picking one copies it', () => {
    render(<BoardOptions />);
    deliver(status({ remoteBranches: ['release/2.0'] }));
    open('Cards start from: main');
    const remote = screen.getByRole('menuitemradio', { name: /^release\/2\.0/ });
    expect(remote).toHaveTextContent('Only on origin');
    fireEvent.click(remote);
    expect(posted).toContainEqual({ type: 'harness:setBaseBranch', branch: 'release/2.0' });
  });

  it('cannot pick pull requests without the GitHub CLI, and says why', () => {
    render(<BoardOptions />);
    deliver(status({ hasGh: false }));
    open('When you approve: Merge');
    const pr = screen.getByRole('menuitemradio', { name: /Pull request/ });
    expect((pr as HTMLButtonElement).disabled).toBe(true);
    expect(pr.textContent).toMatch(/GitHub CLI/);
  });

  it('flags pull requests already chosen when the GitHub CLI is missing', () => {
    render(<BoardOptions />);
    deliver(status({ hasGh: false, delivery: 'pr' }));
    expect(chip('When you approve: Pull request, needs attention')).toBeTruthy();
  });

  it('outside git, shows that agents work in your files and offers no branch choices', () => {
    render(<BoardOptions />);
    deliver(status({ isGit: false, branch: undefined, branches: [] }));
    expect(chip('Where cards run: This checkout, needs attention')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Cards start from/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /When you approve/ })).toBeNull();
    open('Where cards run: This checkout, needs attention');
    expect((screen.getByRole('menuitemradio', { name: /Own branch/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('hides the approve choice when agents work in your checkout, since there is no branch to land', () => {
    render(<BoardOptions />);
    deliver(status({ isolation: 'none' }));
    expect(screen.queryByRole('button', { name: /When you approve/ })).toBeNull();
  });

  it('saves your choices as the default for new projects', () => {
    render(<BoardOptions />);
    deliver(status());
    open('Where cards run: Own branch');
    fireEvent.click(screen.getByRole('button', { name: 'Use as my default for new projects' }));
    expect(posted).toContainEqual({ type: 'harness:saveDefaults' });
  });
});
