// ─── End-to-End Integration Test: Autonomous Loop ─────────────────────────────
// Exercises the full scheduler→orchestrator→terminal→verdict→done pipeline with
// real module wiring and mocked external interfaces. This is the closest we can
// get to a production run without spawning actual VS Code terminals or Copilot
// chat sessions.
//
// Flow under test:
//   AutoScheduler (poll) → picks ready-for-dev story →
//   KanbanOrchestrator.runAutonomous() (via scheduler runner callback) →
//     runStepGuarded() → terminalExecutor.executeAndAwaitVerdict() → COMPLETED →
//     runStepGuarded() → terminalExecutor.executeAndAwaitVerdict() → APPROVED →
//   artifact reaches "done" status
//
// Verification:
//   - Story transitions: ready-for-dev → in-progress → review → done
//   - kanbanProgress events emitted at each step
//   - Concurrency lock acquired/released
//   - Circuit breaker / budget guards respected

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks (shared across tests) ─────────────────────────────────────

const capturedProgressEvents = vi.hoisted(() => ({ events: [] as any[] }));

const mockCircuitBreaker = vi.hoisted(() => ({
  canRun: vi.fn(() => true),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  getStatus: vi.fn(() => undefined),
  reset: vi.fn(),
  resetAll: vi.fn(),
  listAll: vi.fn(() => [] as any[]),
  listOpen: vi.fn(() => [] as any[]),
}));

const mockBudgetEnforcer = vi.hoisted(() => ({
  canStart: vi.fn(() => true),
  getStatus: vi.fn(() => ({
    perStory: { used: 0, cap: 0, exceeded: false },
    daily: { used: 0, cap: 0, exceeded: false },
    anyExceeded: false,
    bannerMessage: null as string | null,
    remaining: -1,
  })),
  isPaused: vi.fn(() => false),
  setConfig: vi.fn(),
  getConfig: vi.fn(() => ({ budgetPerStory: 0, budgetDaily: 0 })),
  recordSpend: vi.fn(),
  unpause: vi.fn(),
  formatGauge: vi.fn(() => '$0.00 / $0.00 (0%)'),
}));

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('./circuit-breaker', () => ({ circuitBreaker: mockCircuitBreaker }));
vi.mock('./budget-enforcer', () => ({ budgetEnforcer: mockBudgetEnforcer }));

// These modules are imported by kanban-orchestrator but not directly tested
vi.mock('./autonomous-git', () => ({
  autonomousGit: {
    setConfig: vi.fn(),
    setRunner: vi.fn(),
    setHooks: vi.fn(),
    maybeBranch: vi.fn(async () => null),
    maybeCommit: vi.fn(async () => null),
    maybePR: vi.fn(async () => null),
  },
}));

vi.mock('./terminal-health-checks', () => ({
  createChatHealthChecks: () => [
    { label: 'chat-session-elapsed', check: async () => 'healthy' as const },
  ],
}));

vi.mock('./agent-health-monitor', () => ({
  agentHealthMonitor: {
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: vi.fn(() => false),
    registerCheck: vi.fn(),
    deregisterCheck: vi.fn(),
    getState: vi.fn(() => 'healthy' as const),
    resetSession: vi.fn(),
  },
}));

// ── Imports (after mocks are established) ───────────────────────────────────

import { KanbanOrchestrator, kanbanProgress } from './kanban-orchestrator';
import { autoScheduler } from './auto-scheduler';
import { concurrencyQueue } from './concurrency-queue';
import { autonomousGit } from './autonomous-git';

// ── Helpers ──────────────────────────────────────────────────────────────────

interface TestArtifact {
  id: string;
  type: string;
  title: string;
  status: string;
  priority: string;
  metadata?: Record<string, unknown>;
}

function createTestStore(epics: any[] = []) {
  return {
    getState: vi.fn(() => ({ epics })),
    findArtifactById: vi.fn((id: string) => {
      for (const epic of epics) {
        for (const story of epic.stories ?? []) {
          if (story.id === id) return { artifact: story };
        }
      }
      return undefined;
    }),
    createStory: vi.fn(() => ({ id: 'new-story-1' })),
    updateArtifact: vi.fn(async () => {}),
    onDidChangeArtifacts: vi.fn(() => ({ dispose: vi.fn() })),
  } as any;
}

