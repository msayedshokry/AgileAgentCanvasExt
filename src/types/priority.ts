// ─── Shared Priority Order ────────────────────────────────────────────────────
// Single source of truth for the priority sort order used by both the
// AutoScheduler (backend) and the Agentic Kanban webview.

import { PriorityLevel } from './index';
export { PriorityLevel };

/** Lower = higher priority. Items without a known value sort to the end (99). */
export const PRIORITY_ORDER: Readonly<Record<string, number>> = {
  'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3,
  'must-have': 4, 'should-have': 5, 'could-have': 6, "won't-have": 7,
};

export const PRIORITY_UNKNOWN = 99;

/** Get the sort rank for a priority string. Unknown values return 99. */
export function priorityRank(value: string | undefined | null): number {
  if (!value) return PRIORITY_UNKNOWN;
  return PRIORITY_ORDER[value] ?? PRIORITY_UNKNOWN;
}
