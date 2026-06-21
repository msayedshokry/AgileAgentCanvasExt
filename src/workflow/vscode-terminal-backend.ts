import type * as vscode from 'vscode';
import type { TerminalBackend } from './terminal-backend';

/** Minimal slice of terminalExecutor this backend needs (keeps it unit-testable). */
export interface TerminalStreamSource {
  attachWebviewStream(artifactId: string, cb: (chunk: string) => void): vscode.Disposable;
  getTerminalOutput(artifactId: string): string;
  killTerminal(artifactId: string): Promise<void>;
}

/** Option A: reuse the existing vscode.Terminal + onDidWriteData pipe. Output-only. */
export class VsCodeTerminalBackend implements TerminalBackend {
  readonly supportsInput = false;
  constructor(private readonly source: TerminalStreamSource) {}
  attach(sessionId: string, onData: (chunk: string) => void): vscode.Disposable {
    return this.source.attachWebviewStream(sessionId, onData);
  }
  getSnapshot(sessionId: string): string { return this.source.getTerminalOutput(sessionId); }
  write(_sessionId: string, _data: string): void { /* output-only: intentional no-op */ }
  kill(sessionId: string): Promise<void> { return this.source.killTerminal(sessionId); }
}
