import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from './Icon';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SprintStatusData {
  found: false;
  loading?: boolean;
}

export interface SprintGroup {
  id: string;           // e.g. "sprint_1", "mvp"
  label: string;        // "Sprint 1" or the id prettified
  goal?: string;
  startDate?: string;
  endDate?: string;
  storyKeys: string[];  // keys from development_status
}

export interface SprintStatusLoaded {
  found: true;
  project?: string;
  projectKey?: string;
  trackingSystem?: string;
  generated?: string;
  storyLocation?: string;
  items: SprintItem[];
  sprints?: SprintGroup[]; // undefined = no sprints section → flat mode
}

export type SprintData = SprintStatusData | SprintStatusLoaded;

export interface SprintItem {
  key: string;
  status: SprintStatus;
  epicKey: string | null; // null = it IS an epic or retro
  isEpic: boolean;
  isRetro: boolean;
  /** story status is active but parent epic is backlog → CONSISTENCY ERROR */
  consistencyError?: boolean;
  /** story is done but parent epic is still backlog → CONSISTENCY WARNING */
  consistencyWarning?: boolean;
}

export type SprintStatus =
  | 'backlog'
  | 'ready-for-dev'
  | 'in-progress'
  | 'review'
  | 'done'
  | 'optional'
  // Rich statuses from story/epic JSON — mapped to Kanban columns by normalizeStatus()
  | 'draft'
  | 'ready'
  | 'in-review'
  | 'ready-for-review'
  | 'blocked'
  | 'complete'
  | 'completed'
  | 'approved'
  | 'archived'
  | 'implementing'
  | 'not-started'
  | 'proposed'
  | 'accepted'
  | 'deprecated'
  | 'superseded'
  | 'rejected'
  | 'drafted'     // legacy alias → ready-for-dev
  | 'contexted';  // legacy alias → in-progress

// ─── Constants ────────────────────────────────────────────────────────────────

export const STATUS_COLUMNS: { key: NormalizedStatus; label: string; accent: string }[] = [
  { key: 'backlog',        label: 'Backlog',       accent: 'var(--vscode-descriptionForeground)' },
  { key: 'ready-for-dev', label: 'Ready for Dev',  accent: '#6366f1' },
  { key: 'in-progress',   label: 'In Progress',    accent: '#f59e0b' },
  { key: 'review',        label: 'Review',         accent: '#8b5cf6' },
  { key: 'done',          label: 'Done',           accent: '#22c55e' },
];

// Retrospectives get their own column
export const RETRO_COLUMN = { key: 'optional', label: 'Retrospective', accent: '#64748b' };

type NormalizedStatus = 'backlog' | 'ready-for-dev' | 'in-progress' | 'review' | 'done' | 'optional';

const UNSCHEDULED_ID = '__unscheduled__';

/**
 * Maps any SprintStatus to one of the 5 Kanban columns (+ optional for retros).
 * Rich story/epic statuses are grouped into the most appropriate column.
 */
function normalizeStatus(s: SprintStatus): NormalizedStatus {
  switch (s) {
    // ── Backlog column ──
    case 'backlog':
    case 'draft':
    case 'not-started':
    case 'proposed':
      return 'backlog';

    // ── Ready for Dev column ──
    case 'ready-for-dev':
    case 'ready':
    case 'accepted':
    case 'approved':
    case 'drafted': // legacy
      return 'ready-for-dev';

    // ── In Progress column ──
    case 'in-progress':
    case 'implementing':
    case 'blocked':     // blocked stories are still active/in-progress
    case 'contexted':   // legacy
      return 'in-progress';

    // ── Review column ──
    case 'review':
    case 'in-review':
    case 'ready-for-review':
      return 'review';

    // ── Done column ──
    case 'done':
    case 'complete':
    case 'completed':
    case 'archived':
    case 'deprecated':
    case 'superseded':
    case 'rejected':
      return 'done';

    // ── Retrospective column ──
    case 'optional':
      return 'optional';

    default:
      return 'backlog';
  }
}

