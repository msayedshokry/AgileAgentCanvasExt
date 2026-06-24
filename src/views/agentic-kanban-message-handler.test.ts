import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TraceEntry } from '../trace/trace-recorder';

// Mock the trace recorder module so each test can drive `searchTraces()` from
// a fixture without touching disk. Hoisted above the import below so the
// handler module sees the mock during evaluation.
vi.mock('../trace/trace-recorder', () => ({
  getTraceRecorder: vi.fn(),
}));

// Mock visualPlanService — the IPC handler imports it at module level.
vi.mock('../workflow/visual-plan-service', () => ({
  visualPlanService: {
    generate: vi.fn(),
    createPendingPlan: vi.fn(),
    list: vi.fn(() => []),
    get: vi.fn(),
    addComment: vi.fn(),
    approve: vi.fn(),
    requestChanges: vi.fn(),
  },
}));

// The terminal-agent generate path uses the plan store (for the target file
// path) and the chat-bridge (to route the prompt to the selected provider).
vi.mock('../state/visual-plan-store', () => ({
  visualPlanStore: {
    planFilePath: vi.fn((id: string) => `/ws/.agileagentcanvas-context/plans/${id}.plan.json`),
    list: vi.fn(() => []),
  },
}));
vi.mock('../commands/chat-bridge', () => ({
  getSelectedProvider: vi.fn(() => 'claude'),
  openChatWithResult: vi.fn(async () => ({ ok: true, provider: 'claude', usedTerminal: true, fallback: 'none' })),
}));

import { computeTraceBreakdownForMostRecentRun, handleAgenticKanbanMessage } from './agentic-kanban-message-handler';
import { VISUAL_PLAN_DISABLED_MESSAGE } from '../utils/visual-plan-config';
import { getTraceRecorder } from '../trace/trace-recorder';
import { visualPlanService } from '../workflow/visual-plan-service';
import { openChatWithResult } from '../commands/chat-bridge';
import * as vscode from 'vscode';
import type { ArtifactStore } from '../state/artifact-store';

// Shared wire-format shape contract (audit gap #20/#42) — same types as the
// `TracePanel` consumer test in the webview, so producer/consumer stay in
// sync end-to-end. See the helper's doc-comment for the architectural rationale.
import {
  TraceBreakdownMessage,
  UNTAGGED_BUCKET,
  isBreakdownMessage,
} from '../types/trace-breakdown';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Fixed-time scaffolding so total-entries counts are deterministic without
// having to mock `Date.now()`. 500ms gaps keep timestamps lexically distinct.
const BASE_T = Date.parse('2024-06-15T12:00:00.000Z');
const t = (offsetMs: number): string => new Date(BASE_T + offsetMs).toISOString();

// TraceEntry fixture builder — make every required field explicit so a typo
// fails the test loud-and-clear instead of slipping past via TS partial
// structural compatibility.
function entry(fields: {
  sessionId: string;
  type: TraceEntry['type'];
  agent: string;
  timestamp: string;
  workflowName?: string;
  data?: TraceEntry['data'];
}): TraceEntry {
  const out: TraceEntry = {
    sessionId: fields.sessionId,
    type: fields.type,
    agent: fields.agent,
    timestamp: fields.timestamp,
    data: fields.data ?? {},
  };
  if (fields.workflowName !== undefined) {
    out.workflowName = fields.workflowName;
  }
  return out;
}

/**
 * Wire a mock TraceRecorder that filters `entries` based on the search query
 * exactly like the production search does — first call (decisions query)
 * returns `lane-transition` decisions only; second call (window query with
 * `since`) returns every entry timestamped ≥ the window start.
 */
