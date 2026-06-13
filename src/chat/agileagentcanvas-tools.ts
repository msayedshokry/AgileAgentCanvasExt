import { createLogger } from '../utils/logger';
const logger = createLogger('agileagentcanvas-tools');
import * as vscode from 'vscode';
import * as path from 'path';

import { ArtifactStore } from '../state/artifact-store';
import { schemaValidator, getAvailableSchemaTypes } from '../state/schema-validator';
import { repairDataWithSchema } from '../state/schema-repair-engine';
import { JiraClient } from '../integrations/jira-client';
import {
    getJiraConfig,
    formatEpicsAsMarkdown,
    formatStoriesAsMarkdown
} from '../integrations/jira-importer';
import { graphQuery, graphPath, loadCommunityWiki } from '../integrations/graphify/graph-query';
import { trackToolCall, toolTelemetry } from './tool-telemetry';
import { getTraceRecorder } from '../trace/trace-recorder';
import microdiff, { type Difference } from 'microdiff';
import deepmerge, { type Options as DeepmergeOptions } from 'deepmerge';

/**
 * AgileAgentCanvas Language Model Tools
 *
 * Registers three tools that the LLM can call during workflow execution:
 *   agileagentcanvas_read_file       — read any file under bmadPath, outputPath, or workspace folders
 *   agileagentcanvas_list_directory  — list contents of any directory under bmadPath, outputPath, or workspace folders
 *   agileagentcanvas_update_artifact — write changes to an artifact in the store
 *
 * These tools replace the old "pre-load one file → giant prompt string" pattern
 * and allow the LLM to navigate the BMAD framework folder and project source
 * code autonomously, exactly as it does when running BMAD natively in a raw
 * chat session.
 *
 * ## Security boundary
 * Read access is scoped to:
 *   1. The bundled BMAD framework folder (agents, workflows, schemas)
 *   2. The active project's output folder
 *   3. All workspace folders (so the agent can inspect source code across
 *      multi-root workspaces for context when creating/refining artifacts)
 *
 * ## Registration lifecycle
 * Tools are registered ONCE at extension activation via `registerTools()`.
 * The mutable `AgileAgentCanvasToolContext` object is shared — callers update its fields
 * in place (e.g. `ctx.bmadPath = newPath`) rather than re-registering, which
 * would cause duplicate-registration errors in VS Code.
 */

// ─── Security helper ────────────────────────────────────────────────────────

/**
 * Returns true if `target` is safely within one of the allowed root paths.
 * Prevents path-traversal attacks (e.g. ../../etc/passwd).
 */
function isPathAllowed(target: string, allowedRoots: string[]): boolean {
    const normalised = path.normalize(target);
    return allowedRoots.some(root => {
        const normRoot = path.normalize(root);
        return normalised.startsWith(normRoot + path.sep) || normalised === normRoot;
    });
}

// ─── Allowed roots helper ────────────────────────────────────────────────────

/**
 * Build the full list of allowed root paths for read/list operations.
 * Includes the BMAD framework folder, the active output folder, and all
 * workspace folders so the agent can inspect source code across multi-root
 * workspaces when creating or refining artifacts.
 */
function getAllowedRoots(ctx: AgileAgentCanvasToolContext): string[] {
    const roots = [ctx.bmadPath, ctx.outputPath].filter(Boolean);
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        for (const folder of workspaceFolders) {
            roots.push(folder.uri.fsPath);
        }
    }
    return roots;
}

// ─── Tool context ────────────────────────────────────────────────────────────

export interface AgileAgentCanvasToolContext {
    /** Resolved path to the BMAD framework folder (always the bundled extension copy) */
    bmadPath: string;
    /** Resolved path to the project output folder */
    outputPath: string;
    /** The artifact store instance for agileagentcanvas_update_artifact */
    store: ArtifactStore;
    /** Set by the chat participant before tool invocations to enable trace recording. */
    currentSessionId?: string;
    /** Set by the chat participant before tool invocations to identify the agent. */
    currentAgentName?: string;
}

/**
 * The single shared context object.  Extension code holds a reference and
 * mutates its fields whenever the active project changes; the tool handlers
 * always read the current values at invocation time.
 */
export const sharedToolContext: AgileAgentCanvasToolContext = {
    bmadPath: '',
    outputPath: '',
    store: null as any
};

// ─── Markdown helper ─────────────────────────────────────────────────────────

/**
 * Convert a parsed JSON object into a readable Markdown string.
 * Used by agileagentcanvas_write_file when generating .md companions from JSON.
 */
function jsonToMarkdown(title: string, obj: any, depth: number = 1): string {
    const lines: string[] = [];
    const heading = '#'.repeat(Math.min(depth, 4));

    if (depth === 1) {
        lines.push(`${heading} ${title}\n`);
    }

    if (typeof obj !== 'object' || obj === null) {
        lines.push(String(obj));
        return lines.join('\n');
    }

    if (Array.isArray(obj)) {
        for (const item of obj) {
            if (typeof item === 'object' && item !== null) {
                const itemTitle = item.title || item.name || item.id || '';
                if (itemTitle) {
                    lines.push(`${'#'.repeat(Math.min(depth + 1, 4))} ${itemTitle}\n`);
                }
                lines.push(jsonToMarkdown('', item, depth + 2));
            } else {
                lines.push(`- ${String(item)}`);
            }
        }
        return lines.join('\n');
    }

    for (const [key, value] of Object.entries(obj)) {
        if (key === 'title' || key === 'name' || key === 'id') { continue; } // skip already used as heading
        if (value === null || value === undefined) { continue; }

        if (typeof value === 'string') {
            lines.push(`**${key}:** ${value}\n`);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            lines.push(`**${key}:** ${value}\n`);
        } else if (Array.isArray(value)) {
            lines.push(`${'#'.repeat(Math.min(depth + 1, 4))} ${key}\n`);
            lines.push(jsonToMarkdown('', value, depth + 2));
        } else if (typeof value === 'object') {
            lines.push(`${'#'.repeat(Math.min(depth + 1, 4))} ${key}\n`);
            lines.push(jsonToMarkdown('', value, depth + 1));
        }
    }

    return lines.join('\n');
}

// ─── Project-standard error-to-string ────────────────────────────────────────
function errMsg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

// ─── Dynamic tracing wrapper ──────────────────────────────────────────────────
/**
 * Wraps a tool with trace recording using the session/agent context from
 * `sharedToolContext` at invocation time.  This is needed because tools are
 * registered globally via `vscode.lm.registerTool()`, but sessionId and
 * agentName are dynamic (set per chat session).
 *
 * If `sharedToolContext.currentSessionId` or `currentAgentName` is not set,
 * the tool runs without tracing (no-op guard).
 */
function wrapToolWithDynamicTracing(
    tool: vscode.LanguageModelTool<any>,
    toolName: string
): vscode.LanguageModelTool<any> {
    return {
        ...tool,
        invoke: async (inputs: any, token: vscode.CancellationToken) => {
            const { currentSessionId, currentAgentName } = sharedToolContext;
            if (!currentSessionId || !currentAgentName) {
                return tool.invoke(inputs, token);
            }
            const startTime = Date.now();
            try {
                const result = await tool.invoke(inputs, token);
                try {
                    getTraceRecorder().record({
                        sessionId: currentSessionId,
                        type: 'tool_call',
                        agent: currentAgentName,
                        data: { toolName, toolInput: inputs, toolResult: result },
                        durationMs: Date.now() - startTime,
                    });
                } catch { /* trace recording failures are non-fatal */ }
                return result;
            } catch (err) {
                try {
                    getTraceRecorder().record({
                        sessionId: currentSessionId,
                        type: 'error',
                        agent: currentAgentName,
                        data: { toolName, toolInput: inputs, error: errMsg(err) },
                        durationMs: Date.now() - startTime,
                    });
                } catch { /* trace recording failures are non-fatal */ }
                throw err;
            }
        }
    };
}
// ─── Tool registration ───────────────────────────────────────────────────────

/**
 * Register all three AgileAgentCanvas tools with VS Code's language model tool registry.
 * Call this ONCE at extension activation; returns Disposables to push onto
 * context.subscriptions.
 *
 * The handlers read from `sharedToolContext` at call time, so callers can
 * update that object's fields without re-registering.
 */