function prettifySprintId(id: string): string {
  // "sprint_1" → "Sprint 1", "mvp" → "MVP", "beta_launch" → "Beta Launch"
  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bMvp\b/i, 'MVP')
    .replace(/\bApi\b/i, 'API');
}

/**
 * Parse the epic key from an item key.
 * Patterns:
 *  - epic-N              → epic-N   (IS the epic)
 *  - N-M-kebab-title     → epic-N   (story)
 *  - epic-N-retrospective→ epic-N   (retro)
 */
function parseEpicKey(key: string): string | null {
  if (/^epic-\d+$/.test(key)) return key;                     // epic itself
  if (/^epic-\d+-retrospective$/.test(key)) return key.replace(/-retrospective$/, ''); // retro
  const storyMatch = key.match(/^(\d+)-\d+-.+/);
  if (storyMatch) return `epic-${storyMatch[1]}`;
  return null;
}

// ─── YAML parser ──────────────────────────────────────────────────────────────

export function parseSprintStatusYaml(yaml: string): Omit<SprintStatusLoaded, 'found'> {
  const lines = yaml.split('\n');
  let project: string | undefined;
  let projectKey: string | undefined;
  let trackingSystem: string | undefined;
  let generated: string | undefined;
  let storyLocation: string | undefined;
  const items: SprintItem[] = [];
  const sprints: SprintGroup[] = [];

  type Section = 'none' | 'devStatus' | 'sprints' | 'sprintBody';
  let section: Section = 'none';
  let currentSprint: SprintGroup | null = null;
  let inStoriesList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line || line.startsWith('#')) continue;

    // ── Detect top-level section headers ─────────────────────────────────────
    if (/^development_status:\s*$/.test(line)) {
      section = 'devStatus';
      continue;
    }
    if (/^sprints:\s*$/.test(line)) {
      // Commit any in-progress sprint
      if (currentSprint) { sprints.push(currentSprint); currentSprint = null; }
      section = 'sprints';
      inStoriesList = false;
      continue;
    }

    // ── development_status entries ────────────────────────────────────────────
    if (section === 'devStatus') {
      // A non-indented line that isn't a comment ends the section
      if (line.match(/^\S/) && !line.startsWith('  ')) { section = 'none'; }

      const m = line.match(/^\s{2}([^:]+):\s*(.+)$/);
      if (m) {
        const key = m[1].trim();
        const status = m[2].trim().replace(/"/g, '') as SprintStatus;
        const isEpic = /^epic-\d+$/.test(key);
        const isRetro = /^epic-\d+-retrospective$/.test(key);
        const epicKey = parseEpicKey(key);
        items.push({ key, status, epicKey: isEpic ? null : epicKey, isEpic, isRetro });
        continue;
      }
    }

    // ── sprints: section ─────────────────────────────────────────────────────
    if (section === 'sprints') {
      // New sprint id at 2-space indent: "  sprint_1:"
      const sprintIdMatch = line.match(/^  ([^:\s][^:#]*):\s*$/);
      if (sprintIdMatch) {
        if (currentSprint) { sprints.push(currentSprint); }
        const id = sprintIdMatch[1].trim();
        currentSprint = { id, label: prettifySprintId(id), storyKeys: [] };
        inStoriesList = false;
        continue;
      }

      if (currentSprint) {
        // goal:
        const goalMatch = line.match(/^\s{4}goal:\s*["']?(.+?)["']?\s*$/);
        if (goalMatch) { currentSprint.goal = goalMatch[1]; continue; }

        // start_date / end_date
        const startMatch = line.match(/^\s{4}start_date:\s*["']?(.+?)["']?\s*$/);
        if (startMatch) { currentSprint.startDate = startMatch[1]; continue; }
        const endMatch = line.match(/^\s{4}end_date:\s*["']?(.+?)["']?\s*$/);
        if (endMatch) { currentSprint.endDate = endMatch[1]; continue; }

        // stories:
        if (/^\s{4}stories:\s*$/.test(line)) { inStoriesList = true; continue; }

        // - story-key list items
        if (inStoriesList) {
          const itemMatch = line.match(/^\s{6}-\s+(.+)$/);
          if (itemMatch) { currentSprint.storyKeys.push(itemMatch[1].trim()); continue; }
          // 4-space key inside sprint (non-list) → stop list
          if (/^\s{4}\S/.test(line)) { inStoriesList = false; }
        }
      }
      continue;
    }

    // ── Top-level scalar fields (outside devStatus/sprints sections) ──────────
    if (section === 'none') {
      const scalar = line.match(/^([^:]+):\s*(.+)$/);
      if (scalar) {
        const k = scalar[1].trim();
        const v = scalar[2].trim().replace(/^"|"$/g, '');
        if (k === 'project') project = v;
        else if (k === 'project_key') projectKey = v;
        else if (k === 'tracking_system') trackingSystem = v;
        else if (k === 'generated') generated = v;
        else if (k === 'story_location') storyLocation = v;
      }
    }
  }

  // Commit last sprint
  if (currentSprint) sprints.push(currentSprint);

  // Build epic status map for consistency checks
  const epicStatusMap = new Map<string, SprintStatus>();
  for (const item of items) {
    if (item.isEpic && item.key) {
      epicStatusMap.set(item.key, item.status);
    }
  }

  return {
    project,
    projectKey,
    trackingSystem,
    generated,
    storyLocation,
    items: items.map(item => {
      if (item.isEpic || item.isRetro || !item.epicKey) return item;
      const epicStatus = epicStatusMap.get(item.epicKey);
      if (!epicStatus || epicStatus !== 'backlog') return item;
      const ns = normalizeStatus(item.status);
      if (ns === 'in-progress' || ns === 'review' || ns === 'ready-for-dev') {
        return { ...item, consistencyError: true };
      }
      if (ns === 'done') {
        return { ...item, consistencyWarning: true };
      }
      return item;
    }),
    sprints: sprints.length > 0 ? sprints : undefined,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface KanbanCardProps { item: SprintItem; index?: number }

function KanbanCard({ item, index }: KanbanCardProps) {
  const epicLabel = item.epicKey ?? (item.isEpic ? item.key : null);
  return (
    <div 
      className={[
        'sprint-card',
        item.isEpic ? 'sprint-card--epic' : '',
        item.isRetro ? 'sprint-card--retro' : '',
        item.consistencyError ? 'sprint-card--error' : '',
        item.consistencyWarning ? 'sprint-card--warn' : '',
      ].filter(Boolean).join(' ')}
      style={index !== undefined ? { '--card-index': index } as React.CSSProperties : undefined}
    >
      <span className="sprint-card-key">{item.key}</span>
      {epicLabel && !item.isEpic && (
        <span className="sprint-card-epic-tag">{epicLabel}</span>
      )}
      {item.isEpic && <span className="sprint-card-type-tag">Epic</span>}
      {item.isRetro && <span className="sprint-card-type-tag">Retro</span>}
      {item.consistencyError && (
        <span className="sprint-card-consistency-badge sprint-card-consistency-badge--error" title={`Status inconsistency: story is ${item.status} but ${item.epicKey} is backlog`}>
          ⚠ Epic not started
        </span>
      )}
      {item.consistencyWarning && (
        <span className="sprint-card-consistency-badge sprint-card-consistency-badge--warn" title={`${item.epicKey} is still backlog despite this story being done`}>
          ↑ Promote epic
        </span>
      )}
    </div>
  );
}

interface KanbanColumnProps {
  label: string;
  accent: string;
  items: SprintItem[];
}

function KanbanColumn({ label, accent, items }: KanbanColumnProps) {
  return (
    // eslint-disable-next-line react/forbid-component-props -- dynamic accent color from data
    <div className="sprint-column" style={{ '--sprint-col-accent': accent } as React.CSSProperties}>
      <div className="sprint-column-header">
        <span className="sprint-column-label">{label}</span>
        <span className="sprint-column-count">{items.length}</span>
      </div>
      <div className="sprint-column-cards">
        {items.length === 0 ? (
          <div className="sprint-column-empty">—</div>
        ) : (
          items.map((item, idx) => <KanbanCard key={item.key} item={item} index={idx} />)
        )}
      </div>
    </div>
  );
}

// ─── Sprint board renderer (status columns for a given set of items) ──────────

function SprintBoard({ items }: { items: SprintItem[] }) {
  const allColumns = [...STATUS_COLUMNS, RETRO_COLUMN];
  const grouped = new Map<string, SprintItem[]>();
  allColumns.forEach(c => grouped.set(c.key, []));

  for (const item of items) {
    const ns = normalizeStatus(item.status);
    const colKey: string = item.isRetro ? 'optional' : ns;
    const bucket = grouped.get(colKey);
    if (bucket) bucket.push(item);
  }

  return (
    <div className="sprint-board">
      {allColumns.map(col => (
        <KanbanColumn
          key={col.key}
          label={col.label}
          accent={col.accent}
          items={grouped.get(col.key) ?? []}
        />
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface SprintPlanningViewProps {
  data: SprintData;
  onClose: () => void;
  onRunSprintPlanning: () => void;
}

export function SprintPlanningView({ data, onClose, onRunSprintPlanning }: SprintPlanningViewProps) {
  const [activeSprintId, setActiveSprintId] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Check overflow state
  const updateScrollState = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateScrollState); ro.disconnect(); };
  }, [data, updateScrollState]);

  const scrollTabs = useCallback((dir: 'left' | 'right') => {
    const el = tabsRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  // Reset active sprint when data changes
  useEffect(() => {
    setActiveSprintId(null);
  }, [data]);

  const renderContent = () => {
    // Loading state
    if (!data.found && data.loading) {
      return (
        <div className="sprint-empty-state">
          <Icon name="refresh" size={40} />
          <p className="sprint-empty-title">Loading sprint plan…</p>
        </div>
      );
    }

    // Not found / empty state
    if (!data.found) {
      return (
        <div className="sprint-empty-state">
          <Icon name="sprint" size={48} className="sprint-empty-icon" />
          <p className="sprint-empty-title">No sprint plan found</p>
          <p className="sprint-empty-desc">
            Run the <strong>sprint-planning</strong> workflow to generate a{' '}
            <code>sprint-status.yaml</code> file for your project.
          </p>
          <button className="sprint-run-btn" onClick={onRunSprintPlanning}>
            <Icon name="rocket" size={16} />
            Run Sprint Planning
          </button>
        </div>
      );
    }

    const { items, sprints } = data;

    // ── Flat mode (no sprints section) ────────────────────────────────────────
    if (!sprints || sprints.length === 0) {
      return (
        <>
          <SprintMeta data={data} />
          <div className="sprint-no-sprints-notice">
            <Icon name="sprint" size={14} />
            No sprint groupings found — showing all items. Re-run <strong>sprint-planning</strong> to generate goal-based sprints.
          </div>
          <SprintBoard items={items} />
        </>
      );
    }

    // ── Sprint tab mode ───────────────────────────────────────────────────────

    // Build a set of all scheduled keys
    const scheduledKeys = new Set(sprints.flatMap(s => s.storyKeys));
    const unscheduledItems = items.filter(i => !scheduledKeys.has(i.key));

    // All tab descriptors (sprints + optional unscheduled)
    const tabs = [
      ...sprints,
      ...(unscheduledItems.length > 0
        ? [{ id: UNSCHEDULED_ID, label: 'Unscheduled', goal: 'Stories not assigned to any sprint', storyKeys: [] }]
        : []),
    ];

    // Default to first tab
    const effectiveActiveId = activeSprintId ?? tabs[0]?.id ?? null;
    const activeSprint = tabs.find(t => t.id === effectiveActiveId) ?? tabs[0];

    // Items to show in the active sprint
    let boardItems: SprintItem[];
    if (effectiveActiveId === UNSCHEDULED_ID) {
      boardItems = unscheduledItems;
    } else {
      const keySet = new Set(activeSprint?.storyKeys ?? []);
      boardItems = items.filter(i => keySet.has(i.key));
    }

    const activeSprint_full = sprints.find(s => s.id === effectiveActiveId);

    return (
      <>
        <SprintMeta data={data} />

        {/* Sprint tab bar with scroll arrows */}
        <div className={`sprint-tabs-wrapper${canScrollLeft ? ' can-scroll-left' : ''}${canScrollRight ? ' can-scroll-right' : ''}`}>
          {canScrollLeft && (
            <button className="sprint-tabs-arrow sprint-tabs-arrow--left" onClick={() => scrollTabs('left')} aria-label="Scroll tabs left">
              ‹
            </button>
          )}
          <div className="sprint-tabs" role="tablist" ref={tabsRef}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={tab.id === effectiveActiveId ? 'true' : 'false'}
                className={`sprint-tab${tab.id === effectiveActiveId ? ' sprint-tab--active' : ''}${tab.id === UNSCHEDULED_ID ? ' sprint-tab--unscheduled' : ''}`}
                onClick={() => setActiveSprintId(tab.id)}
              >
                {tab.label}
                {tab.id !== UNSCHEDULED_ID && (
                  <span className="sprint-tab-count">{tab.storyKeys.length}</span>
                )}
                {tab.id === UNSCHEDULED_ID && (
                  <span className="sprint-tab-count">{unscheduledItems.length}</span>
                )}
              </button>
            ))}
          </div>
          {canScrollRight && (
            <button className="sprint-tabs-arrow sprint-tabs-arrow--right" onClick={() => scrollTabs('right')} aria-label="Scroll tabs right">
              ›
            </button>
          )}
        </div>

        {/* Active sprint goal */}
        {activeSprint?.goal && (
          <div className="sprint-goal">
            <Icon name="rocket" size={13} />
            <span>{activeSprint.goal}</span>
            {activeSprint_full?.startDate && activeSprint_full?.endDate && (
              <span className="sprint-goal-dates">
                {activeSprint_full.startDate} → {activeSprint_full.endDate}
              </span>
            )}
          </div>
        )}

        {/* Kanban board for active sprint */}
        <SprintBoard items={boardItems} />
      </>
    );
  };

  const title = data.found ? (data.project ?? 'Sprint Plan') : 'Sprint Plan';

  return (
    <div className="sprint-overlay" onClick={onClose}>
      <div className="sprint-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sprint-header">
          <div className="sprint-header-left">
            <Icon name="sprint" size={20} />
            <h2 className="sprint-title">{title}</h2>
          </div>
          <button className="sprint-close-btn" onClick={onClose} title="Close" aria-label="Close sprint view">
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="sprint-body">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

// ─── SprintMeta helper ────────────────────────────────────────────────────────

function SprintMeta({ data }: { data: SprintStatusLoaded }) {
  return (
    <div className="sprint-meta">
      {data.project && <span className="sprint-meta-item"><strong>Project:</strong> {data.project}</span>}
      {data.trackingSystem && data.trackingSystem !== 'file-system' && (
        <span className="sprint-meta-item"><strong>Tracker:</strong> {data.trackingSystem}</span>
      )}
      {data.generated && <span className="sprint-meta-item"><strong>Generated:</strong> {data.generated}</span>}
      {data.storyLocation && (
        <span className="sprint-meta-item sprint-meta-path" title={data.storyLocation}>
          <strong>Stories:</strong> {data.storyLocation}
        </span>
      )}
    </div>
  );
}
