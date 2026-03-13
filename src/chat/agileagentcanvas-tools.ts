import * as vscode from 'vscode';
import * as path from 'path';
import { acOutput } from '../extension';
import { ArtifactStore } from '../state/artifact-store';
import { schemaValidator } from '../state/schema-validator';

/**
 * AgileAgentCanvas Language Model Tools
 *
 * Registers three tools that the LLM can call during workflow execution:
 *   agileagentcanvas_read_file       — read any file under bmadPath, outputPath, or workspace folders
 *   agileagentcanvas_list_directory  — list contents of any directory under bmadPath, outputPath, or workspace folders
 *   agileagentcanvas_update_artifact — write changes to an artifact in the store
 *
 * These tools replace the old "pre-load one file → giant prompt string" pattern
 * and allow the LLM to navigate the _bmad framework folder and project source
 * code autonomously, exactly as it does when running BMAD natively in a raw
 * chat session.
 *
 * ## Security boundary
 * Read access is scoped to:
 *   1. The bundled _bmad framework folder (agents, workflows, schemas)
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
    /** Resolved path to the _bmad framework folder (always the bundled extension copy) */
    bmadPath: string;
    /** Resolved path to the project output folder */
    outputPath: string;
    /** The artifact store instance for agileagentcanvas_update_artifact */
    store: ArtifactStore;
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
        vscode.lm.registerTool<{ path: string }>('agileagentcanvas_read_file', {
            async invoke(request, _token) {
                const filePath = request.input.path;
                const allowedRoots = getAllowedRoots(ctx);

                if (!isPathAllowed(filePath, allowedRoots)) {
                    const msg = `Access denied: "${filePath}" is outside the allowed BMAD paths.`;
                    acOutput.appendLine(`[agileagentcanvas_read_file] ${msg}`);
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(msg)
                    ]);
                }

                try {
                    const uri = vscode.Uri.file(filePath);
                    const bytes = await vscode.workspace.fs.readFile(uri);
                    const content = Buffer.from(bytes).toString('utf-8');
                    acOutput.appendLine(`[agileagentcanvas_read_file] Read ${content.length} chars from ${filePath}`);
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(content)
                    ]);
                } catch (err: any) {
                    const msg = `Error reading "${filePath}": ${err?.message ?? err}`;
                    acOutput.appendLine(`[agileagentcanvas_read_file] ${msg}`);
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(msg)
                    ]);
                }
            }
        })
    );

    // ── agileagentcanvas_list_directory ─────────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ path: string }>('agileagentcanvas_list_directory', {
            async invoke(request, _token) {
                const dirPath = request.input.path;
                const allowedRoots = getAllowedRoots(ctx);

                if (!isPathAllowed(dirPath, allowedRoots)) {
                    const msg = `Access denied: "${dirPath}" is outside the allowed BMAD paths.`;
                    acOutput.appendLine(`[agileagentcanvas_list_directory] ${msg}`);
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
                    acOutput.appendLine(`[agileagentcanvas_list_directory] Listed ${entries.length} entries in ${dirPath}`);
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(result)
                    ]);
                } catch (err: any) {
                    const msg = `Error listing "${dirPath}": ${err?.message ?? err}`;
                    acOutput.appendLine(`[agileagentcanvas_list_directory] ${msg}`);
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(msg)
                    ]);
                }
            }
        })
    );

    // ── agileagentcanvas_update_artifact ────────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ type: string; id: string; changes: Record<string, any> }>(
            'agileagentcanvas_update_artifact',
            {
                async invoke(request, _token) {
                    const { type, id, changes } = request.input;

                    if (!type || !id || !changes || typeof changes !== 'object') {
                        const msg = 'agileagentcanvas_update_artifact requires type, id, and a changes object.';
                        acOutput.appendLine(`[agileagentcanvas_update_artifact] ${msg}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(msg)
                        ]);
                    }

                    // ── Schema validation (strict mode) ────────────────
                    // Lazily initialise the validator on first use so that
                    // ctx.bmadPath is already set by the time we need it.
                    if (ctx.bmadPath && !schemaValidator.isInitialized()) {
                        try {
                            schemaValidator.init(ctx.bmadPath, acOutput);
                        } catch (err: any) {
                            acOutput.appendLine(
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
                        acOutput.appendLine(
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
                        acOutput.appendLine(`[agileagentcanvas_update_artifact] ${msg}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(msg)
                        ]);
                    } catch (err: any) {
                        const msg = `Error updating artifact ${type}/${id}: ${err?.message ?? err}`;
                        acOutput.appendLine(`[agileagentcanvas_update_artifact] ${msg}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(msg)
                        ]);
                    }
                }
            }
        )
    );

    // ── agileagentcanvas_write_file ───────────────────────────────────────────────────
    disposables.push(
        vscode.lm.registerTool<{ path: string; content: string; format?: string }>(
            'agileagentcanvas_write_file',
            {
                async invoke(request, _token) {
                    const filePath = request.input.path;
                    const content = request.input.content;
                    const requestedFormat = request.input.format; // 'json', 'markdown', or 'dual'
                    const allowedRoots = getAllowedRoots(ctx);

                    if (!isPathAllowed(filePath, allowedRoots)) {
                        const msg = `Access denied: "${filePath}" is outside the allowed AgileAgentCanvas paths.`;
                        acOutput.appendLine(`[agileagentcanvas_write_file] ${msg}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(msg)
                        ]);
                    }

                    if (!content || typeof content !== 'string') {
                        const msg = 'agileagentcanvas_write_file requires a non-empty content string.';
                        acOutput.appendLine(`[agileagentcanvas_write_file] ${msg}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(msg)
                        ]);
                    }

                    // Determine the effective output format from the user's settings
                    const configFormat = vscode.workspace
                        .getConfiguration('agileagentcanvas')
                        .get<'json' | 'markdown' | 'dual'>('outputFormat', 'dual');
                    const effectiveFormat = requestedFormat || configFormat;

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

                        const msg = `File(s) written successfully: ${written.join(', ')}`;
                        acOutput.appendLine(`[agileagentcanvas_write_file] ${msg}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(msg)
                        ]);
                    } catch (err: any) {
                        const msg = `Error writing "${filePath}": ${err?.message ?? err}`;
                        acOutput.appendLine(`[agileagentcanvas_write_file] ${msg}`);
                        return new vscode.LanguageModelToolResult([
                            new vscode.LanguageModelTextPart(msg)
                        ]);
                    }
                }
            }
        )
    );

    acOutput.appendLine('[AgileAgentCanvasTools] Registered 4 language model tools');
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
                'included at the top level.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    type: {
                        type: 'string',
                        description: 'Artifact type: vision, epic, story, prd, architecture, requirement, etc.'
                    },
                    id: {
                        type: 'string',
                        description: 'Artifact ID, e.g. EPIC-1, STORY-1-1, vision-1, FR-1'
                    },
                    changes: {
                        type: 'object',
                        description:
                            'The fields to update on the artifact, as a JSON object. Must strictly ' +
                            'conform to the artifact\'s JSON schema — use exact field names (camelCase), ' +
                            'respect enum values, and match array/object structures. Non-conforming ' +
                            'updates will be rejected with specific validation errors.'
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
                            'If omitted, uses the user\'s agileagentcanvas.outputFormat setting (default: "dual").'
                    }
                },
                required: ['path', 'content']
            }
        }
    ];
}
