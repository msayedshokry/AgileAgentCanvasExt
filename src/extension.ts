import * as vscode from 'vscode';
import * as path from 'path';
import { AgileAgentCanvasChatParticipant } from './chat/chat-participant';
import { ArtifactsTreeProvider } from './views/artifacts-tree-provider';
import { WizardStepsProvider } from './views/wizard-steps-provider';
import { AgenticKanbanViewProvider } from './views/agentic-kanban-view-provider';
import { ArtifactStore } from './state/artifact-store';
import { WorkspaceResolver } from './state/workspace-resolver';
import { getWorkflowExecutor } from './workflow/workflow-executor';
import { initializeLaneTransitionEngine, laneTransitionEngine } from './workflow/lane-transitions';
import { concurrencyQueue } from './workflow/concurrency-queue';
import { initializeAcpSessionManager } from './acp/session-manager';
import { agentMessageBus } from './acp/agent-bus/message-bus';
import { agentRegistry } from './acp/agent-bus/agent-registry';
import { handoffNegotiation } from './acp/agent-bus/handoff-negotiation';
import { initializeTraceRecorder, getTraceRecorder } from './trace/trace-recorder';
import { registerTraceCommands } from './commands/trace-commands';
import { registerA2ACommands } from './commands/a2a-commands';
import { harnessEngine } from './harness/policy-engine';
import { loadUserPolicies } from './harness/policy-loader';
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
import { handleCommonWebviewMessage, handleCatalogueWebviewMessage } from './views/webview-message-handler';
import { handleAgenticKanbanMessage } from './views/agentic-kanban-message-handler';
import { createGraphifyStatusBar, refreshGraphifyStatusBar } from './views/graphify-status-bar';
import { createCodeburnStatusBar, refreshCodeburnStatusBar } from './views/codeburn-status-bar';
import { createChatProviderStatusBar, registerPickChatProviderCommand, refreshChatProviderStatusBar } from './views/chat-provider-status-bar';
import { setSelectedProvider, getSelectedProvider, type ChatProviderId } from './commands/chat-bridge';
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
import { CodeburnCommands } from './commands/codeburn-commands';
import {
    bootstrapGraphify,
    updateGraph,
    rebuildGraph,
    installGraphifyHook,
    detectGraphify,
    clearGraphifyCache,
    loadReport
} from './integrations/graphify';
import { detectCodeburn } from './integrations/codeburn';
import { detectHeadroom } from './integrations/headroom';
import { JiraSecrets } from './integrations/jira-secrets';
import { createLogger, setLoggerOutputSink } from './utils/logger';
import { initialiseCatalogueService } from './state/catalogue-service';
import { initialiseSkillRepoManager } from './state/skill-repo-manager';
import { USER_CATALOGUE_SETTING } from './state/constants';

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

    // ── Skill Catalogue & Repo Manager ──────────────────────────────────────
    const catalogueService = initialiseCatalogueService(context, context.extensionPath);
    catalogueService.startWatcher();
    initialiseSkillRepoManager(context);

    // Restart watcher when user catalogue path changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(USER_CATALOGUE_SETTING)) {
                catalogueService.stopWatcher();
                catalogueService.startWatcher();
            }
        }),
        // Push catalogue changes to all open canvas panels
        catalogueService.onCatalogueChanged(() => {
            for (const panel of openCanvasPanels) {
                panel.webview.postMessage({ type: 'catalogueChanged' });
            }
        }),
        catalogueService,
    );

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
    const agenticKanbanProvider = new AgenticKanbanViewProvider(context.extensionUri, artifactStore);
    
    context.subscriptions.push(
        vscode.window.createTreeView('agileagentcanvas.artifactsTree', {
            treeDataProvider: artifactsTreeProvider,
            showCollapseAll: true
        }),
        vscode.window.createTreeView('agileagentcanvas.wizardSteps', {
            treeDataProvider: wizardStepsProvider
        }),
        vscode.window.registerWebviewViewProvider(
            AgenticKanbanViewProvider.viewType,
            agenticKanbanProvider
        )
    );
    // ── ACP + Lane Transition initialization (Epic 2) ─────────────────────
    const workflowExecutor = getWorkflowExecutor();
    initializeAcpSessionManager(workflowExecutor);
    initializeLaneTransitionEngine(artifactStore, workflowExecutor);

    // ── Agent-to-Agent Message Bus initialization ──────────────────────
    // The agent message bus, registry, and handoff negotiation service are
    // initialized as singletons. Subscribe to system events for observability.
    agentMessageBus.subscribe('extension', 'system.#', async (msg) => {
      logger.debug(`[Bus] System event: ${msg.topic} from ${msg.from}`);
    });
    logger.info('Agent Bus, Registry, and Handoff Negotiation initialized');

    // ── Trace Recorder initialization (Epic 3) ───────────────────────────
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '';
    const outputFolder = vscode.workspace.getConfiguration('agileagentcanvas').get<string>('outputFolder', '.agileagentcanvas-context');
    const tracesOutputPath = workspaceRoot ? path.join(workspaceRoot, outputFolder) : outputFolder;
    initializeTraceRecorder(tracesOutputPath);
    registerTraceCommands(context);
    registerA2ACommands(context);
    logger.info('Trace Recorder and A2A Commands initialized');

    // ── Harness Policy Engine initialization (Epic 4) ─────────────────────
    // Built-in policies are auto-registered at module level. Load user-defined
    // policies from the workspace's .agileagentcanvas-context/policies/ directory.
    loadUserPolicies(artifactStore).then(policies => {
        for (const p of policies) {
            harnessEngine.registerPolicy(p);
        }
        if (policies.length > 0) {
            logger.info(`Loaded ${policies.length} user-defined harness policies`);
        }
    }).catch(err => {
        logger.warn(`Failed to load user harness policies: ${err instanceof Error ? err.message : String(err)}`);
    });
    logger.info('Harness Policy Engine initialized');

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
        // Release all stale concurrency locks (recover from killed terminals)
        vscode.commands.registerCommand('agileagentcanvas.releaseLocks', async () => {
          const locks = concurrencyQueue.listLocks();
          if (locks.length === 0) {
            vscode.window.showInformationMessage('No stale locks found.');
            return;
          }
          concurrencyQueue.releaseAll();
          vscode.window.showInformationMessage(
            `Released ${locks.length} stale concurrency lock(s): ${locks.map(l => l.artifactId).join(', ')}`
          );
        }),

        // ── codeburn commands ────────────────────────────────────────────────
        vscode.commands.registerCommand('agileagentcanvas.codeburn.menu', () => {
            const cb = new CodeburnCommands();
            return cb.handleMenu().finally(() => refreshCodeburnStatusBar());
        }),
        vscode.commands.registerCommand('agileagentcanvas.codeburn.bootstrap', async () => {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? '';
            if (!root) { return vscode.window.showWarningMessage('No workspace open.'); }
            const { bootstrapCodeburn } = await import('./integrations/codeburn/codeburn-bootstrap.js');
            await bootstrapCodeburn(root);
            refreshCodeburnStatusBar();
        }),
        vscode.commands.registerCommand('agileagentcanvas.codeburn.dashboard', () => {
            const cb = new CodeburnCommands();
            return cb.openDashboard().finally(() => refreshCodeburnStatusBar());
        }),
        vscode.commands.registerCommand('agileagentcanvas.codeburn.report', () => {
            const cb = new CodeburnCommands();
            return cb.showReport().finally(() => refreshCodeburnStatusBar());
        }),
        vscode.commands.registerCommand('agileagentcanvas.codeburn.models', () => {
            const cb = new CodeburnCommands();
            return cb.showModels().finally(() => refreshCodeburnStatusBar());
        }),
        vscode.commands.registerCommand('agileagentcanvas.codeburn.optimize', () => {
            const cb = new CodeburnCommands();
            return cb.runOptimize().finally(() => refreshCodeburnStatusBar());
        }),
        vscode.commands.registerCommand('agileagentcanvas.codeburn.compare', () => {
            const cb = new CodeburnCommands();
            return cb.openCompare().finally(() => refreshCodeburnStatusBar());
        }),
        vscode.commands.registerCommand('agileagentcanvas.codeburn.export', () => {
            const cb = new CodeburnCommands();
            return cb.exportJson().finally(() => refreshCodeburnStatusBar());
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
        // ── graphify commands ─────────────────────────────────────────────────
        vscode.commands.registerCommand('agileagentcanvas.graphify.bootstrap', () => {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? '';
            if (!root) { return vscode.window.showWarningMessage('No workspace open.'); }
            return bootstrapGraphify(root, context.extensionPath).finally(() => refreshGraphifyStatusBar(root));
        }),
        vscode.commands.registerCommand('agileagentcanvas.graphify.update', () => {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? '';
            if (!root) { return vscode.window.showWarningMessage('No workspace open.'); }
            return updateGraph(root).finally(() => refreshGraphifyStatusBar(root));
        }),
        vscode.commands.registerCommand('agileagentcanvas.graphify.rebuild', () => {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? '';
            if (!root) { return vscode.window.showWarningMessage('No workspace open.'); }
            return rebuildGraph(root).finally(() => refreshGraphifyStatusBar(root));
        }),
        vscode.commands.registerCommand('agileagentcanvas.graphify.openReport', async () => {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? '';
            if (!root) { return; }
            const status = detectGraphify(root);

            if (status.htmlReportPath) {
                // Open in the system browser — graph.html is a D3 visualization that loads
                // graph.json via fetch(); a webview panel can't serve local file requests.
                await vscode.env.openExternal(vscode.Uri.file(status.htmlReportPath));
                return;
            }

            // Fallback: open GRAPH_REPORT.md in VS Code markdown preview
            const reportUri = vscode.Uri.file(require('path').join(root, 'graphify-out', 'GRAPH_REPORT.md'));
            try {
                await vscode.commands.executeCommand('markdown.showPreviewToSide', reportUri);
            } catch {
                // Markdown extension not available — open as text
                await vscode.window.showTextDocument(reportUri);
            }
        }),
        vscode.commands.registerCommand('agileagentcanvas.graphify.installHook', () => {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? '';
            return root ? installGraphifyHook(root) : vscode.window.showWarningMessage('No workspace open.');
        }),
        vscode.commands.registerCommand('agileagentcanvas.graphify.index', async () => {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? '';
            if (!root) { return vscode.window.showWarningMessage('No workspace open.'); }
            const { runGraphify } = await import('./integrations/graphify/graphify-runner.js');
            const { GFY } = await import('./integrations/graphify/graphify-commands.js');
            // `index` was removed in graphify 0.7.16; `cluster-only` regenerates clustering + report
            const result = await runGraphify(GFY.clusterOnly(), { cwd: root });
            clearGraphifyCache(root);
            refreshGraphifyStatusBar(root);
            if (!result.success) {
                vscode.window.showWarningMessage(`graphify cluster-only failed: ${result.stderr}`);
            }
        }),
        vscode.commands.registerCommand('agileagentcanvas.graphify.openStatus', async () => {
            if (openCanvasPanels.length === 0) {
                // Canvas not open — open it first, then trigger the modal
                await openCanvasPanel(context, artifactStore);
                setTimeout(() => {
                    for (const panel of openCanvasPanels) {
                        panel.webview.postMessage({ type: 'showGraphifyModal' });
                    }
                }, 800);
            } else {
                for (const panel of openCanvasPanels) {
                    panel.webview.postMessage({ type: 'showGraphifyModal' });
                }
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
        }),
        vscode.commands.registerCommand('agileagentcanvas.cleanupStaleMarkdown', async () => {
            const outputUri = workspaceResolver.getActiveOutputUri();
            if (!outputUri) {
                vscode.window.showWarningMessage('No active project to clean up.');
                return;
            }
            const result = await cleanupStaleMarkdownFiles(outputUri);
            if (result.count > 0) {
                vscode.window.showInformationMessage(`Renamed ${result.count} stale markdown file(s) to .md.bak.`);
            } else {
                vscode.window.showInformationMessage('No stale markdown files found.');
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

                // ── Restore interrupted execution state from traces ──────
                // Now that artifacts are loaded, scan traces and push agent
                // state to the kanban so the user can see which artifacts
                // were mid-execution and resume or abandon them.
                restoreInterruptedSessions(agenticKanbanProvider).catch(err => {
                  logger.warn(`Failed to restore interrupted sessions: ${err instanceof Error ? err.message : String(err)}`);
                });
            } catch {
                logger.info(`Output folder not found (new project?): ${outputUri.fsPath}`);
            }

            // Set context key so the Agentic Kanban view shows in the sidebar.
            // This must fire even when the output folder doesn't exist yet
            // (e.g., fresh install before first project creation).
            vscode.commands.executeCommand('setContext', 'agileagentcanvas.hasProject', true);

            // One-time migration: rename stale markdown companions from pre-dual era.
            // Only runs when the output folder actually exists on disk.
            const MIGRATION_KEY = 'staleMarkdownMigrationV1';
            if (!context.globalState.get(MIGRATION_KEY)) {
                const result = await cleanupStaleMarkdownFiles(outputUri);
                if (result.count > 0) {
                    logger.info(`[Migration] Renamed ${result.count} stale markdown file(s) to .md.bak`);
                }
                await context.globalState.update(MIGRATION_KEY, true);
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

            // Set context key on project switch
            vscode.commands.executeCommand('setContext', 'agileagentcanvas.hasProject', true);
        } else {
            // No active project — hide the Agentic Kanban view
            vscode.commands.executeCommand('setContext', 'agileagentcanvas.hasProject', false);
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

    // Listen for codeburn.path changes and invalidate the detector cache
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('agileagentcanvas.codeburn.path')) {
                const { clearCodeburnCache } = require('./integrations/codeburn/codeburn-detector.js');
                const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
                if (root) { clearCodeburnCache(root); }
                refreshCodeburnStatusBar();
            }
        })
    );
    // ── graphify: optional auto-bootstrap prompt ───────────────────────────────
    createGraphifyStatusBar(context);

    // ── headroom: proactive detection (runs async so status bar reflects availability) ─
    detectHeadroom().then(() => refreshCodeburnStatusBar()).catch(() => {});

    // ── codeburn: status bar (Menu Bar equivalent) ──────────────────────────────
    createCodeburnStatusBar(context);
    // ── chat provider: status bar (current selection visible at all times) ───
    // Initialise the in-memory selection from settings so it survives reloads
    try {
        const cfg = vscode.workspace.getConfiguration('agileagentcanvas');
        const persisted = cfg.get<string>('chatProviderSelected', 'auto');
        if (persisted) {
            setSelectedProvider(persisted as ChatProviderId);
        }
    } catch {
        // ignore — fall back to 'auto'
    }
    registerPickChatProviderCommand(context);
    createChatProviderStatusBar(context);
    refreshChatProviderStatusBar();

    const autoBootstrap = vscode.workspace
        .getConfiguration('agileagentcanvas')
        .get<boolean>('graphify.autoBootstrapOnNewProject', false);

    if (autoBootstrap && vscode.workspace.isTrusted) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (root) {
            const status = detectGraphify(root);
            if (status.recommendation === 'bootstrap') {
                // Fire-and-forget toast — user can dismiss
                vscode.window.showInformationMessage(
                    'Agile Agent Canvas: This workspace has BMAD artifacts but no graphify knowledge graph. ' +
                    'Bootstrap graphify for graph-aware AI assistance?',
                    'Bootstrap',
                    'Not now'
                ).then(choice => {
                    if (choice === 'Bootstrap') {
                        // User already confirmed via toast — skip the redundant modal inside bootstrap
                        bootstrapGraphify(root, context.extensionPath, { silent: true });
                    }
                });
            }
        }
    }

    // ── graphify: auto-update on save (opt-in) ────────────────────────────────
    const autoUpdate = vscode.workspace
        .getConfiguration('agileagentcanvas')
        .get<boolean>('graphify.autoUpdateOnSave', false);

    if (autoUpdate) {
        const rootFolder = vscode.workspace.workspaceFolders?.[0];
        if (rootFolder) {
            let autoUpdateTimer: ReturnType<typeof setTimeout> | undefined;
            // Scope the watcher to the workspace folder to avoid firing on extension host files
            const graphifyWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(rootFolder, '**/*.{ts,js,py,go,rs,java,cs,rb,md}'),
                false, false, true  // only create/change events, not delete
            );
            const outputFolderName = vscode.workspace.getConfiguration('agileagentcanvas').get<string>('outputFolder', '.agileagentcanvas-context');
            graphifyWatcher.onDidChange((uri) => {
                // Ignore files written by graphify itself to avoid an infinite update loop
                if (uri.fsPath.includes('graphify-out')) { return; }
                // Ignore artifact store files — card drags trigger .md writes in
                // the output folder that don't reflect source-code changes.
                if (uri.fsPath.includes(outputFolderName)) { return; }
                if (autoUpdateTimer) { clearTimeout(autoUpdateTimer); }
                autoUpdateTimer = setTimeout(async () => {
                    const root = rootFolder.uri.fsPath;
                    const st = detectGraphify(root);
                    if (st.graphPresent) {
                        clearGraphifyCache(root);
                        await updateGraph(root);
                    }
                }, 5000);
            });
            graphifyWatcher.onDidCreate((uri) => {
                if (uri.fsPath.includes('graphify-out')) { return; }
                if (uri.fsPath.includes(outputFolderName)) { return; }
                if (autoUpdateTimer) { clearTimeout(autoUpdateTimer); }
                autoUpdateTimer = setTimeout(async () => {
                    const root = rootFolder.uri.fsPath;
                    const st = detectGraphify(root);
                    if (st.graphPresent) {
                        clearGraphifyCache(root);
                        await updateGraph(root);
                    }
                }, 5000);
            });
            context.subscriptions.push(graphifyWatcher);
        }
    }
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

            // Shared handlers (catalogue, common, agentic-kanban)
            if (await handleCatalogueWebviewMessage(message, panel.webview)) {
                return;
            }
            if (await handleCommonWebviewMessage(message, store, context.extensionUri, '[Panel]', panel.webview)) {
                return;
            }
            if (await handleAgenticKanbanMessage(message, store, context.extensionUri, panel.webview)) {
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
    const artifacts = buildArtifacts(store, vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath);
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
        if (await handleCatalogueWebviewMessage(message, panel.webview)) {
            return;
        }
        if (await handleCommonWebviewMessage(message, store, context.extensionUri, `[DetailTab:${artifactId}]`, panel.webview)) {
            return;
        }

        // Detail-tab-specific cases
        switch (message.type) {
            case 'ready':
                {
                    const allArtifacts = buildArtifacts(store, vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath);
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
            const allArtifacts = buildArtifacts(store, vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath);
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

    // Webview URI for the 3d-force-graph UMD bundle (loaded on-demand by Corpus3DView)
    const forceGraphUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build', '3d-force-graph', '3d-force-graph.min.js')
    );

    const cspDetail = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; worker-src ${webview.cspSource}; connect-src ${webview.cspSource};`;
    acOutput.appendLine(`[DetailTab] CSP: ${cspDetail}`);

    const safeId = artifactId.replace(/['"\\<>]/g, '');
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="${cspDetail}">
        <link rel="stylesheet" href="${styleUri}">
        <title>AgileAgentCanvas Detail</title>
    </head>
    <body>
        <script>console.log('[webview:inline:detail] readyState='+document.readyState);window.onerror=function(m,s,l,c,e){console.error('[webview:onerror]',m,'at',s+':'+l+':'+c,e&&e.stack);var el=document.getElementById('root');if(el)el.innerHTML+='<div style="padding:8px;margin:4px;background:#400;color:#faa;font-size:11px;font-family:monospace;white-space:pre-wrap">EARLY ERROR: '+m+'<br>'+s+':'+l+'</div>';return false;};</script>
        <script>window.__AC_MODE__ = 'detail'; window.__AC_DETAIL_ID__ = '${safeId}';</script>
        <script>window.__AC_3D_GRAPH_URL__ = '${forceGraphUri}';</script>
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

    // Webview URI for the 3d-force-graph UMD bundle (loaded on-demand by Corpus3DView)
    const forceGraphUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build', '3d-force-graph', '3d-force-graph.min.js')
    );

    const cspPanel = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; worker-src ${webview.cspSource}; connect-src ${webview.cspSource};`;
    acOutput.appendLine(`[Panel] CSP: ${cspPanel}`);

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="${cspPanel}">
        <link href="${styleUri}" rel="stylesheet">
        <title>AgileAgentCanvas</title>
    </head>
    <body>
        <div id="root"></div>
        <script>console.log('[webview:inline:panel] readyState='+document.readyState+', URL='+document.URL);window.onerror=function(m,s,l,c,e){console.error('[webview:onerror]',m,'at',s+':'+l+':'+c,e&&e.stack);var el=document.getElementById('root');if(el)el.innerHTML+='<div style="padding:8px;margin:4px;background:#400;color:#faa;font-size:11px;font-family:monospace;white-space:pre-wrap">EARLY ERROR: '+m+'<br>'+s+':'+l+'</div>';return false;};</script>
        <script>window.__AC_3D_GRAPH_URL__ = '${forceGraphUri}';</script>
        <script defer src="${forceGraphUri}"></script>
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

/**
 * Rename stale markdown companion files (.md) to .md.bak under the output folder.
 * Prevents the LLM from reading derived views as authoritative sources.
 */
async function cleanupStaleMarkdownFiles(folderUri: vscode.Uri): Promise<{ count: number }> {
    let count = 0;
    const walk = async (dir: vscode.Uri): Promise<void> => {
        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(dir);
        } catch {
            return;
        }
        for (const [name, type] of entries) {
            const entryUri = vscode.Uri.joinPath(dir, name);
            if ((type & vscode.FileType.Directory) !== 0) {
                await walk(entryUri);
            } else if (name.endsWith('.md') && !name.endsWith('.md.bak')) {
                const bakUri = vscode.Uri.joinPath(dir, name + '.bak');
                try {
                    await vscode.workspace.fs.rename(entryUri, bakUri, { overwrite: true });
                    count++;
                    logger.info(`[Cleanup] Renamed ${name} → ${name}.bak`);
                } catch (e) {
                    logger.debug(`[Cleanup] Failed to rename ${name}: ${e}`);
                }
            }
        }
    };
    await walk(folderUri);
    return { count };
}

async function restoreInterruptedSessions(kanbanProvider: AgenticKanbanViewProvider): Promise<void> {
  const traceRecorder = getTraceRecorder();
  const interrupted = await traceRecorder.scanInterruptedSessions();

  if (interrupted.length === 0) {
    logger.debug('[Restore] No interrupted sessions found');
    return;
  }

  logger.info(`[Restore] Found ${interrupted.length} interrupted session(s) — restoring agent state`);

  for (const session of interrupted) {
    if (!session.artifactId) {
      logger.debug(`[Restore] Skipping session ${session.sessionId} — no artifact ID`);
      continue;
    }

    // Re-acquire the concurrency lock so the artifact can't be
    // picked up by another agent until the user resumes or abandons.
    const lockAcquired = concurrencyQueue.tryAcquire(
      session.artifactId,
      `resumed-${session.agentRole}`,
      session.sessionId
    );

    if (!lockAcquired) {
      // Another session already has this artifact locked — skip
      logger.debug(`[Restore] Skipping ${session.artifactId} — already locked`);
      continue;
    }

    kanbanProvider.sendAgentState(
      session.artifactId,
      {
        status: 'interrupted',
        agentRole: session.agentRole,
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        workflowId: session.workflowId,
      },
      {
        locked: true,
        agentName: session.agentRole,
        since: session.startedAt,
      }
    );

    logger.info(`[Restore] Restored agent state for ${session.artifactId} (${session.workflowId})`);
  }
}

export function deactivate() {
    // Cancel A2A polling before store dispose — poll callbacks access the store
    if (laneTransitionEngine) {
        laneTransitionEngine.cancelAllA2APolling();
    }
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
