import type * as vscode from 'vscode';

/**
 * Abstraction over "the thing producing a terminal session's I/O".
 * The message handler and grid talk to THIS, never to a concrete PTY.
 * Output-only backends (Option A) set supportsInput=false and no-op write();
 * a node-pty backend (Option B) sets supportsInput=true and implements write()
 * — swapping backends requires NO change to the webview or the protocol.
 */
export interface TerminalBackend {
  /** Whether write() actually reaches the process. UI shows an input box iff true. */
  readonly supportsInput: boolean;
  /** Subscribe to streamed output chunks for a session. Returns a detach disposable. */
  attach(sessionId: string, onData: (chunk: string) => void): vscode.Disposable;
  /** Buffered output so far (for late-join snapshot on tile mount). */
  getSnapshot(sessionId: string): string;
  /** Send input to the session. No-op when supportsInput === false. */
  write(sessionId: string, data: string): void;
  /** Terminate the session. Idempotent. */
  kill(sessionId: string): Promise<void>;
}
