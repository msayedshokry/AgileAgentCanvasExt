import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from './Icon';
import { vscode } from '../vscodeApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type JiraAction = 'epics' | 'stories' | 'sync' | 'config';

interface JiraResult {
  success: boolean;
  markdown?: string;
  error?: string;
}

interface JiraModalProps {
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function JiraModal({ onClose }: JiraModalProps) {
  const [activeAction, setActiveAction] = useState<JiraAction>('epics');
  const [projectKey, setProjectKey] = useState('');
  const [epicKey, setEpicKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JiraResult | null>(null);
  const projectKeyRef = useRef<HTMLInputElement>(null);

  // Focus first input on open
  useEffect(() => {
    setTimeout(() => projectKeyRef.current?.focus(), 50);
  }, []);

  // Listen for results posted back from the extension host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'jiraResult') {
        setLoading(false);
        setResult({ success: msg.success, markdown: msg.markdown, error: msg.error });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Escape closes (capture phase, same as WorkflowLauncher)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const handleRun = useCallback(() => {
    setLoading(true);
    setResult(null);
    vscode.postMessage({
      type: 'jiraAction',
      action: activeAction,
      projectKey: projectKey.trim() || undefined,
      epicKey: epicKey.trim() || undefined,
    });
  }, [activeAction, projectKey, epicKey]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) handleRun();
  }, [handleRun, loading]);

  // Tab config
  const tabs: { id: JiraAction; label: string; description: string }[] = [
    { id: 'epics',   label: 'Fetch Epics',   description: 'List all epics in a Jira project' },
    { id: 'stories', label: 'Fetch Stories', description: 'List stories for an epic or whole project' },
    { id: 'sync',    label: 'Sync to Canvas', description: 'Merge Jira epics & stories into canvas artifacts' },
    { id: 'config',  label: 'Connection',    description: 'Check Jira connection and configuration status' },
  ];

  const showProjectKey = activeAction !== 'config';
  const showEpicKey    = activeAction === 'stories';
  const activeTab      = tabs.find(t => t.id === activeAction)!;

