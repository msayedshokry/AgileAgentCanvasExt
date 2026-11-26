// The board's Inbox: only what waits on a person. Items come from the
// extension's needs-you tracker (one list for the status bar and the board);
// this joins them to the cards so each row can say which card and offer the
// fix that unblocks it. Pure: no React, no vscode.

import type { AgentFixAction, KanbanItem } from '../components/kanban/KanbanTypes';

export type InboxKind = 'approval' | 'stopped' | 'paused' | 'autopilot' | 'question' | 'proposal' | 'assigned';

/** As sent by the extension in `kanban:inbox`. */
export interface InboxItem {
  artifactId: string;
  kind: InboxKind;
  reason: string;
  since: number;
  /** The card this is about when the item is keyed otherwise (proposals). */
  cardId?: string;
  /** An agent's questions, or the titles of proposed cards. */
  details?: string[];
}

export interface InboxEntry extends InboxItem {
  title: string;
  /** Fix actions from the card's classified failure, primary first. */
  actions: AgentFixAction[];
  /** False for things that are not cards, such as autopilot runs. */
  onBoard: boolean;
}

const isBlocking = (i: InboxItem) => i.kind === 'approval' || i.kind === 'question';

export const KIND_LABEL: Record<InboxKind, string> = {
  approval: 'Approval',
  stopped: 'Stopped',
  paused: 'Paused',
  autopilot: 'Autopilot',
  question: 'Question',
  proposal: 'Proposal',
  assigned: 'Assigned',
};

const AUTOPILOT_REASON = /^Autopilot "([^"]+)":\s*(.*)$/s;

/** Approvals and questions first (an agent is waiting on you), then whatever has waited longest. */
export function buildInboxEntries(items: readonly InboxItem[], cards: readonly KanbanItem[]): InboxEntry[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return items
    .map((item): InboxEntry => {
      const card = byId.get(item.cardId ?? item.artifactId);
      // Autopilot runs are not cards: name them by the autopilot, not its id.
      const autopilot = item.kind === 'autopilot' ? AUTOPILOT_REASON.exec(item.reason) : null;
      return {
        ...item,
        ...(autopilot ? { reason: autopilot[2] } : {}),
        title: card?.title ?? autopilot?.[1] ?? item.artifactId,
        actions: item.kind === 'stopped' ? card?.agentState?.failure?.actions ?? [] : [],
        onBoard: card !== undefined,
      };
    })
    .sort((a, b) => Number(isBlocking(b)) - Number(isBlocking(a)) || a.since - b.since);
}

/** "just now", "12m", "3h", "2d" — how long it has been waiting. */
export function waitingFor(since: number, now: number): string {
  const minutes = Math.floor((now - since) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}
