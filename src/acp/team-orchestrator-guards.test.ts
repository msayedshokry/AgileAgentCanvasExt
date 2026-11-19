// Team runs share the Kanban guardrails: one agent per artifact, spend caps.
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('vscode', () => ({}));
vi.mock('./session-manager', () => ({ acpSessionManager: {} }));
vi.mock('./agent-bus/agent-registry', () => ({ agentRegistry: { register: vi.fn(), deregister: vi.fn() } }));
vi.mock('./agent-bus/message-bus', () => ({ agentMessageBus: { subscribe: vi.fn(), unsubscribe: vi.fn() } }));
vi.mock('./agent-bus/handoff-negotiation', () => ({ handoffNegotiation: {} }));
vi.mock('../trace/trace-recorder', () => ({ getTraceRecorder: () => ({ record: vi.fn() }) }));
vi.mock('../chat/ai-provider', () => ({}));
const budget = vi.hoisted(() => ({ canStart: true }));
vi.mock('../workflow/budget-enforcer', () => ({
  budgetEnforcer: {
    canStart: () => budget.canStart,
    getStatus: () => ({ bannerMessage: 'Daily budget exhausted' }),
  },
}));

import { AgentTeamOrchestrator } from './team-orchestrator';
import { concurrencyQueue } from '../workflow/concurrency-queue';

const run = (orch: AgentTeamOrchestrator) =>
  orch.executeTeam('brainstorming', 'task', { id: 'S-7', type: 'story' }, {} as never, {}, '', undefined as never, undefined as never);

afterEach(() => {
  concurrencyQueue.release('S-7');
  budget.canStart = true;
});

describe('AgentTeamOrchestrator guardrails', () => {
  it('refuses to work an artifact another agent holds', async () => {
    concurrencyQueue.tryAcquire('S-7', 'kanban-orchestrator', 'r1');
    await expect(run(new AgentTeamOrchestrator())).rejects.toThrow(/already being worked on/);
  });

  it('refuses to start when the budget is exhausted', async () => {
    budget.canStart = false;
    await expect(run(new AgentTeamOrchestrator())).rejects.toThrow('Daily budget exhausted');
    expect(concurrencyQueue.isLocked('S-7')).toBe(false);
  });
});
