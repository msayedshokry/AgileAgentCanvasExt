/**
 * Shared canonical source of truth for the TraceBreakdown wire shape that
 * flows from the extension-side producer (`agentic-kanban-message-handler.ts`)
 * to the webview-side consumer (`TracePanel.tsx`) via the `traceBreakdownResponse`
 * IPC message.
 *
 * Lives at `src/types/trace-breakdown.ts` so it is part of the extension's
 * `tsconfig.json` `"rootDir": "src"` program naturally (no special placement
 * needed) and so production code can import from here without taking a
 * dependency on the `test/` folder. The webview imports it cross-project
 * via a relative path from `webview-ui/src/types.ts`; tsc follows the
 * transitive import into the upstream file as part of its program, so
 * no special `include` override is needed on the webview side anymore.
 *
 * Exports are deliberately minimal — types, a runtime constant, and small
 * type-guard predicates — so the file is cheap to bundle and re-import from
 * either side. Type-only importers get full drift detection at compile time.
 */

/**
 * Bucket key the breakdown assigns to entries that lack a top-level
 * `workflowName` field — pre-audit legacy traces and any entry the
 * producer didn't tag. Used by both producer (when grouping) and
 * consumer (when rendering the toggle chip), so centralising the
 * string here keeps them in sync if the label ever changes.
 */
export const UNTAGGED_BUCKET = '(untagged)';

/**
 * One row of the per-workflow aggregation. Matches the wire format used
 * by `computeTraceBreakdownForMostRecentRun` in the extension and the
 * `TracePanel` component prop in the webview.
 */
export interface TraceBreakdownRow {
  /** Workflow label (e.g. `aac-create-prd`, `aac-dev-story`) or `UNTAGGED_BUCKET`. */
  workflow: string;
  /** Number of `tool_call`-type entries bucketed under `workflow`. */
  toolCallCount: number;
  /** Number of `error`-type entries bucketed under `workflow`. */
  errorCount: number;
  /** Sorted distinct `data.toolName` values seen across the row's entries. */
  distinctTools: string[];
  /** Total entries bucketed under `workflow` (rows of all types). */
  totalEntries: number;
}

/**
 * Top-level IPC payload shape. The discriminator `type` is the message
 * channel tag the webview listens for on its `window.addEventListener('message', …)`.
 */
export interface TraceBreakdownMessage {
  type: 'traceBreakdownResponse';
  /** Resolved workflow label of the most-recent run (`''` when no run is found). */
  workflowName: string;
  /** ISO stamp of the run's start decision (`''` when no run is found). */
  startedAt: string;
  /** ISO stamp of the run's terminal marker, or `null` if still running. */
  endedAt: string | null;
  /** `true` when the most-recent `started X` decision has no matching terminal entry. */
  isRunning: boolean;
  /** Total entries inside the resolved run window. */
  totalEntries: number;
  /** Subset of `totalEntries` whose `type === 'tool_call'`. */
  totalToolCalls: number;
  /** Subset of `totalEntries` whose `type === 'error'`. */
  totalErrors: number;
  /** Per-workflow aggregation rows, sorted by `toolCallCount` DESC. */
  perWorkflow: TraceBreakdownRow[];
}

/**
 * Runtime type-guard for defensive structural validation in tests. Returns
 * `true` if `value` matches the wire-format shape — useful when the test
 * receives a value from a loosely-typed boundary (e.g. from `webview.postMessage`
 * casts) and wants to gate further assertions on a structural check rather
 * than a full deep-equality.
 */
export function isBreakdownMessage(value: unknown): value is TraceBreakdownMessage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<TraceBreakdownMessage>;
  if (v.type !== 'traceBreakdownResponse') return false;
  if (typeof v.workflowName !== 'string') return false;
  if (typeof v.startedAt !== 'string') return false;
  if (v.endedAt !== null && typeof v.endedAt !== 'string') return false;
  if (typeof v.isRunning !== 'boolean') return false;
  if (typeof v.totalEntries !== 'number') return false;
  if (typeof v.totalToolCalls !== 'number') return false;
  if (typeof v.totalErrors !== 'number') return false;
  if (!Array.isArray(v.perWorkflow)) return false;
  return v.perWorkflow.every((r): r is TraceBreakdownRow => {
    if (typeof r !== 'object' || r === null) return false;
    const p = r as Partial<TraceBreakdownRow>;
    return (
      typeof p.workflow === 'string' &&
      typeof p.toolCallCount === 'number' &&
      typeof p.errorCount === 'number' &&
      Array.isArray(p.distinctTools) &&
      p.distinctTools.every((t) => typeof t === 'string') &&
      typeof p.totalEntries === 'number'
    );
  });
}
