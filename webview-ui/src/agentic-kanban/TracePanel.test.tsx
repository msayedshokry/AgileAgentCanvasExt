import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TracePanel } from './TracePanel';
import { mockVsCodeApi } from '../test/setup';
// Shared wire-format shape contract (audit gap #20/#42) — same types as the
// extension-side producer test, so producer/consumer stay in sync end-to-end.
// Lives at the extension's `src/types/trace-breakdown.ts` — a cross-project
// import; `tsc` follows the transitive import from this barrel without a
// special `include` override on the webview side.
import {
  TraceBreakdownMessage,
  UNTAGGED_BUCKET,
} from '../../../src/types/trace-breakdown';

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Fixed timestamps so the render is independent of clock-time changes between
// runs. T0–T1 is a 5-minute window — long enough that the formatted HH:MM:SS
// strings differ for startedAt and endedAt.
const T0 = '2024-01-01T00:00:00.000Z';
const T1 = '2024-01-01T00:05:00.000Z';

/** Build a fully-typed breakdown with sensible defaults — tests override subfields. */
function makeBreakdown(over: Partial<TraceBreakdownMessage>): TraceBreakdownMessage {
  return {
    type: 'traceBreakdownResponse',
    workflowName: 'dev-story',
    startedAt: T0,
    endedAt: T1,
    isRunning: false,
    totalEntries: 3,
    totalToolCalls: 3,
    totalErrors: 0,
    perWorkflow: [
      {
        workflow: 'mock-workflow-fixture',
        toolCallCount: 3,
        errorCount: 0,
        distinctTools: ['foo', 'bar'],
        totalEntries: 3,
      },
    ],
    ...over,
  };
}

/** Locate the panel root by its `aria-label`. */
function panel() {
  return screen.getByLabelText(/Trace breakdown for the most recent Kanban run/i);
}

