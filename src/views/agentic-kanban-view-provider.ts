import { createLogger } from '../utils/logger';
const logger = createLogger('agentic-kanban-view-provider');
import * as vscode from 'vscode';
import { ArtifactStore } from '../state/artifact-store';
import { buildArtifacts } from '../canvas/artifact-transformer';
import { handleAgenticKanbanMessage, disposeAllTerminalStreams } from './agentic-kanban-message-handler';
import { getActiveChatSession } from '../chat/active-session';
import { kanbanProgress } from '../workflow/kanban-orchestrator';
import { getKanbanWipLimits } from '../workflow/kanban-settings';

import { errMsg } from '../utils/error';

/**
 * Webview provider for the Agentic Kanban — execution orchestration surface.
 *
 * This is a SEPARATE view from the Canvas, registered under its own view type
 * (`agileagentcanvas.agenticKanban`). It shares the same ArtifactStore but uses
 * mode-based routing in the React app (`window.__AC_MODE__ = 'agentic-kanban'`)
 * — same pattern as detail tabs.
 */
export class AgenticKanbanViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'agileagentcanvas.agenticKanban';

  private _view?: vscode.WebviewView;
  private store: ArtifactStore;
  /** Pending agent states pushed before the webview was ready (keyed by artifactId) */
  private pendingAgentStates = new Map<string, { agentState: any; lockInfo?: any }>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    store: ArtifactStore
  ) {
    this.store = store;

    // Listen to artifact changes and push to Kanban view.
    // No explicit dispose needed — ArtifactStore cleans up listeners on deactivation.
    this.store.onDidChangeArtifacts(() => {
      this.sendArtifacts();
    });

    // Forward orchestrator progress (running/completed/interrupted) so cards
    // show live agent badges during an autonomous auto-advance run.
    kanbanProgress.event((evt) => {
      this.sendAgentState(evt.artifactId, evt.agentState);
    });
  }

  /**
   * Push agent execution state to the Kanban webview from outside the provider
   * (e.g., during extension activation to restore interrupted sessions).
   */
  sendAgentState(
    artifactId: string,
    agentState: { status: 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'interrupted'; agentRole?: string; sessionId?: string; startedAt?: string; workflowId?: string; terminalId?: string },
    lockInfo?: { locked: boolean; agentName?: string; since?: string }
  ): void {
    // Buffer pending states so they can be replayed when the webview opens
    this.pendingAgentStates.set(artifactId, { agentState, lockInfo });

    if (!this._view) return;
    this._view.webview.postMessage({
      type: 'agentStateUpdated',
      artifactId,
      agentState,
      lockInfo,
    });
  }

  /**
   * Generic broadcast — sends an arbitrary message to the Agentic Kanban
   * webview (if visible). Used by the autonomy lifecycle to push state
   * updates (scheduler state, budget gauge, circuit-breaker status) that
   * don't have a dedicated method. Silently no-ops if the view is not open.
   */
  broadcast(message: any): void {
    if (!this._view) return;
    try {
      this._view.webview.postMessage(message);
    } catch (err) {
      logger.debug(`[AgenticKanbanProvider] broadcast failed: ${errMsg(err)}`);
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    logger.debug('[AgenticKanbanProvider] resolveWebviewView called');
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'build'),
      ],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      logger.debug(`[AgenticKanbanProvider] Received: ${message.type}`);

      if (await handleAgenticKanbanMessage(message, this.store, this.extensionUri, this._view?.webview)) {
        return;
      }

      // View-specific cases
      switch (message.type) {
        case 'agenticKanbanReady':
          this.sendArtifacts();
          // Replay pending agent states so interrupted/terminal cards
          // display their badges even if the states were pushed before
          // the webview was open (e.g., on startup restore).
          this.flushPendingAgentStates();
          // P1 #12: surface chat session availability so the Resume
          // button is disabled on initial load when no session exists.
          {
            const session = getActiveChatSession();
            this._view?.webview.postMessage({
              type: 'chatSessionState',
              active: !!(session?.model && session?.stream),
              model: session?.model?.label,
            });
          }
          // Send WIP limits from VS Code settings so the webview
          // replaces its hardcoded defaults.
          this._view?.webview.postMessage({
            type: 'kanban:wipLimits',
            limits: getKanbanWipLimits(),
          });
          break;
      }
    });

    // Send artifacts + replay pending agent states when view becomes visible
    // (e.g., after a webview crash/reload or the user switching back to this tab).
    // Artifacts are refreshed first, then agent states are overlaid so badges
    // survive the full replacement of items in the webview.
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.sendArtifacts();
        this.flushPendingAgentStates();
      }
    });

    // P0 #1 follow-up: when the webview is disposed, free every active
    // terminal stream listener so the module-level map doesn't leak
    // across webview reopens.
    webviewView.onDidDispose(() => {
      disposeAllTerminalStreams();
    });
  }

  private sendArtifacts(): void {
    if (!this._view) return;
    const artifacts = buildArtifacts(this.store, vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath);
    this._view.webview.postMessage({
      type: 'updateArtifacts',
      artifacts,
    });
  }

  private flushPendingAgentStates(): void {
    if (!this._view) return;
    for (const [artifactId, { agentState, lockInfo }] of this.pendingAgentStates) {
      this._view.webview.postMessage({
        type: 'agentStateUpdated',
        artifactId,
        agentState,
        lockInfo,
      });
    }

    // P1 #14: prune terminal + cap non-terminal entries so the buffer
    // doesn't grow unboundedly across long sessions. Terminal states
    // (completed/idle/failed) are removed after flush. Non-terminal
    // entries (running/queued/interrupted) are capped at 100 — when the
    // cap is exceeded, the oldest non-terminal entry is evicted.
    const terminalStates = new Set(['completed', 'idle', 'failed']);
    const MAX_PENDING = 100;

    // First pass: remove terminal states
    for (const [artifactId, { agentState }] of this.pendingAgentStates) {
      if (agentState.status && terminalStates.has(agentState.status)) {
        this.pendingAgentStates.delete(artifactId);
      }
    }

    // Second pass: if still over cap, evict the oldest non-terminal
    // entries. We iterate insertion order (Map preserves it) and remove
    // entries until we're at or below the cap.
    if (this.pendingAgentStates.size > MAX_PENDING) {
      const toEvict = this.pendingAgentStates.size - MAX_PENDING;
      let evicted = 0;
      for (const [artifactId] of this.pendingAgentStates) {
        if (evicted >= toEvict) break;
        this.pendingAgentStates.delete(artifactId);
        evicted++;
      }
      logger.debug(`[AgenticKanbanProvider] Evicted ${evicted} oldest pending agent state(s) to cap at ${MAX_PENDING}`);
    }
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
  <title>Agentic Kanban</title>
</head>
<body>
  <script>window.__AC_MODE__ = 'agentic-kanban';</script>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
