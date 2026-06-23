import type * as vscode from 'vscode';
import type { TerminalBackend } from '../workflow/terminal-backend';
import { TERMINAL_MSG, TerminalInbound, TerminalOutbound } from './terminal-protocol';

/** Bridges the backend-agnostic protocol to a TerminalBackend. One per webview. */
export class TerminalSessionRouter {
  private readonly streams = new Map<string, vscode.Disposable>();
  constructor(
    private readonly backend: TerminalBackend,
    private readonly post: (msg: TerminalOutbound) => void,
  ) {}

  /** Expose backend capability for upstream consumers (e.g. take-over handler). */
  get supportsInput(): boolean { return this.backend.supportsInput; }

  handle(msg: TerminalInbound): void {
    switch (msg.type) {
      case TERMINAL_MSG.open: {
        if (this.streams.has(msg.sessionId)) return; // already attached
        this.post({ type: TERMINAL_MSG.snapshot, sessionId: msg.sessionId, data: this.backend.getSnapshot(msg.sessionId) });
        const d = this.backend.attach(msg.sessionId, (chunk) =>
          this.post({ type: TERMINAL_MSG.data, sessionId: msg.sessionId, chunk }));
        this.streams.set(msg.sessionId, d);
        break;
      }
      case TERMINAL_MSG.input:
        this.backend.write(msg.sessionId, msg.data);
        break;
      case TERMINAL_MSG.close:
        this.streams.get(msg.sessionId)?.dispose();
        this.streams.delete(msg.sessionId);
        break;
      case TERMINAL_MSG.kill:
        void this.backend.kill(msg.sessionId);
        break;
    }
  }

  /** Called by the extension host when a terminal session ends (e.g. VS Code terminal closed). */
  emitExit(sessionId: string, code?: number): void {
    this.post({ type: TERMINAL_MSG.exit, sessionId, code });
  }

  dispose(): void {
    for (const d of this.streams.values()) d.dispose();
    this.streams.clear();
  }
}
