import * as vscode from 'vscode';
import { getCompressionStats, getAvailability } from '../integrations/headroom';
import { createLogger } from '../utils/logger';

const logger = createLogger('headroom-status-bar');

let _item: vscode.StatusBarItem | undefined;
let _refreshTimer: ReturnType<typeof setTimeout> | undefined;
let _isVisible = false;

/**
 * Create and register the Headroom status bar item.
 * Shows compression savings percentage (^XX%) when Headroom is active.
 * Click opens the tooltip with cumulative stats.
 * Refreshes on demand rather than polling, with periodic re-checks
 * only when the item is visible.
 */
export function createHeadroomStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
    _item = vscode.window.createStatusBarItem(
        'agileagentcanvas.headroomStatus',
        vscode.StatusBarAlignment.Right,
        84  // priority: just left of codeburn (85)
    );
    _item.name = 'Headroom Compression';
    context.subscriptions.push(_item);

    _refresh();
    _scheduleRefresh(60_000);

    return _item;
}

/**
 * Force a status bar refresh — call after Headroom detection or compression events.
 */
export function refreshHeadroomStatusBar(): void {
    _scheduleRefresh(0);
}

// ─── Internals ───────────────────────────────────────────────────────────────

function _scheduleRefresh(delayMs = 300): void {
    if (_refreshTimer) { clearTimeout(_refreshTimer); }
    _refreshTimer = setTimeout(() => _refresh().catch(err => {
        logger.warn('Headroom status refresh failed:', err);
    }), delayMs);
}

async function _refresh(): Promise<void> {
    if (!_item) { return; }

    const enabled = vscode.workspace
        .getConfiguration('agileagentcanvas')
        .get<boolean>('headroom.enabled', true);

    if (!enabled) {
        _item.hide();
        _isVisible = false;
        _scheduleRefresh(60_000);
        return;
    }

    const avail = getAvailability();

    if (!avail.installed) {
        _item.hide();
        _isVisible = false;
        _scheduleRefresh(60_000);
        return;
    }

    if (!avail.proxyRunning) {
        _item.text = '$(rocket) Headroom: offline';
        _item.tooltip = 'Headroom proxy not running on http://localhost:8787.\n\nStart with: npx headroom-ai proxy';
        _item.command = undefined;
        _item.show();
        _isVisible = true;
        _scheduleRefresh(60_000);
        return;
    }

    // Proxy is running — show cumulative compression stats
    const hs = getCompressionStats();

    if (hs.totalCalls === 0) {
        _item.text = '$(rocket) Headroom';
        _item.tooltip = `Headroom proxy active (v${avail.version ?? '?'})\nNo compression calls yet — savings appear after the first LLM call.`;
        _item.show();
        _isVisible = true;
        _scheduleRefresh(60_000);
        return;
    }

    const pct = hs.totalTokensBefore > 0
        ? ((hs.totalTokensSaved / hs.totalTokensBefore) * 100).toFixed(0)
        : '0';

    _item.text = `$(rocket) ${pct}%`;
    _item.tooltip = `Headroom Compression\nTokens saved: ${hs.totalTokensSaved.toLocaleString()} / ${hs.totalTokensBefore.toLocaleString()}\nRatio: ${pct}% | Calls: ${hs.totalCalls}\n\nClick to open Headroom proxy health check.`;
    _item.show();
    _isVisible = true;

    if (_isVisible) {
        _scheduleRefresh(60_000);
    }
}
