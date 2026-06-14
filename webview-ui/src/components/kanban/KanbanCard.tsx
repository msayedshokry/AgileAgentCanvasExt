import type { KanbanItem } from './KanbanTypes';
import { vscode } from '../../vscodeApi';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useEvent } from '../../agentic-kanban/useEvent';

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
}

// Used to disambiguate single-click from double-click without setTimeout.
// We compare timestamps instead: a double-click fires ~250ms after the
// first click on most platforms. If the second click arrives within that
// window we suppress the single-click handler entirely.
const DOUBLE_CLICK_WINDOW_MS = 250;

export function KanbanCard({ item, index, draggable, onDragStart, onClick, className, resumingArtifactId, cardTabIndex, dimmed, hasChildren, isExpanded, onToggleEpic, isChild, onContextMenu, isSelected, selectedCount, isEditing, onStartEdit, onSubmitEdit, onCancelEdit }: KanbanCardProps) {
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
      {/* Feature 1: epic chevron for expand/collapse */}
      {item.isEpic && hasChildren && (
        <button
          className={`kanban-card-epic-chevron${isExpanded ? ' kanban-card-epic-chevron--expanded' : ''}`}
          onClick={handleChevronClick}
          aria-label={isExpanded ? 'Collapse epic' : 'Expand epic'}
          tabIndex={-1}
        >
          ▶
        </button>
      )}
      <span className="kanban-card-key">{item.key}</span>
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

      {item.epicKey && !item.isEpic && (
        <span className="kanban-card-epic-tag">{item.epicKey}</span>
      )}

      {item.isEpic && <span className="kanban-card-type-tag">Epic</span>}

      {/* Resume-in-progress spinner */}
      {resumingArtifactId === item.id && (
        <span className="kanban-card-agent-badge kanban-card-agent-badge--resuming">
          <span className="kanban-card-resume-spinner" />
          Reconnecting…
        </span>
      )}

      {/* Agent execution overlay */}
      {isQueued && (
        <span className="kanban-card-agent-badge kanban-card-agent-badge--queued">
          Queued...
        </span>
      )}
      {isInterrupted && (
        <span className="kanban-card-agent-badge kanban-card-agent-badge--interrupted">
          Interrupted — {item.agentState?.agentRole ?? 'Agent'}
        </span>
      )}
      {hasTerminal && (
        <span
          className="kanban-card-agent-badge kanban-card-agent-badge--terminal"
          onClick={handleTerminalClick}
          title="Jump to running terminal"
        >
          Terminal active
        </span>
      )}
      {isRunning && item.agentState?.agentRole && !hasTerminal && (
        <span className="kanban-card-agent-badge">
          {item.agentState.agentRole} is working...
        </span>
      )}

      {/* Lock overlay */}
      {isLocked && (
        <span className="kanban-card-lock-badge" title={`Locked by ${item.lockInfo?.agentName ?? 'unknown'}`}>
          {item.lockInfo?.agentName ? `Locked: ${item.lockInfo.agentName}` : 'Locked'}
        </span>
      )}

      {/* Harness failures */}
      {item.harnessResults?.some(r => !r.passed && r.severity === 'blocking') && (
        <span className="kanban-card-harness-badge kanban-card-harness-badge--error">
          Policy failed
        </span>
      )}

      {/* Issue #22: Dependency badge (Blocked by N) */}
      {(item.blockedBy ?? 0) > 0 && (
        <span
          className={`kanban-card-dep-badge${item.hasCycle ? ' kanban-card-dep-badge--cycle' : ''}`}
          title={
            item.hasCycle
              ? `⚠ Circular dependency: blocked by ${item.blockedBy} story(ies) including ${(item.blockerTitles ?? []).slice(0, 3).join(', ')}`
              : `Blocked by: ${(item.blockerTitles ?? []).slice(0, 3).join(', ')}${(item.blockerTitles?.length ?? 0) > 3 ? '…' : ''}`
          }
          aria-label={`Blocked by ${item.blockedBy} ${item.hasCycle ? 'in a circular dependency' : 'stories'}`}
        >
          {item.hasCycle ? '⛔' : '🔗'} Blocked by {item.blockedBy}
        </span>
      )}
    </div>
  );
}
