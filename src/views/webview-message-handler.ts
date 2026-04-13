import { createLogger } from '../utils/logger';
const logger = createLogger('webview-message-handler');
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import PDFDocument from 'pdfkit';
import { ArtifactStore } from '../state/artifact-store';
import { BMAD_RESOURCE_DIR } from '../state/constants';
import { schemaValidator } from '../state/schema-validator';

import {
    refineArtifactWithAI,
    breakDownArtifact,
    enhanceArtifactWithAI,
    elicitArtifactWithMethod,
    startDevelopment,
    startDocumentation,
    launchBmmWorkflow,
    exportArtifacts,
    importArtifacts,
    exportArtifactToMarkdown
} from '../commands/artifact-commands';
import { openChat } from '../commands/chat-bridge';
import { JiraClient } from '../integrations/jira-client';
import {
    getJiraConfig,
    formatEpicsAsMarkdown,
    formatStoriesAsMarkdown,
    mergeJiraIntoArtifacts,
    mergeJiraEpicIntoArtifacts,
    mergeJiraStoryIntoArtifacts,
    diffJiraEpics,
    applyConflictResolutions,
    JIRA_ID_PREFIX,
    type EpicConflict,
    type ConflictResolution,
} from '../integrations/jira-importer';

/**
 * Shared message handler for webview→extension messages.
 *
 * The AgileAgentCanvas extension has multiple webview hosts (sidebar canvas, panel canvas,
 * sidebar detail tabs, panel detail tabs) each with their own
 * `onDidReceiveMessage` handler.  Historically, each handler duplicated the
 * same switch/case block, which led to drift — e.g. a new message type added
 * to one handler but not the others.
 *
 * This module centralises the **common action cases** — the ones whose
 * implementation is identical regardless of which host received the message.
 * Host-specific behaviour (e.g. the `ready` handshake, `addArtifact`,
 * `selectArtifact`, `reloadArtifacts`, `openDetailTab`) stays in the caller
 * because those depend on the specific webview panel or provider instance.
 *
 * Usage pattern:
 *
 * ```ts
 * panel.webview.onDidReceiveMessage(async (message) => {
 *     // Handle host-specific cases first
 *     switch (message.type) {
 *         case 'ready': ...  break;
 *         case 'addArtifact': ...  break;
 *         default:
 *             // Delegate common cases to the shared handler
 *             await handleCommonWebviewMessage(message, store, extensionUri);
 *     }
 * });
 * ```
 */

export interface WebviewMessage {
    type: string;
    [key: string]: any;
}

/**
 * Handle a message from any webview host.
 *
 * @param webview  The webview instance that sent the message.  Used to post
 *                 validation-error responses back to the UI so the user can
 *                 see exactly what went wrong and fix it.
 * @returns `true` if the message was handled, `false` if the caller should
 *          handle it (or ignore it as an unknown type).
 */
