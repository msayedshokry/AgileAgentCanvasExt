import type { KanbanItem } from './KanbanTypes';
import { vscode } from '../../vscodeApi';

// ─── KanbanCard ───────────────────────────────────────────────────────────────
// Shared presentational card used by SprintPlanningView (read-only) and
// AgenticKanban (DnD + agent overlays). Supports optional drag-and-drop via
// the HTML5 Drag and Drop API (dataTransfer).

interface KanbanCardProps {
  item: KanbanItem;
  index?: number;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, item: KanbanItem) => void;
  onClick?: (item: KanbanItem) => void;
  className?: string;
  /** Artifact ID whose Resume is in progress — shows spinner badge */
  resumingArtifactId?: string | null;
}

export function KanbanCard({ item, index, draggable, onDragStart, onClick, className, resumingArtifactId }: KanbanCardProps) {
  const isLocked = item.lockInfo?.locked;
  const isRunning = item.agentState?.status === 'running';
  const isQueued = item.agentState?.status === 'queued';
  const isInterrupted = item.agentState?.status === 'interrupted';
  const hasTerminal = !!item.agentState?.terminalId;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(e, item);
  };

  return (
    <div
      className={[
        'kanban-card',
        item.isEpic ? 'kanban-card--epic' : '',
        isLocked ? 'kanban-card--locked' : '',
        isRunning ? 'kanban-card--running' : '',
        isQueued ? 'kanban-card--queued' : '',
        isInterrupted ? 'kanban-card--interrupted' : '',
        className || '',
      ].filter(Boolean).join(' ')}
      style={index !== undefined ? { '--card-index': index } as React.CSSProperties : undefined}
      draggable={draggable && !isLocked}
      onDragStart={handleDragStart}
      onClick={() => onClick?.(item)}
    >
      <span className="kanban-card-key">{item.key}</span>
      <span className="kanban-card-title">{item.title}</span>

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
          onClick={(e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'kanban:jumpToTerminal', artifactId: item.id });
          }}
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
    </div>
  );
}
