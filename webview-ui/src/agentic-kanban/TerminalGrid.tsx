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
}

/** Multi-pane live terminal view — one xterm tile per active agent. */
export function TerminalGrid({ sessions, interactive = false }: TerminalGridProps) {
  if (sessions.length === 0) {
    return <div className="terminal-grid-empty">No active agents.</div>;
  }
  return (
    <div className="terminal-grid" data-count={sessions.length}>
      {sessions.map((s) => (
        <section className="terminal-tile" key={s.sessionId}>
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
