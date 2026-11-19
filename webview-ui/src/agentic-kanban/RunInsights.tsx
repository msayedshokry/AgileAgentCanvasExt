// Per-card "why did it stop / what ran / undo it" section of the detail panel:
// fix-it actions for a stopped run, prompt preview, and the run timeline with
// one-click revert of agent commits.

import { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';
import type { AgentFailureInfo, AgentFixAction, KanbanItem } from '../components/kanban/KanbanTypes';
import { FIX_ACTION_LABELS } from '../components/kanban/KanbanTypes';
import './AgentUx.css';

interface TimelineRun {
  runId: string;
  workflowId: string;
  harness: string;
  verdict: string;
  summary?: string;
  startedAt: number;
  finishedAt: number;
  failure?: AgentFailureInfo;
}

interface AgentCommit { sha: string; subject: string; date: string }

const WORKFLOW_LABEL: Record<string, string> = {
  'aac-kanban-dev-executor': 'Implement',
  'aac-kanban-review-guard': 'Review',
};

function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 90 ? `${s}s` : `${Math.round(s / 60)}m`;
}

export function FixItPanel({ artifactId, failure }: { artifactId: string; failure: AgentFailureInfo }) {
  const act = (action: AgentFixAction) => vscode.postMessage({ type: 'kanban:fixAction', artifactId, action });
  return (
    <section className="agent-fixit" role="alert" aria-label="Why the agent stopped">
      <p className="agent-fixit-title">{failure.title}</p>
      {failure.detail && <pre className="agent-fixit-detail">{failure.detail}</pre>}
      <div className="agent-fixit-actions">
        {failure.actions.map((action, idx) => (
          <button
            key={action}
            className={`agent-btn${idx === 0 ? ' agent-btn--primary' : ''}`}
            onClick={() => act(action)}
          >
            {FIX_ACTION_LABELS[action] ?? action}
          </button>
        ))}
      </div>
    </section>
  );
}

export function RunInsights({ item }: { item: KanbanItem }) {
  const [runs, setRuns] = useState<TimelineRun[] | null>(null);
  const [commits, setCommits] = useState<AgentCommit[]>([]);

  useEffect(() => {
    setRuns(null);
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'kanban:runTimeline' && msg.artifactId === item.id) {
        setRuns(msg.runs ?? []);
        setCommits(msg.commits ?? []);
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'kanban:getRunTimeline', artifactId: item.id });
    return () => window.removeEventListener('message', onMessage);
    // Re-fetch when the card's agent state changes (a run just finished).
  }, [item.id, item.agentState?.status]);

  const failure = item.agentState?.status === 'interrupted' ? item.agentState.failure : undefined;

  return (
    <div className="agent-insights">
      {failure && <FixItPanel artifactId={item.id} failure={failure} />}

      <div className="agent-insights-tools">
        <button
          className="agent-btn"
          onClick={() => vscode.postMessage({ type: 'kanban:previewPrompt', artifactId: item.id })}
          title="See exactly what the agent will be told, without running it"
        >
          Preview prompt
        </button>
        <button className="agent-btn" onClick={() => vscode.postMessage({ type: 'kanban:showOutput', artifactId: item.id })}>
          Last output
        </button>
      </div>

      <section className="agent-timeline" aria-label="Agent runs for this card">
        <h4 className="agent-timeline-heading">Runs</h4>
        {runs === null ? (
          <p className="agent-muted">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="agent-muted">No agent runs yet.</p>
        ) : (
          <ol className="agent-timeline-list">
            {runs.map((r) => (
              <li key={r.runId} className={`agent-timeline-item agent-timeline-item--${r.verdict.toLowerCase()}`}>
                <span className={`agent-pill agent-pill--verdict-${r.verdict.toLowerCase()}`}>{r.verdict.replace('_', ' ')}</span>
                <span className="agent-timeline-what">{WORKFLOW_LABEL[r.workflowId] ?? r.workflowId}</span>
                <span className="agent-muted">
                  {r.harness} · {new Date(r.finishedAt).toLocaleString()} · {duration(r.finishedAt - r.startedAt)}
                </span>
                {r.failure && <span className="agent-timeline-why">{r.failure.title}</span>}
              </li>
            ))}
          </ol>
        )}

        {commits.length > 0 && (
          <>
            <h4 className="agent-timeline-heading">Agent commits</h4>
            <ul className="agent-commit-list">
              {commits.map((c) => (
                <li key={c.sha} className="agent-commit">
                  <code>{c.sha.slice(0, 8)}</code>
                  <span className="agent-commit-subject">{c.subject}</span>
                  <span className="agent-muted">{new Date(c.date).toLocaleString()}</span>
                  <button
                    className="agent-btn agent-btn--danger"
                    onClick={() => vscode.postMessage({ type: 'kanban:revertRun', artifactId: item.id, sha: c.sha })}
                    title="Create a commit that undoes this agent commit (asks first)"
                  >
                    Revert
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
