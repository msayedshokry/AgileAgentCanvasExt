// ─── Unit tests: autonomy-lifecycle wiring ───────────────────────────────────
// Covers the 4 critical wiring areas added in the "wire Kanban Agentic OS" commit:
//
//  1. Scheduler runner  — autoScheduler.setRunner() callback wired in start()
//  2. Goal decomposer hooks — decompose, persistStory, notifyScheduler
//  3. Dependency data extraction — extractDependencyData() rebuilds changes/stories
//  4. Terminal session persistence — scan/persist/load with disk merge
//
// Each area is tested via a fresh AutonomyLifecycle instance with mocks for
// the 14 singleton modules that start() wires together.

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ── vi.hoisted: mock singletons MUST be declared here because vi.mock calls
//    are hoisted to the top of the file — plain `const` would be TDZ errors. ──

const mockAutoScheduler = vi.hoisted(() => ({
  setRunner: vi.fn(),
  setStories: vi.fn(),
  getStories: vi.fn(() => [] as any[]),
  start: vi.fn(),
  stop: vi.fn(),
}));

const mockGoalDecomposer = vi.hoisted(() => ({
  setHooks: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}));

const mockTerminalExecutor = vi.hoisted(() => ({
  killTerminal: vi.fn(),
  findOrphanedSessions: vi.fn(() => [] as any[]),
  getArtifactIdForSession: vi.fn(),
  getTerminalIdForSession: vi.fn(),
}));

const mockTerminalRecovery = vi.hoisted(() => ({
  setScanner: vi.fn(),
  setReconnector: vi.fn(),
  setInterruptedReporter: vi.fn(),
  setOnReconnected: vi.fn(),
  recoverOnActivation: vi.fn(async () => [] as any[]),
}));

const mockDependencyAutoResume = vi.hoisted(() => ({
  setStatusUpdater: vi.fn(),
  onArtifactChanges: vi.fn(async () => [] as string[]),
}));

const mockCircuitBreaker = vi.hoisted(() => ({
  canRun: vi.fn(() => true),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  listAll: vi.fn(() => [] as any[]),
}));

const mockBudgetEnforcer = vi.hoisted(() => ({
  canStart: vi.fn(() => true),
  getStatus: vi.fn(() => ({ bannerMessage: null, anyExceeded: false })),
  setConfig: vi.fn(),
  setOnPaused: vi.fn(),
  setOnUnpaused: vi.fn(),
}));

const mockKanbanOrchestrator = vi.hoisted(() => ({
  runAutonomous: vi.fn(async () => ({ ok: true, status: 'complete' })),
}));

const mockAutoRetryEngine = vi.hoisted(() => ({ setConfig: vi.fn() }));
const mockAutonomousGit = vi.hoisted(() => ({ setConfig: vi.fn(), setRunner: vi.fn(), setHooks: vi.fn() }));
const mockAgentHealthMonitor = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
const mockAutoRecovery = vi.hoisted(() => ({ setHooks: vi.fn(), start: vi.fn(), stop: vi.fn() }));
const mockSchedulerWebviewControls = vi.hoisted(() => ({
  start: vi.fn(), stop: vi.fn(), buildStateMessage: vi.fn(() => ({})),
}));
const mockSchedulerStatePersistence = vi.hoisted(() => ({
  setFilePath: vi.fn(), restore: vi.fn(), save: vi.fn(),
}));
const mockCostTracker = vi.hoisted(() => ({ setLogPath: vi.fn(), setOnCostRecorded: vi.fn() }));
const mockConcurrencyPersistence = vi.hoisted(() => ({ restore: vi.fn(), save: vi.fn(), dispose: vi.fn() }));
const mockHarnessEngine = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn() }));
const mockCrossArtifactDetector = vi.hoisted(() => ({
  setThreshold: vi.fn(),
  correlate: vi.fn(() => ({ hasSystemicIssues: false, patterns: [] as any[] })),
}));

const mockFs = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

let isAutoAdvanceEnabled = true;

// ── Module mocks (vi.mock is hoisted above all imports) ────────────────────

