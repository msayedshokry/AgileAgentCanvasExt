import { useState, useEffect, useCallback, useRef } from 'react';
import { vscode } from '../vscodeApi';
import { Icon } from './Icon';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkillEntry {
  name: string;
  folderName: string;
  description: string;
  source: 'builtin' | 'user';
  enabled: boolean;
  isAgent: boolean;
  repoSlug?: string;
}

interface RepoEntry {
  url: string;
  name: string;
  slug: string;
  skillCount: number;
  lastSynced: string | null;
  status: 'cloned' | 'error' | 'cloning' | 'pending';
  errorMessage?: string;
}

interface RepoOperation {
  slug: string;
  status: 'cloning' | 'syncing';
  message: string;
}

type Tab = 'all' | 'agents' | 'skills' | 'user' | 'repos';

interface CatalogueModalProps {
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CatalogueModal({ onClose }: CatalogueModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [entries, setEntries] = useState<SkillEntry[]>([]);
  const [repos, setRepos] = useState<RepoEntry[]>([]);
  const [search, setSearch] = useState('');
  const [repoOperation, setRepoOperation] = useState<RepoOperation | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [newRepoUrl, setNewRepoUrl] = useState('');
  const [newSkillName, setNewSkillName] = useState('');
  const [showCreateSkill, setShowCreateSkill] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmRemoveRepo, setConfirmRemoveRepo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const repoUrlRef = useRef<HTMLInputElement>(null);

  // Request catalogue data on mount
  useEffect(() => {
    vscode.postMessage({ type: 'getCatalogue' });
    vscode.postMessage({ type: 'listSkillRepos' });
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  // Message listener
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      switch (msg?.type) {
        case 'catalogueData':
          setEntries(msg.entries ?? []);
          setError(null);
          break;
        case 'catalogueError':
          setError(msg.message ?? 'An error occurred.');
          break;
        case 'catalogueChanged':
          vscode.postMessage({ type: 'getCatalogue' });
          vscode.postMessage({ type: 'listSkillRepos' });
          break;
        case 'skillRepoList':
          setRepos(msg.repos ?? []);
          break;
        case 'skillRepoProgress':
          setRepoOperation({ slug: msg.slug, status: msg.status, message: msg.message });
          setRepoError(null);
          break;
        case 'skillRepoResult':
          setRepoOperation(null);
          if (msg.success) {
            setNewRepoUrl('');
            setRepoError(null);
          } else {
            setRepoError(msg.error ?? 'Operation failed.');
          }
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Escape closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  // ── Catalogue actions ──────────────────────────────────────────────────────

  const handleToggle = useCallback((name: string, enabled: boolean) => {
    vscode.postMessage({ type: 'toggleSkill', name, enabled });
  }, []);

  const handleDelete = useCallback((folderName: string) => {
    setConfirmDelete(folderName);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!confirmDelete) return;
    vscode.postMessage({ type: 'deleteSkill', name: confirmDelete });
    setConfirmDelete(null);
  }, [confirmDelete]);

  const handleOpenFolder = useCallback((name: string) => {
    vscode.postMessage({ type: 'openSkillFolder', name });
  }, []);

  const handleCreateSkill = useCallback(() => {
    if (!newSkillName.trim()) return;
    vscode.postMessage({ type: 'createSkill', name: newSkillName.trim() });
    setNewSkillName('');
    setShowCreateSkill(false);
  }, [newSkillName]);

  // ── Repo actions ───────────────────────────────────────────────────────────

  const handleAddRepo = useCallback(() => {
    const url = newRepoUrl.trim();
    if (!url) return;
    vscode.postMessage({ type: 'addSkillRepo', url });
  }, [newRepoUrl]);

  const handleSyncRepo = useCallback((slug: string) => {
    vscode.postMessage({ type: 'syncSkillRepo', slug });
  }, []);

  const handleRemoveRepo = useCallback((slug: string) => {
    setConfirmRemoveRepo(slug);
  }, []);

  const handleConfirmRemoveRepo = useCallback(() => {
    if (!confirmRemoveRepo) return;
    vscode.postMessage({ type: 'removeSkillRepo', slug: confirmRemoveRepo });
    setConfirmRemoveRepo(null);
  }, [confirmRemoveRepo]);

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filteredEntries = entries.filter(e => {
    if (search) {
      const q = search.toLowerCase();
      if (!e.name.toLowerCase().includes(q) && !e.description.toLowerCase().includes(q)) return false;
    }
    if (activeTab === 'agents') return e.isAgent;
    if (activeTab === 'skills') return !e.isAgent;
    if (activeTab === 'user') return e.source === 'user';
    return true;
  });

  const userCount = entries.filter(e => e.source === 'user').length;
  const agentCount = entries.filter(e => e.isAgent).length;
  const skillCount = entries.filter(e => !e.isAgent).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="wfl-overlay" onClick={handleOverlayClick}>
      <div className="wfl-modal cat-modal" role="dialog" aria-label="Skill Catalogue">
        {/* Header */}
        <div className="wfl-modal-header">
          <div className="wfl-modal-title">
            <span className="wfl-modal-icon"><Icon name="folder" size={24} /></span>
            <div>
              <h2>Skill Catalogue</h2>
              <p className="wfl-subtitle">{entries.length} skills and agents available</p>
            </div>
          </div>
          <button className="wfl-close-btn" onClick={onClose} title="Close (Esc)"><Icon name="close" size={16} /></button>
        </div>

        {/* Search */}
        <div className="wfl-modal-search">
          <span className="wfl-search-icon"><Icon name="search" size={14} /></span>
          <input
            ref={searchRef}
            type="text"
            className="wfl-search-input"
            placeholder="Search skills and agents…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="wfl-search-clear" onClick={() => setSearch('')} title="Clear search"><Icon name="close" size={12} /></button>
          )}
        </div>

        {/* Tabs */}
        <div className="wfl-modal-tabs" role="tablist">
          {([
            ['all', 'All', entries.length],
            ['agents', 'Agents', agentCount],
            ['skills', 'Skills', skillCount],
            ['user', 'User-Added', userCount],
            ['repos', 'Repositories', repos.length],
          ] as [Tab, string, number][]).map(([tab, label, count]) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={`wfl-tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {label}
              <span className="wfl-tab-count">{count}</span>
            </button>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="cat-error-banner">
            <span><Icon name="risk" size={14} /></span>
            <span>{error}</span>
          </div>
        )}

        {/* Content */}
        <div className="cat-content">
          {activeTab !== 'repos' ? (
            <>
              {/* Create new skill CTA */}
              <div className="cat-actions-bar">
                {!showCreateSkill ? (
                  <button className="cat-create-btn" onClick={() => setShowCreateSkill(true)}>
                    <Icon name="plus" size={14} /> Create New Skill
                  </button>
                ) : (
                  <div className="cat-create-form">
                    <input
                      type="text"
                      className="wfl-search-input"
                      placeholder="skill-folder-name (e.g. my-custom-qa)"
                      value={newSkillName}
                      onChange={e => setNewSkillName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateSkill(); if (e.key === 'Escape') setShowCreateSkill(false); }}
                      autoFocus
                    />
                    <button className="cat-btn cat-btn--primary" onClick={handleCreateSkill} disabled={!newSkillName.trim()}>Create</button>
                    <button className="cat-btn" onClick={() => { setShowCreateSkill(false); setNewSkillName(''); }}>Cancel</button>
                  </div>
                )}
              </div>

              {/* Skill grid */}
              {filteredEntries.length === 0 ? (
                <div className="cat-empty">
                  {search ? `No skills match "${search}"` : 'No skills in this category.'}
                </div>
              ) : (
                <div className="cat-grid">
                  {filteredEntries.map(entry => (
                    <SkillCard
                      key={entry.name}
                      entry={entry}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                      onOpenFolder={handleOpenFolder}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Repos tab */
            <ReposTab
              repos={repos}
              operation={repoOperation}
              error={repoError}
              newRepoUrl={newRepoUrl}
              onNewRepoUrlChange={setNewRepoUrl}
              onAddRepo={handleAddRepo}
              onAddRepoByUrl={(url: string) => vscode.postMessage({ type: 'addSkillRepo', url })}
              onSyncRepo={handleSyncRepo}
              onRemoveRepo={handleRemoveRepo}
              repoUrlRef={repoUrlRef}
            />
          )}
        </div>
      </div>

      {/* Confirm delete skill dialog */}
      {confirmDelete && (
        <ConfirmDialog
          message={`Delete skill "${confirmDelete}"? This cannot be undone.`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
          danger
        />
      )}

      {/* Confirm remove repo dialog */}
      {confirmRemoveRepo && (
        <ConfirmDialog
          message={`Remove repo "${confirmRemoveRepo}" and all skills sourced from it?`}
          onConfirm={handleConfirmRemoveRepo}
          onCancel={() => setConfirmRemoveRepo(null)}
          danger
        />
      )}
    </div>
  );
}

// ─── SkillCard ────────────────────────────────────────────────────────────────

interface SkillCardProps {
  entry: SkillEntry;
  onToggle: (name: string, enabled: boolean) => void;
  onDelete: (name: string) => void;
  onOpenFolder: (name: string) => void;
}

function SkillCard({ entry, onToggle, onDelete, onOpenFolder }: SkillCardProps) {
  const folderName = entry.folderName;

  return (
    <div className={`cat-card${!entry.enabled ? ' cat-card--disabled' : ''}`}>
      <div className="cat-card-top">
        <div className="cat-card-badges">
          {entry.isAgent
            ? <span className="cat-badge cat-badge--agent">Agent</span>
            : <span className="cat-badge cat-badge--skill">Skill</span>}
          {entry.source === 'user' && <span className="cat-badge cat-badge--user">User</span>}
          {entry.repoSlug && <span className="cat-badge cat-badge--repo" title={`From repo: ${entry.repoSlug}`}><Icon name="package" size={10} /> {entry.repoSlug}</span>}
        </div>
        <label className="cat-toggle" title={entry.enabled ? 'Disable' : 'Enable'}>
          <input
            type="checkbox"
            checked={entry.enabled}
            onChange={e => onToggle(folderName, e.target.checked)}
          />
          <span className="cat-toggle-track" />
        </label>
      </div>
      <div className="cat-card-name">{entry.name}</div>
      {entry.description && (
        <div className="cat-card-desc">{entry.description}</div>
      )}
      {entry.source === 'user' && (
        <div className="cat-card-footer">
          <button className="cat-card-action" onClick={() => onOpenFolder(folderName)} title="Open in Explorer">
            <Icon name="folder" size={12} /> Open
          </button>
          <button className="cat-card-action cat-card-action--danger" onClick={() => onDelete(folderName)} title="Delete">
            <Icon name="trash" size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ReposTab ─────────────────────────────────────────────────────────────────

interface ReposTabProps {
  repos: RepoEntry[];
  operation: RepoOperation | null;
  error: string | null;
  newRepoUrl: string;
  onNewRepoUrlChange: (url: string) => void;
  onAddRepo: () => void;
  onAddRepoByUrl: (url: string) => void;
  onSyncRepo: (slug: string) => void;
  onRemoveRepo: (slug: string) => void;
  repoUrlRef: React.RefObject<HTMLInputElement>;
}

// ─── Featured Repos ───────────────────────────────────────────────────────────

const FEATURED_REPOS: { url: string; name: string; description: string; stars: string }[] = [
  {
    url: 'https://github.com/fr33d3m0n/threat-modeling.git',
    name: 'threat-modeling',
    description: 'AI-native 8-phase STRIDE threat modeling, security audit, and penetration test planning (v3.2.0)',
    stars: '285',
  },
];

function ReposTab({ repos, operation, error, newRepoUrl, onNewRepoUrlChange, onAddRepo, onAddRepoByUrl, onSyncRepo, onRemoveRepo, repoUrlRef }: ReposTabProps) {
  const isAdding = operation?.status === 'cloning' && !repos.some(r => r.slug === operation.slug);

  // Filter out already-added featured repos
  const trackedUrls = new Set(repos.map(r => r.url));
  const availableFeatured = FEATURED_REPOS.filter(f => !trackedUrls.has(f.url));

  return (
    <div className="cat-repos">
      {/* Featured repos */}
      {availableFeatured.length > 0 && (
        <div className="cat-repos-featured">
          <div className="cat-repos-add-header">
            <h3>Featured</h3>
            <p>Community skill repos recommended for use with Agile Agent Canvas.</p>
          </div>
          <div className="cat-repos-list">
            {availableFeatured.map(feat => (
              <div key={feat.url} className="cat-repo-card cat-repo-card--featured">
                <div className="cat-repo-card-top">
                  <div className="cat-repo-card-name">{feat.name}</div>
                  <div className="cat-card-badges">
                    <span className="cat-badge cat-badge--featured">Featured</span>
                    <span className="cat-badge cat-badge--skill">{feat.stars} ★</span>
                  </div>
                </div>
                <div className="cat-repo-card-url" title={feat.url}>{feat.url}</div>
                <div className="cat-card-desc">{feat.description}</div>
                <div className="cat-repo-card-actions">
                  <button
                    className="cat-btn cat-btn--primary"
                    onClick={() => onAddRepoByUrl(feat.url)}
                    disabled={!!operation}
                  >
                    <Icon name="plus" size={12} /> Add Repo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add repo form */}
      <div className="cat-repos-add">
        <div className="cat-repos-add-header">
          <h3>Add Skill Repository</h3>
          <p>Clone a git repo containing skill folders (each subfolder with a <code>SKILL.md</code>).</p>
        </div>
        <div className="cat-repos-add-row">
          <input
            ref={repoUrlRef}
            type="text"
            className="wfl-search-input"
            placeholder="https://github.com/org/skill-repo.git"
            value={newRepoUrl}
            onChange={e => onNewRepoUrlChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onAddRepo(); }}
            disabled={!!operation}
          />
          <button
            className="cat-btn cat-btn--primary"
            onClick={onAddRepo}
            disabled={!newRepoUrl.trim() || !!operation}
          >
            {isAdding ? 'Cloning…' : 'Add Repo'}
          </button>
        </div>
        {operation && (
          <div className="cat-progress">
            <span className="cat-spinner" />
            <span>{operation.message}</span>
          </div>
        )}
        {error && (
          <div className="cat-error-banner"><span><Icon name="risk" size={14} /></span><span>{error}</span></div>
        )}
      </div>

      {/* Tracked repos */}
      {repos.length === 0 ? (
        <div className="cat-empty">No skill repos tracked yet. Add one above.</div>
      ) : (
        <div className="cat-repos-list">
          {repos.map(repo => {
            const isBusy = operation?.slug === repo.slug;
            return (
              <div key={repo.slug} className={`cat-repo-card${repo.status === 'error' ? ' cat-repo-card--error' : ''}`}>
                <div className="cat-repo-card-top">
                  <div className="cat-repo-card-name">{repo.name}</div>
                  <div className="cat-card-badges">
                    <span className={`cat-badge cat-badge--status-${repo.status}`}>{repo.status}</span>
                    {repo.skillCount > 0 && (
                      <span className="cat-badge cat-badge--skill">{repo.skillCount} skill{repo.skillCount !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
                <div className="cat-repo-card-url" title={repo.url}>{repo.url}</div>
                {repo.lastSynced && (
                  <div className="cat-repo-card-meta">
                    Last synced: {new Date(repo.lastSynced).toLocaleString()}
                  </div>
                )}
                {isBusy && operation && (
                  <div className="cat-progress"><span className="cat-spinner" /><span>{operation.message}</span></div>
                )}
                <div className="cat-repo-card-actions">
                  <button className="cat-btn" onClick={() => onSyncRepo(repo.slug)} disabled={isBusy}>
                    {isBusy && operation?.status === 'syncing' ? 'Syncing…' : <><Icon name="refresh" size={12} /> Sync</>}
                  </button>
                  <button className="cat-btn cat-btn--danger" onClick={() => onRemoveRepo(repo.slug)} disabled={isBusy}>
                    <Icon name="trash" size={12} /> Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

function ConfirmDialog({ message, onConfirm, onCancel, danger }: ConfirmDialogProps) {
  return (
    <div className="wfl-overlay" style={{ zIndex: 1100 }}>
      <div className="cat-confirm">
        <p className="cat-confirm-message">{message}</p>
        <div className="cat-confirm-actions">
          <button className={`cat-btn${danger ? ' cat-btn--danger' : ' cat-btn--primary'}`} onClick={onConfirm}>Confirm</button>
          <button className="cat-btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
