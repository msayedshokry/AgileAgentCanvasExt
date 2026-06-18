// ─── Agent Sessions Sidebar ─────────────────────────────────────────────────
// A 3rd webview section in the explorer container (alongside the existing
// "Artifacts" tree and "Workflow Progress" tree). Wires up live data from
// four sources and pushes the snapshot to the React frontend so the user
// can see running/queued/failed sessions at a glance.
//
// Sources (all public APIs only):
//   • AcpSessionManager.listSessions() — multi-agent team sessions
//   • agentHealthMonitor.listAllSessions() — per-session healthy/degraded/dead
//   • terminalExecutor.findOrphanedSessions() — active terminal-driven runs
//   • kanbanProgress (EventEmitter) — live updates trigger a re-snapshot
//
// The extension pushes a snapshot on `agentSessionsReady` and incremental
// updates on `agentSessionsUpdate`. The webview never asks, it just renders.

import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { errMsg } from '../utils/error';
import { acpSessionManager, type AcpSession } from '../acp/session-manager';
import { agentHealthMonitor } from '../workflow/agent-health-monitor';
import { kanbanProgress } from '../workflow/kanban-orchestrator';
import { terminalExecutor } from '../workflow/terminal-executor';

const logger = createLogger('agent-sessions-view-provider');

/**
 * One row visible in the sidebar panel. Covers ACP-style multi-agent
 * sessions, health-monitor-tracked sessions, and the simpler kanban-progress
 * lane rows that come out of a card drop. Terminal-driven runs come from
 * terminalExecutor. The view code is intentionally unified so users see a
 * single list, sorted by recency.
 */
