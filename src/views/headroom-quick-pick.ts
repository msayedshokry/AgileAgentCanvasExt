/**
 * Headroom status-bar quick-pick UX.
 *
 * Click the active Headroom bar → this module shows a transient
 * QuickPick with the metrics compressed for skim-reading:
 *
 *   - SharedContext (A2A handoffs) — entries + tokens saved + avg %
 *   - CCR store                   — manageCachedPattern + counters
 *   - Recent compress calls       — drilldown to last 20 calls
 *   - Open Headroom settings      — terminal action
 *
 * Design notes:
 *   - Click navigation, not keyboard-driven: the most-common paths are
 *     one click. Keyboard users can still hit Enter on the highlighted item.
 *   - Pure module: stat collection lives in `headroom-compressor` /
 *     `in-process-proxy` / `handoffNegotiation`. This file only surfaces.
 *   - Drilldown opens a SECOND showQuickPick that consumes the recent-calls
 *     ring buffer. Calling showQuickPick recursively is supported by
 *     VS Code; we deliberately don't try to nest them.
 */
import * as vscode from 'vscode';
import { getCompressionStats, getAvailability, getRecentCalls, getCCRStats, type RecentCompressCall } from '../integrations/headroom';
import { handoffNegotiation } from '../acp/agent-bus/handoff-negotiation';
import { createLogger } from '../utils/logger';

const logger = createLogger('headroom-quick-pick');

const RECENT_CALLS_PICK_TITLE = 'Headroom — Recent compress calls';
const RECENT_CALLS_PICK_OPTS: vscode.QuickPickOptions = {
    title: RECENT_CALLS_PICK_TITLE,
    placeHolder: 'Newest first · ring buffer capped at 20',
    matchOnDescription: true,
    matchOnDetail: true,
};

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Show the headroom details quick-pick. Called by the registered
 * `agileagentcanvas.headroom.showDetails` command from
 * `headroom-status-bar.ts`.
 */
export async function showHeadroomDetails(): Promise<void> {
    const items = _buildTopItems();
    const pick = await vscode.window.showQuickPick(items, {
        title: 'Headroom Compression',
        placeHolder: 'Choose a section to inspect',
        matchOnDescription: true,
    });
    if (!pick) { return; }

    switch (pick.id) {
        case 'sharedContext':       await _showSharedContextDetail(); break;
        case 'ccr':                 await _showCCRDetail(); break;
        case 'recentCalls':         await _showRecentCalls(); break;
        case 'openSettings':        await _openHeadroomSettings(); break;
        // Static info rows (id === null) — no-op when picked.
        default: break;
    }
}

// ─── Top-level pick item builder ─────────────────────────────────────────────

interface MajorItem extends vscode.QuickPickItem {
    id: 'sharedContextHeader' | 'sharedContext' | 'ccrHeader' | 'ccr'
        | 'recentCalls' | 'compressorHeader' | 'openSettings' | null;
}

function _buildTopItems(): MajorItem[] {
    const items: MajorItem[] = [];
    const hs = getCompressionStats();
    const avail = getAvailability();
    const pct = hs.totalTokensBefore > 0
        ? ((hs.totalTokensSaved / hs.totalTokensBefore) * 100).toFixed(0)
        : '0';

    // ── Headroom Compression summary ──────────────────────────────────────
    items.push({
        id: 'compressorHeader',
        label: `$(rocket) Headroom Compression — ${pct}% saved`,
        description: `${hs.totalCalls.toLocaleString()} calls · proxy v${avail.version ?? '?'}`,
        detail: hs.totalTokensBefore > 0
            ? `Tokens saved: ${hs.totalTokensSaved.toLocaleString()} of ${hs.totalTokensBefore.toLocaleString()}`
            : 'No compression calls yet',
    });

    // ── SharedContext (A2A handoffs) ────────────────────────────────────
    const sc = handoffNegotiation.getSharedContextStats();
    if (sc && sc.entries > 0) {
        items.push({
            id: 'sharedContext',
            label: `$(arrow-swap) SharedContext (A2A handoffs)`,
            description: `${sc.entries} entries · ${sc.savingsPercent ?? 0}% avg savings`,
            detail: `Compressed entries carry between handoff calls — saves ${(sc.totalTokensSaved ?? 0).toLocaleString()} tokens total`,
        });
    } else {
        items.push({
            id: 'sharedContextHeader',
            label: `$(arrow-swap) SharedContext (A2A handoffs)`,
            description: 'No entries yet',
            detail: 'Compressed entries surface here as agents hand off work via the agent bus',
        });
    }

    // ── CCR store ───────────────────────────────────────────────────────
    items.push({
        id: 'ccr',
        label: `$(database) CCR store`,
        description: 'Click for live metrics',
        detail: 'Cross-call cache that surfaces repeat content via hash lookup',
    });

    // ── Recent compress calls (drilldown) ────────────────────────────────
    items.push({
        id: 'recentCalls',
        label: `$(history) Recent compress calls`,
        description: 'View last 20 calls',
        detail: 'Per-call breakdown: tokens before/after, transforms applied, time',
    });

    // ── Open settings (terminal action) ─────────────────────────────────
    items.push({
        id: 'openSettings',
        label: `$(settings-gear) Open Headroom settings`,
        description: 'agileagentcanvas.headroom.*',
        detail: 'Compression level (1-5) and on/off toggle',
    });

    return items;
}

