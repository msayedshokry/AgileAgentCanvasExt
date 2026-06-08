import { createLogger } from '../utils/logger';
const logger = createLogger('agentic-kanban-view-provider');
import * as vscode from 'vscode';
import { ArtifactStore } from '../state/artifact-store';
import { buildArtifacts } from '../canvas/artifact-transformer';
import { handleAgenticKanbanMessage } from './agentic-kanban-message-handler';

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

    // Prune terminal states so the buffer doesn't grow unboundedly. After
    // a flush, entries for artifacts that reached 'completed', 'idle', or
    // 'failed' are safe to remove — the webview has the latest state and
    // those don't need to survive future reloads.
    const terminalStates = new Set(['completed', 'idle', 'failed']);
    for (const [artifactId, { agentState }] of this.pendingAgentStates) {
      if (agentState.status && terminalStates.has(agentState.status)) {
        this.pendingAgentStates.delete(artifactId);
      }
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
