import * as vscode from 'vscode';

/**
 * Error message shown when the Visual Plan feature is disabled.
 * Shared between the IPC handler (plain text) and the chat command (markdown).
 */
export const VISUAL_PLAN_DISABLED_MESSAGE =
  'Visual Plan is disabled. Enable it in VS Code Settings → Agile Agent Canvas → Visual Plan: Enabled.';

/** Markdown-formatted variant for use in chat stream markdown output. */
export const VISUAL_PLAN_DISABLED_MARKDOWN =
  '\n**Visual Plan is disabled.** Enable it in VS Code Settings → Agile Agent Canvas → Visual Plan: Enabled.\n';

/**
 * Check whether the Visual Plan feature is enabled.
 * Reads `agileagentcanvas.visualPlan.enabled` (default `true`).
 *
 * Used by the IPC handler in agentic-kanban-message-handler.ts
 * and the chat command in chat-participant.ts — previously duplicated
 * in both files.
 */
export function isVisualPlanEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('agileagentcanvas')
    .get<boolean>('visualPlan.enabled', true);
}

/**
 * Get the current Visual Plan display mode.
 * Reads `agileagentcanvas.visualPlan.mode` (default `'canvas'`).
 *
 * `'panel'` — auto-open the pop-out panel after generation.
 * `'canvas'` — only show the canvas card (current behaviour).
 *
 * Used by the `visualPlan:ready` handler in autonomy-lifecycle.ts.
 */
export function getVisualPlanMode(): 'canvas' | 'panel' {
  return vscode.workspace
    .getConfiguration('agileagentcanvas')
    .get<'canvas' | 'panel'>('visualPlan.mode', 'canvas');
}
