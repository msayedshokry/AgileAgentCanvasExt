import { useEffect, useRef } from 'react';
import { AgentTerminal } from './AgentTerminal';
import './TerminalGrid.css';

export interface TerminalGridSession {
  sessionId: string;          // == artifactId
  title: string;
  agentRole?: string;
  statusKey: string;
}

interface TerminalGridProps {
  sessions: TerminalGridSession[];
  interactive?: boolean;       // pass backend.supportsInput through
  /** Session to scroll-to and flash (from a take-over action). */
  focusedSessionId?: string | null;
  /** Cleared by parent after the flash completes. */
  onFocusComplete?: () => void;
}

/** Multi-pane live terminal view — one xterm tile per active agent. */
export function TerminalGrid({ sessions, interactive = false, focusedSessionId, onFocusComplete }: TerminalGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  // Stable ref for onFocusComplete so the effect doesn't churn on parent re-renders.
  const onFocusCompleteRef = useRef(onFocusComplete);
  onFocusCompleteRef.current = onFocusComplete;

  // Flash + scroll the focused tile into view when focusedSessionId changes.
  useEffect(() => {
    if (!focusedSessionId || !gridRef.current) return;
    const tile = gridRef.current.querySelector(`[data-session-id="${CSS.escape(focusedSessionId)}"]`) as HTMLElement | null;
    if (!tile) return;
    tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
    tile.classList.add('terminal-tile--flash');
    const timeout = setTimeout(() => {
      tile.classList.remove('terminal-tile--flash');
      onFocusCompleteRef.current?.();
    }, 1500);
    return () => {
      clearTimeout(timeout);
      // Clean up: remove flash from tile when focusedSessionId changes
      // before the timeout fires (e.g. user rapidly takes over another agent).
      tile.classList.remove('terminal-tile--flash');
    };
  }, [focusedSessionId]);

  if (sessions.length === 0) {
    return <div className="terminal-grid-empty">No active agents.</div>;
  }
  return (
    <div className="terminal-grid" data-count={sessions.length} ref={gridRef}>
      {sessions.map((s) => (
        <section className="terminal-tile" key={s.sessionId} data-session-id={s.sessionId}>
          <header className="terminal-tile-header">
            <span className={`terminal-tile-dot status-${s.statusKey}`} />
            <span className="terminal-tile-title">{s.title}</span>
            {s.agentRole && <span className="terminal-tile-role">{s.agentRole}</span>}
          </header>
          <div className="terminal-tile-body">
            <AgentTerminal sessionId={s.sessionId} interactive={interactive} />
          </div>
        </section>
      ))}
    </div>
  );
}
