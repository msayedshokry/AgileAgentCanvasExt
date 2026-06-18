import { useEffect, useMemo, useState } from 'react';
import { vscode } from '../vscodeApi';

// ─── Types (mirror AgentSessionRow from the extension) ──────────────────────

type StatusKey =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'queued'
  | 'idle'
  | 'healthy'
  | 'degraded'
  | 'dead';

interface AgentSessionRow {
  id: string;
  source: 'acp' | 'kanban-progress' | 'terminal' | 'health';
  status: string;
  statusKey: StatusKey;
  agentRole?: string;
  workflowId?: string;
  artifactId?: string;
  startedAt?: string;
  endedAt?: string;
  toolCalls?: number;
  sparkline?: number[];
  terminalId?: string;
  lastMessage?: string;
}

interface AgentSessionsCounts {
  running: number;
  queued: number;
  completed: number;
  failed: number;
  degraded: number;
  total: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function emptyCounts(): AgentSessionsCounts {
  return { running: 0, queued: 0, completed: 0, failed: 0, degraded: 0, total: 0 };
}

// ─── Sparkline (12 bars, 5 s/window) ────────────────────────────────────────

function Sparkline({ data }: { data: number[] | undefined }) {
  const bars = useMemo(() => {
    const b = (data && data.length === 12) ? data : new Array(12).fill(0);
    const max = Math.max(1, ...b);
    return b.map((v, i) => ({
      v,
      h: Math.max(2, Math.round((v / max) * 24)),
      key: i,
    }));
  }, [data]);

  return (
    <div className="agent-sparkline" aria-label="Recent activity sparkline" role="img">
      {bars.map((b) => (
        <div
          key={b.key}
          className={`agent-sparkline-bar${b.v === 0 ? ' agent-sparkline-bar--dim' : ''}`}
          style={{ height: `${b.h}px` }}
          title={`${b.v} tool call${b.v === 1 ? '' : 's'} in this 5s window`}
        />
      ))}
    </div>
  );
}

// ─── Status pill ────────────────────────────────────────────────────────────

function StatusPill({ status, statusKey }: { status: string; statusKey: StatusKey }) {
  return (
    <span className={`agent-session-pill agent-session-pill--${statusKey}`}>{status}</span>
  );
}

// ─── Source icon glyph (text-based — no SVG library needed) ──────────────────

function SourceGlyph({ source }: { source: AgentSessionRow['source'] }) {
  const glyph =
    source === 'acp' ? '◈' :
    source === 'terminal' ? '▶' :
    source === 'health' ? '♥' :
    '◆';
  return <span className={`agent-session-source agent-session-source--${source}`}>{glyph}</span>;
}

// ─── Filter chips ───────────────────────────────────────────────────────────

type Filter = 'all' | 'active' | 'failed' | 'completed';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'failed', label: 'Failed' },
  { key: 'completed', label: 'Completed' },
];

function matchesFilter(row: AgentSessionRow, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') {
    return row.statusKey === 'running' || row.statusKey === 'queued';
  }
  if (filter === 'failed') {
    return row.statusKey === 'failed' || row.statusKey === 'cancelled'
        || row.statusKey === 'interrupted' || row.statusKey === 'dead'
        || row.statusKey === 'degraded';
  }
  if (filter === 'completed') {
    return row.statusKey === 'completed' || row.statusKey === 'idle' || row.statusKey === 'healthy';
  }
  return true;
}

// ─── Main component ─────────────────────────────────────────────────────────

