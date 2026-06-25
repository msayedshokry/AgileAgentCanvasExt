import * as cp from 'child_process';
import * as vscode from 'vscode';
import { sendSimplePrompt } from '../antigravity/antigravity-orchestrator';
import { createLogger } from '../utils/logger';

const logger = createLogger('chat-bridge');

// ─────────────────────────────────────────────────────────────────────────────
// Chat Provider Id — shared with the canvas UI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The identifiers a user can pick from the canvas header provider dropdown.
 * Mirrors `agileagentcanvas.chatProvider` in package.json. The set is broader
 * than the auto-detected IDE list because terminal-based CLIs (codex, gemini,
 * aider) are first-class options the user can target without the host IDE
 * having a chat panel command.
 */
export type ChatProviderId =
    | 'auto'
    | 'copilot'
    | 'claude'
    | 'cursor'
    | 'windsurf'
    | 'antigravity'
    | 'omp'
    | 'codex'
    | 'gemini-cli'
    | 'aider'
    | 'opencode'
    | 'terminal';

/**
 * Per-provider strategy. Each entry tells `openChat()` exactly how to
 * deliver the prompt: a chat panel command with optional pre-fill, a
 * command that opens the panel without a query, OR a terminal-based
 * strategy that shells out to a CLI.
 *
 * Headless CLI invocations (verified against each tool's published docs;
 * these are the canonical flag reference for agentic / terminal-based
 * workflow execution — see CHAT_COMMANDS[provider].terminalLaunch):
 *   - claude     → `claude --permission-mode acceptEdits --output-format json -p <prompt>`
 *                  (https://code.claude.com/docs/en/headless)
 *   - codex      → `codex exec --ask-for-approval never --sandbox workspace-write <prompt>`
 *                  (https://developers.openai.com/codex/cli/reference)
 *   - gemini     → `gemini --yolo --output-format json -p <prompt>`
 *                  (https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/index.md)
 *   - aider      → `aider --message <prompt>`   (https://aider.chat/docs/scripting: one-shot, exit after reply)
 *   - opencode   → `opencode run --model auto --format json <prompt>`
 *                  (https://opencode.ai/docs/cli/)
 *   - terminal   → sentinel `echo`; handled in sendToTerminal
 */
interface ChatCommand {
    /** Public provider id — must match a ChatProviderId (or 'copilot' for fallback) */
    ide: string;
    /** Human-readable label for the status bar / dropdown */
    label: string;
    /** Short hint shown in the dropdown */
    hint: string;
    /**
     * Returns the executeCommand argument tuple when a query string should be
     * pre-filled. undefined = this provider does not support pre-filling.
     */
    withQuery?: (query: string) => [string, ...unknown[]];
    /**
     * Returns the executeCommand argument tuple to simply open the chat panel
     * (no pre-filled text).
     */
    openOnly?: () => [string, ...unknown[]];
    /**
     * Returns the command-line args to launch in the integrated terminal.
     * When defined, this strategy takes precedence over withQuery/openOnly.
     * Use this for CLI tools (`claude`, `codex`, `gemini`, `aider`) that
     * should run in a terminal pane.
     */
    terminalLaunch?: (query: string) => string[];
    /**
     * True if the provider is known to have a VS Code chat panel command on
     * the current host (used to filter the dropdown to "available" only).
     * Defaults to false — most providers rely on terminal launching.
     */
    hasPanel?: () => Promise<boolean>;
}

