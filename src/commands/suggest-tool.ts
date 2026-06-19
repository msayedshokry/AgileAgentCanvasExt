/**
 * /suggest-tool slash command handler.
 *
 * Generates a complete tool spec from a natural-language description by
 * prompting the LLM, validates the spec, and writes it to
 * `.agileagentcanvas-context/proposed-tools/{name}.json`.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { extractJson } from '../lib/json-extract';
import { streamChatResponse, ChatMessage } from '../chat/ai-provider';
import { createLogger } from '../utils/logger';

const logger = createLogger('suggest-tool');

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolSpec {
    name: string;
    modelDescription: string;
    inputSchema: Record<string, unknown>;
    estimatedTokenSavings: number;
    exampleInvocation: string;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Handle the `/suggest-tool <description>` slash command.
 *
 * 1. Generates a tool spec from the description via LLM.
 * 2. Validates the spec (name must start with `agileagentcanvas_`).
 * 3. Writes to `.agileagentcanvas-context/proposed-tools/{name}.json`.
 * 4. Streams the result back to the chat.
 */
export async function handleSuggestTool(
    description: string,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<void> {
    // Resolve the output path
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    const outputFolderSetting = vscode.workspace
        .getConfiguration('agileagentcanvas')
        .get<string>('outputFolder', '.agileagentcanvas-context');
    const outputPath = wsFolder
        ? path.join(wsFolder.uri.fsPath, outputFolderSetting)
        : path.join(process.env.TEMP ?? '/tmp', '.agileagentcanvas-context');

    // Select the AI model
    const { selectModel } = await import('../chat/ai-provider.js');
    const model = await selectModel();
    if (!model) {
        stream.markdown('**Error:** No AI provider configured. Set `agileagentcanvas.aiProvider` in Settings.');
        return;
    }

    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: `You are a tool designer. Given a description of a repeated pattern, generate a complete tool spec.
Output JSON in this exact shape (no extra keys):
{
  "name": "agileagentcanvas_<snake_case>",
  "modelDescription": "...",
  "inputSchema": { "type": "object", "properties": {}, "required": [] },
  "estimatedTokenSavings": 500,
  "exampleInvocation": "agileagentcanvas_<name> { ... }"
}`,
        },
        {
            role: 'user',
            content: `Pattern to encapsulate: ${description}`,
        },
    ];

    // Stream the LLM response
    // Audit gap #20/#42 — tag the `/suggest-tool` LLM call so it shows up as its own
    // spend bucket in the budget gauge instead of grouping under the fallback
    // `'chat-session'` bucket.
    const response = await streamChatResponse(model, messages, stream, token, { workflow: 'suggest-tool' });
    const extracted = extractJson(response);

    if (!extracted.ok) {
        stream.markdown(`Could not generate tool spec: ${extracted.error}`);
        return;
    }

    const spec = extracted.data as Partial<ToolSpec>;

    // Validate name prefix
    if (!spec.name || !spec.name.startsWith('agileagentcanvas_')) {
        stream.markdown('Tool name must start with "agileagentcanvas_".');
        return;
    }

    // Warn about unexpected fields but continue
    const validKeys = new Set(['name', 'modelDescription', 'inputSchema', 'estimatedTokenSavings', 'exampleInvocation']);
    const extraKeys = Object.keys(spec).filter(k => !validKeys.has(k));
    if (extraKeys.length > 0) {
        logger.warn(`[suggest-tool] Ignoring unknown spec fields: ${extraKeys.join(', ')}`);
    }

    // Write to proposed-tools/
    const safeName = spec.name.replace('agileagentcanvas_', '');
    if (!/^[a-zA-Z0-9_-]+$/.test(safeName)) {
        stream.markdown(`❌ Tool name contains invalid characters: \`${safeName}\``);
        return;
    }
    const proposedDir = path.join(outputPath, 'proposed-tools');
    const proposedPath = path.join(proposedDir, `${safeName}.json`);

    try {
        await fs.promises.mkdir(proposedDir, { recursive: true });
        await fs.promises.writeFile(proposedPath, JSON.stringify(spec, null, 2));
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        stream.markdown(`Could not write tool spec: ${msg}`);
        return;
    }

    stream.markdown(
        `Tool proposed: \`${spec.name}\`\n\n` +
        `Estimated savings: ~${spec.estimatedTokenSavings ?? 0} tokens/call\n\n` +
        `File: \`${proposedPath}\`\n\n` +
        `Review and approve in \`.agileagentcanvas-context/proposed-tools/\``
    );
}
