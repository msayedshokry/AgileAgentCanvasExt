/**
 * Shared types, constants, and helpers for the Agentic Kanban surface.
 * Extracted from AgenticKanbanApp.tsx to keep the orchestrator small and
 * let sub-components (TerminalModal, AgenticDetailPanel) consume these
 * types without circular imports.
 */
import type { KanbanItem } from "../components/kanban/KanbanTypes";

// ── Artifact conversion ─────────────────────────────────────────────────────

/**
 * Subset of the artifact shape that AgenticKanbanApp consumes. The full
 * artifact type lives in src/types; we narrow to the fields we need to keep
 * this file independent of the extension-side type system.
 */
export interface ArtifactLike {
  id: string;
  type?: string;
  title?: string;
  name?: string;
  status?: string;
  parentId?: string;
  epicKey?: string;
}

/** Artifact types that have an agentic execution lifecycle. */
export const AGENTIC_TYPES: ReadonlySet<string> = new Set(['epic', 'story']);

export function isAgenticType(a: ArtifactLike): boolean {
  return AGENTIC_TYPES.has(a.type ?? '');
}

export function artifactToKanbanItem(a: ArtifactLike): KanbanItem {
  return {
    id: a.id,
    key: a.id,
    title: a.title || a.name || a.id,
    status: a.status || 'backlog',
    type: a.type || 'unknown',
    epicKey: a.parentId || a.epicKey,
    isEpic: a.type === 'epic',
  };
}

// ── Agent info (fetched lazily on card click) ───────────────────────────────

export interface AgentInfo {
  persona?: {
    name: string;
    title: string;
    icon: string;
    role: string;
    communicationStyle: string;
  };
  terminalInfo?: {
    workflowId: string;
    agentRole: string;
    provider: string;
    startedAt: string;
  };
  traceSummary?: {
    decisions: number;
    toolCalls: number;
    errors: number;
  };
}

// ── Detail-panel helpers ────────────────────────────────────────────────────

export type TraceFilter = 'all' | 'decisions' | 'toolCalls' | 'errors';

export const INTERRUPTION_MESSAGES: Record<string, string> = {
  'timeout': 'This workflow timed out. Resume to continue or abandon to release the lock.',
  'error': 'This workflow encountered an error and was stopped. Resume to re-attempt or abandon to release the lock.',
  'user-abort': 'This workflow was manually stopped. Resume to continue or abandon to release the lock.',
  'no-session': 'No active AI session was found. Start a @agileagentcanvas chat session to resume, or abandon to release the lock.',
};

export function getInterruptionMessage(reason?: string): string {
  return (
    INTERRUPTION_MESSAGES[reason ?? ''] ??
    'This workflow was interrupted when VS Code was closed. Resume to continue or abandon to release the lock.'
  );
}

// ── Toast model ─────────────────────────────────────────────────────────────

export interface KanbanToast {
  message: string;
  type: 'error' | 'info' | 'success';
  undoTransition?: {
    artifactId: string;
    fromStatus: string;
    toStatus: string;
    artifactType: string;
  };
}

// ── Agent persona avatar (initials-based) ────────────────────────────────────

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#f97316', '#eab308',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .slice(0, 2)
    .join('');
}