// ─── Drilldown: Recent compress calls ───────────────────────────────────────

async function _showRecentCalls(): Promise<void> {
    const calls = getRecentCalls();
    if (calls.length === 0) {
        await vscode.window.showInformationMessage(
            'No compress calls recorded yet. They appear here after the first LLM-bound message passes through Headroom.',
        );
        return;
    }

    const items: (vscode.QuickPickItem & { call?: RecentCompressCall })[] = calls.map((c) => {
        const pct = c.tokensBefore > 0
            ? Math.round((c.tokensSaved / c.tokensBefore) * 100)
            : 0;
        const ago = _formatAgo(Date.now() - c.timestamp);
        return {
            label: `$(compress) ${ago}  ·  ${pct}% saved  ·  ${c.tokensSaved} tokens`,
            description: `${c.messageCountIn} → ${c.messageCountOut} messages  ·  ${c.transformsApplied.join(', ') || 'identity'}`,
            detail: `${c.tokensBefore.toLocaleString()} → ${c.tokensAfter.toLocaleString()} tokens · ratio ${c.compressionRatio.toFixed(2)}`,
            call: c,
        };
    });

    // Pick the row → open its full JSON in a Beside column via
    // `_showRecentCallDetail`. Fire-and-forget so the second-pick UX
    // stays snappy (closing the drilldown picker shouldn't wait for a
    // virtual-document open), with a logger catch-all so a workspace-
    // closed or extension-host-stalled error reaches the Agile Agent
    // Canvas output channel (not dev-tools only).
    void (async () => {
        try {
            const picked = await vscode.window.showQuickPick(items, RECENT_CALLS_PICK_OPTS);
            if (!picked?.call) { return; }
            await _showRecentCallDetail(picked.call);
        } catch (err) {
            logger.warn('Headroom recent-call drilldown failed:', err);
        }
    })();
}

/**
 * Drill-down: surface the full per-call record. Opens as a VS Code
 * virtual document so the JSON is queryable in the editor (search,
 * jump-to-line) without taking over the QuickPick flow.
 *
 * Exposed as a named function (not arrow) so callers can invoke it
 * inline + we get a real name in stack traces.
 */
async function _showRecentCallDetail(call: RecentCompressCall): Promise<void> {
    const ago = _formatAgo(Date.now() - call.timestamp);
    const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(call, null, 2),
        language: 'json',
    });
    await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: false,
    });
    vscode.window.setStatusBarMessage(
        `Headroom recent call · ${ago} · ${call.tokensSaved} tokens saved`,
        5_000,
    );
}

function _formatAgo(deltaMs: number): string {
    if (deltaMs < 1_000) { return 'just now'; }
    if (deltaMs < 60_000) { return `${Math.floor(deltaMs / 1_000)}s ago`; }
    if (deltaMs < 3_600_000) { return `${Math.floor(deltaMs / 60_000)}m ago`; }
    return `${Math.floor(deltaMs / 3_600_000)}h ago`;
}

// ─── Drilldown: SharedContext detail (read-only summary) ─────────────────────

async function _showSharedContextDetail(): Promise<void> {
    const sc = handoffNegotiation.getSharedContextStats();
    if (!sc || sc.entries === 0) {
        await vscode.window.showInformationMessage(
            'SharedContext has no entries yet. Entries appear when an A2A handoff transfers compressed artifacts.',
        );
        return;
    }
    const items: vscode.QuickPickItem[] = [
        {
            label: `Compressed entries: ${sc.entries}`,
            description: 'across all agent-to-agent handoffs',
        },
        {
            label: `Tokens saved: ${(sc.totalTokensSaved ?? 0).toLocaleString()}`,
            description: `${sc.savingsPercent ?? 0}% average savings per entry`,
        },
        {
            label: `Original → compressed: ${(sc.totalOriginalTokens ?? 0).toLocaleString()} → ${(sc.totalCompressedTokens ?? 0).toLocaleString()}`,
            description: 'token counts',
        },
    ];
    await vscode.window.showQuickPick(items, {
        title: 'Headroom — SharedContext (A2A handoffs)',
        placeHolder: 'Read-only summary',
    });
}

// ─── Drilldown: CCR store detail ─────────────────────────────────────────────

async function _showCCRDetail(): Promise<void> {
    // Best-effort: ask the proxy. If unavailable (older SDK, external proxy
    // not responding), surface what we can.
    let ccrStats: Record<string, any> | null = null;
    try {
        ccrStats = await getCCRStats();
    } catch {
        ccrStats = null;
    }

    if (!ccrStats) {
        await vscode.window.showInformationMessage(
            'CCR store stats unavailable from the current proxy. Either headroom-ai is too old or the proxy is unreachable on :8787.',
        );
        return;
    }

    const items: vscode.QuickPickItem[] = Object.entries(ccrStats).map(([key, value]) => {
        const display = typeof value === 'number' ? value.toLocaleString() : String(value);
        return {
            label: key,
            description: display,
        };
    });

    await vscode.window.showQuickPick(items, {
        title: 'Headroom — CCR store',
        placeHolder: 'Live metrics from the proxy',
        matchOnDescription: true,
    });
}

// ─── Terminal actions ───────────────────────────────────────────────────────

async function _openHeadroomSettings(): Promise<void> {
    await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'agileagentcanvas.headroom',
    );
}
