import * as vscode from 'vscode';
import { ArtifactStore } from '../state/artifact-store';
import { JiraClient, JiraClientError } from '../integrations/jira-client';
import {
    getJiraConfig,
    formatEpicsAsMarkdown,
    formatStoriesAsMarkdown,
    mergeJiraIntoArtifacts
} from '../integrations/jira-importer';
import { createLogger } from '../utils/logger';

const logger = createLogger('jira-commands');

/**
 * Command palette handler for Jira read operations.
 * Registered as: agileagentcanvas.fetchFromJira
 */
export class JiraCommands {
    private readonly store: ArtifactStore;
    private outputChannel: vscode.OutputChannel | undefined;

    constructor(store: ArtifactStore) {
        this.store = store;
    }

    private getOutputChannel(): vscode.OutputChannel {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('Agile Agent Canvas — Jira');
        }
        return this.outputChannel;
    }

    private print(message: string): void {
        const ch = this.getOutputChannel();
        ch.appendLine(message);
        ch.show(true); // preserve focus
    }

    private printSection(title: string): void {
        this.print('');
        this.print(`${'─'.repeat(60)}`);
        this.print(`  ${title}`);
        this.print(`${'─'.repeat(60)}`);
    }

    /**
     * Main entry point — shows a quick pick menu and dispatches to the chosen action.
     */
    async handleFetchFromJira(): Promise<void> {
        const config = await getJiraConfig();
        if (!config) {
            const choice = await vscode.window.showErrorMessage(
                'Jira is not configured. Set your Base URL and email in Settings, then run "Set Jira API Token" to store your token securely.',
                'Open Settings',
                'Set API Token'
            );
            if (choice === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'agileagentcanvas.jira');
            } else if (choice === 'Set API Token') {
                vscode.commands.executeCommand('agileagentcanvas.setJiraToken');
            }
            return;
        }

        const items: vscode.QuickPickItem[] = [
            {
                label: '$(plug) Test Connection',
                description: `Connect to ${config.baseUrl}`,
                detail: 'Verify your credentials are working'
            },
            {
                label: '$(list-unordered) Fetch Epics',
                description: config.projectKey ? `Project: ${config.projectKey}` : 'Enter project key',
                detail: 'List all epics in a Jira project'
            },
            {
                label: '$(tasklist) Fetch Stories',
                description: 'For a specific epic or all stories in a project',
                detail: 'List stories — you will be prompted for an epic key'
            },
            {
                label: '$(sync) Sync to Artifacts',
                description: config.projectKey ? `Project: ${config.projectKey}` : 'Enter project key',
                detail: 'Fetch epics + stories and merge them into your canvas artifacts'
            }
        ];

        const pick = await vscode.window.showQuickPick(items, {
            placeHolder: 'Choose a Jira action',
            matchOnDescription: true
        });

        if (!pick) { return; }

        const client = new JiraClient(config);

        if (pick.label.includes('Test Connection')) {
            await this.runTestConnection(client);
        } else if (pick.label.includes('Fetch Epics')) {
            const projectKey = await this.resolveProjectKey(config.projectKey);
            if (projectKey) { await this.runFetchEpics(client, projectKey); }
        } else if (pick.label.includes('Fetch Stories')) {
            await this.runFetchStories(client, config.projectKey);
        } else if (pick.label.includes('Sync')) {
            const projectKey = await this.resolveProjectKey(config.projectKey);
            if (projectKey) { await this.runSyncToArtifacts(client, projectKey); }
        }
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    private async runTestConnection(client: JiraClient): Promise<void> {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Testing Jira connection…', cancellable: false },
            async () => {
                try {
                    const me = await client.testConnection();
                    vscode.window.showInformationMessage(
                        `✅ Jira connected! Authenticated as ${me.displayName} (${me.email})`
                    );
                    this.printSection('Test Connection');
                    this.print(`✅ Connected to Jira`);
                    this.print(`   User:  ${me.displayName}`);
                    this.print(`   Email: ${me.email}`);
                    logger.debug(`[JiraCommands] testConnection OK: ${me.displayName}`);
                } catch (err) {
                    this.handleError('Test Connection', err);
                }
            }
        );
    }

    private async runFetchEpics(client: JiraClient, projectKey: string): Promise<void> {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Fetching epics from ${projectKey}…`, cancellable: false },
            async () => {
                try {
                    const epics = await client.fetchEpics(projectKey);
                    this.printSection(`Epics — ${projectKey} (${epics.length})`);
                    if (epics.length === 0) {
                        this.print('  No epics found for this project.');
                        return;
                    }
                    for (const epic of epics) {
                        const stories = epic.stories.length > 0 ? ` [${epic.stories.length} stories]` : '';
                        this.print(`  ${epic.key}  |  ${epic.status.padEnd(12)}  |  ${epic.summary}${stories}`);
                    }
                    vscode.window.showInformationMessage(`Fetched ${epics.length} epics from ${projectKey}. See "Agile Agent Canvas — Jira" output panel.`);
                } catch (err) {
                    this.handleError('Fetch Epics', err);
                }
            }
        );
    }

    private async runFetchStories(client: JiraClient, defaultProjectKey?: string): Promise<void> {
        const mode = await vscode.window.showQuickPick(
            [
                { label: 'Stories for a specific epic', value: 'epic' },
                { label: 'All stories in a project', value: 'project' }
            ],
            { placeHolder: 'Fetch scope' }
        );
        if (!mode) { return; }

        if (mode.value === 'epic') {
            const epicKey = await vscode.window.showInputBox({
                prompt: 'Enter the epic key (e.g. PROJ-42)',
                placeHolder: 'PROJ-42',
                validateInput: v => v.trim() ? undefined : 'Epic key is required'
            });
            if (!epicKey) { return; }

            const projectKey = await this.resolveProjectKey(defaultProjectKey, `Project key for epic ${epicKey}`);
            if (!projectKey) { return; }

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Fetching stories for ${epicKey}…`, cancellable: false },
                async () => {
                    try {
                        const stories = await client.fetchStoriesForEpic(epicKey.trim(), projectKey);
                        this.printSection(`Stories for Epic ${epicKey} (${stories.length})`);
                        if (stories.length === 0) {
                            this.print('  No stories found for this epic.');
                            return;
                        }
                        for (const s of stories) {
                            const pts = s.storyPoints !== undefined ? ` [${s.storyPoints}pts]` : '';
                            this.print(`  ${s.key}  |  ${s.status.padEnd(12)}${pts}  |  ${s.summary}`);
                        }
                        vscode.window.showInformationMessage(`Fetched ${stories.length} stories for ${epicKey}.`);
                    } catch (err) {
                        this.handleError('Fetch Stories', err);
                    }
                }
            );
        } else {
            const projectKey = await this.resolveProjectKey(defaultProjectKey);
            if (!projectKey) { return; }

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Fetching all stories from ${projectKey}…`, cancellable: false },
                async () => {
                    try {
                        const stories = await client.fetchAllStoriesInProject(projectKey);
                        this.printSection(`All Stories — ${projectKey} (${stories.length})`);
                        for (const s of stories) {
                            const pts = s.storyPoints !== undefined ? ` [${s.storyPoints}pts]` : '';
                            const epic = s.epicKey ? ` (${s.epicKey})` : '';
                            this.print(`  ${s.key}  |  ${s.status.padEnd(12)}${pts}${epic}  |  ${s.summary}`);
                        }
                        vscode.window.showInformationMessage(`Fetched ${stories.length} stories from ${projectKey}.`);
                    } catch (err) {
                        this.handleError('Fetch Stories', err);
                    }
                }
            );
        }
    }

    private async runSyncToArtifacts(client: JiraClient, projectKey: string): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `This will fetch all epics and stories from Jira project "${projectKey}" and merge them into your canvas artifacts. Local-only artifacts will not be changed. Continue?`,
            { modal: true },
            'Sync from Jira'
        );
        if (confirm !== 'Sync from Jira') { return; }

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Syncing ${projectKey} from Jira…`, cancellable: false },
            async () => {
                try {
                    const jiraEpics = await client.fetchEpicsWithStories(projectKey);
                    const existing = this.store.getState();
                    const { merged, added, updated } = mergeJiraIntoArtifacts(existing, jiraEpics);

                    this.store.mergeFromState({ epics: merged.epics });

                    this.printSection(`Sync from Jira — ${projectKey}`);
                    this.print(`  Epics fetched:  ${jiraEpics.length}`);
                    this.print(`  Stories fetched: ${jiraEpics.reduce((n, e) => n + e.stories.length, 0)}`);
                    this.print(`  Epics added:    ${added}`);
                    this.print(`  Epics updated:  ${updated}`);

                    vscode.window.showInformationMessage(
                        `Jira sync complete: ${added} epics added, ${updated} updated from project ${projectKey}.`
                    );
                    logger.debug(`[JiraCommands] sync complete — added ${added}, updated ${updated}`);
                } catch (err) {
                    this.handleError('Sync to Artifacts', err);
                }
            }
        );
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async resolveProjectKey(defaultKey?: string, prompt = 'Enter the Jira project key (e.g. PROJ)'): Promise<string | undefined> {
        if (defaultKey) { return defaultKey; }

        return vscode.window.showInputBox({
            prompt,
            placeHolder: 'PROJ',
            validateInput: v => v.trim() ? undefined : 'Project key is required'
        });
    }

    private handleError(action: string, err: unknown): void {
        const message = err instanceof JiraClientError
            ? err.message
            : (err instanceof Error ? err.message : String(err));

        logger.debug(`[JiraCommands] ${action} error: ${message}`);
        this.printSection(`${action} — Error`);
        this.print(`  ❌ ${message}`);

        vscode.window.showErrorMessage(`Jira ${action} failed: ${message}`);
    }
}
