import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { KanbanColumn } from '../components/kanban/KanbanColumn';
import type { KanbanItem, KanbanColumnKey } from '../components/kanban/KanbanTypes';
import { KANBAN_COLUMNS, normalizeToKanbanColumn } from '../components/kanban/KanbanTypes';
import { vscode } from '../vscodeApi';
import '../components/kanban/Kanban.css';

// ── Terminal Modal ───────────────────────────────────────────────────────────

function TerminalModal({
  artifactId,
  artifactTitle,
  onClose,
}: {
  artifactId: string;
  artifactTitle: string;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  // Listen for terminal data messages from the extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'terminalOutput' && msg.artifactId === artifactId) {
        // Initial payload: split into lines
        setLines(msg.data.split(/\r?\n/));
      } else if (msg.type === 'terminalOutputAppend' && msg.artifactId === artifactId) {
        // Streaming append: the last line gets concatenated, or new line added
        setLines(prev => {
          const chunk = msg.data;
          if (prev.length === 0) {
            return chunk.split(/\r?\n/);
          }
          // Append to last line, then split any newlines in the chunk
          const parts = chunk.split(/\r?\n/);
          const newLines = [...prev];
          newLines[newLines.length - 1] += parts[0];
          for (let i = 1; i < parts.length; i++) {
            newLines.push(parts[i]);
          }
          return newLines;
        });
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [artifactId]);

  return (
    <div className="terminal-modal-overlay" onClick={onClose}>
      <div className="terminal-modal" onClick={e => e.stopPropagation()}>
        <header className="terminal-modal-header">
          <div className="terminal-modal-title">
            <span className="terminal-modal-icon">⏱</span>
            <span>Terminal: {artifactTitle}</span>
          </div>
          <div className="terminal-modal-actions">
            <button
              className="terminal-modal-btn"
              onClick={() => {
                vscode.postMessage({ type: 'kanban:jumpToTerminal', artifactId });
              }}
              title="Open in VS Code terminal panel"
            >
              Open in Panel
            </button>
            <button className="terminal-modal-close" onClick={onClose} aria-label="Close terminal">
              &times;
            </button>
          </div>
        </header>
        <div className="terminal-modal-body" ref={scrollRef}>
          <pre className="terminal-modal-output">
            {lines.length > 0
              ? lines.map((line, i) => (
                  <span key={i}>
                    {line}
                    {'\n'}
                  </span>
                ))
              : 'Connecting to terminal...'}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─── AgenticKanbanApp ────────────────────────────────────────────────────────
// Execution orchestration surface with HTML5 Drag-and-Drop between Kanban columns.
// Drag a card to a new column → postMessage('kanban:statusChanged') → extension
// handles LaneTransitionEngine, concurrency, and (in Epic 2+) ACP workflow launch.

// ── Helpers ──────────────────────────────────────────────────────────────────

interface ArtifactLike {
  id: string;
  type?: string;
  title?: string;
  name?: string;
  status?: string;
  parentId?: string;
  epicKey?: string;
}

interface AgenticKanbanAppProps {
  /** Pre-populated artifacts passed from the parent App (canvas mode).
   *  When provided, these are used immediately instead of waiting
   *  for an updateArtifacts message from the extension. */
  initialArtifacts?: ArtifactLike[];
}

/** Types relevant to agentic workflow execution. */
const AGENTIC_TYPES = new Set(['epic', 'story']);

function isAgenticType(a: ArtifactLike): boolean {
  return AGENTIC_TYPES.has(a.type ?? '');
}

function artifactToKanbanItem(a: ArtifactLike): KanbanItem {
  return {
    id: a.id,
    key: a.id,
    title: a.title || a.name || a.id,
    status: a.status || 'backlog',
    type: a.type || 'unknown',
    epicKey: a.parentId || a.epicKey,
    isEpic: a.type === 'epic',
  };
}

function kanbanColumnToStatus(col: KanbanColumnKey): string {
  switch (col) {
    case 'backlog': return 'backlog';
    case 'ready-for-dev': return 'ready-for-dev';
    case 'in-progress': return 'in-progress';
    case 'review': return 'review';
    case 'done': return 'done';
    case 'optional': return 'optional';
  }
}

// ── Agent info types (fetched from extension on card click) ──────────────────

interface AgentInfo {
  persona?: {
    name: string;
    title: string;
    icon: string;
    role: string;
    communicationStyle: string;
  };
  terminalInfo?: {
    workflowId: string;
    agentRole: string;
    provider: string;
    startedAt: string;
  };
  traceSummary?: {
    decisions: number;
    toolCalls: number;
    errors: number;
  };
}

// ── Status badge helper ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls = `kanban-agent-status kanban-agent-status--${status}`;
  const label = status.charAt(0).toUpperCase() + status.slice(1).replace(/-/g, ' ');
  return <span className={cls}>{label}</span>;
}

// ── Persona icon (initials-based avatar) ─────────────────────────────────────

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#f97316', '#eab308',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .slice(0, 2)
    .join('');
}

