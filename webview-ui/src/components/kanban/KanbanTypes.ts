// ─── Shared Kanban Types ─────────────────────────────────────────────────────
// Used by both SprintPlanningView (read-only sprint status) and
// AgenticKanbanApp (execution orchestration with HTML5 DnD).

export type KanbanColumnKey = 'backlog' | 'ready-for-dev' | 'in-progress' | 'review' | 'done' | 'optional';

export interface KanbanItem {
  id: string;
  key: string;
  title: string;
  status: string;
  type: 'epic' | 'story' | 'task' | 'requirement' | string;
  epicKey?: string;
  isEpic: boolean;
  /** Agentic execution state (AgenticKanban only) */
  agentState?: {
    status: 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'interrupted';
    agentRole?: string;
    sessionId?: string;
    startedAt?: string;
    /** Workflow ID being executed (used for resume after restart) */
    workflowId?: string;
    /** Terminal identifier for jumping to the running CLI session */
    terminalId?: string;
    /** Why the workflow was interrupted (vs-code-closed, timeout, error, user-abort, no-session) */
    interruptionReason?: string;
  };
  /** Concurrency lock state (AgenticKanban only) */
  lockInfo?: {
    locked: boolean;
    agentName?: string;
    since?: string;
  };
  /** Harness evaluation results (AgenticKanban only) */
  harnessResults?: Array<{ policyId: string; passed: boolean; severity: string }>;
}

export interface KanbanColumnDef {
  key: KanbanColumnKey;
  label: string;
  accent: string;
}

export const KANBAN_COLUMNS: KanbanColumnDef[] = [
  { key: 'backlog',       label: 'Backlog',       accent: 'var(--vscode-descriptionForeground)' },
  { key: 'ready-for-dev', label: 'Ready for Dev', accent: '#6366f1' },
  { key: 'in-progress',   label: 'In Progress',   accent: '#f59e0b' },
  { key: 'review',        label: 'Review',        accent: '#8b5cf6' },
  { key: 'done',          label: 'Done',          accent: '#22c55e' },
];

/**
 * Maps any artifact status to a Kanban column.
 * Reuses the logic from SprintPlanningView.normalizeStatus() but generalized
 * for all artifact types, not just sprint items.
 */
export function normalizeToKanbanColumn(status: string): KanbanColumnKey {
  switch (status) {
    case 'backlog':
    case 'draft':
    case 'not-started':
    case 'proposed':
      return 'backlog';
    case 'ready-for-dev':
    case 'ready':
    case 'accepted':
    case 'approved':
      return 'ready-for-dev';
    case 'in-progress':
    case 'implementing':
    case 'blocked':
      return 'in-progress';
    case 'review':
    case 'in-review':
    case 'ready-for-review':
      return 'review';
    case 'done':
    case 'complete':
    case 'completed':
    case 'archived':
      return 'done';
    default:
      return 'backlog';
  }
}
