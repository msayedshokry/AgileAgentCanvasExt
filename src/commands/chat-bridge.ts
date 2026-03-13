import * as vscode from 'vscode';
import { sendSimplePrompt } from '../antigravity/antigravity-orchestrator';
import { createLogger } from '../utils/logger';

const logger = createLogger('chat-bridge');

/**
 * Describes how to invoke a particular IDE's chat command.
 */
interface ChatCommand {
    /** The IDE identifier — must match IdeId in ide-installer.ts */
    ide: string;
    /**
     * Returns the executeCommand argument tuple when a query string should be
     * pre-filled.  undefined = this IDE command does not support pre-filling.
     */
    withQuery?: (query: string) => [string, ...unknown[]];
    /**
     * Returns the executeCommand argument tuple to simply open the chat panel
     * (no pre-filled text).
     */
    openOnly: () => [string, ...unknown[]];
}

/**
 * Per-IDE chat command descriptors.
 * Each entry maps one IdeId to the correct command invocation for that IDE.
 */
const CHAT_COMMANDS: ChatCommand[] = [
    // VS Code / GitHub Copilot
    {
        ide: 'copilot',
        withQuery: (q) => ['workbench.action.chat.open', { query: q }],
        openOnly: () => ['workbench.action.chat.open'],
    },
    // Cursor
    {
        ide: 'cursor',
        openOnly: () => ['cursor.chat.open'],
    },
    // Windsurf
    {
        ide: 'windsurf',
        openOnly: () => ['windsurf.openChat'],
    },
    // Claude Code
    {
        ide: 'claude',
        openOnly: () => ['claude.openChat'],
    },
    // Google Antigravity / Firebase Studio
    // Handled separately in openChat() — openOnly used as fallback only
    {
        ide: 'antigravity',
        openOnly: () => ['antigravity.openAgent'],
    },
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

// ─── IDE detection ────────────────────────────────────────────────────────────

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
            ['antigravity.sendTextToChat',                 'antigravity'],
            ['antigravity.prioritized.chat.openNewConversation', 'antigravity'],
            ['cursor.chat.open',                           'cursor'],
            ['cursorRules.open',                           'cursor'],
            ['windsurf.openChat',                          'windsurf'],
            ['windsurf.cascade.focus',                     'windsurf'],
            ['claude.openChat',                            'claude'],
            ['claude-code.openChat',                       'claude'],
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

    log('detectIdeForChat: defaulting to copilot');
    return 'copilot';
}

// ─── openChat ────────────────────────────────────────────────────────────────

/**
 * Open the IDE chat panel, optionally pre-filling a query.
 *
 * Detects the active IDE first, then uses only the matching command.
 * Falls back to clipboard copy if the chat command fails.
 *
 * @param query  Optional text to pre-fill in the chat input
 * @returns      true if a chat command succeeded, false if clipboard fallback was used
 */
export async function openChat(query?: string): Promise<boolean> {
    log(`openChat called, query="${query ?? '(none)'}"`);

    return vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Opening AI chat…', cancellable: false },
        async () => {
            try {
                const ideId = await detectIdeForChat();
                log(`openChat: detected ide="${ideId}"`);

                const cmd = CHAT_COMMANDS.find(c => c.ide === ideId)
                         ?? CHAT_COMMANDS.find(c => c.ide === 'copilot')!;

                log(`openChat: using ChatCommand for ide="${cmd.ide}", hasWithQuery=${!!cmd.withQuery}`);

                // ── Antigravity: sendPromptToAgentPanel ──────────────────────
                if (ideId === 'antigravity' && query) {
                    log('openChat [antigravity]: trying sendSimplePrompt (orchestrator)');
                    const success = await sendSimplePrompt(query);
                    if (success) {
                        log('openChat [antigravity]: sendSimplePrompt succeeded');
                        // NOTE: Do NOT call openAgent / agentSidePanel.focus here.
                        // sendPromptToAgentPanel already opens and focuses the agent panel.
                        // Calling openAgent again can toggle/collapse it.
                        return true;
                    }

                    log('openChat [antigravity]: sendSimplePrompt failed — falling back to clipboard');

                    // Clipboard fallback
                    await vscode.env.clipboard.writeText(query);
                    try {
                        await vscode.commands.executeCommand('antigravity.startNewConversation');
                        log('openChat [antigravity]: startNewConversation resolved');
                    } catch (e) {
                        log(`openChat [antigravity]: startNewConversation threw: ${e}`);
                        try {
                            await vscode.commands.executeCommand('antigravity.openAgent');
                            log('openChat [antigravity]: openAgent resolved (fallback)');
                        } catch (e2) {
                            log(`openChat [antigravity]: openAgent threw: ${e2}`);
                        }
                    }
                    vscode.window.showInformationMessage(
                        'Command copied to clipboard — paste it into the Gemini chat and press Enter.',
                        'OK'
                    );
                    return false;
                }

                // Try pre-filling the query first (best UX)
                if (query && cmd.withQuery) {
                    const args = cmd.withQuery(query);
                    log(`openChat: trying withQuery → executeCommand(${args.map(a => JSON.stringify(a)).join(', ')})`);
                    try {
                        const [id, ...rest] = args;
                        await vscode.commands.executeCommand(id, ...rest);
                        log('openChat: withQuery succeeded');
                        return true;
                    } catch (err) {
                        log(`openChat: withQuery threw: ${err} — falling through to openOnly`);
                    }
                }

                // Open chat panel without pre-fill
                const openArgs = cmd.openOnly();
                log(`openChat: trying openOnly → executeCommand(${openArgs.map(a => JSON.stringify(a)).join(', ')})`);
                try {
                    const [id, ...rest] = openArgs;
                    await vscode.commands.executeCommand(id, ...rest);
                    log('openChat: openOnly succeeded');
                    if (query) {
                        await vscode.env.clipboard.writeText(query);
                        log('openChat: query copied to clipboard');
                        vscode.window.showInformationMessage(
                            `Chat command copied to clipboard — paste and press Enter`,
                            'OK'
                        );
                    }
                    return true;
                } catch (err) {
                    log(`openChat: openOnly threw: ${err}`);
                }

                // Final fallback: clipboard only
                log('openChat: all commands failed, using clipboard-only fallback');
                if (query) {
                    await vscode.env.clipboard.writeText(query);
                    vscode.window.showInformationMessage(
                        `Could not open chat automatically. Command copied to clipboard.`,
                        'OK'
                    );
                }
                return false;
            } catch (err) {
                log(`openChat: unexpected error: ${err}`);
                return false;
            }
        }
    );
}
