import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { sendSimplePrompt } from '../antigravity/antigravity-orchestrator';
import { schemaValidator } from '../state/schema-validator';
import { compressMessages } from '../integrations/headroom';

/**
 * Unified AI provider abstraction for AgileAgentCanvas.
 *
 * Priority order (when provider = 'auto'):
 *   1. VS Code Language Model API (works with Copilot, Continue, and any registered vscode.lm provider)
 *   2. Antigravity native command (if running inside Antigravity IDE)
 *   3. Oh My Pi (OMP) harness (if running inside the OMP-aware host)
 *   4. Direct API key provider (OpenAI / Anthropic / Gemini / Ollama) from settings
 */

export type ProviderType = 'auto' | 'copilot' | 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'antigravity' | 'omp';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface StreamChunk {
    text: string;
    done: boolean;
}

/**
 * Optional parameters for streamChatResponse. When `forceStructuredOutput` is
 * true, the provider is told to emit a JSON object matching the schema for
 * `activeArtifactType` (when both are set). Default behaviour is plain-text
 * streaming — the model may respond conversationally.
 */
export interface StreamOptions {
    /** BMAD artifact type whose schema constrains the response (e.g. "story",
     *  "prd", "requirement"). When omitted or unknown, no schema is sent. */
    activeArtifactType?: string;
    /** Force the model to use the structured-output facility (tool_choice on
     *  Anthropic, response_format on OpenAI, responseSchema on Gemini, format
     *  on Ollama, responseFormat on VS Code LM). Default false. */
    forceStructuredOutput?: boolean;
}

/** Shared options passed to each per-provider streaming function. */
interface ProviderStructuredOptions {
    schema: Record<string, unknown>;
    temperature: number;
    forceStructuredOutput: boolean;
}

/**
 * A unified model handle.  Either wraps a native vscode.LanguageModelChat,
 * or represents a direct-HTTP / Antigravity provider.
 */
