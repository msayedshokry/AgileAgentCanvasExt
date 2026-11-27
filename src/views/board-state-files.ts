// ─── Files the board writes for itself ──────────────────────────────────────
// The output folder holds the user's artifacts and the board's own state
// (terminal sessions, queues, run history, the team, run prompts and
// verdicts). A change to the board's own files is not an "external change"
// to the artifacts, so the canvas must not offer to reload for it. Pure.

const STATE_FILES = new Set([
  'agent-card-sessions.json',
  'agent-runs.json',
  'agent-team.json',
  'autopilots.json',
  'concurrency-queue-state.json',
  'harness-findings.json',
  'queue-state.json',
  'scheduler-state.json',
  'terminal-sessions.json',
]);

const STATE_DIRS = ['_terminal-output', 'traces', '.autopilot-claims', 'plans'];

/** True for a folder (by name) that holds only the board's own state. */
export function isBoardStateDir(name: string): boolean {
  return STATE_DIRS.includes(name);
}

/** True for a file under the output folder that the board writes for itself. */
export function isBoardStateFile(filePath: string): boolean {
  const parts = filePath.replace(/\\/g, '/').split('/');
  const name = parts[parts.length - 1]?.toLowerCase() ?? '';
  if (STATE_FILES.has(name)) return true;
  return parts.some((p) => STATE_DIRS.includes(p));
}
