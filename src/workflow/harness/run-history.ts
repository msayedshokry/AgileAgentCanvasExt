// ─── Run history ─────────────────────────────────────────────────────────────
// Append-only log of finished board runs (one JSON object per line) so users
// can see what ran, with which harness, how it ended and why. Bounded: the
// file is compacted to the newest MAX_HISTORY entries when it grows.

import * as fs from 'fs';
import * as path from 'path';
import type { ReceiptItem } from './context-receipt';

export interface RunHistoryEntry {
  readonly runId: string;
  readonly artifactId: string;
  readonly workflowId: string;
  /** Harness id, `vscode-lm`, or `none` when nothing could run. */
  readonly harness: string;
  readonly verdict: string;
  readonly summary?: string;
  readonly startedAt: number;
  readonly finishedAt: number;
  /** What context the agent was given (names, sizes, hashes — no content). */
  readonly context?: readonly ReceiptItem[];
}

export const RUN_HISTORY_FILE = 'agent-run-history.jsonl';
const MAX_HISTORY = 500;
const MAX_SUMMARY_CHARS = 2000;

export function historyPath(outputFolder: string): string {
  return path.join(outputFolder, RUN_HISTORY_FILE);
}

export function appendRunHistory(outputFolder: string, entry: RunHistoryEntry): void {
  const file = historyPath(outputFolder);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const summary = entry.summary && entry.summary.length > MAX_SUMMARY_CHARS
    ? entry.summary.slice(0, MAX_SUMMARY_CHARS) + '…'
    : entry.summary;
  fs.appendFileSync(file, JSON.stringify({ ...entry, summary }) + '\n', 'utf-8');
  const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
  if (lines.length > MAX_HISTORY * 1.2) {
    fs.writeFileSync(file, lines.slice(-MAX_HISTORY).join('\n') + '\n', 'utf-8');
  }
}

/** Newest first; malformed lines are skipped. */
export function readRunHistory(outputFolder: string, limit = 100): RunHistoryEntry[] {
  let text: string;
  try {
    text = fs.readFileSync(historyPath(outputFolder), 'utf-8');
  } catch {
    return [];
  }
  const out: RunHistoryEntry[] = [];
  const lines = text.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    try {
      const e = JSON.parse(lines[i]) as RunHistoryEntry;
      if (typeof e.runId === 'string' && typeof e.verdict === 'string') out.push(e);
    } catch {
      // skip
    }
  }
  return out;
}
