// ─── Sprint health ───────────────────────────────────────────────────────────
// The slice of the sprint-plan status view the canvas shows: what to do next,
// what is at risk, and which retrospective action items are still open.

import { parse } from 'yaml';
import { Recommendation, summarizeStatus } from './sprint-plan-report';

export interface SprintHealth {
  readonly recommendation: Recommendation | null;
  readonly allDone: boolean;
  readonly risks: string[];
  readonly openActionItems: { epic: unknown; action: unknown; owner: unknown; status: unknown }[];
  readonly warnings: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD HH:MM` in local time, one of the stamp formats the status view accepts. */
export function formatStamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Health summary for a sprint-status.yaml's text. Returns null when the text
 * is not a status document (unparseable, not a mapping, no development_status),
 * so the canvas simply shows no health strip.
 */
export function buildSprintHealth(yamlText: string, now: Date): SprintHealth | null {
  let data: unknown;
  try {
    data = parse(yamlText);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const doc = data as Record<string, unknown>;
  const dev = doc.development_status;
  if (!dev || typeof dev !== 'object' || Object.keys(dev).length === 0) return null;

  const summary = summarizeStatus(doc, formatStamp(now));
  return {
    recommendation: summary.recommendation,
    allDone: summary.all_done,
    risks: summary.risks,
    openActionItems: summary.open_action_items.map((item) => ({
      epic: item.epic, action: item.action, owner: item.owner, status: item.status,
    })),
    warnings: summary.warnings,
  };
}
