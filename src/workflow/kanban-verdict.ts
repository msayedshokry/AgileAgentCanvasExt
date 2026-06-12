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
}

/**
 * Sanitize an id for safe use in a filename. Preserves alphanumerics, hyphen,
 * underscore, dot; everything else becomes a hyphen; consecutive hyphens
 * collapse to one. Single source of truth — re-exported by terminal-executor.
 */
export function sanitizeId(id: string): string {
  return id
    .replace(/[^A-Za-z0-9._\-]/g, '-')
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

  const fixRequests = Array.isArray(obj.fix_requests)
    ? (obj.fix_requests as KanbanFixRequest[])
    : Array.isArray(obj.fixRequests)
      ? (obj.fixRequests as KanbanFixRequest[])
      : undefined;

  const summary = typeof obj.summary === 'string'
    ? obj.summary
    : typeof obj.detail === 'string'
      ? obj.detail
      : undefined;

  return { verdict, fixRequests, summary, raw: parsed };
}

/**
 * Extract a verdict from free-form agent output text by locating the last
 * JSON object that contains a `verdict` key. Used for the in-chat path where
 * the model may inline the verdict in its final message instead of (or in
 * addition to) writing the result file.
 */
export function extractVerdictFromText(text: string): KanbanVerdict | undefined {
  if (!text) return undefined;
  // Find candidate JSON objects; prefer the last one mentioning "verdict".
  const matches = text.match(/\{[\s\S]*?\}/g);
  if (!matches) return undefined;
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
