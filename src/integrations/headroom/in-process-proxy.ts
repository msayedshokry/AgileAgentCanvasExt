/**
 * In-process Headroom proxy.
 *
 * The headroom-ai SDK dials http://localhost:8787 by default. Today users
 * have to start that proxy themselves (`npx headroom-ai proxy`). This
 * module hosts the proxy inside the VS Code extension process so the
 * user does nothing — extension activate spins up a Node `http` server
 * on `127.0.0.1:8787` and the SDK talks to it transparently.
 *
 * Wire-protocol subset spoken (covering everything the extension's lazy
 * load paths actually call out to):
 *
 *   GET  /health
 *   GET  /v1/health
 *   GET  /v1/telemetry
 *   GET  /v1/retrieve/stats        (mocked CCR stats)
 *   POST /v1/compress              (naïve dedupe + truncate; see below)
 *   POST /v1/retrieve              (returns null content — SDK falls back)
 *
 * If port 8787 is already in use (the real headroom-ai engine is
 * running), this extension silently steps aside and uses the external
 * proxy. State transitions are surfaced through `./proxy-state`.
 *
 * Compression algorithm (MVP):
 *   1. Dedupe identical adjacent messages
 *   2. Cap any single `content` string at MAX_CONTENT_LEN characters
 *   3. Token estimate = `ceil(content.length / 4)` (matches the SDK's
 *      fallback heuristic when its real engine errors out)
 *
 * These are honest transforms — they save tokens and the bar shows
 * realistic percentages — but NOT semantic compression. Real engine-
 * quality savings require the standalone `headroom-ai` binary.
 */
import * as http from 'node:http';
import { createLogger } from '../../utils/logger';
import { setLocalProxyState, getLocalProxyState } from './proxy-state';

const logger = createLogger('headroom-in-process-proxy');

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 8787;
const PROXY_VERSION = '0.5.5-managed';
const MAX_CONTENT_LEN = 4000;          // chars per message after compression
const TOKEN_CHARS_PER_TOKEN = 4;       // matches SDK fallback heuristic
const REQUEST_TIMEOUT_MS = 5000;

/** Public-facing aggregate stats from the in-process proxy. */
interface ManagedProxyStats {
    totalCalls: number;
    totalTokensBefore: number;
    totalTokensAfter: number;
    totalTokensSaved: number;
}

let _server: http.Server | null = null;
let _stats: ManagedProxyStats = {
    totalCalls: 0,
    totalTokensBefore: 0,
    totalTokensAfter: 0,
    totalTokensSaved: 0,
};

/**
 * Start the in-process proxy.
 *
 * Idempotent — calling twice returns a no-op disposable so the
 * activation path doesn't need to guard duplicates.
 *
 * @returns A `vscode.Disposable`-shaped object that closes the server.
 */
export function startInProcessProxy(): { dispose(): void } {
    if (_server || getLocalProxyState() !== 'idle') {
        logger.debug('In-process proxy already started; ignoring duplicate start');
        return { dispose: () => {} };
    }
    setLocalProxyState('starting');

    const server = http.createServer((req, res) => {
        // Per-request safety: cap body read time so a slow client can't pin the loop.
        res.setTimeout(REQUEST_TIMEOUT_MS);
        _handleRequest(req, res).catch(err => {
            logger.warn(`In-process proxy request error: ${err?.message ?? err}`);
            if (!res.headersSent) {
                _sendJson(res, 500, { error: { type: 'internal', message: err?.message ?? 'internal error' } });
            } else {
                try { res.end(); } catch { /* socket already torn down */ }
            }
        });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            logger.info(
                `Port ${PROXY_PORT} already in use by another process — ` +
                'falling back to external Headroom proxy (extension will not host its own).',
            );
            setLocalProxyState('fallback');
        } else {
            logger.warn(`In-process proxy listen error: ${err.message}`);
            setLocalProxyState('failed');
        }
        _server = null;
    });

    server.listen(PROXY_PORT, PROXY_HOST, () => {
        logger.info(`In-process Headroom proxy listening on http://${PROXY_HOST}:${PROXY_PORT}`);
        setLocalProxyState('running');
    });

    _server = server;

    return {
        dispose() {
            if (_server) {
                const closing = _server;
                _server = null;
                setLocalProxyState('idle');
                // closeAllConnections is Node ≥ 18.2 (we target node20 in esbuild).
                // Drop in-flight sockets BEFORE close() so a request landing in
                // the same tick as deactivate can't write to a dead `_item`.
                const anyServer = closing as unknown as { closeAllConnections?: () => void };
                try { anyServer.closeAllConnections?.(); } catch { /* ignore */ }
                closing.close(() => {
                    logger.info('In-process Headroom proxy closed');
                });
            } else {
                setLocalProxyState('idle');
            }
        },
    };
}