export const CHAT_COMMANDS: Record<ChatProviderId | 'copilot-fallback', ChatCommand> = {
    'auto': {
        ide: 'auto',
        label: 'Auto',
        hint: 'Route to whatever the host IDE exposes',
        // Auto is resolved at call time — never matched directly
        hasPanel: async () => true,
    },
    'copilot': {
        ide: 'copilot',
        label: 'GitHub Copilot',
        hint: 'workbench.action.chat.open',
        withQuery: (q) => ['workbench.action.chat.open', { query: q }],
        openOnly: () => ['workbench.action.chat.open'],
        hasPanel: async () => true, // always available in any VS Code host
    },
    'claude': {
        ide: 'claude',
        label: 'Claude Code',
        hint: 'claude.openChat, else `claude` in terminal',
        openOnly: () => ['claude.openChat'],
        // Anthropic Claude Code v2.1.x headless invocation:
        //   -p / --print       → suppress the interactive TUI (banner + `>` prompt).
        //                         Without this, the TUI runs in the user's terminal
        //                         and dumps the prompt into stdin; Claude waits on
        //                         input instead of returning a verdict.
        //   --permission-mode  → `acceptEdits` auto-approves Write/Edit tool calls
        //                         so the agent can persist the verdict JSON file at
        //                         <outputFolder>/_terminal-output/<id>-<wf>-result.json
        //                         without any "Allow edit?" modal.
        //   --output-format    → `json` emits a parseable assistant envelope; the
        //                         verdict file is still written by the agent via the
        //                         Write tool, not by the CLI.
        // Note: we deliberately do NOT pass `--bare`. CLI is documented to
        // disable CLAUDE.md / hooks / plugins / MCP auto-discovery under
        // --bare, which would silently strip project-specific agentic rules
        // from the agent's context. Predictability wins on a single host;
        // project context wins here.
        // Spec: https://code.claude.com/docs/en/headless
        terminalLaunch: (q) => [
            'claude',
            '--permission-mode', 'acceptEdits',
            '--output-format', 'json',
            '-p', q,
        ],
        hasPanel: async () => {
            const cmds = await Promise.resolve(vscode.commands.getCommands(false)).catch(() => [] as string[])
            return cmds.includes('claude.openChat') || cmds.includes('claude-code.openChat');
        },
    },
    'cursor': {
        ide: 'cursor',
        label: 'Cursor',
        hint: 'cursor.chat.open',
        openOnly: () => ['cursor.chat.open'],
        hasPanel: async () => {
            const cmds = await Promise.resolve(vscode.commands.getCommands(false)).catch(() => [] as string[])
            return cmds.includes('cursor.chat.open');
        },
    },
    'windsurf': {
        ide: 'windsurf',
        label: 'Windsurf',
        hint: 'windsurf.openChat',
        openOnly: () => ['windsurf.openChat'],
        hasPanel: async () => {
            const cmds = await Promise.resolve(vscode.commands.getCommands(false)).catch(() => [] as string[])
            return cmds.includes('windsurf.openChat') || cmds.includes('windsurf.cascade.focus');
        },
    },
    'antigravity': {
        ide: 'antigravity',
        label: 'Antigravity',
        hint: 'sendPromptToAgentPanel',
        // Antigravity uses a custom code path — see openChat() branch
        hasPanel: async () => {
            const cmds = await Promise.resolve(vscode.commands.getCommands(false)).catch(() => [] as string[])
            return cmds.includes('antigravity.sendPromptToAgentPanel')
                || cmds.includes('antigravity.sendTextToChat');
        },
    },
    'omp': {
        ide: 'omp',
        label: 'Oh My Pi (OMP)',
        hint: 'omp.sendPrompt, else `omp` in terminal',
        withQuery: (q) => ['omp.sendPrompt', q],
        openOnly: () => ['omp.openPanel'],
        // OMP CLI reads `.omp/inbox.md` from cwd — it accepts no positional
        // prompt argument. Listed here so `listAvailableProviders` can detect
        // the standalone CLI when the OMP VS Code extension is not installed.
        terminalLaunch: () => ['omp'],
        hasPanel: async () => {
            const cmds = await Promise.resolve(vscode.commands.getCommands(false)).catch(() => [] as string[])
            return cmds.includes('omp.openPanel')
                || cmds.includes('omp.sendPrompt')
                || cmds.includes('oh-my-pi.openChat');
        },
    },
    'codex': {
        ide: 'codex',
        label: 'Codex (CLI)',
        hint: 'launches `codex` in the terminal',
        // OpenAI Codex CLI headless invocation:
        //   exec                  → non-interactive one-shot subcommand (without
        //                           `exec`, `codex` launches its full TUI).
        //   --ask-for-approval    → `never` skips manual approval prompts so the
        //                           agent can run end-to-end without user input.
        //   --sandbox             → `workspace-write` allows file writes inside the
        //                           cwd (the verdict file lives under
        //                           `.agileagentcanvas-context/_terminal-output/`).
        //                           NOTE: `workspace-write` restricts writes to the
        //                           workspace root. If a user configures
        //                           `agileagentcanvas.outputFolder` to an absolute
        //                           path outside the workspace, codex will reject the
        //                           verdict-file write. The default output folder
        //                           (`.agileagentcanvas-context`) is always workspace-
        //                           relative, so the bound is safe in practice.
        // Spec: https://developers.openai.com/codex/cli/reference
        terminalLaunch: (q) => [
            'codex',
            'exec',
            '--ask-for-approval', 'never',
            '--sandbox', 'workspace-write',
            q,
        ],
    },
    'gemini-cli': {
        ide: 'gemini-cli',
        label: 'Gemini (CLI)',
        hint: 'launches `gemini` in the terminal',
        // Google Gemini CLI headless invocation:
        //   -p                    → positional one-shot prompt (no `> ` prompt,
        //                            no TUI).
        //   --yolo                → auto-approve all tool calls (Bash/Edit/Write)
        //                            so the agent writes the verdict JSON file
        //                            without any UI confirmation.
        //   --output-format json  → parseable assistant envelope.
        // Spec: https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/index.md
        terminalLaunch: (q) => [
            'gemini',
            '--yolo',
            '--output-format', 'json',
            '-p', q,
        ],
    },
    'aider': {
        ide: 'aider',
        label: 'Aider',
        hint: 'launches `aider` in the terminal',
        terminalLaunch: (q) => ['aider', '--message', q],
    },
    'opencode': {
        ide: 'opencode',
        label: 'OpenCode',
        hint: 'launches `opencode` in the terminal',
        // SST OpenCode headless invocation:
        //   run                   → non-interactive one-shot subcommand (without
        //                           `run`, `opencode` launches its full TUI).
        //   --model auto          → use the configured default model; overridable
        //                           per-run via --model provider/model.
        //   --format json         → parseable event stream; verdict is still
        //                           written by the agent via the Write tool.
        // Spec: https://opencode.ai/docs/cli/
        terminalLaunch: (q) => [
            'opencode',
            'run',
            '--model', 'auto',
            '--format', 'json',
            q,
        ],
    },
    'terminal': {
        ide: 'terminal',
        label: 'Terminal (paste)',
        hint: 'opens a terminal with the prompt ready to paste',
        terminalLaunch: (q) => ['echo', q], // sentinel — handled in sendToTerminal
    },
    // Fallback for unknown detected hosts
    'copilot-fallback': {
        ide: 'copilot-fallback',
        label: 'Copilot',
        hint: 'fallback',
        withQuery: (q) => ['workbench.action.chat.open', { query: q }],
        openOnly: () => ['workbench.action.chat.open'],
        hasPanel: async () => true,
    },
};

