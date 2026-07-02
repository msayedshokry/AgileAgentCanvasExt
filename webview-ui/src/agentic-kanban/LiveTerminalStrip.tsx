// ponytail: persistent bottom strip showing live stdout for every running
// agent session. Subscribes via `kanban:terminalSubscribe` (no VS Code
// terminal focus, so multiple agents render in parallel without stealing
// focus). Plain <pre> rendering — no xterm.js, smaller surface than
// AgentTerminal for a "follow along" view.
//
// Hidden when no sessions are running. Width = full board. Height fixed at
// 110px so the kanban stays visible above.
import { useEffect, useRef, useState } from 'react';
import { vscode } from '../vscodeApi';

interface StreamBuffer {
  /** Plain text scrollback for one session. Capped at 8 KB to bound memory. */
  text: string;
}

const MAX_BUFFER_BYTES = 8 * 1024;

export interface LiveTerminalStripProps {
  /** Session ids whose live output should be visible. Derived from terminalSessions. */
  sessionIds: string[];
  /** Optional title for each session — shown in the per-session header. */
  titles?: Record<string, string>;
}

export function LiveTerminalStrip({ sessionIds, titles }: LiveTerminalStripProps) {
  // Map<artifactId, text>. Kept across renders; appended in the IPC handler.
  const [buffers, setBuffers] = useState<Record<string, StreamBuffer>>({});
  const subscribed = useRef<Set<string>>(new Set());
  const scrollRefs = useRef<Record<string, HTMLPreElement | null>>({});

  // Reactive subscribe/unsubscribe: any new session id gets subscribed;
  // any id no longer in the list gets unsubscribed. Avoids leaking
  // listeners when sessions come and go across runs.
  useEffect(() => {
    const want = new Set(sessionIds);
    const have = subscribed.current;
    for (const id of want) {
      if (!have.has(id)) {
        have.add(id);
        vscode.postMessage({ type: 'kanban:terminalSubscribe', artifactId: id });
      }
    }
    for (const id of have) {
      if (!want.has(id)) {
        have.delete(id);
        vscode.postMessage({ type: 'kanban:terminalUnsubscribe', artifactId: id });
        setBuffers(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }
  }, [sessionIds.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for terminalOutput / terminalOutputAppend from the backend.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const m = e.data;
      if (!m || typeof m !== 'object') return;
      const id: string | undefined = m.artifactId;
      if (!id) return;
      if (m.type === 'terminalOutput') {
        setBuffers(prev => ({ ...prev, [id]: { text: String(m.data ?? '') } }));
      } else if (m.type === 'terminalOutputAppend') {
        setBuffers(prev => {
          const cur = prev[id]?.text ?? '';
          let next = cur + String(m.data ?? '');
          if (next.length > MAX_BUFFER_BYTES) next = next.slice(-MAX_BUFFER_BYTES);
          return { ...prev, [id]: { text: next } };
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Auto-scroll-to-bottom on append for each active session pane.
  useEffect(() => {
    for (const id of sessionIds) {
      const el = scrollRefs.current[id];
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [buffers, sessionIds.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (sessionIds.length === 0) return null;

  return (
    <aside className="live-terminal-strip" role="region" aria-label="Live agent output">
      <header className="live-terminal-strip-header">
        <span className="live-terminal-strip-title">Live agents ({sessionIds.length})</span>
        <span className="live-terminal-strip-hint">streaming output — auto-scrolls</span>
      </header>
      <div className="live-terminal-strip-grid">
        {sessionIds.map(id => (
          <section className="live-terminal-pane" key={id} data-artifact-id={id}>
            <header className="live-terminal-pane-header">{titles?.[id] ?? id}</header>
            <pre
              className="live-terminal-pane-body"
              ref={(el) => { scrollRefs.current[id] = el; }}
            >{buffers[id]?.text ?? ''}</pre>
          </section>
        ))}
      </div>
    </aside>
  );
}