/** Read aggregated stats — used by status bar tooltip / debugging. */
export function getManagedProxyStats(): Readonly<ManagedProxyStats> {
    return { ..._stats };
}

/** Reset aggregated stats. */
export function resetManagedProxyStats(): void {
    _stats = { totalCalls: 0, totalTokensBefore: 0, totalTokensAfter: 0, totalTokensSaved: 0 };
}

/**
 * Test-only: hand the running http.Server to vitest so it can synthesize
 * an 'error' event. This sidesteps Node's async socket-release timing
 * race that makes real-port-contention unit tests flaky — once the
 * error fires, both branches (`EADDRINUSE` → `'fallback'`, other →
 * `'failed'`) are exercised deterministically.
 */
export function _getInternalServerForTest(): http.Server | null {
    return _server;
}

// ─── HTTP handler ────────────────────────────────────────────────────────────

async function _handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const method = (req.method ?? 'GET').toUpperCase();

    // Read body once for POSTs (only the routes we recognise need it)
    let body = '';
    if (method === 'POST') {
        body = await _readBody(req);
    }

    try {
        if (method === 'GET' && (url === '/health' || url === '/v1/health')) {
            _sendJson(res, 200, { status: 'healthy', version: PROXY_VERSION });
            return;
        }
        if (method === 'GET' && url === '/v1/telemetry') {
            _sendJson(res, 200, { ..._stats, version: PROXY_VERSION });
            return;
        }
        if (method === 'GET' && url.startsWith('/v1/retrieve/stats')) {
            _sendJson(res, 200, { ..._stats, enabled: true });
            return;
        }
        if (method === 'POST' && url === '/v1/compress') {
            // Client-side input validation gets its own error envelope so the
            // SDK can disambiguate from genuine server faults.
            let payload: { messages?: any[] };
            try {
                payload = body ? JSON.parse(body) : {};
            } catch (parseErr: any) {
                _sendJson(res, 400, {
                    error: { type: 'invalid_request', message: `Malformed JSON in /v1/compress body: ${parseErr?.message ?? parseErr}` },
                });
                return;
            }
            const result = _naiveCompress(payload.messages ?? []);
            _stats.totalCalls++;
            _stats.totalTokensBefore += result.tokensBefore;
            _stats.totalTokensAfter += result.tokensAfter;
            _stats.totalTokensSaved += result.tokensSaved;
            // Send snake_case keys — matches the upstream headroom-ai engine's
            // wire format. The SDK's deepCamelCase() pass at the consumer
            // (HeadroomClient.compress, SharedContext.put) converts back to
            // camelCase, so callers see result.tokensBefore / result.tokensAfter
            // / result.compressionRatio exactly as expected. Returning
            // already-camelCase would *probably* survive deepCamelCase (it's
            // idempotent on underscore-free strings) but risks edge cases on
            // nested fields we don't control.
            _sendJson(res, 200, {
                messages: result.messages,
                compressed: result.compressed,
                tokens_before: result.tokensBefore,
                tokens_after: result.tokensAfter,
                tokens_saved: result.tokensSaved,
                compression_ratio: result.compressionRatio,
                transforms_applied: result.transformsApplied,
                ccr_hashes: result.ccrHashes,
            });
            return;
        }
        if (method === 'POST' && url === '/v1/retrieve') {
            let payload: { hash?: string };
            try {
                payload = body ? JSON.parse(body) : {};
            } catch (parseErr: any) {
                _sendJson(res, 400, {
                    error: { type: 'invalid_request', message: `Malformed JSON in /v1/retrieve body: ${parseErr?.message ?? parseErr}` },
                });
                return;
            }
            _sendJson(res, 200, {
                hash: payload.hash ?? null,
                content: null,
                similarity: 0,
                cached: false,
            });
            return;
        }

        // Unknown route — log once and 404. Keeps the response shape the SDK
        // would expect from a real engine so the SDK's error path isn't
        // surprised.
        logger.debug(`In-process proxy: no route for ${method} ${url}`);
        _sendJson(res, 404, { error: { type: 'not_found', message: `No route for ${method} ${url}` } });
    } catch (err: any) {
        // Genuinely unexpected — not a client-input error, not a known route.
        logger.warn(`In-process proxy unhandled error: ${err?.message ?? err}`);
        if (!res.headersSent) {
            _sendJson(res, 500, { error: { type: 'internal', message: err?.message ?? 'internal error' } });
        }
    }
}

