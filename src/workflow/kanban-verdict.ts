// ─── Kanban Verdict Contract ────────────────────────────────────────────────
// Shared types + helpers for reading the structured verdict that autonomous
// lane agents (aac-kanban-dev-executor, aac-kanban-review-guard) emit.
//
// Both execution paths — headless terminal CLI and in-chat Copilot — write a
// result JSON file to:
//   <outputFolder>/_terminal-output/<artifactId>-<workflowId>-result.json
// The KanbanOrchestrator reads that file to decide whether to auto-advance the
// card. When the file is missing or unparseable, the verdict is UNKNOWN and the
// orchestrator STOPS rather than advancing on uncertainty.

import * as path from 'path';
import * as fs from 'fs';
import { hasBoardActions, sanitizeBoardActions, sanitizeLeadPlan, type BoardActions, type LeadPlan } from './harness/board-actions';
import { readAgentNotes } from './harness/agent-brief';

/**
 * Why a run ended, in the agent's own words where it gave any. Agents often
 * put the reason in a board note instead of the verdict summary; without this
 * the user only sees "Agent exited with BLOCKED".
 */
export function verdictReason(verdict: Pick<KanbanVerdict, 'verdict' | 'summary' | 'board'>, card: unknown): string {
  const summary = verdict.summary?.trim();
  if (summary) return summary;
  const boardNotes = verdict.board?.notes?.trim();
  if (boardNotes) return boardNotes;
  const latestNote = readAgentNotes(card).at(-1)?.text.trim();
  if (latestNote) return latestNote;
  return `Agent exited with ${verdict.verdict}`;
}

/** Possible verdict outcomes across both lane agents. */
export type KanbanVerdictKind =
  | 'COMPLETED'   // dev-executor: implementation + tests done, exit gate passed
  | 'APPROVED'    // review-guard: all AC verified, ready for Done
  | 'NEEDS_FIXES' // review-guard: criteria failed, fix_requests provided
  | 'BLOCKED'     // either agent: entry/exit gate failed, cannot proceed
  | 'UNKNOWN';    // no parseable result — treat as "stop, ask the human"

export interface KanbanFixRequest {
  failing_criterion?: string;
  reproduction?: string;
  minimal_change?: string;
  files_involved?: string[];
  reverify_with?: string;
  [key: string]: unknown;
}

export interface KanbanVerdict {
  verdict: KanbanVerdictKind;
  /** Structured fix requests (review-guard NEEDS_FIXES). */
  fixRequests?: KanbanFixRequest[];
  /** Free-form summary / reasons for surfacing to the user. */
  summary?: string;
  /** The raw parsed JSON, for tracing/debugging. */
  raw?: unknown;
  /** Run id the agent echoed back (`run_id`), when the prompt asked for one. */
  runId?: string;
  /** What the agent asked of the board (questions, proposals, handoff, notes); sanitized. */
  board?: BoardActions;
  /** The lead agent's plan (stories, assignments, next step); sanitized. */
  lead?: LeadPlan;
  /** Parts of `board`/`lead` that were dropped by the sanitizer, in plain words. */
  boardDropped?: string[];
}

/** Caps on agent-supplied fix requests (they are persisted into artifact metadata). */
const MAX_FIX_REQUESTS = 50;
const MAX_FIX_FIELD_CHARS = 4000;

function clip(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_FIX_FIELD_CHARS ? text.slice(0, MAX_FIX_FIELD_CHARS) + '…' : text;
}

/**
 * Keep only well-formed fix requests: objects, known fields coerced to
 * bounded strings, at most MAX_FIX_REQUESTS. Agent output is untrusted.
 */
