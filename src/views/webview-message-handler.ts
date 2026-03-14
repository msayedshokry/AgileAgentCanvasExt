import * as vscode from 'vscode';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import { ArtifactStore } from '../state/artifact-store';
import { schemaValidator } from '../state/schema-validator';
import { acOutput } from '../extension';
import {
    refineArtifactWithAI,
    breakDownArtifact,
    enhanceArtifactWithAI,
    elicitArtifactWithMethod,
    startDevelopment,
    startDocumentation,
    launchBmmWorkflow,
    exportArtifacts,
    importArtifacts
} from '../commands/artifact-commands';
import { openChat } from '../commands/chat-bridge';

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
                    const bmadPath = path.join(extensionUri.fsPath, 'resources', '_bmad');
                    schemaValidator.init(bmadPath, acOutput);
                } catch (err: any) {
                    acOutput.appendLine(
                        `${logPrefix} Schema validator init failed: ${err?.message ?? err}`
                    );
                }
            }

            // Validate incoming changes against the relaxed schema.
            // The save always proceeds (to preserve user intent) but validation
            // errors are sent back to the webview so the user is clearly informed.
            const validation = schemaValidator.validateChanges(artType, message.updates ?? {});
            if (!validation.valid) {
                acOutput.appendLine(
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
            acOutput.appendLine(`${logPrefix} startDevelopment: artifact=${JSON.stringify(message.artifact?.id)}, type=${JSON.stringify(message.artifact?.type)}`);
            try {
                await startDevelopment(message.artifact, store);
            } catch (err) {
                acOutput.appendLine(`${logPrefix} startDevelopment threw: ${err}`);
                vscode.window.showErrorMessage(`Start Dev error: ${err}`);
            }
            return true;

        case 'startDocumentation':
            acOutput.appendLine(`${logPrefix} startDocumentation: artifact=${JSON.stringify(message.artifact?.id)}, type=${JSON.stringify(message.artifact?.type)}`);
            try {
                await startDocumentation(message.artifact, store);
            } catch (err) {
                acOutput.appendLine(`${logPrefix} startDocumentation threw: ${err}`);
                vscode.window.showErrorMessage(`Start Documentation error: ${err}`);
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

        case 'setOutputFormat': {
            const newFormat = message.format;
            if (newFormat === 'json' || newFormat === 'markdown' || newFormat === 'dual') {
                await vscode.workspace.getConfiguration('agileagentcanvas').update(
                    'outputFormat',
                    newFormat,
                    vscode.ConfigurationTarget.Workspace
                );
                acOutput.appendLine(`${logPrefix} Output format changed to: ${newFormat}`);
            }
            return true;
        }

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
                acOutput.appendLine(`${logPrefix} fixSchemas: already in progress — ignoring`);
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

            acOutput.appendLine(`${logPrefix} fixSchemas: repairing artifacts and re-writing to disk...`);
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
                                acOutput.appendLine(`${logPrefix} fixSchemas: backup created at ${backupUri.fsPath}`);
                                // Prune old backups (keep last 5) to prevent unlimited growth
                                await store.pruneOldBackups(5);
                            } else {
                                // Backup returned null — either no source folder or no JSON files.
                                // Warn the user but don't abort (files may still need fixing).
                                acOutput.appendLine(`${logPrefix} fixSchemas: WARNING — backup was not created (no source files found)`);
                            }

                            // Use fixAndSyncToFiles which applies schema-aware repairs
                            // before writing, instead of plain syncToFiles.
                            await store.fixAndSyncToFiles();
                            acOutput.appendLine(`${logPrefix} fixSchemas: fixAndSyncToFiles complete, reloading...`);

                            // Reload from the same folder to re-validate against schemas
                            const sourceFolder = store.getSourceFolder();
                            if (sourceFolder) {
                                try {
                                    await store.loadFromFolder(sourceFolder);
                                } catch (reloadErr: any) {
                                    // Repair succeeded but reload failed — send a differentiated message
                                    acOutput.appendLine(
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
                            acOutput.appendLine(
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
                acOutput.appendLine(`${logPrefix} fixSchemas error: ${err?.message ?? err}`);
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
            acOutput.appendLine(`${logPrefix} validateSchemas: re-loading artifacts to validate...`);
            try {
                const sourceFolder = store.getSourceFolder();
                if (sourceFolder) {
                    await store.loadFromFolder(sourceFolder);
                }
                const issues = store.getLoadValidationIssues();
                acOutput.appendLine(
                    `${logPrefix} validateSchemas: done — ${issues.length} issue(s)`
                );
                if (webview) {
                    webview.postMessage({
                        type: 'schemaValidateResult',
                        issues,
                    });
                }
            } catch (err: any) {
                acOutput.appendLine(`${logPrefix} validateSchemas error: ${err?.message ?? err}`);
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
            acOutput.appendLine(`${logPrefix} canvasScreenshotError: ${errMsg}`);
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
                acOutput.appendLine(`${logPrefix} canvasScreenshot error: ${errMsg}`);
                vscode.window.showErrorMessage(`Failed to save canvas screenshot: ${errMsg}`);
            }
            return true;
        }

        case 'askAgent': {
            // User typed a thought/idea/question from the canvas Ask modal.
            // Route through the bmad-help task so the agent loads the help
            // instructions from _bmad/core/tasks/help.md and uses the
            // _config/bmad-help.csv catalog to provide structured guidance.
            const userText = (message.text as string | undefined)?.trim();
            if (userText) {
                const helpQuery = `[bmad-help] Use the BMAD help task: ` +
                    `read _bmad/core/tasks/help.md for instructions, then ` +
                    `read _bmad/_config/bmad-help.csv for the workflow catalog. ` +
                    `Follow the help task routing and display rules to answer ` +
                    `this user question:\n\n${userText}`;
                acOutput.appendLine(`${logPrefix} askAgent: sending bmad-help query to chat: "${userText}"`);
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
                       `- **Schema path**: resources/_bmad/schemas/ (find the matching schema for type "${issue.type}")\n` +
                       `- **Validation errors**:\n${errorList}`;
            }).join('\n\n');

            const prompt = `[schema-fix] The following artifact files have schema validation errors ` +
                `that auto-repair could not fix. Please:\n` +
                `1. Read each affected file listed below\n` +
                `2. Read the corresponding JSON schema from resources/_bmad/schemas/\n` +
                `3. Fix the validation errors while preserving all existing data\n` +
                `4. Save the corrected files\n\n` +
                `## ${issues.length} File(s) With Schema Issues\n\n${issueBlocks}`;

            acOutput.appendLine(
                `${logPrefix} sendSchemaFixToChat: sending ${issues.length} issue(s) to chat`
            );
            await openChat(`@agileagentcanvas ${prompt}`);
            return true;
        }

        default:
            return false;
    }
}
