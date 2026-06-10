/**
 * Project-standard error-to-string utility.
 *
 * L-B1 / M-B4: previously copy-pasted across at least 5 files
 * (session-manager, team-orchestrator, handoff-negotiation,
 * terminal-executor, agentic-kanban-message-handler, lane-transitions).
 * Now exported from a single place.
 */
export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Throw a normalized Error from any unknown input.
 * Useful at API boundaries where a thrown value might not be an Error.
 */
export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
