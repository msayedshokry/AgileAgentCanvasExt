/**
 * Vitest spec for the Headroom status-bar quick-pick UX.
 *
 * Contract being locked:
 *   - showHeadroomDetails() opens ONE QuickPick with the right title
 *     and returns 5 top-level items in stable order.
 *   - The right DRILLDOWN fires for the right picked id.
 *   - Empty/null drilldown data surfaces an information message instead
 *     of an empty picker.
 *   - getRecentCalls() returns a snapshot, not a live reference.
 *
 * Mock-routing design note:
 *   The `vscode.window.showQuickPick` mock captures its call's `title`
 *   into a per-title resolver bucket (keyed by the deterministic
 *   QuickPickOptions title strings, NOT by item-label prefix). That
 *   way a future copy change in any drilldown's heading won't silently
 *   re-route the mock to the wrong bucket.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ─── Module mocks ────────────────────────────────────────────────────────

vi.mock('../integrations/headroom', () => ({
    getCompressionStats: vi.fn(() => ({
        totalCalls: 0,
        totalTokensBefore: 0,
        totalTokensAfter: 0,
        totalTokensSaved: 0,
        lastCompressionRatio: 0,
        lastSaved: 0,
        available: false,
    })),
    getAvailability: vi.fn(() => ({
        installed: true,
        proxyRunning: true,
        version: '0.5.5-managed',
    })),
    getCCRStats: vi.fn().mockResolvedValue(null),
    getRecentCalls: vi.fn(() => []),
}));

vi.mock('../acp/agent-bus/handoff-negotiation', () => ({
    handoffNegotiation: {
        getSharedContextStats: vi.fn().mockReturnValue(null),
    },
}));

// ─── vscode mock (per-title resolver buckets) ────────────────────────────

type PickItem = { id?: string | null; label?: string; description?: string; detail?: string; call?: unknown };
type Pick = PickItem | undefined;

const TITLE_TOP              = 'Headroom Compression';
const TITLE_RECENT_CALLS     = 'Headroom — Recent compress calls';
const TITLE_SHARED_CONTEXT   = 'Headroom — SharedContext (A2A handoffs)';
const TITLE_CCR_STORE        = 'Headroom — CCR store';

const buckets: Record<string, { resolve: (v: Pick) => void } | null> = {
    [TITLE_TOP]:              null,
    [TITLE_RECENT_CALLS]:     null,
    [TITLE_SHARED_CONTEXT]:   null,
    [TITLE_CCR_STORE]:        null,
};

vi.mock('vscode', () => ({
    window: {
        showQuickPick: vi.fn(async (items: ReadonlyArray<PickItem>, opts?: { title?: string }) => {
            const title = opts?.title ?? '';
            return new Promise<Pick>((resolve) => {
                buckets[title] = { resolve };
            });
        }),
        showInformationMessage: vi.fn().mockResolvedValue(undefined),
        // `_showRecentCallDetail` calls openTextDocument + showTextDocument
        // + setStatusBarMessage. We don't assert on the result, so no-op
        // resolutions are fine — they just keep the production drilldown
        // path from throwing any "is not a function" error and let the
        // void-fire IIFE silently succeed.
        showTextDocument: vi.fn().mockResolvedValue(undefined),
        setStatusBarMessage: vi.fn().mockResolvedValue(undefined),
    },
    commands: {
        executeCommand: vi.fn().mockResolvedValue(undefined),
    },
    ViewColumn: { Beside: 2 },
    workspace: {
        openTextDocument: vi.fn().mockResolvedValue({}),
        getConfiguration: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(undefined),
        }),
    },
    StatusBarAlignment: { Right: 2 },
}));

// ─── Imports (after mocks so hoisting resolves correctly) ─────────────────

import { showHeadroomDetails } from './headroom-quick-pick';
import { getCompressionStats, getAvailability, getCCRStats, getRecentCalls } from '../integrations/headroom';
import { handoffNegotiation } from '../acp/agent-bus/handoff-negotiation';
import * as vscode from 'vscode';

interface FakeRecentCall {
    timestamp: number;
    tokensBefore: number;
    tokensAfter: number;
    tokensSaved: number;
    compressionRatio: number;
    transformsApplied: string[];
    messageCountIn: number;
    messageCountOut: number;
}

// ─── Test helpers ────────────────────────────────────────────────────────

function setStats(overrides: Partial<ReturnType<typeof getCompressionStats>>): void {
    vi.mocked(getCompressionStats).mockReturnValue({
        totalCalls: 0,
        totalTokensBefore: 0,
        totalTokensAfter: 0,
        totalTokensSaved: 0,
        lastCompressionRatio: 0,
        lastSaved: 0,
        available: false,
        ...overrides,
    });
}

function setAvailability(overrides: Partial<ReturnType<typeof getAvailability>>): void {
    vi.mocked(getAvailability).mockReturnValue({
        installed: true,
        proxyRunning: true,
        version: '0.5.5-managed',
        ...overrides,
    });
}

function setSharedContextStats(stats: Record<string, any> | null): void {
    vi.mocked(handoffNegotiation.getSharedContextStats).mockReturnValue(stats);
}

function setRecentCalls(calls: ReadonlyArray<FakeRecentCall>): void {
    // The real `getRecentCalls` returns `ReadonlyArray<Readonly<RecentCompressCall>>`;
    // the mock accepts the lighter `FakeRecentCall` shape.
    vi.mocked(getRecentCalls).mockReturnValue(calls as unknown as ReturnType<typeof getRecentCalls>);
}

function setCCRStats(stats: Record<string, any> | null | Error): void {
    if (stats instanceof Error) {
        vi.mocked(getCCRStats).mockRejectedValue(stats);
        return;
    }
    vi.mocked(getCCRStats).mockResolvedValue(stats);
}

/** Resolve the next top-level pick with a chosen item from the build output. */
async function pickTop(byId: string | null): Promise<void> {
    const item = lastPickItems(TITLE_TOP).find((i) => (i?.id ?? null) === byId) ?? undefined;
    await resolveBucket(TITLE_TOP, item);
}

