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

describe('KanbanOrchestrator', () => {
  beforeEach(() => {
    concurrencyQueue.releaseAll();
  });

  it('happy: dev COMPLETED + review APPROVED → returns ok and reaches done', async () => {
    const executor = fakeExecutor();
    vi.mocked(executor.executeLaneTransition)
      .mockResolvedValueOnce({ verdict: 'COMPLETED' })
      .mockResolvedValueOnce({ verdict: 'APPROVED' });
    const store = fakeStore();
    const orch = new KanbanOrchestrator(store, executor);

    const result = await orch.runAutonomous({ id: 'S-1', type: 'story' }, {});
    expect(result.ok).toBe(true);
    expect(result.status).toBe('complete');
    // The store was updated to in-progress, then review, then done
    const updates = vi.mocked(store.updateArtifact).mock.calls.map((c: any[]) => c[2].status);
    expect(updates).toEqual(['in-progress', 'review', 'done']);
  });

  it('error: dev gate returning BLOCKED stops the loop with ok:false', async () => {
    const executor = fakeExecutor();
    vi.mocked(executor.executeLaneTransition)
      .mockResolvedValueOnce({ verdict: 'BLOCKED', summary: 'entry gate failed' });
    const store = fakeStore();
    const orch = new KanbanOrchestrator(store, executor);

    const result = await orch.runAutonomous({ id: 'S-2', type: 'story' }, {});
    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.blockedBy?.[0]).toMatch(/BLOCKED/);
  });
});
