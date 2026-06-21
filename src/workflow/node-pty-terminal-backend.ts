import type * as vscode from 'vscode';
import * as os from 'os';
import { createLogger } from '../utils/logger';
import type { TerminalBackend } from './terminal-backend';

const logger = createLogger('node-pty-backend');

// Lazy-import: if node-pty is missing (not installed, ABI mismatch, or Option A
// chosen by the user), this remains undefined and every call degrades gracefully
// to a no-op — the extension activates without a crash.
function loadPty(): typeof import('node-pty') | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('node-pty');
  } catch {
    logger.info('[NodePtyTerminalBackend] node-pty not available — falling back to Option A');
    return undefined;
  }
}

interface PtySession {
  pty: import('node-pty').IPty;
  accumulatedData: string;
  listeners: Set<(chunk: string) => void>;
}

/**
 * Option B: true bidirectional terminal via node-pty.
 * Every session owns its own shell process. Keystrokes from the webview
 * (terminal:input) are forwarded to the shell; output is streamed to
 * attached listeners. Accumulates output so getSnapshot() serves late-joiners.
 *
 * If node-pty fails to load (missing native module or ABI mismatch),
 * supportsInput is false and all calls become safe no-ops — the
 * extension gracefully degrades to Option A.
 */
export class NodePtyTerminalBackend implements TerminalBackend {
  /** True only when node-pty loaded successfully. */
  readonly supportsInput: boolean;
  private readonly ptyModule: typeof import('node-pty') | undefined;

  private sessions = new Map<string, PtySession>();
  /** Called when a pty session exits so the executor can clean up. */
  onSessionExit?: (sessionId: string, artifactId: string, exitCode?: number) => void;

  /** @param ptyOverride — injection point for tests; production passes nothing. */
  constructor(ptyOverride?: typeof import('node-pty')) {
    this.ptyModule = ptyOverride ?? loadPty();
    this.supportsInput = !!this.ptyModule;
    if (this.ptyModule) {
      logger.debug('[NodePtyTerminalBackend] node-pty loaded — bidirectional terminals available');
    }
  }

  /**
   * Spawn a shell session for a given sessionId.
   * Called by the orchestrator instead of vscode.window.createTerminal.
   */
  spawnSession(
    sessionId: string,
    shell?: string,
    args?: string[],
    cwd?: string,
  ): void {
    if (!this.ptyModule) return;
    if (this.sessions.has(sessionId)) return; // idempotent

    const file = shell ?? (os.platform() === 'win32' ? 'powershell.exe' : 'bash');
    const spawnArgs = args ?? (os.platform() === 'win32' ? [] : ['--login']);

    const listeners = new Set<(chunk: string) => void>();

    try {
      const p = this.ptyModule.spawn(file, spawnArgs, {
        name: 'xterm-color',
        cols: 120,
        rows: 30,
        cwd: cwd ?? process.cwd(),
        env: process.env as Record<string, string>,
      });

      const session: PtySession = { pty: p, accumulatedData: '', listeners };
      this.sessions.set(sessionId, session);

      p.onData((data: string) => {
        session.accumulatedData += data;
        for (const cb of listeners) {
          try { cb(data); } catch { /* listener disposed */ }
        }
      });

      p.onExit(({ exitCode }) => {
        logger.debug(`[NodePtyTerminalBackend] Session ${sessionId} exited (code ${exitCode})`);
        this.sessions.delete(sessionId);
        this.onSessionExit?.(sessionId, sessionId, typeof exitCode === 'number' ? exitCode : undefined);
      });
    } catch (err) {
      logger.error(`[NodePtyTerminalBackend] Failed to spawn session ${sessionId}: ${err}`);
    }
  }

  attach(sessionId: string, onData: (chunk: string) => void): vscode.Disposable {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.listeners.add(onData);
    }
    return {
      dispose: () => {
        const s = this.sessions.get(sessionId);
        if (s) s.listeners.delete(onData);
      },
    };
  }

  getSnapshot(sessionId: string): string {
    return this.sessions.get(sessionId)?.accumulatedData ?? '';
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session && this.supportsInput) {
      session.pty.write(data);
    }
  }

  async kill(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      try { session.pty.kill(); } catch { /* already dead */ }
      this.sessions.delete(sessionId);
    }
  }
}
