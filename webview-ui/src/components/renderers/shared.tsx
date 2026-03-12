/**
 * Shared utilities and components used by all DetailPanel renderer groups.
 */
import { useState, useCallback, useMemo, useRef, type ReactNode } from 'react';
import type { Artifact } from '../../types';
import { vscode } from '../../vscodeApi';
import { marked } from 'marked';

// Configure marked for safe, inline-friendly rendering
marked.setOptions({
  gfm: true,
  breaks: true,
});

// ==========================================================================
// RENDERER PROPS — common interface passed to every renderer function
// ==========================================================================

export interface RendererProps {
  editedData: Record<string, any>;
  editMode: boolean;
  handleFieldChange: (field: string, value: any) => void;
  updateArrayItem: (field: string, index: number, value: any) => void;
  removeFromArray: (field: string, index: number) => void;
  addToArray: (field: string, defaultItem: any) => void;
  artifact: Artifact;
  allArtifacts: Artifact[];
}

// ==========================================================================
// MARKDOWN RENDERER (lightweight read-mode markdown)
// ==========================================================================

/** Renders markdown text as formatted HTML. Only used in read mode. */
export function Md({ text, className }: { text: string | undefined | null; className?: string }) {
  // useMemo must always be called (React Rules of Hooks — no conditional hooks)
  const html = useMemo(() => {
    if (!text) return '';
    try {
      return marked.parse(String(text)) as string;
    } catch {
      return String(text);
    }
  }, [text]);
  if (!text) return null;
  return (
    <div
      className={`md-content${className ? ` ${className}` : ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ==========================================================================
// COLLAPSIBLE SECTION
// ==========================================================================

// Persisted collapsed-section state via VS Code webview state API
function getCollapsedSections(): Set<string> {
  try {
    const state = vscode.getState() as Record<string, unknown> | null;
    const arr = (state as any)?.collapsedSections;
    if (Array.isArray(arr)) return new Set(arr as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function persistCollapsedSections(collapsed: Set<string>) {
  try {
    const state = (vscode.getState() as Record<string, unknown>) || {};
    vscode.setState({ ...state, collapsedSections: [...collapsed] });
  } catch { /* ignore */ }
}

export function CollapsibleSection({ title, count, sectionId, children, defaultCollapsed = false, className = '' }: {
  title: string;
  count?: number;
  sectionId: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = getCollapsedSections();
    return stored.has(sectionId) ? true : defaultCollapsed;
  });
  const contentRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      const stored = getCollapsedSections();
      if (next) stored.add(sectionId);
      else stored.delete(sectionId);
      persistCollapsedSections(stored);
      return next;
    });
  }, [sectionId]);

  return (
    <section className={`detail-section collapsible${collapsed ? ' collapsed' : ''}${className ? ` ${className}` : ''}`}>
      <h4 onClick={toggle} className="collapsible-header" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}>
        <span className={`collapse-chevron${collapsed ? ' rotated' : ''}`}>&#9206;</span>
        <span className="collapsible-title">{title}</span>
        {count !== undefined && <span className="section-count">({count})</span>}
      </h4>
      <div ref={contentRef} className={`collapsible-content${collapsed ? ' hidden' : ''}`}>
        {children}
      </div>
    </section>
  );
}

// ==========================================================================
// ARTIFACT PICKER — reusable searchable picker for linking artifacts
// ==========================================================================

type ArtifactPickerMode = 'single' | 'multi';

interface ArtifactPickerProps {
  /** All artifacts available for selection */
  artifacts: Artifact[];
  /** Artifact type to filter by (e.g. 'epic', 'story', 'requirement') */
  artifactType: string;
  /** Current selection — array of IDs for multi, single ID string for single */
  selectedIds: string[];
  /** Callback when selection changes */
  onChange: (ids: string[]) => void;
  /** 'multi' for checkboxes, 'single' for radio buttons */
  mode?: ArtifactPickerMode;
  /** Placeholder for search input */
  placeholder?: string;
  /** Allow typing custom IDs not in the list */
  allowCustom?: boolean;
  /** Exclude specific artifact IDs from the list (e.g. self) */
  excludeIds?: string[];
}

export function ArtifactPicker({
  artifacts,
  artifactType,
  selectedIds,
  onChange,
  mode = 'multi',
  placeholder,
  allowCustom = true,
  excludeIds = [],
}: ArtifactPickerProps) {
  const [search, setSearch] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const available = useMemo(() => {
    const excludeSet = new Set(excludeIds);
    return artifacts
      .filter(a => a.type === artifactType && !excludeSet.has(a.id))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [artifacts, artifactType, excludeIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return available;
    const q = search.toLowerCase();
    return available.filter(a =>
      a.id.toLowerCase().includes(q) || (a.title || '').toLowerCase().includes(q)
    );
  }, [available, search]);

  // IDs in selectedIds that aren't in the available list (manually entered / external)
  const customIds = useMemo(() => {
    const availableSet = new Set(available.map(a => a.id));
    return selectedIds.filter(id => !availableSet.has(id));
  }, [selectedIds, available]);

  const toggleId = useCallback((id: string) => {
    if (mode === 'single') {
      onChange(selectedIds.includes(id) ? [] : [id]);
    } else {
      if (selectedIds.includes(id)) {
        onChange(selectedIds.filter(s => s !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    }
  }, [selectedIds, onChange, mode]);

  const addCustomId = useCallback(() => {
    const id = customInput.trim();
    if (id && !selectedIds.includes(id)) {
      if (mode === 'single') {
        onChange([id]);
      } else {
        onChange([...selectedIds, id]);
      }
    }
    setCustomInput('');
    setShowCustom(false);
  }, [customInput, selectedIds, onChange, mode]);

  const removeCustomId = useCallback((id: string) => {
    onChange(selectedIds.filter(s => s !== id));
  }, [selectedIds, onChange]);

  const inputType = mode === 'single' ? 'radio' : 'checkbox';
  const searchPlaceholder = placeholder || `Search ${artifactType}s...`;

  return (
    <div className="artifact-picker">
      {/* Search */}
      {available.length > 3 && (
        <div className="artifact-picker-search">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="artifact-picker-search-input"
          />
          {search && (
            <button className="artifact-picker-clear" onClick={() => setSearch('')} title="Clear search">&times;</button>
          )}
        </div>
      )}

      {/* Checklist */}
      <div className="artifact-picker-list">
        {filtered.length > 0 ? filtered.map(a => {
          const isSelected = selectedIds.includes(a.id);
          return (
            <label key={a.id} className={`artifact-picker-item${isSelected ? ' selected' : ''}`}>
              <input
                type={inputType}
                name={mode === 'single' ? 'artifact-picker-radio' : undefined}
                checked={isSelected}
                onChange={() => toggleId(a.id)}
              />
              <span className="artifact-picker-id">{a.id}</span>
              <span className="artifact-picker-title">{a.title || 'Untitled'}</span>
              <span className={`artifact-picker-status status-${a.status}`}>{a.status}</span>
            </label>
          );
        }) : (
          <p className="empty-message">
            {search ? `No ${artifactType}s matching "${search}"` : `No ${artifactType}s available`}
          </p>
        )}
      </div>

      {/* Custom IDs (external / not in workspace) */}
      {customIds.length > 0 && (
        <div className="artifact-picker-custom-ids">
          {customIds.map(id => (
            <span key={id} className="artifact-picker-custom-tag">
              {id}
              <button className="artifact-picker-custom-remove" onClick={() => removeCustomId(id)} title="Remove">&times;</button>
            </span>
          ))}
        </div>
      )}

      {/* Add custom ID */}
      {allowCustom && (
        <div className="artifact-picker-add-custom">
          {showCustom ? (
            <div className="artifact-picker-custom-input-row">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomId(); } if (e.key === 'Escape') { e.stopPropagation(); setShowCustom(false); setCustomInput(''); } }}
                placeholder={`Type ${artifactType} ID...`}
                className="artifact-picker-custom-input"
                autoFocus
              />
              <button className="btn btn-secondary btn-small" onClick={addCustomId}>Add</button>
              <button className="btn btn-secondary btn-small" onClick={() => { setShowCustom(false); setCustomInput(''); }}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn-secondary btn-small" onClick={() => setShowCustom(true)}>
              + Add by ID
             </button>
          )}
        </div>
      )}
    </div>
  );
}