export function sanitizeFixRequests(value: unknown): KanbanFixRequest[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: KanbanFixRequest[] = [];
  for (const item of value) {
    if (out.length >= MAX_FIX_REQUESTS) break;
    if (typeof item === 'string') {
      out.push({ failing_criterion: clip(item) });
      continue;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const files = Array.isArray(r.files_involved)
      ? r.files_involved.filter((x): x is string => typeof x === 'string').slice(0, 50).map((x) => x.slice(0, 500))
      : undefined;
    out.push({
      failing_criterion: clip(r.failing_criterion),
      reproduction: clip(r.reproduction),
      minimal_change: clip(r.minimal_change),
      files_involved: files,
      reverify_with: clip(r.reverify_with),
    });
  }
  return out;
}

/**
 * True unless the verdict carries a run id that differs from `runId`.
 * A verdict without `run_id` is accepted (agents may omit it); a mismatching
 * one was written by a different (stale or zombie) run and must be ignored.
 */
export function verdictMatchesRun(verdict: KanbanVerdict, runId: string | undefined): boolean {
  return !runId || !verdict.runId || verdict.runId === runId;
}

/**
 * Sanitize an id for safe use in a filename. Preserves alphanumerics, hyphen,
 * underscore, dot; everything else becomes a hyphen; consecutive hyphens
 * collapse to one. Single source of truth — re-exported by terminal-executor.
 */
export function sanitizeId(id: string): string {
  return id
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Resolve the configured artifact output folder (absolute when possible).
 *  `vscode` is required lazily so this module stays loadable in unit tests
 *  (e.g. proxyquire) that don't provide the vscode runtime. */
export function getOutputFolder(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vscode = require('vscode') as typeof import('vscode');
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const configured = vscode.workspace
    .getConfiguration('agileagentcanvas')
    .get<string>('outputFolder', '.agileagentcanvas-context');
  return workspaceFolders?.[0]
    ? path.join(workspaceFolders[0].uri.fsPath, configured)
    : configured;
}

/** Build the canonical result-file path for an (artifact, workflow) pair. */
export function resultFilePath(
  outputFolder: string,
  artifactId: string,
  workflowId: string
): string {
  return path.join(
    outputFolder,
    '_terminal-output',
    `${sanitizeId(artifactId)}-${sanitizeId(workflowId)}-result.json`
  );
}

/**
 * Read and normalize a verdict file. Returns `undefined` if the file does not
 * exist or cannot be parsed. Accepts either the raw agent schema
 * (`{ verdict, fix_requests }`) or an already-normalized object.
 */
export function readVerdictFile(filePath: string): KanbanVerdict | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    const text = fs.readFileSync(filePath, 'utf-8');
    return normalizeVerdict(JSON.parse(text));
  } catch {
    return undefined;
  }
}

/** Normalize an arbitrary parsed object into a KanbanVerdict. */
export function normalizeVerdict(parsed: unknown): KanbanVerdict {
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const rawVerdict = String(obj.verdict ?? '').toUpperCase().trim();

  const valid: KanbanVerdictKind[] = [
    'COMPLETED', 'APPROVED', 'NEEDS_FIXES', 'BLOCKED', 'UNKNOWN',
  ];
  const verdict = (valid.includes(rawVerdict as KanbanVerdictKind)
    ? (rawVerdict as KanbanVerdictKind)
    : 'UNKNOWN');

  const fixRequests = sanitizeFixRequests(obj.fix_requests ?? obj.fixRequests);

  const summary = typeof obj.summary === 'string'
    ? obj.summary
    : typeof obj.detail === 'string'
      ? obj.detail
      : undefined;

  const runId = typeof obj.run_id === 'string' ? obj.run_id : typeof obj.runId === 'string' ? obj.runId : undefined;

  const board = sanitizeBoardActions(obj.board);
  const lead = sanitizeLeadPlan(obj.lead);
  const boardDropped = [...board.dropped, ...lead.dropped];

  return {
    verdict, fixRequests, summary, raw: parsed,
    ...(runId ? { runId } : {}),
    ...(hasBoardActions(board.value) ? { board: board.value } : {}),
    ...(lead.value ? { lead: lead.value } : {}),
    ...(boardDropped.length ? { boardDropped } : {}),
  };
}

/**
 * Extract a verdict from free-form agent output text by locating the last
 * JSON object that contains a `verdict` key. Used for the in-chat path where
 * the model may inline the verdict in its final message instead of (or in
 * addition to) writing the result file.
 */
export function extractVerdictFromText(text: string): KanbanVerdict | undefined {
  if (!text) return undefined;
  // Find balanced top-level JSON objects (nested fix_requests included);
  // prefer the last one mentioning "verdict".
  const matches = balancedObjects(text);
  for (let i = matches.length - 1; i >= 0; i--) {
    if (!/verdict/i.test(matches[i])) continue;
    try {
      const parsed = JSON.parse(matches[i]);
      if (parsed && typeof parsed === 'object' && 'verdict' in parsed) {
        return normalizeVerdict(parsed);
      }
    } catch {
      // keep scanning
    }
  }
  return undefined;
}

/** Top-level `{…}` spans with balanced braces, ignoring braces inside JSON strings. */
function balancedObjects(text: string): string[] {
  const spans: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"' && depth > 0) inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0) spans.push(text.slice(start, i + 1));
    }
  }
  return spans;
}
