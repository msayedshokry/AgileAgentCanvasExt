import { useState, useRef, useEffect } from 'react';
import type { KanbanItem } from '../components/kanban/KanbanTypes';
import { vscode } from '../vscodeApi';
import { useEvent } from './useEvent';
import {
  AgentInfo,
  TraceFilter,
  getInterruptionMessage,
  getAvatarColor,
  getInitials,
} from './kanban-helpers';

interface AgenticDetailPanelProps {
  item: KanbanItem;
  onClose: () => void;
  onOpenTerminal?: (item: KanbanItem) => void;
  /** P1 #4: request take-over of this agent (switch to terminals, focus tile). */
  onTakeOver?: (item: KanbanItem) => void;
  /** Whether the embedded terminal backend supports typed input. */
  terminalInteractive?: boolean;
  /** Cache shared with the parent so card re-clicks don't re-fetch. */
  infoCache?: React.MutableRefObject<Map<string, { info: AgentInfo; status: string }>>;
  resumingArtifactId?: string | null;
  onResumeStateChange?: (id: string | null) => void;
  /**
   * Whether a chat session with a model is currently active. When false,
   * the Resume button is disabled and the tooltip explains why.
   */
  chatSessionActive: boolean;
  /** The model name, used to compose a more specific Resume tooltip. */
  chatSessionModel?: string;
}

function StatusBadge({ status }: { status: string }) {
  const cls = `kanban-agent-status kanban-agent-status--${status}`;
  const label = status.charAt(0).toUpperCase() + status.slice(1).replace(/-/g, ' ');
  return <span className={cls}>{label}</span>;
}

function AgentAvatar({ name, icon }: { name: string; icon?: string }) {
  const bg = getAvatarColor(name);
  const initials = getInitials(name);
  return (
    <div className="agentic-agent-avatar" style={{ background: bg }} title={name}>
      {icon || initials}
    </div>
  );
}

const RESUME_TIMEOUT_MS = 15_000;
const UNDO_DISMISS_MS = 8_000;

