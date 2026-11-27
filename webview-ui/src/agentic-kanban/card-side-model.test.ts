import { describe, it, expect } from 'vitest';
import type { KanbanItem } from '../components/kanban/KanbanTypes';
import { cardState, checkLabel, runsOn, stepLabel } from './card-side-model';
import type { AgentTeamView } from './agent-team-view';

const card = (over: Partial<KanbanItem> = {}): KanbanItem => ({ id: 'S-1', key: 'S-1', title: 'Login', status: 'ready-for-dev', type: 'story', isEpic: false, ...over });
const NOW = Date.parse('2026-11-27T10:20:00Z');

describe('cardState', () => {
  it('puts your answer first when the agent asked something', () => {
    expect(cardState(card({ agentState: { status: 'running' } }), { questions: 2, agentName: 'Amelia' }))
      .toEqual({ tone: 'waiting', title: 'Waiting for your answer', detail: 'Amelia asked 2 questions' });
  });

  it('says who is working, for how long, and their latest line', () => {
    const state = cardState(card({ agentState: { status: 'running', startedAt: '2026-11-27T10:16:00Z' }, progressLine: 'running tests' }), { agentName: 'Amelia', now: NOW });
    expect(state).toEqual({ tone: 'working', title: 'Amelia is working · 4m', detail: 'running tests' });
  });

  it('names why a run stopped', () => {
    const failure = { kind: 'signed-out', title: 'The agent is signed out', detail: 'Sign in and retry.', actions: [] };
    expect(cardState(card({ agentState: { status: 'interrupted', failure } }))).toEqual({ tone: 'stopped', title: 'Stopped: The agent is signed out', detail: 'Sign in and retry.' });
  });

  it('reads the column when no agent is busy', () => {
    expect(cardState(card({ status: 'review' })).tone).toBe('review');
    expect(cardState(card({ status: 'done' })).title).toBe('Done');
    expect(cardState(card({ blockedBy: 1 })).title).toBe('Blocked by other cards');
    expect(cardState(card()).title).toBe('Not started');
  });

  it('never talks about agents on a card a person works', () => {
    expect(cardState(card({ assignee: { id: 'p', name: 'Sara', person: true }, agentState: { status: 'running' } })).title).toBe('Sara works this by hand');
  });
});

describe('labels', () => {
  it('turns run steps and checks into words', () => {
    expect(stepLabel('aac-kanban-dev-executor')).toBe('Implement');
    expect(stepLabel('aac-some-new-step')).toBe('Some new step');
    expect(checkLabel('schema-conformance')).toBe('Fits the artifact schema');
    expect(checkLabel('story-has-tests')).toBe('Story has tests');
  });
});

describe('runsOn', () => {
  const team: AgentTeamView = {
    agents: [{ id: 'dev', name: 'Dev', harness: 'claude', model: 'sonnet' }, { id: 'sara', name: 'Sara', harness: 'none', kind: 'person' }],
    assignments: { 'S-1': 'dev', 'S-2': 'sara' },
    rosterDefined: true,
    installed: [{ id: 'claude', label: 'Claude Code', acceptsModel: true, listsModels: true }],
  };

  it('names the CLI and model of the assigned agent', () => {
    expect(runsOn(team, 'S-1')).toBe('Claude Code · sonnet');
  });

  it('falls back to the provider of the last run, and says nothing for a person', () => {
    expect(runsOn(team, 'S-9', 'claude')).toBe('Claude Code');
    expect(runsOn(team, 'S-2', 'claude')).toBeUndefined();
    expect(runsOn(undefined, 'S-9')).toBeUndefined();
  });
});