vi.mock('./auto-scheduler', () => ({ autoScheduler: mockAutoScheduler }));
vi.mock('./goal-decomposer', () => ({ goalDecomposer: mockGoalDecomposer }));
vi.mock('./terminal-executor', () => ({ terminalExecutor: mockTerminalExecutor }));
vi.mock('./terminal-recovery', () => ({ terminalSessionRecovery: mockTerminalRecovery }));
vi.mock('./dependency-auto-resume', () => ({ dependencyAutoResume: mockDependencyAutoResume }));
vi.mock('./circuit-breaker', () => ({ circuitBreaker: mockCircuitBreaker }));
vi.mock('./budget-enforcer', () => ({ budgetEnforcer: mockBudgetEnforcer }));
vi.mock('./kanban-orchestrator', () => ({ kanbanOrchestrator: mockKanbanOrchestrator }));
vi.mock('./auto-retry-engine', () => ({ autoRetryEngine: mockAutoRetryEngine }));
vi.mock('./autonomous-git', () => ({ autonomousGit: mockAutonomousGit }));
vi.mock('./agent-health-monitor', () => ({ agentHealthMonitor: mockAgentHealthMonitor }));
vi.mock('./auto-recovery', () => ({ autoRecovery: mockAutoRecovery }));
vi.mock('./scheduler-webview-controls', () => ({
  schedulerWebviewControls: mockSchedulerWebviewControls,
  MSG_SCHEDULER_STATE: 'schedulerState',
}));
vi.mock('./scheduler-state-persistence', () => ({
  schedulerStatePersistence: mockSchedulerStatePersistence,
}));
vi.mock('./concurrency-queue-persistence', () => ({
  ConcurrencyQueuePersistence: class {
    restore() { mockConcurrencyPersistence.restore(); }
    save() { mockConcurrencyPersistence.save(); }
  },
  setupAutoSave: vi.fn(),
}));
vi.mock('../chat/cost-tracker', () => ({ costTracker: mockCostTracker }));
vi.mock('./failure-classifier', () => ({ failureClassifier: { classify: vi.fn(() => 'transient') } }));
vi.mock('./kanban-settings', () => ({
  isKanbanAutoAdvanceEnabled: () => isAutoAdvanceEnabled,
  getKanbanMaxIterations: () => 3,
}));
vi.mock('../harness/policy-engine', () => ({ harnessEngine: mockHarnessEngine }));
vi.mock('../harness/cross-artifact-detector', () => ({
  crossArtifactHarnessDetector: mockCrossArtifactDetector,
}));
vi.mock('fs', () => mockFs);

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { AutonomyLifecycle } from './autonomy-lifecycle';
import { dependencyGraph } from './dependency-graph';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStore(epics: any[] = []) {
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
    createStory: vi.fn(() => ({ id: 'created-S-1' })),
    updateArtifact: vi.fn(async () => {}),
    onDidChangeArtifacts: vi.fn(() => ({ dispose: vi.fn() })),
  } as any;
}

function makeLifecycle(epics: any[] = []) {
  const lc = new AutonomyLifecycle();
  const broadcast = vi.fn();
  const store = makeStore(epics);
  lc.configure({ broadcast, outputFolder: '/tmp/test-aac', extensionPath: '/fake/ext' }, store);
  return { lc, broadcast, store };
}

