import * as vscode from 'vscode';
import { CHAT_COMMANDS, CHAT_PROVIDER_IDS, getSelectedProvider, setSelectedProvider, type ChatProviderId } from '../commands/chat-bridge';
import { createLogger } from '../utils/logger';

const logger = createLogger('chat-provider-status-bar');

let _item: vscode.StatusBarItem | undefined;

/**
 * Create the chat-provider status bar item.
 * Shows the current provider and lets the user switch via a Quick Pick.
 * Returns the StatusBarItem so it can be pushed to context.subscriptions.
 */
export function createChatProviderStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
    _item = vscode.window.createStatusBarItem(
        'agileagentcanvas.chatProvider',
        vscode.StatusBarAlignment.Right,
        95, // just left of graphify status (90)
    );
    _item.name = 'Chat Provider';
    context.subscriptions.push(_item);

    _item.command = 'agileagentcanvas.pickChatProvider';
    _refresh();

    // Refresh when configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('agileagentcanvas.chatProviderSelected')
                || e.affectsConfiguration('agileagentcanvas.chatProvider')) {
                _refresh();
            }
        }),
    );

    return _item;
}

/**
 * Force a status bar refresh — call after the user picks a new provider.
 */
export function refreshChatProviderStatusBar(): void {
    _refresh();
}

function _refresh(): void {
    if (!_item) return;
    const selected = getSelectedProvider();
    const cmd = CHAT_COMMANDS[selected] ?? CHAT_COMMANDS['auto'];
    _item.text = `$(comment-discussion) ${cmd.label}`;
    _item.tooltip = `AI provider for canvas actions: ${cmd.label}\n${cmd.hint}\n\nClick to change`;
    _item.show();
}

// ─── Quick Pick command ─────────────────────────────────────────────────────

/**
 * Register the Quick Pick command for changing the provider from the status bar.
 * Called once from extension.ts.
 */
export function registerPickChatProviderCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('agileagentcanvas.pickChatProvider', async () => {
            const current = getSelectedProvider();
            const items: vscode.QuickPickItem[] = CHAT_PROVIDER_IDS.map(id => {
                const cmd = CHAT_COMMANDS[id];
                return {
                    label: `$(comment-discussion) ${cmd.label}`,
                    description: id === current ? '$(check) current' : '',
                    detail: cmd.hint,
                    picked: id === current,
                };
            });
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select AI provider for canvas actions',
                title: 'Agile Agent Canvas — Chat Provider',
            });
            if (!picked) return;
            // Reverse-look-up the id from the label
            const id = CHAT_PROVIDER_IDS.find(i => {
                const c = CHAT_COMMANDS[i];
                return picked.label.includes(c.label);
            });
            if (!id) return;
            setSelectedProvider(id as ChatProviderId);
            _refresh();
            logger.debug(`pickChatProvider: user chose "${id}"`);
        }),
    );
}
