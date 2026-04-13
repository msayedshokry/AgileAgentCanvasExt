import * as vscode from 'vscode';
import { AgileAgentCanvasChatParticipant } from './chat/chat-participant';
import { ArtifactsTreeProvider } from './views/artifacts-tree-provider';
import { WizardStepsProvider } from './views/wizard-steps-provider';
import { ArtifactStore } from './state/artifact-store';
import { WorkspaceResolver } from './state/workspace-resolver';
import { getWorkflowExecutor } from './workflow/workflow-executor';
import { sendArtifactsToPanel, buildArtifacts } from './canvas/artifact-transformer';
import { registerTools, sharedToolContext } from './chat/agileagentcanvas-tools';
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
import { JiraCommands } from './commands/jira-commands';
import { JiraSecrets } from './integrations/jira-secrets';
import { createLogger, setLoggerOutputSink } from './utils/logger';

const logger = createLogger('extension');

let artifactStore: ArtifactStore;
let workspaceResolver: WorkspaceResolver;
let fileWatcher: vscode.FileSystemWatcher | undefined;
let folderDeleteCheckTimer: ReturnType<typeof setTimeout> | undefined;
const openCanvasPanels: vscode.WebviewPanel[] = [];
const detailTabs = new Map<string, vscode.WebviewPanel>();

