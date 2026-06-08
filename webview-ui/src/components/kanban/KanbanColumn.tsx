import type { KanbanItem, KanbanColumnKey, KanbanColumnDef } from './KanbanTypes';
import { KanbanCard } from './KanbanCard';

// ─── KanbanColumn ─────────────────────────────────────────────────────────────
// Shared presentational column used by SprintPlanningView (read-only) and
// AgenticKanban (DnD). Supports optional drag-and-drop drop target via
// the HTML5 Drag and Drop API.
//
// Generic type <T> defaults to KanbanItem.  Consumers with custom item types
// (e.g. SprintItem) can pass a renderCard prop to customise card rendering.

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
  onCardClick?: (item: T) => void;
  /** Artifact ID whose Resume is in progress — shows spinner badge on matching card */
  resumingArtifactId?: string | null;
}

export function KanbanColumn<T = KanbanItem>({
  column,
  items,
  renderCard,
  emptyText = 'Drop here',
  draggable,
  onDragStart,
  onDrop,
  onCardClick,
  resumingArtifactId,
}: KanbanColumnProps<T>) {
  const handleDragOver = (e: React.DragEvent) => {
    if (!onDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('text/plain');
    if (itemId) onDrop?.(itemId, column.key);
  };

  return (
    <div
      className="kanban-column"
      style={{ '--kanban-col-accent': column.accent } as React.CSSProperties}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="kanban-column-header">
        <span className="kanban-column-label">{column.label}</span>
        <span className="kanban-column-count">{items.length}</span>
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
                key={(item as unknown as KanbanItem).id}
                item={item as unknown as KanbanItem}
                index={idx}
                draggable={draggable}
                onDragStart={onDragStart as unknown as (e: React.DragEvent, item: KanbanItem) => void}
                onClick={onCardClick as unknown as (item: KanbanItem) => void}
                resumingArtifactId={resumingArtifactId}
              />
            )
          )
        )}
      </div>
    </div>
  );
}
