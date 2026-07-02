// ─── Unit tests: kanban-orchestrator ───────────────────────────────────────────
// Covers: runAutonomous with a successful dev+review verdict chain returns
// {ok:true, status:'complete'} (happy path) and returns blocked when the
// dev gate is not COMPLETED (most common error path).
//
// Issue #32 reviewer followup: chat-path ctx must include a tracker now
// (requireChatPathContext throws if `model`/`stream` are set without one).
// We supply a no-op tracker stub in every chat-path test fixture.

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

vi.mock('./terminal-health-checks', () => {
  // Tiny internal tracker stub mirrors the ChatProgressTracker contract
  // (markActivity / getLastActivity / getActivityCount) so the
  // requireChatPathContext pass-through mock below can satisfy its
  // \"is a tracker\" check.
  class TrackerStub {
    private lastAt = Date.now();
    private count = 0;
    markActivity() { this.lastAt = Date.now(); this.count++; }
    getLastActivity() { return this.lastAt; }
    getActivityCount() { return this.count; }
  }

  return {
    createChatHealthChecks: () => [
      { label: 'chat-output-progress', check: async () => 'healthy' as const },
      { label: 'chat-artifact-change', check: async () => 'healthy' as const },
    ],
    // Issue #32: real impl exports ChatProgressTracker for the chat-path
    // Proxy wrapper; the mock must expose the same surface or the chat
    // branch will throw at module-load time when the orchestrator imports it.
    ChatProgressTracker: TrackerStub,
    // Issue #32 reviewer followup: requireChatPathContext narrows ctx into
    // a ChatPathContext-like object. Real impl throws if model+stream are
    // set without tracker. Pass-through mock mirrors that contract.
    requireChatPathContext: (ctx: any) => {
      if (!ctx?.model || !ctx?.stream) return null;
      if (!ctx?.tracker || typeof ctx.tracker.markActivity !== 'function') {
        throw new Error('Chat path requires tracker');
      }
      return ctx;
    },
  };
});

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

