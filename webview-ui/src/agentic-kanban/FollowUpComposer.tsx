// Reply to the card's agent. Board runs take one prompt, so a message sent
// while the agent works is queued and delivered the moment the run ends, as
// the next run in the same conversation; when idle it starts that run now.

import { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';

const MAX_CHARS = 2000;

type Status = { kind: 'idle' } | { kind: 'queued'; pending: number } | { kind: 'sent'; count: number };

export function FollowUpComposer({ artifactId, isRunning }: { artifactId: string; isRunning: boolean }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    setStatus({ kind: 'idle' });
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.artifactId !== artifactId) return;
      if (msg.type === 'kanban:followUpQueued') setStatus({ kind: 'queued', pending: Number(msg.pending) || 1 });
      if (msg.type === 'kanban:followUpSent') setStatus({ kind: 'sent', count: Number(msg.count) || 1 });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [artifactId]);

  const send = () => {
    const message = text.trim();
    if (!message) return;
    vscode.postMessage({ type: 'kanban:followUp', artifactId, text: message });
    setText('');
  };

  const hint = status.kind === 'queued'
    ? `${status.pending} message${status.pending === 1 ? '' : 's'} waiting — sent when this run ends`
    : status.kind === 'sent'
      ? 'Sent. The agent picks it up in a new run of the same conversation.'
      : isRunning
        ? 'The agent is working. Your message is sent when this run ends.'
        : 'Starts a new run that continues this card’s conversation.';

  return (
    <form
      className="agent-followup"
      onSubmit={e => { e.preventDefault(); send(); }}
      aria-label="Message the agent"
    >
      <textarea
        className="agent-followup-input"
        rows={2}
        maxLength={MAX_CHARS}
        placeholder="Message the agent…  (Ctrl+Enter to send)"
        aria-label="Message to the agent"
        aria-describedby={`followup-hint-${artifactId}`}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
        }}
      />
      <div className="agent-followup-row">
        <span id={`followup-hint-${artifactId}`} className="agent-followup-hint" role="status">{hint}</span>
        <button type="submit" className="agent-btn agent-btn--primary" disabled={!text.trim()}>
          {isRunning ? 'Queue' : 'Send'}
        </button>
      </div>
    </form>
  );
}