function _readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', c => chunks.push(c as Buffer));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function _sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    const json = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(json).toString(),
    });
    res.end(json);
}

// ─── Naïve compression (MVP) ────────────────────────────────────────────────

interface NaiveCompressResult {
    messages: any[];
    compressed: boolean;
    tokensBefore: number;
    tokensAfter: number;
    tokensSaved: number;
    compressionRatio: number;
    transformsApplied: string[];
    ccrHashes: string[];
}

function _naiveCompress(messages: any[]): NaiveCompressResult {
    const tokensBefore = messages.reduce((sum, m) => sum + _estimateMessageTokens(m), 0);

    // 1) Dedupe identical adjacent messages (cheap structural shortcut)
    const deduped: any[] = [];
    for (const m of messages) {
        const prev = deduped[deduped.length - 1];
        if (prev && JSON.stringify(_contentOf(prev)) === JSON.stringify(_contentOf(m))) {
            continue;
        }
        deduped.push(m);
    }

    // 2) Cap single-message content length (don't compress tool results;
    //    the LLM often needs the literal structured output)
    const capped = deduped.map(m => {
        const c = _contentOf(m);
        if (typeof c === 'string' && c.length > MAX_CONTENT_LEN) {
            return {
                ...m,
                content: c.slice(0, MAX_CONTENT_LEN) + `\n\n[…truncated from ${c.length} chars]`,
                _headroomTruncated: true,
            };
        }
        return m;
    });

    const tokensAfter = capped.reduce((sum, m) => sum + _estimateMessageTokens(m), 0);

    const tokensSaved = Math.max(0, tokensBefore - tokensAfter);
    const transformsApplied: string[] = [];
    if (capped.length < messages.length) { transformsApplied.push('dedupe'); }
    if (capped.some((m: any) => m._headroomTruncated)) { transformsApplied.push('truncate'); }
    if (transformsApplied.length === 0) { transformsApplied.push('identity'); }

    return {
        messages: capped,
        compressed: tokensSaved > 0,
        tokensBefore,
        tokensAfter,
        tokensSaved,
        compressionRatio: tokensBefore > 0 ? tokensAfter / tokensBefore : 1,
        transformsApplied,
        ccrHashes: [],
    };
}

function _contentOf(msg: any): any {
    if (typeof msg?.content === 'string') { return msg.content; }
    // OpenAI multi-part content (array of text/image_url parts)
    if (Array.isArray(msg?.content)) { return msg.content; }
    return null;
}

function _estimateMessageTokens(msg: any): number {
    const c = _contentOf(msg);
    if (typeof c === 'string') { return Math.ceil(c.length / TOKEN_CHARS_PER_TOKEN); }
    if (Array.isArray(c)) {
        return c.reduce((sum: number, part: any) => {
            if (typeof part?.text === 'string') { return sum + Math.ceil(part.text.length / TOKEN_CHARS_PER_TOKEN); }
            return sum;
        }, 0);
    }
    return 0;
}
