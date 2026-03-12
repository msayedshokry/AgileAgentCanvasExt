import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { sendSimplePrompt } from '../antigravity/antigravity-orchestrator';

/**
 * Unified AI provider abstraction for AgentCanvas.
 *
 * Priority order (when provider = 'auto'):
 *   1. VS Code Language Model API (works with Copilot, Continue, and any registered vscode.lm provider)
 *   2. Antigravity native command (if running inside Antigravity IDE)
 *   3. Direct API key provider (OpenAI / Anthropic / Gemini / Ollama) from settings
 */

export type ProviderType = 'auto' | 'copilot' | 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'antigravity';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface StreamChunk {
    text: string;
    done: boolean;
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

function getConfig() {
    return vscode.workspace.getConfiguration('agentcanvas');
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

    // 3. Fall back to direct API key if configured
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
    token: vscode.CancellationToken
): Promise<string> {
    switch (model.provider) {
        case 'copilot':
            return streamVsCodeLm(model.vscodeLm!, messages, stream, token);
        case 'openai':
            return streamOpenAI(messages, stream, token);
        case 'anthropic':
            return streamAnthropic(messages, stream, token);
        case 'gemini':
            return streamGemini(messages, stream, token);
        case 'ollama':
            return streamOllama(messages, stream, token);
        case 'antigravity':
            return sendToAntigravity(messages, stream);
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
    token: vscode.CancellationToken
): Promise<string> {
    const vsMessages = messages.map(m =>
        m.role === 'assistant'
            ? vscode.LanguageModelChatMessage.Assistant(m.content)
            : vscode.LanguageModelChatMessage.User(m.content)
    );

    let full = '';
    const response = await lm.sendRequest(vsMessages, {}, token);
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
    token: vscode.CancellationToken
): Promise<string> {
    const cfg = getConfig();
    const apiKey = cfg.get<string>('apiKey', '');
    const modelId = cfg.get<string>('modelId', '') || 'gpt-4o';
    const baseUrl = cfg.get<string>('baseUrl', '') || 'https://api.openai.com';

    const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
    const body = JSON.stringify({ model: modelId, messages, stream: true });
    const headers = { Authorization: `Bearer ${apiKey}` };

    let full = '';
    try {
        await httpsPostStream(url, headers, body,
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
    token: vscode.CancellationToken
): Promise<string> {
    const cfg = getConfig();
    const apiKey = cfg.get<string>('apiKey', '');
    const modelId = cfg.get<string>('modelId', '') || 'claude-sonnet-4-5';

    // Separate system messages from conversation
    const systemMessages = messages.filter(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');
    const systemPrompt = systemMessages.map(m => m.content).join('\n\n');

    const body = JSON.stringify({
        model: modelId,
        max_tokens: 8192,
        system: systemPrompt || undefined,
        messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
        stream: true
    });

    const headers = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
    };

    let full = '';
    try {
        await httpsPostStream('https://api.anthropic.com/v1/messages', headers, body,
            text => { if (!token.isCancellationRequested) { stream.markdown(text); full += text; } },
            line => {
                if (!line.startsWith('data: ')) return null;
                try {
                    const json = JSON.parse(line.slice(6));
                    if (json.type === 'content_block_delta') {
                        return json.delta?.text ?? null;
                    }
                } catch { /* ignore */ }
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
    token: vscode.CancellationToken
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
    const body = JSON.stringify({ contents });

    let full = '';
    try {
        await httpsPostStream(url, {}, body,
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
    token: vscode.CancellationToken
): Promise<string> {
    const cfg = getConfig();
    const modelId = cfg.get<string>('modelId', '') || 'llama3';
    const baseUrl = cfg.get<string>('baseUrl', '') || 'http://localhost:11434';

    const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
    const body = JSON.stringify({ model: modelId, messages, stream: true });

    let full = '';
    try {
        await httpsPostStream(url, {}, body,
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
            '> The conversation will continue there. Output files will be auto-detected by AgentCanvas.\n\n'
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
| \`agentcanvas.aiProvider\` | \`openai\`, \`anthropic\`, \`gemini\`, \`ollama\`, or \`antigravity\` |
| \`agentcanvas.apiKey\` | Your API key (not needed for Ollama/Antigravity) |
| \`agentcanvas.modelId\` | Optional — defaults to the provider's recommended model |
| \`agentcanvas.baseUrl\` | Optional — only needed for Ollama or a custom endpoint |

Or install **GitHub Copilot** to use it automatically via the VS Code LM API.`;
    }

    if (provider === 'ollama') {
        const baseUrl = cfg.get<string>('baseUrl', '') || 'http://localhost:11434';
        return `**Ollama not reachable** at \`${baseUrl}\`\n\nMake sure Ollama is running: \`ollama serve\``;
    }

    if (provider === 'antigravity') {
        return `**Antigravity not detected**\n\nMake sure you are running AgentCanvas inside the Google Antigravity IDE.`;
    }

    if (!apiKey) {
        return `**API key missing**\n\nSet \`agentcanvas.apiKey\` in settings for the \`${provider}\` provider.`;
    }

    return `**AI provider error**\n\nCould not connect to \`${provider}\`. Check your \`agentcanvas.apiKey\` and \`agentcanvas.modelId\` settings.`;
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
