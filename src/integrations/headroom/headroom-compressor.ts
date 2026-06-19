/**
 * Headroom Compressor — seamless context compression for AAC.
 *
 * Auto-detects Headroom proxy availability on extension activate.
 * When available, transparently compresses all LLM-bound messages
 * before each AI provider call. When unavailable, silently no-ops.
 *
 * Tracks cumulative compression stats for the Codeburn status bar.
 */
import * as vscode from 'vscode';
import { createLogger } from '../../utils/logger';
import { toolTelemetry } from '../../chat/tool-telemetry';

/** Subset of headroom-ai HeadroomClient used by the compressor.
 *  Module-level import is avoided to preserve the silent-by-default contract:
 *  if headroom-ai is not installed, this module must still load without error.
 *
 *  Note: compression uses the standalone compress() function (not
 *  _client.compress()) because the standalone function accepts richer
 *  per-request options (cache_align, format, bias) that HeadroomClient's
 *  narrower {model, tokenBudget} signature does not expose. The client
 *  singleton is used for health checks, telemetry, CCR, and retrieval only. */
interface HeadroomClientFacade {
    health(): Promise<{ status: string; version: string }>;
    close(): void;
    telemetry: { getStats(): Promise<Record<string, any>> };
    retrieve(hash: string, options?: { query?: string }): Promise<Record<string, any>>;
    getCCRStats(): Promise<Record<string, any>>;
}

const logger = createLogger('headroom-compressor');

// ── Settings ─────────────────────────────────────────────────────────────────

/** Check whether Headroom compression is enabled in VS Code settings. */
function isHeadroomEnabled(): boolean {
    try {
        return vscode.workspace
            .getConfiguration('agileagentcanvas')
            .get<boolean>('headroom.enabled', true);
    } catch {
        return true; // default to enabled if settings unavailable
    }
}

/** Read the compression level setting (1-5, default 3) — maps to bias in CompressionProfile. */
function getCompressionLevel(): number {
    try {
        return vscode.workspace
            .getConfiguration('agileagentcanvas')
            .get<number>('headroom.compressionLevel', 3);
    } catch {
        return 3;
    }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface HeadroomAvailability {
    installed: boolean;
    proxyRunning: boolean;
    version?: string;
    proxyUrl?: string;
}

export interface CompressionStats {
    totalCalls: number;
    totalTokensBefore: number;
    totalTokensAfter: number;
    totalTokensSaved: number;
    lastCompressionRatio: number;
    lastSaved: number;
    available: boolean;
}

// ── State ────────────────────────────────────────────────────────────────────

let _available: HeadroomAvailability = { installed: false, proxyRunning: false };
let _stats: CompressionStats = {
    totalCalls: 0,
    totalTokensBefore: 0,
    totalTokensAfter: 0,
    totalTokensSaved: 0,
    lastCompressionRatio: 0,
    lastSaved: 0,
    available: false,
};

// Lazy-loaded functions — avoids import cost when Headroom isn't installed
let _compressFn: ((messages: any[], options?: any) => Promise<any>) | null = null;
let _simulateFn: ((messages: any[], options?: any) => Promise<any>) | null = null;
let _client: HeadroomClientFacade | null = null;
let _loadAttempted = false;

// ── Initialisation ───────────────────────────────────────────────────────────

/**
 * One-shot lazy-initialisation of the Headroom SDK.
 * Sets _compressFn, _simulateFn, _client and calls detectHeadroom().
 *
 * @returns true if initialisation succeeded, false if headroom-ai is unavailable.
 */
async function _ensureInitialised(): Promise<boolean> {
    _loadAttempted = true;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const headroom = require('headroom-ai');
        _compressFn = headroom.compress;
        _simulateFn = headroom.simulate;
        _client = new headroom.HeadroomClient({
            timeout: 5000,
            fallback: true,
            stack: 'agile-agent-canvas',
        }) as HeadroomClientFacade;
        await detectHeadroom();
        return true;
    } catch {
        logger.debug('Headroom SDK not available');
        _available = { installed: false, proxyRunning: false };
        return false;
    }
}

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Detect whether Headroom is installed (npm package available) and
 * whether the proxy is running (health check on default port).
 */
