// Header Inbox: one place for everything that waits on a person — approval
// checkpoints, stopped runs with their fix, paused stories, autopilot runs
// that need a look. Quiet when empty; opens by itself only for an approval,
// because an agent is paused mid-run until someone answers.

import { useEffect, useRef, useState } from 'react';
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

interface InboxProps {
  entries: readonly InboxEntry[];
  /** Board-wide items: budget cap, circuit breaker, empty queue, systemic policy failures. */
  systemItems?: readonly SystemInboxItem[];
  /** The approval checkpoint an agent is paused on, if any. */
  approval: ApprovalRequest | null;
  onRespondApproval: (approved: boolean) => void;
  onOpenCard: (artifactId: string) => void;
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
        rows={2}
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

function EntryActions({ entry, onOpenCard }: { entry: InboxEntry; onOpenCard: (id: string) => void }) {
  const [fix] = entry.actions;
  const cardId = entry.cardId ?? entry.artifactId;
  return (
    <div className="inbox-entry-actions">
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
        onClick={() => vscode.postMessage({ type: 'kanban:dismissInbox', artifactId: entry.artifactId })}
        title="Remove from the Inbox; it comes back if the agent needs you again"
      >
        Dismiss
      </button>
    </div>
  );
}

export function Inbox({ entries, systemItems = [], approval, onRespondApproval, onOpenCard }: InboxProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // The approval renders as the prompt at the top, not again as a row.
  const rows = approval ? entries.filter((e) => !(e.kind === 'approval' && e.artifactId === approval.artifactId)) : entries;
  const system = systemItems.filter((s) => s.type !== 'approval');
  const count = rows.length + system.length + (approval ? 1 : 0);

  useEffect(() => {
    if (approval) setOpen(true);
  }, [approval?.artifactId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const now = Date.now();
  return (
    <div className="inbox" ref={rootRef}>
      <button
        className={`inbox-trigger${count > 0 ? ' inbox-trigger--active' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={count > 0 ? `Inbox, ${count} need${count === 1 ? 's' : ''} you` : 'Inbox, nothing needs you'}
        onClick={() => setOpen((o) => !o)}
      >
        Inbox
        {count > 0 && <span className="inbox-count" aria-hidden="true">{count}</span>}
      </button>

      {open && (
        <div className="inbox-panel" role="dialog" aria-label="Inbox">
          <p className="inbox-heading">Needs you</p>
          {approval && (
            <ApprovalBanner request={approval} onRespond={onRespondApproval} />
          )}
          {count === 0 ? (
            <p className="inbox-empty">Nothing needs you. Agents will show up here when they need a decision.</p>
          ) : (
            <ul className="inbox-list">
              {system.map((item, idx) => (
                <li key={`system-${item.type}-${idx}`} className={`inbox-entry inbox-entry--system inbox-entry--${item.severity}`}>
                  <div className="inbox-entry-head">
                    <span className="inbox-kind">{SYSTEM_LABEL[item.type]}</span>
                    <span className="inbox-entry-title">{item.title}</span>
                  </div>
                  {item.detail && <p className="inbox-reason">{item.detail}</p>}
                </li>
              ))}
              {rows.map((entry) => (
                <li key={entry.artifactId} className={`inbox-entry inbox-entry--${entry.kind}`}>
                  <div className="inbox-entry-head">
                    <span className="inbox-kind">{KIND_LABEL[entry.kind]}</span>
                    <span className="inbox-entry-title">{entry.title}</span>
                    <span className="inbox-wait" title={new Date(entry.since).toLocaleString()}>{waitingFor(entry.since, now)}</span>
                  </div>
                  <p className="inbox-reason">{entry.reason}</p>
                  {entry.details && entry.details.length > 0 && (
                    <ul className="inbox-details">{entry.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
                  )}
                  {entry.kind === 'question' && <AnswerBox entry={entry} />}
                  <EntryActions entry={entry} onOpenCard={(id) => { setOpen(false); onOpenCard(id); }} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
