import { createLogger } from '../utils/logger';
const logger = createLogger('project-commands');
import * as vscode from 'vscode';
import { ArtifactStore } from '../state/artifact-store';
import { getWorkspaceResolver } from '../extension';
import { openChat } from './chat-bridge';

export async function createNewProject(store: ArtifactStore): Promise<void> {
    const projectName = await vscode.window.showInputBox({
        prompt: 'Enter project name',
        placeHolder: 'My Awesome Product'
    });

    if (projectName) {
        store.initializeProject(projectName);
        vscode.window.showInformationMessage(`BMAD project "${projectName}" created!`);
    }
}

export async function loadExistingProject(store: ArtifactStore): Promise<void> {
    logger.debug('[loadExistingProject] Starting...');

    const loadFrom = await vscode.window.showQuickPick(
        [
            { label: 'Current Workspace', description: 'Load from .agileagentcanvas-context in current workspace', value: 'workspace' },
            { label: 'Browse for Folder...', description: 'Select any folder containing BMAD artifacts', value: 'browse' }
        ],
        { placeHolder: 'Where to load BMAD artifacts from?' }
    );

    if (!loadFrom) {
        logger.debug('[loadExistingProject] User cancelled');
        return;
    }

    let bmadFolder: vscode.Uri;

    if (loadFrom.value === 'workspace') {
        const resolver = getWorkspaceResolver();
        const outputUri = resolver?.getActiveOutputUri();
        if (!outputUri) {
            vscode.window.showWarningMessage('No active BMAD project folder');
            return;
        }
        bmadFolder = outputUri;
        logger.debug(`[loadExistingProject] Using resolver folder: ${bmadFolder.fsPath}`);
    } else {
        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Load BMAD Artifacts',
            title: 'Select folder containing BMAD artifacts (.agileagentcanvas-context or similar)'
        });

        if (!selected || selected.length === 0) {
            logger.debug('[loadExistingProject] User cancelled folder selection');
            return;
        }
        bmadFolder = selected[0];
        logger.debug(`[loadExistingProject] User selected folder: ${bmadFolder.fsPath}`);
    }

    try {
        await vscode.workspace.fs.stat(bmadFolder);
        logger.debug(`[loadExistingProject] Folder exists, calling loadFromFolder...`);

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Loading project…', cancellable: false },
            async () => {
                store.clearProject();
                await store.loadFromFolder(bmadFolder);
            }
        );

        const state = store.getState();
        logger.debug(`[loadExistingProject] After load - epics: ${state.epics?.length || 0}`);

        const summary = [];
        if (state.vision?.productName) summary.push(`Vision: ${state.vision.productName}`);
        if (state.epics?.length) summary.push(`${state.epics.length} epics`);
        const storyCount = state.epics?.reduce((sum, e) => sum + (e.stories?.length || 0), 0) || 0;
        if (storyCount) summary.push(`${storyCount} stories`);

        if (summary.length > 0) {
            vscode.window.showInformationMessage(`BMAD project loaded: ${summary.join(', ')}`);
        } else {
            const hasMdFiles = await checkForMarkdownFiles(bmadFolder);

            if (hasMdFiles) {
                const selection = await vscode.window.showWarningMessage(
                    'No JSON artifacts found, but markdown files exist. Would you like to generate JSON using AI?',
                    'Generate JSON',
                    'Cancel'
                );

                if (selection === 'Generate JSON') {
                    const convertCommand = `@agileagentcanvas /convert-to-json "${bmadFolder.fsPath}"`;
                    await openChat(convertCommand);
                    vscode.window.setStatusBarMessage('Press Enter to start JSON generation...', 5000);
                }
            } else {
                vscode.window.showWarningMessage(
                    'No BMAD artifacts found. Expected JSON files (epic-*.json) in epics/, planning/, or root.'
                );
            }
        }
    } catch (error) {
        logger.debug(`[loadExistingProject] Error: ${error}`);
        vscode.window.showWarningMessage(`Could not load from folder: ${error}`);
    }
}

/**
 * Check if a folder contains markdown files that could be converted to JSON.
 * Searches common locations: epics/, planning-artifacts/ (legacy), implementation-artifacts/ (legacy), docs, root.
 */