function makeStories(): { epics: any[]; story: TestArtifact } {
  const story: TestArtifact = {
    id: 'S-1',
    type: 'story',
    title: 'Implement login',
    status: 'ready-for-dev',
    priority: 'P1',
  };
  return {
    epics: [{ id: 'E-1', stories: [story] }],
    story,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Autonomous loop: KanbanOrchestrator + terminal executor integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProgressEvents.events = [];
    concurrencyQueue.releaseAll();

    mockCircuitBreaker.canRun.mockReturnValue(true);
    mockBudgetEnforcer.canStart.mockReturnValue(true);
  });

  afterEach(() => {
    concurrencyQueue.releaseAll();
  });

  it('full terminal autonomous loop: ready-for-dev → COMPLETED → APPROVED → done', async () => {
    const { epics, story } = makeStories();
    const store = createTestStore(epics);

    const terminalExecutor = {
      executeAndAwaitVerdict: vi.fn()
        .mockResolvedValueOnce({ verdict: 'COMPLETED', summary: 'Implementation done' })
        .mockResolvedValueOnce({ verdict: 'APPROVED', summary: 'Review passed' }),
    } as any;

    const executor = { executeLaneTransition: vi.fn() } as any;
    const orch = new KanbanOrchestrator(store, executor, terminalExecutor);

    const progressDisposable = kanbanProgress.event((evt) => {
      capturedProgressEvents.events.push(evt);
    });

    try {
      const result = await orch.runAutonomous(story, {});

      expect(result.ok).toBe(true);
      expect(result.status).toBe('complete');

      // Called executeAndAwaitVerdict twice: dev + review
      expect(terminalExecutor.executeAndAwaitVerdict).toHaveBeenCalledTimes(2);
      // First call: dev workflow with artifact + store
      expect(terminalExecutor.executeAndAwaitVerdict).toHaveBeenNthCalledWith(
        1, 'aac-kanban-dev-executor', story, store,
      );

      // Chat path NOT called
      expect(executor.executeLaneTransition).not.toHaveBeenCalled();

      // Store updates: in-progress → review → done
      const updates = vi.mocked(store.updateArtifact).mock.calls.map((c: any[]) => c[2].status);
      expect(updates).toEqual(['in-progress', 'review', 'done']);

      // Progress events emitted (running, completed)
      expect(capturedProgressEvents.events.length).toBeGreaterThanOrEqual(3);
      const statuses = capturedProgressEvents.events.map((e: any) => e.agentState.status);
      expect(statuses).toContain('running');
      expect(statuses).toContain('completed');

      // Concurrency lock released
      expect(concurrencyQueue.isLocked(story.id)).toBe(false);

      // Circuit breaker recorded success
      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalled();
    } finally {
      progressDisposable.dispose();
    }
  });

  it('uses chat path when model + stream are provided', async () => {
    const { epics, story } = makeStories();
    const store = createTestStore(epics);

    const terminalExecutor = { executeAndAwaitVerdict: vi.fn() } as any;
    const executor = {
      executeLaneTransition: vi.fn()
        .mockResolvedValueOnce({ verdict: 'COMPLETED' })
        .mockResolvedValueOnce({ verdict: 'APPROVED' }),
    } as any;

    const orch = new KanbanOrchestrator(store, executor, terminalExecutor);

    const ctx = { model: { name: 'gpt-4o' } as any, stream: { markdown: vi.fn() } as any };
    const result = await orch.runAutonomous(story, ctx);

    expect(result.ok).toBe(true);
    expect(executor.executeLaneTransition).toHaveBeenCalledTimes(2);
    expect(terminalExecutor.executeAndAwaitVerdict).not.toHaveBeenCalled();
  });

  it('BLOCKED dev gate stops the loop', async () => {
    const { epics, story } = makeStories();
    const store = createTestStore(epics);

    const terminalExecutor = {
      executeAndAwaitVerdict: vi.fn()
        .mockResolvedValueOnce({ verdict: 'BLOCKED', summary: 'Entry gate failed' }),
    } as any;

    const executor = { executeLaneTransition: vi.fn() } as any;
    const orch = new KanbanOrchestrator(store, executor, terminalExecutor);

    const result = await orch.runAutonomous(story, {});

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.blockedBy?.[0]).toMatch(/BLOCKED/i);
    expect(terminalExecutor.executeAndAwaitVerdict).toHaveBeenCalledTimes(1);
  });

  it('NEEDS_FIXES → re-implement → APPROVED (iteration loop)', async () => {
    const { epics, story } = makeStories();
    const store = createTestStore(epics);

    // dev → COMPLETED, review → NEEDS_FIXES, dev → COMPLETED, review → APPROVED
    const terminalExecutor = {
      executeAndAwaitVerdict: vi.fn()
        .mockResolvedValueOnce({ verdict: 'COMPLETED', summary: 'Dev done' })
        .mockResolvedValueOnce({ verdict: 'NEEDS_FIXES', summary: 'Test coverage insufficient', fixRequests: [{ failing_criterion: 'Add unit tests' }] })
        .mockResolvedValueOnce({ verdict: 'COMPLETED', summary: 'Dev done (fixes)' })
        .mockResolvedValueOnce({ verdict: 'APPROVED', summary: 'All criteria met' }),
    } as any;

    const executor = { executeLaneTransition: vi.fn() } as any;
    const orch = new KanbanOrchestrator(store, executor, terminalExecutor);

    const progressDisposable = kanbanProgress.event((evt) => {
      capturedProgressEvents.events.push(evt);
    });

    try {
      const result = await orch.runAutonomous(story, {});

      expect(result.ok).toBe(true);
      expect(result.status).toBe('complete');
      expect(terminalExecutor.executeAndAwaitVerdict).toHaveBeenCalledTimes(4);

      // Store transitions: in-progress → review → in-progress → review → done
      const updates = vi.mocked(store.updateArtifact).mock.calls.map((c: any[]) => c[2].status);
      expect(updates.filter((s: string | undefined): s is string => !!s)).toEqual(['in-progress', 'review', 'in-progress', 'review', 'done']);

      // Fix requests attached to metadata
      const metadataCalls = vi.mocked(store.updateArtifact).mock.calls.filter((c: any[]) => c[2]?.metadata);
      expect(metadataCalls.length).toBeGreaterThanOrEqual(1);

      // Progress events emitted for each phase
      expect(capturedProgressEvents.events.length).toBeGreaterThanOrEqual(4);
    } finally {
      progressDisposable.dispose();
    }
  });

  it('circuit breaker guard stops before entering retry loop', async () => {
    mockCircuitBreaker.canRun.mockReturnValue(false);

    const { epics, story } = makeStories();
    const store = createTestStore(epics);
    const terminalExecutor = { executeAndAwaitVerdict: vi.fn() } as any;
    const executor = { executeLaneTransition: vi.fn() } as any;

    const orch = new KanbanOrchestrator(store, executor, terminalExecutor);
    const result = await orch.runAutonomous(story, {});

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.blockedBy?.[0]).toMatch(/Circuit breaker open/i);
    expect(terminalExecutor.executeAndAwaitVerdict).not.toHaveBeenCalled();
    expect(executor.executeLaneTransition).not.toHaveBeenCalled();
  });

  it('budget enforcer guard stops before entering retry loop', async () => {
    mockBudgetEnforcer.canStart.mockReturnValue(false);
    mockBudgetEnforcer.getStatus.mockReturnValue({
      bannerMessage: 'Daily budget of $5.00 exceeded',
      anyExceeded: true,
      perStory: { used: 0, cap: 5, exceeded: false },
      daily: { used: 5.01, cap: 5, exceeded: true },
      remaining: 0,
    });

    const { epics, story } = makeStories();
    const store = createTestStore(epics);
    const terminalExecutor = { executeAndAwaitVerdict: vi.fn() } as any;
    const executor = { executeLaneTransition: vi.fn() } as any;

    const orch = new KanbanOrchestrator(store, executor, terminalExecutor);
    const result = await orch.runAutonomous(story, {});

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.blockedBy?.[0]).toMatch(/Daily budget/i);
    expect(terminalExecutor.executeAndAwaitVerdict).not.toHaveBeenCalled();
    expect(executor.executeLaneTransition).not.toHaveBeenCalled();
  });
});