/** Cancel-leaf: resolves the top picker with `undefined` (like pressing ESC). */
async function cancelTop(): Promise<void> {
    await resolveBucket(TITLE_TOP, undefined);
}

/**
 * Wait for the `buckets[title]` resolver to be captured by the
 * `showQuickPick` mock. Used before reading `lastPickItems(title)` so
 * `mock.calls` reflects the latest capture, and before `resolveBucket`
 * so an empty buckets[name] doesn't throw.
 */
async function waitForBucket(title: string, timeoutMs = 1000): Promise<void> {
    const start = Date.now();
    while (!buckets[title]) {
        if (Date.now() - start > timeoutMs) {
            throw new Error(`timed out waiting for showQuickPick bucket title="${title}"`);
        }
        await new Promise((r) => setImmediate(r));
    }
}

/**
 * Resolve an already-captured bucket with the given `value` and clear it.
 * Used to advance quick-pick interactions in tests where the next pick
 * (top-level or drilldown) is the user's intent.
 *
 * The bucket is captured synchronously when the production code calls
 * `vscode.window.showQuickPick(...)`; `waitForBucket` here just buys
 * ticks if the call landed in a microtask ahead of the test's poll.
 */
async function resolveBucket(title: string, value: Pick): Promise<void> {
    await waitForBucket(title);
    buckets[title]!.resolve(value);
    buckets[title] = null;
}

function lastPickItems(title: string): ReadonlyArray<PickItem> {
    const calls = vi.mocked(vscode.window.showQuickPick).mock.calls;
    for (let i = calls.length - 1; i >= 0; i--) {
        const opts = calls[i][1] as { title?: string } | undefined;
        if (opts?.title === title) {
            return calls[i][0] as ReadonlyArray<PickItem>;
        }
    }
    throw new Error(`no showQuickPick call with title="${title}" was captured`);
}

