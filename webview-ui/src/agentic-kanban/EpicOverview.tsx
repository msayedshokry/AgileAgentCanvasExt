// What an epic's page adds to a card page: how far along it is, its stories
// (open one to go to it), and who is doing what. Pure presentation over the
// stories the board already has.

import { KANBAN_COLUMNS, normalizeToKanbanColumn, type KanbanColumnKey, type KanbanItem } from '../components/kanban/KanbanTypes';
import './EpicOverview.css';
import { AgentAvatar } from './AgentAvatar';

export interface EpicProgress {
  done: number;
  active: number;
  notStarted: number;
  total: number;
}

const ACTIVE: ReadonlySet<KanbanColumnKey> = new Set(['in-progress', 'review']);

/** Done, under way (in progress or review), and not started. */
export function epicProgress(stories: readonly KanbanItem[]): EpicProgress {
  let done = 0;
  let active = 0;
  for (const s of stories) {
    const col = normalizeToKanbanColumn(s.status);
    if (col === 'done') done++;
    else if (ACTIVE.has(col)) active++;
  }
  return { done, active, notStarted: stories.length - done - active, total: stories.length };
}

export interface MemberBreakdown {
  id: string;
  name: string;
  person: boolean;
  avatar?: string;
  done: number;
  total: number;
}

/** Stories per assignee, people and agents alike; unassigned last. */
export function breakdownByAssignee(stories: readonly KanbanItem[]): MemberBreakdown[] {
  const rows = new Map<string, MemberBreakdown>();
  for (const s of stories) {
    const id = s.assignee?.id ?? '';
    const row = rows.get(id) ?? { id, name: s.assignee?.name ?? 'Unassigned', person: !!s.assignee?.person, avatar: s.assignee?.avatar, done: 0, total: 0 };
    row.total++;
    if (normalizeToKanbanColumn(s.status) === 'done') row.done++;
    rows.set(id, row);
  }
  return [...rows.values()].sort((a, b) => (a.id === '' ? 1 : b.id === '' ? -1 : b.total - a.total || a.name.localeCompare(b.name)));
}

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/** Main column: progress and the stories, grouped by column. */
export function EpicOverview({ stories, onOpenCard }: { stories: readonly KanbanItem[]; onOpenCard?: (id: string) => void }) {
  const p = epicProgress(stories);
  if (p.total === 0) {
    return <p className="card-page-empty">No stories yet. Give the epic to the lead, or describe a goal, to plan them.</p>;
  }
  const groups = KANBAN_COLUMNS
    .map((col) => ({ col, items: stories.filter((s) => normalizeToKanbanColumn(s.status) === col.key) }))
    .filter((g) => g.items.length > 0)
    .reverse(); // what is moving first: done, review, in progress… then backlog
  return (
    <section className="epic-overview" aria-label="Epic progress and stories">
      <div className="epic-progress">
        <div className="epic-progress-head">
          <span className="epic-progress-pct">{pct(p.done, p.total)}%</span>
          <span className="epic-progress-of">{p.done} of {p.total} stories done</span>
        </div>
        <div
          className="epic-progress-bar"
          role="img"
          aria-label={`${p.done} done, ${p.active} under way, ${p.notStarted} not started`}
        >
          <span className="epic-progress-seg epic-progress-seg--done" style={{ flexGrow: p.done }} />
          <span className="epic-progress-seg epic-progress-seg--active" style={{ flexGrow: p.active }} />
          <span className="epic-progress-seg epic-progress-seg--todo" style={{ flexGrow: p.notStarted }} />
        </div>
        <ul className="epic-progress-legend" aria-hidden="true">
          <li><span className="epic-swatch epic-swatch--done" />Done {p.done}</li>
          <li><span className="epic-swatch epic-swatch--active" />Under way {p.active}</li>
          <li><span className="epic-swatch epic-swatch--todo" />Not started {p.notStarted}</li>
        </ul>
      </div>

      <h3 className="card-page-section-title">Stories</h3>
      <div className="epic-stories">
        {groups.map(({ col, items }) => (
          <div key={col.key} className="epic-story-group">
            <p className="epic-story-group-label">
              <span className={`card-page-status card-page-status--${col.key}`}>{col.label}</span>
              <span className="epic-story-group-count">{items.length}</span>
            </p>
            <ul className="epic-story-list">
              {items.map((s) => (
                <li key={s.id}>
                  <button className="epic-story" onClick={() => onOpenCard?.(s.id)}>
                    <span className="epic-story-key">{s.key}</span>
                    <span className="epic-story-title">{s.title}</span>
                    {s.agentState?.status === 'running' && <span className="kanban-card-activity kanban-card-activity--running" aria-label="Agent working" role="img" />}
                    {s.agentState?.status === 'interrupted' && <span className="kanban-card-activity kanban-card-activity--stopped" aria-label="Needs you" role="img" />}
                    {s.assignee && (
                      <span className="epic-story-who" title={s.assignee.name}>
                        <AgentAvatar name={s.assignee.name} id={s.assignee.id} avatar={s.assignee.avatar} person={s.assignee.person} size={20} />
                        <span className="visually-hidden">{s.assignee.name}</span>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Side column: stories per agent or person. */
export function EpicBreakdown({ stories }: { stories: readonly KanbanItem[] }) {
  const rows = breakdownByAssignee(stories);
  if (rows.length === 0) return null;
  return (
    <section className="card-page-section" aria-label="Breakdown by assignee">
      <h3 className="card-page-section-title">By assignee</h3>
      <ul className="epic-breakdown">
        {rows.map((r) => (
          <li key={r.id || 'unassigned'} className="epic-breakdown-row">
            <span className="epic-breakdown-who">
              {r.id ? (
                <AgentAvatar name={r.name} id={r.id} avatar={r.avatar} person={r.person} size={22} />
              ) : <span className="epic-avatar-empty" aria-hidden="true" />}
              <span className="epic-breakdown-name">{r.name}</span>
              {r.id && <span className="epic-breakdown-tag">{r.person ? 'Person' : 'Agent'}</span>}
            </span>
            <span className="epic-breakdown-bar" aria-hidden="true"><span style={{ width: `${pct(r.done, r.total)}%` }} /></span>
            <span className="epic-breakdown-count">{r.done}/{r.total}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
