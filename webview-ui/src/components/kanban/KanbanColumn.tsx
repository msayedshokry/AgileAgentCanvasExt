import { useState, useEffect, useMemo } from 'react';
import type { KanbanItem, KanbanColumnKey, KanbanColumnDef } from './KanbanTypes';
import { KanbanCard } from './KanbanCard';
import { useEvent } from '../../agentic-kanban/useEvent';

interface KanbanColumnProps<T = KanbanItem> {
  column: KanbanColumnDef;
  items: T[];
  /** Override card rendering (for sprint-specific badges etc.) */
  renderCard?: (item: T, index: number) => React.ReactNode;
  /** Text shown when column is empty. Default: 'Drop here' */
  emptyText?: string;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, item: T) => void;
  onDrop?: (itemId: string, targetColumn: KanbanColumnKey) => void;
  onCardClick?: (item: T, e?: React.MouseEvent) => void;
  /** Artifact ID whose Resume is in progress — shows spinner badge on matching card */
  resumingArtifactId?: string | null;
  /** IDs of cards to dim (search filter non-match) */
  dimmedIds?: Set<string>;
  /** WIP limit for this column (undefined = no limit) */
  wipLimit?: number;
  /** Set of expanded epic IDs for showing child stories */
  expandedEpics?: Set<string>;
  /** Toggle epic expand/collapse */
  onToggleEpic?: (epicId: string) => void;
  /** Right-click handler for context menu */
  onContextMenu?: (e: React.MouseEvent, item: KanbanItem) => void;
  /** Set of epic IDs that have child stories (show chevron) */
  epicIdsWithChildren?: Set<string>;
  /** Selected card IDs for multi-select */
  selectedIds?: Set<string>;
  /** Multi-card drag — invoked with all selected IDs as an array */
  onDragMultiStart?: (e: React.DragEvent, itemIds: string[]) => void;
  /** Currently editing artifact ID */
  editingId?: string | null;
  /** Start inline edit */
  onStartEdit?: (item: KanbanItem) => void;
  /** Submit edit */
  onSubmitEdit?: (artifactId: string, newTitle: string) => void;
  /** Cancel edit */
  onCancelEdit?: () => void;
}