// Match any time-like string (`12:05:00`, `12:05`, `12:05:00 AM`, …).
// Robust to `toLocaleTimeString` locale differences in the jsdom env.
const TIME_RE = /\d{1,2}:\d{2}/;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TracePanel', () => {
  // (1) Empty state — no runs yet
  it('1) renders the empty hint when there are no runs', () => {
    render(
      <TracePanel
        breakdown={makeBreakdown({
          workflowName: '',
          startedAt: '',
          endedAt: null,
          totalEntries: 0,
          totalToolCalls: 0,
          totalErrors: 0,
          perWorkflow: [],
        })}
      />,
    );

    const root = panel();
    expect(within(root).getByText('no runs yet')).toBeInTheDocument();
    expect(within(root).getByText(/No traces yet — start the Kanban autonomous loop/i)).toBeInTheDocument();
    // Refresh button is always present (so the user can re-pull after
    // starting a run).
    expect(
      within(root).getByRole('button', { name: /Refresh trace breakdown/i }),
    ).toBeInTheDocument();
    // No untagged toggle when empty (the perWorkflow list is empty so the
    // button's `!isEmpty && untaggedRow` guard skips it).
    expect(
      within(root).queryByRole('button', { name: /untagged/i }),
    ).not.toBeInTheDocument();
  });

  // (2) Loading state — breakdown not yet pulled
  it('2) renders "loading…" while the breakdown is null', () => {
    render(<TracePanel breakdown={null} />);

    const root = panel();
    expect(within(root).getByText('loading…')).toBeInTheDocument();
    expect(
      within(root).getByRole('button', { name: /Refresh trace breakdown/i }),
    ).toBeInTheDocument();
  });

  // (3) Running state — no terminal yet
  it('3) renders the running flag and "now" placeholder for in-flight runs', () => {
    render(
      <TracePanel
        breakdown={makeBreakdown({
          isRunning: true,
          endedAt: null,
        })}
      />,
    );

    const root = panel();
    expect(within(root).getByText('▶ running')).toBeInTheDocument();
    expect(within(root).getByText('dev-story')).toBeInTheDocument();
    // When `isRunning && endedAt === null`, the meta line prints "now".
    expect(within(root).getByText(/now/)).toBeInTheDocument();
    // Started time still renders even while running.
    expect(within(root).getByText(TIME_RE)).toBeInTheDocument();
  });

  // (4) Idle state — run has terminated
  it('4) renders the idle flag and HH:MM:SS endedAt when the run terminated', () => {
    render(
      <TracePanel
        breakdown={makeBreakdown({
          isRunning: false,
          endedAt: T1,
        })}
      />,
    );

    const root = panel();
    expect(within(root).getByText('● idle')).toBeInTheDocument();
    // Two time strings — started and ended — separated by the `→` arrow.
    expect(within(root).getByText(/→/)).toBeInTheDocument();
    // At least one time string rendered; "now" must NOT appear (idle+endedAt).
    expect(within(root).getByText(TIME_RE)).toBeInTheDocument();
    expect(within(root).queryByText(/now/)).not.toBeInTheDocument();
  });

  // (5a) Click chip to expand tool list
  it('5a) expands the workflow chip on click to show distinctTools', () => {
    render(
      <TracePanel
        breakdown={makeBreakdown({ isRunning: false, endedAt: T1 })}
      />,
    );

    // Tools hidden by default — the expand list lives inside the chip.
    expect(screen.queryByText('foo')).not.toBeInTheDocument();
    expect(screen.queryByText('bar')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Expand mock-workflow-fixture tools/i));

    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(screen.getByText('bar')).toBeInTheDocument();
    // aria-label flips to Collapse on the same button.
    expect(
      screen.getByLabelText(/Collapse mock-workflow-fixture tools/i),
    ).toBeInTheDocument();
  });

  // (5b) Click to collapse
  it('5b) collapses the expanded chip on a second click', () => {
    render(
      <TracePanel
        breakdown={makeBreakdown({ isRunning: false, endedAt: T1 })}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Expand mock-workflow-fixture tools/i));
    expect(screen.getByText('foo')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Collapse mock-workflow-fixture tools/i));
    expect(screen.queryByText('foo')).not.toBeInTheDocument();
  });

  // (6) Show-untagged toggle — row visibility is controlled by the toggle;
  // expand-within-row (tool list) is covered by tests 5a/5b above with the
  // named workflow chip.
  it('6) toggles visibility of the (untagged) bucket', () => {
    render(
      <TracePanel
        breakdown={makeBreakdown({
          isRunning: false,
          endedAt: T1,
          totalEntries: 4,
          perWorkflow: [
            {
              workflow: 'mock-workflow-fixture',
              toolCallCount: 3,
              errorCount: 0,
              distinctTools: ['foo', 'bar'],
              totalEntries: 3,
            },
            {
              workflow: UNTAGGED_BUCKET,
              toolCallCount: 1,
              errorCount: 0,
              distinctTools: ['orphan'],
              totalEntries: 1,
            },
          ],
        })}
      />,
    );

    // Untagged row hidden by default — opt-in toggle.
    expect(
      screen.queryByLabelText(/Expand \(untagged\) tools/i),
    ).not.toBeInTheDocument();
    // No `(untagged)` chip name in DOM before toggle.
    expect(screen.queryByText(UNTAGGED_BUCKET)).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /untagged/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);

    // After click: the (untagged) chip is rendered (its own expand button
    // appears in the DOM, and the chip name is visible).
    expect(
      screen.getByLabelText(/Expand \(untagged\) tools/i),
    ).toBeInTheDocument();
    expect(screen.getByText(UNTAGGED_BUCKET)).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  // (7) Refresh button posts IPC
  it('7) posts a getTraceBreakdown message when refresh is clicked', () => {
    render(<TracePanel breakdown={makeBreakdown({})} />);

    fireEvent.click(
      screen.getByRole('button', { name: /Refresh trace breakdown/i }),
    );

    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
      type: 'getTraceBreakdown',
    });
  });
});
