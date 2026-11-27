// Per-card "why did it stop / what ran / undo it" section of the detail panel:
// fix-it actions for a stopped run, prompt preview, and one activity feed:
// runs (with their steps and context), agent commits (one-click revert) and
// trace steps, grouped by day, newest first.

import { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';
import type { AgentFailureInfo, AgentFixAction, KanbanItem } from '../components/kanban/KanbanTypes';
import { FIX_ACTION_LABELS } from '../components/kanban/KanbanTypes';
import { buildCardTimeline, describeBoard, formatTokens, groupByDay, totalUsage, type AgentCommit, type CardNote, type ContextSource, type TimelineEntry, type TimelineRun, type TraceStep } from './card-timeline';
import './AgentUx.css';

const DELIVERY_LABEL: Record<ContextSource['delivery'], string> = {
  inline: 'in prompt',
  discovered: 'loaded by the CLI',
  resumed: 'already in the conversation',
};

function size(chars: number): string {
  return chars >= 1000 ? `${(chars / 1000).toFixed(1)}k chars` : `${chars} chars`;
}

interface CardPullRequest {
  url: string;
  number: number;
  state: string;
  reviewDecision: string;
  checks: Array<{ name: string; state: 'pass' | 'fail' | 'pending' }>;
  feedback: Array<{ author: string; body: string }>;
}

function PullRequestPanel({ artifactId, pr }: { artifactId: string; pr: CardPullRequest }) {
  const failing = pr.checks.filter((c) => c.state === 'fail');
  const pending = pr.checks.filter((c) => c.state === 'pending');
  const actionable = pr.feedback.length + failing.length;
  return (
    <section className="agent-pr" aria-label="Pull request">
      <div className="agent-pr-head">
        <a href={pr.url} className="agent-pr-link">PR #{pr.number}</a>
        <span className={`agent-pill agent-pill--pr-${pr.state.toLowerCase()}`}>{pr.state.toLowerCase()}</span>
        {pr.reviewDecision && <span className="agent-muted">{pr.reviewDecision.replace(/_/g, ' ').toLowerCase()}</span>}
      </div>
      {pr.checks.length > 0 && (
        <p className="agent-pr-checks">
          {failing.length > 0
            ? <span className="agent-pr-fail">{failing.length} failing: {failing.map((c) => c.name).join(', ')}</span>
            : pending.length > 0
              ? <span className="agent-muted">{pending.length} check{pending.length === 1 ? '' : 's'} running</span>
              : <span className="agent-pr-pass">All {pr.checks.length} checks pass</span>}
        </p>
      )}
      {pr.state === 'OPEN' && actionable > 0 && (
        <button
          className="agent-btn agent-btn--primary"
          onClick={() => vscode.postMessage({ type: 'kanban:addressReview', artifactId })}
          title="Send review comments and failing checks back to the agent"
        >
          Address {actionable} review item{actionable === 1 ? '' : 's'}
        </button>
      )}
    </section>
  );
}

const WORKFLOW_LABEL: Record<string, string> = {
  'aac-kanban-dev-executor': 'Implement',
  'aac-kanban-review-guard': 'Review',
};

function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 90 ? `${s}s` : `${Math.round(s / 60)}m`;
}