export interface BmadModel {
    /** Which provider backs this model */
    provider: ProviderType;
    /** The native VS Code LM handle (present only when provider is copilot/vscode-lm) */
    vscodeLm?: vscode.LanguageModelChat;
    /** For display / logging */
    label: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detection helpers
// ─────────────────────────────────────────────────────────────────────────────

/** In-memory cache for artifact schemas — avoids repeated re-parsing. */
const schemaCache = new Map<string, Record<string, unknown> | null>();

function getConfig() {
    return vscode.workspace.getConfiguration('agileagentcanvas');
}

function getDefaultTemperature(): number {
    const t = getConfig().get<number>('defaultTemperature', 0.2);
    return typeof t === 'number' && Number.isFinite(t) ? Math.max(0, Math.min(2, t)) : 0.2;
}

/**
 * Load the artifact schema JSON for the given type as a plain object.
 * Returns an empty object on any failure. Result is cached per type.
 * Logs a warning when the requested type has no mapping so the degraded
 * state (unconstrained prompt) is visible to operators.
 */
function loadArtifactSchemaForContext(artifactType?: string): Record<string, unknown> {
    if (!artifactType) return {};
    if (schemaCache.has(artifactType)) {
        return schemaCache.get(artifactType) ?? {};
    }
    try {
        const schema = schemaValidator.getRawSchema(artifactType);
        if (schema && typeof schema === 'object') {
            schemaCache.set(artifactType, schema);
            return schema;
        }
        console.warn(`[aac] Schema for artifact type "${artifactType}" not found — sending unconstrained prompt.`);
        schemaCache.set(artifactType, null);
    } catch (e) {
        console.warn(`[aac] Schema load failed for "${artifactType}":`, e);
        schemaCache.set(artifactType, null);
    }
    return {};
}
/**
 * Detect Antigravity by checking whether its commands are actually registered.
 * Checks for both the Agent Panel command (preferred) and the legacy chat command.
 */
async function isAntigravity(): Promise<boolean> {
    try {
        const all = await vscode.commands.getCommands(false);
        return all.includes('antigravity.sendPromptToAgentPanel')
            || all.includes('antigravity.sendTextToChat');
    } catch {
        return false;
    }
}
/**
 * Detect the Oh My Pi (OMP) harness by checking for its sentinel commands
 * or by matching the appName.
 */
async function isOmp(): Promise<boolean> {
    try {
        const all = await vscode.commands.getCommands(false);
        if (all.includes('omp.openPanel')
            || all.includes('omp.sendPrompt')
            || all.includes('oh-my-pi.openChat')) {
            return true;
        }
    } catch {
        // getCommands can fail in some test environments — fall through to appName
    }
    const appName = (vscode.env.appName ?? '').toLowerCase();
    return appName.includes('omp')
        || appName.includes('oh my pi')
        || appName.includes('oh-my-pi');
}

async function tryVsCodeLm(): Promise<vscode.LanguageModelChat | null> {
    try {
        const cfg = getConfig();
        const provider = cfg.get<ProviderType>('aiProvider', 'auto');

        // When provider is explicitly 'copilot' use the vendor filter; otherwise try anything.
        const selector: vscode.LanguageModelChatSelector =
            provider === 'copilot'
                ? { vendor: 'copilot' }
                : {};

        const models = await vscode.lm.selectChatModels(selector);
        if (models && models.length > 0) {
            return models[0];
        }
    } catch {
        // vscode.lm not available in this host
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: select the best available model
// ─────────────────────────────────────────────────────────────────────────────

export async function selectModel(): Promise<BmadModel | null> {
    const cfg = getConfig();
    const provider = cfg.get<ProviderType>('aiProvider', 'auto');
    const apiKey = cfg.get<string>('apiKey', '');

    // ── Explicit provider requested ──────────────────────────────────────────
    if (provider === 'antigravity') {
        return { provider: 'antigravity', label: 'Antigravity (Gemini Agent)' };
    }

    if (provider === 'omp') {
        return { provider: 'omp', label: 'Oh My Pi (OMP)' };
    }

    if (provider === 'copilot') {
        const lm = await tryVsCodeLm();
        if (lm) return { provider: 'copilot', vscodeLm: lm, label: `Copilot (${lm.name})` };
        return null;
    }

    if (provider === 'openai' || provider === 'anthropic' || provider === 'gemini' || provider === 'ollama') {
        if (!apiKey && provider !== 'ollama') return null; // api key required
        return { provider, label: `${provider} (direct API)` };
    }

    // ── Auto-detect ──────────────────────────────────────────────────────────
    // 1. Try VS Code LM API (works with Copilot, Continue, etc.)
    const lm = await tryVsCodeLm();
    if (lm) return { provider: 'copilot', vscodeLm: lm, label: `VS Code LM (${lm.name})` };

    // 2. Try Antigravity native command
    if (await isAntigravity()) {
        return { provider: 'antigravity', label: 'Antigravity (Gemini Agent)' };
    }

    // 3. Try Oh My Pi (OMP) harness
    if (await isOmp()) {
        return { provider: 'omp', label: 'Oh My Pi (OMP)' };
    }

    // 4. Fall back to direct API key if configured
    if (apiKey) {
        // Guess provider from key prefix, or use configured provider
        const guessed: ProviderType =
            apiKey.startsWith('sk-ant-') ? 'anthropic' :
            apiKey.startsWith('AIza') ? 'gemini' :
            'openai';
        return { provider: guessed, label: `${guessed} (direct API)` };
    }

    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: send a request and stream the response
// ─────────────────────────────────────────────────────────────────────────────

export async function streamChatResponse(
    model: BmadModel,
    messages: ChatMessage[],
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    options: StreamOptions = {}
): Promise<string> {
    const { activeArtifactType, forceStructuredOutput = false } = options;
    const schema = forceStructuredOutput ? loadArtifactSchemaForContext(activeArtifactType) : {};
    const temperature = getDefaultTemperature();

    // ── Headroom compression ────────────────────────────────────────────
    // Transparently compress messages before reaching the LLM.
    // Silently no-ops when Headroom isn't available (compressMessages handles all errors internally).
    const compressed = await compressMessages(messages, model.label);
    if (compressed.saved > 0) {
        messages = compressed.messages as ChatMessage[];
    }
    // ─────────────────────────────────────────────────────────────────────

    switch (model.provider) {
        case 'copilot':
            return streamVsCodeLm(model.vscodeLm!, messages, stream, token, forceStructuredOutput);
        case 'openai':
            return streamOpenAI(messages, stream, token, { schema, temperature, forceStructuredOutput });
        case 'anthropic':
            return streamAnthropic(messages, stream, token, { schema, temperature, forceStructuredOutput });
        case 'gemini':
            return streamGemini(messages, stream, token, { schema, temperature, forceStructuredOutput });
        case 'ollama':
            return streamOllama(messages, stream, token, { schema, temperature, forceStructuredOutput });
        case 'antigravity':
            return sendToAntigravity(messages, stream);
        case 'omp':
            return sendToOmp(messages, stream);
        default:
            stream.markdown('**Error:** Unknown AI provider.\n');
            return '';
    }
}

/**
 * Convenience wrapper used by chat-participant for backward compatibility.
 * Returns a BmadModel or null (same semantics as the old getModel()).
 */
export async function getModel(): Promise<BmadModel | null> {
    return selectModel();
}
// ─────────────────────────────────────────────────────────────────────────────
// VS Code Language Model API (Copilot / Continue / any registered provider)
// ─────────────────────────────────────────────────────────────────────────────

async function streamVsCodeLm(
    lm: vscode.LanguageModelChat,
    messages: ChatMessage[],
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    forceStructuredOutput: boolean
): Promise<string> {
    const vsMessages = messages.map(m =>
        m.role === 'assistant'
            ? vscode.LanguageModelChatMessage.Assistant(m.content)
            : vscode.LanguageModelChatMessage.User(m.content)
    );

    let full = '';
    let response: vscode.LanguageModelChatResponse;
    if (forceStructuredOutput) {
        try {
            response = await lm.sendRequest(vsMessages, {
                responseFormat: { type: 'json_object' } as unknown as undefined,
            } as vscode.LanguageModelChatRequestOptions, token);
        } catch (e: any) {
            const msg = String(e?.message ?? e ?? '');
            if (msg.includes('Unsupported') || msg.includes('unsupported') ||
                msg.includes('responseFormat') || msg.includes('not supported')) {
                console.warn('[aac] responseFormat not supported, falling back:', e);
                response = await lm.sendRequest(vsMessages, {}, token);
            } else {
                throw e;
            }
        }
    } else {
        response = await lm.sendRequest(vsMessages, {}, token);
    }
    for await (const chunk of response.text) {
        if (token.isCancellationRequested) break;
        stream.markdown(chunk);
        full += chunk;
    }
    return full;
}

// ─────────────────────────────────────────────────────────────────────────────
// Direct HTTP helpers (shared low-level fetch)
// ─────────────────────────────────────────────────────────────────────────────

function httpsPost(url: string, headers: Record<string, string>, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';
        const lib = isHttps ? https : http;

        const req = lib.request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }
        }, res => {
            let data = '';
            res.on('data', (chunk: Buffer) => data += chunk.toString());
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

/** Stream SSE / newline-delimited JSON and yield text deltas. */
function httpsPostStream(
    url: string,
    headers: Record<string, string>,
    body: string,
    onChunk: (text: string) => void,
    extractDelta: (line: string) => string | null
): Promise<void> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';
        const lib = isHttps ? https : http;

        const req = lib.request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }
        }, res => {
            res.on('data', (chunk: Buffer) => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    const delta = extractDelta(line.trim());
                    if (delta) onChunk(delta);
                }
            });
            res.on('end', resolve);
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI (and OpenAI-compatible endpoints)
// ─────────────────────────────────────────────────────────────────────────────

async function streamOpenAI(
    messages: ChatMessage[],
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    opts: ProviderStructuredOptions
): Promise<string> {
    const cfg = getConfig();
    const apiKey = cfg.get<string>('apiKey', '');
    const modelId = cfg.get<string>('modelId', '') || 'gpt-4o';
    const baseUrl = cfg.get<string>('baseUrl', '') || 'https://api.openai.com';

    const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

    const messagesWithHint = opts.forceStructuredOutput
        ? (() => {
            const jsonHint = '\n\n[Output Format]\nRespond with a single JSON object. No prose, no markdown, no code fences. The response must be parseable by JSON.parse() directly.';
            const result = messages.map((m, i) =>
                i === 0 && m.role === 'system'
                    ? { ...m, content: m.content + jsonHint }
                    : (i === 0 && m.role !== 'system' ? null : m)
            ).filter(Boolean) as ChatMessage[];
            if (result[0]?.role !== 'system') {
                result.unshift({ role: 'system', content: jsonHint });
            }
            return result;
        })()
        : messages;

    const body: Record<string, unknown> = {
        model: modelId,
        messages: messagesWithHint,
        stream: true,
        temperature: opts.temperature
    };
    if (opts.forceStructuredOutput) {
        body.response_format = { type: 'json_object' };
    }

    const headers = { Authorization: `Bearer ${apiKey}` };

    let full = '';
    try {
        await httpsPostStream(url, headers, JSON.stringify(body),
            text => { if (!token.isCancellationRequested) { stream.markdown(text); full += text; } },
            line => {
                if (!line.startsWith('data: ') || line === 'data: [DONE]') return null;
                try {
                    const json = JSON.parse(line.slice(6));
                    return json.choices?.[0]?.delta?.content ?? null;
                } catch { return null; }
            }
        );
    } catch (e) {
        stream.markdown(`\n**OpenAI error:** ${e}\n`);
    }
    return full;
}

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic
// ─────────────────────────────────────────────────────────────────────────────

async function streamAnthropic(
    messages: ChatMessage[],
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    opts: ProviderStructuredOptions
): Promise<string> {
    const cfg = getConfig();
    const apiKey = cfg.get<string>('apiKey', '');
    const modelId = cfg.get<string>('modelId', '') || 'claude-sonnet-4-5';

    // Separate system messages from conversation
    const systemMessages = messages.filter(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');
    const systemPrompt = systemMessages.map(m => m.content).join('\n\n');

    const body: Record<string, unknown> = {
        model: modelId,
        max_tokens: 8192,
        system: systemPrompt || undefined,
        messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        temperature: opts.temperature
    };

    if (opts.forceStructuredOutput) {
        body.tools = [{
            name: 'emit_artifact',
            description: 'Emit the structured artifact as a JSON object matching the provided schema.',
            input_schema: opts.schema
        }];
        body.tool_choice = { type: 'tool', name: 'emit_artifact' };
    }

    const headers = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
    };

    let full = '';
    let parseErrorCount = 0;
    try {
        await httpsPostStream('https://api.anthropic.com/v1/messages', headers, JSON.stringify(body),
            text => { if (!token.isCancellationRequested) { stream.markdown(text); full += text; } },
            line => {
                if (!line.startsWith('data: ')) return null;
                try {
                    const json = JSON.parse(line.slice(6));
                    parseErrorCount = 0;
                    if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                        return json.delta.text ?? null;
                    }
                } catch (e) {
                    parseErrorCount++;
                    if (parseErrorCount > 5) {
                        console.warn(`[aac] Anthropic SSE: ${parseErrorCount} consecutive parse errors — last error: ${e}`);
                    }
                }
                return null;
            }
        );
    } catch (e) {
        stream.markdown(`\n**Anthropic error:** ${e}\n`);
    }
    return full;
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Gemini
// ─────────────────────────────────────────────────────────────────────────────

async function streamGemini(
    messages: ChatMessage[],
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    opts: ProviderStructuredOptions
): Promise<string> {
    const cfg = getConfig();
    const apiKey = cfg.get<string>('apiKey', '');
    const modelId = cfg.get<string>('modelId', '') || 'gemini-2.0-flash';

    // Convert to Gemini format: merge system into first user turn
    const systemContent = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const contents = chatMessages.map((m, i) => {
        let text = m.content;
        if (i === 0 && systemContent) {
            text = `${systemContent}\n\n${text}`;
        }
        return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text }] };
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const body: Record<string, unknown> = {
        contents,
        generationConfig: {
            temperature: opts.temperature,
            maxOutputTokens: 8192,
        },
    };
    if (opts.forceStructuredOutput) {
        body.generationConfig = {
            ...body.generationConfig as Record<string, unknown>,
            responseMimeType: 'application/json',
            responseSchema: opts.schema,
        };
    }

