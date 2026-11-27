import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const posted = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../vscodeApi', () => ({ vscode: { postMessage: (m: Record<string, unknown>) => posted.push(m) } }));

import { AgentEditor } from './AgentEditor';
import type { AgentTeamView } from './agent-team-view';

const deliver = (data: unknown) => act(() => { window.dispatchEvent(new MessageEvent('message', { data })); });

const INSTALLED = [
  { id: 'claude', label: 'Claude Code', acceptsModel: true, listsModels: true },
  { id: 'gemini', label: 'Gemini CLI', acceptsModel: true, listsModels: false },
  { id: 'cursor-agent', label: 'Cursor CLI', acceptsModel: false, listsModels: false },
];
const TEAM: AgentTeamView = {
  agents: [{ id: 'dev', name: 'Dev Agent', harness: 'claude', model: 'sonnet' }],
  assignments: { 'S-1': 'dev', 'S-2': 'dev' },
  rosterDefined: true,
  installed: INSTALLED,
};

beforeEach(() => { posted.length = 0; });

describe('AgentEditor', () => {
  it('lists each agent with its CLI, model and how many cards it has', () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    expect(screen.getByRole('dialog', { name: 'Agents' })).toBeTruthy();
    expect(screen.getByText('Dev Agent')).toBeTruthy();
    expect(screen.getByText('Claude Code · sonnet · 2 cards')).toBeTruthy();
  });

  it("adds an agent, offering the CLI's own models", () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'New agent' }));
    expect(posted).toContainEqual({ type: 'kanban:listModels', harness: 'claude' });
    expect(screen.getByText('Asking Claude Code for its models…')).toBeTruthy();

    deliver({ type: 'kanban:models', harness: 'claude', supported: true, models: [
      { id: 'sonnet', label: 'Sonnet', description: 'Sonnet 5.5 · Efficient for routine tasks' },
      { id: 'opus', label: 'Opus' },
    ] });
    expect(screen.getByText(/2 models from Claude Code/)).toBeTruthy();
    expect(document.querySelectorAll('#agent-editor-models option')).toHaveLength(2);

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Reviewer' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: 'sonnet' } });
    expect(screen.getByText('Sonnet 5.5 · Efficient for routine tasks')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add agent' }));
    const saved = posted.find((m) => m.type === 'kanban:saveAgent') as { agent: Record<string, unknown> };
    expect(saved.agent).toEqual({ name: 'Reviewer', harness: 'claude', model: 'sonnet', role: '', instructions: '', lead: false, skills: [], maxConcurrent: 1, avatar: expect.any(String) });
  });

  it('starts a new agent with an avatar nobody on the team has, and lets you pick another', () => {
    const team: AgentTeamView = { ...TEAM, agents: TEAM.agents.map((a, i) => (i === 0 ? { ...a, avatar: '🦊' } : a)) };
    render(<AgentEditor team={team} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'New agent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose an avatar' }));
    expect((screen.getByRole('radio', { name: '🦊' }) as HTMLElement).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('radio', { name: '🐼' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Panda' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add agent' }));
    expect((posted.find((m) => m.type === 'kanban:saveAgent') as { agent: { avatar: string } }).agent.avatar).toBe('🐼');
  });

  it('shows the save error and closes the form once saved', () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Dev Agent' }));
    deliver({ type: 'kanban:agentError', error: '"model" must be a model id' });
    expect(screen.getByRole('alert').textContent).toBe('"model" must be a model id');
    deliver({ type: 'kanban:agentSaved', id: 'dev' });
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('button', { name: 'New agent' })).toBeTruthy();
  });

  it('keeps the id when editing, so assigned cards stay assigned', () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Dev Agent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(posted).toContainEqual({ type: 'kanban:saveAgent', agent: { id: 'dev', name: 'Dev Agent', harness: 'claude', model: 'sonnet', role: '', instructions: '', lead: false, skills: [], maxConcurrent: 1 } });
  });

  it('asks before deleting an agent that has cards', () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Dev Agent' }));
    expect(screen.getByText(/Its 2 cards go back to the board default/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(posted).toContainEqual({ type: 'kanban:deleteAgent', id: 'dev' });
  });

  it('takes a typed model for CLIs that cannot list theirs, and none for CLIs that set their own', () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'New agent' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Gemini CLI' }));
    expect(screen.getByText(/Gemini CLI can't list its models/)).toBeTruthy();
    expect(posted.filter((m) => m.type === 'kanban:listModels' && m.harness === 'gemini')).toEqual([]);
    fireEvent.click(screen.getByRole('radio', { name: 'Cursor CLI' }));
    expect((screen.getByRole('combobox', { name: 'Model' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Cursor CLI uses its own model setting/)).toBeTruthy();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<AgentEditor team={TEAM} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AgentEditor — role, instructions and lead', () => {
  it('saves role, instructions and the lead flag, and says who it replaces as lead', () => {
    const team: AgentTeamView = { ...TEAM, agents: [...TEAM.agents, { id: 'cos', name: 'Chief of Staff', harness: 'claude', lead: true, role: 'Plans epics' }] };
    render(<AgentEditor team={team} onClose={() => undefined} />);
    expect(screen.getByText('Lead')).toBeTruthy();
    expect(screen.getByText('Plans epics')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Dev Agent' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Role' }), { target: { value: 'Implements stories' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Instructions' }), { target: { value: 'Add tests.' } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText(/Replaces Chief of Staff as lead/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(posted).toContainEqual({ type: 'kanban:saveAgent', agent: {
      id: 'dev', name: 'Dev Agent', harness: 'claude', model: 'sonnet', role: 'Implements stories', instructions: 'Add tests.', lead: true,
      skills: [], maxConcurrent: 1,
    } });
  });
});

describe('AgentEditor — skills, capacity, preview and usage', () => {
  it('chooses skills from the list and sets how many runs the agent may have at once', () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Dev Agent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose skills' }));
    expect(posted).toContainEqual({ type: 'kanban:listSkills' });
    deliver({ type: 'kanban:skills', skills: [
      { id: 'aac-dev-story', name: 'Dev story', description: 'Implements a story', source: 'bundled' },
      { id: 'our-style', name: 'Style', description: 'House style', source: 'workspace' },
    ] });
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter skills' }), { target: { value: 'style' } });
    expect(screen.queryByText('aac-dev-story')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /our-style/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Runs at once' }), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(posted.at(-1)).toMatchObject({ type: 'kanban:saveAgent', agent: { skills: ['our-style'], maxConcurrent: 3 } });
  });

  it('previews the brief the agent will receive', () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Dev Agent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview brief' }));
    expect(posted.at(-1)).toMatchObject({ type: 'kanban:previewBrief', agent: { id: 'dev', name: 'Dev Agent' } });
    deliver({ type: 'kanban:briefPreview', brief: '## You and this board\n\nYou are **Dev Agent**' });
    expect(screen.getByText(/You are \*\*Dev Agent\*\*/)).toBeTruthy();
  });

  it('shows usage per agent for the chosen period', () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Usage' }));
    expect(posted).toContainEqual({ type: 'kanban:getUsage' });
    const t = (runs: number) => ({ runs, succeeded: runs, timeMs: 90 * 60_000, tokensIn: 42_000, tokensOut: 1500, cards: 2 });
    deliver({ type: 'kanban:usage', usage: [{ who: 'Dev Agent', windows: { today: t(0), week: t(4), month: t(9) } }] });
    const row = screen.getByRole('row', { name: /Dev Agent/ });
    expect(row.textContent).toContain('4');
    expect(row.textContent).toContain('100%');
    expect(row.textContent).toContain('1h 30m');
    expect(row.textContent).toContain('42k / 1.5k');
    fireEvent.click(screen.getByRole('radio', { name: 'Today' }));
    expect(screen.getByText('No agent runs in this period.')).toBeTruthy();
  });

  it("adds a person with a name and role, and lists them without a CLI", () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(screen.queryByRole('combobox', { name: 'CLI' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: ' Maya ' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Role' }), { target: { value: 'Design' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(posted).toContainEqual({ type: 'kanban:saveAgent', agent: { name: 'Maya', kind: 'person', role: 'Design' } });
  });

  it('shows a person on the team as a person, and edits them with the person form', () => {
    const team = { ...TEAM, agents: [...TEAM.agents, { id: 'maya', name: 'Maya', harness: '', kind: 'person' as const }] };
    render(<AgentEditor team={team} onClose={() => undefined} />);
    expect(screen.getByText('Person · works their cards by hand')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Maya' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(posted).toContainEqual({ type: 'kanban:saveAgent', agent: { id: 'maya', name: 'Maya', kind: 'person', role: '' } });
  });
});


describe('AgentEditor — build with AI', () => {
  it('sends your description with the current form, then fills the form with the draft for review', () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'New agent' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Build with AI' }), { target: { value: 'Review frontend PRs; never edit code' } });
    fireEvent.click(screen.getByRole('button', { name: 'Draft with AI' }));
    const sent = posted.find((m) => m.type === 'kanban:draftAgent') as { request: string; draft: { harness: string } };
    expect(sent.request).toBe('Review frontend PRs; never edit code');
    expect(sent.draft.harness).toBe('claude');
    expect(screen.getByRole('button', { name: 'Drafting…' })).toBeTruthy();

    deliver({ type: 'kanban:agentDraft', draft: { name: 'Frontend Reviewer', role: 'Reviews frontend PRs', instructions: 'Read the diff first.' } });
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Frontend Reviewer');
    expect((screen.getByRole('textbox', { name: 'Role' }) as HTMLInputElement).value).toBe('Reviews frontend PRs');
    expect(screen.getByText(/Read every field before you save/)).toBeTruthy();
    expect(posted.filter((m) => m.type === 'kanban:saveAgent')).toEqual([]);
  });

  it('shows why a draft failed', () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'New agent' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Build with AI' }), { target: { value: 'anything' } });
    fireEvent.click(screen.getByRole('button', { name: 'Draft with AI' }));
    deliver({ type: 'kanban:agentDraft', error: 'No AI model is available.' });
    expect(screen.getByText('No AI model is available.')).toBeTruthy();
  });
});

describe('AgentEditor — my agents', () => {
  const saved = { id: 'qa', name: 'QA Bot', harness: 'claude', role: 'Writes e2e tests', avatar: '🐝' };

  it('saves a project agent to my agents, and marks it saved', () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    expect(posted).toContainEqual({ type: 'kanban:getAgentLibrary' });
    fireEvent.click(screen.getByRole('button', { name: 'Save Dev Agent to my agents' }));
    expect(posted).toContainEqual({ type: 'kanban:saveToLibrary', id: 'dev' });
    deliver({ type: 'kanban:agentLibrary', agents: [{ id: 'dev', name: 'Dev Agent', harness: 'claude' }] });
    expect(screen.getByRole('button', { name: 'Update Dev Agent in my agents' }).textContent).toContain('Saved');
  });

  it('lists saved agents that are not on this team and adds one', () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    deliver({ type: 'kanban:agentLibrary', agents: [saved, { id: 'dev', name: 'Dev Agent', harness: 'claude' }] });
    fireEvent.click(screen.getByRole('button', { name: /Add from my agents \(2\)/ }));
    expect(screen.queryByRole('button', { name: 'Add Dev Agent to this project' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add QA Bot to this project' }));
    expect(posted).toContainEqual({ type: 'kanban:addFromLibrary', id: 'qa' });
  });

  it('explains the library when it is empty', () => {
    render(<AgentEditor team={TEAM} onClose={() => undefined} />);
    deliver({ type: 'kanban:agentLibrary', agents: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Add from my agents' }));
    expect(screen.getByText(/No saved agents yet/)).toBeTruthy();
  });
});