function setupRecorder(entries: TraceEntry[]): void {
  vi.mocked(getTraceRecorder).mockReturnValue({
    flushAll: vi.fn(async () => undefined),
    searchTraces: vi.fn(async (query: {
      agent?: string;
      type?: string;
      since?: Date;
    }) => {
      if (query.agent === 'lane-transition' && query.type === 'decision') {
        return entries.filter(
          e => e.agent === 'lane-transition' && e.type === 'decision',
        );
      }
      if (query.since) {
        const sinceMs = query.since.getTime();
        return entries.filter(e => Date.parse(e.timestamp) >= sinceMs);
      }
      return [];
    }),
  } as never);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('computeTraceBreakdownForMostRecentRun (audit gap #20/#42)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // (a) ── Empty trace ──────────────────────────────────────────────────────
  it('a) returns an empty breakdown when the trace is empty', async () => {
    setupRecorder([]);

    const result = await computeTraceBreakdownForMostRecentRun();

    // Compile-time anchor: the assertion type is the helper's shared
    // shape, so producer/consumer tests verify the same contract. Runtime
    // anchor: the type-guard forces a structural check up-front so a
    // structural drift surfaces here, before deep-equality fails for the
    // wrong reason (missing-field/extra-field confusion).
    expect(isBreakdownMessage(result)).toBe(true);
    expect(result).toEqual<TraceBreakdownMessage>({
      type: 'traceBreakdownResponse',
      workflowName: '',
      startedAt: '',
      endedAt: null,
      isRunning: false,
      totalEntries: 0,
      totalToolCalls: 0,
      totalErrors: 0,
      perWorkflow: [],
    });
  });

  // (b) ── Single completed run ────────────────────────────────────────────
  it('b) groups tool_calls within a single completed run', async () => {
    setupRecorder([
      entry({
        sessionId: 's1', agent: 'lane-transition', type: 'decision',
        timestamp: t(0),
        data: { decision: 'started dev-story' },
      }),
      entry({
        sessionId: 's1', agent: 'chat', type: 'tool_call',
        timestamp: t(500), workflowName: 'mock-workflow-fixture',
        data: { toolName: 'foo' },
      }),
      entry({
        sessionId: 's1', agent: 'chat', type: 'tool_call',
        timestamp: t(1000), workflowName: 'mock-workflow-fixture',
        data: { toolName: 'bar' },
      }),
      entry({
        sessionId: 's1', agent: 'lane-transition', type: 'decision',
        timestamp: t(1500),
        data: { decision: 'completed dev-story' },
      }),
    ]);

    const result = await computeTraceBreakdownForMostRecentRun();

    expect(result.workflowName).toBe('dev-story');
    expect(result.startedAt).toBe(t(0));
    expect(result.endedAt).toBe(t(1500));
    expect(result.isRunning).toBe(false);
    expect(result.totalEntries).toBe(4);
    expect(result.totalToolCalls).toBe(2);
    expect(result.totalErrors).toBe(0);
    // Two buckets: named workflow + (untagged) for the two decision entries
    // that don't currently carry a workflowName tag.
    expect(result.perWorkflow).toEqual<TraceBreakdownMessage['perWorkflow']>([
      {
        workflow: 'mock-workflow-fixture',
        toolCallCount: 2,
        errorCount: 0,
        distinctTools: ['bar', 'foo'],   // alphabetical for determinism
        totalEntries: 2,
      },
      {
        workflow: UNTAGGED_BUCKET,
        toolCallCount: 0,
        errorCount: 0,
        distinctTools: [],
        totalEntries: 2,
      },
    ]);
  });

  // (c) ── In-progress run ─────────────────────────────────────────────────
  it('c) marks the run as in-progress when started-but-not-terminal', async () => {
    setupRecorder([
      entry({
        sessionId: 's1', agent: 'lane-transition', type: 'decision',
        timestamp: t(0),
        data: { decision: 'started dev-story' },
      }),
      entry({
        sessionId: 's1', agent: 'chat', type: 'tool_call',
        timestamp: t(500), workflowName: 'mock-workflow-fixture',
        data: { toolName: 'foo' },
      }),
    ]);

    const result = await computeTraceBreakdownForMostRecentRun();

    expect(result.workflowName).toBe('dev-story');
    expect(result.startedAt).toBe(t(0));
    expect(result.endedAt).toBeNull();
    expect(result.isRunning).toBe(true);
    expect(result.totalEntries).toBe(2);
    expect(result.totalToolCalls).toBe(1);
    // (untagged) appears because the un-marked decision lands there.
    expect(result.perWorkflow).toEqual<TraceBreakdownMessage['perWorkflow']>([
      {
        workflow: 'mock-workflow-fixture',
        toolCallCount: 1,
        errorCount: 0,
        distinctTools: ['foo'],
        totalEntries: 1,
      },
      {
        workflow: UNTAGGED_BUCKET,
        toolCallCount: 0,
        errorCount: 0,
        distinctTools: [],
        totalEntries: 1,
      },
    ]);
  });

  // (d) ── Multiple sequential runs ───────────────────────────────────────
  it('d) only counts the most recent run when multiple runs exist', async () => {
    setupRecorder([
      // Run 1 (older): dev-story, ended cleanly at T+1000
      entry({
        sessionId: 'r1', agent: 'lane-transition', type: 'decision',
        timestamp: t(0),
        data: { decision: 'started dev-story' },
      }),
      entry({
        sessionId: 'r1', agent: 'chat', type: 'tool_call',
        timestamp: t(500), workflowName: 'dev-story',
        data: { toolName: 'r1-tool' },
      }),
      entry({
        sessionId: 'r1', agent: 'lane-transition', type: 'decision',
        timestamp: t(1000),
        data: { decision: 'completed dev-story' },
      }),
      // Run 2 (newer): code-review, abandoned mid-flight at T+3500
      entry({
        sessionId: 'r2', agent: 'lane-transition', type: 'decision',
        timestamp: t(2000),
        data: { decision: 'started code-review' },
      }),
      entry({
        sessionId: 'r2', agent: 'chat', type: 'tool_call',
        timestamp: t(2500), workflowName: 'code-review',
        data: { toolName: 'r2-review-1' },
      }),
      entry({
        sessionId: 'r2', agent: 'chat', type: 'tool_call',
        timestamp: t(3000), workflowName: 'code-review',
        data: { toolName: 'r2-review-2' },
      }),
      entry({
        sessionId: 'r2', agent: 'lane-transition', type: 'decision',
        timestamp: t(3500),
        data: { decision: 'abandoned', artifactId: 'a1', rationale: 'user stop' },
      }),
    ]);

    const result = await computeTraceBreakdownForMostRecentRun();

    // Most-recent run wins: code-review, abandoning at T+3500.
    expect(result.workflowName).toBe('code-review');
    expect(result.startedAt).toBe(t(2000));
    expect(result.endedAt).toBe(t(3500));
    expect(result.isRunning).toBe(false);
    // Only the second run's window — 4 entries (started-decision + 2 tools +
    // abandoned-decision). The run-1 entries are filtered out by `since`.
    expect(result.totalEntries).toBe(4);
    expect(result.totalToolCalls).toBe(2);
    expect(result.perWorkflow).toEqual<TraceBreakdownMessage['perWorkflow']>([
      {
        workflow: 'code-review',
        toolCallCount: 2,
        errorCount: 0,
        distinctTools: ['r2-review-1', 'r2-review-2'],
        totalEntries: 2,
      },
      {
        workflow: UNTAGGED_BUCKET,
        toolCallCount: 0,
        errorCount: 0,
        distinctTools: [],
        totalEntries: 2,
      },
    ]);
  });

  // (e) ── Untagged-bucket ─────────────────────────────────────────────────
  it('e) buckets entries lacking a workflowName under (untagged)', async () => {
    setupRecorder([
      entry({
        sessionId: 's1', agent: 'lane-transition', type: 'decision',
        timestamp: t(0),
        data: { decision: 'started dev-story' },
      }),
      entry({
        sessionId: 's1', agent: 'chat', type: 'tool_call',
        timestamp: t(500), workflowName: 'mock-workflow-fixture',
        data: { toolName: 'tagged-tool' },
      }),
      entry({
        sessionId: 's1', agent: 'chat', type: 'tool_call',
        timestamp: t(1000), workflowName: 'mock-workflow-fixture',
        data: { toolName: 'tagged-tool' },
      }),
      // The orphan entry — no workflowName tag.
      entry({
        sessionId: 's1', agent: 'legacy-trace', type: 'tool_call',
        timestamp: t(1500),
        data: { toolName: 'orphan-tool' },
      }),
      entry({
        sessionId: 's1', agent: 'lane-transition', type: 'decision',
        timestamp: t(2000),
        data: { decision: 'completed dev-story' },
      }),
    ]);

    const result = await computeTraceBreakdownForMostRecentRun();

    expect(result.totalEntries).toBe(5);
    expect(result.totalToolCalls).toBe(3);
    // The untagged bucket now has both the orphan tool_call AND the unmarked
    // decisions: 1 tool_call, 0 errors, 3 total entries — proves the
    // (untagged) group-style aggregation works without exception.
    expect(result.perWorkflow).toEqual<TraceBreakdownMessage['perWorkflow']>([
      {
        workflow: 'mock-workflow-fixture',
        toolCallCount: 2,
        errorCount: 0,
        distinctTools: ['tagged-tool'],
        totalEntries: 2,
      },
      {
        workflow: UNTAGGED_BUCKET,
        toolCallCount: 1,
        errorCount: 0,
        distinctTools: ['orphan-tool'],
        totalEntries: 3,
      },
    ]);
  });
});


