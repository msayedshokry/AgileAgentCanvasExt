// Team runs follow the squad protocol: the coordinator routes, members hand
// off notes, and a gate that requests changes sends the work back once.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({}));
const sessions = vi.hoisted(() => ({
  replies: {} as Record<string, string[]>,
  tasks: [] as Array<{ role: string; task: string }>,
}));
vi.mock('./session-manager', () => ({
  acpSessionManager: {
    spawn: vi.fn(async (spec: { role: string; context: { task: string } }) => {
      sessions.tasks.push({ role: spec.role, task: spec.context.task });
      return { id: `s-${sessions.tasks.length}`, role: spec.role };
    }),
    execute: vi.fn(async (id: string, _m: unknown, _s: unknown, stream: { markdown: (t: string) => void }) => {
      const role = sessions.tasks[Number(id.slice(2)) - 1].role;
      stream.markdown(sessions.replies[role]?.shift() ?? `${role} done`);
      return { sessionId: id, role, status: 'completed', output: undefined, toolCalls: 1, startedAt: '', completedAt: '', events: [] };
    }),
  },
}));
vi.mock('./agent-bus/agent-registry', () => ({ agentRegistry: { register: vi.fn(), updateStatus: vi.fn(), unregister: vi.fn() } }));
vi.mock('./agent-bus/message-bus', () => ({ agentMessageBus: { subscribe: vi.fn(), unsubscribeAgent: vi.fn(), publish: vi.fn(async () => {}) } }));
vi.mock('../trace/trace-recorder', () => ({ getTraceRecorder: () => ({ record: vi.fn() }) }));
vi.mock('../chat/ai-provider', () => ({}));
vi.mock('../workflow/budget-enforcer', () => ({ budgetEnforcer: { canStart: () => true, getStatus: () => ({}) } }));

import { AgentTeamOrchestrator } from './team-orchestrator';

const shown: string[] = [];
const stream = { markdown: (t: string) => { shown.push(t); } };
const run = (teamId: string) => new AgentTeamOrchestrator().executeTeam(
  teamId, 'Write the login story', { id: `S-${teamId}`, type: 'story' }, {} as never, {}, '', stream as never, undefined as never);

beforeEach(() => {
  sessions.replies = {};
  sessions.tasks = [];
  shown.length = 0;
});

describe('squad protocol in executeTeam', () => {
  it('gives every member its brief and the earlier members\' notes, and returns their text', async () => {
    sessions.replies = { coordinator: ['Plan: one story.'], crafter: ['Wrote the story.'], gate: ['VERDICT: APPROVED'] };
    const results = await run('create-story');
    expect(sessions.tasks.map((t) => t.role)).toEqual(['coordinator', 'crafter', 'gate']);
    expect(sessions.tasks[1].task).toContain('You are the crafter');
    expect(sessions.tasks[2].task).toContain('### From the coordinator\nPlan: one story.');
    expect(sessions.tasks[2].task).toContain('### From the crafter\nWrote the story.');
    expect(results.map((r) => r.output)).toEqual(['Plan: one story.', 'Wrote the story.', 'VERDICT: APPROVED']);
  });

  it('skips the members the coordinator did not route to', async () => {
    sessions.replies = { coordinator: ['Trivial.\nNEXT: gate'], gate: ['VERDICT: APPROVED'] };
    await run('create-story');
    expect(sessions.tasks.map((t) => t.role)).toEqual(['coordinator', 'gate']);
    expect(shown.join('')).toContain('coordinator skipped: crafter');
  });

  it('sends requested changes back to the crafter once', async () => {
    sessions.replies = {
      gate: ['VERDICT: CHANGES_REQUESTED\n- add acceptance criteria', 'VERDICT: CHANGES_REQUESTED\n- still missing'],
    };
    await run('create-story');
    expect(sessions.tasks.map((t) => t.role)).toEqual(['coordinator', 'crafter', 'gate', 'crafter', 'gate']);
    expect(sessions.tasks[3].task).toContain('- add acceptance criteria');
  });
});