export const CHAT_PROVIDER_IDS: ChatProviderId[] = [
    'auto', 'copilot', 'claude', 'cursor', 'windsurf',
    'antigravity', 'omp', 'codex', 'gemini-cli', 'aider', 'opencode', 'terminal',
];

// ─── Logger ──────────────────────────────────────────────────────────────────

/** Set by extension.ts after acOutput is created. Falls back to console. */
let _log: (msg: string) => void = (msg) => logger.debug(msg);

export function setChatBridgeLogger(fn: (msg: string) => void): void {
    _log = fn;
}

function log(msg: string): void {
    _log(`[chat-bridge] ${msg}`);
}

// ─── Selected-provider persistence ──────────────────────────────────────────

const CHAT_PROVIDER_KEY = 'agileagentcanvas.chatProviderSelected';

/**
 * The provider the user has chosen in the canvas dropdown. Set by the
 * webview message handler, read by openChat(). 'auto' means "use the
 * default from settings / auto-detect from host".
 */
let _selectedProvider: ChatProviderId = 'auto';

export function getSelectedProvider(): ChatProviderId {
    return _selectedProvider;
}

export function setSelectedProvider(id: ChatProviderId): void {
    _selectedProvider = id;
    log(`selectedProvider → ${id}`);
    // Persist for next session
    try {
        void vscode.workspace
            .getConfiguration('agileagentcanvas')
            .update('chatProviderSelected', id, vscode.ConfigurationTarget.Global);
    } catch (e) {
        log(`setSelectedProvider: config update threw: ${e}`);
    }
}

function loadSelectedProviderFromSettings(): ChatProviderId {
    try {
        const cfg = vscode.workspace.getConfiguration('agileagentcanvas');
        const v = cfg.get<ChatProviderId>('chatProviderSelected', 'auto');
        return v ?? 'auto';
    } catch {
        return 'auto';
    }
}

/**
 * Workspace-level admin default — declared in package.json as the "Default
 * AI chat provider for canvas actions (Refine, Enhance, Break Down, etc.)".
 * Distinct from `chatProviderSelected` (which mirrors the user's dropdown
 * pick): when set, it acts as a global fallback that only fires when the
 * user has not picked (the 'auto' sentinel cascades through the resolver
 * chain in `openChatWithResult`). Returns the sentinel 'auto' when unset so
 * the resolver can fall through to the detected host IDE.
 *
 * Exported so other modules (status bar, webview handshake relays) can read
 * the same source of truth without duplicating the config reader.
 */
