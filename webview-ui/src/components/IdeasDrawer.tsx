import { useEffect, useMemo, useRef, useState } from 'react';
import type { Idea, IdeaColor } from '../types';
import { vscode } from '../vscodeApi';
import './IdeasDrawer.css';

interface IdeasDrawerProps {
  open: boolean;
  ideas: Idea[];
  archived: Idea[];
  initialFocus?: 'capture' | 'list';
  projectReady: boolean;
  error: string | null;
  onDismissError: () => void;
  onOpenProject: () => void;
  onClose: () => void;
}

const COLORS: { id: IdeaColor; label: string; hex: string }[] = [
  { id: 'yellow', label: 'Draft',     hex: '#fbf3c4' },
  { id: 'blue',   label: 'Idea',      hex: '#d9e6ff' },
  { id: 'green',  label: 'Resolved',  hex: '#dff7dc' },
  { id: 'pink',   label: 'Important', hex: '#ffd9e2' },
  { id: 'gray',   label: 'Archived',  hex: '#ececec' },
];

function relTime(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export function IdeasDrawer({ open, ideas, archived, initialFocus, projectReady, error, onDismissError, onOpenProject, onClose }: IdeasDrawerProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [color, setColor] = useState<IdeaColor>('yellow');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  // Auto-focus capture input when the drawer opens via the keyboard shortcut.
  useEffect(() => {
    if (!open) return;
    if (initialFocus === 'capture') {
      // Defer to next frame so the input has mounted.
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [open, initialFocus]);

  // Reset capture form when the drawer is closed.
  useEffect(() => {
    if (open) return;
    setTitle(''); setBody(''); setColor('yellow'); setEditingId(null);
  }, [open]);

  const handleSave = () => {
    if (!title.trim() && !body.trim()) return;
    if (!projectReady) {
      // Defensive: drawer banner should already gate this, but block at the
      // source-of-truth click as well so we never post a doomed message.
      setError?.('No active project folder. Open or create one to save ideas.');
      return;
    }
    if (editingId) {
      vscode.postMessage({
        type: 'updateIdea',
        id: editingId,
        title: title.trim() || 'Untitled idea',
        body,
        color,
      });
      setEditingId(null);
    } else {
      vscode.postMessage({
        type: 'createIdea',
        title: title.trim() || 'Untitled idea',
        body,
        color,
      });
    }
    setTitle(''); setBody(''); setColor('yellow');
  };

  // Local error for the click-time guard; the extension's ideaError message
  // takes precedence when it arrives (and is shown via the `error` prop).
  const [, setError] = useState<string | null>(null);

  const handleCancelEdit = () => {
    setEditingId(null);
    setTitle(''); setBody(''); setColor('yellow');
  };

  // Cmd/Ctrl+Enter in the capture form saves — quick path for keyboard users.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  // Close on Escape key (when the focus is anywhere in the drawer).
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  // Close on outside click — a transparent scrim sits behind the drawer and
  // captures mousedown. We compare against the drawer's own ref so clicks
  // INSIDE the drawer (on cards, form, etc.) don't close it.
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (drawerRef.current && target && drawerRef.current.contains(target)) return;
      onClose();
    };
    // Use mousedown so we beat any drag/select-in-progress (slight UX polish).
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);

  const handleClickIdea = (idea: Idea) => {
    setEditingId(idea.id);
    setTitle(idea.title);
    setBody(idea.body);
    setColor(idea.color);
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const handleArchive = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    vscode.postMessage({ type: 'archiveIdea', id });
    if (editingId === id) handleCancelEdit();
  };

  const handleRestore = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    vscode.postMessage({ type: 'restoreIdea', id });
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    vscode.postMessage({ type: 'deleteIdea', id });
    if (editingId === id) handleCancelEdit();
  };

  const filteredIdeas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ideas;
    return ideas.filter(i => i.title.toLowerCase().includes(q) || i.body.toLowerCase().includes(q));
  }, [ideas, search]);

  if (!open) return null;

  return (
    <>
      {/* Transparent scrim — captures clicks outside the drawer to close it.
          Invisible (no background) so the canvas remains untouched. The 1px
          transparent layer is enough for the click-outside handler to target. */}
      <div
        className="ideas-drawer-scrim"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        className="ideas-drawer"
        role="complementary"
        aria-label="Ideas and notes"
      >
      {/* Toast: extension-side error (e.g. save refused) */}
      {error && (
        <div className="ideas-drawer-toast" role="alert">
          <span className="ideas-drawer-toast-text">{error}</span>
          <button className="ideas-drawer-toast-close" onClick={onDismissError} aria-label="Dismiss">×</button>
        </div>
      )}

      {/* Block capture when no project is active — clear warning + action */}
      {!projectReady && (
        <div className="ideas-drawer-banner" role="status">
          <div className="ideas-drawer-banner-title">No project folder active</div>
          <p className="ideas-drawer-banner-body">
            Ideas save to <code>&lt;project&gt;/ideas/</code>. Open or create one to capture notes.
          </p>
          <button className="btn btn-primary btn-small" onClick={onOpenProject}>
            Open / create project
          </button>
        </div>
      )}

      <header className="ideas-drawer-header">
        <div className="ideas-drawer-title">
          <span className="ideas-drawer-icon" aria-hidden>💡</span>
          <span>Ideas</span>
        </div>
        <input
          className="ideas-drawer-search"
          placeholder="Search ideas"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search ideas"
        />
        <button className="ideas-drawer-close" onClick={onClose} aria-label="Close ideas drawer">×</button>
      </header>

      <section className="ideas-capture" onKeyDown={handleKeyDown}>
        <input
          ref={titleRef}
          className="ideas-capture-title"
          placeholder={editingId ? 'Edit title' : 'New idea title'}
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <textarea
          className="ideas-capture-body"
          placeholder="Jot it here — it saves with the project."
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={3}
        />
        <div className="ideas-capture-toolbar">
          <div className="ideas-color-row">
            {COLORS.map(c => (
              <button
                key={c.id}
                className={`ideas-color-chip ${c.id}${color === c.id ? ' selected' : ''}`}
                onClick={() => setColor(c.id)}
                title={c.label}
                aria-label={c.label}
                aria-pressed={color === c.id}
              />
            ))}
          </div>
          <div className="ideas-capture-buttons">
            {editingId && (
              <button className="btn btn-secondary btn-small" onClick={handleCancelEdit}>Cancel</button>
            )}
            <button
              className="btn btn-primary btn-small"
              onClick={handleSave}
              disabled={(!title.trim() && !body.trim()) || !projectReady}
              title={!projectReady ? 'Open or create a project to save ideas' : undefined}
            >
              {editingId ? 'Save' : 'Add'} <kbd>⌘↵</kbd>
            </button>
          </div>
        </div>
      </section>

      <section className="ideas-list">
        {filteredIdeas.length === 0 && ideas.length === 0 ? (
          <p className="ideas-empty">
            <em>No ideas yet.</em><br />
            Jot notes here. They save with the project and the AI can read them.
          </p>
        ) : filteredIdeas.length === 0 ? (
          <p className="ideas-empty"><em>No ideas match "{search}".</em></p>
        ) : (
          filteredIdeas.map(idea => (
            <article
              key={idea.id}
              className={`ideas-card ${idea.color}${editingId === idea.id ? ' editing' : ''}`}
              onClick={() => handleClickIdea(idea)}
            >
              <div className="ideas-card-row1">
                <span className={`ideas-card-color-dot ${idea.color}`} aria-hidden />
                <strong className="ideas-card-title">{idea.title}</strong>
                <span className="ideas-card-time" title={idea.updatedAt}>{relTime(idea.updatedAt)}</span>
              </div>
              {idea.body && (
                <p className="ideas-card-preview">{idea.body.split('\n').slice(0, 3).join(' ').slice(0, 220)}</p>
              )}
              <div className="ideas-card-actions">
                <button
                  className="ideas-card-action"
                  onClick={(e) => handleArchive(idea.id, e)}
                  title="Archive"
                  aria-label="Archive idea"
                >Archive</button>
                <button
                  className="ideas-card-action danger"
                  onClick={(e) => handleDelete(idea.id, e)}
                  title="Delete permanently"
                  aria-label="Delete idea"
                >Delete</button>
              </div>
            </article>
          ))
        )}
      </section>

      {archived.length > 0 && (
        <section className="ideas-archived-section">
          <button
            className="ideas-archived-toggle"
            onClick={() => setShowArchived(s => !s)}
            aria-expanded={showArchived}
          >
            {showArchived ? '▼' : '▶'} Archived ({archived.length})
          </button>
          {showArchived && archived.map(idea => (
            <article key={idea.id} className={`ideas-card archived ${idea.color}`}>
              <div className="ideas-card-row1">
                <span className={`ideas-card-color-dot ${idea.color}`} aria-hidden />
                <strong className="ideas-card-title">{idea.title}</strong>
                <span className="ideas-card-time">{relTime(idea.archivedAt || idea.updatedAt)}</span>
              </div>
              {idea.body && <p className="ideas-card-preview">{idea.body.split('\n').slice(0, 2).join(' ').slice(0, 200)}</p>}
              <div className="ideas-card-actions">
                <button
                  className="ideas-card-action"
                  onClick={(e) => handleRestore(idea.id, e)}
                  title="Restore"
                  aria-label="Restore idea"
                >Restore</button>
                <button
                  className="ideas-card-action danger"
                  onClick={(e) => handleDelete(idea.id, e)}
                  title="Delete permanently"
                  aria-label="Delete idea"
                >Delete</button>
              </div>
            </article>
          ))}
        </section>
      )}
    </aside>
    </>
  );
}
