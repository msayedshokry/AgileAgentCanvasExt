import * as vscode from 'vscode';
import { getCompressionStats, getAvailability, getCCRStats } from '../integrations/headroom';
import { getLocalProxyState, setLocalProxyState, onLocalProxyStateChange, type LocalProxyState } from '../integrations/headroom/proxy-state';
import { handoffNegotiation } from '../acp/agent-bus/handoff-negotiation';
import { createLogger } from '../utils/logger';

const logger = createLogger('headroom-status-bar');

let _item: vscode.StatusBarItem | undefined;
let _refreshTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Create and register the Headroom status bar item.
 *
 * The bar is ALWAYS visible (never hidden) so users always know the
 * state of Headroom even when it's not yet ready. Each state has
 * descriptive text + tooltip:
 *
 *   - disabled         → "Headroom: disabled" (setting is off, click to open settings)
 *   - sdk-missing      → "Headroom: SDK missing" (headroom-ai not installed)
 *   - proxy-offline    → "Headroom: offline" (SDK present, proxy not reachable)
 *   - starting-proxy   → "Headroom: starting…" (in-process proxy booting)
 *   - running + no calls → "Headroom"
 *   - running + calls  → "XX%" (live compression stats)
 *
 * Refreshes on demand rather than polling; periodic re-check at 60s.
 */
export function createHeadroomStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
    _item = vscode.window.createStatusBarItem(
        'agileagentcanvas.headroomStatus',
        vscode.StatusBarAlignment.Right,
        84  // priority: just left of codeburn (85)
    );
    _item.name = 'Headroom Compression';
    context.subscriptions.push(_item);

    // Phase 2 — react to in-process proxy lifecycle changes without polling.
    // The proxy-state callback fires immediately with the current state,
    // so the bar renders once on attach without a second refresh tick.
    context.subscriptions.push({
        dispose: onLocalProxyStateChange(() => {
            _scheduleRefresh(0);
        }),
    });

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

/**
 * Notify the bar that the in-process proxy is starting up.
 *
 * Phase 2: this explicitly flips the shared proxy state to `starting`
 * so the bar shows `Headroom: starting…` immediately, even if the
 * underlying `http` `listen()` callback hasn't fired yet. The proxy
 * module will subsequently move the state to `running`, `fallback`,
 * or `failed`, at which point the state's subscriber (registered in
 * `createHeadroomStatusBar`) refreshes the bar again.
 */