    let full = '';
    try {
        await httpsPostStream(url, {}, JSON.stringify(body),
            text => { if (!token.isCancellationRequested) { stream.markdown(text); full += text; } },
            line => {
                if (!line.startsWith('data: ')) return null;
                try {
                    const json = JSON.parse(line.slice(6));
                    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
                } catch { return null; }
            }
        );
    } catch (e) {
        stream.markdown(`\n**Gemini error:** ${e}\n`);
    }
    return full;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ollama
// ─────────────────────────────────────────────────────────────────────────────

async function streamOllama(
    messages: ChatMessage[],
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    opts: ProviderStructuredOptions
): Promise<string> {
    const cfg = getConfig();
    const modelId = cfg.get<string>('modelId', '') || 'llama3';
    const baseUrl = cfg.get<string>('baseUrl', '') || 'http://localhost:11434';

    const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
    const body: Record<string, unknown> = {
        model: modelId,
        messages,
        stream: true,
        options: { temperature: opts.temperature }
    };
    if (opts.forceStructuredOutput) {
        body.format = opts.schema;
    }

    let full = '';
    try {
        await httpsPostStream(url, {}, JSON.stringify(body),
            text => { if (!token.isCancellationRequested) { stream.markdown(text); full += text; } },
            line => {
                if (!line) return null;
                try {
                    const json = JSON.parse(line);
                    return json.message?.content ?? null;
                } catch { return null; }
            }
        );
    } catch (e) {
        stream.markdown(`\n**Ollama error:** ${e}\n`);
    }
    return full;
}

// ─────────────────────────────────────────────────────────────────────────────
// Antigravity — sends the prompt to the Gemini Agent panel
// ─────────────────────────────────────────────────────────────────────────────

async function sendToAntigravity(
    messages: ChatMessage[],
    stream: vscode.ChatResponseStream
): Promise<string> {
    // Build a combined prompt from all user/system messages
    const prompt = messages
        .filter(m => m.role !== 'assistant')
        .map(m => m.content)
        .join('\n\n---\n\n');

    const success = await sendSimplePrompt(prompt);

    if (success) {
        stream.markdown(
            '> **Firebase Studio mode:** The prompt has been sent to the Gemini Agent panel.\n' +
            '> The conversation will continue there. Output files will be auto-detected by AgileAgentCanvas.\n\n'
        );
    } else {
        stream.markdown(
            '**AntiGravity error:** Could not send to the Gemini Agent panel.\n\n' +
            'Make sure you are running inside Firebase Studio (Google AntiGravity IDE).\n'
        );
    }

    // We cannot stream the response back — the user interacts in the Agent panel.
    return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Oh My Pi (OMP) — sends the prompt to the omp CLI over stdio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a prompt to the Oh My Pi (omp) harness.
 *
 * Strategy:
 *  1. Try the `omp.openPanel` / `omp.sendPrompt` VS Code commands if registered
 *     (when OMP ships a VS Code extension that surfaces its commands).
 *  2. Fall back to writing the prompt to `.omp/inbox.md` and instructing the
 *     user to run `omp` in the terminal — this works with the standalone CLI.
 */
async function sendToOmp(
    messages: ChatMessage[],
    stream: vscode.ChatResponseStream
): Promise<string> {
    const prompt = messages
        .filter(m => m.role !== 'assistant')
        .map(m => m.content)
        .join('\n\n---\n\n');

    // ── Path 1: try a registered VS Code command from an OMP extension ─────
    try {
        const cmds = await vscode.commands.getCommands(false);
        const cmdSet = new Set(cmds);
        if (cmdSet.has('omp.sendPrompt')) {
            await vscode.commands.executeCommand('omp.sendPrompt', prompt);
            stream.markdown(
                '> **Oh My Pi mode:** Prompt sent to the OMP harness via `omp.sendPrompt`.\n' +
                '> The conversation will continue in the OMP panel. Output files will be auto-detected.\n\n'
            );
            return '';
        }
        if (cmdSet.has('omp.openPanel')) {
            await vscode.env.clipboard.writeText(prompt);
            await vscode.commands.executeCommand('omp.openPanel');
            stream.markdown(
                '> **Oh My Pi mode:** Prompt copied to clipboard. Run `omp` in the terminal, or paste into the OMP panel.\n\n'
            );
            return '';
        }
    } catch (e) {
        // Fall through to file-based path
    }

    // ── Path 2: write to .omp/inbox.md for the CLI to pick up ─────────────
    try {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            const root = folders[0].uri.fsPath;
            const ompDir = path.join(root, '.omp');
            const inboxPath = path.join(ompDir, 'inbox.md');
            fs.mkdirSync(ompDir, { recursive: true });
            fs.writeFileSync(
                inboxPath,
                `# Agile Agent Canvas → OMP\n\nGenerated: ${new Date().toISOString()}\n\n${prompt}\n`,
                'utf-8'
            );
            stream.markdown(
                '> **Oh My Pi mode:** Prompt written to `.omp/inbox.md`.\n' +
                '> Run `omp` in the terminal to process it. Output files will be auto-detected by AgileAgentCanvas.\n\n'
            );
            return '';
        }
    } catch (e) {
        // Fall through to clipboard
    }

    // ── Path 3: clipboard fallback ─────────────────────────────────────────
    await vscode.env.clipboard.writeText(prompt);
    stream.markdown(
        '**OMP fallback:** No workspace open. Prompt copied to clipboard — paste it into `omp` or the OMP panel.\n'
    );
    return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a "no model" message tailored to configured provider
// ─────────────────────────────────────────────────────────────────────────────

export function getNoModelMessage(): string {
    const cfg = getConfig();
    const provider = cfg.get<ProviderType>('aiProvider', 'auto');
    const apiKey = cfg.get<string>('apiKey', '');
    if (provider === 'auto' && !apiKey) {
        return `**AI not available**

No AI provider was found. Configure one in settings (**Ctrl+,** → search "Agile Agent Canvas"):

| Setting | Value |
|---|---|
| \`agileagentcanvas.aiProvider\` | \`openai\`, \`anthropic\`, \`gemini\`, \`ollama\`, \`antigravity\`, or \`omp\` |
| \`agileagentcanvas.apiKey\` | Your API key (not needed for Ollama/Antigravity/OMP) |
| \`agileagentcanvas.modelId\` | Optional — defaults to the provider's recommended model |
| \`agileagentcanvas.baseUrl\` | Optional — only needed for Ollama or a custom endpoint |

Or install **GitHub Copilot** to use it automatically via the VS Code LM API.`;
    }

    if (provider === 'ollama') {
        const baseUrl = cfg.get<string>('baseUrl', '') || 'http://localhost:11434';
        return `**Ollama not reachable** at \`${baseUrl}\`\n\nMake sure Ollama is running: \`ollama serve\``;
    }

    if (provider === 'antigravity') {
        return `**Antigravity not detected**\n\nMake sure you are running AgileAgentCanvas inside the Google Antigravity IDE.`;
    }

    if (!apiKey) {
        return `**API key missing**\n\nSet \`agileagentcanvas.apiKey\` in settings for the \`${provider}\` provider.`;
    }

    return `**AI provider error**\n\nCould not connect to \`${provider}\`. Check your \`agileagentcanvas.apiKey\` and \`agileagentcanvas.modelId\` settings.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: convert vscode.LanguageModelChatMessage[] → ChatMessage[]
// (used by executeWithTools path which still builds vscode messages first)
// ─────────────────────────────────────────────────────────────────────────────

export function vsMessagesToChatMessages(vsMessages: vscode.LanguageModelChatMessage[]): ChatMessage[] {
    return vsMessages.map(m => ({
        role: m.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' : 'user',
        content: (m.content as any[])
            .map((p: any) => typeof p === 'string' ? p : p.value ?? '')
            .join('')
    }));
}