describe('Autonomous loop: AutoScheduler + orchestrator wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProgressEvents.events = [];
    concurrencyQueue.releaseAll();
    mockCircuitBreaker.canRun.mockReturnValue(true);
    mockBudgetEnforcer.canStart.mockReturnValue(true);
  });

  afterEach(() => {
    autoScheduler.stop();
    autoScheduler.removeAllListeners();
    concurrencyQueue.releaseAll();
  });

  it('scheduler picks ready-for-dev story and orchestrator runs it to done', async () => {
    const { epics, story } = makeStories();
    const store = createTestStore(epics);

    // Script terminal verdicts: COMPLETED → APPROVED
    const terminalExecutor = {
      executeAndAwaitVerdict: vi.fn()
        // First run of S-1: dev → COMPLETED, review → APPROVED
        .mockResolvedValueOnce({ verdict: 'COMPLETED', summary: 'Dev done' })
        .mockResolvedValueOnce({ verdict: 'APPROVED', summary: 'Review passed' })
        // Extra values consumed when scheduler re-picks S-1 after completion
        .mockResolvedValueOnce({ verdict: 'COMPLETED', summary: 'Dev done' })
        .mockResolvedValueOnce({ verdict: 'APPROVED', summary: 'Review passed' }),
    } as any;

    const executor = { executeLaneTransition: vi.fn() } as any;
    const orch = new KanbanOrchestrator(store, executor, terminalExecutor);

    // Wire the scheduler runner to call the orchestrator
    autoScheduler.setRunner(async (storyId: string): Promise<boolean> => {
      const found = store.findArtifactById(storyId);
      if (!found) return false;
      const result = await orch.runAutonomous(found.artifact, {});
      return result.ok;
    });

    // Seed stories — single story since the scheduler's internal stories array
    // is independent of the ArtifactStore and is not updated after completion.
    autoScheduler.setStories([
      { id: 'S-1', status: 'ready-for-dev', priority: 'P1' },
    ]);

    // Capture scheduler events
    const schedulerEvents: Array<{ type: string; data: any }> = [];
    const onStarted = (data: any) => schedulerEvents.push({ type: 'started', data });
    const onCompleted = (data: any) => schedulerEvents.push({ type: 'completed', data });
    const onQueueEmpty = () => schedulerEvents.push({ type: 'queueEmpty', data: {} });

    autoScheduler.on('started', onStarted);
    autoScheduler.on('completed', onCompleted);
    autoScheduler.on('queueEmpty', onQueueEmpty);

    try {
      // Start scheduler with fast poll
      autoScheduler.setPollIntervalMs(100);
      autoScheduler.setWipLimit(3);
      autoScheduler.start();

      // Wait for the scheduler to pick S-1 and run it through to done.
      // Note: the scheduler's internal stories array is independent of the
      // ArtifactStore, so after S-1 completes it remains 'ready-for-dev' in
      // the scheduler's view and gets re-picked. We only assert the first
      // completion cycle; queueEmpty is not guaranteed here.
      await vi.waitFor(
        () => {
          expect(schedulerEvents.filter(e => e.type === 'completed').length).toBeGreaterThanOrEqual(1);
          // Check that terminal executor was called (orchestrator ran)
          expect(terminalExecutor.executeAndAwaitVerdict).toHaveBeenCalled();
        },
        { timeout: 10000, interval: 100 },
      );

      // S-1 was started and completed
      const s1Started = schedulerEvents.some(e => e.type === 'started' && e.data.storyId === 'S-1');
      const s1Completed = schedulerEvents.some(e => e.type === 'completed' && e.data.storyId === 'S-1');
      expect(s1Started).toBe(true);
      expect(s1Completed).toBe(true);

      // Orchestrator executed terminal path (no chat context)
      expect(terminalExecutor.executeAndAwaitVerdict).toHaveBeenCalled();
      expect(executor.executeLaneTransition).not.toHaveBeenCalled();

      // Store was updated (orchestrator ran)
      expect(store.updateArtifact).toHaveBeenCalled();
    } finally {
      autoScheduler.off('started', onStarted);
      autoScheduler.off('completed', onCompleted);
      autoScheduler.off('queueEmpty', onQueueEmpty);
    }
  });

  it('scheduler skips story when circuit breaker is open', async () => {
    mockCircuitBreaker.canRun.mockReturnValue(false);

    const { epics } = makeStories();
    const store = createTestStore(epics);
    const terminalExecutor = { executeAndAwaitVerdict: vi.fn() } as any;
    const executor = { executeLaneTransition: vi.fn() } as any;
    const orch = new KanbanOrchestrator(store, executor, terminalExecutor);

    autoScheduler.setRunner((storyId: string): Promise<boolean> => {
      const found = store.findArtifactById(storyId);
      if (!found) return Promise.resolve(false);
      return orch.runAutonomous(found.artifact, {}).then(r => r.ok);
    });

    autoScheduler.setStories([{ id: 'S-1', status: 'ready-for-dev', priority: 'P1' }]);

    const schedulerEvents: Array<{ type: string; data: any }> = [];
    const onStart = (d: any) => schedulerEvents.push({ type: 'started', data: d });
    autoScheduler.on('started', onStart);

    try {
      autoScheduler.setPollIntervalMs(100);
      autoScheduler.setWipLimit(3);
      autoScheduler.start();

      // Wait several ticks — the orchestrator should return blocked immediately
      await new Promise(resolve => setTimeout(resolve, 500));

      // Either the story was never started (skipped by scheduler's own circuit check)
      // OR it was started but returned blocked immediately from orchestrator's early exit
      // In either case, terminal executor should NOT have been called
      expect(terminalExecutor.executeAndAwaitVerdict).not.toHaveBeenCalled();
      expect(executor.executeLaneTransition).not.toHaveBeenCalled();
    } finally {
      autoScheduler.off('started', onStart);
    }
  });

  it('full pipeline: scheduler → orchestrator → terminal → git commit + PR', async () => {
    const { epics, story } = makeStories();
    const store = createTestStore(epics);

    // Override git mocks to return success values
    vi.mocked(autonomousGit.maybeBranch).mockResolvedValue('aac/story-S-1');
    vi.mocked(autonomousGit.maybeCommit).mockResolvedValue('abc123');
    vi.mocked(autonomousGit.maybePR).mockResolvedValue('https://github.com/org/repo/pull/1');

    const terminalExecutor = {
      executeAndAwaitVerdict: vi.fn()
        .mockResolvedValueOnce({ verdict: 'COMPLETED', summary: 'Dev done' })
        .mockResolvedValueOnce({ verdict: 'APPROVED', summary: 'Review passed' }),
    } as any;

    const executor = { executeLaneTransition: vi.fn() } as any;
    const orch = new KanbanOrchestrator(store, executor, terminalExecutor);

    // Runner marks S-1 as 'done' in scheduler's stories array after
    // completion to prevent cascading re-picks.
    autoScheduler.setRunner(async (storyId: string): Promise<boolean> => {
      const found = store.findArtifactById(storyId);
      if (!found) return false;
      const result = await orch.runAutonomous(found.artifact, {});
      if (result.status === 'complete') {
        const stories = autoScheduler.getStories().map(s =>
          s.id === storyId ? { ...s, status: 'done' } : s,
        );
        autoScheduler.setStories(stories);
      }
      return result.ok;
    });

    autoScheduler.setStories([{ id: 'S-1', status: 'ready-for-dev', priority: 'P1' }]);

    const schedulerEvents: Array<{ type: string; storyId?: string }> = [];
    const onStarted = (d: { storyId: string }) => schedulerEvents.push({ type: 'started', storyId: d.storyId });
    const onCompleted = (d: { storyId: string }) => schedulerEvents.push({ type: 'completed', storyId: d.storyId });

    autoScheduler.on('started', onStarted);
    autoScheduler.on('completed', onCompleted);

    try {
      autoScheduler.setPollIntervalMs(100);
      autoScheduler.setWipLimit(1);
      autoScheduler.start();

      // Wait for S-1 to complete. The runner marks S-1 as 'done' in the
      // scheduler's internal stories array, preventing cascading re-picks.
      await vi.waitFor(
        () => expect(schedulerEvents.some(e => e.type === 'completed' && e.storyId === 'S-1')).toBe(true),
        { timeout: 10000, interval: 100 },
      );

      expect(schedulerEvents.some(e => e.type === 'started' && e.storyId === 'S-1')).toBe(true);

      // Terminal executor executed the dev + review steps
      expect(terminalExecutor.executeAndAwaitVerdict).toHaveBeenCalled();

      // ── Git assertions: each git op called exactly once with correct args ──
      expect(vi.mocked(autonomousGit.maybeBranch)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(autonomousGit.maybeBranch)).toHaveBeenCalledWith('S-1', expect.any(String));

      expect(vi.mocked(autonomousGit.maybeCommit)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(autonomousGit.maybeCommit)).toHaveBeenCalledWith('S-1', 'aac-kanban-dev-executor', expect.any(String));

      expect(vi.mocked(autonomousGit.maybePR)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(autonomousGit.maybePR)).toHaveBeenCalledWith('S-1', expect.any(String), expect.any(String), expect.any(String));

      // ── Ordering: maybeBranch → dev → maybeCommit → review → maybePR ──────
      const order = {
        branch: vi.mocked(autonomousGit.maybeBranch).mock.invocationCallOrder[0],
        dev: terminalExecutor.executeAndAwaitVerdict.mock.invocationCallOrder[0],
        commit: vi.mocked(autonomousGit.maybeCommit).mock.invocationCallOrder[0],
        review: terminalExecutor.executeAndAwaitVerdict.mock.invocationCallOrder[1],
        pr: vi.mocked(autonomousGit.maybePR).mock.invocationCallOrder[0],
      };
      expect(order.branch).toBeLessThan(order.dev);
      expect(order.dev).toBeLessThan(order.commit);
      expect(order.commit).toBeLessThan(order.review);
      expect(order.review).toBeLessThan(order.pr);

      // Chat path not used
      expect(executor.executeLaneTransition).not.toHaveBeenCalled();

      // Store updates: in-progress → review → done
      const updates = vi.mocked(store.updateArtifact).mock.calls.map((c: any[]) => c[2].status);
      expect(updates).toEqual(['in-progress', 'review', 'done']);

      // Circuit breaker recorded success
      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalled();
    } finally {
      autoScheduler.off('started', onStarted);
      autoScheduler.off('completed', onCompleted);
      // Reset git mocks back to null-returning default for subsequent tests
      vi.mocked(autonomousGit.maybeBranch).mockImplementation(async () => null);
      vi.mocked(autonomousGit.maybeCommit).mockImplementation(async () => null);
      vi.mocked(autonomousGit.maybePR).mockImplementation(async () => null);
    }
  });

  it('scheduler runs 2 stories back-to-back with independent mocks', async () => {
    const story1: TestArtifact = {
      id: 'S-1', type: 'story', title: 'Story 1', status: 'ready-for-dev', priority: 'P1',
    };
    const story2: TestArtifact = {
      id: 'S-2', type: 'story', title: 'Story 2', status: 'ready-for-dev', priority: 'P1',
    };
    const epics = [{ id: 'E-1', stories: [story1, story2] }];
    const store = createTestStore(epics);

    // Independent mock verdicts for each story
    const terminalExecutor = {
      executeAndAwaitVerdict: vi.fn()
        // S-1: dev → COMPLETED, review → APPROVED
        .mockResolvedValueOnce({ verdict: 'COMPLETED', summary: 'S-1 dev done' })
        .mockResolvedValueOnce({ verdict: 'APPROVED', summary: 'S-1 review passed' })
        // S-2: dev → COMPLETED, review → APPROVED
        .mockResolvedValueOnce({ verdict: 'COMPLETED', summary: 'S-2 dev done' })
        .mockResolvedValueOnce({ verdict: 'APPROVED', summary: 'S-2 review passed' }),
    } as any;

    const executor = { executeLaneTransition: vi.fn() } as any;
    const orch = new KanbanOrchestrator(store, executor, terminalExecutor);

    // Runner updates scheduler's internal stories array after completion so
    // completed stories are not re-picked (the scheduler's stories are
    // independent of the ArtifactStore).
    autoScheduler.setRunner(async (storyId: string): Promise<boolean> => {
      const found = store.findArtifactById(storyId);
      if (!found) return false;
      const result = await orch.runAutonomous(found.artifact, {});
      if (result.status === 'complete') {
        const stories = autoScheduler.getStories().map(s =>
          s.id === storyId ? { ...s, status: 'done' } : s,
        );
        autoScheduler.setStories(stories);
      }
      return result.ok;
    });

    // Seed both stories
    autoScheduler.setStories([
      { id: 'S-1', status: 'ready-for-dev', priority: 'P1' },
      { id: 'S-2', status: 'ready-for-dev', priority: 'P1' },
    ]);

    // Capture scheduler events
    const schedulerEvents: Array<{ type: string; storyId?: string }> = [];
    const onStarted = (d: { storyId: string }) => schedulerEvents.push({ type: 'started', storyId: d.storyId });
    const onCompleted = (d: { storyId: string }) => schedulerEvents.push({ type: 'completed', storyId: d.storyId });
    const onQueueEmpty = () => schedulerEvents.push({ type: 'queueEmpty' });

    autoScheduler.on('started', onStarted);
    autoScheduler.on('completed', onCompleted);
    autoScheduler.on('queueEmpty', onQueueEmpty);

    try {
      // WIP=1 ensures sequential execution: S-1 finishes before S-2 starts
      autoScheduler.setPollIntervalMs(100);
      autoScheduler.setWipLimit(1);
      autoScheduler.start();

      // Wait for both stories to complete
      await vi.waitFor(
        () => {
          const c = schedulerEvents.filter(e => e.type === 'completed');
          expect(c.length).toBeGreaterThanOrEqual(2);
        },
        { timeout: 15000, interval: 100 },
      );

      // Sequential order guaranteed by WIP=1: S-1 first, then S-2.
      // queueEmpty may fire multiple times (cascading tick + timer ticks).
      const storyEvents = schedulerEvents
        .filter(e => e.type === 'started' || e.type === 'completed')
        .map(e => e.type + ':' + e.storyId);
      expect(storyEvents).toEqual([
        'started:S-1', 'completed:S-1',
        'started:S-2', 'completed:S-2',
      ]);

      // queueEmpty fires at least once after both stories complete
      expect(schedulerEvents.some(e => e.type === 'queueEmpty')).toBe(true);

      // Terminal executor called 4 times (2 per story)
      expect(terminalExecutor.executeAndAwaitVerdict).toHaveBeenCalledTimes(4);

      // First call and third call are dev workflow calls (S-1 and S-2)
      expect(terminalExecutor.executeAndAwaitVerdict).toHaveBeenNthCalledWith(
        1, 'aac-kanban-dev-executor', story1, store,
      );
      expect(terminalExecutor.executeAndAwaitVerdict).toHaveBeenNthCalledWith(
        3, 'aac-kanban-dev-executor', story2, store,
      );

      // Chat path not used
      expect(executor.executeLaneTransition).not.toHaveBeenCalled();

      // Ordered store status updates: S-1 → in-progress, review, done; S-2 → in-progress, review, done
      const updates = vi.mocked(store.updateArtifact).mock.calls.map((c: any[]) => c[2].status);
      expect(updates).toEqual(['in-progress', 'review', 'done', 'in-progress', 'review', 'done']);

      // Circuit breaker recorded success for both stories
      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalled();
    } finally {
      autoScheduler.off('started', onStarted);
      autoScheduler.off('completed', onCompleted);
      autoScheduler.off('queueEmpty', onQueueEmpty);
    }
  });

  it('budget-enforced pause: scheduler auto-pauses when budgetEnforcer.isPaused() returns true', async () => {
    // Simulate budget cap hit — the enforcer reports paused state.
    mockBudgetEnforcer.isPaused.mockReturnValue(true);

    const { epics } = makeStories();
    const store = createTestStore(epics);
    const terminalExecutor = { executeAndAwaitVerdict: vi.fn() } as any;
    const executor = { executeLaneTransition: vi.fn() } as any;
    const orch = new KanbanOrchestrator(store, executor, terminalExecutor);

    autoScheduler.setRunner((storyId: string): Promise<boolean> => {
      const found = store.findArtifactById(storyId);
      if (!found) return Promise.resolve(false);
      return orch.runAutonomous(found.artifact, {}).then(r => r.ok);
    });

    autoScheduler.setStories([{ id: 'S-1', status: 'ready-for-dev', priority: 'P1' }]);

    // Capture state changes
    const stateChanges: Array<{ from: string; to: string }> = [];
    const onStateChange = (e: any) => stateChanges.push(e);
    autoScheduler.on('stateChange', onStateChange);

    try {
      autoScheduler.setPollIntervalMs(100);
      autoScheduler.setWipLimit(3);
      autoScheduler.start();

      // The scheduler's tick() checks isPaused() and calls pause() immediately.
      await vi.waitFor(
        () => expect(autoScheduler.getState()).toBe('paused'),
        { timeout: 5000, interval: 50 },
      );

      // State transitioned: active → paused
      expect(stateChanges).toContainEqual({ from: 'active', to: 'paused' });

      // No story was started (orchestrator never called)
      expect(terminalExecutor.executeAndAwaitVerdict).not.toHaveBeenCalled();
      expect(executor.executeLaneTransition).not.toHaveBeenCalled();
    } finally {
      autoScheduler.off('stateChange', onStateChange);
    }
  });

  it('scheduler resume() picks work immediately without waiting for poll interval (#34)', async () => {
    // Pause the scheduler, seed a story, then resume — the immediate tick()
    // should pick the story without waiting for the poll timer.
    mockBudgetEnforcer.isPaused.mockReturnValue(true);

    const { epics, story } = makeStories();
    const store = createTestStore(epics);
    const terminalExecutor = {
      executeAndAwaitVerdict: vi.fn()
        .mockResolvedValueOnce({ verdict: 'COMPLETED', summary: 'Dev done' })
        .mockResolvedValueOnce({ verdict: 'APPROVED', summary: 'Review passed' }),
    } as any;
    const executor = { executeLaneTransition: vi.fn() } as any;
    const orch = new KanbanOrchestrator(store, executor, terminalExecutor);

    // Runner marks story as done after completion
    autoScheduler.setRunner(async (storyId: string): Promise<boolean> => {
      const found = store.findArtifactById(storyId);
      if (!found) return false;
      const result = await orch.runAutonomous(found.artifact, {});
      if (result.status === 'complete') {
        const stories = autoScheduler.getStories().map(s =>
          s.id === storyId ? { ...s, status: 'done' } : s,
        );
        autoScheduler.setStories(stories);
      }
      return result.ok;
    });

    autoScheduler.setStories([{ id: 'S-1', status: 'ready-for-dev', priority: 'P1' }]);

    const startedEvents: string[] = [];
    const completedEvents: string[] = [];
    const onStartedEvt = (e: any) => startedEvents.push(e.storyId);
    const onCompletedEvt = (e: any) => completedEvents.push(e.storyId);
    autoScheduler.on('started', onStartedEvt);
    autoScheduler.on('completed', onCompletedEvt);

    try {
      autoScheduler.setPollIntervalMs(60_000); // 1 minute — way longer than the test
      autoScheduler.setWipLimit(1);
      autoScheduler.start();

      // Scheduler auto-pauses because isPaused() is true
      await vi.waitFor(() => expect(autoScheduler.getState()).toBe('paused'), { timeout: 2000, interval: 50 });

      // Now unpause the budget — the scheduler should resume via
      // budgetEnforcer.setOnUnpaused callback, but here we test resume() directly.
      mockBudgetEnforcer.isPaused.mockReturnValue(false);
      autoScheduler.resume();

      // resume() calls tick() immediately — story should be picked and run to done
      // without waiting 60 seconds for the poll timer.
      await vi.waitFor(
        () => expect(completedEvents).toContain('S-1'),
        { timeout: 10000, interval: 100 },
      );

      expect(startedEvents).toContain('S-1');
      expect(terminalExecutor.executeAndAwaitVerdict).toHaveBeenCalled();

      // Story reached done status in the store
      const updates = vi.mocked(store.updateArtifact).mock.calls.map((c: any[]) => c[2].status);
      expect(updates).toEqual(['in-progress', 'review', 'done']);
    } finally {
      autoScheduler.off('started', onStartedEvt);
      autoScheduler.off('completed', onCompletedEvt);
    }
  });
});

