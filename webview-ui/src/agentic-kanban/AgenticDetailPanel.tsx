import { useState, useRef, useEffect } from 'react';
import type { KanbanItem } from '../components/kanban/KanbanTypes';
import { vscode } from '../vscodeApi';
import { useEvent } from './useEvent';
import {
  AgentInfo,
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
  const latestVerdict = agentInfo?.latestVerdict;
  const lockDetail = agentInfo?.lockDetail;
  const recentTrace = agentInfo?.recentTrace;
  const harnessResults = item.harnessResults ?? [];

  const agentDisplayName =
    persona?.name || terminalInfo?.agentRole || item.agentState?.agentRole || 'Agent';
  const agentTitle = persona?.title || terminalInfo?.workflowId || '';
  const agentIcon = persona?.icon || '';

  const isRunning = item.agentState?.status === 'running';
  const hasHarnessFailures = harnessResults.some(r => !r.passed && r.severity === 'blocking');
  const hasAnyHarnessResults = harnessResults.length > 0;
  const hasBlockers = (item.blockedBy ?? 0) > 0 || !!item.hasCycle;

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  // ponytail: panel-local UI state. Most context (harness, blockers,
  // activity) is collapsible so the user can answer the common
  // "why is this card stuck?" question without scrolling. Verdict +
  // status badges + Agent info are always visible.
  const [showHarness, setShowHarness] = useState(hasHarnessFailures);
  const [showBlockers, setShowBlockers] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  return (
    <div className="agentic-detail-panel">
      {/* ponytail: close button anchored top-right with a 32x32 hit area
       * and full opacity. The previous inline-flow X with opacity:0.6 was
       * easy to miss. */}
      <button
        onClick={onClose}
        aria-label="Close detail panel"
        className="agentic-detail-close"
        title="Close (Esc)"
      >
        ×
      </button>

      {/* ── Header: status + meta + title ── */}
      <header className="agentic-detail-header">
        <div className="agentic-detail-status-row">
          <StatusBadge status={status} />
          <span className="agentic-detail-meta">
            {item.type} · {item.id}
            {item.epicKey ? ` · ${item.epicKey}` : ''}
          </span>
        </div>
        <h3 className="agentic-detail-title">{item.title}</h3>
      </header>

      {/* ── TL;DR — the answer to "why is this card here?" ── */}
      {latestVerdict ? (
        <section className={`agentic-tldr agentic-tldr--${latestVerdict.verdict.toLowerCase()}`}>
          <div className="agentic-tldr-head">
            <span className="agentic-tldr-kind">{latestVerdict.verdict}</span>
            <span className="agentic-tldr-time">{formatTime(latestVerdict.readAt)}</span>
          </div>
          {latestVerdict.summary && (
            <p className="agentic-tldr-summary">{latestVerdict.summary}</p>
          )}
          {latestVerdict.fixRequests && latestVerdict.fixRequests.length > 0 && (
            <details className="agentic-tldr-fixes">
              <summary>{latestVerdict.fixRequests.length} fix request{latestVerdict.fixRequests.length === 1 ? '' : 's'}</summary>
              <ul>
                {latestVerdict.fixRequests.map((fr, idx) => (
                  <li key={idx}>{fr.failing_criterion ?? JSON.stringify(fr)}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ) : isInterrupted ? (
        <section className="agentic-tldr agentic-tldr--interrupted">
          <p className="agentic-tldr-summary">{getInterruptionMessage(item.agentState?.interruptionReason)}</p>
          {isResuming && <p className="agentic-tldr-status"><span className="agentic-resume-spinner" /> Reconnecting…</p>}
        </section>
      ) : item.harnessResults?.some(r => !r.passed && r.severity === 'blocking') ? (
        <section className="agentic-tldr agentic-tldr--blocked">
          <p className="agentic-tldr-summary">
            Blocked by <strong>{item.harnessResults!.find(r => !r.passed && r.severity === 'blocking')!.policyId}</strong>
          </p>
        </section>
      ) : null}

      {/* ── Status chips — workflow / provider / started / lock / trace ── */}
      <div className="agentic-chips">
        {terminalInfo?.workflowId && <span className="agentic-chip" title="Workflow">{terminalInfo.workflowId}</span>}
        {terminalInfo?.provider && <span className="agentic-chip" title="Provider">{terminalInfo.provider}</span>}
        {terminalInfo?.startedAt && (
          <span className="agentic-chip" title="Started">
            <span className="agentic-chip-dot" /> {formatTime(terminalInfo.startedAt)}
          </span>
        )}
        {lockDetail && (
          <span className={`agentic-chip${lockDetail.isStale ? ' agentic-chip--stale' : ''}`} title={`Lock holder: ${lockDetail.holderAgent ?? 'unknown'}`}>
            🔒 {formatDuration(lockDetail.ageMs)}{lockDetail.isStale ? ' stale' : ''}
          </span>
        )}
        {item.agentState?.sessionId && (
          <button className="agentic-chip agentic-chip--link" onClick={handleViewTrace}>Trace →</button>
        )}
      </div>

      {/* ── Always-visible Agent row ── */}
      <div className="agentic-agent-row">
        {loadingInfo && !agentInfo ? (
          <span className="agentic-loading">Loading agent…</span>
        ) : (
          <>
            <AgentAvatar name={agentDisplayName} icon={agentIcon} />
            <div className="agentic-agent-info">
              <div className="agentic-agent-name">{agentDisplayName}</div>
              {agentTitle && <div className="agentic-agent-title">{agentTitle}</div>}
            </div>
          </>
        )}
      </div>

      {/* ── Collapsible context (harness / blockers / activity) ── */}
      {hasAnyHarnessResults && (
        <details
          className="agentic-collapse"
          open={showHarness}
          onToggle={e => setShowHarness((e.target as HTMLDetailsElement).open)}
        >
          <summary className="agentic-collapse-summary">
            Harness policies
            {hasHarnessFailures && (
              <span className="agentic-collapse-badge agentic-collapse-badge--bad">
                {harnessResults.filter(r => !r.passed).length} failing
              </span>
            )}
          </summary>
          <div className="agentic-collapse-body">
            <ul className="agentic-harness-list">
              {harnessResults.map((r, idx) => (
                <li key={idx} className={`agentic-harness-item agentic-harness-item--${r.passed ? 'passed' : r.severity}`}>
                  <span className="agentic-harness-mark">{r.passed ? '✓' : '✗'}</span>
                  <span className="agentic-harness-policy">{r.policyId}</span>
                  <span className={`agentic-harness-severity agentic-harness-severity--${r.severity}`}>{r.severity}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      {hasBlockers && (
        <details
          className="agentic-collapse"
          open={showBlockers}
          onToggle={e => setShowBlockers((e.target as HTMLDetailsElement).open)}
        >
          <summary className="agentic-collapse-summary">
            Blocked by{item.blockedBy ? ` (${item.blockedBy})` : ''}
          </summary>
          <div className="agentic-collapse-body">
            <ul className="agentic-blockers-list">
              {(item.blockerTitles ?? []).map((title, idx) => (
                <li key={idx}>{title}</li>
              ))}
              {item.hasCycle && <li className="agentic-blockers-cycle">⚠ Circular dependency</li>}
            </ul>
          </div>
        </details>
      )}

      {traceSummary && (traceSummary.decisions + traceSummary.toolCalls + traceSummary.errors) > 0 && (
        <details
          className="agentic-collapse"
          open={showTrace}
          onToggle={e => setShowTrace((e.target as HTMLDetailsElement).open)}
        >
          <summary className="agentic-collapse-summary">
            Activity
            <span className="agentic-collapse-counts">
              <span>{traceSummary.decisions}d</span>
              <span>{traceSummary.toolCalls}tc</span>
              {traceSummary.errors > 0 && <span className="agentic-collapse-counts--err">{traceSummary.errors}err</span>}
            </span>
          </summary>
          <div className="agentic-collapse-body">
            {recentTrace && recentTrace.length > 0 && (
              <ul className="agentic-trace-list">
                {recentTrace.map((entry, idx) => (
                  <li key={idx} className={entry.isError ? 'agentic-trace-item--err' : ''}>
                    <span className="agentic-trace-time">{formatTime(entry.ts)}</span>
                    <span className="agentic-trace-type">{entry.type}</span>
                    <span className="agentic-trace-summary">{entry.summary || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}

      {/* ── Sticky footer with actions — only what's relevant ── */}
      <footer className="agentic-detail-footer">
        {isInterrupted && (
          <button
            className={`agentic-btn agentic-btn--primary agentic-btn--block${isResuming ? ' is-loading' : ''}`}
            disabled={isResuming || !chatSessionActive}
            title={
              !chatSessionActive
                ? 'Resume needs an active @agileagentcanvas chat session'
                : chatSessionModel ? `Resume using ${chatSessionModel}` : 'Resume workflow'
            }
            onClick={handleResume}
          >
            {isResuming ? '⟳ Reconnecting…' : !chatSessionActive ? 'Resume (no session)' : 'Resume workflow'}
          </button>
        )}
        {isInterrupted && (
          <button className="agentic-btn agentic-btn--ghost agentic-btn--block" onClick={handleAbandon}>Abandon</button>
        )}
        {hasPendingUndo && (
          <button className="agentic-btn agentic-btn--ghost agentic-btn--block" onClick={handleUndoAbandon}>↩ Undo abandon</button>
        )}
        {(hasTerminal || !!terminalInfo) && (
          <button className="agentic-btn agentic-btn--ghost agentic-btn--block" onClick={handleViewTerminal}>View terminal output</button>
        )}
        {isRunning && onTakeOver && (
          <button
            className="agentic-btn agentic-btn--ghost agentic-btn--block"
            onClick={() => onTakeOver(item)}
            disabled={!terminalInteractive}
            title={terminalInteractive ? 'Take over — type into the agent terminal' : 'Enable embedded terminal in settings'}
          >
            Take over
          </button>
        )}
        {isRunning && terminalInteractive && (
          <div className="agentic-send-row">
            <input
              type="text"
              className="agentic-send-input"
              placeholder="Send command (Enter)"
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
              className="agentic-btn agentic-btn--primary"
              disabled={!sendCommand.trim()}
              onClick={() => {
                if (sendCommand.trim()) {
                  vscode.postMessage({ type: 'terminal:input', sessionId: item.id, data: sendCommand + '\n' });
                  setSendCommand('');
                }
              }}
            >
              Send
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
