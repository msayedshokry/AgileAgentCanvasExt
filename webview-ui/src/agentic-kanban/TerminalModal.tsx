import { useState, useRef, useEffect } from 'react';
import { vscode } from '../vscodeApi';
import { useEvent } from './useEvent';

interface TerminalModalProps {
  artifactId: string;
  artifactTitle: string;
  onClose: () => void;
}

/**
 * Live-streaming terminal output viewer.
 *
 * Listens for `terminalOutput` (initial snapshot) and `terminalOutputAppend`
 * (streamed chunks) messages from the extension. The owning component is
 * responsible for posting `kanban:closeTerminal` on unmount so the backend
 * can dispose its stream listener.
 */
export function TerminalModal({ artifactId, artifactTitle, onClose }: TerminalModalProps) {
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
        setLines(msg.data.split(/\r?\n/));
      } else if (msg.type === 'terminalOutputAppend' && msg.artifactId === artifactId) {
        setLines(prev => {
          const chunk = msg.data;
          if (prev.length === 0) {
            return chunk.split(/\r?\n/);
          }
          const parts = chunk.split(/\r?\n/);
          const newLines = [...prev];
          newLines[newLines.length - 1] += parts[0];
          for (let i = 1; i < parts.length; i++) {
            newLines.push(parts[i]);
          }
          return newLines;
        });
      } else if (msg.type === 'terminalReconnected' && msg.artifactId === artifactId) {
        // Issue #35: the autonomy lifecycle restored the stream for an
        // orphaned terminal. Replace the visible lines with the buffered
        // payload so the modal reflects what the agent produced while
        // the webview was disconnected. Live `terminalOutputAppend` chunks
        // arrive immediately after via the reattached onDidWriteData
        // listener on the extension side.
        const data = typeof msg.bufferedData === 'string' ? msg.bufferedData : '';
        setLines(data.length > 0 ? data.split(/\r?\n/) : []);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [artifactId]);

  // Open the artifact's running terminal in the VS Code terminal panel.
  // useEvent gives stable identity and reads the latest `artifactId` prop.
  const handleOpenInPanel = useEvent(() => {
    vscode.postMessage({ type: 'kanban:jumpToTerminal', artifactId });
  });

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
              onClick={handleOpenInPanel}
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
