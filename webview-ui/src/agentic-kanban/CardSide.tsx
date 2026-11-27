// ─── Card page: side panel ───────────────────────────────────────────────────
// Reads top to bottom as: what is happening now, the card's properties, the
// last run, and its checks. Plain words instead of workflow ids and policy
// ids; colour only as small dots and icons.

import { useState, type ReactNode } from 'react';
import { KANBAN_COLUMNS, normalizeToKanbanColumn, type KanbanItem } from '../components/kanban/KanbanTypes';
import { vscode } from '../vscodeApi';
import type { AgentTeamView } from './agent-team-view';
import type { AgentInfo } from './kanban-helpers';
import { cardState, checkLabel, runsOn, stepLabel } from './card-side-model';
import { EpicBreakdown } from './EpicOverview';
import { EpicContextEditor } from './EpicContextEditor';
import { AgentAvatar } from './AgentAvatar';

const COLUMN_LABEL: Record<string, string> = Object.fromEntries(KANBAN_COLUMNS.map(c => [c.key, c.label]));

// 14px line icons; currentColor so they follow the theme.
const ICON: Record<string, ReactNode> = {
  status: <circle cx="7" cy="7" r="4.5" />,
  assignee: <><circle cx="7" cy="5" r="2.4" /><path d="M2.5 12c.6-2.3 2.4-3.6 4.5-3.6s3.9 1.3 4.5 3.6" /></>,
  runsOn: <><rect x="1.8" y="2.8" width="10.4" height="8.4" rx="1.4" /><path d="M4.2 6l1.8 1.5-1.8 1.5M7.4 9h2.4" /></>,
  epic: <><path d="M7 1.8 12.2 4.5 7 7.2 1.8 4.5z" /><path d="M1.8 7.2 7 9.9l5.2-2.7M1.8 9.8 7 12.5l5.2-2.7" /></>,
  priority: <path d="M3 12.5V2M3 2.5h7.5l-1.6 2.6 1.6 2.6H3" />,
  blocked: <><circle cx="7" cy="7" r="5" /><path d="M3.5 10.5l7-7" /></>,
  key: <path d="M5.2 2l-1.4 10M10.2 2l-1.4 10M2.5 5h9.8M1.8 9h9.8" />,
};

function Icon({ name }: { name: string }) {
  return (
    <svg className="card-side-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">{ICON[name]}</g>
    </svg>
  );
}