function AgentAvatar({ name, icon }: { name: string; icon?: string }) {
  const bg = getAvatarColor(name);
  const initials = getInitials(name);
  return (
    <div
      className="agentic-agent-avatar"
      style={{ background: bg }}
      title={name}
    >
      {icon || initials}
    </div>
  );
}

// ── Detail Panel (inline) ────────────────────────────────────────────────────

type TraceFilter = 'all' | 'decisions' | 'toolCalls' | 'errors';

const INTERRUPTION_MESSAGES: Record<string, string> = {
  'timeout': 'This workflow timed out. Resume to continue or abandon to release the lock.',
  'error': 'This workflow encountered an error and was stopped. Resume to re-attempt or abandon to release the lock.',
  'user-abort': 'This workflow was manually stopped. Resume to continue or abandon to release the lock.',
  'no-session': 'No active AI session was found. Start a @agileagentcanvas chat session to resume, or abandon to release the lock.',
};

function getInterruptionMessage(reason?: string): string {
  return INTERRUPTION_MESSAGES[reason ?? ''] ?? 'This workflow was interrupted when VS Code was closed. Resume to continue or abandon to release the lock.';
}

function AgenticDetailPanel({ item, onClose, onOpenTerminal, infoCache, resumingArtifactId, onResumeStateChange }: { item?: KanbanItem; onClose: () => void; onOpenTerminal?: (item: KanbanItem) => void; infoCache?: React.MutableRefObject<Map<string, AgentInfo>>; resumingArtifactId?: string | null; onResumeStateChange?: (id: string | null) => void }) {
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(() => infoCache?.current.get(item?.id ?? '') ?? null);
  const [loadingInfo, setLoadingInfo] = useState(!infoCache?.current.has(item?.id ?? ''));
  const [traceFilter, setTraceFilter] = useState<TraceFilter>('all');
  const [pendingUndoArtifact, setPendingUndoArtifact] = useState<{ artifactId: string; sessionId?: string } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isResuming = resumingArtifactId === item?.id;

  // Clear undo timeout on unmount + clear pending undo when panel closes
  useEffect(() => {
    return () => {
      clearTimeout(undoTimeoutRef.current);
      clearTimeout(resumeTimeoutRef.current);
      setPendingUndoArtifact(null);
    };
  }, []);

  if (!item) return null;
  const isInterrupted = item.agentState?.status === 'interrupted';
  const hasTerminal = !!item.agentState?.terminalId;
  const status = item.agentState?.status || 'idle';
  const hasPendingUndo = pendingUndoArtifact?.artifactId === item.id;

  // Fetch agent info when the panel opens (only if not cached)
  useEffect(() => {
    // If already cached, skip fetch and use cached data
    const cached = infoCache?.current.get(item.id);
    if (cached) {
      setAgentInfo(cached);
      setLoadingInfo(false);
      return;
    }

    setLoadingInfo(true);
    vscode.postMessage({ type: 'kanban:fetchAgentInfo', artifactId: item.id });

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'agentInfo' && msg.artifactId === item.id) {
        setAgentInfo(msg);
        setLoadingInfo(false);
        // Store in cache for future card clicks
        infoCache?.current.set(item.id, msg);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [item.id]);

  // ── Compute display values from agent info ──────────────────────────
  const persona = agentInfo?.persona;
  const terminalInfo = agentInfo?.terminalInfo;
  const traceSummary = agentInfo?.traceSummary;

  // Derive display name and icon
  const agentDisplayName = persona?.name || terminalInfo?.agentRole || item.agentState?.agentRole || 'Agent';
  const agentTitle = persona?.title || terminalInfo?.workflowId || '';
  const agentIcon = persona?.icon || '';

  const hasRunAction = isInterrupted || hasTerminal || !!terminalInfo || hasPendingUndo;

  // Time formatting helper
  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="agentic-detail-panel">
      {/* ── Header ── */}
      <header className="agentic-detail-header">
        <div className="agentic-detail-header-row">
          <h3 className="agentic-detail-title">{item.title}</h3>
          <button onClick={onClose} aria-label="Close" className="agentic-detail-close-btn">&times;</button>
        </div>
        <div className="agentic-detail-meta">
          <span className="agentic-detail-meta-item">{item.type}</span>
          <span className="agentic-detail-meta-divider">|</span>
          <span className="agentic-detail-meta-item">{item.id}</span>
          {item.epicKey && (
            <>
              <span className="agentic-detail-meta-divider">|</span>
              <span className="agentic-detail-meta-item">{item.epicKey}</span>
            </>
          )}
        </div>
      </header>

      {/* ── Agent Persona Card ── */}
      <section className="agentic-detail-section agentic-detail-persona">
        <h4>Agent</h4>
        {loadingInfo && !agentInfo ? (
          <div className="agentic-detail-loading">Loading agent info…</div>
        ) : (
          <div className="agentic-persona-card">
            <AgentAvatar name={agentDisplayName} icon={agentIcon} />
            <div className="agentic-persona-info">
              <div className="agentic-persona-name">{agentDisplayName}</div>
              {agentTitle && <div className="agentic-persona-title">{agentTitle}</div>}
              {persona?.role && <div className="agentic-persona-role">{persona.role}</div>}
              {persona?.communicationStyle && (
                <div className="agentic-persona-style">{persona.communicationStyle}</div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Execution Status ── */}
      <section className="agentic-detail-section agentic-detail-execution">
        <h4>Execution</h4>
        <div className="agentic-execution-grid">
          <div className="agentic-execution-item">
            <span className="agentic-execution-label">Status</span>
            <StatusBadge status={status} />
          </div>
          {terminalInfo?.workflowId && (
            <div className="agentic-execution-item">
              <span className="agentic-execution-label">Workflow</span>
              <span className="agentic-execution-value">{terminalInfo.workflowId}</span>
            </div>
          )}
          {terminalInfo?.startedAt && (
            <div className="agentic-execution-item">
              <span className="agentic-execution-label">Started</span>
              <span className="agentic-execution-value">{formatTime(terminalInfo.startedAt)}</span>
            </div>
          )}
          {item.lockInfo?.locked && (
            <div className="agentic-execution-item">
              <span className="agentic-execution-label">Lock</span>
              <span className="agentic-execution-value agentic-execution-value--locked">
                Locked by {item.lockInfo.agentName || 'unknown'}
              </span>
            </div>
          )}
          {item.agentState?.sessionId && (
            <div className="agentic-execution-item">
              <span className="agentic-execution-label">Trace</span>
              <a
                href="#"
                className="agentic-execution-link"
                onClick={(e) => {
                  e.preventDefault();
                  vscode.postMessage({ type: 'kanban:viewTrace', sessionId: item.agentState!.sessionId });
                }}
              >
                View full trace →
              </a>
            </div>
          )}
          {terminalInfo?.provider && (
            <div className="agentic-execution-item">
              <span className="agentic-execution-label">Provider</span>
              <span className="agentic-execution-value">{terminalInfo.provider}</span>
            </div>
          )}
        </div>
      </section>

      {/* ── Trace Summary ── */}
      {traceSummary && (
        <section className="agentic-detail-section agentic-detail-trace">
          <h4>
            Activity
            {/* Filter chips in the header row */}
            <span className="agentic-trace-filter-bar">
              {(['all', 'decisions', 'toolCalls', 'errors'] as const).map(f => (
                <button
                  key={f}
                  className={`agentic-trace-filter-btn${traceFilter === f ? ' active' : ''}`}
                  onClick={() => setTraceFilter(traceFilter === f ? 'all' : f)}
                >
                  {f === 'all' ? 'All' : f === 'decisions' ? 'Decisions' : f === 'toolCalls' ? 'Tool Calls' : 'Errors'}
                </button>
              ))}
            </span>
          </h4>
          <div className="agentic-trace-summary">
            <div className={`agentic-trace-stat${traceFilter !== 'all' && traceFilter !== 'decisions' ? ' agentic-trace-stat--dimmed' : ''}`}>
              <span className="agentic-trace-stat-value">{traceSummary.decisions}</span>
              <span className="agentic-trace-stat-label">decisions</span>
            </div>
            <div className={`agentic-trace-stat${traceFilter !== 'all' && traceFilter !== 'toolCalls' ? ' agentic-trace-stat--dimmed' : ''}`}>
              <span className="agentic-trace-stat-value">{traceSummary.toolCalls}</span>
              <span className="agentic-trace-stat-label">tool calls</span>
            </div>
            {traceSummary.errors > 0 && (
              <div className={`agentic-trace-stat agentic-trace-stat--error${traceFilter !== 'all' && traceFilter !== 'errors' ? ' agentic-trace-stat--dimmed' : ''}`}>
                <span className="agentic-trace-stat-value">{traceSummary.errors}</span>
                <span className="agentic-trace-stat-label">errors</span>
              </div>
            )}
            {traceSummary.errors === 0 && traceFilter === 'errors' && (
              <div className="agentic-trace-stat agentic-trace-stat--dimmed">
                <span className="agentic-trace-stat-value">0</span>
                <span className="agentic-trace-stat-label">errors</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Actions ── */}
      {hasRunAction && (
        <section className="agentic-detail-section agentic-detail-actions">
          <h4>Actions</h4>
          <div className="agentic-action-buttons">
            {isInterrupted && (
              <>
                {!isResuming && (
                  <p className="agentic-detail-warning">{getInterruptionMessage(item.agentState?.interruptionReason)}</p>
                )}
                {isResuming && (
                  <p className="agentic-detail-warning agentic-detail-warning--resuming">
                    <span className="agentic-resume-spinner" />
                    Reconnecting…
                  </p>
                )}
                <button
                  className={`agentic-detail-btn agentic-detail-btn--resume${isResuming ? ' is-loading' : ''}`}
                  disabled={isResuming}
                  onClick={() => {
                    onResumeStateChange?.(item.id);
                    vscode.postMessage({
                      type: 'kanban:resumeExecution',
                      artifactId: item.id,
                      artifactType: item.type,
                      sessionId: item.agentState?.sessionId,
                      workflowId: item.agentState?.workflowId,
                    });
                    // Safety timeout: reset after 15s even if no response
                    clearTimeout(resumeTimeoutRef.current);
                    resumeTimeoutRef.current = setTimeout(() => onResumeStateChange?.(null), 15000);
                  }}
                >
                  {isResuming ? '⟳ Reconnecting…' : 'Resume'}
                </button>
                <button
                  className="agentic-detail-btn agentic-detail-btn--abandon"
                  onClick={() => {
                    vscode.postMessage({
                      type: 'kanban:abandonExecution',
                      artifactId: item.id,
                      sessionId: item.agentState?.sessionId,
                    });
                    setPendingUndoArtifact({ artifactId: item.id, sessionId: item.agentState?.sessionId });
                    // Auto-dismiss undo offer after 8 seconds
                    clearTimeout(undoTimeoutRef.current);
                    undoTimeoutRef.current = setTimeout(() => setPendingUndoArtifact(prev => prev?.artifactId === item.id ? null : prev), 8000);
                  }}
                >
                  Abandon
                </button>
                {hasPendingUndo && (
                  <button
                    className="agentic-detail-btn agentic-detail-btn--undo"
                    onClick={() => {
                      vscode.postMessage({
                        type: 'kanban:undoAbandonExecution',
                        artifactId: item.id,
                        sessionId: pendingUndoArtifact?.sessionId,
                      });
                      setPendingUndoArtifact(null);
                    }}
                  >
                    ↩ Undo
                  </button>
                )}
              </>
            )}
            {(hasTerminal || !!terminalInfo) && (
              <button
                className="agentic-detail-btn agentic-detail-btn--terminal"
                onClick={() => {
                  vscode.postMessage({ type: 'kanban:jumpToTerminal', artifactId: item.id });
                  onOpenTerminal?.(item);
                }}
              >
                View Terminal
              </button>
            )}
          </div>
        </section>
      )}

          </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function AgenticKanbanApp({ initialArtifacts }: AgenticKanbanAppProps) {
  const [items, setItems] = useState<KanbanItem[]>(
    () => initialArtifacts?.filter(isAgenticType).map(a => artifactToKanbanItem(a)) ?? []
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingTransitions, setPendingTransitions] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'info' } | null>(null);
  const [loading, setLoading] = useState<boolean>(!initialArtifacts);
  const [terminalModal, setTerminalModal] = useState<{ artifactId: string; artifactTitle: string } | null>(null);
  // Agent info cache: avoids re-fetching persona/trace on every card click.
  // Cleared when artifacts are refreshed or agent state updates.
  const agentInfoCache = useRef<Map<string, AgentInfo>>(new Map());
  // Track which artifact has a Resume in progress (shows spinner on card + disables button)
  const [resumingArtifactId, setResumingArtifactId] = useState<string | null>(null);

  // Ref to avoid stale closure in handleDrop (reviewer feedback)
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // ── Listen for messages from extension ────────────────────────────────────
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'updateArtifacts':
          setLoading(false);
          // Clear agent info cache when artifacts are refreshed
          agentInfoCache.current.clear();
          setItems(prev => {
            // Preserve agentState, lockInfo, and harnessResults from previous
            // items so that agent badges (running/queued/interrupted/terminal)
            // survive webview reloads and visibility changes.
            const prevMeta = new Map(
              prev.map(i => [i.id, { agentState: i.agentState, lockInfo: i.lockInfo, harnessResults: i.harnessResults }])
            );
            return (message.artifacts as ArtifactLike[])
              .filter(isAgenticType)
              .map(a => {
                const item = artifactToKanbanItem(a);
                const meta = prevMeta.get(item.id);
                return meta ? { ...item, ...meta } : item;
              });
          });
          break;
        case 'agentStateUpdated':
          // Clear cached info for this artifact since state changed
          agentInfoCache.current.delete(message.artifactId);
          // Clear resume spinner when state updates
          setResumingArtifactId(prev => prev === message.artifactId ? null : prev);
          setItems(prev => prev.map(item =>
            item.id === message.artifactId
              ? { ...item, agentState: message.agentState, lockInfo: message.lockInfo }
              : item
          ));
          break;
        case 'transitionResult':
          setPendingTransitions(prev => {
            const next = new Set(prev);
            next.delete(message.artifactId);
            return next;
          });
          if (!message.ok) {
            setToast({ message: `Transition failed: ${(message.blockedBy as string[])?.join(', ') ?? 'unknown reason'}`, type: 'error' });
          }
          break;
      }
    };

    window.addEventListener('message', handler);

    // Safety timeout: dismiss loading after 5s even if no data arrives
    const timeout = setTimeout(() => setLoading(false), 5000);

    // If no initialArtifacts were provided, ask the extension for data
    if (!initialArtifacts) {
      vscode.postMessage({ type: 'agenticKanbanReady' });
    }

    return () => {
      window.removeEventListener('message', handler);
      clearTimeout(timeout);
    };
  }, [initialArtifacts]);

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Enrich items with pending transition state ────────────────────────────
  const displayItems = useMemo(() =>
    items.map(item =>
      pendingTransitions.has(item.id)
        ? { ...item, agentState: { ...item.agentState, status: 'queued' as const, agentRole: item.agentState?.agentRole } }
        : item
    ),
    [items, pendingTransitions]
  );

  // ── Group items by Kanban column ──────────────────────────────────────────
  const groupedItems = useMemo(() => {
    const groups = new Map<KanbanColumnKey, KanbanItem[]>();
    KANBAN_COLUMNS.forEach(c => groups.set(c.key, []));
    for (const item of displayItems) {
      const col = normalizeToKanbanColumn(item.status);
      groups.get(col)?.push(item);
    }
    return groups;
  }, [displayItems]);

  // ── DnD: Drop handler (uses ref to avoid stale closure) ───────────────────
  const handleDrop = useCallback((itemId: string, targetColumn: KanbanColumnKey) => {
    const item = itemsRef.current.find(i => i.id === itemId);
    if (!item) return;

    const targetStatus = kanbanColumnToStatus(targetColumn);
    if (item.status === targetStatus) return;

    // Optimistic UI update
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, status: targetStatus } : i
    ));
    setPendingTransitions(prev => new Set(prev).add(itemId));

    // Notify extension
    vscode.postMessage({
      type: 'kanban:statusChanged',
      artifactId: itemId,
      fromStatus: item.status,
      toStatus: targetStatus,
      artifactType: item.type,
    });
  }, []); // no deps — uses ref

  // ── Card click → select for detail panel ──────────────────────────────────
  const handleCardClick = useCallback((item: KanbanItem) => {
    setSelectedId(prev => prev === item.id ? null : item.id);
  }, []);

  const selectedItem = useMemo(
    () => (selectedId ? displayItems.find(i => i.id === selectedId) : undefined),
    [selectedId, displayItems]
  );

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="agentic-kanban">
        <header className="agentic-kanban-header">
          <h2>Agentic Execution Board</h2>
        </header>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: 'var(--vscode-descriptionForeground)', fontSize: '14px' }}>
          Loading artifacts…
        </div>
      </div>
    );
  }

  return (
    <div className="agentic-kanban">
      <header className="agentic-kanban-header">
        <h2>Agentic Execution Board</h2>
        <div className="agentic-kanban-toolbar">
          <button onClick={() => vscode.postMessage({ type: 'openTraceViewer' })}>
            View Traces
          </button>
          <button onClick={() => vscode.postMessage({ type: 'agenticKanban:refresh' })}>
            Refresh
          </button>
        </div>
      </header>

      <div className="agentic-kanban-board">
        {KANBAN_COLUMNS.map(col => (
          <KanbanColumn
            key={col.key}
            column={col}
            items={groupedItems.get(col.key) ?? []}
            draggable={true}
            onDrop={handleDrop}
            onCardClick={handleCardClick}
            resumingArtifactId={resumingArtifactId}
          />
        ))}
      </div>

      {selectedItem && (
        <AgenticDetailPanel
          item={selectedItem}
          onClose={() => setSelectedId(null)}
          onOpenTerminal={(item) => setTerminalModal({ artifactId: item.id, artifactTitle: item.title })}
          infoCache={agentInfoCache}
          resumingArtifactId={resumingArtifactId}
          onResumeStateChange={setResumingArtifactId}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`kanban-toast kanban-toast--${toast.type}`}>
          {toast.message}
        </div>
      )}

      {terminalModal && (
        <TerminalModal
          artifactId={terminalModal.artifactId}
          artifactTitle={terminalModal.artifactTitle}
          onClose={() => setTerminalModal(null)}
        />
      )}
    </div>
  );
}
