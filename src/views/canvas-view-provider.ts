import * as vscode from 'vscode';
import { ArtifactStore } from '../state/artifact-store';
import * as path from 'path';
import * as fs from 'fs';
import { acOutput } from '../extension';
import { loadElicitationMethods, loadBmmWorkflows } from '../commands/artifact-commands';
import { loadSampleProject } from '../commands/project-commands';
import { handleCommonWebviewMessage } from './webview-message-handler';
import { buildArtifacts } from '../canvas/artifact-transformer';

/**
 * Webview provider for the AgileAgentCanvas - Full panel view
 * This loads the React app for the visual canvas
 */
export class AgileAgentCanvasViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'agileagentcanvas.canvasView';
    
    private _view?: vscode.WebviewView;
    private store: ArtifactStore;
    private pendingArtifacts: any[] | null = null; // Queue artifacts if view not ready
    private _lastArtifacts: any[] = [];
    private _detailTabs = new Map<string, vscode.WebviewPanel>();

    constructor(
        private readonly extensionUri: vscode.Uri,
        store: ArtifactStore
    ) {
        this.store = store;
        acOutput.appendLine('[CanvasProvider] Constructor called');
        
        // Register store listener in constructor so it's always active
        // This way we catch artifact changes even before the view is opened
        this.store.onDidChangeArtifacts(() => {
            acOutput.appendLine(`[CanvasProvider] onDidChangeArtifacts fired, _view exists: ${!!this._view}`);
            this.sendArtifacts();
            this.sendArtifactsToDetailTabs();
        });
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        acOutput.appendLine('[CanvasProvider] resolveWebviewView called');
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'build')
            ]
        };

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            acOutput.appendLine(`[CanvasProvider] Received message: ${message.type}`);

            // Try the shared handler first (covers refineWithAI, breakDown,
            // enhanceWithAI, elicitWithMethod, startDevelopment, launchWorkflow,
            // updateArtifact, deleteArtifact, and future additions).
            if (await handleCommonWebviewMessage(message, this.store, this.extensionUri, '[CanvasProvider]', webviewView.webview)) {
                return;
            }

            // Host-specific cases that need access to this provider instance
            switch (message.type) {
                case 'ready':
                    // Webview is ready, send initial artifacts
                    acOutput.appendLine('[CanvasProvider] Webview ready, sending artifacts');
                    this.sendArtifacts();
                    // Also send any pending artifacts that were queued before view was ready
                    if (this.pendingArtifacts) {
                        acOutput.appendLine(`[CanvasProvider] Sending ${this.pendingArtifacts.length} pending artifacts`);
                        this._view?.webview.postMessage({
                            type: 'updateArtifacts',
                            artifacts: this.pendingArtifacts
                        });
                        this.pendingArtifacts = null;
                    }
                    // Send elicitation methods to webview
                    {
                        const methods = loadElicitationMethods(this.extensionUri);
                        acOutput.appendLine(`[CanvasProvider] Sending ${methods.length} elicitation methods to webview`);
                        this._view?.webview.postMessage({ type: 'elicitationMethods', methods });
                    }
                    // Send BMM workflows to webview — load from bundled extension resources
                    {
                        const bundledRoot = path.join(this.extensionUri.fsPath, 'resources');
                        const workflows = loadBmmWorkflows(bundledRoot);
                        acOutput.appendLine(`[CanvasProvider] Sending ${workflows.length} BMM workflows to webview`);
                        this._view?.webview.postMessage({ type: 'bmmWorkflows', workflows });
                    }
                    // Send current output format setting to webview
                    {
                        const outputFormat = vscode.workspace.getConfiguration('agileagentcanvas').get<string>('outputFormat', 'dual');
                        this._view?.webview.postMessage({ type: 'outputFormat', format: outputFormat });
                    }
                    // Send any load-time schema validation issues to webview
                    {
                        const issues = this.store.getLoadValidationIssues();
                        if (issues.length > 0) {
                            acOutput.appendLine(`[CanvasProvider] Sending ${issues.length} schema issue(s) to webview`);
                            this._view?.webview.postMessage({ type: 'schemaIssues', issues });
                        }
                    }
                    break;
                case 'addArtifact':
                    await this.handleAddArtifact(message.artifactType, message.parentId);
                    break;
                case 'selectArtifact':
                    // Update selection in the store so tree views and wizard steps refresh
                    if (message.id) {
                        let type = message.artifactType || 'epic';
                        if (!message.artifactType) {
                            if (message.id.startsWith('STORY-')) type = 'story';
                            else if (message.id.startsWith('FR-') || message.id.startsWith('REQ-')) type = 'requirement';
                            else if (message.id === 'vision-1') type = 'vision';
                            else if (message.id.startsWith('UC-')) type = 'use-case';
                            else if (message.id.startsWith('TC-')) type = 'test-case';
                            else if (message.id.startsWith('TS-')) type = 'test-strategy';
                        }
                        this.store.setSelectedArtifact(type, message.id);
                    } else {
                        this.store.clearSelection?.();
                    }
                    break;
                case 'reloadArtifacts':
                    await this.reloadFromDisk();
                    break;
                case 'switchProject':
                    vscode.commands.executeCommand('agileagentcanvas.switchProject');
                    break;
                case 'loadSampleProject':
                    await loadSampleProject(this.store, this.extensionUri);
                    break;
                case 'openDetailTab':
                    if (message.artifactId) {
                        this.openDetailTab(message.artifactId);
                    }
                    break;
            }
        });

        // Listen for visibility changes and send artifacts when view becomes visible
        webviewView.onDidChangeVisibility(() => {
            acOutput.appendLine(`[CanvasProvider] Visibility changed, visible: ${webviewView.visible}`);
            if (webviewView.visible) {
                this.sendArtifacts();
            }
        });
    }

    public notifyExternalChange(filePath: string): void {
        this._view?.webview.postMessage({
            type: 'externalArtifactsChanged',
            filePath
        });
    }

    /**
     * Send an arbitrary message to the canvas sidebar webview.
     * Used by extension.ts to forward resolver state (e.g. detectedProjectCount).
     */
    public postMessage(message: Record<string, unknown>): void {
        this._view?.webview.postMessage(message);
    }

    public revealArtifact(id: string): void {
        this._view?.webview.postMessage({ type: 'revealArtifact', id });
    }

    private async reloadFromDisk(): Promise<void> {
        let outputUri: any = null;
        try {
            const { getWorkspaceResolver } = require('../extension');
            const resolver = getWorkspaceResolver();
            outputUri = resolver?.getActiveOutputUri();
        } catch {
            // Resolver unavailable (e.g. test environment)
        }
        if (!outputUri) return;

        acOutput.appendLine('[CanvasProvider] Reloading artifacts from disk');
        await this.store.loadFromFolder(outputUri);
        acOutput.appendLine('[CanvasProvider] Reload complete');
    }

    private async handleAddArtifact(type: string, parentId?: string): Promise<void> {
        acOutput.appendLine(`[CanvasProvider] handleAddArtifact: type=${type}`);
        try {
            let newId: string;
            switch (type) {
                case 'product-brief': {
                    const a = this.store.createProductBrief();
                    newId = a.id;
                    break;
                }
                case 'prd': {
                    const a = this.store.createPRD();
                    newId = a.id;
                    break;
                }
                case 'architecture': {
                    const a = this.store.createArchitecture();
                    newId = a.id;
                    break;
                }
                case 'epic': {
                    const a = this.store.createEpic();
                    newId = a.id;
                    break;
                }
                case 'story': {
                    // Prefer explicit parentId from webview message; fall back to canvas selection
                    const epicId = parentId ?? (this.store.getSelectedArtifact()?.type === 'epic' ? this.store.getSelectedArtifact()!.id : undefined);
                    const a = this.store.createStory(epicId);
                    newId = a.id;
                    break;
                }
                case 'requirement': {
                    const a = this.store.createRequirement();
                    newId = a.id;
                    break;
                }
                case 'vision': {
                    this.store.createOrUpdateVision();
                    newId = 'vision-1';
                    break;
                }
                case 'use-case': {
                    // Prefer explicit parentId from webview message; fall back to canvas selection
                    const epicId = parentId ?? (this.store.getSelectedArtifact()?.type === 'epic' ? this.store.getSelectedArtifact()!.id : undefined);
                    const a = this.store.createUseCase(epicId);
                    newId = a.id;
                    break;
                }
                case 'test-case': {
                    // Prefer explicit parentId; fall back to selected story, then selected epic
                    const selected = this.store.getSelectedArtifact();
                    const storyId = parentId ?? (selected?.type === 'story' ? selected.id : undefined);
                    const epicIdForTC = storyId ? undefined : (selected?.type === 'epic' ? selected.id : undefined);
                    const a = this.store.createTestCase(storyId, epicIdForTC);
                    newId = a.id;
                    break;
                }
                case 'test-strategy': {
                    // Prefer explicit parentId; fall back to selected epic
                    const selected2 = this.store.getSelectedArtifact();
                    const epicIdForTS = parentId ?? (selected2?.type === 'epic' ? selected2.id : undefined);
                    const a = this.store.createTestStrategy(epicIdForTS);
                    newId = a.id;
                    break;
                }
                default:
                    acOutput.appendLine(`[CanvasProvider] Unknown artifact type: ${type}`);
                    vscode.window.showWarningMessage(`Cannot create artifact of type: ${type}`);
                    return;
            }
            this.store.setSelectedArtifact(type, newId);
            // sendArtifacts is triggered automatically via onDidChangeArtifacts listener
            this._view?.webview.postMessage({ type: 'selectAndEdit', id: newId, artifactType: type });
            acOutput.appendLine(`[CanvasProvider] Created and selected: ${type} ${newId}`);
        } catch (err) {
            acOutput.appendLine(`[CanvasProvider] Error creating artifact: ${err}`);
            vscode.window.showErrorMessage(`Failed to create ${type}: ${err}`);
        }
    }

    private sendArtifacts(): void {
        acOutput.appendLine(`[CanvasProvider] sendArtifacts called, _view exists: ${!!this._view}`);
        
        const state = this.store.getState();
        const storySummary = state.epics?.reduce((sum: number, e: any) => sum + (e.stories?.length || 0), 0) || 0;
        acOutput.appendLine(`[CanvasProvider] Store state - epics: ${state.epics?.length || 0}, stories: ${storySummary}`);
        
        // Transform state to artifact format for webview — delegate to the single
        // authoritative layout engine in artifact-transformer.ts.
        const artifacts = buildArtifacts(this.store);
        acOutput.appendLine(`[CanvasProvider] Transformed to ${artifacts.length} artifacts`);

        // Derive active folder name for the toolbar display
        let activeFolderName = '';
        try {
            const { getWorkspaceResolver } = require('../extension');
            const resolver = getWorkspaceResolver();
            const outputUri = resolver?.getActiveOutputUri();
            if (outputUri) {
                activeFolderName = outputUri.fsPath.replace(/\\/g, '/').split('/').pop() || '';
            }
        } catch {
            // Resolver unavailable (e.g. test environment)
        }
        
        if (!this._view) {
            acOutput.appendLine('[CanvasProvider] No view yet, queuing artifacts');
            this.pendingArtifacts = artifacts;
            return;
        }
        
        acOutput.appendLine(`[CanvasProvider] Posting ${artifacts.length} artifacts to webview`);
        this._lastArtifacts = artifacts;
        this._view.webview.postMessage({
            type: 'updateArtifacts',
            artifacts,
            activeFolderName
        });
    }

    /**
     * @deprecated Use buildArtifacts(store) from artifact-transformer.ts instead.
     * Kept as a thin wrapper so existing call-sites (openDetailTab,
     * sendArtifactsToDetailTabs) continue to compile unchanged.
     */
    private stateToArtifacts(_state: any): any[] {
        return buildArtifacts(this.store);
    }

    public showAICursor(targetId: string, action: string, label?: string): void {
        if (!this._view) return;

        // Look up the last-known position for the target artifact card
        const target = this._lastArtifacts.find((a: any) => a.id === targetId);
        const x = target ? target.position.x + Math.floor((target.size?.width || 260) / 2) : 100;
        const y = target ? target.position.y + Math.floor((target.size?.height || 80) / 2) : 100;

        this._view.webview.postMessage({
            type: 'aiCursorMove',
            cursor: {
                x,
                y,
                targetId,
                action,
                label
            }
        });
    }

    public hideAICursor(): void {
        if (!this._view) return;
        
        this._view.webview.postMessage({
            type: 'aiCursorHide'
        });
    }

    private openDetailTab(artifactId: string): void {
        // If tab already open for this artifact, just reveal it
        const existing = this._detailTabs.get(artifactId);
        if (existing) {
            existing.reveal(vscode.ViewColumn.Beside);
            return;
        }

        // Look up artifact title for the tab label
        const artifacts = this.stateToArtifacts(this.store.getState());
        const artifact = artifacts.find((a: any) => a.id === artifactId);
        const title = artifact ? `Detail: ${artifact.title || artifactId}` : `Detail: ${artifactId}`;

        const panel = vscode.window.createWebviewPanel(
            'agileagentcanvas.detailTab',
            title,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'build')
                ],
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getDetailTabHtml(panel.webview, artifactId);

        // Handle messages from the detail tab — delegate common cases to shared handler
        panel.webview.onDidReceiveMessage(async (message) => {
            acOutput.appendLine(`[DetailTab:${artifactId}] Received message: ${message.type}`);

            // Shared handler covers updateArtifact, deleteArtifact, refineWithAI,
            // breakDown, enhanceWithAI, elicitWithMethod, startDevelopment, launchWorkflow.
            if (await handleCommonWebviewMessage(message, this.store, this.extensionUri, `[DetailTab:${artifactId}]`, panel.webview)) {
                return;
            }

            // Detail-tab-specific cases
            switch (message.type) {
                case 'ready':
                    // Send the artifact + all artifacts to the tab
                    {
                        const allArtifacts = this.stateToArtifacts(this.store.getState());
                        const art = allArtifacts.find((a: any) => a.id === artifactId);
                        if (art) {
                            panel.webview.postMessage({
                                type: 'loadArtifact',
                                artifact: art,
                                allArtifacts
                            });
                        }
                    }
                    break;
                case 'closeDetailTab':
                    panel.dispose();
                    break;
            }
        });

        // Clean up when panel is closed
        panel.onDidDispose(() => {
            this._detailTabs.delete(artifactId);
            acOutput.appendLine(`[DetailTab:${artifactId}] Panel disposed`);
        });

        this._detailTabs.set(artifactId, panel);
        acOutput.appendLine(`[CanvasProvider] Opened detail tab for: ${artifactId}`);
    }

    private sendArtifactsToDetailTabs(): void {
        if (this._detailTabs.size === 0) return;
        const allArtifacts = this.stateToArtifacts(this.store.getState());
        for (const [artifactId, panel] of this._detailTabs) {
            const art = allArtifacts.find((a: any) => a.id === artifactId);
            if (art) {
                panel.webview.postMessage({
                    type: 'loadArtifact',
                    artifact: art,
                    allArtifacts
                });
            }
        }
    }

    private getDetailTabHtml(webview: vscode.Webview, artifactId: string): string {
        const buildPath = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'build');
        const indexPath = vscode.Uri.joinPath(buildPath, 'index.html');

        if (!fs.existsSync(indexPath.fsPath)) {
            return this.getFallbackHtml(webview);
        }

        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(buildPath, 'assets', 'index.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(buildPath, 'assets', 'index.css')
        );

        // Inject mode + id so the React app boots into detail-only mode
        const safeId = artifactId.replace(/['"\\<>]/g, '');
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:;">
            <link rel="stylesheet" href="${styleUri}">
<title>AgileAgentCanvas Detail</title>
        </head>
        <body>
            <script>window.__AC_MODE__ = 'detail'; window.__AC_DETAIL_ID__ = '${safeId}';</script>
            <div id="root"></div>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    private getHtmlContent(webview: vscode.Webview): string {
        // Check if built React app exists
        const buildPath = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'build');
        const indexPath = vscode.Uri.joinPath(buildPath, 'index.html');
        
        acOutput.appendLine(`[CanvasProvider] Looking for build at: ${buildPath.fsPath}`);
        
        try {
            // Check if index.html exists
            if (!fs.existsSync(indexPath.fsPath)) {
                acOutput.appendLine('[CanvasProvider] Build not found, showing fallback');
                return this.getFallbackHtml(webview);
            }
            
            acOutput.appendLine('[CanvasProvider] Build found, loading React app');
            
            // Get URIs for assets
            const scriptUri = webview.asWebviewUri(
                vscode.Uri.joinPath(buildPath, 'assets', 'index.js')
            );
            const styleUri = webview.asWebviewUri(
                vscode.Uri.joinPath(buildPath, 'assets', 'index.css')
            );
            
            acOutput.appendLine(`[CanvasProvider] Script URI: ${scriptUri.toString()}`);
            acOutput.appendLine(`[CanvasProvider] Style URI: ${styleUri.toString()}`);
            
            // Return modified HTML with correct URIs
            return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource}; img-src ${webview.cspSource} data: blob:; frame-src 'self' blob:;">
                <link rel="stylesheet" href="${styleUri}">
                <title>AgileAgentCanvas</title>
            </head>
            <body>
                <div id="root"></div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
        } catch (e) {
            // Fallback to simple inline HTML if build doesn't exist
            acOutput.appendLine(`[CanvasProvider] Error loading build: ${e}`);
            return this.getFallbackHtml(webview);
        }
    }

    private getFallbackHtml(_webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 200px;
                }
                .error { color: var(--vscode-errorForeground); }
                .instruction { 
                    margin-top: 16px;
                    padding: 12px;
                    background: var(--vscode-textBlockQuote-background);
                    border-radius: 4px;
                    font-family: monospace;
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            <div class="error">⚠️ Canvas not built</div>
            <p>Run the following command to build the canvas UI:</p>
            <div class="instruction">
                cd bmad-vscode/webview-ui && npm install && npm run build
            </div>
        </body>
        </html>`;
    }
}
