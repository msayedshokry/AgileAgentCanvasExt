import * as vscode from 'vscode';
import { AgentCanvasChatParticipant } from './chat/chat-participant';
import { ArtifactsTreeProvider } from './views/artifacts-tree-provider';
import { WizardStepsProvider } from './views/wizard-steps-provider';
import { ArtifactStore } from './state/artifact-store';
import { WorkspaceResolver } from './state/workspace-resolver';
import { getWorkflowExecutor } from './workflow/workflow-executor';
import { sendArtifactsToPanel, buildArtifacts } from './canvas/artifact-transformer';
import { registerTools, sharedToolContext } from './chat/agentcanvas-tools';
import {
    handleAddArtifact,
    loadElicitationMethods,
    loadBmmWorkflows,
    exportArtifacts,
    importArtifacts,
    syncToFiles,
    goToStep,
    selectArtifact
} from './commands/artifact-commands';
import { handleCommonWebviewMessage } from './views/webview-message-handler';
import {
    createNewProject,
    loadExistingProject,
    loadDemoData,
    loadSampleProject
} from './commands/project-commands';
import { executeWorkflowStep } from './commands/workflow-commands';
import { installToIde, autoInstallIfNeeded } from './commands/ide-installer';
import { openChat, setChatBridgeLogger } from './commands/chat-bridge';

let artifactStore: ArtifactStore;
let workspaceResolver: WorkspaceResolver;
let fileWatcher: vscode.FileSystemWatcher | undefined;
let folderDeleteCheckTimer: ReturnType<typeof setTimeout> | undefined;
let externalChangeReloadTimer: ReturnType<typeof setTimeout> | undefined;
const openCanvasPanels: vscode.WebviewPanel[] = [];
const detailTabs = new Map<string, vscode.WebviewPanel>();

// Output channel for AgentCanvas logs (visible in Output panel)
export const acOutput = vscode.window.createOutputChannel('Agile Agent Canvas');

/**
 * Singleton accessor for the workspace resolver.
 * Used by other modules (project-commands, artifact-store, etc.) that need
 * the active project folder without importing the instance directly.
 */
export function getWorkspaceResolver(): WorkspaceResolver {
    return workspaceResolver;
}