export interface AgentSessionRow {
  id: string;
  /** Where this row came from — useful for filtering and empty states. */
  source: 'acp' | 'kanban-progress' | 'terminal' | 'health';
  /** Friendly status pill text. */
  status: string;
  /** Normalized status for the CSS pill class — keep stable. */
  statusKey:
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'interrupted'
    | 'queued'
    | 'idle'
    | 'healthy'
    | 'degraded'
    | 'dead';
  /** Agent role from AcpSessionSpec.role OR the orchestrator role chip. */
  agentRole?: string;
  /** Workflow ID (e.g. `dev-story`, `code-review`) for context. */
  workflowId?: string;
  /** Artifact this session is acting on (Story/Epic/PRD id). */
  artifactId?: string;
  /** ISO start timestamp. */
  startedAt?: string;
  /** ISO end timestamp (terminal states only). */
  endedAt?: string;
  /** Tool-call count when known. Used for summary. */
  toolCalls?: number;
  /** 12-bucket rolling activity sparkline (counts per 5s window). */
  sparkline?: number[];
  /** Terminal session ID — when present the row is open in a terminal. */
  terminalId?: string;
  /** Last event/transition message for tooltip. */
  lastMessage?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SPARKLINE_BUCKETS = 12;
const SPARKLINE_WINDOW_MS = 5_000;

/** Build a stable status key for CSS class lookup. */
function normalizeStatus(raw: string | undefined): AgentSessionRow['statusKey'] {
  const v = (raw ?? '').toLowerCase();
  if (v === 'running' || v === 'pending') return 'running';
  if (v === 'completed' || v === 'complete') return 'completed';
  if (v === 'failed' || v === 'error') return 'failed';
  if (v === 'cancelled' || v === 'canceled') return 'cancelled';
  if (v === 'interrupted' || v === 'interrupt') return 'interrupted';
  if (v === 'queued' || v === 'wait') return 'queued';
  if (v === 'idle') return 'idle';
  if (v === 'healthy' || v === '') return 'healthy';
  if (v === 'degraded') return 'degraded';
  if (v === 'dead') return 'dead';
  return 'idle';
}

/**
 * Project an AcpSession into a row. Uses the in-memory `events` array
 * (kept short by ACP — caps at the size we care about for skill runs).
 *
 * `AcpSessionSpec.context.workflowId` is typed on the canonical spec (see
 * `src/acp/types.ts`) so we can read it directly without a local cast.
 */
function fromAcpSession(session: AcpSession): AgentSessionRow {
  const last = session.events[session.events.length - 1];
  const status = session.status;
  const toolCalls = session.events.filter((e) => e.type === 'tool_call').length;
  return {
    id: session.id,
    source: 'acp',
    status: status.charAt(0).toUpperCase() + status.slice(1),
    statusKey: normalizeStatus(status),
    agentRole: session.spec.role,
    workflowId: session.spec.context.workflowId,
    artifactId: session.spec.context.artifact?.id,
    startedAt: session.createdAt.toISOString(),
    endedAt: status === 'completed' || status === 'failed' || status === 'cancelled'
      ? new Date().toISOString()
      : undefined,
    toolCalls,
    sparkline: makeSparklineFromToolEvents(session),
    lastMessage: last ? `${last.type}${last.data?.error ? `: ${last.data.error}` : ''}` : undefined,
  };
}

/**
 * Compute a 12-bucket sparkline from the session's tool-call events,
 * bucketed into 5-second windows. Empty buckets are zero. The most
 * recent bucket is the rightmost bar.
 */
function makeSparklineFromToolEvents(session: AcpSession): number[] {
  const buckets = new Array(SPARKLINE_BUCKETS).fill(0) as number[];
  const calls = session.events.filter((e) => e.type === 'tool_call');
  if (calls.length === 0) return buckets;
  const start = session.createdAt.getTime();
  for (const e of calls) {
    const ts = Date.parse((e as { timestamp?: string }).timestamp ?? '');
    if (Number.isNaN(ts)) continue;
    const offset = Math.floor((ts - start) / SPARKLINE_WINDOW_MS);
    if (offset >= 0 && offset < SPARKLINE_BUCKETS) {
      buckets[offset]++;
    } else if (offset >= SPARKLINE_BUCKETS) {
      // Late event — roll up into the most-recent bucket so the chart
      // doesn't quietly lose activity from earlier than the window.
      buckets[SPARKLINE_BUCKETS - 1]++;
    }
  }
  return buckets;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export class AgentSessionsViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'agileagentcanvas.agentSessions';

  private _view?: vscode.WebviewView;
  /** Periodic refresh so the sidebar doesn't go stale when sources are quiet. */
  private periodicRefresh?: ReturnType<typeof setInterval>;
  /** Disposables for cross-singleton listeners — cleared on dispose so
   *  we don't leak listeners if the view is repeatedly torn down. */
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {
    // Listen to orchestrator progress events (lane transitions → in-progress
    // runs). Re-emitting a full snapshot on each event is fine because the
    // row count is bounded (≤100) and the message is small.
    this.disposables.push(
      kanbanProgress.event(() => this.sendSnapshot()),
    );

    // Re-emit whenever agent health transitions happen so the dead/degraded
    // pill flips immediately for live sessions. AgentHealthMonitor extends
    // Node's EventEmitter (`on()` returns `this`, not a Disposable), so we
    // keep the handler reference and unwrap removal in our own disposable.
    const onHealthTransition = () => this.sendSnapshot();
    agentHealthMonitor.on('transition', onHealthTransition);
    this.disposables.push({
      dispose: () => { agentHealthMonitor.off('transition', onHealthTransition); },
    });

    // 30s heartbeat covers the gap when nothing fires for a while.
    this.periodicRefresh = setInterval(() => this.sendSnapshot(), 30_000);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    logger.debug('[AgentSessionsProvider] resolveWebviewView called');
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'build'),
      ],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      logger.debug(`[AgentSessionsProvider] Received: ${message.type}`);
      switch (message.type) {
        case 'agentSessionsReady':
          // Webview reports it's mounted — push initial snapshot.
          this.sendSnapshot();
          break;
        case 'openTerminalForSession':
          await this.handleOpenTerminal(message.artifactId);
          break;
        case 'openTraceForSession':
          await this.handleOpenTrace(message.sessionId);
          break;
        case 'discardSession':
          this.handleDiscardSession(message.sessionId, message.source);
          break;
        default:
          // Ignore unknown messages so future additions don't break old webviews.
          break;
      }
    });

    // Replay snapshot when the view becomes visible (e.g. panel tab refocus).
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.sendSnapshot();
      }
    });

    // Free the periodic refresh on dispose so we don't leak across reloads.
    webviewView.onDidDispose(() => {
      this.disposeViewResources();
    });
  }

  /**
   * Tear down the heartbeat and the singleton listeners. Safe to call
   * multiple times. Implemented as a Dispose method so callers can also
   * push this provider onto `context.subscriptions` to clean up on
   * extension deactivation.
   */
  private disposeViewResources(): void {
    if (this.periodicRefresh) {
      clearInterval(this.periodicRefresh);
      this.periodicRefresh = undefined;
    }
    for (const d of this.disposables) {
      try { d.dispose(); } catch { /* listener already torn down */ }
    }
    this.disposables = [];
    this._view = undefined;
  }

  dispose(): void {
    this.disposeViewResources();
  }

  /**
   * Build the snapshot and push every visible row to the webview. The row
   * count is bounded (≤100) so a full repaint is fine — no need for
   * incremental diffs.
   */
  private sendSnapshot(): void {
    if (!this._view) return;
    try {
      const rows = this.collectRows();
      this._view.webview.postMessage({
        type: 'agentSessionsUpdate',
        rows,
        counts: {
          running: rows.filter((r) => r.statusKey === 'running').length,
          queued: rows.filter((r) => r.statusKey === 'queued').length,
          completed: rows.filter((r) => r.statusKey === 'completed').length,
          failed: rows.filter((r) =>
            r.statusKey === 'failed' || r.statusKey === 'cancelled' || r.statusKey === 'interrupted'
          ).length,
          degraded: rows.filter((r) =>
            r.statusKey === 'degraded' || r.statusKey === 'dead'
          ).length,
          total: rows.length,
        },
      });
    } catch (err) {
      logger.debug(`[AgentSessionsProvider] sendSnapshot failed: ${errMsg(err)}`);
    }
  }

  /**
   * Pull rows from every available source. Rows are unified into a single
   * sorted list. Sources are public APIs only — no private map probing.
   */
  private collectRows(): AgentSessionRow[] {
    const rows: AgentSessionRow[] = [];
    const acpIds = new Set<string>();

    // 1. ACP multi-agent team sessions (via the public listSessions() accessor).
    try {
      if (acpSessionManager) {
        for (const session of acpSessionManager.listSessions()) {
          acpIds.add(session.id);
          rows.push(fromAcpSession(session));
        }
      }
    } catch (err) {
      logger.debug(`[AgentSessionsProvider] ACP list failed: ${errMsg(err)}`);
    }

    // 2. Agent Health Monitor — surface every tracked session, deduping
    //    against ACP (a session can be in both views during a team run).
    for (const session of agentHealthMonitor.listAllSessions()) {
      const row: AgentSessionRow = {
        id: `health:${session.sessionId}`,
        source: 'health',
        status: session.currentState.charAt(0).toUpperCase() + session.currentState.slice(1),
        statusKey: normalizeStatus(session.currentState),
        startedAt: new Date(session.lastTransitionAt).toISOString(),
        lastMessage: `${session.checks.size} health check(s)`,
      };
      // Drop health rows that are duplicates of an ACP row for the same session.
      if (!acpIds.has(session.sessionId)) {
        rows.push(row);
      }
    }

    // 3. Terminal-driven runs (headless CLI agents without an ACP parent).
    try {
      for (const term of terminalExecutor.findOrphanedSessions()) {
        const row: AgentSessionRow = {
          id: `term:${term.sessionId}`,
          source: 'terminal',
          status: 'Running',
          statusKey: 'running',
          artifactId: term.artifactId,
          terminalId: term.sessionId,
          startedAt: new Date(term.startedAt).toISOString(),
          lastMessage: term.name,
        };
        rows.push(row);
      }
    } catch (err) {
      logger.debug(`[AgentSessionsProvider] Terminal list failed: ${errMsg(err)}`);
    }

    // Sort: running first, then by recency. Stable so React doesn't
    // re-shuffle unrelated rows on every refresh.
    rows.sort((a, b) => {
      const aLive = a.statusKey === 'running' || a.statusKey === 'queued' ? 0 : 1;
      const bLive = b.statusKey === 'running' || b.statusKey === 'queued' ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      const aT = a.startedAt ? Date.parse(a.startedAt) : 0;
      const bT = b.startedAt ? Date.parse(b.startedAt) : 0;
      return bT - aT;
    });

    // Cap at 100 rows so the sidebar never gets unwieldy.
    return rows.slice(0, 100);
  }

  /** Reveal the terminal that owns an artifact (if any). */
  private async handleOpenTerminal(artifactId: string | undefined): Promise<void> {
    if (!artifactId) {
      vscode.window.showInformationMessage('No artifact is associated with this session.');
      return;
    }
    const focused = terminalExecutor.jumpToTerminal(artifactId);
    if (!focused) {
      vscode.window.showInformationMessage('No live terminal for this session.');
    }
  }

  /** Delegate to the existing trace viewer command for a consistent UX. */
  private async handleOpenTrace(sessionId: string | undefined): Promise<void> {
    if (!sessionId) {
      vscode.window.showInformationMessage('No session ID available.');
      return;
    }
    vscode.commands.executeCommand('agileagentcanvas.openTraceViewer', sessionId);
  }

  /**
   * Best-effort "discard" — kill the underlying terminal and release
   * the concurrency lock. ACP sessions can't be cancelled from here
   * (they're driven by the host chat session), so we only show a hint.
   */
  private handleDiscardSession(sessionId: string | undefined, source: string | undefined): void {
    if (!sessionId) return;
    if (source === 'terminal') {
      const artifactId = terminalExecutor.getArtifactIdForSession(sessionId);
      if (artifactId) {
        terminalExecutor.killTerminal(artifactId);
        return;
      }
    } else if (source === 'acp') {
      vscode.commands.executeCommand('agileagentcanvas.openTraceViewer', sessionId);
      return;
    }
    vscode.window.showInformationMessage(
      'Discard is supported only for terminal-driven and ACP-team sessions. For chat-driven sessions, cancel via the chat panel.'
    );
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const buildPath = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'build');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(buildPath, 'assets', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(buildPath, 'assets', 'index.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Agent Sessions</title>
</head>
<body>
  <script>window.__AC_MODE__ = 'agent-sessions';</script>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
