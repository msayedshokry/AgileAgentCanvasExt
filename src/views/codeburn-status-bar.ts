import * as vscode from 'vscode';
import { detectCodeburn, runCodeburn, CB, clearCodeburnCache } from '../integrations/codeburn';
import { createLogger } from '../utils/logger';

const logger = createLogger('codeburn-status-bar');

let _item: vscode.StatusBarItem | undefined;
let _refreshTimer: ReturnType<typeof setTimeout> | undefined;
let _lastCost = '';
let _workspaceListener: vscode.Disposable | undefined;
let _isVisible = false;

/**
 * Create and register the Codeburn status bar item (Menu Bar equivalent).
 * Shows today's AI coding cost. Click opens the Codeburn quick-pick menu.
 * Refreshes on demand rather than polling, with an initial refresh and
 * periodic re-checks only when the item is visible.
 */
export function createCodeburnStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
    _item = vscode.window.createStatusBarItem(
        'agileagentcanvas.codeburnStatus',
        vscode.StatusBarAlignment.Right,
        85  // priority: just left of graphify status
    );
    _item.name = 'Codeburn AI Cost';
    context.subscriptions.push(_item);

    _refresh();
    // Schedule next refresh in 60s — the chain continues only while visible/enabled
    _scheduleRefresh(60_000);

    // Re-detect when workspace folders change
    _workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (root) { clearCodeburnCache(root); } // force full re-detection
        _scheduleRefresh(300);
    });
    context.subscriptions.push(_workspaceListener);

    return _item;
}

/**
 * Force a status bar refresh — call after codeburn commands that may change data.
 */
export function refreshCodeburnStatusBar(): void {
    _scheduleRefresh(0);
}

// ─── Internals ───────────────────────────────────────────────────────────────

function _scheduleRefresh(delayMs = 300): void {
    if (_refreshTimer) { clearTimeout(_refreshTimer); }
    _refreshTimer = setTimeout(() => _refresh().catch(err => {
        logger.warn('Codeburn status refresh failed:', err);
    }), delayMs);
}

async function _refresh(): Promise<void> {
    if (!_item) { return; }

    const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    if (!root) {
        _item.hide();
        _isVisible = false;
        _scheduleRefresh(60_000);
        return;
    }

    const enabled = vscode.workspace
        .getConfiguration('agileagentcanvas')
        .get<boolean>('codeburn.enabled', true);

    if (!enabled) {
        _item.hide();
        _isVisible = false;
        _scheduleRefresh(60_000);
        return;
    }

    const status = detectCodeburn(root);

    if (!status.available) {
        _item.text = '$(flame) Codeburn: install';
        _item.tooltip = 'Codeburn not found. Click to install instructions.\n\nnpm install -g codeburn';
        _item.command = 'agileagentcanvas.codeburn.menu';
        _item.show();
        _isVisible = true;
        _scheduleRefresh(60_000);
        return;
    }

    // Fetch current status silently (status supports --format json; today does not)
    try {
        const result = await runCodeburn(CB.status(), { cwd: root, timeoutMs: 8000, showChannel: false });
        if (result.success && result.json) {
            const j = result.json as { cost?: { total?: number }; today?: { cost?: number; tokens?: number; sessions?: number }; tokens?: { total?: number }; sessions?: number };
            const cost = j?.cost?.total ?? j?.today?.cost ?? j?.cost ?? 0;
            const tokens = j?.tokens?.total ?? j?.today?.tokens ?? j?.tokens ?? 0;
            const sessions = j?.sessions ?? j?.today?.sessions ?? 0;
            _lastCost = `$${cost}`;
            _item.text = `$(flame) ${_lastCost}`;
            _item.tooltip = `Codeburn — Today's AI Spend\nCost: $${cost}\nTokens: ${tokens.toLocaleString()}\nSessions: ${sessions}\n\nClick for menu (Dashboard · Report · Optimize · Compare)`;
        } else if (!result.success) {
            const errHint = result.stderr ? result.stderr.slice(0, 200) : 'non-zero exit';
            _item.text = `$(flame) Codeburn: error`;
            _item.tooltip = `Status refresh failed: ${errHint}\nClick to retry.`;
            logger.warn('Codeburn status command failed:', result.stderr);
        } else {
            _item.text = `$(flame) Codeburn`;
            _item.tooltip = 'Codeburn active. Click for menu.';
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('Codeburn status refresh failed:', msg);
        _item.text = `$(flame) Codeburn: error`;
        _item.tooltip = `Refresh failed: ${msg}\nClick to retry.`;
    }

    _item.command = 'agileagentcanvas.codeburn.menu';
    _item.show();
    _isVisible = true;
    logger.debug(`Codeburn status bar updated: ${_lastCost}`);

    // Only schedule next refresh if the item is still visible
    if (_isVisible) {
        _scheduleRefresh(60_000);
    }
}