export async function checkForMarkdownFiles(folderUri: vscode.Uri): Promise<boolean> {
    logger.debug(`[checkForMarkdownFiles] Checking: ${folderUri.fsPath}`);

    async function countMdInDir(uri: vscode.Uri, label: string): Promise<number> {
        try {
            const files = await vscode.workspace.fs.readDirectory(uri);
            const mdFiles = files.filter(([name, type]) =>
                name.endsWith('.md') && type === vscode.FileType.File
            );
            logger.debug(`[checkForMarkdownFiles] ${label} has ${mdFiles.length} .md files`);
            return mdFiles.length;
        } catch (e) {
            logger.debug(`[checkForMarkdownFiles] ${label} not found or error: ${e}`);
            return 0;
        }
    }

    async function countMdRecursive(uri: vscode.Uri, label: string): Promise<number> {
        let total = 0;
        try {
            const entries = await vscode.workspace.fs.readDirectory(uri);
            for (const [name, type] of entries) {
                if (type === vscode.FileType.File && name.endsWith('.md')) {
                    total++;
                } else if (type === vscode.FileType.Directory) {
                    const subUri = vscode.Uri.joinPath(uri, name);
                    total += await countMdRecursive(subUri, `${label}/${name}`);
                }
            }
            if (total > 0) {
                logger.debug(`[checkForMarkdownFiles] ${label} has ${total} .md files (recursive)`);
            }
        } catch (e) {
            // Directory doesn't exist or can't be read
        }
        return total;
    }

    try {
        const planningUri = vscode.Uri.joinPath(folderUri, 'planning');
        if (await countMdInDir(planningUri, 'planning') > 0) return true;

        const implUri = vscode.Uri.joinPath(folderUri, 'solutioning');
        if (await countMdRecursive(implUri, 'solutioning') > 0) return true;

        // Epic-scoped structure (new layout)
        const epicsUri = vscode.Uri.joinPath(folderUri, 'epics');
        if (await countMdRecursive(epicsUri, 'epics') > 0) return true;

        if (await countMdInDir(folderUri, 'Root folder') > 0) return true;

        const docsUri = vscode.Uri.joinPath(folderUri, 'docs');
        if (await countMdInDir(docsUri, 'docs') > 0) return true;

        return false;
    } catch (e) {
        logger.debug(`[checkForMarkdownFiles] Error: ${e}`);
        return false;
    }
}

export async function autoLoadProject(store: ArtifactStore): Promise<void> {
    const resolver = getWorkspaceResolver();
    const outputUri = resolver?.getActiveOutputUri();
    if (!outputUri) return;

    try {
        await vscode.workspace.fs.stat(outputUri);
        await store.loadFromFolder(outputUri);
    } catch {
        // No existing project, that's fine
    }
}