function Row({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="card-side-row">
      <dt><Icon name={icon} />{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Who runs this card: a named agent, or whatever the board defaults to. */
function AssigneePicker({ artifactId, team, onEditTeam }: { artifactId: string; team: AgentTeamView; onEditTeam?: () => void }) {
  return (
    <div className="card-side-assignee">
      <select
        className="card-side-select"
        aria-label="Assign this card to an agent"
        value={team.assignments[artifactId] ?? ''}
        onChange={e => vscode.postMessage({ type: 'kanban:assignAgent', artifactId, agentId: e.target.value || null })}
      >
        <option value="">Board default</option>
        {team.agents.map(a => <option key={a.id} value={a.id}>{a.kind === 'person' ? `${a.name} (person)` : a.name}</option>)}
      </select>
      <button
        className="card-side-link"
        onClick={() => (onEditTeam ? onEditTeam() : vscode.postMessage({ type: 'kanban:editAgentTeam' }))}
        title={team.rosterDefined ? 'Add or change agents, their CLI and model' : 'Name your agents and pick their CLI and model'}
      >
        {team.rosterDefined ? 'Edit team' : 'Name agents'}
      </button>
    </div>
  );
}

const PRIORITY_LEVEL: Record<string, number> = { 'must-have': 3, p0: 3, critical: 3, high: 3, 'should-have': 2, p1: 2, medium: 2, 'could-have': 1, p2: 1, low: 1 };

function PriorityBars({ priority }: { priority: string }) {
  const level = PRIORITY_LEVEL[priority.toLowerCase()] ?? 0;
  return (
    <span className="card-side-priority" data-level={level}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        {[0, 1, 2].map(i => <rect key={i} x={1 + i * 4} y={8 - i * 3} width="2.4" height={3 + i * 3} rx="0.6" className={i < level ? 'is-on' : ''} />)}
      </svg>
      <span className="card-side-capital">{priority.replace(/-/g, ' ')}</span>
    </span>
  );
}

const time = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};
const STALE_LOCK_MS = 10 * 60_000;

export interface CardSideProps {
  item: KanbanItem;
  team?: AgentTeamView;
  onEditTeam?: () => void;
  onOpenCard?: (artifactId: string) => void;
  stories: readonly KanbanItem[];
  questions: number;
  agentInfo: AgentInfo | null;
  loadingInfo: boolean;
  terminalInteractive?: boolean;
  onViewTerminal: () => void;
  onTakeOver?: (item: KanbanItem) => void;
}

export function CardSide({ item, team, onEditTeam, onOpenCard, stories, questions, agentInfo, loadingInfo, terminalInteractive, onViewTerminal, onTakeOver }: CardSideProps) {
  const [command, setCommand] = useState('');
  const persona = agentInfo?.persona;
  const run = agentInfo?.terminalInfo;
  const lock = agentInfo?.lockDetail;
  const agentName = item.assignee?.name ?? persona?.name ?? run?.agentRole ?? item.agentState?.agentRole ?? 'Agent';
  const state = cardState(item, { questions, agentName });
  const isRunning = item.agentState?.status === 'running';
  const isPerson = !!item.assignee?.person;
  const column = normalizeToKanbanColumn(item.status);
  const runtime = runsOn(team, item.id, run?.provider);
  const runtimeLabel = run?.provider ? (team?.installed.find(c => c.id === run.provider)?.label ?? run.provider) : undefined;
  const checks = item.harnessResults ?? [];
  const failing = checks.filter(c => !c.passed);
  const blockers = item.blockerTitles ?? [];
  const hasTerminal = !!item.agentState?.terminalId || !!run;

  const send = () => {
    if (!command.trim()) return;
    vscode.postMessage({ type: 'terminal:input', sessionId: item.id, data: command + '\n' });
    setCommand('');
  };

  return (
    <aside className="card-page-side card-side" aria-label="Card properties">
      {/* ── Now ── */}
      <section className={`card-side-now card-side-now--${state.tone}`} aria-live="polite">
        <p className="card-side-now-title"><span className="card-side-dot" aria-hidden="true" />{state.title}</p>
        {state.detail && <p className={`card-side-now-detail${state.tone === 'working' ? ' card-side-now-detail--line' : ''}`}>{state.detail}</p>}
        {!isPerson && (hasTerminal || isRunning) && (
          <div className="card-side-now-actions">
            {hasTerminal && <button className="card-side-btn" onClick={onViewTerminal}>View terminal</button>}
            {isRunning && onTakeOver && (
              <button className="card-side-btn" onClick={() => onTakeOver(item)} disabled={!terminalInteractive}
                title={terminalInteractive ? 'Type into the agent terminal yourself' : 'Turn on the embedded terminal in settings to take over'}>
                Take over
              </button>
            )}
          </div>
        )}
        {isRunning && terminalInteractive && (
          <div className="card-side-send">
            <input className="card-side-input" placeholder="Type into the terminal (Enter)" value={command}
              onChange={e => setCommand(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }} />
          </div>
        )}
      </section>

      {/* ── Properties ── */}
      <dl className="card-side-props">
        <Row icon="status" label="Status">
          <span className={`card-page-status card-page-status--${column}`}>{COLUMN_LABEL[column] ?? item.status}</span>
        </Row>
        <Row icon="assignee" label="Assignee">
          {team ? <AssigneePicker artifactId={item.id} team={team} onEditTeam={onEditTeam} /> : (item.assignee?.name ?? 'Board default')}
        </Row>
        {!isPerson && (
          <Row icon="runsOn" label="Runs on">
            {runtime ?? <span className="card-side-muted">Board default agent</span>}
          </Row>
        )}
        {item.epicKey && !item.isEpic && (
          <Row icon="epic" label="Epic">
            <button className="card-side-link" onClick={() => onOpenCard?.(item.epicKey!)}>{item.epicTitle ?? item.epicKey}</button>
          </Row>
        )}
        {item.priority && <Row icon="priority" label="Priority"><PriorityBars priority={item.priority} /></Row>}
        {(blockers.length > 0 || item.hasCycle || (item.blockedBy ?? 0) > 0) && (
          <Row icon="blocked" label="Blocked by">
            <ul className="card-side-blockers">
              {blockers.map((t, i) => <li key={i}><span className="card-side-dot card-side-dot--stopped" aria-hidden="true" />{t}</li>)}
              {blockers.length === 0 && !item.hasCycle && <li>{item.blockedBy} open card{item.blockedBy === 1 ? '' : 's'}</li>}
              {item.hasCycle && <li><span className="card-side-dot card-side-dot--stopped" aria-hidden="true" />Circular dependency</li>}
            </ul>
          </Row>
        )}
        {item.leadProgress && (
          <Row icon="assignee" label="Lead">{item.leadProgress.lead} plans it and hands out the stories</Row>
        )}
        <Row icon="key" label="Key"><span className="card-side-mono">{item.key}</span></Row>
      </dl>

      {item.isEpic && <EpicBreakdown stories={stories} />}

      {/* ── Last run ── */}
      {!isPerson && (run || loadingInfo || persona || item.agentState?.sessionId) && (
        <section className="card-side-section">
          <h3 className="card-page-section-title">Agent</h3>
          {loadingInfo && !agentInfo ? (
            <span className="card-side-muted">Loading…</span>
          ) : (
            <>
              <div className="card-side-agent">
                <AgentAvatar name={agentName} id={item.assignee?.id} avatar={item.assignee?.avatar} size={32} />
                <span className="card-side-agent-text">
                  <span className="card-side-agent-name">{agentName}</span>
                  {!item.assignee && persona?.title && <span className="card-side-muted">{persona.title}</span>}
                </span>
              </div>
              {run && (
                <dl className="card-side-run">
                  <div><dt>Step</dt><dd>{stepLabel(run.workflowId)}</dd></div>
                  {run.startedAt && <div><dt>Started</dt><dd>{time(run.startedAt)}</dd></div>}
                  {runtimeLabel && !runtime && <div><dt>Agent</dt><dd>{runtimeLabel}</dd></div>}
                </dl>
              )}
              {lock?.isStale || (lock && lock.ageMs > STALE_LOCK_MS && !isRunning) ? (
                <p className="card-side-warn"><span className="card-side-dot card-side-dot--waiting" aria-hidden="true" />
                  An earlier run still holds this card. Stop the agent to free it.</p>
              ) : null}
            </>
          )}
          {item.agentState?.sessionId && (
            <button className="card-side-link" onClick={() => vscode.postMessage({ type: 'kanban:viewTrace', sessionId: item.agentState!.sessionId })}>
              Open the run trace
            </button>
          )}
        </section>
      )}

      {item.isEpic && <EpicContextEditor epicId={item.id} />}

      {/* ── Checks ── */}
      {checks.length > 0 && (
        <details className="card-side-checks" open={failing.length > 0}>
          <summary>
            <span className={`card-side-dot card-side-dot--${failing.length ? 'stopped' : 'done'}`} aria-hidden="true" />
            {failing.length ? `${failing.length} of ${checks.length} checks failing` : `All ${checks.length} checks pass`}
          </summary>
          <ul>
            {checks.map((c, i) => (
              <li key={i} className={c.passed ? 'is-pass' : 'is-fail'}>
                <span className="card-side-check-mark" aria-hidden="true">{c.passed ? '✓' : '✕'}</span>
                <span>{checkLabel(c.policyId)}</span>
                {!c.passed && c.severity === 'blocking' && <span className="card-side-tag">blocks moves</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
}
