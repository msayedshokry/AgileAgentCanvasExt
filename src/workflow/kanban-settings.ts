// ─── Kanban Runtime Settings ────────────────────────────────────────────────
// Holds the per-session "auto-advance" toggle that the Agentic Kanban UI
// controls. When ON, completing a workflow on a story auto-advances the card
// through Review → Done (re-implementing on NEEDS_FIXES). When OFF, the card
// stops after its current workflow and the user moves it manually.
//
// The toggle is mirrored to VS Code configuration so it survives reloads; the
// in-memory value is the authoritative runtime source (set by the UI toggle).

import * as vscode from 'vscode';

const CONFIG_KEY = 'agileagentcanvas';
const AUTO_ADVANCE_SETTING = 'kanban.autoAdvance';
const MAX_ITERATIONS_SETTING = 'kanban.maxIterations';
const WIP_LIMITS_SETTING = 'kanban.wipLimits';
const APPROVAL_CHECKPOINTS_SETTING = 'kanban.approvalCheckpoints';
const DEFAULT_MAX_ITERATIONS = 3;

let autoAdvanceOverride: boolean | undefined;

/** Read the current auto-advance state (runtime override wins over config). */
export function isKanbanAutoAdvanceEnabled(): boolean {
  if (autoAdvanceOverride !== undefined) return autoAdvanceOverride;
  return vscode.workspace
    .getConfiguration(CONFIG_KEY)
    .get<boolean>(AUTO_ADVANCE_SETTING, false);
}

/**
 * Set the auto-advance toggle. Updates the in-memory override immediately and
 * persists to configuration (best-effort) so the choice survives reloads.
 */
export async function setKanbanAutoAdvance(enabled: boolean): Promise<void> {
  autoAdvanceOverride = enabled;
  try {
    await vscode.workspace
      .getConfiguration(CONFIG_KEY)
      .update(AUTO_ADVANCE_SETTING, enabled, vscode.ConfigurationTarget.Workspace);
  } catch {
    // Persistence is best-effort; the in-memory override still applies.
  }
}

/** Max re-implement iterations before the loop stops without approval. */
export function getKanbanMaxIterations(): number {
  const v = vscode.workspace
    .getConfiguration(CONFIG_KEY)
    .get<number>(MAX_ITERATIONS_SETTING, DEFAULT_MAX_ITERATIONS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_MAX_ITERATIONS;
}

/** P1 #5: whether the user must approve risky autonomous actions in-canvas. */
export function isApprovalCheckpointEnabled(): boolean {
  return vscode.workspace
    .getConfiguration(CONFIG_KEY)
    .get<boolean>(APPROVAL_CHECKPOINTS_SETTING, false);
}

/** Per-column WIP limits from VS Code settings (e.g. { "in-progress": 3, "review": 2 }). */
export function getKanbanWipLimits(): Record<string, number> {
  const raw = vscode.workspace
    .getConfiguration(CONFIG_KEY)
    .get<Record<string, number>>(WIP_LIMITS_SETTING, {});
  // Filter to valid column keys and positive integers only
  const validKeys = new Set(['backlog', 'ready-for-dev', 'in-progress', 'review', 'done', 'optional']);
  const cleaned: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [key, val] of Object.entries(raw)) {
      if (validKeys.has(key) && typeof val === 'number' && Number.isFinite(val) && val > 0) {
        cleaned[key] = Math.floor(val);
      }
    }
  }
  return cleaned;
}