export async function detectHeadroom(): Promise<HeadroomAvailability> {
    // Check npm package availability
    let installed = false;
    try {
        require.resolve('headroom-ai');
        installed = true;
    } catch {
        installed = false;
    }

    // Check proxy health — use HeadroomClient.health() when client is available
    let proxyRunning = false;
    let version: string | undefined;
    const proxyUrl = 'http://localhost:8787';

    if (installed) {
        if (_client) {
            try {
                const health = await _client.health();
                proxyRunning = health.status === 'healthy';
                version = health.version;
            } catch {
                proxyRunning = false;
            }
        } else {
            // Fallback: raw health check (client not yet initialised)
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 2000);
                const resp = await fetch(`${proxyUrl}/v1/health`, {
                    signal: controller.signal,
                });
                clearTimeout(timeout);

                if (resp.ok) {
                    const body = await resp.json() as { status?: string; version?: string };
                    proxyRunning = body?.status === 'healthy';
                    version = body?.version;
                }
            } catch {
                proxyRunning = false;
            }
        }
    }

    _available = { installed, proxyRunning, version, proxyUrl };
    _stats.available = proxyRunning;

    logger.debug(
        `Headroom detection: installed=${installed}, proxy=${proxyRunning}` +
        (version ? `, version=${version}` : '')
    );

    return _available;
}

// ── Compression ──────────────────────────────────────────────────────────────

/**
 * Compress messages through Headroom before sending to the LLM.
 *
 * Auto-detects and lazy-loads the Headroom SDK on first call.
 * If Headroom is unavailable, returns messages unchanged.
 *
 * @param messages  The chat messages to compress (any format).
 * @param model     Optional model hint for compression tuning.
 * @returns         Compressed messages + stats, or original if unavailable.
 */
export async function compressMessages(
    messages: any[],
    model?: string,
): Promise<{ messages: any[]; saved: number; ratio: number }> {
    // Fast path: disabled by user setting
    if (!isHeadroomEnabled()) {
        return { messages, saved: 0, ratio: 0 };
    }

    // Fast path: if we know Headroom isn't available, skip
    if (!_available.proxyRunning && _loadAttempted) {
        return { messages, saved: 0, ratio: 0 };
    }

    // Lazy-load the compress function + HeadroomClient singleton
    if (!_loadAttempted && !(await _ensureInitialised())) {
        return { messages, saved: 0, ratio: 0 };
    }

    if (!_available.proxyRunning || !_compressFn) {
        return { messages, saved: 0, ratio: 0 };
    }

    try {
        // ── Intelligent routing ────────────────────────────────────────────
        // If any message contains a large JSON payload, route through
        // SmartCrusher for JSON-aware compression (artifact payloads).
        const isLargeJson = messages.some((m: any) => {
            const c = typeof m.content === 'string' ? m.content : '';
            return c.length > 1000 && (c.trimStart().startsWith('{') || c.includes('```json'));
        });

        const compressionLevel = getCompressionLevel();
        const result = await _compressFn(messages, {
            model,
            timeout: 5000,
            fallback: true,
            cache_align: true,
            bias: compressionLevel,
            stack: 'agile-agent-canvas',
            ...(isLargeJson ? { format: 'json' } : {}),
        });

        // Update cumulative stats
        _stats.totalCalls++;
        _stats.totalTokensBefore += result.tokensBefore;
        _stats.totalTokensAfter += result.tokensAfter;
        _stats.totalTokensSaved += result.tokensSaved;
        _stats.lastCompressionRatio = result.compressionRatio;
        _stats.lastSaved = result.tokensSaved;

        // Wire HeadroomClient telemetry into toolTelemetry stream
        if (_client) {
            _client.telemetry.getStats().then(telemetryStats => {
                toolTelemetry.record({
                    tool: 'headroom-compress',
                    status: 'ok',
                    latencyMs: 0,
                    timestamp: new Date().toISOString(),
                    metadata: {
                        telemetry: telemetryStats,
                        tokensSaved: result.tokensSaved,
                        compressionRatio: result.compressionRatio,
                    },
                });
            }).catch(() => {
                // Telemetry fetch is fire-and-forget; ignore failures
            });
        }

        logger.debug(
            `Compressed: ${result.tokensBefore} → ${result.tokensAfter} tokens ` +
            `(${(result.compressionRatio * 100).toFixed(0)}% saved, ${result.tokensSaved} tokens)`
        );

        return {
            messages: result.messages,
            saved: result.tokensSaved,
            ratio: result.compressionRatio,
        };
    } catch (err: any) {
        logger.debug(`Compression failed (falling back to uncompressed): ${err?.message ?? err}`);
        return { messages, saved: 0, ratio: 0 };
    }
}

