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
 * * Compression algorithm (Phase 3.1+; see docs/phase-3-compression-design.md
 * for the full rollout plan and open questions):
 *   1. Dedupe identical adjacent messages
 *   2. Summarise role:'tool' JSON outputs (Phase 3.2). For multi-part
 *      role:'user' messages carrying `type:'tool_result'` parts (OpenAI /
 *      Anthropic structured outputs), each tool_result's inner content
 *      is summarised independently; non-tool parts go through untouched.
 *   3. Cap any single `content` string at MAX_CONTENT_LEN characters
 *   4. Token estimate via `countTokens(text)` from `gpt-tokenizer`
 *      (cl100k_base BPE — the same encoding family GPT-4 uses).
 *      Replaces the uniform `ceil(len/4)` heuristic with BPE-tuned
 *      per-token merges; corrects the bar's savings percentage for
 *      code-heavy and CJK content.
 *
 * These are honest transforms — they save tokens and the bar shows
 * realistic percentages — but NOT semantic compression. Real engine-
 * quality savings require the standalone `headroom-ai` binary.
 */
import * as http from 'node:http';
import { createHash } from 'node:crypto';
import { countTokens } from 'gpt-tokenizer';
import { createLogger } from '../../utils/logger';
import { setLocalProxyState, getLocalProxyState } from './proxy-state';

const logger = createLogger('headroom-in-process-proxy');

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 8787;
const PROXY_VERSION = '0.5.5-managed';
const MAX_CONTENT_LEN = 4000;          // chars per message after compression
const MAX_TOOL_OBJ_STR_LEN = 500;      // string-truncation threshold for role:tool JSON object values
const SUMMARISE_ARRAY_KEEP_HEAD = 2;   // tool-result array slice: first N items kept verbatim
const SUMMARISE_ARRAY_KEEP_TAIL = 1;   // tool-result array slice: last M items kept verbatim
const CCR_CAP = 1000;                  // cross-call-remember store cap
const CCR_CONTENT_PREVIEW_LEN = 200;   // first-N-char content preview stored alongside each CCR entry
const REQUEST_TIMEOUT_MS = 5000;

/** Public-facing aggregate stats from the in-process proxy. */
interface ManagedProxyStats {
    totalCalls: number;
    totalTokensBefore: number;
    totalTokensAfter: number;
    totalTokensSaved: number;
}

/**
 * Per-call record kept for the status-bar Recent Compress Calls drilldown.
 * The ring buffer is bounded — once `_recentCalls.length >= RECENT_CALL_CAP`
 * the oldest entry is dropped on each new push, giving O(1) amortised
 * memory and a stable "last 20" snapshot per request.
 */
export interface RecentCompressCall {
    timestamp: number;          // epoch ms
    tokensBefore: number;
    tokensAfter: number;
    tokensSaved: number;
    compressionRatio: number;
    transformsApplied: string[];
    messageCountIn: number;
    messageCountOut: number;
}

const RECENT_CALL_CAP = 20;

let _server: http.Server | null = null;
let _stats: ManagedProxyStats = {
    totalCalls: 0,
    totalTokensBefore: 0,
    totalTokensAfter: 0,
    totalTokensSaved: 0,
};
const _recentCalls: RecentCompressCall[] = [];

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
        // Always close the underlying server after an error event. In a
        // genuine EADDRINUSE case, server.listen() never bound — close()
        // is a no-op. In a synthetic-error test case (the listen-error
        // describe block emits 'error' on the live internal server), the
        // socket would otherwise stay bound and block subsequent
        // startInProcessProxy() calls (which would re-fail with
        // EADDRINUSE indefinitely). Without this close, the SECOND test
        // in any later describe block that re-binds port 8787 would
        // synchronously fail.
        try { server.close(() => { /* swallow */ }); } catch { /* ignore */ }
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
            // Reset the CCR store on dispose so a deactivate/reactivate
            // cycle (extension reload, second workspace) doesn't carry
            // over stale entries whose hash collisions would shadow the
            // next session's calls. Mirrors the existing `_stats` +
            // `_recentCalls` reset patterns.
            _ccr.clear();
        },
    };
}

/** Read aggregated stats — used by status bar tooltip / debugging. */
export function getManagedProxyStats(): Readonly<ManagedProxyStats> {
    return { ..._stats };
}