export function KanbanColumn<T extends KanbanItem = KanbanItem>({
  column,
  items,
  renderCard,
  emptyText = 'Drop here',
  draggable,
  onDragStart,
  onDrop,
  onCardClick,
  resumingArtifactId,
  dimmedIds,
  wipLimit,
  expandedEpics,
  onToggleEpic,
  onContextMenu,
  epicIdsWithChildren,
  selectedIds,
  onDragMultiStart,
  editingId,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
}: KanbanColumnProps<T>) {
  // Roving tabindex — only one card per column is in the tab order.
  // Arrow Up/Down moves focus within the column.
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Reset focus when the item set is replaced (same length, different cards)
  // or shrinks (e.g., a search filter narrows the column). itemIdsKey is
  // stable across re-renders that don't change the items.
  const itemIdsKey = useMemo(() => items.map(i => i.id).join(','), [items]);
  useEffect(() => {
    setFocusedIndex(0);
  }, [itemIdsKey]);

  // useEvent: stable identity so the column div's onKeyDown listener doesn't
  // re-attach on every parent re-render. Reads latest `items` at call time.
  const handleColumnKeyDown = useEvent((e: React.KeyboardEvent) => {
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => Math.max(prev - 1, 0));
    }
  });

  // Agent status counts for the column header.
  const agentCounts = useMemo(() => {
    let running = 0, queued = 0, interrupted = 0;
    for (const item of items) {
      const s = item.agentState?.status;
      if (s === 'running') running++;
      else if (s === 'queued') queued++;
      else if (s === 'interrupted') interrupted++;
    }
    return { running, queued, interrupted };
  }, [items]);

  const { running, queued, interrupted } = agentCounts;
  const hasAgentDots = running > 0 || queued > 0 || interrupted > 0;
  const wipExceeded = wipLimit !== undefined && items.length > wipLimit;

  // DnD handlers. useEvent gives stable identity and latest-closure access to
  // `onDrop`/`column.key` (the parent's handleDrop, which itself is a useEvent).
  const handleDragOver = useEvent((e: React.DragEvent) => {
    if (!onDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });

  const handleDrop = useEvent((e: React.DragEvent) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('text/plain');
    if (itemId) onDrop?.(itemId, column.key);
  });

  // Per-card drag-start: extracts the multi-select drag IDs and notifies the
  // parent's onDragStart + onDragMultiStart. useEvent gives stable identity
  // so every card's dragstart listener is the same reference — no per-card
  // re-attachment on every parent re-render. Named `handleCardMultiDragStart`
  // (not `handleCardDragStart`) to distinguish from the folded DnD handler
  // in KanbanCard, which sets the drag-ghost badge state.
  const handleCardMultiDragStart = useEvent((e: React.DragEvent, item: KanbanItem) => {
    const ids: string[] = [];
    if (selectedIds && selectedIds.size > 1 && selectedIds.has(item.id)) {
      selectedIds.forEach(id => ids.push(id));
    } else {
      ids.push(item.id);
    }
    e.dataTransfer.setData('text/plain', ids.join(','));
    // safe: handleCardMultiDragStart is only invoked via the column's onDragStart prop, which guarantees T values at runtime
    onDragStart?.(e, item as unknown as T);
    onDragMultiStart?.(e, ids);
  });

  return (
    <div
      className={`kanban-column${wipExceeded ? ' kanban-column--wip-exceeded' : ''}`}
      style={{ '--kanban-col-accent': column.accent } as React.CSSProperties}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onKeyDown={handleColumnKeyDown}
      aria-label={wipExceeded ? `${column.label} column, WIP limit exceeded` : `${column.label} column`}
    >
      <div className="kanban-column-header">
        <span className="kanban-column-label">{column.label}</span>
        <span className="kanban-column-count">
          <span aria-label={`${items.length} items`}>{items.length}</span>
          {hasAgentDots && (
            <span className="kanban-column-status-dots" aria-hidden="true">
              {running > 0 && <span className="kanban-column-status-dot kanban-column-status-dot--running" title={`${running} running`} />}
              {queued > 0 && <span className="kanban-column-status-dot kanban-column-status-dot--queued" title={`${queued} queued`} />}
              {interrupted > 0 && <span className="kanban-column-status-dot kanban-column-status-dot--interrupted" title={`${interrupted} interrupted`} />}
            </span>
          )}
          {wipExceeded && wipLimit !== undefined && (
            <span className="kanban-column-wip-warning" aria-label={`WIP limit ${wipLimit} exceeded`}>
              /{wipLimit}
            </span>
          )}
        </span>
      </div>
      <div className="kanban-column-cards">
        {items.length === 0 ? (
          <div className="kanban-column-empty">{emptyText}</div>
        ) : (
          items.map((item, idx) =>
            renderCard ? (
              renderCard(item, idx)
            ) : (
              <KanbanCard
                key={item.id}
                item={item}
                index={idx}
                draggable={draggable}
                onDragStart={handleCardMultiDragStart}
                onClick={onCardClick as ((item: KanbanItem, e?: React.MouseEvent) => void) | undefined}
                resumingArtifactId={resumingArtifactId}
                cardTabIndex={idx === focusedIndex ? 0 : -1}
                dimmed={dimmedIds?.has(item.id)}
                hasChildren={item.isEpic && (epicIdsWithChildren?.has(item.id) ?? false)}
                isExpanded={expandedEpics?.has(item.id)}
                onToggleEpic={onToggleEpic as ((epicId: string) => void) | undefined}
                onContextMenu={onContextMenu}
                isSelected={selectedIds?.has(item.id)}
                selectedCount={selectedIds?.size}
                isEditing={editingId === item.id}
                onStartEdit={onStartEdit}
                onSubmitEdit={onSubmitEdit}
                onCancelEdit={onCancelEdit}
              />
            )
          )
        )}
      </div>
    </div>
  );
}