export function activate(context: vscode.ExtensionContext) {
    acOutput.appendLine('Agile Agent Canvas is now active!');
    acOutput.show(); // Show the output panel

    // Wire chat-bridge logging into the shared output channel
    setChatBridgeLogger((msg) => acOutput.appendLine(msg));
    console.log('Agile Agent Canvas is now active!');
    vscode.window.showInformationMessage('Agile Agent Canvas activated!');

    // Initialize the artifact store (shared state)
    artifactStore = new ArtifactStore(context);

    // Initialize the shared tool context and register tools ONCE.
    // chat-participant.ts and workflow-executor.ts mutate sharedToolContext
    // fields (bmadPath, outputPath, store) in place instead of re-registering.
    sharedToolContext.store = artifactStore;
    const toolDisposables = registerTools(sharedToolContext);
    context.subscriptions.push(...toolDisposables);

    // Register the Copilot Chat participant — pass extensionContext for bundled _bmad path + tool registration
    // vscode.chat is only available when a Copilot-compatible extension is installed.
    // Guard so the extension still activates (canvas, tree views, commands) without it.
    if (vscode.chat?.createChatParticipant) {
        const chatParticipant = new AgentCanvasChatParticipant(artifactStore, context);
        context.subscriptions.push(
            vscode.chat.createChatParticipant('agentcanvas.analyst', chatParticipant.handleChat.bind(chatParticipant))
        );
    } else {
        acOutput.appendLine('[Activate] vscode.chat API not available — chat participant not registered. Install GitHub Copilot for full functionality.');
    }

    // Register tree views
    const artifactsTreeProvider = new ArtifactsTreeProvider(artifactStore);
    const wizardStepsProvider = new WizardStepsProvider(artifactStore);
    
    context.subscriptions.push(
        vscode.window.createTreeView('agentcanvas.artifactsTree', {
            treeDataProvider: artifactsTreeProvider,
            showCollapseAll: true
        }),
        vscode.window.createTreeView('agentcanvas.wizardSteps', {
            treeDataProvider: wizardStepsProvider
        })
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('agentcanvas.openCanvas', () => {
            return openCanvasPanel(context, artifactStore);
        }),
        vscode.commands.registerCommand('agentcanvas.newProject', () => {
            return createNewProject(artifactStore);
        }),
        vscode.commands.registerCommand('agentcanvas.loadProject', () => {
            return loadExistingProject(artifactStore);
        }),
        vscode.commands.registerCommand('agentcanvas.exportArtifacts', () => {
            return exportArtifacts(artifactStore);
        }),
        vscode.commands.registerCommand('agentcanvas.importArtifacts', () => {
            return importArtifacts(artifactStore);
        }),
        vscode.commands.registerCommand('agentcanvas.syncToFiles', () => {
            return syncToFiles(artifactStore);
        }),
        vscode.commands.registerCommand('agentcanvas.goToStep', (stepId: string) => {
            return goToStep(stepId, artifactStore);
        }),
        vscode.commands.registerCommand('agentcanvas.selectArtifact', (type: string, id: string) => {
            selectArtifact(type, id, artifactStore);
            // Reveal the artifact on all open canvas panels
            openCanvasPanels.forEach(panel => {
                panel.webview.postMessage({ type: 'revealArtifact', id });
            });
        }),
        vscode.commands.registerCommand('agentcanvas.loadDemoData', () => {
            return loadDemoData(artifactStore);
        }),
        // Workflow session commands (triggered by chat buttons)
        vscode.commands.registerCommand('agentcanvas.continueWorkflow', (sessionId?: string) => {
            return openChat(`@agentcanvas /continue`);
        }),
        vscode.commands.registerCommand('agentcanvas.workflowStatus', (sessionId?: string) => {
            return openChat(`@agentcanvas /status`);
        }),
        vscode.commands.registerCommand('agentcanvas.cancelWorkflow', (sessionId?: string) => {
            const executor = getWorkflowExecutor();
            executor.cancelSession();
            vscode.window.showInformationMessage('Workflow session cancelled.');
        }),
        // Execute a specific workflow step with dependency checking
        vscode.commands.registerCommand('agentcanvas.executeWorkflowStep', async (
            artifactType: string,
            artifactId: string,
            stepId: string,
            chatCommand: string,
            dependsOn?: string[],
            completionStatus?: Record<string, string>
        ) => {
            await executeWorkflowStep(artifactType, artifactId, stepId, chatCommand, dependsOn, completionStatus, artifactStore);
        }),
        // Install BMAD framework to IDE (Cursor, Claude Code, Windsurf, Copilot, Antigravity)
        vscode.commands.registerCommand('agentcanvas.installToIde', () => {
            return installToIde(context.extensionPath);
        }),
        // Open the IDE chat panel (IDE-agnostic, optionally with a pre-filled query)
        vscode.commands.registerCommand('agentcanvas.openChatPanel', (query?: string) => {
            return openChat(query);
        }),
        // Ask Agent — open the Ask modal on the canvas (triggered by Ctrl+Shift+A)
        vscode.commands.registerCommand('agentcanvas.askAgent', () => {
            // Post to all open canvas panels; the webview will open the Ask modal
            openCanvasPanels.forEach(panel => {
                panel.webview.postMessage({ type: 'openAskModal' });
            });
            // If no canvas is open, open one first then trigger the modal
            if (openCanvasPanels.length === 0) {
                openCanvasPanel(context, artifactStore).then(() => {
                    // Give the panel a moment to initialize before sending the message
                    setTimeout(() => {
                        openCanvasPanels.forEach(panel => {
                            panel.webview.postMessage({ type: 'openAskModal' });
                        });
                    }, 500);
                });
            }
        })
    );

    // Listen for artifact changes and update views
    artifactStore.onDidChangeArtifacts(() => {
        artifactsTreeProvider.refresh();
        wizardStepsProvider.refresh();
    });

    // ── Workspace resolver: centralized active-project management ───────
    workspaceResolver = new WorkspaceResolver(context);
    context.subscriptions.push(workspaceResolver);

    // Initialize resolver (checks workspaceState, scans folders, shows picker if needed)
    // then auto-load artifacts from the resolved folder.
    workspaceResolver.initialize().then(async () => {
        const outputUri = workspaceResolver.getActiveOutputUri();
        if (outputUri) {
            try {
                await vscode.workspace.fs.stat(outputUri);
                await artifactStore.loadFromFolder(outputUri);
                acOutput.appendLine(`[Activate] Auto-loaded project from: ${outputUri.fsPath}`);
            } catch {
                acOutput.appendLine(`[Activate] Output folder not found (new project?): ${outputUri.fsPath}`);
            }
        }

        // Set up the file watcher AFTER the resolver has determined the active folder
        setupFileWatcher(artifactStore, context, (filePath) => {
            if (artifactStore.isSyncing()) {
                acOutput.appendLine(`[FileWatcher] Suppressed self-write notification: ${filePath}`);
                return;
            }
            // Notify webview of external change (shows reload badge)
            openCanvasPanels.forEach(panel => {
                panel.webview.postMessage({ type: 'externalArtifactsChanged', filePath });
            });
            // Auto-reload store from disk (debounced — waits for all changes to settle)
            scheduleStoreReload(artifactStore);
        });

        // Send detected project count to all open canvas panels (for switch button visibility)
        const detected = workspaceResolver.getDetectedProjects();
        openCanvasPanels.forEach(panel => {
            panel.webview.postMessage({ type: 'detectedProjectCount', count: detected.length });
        });
    });

    // React to project switches — reload store & re-point file watcher
    workspaceResolver.onDidChangeActiveProject(async (project) => {
        acOutput.appendLine(`[WorkspaceResolver] Project switched: ${project?.outputUri.fsPath ?? 'none'}`);
        artifactStore.clearProject();

        if (project) {
            try {
                await vscode.workspace.fs.stat(project.outputUri);
                await artifactStore.loadFromFolder(project.outputUri);
            } catch {
                acOutput.appendLine(`[WorkspaceResolver] New project folder doesn't exist yet: ${project.outputUri.fsPath}`);
            }
        }

        // Re-point file watcher
        resetFileWatcher(artifactStore, context, (filePath) => {
            if (artifactStore.isSyncing()) {
                acOutput.appendLine(`[FileWatcher] Suppressed self-write notification: ${filePath}`);
                return;
            }
            openCanvasPanels.forEach(panel => {
                panel.webview.postMessage({ type: 'externalArtifactsChanged', filePath });
            });
            scheduleStoreReload(artifactStore);
        });

        // Update canvas with new project count
        const detected = workspaceResolver.getDetectedProjects();
        openCanvasPanels.forEach(panel => {
            panel.webview.postMessage({ type: 'detectedProjectCount', count: detected.length });
        });
    });

    // Listen for workspace folder additions/removals
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(async (e) => {
            await workspaceResolver.onWorkspaceFoldersChanged(e);
        })
    );

    // Register the switch-project command
    context.subscriptions.push(
        vscode.commands.registerCommand('agentcanvas.switchProject', async () => {
            const switched = await workspaceResolver.promptSwitchProject();
            if (switched) {
                vscode.window.showInformationMessage(
                    `Switched to: ${workspaceResolver.getActiveProject()?.label ?? 'unknown'}`
                );
            }
        })
    );

    // Auto-install BMAD agents for the detected IDE (silent, only on first activation)
    autoInstallIfNeeded(context.extensionPath);
}