/**
 * Snapshot of the most recent compress calls (newest first).
 * Bounded at `RECENT_CALL_CAP` entries via the in-process ring buffer.
 *
 * Returned arrays are fresh copies — mutating caller-side never affects
 * the proxy's internal state.
 */
export function getRecentCalls(): ReadonlyArray<Readonly<RecentCompressCall>> {
    return _recentCalls.slice();
}

/** Reset aggregated stats AND recent-call ring. */
export function resetManagedProxyStats(): void {
    _stats = { totalCalls: 0, totalTokensBefore: 0, totalTokensAfter: 0, totalTokensSaved: 0 };
    _recentCalls.length = 0;
}

/**
 * Test-only: clear the recent-call ring without touching cumulative
 * stats. Useful when a test wants to isolate per-call assertions.
 */
export function _clearRecentCallsForTest(): void {
    _recentCalls.length = 0;
}

/**
 * Test-only: append an entry directly to the ring, sidestepping the
 * real HTTP `POST /v1/compress` path. Used by vitest to assert the
 * cap/shape invariants without binding port 8787 (the port-binding
 * describe block routinely contends with TIME_WAIT across siblings and
 * would flake on a 25-call loop).
 */
export function _pushRecentCallForTest(entry: RecentCompressCall): void {
    _pushRecentCall(entry);
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

/**
 * Append a new entry to the recent-call ring, evicting the oldest when
 * the cap is reached.
 *
 * Internal — not exported. Caller-side consumers should use `getRecentCalls()`.
 */
function _pushRecentCall(entry: RecentCompressCall): void {
    if (_recentCalls.length >= RECENT_CALL_CAP) {
        _recentCalls.shift();   // drop oldest
    }        _recentCalls.push(entry);
}

// ─── CCR cross-call dedup (Phase 3.3) ─────────────────────────────────────────

/**
 * Per-call CCR (Cross-Call Remember) entry. Stored in the module-level
 * `_ccr` Map keyed by SHA-256-truncated content hash.
 *
 * `contentRef` is the first `CCR_CONTENT_PREVIEW_LEN` chars of the
 * original content — consumers should treat it as a diagnostic surface,
 * not the full payload. `compressedTokens` tracks post-compression cost;
 * for the stub in-process proxy it's identical to `originalTokens`
 * (Phase 4 will introduce real savings math). `timestamp` doubles as
 * the LRU refresh marker — see `_upsertCcrEntry` for the true LRU
 * delete+set dance.
 */
interface CcrEntry {
    role: string;             // role prevents 'sys'/'user' hash collisions
    contentRef: string;       // first 200 chars (preview, not the full body)
    originalTokens: number;
    compressedTokens: number; // == originalTokens for stub proxy
    timestamp: number;        // epoch seconds — also LRU refresh marker
}

const _ccr = new Map<string, CcrEntry>();

/**
 * Test-only: clear the CCR store without touching the recent-call ring or
 * aggregated `_stats`. Used by vitest to assert CCR invariants across
 * disjoint calls (cap/eviction/role-collision) without binding port 8787
 * across sibling test files.
 */
export function _clearCcrForTest(): void {
    _ccr.clear();
}

/**
 * Deep-canonicalise for hashing. Sorts plain-object keys alphabetically
 * (so `{a: 1, b: 2}` and `{b: 2, a: 1}` map to the same hash),
 * preserves ARRAY element order (the LLM relies on tool_result /
 * multi-part message sequence order), and recurses into nested
 * structures. The result round-trips through `JSON.stringify` without
 * semantic loss.
 */
function _canonicalise(value: any): any {
    if (Array.isArray(value)) {
        return value.map(_canonicalise);
    }
    if (value && typeof value === 'object') {
        const sorted: Record<string, any> = {};
        for (const key of Object.keys(value).sort()) {
            sorted[key] = _canonicalise(value[key]);
        }
        return sorted;
    }
    return value;
}

/**
 * SHA-256 of `(role + NUL + normalised-content)`, truncated to 16 hex
 * chars (64 bits). Collision probability ~1e-9 at the 1000-entry cap,
 * plenty for cross-call dedup. The NUL separator prevents edge cases
 * where ('a', 'bc') and ('ab', 'c') collide because the strings just
 * concatenate.
 */
function _hashMessage(msg: any): string {
    const role = msg?.role ?? 'unknown';
    const c = _contentOf(msg);
    let normalised: string;
    if (typeof c === 'string') {
        normalised = c;
    } else if (Array.isArray(c)) {
        normalised = JSON.stringify(_canonicalise(c));
    } else {
        normalised = '';
    }
    return createHash('sha256')
        .update(role)
        .update('\u0000')           // role/content separator
        .update(normalised)
        .digest('hex')
        .slice(0, 16);              // 16 hex = 64 bits
}

/**
 * Upsert a CCR entry. True LRU via JavaScript's native `Map`
 * insertion-order semantics — on a hit, we delete and re-set the entry
 * so it sits at the tail of insertion order; on a miss, a fresh entry
 * is appended. Eviction runs when `_ccr.size > CCR_CAP` and pulls the
 * oldest key in O(1) via `Map.keys().next().value` — no O(N log N)
 * `Array.sort` per call.
 *
 * Returns the 16-hex-char hash so the caller can populate the
 * response's `ccr_hashes` field.
 */
function _upsertCcrEntry(msg: any): string {
    const hash = _hashMessage(msg);
    const originalTokens = _estimateMessageTokens(msg);
    const contentRaw = _contentOf(msg);
    const preview = typeof contentRaw === 'string'
        ? (contentRaw.length > CCR_CONTENT_PREVIEW_LEN
            ? contentRaw.slice(0, CCR_CONTENT_PREVIEW_LEN) + '…[preview]'
            : contentRaw)
        : '[multi-part]';

    const existing = _ccr.get(hash);
    if (existing) {
        // Refresh LRU position so a frequently-re-touched hash stays warm
        // longer than infrequent ones.
        _ccr.delete(hash);
        _ccr.set(hash, { ...existing, timestamp: Date.now() / 1000 });
    } else {
        _ccr.set(hash, {
            role: msg?.role ?? 'unknown',
            contentRef: preview,
            originalTokens,
            compressedTokens: originalTokens,   // stub proxy: identical
            timestamp: Date.now() / 1000,
        });
    }

    if (_ccr.size > CCR_CAP) {
        const oldestKey = _ccr.keys().next().value;
        if (oldestKey !== undefined) { _ccr.delete(oldestKey); }
    }
    return hash;
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
            let totalOriginal = 0;
            let totalCompressed = 0;
            for (const entry of _ccr.values()) {
                totalOriginal += entry.originalTokens;
                totalCompressed += entry.compressedTokens;
            }
            const totalSaved = Math.max(0, totalOriginal - totalCompressed);
            // TODO Phase 4: instrument hit-rate tracking via a counter
            // that increments on /v1/retrieve's `cached:true` path.
            // Until then the stub proxy reports `savingsPercent: 0` and
            // `hitRate: 0` by design — `compressedTokens ===
            // originalTokens` so savingsPercent is structurally zero, and
            // no hits-vs-misses counter exists yet.
            _sendJson(res, 200, {
                enabled: true,
                entries: _ccr.size,
                capacity: CCR_CAP,
                totalOriginalTokens: totalOriginal,
                totalCompressedTokens: totalCompressed,
                totalTokensSaved: totalSaved,
                savingsPercent: 0,
                hitRate: 0,
            });
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
            const inputMessages = payload.messages ?? [];
            const result = _naiveCompress(inputMessages);
            _stats.totalCalls++;
            _stats.totalTokensBefore += result.tokensBefore;
            _stats.totalTokensAfter += result.tokensAfter;
            _stats.totalTokensSaved += result.tokensSaved;
            _pushRecentCall({
                timestamp: Date.now(),
                tokensBefore: result.tokensBefore,
                tokensAfter: result.tokensAfter,
                tokensSaved: result.tokensSaved,
                compressionRatio: result.compressionRatio,
                transformsApplied: result.transformsApplied,
                messageCountIn: inputMessages.length,
                messageCountOut: result.messages.length,
            });
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
            const hash = payload.hash ?? '';
            const entry = hash ? _ccr.get(hash) : undefined;
            if (!entry) {
                _sendJson(res, 200, {
                    hash: hash || null,
                    content: null,
                    similarity: 0,
                    cached: false,
                });
                return;
            }
            // Refresh LRU position on read so a frequently-retrieved
            // hash stays warm longer than infrequent ones.
            _ccr.delete(hash);
            _ccr.set(hash, { ...entry, timestamp: Date.now() / 1000 });
            _sendJson(res, 200, {
                hash,
                content: entry.contentRef,
                similarity: 1.0,
                cached: true,
                tokenCount: entry.originalTokens,
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
    // Phase 3.3 — upsert each message into the module-level CCR store
    // BEFORE any compression transforms run, so the recorded hash
    // reflects the canonical raw-input signature. The 1:1
    // (input-message -> hash) mapping keeps responses easy to reason
    // about across calls.
    const ccrHashes = messages.map(m => _upsertCcrEntry(m));

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

    // 2) Summarise role:tool JSON content (Phase 3.2). Runs AFTER dedupe
    //    so big tool outputs are not deduplicated against their own
    //    summaries; runs BEFORE the length cap so the cap can still catch
    //    a summarised payload that — for whatever reason — still exceeds
    //    MAX_CONTENT_LEN.
    //
    //    Two branches:
    //      - String content — summarise the string directly. Covers
    //        Anthropic `role:'tool'` and legacy OpenAI `role:'function'`.
    //      - Multi-part `role:'user'` content carrying `type:'tool_result'`
    //        parts (typical for OpenAI structured outputs / Anthropic VL) —
    //        walk each part, summarise the inner content of any tool_result
    //        whose inner `content` is a summarisable string. Non-tool
    //        parts and unparseable inner content pass through untouched.
    const summarised = deduped.map(m => {
        if (!_isToolish(m)) { return m; }
        const c = _contentOf(m);
        if (typeof c === 'string') {
            const next = _summariseToolResult(c);
            if (next === null) { return m; }
            return { ...m, content: next, _headroomSummarised: true };
        }
        if (Array.isArray(c) && m.role === 'user') {
            let anyChanged = false;
            const newParts = c.map((part: any) => {
                if (typeof part?.type === 'string'
                    && part.type.startsWith('tool_result')
                    && typeof part?.content === 'string') {
                    const next = _summariseToolResult(part.content);
                    if (next === null) { return part; }
                    anyChanged = true;
                    return { ...part, content: next };
                }
                return part;
            });
            if (anyChanged) {
                return { ...m, content: newParts, _headroomSummarised: true };
            }
        }
        return m;
    });

    // 3) Cap single-message content length (don't compress tool results;
    //    the LLM often needs the literal structured output)
    const capped = summarised.map(m => {
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
    if (capped.some((m: any) => m._headroomSummarised)) { transformsApplied.push('compress_tool_call'); }
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
        ccrHashes,
    };
}

function _contentOf(msg: any): any {
    if (typeof msg?.content === 'string') { return msg.content; }
    // OpenAI multi-part content (array of text/image_url parts)
    if (Array.isArray(msg?.content)) { return msg.content; }
    return null;
}

/**
 * Tool-message detection — covers Anthropic `role: 'tool'`, legacy OpenAI
 * `role: 'function'`, and Anthropic-Claude-VL / OpenAI-Codex `role: 'user'`
 * content arrays that carry `type: 'tool_result'` parts. Detecting by
 * type-prefix is more robust than role-only, but we still anchor on the
 * explicit roles the design enumerates so we never accidentally compress
 * arbitrary model prose or non-tool user messages.
 */
function _isToolish(msg: any): boolean {
    if (!msg) { return false; }
    if (msg.role === 'tool' || msg.role === 'function') { return true; }
    if (msg.role === 'user' && Array.isArray(msg.content)) {
        return msg.content.some((p: any) =>
            typeof p?.type === 'string' && p.type.startsWith('tool_result'));
    }
    return false;
}

/**
 * Tool-content summarisation (Phase 3.2). Returns the new content string
 * if summarisation succeeded AND the round-trip re-parses cleanly;
 * returns `null` if the caller should leave the message untouched.
 *
 *   JSON array root   — keep first 2 + last 1 items; splice in a
 *                       truncation-marker string between them when the
 *                       array was longer than that head+tail window.
 *   Object root       — walk values; truncate any string > 500 chars to
 *                       a 500-char prefix + suffix marker noting the
 *                       number of characters removed.
 *   Non-JSON / scalar — return null (LM-bound prose must not be broken).
 *   Re-stringify fail — return null and let the upstream callee revert.
 */
function _summariseToolResult(content: string): string | null {
    let parsed: any;
    try {
        parsed = JSON.parse(content);
    } catch {
        // Not strict JSON — leave alone. Don't break LM-bound prose or
        // tool responses that include non-JSON text the agent expects.
        return null;
    }
    let reStringified: string;
    if (Array.isArray(parsed)) {
        const totalKeep = SUMMARISE_ARRAY_KEEP_HEAD + SUMMARISE_ARRAY_KEEP_TAIL;
        if (parsed.length <= totalKeep) { return null; }
        reStringified = JSON.stringify([
            ...parsed.slice(0, SUMMARISE_ARRAY_KEEP_HEAD),
            `...[${parsed.length - totalKeep} items truncated]...`,
            ...parsed.slice(-SUMMARISE_ARRAY_KEEP_TAIL),
        ]);
    } else if (parsed && typeof parsed === 'object') {
        let anyChanged = false;
        const truncated: Record<string, any> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string' && value.length > MAX_TOOL_OBJ_STR_LEN) {
                const removed = value.length - MAX_TOOL_OBJ_STR_LEN;
                truncated[key] = value.slice(0, MAX_TOOL_OBJ_STR_LEN) + `…[truncated ${removed} chars]…`;
                anyChanged = true;
            } else {
                truncated[key] = value;
            }
        }
        if (!anyChanged) { return null; }
        reStringified = JSON.stringify(truncated);
    } else {
        // String/number/boolean/null root — no structural compression possible.
        return null;
    }
    // Re-stringify + parse-verify guard. If the round-trip fails (e.g. due
    // to NaN/Infinity, sparse arrays, BigInt-like strings, or unicode
    // surrogates that strict JSON cannot reparse), revert — the failure
    // mode is "uncompressed original" which is strictly safer than a
    // malformed payload the LM would have to debug.
    try {
        JSON.parse(reStringified);
    } catch {
        return null;
    }
    return reStringified;
}

/**
 * Internal helper — real BPE token estimate via `gpt-tokenizer.countTokens`,
 * defaulting to cl100k_base (the GPT-4 / GPT-4o encoding family).
 *
 * Replaces the legacy uniform `ceil(len/4)` heuristic with BPE-tuned
 * per-token merges. The old heuristic compressed every character class to
 * the same density; real BPE instead adapts per-character (CJK Han chars
 * are typically 1 token; repeated ASCII runs compress heavily; JS/CSS
 * operators split aggressively). The mismatch skewed the status-bar
 * savings percentage by several points for code-heavy and CJK prompts.
 *
 * Multi-part array content (OpenAI / Anthropic shape) sums
 * `countTokens(part.text)` for each text part AND `countTokens(part.content)`
 * for any `type` starting with `'tool_result'` (Phase 3.2 added this so the
 * summarise-vs-after BPE delta correctly reflects multi-part tool-result
 * savings). Image-bearing parts (`type:'image_url'`, etc.) still
 * contribute 0 because media bytes aren't billable as text — the proxy's
 * "saved tokens" metric is a textual estimate by design.
 *
 * Returns 0 for messages whose content we cannot parse (no string, no
 * array of text parts). No callbacks to `_naiveCompress` re-throw paths.
 */
function _estimateMessageTokens(msg: any): number {
    const c = _contentOf(msg);
    if (typeof c === 'string') { return countTokens(c); }
    if (Array.isArray(c)) {
        return c.reduce((sum: number, part: any) => {
            // OpenAI / Anthropic text-bearing parts — original heuristic.
            if (typeof part?.text === 'string') {
                return sum + countTokens(part.text);
            }
            // Anthropic / OpenAI tool_result parts — their inner `content`
            // is typically a JSON-stringified structured response. Count it
            // as text so the bar's savings percentage reflects multi-part
            // tool-result tokens. Skipping these would make `_naiveCompress`'s
            // summarise-vs-after BPE delta read as zero and hide real
            // savings — see Phase 3.2 multi-part test for the round-trip.
            if (typeof part?.type === 'string'
                && part.type.startsWith('tool_result')
                && typeof part?.content === 'string') {
                return sum + countTokens(part.content);
            }
            return sum;
        }, 0);
    }
    return 0;
}
