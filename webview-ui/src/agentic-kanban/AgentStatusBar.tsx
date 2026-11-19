// Agent readiness + picker strip for the Agentic Kanban.
// Shows which coding agent runs the board, whether it is signed in, and the
// permission posture — with one-click fixes when the agent can't run.

import { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';
import './AgentUx.css';

export type AuthState = 'ready' | 'configured' | 'signed-out' | 'unknown';

export interface HarnessRow {
  id: string;
  label: string;
  installed: boolean;
  version?: string;
  auth: AuthState;
  authDetail: string;
  installHint: string;
  canSignIn: boolean;
}

export interface AgentStatus {
  harnesses: HarnessRow[];
  configured: string;
  posture: 'sandboxed' | 'full';
  resolved: { kind: 'cli' | 'lm' | 'none'; id?: string; label: string; reason: string };
  blocker?: string;
}

const AUTH_LABEL: Record<AuthState, string> = {
  ready: 'Ready',
  configured: 'Configured',
  'signed-out': 'Signed out',
  unknown: 'Untested',
};

function stateOf(status: AgentStatus): 'ok' | 'warn' | 'error' {
  if (status.resolved.kind === 'none') return 'error';
  if (status.blocker) return 'warn';
  return 'ok';
}

export function AgentStatusBar() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'harness:status') {
        setStatus(msg as AgentStatus);
        setBusy(false);
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'harness:getStatus' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const send = (message: Record<string, unknown>) => {
    setBusy(true);
    vscode.postMessage(message);
  };

  if (!status) {
    return (
      <div className="agent-status agent-status--loading" role="status" aria-live="polite">
        Checking which coding agents are installed…
      </div>
    );
  }

  const tone = stateOf(status);
  const installed = status.harnesses.filter((h) => h.installed);
  const current = status.harnesses.find((h) => h.id === status.resolved.id);

  return (
    <section className={`agent-status agent-status--${tone}`} aria-label="Coding agent">
      <div className="agent-status-row">
        <span className={`agent-status-dot agent-status-dot--${tone}`} aria-hidden="true" />
        <label className="agent-status-field">
          <span className="agent-status-caption">Agent</span>
          <select
            value={status.configured}
            onChange={(e) => send({ type: 'harness:select', id: e.target.value })}
            aria-label="Coding agent that runs the board"
          >
            <option value="auto">Auto — {status.resolved.label}</option>
            <option value="vscode-lm">VS Code language model</option>
            {status.harnesses.map((h) => (
              <option key={h.id} value={h.id} disabled={!h.installed}>
                {h.label}{h.installed ? ` · ${AUTH_LABEL[h.auth]}` : ' · not installed'}
              </option>
            ))}
          </select>
        </label>
        <label className="agent-status-field">
          <span className="agent-status-caption">Permissions</span>
          <select
            value={status.posture}
            onChange={(e) => send({ type: 'harness:setPosture', posture: e.target.value })}
            aria-label="What agents may do without asking"
            title={status.posture === 'full'
              ? 'Every tool auto-approved, including shell commands'
              : 'Agents edit workspace files; unrestricted shell withheld where the agent supports it'}
          >
            <option value="sandboxed">Sandboxed</option>
            <option value="full">Full access</option>
          </select>
        </label>
        <span className="agent-status-summary" title={status.resolved.reason}>
          {status.resolved.kind === 'none'
            ? 'No agent can run'
            : current
              ? `${current.label} ${current.version ? `(${current.version})` : ''} · ${current.authDetail}`
              : status.resolved.label}
        </span>
        <span className="agent-status-actions">
          <button
            className="agent-status-link"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? 'Hide agents' : `All agents (${installed.length}/${status.harnesses.length})`}
          </button>
          <button
            className="agent-status-link"
            onClick={() => send({ type: 'harness:getStatus' })}
            disabled={busy}
            title="Re-check installed agents and sign-in state"
          >
            {busy ? 'Checking…' : 'Re-check'}
          </button>
        </span>
      </div>

      {status.blocker && (
        <div className="agent-status-blocker" role="alert">
          <span>{status.blocker}</span>
          <span className="agent-status-blocker-actions">
            {current?.canSignIn && current.auth === 'signed-out' && (
              <button className="agent-btn agent-btn--primary" onClick={() => send({ type: 'harness:signIn', id: current.id })}>
                Sign in to {current.label}
              </button>
            )}
            <button className="agent-btn" onClick={() => setExpanded(true)}>Choose another agent</button>
          </span>
        </div>
      )}

      {expanded && (
        <table className="agent-status-table">
          <thead>
            <tr><th scope="col">Agent</th><th scope="col">Version</th><th scope="col">Sign-in</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr>
          </thead>
          <tbody>
            {status.harnesses.map((h) => (
              <tr key={h.id} className={h.id === status.resolved.id ? 'agent-status-current' : undefined}>
                <th scope="row">{h.label}</th>
                <td>{h.installed ? (h.version ?? 'installed') : <span className="agent-muted">not installed</span>}</td>
                <td>
                  {h.installed
                    ? <span className={`agent-pill agent-pill--${h.auth}`} title={h.authDetail}>{AUTH_LABEL[h.auth]}</span>
                    : <span className="agent-muted" title={h.installHint}>—</span>}
                </td>
                <td className="agent-status-row-actions">
                  {!h.installed && (
                    <button className="agent-btn" onClick={() => send({ type: 'harness:install', id: h.id })}>How to install</button>
                  )}
                  {h.installed && h.canSignIn && h.auth !== 'ready' && (
                    <button className="agent-btn" onClick={() => send({ type: 'harness:signIn', id: h.id })}>Sign in</button>
                  )}
                  {h.installed && h.id !== status.resolved.id && (
                    <button className="agent-btn agent-btn--primary" onClick={() => send({ type: 'harness:select', id: h.id })}>Use</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