async function openCanvasPanel(context: vscode.ExtensionContext, store: ArtifactStore) {
    const panel = vscode.window.createWebviewPanel(
        'agentcanvasCanvas',
        'Agile Agent Canvas',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'build')
            ]
        }
    );

    panel.webview.html = getCanvasWebviewContent(panel.webview, context.extensionUri);

    openCanvasPanels.push(panel);
    panel.onDidDispose(() => {
        const index = openCanvasPanels.indexOf(panel);
        if (index >= 0) {
            openCanvasPanels.splice(index, 1);
        }
    });

    // Set up message passing between webview and extension
    panel.webview.onDidReceiveMessage(
        async (message) => {
            console.log('Extension received message from webview:', message.type);

            // Shared handler covers updateArtifact, deleteArtifact, refineWithAI,
            // breakDown, enhanceWithAI, elicitWithMethod, startDevelopment, launchWorkflow.
            if (await handleCommonWebviewMessage(message, store, context.extensionUri, '[Panel]', panel.webview)) {
                return;
            }

            // Host-specific cases that need panel or context references
            switch (message.type) {
                case 'ready':
                    // React app is ready, send artifacts
                    console.log('Webview ready, sending artifacts...');
                    sendArtifactsToPanel(panel, store);
                    // Send elicitation methods (bundled with extension)
                    {
                        const methods = loadElicitationMethods(context.extensionUri);
                        acOutput.appendLine(`[Panel] Sending ${methods.length} elicitation methods to webview`);
                        panel.webview.postMessage({ type: 'elicitationMethods', methods });
                    }
                    // Send BMM workflows (bundled with extension under resources/)
                    {
                        const workflows = loadBmmWorkflows(context.extensionUri.fsPath + '/resources');
                        acOutput.appendLine(`[Panel] Sending ${workflows.length} BMM workflows to webview`);
                        panel.webview.postMessage({ type: 'bmmWorkflows', workflows });
                    }
                    // Send current output format setting to webview
                    {
                        const outputFormat = vscode.workspace.getConfiguration('agentcanvas').get<string>('outputFormat', 'dual');
                        panel.webview.postMessage({ type: 'outputFormat', format: outputFormat });
                    }
                    // Send any load-time schema validation issues to webview
                    {
                        const issues = store.getLoadValidationIssues();
                        if (issues.length > 0) {
                            acOutput.appendLine(`[Panel] Sending ${issues.length} schema issue(s) to webview`);
                            panel.webview.postMessage({ type: 'schemaIssues', issues });
                        }
                    }
                    break;
                case 'addArtifact':
                    // Handle adding new artifacts - create, select, and open in edit mode
                    await handleAddArtifact(message.artifactType, panel, store);
                    break;
                case 'selectArtifact':
                    // Handle artifact selection - update the store to trigger workflow panel refresh
                    if (message.id) {
                        // Determine type by looking up the artifact in the store (covers all types)
                        const found = store.findArtifactById(message.id);
                        const type = found?.type ?? 'epic';
                        selectArtifact(type, message.id, store);
                    } else {
                        store.clearSelection();
                    }
                    break;
                case 'reloadArtifacts':
                    await reloadArtifactsFromDisk(store);
                    break;
                case 'loadSampleProject':
                    await loadSampleProject(store, context.extensionUri);
                    break;
                case 'openDetailTab':
                    if (message.artifactId) {
                        openDetailTab(message.artifactId, context, store);
                    }
                    break;
            }
        },
        undefined,
        context.subscriptions
    );

    // Update webview when artifacts change; dispose listener when panel closes
    const artifactSubscription = store.onDidChangeArtifacts(() => {
        sendArtifactsToPanel(panel, store);
    });
    panel.onDidDispose(() => {
        artifactSubscription.dispose();
    }, null, context.subscriptions);

    // Also send artifacts after a short delay (in case 'ready' message is missed)
    const sendTimeout = setTimeout(() => {
        sendArtifactsToPanel(panel, store);
    }, 500);
    panel.onDidDispose(() => {
        clearTimeout(sendTimeout);
    }, null, context.subscriptions);
}