/** The agent stopped to ask the user: answer right here (same as from the Inbox). */
export function AnswerQuestions({ artifactId }: { artifactId: string }) {
  const [answer, setAnswer] = useState('');
  const send = () => {
    if (!answer.trim()) return;
    vscode.postMessage({ type: 'kanban:answerQuestions', artifactId, answer: answer.trim() });
    setAnswer('');
  };
  return (
    <form className="agent-fixit-answer" onSubmit={e => { e.preventDefault(); send(); }}>
      <textarea
        rows={2}
        value={answer}
        maxLength={2000}
        aria-label="Your answer to the agent"
        placeholder="Your answer (Ctrl+Enter to send)"
        onChange={e => setAnswer(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
      />
      <button type="submit" className="agent-btn agent-btn--primary" disabled={!answer.trim()}>Send answer</button>
    </form>
  );
}

export function FixItPanel({ artifactId, failure, hideAnswer = false }: { artifactId: string; failure: AgentFailureInfo; hideAnswer?: boolean }) {
  const act = (action: AgentFixAction) => vscode.postMessage({ type: 'kanban:fixAction', artifactId, action });
  return (
    <section className="agent-fixit" role="alert" aria-label="Why the agent stopped">
      <p className="agent-fixit-title">{failure.title}</p>
      {failure.detail && <pre className="agent-fixit-detail">{failure.detail}</pre>}
      {failure.kind === 'needs-answer' && !hideAnswer && <AnswerQuestions artifactId={artifactId} />}
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

const timeOfDay = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

function StepList({ steps }: { steps: readonly TraceStep[] }) {
  return (
    <ul className="agent-feed-steps">
      {steps.map((s, idx) => (
        <li key={`${s.ts}-${idx}`} className={s.isError ? 'agent-feed-step--err' : undefined}>
          <span className="agent-feed-step-type">{s.type}</span>
          <span>{s.summary || '—'}</span>
        </li>
      ))}
    </ul>
  );
}

function RunEntry({ run, steps }: { run: TimelineRun; steps: readonly TraceStep[] }) {
  return (
    <>
      <div className="agent-feed-line">
        <span className={`agent-pill agent-pill--verdict-${run.verdict.toLowerCase()}`}>{run.verdict.replace('_', ' ')}</span>
        <span className="agent-timeline-what">{WORKFLOW_LABEL[run.workflowId] ?? run.workflowId}</span>
        <time className="agent-feed-time">{timeOfDay(run.finishedAt)}</time>
      </div>
      <p className="agent-feed-meta">
        {run.agent ? `${run.agent} (${run.harness}${run.model ? ` · ${run.model}` : ''})` : run.harness} · {duration(run.finishedAt - run.startedAt)}
        {run.usage && (
          <span title={`Fresh input ${run.usage.input}, cache read ${run.usage.cacheRead}, cache write ${run.usage.cacheWrite}, output ${run.usage.output} tokens`}>
            {' · '}{formatTokens(run.usage.input + run.usage.cacheRead + run.usage.cacheWrite)} in / {formatTokens(run.usage.output)} out
          </span>
        )}
      </p>
      {run.failure && <p className="agent-timeline-why">{run.failure.title}</p>}
      {describeBoard(run.board) && <p className="agent-feed-board" title={run.board?.dropped?.join('\n')}>{describeBoard(run.board)}</p>}
      {/* A failed run's summary is the raw error; its failure title already says it plainly. */}
      {run.summary && !run.failure && <p className="agent-feed-summary" title={run.summary}>{run.summary}</p>}
      {steps.length > 0 && (
        <details className="agent-timeline-context">
          <summary>{steps.length} step{steps.length === 1 ? '' : 's'}</summary>
          <StepList steps={steps} />
        </details>
      )}
      {run.context && run.context.length > 0 && (
        <details className="agent-timeline-context">
          <summary>Context: {run.context.length} source{run.context.length === 1 ? '' : 's'}</summary>
          <ul>
            {run.context.map((c) => (
              <li key={`${c.kind}-${c.name}`} title={`sha256 ${c.hash}`}>
                <code>{c.name}</code> {size(c.chars)} · {DELIVERY_LABEL[c.delivery]}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function CommitEntry({ artifactId, commit }: { artifactId: string; commit: AgentCommit }) {
  return (
    <>
      <div className="agent-feed-line agent-commit">
        <span className="agent-feed-kind">Committed</span>
        <code>{commit.sha.slice(0, 8)}</code>
        <span className="agent-commit-subject">{commit.subject}</span>
        <time className="agent-feed-time">{timeOfDay(Date.parse(commit.date))}</time>
        <button
          className="agent-btn agent-btn--danger"
          onClick={() => vscode.postMessage({ type: 'kanban:revertRun', artifactId, sha: commit.sha })}
          title="Create a commit that undoes this agent commit (asks first)"
        >
          Revert
        </button>
      </div>
      {commit.files && commit.files.length > 0 && (
        <details className="agent-commit-files">
          <summary>{commit.files.length} file{commit.files.length === 1 ? '' : 's'}</summary>
          <ul>{commit.files.map((file) => <li key={file}><code>{file}</code></li>)}</ul>
        </details>
      )}
    </>
  );
}

function FeedEntry({ artifactId, entry }: { artifactId: string; entry: TimelineEntry }) {
  switch (entry.kind) {
    case 'running':
      return (
        <>
          <div className="agent-feed-line">
            <span className="agent-pill agent-pill--running">Running</span>
            <span className="agent-muted">started {timeOfDay(entry.at)}</span>
          </div>
          {entry.steps.length > 0 && <StepList steps={entry.steps} />}
        </>
      );
    case 'run':
      return <RunEntry run={entry.run} steps={entry.steps} />;
    case 'commit':
      return <CommitEntry artifactId={artifactId} commit={entry.commit} />;
    case 'note':
      return (
        <>
          <div className="agent-feed-line">
            <span className="agent-feed-kind">{entry.note.author}</span>
            <time className="agent-feed-time">{timeOfDay(entry.at)}</time>
          </div>
          <p className="agent-feed-note">{entry.note.text}</p>
        </>
      );
    case 'step':
      return (
        <div className={`agent-feed-line${entry.step.isError ? ' agent-feed-step--err' : ''}`}>
          <span className="agent-feed-step-type">{entry.step.type}</span>
          <span>{entry.step.summary || '—'}</span>
          <time className="agent-feed-time">{timeOfDay(entry.at)}</time>
        </div>
      );
  }
}

function entryClass(entry: TimelineEntry): string {
  if (entry.kind === 'run') return `agent-timeline-item agent-timeline-item--${entry.run.verdict.toLowerCase()}`;
  if (entry.kind === 'step' && entry.step.isError) return 'agent-timeline-item agent-timeline-item--blocked';
  return `agent-timeline-item agent-timeline-item--${entry.kind}`;
}

interface RunInsightsProps {
  item: KanbanItem;
  /** Recent trace steps for this card; each nests under the run it happened in. */
  trace?: readonly TraceStep[];
  /** The answer box is shown elsewhere (the Inbox); don't repeat it. */
  hideAnswer?: boolean;
  /** No agent works this card (a person has it): leave out the fix-it actions. */
  hideFix?: boolean;
}

const NO_TRACE: readonly TraceStep[] = [];

export function RunInsights({ item, trace = NO_TRACE, hideAnswer = false, hideFix = false }: RunInsightsProps) {
  const [runs, setRuns] = useState<TimelineRun[] | null>(null);
  const [commits, setCommits] = useState<AgentCommit[]>([]);
  const [pr, setPr] = useState<CardPullRequest | undefined>();
  const [notes, setNotes] = useState<CardNote[]>([]);

  useEffect(() => {
    setRuns(null);
    setNotes([]);
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'kanban:runTimeline' && msg.artifactId === item.id) {
        setRuns(msg.runs ?? []);
        setCommits(msg.commits ?? []);
        setPr(msg.pr ?? undefined);
        if (Array.isArray(msg.notes)) setNotes(msg.notes);
      }
      // Something you sent was added to the card: show it in Activity now.
      if (msg?.type === 'kanban:cardNotesChanged' && msg.artifactId === item.id) {
        vscode.postMessage({ type: 'kanban:getRunTimeline', artifactId: item.id });
      }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'kanban:getRunTimeline', artifactId: item.id });
    return () => window.removeEventListener('message', onMessage);
    // Re-fetch when the card's agent state changes (a run just finished).
  }, [item.id, item.agentState?.status]);

  const failure = item.agentState?.status === 'interrupted' ? item.agentState.failure : undefined;
  const startedAt = item.agentState?.status === 'running' ? Date.parse(item.agentState.startedAt ?? '') : NaN;
  const feed = runs === null ? [] : buildCardTimeline({
    runs, commits, trace, notes, runningSince: Number.isNaN(startedAt) ? undefined : startedAt,
  });
  const tokens = runs ? totalUsage(runs) : undefined;

  return (
    <div className="agent-insights">
      {failure && !hideFix && <FixItPanel artifactId={item.id} failure={failure} hideAnswer={hideAnswer} />}

      <div className="agent-insights-tools">
        <button
          className="agent-btn"
          onClick={() => vscode.postMessage({ type: 'kanban:previewPrompt', artifactId: item.id })}
          title="See exactly what the agent will be told, without running it"
        >
          Preview prompt
        </button>
        <button className="agent-btn agent-btn--ghost" onClick={() => vscode.postMessage({ type: 'kanban:showOutput', artifactId: item.id })}>
          Last output
        </button>
      </div>

      {pr && <PullRequestPanel artifactId={item.id} pr={pr} />}

      <section className="agent-timeline" aria-label="Activity for this card">
        <h4 className="agent-timeline-heading">
          Activity
          {tokens && (
            <span className="agent-timeline-total" title="Tokens across this card's runs that reported usage">
              {formatTokens(tokens.read)} in / {formatTokens(tokens.written)} out
            </span>
          )}
        </h4>
        {runs === null ? (
          <p className="agent-muted">Loading…</p>
        ) : feed.length === 0 ? (
          <p className="agent-muted">No agent activity yet.</p>
        ) : (
          groupByDay(feed, Date.now()).map((day) => (
            <div key={day.label} className="agent-feed-day">
              <h5 className="agent-feed-day-label">{day.label}</h5>
              <ol className="agent-timeline-list">
                {day.entries.map((entry, idx) => (
                  <li key={`${entry.kind}-${entry.at}-${idx}`} className={entryClass(entry)}>
                    <FeedEntry artifactId={item.id} entry={entry} />
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
