import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AGENT_TEAM_TEMPLATE, agentIdFor, assignedAgent, effectiveRoster, parseAgentTeam, readAgentTeam, validateAgent, withAgent, withAssignment,
  withoutAgent, writeAgentTeam, leadAgent, EMPTY_TEAM,
} from './agent-team';

const INSTALLED = [{ id: 'claude', label: 'Claude Code' }, { id: 'codex', label: 'OpenAI Codex CLI' }];

describe('parseAgentTeam', () => {
  it('loads the template roster', () => {
    const { team, errors } = parseAgentTeam(AGENT_TEAM_TEMPLATE);
    expect(errors).toEqual([]);
    expect(team.agents.map((a) => [a.id, a.harness])).toEqual([['dev', 'claude'], ['reviewer', 'codex']]);
  });

  it('keeps valid agents and explains each invalid one', () => {
    const { team, errors } = parseAgentTeam(JSON.stringify({
      agents: [
        { id: 'dev', name: 'Dev', harness: 'claude' },
        { id: 'Bad Id', name: 'x', harness: 'claude' },
        { id: 'dev', name: 'Again', harness: 'codex' },
        { id: 'qa', name: 'QA', harness: 'auto' },
        { id: 'pm', name: '', harness: 'codex' },
      ],
      assignments: { 'S-1': 'dev', 'S-2': 42 },
    }));
    expect(team.agents.map((a) => a.id)).toEqual(['dev']);
    expect(team.assignments).toEqual({ 'S-1': 'dev' });
    expect(errors).toHaveLength(4);
    expect(errors[2]).toMatch(/harness/);
  });

  it('reports broken JSON without throwing', () => {
    expect(parseAgentTeam('{').errors[0]).toMatch(/not valid JSON/);
  });
});

describe('effectiveRoster', () => {
  it('uses the roster when one is defined', () => {
    const { team } = parseAgentTeam(AGENT_TEAM_TEMPLATE);
    expect(effectiveRoster(team, INSTALLED).map((a) => a.name)).toEqual(['Dev', 'Reviewer']);
  });

  it('offers every installed CLI as an agent when there is no roster', () => {
    expect(effectiveRoster(EMPTY_TEAM, INSTALLED)).toEqual([
      { id: 'claude', name: 'Claude Code', harness: 'claude' },
      { id: 'codex', name: 'OpenAI Codex CLI', harness: 'codex' },
    ]);
  });
});

describe('assignedAgent', () => {
  it('finds a named agent and ignores assignments to agents that no longer exist', () => {
    const { team } = parseAgentTeam(AGENT_TEAM_TEMPLATE);
    expect(assignedAgent(withAssignment(team, 'S-1', 'reviewer'), 'S-1')?.harness).toBe('codex');
    expect(assignedAgent(withAssignment(team, 'S-1', 'gone'), 'S-1')).toBeUndefined();
    expect(assignedAgent(team, 'S-9')).toBeUndefined();
  });

  it('resolves an installed CLI assigned by its id when there is no roster', () => {
    expect(assignedAgent(withAssignment(EMPTY_TEAM, 'S-1', 'codex'), 'S-1')).toMatchObject({ harness: 'codex' });
  });
});

describe('withAssignment', () => {
  it('assigns and clears without mutating the original', () => {
    const assigned = withAssignment(EMPTY_TEAM, 'S-1', 'claude');
    expect(assigned.assignments).toEqual({ 'S-1': 'claude' });
    expect(EMPTY_TEAM.assignments).toEqual({});
    expect(withAssignment(assigned, 'S-1', null).assignments).toEqual({});
  });
});

describe('readAgentTeam / writeAgentTeam', () => {
  let dir: string | undefined;
  afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

  it('round-trips through the file and treats a missing file as an empty team', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-team-'));
    expect(readAgentTeam(dir)).toEqual({ team: EMPTY_TEAM, errors: [] });
    writeAgentTeam(dir, withAssignment(EMPTY_TEAM, 'S-1', 'claude'));
    expect(readAgentTeam(dir).team.assignments).toEqual({ 'S-1': 'claude' });
  });
});