function resetAllMocks(): void {
  vi.clearAllMocks();
  isAutoAdvanceEnabled = true;
  mockAutoScheduler.getStories.mockReturnValue([]);
  mockTerminalExecutor.findOrphanedSessions.mockReturnValue([]);
  mockKanbanOrchestrator.runAutonomous.mockResolvedValue({ ok: true, status: 'complete' });
  mockCircuitBreaker.canRun.mockReturnValue(true);
  mockBudgetEnforcer.canStart.mockReturnValue(true);
  mockDependencyAutoResume.onArtifactChanges.mockResolvedValue([]);
  mockFs.existsSync.mockReturnValue(false);
  dependencyGraph.clear();
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AutonomyLifecycle wiring', () => {
  beforeEach(resetAllMocks);

  // ── 1. Scheduler runner ────────────────────────────────────────────────────

  describe('scheduler runner (autoScheduler.setRunner callback)', () => {
    it('happy: runner calls kanbanOrchestrator.runAutonomous with the artifact', async () => {
      const { lc } = makeLifecycle([
        { id: 'E-1', stories: [{ id: 'S-1', title: 'Story 1', type: 'story', status: 'ready-for-dev' }] },
      ]);
      lc.start();
      const runner = mockAutoScheduler.setRunner.mock.calls[0][0] as (id: string) => Promise<boolean>;

      const result = await runner('S-1');

      expect(result).toBe(true);
      expect(mockKanbanOrchestrator.runAutonomous).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'S-1', title: 'Story 1' }),
        expect.any(Object),
      );
    });

    it('happy: runner returns false when kanbanOrchestrator returns ok:false', async () => {
      mockKanbanOrchestrator.runAutonomous.mockResolvedValue({ ok: false, status: 'blocked' });
      const { lc } = makeLifecycle([
        { id: 'E-1', stories: [{ id: 'S-1', title: 'Story 1', type: 'story' }] },
      ]);
      lc.start();
      const runner = mockAutoScheduler.setRunner.mock.calls[0][0] as (id: string) => Promise<boolean>;

      const result = await runner('S-1');
      expect(result).toBe(false);
    });

    it('error: runner returns false when artifact not found in store', async () => {
      const { lc } = makeLifecycle([]);
      lc.start();
      const runner = mockAutoScheduler.setRunner.mock.calls[0][0] as (id: string) => Promise<boolean>;

      const result = await runner('nonexistent');
      expect(result).toBe(false);
      expect(mockKanbanOrchestrator.runAutonomous).not.toHaveBeenCalled();
    });

    it('error: runner returns false when auto-advance is disabled', async () => {
      isAutoAdvanceEnabled = false;
      const { lc } = makeLifecycle([
        { id: 'E-1', stories: [{ id: 'S-1', title: 'S1', type: 'story' }] },
      ]);
      lc.start();
      const runner = mockAutoScheduler.setRunner.mock.calls[0][0] as (id: string) => Promise<boolean>;

      const result = await runner('S-1');
      expect(result).toBe(false);
      expect(mockKanbanOrchestrator.runAutonomous).not.toHaveBeenCalled();
    });

    it('error: runner returns false when circuit breaker is open', async () => {
      mockCircuitBreaker.canRun.mockReturnValue(false);
      const { lc } = makeLifecycle([
        { id: 'E-1', stories: [{ id: 'S-1', title: 'S1', type: 'story' }] },
      ]);
      lc.start();
      const runner = mockAutoScheduler.setRunner.mock.calls[0][0] as (id: string) => Promise<boolean>;

      const result = await runner('S-1');
      expect(result).toBe(false);
      expect(mockKanbanOrchestrator.runAutonomous).not.toHaveBeenCalled();
    });

    it('error: runner returns false when budget is exceeded', async () => {
      mockBudgetEnforcer.canStart.mockReturnValue(false);
      const { lc } = makeLifecycle([
        { id: 'E-1', stories: [{ id: 'S-1', title: 'S1', type: 'story' }] },
      ]);
      lc.start();
      const runner = mockAutoScheduler.setRunner.mock.calls[0][0] as (id: string) => Promise<boolean>;

      const result = await runner('S-1');
      expect(result).toBe(false);
      expect(mockKanbanOrchestrator.runAutonomous).not.toHaveBeenCalled();
    });

    it('error: runner catches orchestrator exceptions and returns false', async () => {
      mockKanbanOrchestrator.runAutonomous.mockRejectedValue(new Error('boom'));
      const { lc } = makeLifecycle([
        { id: 'E-1', stories: [{ id: 'S-1', title: 'S1', type: 'story' }] },
      ]);
      lc.start();
      const runner = mockAutoScheduler.setRunner.mock.calls[0][0] as (id: string) => Promise<boolean>;

      const result = await runner('S-1');
      expect(result).toBe(false);
    });
  });

  // ── 2. Goal decomposer hooks ───────────────────────────────────────────────

  describe('goal decomposer hooks (wireGoalDecomposerHooks)', () => {
    it('happy: persistStory creates a story and updates it with title/description', async () => {
      const { lc, store } = makeLifecycle();
      lc.start();
      const hooks = mockGoalDecomposer.setHooks.mock.calls[0][0];

      const id = await hooks.persistStory({ id: 'p1', title: 'Add auth', description: 'OAuth2 flow' });

      expect(store.createStory).toHaveBeenCalled();
      expect(store.updateArtifact).toHaveBeenCalledWith('story', 'created-S-1', {
        title: 'Add auth',
        description: 'OAuth2 flow',
        metadata: { priority: undefined },
      });
      expect(id).toBe('created-S-1');
    });

    it('happy: notifyScheduler adds story and broadcasts while preserving existing stories', async () => {
      mockAutoScheduler.getStories.mockReturnValue([
        { id: 'existing', status: 'done' },
      ]);
      const { lc, broadcast } = makeLifecycle();
      lc.start();
      const hooks = mockGoalDecomposer.setHooks.mock.calls[0][0];

      hooks.notifyScheduler('new-story-id');

      const setStoriesArg = mockAutoScheduler.setStories.mock.calls[0][0];
      expect(setStoriesArg).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'existing', status: 'done' }),
        expect.objectContaining({ id: 'new-story-id', status: 'ready-for-dev' }),
      ]));
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'goalStoryPersisted', storyId: 'new-story-id' }),
      );
    });

    it('happy: decompose uses VS Code LM when available', async () => {
      const mockSendRequest = vi.fn(async () => ({
        text: (async function* () { yield '[{"id":"s1","title":"Test story","description":"desc"}]'; })(),
      }));
      const vscode = await import('vscode');
      (vscode.lm.selectChatModels as Mock).mockResolvedValue([{ name: 'gpt-4o', sendRequest: mockSendRequest }]);

      const { lc } = makeLifecycle();
      lc.start();
      const hooks = mockGoalDecomposer.setHooks.mock.calls[0][0];

      const stories = await hooks.decompose('Build a dashboard');

      expect(stories).toEqual([
        expect.objectContaining({ title: 'Test story', description: 'desc' }),
      ]);
    });

    it('happy: decompose returns fallback story when no LM is available', async () => {
      const vscode = await import('vscode');
      (vscode.lm.selectChatModels as Mock).mockResolvedValue([]);

      const { lc } = makeLifecycle();
      lc.start();
      const hooks = mockGoalDecomposer.setHooks.mock.calls[0][0];

      const stories = await hooks.decompose('Build a dashboard');

      expect(stories).toHaveLength(1);
      expect(stories[0].title).toBe('Build a dashboard');
    });

    it('happy: decompose returns fallback when LM returns unparseable output', async () => {
      const mockSendRequest = vi.fn(async () => ({
        text: (async function* () { yield "I'm sorry, I can't do that."; })(),
      }));
      const vscode = await import('vscode');
      (vscode.lm.selectChatModels as Mock).mockResolvedValue([{ name: 'gpt-4o', sendRequest: mockSendRequest }]);

      const { lc } = makeLifecycle();
      lc.start();
      const hooks = mockGoalDecomposer.setHooks.mock.calls[0][0];

      const stories = await hooks.decompose('Build a dashboard');

      // No JSON array in response → fallback single story
      expect(stories).toHaveLength(1);
      expect(stories[0].title).toBe('Build a dashboard');
    });

    it('error: decompose returns fallback story when LM throws', async () => {
      const vscode = await import('vscode');
      (vscode.lm.selectChatModels as Mock).mockRejectedValue(new Error('no LM'));

      const { lc } = makeLifecycle();
      lc.start();
      const hooks = mockGoalDecomposer.setHooks.mock.calls[0][0];

      const stories = await hooks.decompose('Build a dashboard');

      expect(stories).toHaveLength(1);
      expect(stories[0].title).toBe('Build a dashboard');
    });
  });

  // ── 3. Dependency data extraction ──────────────────────────────────────────

  describe('extractDependencyData', () => {
    it('happy: extracts changes and stories from store epics', () => {
      const { lc } = makeLifecycle([
        {
          id: 'E-1',
          stories: [
            { id: 'S-1', status: 'done', dependencies: { blocks: ['S-2'] } },
            { id: 'S-2', status: 'in-progress', dependencies: { blockedBy: ['S-1'] } },
          ],
        },
        {
          id: 'E-2',
          stories: [
            { id: 'S-3', status: 'ready-for-dev' },
          ],
        },
      ]);
      lc.start();

      const result = (lc as any).extractDependencyData();

      expect(result.stories).toEqual([
        { id: 'S-1', dependencies: { blocks: ['S-2'] } },
        { id: 'S-2', dependencies: { blockedBy: ['S-1'] } },
        { id: 'S-3', dependencies: undefined },
      ]);
      expect(result.changes).toEqual([
        { artifactId: 'S-1', toStatus: 'done' },
        { artifactId: 'S-2', toStatus: 'in-progress' },
        { artifactId: 'S-3', toStatus: 'ready-for-dev' },
      ]);
    });

    it('boundary: returns empty arrays when store has no epics', () => {
      const { lc } = makeLifecycle([]);
      lc.start();

      const result = (lc as any).extractDependencyData();

      expect(result).toEqual({ changes: [], stories: [] });
    });

    it('error: returns empty arrays when store throws', () => {
      const { lc, store } = makeLifecycle();
      (store.getState as Mock).mockImplementation(() => { throw new Error('store offline'); });
      lc.start();

      const result = (lc as any).extractDependencyData();

      expect(result).toEqual({ changes: [], stories: [] });
    });

    it('error: returns empty arrays when store is null', () => {
      const lc = new AutonomyLifecycle();
      lc.configure({ broadcast: vi.fn(), outputFolder: '/tmp', extensionPath: '/fake/ext' }, null as any);
      lc.start();

      const result = (lc as any).extractDependencyData();

      expect(result).toEqual({ changes: [], stories: [] });
    });
  });

  // ── 4. Terminal session persistence ────────────────────────────────────────

  describe('terminal session persistence', () => {
    const sessionA = { sessionId: 's-1', artifactId: 'S-1', name: 'term-1', startedAt: 1000 };
    const sessionB = { sessionId: 's-2', artifactId: 'S-2', pid: 42, name: 'term-2', startedAt: 2000 };

    it('happy: scanOrphanedTerminalSessions returns live sessions', async () => {
      mockTerminalExecutor.findOrphanedSessions.mockReturnValue([sessionA]);
      const { lc } = makeLifecycle();
      lc.start();

      const result = await (lc as any).scanOrphanedTerminalSessions();

      expect(result).toEqual([sessionA]);
    });

    it('happy: scanOrphanedTerminalSessions merges live + persisted (no duplicates)', async () => {
      mockTerminalExecutor.findOrphanedSessions.mockReturnValue([sessionA]);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify([sessionA, sessionB]));

      const { lc } = makeLifecycle();
      lc.start();

      const result = await (lc as any).scanOrphanedTerminalSessions();

      // sessionA is live so it shouldn't be duplicated; sessionB is persisted-only
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(sessionA);
      expect(result[1]).toEqual(sessionB);
    });

    it('happy: persistTerminalSessions writes JSON to disk', () => {
      const { lc } = makeLifecycle();
      lc.start();

      (lc as any).persistTerminalSessions([sessionA]);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('terminal-sessions.json'),
        expect.stringContaining('"s-1"'),
        'utf-8',
      );
    });

    it('error: loadPersistedTerminalSessions returns [] when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      const { lc } = makeLifecycle();
      lc.start();

      const result = (lc as any).loadPersistedTerminalSessions();

      expect(result).toEqual([]);
    });

    it('error: loadPersistedTerminalSessions returns [] when JSON is corrupt', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('not-json');
      const { lc } = makeLifecycle();
      lc.start();

      const result = (lc as any).loadPersistedTerminalSessions();

      expect(result).toEqual([]);
    });

    it('error: loadPersistedTerminalSessions returns [] when JSON is not an array', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{"not":"array"}');
      const { lc } = makeLifecycle();
      lc.start();

      const result = (lc as any).loadPersistedTerminalSessions();

      expect(result).toEqual([]);
    });
  });
});