export async function handleCommonWebviewMessage(
    message: WebviewMessage,
    store: ArtifactStore,
    extensionUri: vscode.Uri,
    logPrefix: string = '[Webview]',
    webview?: vscode.Webview
): Promise<boolean> {
    switch (message.type) {
        case 'updateArtifact': {
            const artType = message.artifactType || 'epic';

            // Lazily initialise schema validator on first webview save
            if (!schemaValidator.isInitialized()) {
                try {
                    const bmadPath = path.join(extensionUri.fsPath, 'resources', BMAD_RESOURCE_DIR);
                    schemaValidator.init(bmadPath);
                } catch (err: any) {
                    logger.debug(
                        `${logPrefix} Schema validator init failed: ${err?.message ?? err}`
                    );
                }
            }

            // Validate incoming changes against the relaxed schema.
            // The save always proceeds (to preserve user intent) but validation
            // errors are sent back to the webview so the user is clearly informed.
            const validation = schemaValidator.validateChanges(artType, message.updates ?? {});
            if (!validation.valid) {
                logger.debug(
                    `${logPrefix} Schema validation errors for ${artType}/${message.id}: ${validation.errors.join('; ')}`
                );

                // Notify the webview so the UI can display the errors
                if (webview) {
                    webview.postMessage({
                        type: 'validationError',
                        artifactType: artType,
                        artifactId: message.id,
                        errors: validation.errors,
                    });
                }
            }

            await store.updateArtifact(artType, message.id, message.updates);
            return true;
        }

        case 'deleteArtifact':
            await store.deleteArtifact(message.artifactType || 'epic', message.id);
            return true;

        case 'refineWithAI':
            await refineArtifactWithAI(message.artifact, store);
            return true;

        case 'breakDown':
            await breakDownArtifact(message.artifact, store);
            return true;

        case 'enhanceWithAI':
            await enhanceArtifactWithAI(message.artifact, store);
            return true;

        case 'elicitWithMethod':
            await elicitArtifactWithMethod(message.artifact, store, extensionUri, message.method);
            return true;

        case 'startDevelopment':
            logger.debug(`${logPrefix} startDevelopment: artifact=${JSON.stringify(message.artifact?.id)}, type=${JSON.stringify(message.artifact?.type)}`);
            try {
                await startDevelopment(message.artifact, store);
            } catch (err) {
                logger.debug(`${logPrefix} startDevelopment threw: ${err}`);
                vscode.window.showErrorMessage(`Start Dev error: ${err}`);
            }
            return true;

        case 'startDocumentation':
            logger.debug(`${logPrefix} startDocumentation: artifact=${JSON.stringify(message.artifact?.id)}, type=${JSON.stringify(message.artifact?.type)}`);
            try {
                await startDocumentation(message.artifact, store);
            } catch (err) {
                logger.debug(`${logPrefix} startDocumentation threw: ${err}`);
                vscode.window.showErrorMessage(`Start Documentation error: ${err}`);
            }
            return true;

        case 'exportToMarkdown':
            logger.debug(`${logPrefix} exportToMarkdown: artifact=${JSON.stringify(message.artifact?.id)}, type=${JSON.stringify(message.artifact?.type)}`);
            try {
                await exportArtifactToMarkdown(message.artifact);
            } catch (err) {
                logger.debug(`${logPrefix} exportToMarkdown threw: ${err}`);
                vscode.window.showErrorMessage(`Export to Markdown failed: ${err}`);
            }
            return true;

        case 'launchWorkflow':
            if (message.workflow?.triggerPhrase) {
                await launchBmmWorkflow(message.workflow.triggerPhrase, store, message.workflow.workflowFilePath);
            }
            return true;

        case 'exportArtifacts':
            await exportArtifacts(store, webview);
            return true;

        case 'importArtifacts':
            await importArtifacts(store);
            return true;


        case 'closeDetailTab':
            // The caller must handle disposal of the actual panel reference.
            // We return false so the caller can run `panel.dispose()`.
            return false;

        case 'fixSchemas': {
            // "Fix Schemas" — re-write all artifacts through the save pipeline
            // (which wraps them in proper { metadata, content } format), then
            // reload from disk to re-validate.  Send the result back to the
            // webview so the UI can report success or remaining issues.

            // ── Guard: reject if another fix is already running ──
            if (store.isFixInProgress()) {
                logger.debug(`${logPrefix} fixSchemas: already in progress — ignoring`);
                if (webview) {
                    webview.postMessage({
                        type: 'schemaFixResult',
                        success: false,
                        error: 'A Fix Schemas operation is already in progress.',
                        remainingIssues: [],
                    });
                }
                return true;
            }

            // ── Confirmation gate ──
            const confirm = await vscode.window.showWarningMessage(
                'Fix Schemas will re-write your artifact files to match BMAD schemas. ' +
                'A backup will be created first. Continue?',
                { modal: true },
                'Fix Schemas'
            );
            if (confirm !== 'Fix Schemas') {
                // User cancelled — notify webview so the spinner stops
                if (webview) {
                    webview.postMessage({
                        type: 'schemaFixResult',
                        success: false,
                        cancelled: true,
                        remainingIssues: store.getLoadValidationIssues(),
                    });
                }
                return true;
            }

            logger.debug(`${logPrefix} fixSchemas: repairing artifacts and re-writing to disk...`);
            try {
                // Capture issue count BEFORE the fix so we can detect progress
                const issuesBefore = store.getLoadValidationIssues();
                const countBefore = issuesBefore.length;

                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: 'Fixing schemas…', cancellable: false },
                    async () => {
                        await store.runExclusiveFix(async () => {
                            // ── Backup existing files before overwriting ──
                            const backupUri = await store.backupArtifactFiles();
                            if (backupUri) {
                                logger.debug(`${logPrefix} fixSchemas: backup created at ${backupUri.fsPath}`);
                                // Prune old backups (keep last 5) to prevent unlimited growth
                                await store.pruneOldBackups(5);
                            } else {
                                // Backup returned null — either no source folder or no JSON files.
                                // Warn the user but don't abort (files may still need fixing).
                                logger.debug(`${logPrefix} fixSchemas: WARNING — backup was not created (no source files found)`);
                            }

                            // Use fixAndSyncToFiles which applies schema-aware repairs
                            // before writing, instead of plain syncToFiles.
                            await store.fixAndSyncToFiles();
                            logger.debug(`${logPrefix} fixSchemas: fixAndSyncToFiles complete, reloading...`);

                            // Reload from the same folder to re-validate against schemas
                            const sourceFolder = store.getSourceFolder();
                            if (sourceFolder) {
                                try {
                                    await store.loadFromFolder(sourceFolder);
                                } catch (reloadErr: any) {
                                    // Repair succeeded but reload failed — send a differentiated message
                                    logger.debug(
                                        `${logPrefix} fixSchemas: repair succeeded but reload failed: ${reloadErr?.message ?? reloadErr}`
                                    );
                                    if (webview) {
                                        webview.postMessage({
                                            type: 'schemaFixResult',
                                            success: false,
                                            error: `Schema repair completed and saved to disk, but reloading artifacts failed: ${reloadErr?.message ?? reloadErr}. Try reopening the folder.`,
                                            remainingIssues: [],
                                        });
                                    }
                                    return;
                                }
                            }

                            const remainingIssues = store.getLoadValidationIssues();
                            const countAfter = remainingIssues.length;
                            const fixed = countBefore - countAfter;
                            logger.debug(
                                `${logPrefix} fixSchemas: done — ${countBefore} before, ${countAfter} after (${fixed} fixed)`
                            );

                            if (webview) {
                                webview.postMessage({
                                    type: 'schemaFixResult',
                                    success: countAfter === 0,
                                    remainingIssues,
                                    backupPath: backupUri?.fsPath,
                                    fixedCount: fixed,
                                    noProgress: fixed <= 0 && countAfter > 0,
                                });
                            }

                            // Show info about the backup location
                            if (backupUri) {
                                vscode.window.showInformationMessage(
                                    `Backup saved to ${backupUri.fsPath}`
                                );
                            }

                            // If no progress was made, warn the user
                            if (fixed <= 0 && countAfter > 0) {
                                vscode.window.showWarningMessage(
                                    `Fix Schemas could not resolve ${countAfter} issue(s). ` +
                                    `These may require manual editing of the source files.`
                                );
                            }
                        });
                    }
                );
            } catch (err: any) {
                logger.debug(`${logPrefix} fixSchemas error: ${err?.message ?? err}`);
                vscode.window.showErrorMessage(`Fix Schemas failed: ${err?.message ?? err}`);
                if (webview) {
                    webview.postMessage({
                        type: 'schemaFixResult',
                        success: false,
                        error: String(err?.message ?? err),
                        remainingIssues: [],
                    });
                }
            }
            return true;
        }

        case 'validateSchemas': {
            // "Validate Schemas" — reload artifacts from disk (which re-validates
            // against JSON schemas) and send the results back to the webview.
            // Unlike fixSchemas this does NOT re-write files.
            logger.debug(`${logPrefix} validateSchemas: re-loading artifacts to validate...`);
            try {
                const sourceFolder = store.getSourceFolder();
                if (sourceFolder) {
                    await store.loadFromFolder(sourceFolder);
                }
                const issues = store.getLoadValidationIssues();
                logger.debug(
                    `${logPrefix} validateSchemas: done — ${issues.length} issue(s)`
                );
                if (webview) {
                    webview.postMessage({
                        type: 'schemaValidateResult',
                        issues,
                    });
                }
            } catch (err: any) {
                logger.debug(`${logPrefix} validateSchemas error: ${err?.message ?? err}`);
                if (webview) {
                    webview.postMessage({
                        type: 'schemaValidateResult',
                        issues: [],
                        error: String(err?.message ?? err),
                    });
                }
            }
            return true;
        }

        case 'canvasScreenshotError': {
            // Webview screenshot capture failed — show the error to the user.
            const errMsg = (message.message as string) || 'Unknown error';
            logger.debug(`${logPrefix} canvasScreenshotError: ${errMsg}`);
            vscode.window.showErrorMessage(`Canvas screenshot failed: ${errMsg}`);
            return true;
        }

        case 'canvasScreenshot': {
            // Webview captured a canvas screenshot — decode and save to file.
            const dataUrl = message.dataUrl as string | undefined;
            const format = message.format as 'png' | 'pdf' | undefined;
            if (!dataUrl) {
                vscode.window.showWarningMessage('Canvas screenshot capture returned no data.');
                return true;
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const isPdf = (format ?? 'png') === 'pdf';
            const ext = isPdf ? 'pdf' : 'png';
            const filterLabel = isPdf ? 'PDF' : 'PNG Image';
            const defaultName = `agileagentcanvas-${timestamp}.${ext}`;

            const defaultFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
            const defaultUri = defaultFolder
                ? vscode.Uri.joinPath(defaultFolder, defaultName)
                : undefined;

            const targetUri = await vscode.window.showSaveDialog({
                defaultUri,
                filters: { [filterLabel]: [ext] },
                title: `Save canvas screenshot as ${ext.toUpperCase()}`
            });

            if (!targetUri) return true;

            try {
                // Strip the data URL prefix to get raw base64
                const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
                const imgBuffer = Buffer.from(base64Data, 'base64');

                if (isPdf) {
                    // Wrap the PNG image in a PDF document (landscape, fit to page)
                    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
                        const doc = new PDFDocument({
                            layout: 'landscape',
                            size: 'A4',
                            margin: 20,
                            info: {
                                Title: 'Agile Agent Canvas Export',
                                Creator: 'Agile Agent Canvas VSCode Extension',
                            },
                        });
                        const chunks: Buffer[] = [];
                        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
                        doc.on('end', () => resolve(Buffer.concat(chunks)));
                        doc.on('error', reject);

                        // Fit the image within the page margins
                        const pageW = doc.page.width - 40;
                        const pageH = doc.page.height - 40;
                        doc.image(imgBuffer, 20, 20, {
                            fit: [pageW, pageH],
                            align: 'center',
                            valign: 'center',
                        });
                        doc.end();
                    });
                    await vscode.workspace.fs.writeFile(targetUri, pdfBuffer);
                } else {
                    await vscode.workspace.fs.writeFile(targetUri, imgBuffer);
                }

                const relativePath = vscode.workspace.asRelativePath(targetUri, true);
                const action = await vscode.window.showInformationMessage(
                    `Canvas screenshot saved → ${relativePath}`,
                    'Open File'
                );
                if (action === 'Open File') {
                    await vscode.commands.executeCommand('vscode.open', targetUri);
                }
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                logger.debug(`${logPrefix} canvasScreenshot error: ${errMsg}`);
                vscode.window.showErrorMessage(`Failed to save canvas screenshot: ${errMsg}`);
            }
            return true;
        }

        case 'askAgent': {
            // User typed a thought/idea/question from the canvas Ask modal.
            // Route through the help task so the agent loads the help
            // instructions from the help task file and uses the
            // help CSV catalog to provide structured guidance.
            const userText = (message.text as string | undefined)?.trim();
            if (userText) {
                const helpQuery = `[bmad-help] Use the BMAD help task: ` +
                    `read _aac/core/tasks/help.md for instructions, then ` +
                    `read _aac/_config/bmad-help.csv for the workflow catalog. ` +
                    `Follow the help task routing and display rules to answer ` +
                    `this user question:\n\n${userText}`;
                logger.debug(`${logPrefix} askAgent: sending bmad-help query to chat: "${userText}"`);
                await openChat(`@agileagentcanvas ${helpQuery}`);
            }
            return true;
        }

        case 'sendSchemaFixToChat': {
            // User clicked "Send to Chat" on schema issues that auto-fix couldn't resolve.
            // Compose a rich prompt with the file names, schema types, and errors so the
            // AI chat agent can read the files and schemas and fix them.
            const issues = (message.issues as { file: string; type: string; errors: string[] }[]) || [];
            if (issues.length === 0) return true;

            const issueBlocks = issues.map((issue, i) => {
                const errorList = issue.errors.map(e => `  - ${e}`).join('\n');
                return `### File ${i + 1}: ${issue.file}\n` +
                       `- **Schema type**: ${issue.type}\n` +
                       `- **Schema path**: resources/_aac/schemas/ (find the matching schema for type "${issue.type}")\n` +
                       `- **Validation errors**:\n${errorList}`;
            }).join('\n\n');

            const prompt = `[schema-fix] The following artifact files have schema validation errors ` +
                `that auto-repair could not fix. Please:\n` +
                `1. Read each affected file listed below\n` +
                `2. Read the corresponding JSON schema from resources/_aac/schemas/\n` +
                `3. Fix the validation errors while preserving all existing data\n` +
                `4. Save the corrected files\n\n` +
                `## ${issues.length} File(s) With Schema Issues\n\n${issueBlocks}`;

            logger.debug(
                `${logPrefix} sendSchemaFixToChat: sending ${issues.length} issue(s) to chat`
            );
            await openChat(`@agileagentcanvas ${prompt}`);
            return true;
        }

        case 'getSprintStatus': {
            // Build sprint status from two sources:
            //   1. Epics + Stories (from ArtifactStore) — the SINGLE SOURCE OF TRUTH for statuses
            //   2. sprint-status.yaml (optional) — only used for sprint groupings (goals, dates, story lists)
            //
            // If the YAML file doesn't exist, we still send found:true with epics so the
            // frontend can render a flat Kanban board using live JSON statuses.
            const sourceFolder = store.getSourceFolder();

            // Always include the live epics from in-memory state
            const epics = store.getEpics();

            let content: string | null = null;
            if (sourceFolder) {
                try {
                    const results = await vscode.workspace.findFiles(
                        '**/sprint-status.yaml',
                        '{**/node_modules/**,**/.git/**}',
                        10
                    );

                    const sourceFsPath = sourceFolder.fsPath.replace(/\\/g, '/');
                    const match = results.find(uri => {
                        const p = uri.fsPath.replace(/\\/g, '/');
                        return p.startsWith(sourceFsPath);
                    }) ?? results[0];

                    if (match) {
                        content = await fs.promises.readFile(match.fsPath, 'utf-8');
                        logger.debug(`${logPrefix} getSprintStatus: found YAML at ${match.fsPath}`);
                    }
                } catch (err: any) {
                    logger.debug(`${logPrefix} getSprintStatus: search error: ${err?.message ?? err}`);
                }
            }

            if (webview) {
                webview.postMessage({
                    type: 'sprintStatusResult',
                    // found:true whenever we have epics — YAML is optional for groupings
                    found: epics.length > 0 || content !== null,
                    content: content ?? null,
                    epics,
                });
            }
            return true;
        }

        case 'jiraAction': {
            if (!webview) return true;

            const jiraConfig = await getJiraConfig();
            if (!jiraConfig) {
                webview.postMessage({
                    type: 'jiraResult',
                    success: false,
                    error: 'Jira is not configured. Open VS Code Settings and search "Jira" to set your Base URL and email. Then run the command "Agile Agent Canvas: Set Jira API Token" to store your token securely.'
                });
                return true;
            }

            const jiraClient = new JiraClient(jiraConfig);
            const action: string = message.action ?? 'config';
            const projectKey: string | undefined = message.projectKey || jiraConfig.projectKey;
            const epicKey: string | undefined = message.epicKey;

            try {
                if (action === 'config') {
                    const me = await jiraClient.testConnection();
                    const masked = jiraClient.getMaskedConfig();
                    const md = [
                        '## Jira Connection — OK ✅',
                        '',
                        `| Setting | Value |`,
                        `|---|---|`,
                        `| Base URL | \`${masked.baseUrl}\` |`,
                        `| Email | \`${masked.email}\` |`,
                        `| API Token | \`${masked.apiToken}\` |`,
                        `| Default Project | \`${masked.projectKey ?? '(not set)'}\` |`,
                        '',
                        `✅ Authenticated as **${me.displayName}** (${me.email})`,
                        '',
                        '> API tokens expire after 1 year. Rotate at [id.atlassian.com → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens).'
                    ].join('\n');
                    webview.postMessage({ type: 'jiraResult', success: true, markdown: md });
                }
                else if (action === 'epics') {
                    if (!projectKey) {
                        webview.postMessage({ type: 'jiraResult', success: false, error: 'Please enter a Project Key (e.g. PROJ) or set a default in Settings.' });
                        return true;
                    }
                    const epics = await jiraClient.fetchEpics(projectKey);
                    webview.postMessage({ type: 'jiraResult', success: true, markdown: formatEpicsAsMarkdown(epics) });
                }
                else if (action === 'stories') {
                    if (epicKey) {
                        const resolvedProject = projectKey || epicKey.replace(/-\d+$/, '');
                        const stories = await jiraClient.fetchStoriesForEpic(epicKey, resolvedProject);
                        webview.postMessage({ type: 'jiraResult', success: true, markdown: formatStoriesAsMarkdown(stories, epicKey) });
                    } else if (projectKey) {
                        const stories = await jiraClient.fetchAllStoriesInProject(projectKey);
                        webview.postMessage({ type: 'jiraResult', success: true, markdown: formatStoriesAsMarkdown(stories) });
                    } else {
                        webview.postMessage({ type: 'jiraResult', success: false, error: 'Please enter a Project Key or Epic Key.' });
                    }
                }
                else if (action === 'sync') {
                    // Step 1: fetch + diff → send conflicts to webview for user resolution
                    if (!projectKey) {
                        webview.postMessage({ type: 'jiraResult', success: false, error: 'Please enter a Project Key to sync.' });
                        return true;
                    }
                    const jiraEpics = await jiraClient.fetchEpicsWithStories(projectKey);
                    const existing = store.getState();
                    const epicConflicts = diffJiraEpics(jiraEpics, existing);
                    const hasConflicts = epicConflicts.some(
                        ec => !ec.isNew && (ec.conflicts.length > 0 || ec.storyConflicts.some(sc => !sc.isNew && sc.conflicts.length > 0))
                    );
                    if (!hasConflicts) {
                        // No conflicts — apply immediately
                        const resolution: ConflictResolution = { choices: {} };
                        const merged = applyConflictResolutions(existing, epicConflicts, resolution);
                        store.mergeFromState({ epics: merged.epics });
                        await store.syncToFiles();
                        const totalStories = jiraEpics.reduce((n, e) => n + e.stories.length, 0);
                        const added = epicConflicts.filter(ec => ec.isNew).length;
                        const updated = epicConflicts.filter(ec => !ec.isNew).length;
                        const md = [
                            `## Sync Complete ✅`,
                            '',
                            `| | Count |`,
                            `|---|---|`,
                            `| Epics fetched | ${jiraEpics.length} |`,
                            `| Stories fetched | ${totalStories} |`,
                            `| Epics added | ${added} |`,
                            `| Epics updated | ${updated} |`,
                            '',
                            'Your canvas artifacts have been saved to disk.'
                        ].join('\n');
                        webview.postMessage({ type: 'jiraResult', success: true, markdown: md });
                    } else {
                        // Send conflicts to webview for user to resolve
                        webview.postMessage({ type: 'jiraConflicts', epicConflicts });
                    }
                }
                else if (action === 'applySync') {
                    // Step 2: user has resolved conflicts — apply choices and persist
                    const epicConflicts: EpicConflict[] = message.epicConflicts;
                    const resolution: ConflictResolution = message.resolution;
                    const existing = store.getState();
                    const merged = applyConflictResolutions(existing, epicConflicts, resolution);
                    store.mergeFromState({ epics: merged.epics });
                    await store.syncToFiles();
                    const added = epicConflicts.filter(ec => ec.isNew).length;
                    const updated = epicConflicts.filter(ec => !ec.isNew).length;
                    const totalStories = epicConflicts.reduce((n, ec) => n + ec.jiraEpic.stories.length, 0);
                    const md = [
                        `## Sync Complete ✅`,
                        '',
                        `| | Count |`,
                        `|---|---|`,
                        `| Epics added | ${added} |`,
                        `| Epics updated | ${updated} |`,
                        `| Stories synced | ${totalStories} |`,
                        '',
                        'Your canvas artifacts have been saved to disk.'
                    ].join('\n');
                    webview.postMessage({ type: 'jiraResult', success: true, markdown: md });
                }
                else if (action === 'syncIssue') {
                    // Sync a single issue — diff first, send conflicts if any
                    const issueKey: string | undefined = message.issueKey?.trim().toUpperCase();
                    if (!issueKey) {
                        webview.postMessage({ type: 'jiraResult', success: false, error: 'Please enter an issue key (e.g. PROJ-42).' });
                        return true;
                    }
                    const fetchResult = await jiraClient.fetchIssue(issueKey);
                    const existing = store.getState();

                    if (fetchResult.kind === 'epic') {
                        const epicConflicts = diffJiraEpics([fetchResult.epic], existing);
                        const ec = epicConflicts[0];
                        const hasConflicts = !ec.isNew && (ec.conflicts.length > 0 || ec.storyConflicts.some(sc => !sc.isNew && sc.conflicts.length > 0));
                        if (!hasConflicts) {
                            const merged = applyConflictResolutions(existing, epicConflicts, { choices: {} });
                            store.mergeFromState({ epics: merged.epics });
                            await store.syncToFiles();
                            const md = [
                                `## Sync Complete ✅`,
                                '',
                                `| | |`,
                                `|---|---|`,
                                `| Epic | \`${fetchResult.epic.key}\` — ${fetchResult.epic.summary} |`,
                                `| Stories | ${fetchResult.epic.stories.length} |`,
                                `| Canvas action | ${ec.isNew ? 'Added new epic' : 'Updated existing epic'} |`,
                                '',
                                'Saved to disk.'
                            ].join('\n');
                            webview.postMessage({ type: 'jiraResult', success: true, markdown: md });
                        } else {
                            webview.postMessage({ type: 'jiraConflicts', epicConflicts });
                        }
                    } else if (fetchResult.kind === 'story') {
                        // For a single story, wrap it in a synthetic epic for the diff engine
                        const parentKey = fetchResult.story.epicKey;
                        const parentId = parentKey ? `${JIRA_ID_PREFIX}${parentKey}` : `${JIRA_ID_PREFIX}__imported__`;
                        const canvasEpic = existing.epics?.find(e => e.id === parentId);
                        const canvasStory = canvasEpic?.stories?.find(s => s.id === `${JIRA_ID_PREFIX}${fetchResult.story.key}`);
                        if (canvasStory) {
                            // Story exists — check for conflicts on title/description
                            const titleSame = (fetchResult.story.summary ?? '').trim() === (canvasStory.title ?? '').trim();
                            const descSame  = (fetchResult.story.description ?? '').trim() === (canvasStory.technicalNotes ?? '').trim();
                            if (!titleSame || !descSame) {
                                // Build a minimal synthetic epicConflict so the picker can handle it
                                const syntheticEpicConflict: EpicConflict = {
                                    key: parentKey ?? '__imported__',
                                    canvasId: parentId,
                                    isNew: !canvasEpic,
                                    conflicts: [],
                                    storyConflicts: [{
                                        key: fetchResult.story.key,
                                        canvasId: `${JIRA_ID_PREFIX}${fetchResult.story.key}`,
                                        isNew: false,
                                        conflicts: [
                                            ...(!titleSame ? [{ field: 'title' as const, jiraValue: fetchResult.story.summary, canvasValue: canvasStory.title }] : []),
                                            ...(!descSame && (fetchResult.story.description || canvasStory.technicalNotes) ? [{ field: 'description' as const, jiraValue: fetchResult.story.description ?? '', canvasValue: canvasStory.technicalNotes ?? '' }] : []),
                                        ],
                                        jiraStory: fetchResult.story,
                                    }],
                                    jiraEpic: {
                                        key: parentKey ?? '__imported__',
                                        summary: canvasEpic?.title ?? 'Imported Stories (Jira)',
                                        status: canvasEpic?.status ?? 'in-progress',
                                        stories: [fetchResult.story],
                                    },
                                };
                                webview.postMessage({ type: 'jiraConflicts', epicConflicts: [syntheticEpicConflict] });
                                return true;
                            }
                        }
                        // No conflict (new story or identical) — apply directly
                        const { merged, action: mergeAction, epicTitle } = mergeJiraStoryIntoArtifacts(existing, fetchResult.story, parentKey);
                        store.mergeFromState({ epics: merged.epics });
                        await store.syncToFiles();
                        const md = [
                            `## Sync Complete ✅`,
                            '',
                            `| | |`,
                            `|---|---|`,
                            `| Story | \`${fetchResult.story.key}\` — ${fetchResult.story.summary} |`,
                            `| Added to epic | ${epicTitle} |`,
                            `| Canvas action | ${mergeAction === 'added' ? 'Added new story' : 'Updated existing story'} |`,
                            '',
                            'Saved to disk.'
                        ].join('\n');
                        webview.postMessage({ type: 'jiraResult', success: true, markdown: md });
                    } else {
                        webview.postMessage({ type: 'jiraResult', success: false, error: `Issue \`${fetchResult.key}\` is of type "${fetchResult.issueType}" — only Epics and Stories can be synced to the canvas.` });
                    }
                }
                else if (action === 'issue') {
                    const issueKey: string | undefined = message.issueKey?.trim().toUpperCase();
                    if (!issueKey) {
                        webview.postMessage({ type: 'jiraResult', success: false, error: 'Please enter an issue key (e.g. PROJ-42).' });
                        return true;
                    }
                    const result = await jiraClient.fetchIssue(issueKey);
                    if (result.kind === 'epic') {
                        webview.postMessage({ type: 'jiraResult', success: true, markdown: formatEpicsAsMarkdown([result.epic]) });
                    } else if (result.kind === 'story') {
                        webview.postMessage({ type: 'jiraResult', success: true, markdown: formatStoriesAsMarkdown([result.story]) });
                    } else {
                        const md = [
                            `## ${result.key} — ${result.summary}`,
                            '',
                            `| Field | Value |`,
                            `|---|---|`,
                            `| Type | ${result.issueType} |`,
                            `| Status | ${result.status} |`,
                        ].join('\n');
                        webview.postMessage({ type: 'jiraResult', success: true, markdown: md });
                    }
                }
            } catch (err: any) {
                logger.debug(`${logPrefix} jiraAction error: ${err?.message ?? err}`);
                webview.postMessage({ type: 'jiraResult', success: false, error: err?.message ?? String(err) });
            }
            return true;
        }

        default:
            return false;
    }
}