export function loadDemoData(store: ArtifactStore): Thenable<void> {
    store.initializeProject('BMAD Demo Project');

    store.updateArtifact('vision', 'main', {
        productName: 'BMAD Demo Project',
        problemStatement: 'Development teams struggle to translate business requirements into well-structured epics and stories.',
        targetUsers: ['Product Managers', 'Business Analysts', 'Development Teams'],
        valueProposition: 'AI-assisted visual workflow for designing product artifacts',
        successCriteria: [
            '50% reduction in time to create epics/stories',
            'Improved requirement coverage tracking',
            'Better alignment between business and technical teams'
        ],
        status: 'approved'
    });

    store.updateArtifact('requirements', 'main', {
        functional: [
            { id: 'FR-1', title: 'Visual Canvas', description: 'Display epics and stories on a visual canvas', capabilityArea: 'UI' },
            { id: 'FR-2', title: 'AI Chat Integration', description: 'Interact with AI analyst via chat', capabilityArea: 'AI' },
            { id: 'FR-3', title: 'Epic Breakdown', description: 'Break down requirements into epics', capabilityArea: 'Workflow' },
            { id: 'FR-4', title: 'Story Generation', description: 'Generate stories from epics', capabilityArea: 'Workflow' },
            { id: 'FR-5', title: 'Export Artifacts', description: 'Export to Markdown, JSON, JIRA', capabilityArea: 'Export' }
        ],
        nonFunctional: [
            { id: 'NFR-1', title: 'Performance', description: 'Canvas renders 100+ cards smoothly', category: 'Performance' },
            { id: 'NFR-2', title: 'Usability', description: 'Intuitive drag-drop interface', category: 'Usability' }
        ],
        additional: []
    });

    const sampleEpics = [
        {
            id: 'EPIC-1',
            title: 'Visual Canvas Experience',
            goal: 'Enable users to visualize and manipulate product artifacts on an interactive canvas',
            valueDelivered: 'Clear visual representation of project structure',
            functionalRequirements: ['FR-1'],
            status: 'in-progress',
            stories: [
                {
                    id: 'STORY-1-1',
                    title: 'Canvas Rendering',
                    userStory: {
                        asA: 'Product Manager',
                        iWant: 'to see all epics and stories on a visual canvas',
                        soThat: 'I can understand the project structure at a glance'
                    },
                    acceptanceCriteria: [
                        { given: 'epics and stories exist', when: 'I open the canvas', then: 'all artifacts are displayed as cards' }
                    ],
                    status: 'done',
                    storyPoints: 5
                },
                {
                    id: 'STORY-1-2',
                    title: 'Drag and Drop',
                    userStory: {
                        asA: 'Business Analyst',
                        iWant: 'to drag cards to reorder them',
                        soThat: 'I can organize the workflow visually'
                    },
                    acceptanceCriteria: [
                        { given: 'a card is displayed', when: 'I drag it', then: 'the card moves with my cursor' },
                        { given: 'I drop a card', when: 'in a new position', then: 'the order is saved' }
                    ],
                    status: 'in-progress',
                    storyPoints: 3
                }
            ],
            useCases: [
                {
                    id: 'UC-1',
                    title: 'Sprint Planning Session',
                    summary: 'Team reviews and prioritizes work on canvas',
                    scenario: {
                        context: 'During sprint planning, the team needs to visualize upcoming work',
                        before: 'Team scrolls through JIRA tickets in a flat list',
                        after: 'Team sees all work on canvas, can drag to prioritize',
                        impact: 'Faster planning meetings, better shared understanding'
                    }
                }
            ],
            fitCriteria: {
                functional: [{ criterion: 'Canvas displays all artifact types', verified: true }],
                nonFunctional: [{ criterion: 'Renders 100+ cards at 60fps', verified: false }],
                security: []
            },
            successMetrics: {
                codeQuality: [{ metric: 'Test coverage', target: '80%' }],
                operational: [{ metric: 'Canvas load time', target: '<2s' }],
                customerImpact: [{ metric: 'User satisfaction', target: '4.5/5' }],
                deployment: [{ metric: 'Zero downtime deployment', target: '100%' }]
            },
            risks: [
                { risk: 'Performance degradation with many cards', impact: 'medium', mitigation: 'Implement virtualization' }
            ],
            definitionOfDone: [
                'All acceptance criteria passing',
                'Code reviewed and approved',
                'Unit tests at 80% coverage',
                'Documentation updated'
            ]
        },
        {
            id: 'EPIC-2',
            title: 'AI-Assisted Workflow',
            goal: 'Provide intelligent assistance for creating and refining artifacts',
            valueDelivered: 'Faster artifact creation with AI guidance',
            functionalRequirements: ['FR-2', 'FR-3', 'FR-4'],
            status: 'draft',
            stories: [
                {
                    id: 'STORY-2-1',
                    title: 'Chat Integration',
                    userStory: {
                        asA: 'Business Analyst',
                        iWant: 'to chat with an AI analyst',
                        soThat: 'I can get help structuring requirements'
                    },
                    acceptanceCriteria: [
                        { given: 'I open the chat', when: 'I type @agileagentcanvas', then: 'the AI analyst responds' }
                    ],
                    status: 'draft',
                    storyPoints: 8
                }
            ]
        },
        {
            id: 'EPIC-3',
            title: 'Export & Integration',
            goal: 'Enable seamless export of artifacts to external tools',
            valueDelivered: 'Artifacts can be used in existing workflows',
            functionalRequirements: ['FR-5'],
            status: 'draft',
            stories: []
        }
    ];

    sampleEpics.forEach(epic => {
        store.addEpic(epic as any);
    });

    store.setCurrentStep('epics');

    return vscode.window.showInformationMessage(
        'Demo data loaded! Open the canvas to see the artifacts.',
        'Open Canvas'
    ).then(selection => {
        if (selection === 'Open Canvas') {
            return vscode.commands.executeCommand('agileagentcanvas.openCanvas');
        }
    });
}

/**
 * Load a comprehensive sample project ("TaskFlow Pro") that showcases ALL
 * canvas artifact types, cross-dependencies, and BMAD workflows.
 *
 * Approach: Pre-built JSON files ship in resources/sample-project/ inside
 * the VSIX.  This function copies them to .agileagentcanvas-context and calls
 * store.loadFromFolder() — no in-memory data construction needed.
 */
