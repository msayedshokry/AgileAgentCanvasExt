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

// Lazy-loaded compress function — avoids import cost when Headroom isn't installed
let _compressFn: ((messages: any[], options?: any) => Promise<any>) | null = null;
let _loadAttempted = false;

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

    // Check proxy health
    let proxyRunning = false;
    let version: string | undefined;
    const proxyUrl = 'http://localhost:8787';

    if (installed) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000);
            const resp = await fetch(`${proxyUrl}/v1/health`, {
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (resp.ok) {
                const body = await resp.json() as any;
                proxyRunning = body?.status === 'healthy';
                version = body?.version;
            }
        } catch {
            // Proxy not running or not reachable
            proxyRunning = false;
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

    // Lazy-load the compress function
    if (!_loadAttempted) {
        _loadAttempted = true;
        try {
            const headroom = require('headroom-ai');
            _compressFn = headroom.compress;
            await detectHeadroom();
        } catch {
            logger.debug('Headroom SDK not available — compression disabled');
            _available = { installed: false, proxyRunning: false };
            return { messages, saved: 0, ratio: 0 };
        }
    }

    if (!_available.proxyRunning || !_compressFn) {
        return { messages, saved: 0, ratio: 0 };
    }

    try {
        const result = await _compressFn(messages, {
            model,
            timeout: 5000,
            fallback: true,
            stack: 'agile-agent-canvas',
        });

        // Update cumulative stats
        _stats.totalCalls++;
        _stats.totalTokensBefore += result.tokensBefore;
        _stats.totalTokensAfter += result.tokensAfter;
        _stats.totalTokensSaved += result.tokensSaved;
        _stats.lastCompressionRatio = result.compressionRatio;
        _stats.lastSaved = result.tokensSaved;

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