export function notifyHeadroomProxyStarting(): void {
    setLocalProxyState('starting');
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

    // State 1: User has explicitly disabled Headroom
    const enabled = vscode.workspace
        .getConfiguration('agileagentcanvas')
        .get<boolean>('headroom.enabled', true);

    if (!enabled) {
        _item.text = '$(circle-slash) Headroom: disabled';
        _item.tooltip = 'Headroom compression is disabled.\nClick to open Headroom settings.';
        _item.command = {
            command: 'workbench.action.openSettings',
            arguments: ['agileagentcanvas.headroom'],
            title: 'Open Headroom Settings',
        };
        _item.show();
        _scheduleRefresh(60_000);
        return;
    }

    // State 2: SDK not loaded (headroom-ai not bundled / installable)
    const avail = getAvailability();

    if (!avail.installed) {
        _item.text = '$(warning) Headroom';
        _item.tooltip =
            'Headroom SDK not detected.\n\n' +
            'The `headroom-ai` package should be bundled with the extension. ' +
            'If you see this on a published install, the package.json dependency was stripped.';
        _item.command = undefined;
        _item.show();
        _scheduleRefresh(60_000);
        return;
    }

    // State 3: In-process proxy booting. Always show — beats showing
    // (and stuttering between) the offline state during cold start.
    const proxyState: LocalProxyState = getLocalProxyState();
    if (proxyState === 'starting') {
        _item.text = '$(rocket) Headroom: starting\u2026';
        _item.tooltip =
            'Extension is starting the in-process Headroom proxy on http://127.0.0.1:8787.\n' +
            'No manual setup required \u2014 this usually finishes in under a second.';
        _item.command = {
            command: 'workbench.action.openSettings',
            arguments: ['agileagentcanvas.headroom'],
            title: 'Open Headroom Settings',
        };
        _item.show();
        _scheduleRefresh(2_000);   // poll faster while booting
        return;
    }

    // State 4: Proxy not reachable on localhost:8787
    // Differentiates the copy by who was supposed to bring the proxy up.
    if (!avail.proxyRunning) {
        _item.text = '$(rocket) Headroom: proxy offline';
        let tooltip =
            'Headroom SDK present, but no proxy is reachable on http://localhost:8787.\n\n';
        if (proxyState === 'fallback') {
            tooltip +=
                'Another process is already listening on port 8787 \u2014 the extension ' +
                'is using that external proxy. If it stops responding, restart VS Code.';
        } else if (proxyState === 'failed') {
            tooltip +=
                'The extension-owned proxy failed to start. ' +
                'See the Agile Agent Canvas output channel for details.';
        } else {
            tooltip +=
                'The extension will auto-spawn the proxy on activation. ' +
                'If you see this persistently, open the output channel.';
        }
        _item.tooltip = tooltip;
        _item.command = {
            command: 'workbench.action.openSettings',
            arguments: ['agileagentcanvas.headroom'],
            title: 'Open Headroom Settings',
        };
        _item.show();
        _scheduleRefresh(60_000);
        return;
    }

    // State 4 & 5: Proxy running — show cumulative compression stats
    const hs = getCompressionStats();

    if (hs.totalCalls === 0) {
        _item.text = '$(rocket) Headroom';
        _item.tooltip =
            `Headroom proxy active (v${avail.version ?? '?'})\n` +
            'No compression calls yet — savings appear after the first LLM call.';
        _item.show();
        _scheduleRefresh(60_000);
        return;
    }

    const pct = hs.totalTokensBefore > 0
        ? ((hs.totalTokensSaved / hs.totalTokensBefore) * 100).toFixed(0)
        : '0';

    // Set bar text + show synchronously so it's visible immediately,
    // even if the slower CCR / SharedContext fetches are still pending.
    _item.text = `$(rocket) ${pct}%`;
    _item.show();

    let tooltip =
        `Headroom Compression\n\n` +
        `Proxy v${avail.version ?? '?'}  ·  Tokens saved: ${hs.totalTokensSaved.toLocaleString()} / ${hs.totalTokensBefore.toLocaleString()}\n` +
        `Ratio: ${pct}%  ·  Calls: ${hs.totalCalls}`;

    // ── SharedContext (A2A handoff compression) ──────────────────────────
    const shareCtxStats = handoffNegotiation.getSharedContextStats();
    if (shareCtxStats && shareCtxStats.entries > 0) {
        const s = shareCtxStats;
        tooltip +=
            `\n\nSharedContext (A2A handoffs)\n` +
            `Compressed entries: ${s.entries}\n` +
            `Tokens saved: ${(s.totalTokensSaved ?? 0).toLocaleString()} ` +
            `(${s.savingsPercent ?? 0}% avg)`;
    }

    // ── CCR store metrics ────────────────────────────────────────────────
    try {
        const ccrStats = await getCCRStats();
        if (ccrStats) {
            tooltip += `\n\nCCR Store`;
            for (const [key, value] of Object.entries(ccrStats)) {
                const displayValue = typeof value === 'number'
                    ? value.toLocaleString()
                    : String(value);
                tooltip += `\n${key}: ${displayValue}`;
            }
        }
    } catch {
        // CCR stats fetch is best-effort; ignore failures
    }

    _item.tooltip = tooltip;
    _item.command = {
        command: 'workbench.action.openSettings',
        arguments: ['agileagentcanvas.headroom'],
        title: 'Open Headroom Settings',
    };
    _scheduleRefresh(60_000);
}
