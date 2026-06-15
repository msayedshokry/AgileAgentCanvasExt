// ─── Unit tests: kanban-orchestrator ───────────────────────────────────────────
// Covers: runAutonomous with a successful dev+review verdict chain returns
// {ok:true, status:'complete'} (happy path) and returns blocked when the
// dev gate is not COMPLETED (most common error path).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KanbanOrchestrator } from './kanban-orchestrator';
import { concurrencyQueue } from './concurrency-queue';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('./circuit-breaker', () => ({
  circuitBreaker: {
    canRun: vi.fn(() => true),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  },
}));

vi.mock('./budget-enforcer', () => ({
  budgetEnforcer: {
    canStart: vi.fn(() => true),
    getStatus: vi.fn(() => ({ bannerMessage: undefined })),
  },
}));

vi.mock('./auto-retry-engine', () => ({
  autoRetryEngine: {
    run: vi.fn(async (_id: string, work: () => Promise<void>) => {
      try {
        await work();
        return { succeeded: true, attempts: [], finalCategory: 'unknown' as const, totalAttempts: 1, storyId: _id };
      } catch (err) {
        return { succeeded: false, attempts: [{ error: err }], finalCategory: 'transient' as const, totalAttempts: 1, storyId: _id };
      }
    }),
  },
}));

vi.mock('./autonomous-git', () => ({
  autonomousGit: {
    maybeBranch: vi.fn(async () => {}),
    maybeCommit: vi.fn(async () => {}),
    maybePR: vi.fn(async () => {}),
  },
}));

vi.mock('./terminal-health-checks', () => ({
  createChatHealthChecks: () => [
    { label: 'chat-output-progress', check: async () => 'healthy' as const },
    { label: 'chat-artifact-change', check: async () => 'healthy' as const },
  ],
}));

vi.mock('./agent-health-monitor', () => ({
  agentHealthMonitor: {
    registerCheck: vi.fn(),
    deregisterCheck: vi.fn(),
  },
}));



// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeStore() {
  return {
    findArtifactById: vi.fn((id: string) => ({ artifact: { id, type: 'story', title: id } })),
    updateArtifact: vi.fn(async () => {}),
  } as any;
}

function fakeExecutor() {
  return {
    getWorkflowSkillContent: vi.fn(() => ''),
    executeLaneTransition: vi.fn(),
  } as any;
}

function fakeTerminalExecutor() {
  return {
    executeAndAwaitVerdict: vi.fn(),
  } as any;
}

describe('KanbanOrchestrator', () => {
  beforeEach(() => {
    concurrencyQueue.releaseAll();
  });

  it('happy: dev COMPLETED + review APPROVED → returns ok and reaches done (chat path)', async () => {
    const executor = fakeExecutor();
    vi.mocked(executor.executeLaneTransition)
      .mockResolvedValueOnce({ verdict: 'COMPLETED' })
      .mockResolvedValueOnce({ verdict: 'APPROVED' });
    const store = fakeStore();
    const orch = new KanbanOrchestrator(store, executor, fakeTerminalExecutor());

    // Pass model + stream context to trigger the chat path
    const ctx = { model: { name: 'gpt-4o' } as any, stream: { markdown: vi.fn() } as any };
    const result = await orch.runAutonomous({ id: 'S-1', type: 'story' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.status).toBe('complete');
    // The store was updated to in-progress, then review, then done
    const updates = vi.mocked(store.updateArtifact).mock.calls.map((c: any[]) => c[2].status);
    expect(updates).toEqual(['in-progress', 'review', 'done']);
  });

  it('happy: uses executeAndAwaitVerdict for terminal path (no chat context)', async () => {
    const executor = fakeExecutor();
    const terminalExec = fakeTerminalExecutor();
    vi.mocked(terminalExec.executeAndAwaitVerdict)
      .mockResolvedValueOnce({ verdict: 'COMPLETED' })
      .mockResolvedValueOnce({ verdict: 'APPROVED' });
    const store = fakeStore();
    const orch = new KanbanOrchestrator(store, executor, terminalExec);

    // Pass empty context (no model/stream) — triggers terminal path
    const result = await orch.runAutonomous({ id: 'S-1', type: 'story' }, {});
    expect(result.ok).toBe(true);
    expect(result.status).toBe('complete');
    // Should have called terminal path, not chat path
    expect(terminalExec.executeAndAwaitVerdict).toHaveBeenCalledTimes(2);
    expect(executor.executeLaneTransition).not.toHaveBeenCalled();
  });

  it('happy: uses executeLaneTransition for chat path (with model + stream)', async () => {
    const executor = fakeExecutor();
    vi.mocked(executor.executeLaneTransition)
      .mockResolvedValueOnce({ verdict: 'COMPLETED' })
      .mockResolvedValueOnce({ verdict: 'APPROVED' });
    const store = fakeStore();
    const orch = new KanbanOrchestrator(store, executor, fakeTerminalExecutor());

    // Pass chat context — triggers chat path
    const ctx = { model: { name: 'gpt-4o' } as any, stream: { markdown: vi.fn() } as any };
    const result = await orch.runAutonomous({ id: 'S-1', type: 'story' }, ctx);
    expect(result.ok).toBe(true);
    expect(executor.executeLaneTransition).toHaveBeenCalled();
  });

  it('error: dev gate returning BLOCKED stops the loop with ok:false', async () => {
    const executor = fakeExecutor();
    vi.mocked(executor.executeLaneTransition)
      .mockResolvedValueOnce({ verdict: 'BLOCKED', summary: 'entry gate failed' });
    const store = fakeStore();
    const orch = new KanbanOrchestrator(store, executor, fakeTerminalExecutor());

    // Pass model + stream context to trigger the chat path
    const ctx = { model: { name: 'gpt-4o' } as any, stream: { markdown: vi.fn() } as any };
    const result = await orch.runAutonomous({ id: 'S-2', type: 'story' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.blockedBy?.[0]).toMatch(/BLOCKED/);
  });
});