export function loadWorkspaceChatProviderFromSettings(): ChatProviderId {
    try {
        const cfg = vscode.workspace.getConfiguration('agileagentcanvas');
        const v = cfg.get<ChatProviderId>('chatProvider', 'auto');
        return v ?? 'auto';
    } catch {
        return 'auto';
    }
}

// ─── IDE detection ───────────────────────────────────────────────────────────

/**
 * Detect which IDE is running by probing registered commands.
 * Returns the ide string matching a ChatCommand entry.
 *
 * Kept local to avoid a circular import with ide-installer.ts.
 */
async function detectIdeForChat(): Promise<string> {
    log('detectIdeForChat: calling vscode.commands.getCommands()...');
    try {
        const cmds = await vscode.commands.getCommands(false);
        log(`detectIdeForChat: got ${cmds.length} commands`);

        const s = new Set(cmds);

        const sentinels: Array<[string, string]> = [
            ['antigravity.sendTextToChat',                                  'antigravity'],
            ['antigravity.prioritized.chat.openNewConversation',            'antigravity'],
            ['cursor.chat.open',                                            'cursor'],
            ['cursorRules.open',                                            'cursor'],
            ['windsurf.openChat',                                           'windsurf'],
            ['windsurf.cascade.focus',                                      'windsurf'],
            ['claude.openChat',                                             'claude'],
            ['claude-code.openChat',                                        'claude'],
            ['omp.openPanel',                                               'omp'],
            ['omp.sendPrompt',                                              'omp'],
            ['oh-my-pi.openChat',                                           'omp'],
        ];

        for (const [sentinel, ideId] of sentinels) {
            if (s.has(sentinel)) {
                log(`detectIdeForChat: matched sentinel "${sentinel}" → ide="${ideId}"`);
                return ideId;
            }
        }

        log('detectIdeForChat: no sentinel matched, checking appName...');
    } catch (err) {
        log(`detectIdeForChat: getCommands() threw: ${err}`);
    }

    const appName = (vscode.env.appName ?? '').toLowerCase();
    log(`detectIdeForChat: vscode.env.appName="${vscode.env.appName}"`);
    if (appName.includes('cursor'))      { log('detectIdeForChat: appName → cursor');      return 'cursor';      }
    if (appName.includes('windsurf'))    { log('detectIdeForChat: appName → windsurf');    return 'windsurf';    }
    if (appName.includes('antigravity')) { log('detectIdeForChat: appName → antigravity'); return 'antigravity'; }
    if (appName.includes('claude'))      { log('detectIdeForChat: appName → claude');      return 'claude';      }
    if (appName.includes('omp') || appName.includes('oh my pi') || appName.includes('oh-my-pi')) {
        log('detectIdeForChat: appName → omp');
        return 'omp';
    }
    return 'copilot';
}

// ─── Available providers (for the canvas dropdown) ──────────────────────────

export interface AvailableProvider extends ChatCommand {
    id: ChatProviderId;
    available: boolean;
    /**
     * Why the provider is or isn't available. Used by the webview to decide
     * whether to hide the entry, dim it, or show a "not installed" hint.
     */
    reason?: 'always' | 'panel' | 'cli' | 'unavailable';
}

// ─── Path probing ────────────────────────────────────────────────────────────

/**
 * Spawn a command synchronously and return trimmed stdout on success.
 * Tries multiple resolution strategies for cross-platform reliability.
 * Mirrors the helper in codeburn-detector.ts.
 */
function spawnSyncTrimmed(arg0: string, args: string[], extraOptions?: cp.SpawnSyncOptions): string | undefined {
    const baseOptions: cp.SpawnSyncOptions = {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
        ...extraOptions
    };

    // 1. Direct spawn (shell: false)
    try {
        const result = cp.spawnSync(arg0, args, { ...baseOptions, shell: false });
        if (result.status === 0 && result.stdout) {
            return (result.stdout as string).trim();
        }
    } catch { /* ignore */ }

    // 2. On Windows, try .cmd / .ps1 / .bat extensions explicitly
    if (process.platform === 'win32') {
        for (const ext of ['.cmd', '.ps1', '.bat']) {
            try {
                const result = cp.spawnSync(arg0 + ext, args, { ...baseOptions, shell: false });
                if (result.status === 0 && result.stdout) {
                    return (result.stdout as string).trim();
                }
            } catch { /* ignore */ }
        }
    }

    // 3. Shell spawn fallback — shell PATH resolution is often more reliable
    try {
        const result = cp.spawnSync(arg0, args, { ...baseOptions, shell: true });
        if (result.status === 0 && result.stdout) {
            return (result.stdout as string).trim();
        }
    } catch { /* ignore */ }

    return undefined;
}

