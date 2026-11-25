// Named agents as assignees: the card shows who it is assigned to, and the
// detail panel lets you pick an agent (or go back to the board default).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const posted = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../vscodeApi', () => ({ vscode: { postMessage: (m: Record<string, unknown>) => posted.push(m) } }));

import { KanbanCard } from '../components/kanban/KanbanCard';
import { AgenticDetailPanel } from './AgenticDetailPanel';
import type { KanbanItem } from '../components/kanban/KanbanTypes';
import type { AgentTeamView } from './agent-team-view';

const ITEM: KanbanItem = { id: 'S-1', key: 'S-1', title: 'Login story', status: 'ready-for-dev', type: 'story', isEpic: false };
const TEAM: AgentTeamView = {
  agents: [{ id: 'dev', name: 'Dev Agent', harness: 'claude' }, { id: 'reviewer', name: 'Reviewer', harness: 'codex' }],
  assignments: { 'S-1': 'dev' },
  rosterDefined: true,
  installed: [{ id: 'claude', label: 'Claude Code', acceptsModel: true, listsModels: true }],
};

beforeEach(() => { posted.length = 0; });

describe('card assignee', () => {
  it('shows the assignee initials with an accessible name', () => {
    render(<KanbanCard item={{ ...ITEM, assignee: { id: 'dev', name: 'Dev Agent' } }} />);
    const avatar = screen.getByLabelText('Assigned to Dev Agent');
    expect(avatar.textContent).toBe('DA');
  });

  it('shows nothing for an unassigned card', () => {
    render(<KanbanCard item={ITEM} />);
    expect(screen.queryByLabelText(/Assigned to/)).toBeNull();
  });
});

describe('card progress line', () => {
  const running = { ...ITEM, agentState: { status: 'running' as const, agentRole: 'dev' } };

  it('shows what the running agent is doing instead of a generic badge', () => {
    render(<KanbanCard item={{ ...running, progressLine: 'Editing src/login.ts' }} />);
    expect(screen.getByText('Editing src/login.ts')).toBeTruthy();
    expect(screen.queryByText(/is working/)).toBeNull();
  });

  it('falls back to the generic badge before the agent prints anything', () => {
    render(<KanbanCard item={running} />);
    expect(screen.getByText('dev is working...')).toBeTruthy();
  });
});

describe('detail panel assignee picker', () => {
  const panel = (team: AgentTeamView) => render(
    <AgenticDetailPanel
      item={{ ...ITEM, assignee: { id: 'dev', name: 'Dev Agent' } }}
      onClose={() => undefined}
      chatSessionActive={false}
      team={team}
    />,
  );

  it('selects the current assignee and reassigns or clears the card', () => {
    panel(TEAM);
    const picker = screen.getByRole('combobox', { name: 'Assign this card to an agent' }) as HTMLSelectElement;
    expect(picker.value).toBe('dev');
    fireEvent.change(picker, { target: { value: 'reviewer' } });
    expect(posted).toContainEqual({ type: 'kanban:assignAgent', artifactId: 'S-1', agentId: 'reviewer' });
    fireEvent.change(picker, { target: { value: '' } });
    expect(posted).toContainEqual({ type: 'kanban:assignAgent', artifactId: 'S-1', agentId: null });
  });

  it('offers to name agents when there is no roster yet', () => {
    panel({ ...TEAM, rosterDefined: false });
    fireEvent.click(screen.getByRole('button', { name: 'Name agents' }));
    expect(posted).toContainEqual({ type: 'kanban:editAgentTeam' });
  });
});