// ── Stats ────────────────────────────────────────────────────────────────────

/** Get current compression statistics. */
export function getCompressionStats(): CompressionStats {
    return { ..._stats };
}

/** Reset compression statistics. */
export function resetCompressionStats(): void {
    _stats = {
        totalCalls: 0,
        totalTokensBefore: 0,
        totalTokensAfter: 0,
        totalTokensSaved: 0,
        lastCompressionRatio: 0,
        lastSaved: 0,
        available: _available.proxyRunning,
    };
}

/** Check current Headroom availability status. */
export function getAvailability(): HeadroomAvailability {
    return { ..._available };
}

/** Dispose the HeadroomClient singleton (called on extension deactivation). */
export function disposeHeadroomClient(): void {
    if (_client) {
        try { _client.close(); } catch { /* ignore */ }
        _client = null;
    }
    _compressFn = null;
    _simulateFn = null;
    _loadAttempted = false;
}

// ── CCR Bridge ─────────────────────────────────────────────────────────────

/**
 * Retrieve original content from the CCR compression store by hash.
 * Falls back gracefully if Headroom is not available.
 */
export async function retrieveFromCCR(
    hash: string,
    query?: string,
): Promise<Record<string, any> | null> {
    if (!_client) { return null; }
    try {
        return await _client.retrieve(hash, query ? { query } : undefined);
    } catch (err: any) {
        logger.debug(`CCR retrieve failed for hash ${hash}: ${err?.message ?? err}`);
        return null;
    }
}

/**
 * Get CCR store statistics from the proxy.
 * Returns null if Headroom is not available.
 */
export async function getCCRStats(): Promise<Record<string, any> | null> {
    if (!_client) { return null; }
    try {
        return await _client.getCCRStats();
    } catch (err: any) {
        logger.debug(`CCR stats fetch failed: ${err?.message ?? err}`);
        return null;
    }
}

// ── Simulate ───────────────────────────────────────────────────────────────

/**
 * Dry-run compression without calling the LLM — shows what compression
 * would save (tokens, transforms, waste signals) without modifying messages.
 *
 * Silently returns null if Headroom is not available or disabled.
 */
export async function simulateMessages(
    messages: any[],
    model?: string,
): Promise<Record<string, any> | null> {
    if (!isHeadroomEnabled()) { return null; }
    if (!_available.proxyRunning) { return null; }

    // Lazy-load if not yet initialised
    if (!_loadAttempted && !(await _ensureInitialised())) {
        return null;
    }

    if (!_available.proxyRunning || !_simulateFn) { return null; }

    try {
        const sim = await _simulateFn(messages, { model });
        return {
            tokensBefore: sim.tokensBefore,
            tokensAfter: sim.tokensAfter,
            tokensSaved: sim.tokensSaved,
            estimatedSavings: sim.estimatedSavings,
            transforms: sim.transforms,
            wasteSignals: sim.wasteSignals,
        };
    } catch (err: any) {
        logger.debug(`Simulate failed: ${err?.message ?? err}`);
        return null;
    }
}

/** @internal Reset module-level state — for vitest regression-guard use only. */
export function _resetForTest(): void {
    _loadAttempted = false;
    _compressFn = null;
    _simulateFn = null;
    _client = null;
    _available = { installed: false, proxyRunning: false };
}

/** @internal Directly set availability — bypasses detectHeadroom() for vitest. */
export function _setAvailabilityForTest(avail: HeadroomAvailability): void {
    _available = avail;
    _stats.available = avail.proxyRunning;
}

/** @internal Pre-set compress function so compressMessages skips its lazy-load path. */
export function _primeCompressForTest(compressFn: any): void {
    _compressFn = compressFn;
    _loadAttempted = true;
}

/** @internal Pre-set simulate function for vitest. */
export function _primeSimulateForTest(simulateFn: any): void {
    _simulateFn = simulateFn;
}

/** @internal Pre-set HeadroomClient mock for test telemetry wiring. */
export function _primeClientForTest(client: HeadroomClientFacade): void {
    _client = client;
}
