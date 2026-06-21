import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { vscode } from '../vscodeApi';
import { TERMINAL_MSG } from '@ext-src/views/terminal-protocol';

interface AgentTerminalProps {
  sessionId: string;
  /** Show + wire an input line. Pass true only when the backend supportsInput. */
  interactive?: boolean;
}

/**
 * One xterm.js instance bound to a single agent session. Output-only by default.
 * Subscribes to `terminal:snapshot` / `terminal:data` for its sessionId and
 * posts `terminal:open` / `terminal:close` for lifecycle. When `interactive`,
 * keystrokes are posted as `terminal:input`.
 */
export function AgentTerminal({ sessionId, interactive = false }: AgentTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const term = new Terminal({ convertEol: true, fontSize: 12, scrollback: 5000, disableStdin: !interactive });
    const fit = new FitAddon();
    term.loadAddon(fit);
    if (hostRef.current) { term.open(hostRef.current); try { fit.fit(); } catch { /* not laid out yet */ } }
    termRef.current = term;

    if (interactive) {
      term.onData((data) => vscode.postMessage({ type: TERMINAL_MSG.input, sessionId, data }));
    }

    const onMessage = (e: MessageEvent) => {
      const m = e.data;
      if (m?.sessionId !== sessionId) return;
      if (m.type === TERMINAL_MSG.snapshot) { term.clear(); term.write(m.data ?? ''); }
      else if (m.type === TERMINAL_MSG.data) { term.write(m.chunk ?? ''); }
      else if (m.type === TERMINAL_MSG.exit) { term.write(`\r\n\x1b[90m[session ended${m.code != null ? ` (${m.code})` : ''}]\x1b[0m\r\n`); }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: TERMINAL_MSG.open, sessionId });

    return () => {
      window.removeEventListener('message', onMessage);
      vscode.postMessage({ type: TERMINAL_MSG.close, sessionId });
      term.dispose();
      termRef.current = null;
    };
  }, [sessionId, interactive]);

  return <div className="agent-terminal" ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}
