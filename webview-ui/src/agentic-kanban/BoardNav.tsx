// Left sidebar of the board: where to look. The Inbox first (what needs you),
// then the views (the board, what agents are working on, what waits for
// review, live terminals), then the epics, each with its progress, which
// narrow the board to that epic.

import type { KanbanItem } from '../components/kanban/KanbanTypes';
import './BoardNav.css';

export type BoardView = 'board' | 'inbox' | 'working' | 'review' | 'terminals';

interface BoardNavProps {
  view: BoardView;
  onView: (view: BoardView) => void;
  inboxCount: number;
  workingCount: number;
  reviewCount: number;
  runningCount: number;
  epics: readonly KanbanItem[];
  /** Epic the board is narrowed to, if any. */
  epicFilter: string | null;
  onEpicFilter: (epicId: string | null) => void;
}

function Count({ n, tone }: { n: number; tone?: 'accent' | 'live' }) {
  if (n <= 0) return null;
  return <span className={`board-nav-count${tone ? ` board-nav-count--${tone}` : ''}`}>{n}</span>;
}

function Icon({ d }: { d: string }) {
  return (
    <svg className="board-nav-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  inbox: 'M1.5 8.5h3l1 1.5h3l1-1.5h3M2.5 3h9l1 5.5v3a1 1 0 01-1 1h-9a1 1 0 01-1-1v-3z',
  board: 'M2 2.5h2.5v9H2zM5.75 2.5h2.5v6h-2.5zM9.5 2.5H12v4H9.5z',
  working: 'M7 1.5a5.5 5.5 0 105.5 5.5M7 4v3l2 1.5',
  review: 'M1.5 7s2-4 5.5-4 5.5 4 5.5 4-2 4-5.5 4-5.5-4-5.5-4zM7 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z',
  terminals: 'M2 2.5h10a.5.5 0 01.5.5v8a.5.5 0 01-.5.5H2a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5zM4 6l2 1.5L4 9M7.5 9.5h2.5',
};

export function BoardNav({ view, onView, inboxCount, workingCount, reviewCount, runningCount, epics, epicFilter, onEpicFilter }: BoardNavProps) {
  const item = (key: BoardView, label: string, count: number, tone?: 'accent' | 'live') => (
    <li>
      <button
        className={`board-nav-item${view === key && !(key === 'board' && epicFilter) ? ' is-active' : ''}`}
        aria-current={view === key ? 'page' : undefined}
        onClick={() => { onView(key); if (key === 'board') onEpicFilter(null); }}
      >
        <Icon d={ICONS[key]} />
        <span className="board-nav-label">{label}</span>
        <Count n={count} tone={tone} />
      </button>
    </li>
  );
  return (
    <nav className="board-nav" aria-label="Board navigation">
      <ul className="board-nav-list">
        {item('inbox', 'Inbox', inboxCount, 'accent')}
      </ul>
      <p className="board-nav-heading">Views</p>
      <ul className="board-nav-list">
        {item('board', 'Board', 0)}
        {item('working', 'Working', workingCount, 'live')}
        {item('review', 'In review', reviewCount)}
        {item('terminals', 'Terminals', runningCount, 'live')}
      </ul>
      {epics.length > 0 && (
        <>
          <p className="board-nav-heading">Epics</p>
          <ul className="board-nav-list">
            {epics.map((epic) => {
              const p = epic.childProgress ?? { done: 0, total: 0 };
              const active = view === 'board' && epicFilter === epic.id;
              const pct = p.total > 0 ? p.done / p.total : 0;
              return (
                <li key={epic.id}>
                  <button
                    className={`board-nav-item board-nav-epic${active ? ' is-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    title={`${epic.title} — ${p.done} of ${p.total} stories done. Show only this epic on the board.`}
                    onClick={() => { onView('board'); onEpicFilter(active ? null : epic.id); }}
                  >
                    <svg className="board-nav-ring" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                      <circle cx="7" cy="7" r="5.2" className="board-nav-ring-track" />
                      <circle cx="7" cy="7" r="5.2" className="board-nav-ring-fill" strokeDasharray={`${32.7 * pct} 32.7`} transform="rotate(-90 7 7)" />
                    </svg>
                    <span className="board-nav-label">{epic.title}</span>
                    <span className="board-nav-meta">{p.done}/{p.total}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </nav>
  );
}
