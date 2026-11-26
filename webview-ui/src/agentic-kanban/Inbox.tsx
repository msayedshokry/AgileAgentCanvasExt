// The Inbox: one list of everything that waits on a person — approval
// checkpoints, agents' questions, stopped runs with their fix, proposals,
// assignments to people, autopilot runs, and board-wide stops (budget,
// circuit breaker). Work it like a mail client: the list on the left, the
// selected item with its card on the right. Keys: J/K or arrows move,
// R answers, A approves a card in review, E dismisses, Enter opens the card.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { vscode } from '../vscodeApi';
import { FIX_ACTION_LABELS } from '../components/kanban/KanbanTypes';
import { ApprovalBanner, type ApprovalRequest } from './ApprovalBanner';
import type { InboxItem as SystemInboxItem } from './AutonomyBar';
import { KIND_LABEL, waitingFor, type InboxEntry } from './inbox-model';
import './Inbox.css';

const SYSTEM_LABEL: Record<SystemInboxItem['type'], string> = {
  approval: 'Approval',
  budget: 'Budget',
  circuit: 'Circuit breaker',
  systemic: 'Policy',
  'queue-empty': 'Queue',
};

/** How many things wait on you: what the sidebar counts. */
export function inboxCount(entries: readonly InboxEntry[], systemItems: readonly SystemInboxItem[], approval: ApprovalRequest | null): number {
  const rows = approval ? entries.filter((e) => !(e.kind === 'approval' && e.artifactId === approval.artifactId)) : entries;
  return rows.length + systemItems.filter((s) => s.type !== 'approval').length + (approval ? 1 : 0);
}

interface InboxViewProps {
  entries: readonly InboxEntry[];
  /** Board-wide items: budget cap, circuit breaker, empty queue, systemic policy failures. */
  systemItems?: readonly SystemInboxItem[];
  /** The approval checkpoint an agent is paused on, if any. */
  approval: ApprovalRequest | null;
  onRespondApproval: (approved: boolean) => void;
  /** Open the card on the board. */
  onOpenCard: (artifactId: string) => void;
  /** Approve a card in review (A). */
  onApprove?: (artifactId: string) => void;
  /** The card page for the selected item, shown under it. */
  renderCard?: (artifactId: string) => ReactNode;
}