describe('editing the team', () => {
  it('accepts a model id as CLIs print them and rejects anything else', () => {
    expect(validateAgent({ id: 'dev', name: 'Dev', harness: 'claude', model: 'claude-fable-5-1[1m]' })).toEqual({
      agent: { id: 'dev', name: 'Dev', harness: 'claude', model: 'claude-fable-5-1[1m]' },
    });
    expect(validateAgent({ id: 'dev', name: 'Dev', harness: 'opencode', model: 'opencode/big-pickle' })).toHaveProperty('agent');
    expect(validateAgent({ id: 'dev', name: 'Dev', harness: 'claude', model: 'sonnet; rm -rf /' })).toEqual({
      error: '"model" must be a model id such as "sonnet" or "opencode/big-pickle"',
    });
    expect(validateAgent({ id: 'dev', name: 'Dev', harness: 'claude', model: '' })).toEqual({ agent: { id: 'dev', name: 'Dev', harness: 'claude' } });
  });

  it('makes a unique id from the name', () => {
    expect(agentIdFor('Senior Reviewer!', new Set())).toBe('senior-reviewer');
    expect(agentIdFor('Dev', new Set(['dev', 'dev-2']))).toBe('dev-3');
    expect(agentIdFor('???', new Set())).toBe('agent');
  });

  it('adds, replaces and removes agents; removing unassigns their cards', () => {
    const { team } = parseAgentTeam(AGENT_TEAM_TEMPLATE);
    const added = withAgent(team, { id: 'qa', name: 'QA', harness: 'pi', model: 'anthropic/claude-haiku-4-5' });
    expect(added.agents.map((a) => a.id)).toEqual(['dev', 'reviewer', 'qa']);
    const renamed = withAgent(added, { id: 'qa', name: 'Tester', harness: 'pi' });
    expect(renamed.agents.find((a) => a.id === 'qa')).toEqual({ id: 'qa', name: 'Tester', harness: 'pi' });
    const removed = withoutAgent(withAssignment(renamed, 'S-1', 'qa'), 'qa');
    expect(removed.agents.map((a) => a.id)).toEqual(['dev', 'reviewer']);
    expect(removed.assignments).toEqual({});
  });

  it('keeps cards assigned to an installed CLI when the first named agent is added', () => {
    const team = withAgent(withAssignment(EMPTY_TEAM, 'S-1', 'codex'), { id: 'dev', name: 'Dev', harness: 'claude' });
    expect(team.agents.map((a) => a.id)).toEqual(['codex', 'dev']);
    expect(assignedAgent(team, 'S-1')).toMatchObject({ harness: 'codex' });
  });
});

describe('role, instructions and lead', () => {
  it('keeps role and instructions, trimmed, and rejects oversized ones', () => {
    expect(validateAgent({ id: 'dev', name: 'Dev', harness: 'claude', role: ' Implements stories ', instructions: ' Add a test for every change. ' }))
      .toEqual({ agent: { id: 'dev', name: 'Dev', harness: 'claude', role: 'Implements stories', instructions: 'Add a test for every change.' } });
    expect(validateAgent({ id: 'dev', name: 'Dev', harness: 'claude', role: 'x'.repeat(121) })).toEqual({ error: '"role" must be up to 120 characters' });
    expect(validateAgent({ id: 'dev', name: 'Dev', harness: 'claude', instructions: 'x'.repeat(4001) })).toEqual({ error: '"instructions" must be up to 4000 characters' });
  });

  it('allows one lead: the first in the file keeps it', () => {
    const { team, errors } = parseAgentTeam(JSON.stringify({ agents: [
      { id: 'lead', name: 'Lead', harness: 'claude', lead: true },
      { id: 'other', name: 'Other', harness: 'codex', lead: true },
    ] }));
    expect(leadAgent(team)?.id).toBe('lead');
    expect(team.agents[1]).toEqual({ id: 'other', name: 'Other', harness: 'codex' });
    expect(errors[0]).toMatch(/only one agent can be the lead/);
  });

  it('moves the lead when another agent is made lead', () => {
    const { team } = parseAgentTeam(JSON.stringify({ agents: [{ id: 'a', name: 'A', harness: 'claude', lead: true }, { id: 'b', name: 'B', harness: 'codex' }] }));
    const moved = withAgent(team, { id: 'b', name: 'B', harness: 'codex', lead: true });
    expect(moved.agents.map((a) => [a.id, a.lead === true])).toEqual([['a', false], ['b', true]]);
  });
});
