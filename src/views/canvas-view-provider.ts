import * as vscode from 'vscode';
import { ArtifactStore } from '../state/artifact-store';
import * as path from 'path';
import * as fs from 'fs';
import { acOutput } from '../extension';
import { loadElicitationMethods, loadBmmWorkflows } from '../commands/artifact-commands';
import { loadSampleProject } from '../commands/project-commands';
import { handleCommonWebviewMessage } from './webview-message-handler';

/**
 * Webview provider for the AgentCanvas - Full panel view
 * This loads the React app for the visual canvas
 */
export class AgentCanvasViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'agentcanvas.canvasView';
    
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
                        const outputFormat = vscode.workspace.getConfiguration('agentcanvas').get<string>('outputFormat', 'dual');
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
                    vscode.commands.executeCommand('agentcanvas.switchProject');
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
        
        // Transform state to artifact format for webview
        const artifacts = this.stateToArtifacts(state);
        acOutput.appendLine(`[CanvasProvider] Transformed to ${artifacts.length} artifacts`);
        
        if (!this._view) {
            acOutput.appendLine('[CanvasProvider] No view yet, queuing artifacts');
            this.pendingArtifacts = artifacts;
            return;
        }
        
        acOutput.appendLine(`[CanvasProvider] Posting ${artifacts.length} artifacts to webview`);
        this._lastArtifacts = artifacts;
        this._view.webview.postMessage({
            type: 'updateArtifacts',
            artifacts
        });
    }

    private stateToArtifacts(state: any): any[] {
        const artifacts: any[] = [];

        // Card width definitions
        const CARD_WIDTHS = {
            'vision': 280,
            'requirement': 260,
            'epic': 260,
            'story': 250,
            'use-case': 250,
            'product-brief': 280,
            'prd': 260,
            'architecture': 260,
            'test-case': 250,
            'test-strategy': 260
        };

        // Base heights (header + padding)
        const BASE_HEIGHTS = {
            'vision': 80,
            'requirement': 110,
            'epic': 80,
            'story': 70,
            'use-case': 70,
            'product-brief': 80,
            'prd': 70,
            'architecture': 70,
            'test-case': 70,
            'test-strategy': 80
        };

        // Approximate characters per line based on card width and font size
        const CHARS_PER_LINE = {
            'vision': 35,
            'requirement': 32,
            'epic': 32,
            'story': 30,
            'use-case': 30,
            'product-brief': 35,
            'prd': 32,
            'architecture': 32,
            'test-case': 30,
            'test-strategy': 32
        };

        // Line height in pixels
        const LINE_HEIGHT = 18;

        // Spacing between cards
        const CARD_SPACING = 20;

        // Column X positions
        const COLUMNS = {
            'product-brief': 50,   // Discovery (leftmost)
            'vision': 370,          // Discovery
            'prd': 690,             // Planning
            'requirement': 690,    // Planning (shared column with prd)
            'architecture': 690,   // Planning
            'epic': 1010,           // Solutioning
            'story': 1330,          // Implementation
            'use-case': 1330,       // Implementation (alongside stories)
            'test-strategy': 1330, // Testing (below stories/use-cases, same lane)
            'test-case': 1330      // Testing (horizontal grid same as stories)
        };

        type CardType = keyof typeof BASE_HEIGHTS;

        // Height of the "Depends on: N" row (border-top + padding + text)
        const DEP_ROW_HEIGHT = 28;

        /**
         * Calculate card height based on content.
         * @param hasDependencies - set true when the card will render the "Depends on:" row
         */
        function calculateCardHeight(type: CardType, title: string, description: string, extras: number = 0, hasDependencies: boolean = false): number {
            const baseHeight = BASE_HEIGHTS[type];
            const charsPerLine = CHARS_PER_LINE[type];

            const titleLines = Math.ceil(title.length / (charsPerLine * 0.8)) || 1;
            const descLines = description ? Math.ceil(description.length / charsPerLine) : 0;
            // Cap to 3 lines — matches CSS -webkit-line-clamp: 3 in .artifact-description p
            const cappedDescLines = Math.min(descLines, 3);
            const depHeight = hasDependencies ? DEP_ROW_HEIGHT : 0;
            const contentHeight = (titleLines * 20) + (cappedDescLines * LINE_HEIGHT) + extras + depHeight;

            return Math.max(baseHeight, contentHeight);
        }

        // Track Y offsets per column key
        const yOffsets: Record<string, number> = {
            'product-brief': 50,
            'vision': 50,
            'prd': 50,
            'requirement': 50,
            'architecture': 50,
            'epic': 50,
            'story': 50,
            'use-case': 50,
            'test-case': 50,
            'test-strategy': 50
        };

        // ── Product Brief ────────────────────────────────────────────────────
        if (state.productBrief) {
            const pb = state.productBrief;
            const title = pb.productName || pb.title || 'Product Brief';
            const description = pb.problemStatement || pb.summary || '';
            const height = calculateCardHeight('product-brief', title, description);
            artifacts.push({
                id: pb.id || 'product-brief-1',
                type: 'product-brief',
                title,
                description,
                status: pb.status || 'draft',
                position: { x: COLUMNS['product-brief'], y: yOffsets['product-brief'] },
                size: { width: CARD_WIDTHS['product-brief'], height },
                dependencies: [],
                metadata: pb
            });
            yOffsets['product-brief'] += height + CARD_SPACING;
        }

        // ── Vision ───────────────────────────────────────────────────────────
        if (state.vision) {
            const title = state.vision.productName || 'Product Vision';
            const description = state.vision.problemStatement || '';
            const height = calculateCardHeight('vision', title, description, 20);
            const requirementCount = state.requirements?.functional?.length || 0;
            artifacts.push({
                id: 'vision-1',
                type: 'vision',
                title,
                description,
                status: state.vision.status || 'draft',
                position: { x: COLUMNS['vision'], y: yOffsets['vision'] },
                size: { width: CARD_WIDTHS['vision'], height },
                dependencies: state.productBrief ? ['product-brief-1'] : [],
                childCount: requirementCount,
                metadata: state.vision
            });
            yOffsets['vision'] += height + CARD_SPACING;
        }

        // ── PRD ──────────────────────────────────────────────────────────────
        if (state.prd) {
            const prd = state.prd;
            const title = prd.title || prd.productName || 'Product Requirements';
            const description = prd.overview || prd.summary || '';
            const height = calculateCardHeight('prd', title, description);
            artifacts.push({
                id: prd.id || 'prd-1',
                type: 'prd',
                title,
                description,
                status: prd.status || 'draft',
                position: { x: COLUMNS['prd'], y: yOffsets['prd'] },
                size: { width: CARD_WIDTHS['prd'], height },
                dependencies: ['vision-1'],
                parentId: 'vision-1',
                metadata: prd
            });
            yOffsets['prd'] += height + CARD_SPACING;
            // Shift requirements below the PRD card in the same column
            yOffsets['requirement'] = yOffsets['prd'];
            yOffsets['architecture'] = yOffsets['prd'];
        }

        // ── Architecture ─────────────────────────────────────────────────────
        if (state.architecture) {
            const arch = state.architecture;
            const title = arch.title || 'Architecture';
            const description = arch.overview || arch.summary || '';
            const height = calculateCardHeight('architecture', title, description);
            artifacts.push({
                id: arch.id || 'architecture-1',
                type: 'architecture',
                title,
                description,
                status: arch.status || 'draft',
                position: { x: COLUMNS['architecture'], y: yOffsets['architecture'] },
                size: { width: CARD_WIDTHS['architecture'], height },
                dependencies: ['vision-1'],
                parentId: 'vision-1',
                metadata: arch
            });
            yOffsets['architecture'] += height + CARD_SPACING;
            yOffsets['requirement'] = Math.max(yOffsets['requirement'], yOffsets['architecture']);
        }

        // ── Requirements ─────────────────────────────────────────────────────
        if (state.requirements?.functional) {
            state.requirements.functional.forEach((req: any, index: number) => {
                const reqId = req.id || `req-${index}`;
                const title = req.title || `Requirement ${index + 1}`;
                const description = req.description || '';
                const height = calculateCardHeight('requirement', title, description, 0, true); // always has 'vision-1' dependency
                const relatedEpicsCount = state.epics?.filter((epic: any) =>
                    epic.functionalRequirements?.includes(reqId)
                ).length || 0;
                artifacts.push({
                    id: reqId,
                    type: 'requirement',
                    title,
                    description,
                    status: 'approved',
                    position: { x: COLUMNS['requirement'], y: yOffsets['requirement'] },
                    size: { width: CARD_WIDTHS['requirement'], height },
                    dependencies: ['vision-1'],
                    parentId: 'vision-1',
                    childCount: relatedEpicsCount,
                    metadata: {
                        capabilityArea: req.capabilityArea,
                        relatedEpics: req.relatedEpics,
                        relatedStories: req.relatedStories,
                        priority: req.priority,
                        status: req.status,
                        type: req.type,
                        rationale: req.rationale,
                        source: req.source,
                        metrics: req.metrics,
                        verificationMethod: req.verificationMethod,
                        verificationNotes: req.verificationNotes,
                        acceptanceCriteria: req.acceptanceCriteria,
                        dependencies: req.dependencies,
                        implementationNotes: req.implementationNotes,
                        notes: req.notes
                    }
                });
                yOffsets['requirement'] += height + CARD_SPACING;
            });
        }

        // Pre-compute test-case count per story for childCount
        const tcCountByStory = new Map<string, number>();
        if (state.testCases?.length) {
            state.testCases.forEach((tc: any) => {
                if (tc.storyId) {
                    tcCountByStory.set(tc.storyId, (tcCountByStory.get(tc.storyId) || 0) + 1);
                }
            });
        }

        // ── Epics + Stories + Use Cases ──────────────────────────────────────
        if (state.epics) {
            state.epics.forEach((epic: any, index: number) => {
                const epicId = epic.id || `epic-${index}`;
                const epicTitle = epic.title;
                const epicDescription = epic.goal || epic.description || '';
                const hasVerbose = epic.useCases || epic.fitCriteria || epic.successMetrics || epic.risks || epic.definitionOfDone;
                const extraHeight = hasVerbose ? 30 : 0;
                const epicHeight = calculateCardHeight('epic', epicTitle, epicDescription, extraHeight, (epic.functionalRequirements?.length || 0) > 0);
                const parentReqId = epic.functionalRequirements?.[0] || null;

                artifacts.push({
                    id: epicId,
                    type: 'epic',
                    title: epicTitle,
                    description: epicDescription,
                    status: epic.status || 'draft',
                    position: { x: COLUMNS['epic'], y: yOffsets['epic'] },
                    size: { width: CARD_WIDTHS['epic'], height: epicHeight },
                    dependencies: epic.functionalRequirements || [],
                    parentId: parentReqId,
                    childCount: epic.stories?.length || 0,
                    metadata: {
                        functionalRequirements: epic.functionalRequirements,
                        nonFunctionalRequirements: epic.nonFunctionalRequirements,
                        additionalRequirements: epic.additionalRequirements,
                        valueDelivered: epic.valueDelivered,
                        priority: epic.priority,
                        storyCount: epic.storyCount,
                        dependencies: epic.dependencies,
                        epicDependencies: epic.epicDependencies,
                        effortEstimate: epic.effortEstimate,
                        implementationNotes: epic.implementationNotes,
                        acceptanceSummary: epic.acceptanceSummary,
                        useCases: epic.useCases,
                        fitCriteria: epic.fitCriteria,
                        successMetrics: epic.successMetrics,
                        risks: epic.risks,
                        definitionOfDone: epic.definitionOfDone,
                        technicalSummary: epic.technicalSummary
                    }
                });
                yOffsets['epic'] += epicHeight + CARD_SPACING;

                // Stories for this epic
                if (epic.stories) {
                    epic.stories.forEach((story: any, storyIndex: number) => {
                        const storyTitle = story.title;
                        const storyDescription = story.userStory
                            ? `As a ${story.userStory.asA}, I want ${story.userStory.iWant}, so that ${story.userStory.soThat}`
                            : '';
                        const acCount = story.acceptanceCriteria?.length || 0;
                        const storyExtraHeight = acCount > 0 ? 25 : 0;
                        const storyHeight = calculateCardHeight('story', storyTitle, storyDescription, storyExtraHeight, true); // always depends on epicId

                        artifacts.push({
                            id: story.id || `story-${index}-${storyIndex}`,
                            type: 'story',
                            title: storyTitle,
                            description: storyDescription,
                            status: story.status || 'draft',
                            position: { x: COLUMNS['story'], y: yOffsets['story'] },
                            size: { width: CARD_WIDTHS['story'], height: storyHeight },
                            dependencies: [epicId],
                            parentId: epicId,
                            childCount: tcCountByStory.get(story.id || `story-${index}-${storyIndex}`) || 0,
                            metadata: {
                                userStory: story.userStory,
                                acceptanceCriteria: story.acceptanceCriteria,
                                technicalNotes: story.technicalNotes,
                                storyPoints: story.storyPoints,
                                priority: story.priority,
                                estimatedEffort: story.estimatedEffort,
                                storyFormat: story.storyFormat,
                                background: story.background,
                                problemStatement: story.problemStatement,
                                proposedSolution: story.proposedSolution,
                                solutionDetails: story.solutionDetails,
                                implementationDetails: story.implementationDetails,
                                definitionOfDone: story.definitionOfDone,
                                requirementRefs: story.requirementRefs,
                                uxReferences: story.uxReferences,
                                references: story.references,
                                notes: story.notes,
                                dependencies: story.dependencies,
                                tasks: story.tasks,
                                devNotes: story.devNotes,
                                devAgentRecord: story.devAgentRecord,
                                history: story.history,
                                labels: story.labels,
                                assignee: story.assignee,
                                reviewer: story.reviewer
                            }
                        });
                        yOffsets['story'] += storyHeight + CARD_SPACING;
                    });
                }

                // Use cases for this epic — placed in their own row below stories
                if (epic.useCases) {
                    // Ensure use-cases start below all stories (since they share the same X column)
                    yOffsets['use-case'] = Math.max(yOffsets['use-case'], yOffsets['story']);
                    epic.useCases.forEach((uc: any, ucIndex: number) => {
                        const ucTitle = uc.title || `Use Case ${ucIndex + 1}`;
                        const ucDescription = uc.summary || '';
                        const ucHeight = calculateCardHeight('use-case', ucTitle, ucDescription, 0, true); // always has epicId dependency

                        artifacts.push({
                            id: uc.id || `uc-${index}-${ucIndex}`,
                            type: 'use-case',
                            title: ucTitle,
                            description: ucDescription,
                            status: uc.status || 'draft',
                            position: { x: COLUMNS['use-case'], y: yOffsets['use-case'] },
                            size: { width: CARD_WIDTHS['use-case'], height: ucHeight },
                            dependencies: [epicId],
                            parentId: epicId,
                            metadata: {
                                scenario: uc.scenario,
                                actors: uc.actors,
                                primaryActor: uc.primaryActor,
                                secondaryActors: uc.secondaryActors,
                                trigger: uc.trigger,
                                preconditions: uc.preconditions,
                                postconditions: uc.postconditions,
                                mainFlow: uc.mainFlow,
                                alternativeFlows: uc.alternativeFlows,
                                exceptionFlows: uc.exceptionFlows,
                                businessRules: uc.businessRules,
                                relatedRequirements: uc.relatedRequirements,
                                relatedEpic: uc.relatedEpic,
                                relatedStories: uc.relatedStories,
                                sourceDocument: uc.sourceDocument,
                                notes: uc.notes,
                                status: uc.status
                            }
                        });
                        yOffsets['use-case'] += ucHeight + CARD_SPACING;
                    });
                }

                // Per-epic test strategy — placed in its own row below use-cases
                if (epic.testStrategy) {
                    const ts = epic.testStrategy;
                    // Ensure test-strategy starts below stories and use-cases
                    yOffsets['test-strategy'] = Math.max(yOffsets['test-strategy'], yOffsets['story'], yOffsets['use-case']);
                    const tsTitle = ts.title || 'Test Strategy';
                    const tsDescription = ts.scope || ts.approach || '';
                    const tHeight = calculateCardHeight('test-strategy', tsTitle, tsDescription, 0, true);

                    artifacts.push({
                        id: ts.id || `TS-${epicId}`,
                        type: 'test-strategy',
                        title: tsTitle,
                        description: tsDescription,
                        status: ts.status || 'draft',
                        position: { x: COLUMNS['test-strategy'], y: yOffsets['test-strategy'] },
                        size: { width: CARD_WIDTHS['test-strategy'], height: tHeight },
                        dependencies: [epicId],
                        parentId: epicId,
                        metadata: { ...ts, epicId }
                    });
                    yOffsets['test-strategy'] += tHeight + CARD_SPACING;
                }
            });
        }

        // ── Test Strategy + Test Cases ───────────────────────────────────────
        // Placed inside the Implementation swim-lane, below stories/use-cases.
        // Test-strategy sits in the first column (x=1330), test-cases fill a
        // horizontal grid to the right — same layout as stories/use-cases.
        if (state.testStrategy || state.testCases?.length) {
            // Seed the testing section Y below all story/use-case cards
            const testingStartY = Math.max(
                yOffsets['story'],
                yOffsets['use-case'],
                yOffsets['test-strategy'],
                yOffsets['test-case']
            ) + CARD_SPACING;

            const MAX_TC_PER_ROW = 4;
            const TC_COL_WIDTH = CARD_WIDTHS['test-case'] + CARD_SPACING; // 270

            if (state.testStrategy) {
                const ts = state.testStrategy;
                const title = ts.title || 'Test Strategy';
                const description = ts.scope || ts.approach || '';
                const height = calculateCardHeight('test-strategy', title, description);
                artifacts.push({
                    id: ts.id || 'TS-1',
                    type: 'test-strategy',
                    title,
                    description,
                    status: ts.status || 'draft',
                    position: { x: COLUMNS['test-strategy'], y: testingStartY },
                    size: { width: CARD_WIDTHS['test-strategy'], height },
                    dependencies: state.vision ? ['vision-1'] : [],
                    metadata: ts
                });
                yOffsets['test-strategy'] = testingStartY + height + CARD_SPACING;
            }

            if (state.testCases?.length) {
                // Test cases start below the test-strategy card (or at testingStartY if no strategy)
                const tcRowStartY = state.testStrategy
                    ? yOffsets['test-strategy']
                    : testingStartY;

                let gridRowY = tcRowStartY;
                let currentRowMaxH = 0;

                state.testCases.forEach((tc: any, index: number) => {
                    const col = index % MAX_TC_PER_ROW;
                    const tcId = tc.id || `TC-${index + 1}`;
                    const tcTitle = tc.title || `Test Case ${index + 1}`;
                    const tcDescription = tc.description || tc.expectedResult || '';
                    const hasDep = !!(tc.storyId || state.testStrategy);
                    const tcHeight = calculateCardHeight('test-case', tcTitle, tcDescription, 0, hasDep);
                    const depIds: string[] = [];
                    if (tc.storyId) depIds.push(tc.storyId);
                    else if (state.testStrategy) depIds.push(state.testStrategy.id || 'TS-1');

                    // Wrap to next row
                    if (col === 0 && index > 0) {
                        gridRowY += currentRowMaxH + CARD_SPACING;
                        currentRowMaxH = 0;
                    }
                    currentRowMaxH = Math.max(currentRowMaxH, tcHeight);

                    const tcX = COLUMNS['test-case'] + col * TC_COL_WIDTH;

                    artifacts.push({
                        id: tcId,
                        type: 'test-case',
                        title: tcTitle,
                        description: tcDescription,
                        status: tc.status || 'draft',
                        position: { x: tcX, y: gridRowY },
                        size: { width: CARD_WIDTHS['test-case'], height: tcHeight },
                        dependencies: depIds,
                        parentId: tc.storyId || (state.testStrategy?.id || 'TS-1') || undefined,
                        metadata: {
                            type: tc.type,
                            storyId: tc.storyId,
                            epicId: tc.epicId,
                            relatedRequirements: tc.relatedRequirements,
                            steps: tc.steps,
                            expectedResult: tc.expectedResult,
                            preconditions: tc.preconditions,
                            tags: tc.tags,
                            priority: tc.priority
                        }
                    });
                });
            }
        }

        return artifacts;
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
            'agentcanvas.detailTab',
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
<title>AgentCanvas Detail</title>
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
                <title>AgentCanvas</title>
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
