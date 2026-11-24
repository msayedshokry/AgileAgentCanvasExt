/**
 * Tests for the agent usability surfaces: readiness strip (AgentStatusBar),
 * fix-it panel and run timeline (RunInsights).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const posted = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../vscodeApi', () => ({ vscode: { postMessage: (m: Record<string, unknown>) => posted.push(m) } }));

import { AgentStatusBar, type AgentStatus } from './AgentStatusBar';
import { RunInsights } from './RunInsights';
import type { KanbanItem } from '../components/kanban/KanbanTypes';

function deliver(data: unknown) {
  act(() => { window.dispatchEvent(new MessageEvent('message', { data })); });
}

const STATUS: AgentStatus = {
  configured: 'auto',
  posture: 'sandboxed',
  resolved: { kind: 'cli', id: 'claude', label: 'Claude Code', reason: 'first installed harness' },
  blocker: 'Claude Code is not signed in, so board runs will fail.',
  harnesses: [
    { id: 'claude', label: 'Claude Code', installed: true, version: '2.1.294', auth: 'signed-out', authDetail: 'Not signed in', installHint: 'x', canSignIn: true },
    { id: 'codex', label: 'OpenAI Codex CLI', installed: true, version: 'codex-cli 0.163.0', auth: 'ready', authDetail: 'Signed in', installHint: 'x', canSignIn: true },
    { id: 'gemini', label: 'Gemini CLI', installed: false, auth: 'unknown', authDetail: 'Not installed', installHint: 'npm i -g @google/gemini-cli', canSignIn: true },
  ],
};

beforeEach(() => { posted.length = 0; });

describe('AgentStatusBar', () => {
  it('asks for status on mount and shows a loading line until it arrives', () => {
    render(<AgentStatusBar />);
    expect(posted).toContainEqual({ type: 'harness:getStatus' });
    expect(screen.getByRole('status').textContent).toMatch(/Checking/);
  });

  it('explains a signed-out agent with a one-click sign-in', () => {
    render(<AgentStatusBar />);
    deliver({ type: 'harness:status', ...STATUS });
    expect(screen.getByRole('alert').textContent).toMatch(/not signed in/);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to Claude Code' }));
    expect(posted).toContainEqual({ type: 'harness:signIn', id: 'claude' });
  });

  it('switches agent and permission posture from the toolbar', () => {
    render(<AgentStatusBar />);
    deliver({ type: 'harness:status', ...STATUS });
    fireEvent.change(screen.getByLabelText('Coding agent that runs the board'), { target: { value: 'codex' } });
    fireEvent.change(screen.getByLabelText('What agents may do without asking'), { target: { value: 'full' } });
    expect(posted).toContainEqual({ type: 'harness:select', id: 'codex' });
    expect(posted).toContainEqual({ type: 'harness:setPosture', posture: 'full' });
  });

  it('lists every agent with install / use actions when expanded', () => {
    render(<AgentStatusBar />);
    deliver({ type: 'harness:status', ...STATUS });
    fireEvent.click(screen.getByRole('button', { name: /All agents \(2\/3\)/ }));
    expect(screen.getByRole('table')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'How to install' }));
    expect(posted).toContainEqual({ type: 'harness:install', id: 'gemini' });
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(posted).toContainEqual({ type: 'harness:select', id: 'codex' });
  });

  it('shows a red state when no agent can run', () => {
    const { container } = render(<AgentStatusBar />);
    deliver({ type: 'harness:status', ...STATUS, resolved: { kind: 'none', label: 'No agent available', reason: 'none' }, blocker: 'No coding-agent harness found.' });
    expect(container.querySelector('.agent-status--error')).not.toBeNull();
    expect(screen.getByText('No agent can run')).toBeTruthy();
  });
});

const ITEM: KanbanItem = {
  id: 'S-1', key: 'S-1', title: 'Story', status: 'ready-for-dev', type: 'story', isEpic: false,
  agentState: {
    status: 'interrupted',
    failure: { kind: 'signed-out', title: 'The agent is signed out or its credentials expired', detail: 'Failed to authenticate: OAuth session expired', actions: ['sign-in', 'switch-agent'] },
  },
};

describe('RunInsights', () => {
  it('shows why the run stopped with the fix actions, primary first', () => {
    render(<RunInsights item={ITEM} />);
    expect(screen.getByRole('alert').textContent).toMatch(/signed out/);
    expect(screen.getByText(/OAuth session expired/)).toBeTruthy();
    const signIn = screen.getByRole('button', { name: 'Sign in' });
    expect(signIn.className).toMatch(/primary/);
    fireEvent.click(signIn);
    expect(posted).toContainEqual({ type: 'kanban:fixAction', artifactId: 'S-1', action: 'sign-in' });
  });

  it('requests the timeline and renders runs and revertable agent commits', () => {
    render(<RunInsights item={{ ...ITEM, agentState: undefined }} />);
    expect(posted).toContainEqual({ type: 'kanban:getRunTimeline', artifactId: 'S-1' });
    deliver({
      type: 'kanban:runTimeline',
      artifactId: 'S-1',
      runs: [{ runId: 'r1', workflowId: 'aac-kanban-dev-executor', harness: 'codex', verdict: 'COMPLETED', startedAt: 0, finishedAt: 65_000 }],
      commits: [{ sha: 'abcdef1234567890', subject: 'agent: aac-kanban-dev-executor completed S-1', date: '2026-11-19T10:00:00Z' }],
    });
    expect(screen.getByText('Implement')).toBeTruthy();
    expect(screen.getByText('abcdef12')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revert' }));
    expect(posted).toContainEqual({ type: 'kanban:revertRun', artifactId: 'S-1', sha: 'abcdef1234567890' });
  });

  it('ignores timelines for other cards and offers prompt preview', () => {
    render(<RunInsights item={{ ...ITEM, agentState: undefined }} />);
    deliver({ type: 'kanban:runTimeline', artifactId: 'OTHER', runs: [{ runId: 'x', workflowId: 'w', harness: 'h', verdict: 'BLOCKED', startedAt: 0, finishedAt: 0 }], commits: [] });
    expect(screen.getByText('Loading…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Preview prompt' }));
    expect(posted).toContainEqual({ type: 'kanban:previewPrompt', artifactId: 'S-1' });
  });
});

describe('RunInsights — pull request + story ↔ code', () => {
  it('shows PR checks and sends review feedback back to the agent; lists files per agent commit', () => {
    render(<RunInsights item={{ ...ITEM, agentState: undefined }} />);
    deliver({
      type: 'kanban:runTimeline',
      artifactId: 'S-1',
      runs: [],
      commits: [{ sha: 'abcdef1234567890', subject: 'agent: x completed S-1', date: '2026-11-19T10:00:00Z', files: ['src/login.ts', 'src/login.test.ts'] }],
      pr: {
        url: 'https://github.com/o/r/pull/7', number: 7, state: 'OPEN', reviewDecision: 'CHANGES_REQUESTED',
        checks: [{ name: 'test', state: 'fail' }, { name: 'build', state: 'pass' }],
        feedback: [{ author: 'alice', body: 'Handle empty password.' }],
      },
    });
    expect(screen.getByText('PR #7')).toBeTruthy();
    expect(screen.getByText('1 failing: test')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Address 2 review items' }));
    expect(posted).toContainEqual({ type: 'kanban:addressReview', artifactId: 'S-1' });
    expect(screen.getByText('2 files')).toBeTruthy();
    expect(screen.getByText('src/login.ts')).toBeTruthy();
  });
});
