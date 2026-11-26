// Context attached to an epic (docs/plans/2026-11-26-agent-board-live.md, L9):
// files, folders and links its stories' agents should know about, plus a note.
// Every story in the epic gets them in its brief. One path or link per line;
// the extension checks them (workspace-relative paths, http(s) links).

import { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';
import './EpicContextEditor.css';

interface EpicContext { paths: string[]; urls: string[]; note?: string }

const MAX_NOTE = 2000;

const summarize = (ctx: EpicContext | null): string => {
  if (!ctx) return 'None yet';
  const parts = [
    ctx.paths.length ? `${ctx.paths.length} file${ctx.paths.length === 1 ? '' : 's'}` : '',
    ctx.urls.length ? `${ctx.urls.length} link${ctx.urls.length === 1 ? '' : 's'}` : '',
    ctx.note ? 'a note' : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'None yet';
};

export function EpicContextEditor({ epicId }: { epicId: string }) {
  const [saved, setSaved] = useState<EpicContext | null | undefined>(undefined);
  const [paths, setPaths] = useState('');
  const [urls, setUrls] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    setSaved(undefined);
    const load = (ctx: EpicContext | null) => {
      setSaved(ctx);
      setPaths(ctx?.paths.join('\n') ?? '');
      setUrls(ctx?.urls.join('\n') ?? '');
      setNote(ctx?.note ?? '');
    };
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.artifactId !== epicId) return;
      if (msg.type === 'kanban:epicContext') load(msg.context ?? null);
      if (msg.type === 'kanban:epicContextSaved') { load(msg.context ?? null); setError(undefined); setStatus('Saved. Stories in this epic get it on their next run.'); }
      if (msg.type === 'kanban:epicContextError') { setError(String(msg.error)); setStatus(undefined); }
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'kanban:getEpicContext', artifactId: epicId });
    return () => window.removeEventListener('message', onMessage);
  }, [epicId]);

  const dirty = saved !== undefined && (
    paths.trim() !== (saved?.paths.join('\n') ?? '') || urls.trim() !== (saved?.urls.join('\n') ?? '') || note.trim() !== (saved?.note ?? ''));

  const save = () => {
    setError(undefined);
    setStatus(undefined);
    vscode.postMessage({ type: 'kanban:saveEpicContext', artifactId: epicId, context: { paths, urls, note } });
  };

  return (
    <details className="agentic-collapse epic-context">
      <summary className="agentic-collapse-summary">
        Context for agents
        <span className="epic-context-count">{saved === undefined ? '…' : summarize(saved)}</span>
      </summary>
      <form className="epic-context-form" onSubmit={e => { e.preventDefault(); save(); }} aria-label="Context for this epic's agents">
        <p className="epic-context-hint">Every story in this epic lists these in its agent's brief. Files are listed, not pasted; links are not fetched.</p>
        <label className="epic-context-field">
          <span>Files and folders</span>
          <textarea rows={3} value={paths} placeholder={'docs/auth-spec.md\nsrc/auth/'} onChange={e => setPaths(e.target.value)} spellCheck={false} />
        </label>
        <label className="epic-context-field">
          <span>Links</span>
          <textarea rows={2} value={urls} placeholder="https://…" onChange={e => setUrls(e.target.value)} spellCheck={false} />
        </label>
        <label className="epic-context-field">
          <span>Note</span>
          <textarea rows={3} value={note} maxLength={MAX_NOTE} placeholder="What every agent on this epic should know" onChange={e => setNote(e.target.value)} />
        </label>
        {error && <p className="epic-context-error" role="alert">{error}</p>}
        {status && !dirty && <p className="epic-context-status" role="status">{status}</p>}
        <div className="epic-context-actions">
          <button type="submit" className="epic-context-save" disabled={!dirty}>Save context</button>
        </div>
      </form>
    </details>
  );
}