export function AgenticDetailPanel({
  item,
  onClose,
  onOpenTerminal,
  onTakeOver,
  terminalInteractive,
  infoCache,
  resumingArtifactId,
  onResumeStateChange,
  chatSessionActive,
  chatSessionModel,
}: AgenticDetailPanelProps) {
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(() => {
    const cached = infoCache?.current.get(item.id);
    if (cached && cached.status === item.status) return cached.info;
    return null;
  });
  const [loadingInfo, setLoadingInfo] = useState(() => {
    const cached = infoCache?.current.get(item.id);
    return !(cached && cached.status === item.status);
  });
  const [traceFilter, setTraceFilter] = useState<TraceFilter>('all');
  const [pendingUndoArtifact, setPendingUndoArtifact] = useState<{ artifactId: string; sessionId?: string } | null>(null);
  // P1 #4: quick command input for sending one-liners to the agent's pty
  const [sendCommand, setSendCommand] = useState('');
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isResuming = resumingArtifactId === item.id;

  // ── No-timeout-ref handlers (useEvent: stable identity, latest closure)
  // Handlers that don't coordinate with the timeout refs. Kept together
  // so a reader can see "the simple ones" at a glance. useEvent gives
  // stable identity so React can skip re-attaching listeners on parent
  // re-renders, and ensures the closure always reads the latest `item`.

  const handleViewTrace = useEvent((e: React.MouseEvent) => {
    e.preventDefault();
    const sessionId = item.agentState?.sessionId;
    if (sessionId) vscode.postMessage({ type: 'kanban:viewTrace', sessionId });
  });

  const handleViewTerminal = useEvent(() => {
    vscode.postMessage({ type: 'kanban:jumpToTerminal', artifactId: item.id });
    onOpenTerminal?.(item);
  });

  const handleUndoAbandon = useEvent(() => {
    vscode.postMessage({
      type: 'kanban:undoAbandonExecution',
      artifactId: item.id,
      sessionId: pendingUndoArtifact?.sessionId,
    });
    setPendingUndoArtifact(null);
  });

  // ── Action handlers with timeout cleanup (useEvent) ─────────────────────
  // These set timeouts that the unmount useEffect (just below) clears.
  // Grouped together so the timeout refs and the handlers that use them
  // are co-located with the effect that cleans them up — the whole
  // timeout lifecycle is in one visual block.

  const handleResume = useEvent(() => {
    onResumeStateChange?.(item.id);
    vscode.postMessage({
      type: 'kanban:resumeExecution',
      artifactId: item.id,
      artifactType: item.type,
      sessionId: item.agentState?.sessionId,
      workflowId: item.agentState?.workflowId,
    });
    clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(
      () => onResumeStateChange?.(null),
      RESUME_TIMEOUT_MS,
    );
  });

  const handleAbandon = useEvent(() => {
    vscode.postMessage({
      type: 'kanban:abandonExecution',
      artifactId: item.id,
      sessionId: item.agentState?.sessionId,
    });
    setPendingUndoArtifact({ artifactId: item.id, sessionId: item.agentState?.sessionId });
    clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(
      () => setPendingUndoArtifact(prev =>
        prev?.artifactId === item.id ? null : prev,
      ),
      UNDO_DISMISS_MS,
    );
  });

  // Clear undo/resume timeouts on unmount.
  useEffect(() => {
    return () => {
      clearTimeout(undoTimeoutRef.current);
      clearTimeout(resumeTimeoutRef.current);
    };
  }, []);

  const isInterrupted = item.agentState?.status === 'interrupted';
  const hasTerminal = !!item.agentState?.terminalId;
  const status = item.agentState?.status || 'idle';
  const hasPendingUndo = pendingUndoArtifact?.artifactId === item.id;

  // Fetch agent info when the panel opens (or the cached entry's status
  // no longer matches the current item status). The fetch is skipped if
  // a valid cache entry exists.
  useEffect(() => {
    const cached = infoCache?.current.get(item.id);
    if (cached && cached.status === item.status) {
      setAgentInfo(cached.info);
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
        infoCache?.current.set(item.id, { info: msg, status: item.status });
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [item.id, item.status, infoCache]);

  // ── Display values from agent info ──
  const persona = agentInfo?.persona;
  const terminalInfo = agentInfo?.terminalInfo;
  const traceSummary = agentInfo?.traceSummary;

  const agentDisplayName =
    persona?.name || terminalInfo?.agentRole || item.agentState?.agentRole || 'Agent';
  const agentTitle = persona?.title || terminalInfo?.workflowId || '';
  const agentIcon = persona?.icon || '';

  const hasRunAction = isInterrupted || hasTerminal || !!terminalInfo || hasPendingUndo;
  const isRunning = item.agentState?.status === 'running';

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

      {/* ── Agent Persona ── */}
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
                onClick={handleViewTrace}
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
            <span className="agentic-trace-filter-bar" role="radiogroup" aria-label="Trace filter">
              {(['all', 'decisions', 'toolCalls', 'errors'] as const).map(f => (
                <button
                  key={f}
                  className={`agentic-trace-filter-btn${traceFilter === f ? ' active' : ''}`}
                  // Radio semantics: clicking the active chip does nothing.
                  role="radio"
                  aria-checked={traceFilter === f}
                  onClick={() => setTraceFilter(f)}
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
                  disabled={isResuming || !chatSessionActive}
                  title={
                    !chatSessionActive
                      ? 'Resume requires an active @agileagentcanvas chat session with a model'
                      : chatSessionModel
                        ? `Resume workflow using ${chatSessionModel}`
                        : 'Resume workflow'
                  }
                  onClick={handleResume}
                >
                  {isResuming ? '⟳ Reconnecting…' : !chatSessionActive ? 'Resume (no session)' : 'Resume'}
                </button>
                <button
                  className="agentic-detail-btn agentic-detail-btn--abandon"
                  onClick={handleAbandon}
                >
                  Abandon
                </button>
                {hasPendingUndo && (
                  <button
                    className="agentic-detail-btn agentic-detail-btn--undo"
                    onClick={handleUndoAbandon}
                  >
                    ↩ Undo
                  </button>
                )}
              </>
            )}
            {(hasTerminal || !!terminalInfo) && (
              <button
                className="agentic-detail-btn agentic-detail-btn--terminal"
                onClick={handleViewTerminal}
              >
                View Terminal
              </button>
            )}
            {/* P1 #4: Take Over — switch to interactive terminal view, focus this agent's tile */}
            {isRunning && onTakeOver && (
              <button
                className="agentic-detail-btn agentic-detail-btn--takeover"
                onClick={() => onTakeOver(item)}
                title={terminalInteractive ? 'Take over — type directly into the agent terminal' : 'Take over requires embedded terminal (enable in settings)'}
                disabled={!terminalInteractive}
              >
                {terminalInteractive ? 'Take Over' : 'Take Over (no pty)'}
              </button>
            )}
            {/* P1 #4: Send Command — quick one-liner injection without leaving the board */}
            {isRunning && terminalInteractive && (
              <div className="agentic-detail-send-command">
                <input
                  type="text"
                  className="agentic-detail-send-command-input"
                  placeholder="Type a command and press Enter…"
                  value={sendCommand}
                  onChange={e => setSendCommand(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && sendCommand.trim()) {
                      vscode.postMessage({ type: 'terminal:input', sessionId: item.id, data: sendCommand + '\n' });
                      setSendCommand('');
                    }
                  }}
                />
                <button
                  className="agentic-detail-send-command-btn"
                  disabled={!sendCommand.trim()}
                  onClick={() => {
                    if (sendCommand.trim()) {
                      vscode.postMessage({ type: 'terminal:input', sessionId: item.id, data: sendCommand + '\n' });
                      setSendCommand('');
                    }
                  }}
                  title="Send command to agent"
                >
                  Send
                </button>
              </div>
            )}
            {/* Visual Plan: generate a plan scoped to this artifact */}
            <button
              className="agentic-detail-btn agentic-detail-btn--plan"
              onClick={() => {
                vscode.postMessage({
                  type: 'visualPlan:generate',
                  goal: `Plan changes for ${item.title}`,
                  sourceArtifactId: item.id,
                });
              }}
              title="Generate a Visual Plan for this artifact"
            >
              Visualize Plan
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
