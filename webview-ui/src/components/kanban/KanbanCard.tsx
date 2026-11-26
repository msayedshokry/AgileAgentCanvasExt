import type { KanbanItem } from './KanbanTypes';
import { vscode } from '../../vscodeApi';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useEvent } from '../../agentic-kanban/useEvent';
import { getAvatarColor, getInitials } from '../../agentic-kanban/kanban-helpers';

// ─── KanbanCard ───────────────────────────────────────────────────────────────
// Shared presentational card used by SprintPlanningView (read-only) and
// AgenticKanban (DnD + agent overlays). Supports optional drag-and-drop via
// the HTML5 Drag and Drop API (dataTransfer).

interface KanbanCardProps {
  item: KanbanItem;
  index?: number;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, item: KanbanItem) => void;
  onClick?: (item: KanbanItem, e?: React.MouseEvent) => void;
  className?: string;
  /** Artifact ID whose Resume is in progress — shows spinner badge */
  resumingArtifactId?: string | null;
  /** Quick Win 3: roving tabindex — column controls which card is focusable */
  cardTabIndex?: number;
  /** Quick Win 4: dimmed card when search filter doesn't match */
  dimmed?: boolean;
  /** Feature 1: show expand/collapse chevron for epics with children */
  hasChildren?: boolean;
  /** Feature 1: whether this epic's children are expanded */
  isExpanded?: boolean;
  /** Feature 1: toggle expand/collapse for this epic */
  onToggleEpic?: (epicId: string) => void;
  /** Feature 1: child story card (indented, smaller) */
  isChild?: boolean;
  /** Feature 3: right-click context menu handler */
  onContextMenu?: (e: React.MouseEvent, item: KanbanItem) => void;
  /** Advanced Feature 1: multi-select — whether this card is selected */
  isSelected?: boolean;
  /** Advanced Feature 1: multi-select — count badge on drag ghost */
  selectedCount?: number;
  /** Advanced Feature 2: inline editing — whether this card is being edited */
  isEditing?: boolean;
  /** Advanced Feature 2: inline editing — start editing (double-click) */
  onStartEdit?: (item: KanbanItem) => void;
  /** Advanced Feature 2: inline editing — submit new title */
  onSubmitEdit?: (artifactId: string, newTitle: string) => void;
  /** Advanced Feature 2: inline editing — cancel */
  onCancelEdit?: () => void;
  /** Start an agent on this card (shown on ready cards). */
  onStart?: (item: KanbanItem) => void;
  /** Stop the agent working on this card (shown while it runs or waits). */
  onStop?: (item: KanbanItem) => void;
}

const STARTABLE = new Set(['backlog', 'ready-for-dev', 'ready', 'draft']);

/** What the card offers as its one action: Start when it can run, Stop while an agent has it. */
export function cardAction(item: KanbanItem): 'start' | 'stop' | undefined {
  const s = item.agentState?.status;
  if (s === 'running' || s === 'queued') return 'stop';
  if (item.lockInfo?.locked || item.assignee?.person) return undefined;
  return STARTABLE.has(item.status) ? 'start' : undefined;
}

