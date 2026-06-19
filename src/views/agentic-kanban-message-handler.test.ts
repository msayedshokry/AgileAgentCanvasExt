import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TraceEntry } from '../trace/trace-recorder';

// Mock the trace recorder module so each test can drive `searchTraces()` from
// a fixture without touching disk. Hoisted above the import below so the
// handler module sees the mock during evaluation.
vi.mock('../trace/trace-recorder', () => ({
  getTraceRecorder: vi.fn(),
}));

import { computeTraceBreakdownForMostRecentRun } from './agentic-kanban-message-handler';
import { getTraceRecorder } from '../trace/trace-recorder';

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
        timestamp: t(500), workflowName: 'bmad-create-prd',
        data: { toolName: 'foo' },
      }),
      entry({
        sessionId: 's1', agent: 'chat', type: 'tool_call',
        timestamp: t(1000), workflowName: 'bmad-create-prd',
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
        workflow: 'bmad-create-prd',
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
        timestamp: t(500), workflowName: 'bmad-create-prd',
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
        workflow: 'bmad-create-prd',
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
        timestamp: t(500), workflowName: 'bmad-create-prd',
        data: { toolName: 'tagged-tool' },
      }),
      entry({
        sessionId: 's1', agent: 'chat', type: 'tool_call',
        timestamp: t(1000), workflowName: 'bmad-create-prd',
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
        workflow: 'bmad-create-prd',
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