// Output channel for AgileAgentCanvas logs (visible in Output panel)
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
    setLoggerOutputSink((line) => acOutput.appendLine(line));
    logger.info('Agile Agent Canvas is now active!');
    acOutput.show(); // Show the output panel

    // Initialise SecretStorage for Jira API token (must happen before any Jira operation)
    JiraSecrets.init(context);

    // Wire chat-bridge logging into the shared output channel
    setChatBridgeLogger((msg) => logger.debug(msg));

    vscode.window.showInformationMessage('Agile Agent Canvas activated!');

    // Initialize the artifact store (shared state)
    artifactStore = new ArtifactStore(context);

    // Initialize the shared tool context and register tools ONCE.
    // chat-participant.ts and workflow-executor.ts mutate sharedToolContext
    // fields (bmadPath, outputPath, store) in place instead of re-registering.
    sharedToolContext.store = artifactStore;
    const toolDisposables = registerTools(sharedToolContext);
    context.subscriptions.push(...toolDisposables);

    // Register the Copilot Chat participant — pass extensionContext for bundled resources path + tool registration
    // vscode.chat is only available when a Copilot-compatible extension is installed.
    // Guard so the extension still activates (canvas, tree views, commands) without it.
    if (vscode.chat?.createChatParticipant) {
        const chatParticipant = new AgileAgentCanvasChatParticipant(artifactStore, context);
        context.subscriptions.push(
            vscode.chat.createChatParticipant('agileagentcanvas.analyst', chatParticipant.handleChat.bind(chatParticipant))
        );
    } else {
        logger.warn('vscode.chat API not available — chat participant not registered. Install GitHub Copilot for full functionality.');
    }

    // Register tree views
    const artifactsTreeProvider = new ArtifactsTreeProvider(artifactStore);
    const wizardStepsProvider = new WizardStepsProvider(artifactStore);
    
    context.subscriptions.push(
        vscode.window.createTreeView('agileagentcanvas.artifactsTree', {
            treeDataProvider: artifactsTreeProvider,
            showCollapseAll: true
        }),
        vscode.window.createTreeView('agileagentcanvas.wizardSteps', {
            treeDataProvider: wizardStepsProvider
        })
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('agileagentcanvas.openCanvas', () => {
            return openCanvasPanel(context, artifactStore);
        }),
        vscode.commands.registerCommand('agileagentcanvas.newProject', () => {
            return createNewProject(artifactStore);
        }),
        vscode.commands.registerCommand('agileagentcanvas.loadProject', () => {
            return loadExistingProject(artifactStore);
        }),
        vscode.commands.registerCommand('agileagentcanvas.exportArtifacts', () => {
            return exportArtifacts(artifactStore);
        }),
        vscode.commands.registerCommand('agileagentcanvas.importArtifacts', () => {
            return importArtifacts(artifactStore);
        }),
        vscode.commands.registerCommand('agileagentcanvas.syncToFiles', () => {
            return syncToFiles(artifactStore);
        }),
        vscode.commands.registerCommand('agileagentcanvas.goToStep', (stepId: string) => {
            return goToStep(stepId, artifactStore);
        }),
        vscode.commands.registerCommand('agileagentcanvas.selectArtifact', (type: string, id: string) => {
            selectArtifact(type, id, artifactStore);
            // Reveal the artifact on all open canvas panels
            openCanvasPanels.forEach(panel => {
                panel.webview.postMessage({ type: 'revealArtifact', id });
            });
        }),
        vscode.commands.registerCommand('agileagentcanvas.loadDemoData', () => {
            return loadDemoData(artifactStore);
        }),
        // Workflow session commands (triggered by chat buttons)
        vscode.commands.registerCommand('agileagentcanvas.continueWorkflow', (sessionId?: string) => {
            return openChat(`@agileagentcanvas /continue`);
        }),
        vscode.commands.registerCommand('agileagentcanvas.workflowStatus', (sessionId?: string) => {
            return openChat(`@agileagentcanvas /status`);
        }),
        vscode.commands.registerCommand('agileagentcanvas.cancelWorkflow', (sessionId?: string) => {
            const executor = getWorkflowExecutor();
            executor.cancelSession();
            vscode.window.showInformationMessage('Workflow session cancelled.');
        }),
        // Execute a specific workflow step with dependency checking
        vscode.commands.registerCommand('agileagentcanvas.executeWorkflowStep', async (
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
        vscode.commands.registerCommand('agileagentcanvas.installToIde', () => {
            return installToIde(context.extensionPath);
        }),
        // Fetch from Jira — read epics and stories from a Jira Cloud project
        vscode.commands.registerCommand('agileagentcanvas.fetchFromJira', () => {
            const jiraCommands = new JiraCommands(artifactStore);
            return jiraCommands.handleFetchFromJira();
        }),
        // Set Jira API token securely in OS keychain
        vscode.commands.registerCommand('agileagentcanvas.setJiraToken', async () => {
            const token = await vscode.window.showInputBox({
                prompt: 'Enter your Atlassian API token',
                placeHolder: 'Paste your API token here…',
                password: true,
                ignoreFocusOut: true,
                validateInput: (v) => v.trim() ? undefined : 'Token cannot be empty'
            });
            if (!token) { return; }
            await JiraSecrets.setToken(token.trim());
            vscode.window.showInformationMessage('Jira API token saved securely to OS keychain.');
        }),
        // Clear the stored Jira API token from OS keychain
        vscode.commands.registerCommand('agileagentcanvas.clearJiraToken', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Remove the stored Jira API token from the OS keychain?',
                { modal: true },
                'Remove'
            );
            if (confirm === 'Remove') {
                await JiraSecrets.clearToken();
                vscode.window.showInformationMessage('Jira API token removed from OS keychain.');
            }
        }),
        // Open the IDE chat panel (IDE-agnostic, optionally with a pre-filled query)
        vscode.commands.registerCommand('agileagentcanvas.openChatPanel', (query?: string) => {
            return openChat(query);
        }),
        // Ask Agent — open the Ask modal on the canvas (triggered by Ctrl+Shift+A)
        vscode.commands.registerCommand('agileagentcanvas.askAgent', () => {
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
        }),
        // Migration commands — extract inline stories to files
        vscode.commands.registerCommand('agileagentcanvas.migrateToRefArch', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'This will extract inline stories from epics.json to standalone files and replace them with refs. A backup will be created. Continue?',
                { modal: true },
                'Migrate'
            );
            if (confirm !== 'Migrate') return;
            const result = await artifactStore.migrateToReferenceArchitecture();
            if (result.success) {
                vscode.window.showInformationMessage(result.summary, { modal: true });
            } else {
                vscode.window.showErrorMessage(result.summary);
            }
        }),
        vscode.commands.registerCommand('agileagentcanvas.restorePreMigration', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'This will restore epics.json from the pre-migration backup. Continue?',
                { modal: true },
                'Restore'
            );
            if (confirm !== 'Restore') return;
            const result = await artifactStore.restorePreMigrationBackup();
            if (result.success) {
                vscode.window.showInformationMessage(result.summary);
            } else {
                vscode.window.showErrorMessage(result.summary);
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
                logger.info(`Auto-loaded project from: ${outputUri.fsPath}`);
            } catch {
                logger.info(`Output folder not found (new project?): ${outputUri.fsPath}`);
            }
        }

        // Set up the file watcher AFTER the resolver has determined the active folder
        setupFileWatcher(artifactStore, context, (filePath) => {
            if (artifactStore.isSyncing()) {
                logger.debug(`[FileWatcher] Suppressed self-write notification: ${filePath}`);
                return;
            }
            // Notify webview of external change (shows reload badge)
            openCanvasPanels.forEach(panel => {
                panel.webview.postMessage({ type: 'externalArtifactsChanged', filePath });
            });
        });

        // Send detected project count to all open canvas panels (for switch button visibility)
        const detected = workspaceResolver.getDetectedProjects();
        openCanvasPanels.forEach(panel => {
            panel.webview.postMessage({ type: 'detectedProjectCount', count: detected.length });
        });
    });

    // React to project switches — reload store & re-point file watcher
    workspaceResolver.onDidChangeActiveProject(async (project) => {
        logger.info(`[WorkspaceResolver] Project switched: ${project?.outputUri.fsPath ?? 'none'}`);
        artifactStore.clearProject();

        if (project) {
            try {
                await vscode.workspace.fs.stat(project.outputUri);
                await artifactStore.loadFromFolder(project.outputUri);
            } catch {
                logger.info(`[WorkspaceResolver] New project folder doesn't exist yet: ${project.outputUri.fsPath}`);
            }
        }

        // Re-point file watcher
        resetFileWatcher(artifactStore, context, (filePath) => {
            if (artifactStore.isSyncing()) {
                logger.debug(`[FileWatcher] Suppressed self-write notification: ${filePath}`);
                return;
            }
            openCanvasPanels.forEach(panel => {
                panel.webview.postMessage({ type: 'externalArtifactsChanged', filePath });
            });
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
        vscode.commands.registerCommand('agileagentcanvas.switchProject', async () => {
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
        'agileagentcanvasCanvas',
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
            logger.debug('Extension received message from webview:', message.type);

            // Shared handler covers updateArtifact, deleteArtifact, refineWithAI,
            // breakDown, enhanceWithAI, elicitWithMethod, startDevelopment, launchWorkflow.
            if (await handleCommonWebviewMessage(message, store, context.extensionUri, '[Panel]', panel.webview)) {
                return;
            }

            // Host-specific cases that need panel or context references
            switch (message.type) {
                case 'ready':
                    // React app is ready, send artifacts
                    logger.debug('Webview ready, sending artifacts...');
                    sendArtifactsToPanel(panel, store);
                    // Send elicitation methods (bundled with extension)
                    {
                        const methods = loadElicitationMethods(context.extensionUri);
                        logger.debug(`[Panel] Sending ${methods.length} elicitation methods to webview`);
                        panel.webview.postMessage({ type: 'elicitationMethods', methods });
                    }
                    // Send BMM workflows (bundled with extension under resources/)
                    {
                        const workflows = loadBmmWorkflows(context.extensionUri.fsPath + '/resources');
                        logger.debug(`[Panel] Sending ${workflows.length} BMM workflows to webview`);
                        panel.webview.postMessage({ type: 'bmmWorkflows', workflows });
                    }
                    // Send current output format setting to webview
                    {
                        const outputFormat = vscode.workspace.getConfiguration('agileagentcanvas').get<string>('outputFormat', 'dual');
                        panel.webview.postMessage({ type: 'outputFormat', format: outputFormat });
                    }
                    // Send any load-time schema validation issues to webview
                    {
                        const issues = store.getLoadValidationIssues();
                        if (issues.length > 0) {
                            logger.warn(`[Panel] Sending ${issues.length} schema issue(s) to webview`);
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
                case 'switchProject':
                    {
                        const switched = await workspaceResolver.promptSwitchProject();
                        if (switched) {
                            vscode.window.showInformationMessage(
                                `Switched to: ${workspaceResolver.getActiveProject()?.label ?? 'unknown'}`
                            );
                        }
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
        'agileagentcanvas.detailTab',
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
        <title>AgileAgentCanvas Detail</title>
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
        <title>AgileAgentCanvas</title>
    </head>
    <body>
        <div id="root"></div>
        <script src="${scriptUri}"></script>
    </body>
    </html>`;
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
    const outputFolderName = outputUri.fsPath.replace(/\\/g, '/').split('/').pop() || '.agileagentcanvas-context';
    const pattern = new vscode.RelativePattern(
        wsFolder,
        `${outputFolderName}/**/*.{json,md,yaml,yml}`
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
    if (fileWatcher) {
        fileWatcher.dispose();
    }
    if (artifactStore) {
        artifactStore.dispose();
    }
}