/** Small ring showing how many of an epic's stories are done. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 6;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? done / total : 0;
  return (
    <svg className="kanban-card-ring" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r={r} className="kanban-card-ring-track" />
      <circle cx="8" cy="8" r={r} className="kanban-card-ring-fill" strokeDasharray={`${c * frac} ${c}`} transform="rotate(-90 8 8)" />
    </svg>
  );
}

// Used to disambiguate single-click from double-click without setTimeout.
// We compare timestamps instead: a double-click fires ~250ms after the
// first click on most platforms. If the second click arrives within that
// window we suppress the single-click handler entirely.
const DOUBLE_CLICK_WINDOW_MS = 250;

export function KanbanCard({ item, index, draggable, onDragStart, onClick, className, resumingArtifactId, cardTabIndex, dimmed, hasChildren, isExpanded, onToggleEpic, isChild, onContextMenu, isSelected, selectedCount, isEditing, onStartEdit, onSubmitEdit, onCancelEdit, onStart, onStop }: KanbanCardProps) {
  const isLocked = item.lockInfo?.locked;
  const isRunning = item.agentState?.status === 'running';
  const isQueued = item.agentState?.status === 'queued';
  const isInterrupted = item.agentState?.status === 'interrupted';
  const hasTerminal = !!item.agentState?.terminalId;

  const [editValue, setEditValue] = useState(item.title);
  const editInputRef = useRef<HTMLInputElement>(null);
  // Guard against Enter + onBlur firing doSubmit twice.
  const submittedRef = useRef(false);
  // Drag ghost badge: only show during the active drag, not on every selected card.
  const [isDragging, setIsDragging] = useState(false);
  // Timestamp of the last click. Used to suppress single-click when followed
  // quickly by a double-click (a much cheaper heuristic than setTimeout).
  const lastClickTimeRef = useRef(0);

  useEffect(() => {
    if (isEditing) {
      setEditValue(item.title);
      submittedRef.current = false;
      requestAnimationFrame(() => editInputRef.current?.focus());
    }
  }, [isEditing, item.title]);

  const doSubmit = useCallback((trimmed: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (trimmed && trimmed !== item.title) {
      onSubmitEdit?.(item.id, trimmed);
    } else {
      onCancelEdit?.();
    }
  }, [item.id, item.title, onSubmitEdit, onCancelEdit]);

  // ── Handlers (useEvent: stable identity, latest closure) ─────────────────
  // These were previously inline arrow functions in the JSX, recreated on
  // every render. With useEvent, function identity is stable so React can
  // skip re-attaching event listeners on parent re-renders, while the
  // closures always read the latest props/state.

  const handleEditKeyDown = useEvent((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Stop propagation so the card's Enter handler doesn't also open the detail panel.
      e.stopPropagation();
      doSubmit(editValue.trim());
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelEdit?.();
    }
  });

  // DnD: sets dataTransfer, notifies the parent, and flips isDragging so the
  // ghost badge can render. All three concerns always fire together, so they
  // share a single handler.
  const handleDragStart = useEvent((e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(e, item);
    setIsDragging(true);
  });

  // Card click: disambiguates single-click from double-click using timestamps.
  // The ref tracks the last click time; the function identity is stable.
  const handleCardClick = useEvent((e: React.MouseEvent) => {
    const now = e.timeStamp;
    if (now - lastClickTimeRef.current < DOUBLE_CLICK_WINDOW_MS) {
      return; // onDoubleClick will fire; skip single-click
    }
    lastClickTimeRef.current = now;
    onClick?.(item, e);
  });

  const handleCardDoubleClick = useEvent((e: React.MouseEvent) => {
    e.stopPropagation();
    onStartEdit?.(item);
  });

  const handleCardContextMenu = useEvent((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(e, item);
  });

  // Keyboard accessible: Enter/Space opens the detail panel. The card is in
  // the tab order, so this is the keyboard equivalent of a mouse click.
  const handleKeyDown = useEvent((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(item);
    }
  });

  // Sub-element handlers (edit input, chevron, terminal badge). useEvent
  // keeps these stable across renders so React can skip re-attaching the
  // listeners when the card re-renders due to other state changes.
  const handleEditBlur = useEvent(() => doSubmit(editValue.trim()));
  const handleEditClick = useEvent((e: React.MouseEvent) => e.stopPropagation());
  const handleChevronClick = useEvent((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleEpic?.(item.id);
  });
  const handleTerminalClick = useEvent((e: React.MouseEvent) => {
    e.stopPropagation();
    vscode.postMessage({ type: 'kanban:jumpToTerminal', artifactId: item.id });
  });

  const action = (onStart || onStop) && !isEditing ? cardAction(item) : undefined;
  const handleActionClick = useEvent((e: React.MouseEvent) => {
    e.stopPropagation();
    if (action === 'start') onStart?.(item);
    else if (action === 'stop') onStop?.(item);
  });
  const failure = item.agentState?.failure;
  const waitingForAgent = isQueued && item.agentState?.agentRole?.startsWith('Waiting for ');
  const epicLabel = item.epicTitle ?? item.epicKey;

  return (
    <div
      className={[
        'kanban-card',
        item.isEpic ? 'kanban-card--epic' : '',
        isLocked ? 'kanban-card--locked' : '',
        isRunning ? 'kanban-card--running' : '',
        isQueued ? 'kanban-card--queued' : '',
        isInterrupted ? 'kanban-card--interrupted' : '',
        isChild ? 'kanban-card--child' : '',
        isSelected ? 'kanban-card--selected' : '',
        isEditing ? 'kanban-card--editing' : '',
        className || '',
      ].filter(Boolean).join(' ')}
      style={{ ...(index !== undefined ? { '--card-index': index } as React.CSSProperties : {}), ...(dimmed ? { opacity: 0.35 } : {}) }}
      draggable={draggable && !isLocked && !isEditing}
      tabIndex={cardTabIndex ?? 0}
      role="button"
      aria-label={`${item.title} — ${item.status}, press Enter to open detail`}
      onDragStart={handleDragStart}
      onDragEnd={() => setIsDragging(false)}
      onKeyDown={handleKeyDown}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
      onContextMenu={handleCardContextMenu}
    >
      {/* Drag ghost count badge: only visible while this card is the active drag source. */}
      {isDragging && (selectedCount ?? 0) > 1 && (
        <span className="kanban-drag-ghost-badge">{selectedCount}</span>
      )}

      {/* Head: id, then what an agent is doing with the card right now. */}
      <div className="kanban-card-head">
        {item.isEpic && hasChildren && (
          <button
            className={`kanban-card-epic-chevron${isExpanded ? ' kanban-card-epic-chevron--expanded' : ''}`}
            onClick={handleChevronClick}
            aria-label={isExpanded ? 'Collapse epic' : 'Expand epic'}
            aria-expanded={isExpanded}
            tabIndex={-1}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
        {item.isEpic && (
          <svg className="kanban-card-epic-icon" width="12" height="12" viewBox="0 0 12 12" role="img" aria-label="Epic">
            <title>Epic</title>
            <rect x="1.5" y="4.5" width="9" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3 3h6M4.5 1.5h3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        )}
        <span className="kanban-card-key">{item.key}</span>
        {isRunning && <span className="kanban-card-activity kanban-card-activity--running" role="img" aria-label="Agent working" title="Agent working" />}
        {isQueued && <span className="kanban-card-activity kanban-card-activity--queued" role="img" aria-label="Waiting to start" title="Waiting to start" />}
        {isInterrupted && <span className="kanban-card-activity kanban-card-activity--stopped" role="img" aria-label="Needs you" title="Needs you" />}
        {action && (
          <button
            className={`kanban-card-action kanban-card-action--${action}`}
            onClick={handleActionClick}
            aria-label={action === 'start' ? `Start an agent on ${item.title}` : `Stop the agent on ${item.title}`}
          >
            {action === 'start' ? 'Start' : 'Stop'}
          </button>
        )}
      </div>

      {isEditing ? (
        <input
          ref={editInputRef}
          className="kanban-card-edit-input"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleEditKeyDown}
          onBlur={handleEditBlur}
          onClick={handleEditClick}
          aria-label="Edit card title"
        />
      ) : (
        <span className="kanban-card-title">{item.title}</span>
      )}

      {/* What needs saying about this card now: at most one line. */}
      {resumingArtifactId === item.id ? (
        <span className="kanban-card-agent-badge kanban-card-agent-badge--resuming">
          <span className="kanban-card-resume-spinner" />
          Reconnecting…
        </span>
      ) : isInterrupted ? (
        <span className="kanban-card-agent-badge kanban-card-agent-badge--interrupted" title={failure?.detail}>
          {failure ? failure.title : `Interrupted — ${item.agentState?.agentRole ?? 'Agent'}`}
        </span>
      ) : isQueued ? (
        <span className="kanban-card-agent-badge kanban-card-agent-badge--queued">
          {/* "Waiting for Dev (1 of 1 busy)" when the card waits for its agent's capacity. */}
          {waitingForAgent ? item.agentState!.agentRole : 'Starting…'}
        </span>
      ) : isRunning ? (
        hasTerminal ? (
          <button
            className="kanban-card-progress kanban-card-progress--link"
            onClick={handleTerminalClick}
            title={`${item.progressLine ?? 'Working'} — open the agent's terminal`}
          >
            {item.progressLine ?? `${item.agentState?.agentRole ?? 'Agent'} is working…`}
          </button>
        ) : (
          <span className="kanban-card-progress" title={item.progressLine}>
            {item.progressLine ?? `${item.agentState?.agentRole ?? 'Agent'} is working…`}
          </span>
        )
      ) : null}

      {/* Chips: where the card belongs and anything blocking it. */}
      {(epicLabel && !item.isEpic) || isLocked || (item.blockedBy ?? 0) > 0 || item.harnessResults?.some(r => !r.passed && r.severity === 'blocking') ? (
        <div className="kanban-card-chips">
          {epicLabel && !item.isEpic && (
            <span className="kanban-card-epic-tag" title={item.epicKey}>{epicLabel}</span>
          )}
          {(item.blockedBy ?? 0) > 0 && (
            <span
              className={`kanban-card-dep-badge${item.hasCycle ? ' kanban-card-dep-badge--cycle' : ''}`}
              title={
                item.hasCycle
                  ? `Circular dependency: blocked by ${item.blockedBy} story(ies) including ${(item.blockerTitles ?? []).slice(0, 3).join(', ')}`
                  : `Blocked by: ${(item.blockerTitles ?? []).slice(0, 3).join(', ')}${(item.blockerTitles?.length ?? 0) > 3 ? '…' : ''}`
              }
              aria-label={`Blocked by ${item.blockedBy} ${item.hasCycle ? 'in a circular dependency' : 'stories'}`}
            >
              Blocked by {item.blockedBy}
            </span>
          )}
          {item.harnessResults?.some(r => !r.passed && r.severity === 'blocking') && (
            <span className="kanban-card-harness-badge kanban-card-harness-badge--error">Policy failed</span>
          )}
          {isLocked && (
            <span className="kanban-card-lock-badge" title={`Locked by ${item.lockInfo?.agentName ?? 'unknown'}`}>
              {item.lockInfo?.agentName ? `Locked: ${item.lockInfo.agentName}` : 'Locked'}
            </span>
          )}
        </div>
      ) : null}

      {/* Foot: who has it, and an epic's progress. */}
      {(item.assignee || item.childProgress || item.leadProgress) && (
        <div className="kanban-card-foot">
          {item.assignee ? (
            <span
              className={`kanban-card-assignee${item.assignee.person ? ' kanban-card-assignee--person' : ''}`}
              title={item.assignee.person ? `Assigned to ${item.assignee.name} (a person; no agent runs it)` : `Assigned to ${item.assignee.name}`}
            >
              <span
                className="kanban-card-avatar"
                style={{ '--avatar-color': getAvatarColor(item.assignee.name) } as React.CSSProperties}
                aria-hidden="true"
              >
                {getInitials(item.assignee.name)}
              </span>
              <span className="kanban-card-assignee-name">
                <span className="visually-hidden">Assigned to </span>{item.assignee.name}
                {item.assignee.person && <span className="visually-hidden">, a person</span>}
              </span>
            </span>
          ) : <span />}
          <span className="kanban-card-foot-end">
            {(item.leadProgress ?? item.childProgress) && (() => {
              const p = (item.leadProgress ?? item.childProgress)!;
              return (
                <span
                  className="kanban-card-lead"
                  title={item.leadProgress ? `${item.leadProgress.lead} plans this epic and hands its stories out` : `${p.done} of ${p.total} stories done`}
                >
                  <ProgressRing done={p.done} total={p.total} />
                  {p.done}/{p.total}
                </span>
              );
            })()}
          </span>
        </div>
      )}
    </div>
  );
}