  return (
    <div className="wfl-overlay" onClick={handleOverlayClick}>
      <div className="wfl-modal jira-modal" role="dialog" aria-modal="true" aria-label="Jira Integration">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="wfl-modal-header">
          <div className="wfl-modal-title">
            <span className="wfl-modal-icon jira-modal-icon">
              {/* Jira-style "J" icon using SVG */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect width="24" height="24" rx="4" fill="var(--vscode-button-background, #0052CC)" />
                <path d="M12.53 4h-1.7v8.63a2.37 2.37 0 0 0 2.37 2.37h4.63v-1.7h-4.63a.67.67 0 0 1-.67-.67V4z" fill="white" />
                <path d="M8.17 8.83H6.47v4.97a2.37 2.37 0 0 0 2.37 2.37h4.63v-1.7H8.84a.67.67 0 0 1-.67-.67V8.83z" fill="rgba(255,255,255,0.7)" />
              </svg>
            </span>
            <div>
              <h2>Jira Integration</h2>
              <p className="wfl-subtitle">{activeTab.description}</p>
            </div>
          </div>
          <button className="wfl-close-btn" onClick={onClose} title="Close (Esc)">
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* ── Action tabs ──────────────────────────────────────────────── */}
        <div className="wfl-modal-tabs" role="tablist">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`wfl-tab ${activeAction === tab.id ? 'active' : ''}`}
              role="tab"
              aria-selected={activeAction === tab.id}
              onClick={() => { setActiveAction(tab.id); setResult(null); }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Inputs ───────────────────────────────────────────────────── */}
        <div className="jira-modal-body">
          {showProjectKey && (
            <div className="jira-modal-field">
              <label htmlFor="jira-project-key" className="jira-modal-label">
                Project Key
                <span className="jira-modal-hint"> (e.g. PROJ) — leave blank to use your configured default</span>
              </label>
              <input
                id="jira-project-key"
                ref={projectKeyRef}
                type="text"
                className="jira-modal-input"
                placeholder="PROJ"
                value={projectKey}
                onChange={e => setProjectKey(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}

          {showEpicKey && (
            <div className="jira-modal-field">
              <label htmlFor="jira-epic-key" className="jira-modal-label">
                Epic Key
                <span className="jira-modal-hint"> (e.g. PROJ-42) — leave blank to fetch all stories in the project</span>
              </label>
              <input
                id="jira-epic-key"
                type="text"
                className="jira-modal-input"
                placeholder="PROJ-42"
                value={epicKey}
                onChange={e => setEpicKey(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}

          {activeAction === 'config' && !result && !loading && (
            <div className="jira-modal-info">
              <Icon name="info" size={16} />
              <span>Tests your Jira connection and shows current configuration status.</span>
            </div>
          )}

          {activeAction === 'sync' && !result && !loading && (
            <div className="jira-modal-warning">
              <Icon name="refresh" size={16} />
              <span>
                Fetches all epics and stories from Jira and merges them into your canvas.
                Local-only artifacts will not be removed.
              </span>
            </div>
          )}

          {/* ── Result area ─────────────────────────────────────────────── */}
          {loading && (
            <div className="jira-modal-loading">
              <span className="jira-modal-spinner" />
              <span>Connecting to Jira…</span>
            </div>
          )}

          {result && (
            <div className={`jira-modal-result ${result.success ? 'success' : 'error'}`}>
              {result.success ? (
                <MarkdownTable content={result.markdown ?? ''} />
              ) : (
                <div className="jira-modal-error-msg">
                  <Icon name="wrench" size={14} />
                  <span>{result.error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="wfl-modal-footer">
          <span className="wfl-footer-hint">
            {result?.success
              ? '✓ Done'
              : 'Configure via VS Code Settings → search "Jira"'}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
            <button
              className="btn btn-primary jira-run-btn"
              onClick={handleRun}
              disabled={loading}
            >
              {loading ? 'Running…' : activeAction === 'config' ? 'Test Connection' : activeAction === 'sync' ? 'Sync Now' : 'Fetch'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Simple markdown-table renderer ──────────────────────────────────────────
// Renders the markdown returned by the extension as styled HTML tables.

function MarkdownTable({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let tableLines: string[] = [];
  let key = 0;

  const flushTable = () => {
    if (tableLines.length < 2) {
      // Not a real table — render as plain lines
      tableLines.forEach(l => elements.push(
        <p key={key++} className="jira-md-line">{l}</p>
      ));
      tableLines = [];
      return;
    }
    const headerCells = tableLines[0].split('|').map(c => c.trim()).filter(Boolean);
    const rows = tableLines.slice(2).map(row =>
      row.split('|').map(c => c.trim()).filter(Boolean)
    );
    elements.push(
      <div key={key++} className="jira-md-table-wrap">
        <table className="jira-md-table">
          <thead>
            <tr>{headerCells.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableLines = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('|')) {
      tableLines.push(line);
    } else {
      if (tableLines.length) flushTable();
      if (line.startsWith('## ') || line.startsWith('### ')) {
        const level = line.startsWith('### ') ? 3 : 2;
        const text = line.replace(/^#+\s*/, '');
        elements.push(level === 3
          ? <h3 key={key++} className="jira-md-h3">{text}</h3>
          : <h2 key={key++} className="jira-md-h2">{text}</h2>
        );
      } else if (line.startsWith('✅') || line.startsWith('❌')) {
        elements.push(<p key={key++} className="jira-md-status">{line}</p>);
      } else if (line.trim()) {
        elements.push(<p key={key++} className="jira-md-line">{line}</p>);
      }
    }
  }
  if (tableLines.length) flushTable();

  return <div className="jira-md-content">{elements}</div>;
}