function openDetailTab(artifactId: string, context: vscode.ExtensionContext, store: ArtifactStore): void {
    // If tab already open for this artifact, just reveal it
    const existing = detailTabs.get(artifactId);
    if (existing) {
        existing.reveal(vscode.ViewColumn.Beside);
        return;
    }

    // Look up artifact title for the tab label
    const artifacts = buildArtifacts(store);
    const artifact = artifacts.find((a: any) => a.id === artifactId);
    const title = artifact ? `Detail: ${artifact.title || artifactId}` : `Detail: ${artifactId}`;

    const panel = vscode.window.createWebviewPanel(
        'agentcanvas.detailTab',
        title,
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'build')
            ],
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = getDetailTabHtml(panel.webview, context.extensionUri, artifactId);

    // Handle messages from the detail tab — delegate common cases to shared handler
    panel.webview.onDidReceiveMessage(async (message) => {
        acOutput.appendLine(`[DetailTab:${artifactId}] Received message: ${message.type}`);

        // Shared handler covers updateArtifact, deleteArtifact, refineWithAI,
        // breakDown, enhanceWithAI, elicitWithMethod, startDevelopment, launchWorkflow.
        if (await handleCommonWebviewMessage(message, store, context.extensionUri, `[DetailTab:${artifactId}]`, panel.webview)) {
            return;
        }

        // Detail-tab-specific cases
        switch (message.type) {
            case 'ready':
                {
                    const allArtifacts = buildArtifacts(store);
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
    }, undefined, context.subscriptions);

    // Update detail tab when artifacts change
    const sub = store.onDidChangeArtifacts(() => {
        try {
            const allArtifacts = buildArtifacts(store);
            const art = allArtifacts.find((a: any) => a.id === artifactId);
            if (art) {
                panel.webview.postMessage({
                    type: 'loadArtifact',
                    artifact: art,
                    allArtifacts
                });
            }
        } catch { /* panel disposed */ }
    });

    // Clean up when panel is closed
    panel.onDidDispose(() => {
        detailTabs.delete(artifactId);
        sub.dispose();
        acOutput.appendLine(`[DetailTab:${artifactId}] Panel disposed`);
    }, null, context.subscriptions);

    detailTabs.set(artifactId, panel);
    acOutput.appendLine(`[Extension] Opened detail tab for: ${artifactId}`);
}

function getDetailTabHtml(webview: vscode.Webview, extensionUri: vscode.Uri, artifactId: string): string {
    const buildPath = vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build');
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(buildPath, 'assets', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(buildPath, 'assets', 'index.css')
    );

    const safeId = artifactId.replace(/['"\\<>]/g, '');
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:;">
        <link rel="stylesheet" href="${styleUri}">
        <title>AgentCanvas Detail</title>
    </head>
    <body>
        <script>window.__AC_MODE__ = 'detail'; window.__AC_DETAIL_ID__ = '${safeId}';</script>
        <div id="root"></div>
        <script src="${scriptUri}"></script>
    </body>
    </html>`;
}

async function reloadArtifactsFromDisk(store: ArtifactStore): Promise<void> {
    const outputUri = workspaceResolver?.getActiveOutputUri();
    if (!outputUri) return;

    acOutput.appendLine('[Reload] Reloading artifacts from disk...');
    await store.loadFromFolder(outputUri);
    acOutput.appendLine('[Reload] Reload complete');
}

function getCanvasWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build', 'assets', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build', 'assets', 'index.css')
    );

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">
        <link href="${styleUri}" rel="stylesheet">
        <title>AgentCanvas</title>
    </head>
    <body>
        <div id="root"></div>
        <script src="${scriptUri}"></script>
    </body>
    </html>`;
}

/**
 * Debounced auto-reload: when external file changes are detected (not from
 * the store's own syncToFiles), reload the store from disk after a short
 * delay.  This handles the case where the LLM writes files via VS Code's
 * built-in file editing, bypassing the store.  The debounce collapses
 * multiple rapid file changes into a single reload.
 */
function scheduleStoreReload(store: ArtifactStore): void {
    if (externalChangeReloadTimer) {
        clearTimeout(externalChangeReloadTimer);
    }
    externalChangeReloadTimer = setTimeout(async () => {
        externalChangeReloadTimer = undefined;
        const outputUri = workspaceResolver?.getActiveOutputUri();
        if (!outputUri) return;
        try {
            acOutput.appendLine('[FileWatcher] Auto-reloading store from disk after external change');
            await store.loadFromFolder(outputUri);
            acOutput.appendLine('[FileWatcher] Auto-reload complete');
        } catch (err: any) {
            acOutput.appendLine(`[FileWatcher] Auto-reload failed: ${err?.message ?? err}`);
        }
    }, 500);
}

function setupFileWatcher(
    store: ArtifactStore,
    context: vscode.ExtensionContext,
    notifyExternalChange: (filePath: string) => void
): void {
    const outputUri = workspaceResolver?.getActiveOutputUri();
    const wsFolder = workspaceResolver?.getActiveWorkspaceFolder();
    if (!outputUri || !wsFolder) return;

    // Extract the folder name from the output URI (last segment)
    const outputFolderName = outputUri.fsPath.replace(/\\/g, '/').split('/').pop() || '.agentcanvas-context';
    const pattern = new vscode.RelativePattern(
        wsFolder,
        `${outputFolderName}/**/*.{json,md}`
    );

    fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    /**
     * Debounced check: after a file-delete event, verify the context folder
     * still exists. When the entire folder is removed, VS Code fires an
     * onDidDelete for every file inside it; the debounce collapses those
     * into a single stat() call 300 ms after the last event.
     */
    const scheduleFolderExistenceCheck = () => {
        if (folderDeleteCheckTimer) {
            clearTimeout(folderDeleteCheckTimer);
        }
        folderDeleteCheckTimer = setTimeout(async () => {
            folderDeleteCheckTimer = undefined;
            try {
                await vscode.workspace.fs.stat(outputUri);
                // Folder still exists — individual file(s) were deleted, nothing more to do
            } catch {
                // Folder is gone — clear project state so canvas & panels go blank
                acOutput.appendLine(
                    `[FileWatcher] Context folder deleted: ${outputUri.fsPath} — clearing project`
                );
                store.clearProject();

                // Dispose the now-useless watcher
                if (fileWatcher) {
                    fileWatcher.dispose();
                    fileWatcher = undefined;
                }
            }
        }, 300);
    };

    fileWatcher.onDidChange(async (uri) => {
        if (uri.fsPath.endsWith('.json')) {
            acOutput.appendLine(`[FileWatcher] JSON file changed: ${uri.fsPath}`);
            notifyExternalChange(uri.fsPath);
        }
    });

    fileWatcher.onDidCreate(async (uri) => {
        if (uri.fsPath.endsWith('.json')) {
            acOutput.appendLine(`[FileWatcher] JSON file created: ${uri.fsPath}`);
            notifyExternalChange(uri.fsPath);
        }
    });

    fileWatcher.onDidDelete(async (uri) => {
        if (uri.fsPath.endsWith('.json')) {
            acOutput.appendLine(`[FileWatcher] JSON file deleted: ${uri.fsPath}`);
            notifyExternalChange(uri.fsPath);
        }
        // Whether .json or .md, schedule a folder-existence check.
        // If the whole folder was removed, this clears the project.
        scheduleFolderExistenceCheck();
    });

    context.subscriptions.push(fileWatcher);
}

/**
 * Dispose the existing file watcher and create a new one pointing at
 * the resolver's current active project folder.
 */
function resetFileWatcher(
    store: ArtifactStore,
    context: vscode.ExtensionContext,
    notifyExternalChange: (filePath: string) => void
): void {
    if (folderDeleteCheckTimer) {
        clearTimeout(folderDeleteCheckTimer);
        folderDeleteCheckTimer = undefined;
    }
    if (fileWatcher) {
        fileWatcher.dispose();
        fileWatcher = undefined;
    }
    setupFileWatcher(store, context, notifyExternalChange);
}

export function deactivate() {
    if (folderDeleteCheckTimer) {
        clearTimeout(folderDeleteCheckTimer);
        folderDeleteCheckTimer = undefined;
    }
    if (externalChangeReloadTimer) {
        clearTimeout(externalChangeReloadTimer);
        externalChangeReloadTimer = undefined;
    }
    if (fileWatcher) {
        fileWatcher.dispose();
    }
    if (artifactStore) {
        artifactStore.dispose();
    }
}
