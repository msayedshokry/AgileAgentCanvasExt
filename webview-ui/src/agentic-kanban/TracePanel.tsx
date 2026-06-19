import { useState } from 'react';
import { vscode } from '../vscodeApi';
import { useEvent } from './useEvent';
import { UNTAGGED_BUCKET, type TraceBreakdownMessage } from '../types';

// ── Component ────────────────────────────────────────────────────────────────

interface TracePanelProps {
  /** Per-workflow aggregation for the most recent run window (null = not yet pulled). */
  breakdown: TraceBreakdownMessage | null;
}

/** Format an ISO timestamp as HH:MM:SS. Returns '' for empty input. */
function formatClock(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function TracePanel({ breakdown }: TracePanelProps) {
  const [showUntagged, setShowUntagged] = useState<boolean>(false);
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);

  // ── Stable handlers (useEvent: identity-stable, latest closure) ────────
  // Matches the codebase convention (see AutonomyBar.tsx, AgenticKanbanApp.tsx):
  // every onClick goes through useEvent so the JSX `<button>` reference
  // doesn't churn on re-render.
  const handleRefresh = useEvent(() => {
    vscode.postMessage({ type: 'getTraceBreakdown' });
  });
  const handleToggleUntagged = useEvent(() => {
    setShowUntagged(prev => !prev);
  });
  const handleToggleWorkflow = useEvent((row: string) => {
    setExpandedWorkflow(prev => (prev === row ? null : row));
  });

  // ── Derived display values ──────────────────────────────────────────────
  const isLoaded = breakdown !== null;
  const isEmpty = isLoaded && breakdown.totalEntries === 0;
  const isRunning = breakdown?.isRunning ?? false;
  const startedLabel = breakdown?.startedAt ? formatClock(breakdown.startedAt) : '';
  const endedLabel = breakdown?.endedAt ? formatClock(breakdown.endedAt) : '';
  // Split out the "(untagged)" bucket so the user can opt into seeing it
  // — these are pre-audit entries (workflowName was added in this audit
  // chain) and shouldn't drown out the named workflows.
  const visibleRows = (breakdown?.perWorkflow ?? []).filter(r => {
    if (r.workflow !== UNTAGGED_BUCKET) return true;
    return showUntagged;
  });    const untaggedRow = (breakdown?.perWorkflow ?? []).find(r => r.workflow === UNTAGGED_BUCKET);

  return (
    <div className="trace-panel" aria-label="Trace breakdown for the most recent Kanban run">
      {/* ── Status row ──────────────────────────────────────────────────── */}
      <div className="trace-panel-group">
        <span className="trace-panel-label">Trace:</span>
        {isLoaded && breakdown.workflowName ? (
          <>
            <span
              className={`trace-panel-state trace-panel-state--${isRunning ? 'running' : 'idle'}`}
              title={isRunning ? 'Run is still in progress' : 'Run has terminated'}
            >
              {isRunning ? '▶ running' : '● idle'}
            </span>
            <span className="trace-panel-workflow-name">{breakdown.workflowName}</span>
            <span className="trace-panel-meta">
              {startedLabel}
              {' → '}
              {endedLabel || (isRunning ? 'now' : '—')}
            </span>
          </>
        ) : (
          <span className="trace-panel-meta">
            {isLoaded ? 'no runs yet' : 'loading…'}
          </span>
        )}
        <button
          className="trace-panel-btn-icon"
          onClick={handleRefresh}
          title="Refresh trace breakdown from extension"
          aria-label="Refresh trace breakdown"
        >
          ↻
        </button>
        {!isEmpty && untaggedRow && (
          <button
            className="trace-panel-btn-icon"
            onClick={handleToggleUntagged}
            title={showUntagged ? 'Hide pre-audit untagged entries' : `Show ${untaggedRow.totalEntries} pre-audit untagged entr${untaggedRow.totalEntries === 1 ? 'y' : 'ies'}`}
            aria-pressed={showUntagged}
          >
            {showUntagged ? '▾' : '▸'} untagged
          </button>
        )}
      </div>

      {/* ── Per-workflow rows ───────────────────────────────────────────── */}
      {isEmpty && (
        <div className="trace-panel-group trace-panel-group--empty">
          <span className="trace-panel-meta">
            No traces yet — start the Kanban autonomous loop to see per-workflow tool activity.
          </span>
        </div>
      )}
      {!isEmpty && visibleRows.length > 0 && (
        <div className="trace-panel-group trace-panel-group--workflows">
          {visibleRows.map(row => {
            const expanded = expandedWorkflow === row.workflow;
            return (
              <span
                key={row.workflow}
                className={`trace-panel-workflow-chip${row.errorCount > 0 ? ' trace-panel-workflow-chip--errors' : ''}${row.workflow === UNTAGGED_BUCKET ? ' trace-panel-workflow-chip--untagged' : ''}`}
                title={
                  row.distinctTools.length > 0
                    ? `Tools fired: ${row.distinctTools.join(', ')}`
                    : 'No tool names recorded'
                }
              >
                <button
                  className="trace-panel-workflow-chip-btn"
                  onClick={() => handleToggleWorkflow(row.workflow)}
                  aria-expanded={expanded}
                  aria-label={expanded ? `Collapse ${row.workflow} tools` : `Expand ${row.workflow} tools`}
                  title={expanded ? 'Collapse tool list' : 'Show tools fired'}
                >
                  <span className="trace-panel-workflow-chip-name">{row.workflow}</span>
                </button>
                <span className="trace-panel-workflow-chip-count">{row.toolCallCount}</span>
                {row.errorCount > 0 && (
                  <span
                    className="trace-panel-workflow-chip-errors"
                    title={`${row.errorCount} error entr${row.errorCount === 1 ? 'y' : 'ies'} in this window`}
                  >
                    ⚠ {row.errorCount}
                  </span>
                )}
                {row.workflow === UNTAGGED_BUCKET && (
                  <span className="trace-panel-workflow-chip-tag" title="Pre-audit entries lacking a workflowName tag">pre-audit</span>
                )}
                {expanded && row.distinctTools.length > 0 && (
                  <span className="trace-panel-workflow-chip-tools">
                    {row.distinctTools.map(t => (
                      <span key={t} className="trace-panel-workflow-chip-tool">{t}</span>
                    ))}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