/**
 * Run `where` (Windows) or `which` (Unix) to resolve a command to its absolute
 * path. On Windows, prefers `.cmd` / `.bat` over extension-less scripts so
 * `cp.spawn` with `shell:true` can execute the path directly.
 */
function locateOnPath(command: string): string | undefined {
    const shellCommand = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSyncTrimmed(shellCommand, [command], { shell: true });
    if (!result) { return undefined; }
    const lines = result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { return undefined; }

    if (process.platform === 'win32') {
        const preferred = lines.find(l => /\.(cmd|bat|exe)$/i.test(l)) ?? lines[0];
        return preferred;
    }

    // `which` already verified the binary exists — skip fs.existsSync so
    // tests can mock child_process without also mocking the filesystem.
    return lines[0];
}

/**
 * Public seam for tests. Returns true if the given command resolves to an
 * executable on PATH. The chat-bridge `listAvailableProviders` calls this
 * once per provider; tests inject a stub by replacing this export's
 * implementation. Production callers go through the module-internal cache.
 */
export function resolveCliOnPath(command: string): boolean {
    try {
        return locateOnPath(command) !== undefined;
    } catch (err) {
        log(`resolveCliOnPath(${command}) threw: ${err}`);
        return false;
    }
}

// ─── Caching ─────────────────────────────────────────────────────────────────

const PROVIDER_CACHE_TTL_MS = 30_000;

interface CacheEntry {
    available: boolean;
    reason: 'always' | 'panel' | 'cli' | 'unavailable';
    /** wall-clock ms when the entry was written */
    ts: number;
}

const _availabilityCache = new Map<ChatProviderId, CacheEntry>();

/** Test-only — drop all cached availability results. */
export function __clearProviderAvailabilityCache(): void {
    _availabilityCache.clear();
}

/**
 * Pull from cache if fresh, otherwise compute and store.
 * Coalesces concurrent calls for the same id via a per-id in-flight promise —
 * 5 simultaneous dropdown opens must not trigger 5 spawns.
 */
const _inFlight = new Map<ChatProviderId, Promise<CacheEntry>>();

async function getOrComputeAvailabilityAsync(id: ChatProviderId, compute: () => Promise<CacheEntry>): Promise<CacheEntry> {
    const cached = _availabilityCache.get(id);
    const now = Date.now();
    if (cached && (now - cached.ts) < PROVIDER_CACHE_TTL_MS) {
        return cached;
    }
    const existing = _inFlight.get(id);
    if (existing) { return existing; }
    const p = compute().finally(() => _inFlight.delete(id));
    _inFlight.set(id, p);
    const entry = await p;
    _availabilityCache.set(id, entry);
    return entry;
}

// ─── Per-provider availability rules ─────────────────────────────────────────

/**
 * Pick the executable name(s) to probe for a provider. For panel providers
 * we also accept a CLI fallback binary (e.g. `claude.openChat` panel OR
 * `claude` on PATH). For CLI-only providers we just look at the first arg
 * of `terminalLaunch`.
 */
function probeBinariesForProvider(cmd: ChatCommand): string[] {
    const bins: string[] = [];
    if (cmd.terminalLaunch) {
        const args = cmd.terminalLaunch('');
        const first = args[0];
        if (first && first !== 'echo') {  // 'echo' is the terminal-paste sentinel
            bins.push(first);
        }
    }
    return bins;
}

/**
 * Probe which chat providers are usable on the current host.
 *
 * Rules:
 *   - 'auto', 'copilot', 'terminal' are always available.
 *   - Providers with `hasPanel` are available when the panel command exists
 *     OR a CLI fallback (their `terminalLaunch` binary) is on PATH.
 *   - CLI-only providers (codex, gemini-cli, aider, opencode) are available only when
 *     their binary resolves on PATH — not just hardcoded "available".
 *
 * Results are cached for 30s per id so opening the dropdown repeatedly does
 * not re-spawn `where`/`which` on every render.
 */
