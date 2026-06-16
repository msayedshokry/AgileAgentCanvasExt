// ─── Terminal Session Recovery on Restart ─────────────────────────────────────
// On extension activation, scan for orphaned AAC-named terminal processes.
// Attempt to reconnect; if failed, mark as interrupted with terminal-lost reason.
//
// Issue: #12 — Terminal Session Recovery on Restart

import { createLogger } from '../utils/logger';

const logger = createLogger('terminal-recovery');

// ── Types ────────────────────────────────────────────────────────────────────

export interface OrphanedTerminal {
  sessionId: string;
  artifactId: string;
  pid?: number;
  name: string;
  startedAt: number;
}

export interface RecoveryResult {
  sessionId: string;
  artifactId: string;
  status: 'reconnected' | 'interrupted';
  reason?: 'terminal-lost' | 'pid-dead' | 'stream-failed';
}

export interface ProcessScanner {
  /** Find AAC-named terminal processes. */
  findOrphans(): Promise<OrphanedTerminal[]>;
}

export interface StreamReconnector {
  /** Reconnect output streaming to a previously orphaned terminal. */
  reconnect(terminal: OrphanedTerminal): Promise<boolean>;
}

/**
 * Optional hook fired immediately after a successful reconnection.
 * Receives the orphan metadata so the autonomy layer can look up buffered
 * chunks from terminal-executor and broadcast a reconnect notification to
 * the webview. Called once per successful reconnect; not called on the
 * 'interrupted' path.
 *
 * Issue: #35 — terminalReconnected outbound broadcast (closes the gap
 * between the existing OUTBOUND `terminalOutput` reconnector stream and the
 * user-visible "reconnected" toast/notification).
 */
export type OnReconnectedFn = (orphan: OrphanedTerminal) => void;

// ── Recovery ─────────────────────────────────────────────────────────────────

export class TerminalSessionRecovery {
  private scanner: ProcessScanner | null = null;
  private reconnector: StreamReconnector | null = null;
  private interruptedReporter: ((artifactId: string, reason: string) => void) | null = null;
  private onReconnected: OnReconnectedFn | null = null;

  setScanner(scanner: ProcessScanner): void { this.scanner = scanner; }
  setReconnector(reconnector: StreamReconnector): void { this.reconnector = reconnector; }
  setInterruptedReporter(fn: (artifactId: string, reason: string) => void): void { this.interruptedReporter = fn; }
  /** Register a callback fired after every successful reconnection. */
  setOnReconnected(fn: OnReconnectedFn): void { this.onReconnected = fn; }

  /** Scan for orphaned terminals and attempt reconnection. */
  async recoverOnActivation(): Promise<RecoveryResult[]> {
    if (!this.scanner) {
      logger.warn('No scanner configured — skipping recovery');
      return [];
    }
    const orphans = await this.scanner.findOrphans();
    if (orphans.length === 0) return [];

    logger.info('Found orphaned terminals', { count: orphans.length });
    const results: RecoveryResult[] = [];

    for (const orphan of orphans) {
      const result = await this.attemptReconnect(orphan);
      results.push(result);
    }

    return results;
  }

  private async attemptReconnect(orphan: OrphanedTerminal): Promise<RecoveryResult> {
    // If we have a pid and the scanner can check liveness, do that first
    if (orphan.pid === undefined) {
      return this.markInterrupted(orphan, 'terminal-lost');
    }

    try {        if (this.reconnector) {
          const ok = await this.reconnector.reconnect(orphan);
          if (ok) {
            logger.info('Reconnected orphaned terminal', { sessionId: orphan.sessionId });
            // Fire the optional reconnect hook so the autonomy layer can
            // broadcast a `terminalReconnected` event with buffered chunks
            // back to the webview. Hook failures are logged but do not
            // change the recovery result — reconnection itself succeeded.
            if (this.onReconnected) {
              try { this.onReconnected(orphan); }
              catch (err) {
                logger.warn('onReconnected hook threw', { error: String(err) });
              }
            }
            return { sessionId: orphan.sessionId, artifactId: orphan.artifactId, status: 'reconnected' };
          }
          return this.markInterrupted(orphan, 'stream-failed');
        }
    } catch (err) {
      logger.warn('Reconnect threw', { sessionId: orphan.sessionId, error: String(err) });
      return this.markInterrupted(orphan, 'stream-failed');
    }

    // No reconnector configured — assume interrupted
    return this.markInterrupted(orphan, 'terminal-lost');
  }

  private markInterrupted(orphan: OrphanedTerminal, reason: RecoveryResult['reason']): RecoveryResult {
    logger.info('Marking terminal as interrupted', { sessionId: orphan.sessionId, reason });
    if (this.interruptedReporter) {
      try { this.interruptedReporter(orphan.artifactId, reason ?? 'terminal-lost'); }
      catch (err) { logger.warn('Interrupted reporter threw', { error: String(err) }); }
    }
    return {
      sessionId: orphan.sessionId,
      artifactId: orphan.artifactId,
      status: 'interrupted',
      reason,
    };
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const terminalSessionRecovery = new TerminalSessionRecovery();
