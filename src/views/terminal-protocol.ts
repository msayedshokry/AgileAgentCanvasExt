/**
 * Backend-agnostic terminal message protocol shared by the extension host
 * and the webview. Designed for the bidirectional end-state from v1:
 * `terminal:input` exists even while the first backend is output-only.
 * Session identity == artifactId (reuses the existing stream key + AgentSessionRow).
 */
export const TERMINAL_MSG = {
  // extension → webview
  snapshot: 'terminal:snapshot', // { sessionId, data }   full buffered output on (re)attach
  data: 'terminal:data',         // { sessionId, chunk }  streamed chunk
  exit: 'terminal:exit',         // { sessionId, code }   process/terminal ended
  capabilities: 'terminal:capabilities', // { supportsInput }  backend capability announcement
  // webview → extension
  open: 'terminal:open',         // { sessionId }         tile mounted, attach + send snapshot
  input: 'terminal:input',       // { sessionId, data }   keystrokes (no-op for output-only backend)
  close: 'terminal:close',       // { sessionId }         tile unmounted, detach
  kill: 'terminal:kill',         // { sessionId }         user-requested terminate
} as const;

export interface TerminalSnapshotMsg { type: typeof TERMINAL_MSG.snapshot; sessionId: string; data: string; }
export interface TerminalDataMsg { type: typeof TERMINAL_MSG.data; sessionId: string; chunk: string; }
export interface TerminalExitMsg { type: typeof TERMINAL_MSG.exit; sessionId: string; code?: number; }
export interface TerminalCapabilitiesMsg { type: typeof TERMINAL_MSG.capabilities; supportsInput: boolean; }
export type TerminalOutbound = TerminalSnapshotMsg | TerminalDataMsg | TerminalExitMsg | TerminalCapabilitiesMsg;

export interface TerminalOpenMsg { type: typeof TERMINAL_MSG.open; sessionId: string; }
export interface TerminalInputMsg { type: typeof TERMINAL_MSG.input; sessionId: string; data: string; }
export interface TerminalCloseMsg { type: typeof TERMINAL_MSG.close; sessionId: string; }
export interface TerminalKillMsg { type: typeof TERMINAL_MSG.kill; sessionId: string; }
export type TerminalInbound = TerminalOpenMsg | TerminalInputMsg | TerminalCloseMsg | TerminalKillMsg;

const INBOUND = new Set<string>([TERMINAL_MSG.open, TERMINAL_MSG.input, TERMINAL_MSG.close, TERMINAL_MSG.kill]);
export function isTerminalInbound(m: unknown): m is TerminalInbound {
  return !!m && typeof m === 'object' && INBOUND.has((m as { type?: string }).type ?? '');
}