export async function listAvailableProviders(): Promise<AvailableProvider[]> {
    const entries = await Promise.all(
        CHAT_PROVIDER_IDS.map(async id => {
            const cmd = CHAT_COMMANDS[id];
            const entry = await getOrComputeAvailabilityAsync(id, () => computeAvailability(id, cmd));
            return {
                id,
                ...cmd,
                available: entry.available,
                reason: entry.reason,
            } as AvailableProvider;
        })
    );
    return entries;
}

async function computeAvailability(id: ChatProviderId, cmd: ChatCommand): Promise<CacheEntry> {
    // Always-available: the safe fallbacks the canvas should always expose.
    if (id === 'auto' || id === 'terminal' || id === 'copilot') {
        return { available: true, reason: 'always', ts: Date.now() };
    }

    // Panel providers: accept either the panel command OR the CLI fallback binary.
    if (cmd.hasPanel) {
        let panelOk = false;
        try {
            panelOk = await cmd.hasPanel();
        } catch {
            panelOk = false;
        }
        if (panelOk) {
            return { available: true, reason: 'panel', ts: Date.now() };
        }
        for (const bin of probeBinariesForProvider(cmd)) {
            if (resolveCliOnPath(bin)) {
                return { available: true, reason: 'cli', ts: Date.now() };
            }
        }
        return { available: false, reason: 'unavailable', ts: Date.now() };
    }

    // CLI-only providers (codex, gemini-cli, aider, opencode): must be on PATH.
    for (const bin of probeBinariesForProvider(cmd)) {
        if (resolveCliOnPath(bin)) {
            return { available: true, reason: 'cli', ts: Date.now() };
        }
    }
    return { available: false, reason: 'unavailable', ts: Date.now() };
}

// ─── Terminal launching ─────────────────────────────────────────────────────

/**
 * Open the integrated terminal and run the given command-line args.
 * If the prompt is long, it's written to a temp file and the terminal
 * command is set up to read it (avoids shell-quoting hell).
 */
async function sendToTerminal(args: string[], query: string): Promise<boolean> {
    const term = vscode.window.createTerminal({
        name: 'AAC Provider',
        message: `Launching: ${args[0]} ${args.length > 1 ? '…' : ''}`.trim(),
    });
    term.show(true);
    try {
        // For long prompts, write to a temp file and have the CLI read it.
        // The 8 KiB threshold is a safe bash-arg limit on most platforms.
        if (query.length > 8192) {
            const tmp = require('os').tmpdir();
            const path = require('path');
            const fs = require('fs');
            const promptFile = path.join(tmp, `aac-prompt-${Date.now()}.md`);
            fs.writeFileSync(promptFile, query, 'utf-8');
            // First arg becomes the file path; replace any existing file arg.
            const cmd = args[0];
            const rest = args.slice(1).filter(a => a !== query);
            const terminalLine = rest.length > 0
                ? `${cmd} ${rest.map(a => shellQuote(a)).join(' ')} < ${shellQuote(promptFile)}`
                : `${cmd} < ${shellQuote(promptFile)}`;
            term.sendText(terminalLine, true);
        } else {
            const cmdLine = args
                .map(a => (a === query ? shellQuote(a) : shellQuote(a)))
                .join(' ');
            term.sendText(cmdLine, true);
        }
        return true;
    } catch (e) {
        log(`sendToTerminal: failed: ${e}`);
        return false;
    }
}