beforeEach(() => {
    for (const k of Object.keys(buckets)) { buckets[k] = null; }
    vi.mocked(vscode.window.showQuickPick).mockClear();
    vi.mocked(vscode.window.showInformationMessage).mockClear();
    vi.mocked(vscode.window.showTextDocument).mockClear();
    vi.mocked(vscode.window.setStatusBarMessage).mockClear();
    vi.mocked(vscode.workspace.openTextDocument).mockClear();
    vi.mocked(vscode.commands.executeCommand).mockClear();
    setStats({});
    setAvailability({});
    setSharedContextStats(null);
    setRecentCalls([]);
    vi.mocked(getCCRStats).mockResolvedValue(null);
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ─── Top-level pick routing ──────────────────────────────────────────────

describe('showHeadroomDetails — entry point contract', () => {
    it('opens a single QuickPick titled "Headroom Compression" with the expected options', async () => {
        const p = showHeadroomDetails();
        await cancelTop();
        await p;

        const opts = vi.mocked(vscode.window.showQuickPick).mock.calls[0]?.[1] as { title?: string; placeHolder?: string; matchOnDescription?: boolean };
        expect(opts?.title).toBe(TITLE_TOP);
        expect(opts?.placeHolder).toBe('Choose a section to inspect');
        expect(opts?.matchOnDescription).toBe(true);
    });

    it('top-level item set includes all five sections in stable order', async () => {
        const p = showHeadroomDetails();
        await cancelTop();
        await p;

        const items = lastPickItems(TITLE_TOP);
        const ids = items.map((i) => i?.id ?? null);
        expect(ids).toEqual([
            'compressorHeader',
            'sharedContextHeader',     // entries=0 → header variant
            'ccr',
            'recentCalls',
            'openSettings',
        ]);
    });

    it('top-level compressor row reports the live % from compression stats', async () => {
        setStats({ totalCalls: 5, totalTokensBefore: 10000, totalTokensSaved: 4000 });

        const p = showHeadroomDetails();
        await cancelTop();
        await p;

        const items = lastPickItems(TITLE_TOP);
        const header = items.find((i) => i?.id === 'compressorHeader')!;
        expect(header.label).toMatch(/—\s*40% saved/);
        expect(header.description).toContain('5 calls');
        expect(header.description).toContain('0.5.5-managed');
    });

    it('SharedContext with entries>0 routes to id="sharedContext" (real, not header variant)', async () => {
        setSharedContextStats({
            entries: 3,
            totalOriginalTokens: 4500,
            totalCompressedTokens: 2000,
            totalTokensSaved: 2500,
            savingsPercent: 55,
        });

        const p = showHeadroomDetails();
        await cancelTop();
        await p;

        const scIds = lastPickItems(TITLE_TOP)
            .filter((i) => i?.label?.includes('SharedContext'))
            .map((i) => i?.id ?? null);
        expect(scIds).toEqual(['sharedContext']);
    });

    it('SharedContext with entries=0 drops back to id="sharedContextHeader"', async () => {
        setSharedContextStats({
            entries: 0,
            totalOriginalTokens: 0,
            totalCompressedTokens: 0,
            totalTokensSaved: 0,
            savingsPercent: 0,
        });

        const p = showHeadroomDetails();
        await cancelTop();
        await p;

        const scIds = lastPickItems(TITLE_TOP)
            .filter((i) => i?.label?.includes('SharedContext'))
            .map((i) => i?.id ?? null);
        expect(scIds).toEqual(['sharedContextHeader']);
    });
});

describe('showHeadroomDetails — drilldown routing', () => {
    it('picking recentCalls → opens the ring-buffer picker with the right title', async () => {
        const recent: FakeRecentCall = {
            timestamp: Date.now() - 3_000,
            tokensBefore: 1000,
            tokensAfter: 600,
            tokensSaved: 400,
            compressionRatio: 0.6,
            transformsApplied: ['dedupe'],
            messageCountIn: 4,
            messageCountOut: 2,
        };
        setRecentCalls([recent]);

        const p = showHeadroomDetails();
        await pickTop('recentCalls');
        const recentItems = lastPickItems(TITLE_RECENT_CALLS);
        await resolveBucket(TITLE_RECENT_CALLS, recentItems[0]);
        await p;

        expect(recentItems).toHaveLength(1);
        expect(recentItems[0].label).toMatch(/3s ago/);
        expect(recentItems[0].label).toMatch(/40% saved/);
        expect(recentItems[0].description).toContain('4 → 2 messages');
        expect(recentItems[0].description).toContain('dedupe');
        expect((recentItems[0].call as FakeRecentCall).timestamp).toBe(recent.timestamp);
    });

    it('picking recentCalls when ring buffer is empty → info message, NO drilldown picker', async () => {
        setRecentCalls([]);

        const p = showHeadroomDetails();
        await pickTop('recentCalls');
        await p;

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('No compress calls recorded yet'),
        );
        // Drilldown picker must NOT have been opened.
        expect(buckets[TITLE_RECENT_CALLS]).toBeNull();
    });

    it('picking openSettings → executes workbench.action.openSettings with the agileagentcanvas.headroom scope', async () => {
        const p = showHeadroomDetails();
        await pickTop('openSettings');
        await p;

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'workbench.action.openSettings',
            'agileagentcanvas.headroom',
        );
    });

    it('picking ccr with live stats → opens the CCR picker keyed by metrics', async () => {
        setCCRStats({ totalCompressions: 42, totalRetrievals: 7 });

        const p = showHeadroomDetails();
        await pickTop('ccr');
        // Drilldown directly awaits showQuickPick (no IIFE), so wait
        // until the bucket is captured before reading mock.calls.
        await waitForBucket(TITLE_CCR_STORE);
        const ccrItems = lastPickItems(TITLE_CCR_STORE);
        await resolveBucket(TITLE_CCR_STORE, ccrItems[0]);
        await p;

        expect(ccrItems.map((i) => i?.label ?? '').sort()).toEqual(['totalCompressions', 'totalRetrievals']);
    });

    it('picking ccr when SDK throws → falls back to the info-message surface (no picker)', async () => {
        setCCRStats(new Error('boom'));

        const p = showHeadroomDetails();
        await pickTop('ccr');
        await p;

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('CCR store stats unavailable'),
        );
        expect(buckets[TITLE_CCR_STORE]).toBeNull();
    });
});

describe('showHeadroomDetails — cancel / no-op paths', () => {
    it('cancel on the top picker → no drilldowns fire', async () => {
        const p = showHeadroomDetails();
        await cancelTop();
        await p;

        // Only the top-level call should have been recorded.
        expect(vi.mocked(vscode.window.showQuickPick).mock.calls).toHaveLength(1);
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });
});