/** Build a no-op ChatProgressTracker stub for chat-path ctx fixtures. */
function noopTrackerStub() {
  return {
    markActivity: vi.fn(),
    getLastActivity: vi.fn(() => Date.now()),
    getActivityCount: vi.fn(() => 0),
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

    // Pass model + stream + tracker (#32 supplier contract): trigger the chat path
    const ctx = {
      model: { name: 'gpt-4o' } as any,
      stream: { markdown: vi.fn() } as any,
      tracker: noopTrackerStub(),
    };
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

  it('happy: uses executeLaneTransition for chat path (with model + stream + tracker)', async () => {
    const executor = fakeExecutor();
    vi.mocked(executor.executeLaneTransition)
      .mockResolvedValueOnce({ verdict: 'COMPLETED' })
      .mockResolvedValueOnce({ verdict: 'APPROVED' });
    const store = fakeStore();
    const orch = new KanbanOrchestrator(store, executor, fakeTerminalExecutor());

    // Pass chat context — triggers chat path. #32 supplier contract:
    // tracker required when model+stream are present.
    const ctx = {
      model: { name: 'gpt-4o' } as any,
      stream: { markdown: vi.fn() } as any,
      tracker: noopTrackerStub(),
    };
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

    // Pass model + stream + tracker: trigger the chat path
    const ctx = {
      model: { name: 'gpt-4o' } as any,
      stream: { markdown: vi.fn() } as any,
      tracker: noopTrackerStub(),
    };
    const result = await orch.runAutonomous({ id: 'S-2', type: 'story' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.blockedBy?.[0]).toMatch(/BLOCKED/);
  });

  // ponytail: regression for the "Dev gate returned UNKNOWN — card stuck in
  // in-progress forever" bug. stop() must revert the artifact so the user
  // can re-drag to retry instead of abandoning entirely.
  it('regression: dev gate BLOCKED reverts the card from in-progress to ready-for-dev', async () => {
    const executor = fakeExecutor();
    vi.mocked(executor.executeLaneTransition)
      .mockResolvedValueOnce({ verdict: 'BLOCKED', summary: 'entry gate failed' });
    let currentStatus = 'in-progress';
    const store = {
      findArtifactById: vi.fn((id: string) => ({ artifact: { id, type: 'story', title: id, status: currentStatus } })),
      updateArtifact: vi.fn(async (_t: string, _id: string, patch: any) => {
        if (patch && typeof patch.status === 'string') currentStatus = patch.status;
      }),
    } as any;
    const orch = new KanbanOrchestrator(store, executor, fakeTerminalExecutor());

    await orch.runAutonomous({ id: 'S-revert', type: 'story' }, {
      model: { name: 'gpt-4o' } as any,
      stream: { markdown: vi.fn() } as any,
      tracker: noopTrackerStub(),
    } as any);

    expect(currentStatus).toBe('ready-for-dev');
  });

  it('regression: review gate UNKNOWN reverts the card from review to in-progress (dev completed)', async () => {
    const executor = fakeExecutor();
    // ponytail: orchestrator fires ONE retry on UNKNOWN (gap #47), so the
    // mock needs to queue two UNKNOWNs — first call returns UNKNOWN, the
    // retry also returns UNKNOWN, then stop() finally sees UNKNOWN.
    vi.mocked(executor.executeLaneTransition)
      .mockResolvedValueOnce({ verdict: 'COMPLETED' }) // dev passes
      .mockResolvedValueOnce({ verdict: 'UNKNOWN', summary: 'review CLI exited without writing verdict' })
      .mockResolvedValueOnce({ verdict: 'UNKNOWN', summary: 'review CLI exited without writing verdict' });
    let currentStatus = 'ready-for-dev';
    const store = {
      findArtifactById: vi.fn((id: string) => ({ artifact: { id, type: 'story', title: id, status: currentStatus } })),
      updateArtifact: vi.fn(async (_t: string, _id: string, patch: any) => {
        if (patch && typeof patch.status === 'string') currentStatus = patch.status;
      }),
    } as any;
    const orch = new KanbanOrchestrator(store, executor, fakeTerminalExecutor());

    await orch.runAutonomous({ id: 'S-review-revert', type: 'story' }, {
      model: { name: 'gpt-4o' } as any,
      stream: { markdown: vi.fn() } as any,
      tracker: noopTrackerStub(),
    } as any);

    expect(currentStatus).toBe('in-progress');
  });

  it('#32 supplier contract: chat path with missing tracker → UNKNOWN verdict (autoRetryEngine absorbs the synchronous throw)', async () => {
    // NOTE on shape: the orchestrator wraps the chat-step in autoRetryEngine.run,
    // which catches the synchronous throw from requireChatPathContext and converts
    // it into a { succeeded:false, attempts:[{error}] } result. The orchestrator
    // then surfaces this as a UNKNOWN verdict + circuit-breaker record. So we
    // assert the verdict, not a literal rejection.
    const executor = fakeExecutor();
    const store = fakeStore();
    const orch = new KanbanOrchestrator(store, executor, fakeTerminalExecutor());

    const ctx = {
      model: { name: 'gpt-4o' } as any,
      stream: { markdown: vi.fn() } as any,
      // tracker deliberately omitted — must surface as a non-ok verdict
    };

    // Note: TS fully accepts ctx without `tracker` here because the
    // orchestrator uses `chatInputs!` (non-null assertion) so no narrowing
    // error fires. The runtime still throws via requireChatPathContext,
    // which autoRetryEngine absorbs and surfaces as the verdict below.
    const result = await orch.runAutonomous({ id: 'S-3', type: 'story' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    // blockedBy[0] is the retry-engine's `'Retries exhausted: <err>'` summary;
    // it should reference the tracker-requirement error somewhere.
    const diagnostic = JSON.stringify(result.blockedBy);
    expect(diagnostic.toLowerCase()).toMatch(/tracker/i);
  });
});
