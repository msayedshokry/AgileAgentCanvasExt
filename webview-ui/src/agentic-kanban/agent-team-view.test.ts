import { describe, it, expect } from 'vitest';
import { assigneeFor, describeAgent, parseTeamMessage, EMPTY_TEAM_VIEW } from './agent-team-view';

const installed = [{ id: 'claude', label: 'Claude Code', acceptsModel: true, listsModels: true }];
const team = {
  agents: [{ id: 'dev', name: 'Dev', harness: 'claude', model: 'sonnet' }],
  assignments: { 'S-1': 'dev', 'S-2': 'gone' },
  rosterDefined: true,
  installed,
};

describe('assigneeFor', () => {
  it('returns the assigned agent, and nothing for unassigned cards or removed agents', () => {
    expect(assigneeFor(team, 'S-1')?.name).toBe('Dev');
    expect(assigneeFor(team, 'S-2')).toBeUndefined();
    expect(assigneeFor(EMPTY_TEAM_VIEW, 'S-1')).toBeUndefined();
  });
});

describe('parseTeamMessage', () => {
  it('keeps well-formed agents and CLIs and rejects malformed payloads', () => {
    expect(parseTeamMessage({ ...team, agents: [...team.agents, { id: 1 }], installed: [...installed, { id: 2 }] })).toEqual(team);
    expect(parseTeamMessage({ agents: 'nope', assignments: {} })).toBeUndefined();
  });

  it('treats a message without the installed list as no CLIs', () => {
    expect(parseTeamMessage({ agents: [], assignments: {} })?.installed).toEqual([]);
  });
});

describe('describeAgent', () => {
  it('names the CLI and the model, or says the CLI default is used', () => {
    expect(describeAgent(team.agents[0], installed)).toBe('Claude Code · sonnet');
    expect(describeAgent({ id: 'x', name: 'X', harness: 'codex' }, installed)).toBe('codex (not installed) · CLI default');
  });
});