export async function loadSampleProject(store: ArtifactStore, extensionUri?: vscode.Uri): Promise<void> {
    logger.debug('[loadSampleProject] Starting...');

    // 1. Resolve the extension URI
    const extUri = extensionUri
        ?? vscode.extensions.getExtension('msayedshokry.agileagentcanvas')?.extensionUri;
    if (!extUri) {
        logger.debug('[loadSampleProject] ERROR: Cannot locate extension URI');
        vscode.window.showErrorMessage('Agile Agent Canvas: Cannot locate extension resources.');
        return;
    }
    logger.debug(`[loadSampleProject] Extension URI: ${extUri.fsPath}`);

    // 2. Resolve the workspace output folder.
    //    Always target the configured/default folder name — never write sample
    //    data into a legacy `_bmad-output` folder that the resolver may have
    //    auto-detected from the official BMAD-METHOD installer.
    const resolver = getWorkspaceResolver();
    const wsFolder = resolver?.getActiveWorkspaceFolder()
        ?? vscode.workspace.workspaceFolders?.[0];
    if (!wsFolder) {
        logger.debug('[loadSampleProject] ERROR: No workspace folder');
        vscode.window.showWarningMessage('No active workspace — open a folder first.');
        return;
    }
    const outputFolderName = resolver?.getOutputFolderName() ?? '.agileagentcanvas-context';
    const outputUri = vscode.Uri.joinPath(wsFolder.uri, outputFolderName);
    logger.debug(`[loadSampleProject] Output URI: ${outputUri.fsPath}`);

    // Ensure the output folder exists
    try {
        await vscode.workspace.fs.createDirectory(outputUri);
    } catch {
        // already exists — fine
    }

    const sampleRoot = vscode.Uri.joinPath(extUri, 'resources', 'sample-project');
    logger.debug(`[loadSampleProject] Sample root: ${sampleRoot.fsPath}`);

    // 3. Recursively copy every JSON file from resources/sample-project → .agileagentcanvas-context
    let filesCopied = 0;
    async function copyDir(src: vscode.Uri, dest: vscode.Uri): Promise<void> {
        const entries = await vscode.workspace.fs.readDirectory(src);
        for (const [name, type] of entries) {
            const srcChild = vscode.Uri.joinPath(src, name);
            const destChild = vscode.Uri.joinPath(dest, name);
            if (type === vscode.FileType.Directory) {
                await vscode.workspace.fs.createDirectory(destChild);
                await copyDir(srcChild, destChild);
            } else if (name.endsWith('.json')) {
                const content = await vscode.workspace.fs.readFile(srcChild);
                await vscode.workspace.fs.writeFile(destChild, content);
                filesCopied++;
            }
        }
    }

    try {
        logger.debug('[loadSampleProject] Copying sample files to .agileagentcanvas-context...');

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Loading sample project…', cancellable: false },
            async () => {
                await copyDir(sampleRoot, outputUri!);
                logger.debug(`[loadSampleProject] Copied ${filesCopied} JSON files`);

                // 4. Clear current state and reload from the freshly-copied files
                store.clearProject();
                await store.loadFromFolder(outputUri!);

                // 5. Point the resolver at the new folder if it was targeting
                //    a different one (e.g. the legacy _bmad-output folder).
                if (resolver && resolver.getActiveOutputUri()?.toString() !== outputUri!.toString()) {
                    await resolver.switchProject({
                        workspaceFolder: wsFolder!,
                        outputUri: outputUri!,
                        label: `${wsFolder!.name} (${outputFolderName})`
                    });
                }
            }
        );

        const state = store.getState();
        const epicCount = state.epics?.length ?? 0;
        const storyCount = state.epics?.reduce((s, e) => s + (e.stories?.length || 0), 0) ?? 0;
        logger.debug(`[loadSampleProject] Loaded ${epicCount} epics, ${storyCount} stories`);

        const selection = await vscode.window.showInformationMessage(
            `TaskFlow Pro sample loaded — ${epicCount} epics, ${storyCount} stories. Explore the canvas!`,
            'Open Canvas'
        );
        if (selection === 'Open Canvas') {
            await vscode.commands.executeCommand('agileagentcanvas.openCanvas');
        }
    } catch (error) {
        logger.debug(`[loadSampleProject] Error: ${error}`);
        vscode.window.showErrorMessage(`Failed to load sample project: ${error}`);
    }
}