// ── Visual Plan config gate tests ───────────────────────────────────────────

describe('handleAgenticKanbanMessage — visualPlan:generate config gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Override the vscode config mock so .get('visualPlan.enabled') returns the given value. */
  function setVisualPlanEnabled(enabled: boolean): void {
    const config = vscode.workspace.getConfiguration();
    vi.mocked(config.get).mockImplementation(
      (key: string, defaultValue?: unknown) => {
        if (key === 'visualPlan.enabled') return enabled;
        return defaultValue;
      },
    );
  }

  const mockWebview = { postMessage: vi.fn() } as unknown as vscode.Webview;
  const mockStore = { findArtifactById: vi.fn(() => undefined) } as unknown as ArtifactStore;
  const mockUri = {} as vscode.Uri;

  it('returns visualPlan:error and does NOT call generate when visualPlan.enabled is false', async () => {
    setVisualPlanEnabled(false);

    const result = await handleAgenticKanbanMessage(
      { type: 'visualPlan:generate', goal: 'test goal', sourceArtifactId: 'S-1' },
      mockStore,
      mockUri,
      mockWebview,
    );

    expect(result).toBe(true);
    expect(mockWebview.postMessage).toHaveBeenCalledTimes(1);
    expect(mockWebview.postMessage).toHaveBeenCalledWith({
      type: 'visualPlan:error',
      error: VISUAL_PLAN_DISABLED_MESSAGE,
    });
    // The service must NOT be invoked
    expect(visualPlanService.generate).not.toHaveBeenCalled();
  });

  it('routes plan generation to the selected provider when visualPlan.enabled is true', async () => {
    setVisualPlanEnabled(true);
    vi.mocked(visualPlanService.createPendingPlan).mockResolvedValue({
      id: 'plan-abc-123', title: 'ship it', goal: 'ship it', status: 'generating',
      createdAt: 1, updatedAt: 1, sections: [], comments: [],
    });

    const result = await handleAgenticKanbanMessage(
      { type: 'visualPlan:generate', goal: 'ship it', sourceArtifactId: 'S-2' },
      mockStore,
      mockUri,
      mockWebview,
    );

    // Handler acknowledged the message
    expect(result).toBe(true);
    // A 'generating' stub was created with the right params
    expect(visualPlanService.createPendingPlan).toHaveBeenCalledWith({
      goal: 'ship it',
      sourceArtifactId: 'S-2',
      context: undefined,
    });
    // The agent prompt was routed to the selected dropdown provider, and tells
    // the agent to write the plan to the known file path.
    expect(openChatWithResult).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(openChatWithResult).mock.calls[0][0]!;
    expect(arg.provider).toBe('claude');
    expect(arg.query).toContain('plan-abc-123.plan.json');
    // 'generating' status pushed to the webview
    expect(mockWebview.postMessage).toHaveBeenCalledWith({
      type: 'visualPlan:generating',
      planId: 'plan-abc-123',
      goal: 'ship it',
    });
  });

  it('posts visualPlan:error when generation setup throws, and still returns true', async () => {
    setVisualPlanEnabled(true);
    vi.mocked(visualPlanService.createPendingPlan).mockRejectedValue(new Error('disk full'));

    const result = await handleAgenticKanbanMessage(
      { type: 'visualPlan:generate', goal: 'risky plan', sourceArtifactId: 'S-3' },
      mockStore,
      mockUri,
      mockWebview,
    );

    // Handler still acknowledges the message (does not propagate the error)
    expect(result).toBe(true);
    expect(visualPlanService.createPendingPlan).toHaveBeenCalled();
    // No prompt routed when setup failed
    expect(openChatWithResult).not.toHaveBeenCalled();
    // Error surfaced to the webview
    expect(mockWebview.postMessage).toHaveBeenCalledWith({
      type: 'visualPlan:error',
      error: 'disk full',
    });
  });

  it('posts visualPlan:error when openChatWithResult returns ok:false with a fallback message', async () => {
    setVisualPlanEnabled(true);
    vi.mocked(visualPlanService.createPendingPlan).mockResolvedValue({
      id: 'plan-fallback-1', title: 'fallback test', goal: 'fallback test', status: 'generating',
      createdAt: 1, updatedAt: 1, sections: [], comments: [],
    });
    // Simulate clipboard-fallback from openChatWithResult — happens when the
    // resolved providerId (still 'auto' in the bridge even after our ??-chain
    // fix because the host has no chat-capable CHAT_COMMANDS entry) has no
    // panel/terminal/withQuery/openOnly handler, so the bridge silently drops
    // the prompt on the clipboard and returns { ok: false, message, ... }.
    vi.mocked(openChatWithResult).mockResolvedValue({
      ok: false,
      provider: 'auto',
      usedTerminal: false,
      fallback: 'clipboard',
      message: 'Could not open Auto chat automatically — command copied to clipboard.',
    });

    const result = await handleAgenticKanbanMessage(
      { type: 'visualPlan:generate', goal: 'fallback test', sourceArtifactId: 'S-4' },
      mockStore,
      mockUri,
      mockWebview,
    );

    // Handler still ack's the IPC so the webview drops the queue/loading bar.
    expect(result).toBe(true);
    // The plan stub was still created (so the card appears immediately) and
    // the 'generating' state was still posted — these are pre-failure steps.
    expect(visualPlanService.createPendingPlan).toHaveBeenCalledWith({
      goal: 'fallback test',
      sourceArtifactId: 'S-4',
      context: undefined,
    });
    expect(mockWebview.postMessage).toHaveBeenCalledWith({
      type: 'visualPlan:generating',
      planId: 'plan-fallback-1',
      goal: 'fallback test',
    });
    // The fix under test: when openChatWithResult fails AND carries a message,
    // the handler must post visualPlan:error with that message so the user
    // sees "command copied to clipboard" rather than a silent no-op.
    expect(mockWebview.postMessage).toHaveBeenCalledWith({
      type: 'visualPlan:error',
      error: 'Could not open Auto chat automatically — command copied to clipboard.',
    });
  });

  it('returns true even when webview is missing (no-op, no crash)', async () => {
    setVisualPlanEnabled(false);

    // No webview — the gate should still work without crashing
    const result = await handleAgenticKanbanMessage(
      { type: 'visualPlan:generate', goal: 'no ui' },
      mockStore,
      mockUri,
      undefined,
    );

    expect(result).toBe(true);
    expect(visualPlanService.generate).not.toHaveBeenCalled();
  });
});