export function AgentSessionsPanel() {
  const [rows, setRows] = useState<AgentSessionRow[]>([]);
  const [counts, setCounts] = useState<AgentSessionsCounts>(emptyCounts());
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // Subscribe to extension messages.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'agentSessionsUpdate') {
        if (Array.isArray(msg.rows)) setRows(msg.rows);
        if (msg.counts) setCounts({ ...emptyCounts(), ...msg.counts });
      }
    };
    window.addEventListener('message', onMessage);
    // Tell the extension we're mounted so it can push the initial snapshot.
    vscode.postMessage({ type: 'agentSessionsReady' });
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  const visibleRows = useMemo(
    () => rows.filter((r) => matchesFilter(r, filter)),
    [rows, filter]
  );

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const send = (type: string, extra: Record<string, unknown>) => {
    vscode.postMessage({ type, ...extra });
  };

  return (
    <div className="agent-sessions-panel">
      <div className="agent-sessions-header">
        <div className="agent-sessions-counts">
          <span className="agent-sessions-count agent-sessions-count--running" title="Running">
            <span className="agent-sessions-count-dot" />
            {counts.running}
            <span className="agent-sessions-count-label">run</span>
          </span>
          <span className="agent-sessions-count agent-sessions-count--queued" title="Queued">
            {counts.queued}
            <span className="agent-sessions-count-label">queue</span>
          </span>
          <span className="agent-sessions-count agent-sessions-count--failed" title="Failed + interrupted">
            {counts.failed}
            <span className="agent-sessions-count-label">err</span>
          </span>
          <span className="agent-sessions-count agent-sessions-count--degraded" title="Degraded or dead">
            {counts.degraded}
            <span className="agent-sessions-count-label">warn</span>
          </span>
        </div>
      </div>

      <div className="agent-sessions-filter-bar" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            className={`agent-sessions-filter-chip${filter === f.key ? ' agent-sessions-filter-chip--active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visibleRows.length === 0 ? (
        <div className="agent-sessions-empty">
          <div className="agent-sessions-empty-title">No matching sessions</div>
          <div className="agent-sessions-empty-body">
            {rows.length === 0
              ? 'Drop a story on the Agentic Kanban or run a workflow to see live sessions here.'
              : 'Try a different filter.'}
          </div>
        </div>
      ) : (
        <ul className="agent-sessions-list">
          {visibleRows.map((row) => {
            const isExpanded = expanded.has(row.id);
            return (
              <li
                key={row.id}
                className={`agent-session-card agent-session-card--${row.statusKey}${isExpanded ? ' agent-session-card--expanded' : ''}`}
                data-source={row.source}
              >
                <div className="agent-session-card-top">
                  <SourceGlyph source={row.source} />
                  <StatusPill status={row.status} statusKey={row.statusKey} />
                  {row.agentRole && (
                    <span className="agent-session-role" title="Agent role">{row.agentRole}</span>
                  )}
                  <button
                    className="agent-session-expand"
                    onClick={() => toggleExpanded(row.id)}
                    aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                  >
                    {isExpanded ? '▾' : '▸'}
                  </button>
                </div>

                <div className="agent-session-card-mid">
                  <div className="agent-session-card-info">
                    {row.workflowId && (
                      <span className="agent-session-workflow">
                        <span className="agent-session-label">Workflow</span>
                        <span className="agent-session-value">{row.workflowId}</span>
                      </span>
                    )}
                    {row.artifactId && (
                      <span className="agent-session-artifact">
                        <span className="agent-session-label">Artifact</span>
                        <span className="agent-session-value">{row.artifactId}</span>
                      </span>
                    )}
                    {row.startedAt && (
                      <span className="agent-session-time" title={row.startedAt}>
                        {relativeTime(row.startedAt)}
                      </span>
                    )}
                  </div>
                  <Sparkline data={row.sparkline} />
                </div>

                {isExpanded && (
                  <div className="agent-session-card-extra">
                    <div className="agent-session-extra-row">
                      {typeof row.toolCalls === 'number' && (
                        <span className="agent-session-meta">
                          <span className="agent-session-label">Tool calls</span>
                          <span className="agent-session-value">{row.toolCalls}</span>
                        </span>
                      )}
                      {row.lastMessage && (
                        <span className="agent-session-meta" title={row.lastMessage}>
                          <span className="agent-session-label">Last</span>
                          <span className="agent-session-value">{row.lastMessage}</span>
                        </span>
                      )}
                      {row.terminalId && (
                        <span className="agent-session-meta">
                          <span className="agent-session-label">Terminal</span>
                          <span className="agent-session-value">{row.terminalId}</span>
                        </span>
                      )}
                    </div>
                    <div className="agent-session-actions">
                      {row.artifactId && (
                        <button
                          className="agent-session-action-btn"
                          onClick={() => send('openTerminalForSession', { artifactId: row.artifactId, terminalId: row.terminalId })}
                        >
                          Open terminal
                        </button>
                      )}
                      <button
                        className="agent-session-action-btn"
                        onClick={() => send('openTraceForSession', { sessionId: row.id })}
                      >
                        View trace
                      </button>
                      <button
                        className="agent-session-action-btn agent-session-action-btn--danger"
                        onClick={() => send('discardSession', { sessionId: row.id, source: row.source })}
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default AgentSessionsPanel;