describe('Autonomous loop: AbortController mid-run cancellation (#26)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProgressEvents.events = [];
    concurrencyQueue.releaseAll();
    mockCircuitBreaker.canRun.mockReturnValue(true);
    mockBudgetEnforcer.canStart.mockReturnValue(true);
    mockBudgetEnforcer.getStatus.mockReturnValue({
      perStory: { used: 0, cap: 0, exceeded: false },
      daily: { used: 0, cap: 0, exceeded: false },
      anyExceeded: false,
      bannerMessage: null,
      remaining: -1,
    });
  });

  afterEach(() => {
    concurrencyQueue.releaseAll();
  });

  it('abort() returns false when no run is active', () => {
    const store = createTestStore([]);
    const orch = new KanbanOrchestrator(store, {} as any, {} as any);

    const aborted = orch.abort('nonexistent');
    expect(aborted).toBe(false);
  });

  it('abort signal detected between iterations when review returns NEEDS_FIXES', async () => {
    const { epics, story } = makeStories();
    const store = createTestStore(epics);

    // Create a controllable promise for the review verdict so we can time the abort.
    let resolveReview!: (v: any) => void;
    const reviewPromise = new Promise<any>(resolve => { resolveReview = resolve; });

    const terminalExecutor = {
      executeAndAwaitVerdict: vi.fn()
        // Dev step: COMPLETED immediately
        .mockResolvedValueOnce({ verdict: 'COMPLETED', summary: 'Dev done' })
        // Review step: hangs until we resolve it
        .mockReturnValueOnce(reviewPromise),
    } as any;

    const executor = { executeLaneTransition: vi.fn() } as any;
    const orch = new KanbanOrchestrator(store, executor, terminalExecutor);

    // Start the autonomous run (don't await it yet — we'll abort mid-run)
    const runPromise = orch.runAutonomous(story, {});

    // Wait for dev to complete and status to reach 'review'
    await vi.waitFor(
      () => {
        const reviewCall = vi.mocked(store.updateArtifact).mock.calls.find(
          (c: any[]) => c[2]?.status === 'review',
        );
        expect(reviewCall).toBeDefined();
      },
      { timeout: 5000, interval: 50 },
    );

    // Now the orchestrator is hung on the review verdict — call abort().
    const aborted = orch.abort(story.id);
    expect(aborted).toBe(true);

    // Resolve review as NEEDS_FIXES so the loop advances to the next iteration.
    resolveReview({ verdict: 'NEEDS_FIXES', summary: 'Needs work', fixRequests: [{ failing_criterion: 'Add more tests' }] });

    // The orchestrator should check ac.signal.aborted at the top of iteration 2
    // and return blocked.
    const result = await runPromise;

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.blockedBy?.[0]).toMatch(/Aborted by user/i);

    // Only dev + review called (2 total), no further iterations
    expect(terminalExecutor.executeAndAwaitVerdict).toHaveBeenCalledTimes(2);

    // Fix requests were attached during the NEEDS_FIXES handling
    const metadataCalls = vi.mocked(store.updateArtifact).mock.calls.filter((c: any[]) => c[2]?.metadata);
    expect(metadataCalls.length).toBeGreaterThanOrEqual(1);

    // Abort controller cleaned up
    const secondAbort = orch.abort(story.id);
    expect(secondAbort).toBe(false);

    // Concurrency lock released
    expect(concurrencyQueue.isLocked(story.id)).toBe(false);
  });

  it('abort() is idempotent — second call returns false', async () => {
    const { epics, story } = makeStories();
    const store = createTestStore(epics);

    // Review verdict never resolves — we'll abort and then check idempotency
    const reviewPromise = new Promise<any>(() => {}); // never resolves

    const terminalExecutor = {
      executeAndAwaitVerdict: vi.fn()
        .mockResolvedValueOnce({ verdict: 'COMPLETED', summary: 'Dev done' })
        .mockReturnValueOnce(reviewPromise),
    } as any;

    const orch = new KanbanOrchestrator(store, {} as any, terminalExecutor);

    // Start the run
    const runPromise = orch.runAutonomous(story, {});

    // Wait for dev to finish
    await vi.waitFor(
      () => expect(terminalExecutor.executeAndAwaitVerdict).toHaveBeenCalledTimes(2),
      { timeout: 5000, interval: 50 },
    );

    // First abort should succeed
    expect(orch.abort(story.id)).toBe(true);
    // Second abort on same id: controller already deleted → false
    expect(orch.abort(story.id)).toBe(false);
    // Different id that never had a run → false
    expect(orch.abort('never-started')).toBe(false);

    // Clean up: release the lock so afterEach doesn't warn
    concurrencyQueue.release(story.id);
    // The runPromise will never resolve (reviewPromise never resolves), but
    // the test doesn't need to await it — the finally block in runAutonomous
    // handles cleanup.
  });
});
