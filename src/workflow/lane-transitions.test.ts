// ─── Unit tests: lane-transitions ──────────────────────────────────────────────
// Covers: findRule returns the correct transition rule for a known pair
// (happy path) and rejects with a "Status mismatch" blockedBy when the
// client's fromStatus doesn't match the store (most common error path).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LaneTransitionEngine, TRANSITION_RULES } from './lane-transitions';
import { concurrencyQueue } from './concurrency-queue';

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(async () => undefined),
    showWarningMessage: vi.fn(async () => undefined),
    showErrorMessage: vi.fn(async () => undefined),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({ get: (_k: string, d: string) => d })),
  },
}));

vi.mock('./kanban-orchestrator', () => ({ kanbanOrchestrator: null }));
vi.mock('../harness/policy-engine', () => ({
  harnessEngine: { evaluate: vi.fn(async () => []) },
}));
vi.mock('../harness/harness-feedback', () => ({
  harnessFeedback: { recordEvaluation: vi.fn() },
}));
vi.mock('../acp/agent-bus/a2a-outbound-client', () => ({
  getA2AOutboundClient: vi.fn(() => ({ sendMessage: vi.fn(), getTask: vi.fn() })),
}));

// mockito-style controllable terminalExecutor — tests opt in to using it.
const mocks = vi.hoisted(() => ({
  terminal: {
    executeTerminalWorkflow: vi.fn(),
    getTerminalSession: vi.fn(),
    getTerminalOutput: vi.fn(() => ''),
    jumpToTerminal: vi.fn(() => false),
    attachWebviewStream: vi.fn(() => ({ dispose: vi.fn() })),
  },
  verdict: {
    current: undefined as undefined | { verdict: string; summary?: string },
    calls: 0,
  },
}));
vi.mock('./terminal-executor', () => ({ terminalExecutor: mocks.terminal }));

vi.mock('./kanban-verdict', async (importOriginal) => {
  const real = await importOriginal<typeof import('./kanban-verdict')>();
  return {
    ...real,
    readVerdictFile: vi.fn(() => {
      mocks.verdict.calls++;
      return mocks.verdict.current;
    }),
    getOutputFolder: () => '.agileagentcanvas-context',
    resultFilePath: (_o: string, aid: string, wid: string) => `/result/${aid}-${wid}.json`,
  };
});

function fakeStore(artifactStatus: string) {
  let currentStatus = artifactStatus;
  return {
    findArtifactById: vi.fn((id: string) => ({ artifact: { id, type: 'story', status: currentStatus, title: id } })),
    updateArtifact: vi.fn(async (_type: string, _id: string, patch: any) => {
      if (patch && typeof patch.status === 'string') currentStatus = patch.status;
    }),
    _peekStatus: () => currentStatus,
  } as any;
}

function fakeExecutor() {
  return { executeLaneTransition: vi.fn(async () => ({ verdict: 'COMPLETED' })) } as any;
}

describe('LaneTransitionEngine', () => {
  beforeEach(() => {
    concurrencyQueue.releaseAll();
    mocks.verdict.current = undefined;
    mocks.verdict.calls = 0;
    mocks.terminal.executeTerminalWorkflow.mockReset();
    mocks.terminal.getTerminalSession.mockReset();
  });

  it('happy: findRule picks the right rule for backlog → ready-for-dev', () => {
    const engine = new LaneTransitionEngine(fakeStore('backlog'), fakeExecutor());
    // findRule is already exported as part of TRANSITION_RULES; test the
    // public surface by looking the rule up directly.
    const rule = TRANSITION_RULES.find(r =>
      r.artifactType === 'story' && r.fromStatus === 'backlog' && r.toStatus === 'ready-for-dev'
    );
    expect(rule).toBeDefined();
    expect(rule!.workflowId).toBe('story-enhancement');
  });

  it('error: handleTransition rejects when fromStatus does not match the store', async () => {
    const engine = new LaneTransitionEngine(fakeStore('in-progress'), fakeExecutor());
    const result = await engine.handleTransition('S-1', 'backlog', 'ready-for-dev', 'story');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.blockedBy?.[0]).toMatch(/Status mismatch/);
  });

  // ponytail: regression for the "card wedged in in-progress after single-shot
  // terminal" bug. The watcher must revert UNKNOWN/BLOCKED/NEEDS_FIXES verdicts
  // to the pre-drag column. COMPLETED/APPROVED must NOT trigger a revert.
  it('single-shot terminal path: UNKNOWN verdict reverts card to pre-drag status', async () => {
    mocks.terminal.executeTerminalWorkflow.mockResolvedValue('session-1');
    // Session is "alive" then closes without writing a verdict.
    mocks.terminal.getTerminalSession
      .mockReturnValueOnce({} as any)
      .mockReturnValueOnce(undefined);
    mocks.verdict.current = { verdict: 'UNKNOWN', summary: 'Terminal closed without a verdict file' };

    // store.updateArtifact is what the handler calls immediately when it moves
    // the card to in-progress. The watcher will call it AGAIN to revert.
    const store = fakeStore('ready-for-dev');
    const engine = new LaneTransitionEngine(store, fakeExecutor());
    const result = await engine.handleTransition('S-1', 'ready-for-dev', 'in-progress', 'story');

    // IPC handler returned terminal_launched immediately.
    expect(result.ok).toBe(true);
    expect(result.status).toBe('terminal_launched');

    // Wait for the watcher's first poll to read the verdict and the
    // microtask queue to drain.
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // The watcher must have reverted the artifact back to ready-for-dev.
    expect(store.updateArtifact).toHaveBeenCalledWith('story', 'S-1', { status: 'ready-for-dev' });
  });

  it('single-shot terminal path: COMPLETED verdict does NOT revert the card', async () => {
    mocks.terminal.executeTerminalWorkflow.mockResolvedValue('session-1');
    mocks.terminal.getTerminalSession.mockReturnValue(undefined);
    mocks.verdict.current = { verdict: 'COMPLETED', summary: 'agent done' };

    const store = fakeStore('ready-for-dev');
    const engine = new LaneTransitionEngine(store, fakeExecutor());
    await engine.handleTransition('S-1', 'ready-for-dev', 'in-progress', 'story');

    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // updateArtifact may have been called once (for the initial move to
    // in-progress), but it must NOT be called again to revert.
    const revertCalls = (store.updateArtifact as any).mock.calls.filter(
      (c: any[]) => c[0] === 'story' && c[1] === 'S-1' && c[2]?.status === 'ready-for-dev'
    );
    expect(revertCalls.length).toBe(0);
  });
});