/** An agent's questions with a box to answer them; the answer goes back to the agent. */
function AnswerBox({ entry }: { entry: InboxEntry }) {
  const [answer, setAnswer] = useState('');
  const send = () => {
    if (!answer.trim()) return;
    vscode.postMessage({ type: 'kanban:answerQuestions', artifactId: entry.artifactId, answer: answer.trim() });
    setAnswer('');
  };
  return (
    <form className="inbox-answer" onSubmit={e => { e.preventDefault(); send(); }}>
      <textarea
        rows={3}
        value={answer}
        maxLength={2000}
        placeholder="Your answer (Ctrl+Enter to send)"
        aria-label={`Answer ${entry.title}`}
        onChange={e => setAnswer(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
      />
      <button type="submit" className="inbox-btn inbox-btn--primary" disabled={!answer.trim()}>Send answer</button>
    </form>
  );
}

const dismiss = (entry: InboxEntry) => vscode.postMessage({ type: 'kanban:dismissInbox', artifactId: entry.artifactId });

/** `withCard`: the card page shows below, with its own Approve; don't repeat it. */
function EntryActions({ entry, onOpenCard, onApprove, withCard = false }: { entry: InboxEntry; onOpenCard: (id: string) => void; onApprove?: (id: string) => void; withCard?: boolean }) {
  const [fix] = entry.actions;
  const cardId = entry.cardId ?? entry.artifactId;
  return (
    <div className="inbox-entry-actions">
      {entry.kind === 'approval' && entry.onBoard && onApprove && !withCard && (
        <button className="inbox-btn inbox-btn--primary" onClick={() => onApprove(cardId)}>
          Approve and mark done <kbd>A</kbd>
        </button>
      )}
      {entry.kind === 'proposal' && (
        <button className="inbox-btn inbox-btn--primary" onClick={() => vscode.postMessage({ type: 'kanban:reviewProposals', artifactId: cardId })}>
          Review
        </button>
      )}
      {fix && (
        <button
          className="inbox-btn inbox-btn--primary"
          onClick={() => vscode.postMessage({ type: 'kanban:fixAction', artifactId: entry.artifactId, action: fix })}
        >
          {FIX_ACTION_LABELS[fix] ?? fix}
        </button>
      )}
      {entry.onBoard ? (
        <button className="inbox-btn" onClick={() => onOpenCard(cardId)}>Open card</button>
      ) : (
        <button className="inbox-btn" onClick={() => vscode.postMessage({ type: 'kanban:showOutput', artifactId: entry.artifactId })}>
          Show output
        </button>
      )}
      <button
        className="inbox-btn inbox-btn--quiet"
        onClick={() => dismiss(entry)}
        title="Remove from the Inbox; it comes back if the agent needs you again"
      >
        Dismiss <kbd>E</kbd>
      </button>
    </div>
  );
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);

export function InboxView({ entries, systemItems = [], approval, onRespondApproval, onOpenCard, onApprove, renderCard }: InboxViewProps) {
  // The approval renders as the prompt at the top, not again as a row.
  const rows = useMemo(
    () => (approval ? entries.filter((e) => !(e.kind === 'approval' && e.artifactId === approval.artifactId)) : entries),
    [entries, approval],
  );
  const system = systemItems.filter((s) => s.type !== 'approval');
  const [selectedId, setSelectedId] = useState<string | undefined>(rows[0]?.artifactId);
  const detailRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Keep a valid selection as items arrive and leave (dismissed, answered).
  useEffect(() => {
    if (!rows.some((r) => r.artifactId === selectedId)) setSelectedId(rows[0]?.artifactId);
  }, [rows, selectedId]);

  const index = rows.findIndex((r) => r.artifactId === selectedId);
  const selected = index >= 0 ? rows[index] : undefined;

  const move = (delta: number) => {
    if (rows.length === 0) return;
    const next = rows[Math.min(rows.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta))];
    setSelectedId(next.artifactId);
    listRef.current?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(next.artifactId)}"]`)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (!selected) return;
    else if (key === 'e') { e.preventDefault(); dismiss(selected); move(1); }
    else if (key === 'a' && selected.kind === 'approval' && selected.onBoard && onApprove) { e.preventDefault(); onApprove(selected.cardId ?? selected.artifactId); }
    else if (key === 'r') { e.preventDefault(); detailRef.current?.querySelector('textarea')?.focus(); }
    else if (e.key === 'Enter' && selected.onBoard) { e.preventDefault(); onOpenCard(selected.cardId ?? selected.artifactId); }
  };

  const now = Date.now();
  const empty = rows.length === 0 && system.length === 0 && !approval;
  return (
    <section className="inbox-view" aria-label="Inbox" onKeyDown={onKeyDown}>
      <div className="inbox-view-list">
        <header className="inbox-view-head">
          <h2 className="inbox-view-title">Inbox</h2>
          <span className="inbox-view-keys" aria-hidden="true"><kbd>J</kbd><kbd>K</kbd> move · <kbd>A</kbd> approve · <kbd>R</kbd> reply · <kbd>E</kbd> dismiss</span>
        </header>
        {approval && <ApprovalBanner request={approval} onRespond={onRespondApproval} />}
        {system.length > 0 && (
          <ul className="inbox-list inbox-list--system" aria-label="Board-wide">
            {system.map((item, idx) => (
              <li key={`system-${item.type}-${idx}`} className={`inbox-entry inbox-entry--system inbox-entry--${item.severity}`}>
                <div className="inbox-entry-head">
                  <span className="inbox-kind">{SYSTEM_LABEL[item.type]}</span>
                  <span className="inbox-entry-title">{item.title}</span>
                </div>
                {item.detail && <p className="inbox-reason">{item.detail}</p>}
              </li>
            ))}
          </ul>
        )}
        {empty ? (
          <p className="inbox-empty">Nothing needs you. Agents show up here when they need a decision.</p>
        ) : (
          <ul className="inbox-list" role="listbox" aria-label="Needs you" ref={listRef}>
            {rows.map((entry) => (
              <li
                key={entry.artifactId}
                role="option"
                aria-selected={entry.artifactId === selectedId}
                tabIndex={entry.artifactId === selectedId ? 0 : -1}
                data-entry-id={entry.artifactId}
                className={`inbox-entry inbox-entry--${entry.kind}${entry.artifactId === selectedId ? ' is-selected' : ''}`}
                onClick={() => setSelectedId(entry.artifactId)}
              >
                <div className="inbox-entry-head">
                  <span className="inbox-kind">{KIND_LABEL[entry.kind]}</span>
                  <span className="inbox-entry-title">{entry.title}</span>
                  <span className="inbox-wait" title={new Date(entry.since).toLocaleString()}>{waitingFor(entry.since, now)}</span>
                </div>
                <p className="inbox-reason">{entry.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="inbox-view-detail" ref={detailRef}>
        {selected ? (
          <>
            <div className="inbox-detail-head">
              <span className="inbox-kind">{KIND_LABEL[selected.kind]}</span>
              <p className="inbox-detail-reason">{selected.reason}</p>
              {/* A question on a card is answered on the card page below; elsewhere, here. */}
              {!(selected.kind === 'question' && selected.onBoard && renderCard) && selected.details && selected.details.length > 0 && (
                <ul className="inbox-details">{selected.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
              )}
              {selected.kind === 'question' && !(selected.onBoard && renderCard) && <AnswerBox entry={selected} />}
              <EntryActions entry={selected} onOpenCard={onOpenCard} onApprove={onApprove} withCard={selected.onBoard && !!renderCard} />
            </div>
            {selected.onBoard && renderCard && <div className="inbox-detail-card">{renderCard(selected.cardId ?? selected.artifactId)}</div>}
          </>
        ) : (
          <p className="inbox-empty inbox-empty--detail">{empty ? 'All clear.' : 'Select an item.'}</p>
        )}
      </div>
    </section>
  );
}