export function registerTools(ctx: AgileAgentCanvasToolContext): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // vscode.lm is only available when a Copilot-compatible extension is installed.
    // Guard so the extension still activates without it.
    if (!vscode.lm?.registerTool) {
        return disposables;
    }

    // ── agileagentcanvas_read_file ──────────────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ path: string }>('agileagentcanvas_read_file', wrapToolWithDynamicTracing({
            async invoke(request, _token) {
                return trackToolCall('agileagentcanvas_read_file', async () => {
                    const filePath = request.input.path;
                    const allowedRoots = getAllowedRoots(ctx);

                    if (!isPathAllowed(filePath, allowedRoots)) {
                        const msg = `Access denied: "${filePath}" is outside the allowed BMAD paths.`;
                        logger.debug(`[agileagentcanvas_read_file] ${msg}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(msg)
                        ]);
                    }

                    try {
                        const uri = vscode.Uri.file(filePath);
                        const bytes = await vscode.workspace.fs.readFile(uri);
                        const content = Buffer.from(bytes).toString('utf-8');
                        logger.debug(`[agileagentcanvas_read_file] Read ${content.length} chars from ${filePath}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(content)
                        ]);
                    } catch (err: any) {
                        const msg = `Error reading "${filePath}": ${err?.message ?? err}`;
                        logger.debug(`[agileagentcanvas_read_file] ${msg}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(msg)
                        ]);
                    }
                });
            }
        }, 'agileagentcanvas_read_file'))
    );

    // ── agileagentcanvas_list_directory ─────────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ path: string }>('agileagentcanvas_list_directory', wrapToolWithDynamicTracing({
            async invoke(request, _token) {
                return trackToolCall('agileagentcanvas_list_directory', async () => {
                    const dirPath = request.input.path;
                    const allowedRoots = getAllowedRoots(ctx);

                    if (!isPathAllowed(dirPath, allowedRoots)) {
                        const msg = `Access denied: "${dirPath}" is outside the allowed BMAD paths.`;
                        logger.debug(`[agileagentcanvas_list_directory] ${msg}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(msg)
                        ]);
                    }

                    try {
                        const uri = vscode.Uri.file(dirPath);
                        const entries = await vscode.workspace.fs.readDirectory(uri);
                        // Format: "filename  [file|directory]"
                        const lines = entries.map(([name, type]) => {
                            const kind = type === vscode.FileType.Directory ? 'directory' : 'file';
                            return `${name}  [${kind}]`;
                        });
                        const result = lines.join('\n') || '(empty directory)';
                        logger.debug(`[agileagentcanvas_list_directory] Listed ${entries.length} entries in ${dirPath}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(result)
                        ]);
                    } catch (err: any) {
                        const msg = `Error listing "${dirPath}": ${err?.message ?? err}`;
                        logger.debug(`[agileagentcanvas_list_directory] ${msg}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(msg)
                        ]);
                    }
                });
            }
        }, 'agileagentcanvas_list_directory'))
    );

    // ── agileagentcanvas_update_artifact ────────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ type: string; id: string; changes: Record<string, any> }>(
            'agileagentcanvas_update_artifact',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_update_artifact', async () => {
                        const { type, id, changes } = request.input;

                        if (!type || !id || !changes || typeof changes !== 'object') {
                            const msg = 'agileagentcanvas_update_artifact requires type, id, and a changes object.';
                            logger.debug(`[agileagentcanvas_update_artifact] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        }

                        // ── Schema validation (strict mode) ────────────────
                        // Lazily initialise the validator on first use so that
                        // ctx.bmadPath is already set by the time we need it.
                        if (ctx.bmadPath && !schemaValidator.isInitialized()) {
                            try {
                                schemaValidator.init(ctx.bmadPath);
                            } catch (err: any) {
                                logger.debug(
                                    `[agileagentcanvas_update_artifact] Schema validator init failed: ${err?.message ?? err}`
                                );
                            }
                        }

                        const validation = schemaValidator.validateChanges(type, changes);
                        if (!validation.valid) {
                            const errorMsg =
                                `REJECTED: The changes for ${type}/${id} do not conform to the artifact schema.\n\n` +
                                `Schema validation errors:\n` +
                                validation.errors.map(e => `  - ${e}`).join('\n') +
                                `\n\nPlease fix the changes to match the schema exactly and call agileagentcanvas_update_artifact again. ` +
                                `Use only the field names, types, and enum values defined in the schema.`;
                            logger.debug(
                                `[agileagentcanvas_update_artifact] REJECTED ${type}/${id}: ` +
                                validation.errors.join('; ')
                            );
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(errorMsg)
                            ]);
                        }

                        try {
                            await ctx.store.updateArtifact(type, id, changes);
                            const msg = `Artifact ${type}/${id} updated successfully.`;
                            logger.debug(`[agileagentcanvas_update_artifact] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        } catch (err: any) {
                            const msg = `Error updating artifact ${type}/${id}: ${err?.message ?? err}`;
                            logger.debug(`[agileagentcanvas_update_artifact] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        }
                    });
                }
            }, 'agileagentcanvas_update_artifact')
        )
    );

    // ── agileagentcanvas_write_file ───────────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ path: string; content: string; format?: string }>(
            'agileagentcanvas_write_file',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_write_file', async () => {
                        const filePath = request.input.path;
                        const content = request.input.content;
                        const requestedFormat = request.input.format; // 'json', 'markdown', or 'dual'
                        // Write operations are restricted to outputPath and workspace folders.
                        // bmadPath (resources/_aac/) is read-only framework code — never writable.
                        const allowedRoots = getAllowedRoots(ctx).filter(r => r !== ctx.bmadPath);

                        if (!isPathAllowed(filePath, allowedRoots)) {
                            const msg = `Access denied: "${filePath}" is outside the allowed AgileAgentCanvas paths.`;
                            logger.debug(`[agileagentcanvas_write_file] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        }

                        if (!content || typeof content !== 'string') {
                            const msg = 'agileagentcanvas_write_file requires a non-empty content string.';
                            logger.debug(`[agileagentcanvas_write_file] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        }

                        // Artifact writes are always JSON. Markdown export is available
                        // via the user-initiated export command only.
                        const effectiveFormat = requestedFormat || 'json';

                        try {
                            const ext = path.extname(filePath).toLowerCase();
                            const baseName = path.basename(filePath, ext);
                            const dirUri = vscode.Uri.file(path.dirname(filePath));
                            const written: string[] = [];

                            // Determine what to write based on format and the file extension
                            if (ext === '.json' || ext === '') {
                                // LLM is writing a JSON file
                                if (effectiveFormat === 'json' || effectiveFormat === 'dual') {
                                    const jsonPath = ext === '.json' ? filePath : filePath + '.json';
                                    const jsonUri = vscode.Uri.file(jsonPath);
                                    await vscode.workspace.fs.writeFile(
                                        jsonUri,
                                        Buffer.from(content, 'utf-8')
                                    );
                                    written.push(jsonPath);
                                }
                                if (effectiveFormat === 'markdown' || effectiveFormat === 'dual') {
                                    // Try to generate a Markdown companion from JSON content
                                    const mdPath = path.join(path.dirname(filePath), baseName + '.md');
                                    const mdUri = vscode.Uri.file(mdPath);
                                    let mdContent: string;
                                    try {
                                        // If content is valid JSON, render it as readable Markdown
                                        const parsed = JSON.parse(content);
                                        mdContent = jsonToMarkdown(baseName, parsed);
                                    } catch {
                                        // Not valid JSON — write the content as-is
                                        mdContent = content;
                                    }
                                    await vscode.workspace.fs.writeFile(
                                        mdUri,
                                        Buffer.from(mdContent, 'utf-8')
                                    );
                                    written.push(mdPath);
                                }
                            } else if (ext === '.md') {
                                // LLM is writing a Markdown file
                                if (effectiveFormat === 'markdown' || effectiveFormat === 'dual') {
                                    await vscode.workspace.fs.writeFile(
                                        vscode.Uri.file(filePath),
                                        Buffer.from(content, 'utf-8')
                                    );
                                    written.push(filePath);
                                }
                                if (effectiveFormat === 'json' || effectiveFormat === 'dual') {
                                    // Also write a JSON companion with the Markdown wrapped
                                    const jsonPath = path.join(path.dirname(filePath), baseName + '.json');
                                    const jsonUri = vscode.Uri.file(jsonPath);
                                    const jsonContent = JSON.stringify({
                                        title: baseName,
                                        content: content
                                    }, null, 2);
                                    await vscode.workspace.fs.writeFile(
                                        jsonUri,
                                        Buffer.from(jsonContent, 'utf-8')
                                    );
                                    written.push(jsonPath);
                                }
                            } else {
                                // Other extensions — write as-is regardless of format
                                await vscode.workspace.fs.writeFile(
                                    vscode.Uri.file(filePath),
                                    Buffer.from(content, 'utf-8')
                                );
                                written.push(filePath);
                            }

                            // Telemetry: detect unexpected MD writes in the output folder
                            const mdWrites = written.filter(p => p.endsWith('.md') && isPathAllowed(p, [ctx.outputPath]));
                            if (mdWrites.length > 0) {
                                toolTelemetry.record({
                                    tool: 'agileagentcanvas_write_file_md',
                                    status: 'ok',
                                    latencyMs: 0,
                                    timestamp: new Date().toISOString(),
                                });
                                logger.warn(`[agileagentcanvas_write_file] Unexpected MD write detected: ${mdWrites.join(', ')}`);
                            }

                            const msg = `File(s) written successfully: ${written.join(', ')}`;
                            logger.debug(`[agileagentcanvas_write_file] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        } catch (err: any) {
                            const msg = `Error writing "${filePath}": ${err?.message ?? err}`;
                            logger.debug(`[agileagentcanvas_write_file] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        }
                    });
                }
            }, 'agileagentcanvas_write_file')
        )
    );

    // ── agileagentcanvas_sync_story_status ────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ storyId: string; epicId: string; status: string }>(
            'agileagentcanvas_sync_story_status',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_sync_story_status', async () => {
                        const { storyId, epicId, status } = request.input;

                        if (!storyId || !status) {
                            const msg = 'agileagentcanvas_sync_story_status requires storyId and status.';
                            logger.debug(`[agileagentcanvas_sync_story_status] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(JSON.stringify({ ok: false, reason: 'missing_required_field', message: msg }))
                            ]);
                        }

                        if (!epicId) {
                            const msg = 'agileagentcanvas_sync_story_status requires epicId.';
                            logger.debug(`[agileagentcanvas_sync_story_status] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(JSON.stringify({ ok: false, reason: 'missing_epic_id', message: msg }))
                            ]);
                        }

                        try {
                            const result = await ctx.store.syncStoryStatusAtomic(storyId, epicId, status);
                            const msg = result.success
                                ? `✅ Story ${storyId} status synced to "${status}" across ${result.updatedFiles.length} files: ${result.updatedFiles.join(', ')}`
                                : `⚠️ Story sync partially failed. Updated files: ${result.updatedFiles.join(', ')}`;
                            logger.debug(`[agileagentcanvas_sync_story_status] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        } catch (err: any) {
                            const msg = `Error syncing story status: ${err?.message ?? err}`;
                            logger.debug(`[agileagentcanvas_sync_story_status] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        }
                    });
                }
            }, 'agileagentcanvas_sync_story_status')
        )
    );

    // ── agileagentcanvas_sync_epic_status ──────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ epicId: string; status: string }>(
            'agileagentcanvas_sync_epic_status',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_sync_epic_status', async () => {
                        const { epicId, status } = request.input;

                        if (!epicId || !status) {
                            const msg = 'agileagentcanvas_sync_epic_status requires epicId and status.';
                            logger.debug(`[agileagentcanvas_sync_epic_status] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        }

                        try {
                            const result = await ctx.store.syncEpicStatusAtomic(epicId, status);
                            const msg = result.success
                                ? `✅ Epic ${epicId} status synced to "${status}" across ${result.updatedFiles.length} files: ${result.updatedFiles.join(', ')}`
                                : `⚠️ Epic sync partially failed. Updated files: ${result.updatedFiles.join(', ')}`;
                            logger.debug(`[agileagentcanvas_sync_epic_status] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        } catch (err: any) {
                            const msg = `Error syncing epic status: ${err?.message ?? err}`;
                            logger.debug(`[agileagentcanvas_sync_epic_status] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        }
                    });
                }
            }, 'agileagentcanvas_sync_epic_status')
        )
    );

    // ── agileagentcanvas_read_jira ─────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ action: string; projectKey?: string; epicKey?: string }>(
            'agileagentcanvas_read_jira',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_read_jira', async () => {
                        const { action, projectKey, epicKey } = request.input;

                        // Read config at call time so it always reflects current settings
                        const config = await getJiraConfig();
                        if (!config) {
                            const msg =
                                'Jira is not configured. Ask the user to set ' +
                                'agileagentcanvas.jira.baseUrl and agileagentcanvas.jira.email in VS Code Settings, ' +
                                'then run the command "Agile Agent Canvas: Set Jira API Token" to store the token securely in the OS keychain.';
                            logger.debug(`[agileagentcanvas_read_jira] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        }

                        const resolvedProject = projectKey ?? config.projectKey;
                        const client = new JiraClient(config);

                        try {
                            if (action === 'test_connection') {
                                const me = await client.testConnection();
                                const msg = `Connected to Jira as ${me.displayName} (${me.email}).`;
                                logger.debug(`[agileagentcanvas_read_jira] ${msg}`);
                                return new vscode.LanguageModelToolResult([
                                    new vscode.LanguageModelTextPart(msg)
                                ]);
                            }

                            if (action === 'list_epics') {
                                if (!resolvedProject) {
                                    return new vscode.LanguageModelToolResult([
                                        new vscode.LanguageModelTextPart(
                                            'Please provide a projectKey (e.g. "PROJ") to list epics.'
                                        )
                                    ]);
                                }
                                const epics = await client.fetchEpics(resolvedProject);
                                const md = formatEpicsAsMarkdown(epics);
                                logger.debug(`[agileagentcanvas_read_jira] list_epics: ${epics.length} epics`);
                                return new vscode.LanguageModelToolResult([
                                    new vscode.LanguageModelTextPart(md)
                                ]);
                            }

                            if (action === 'list_stories') {
                                if (epicKey) {
                                    if (!resolvedProject) {
                                        return new vscode.LanguageModelToolResult([
                                            new vscode.LanguageModelTextPart(
                                                'Please provide a projectKey along with epicKey to list stories.'
                                            )
                                        ]);
                                    }
                                    const stories = await client.fetchStoriesForEpic(epicKey, resolvedProject);
                                    const md = formatStoriesAsMarkdown(stories, epicKey);
                                    logger.debug(`[agileagentcanvas_read_jira] list_stories (epic ${epicKey}): ${stories.length}`);
                                    return new vscode.LanguageModelToolResult([
                                        new vscode.LanguageModelTextPart(md)
                                    ]);
                                }
                                if (!resolvedProject) {
                                    return new vscode.LanguageModelToolResult([
                                        new vscode.LanguageModelTextPart(
                                            'Please provide a projectKey or epicKey to list stories.'
                                        )
                                    ]);
                                }
                                const stories = await client.fetchAllStoriesInProject(resolvedProject);
                                const md = formatStoriesAsMarkdown(stories);
                                logger.debug(`[agileagentcanvas_read_jira] list_stories (project ${resolvedProject}): ${stories.length}`);
                                return new vscode.LanguageModelToolResult([
                                    new vscode.LanguageModelTextPart(md)
                                ]);
                            }

                            if (action === 'list_all') {
                                if (!resolvedProject) {
                                    return new vscode.LanguageModelToolResult([
                                        new vscode.LanguageModelTextPart(
                                            'Please provide a projectKey to list all epics and stories.'
                                        )
                                    ]);
                                }
                                const epics = await client.fetchEpicsWithStories(resolvedProject);
                                const md = formatEpicsAsMarkdown(epics);
                                logger.debug(`[agileagentcanvas_read_jira] list_all (${resolvedProject}): ${epics.length} epics`);
                                return new vscode.LanguageModelToolResult([
                                    new vscode.LanguageModelTextPart(md)
                                ]);
                            }

                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(
                                    `Unknown action "${action}". Valid actions: test_connection, list_epics, list_stories, list_all.`
                                )
                            ]);

                        } catch (err: any) {
                            const msg = `Jira error (${action}): ${err?.message ?? err}`;
                            logger.debug(`[agileagentcanvas_read_jira] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        }
                    });
                }
            }, 'agileagentcanvas_read_jira')
        )
    );

    // ── agileagentcanvas_graph_query ──────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ question: string; budget?: number }>(
            'agileagentcanvas_graph_query',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_graph_query', async () => {
                        const question = request.input.question;
                        const budget = request.input.budget ?? 1500;

                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        const workspaceRoot = workspaceFolders?.[0]?.uri?.fsPath ?? '';
                        if (!workspaceRoot) {
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart('No workspace open.')
                            ]);
                        }

                        try {
                            const result = await graphQuery(workspaceRoot, question, budget);
                            logger.debug(`[agileagentcanvas_graph_query] success=${result.success}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(result.text)
                            ]);
                        } catch (err: any) {
                            const msg = `graph_query error: ${err?.message ?? err}`;
                            logger.debug(`[agileagentcanvas_graph_query] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        }
                    });
                }
            }, 'agileagentcanvas_graph_query')
        )
    );

    // ── agileagentcanvas_graph_path ───────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ nodeA: string; nodeB: string }>(
            'agileagentcanvas_graph_path',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_graph_path', async () => {
                        const { nodeA, nodeB } = request.input;

                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        const workspaceRoot = workspaceFolders?.[0]?.uri?.fsPath ?? '';
                        if (!workspaceRoot) {
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart('No workspace open.')
                            ]);
                        }

                        try {
                            const result = await graphPath(workspaceRoot, nodeA, nodeB);
                            logger.debug(`[agileagentcanvas_graph_path] success=${result.success}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(result.text)
                            ]);
                        } catch (err: any) {
                            const msg = `graph_path error: ${err?.message ?? err}`;
                            logger.debug(`[agileagentcanvas_graph_path] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        }
                    });
                }
            }, 'agileagentcanvas_graph_path')
        )
    );

    // ── agileagentcanvas_graph_community ──────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ community: string }>(
            'agileagentcanvas_graph_community',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_graph_community', async () => {
                        const { community } = request.input;

                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        const workspaceRoot = workspaceFolders?.[0]?.uri?.fsPath ?? '';
                        if (!workspaceRoot) {
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart('No workspace open.')
                            ]);
                        }

                        try {
                            const content = await loadCommunityWiki(workspaceRoot, community);
                            const text = content
                                ? content
                                : `No community found matching "${community}". Use the Architecture Index (ARCH_INDEX.md) to find valid community labels.`;
                            logger.debug(`[agileagentcanvas_graph_community] community="${community}" found=${!!content}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(text)
                            ]);
                        } catch (err: any) {
                            const msg = `graph_community error: ${err?.message ?? err}`;
                            logger.debug(`[agileagentcanvas_graph_community] ${msg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(msg)
                            ]);
                        }
                    });
                }
            }, 'agileagentcanvas_graph_community')
        )
    );

    // ── agileagentcanvas_codeburn_report ──────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ period?: string; action?: string }>(
            'agileagentcanvas_codeburn_report',
            wrapToolWithDynamicTracing({
                async invoke(request, token) {
                    return trackToolCall('agileagentcanvas_codeburn_report', async () => {
                        const { period, action } = request.input;
                        const { CodeburnCommands } = await import('../commands/codeburn-commands.js');
                        const cb = new CodeburnCommands();

                        if (action === 'models') {
                            const md = await cb.getChatModels(undefined, token);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(md)
                            ]);
                        }

                        const summary = await cb.getChatSummary(period || undefined, token);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(summary)
                        ]);
                    });
                }
            }, 'agileagentcanvas_codeburn_report')
        )
    );

    // ── agileagentcanvas_repair_json ───────────────────────────────────────
    // Hard caps to prevent extension-host DoS via oversized inputs/outputs.
    const REPAIR_JSON_MAX_INPUT_BYTES = 10 * 1024 * 1024;  // 10 MB
    const REPAIR_JSON_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;  // 2 MB
    disposables.push(
        vscode.lm.registerTool<{ data: any; schemaName: string; strict?: boolean }>(
            'agileagentcanvas_repair_json',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_repair_json', async () => {
                        const { data, schemaName, strict } = request.input;

                        // Helper for structured error responses
                        const errorResult = (reason: string, message: string, extra: Record<string, any> = {}) => {
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(
                                    JSON.stringify({ ok: false, reason, message, ...extra }, null, 2)
                                )
                            ]);
                        };

                        if (data === undefined || data === null) {
                            logger.debug('[agileagentcanvas_repair_json] missing data');
                            return errorResult('missing-data', 'agileagentcanvas_repair_json requires a non-null data object.');
                        }

                        // Guard against oversized inputs (DoS prevention)
                        try {
                            const inputSize = JSON.stringify(data).length;
                            if (inputSize > REPAIR_JSON_MAX_INPUT_BYTES) {
                                logger.debug(`[agileagentcanvas_repair_json] input too large: ${inputSize} bytes`);
                                return errorResult(
                                    'input-too-large',
                                    `Input data is ${inputSize} bytes (limit: ${REPAIR_JSON_MAX_INPUT_BYTES}). ` +
                                    `Repair a smaller subset of fields and call again.`
                                );
                            }
                        } catch (e: any) {
                            return errorResult(
                                'input-not-serializable',
                                `Input data is not JSON-serializable: ${e?.message ?? e}`
                            );
                        }

                        // Lazily initialise the schema validator
                        if (ctx.bmadPath && !schemaValidator.isInitialized()) {
                            try {
                                schemaValidator.init(ctx.bmadPath);
                            } catch (err: any) {
                                const msg = `Schema validator init failed: ${err?.message ?? err}`;
                                logger.debug(`[agileagentcanvas_repair_json] ${msg}`);
                                return errorResult('validator-init-failed', msg);
                            }
                        }

                        // Look up the schema by BMAD artifact type
                        const schemaContent = schemaValidator.getSchemaContent(schemaName);
                        if (!schemaContent) {
                            const validTypes = getAvailableSchemaTypes();
                            const msg =
                                `Schema not found for type "${schemaName}". ` +
                                `Common valid types: ${validTypes.slice(0, 8).join(', ')} ` +
                                `(${validTypes.length} total — see tool schema for full list).`;
                            logger.debug(`[agileagentcanvas_repair_json] ${msg}`);
                            return errorResult('schema-not-found', msg, { validTypes });
                        }

                        let schemaObj: any;
                        try {
                            schemaObj = JSON.parse(schemaContent);
                        } catch (err: any) {
                            const msg = `Failed to parse schema for "${schemaName}": ${err?.message ?? err}`;
                            logger.debug(`[agileagentcanvas_repair_json] ${msg}`);
                            return errorResult('schema-parse-error', msg);
                        }

                        try {
                            const result = repairDataWithSchema(data, schemaObj);

                            // STRICT MODE: succeed only when no repairs were needed.
                            // (Previously the condition was inverted and unreachable.)
                            if (strict && result.changed) {
                                logger.debug(
                                    `[agileagentcanvas_repair_json] strict-mode failed: ` +
                                    `${result.repairs.length} repairs needed`
                                );
                                return errorResult(
                                    'strict-mode-repairs-needed',
                                    `Strict mode: data required ${result.repairs.length} repairs. ` +
                                    `Set strict=false to accept the repaired version, or fix the data manually.`,
                                    { repairs: result.repairs, repairCount: result.repairs.length }
                                );
                            }

                            const responsePayload = {
                                ok: true,
                                changed: result.changed,
                                data: result.data,
                                repairs: result.repairs,
                                repairCount: result.repairs.length
                            };

                            // Guard against oversized outputs (DoS prevention)
                            const serialized = JSON.stringify(responsePayload, null, 2);
                            if (serialized.length > REPAIR_JSON_MAX_OUTPUT_BYTES) {
                                logger.debug(
                                    `[agileagentcanvas_repair_json] output too large: ` +
                                    `${serialized.length} bytes; truncating data field`
                                );
                                const truncated = {
                                    ok: true,
                                    changed: result.changed,
                                    repairCount: result.repairs.length,
                                    repairs: result.repairs,
                                    data: `[truncated — full repaired data is ${serialized.length} bytes (limit ${REPAIR_JSON_MAX_OUTPUT_BYTES}). ` +
                                          `Inspect specific paths or call again with a smaller subset.]`,
                                    _truncated: true
                                };
                                return new vscode.LanguageModelToolResult([
                                    new vscode.LanguageModelTextPart(JSON.stringify(truncated, null, 2))
                                ]);
                            }

                            logger.debug(
                                `[agileagentcanvas_repair_json] schemaName=${schemaName} ` +
                                `changed=${result.changed} repairs=${result.repairs.length} ` +
                                `bytes=${serialized.length}`
                            );
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(serialized)
                            ]);
                        } catch (err: any) {
                            const msg = `Repair failed for "${schemaName}": ${err?.message ?? err}`;
                            logger.debug(`[agileagentcanvas_repair_json] ${msg}`);
                            return errorResult('repair-failed', msg);
                        }
                    });
                }
            }, 'agileagentcanvas_repair_json')
        )
    );

    // ── agileagentcanvas_frontmatter_extract ─────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ path: string }>('agileagentcanvas_frontmatter_extract', wrapToolWithDynamicTracing({
            async invoke(request, _token) {
                return trackToolCall('agileagentcanvas_frontmatter_extract', async () => {
                    const filePath = request.input.path;
                    const allowedRoots = getAllowedRoots(ctx);

                    if (!isPathAllowed(filePath, allowedRoots)) {
                        const msg = `Access denied: "${filePath}" is outside the allowed BMAD paths.`;
                        logger.debug(`[agileagentcanvas_frontmatter_extract] ${msg}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(msg)
                        ]);
                    }

                    try {
                        const uri = vscode.Uri.file(filePath);
                        const bytes = await vscode.workspace.fs.readFile(uri);
                        const content = Buffer.from(bytes).toString('utf-8');

                        const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
                        const match = content.match(frontmatterRegex);

                        if (!match) {
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(JSON.stringify({ frontmatter: null, body: content }))
                            ]);
                        }

                        const { parse: parseYaml } = require('yaml');
                        const frontmatter = parseYaml(match[1]);
                        const body = content.slice(match[0].length).trim();

                        logger.debug(`[agileagentcanvas_frontmatter_extract] Extracted frontmatter from ${filePath}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(JSON.stringify({ frontmatter, body }))
                        ]);
                    } catch (err: any) {
                        const msg = `Error extracting frontmatter from "${filePath}": ${err?.message ?? err}`;
                        logger.debug(`[agileagentcanvas_frontmatter_extract] ${msg}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(msg)
                        ]);
                    }
                });
            }
        }, 'agileagentcanvas_frontmatter_extract'))
    );

    // ── agileagentcanvas_yaml_to_json ───────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ yaml: string }>('agileagentcanvas_yaml_to_json', wrapToolWithDynamicTracing({
            async invoke(request, _token) {
                return trackToolCall('agileagentcanvas_yaml_to_json', async () => {
                    try {
                        const { parse: parseYaml } = require('yaml');
                        const data = parseYaml(request.input.yaml);
                        logger.debug(`[agileagentcanvas_yaml_to_json] Converted YAML successfully`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(JSON.stringify({ ok: true, data }))
                        ]);
                    } catch (err: any) {
                        const errorMsg = err instanceof Error ? err.message : String(err);
                        logger.debug(`[agileagentcanvas_yaml_to_json] Parse error: ${errorMsg}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(JSON.stringify({ ok: false, error: errorMsg }))
                        ]);
                    }
                });
            }
        }, 'agileagentcanvas_yaml_to_json'))
    );

    // ── agileagentcanvas_json_diff ─────────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ left: object; right: object; format?: string }>(
            'agileagentcanvas_json_diff',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_json_diff', async () => {
                        try {
                            const { left, right } = request.input;
                            const changes: Difference[] = microdiff(left, right);
                            const summary = {
                                added: changes.filter((c: any) => c.type === 'CREATE').length,
                                removed: changes.filter((c: any) => c.type === 'REMOVE').length,
                                modified: changes.filter((c: any) => c.type === 'CHANGE').length
                            };
                            logger.debug(
                                `[agileagentcanvas_json_diff] Diff computed: ${changes.length} changes`
                            );
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(JSON.stringify({ changes, summary }))
                            ]);
                        } catch (err: any) {
                            const errorMsg = err instanceof Error ? err.message : String(err);
                            logger.debug(`[agileagentcanvas_json_diff] Error: ${errorMsg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(JSON.stringify({ ok: false, error: errorMsg }))
                            ]);
                        }
                    });
                }
            }, 'agileagentcanvas_json_diff')
        )
    );

    // ── agileagentcanvas_json_merge ───────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ left: object; right: object; strategy?: string }>(
            'agileagentcanvas_json_merge',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_json_merge', async () => {
                        try {
                            const { left, right, strategy } = request.input;
                            let merged: object;
                            switch (strategy) {
                                case 'shallow':
                                    merged = { ...left, ...right };
                                    break;
                                case 'right-authoritative':
                                    merged = { ...left, ...right };
                                    break;
                                case 'array-replace':
                                    merged = deepmerge(left, right, {
                                        arrayMerge: (_target, source) => source
                                    } satisfies DeepmergeOptions);
                                    break;
                                case 'deep':
                                default:
                                    merged = deepmerge(left, right);
                                    break;
                            }
                            logger.debug(
                                `[agileagentcanvas_json_merge] Merged with strategy: ${strategy ?? 'deep'}`
                            );
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(JSON.stringify({ ok: true, data: merged }))
                            ]);
                        } catch (err: any) {
                            const errorMsg = err instanceof Error ? err.message : String(err);
                            logger.debug(`[agileagentcanvas_json_merge] Error: ${errorMsg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(JSON.stringify({ ok: false, error: errorMsg }))
                            ]);
                        }
                    });
                }
            }, 'agileagentcanvas_json_merge')
        )
    );

    // ── agileagentcanvas_artifact_query ───────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ type?: string; status?: string; epicId?: string; priority?: string; limit?: number }>(
            'agileagentcanvas_artifact_query',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_artifact_query', async () => {
                        const { type, status, epicId, priority, limit } = request.input;

                        const errorResult = (reason: string, message: string) => {
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(
                                    JSON.stringify({ ok: false, reason, message }, null, 2)
                                )
                            ]);
                        };

                        if (!type && !status && !epicId && !priority) {
                            logger.debug('[agileagentcanvas_artifact_query] No filter provided');
                            return errorResult(
                                'no_filter',
                                'At least one filter must be provided to avoid returning the entire store.'
                            );
                        }

                        const effectiveLimit = Math.min(limit ?? 50, 500);
                        const state = ctx.store.getState() as any;

                        type ArtifactSummary = { id: string; type: string; title: string; status: string };
                        const candidates: ArtifactSummary[] = [];

                        if (state.vision?.id && (!type || type === 'vision')) {
                            candidates.push({ id: state.vision.id, type: 'vision', title: state.vision.title ?? '', status: state.vision.status ?? '' });
                        }

                        for (const epic of (state.epics ?? [])) {
                            if ((!type || type === 'epic') && (!status || epic.status === status) && (!priority || epic.priority === priority)) {
                                candidates.push({ id: epic.id, type: 'epic', title: epic.title ?? '', status: epic.status ?? '' });
                            }
                            for (const story of (epic.stories ?? [])) {
                                if (!type || type === 'story') {
                                    if (status && story.status !== status) continue;
                                    if (priority && story.priority !== priority) continue;
                                    if (epicId && epic.id !== epicId) continue;
                                    candidates.push({ id: story.id, type: 'story', title: story.title ?? '', status: story.status ?? '' });
                                }
                            }
                        }

                        const result = candidates.slice(0, effectiveLimit);
                        logger.debug(`[agileagentcanvas_artifact_query] filter=(${type},${status},${epicId},${priority}) found=${result.length}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(JSON.stringify({ ok: true, artifacts: result, count: result.length }))
                        ]);
                    });
                }
            }, 'agileagentcanvas_artifact_query')
        )
    );

    // ── agileagentcanvas_workflow_resolve_vars ──────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ template: string; vars?: Record<string, string> }>(
            'agileagentcanvas_workflow_resolve_vars',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_workflow_resolve_vars', async () => {
                        const { template, vars = {} } = request.input;

                        if (!template || typeof template !== 'string') {
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(
                                    JSON.stringify({ ok: false, reason: 'invalid_template', message: 'template must be a non-empty string.' })
                                )
                            ]);
                        }

                        const resolved = template.replace(/\{\{([\w.]+)\}\}/g, (match, key) => {
                            return vars[key] ?? match;
                        });

                        logger.debug(`[agileagentcanvas_workflow_resolve_vars] resolved=${resolved !== template}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(JSON.stringify({ ok: true, resolved }))
                        ]);
                    });
                }
            }, 'agileagentcanvas_workflow_resolve_vars')
        )
    );

    // ── agileagentcanvas_types_from_schema ─────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ schema: object; rootName?: string }>(
            'agileagentcanvas_types_from_schema',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_types_from_schema', async () => {
                        const { schema, rootName = 'Root' } = request.input;

                        if (!schema || typeof schema !== 'object') {
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(
                                    JSON.stringify({ ok: false, reason: 'invalid_schema', message: 'schema must be a non-null object.' })
                                )
                            ]);
                        }

                        const schemaObj = schema as Record<string, any>;
                        const requiredFields = schemaObj.required ?? [];

                        function schemaToTs(s: Record<string, any>): string {
                            if (s.type === 'string') return 'string';
                            if (s.type === 'number' || s.type === 'integer') return 'number';
                            if (s.type === 'boolean') return 'boolean';
                            if (s.type === 'array') {
                                const itemType = s.items ? schemaToTs(s.items as Record<string, any>) : 'unknown';
                                return `Array<${itemType}>`;
                            }
                            if (s.type === 'object') {
                                if (s.properties) {
                                    const entries = Object.entries(s.properties as Record<string, any>);
                                    const props = entries.map(([p, ps]) => {
                                        const ptype = schemaToTs(ps as Record<string, any>);
                                        const safeProp = /^[a-zA-Z_$][\w$]*$/.test(p) ? p : `'${p}'`;
                                        return `  ${safeProp}: ${ptype}`;
                                    });
                                    return `{\n${props.join('\n')}\n}`;
                                }
                                return 'Record<string, unknown>';
                            }
                            if (s.enum) {
                                return s.enum.map((v: any) => JSON.stringify(v)).join(' | ');
                            }
                            return 'unknown';
                        }

                        const lines: string[] = [`export interface ${rootName} {`];
                        if (schemaObj.type === 'object' && schemaObj.properties) {
                            for (const [prop, propSchema] of Object.entries(schemaObj.properties as Record<string, any>)) {
                                const isRequired = requiredFields.includes(prop);
                                const optional = isRequired ? '' : '?';
                                const propType = schemaToTs(propSchema);
                                const safeProp = /^[a-zA-Z_$][\w$]*$/.test(prop) ? prop : `'${prop}'`;
                                lines.push(`  ${safeProp}${optional}: ${propType};`);
                            }
                        } else if (schemaObj.type === 'object' && !schemaObj.properties) {
                            lines.push('  [key: string]: unknown;');
                        }
                        lines.push('}');

                        const code = lines.join('\n');
                        logger.debug(`[agileagentcanvas_types_from_schema] rootName=${rootName}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(JSON.stringify({ ok: true, code }))
                        ]);
                    });
                }
            }, 'agileagentcanvas_types_from_schema')
        )
    );

    // ── agileagentcanvas_schema_from_json ───────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ samples: object[]; rootName?: string }>(
            'agileagentcanvas_schema_from_json',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_schema_from_json', async () => {
                        const { samples, rootName = 'Root' } = request.input;

                        if (!samples || !Array.isArray(samples) || samples.length === 0) {
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(
                                    JSON.stringify({ ok: false, reason: 'invalid_samples', message: 'samples must be a non-empty array of objects (1-10).' })
                                )
                            ]);
                        }

                        if (samples.length > 10) {
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(
                                    JSON.stringify({ ok: false, reason: 'too_many_samples', message: 'Maximum 10 samples. Provide a smaller set.' })
                                )
                            ]);
                        }

                        const fieldTypes: Record<string, Set<string>> = {};
                        const fieldRequired: Set<string> = new Set();

                        for (const sample of samples as any[]) {
                            if (typeof sample !== 'object' || sample === null) continue;
                            for (const [key, value] of Object.entries(sample)) {
                                if (!fieldTypes[key]) fieldTypes[key] = new Set();
                                const t = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
                                if (t) fieldTypes[key].add(t);
                                fieldRequired.add(key);
                            }
                        }

                        function inferType(v: any): string {
                            if (v === null) return 'null';
                            if (Array.isArray(v)) return 'array';
                            return typeof v;
                        }

                        function buildPropSchema(types: Set<string>): any {
                            if (types.has('array')) {
                                const elements: any[] = [];
                                for (const s of samples as any[]) {
                                    for (const v of Object.values(s)) {
                                        if (Array.isArray(v)) elements.push(...v);
                                    }
                                }
                                const elemTypes = new Set<string>();
                                for (const el of elements.slice(0, 10)) {
                                    elemTypes.add(inferType(el));
                                }
                                const merged = elemTypes.size === 1 ? [...elemTypes][0] : 'object';
                                return { type: 'array', items: { type: merged === 'object' ? undefined : merged } };
                            }
                            if (types.has('null') && types.size === 1) return { type: 'null' };
                            if (types.has('string') && types.size === 1) return { type: 'string' };
                            if (types.has('number') && types.size === 1) return { type: 'number' };
                            if (types.has('boolean') && types.size === 1) return { type: 'boolean' };
                            if (types.has('object') && types.size === 1) return { type: 'object', properties: {} };
                            return { type: 'string' };
                        }

                        const properties: Record<string, any> = {};
                        for (const [field, types] of Object.entries(fieldTypes)) {
                            properties[field] = buildPropSchema(types);
                        }

                        const required = [...fieldRequired].filter(k => (samples as any[]).every(s => k in s));

                        const inferredSchema = {
                            $schema: 'http://json-schema.org/draft-07/schema#',
                            title: rootName,
                            type: 'object',
                            properties,
                            required
                        };

                        logger.debug(`[agileagentcanvas_schema_from_json] fields=${Object.keys(properties).length} samples=${samples.length}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(JSON.stringify({ ok: true, schema: inferredSchema }))
                        ]);
                    });
                }
            }, 'agileagentcanvas_schema_from_json')
        )
    );

    // ── agileagentcanvas_codebase_search ────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ query: string; kind?: string; filePattern?: string; maxResults?: number }>(
            'agileagentcanvas_codebase_search',
            wrapToolWithDynamicTracing({
                async invoke(request, _token) {
                    return trackToolCall('agileagentcanvas_codebase_search', async () => {
                        const { query, kind = 'text', filePattern, maxResults = 30 } = request.input;

                        if (!query || typeof query !== 'string') {
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(
                                    JSON.stringify({ ok: false, reason: 'invalid_query', message: 'query must be a non-empty string.' })
                                )
                            ]);
                        }

                        const effectiveMax = Math.min(maxResults, 200);
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (!workspaceFolders?.length) {
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(JSON.stringify({ ok: false, reason: 'no_workspace', message: 'No workspace open.' }))
                            ]);
                        }

                        type SearchResult = { file: string; line: number; column: number; preview: string };
                        const results: SearchResult[] = [];

                        try {
                            const glob = filePattern ?? '**/*';
                            const exclude = '**/node_modules/**';
                            const files = await vscode.workspace.findFiles(glob, exclude);

                            for (const fileUri of files.slice(0, 200)) {
                                if (results.length >= effectiveMax) break;
                                try {
                                    const doc = await vscode.workspace.openTextDocument(fileUri);
                                    const text = doc.getText();

                                    if (kind === 'definition') {
                                        const defPatterns = [
                                            new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${query}\\b`, 'gm'),
                                            new RegExp(`^(?:export\\s+)?class\\s+${query}\\b`, 'gm'),
                                            new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+${query}\\s*=`, 'gm'),
                                            new RegExp(`^(?:export\\s+)?interface\\s+${query}\\b`, 'gm'),
                                            new RegExp(`^(?:export\\s+)?type\\s+${query}\\s*=`, 'gm'),
                                        ];
                                        for (const pattern of defPatterns) {
                                            let defMatch: RegExpExecArray | null;
                                            while ((defMatch = pattern.exec(text)) !== null) {
                                                const pos = doc.positionAt(defMatch.index);
                                                const line = doc.lineAt(pos.line);
                                                results.push({
                                                    file: fileUri.fsPath,
                                                    line: pos.line + 1,
                                                    column: pos.character + 1,
                                                    preview: line.text.trim().slice(0, 120)
                                                });
                                                if (results.length >= effectiveMax) break;
                                            }
                                            if (results.length >= effectiveMax) break;
                                        }
                                    } else {
                                        const searchRegex = new RegExp(query, 'g');
                                        let match: RegExpExecArray | null;
                                        let matchCount = 0;
                                        while ((match = searchRegex.exec(text)) !== null) {
                                            const pos = doc.positionAt(match.index);
                                            const line = doc.lineAt(pos.line);
                                            const start = Math.max(0, pos.character - 30);
                                            const preview = line.text.slice(start, start + 120).trim();
                                            results.push({
                                                file: fileUri.fsPath,
                                                line: pos.line + 1,
                                                column: pos.character + 1,
                                                preview
                                            });
                                            matchCount++;
                                            if (matchCount > 1000) break;
                                            if (results.length >= effectiveMax) break;
                                        }
                                    }
                                } catch {
                                    // Skip files that can't be read
                                }
                            }
                        } catch (err: any) {
                            const errorMsg = err instanceof Error ? err.message : String(err);
                            logger.debug(`[agileagentcanvas_codebase_search] Error: ${errorMsg}`);
                            return new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(JSON.stringify({ ok: false, reason: 'search_error', message: errorMsg }))
                            ]);
                        }

                        logger.debug(`[agileagentcanvas_codebase_search] kind=${kind} query=${query} results=${results.length}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(JSON.stringify({ ok: true, results }))
                        ]);
                    });
                }
            }, 'agileagentcanvas_codebase_search')
        )
    );

    logger.debug('[AgileAgentCanvasTools] Registered 21 language model tools');
    return disposables;
}

// ─── Tool definitions for sendRequest ───────────────────────────────────────

/**
 * Returns the vscode.LanguageModelChatTool descriptors to pass in
 * sendRequest({ tools: [...] }). These must match the names registered above.
 */
export function getToolDefinitions(): vscode.LanguageModelChatTool[] {
    return [
        {
            name: 'agileagentcanvas_read_file',
            description:
                'Reads a file from the BMAD framework folder, the project output folder, ' +
                'or any workspace folder. Use this to read agent definitions, workflow steps, ' +
                'schemas, checklists, project source code, configuration files, and any other ' +
                'files needed for context when creating or refining artifacts.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    path: {
                        type: 'string',
                        description: 'Absolute path to the file to read'
                    }
                },
                required: ['path']
            }
        },
        {
            name: 'agileagentcanvas_list_directory',
            description:
                'Lists the contents of a directory inside the BMAD framework folder, ' +
                'the project output folder, or any workspace folder. Use this to discover ' +
                'available workflows, agents, schemas, steps, and to explore project source ' +
                'code structure across all workspace folders.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    path: {
                        type: 'string',
                        description: 'Absolute path to the directory to list'
                    }
                },
                required: ['path']
            }
        },
        {
            name: 'agileagentcanvas_update_artifact',
            description:
                'Saves changes to a BMAD artifact (vision, epic, story, requirement, etc.) ' +
                'in the project. Call this when you have completed refining an artifact and ' +
                'are ready to persist the changes. IMPORTANT: The changes object is validated ' +
                'against the artifact\'s JSON schema. If validation fails, the update is REJECTED ' +
                'and you must fix the changes to match the schema exactly before retrying. ' +
                'Use only field names, types, enum values, and structures defined in the schema. ' +
                'The changes object should contain fields from the schema\'s "content" section ' +
                '(flattened — do NOT wrap in a "content" key). Metadata fields can also be ' +
                'included at the top level. ' +
                'STORIES: When type="story", if the story does not already exist, a NEW standalone ' +
                'story file is created in epics/epic-{N}/stories/. Stories MUST include "epicId" ' +
                'to link to their parent epic (e.g. "EPIC-1"). Use "id" (NOT "storyId") as the ' +
                'story identifier (e.g. "S-1.1", "S-2.3"). Each story call creates one file.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    type: {
                        type: 'string',
                        description: 'Artifact type: vision, epic, story, prd, architecture, requirement, etc.'
                    },
                    id: {
                        type: 'string',
                        description: 'Artifact ID, e.g. EPIC-1, S-1.1, vision-1, FR-1'
                    },
                    changes: {
                        type: 'object',
                        description:
                            'The fields to update on the artifact, as a JSON object. Must strictly ' +
                            'conform to the artifact\'s JSON schema — use exact field names (camelCase), ' +
                            'respect enum values, and match array/object structures. Non-conforming ' +
                            'updates will be rejected with specific validation errors. ' +
                            'For stories: include epicId, title, userStory, acceptanceCriteria, ' +
                            'storyPoints, technicalNotes, and requirementRefs.'
                    }
                },
                required: ['type', 'id', 'changes']
            }
        },
        {
            name: 'agileagentcanvas_write_file',
            description:
                'Writes a file to the project output folder or any workspace folder. ' +
                'Use this tool (instead of VS Code\'s built-in file editing) when writing ' +
                'implementation artifacts, story files, or any other output files. ' +
                'This tool automatically respects the user\'s configured output format setting: ' +
                'when the format is "dual", writing a .md file also generates a .json companion ' +
                'and vice versa. When the format is "json", only JSON files are written. ' +
                'When the format is "markdown", only Markdown files are written. ' +
                'ALWAYS prefer this tool over direct file editing for any file in the ' +
                '.agileagentcanvas-context directory tree.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    path: {
                        type: 'string',
                        description: 'Absolute path to the file to write (e.g. ending in .md or .json)'
                    },
                    content: {
                        type: 'string',
                        description: 'The file content to write'
                    },
                    format: {
                        type: 'string',
                        description: 'Optional override for output format: "json", "markdown", or "dual". ' +
                            'If omitted, artifact writes default to JSON. Markdown export is available via the user-initiated export command only.'
                    }
                },
                required: ['path', 'content']
            }
        },
        {
            name: 'agileagentcanvas_sync_story_status',
            description:
                'Atomically syncs a story\'s status in the standalone story JSON file ' +
                '(content.status + metadata.status). This is the SINGLE SOURCE OF TRUTH for story status. ' +
                'Use this instead of manually patching files when changing a story\'s status.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    storyId: {
                        type: 'string',
                        description: 'The story ID (e.g. "S-16.9")'
                    },
                    epicId: {
                        type: 'string',
                        description: 'The parent epic ID (e.g. "16")'
                    },
                    status: {
                        type: 'string',
                        description: 'The target status (e.g. "done", "in-progress", "in-review")'
                    }
                },
                required: ['storyId', 'epicId', 'status']
            }
        },
        {
            name: 'agileagentcanvas_sync_epic_status',
            description:
                'Atomically syncs an epic\'s status in the standalone epic JSON file ' +
                '(content.status + metadata.status). This is the SINGLE SOURCE OF TRUTH for epic status. ' +
                'Use this instead of manually patching files when changing an epic\'s status.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    epicId: {
                        type: 'string',
                        description: 'The epic ID (e.g. "16")'
                    },
                    status: {
                        type: 'string',
                        description: 'The target status (e.g. "done", "in-progress")'
                    }
                },
                required: ['epicId', 'status']
            }
        },
        {
            name: 'agileagentcanvas_read_jira',
            description:
                'Reads epics and stories from the user\'s Jira Cloud project via the REST API. ' +
                'Use this when the user asks about their Jira board, wants to see Jira issues, ' +
                'wants to import data from Jira, or asks about epics/stories in Jira. ' +
                'Requires Jira to be configured in VS Code Settings (agileagentcanvas.jira.*). ' +
                'If not configured, instructs the user how to set it up.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    action: {
                        type: 'string',
                        enum: ['test_connection', 'list_epics', 'list_stories', 'list_all'],
                        description:
                            'Action to perform: ' +
                            '"test_connection" — verify credentials; ' +
                            '"list_epics" — list all epics in a project; ' +
                            '"list_stories" — list stories (optionally filtered by epicKey); ' +
                            '"list_all" — list all epics with their stories.'
                    },
                    projectKey: {
                        type: 'string',
                        description: 'Jira project key, e.g. "PROJ". Falls back to the configured default project key if omitted.'
                    },
                    epicKey: {
                        type: 'string',
                        description: 'Epic issue key, e.g. "PROJ-42". Required when action is "list_stories" and you want stories for a specific epic.'
                    }
                },
                required: ['action']
            }
        },
        {
            name: 'agileagentcanvas_graph_query',
            description:
                'Run a natural-language question against the graphify knowledge graph of the codebase. ' +
                'Use this to understand code structure, trace connections between components, find rationale, ' +
                'or surface surprising relationships. Returns a focused subgraph answer. ' +
                'Requires graphify-out/graph.json to exist (run /graph-bootstrap if missing).',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    question: {
                        type: 'string',
                        description: 'Natural-language question about the codebase, e.g. "what connects ArtifactStore to the canvas view?"'
                    },
                    budget: {
                        type: 'number',
                        description: 'Max tokens to return (default 1500). Use a smaller value for focused answers.'
                    }
                },
                required: ['question']
            }
        },
        {
            name: 'agileagentcanvas_graph_path',
            description:
                'Find the shortest path between two nodes in the graphify knowledge graph. ' +
                'Use this to trace dependencies, understand how two concepts are related, ' +
                'or find the chain of calls between a feature and an implementation. ' +
                'Requires graphify-out/graph.json to exist.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    nodeA: {
                        type: 'string',
                        description: 'Source node label or ID, e.g. "ChatParticipant"'
                    },
                    nodeB: {
                        type: 'string',
                        description: 'Target node label or ID, e.g. "ArtifactStore"'
                    }
                },
                required: ['nodeA', 'nodeB']
            }
        },
        {
            name: 'agileagentcanvas_graph_community',
            description:
                'Get detailed context about a specific code community (module/domain) from the ' +
                'graphify knowledge graph. Returns the wiki page for that community, or a ' +
                'synthesised summary of its nodes, files, and relationships. ' +
                'Use this when you need deep understanding of a particular area of the codebase ' +
                'after identifying relevant communities via the Architecture Index (ARCH_INDEX.md). ' +
                'Requires graphify-out/graph.json to exist.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    community: {
                        type: 'string',
                        description: 'Community label as shown in ARCH_INDEX.md, e.g. "Auth & Session"'
                    }
                },
                required: ['community']
            }
        },
        {
            name: 'agileagentcanvas_codeburn_report',
            description:
                'Reads AI coding cost and token usage data from Codeburn. ' +
                'Use this when the user asks about their AI spend, token usage, costs, ' +
                'budget, or wants to compare model pricing. ' +
                'Codeburn reads session data directly from disk (no API keys needed). ' +
                'Returns a formatted markdown summary with cost, tokens, sessions, and provider. ' +
                'If codeburn is not installed, instructs the user how to install it.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    period: {
                        type: 'string',
                        description: 'Time period: "today", "7days", "30days", or omit for current status'
                    },
                    action: {
                        type: 'string',
                        enum: ['summary', 'models'],
                        description: 'Type of report: "summary" (default) for cost overview, "models" for per-model breakdown'
                    }
                },
                required: []
            }
        },
        {
            name: 'agileagentcanvas_repair_json',
            description:
                'Repair malformed JSON against a BMAD schema. ' +
                'Auto-fills missing required fields, coerces type mismatches (string↔number↔boolean), ' +
                'fuzzy-matches invalid enum values (e.g. "urgent" → "P0", "in progress" → "in-progress"), ' +
                'clamps numeric ranges, picks the best oneOf branch, strips disallowed properties, ' +
                'and converts non-ISO dates to ISO 8601. Resolves JSON-pointer $refs in the schema ' +
                'before validation so shared enum definitions are enforced. ' +
                'Use this when an agileagentcanvas_update_artifact call was REJECTED with validation errors ' +
                '(feed it the same changes object — it will return a fixed version), ' +
                'or when the LLM produced incomplete/malformed JSON for any BMAD artifact type. ' +
                'Returns { ok, changed, data, repairs, repairCount } — the repaired object plus a log ' +
                'of every repair applied (path + human description). NEVER write your own JSON repair code; ' +
                'always call this tool instead.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    data: {
                        type: 'object' as const,
                        description: 'The malformed JSON to repair. Pass the LLM output as-is. Max 10MB.'
                    },
                    schemaName: {
                        type: 'string' as const,
                        description: 'BMAD schema name. See `enum` for full list of valid types.',
                        enum: getAvailableSchemaTypes()
                    },
                    strict: {
                        type: 'boolean' as const,
                        description: 'If true, only succeeds when no repairs were needed. Default false — best-effort repair is usually what you want.'
                    }
                },
                required: ['data', 'schemaName']
            }
        },
        {
            name: 'agileagentcanvas_frontmatter_extract',
            description:
                'Extract YAML frontmatter from a markdown file as JSON. ALWAYS use this instead of writing a YAML parser or calling Python — saves tokens and avoids parse errors. Returns { frontmatter, body }.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    path: {
                        type: 'string',
                        description: 'Absolute path to the .md file under allowed roots.'
                    }
                },
                required: ['path']
            }
        },
        {
            name: 'agileagentcanvas_yaml_to_json',
            description:
                'Convert a YAML string to a JSON object. Use when reading BMAD artifacts stored as .yaml files, or when the LLM emits YAML and you need JSON. NEVER write a YAML parser inline.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    yaml: {
                        type: 'string',
                        description: 'The YAML string to convert.'
                    }
                },
                required: ['yaml']
            }
        },
        {
            name: 'agileagentcanvas_json_diff',
            description:
                'Compute a structured diff between two JSON objects. Returns a patch array and a summary { added, removed, modified }. Use instead of reading two files and comparing them in-context — saves ~400 tokens per diff.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    left: {
                        type: 'object',
                        description: 'The "before" JSON object.'
                    },
                    right: {
                        type: 'object',
                        description: 'The "after" JSON object.'
                    },
                    format: {
                        type: 'string',
                        enum: ['patch', 'unified', 'summary'],
                        description: 'Output format. "summary" is fastest; "unified" mimics git diff.',
                        default: 'summary'
                    }
                },
                required: ['left', 'right']
            }
        },
        {
            name: 'agileagentcanvas_json_merge',
            description:
                "Deep-merge two JSON objects with a configurable strategy. Use instead of manually combining JSON in-context. Strategies: 'deep' (recursive), 'shallow' (top-level only), 'right-authoritative' (right wins on conflict), 'array-replace' (arrays overwritten, not concatenated).",
            inputSchema: {
                type: 'object' as const,
                properties: {
                    left: {
                        type: 'object',
                        description: 'Base JSON object.'
                    },
                    right: {
                        type: 'object',
                        description: 'Override JSON object.'
                    },
                    strategy: {
                        type: 'string',
                        enum: ['deep', 'shallow', 'right-authoritative', 'array-replace'],
                        default: 'deep'
                    }
                },
                required: ['left', 'right']
            }
        },
        {
            name: 'agileagentcanvas_artifact_query',
            description:
                "Query the artifact store with filter criteria (type, status, epicId, priority, etc.) " +
                "and return matching artifacts with only their id, type, title, and status — NOT full content. " +
                "Use this instead of reading the entire artifact directory and filtering in context — " +
                "saves hundreds of tokens per query. At least one filter must be provided.",
            inputSchema: {
                type: 'object' as const,
                properties: {
                    type: {
                        type: 'string',
                        description: "Artifact type filter (e.g. 'epic', 'story', 'prd')"
                    },
                    status: {
                        type: 'string',
                        description: "Status filter (e.g. 'todo', 'in-progress', 'done')"
                    },
                    epicId: {
                        type: 'string',
                        description: "Filter by parent epic ID"
                    },
                    priority: {
                        type: 'string',
                        description: "Filter by priority (P0/P1/P2/P3)"
                    },
                    limit: {
                        type: 'number',
                        description: "Max results to return (default 50, max 500)"
                    }
                },
                required: []
            }
        },
        {
            name: 'agileagentcanvas_workflow_resolve_vars',
            description:
                "Resolve {{variable}} placeholders in a BMAD workflow template string. " +
                "Variables come from the provided `vars` object. " +
                "Missing variables are left as-is (e.g. {{missing}} stays {{missing}}). " +
                "Use this instead of writing your own regex replacement.",
            inputSchema: {
                type: 'object' as const,
                properties: {
                    template: {
                        type: 'string',
                        description: "The workflow template string containing {{var}} placeholders"
                    },
                    vars: {
                        type: 'object',
                        description: "Variable values keyed by name (e.g. {'epic_id': 'E-001', 'story_id': 'S-001-1'})"
                    }
                },
                required: ['template']
            }
        },
        {
            name: 'agileagentcanvas_types_from_schema',
            description:
                "Generate TypeScript interface declarations from a JSON schema object. " +
                "Handles required/optional fields, enums, nested objects, and arrays. " +
                "Returns formatted TypeScript code as a string. " +
                "Use this instead of writing interfaces by hand from a schema.",
            inputSchema: {
                type: 'object' as const,
                properties: {
                    schema: {
                        type: 'object' as const,
                        description: "The JSON schema object (output of agileagentcanvas_repair_json or read from resources/_aac/schemas/)"
                    },
                    rootName: {
                        type: 'string',
                        description: "Name of the root interface (default: 'Root')"
                    }
                },
                required: ['schema']
            }
        },
        {
            name: 'agileagentcanvas_schema_from_json',
            description:
                "Infer a JSON schema from one or more sample JSON objects. " +
                "The more samples provided, the more accurate the schema. " +
                "Use this when you have JSON output but no schema — avoids hand-rolling a schema. " +
                "Returns a valid JSON schema object.",
            inputSchema: {
                type: 'object' as const,
                properties: {
                    samples: {
                        type: 'array' as const,
                        description: "Array of sample JSON objects (1-10)",
                        items: {
                            type: 'object' as const
                        }
                    },
                    rootName: {
                        type: 'string',
                        description: "Name for the root schema (default: 'Root')"
                    }
                },
                required: ['samples']
            }
        },
        {
            name: 'agileagentcanvas_codebase_search',
            description:
                "Search the workspace for symbol definitions, references, or text matches. " +
                "Use this instead of running `grep` via shell — returns structured results " +
                "with file paths, line numbers, and context. " +
                "Backed by vscode.workspace.findFiles + content scan. Excludes node_modules by default.",
            inputSchema: {
                type: 'object' as const,
                properties: {
                    query: {
                        type: 'string',
                        description: "Search query — symbol name, function call, or text pattern. Supports ripgrep regex."
                    },
                    kind: {
                        type: 'string',
                        enum: ['definition', 'reference', 'text'],
                        description: "Search kind. 'definition' finds where symbols are defined (function/class/const/interface/type); 'reference' finds all uses; 'text' is plain text search. Default: 'text'."
                    },
                    filePattern: {
                        type: 'string',
                        description: "Glob pattern to scope the search (e.g. '**/*.ts')"
                    },
                    maxResults: {
                        type: 'number',
                        description: "Max results to return (default 30, max 200)"
                    }
                },
                required: ['query']
            }
        }
    ];
}
