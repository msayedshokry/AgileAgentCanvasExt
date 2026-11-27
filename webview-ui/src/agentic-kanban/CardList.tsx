// A list view of cards (Working, In review): one row per card with its id,
// title, epic, what is happening and who has it. Click or Enter opens the
// card page.

import type { KanbanItem } from '../components/kanban/KanbanTypes';
import './BoardNav.css';
import { AgentAvatar } from './AgentAvatar';

interface CardListProps {
  title: string;
  items: readonly KanbanItem[];
  empty: string;
  onOpen: (item: KanbanItem) => void;
}

function statusLine(item: KanbanItem): string {
  const s = item.agentState;
  if (s?.status === 'running') return item.progressLine ?? `${s.agentRole ?? 'Agent'} is working…`;
  if (s?.status === 'queued') return s.agentRole?.startsWith('Waiting for ') ? s.agentRole : 'Starting…';
  if (s?.status === 'interrupted') return s.failure?.title ?? 'Stopped';
  return item.status === 'review' ? 'Waiting for your review' : '';
}

export function CardList({ title, items, empty, onOpen }: CardListProps) {
  return (
    <section className="card-list" aria-label={title}>
      <header className="card-list-head">
        <h2 className="card-list-title">{title}</h2>
        <span className="card-list-count">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p className="card-list-empty">{empty}</p>
      ) : (
        <ul className="card-list-rows">
          {items.map((item) => (
            <li key={item.id}>
              <button className="card-list-row" onClick={() => onOpen(item)}>
                <span className={`card-list-state card-list-state--${item.agentState?.status ?? 'idle'}`} aria-hidden="true" />
                <span className="card-list-key">{item.key}</span>
                <span className="card-list-main">
                  <span className="card-list-name">{item.title}</span>
                  <span className="card-list-line">{statusLine(item)}</span>
                </span>
                {item.epicTitle && <span className="card-list-epic">{item.epicTitle}</span>}
                {item.assignee && (
                  <span className="card-list-who">
                    <AgentAvatar name={item.assignee.name} id={item.assignee.id} avatar={item.assignee.avatar} person={item.assignee.person} size={18} />
                    {item.assignee.name}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
