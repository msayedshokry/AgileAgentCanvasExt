import type { NodePtyTerminalBackend } from './node-pty-terminal-backend';

/**
 * Shared reference to the currently-active NodePtyTerminalBackend.
 *
 * Set by the message handler when the embedded terminal setting is ON and
 * node-pty loaded successfully. Read by TerminalExecutor to decide whether
 * to spawn a pty session instead of a vscode.window.createTerminal.
 *
 * Undefined when the setting is OFF or node-pty failed to load — in that
 * case TerminalExecutor falls back to the existing vscode.Terminal path.
 */
let activePtyBackend: NodePtyTerminalBackend | undefined;

export function setActivePtyBackend(backend: NodePtyTerminalBackend | undefined): void {
  activePtyBackend = backend;
}

export function getActivePtyBackend(): NodePtyTerminalBackend | undefined {
  return activePtyBackend;
}