/** Minimal POSIX shell quoting — wraps in single quotes, escapes embedded '. */
function shellQuote(s: string): string {
    if (s === '') return "''";
    if (/^[A-Za-z0-9_\-./:=]+$/.test(s)) return s;
    return "'" + s.replace(/'/g, "'\\''") + "'";
}

// ─── openChat ────────────────────────────────────────────────────────────────

export interface OpenChatOptions {
    /** Override the selected provider. 'auto' = use detected/default. */
    provider?: ChatProviderId;
    /** Query to pre-fill in the chat panel or pass to the CLI. */
    query?: string;
}

export interface OpenChatResult {
    ok: boolean;
    provider: ChatProviderId;
    usedTerminal: boolean;
    fallback: 'none' | 'clipboard' | 'none-available';
    message?: string;
}

/**
 * Open the IDE chat panel OR launch a CLI provider, optionally pre-filling a
 * query. Resolves the provider in this order:
 *   1. options.provider (explicit override from canvas)
 *   2. settings.chatProvider (workspace-level admin default — overrides
 *      the user's dropdown pick when explicitly configured)
 *   3. _selectedProvider (canvas dropdown selection)
 *   4. settings.chatProviderSelected (persisted user pick — defensive
 *      belt-and-suspenders for races between dropdown write and read)
 *   5. detected host IDE
 *   6. 'copilot' fallback
 *
 * @returns OpenChatResult — never throws. UI can use `message` to surface why
 *          the action did not reach a chat panel.
 */
export async function openChat(
    queryOrOptions?: string | OpenChatOptions,
): Promise<boolean> {
    const opts: OpenChatOptions =
        typeof queryOrOptions === 'string'
            ? { query: queryOrOptions }
            : (queryOrOptions ?? {});

    const result = await openChatWithResult(opts);
    if (result.message) {
        vscode.window.showInformationMessage(result.message, 'OK');
    }
    return result.ok;
}

/**
 * Lower-level variant returning a structured result. Use this when the caller
 * needs to know the exact outcome (canvas UI, telemetry, etc.) instead of
 * just a boolean.
 */
export async function openChatWithResult(
    opts: OpenChatOptions = {},
): Promise<OpenChatResult> {
    const query = opts.query;
    log(`openChatWithResult called, query="${query ? query.slice(0, 60) + (query.length > 60 ? '…' : '') : '(none)'}"`);

    // ── 1. Resolve provider ──────────────────────────────────────────────
    const explicit = opts.provider && opts.provider !== 'auto' ? opts.provider : undefined;
    const workspaceProvider = loadWorkspaceChatProviderFromSettings();
    const settings = loadSelectedProviderFromSettings();
    const detected = await detectIdeForChat().catch(() => 'copilot');

    // 'auto' is a SENTINEL — it must always fall through. `??` only filters
    // null/undefined, so the literal string 'auto' short-circuits the
    // chain and forces doOpenChat('auto', ...) into the silent clipboard
    // fallback (the canvas `|Plan|` button would create a JSON stub but
    // never reach a chat panel or terminal). Collapse both sentinel
    // filters into one helper so the rule can never drift apart between
    // the workspace-level admin default and the runtime user-pick source.
    const nonAuto = (id: ChatProviderId): ChatProviderId | undefined =>
        id !== 'auto' ? id : undefined;
    const selectedNonAuto = nonAuto(_selectedProvider);
    // Workspace-level `chatProvider` admin default — declared in
    // package.json as the DEFAULT for canvas actions. Acts as a fallback
    // that only fires when the user has not actively picked anything
    // (i.e. `_selectedProvider` is the 'auto' sentinel AND no persisted
    // pick exists on disk). When set AND the user has also picked, the
    // user's pick wins — otherwise the dropdown is a dead switch.
    const workspaceNonAuto = nonAuto(workspaceProvider);

    // Resolution precedence — user's intentional UI selection beats the
    // workspace-level admin default. Documented as "Default AI chat provider
    // for canvas actions" in package.json — a DEFAULT, not an override. The
    // admin default only kicks in when the user has not picked (the
    // 'auto' sentinel cascades through `selectedNonAuto` and `settings`,
    // falling through to `workspaceNonAuto`). This matches the dropdown
    // mental model — if the user picked Codex/OMP/anything, that pick must
    // stick; the admin setting is a global fallback for unconfigured
    // workspaces, not an opaque lock.
    //   1. opts.provider           — explicit per-call override (highest)
    //   2. _selectedProvider        — live dropdown pick (in-memory)
    //   3. settings.chatProviderSelected — persisted dropdown pick (disk)
    //   4. settings.chatProvider   — workspace-level admin default
    //   5. detected IDE             — autocpilot on first launch
    //   6. 'copilot'                — ultimate fallback
    const providerId: ChatProviderId = explicit
        ?? selectedNonAuto
        ?? (settings !== 'auto' ? settings : undefined)
        ?? workspaceNonAuto
        ?? (detected as ChatProviderId)
        ?? 'copilot';

    log(`openChatWithResult: resolved provider=${providerId} (explicit=${explicit ?? '(unset)'} selected=${selectedNonAuto ?? '(unset)'} settings=${settings} workspace=${workspaceNonAuto ?? '(unset)'} detected=${detected})`);

    return vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Opening ${CHAT_COMMANDS[providerId]?.label ?? providerId}…`, cancellable: false },
        async () => doOpenChat(providerId, query, detected),
    );
}

async function doOpenChat(
    providerId: ChatProviderId,
    query: string | undefined,
    detected: string,
): Promise<OpenChatResult> {
    const cmd = CHAT_COMMANDS[providerId] ?? CHAT_COMMANDS['copilot-fallback'];

    // ── Antigravity: custom sendSimplePrompt path ─────────────────────────
    if (providerId === 'antigravity' && query) {
        log('[antigravity] trying sendSimplePrompt');
        const success = await sendSimplePrompt(query).catch(() => false);
        if (success) {
            return { ok: true, provider: 'antigravity', usedTerminal: false, fallback: 'none' };
        }
        return clipboardFallback(query, 'antigravity', 'Could not send to Antigravity — prompt copied to clipboard.');
    }

    // ── Panel-first providers (claude, omp): if the IDE panel is registered
    //    use it (best UX — pre-filled prompt), else fall back to the CLI.
    if (cmd.hasPanel && cmd.terminalLaunch) {
        let panelOk = false;
        try {
            panelOk = await cmd.hasPanel();
        } catch {
            panelOk = false;
        }
        if (panelOk) {
            log(`[${providerId}] panel registered — using panel path`);
            // Fall through to the panel branch below.
        } else {
            log(`[${providerId}] panel not registered — falling back to terminalLaunch`);
            const args = cmd.terminalLaunch(query ?? '');
            const ok = await sendToTerminal(args, query ?? '');
            if (ok) {
                return { ok: true, provider: providerId, usedTerminal: true, fallback: 'none' };
            }
            return clipboardFallback(query, providerId, `Could not launch ${args[0]} — prompt copied to clipboard.`);
        }
    }

    // ── Pure terminal-launching providers (codex, gemini-cli, aider, opencode, terminal) ─
    if (cmd.terminalLaunch) {
        const args = cmd.terminalLaunch(query ?? '');
        log(`[${providerId}] launching terminal: ${args[0]} ${args.length > 1 ? `(${args.length - 1} arg${args.length - 1 ? 's' : ''})` : ''}`);
        const ok = await sendToTerminal(args, query ?? '');
        if (ok) {
            return { ok: true, provider: providerId, usedTerminal: true, fallback: 'none' };
        }
        return clipboardFallback(query, providerId, `Could not launch ${args[0]} — prompt copied to clipboard.`);
    }

    // ── Chat panel providers (copilot, claude, cursor, windsurf, omp) ─────
    // Try pre-filling the query first (best UX)
    if (query && cmd.withQuery) {
        const args = cmd.withQuery(query);
        log(`[${providerId}] trying withQuery → executeCommand(${args.map(a => JSON.stringify(a)).join(', ')})`);
        try {
            const [id, ...rest] = args;
            await vscode.commands.executeCommand(id, ...rest);
            return { ok: true, provider: providerId, usedTerminal: false, fallback: 'none' };
        } catch (err) {
            log(`[${providerId}] withQuery threw: ${err} — falling through to openOnly`);
        }
    }

    // Open chat panel without pre-fill
    if (cmd.openOnly) {
        const openArgs = cmd.openOnly();
        log(`[${providerId}] trying openOnly → executeCommand(${openArgs.map(a => JSON.stringify(a)).join(', ')})`);
        try {
            const [id, ...rest] = openArgs;
            await vscode.commands.executeCommand(id, ...rest);
            if (query) {
                await vscode.env.clipboard.writeText(query);
                return {
                    ok: true,
                    provider: providerId,
                    usedTerminal: false,
                    fallback: 'clipboard',
                    message: `Chat opened for ${cmd.label} — prompt copied to clipboard; paste and press Enter.`,
                };
            }
            return { ok: true, provider: providerId, usedTerminal: false, fallback: 'none' };
        } catch (err) {
            log(`[${providerId}] openOnly threw: ${err}`);
        }
    }

    // Final fallback: clipboard only
    return clipboardFallback(
        query,
        providerId,
        `Could not open ${cmd.label} chat automatically — command copied to clipboard.`,
    );
}

async function clipboardFallback(
    query: string | undefined,
    provider: ChatProviderId,
    message: string,
): Promise<OpenChatResult> {
    log(`[${provider}] clipboard fallback`);
    if (query) {
        await Promise.resolve(vscode.env.clipboard.writeText(query)).catch(() => undefined);
    }
    return {
        ok: false,
        provider,
        usedTerminal: false,
        fallback: 'clipboard',
        message,
    };
}
