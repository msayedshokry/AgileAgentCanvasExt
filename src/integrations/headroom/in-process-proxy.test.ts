/**
 * Vitest spec for the in-process Headroom proxy.
 *
 * Why this hits a real `http` server (not a mocked handler): the proxy
 * speaks a wire protocol the SDK consumes over HTTP. Mocking the
 * handler and asserting on the parsed writeHead() call would catch
 * schema errors but miss content-length / JSON serialization /
 * Content-Type surprises. We accept the slight test-runtime cost
 * (~50 ms per lifecycle test) for the honest round-trip.
 *
 * IMPORTANT: tests in this suite bind TCP port 8787. Today no other
 * test file in the project binds 8787, so vitest's default worker
 * pool is fine. If a future test adds a second 8787-binding suite,
 * run vitest's lifecycle/endpoint/handle-error tests in this file
 * AFTER the port-binding tests complete (already the case) — the
 * afterEach drain waits for the socket to fully close before the
 * next describe runs.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as http from 'node:http';
import { countTokens } from 'gpt-tokenizer';
import {
    startInProcessProxy,
    getManagedProxyStats,
    resetManagedProxyStats,
    _getInternalServerForTest,
    getRecentCalls,
    _clearCcrForTest,
    _clearRecentCallsForTest,
    _pushRecentCallForTest,
    type RecentCompressCall,
} from './in-process-proxy';
import {
    setLocalProxyState,
    getLocalProxyState,
    resetLocalProxyStateForTest,
    onLocalProxyStateChange,
} from './proxy-state';

interface HttpResp {
    status: number;
    body: string;
    headers: Record<string, string | string[] | undefined>;
}

function httpRequest(
    method: 'GET' | 'POST',
    path: string,
    body?: string,
): Promise<HttpResp> {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                host: '127.0.0.1',
                port: 8787,
                path,
                method,
                headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body).toString() } : {},
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', c => chunks.push(c as Buffer));
                res.on('end', () => resolve({
                    status: res.statusCode ?? 0,
                    body: Buffer.concat(chunks).toString('utf8'),
                    headers: res.headers,
                }));
            },
        );
        req.on('error', reject);
        if (body) { req.write(body); }
        req.end();
    });
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000, intervalMs = 10): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error(`waitFor timed out after ${timeoutMs} ms`);
        }
        await new Promise(r => setTimeout(r, intervalMs));
    }
}

let firstDisposable: { dispose(): void } | null = null;
let listenerEvents: string[] = [];
let unsubscribe: (() => void) | null = null;

beforeEach(() => {
    resetLocalProxyStateForTest();
    resetManagedProxyStats();
    unsubscribe = onLocalProxyStateChange((s) => listenerEvents.push(s));
    // Drop the immediate-fire event ('idle') from the snapshot so tests can
    // assert only on changes that happen during their own body.
    listenerEvents = [];
});

afterEach(async () => {
    unsubscribe?.();
    unsubscribe = null;
    if (firstDisposable) {
        firstDisposable.dispose();
        firstDisposable = null;
    }
    // Drain time so server.close completes before the next test.
    await waitFor(() => getLocalProxyState() === 'idle', 2000);
});

// ─── Lifecycle ──────────────────────────────────────────────────────────────

describe('in-process proxy — lifecycle', () => {
  it('transitions idle → starting → running on first start', async () => {
    firstDisposable = startInProcessProxy();
    expect(getLocalProxyState()).toBe('starting');

    await waitFor(() => getLocalProxyState() === 'running');
    expect(listenerEvents).toEqual(['starting', 'running']);
  });

  it('is idempotent: a second start returns a no-op disposable and does not refire listeners', async () => {
    firstDisposable = startInProcessProxy();
    await waitFor(() => getLocalProxyState() === 'running');
    const callsAtRunning = listenerEvents.length;

    const secondDisposable = startInProcessProxy();
    secondDisposable.dispose();   // no-op; should not flip state

    expect(listenerEvents.length).toBe(callsAtRunning);
    expect(getLocalProxyState()).toBe('running');
  });

  it('dispose resolves back to idle after server.close', async () => {
    firstDisposable = startInProcessProxy();
    await waitFor(() => getLocalProxyState() === 'running');

    firstDisposable.dispose();
    firstDisposable = null;
    await waitFor(() => getLocalProxyState() === 'idle', 2000);
    expect(listenerEvents[listenerEvents.length - 1]).toBe('idle');
  });
});

describe('in-process proxy — endpoint surface', () => {
  beforeEach(async () => {
    firstDisposable = startInProcessProxy();
    await waitFor(() => getLocalProxyState() === 'running');
    // Clear the CCR store so each test in this describe block starts
    // from a deterministic empty state. The recent-call ring is already
    // cleared by the file-level beforeEach.
    _clearCcrForTest();
  });

  it('GET /health → 200 { status: healthy, version }', async () => {
    const r = await httpRequest('GET', '/health');
    expect(r.status).toBe(200);
    const payload = JSON.parse(r.body);
    expect(payload.status).toBe('healthy');
    expect(payload.version).toMatch(/^0\.5\.5-managed$/);
    expect(r.headers['content-type']).toMatch(/application\/json/);
  });

  it('GET /v1/health → 200 { status: healthy, version }', async () => {
    const r = await httpRequest('GET', '/v1/health');
    expect(r.status).toBe(200);
    const payload = JSON.parse(r.body);
    expect(payload.status).toBe('healthy');
    expect(payload.version).toMatch(/^0\.5\.5-managed$/);
  });

  it('POST /v1/compress dedupes adjacent identical messages and reports saved tokens (compressed=true)', async () => {
    const r = await httpRequest('POST', '/v1/compress', JSON.stringify({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'user', content: 'hello' },     // duplicate adjacent
        { role: 'user', content: 'world' },
      ],
    }));
    expect(r.status).toBe(200);
    const payload = JSON.parse(r.body);
    expect(payload.messages).toHaveLength(2);                   // dedupe applied
    // The dropped message saves ceil(5/4) ≈ 2 tokens (rough heuristic).
    // compressed: tokensSaved > 0
    expect(payload.compressed).toBe(true);
    expect(payload.tokens_saved).toBeGreaterThan(0);
    expect(payload.compression_ratio).toBeLessThan(1);
    expect(payload.transforms_applied).toContain('dedupe');
    // Snake_case shape — verified once for all the expected keys
    expect(payload).toHaveProperty('tokens_before');
    expect(payload).toHaveProperty('tokens_after');
    expect(payload).toHaveProperty('compression_ratio');
    expect(payload).toHaveProperty('transforms_applied');
    expect(payload).toHaveProperty('ccr_hashes');
  });

  it('POST /v1/compress truncates long message content', async () => {
    const longText = 'A'.repeat(8000);
    const r = await httpRequest('POST', '/v1/compress', JSON.stringify({
      messages: [{ role: 'user', content: longText }],
    }));
    expect(r.status).toBe(200);
    const payload = JSON.parse(r.body);
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0].content.length).toBeLessThan(8000);
    expect(payload.messages[0].content).toContain('truncated');
    expect(payload.transforms_applied).toContain('truncate');
    expect(payload.tokens_saved).toBeGreaterThan(0);
    expect(payload.compressed).toBe(true);
    expect(payload.compression_ratio).toBeLessThan(1);
  });

  it('POST /v1/retrieve returns a null-content shape (SDK falls back gracefully)', async () => {
    const r = await httpRequest('POST', '/v1/retrieve', JSON.stringify({ hash: 'abc123', query: 'test' }));
    expect(r.status).toBe(200);
    const payload = JSON.parse(r.body);
    expect(payload.hash).toBe('abc123');
    expect(payload.content).toBeNull();
    expect(payload.cached).toBe(false);
  });

  it('GET /v1/telemetry returns the managed stats shape', async () => {
    // Pre-populate managed stats by running one compress first
    await httpRequest('POST', '/v1/compress', JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }));

    const r = await httpRequest('GET', '/v1/telemetry');
    expect(r.status).toBe(200);
    const payload = JSON.parse(r.body);
    expect(payload.totalCalls).toBe(1);
    expect(payload.totalTokensBefore).toBeGreaterThan(0);
    expect(payload.version).toMatch(/^0\.5\.5-managed$/);
  });

  it('POST /v1/compress uses real BPE token counts (gpt-tokenizer.cl100k_base) instead of the ceil(len/4) heuristic', async () => {
    // The Phase 3.1 swap replaced the legacy `ceil(content.length/4)`
    // heuristic with `gpt-tokenizer.countTokens`. We lock the count to
    // whatever the library returns at test-time (resilient to library
    // version bumps that re-tune the BPE merges) AND assert the count is
    // NOT the legacy heuristic value — so a future regression that
    // re-introduces the heuristic fails this test loudly.
    //
    // Fixture selection: `'hello world test message'` has 23 chars. In
    // cl100k_base BPE encodes this as 4 tokens (["hello", " world", " test",
    // " message"]) while the legacy heuristic returns ceil(23/4) = 6. The
    // 4 ≠ 6 delta is what makes the regression-guard assertion meaningful.
    const fixture = 'hello world test message';
    const r = await httpRequest('POST', '/v1/compress', JSON.stringify({
      messages: [{ role: 'user', content: fixture }],
    }));
    expect(r.status).toBe(200);
    const payload = JSON.parse(r.body);
    expect(payload.tokens_before).toBe(countTokens(fixture));
    expect(payload.tokens_before).not.toBe(Math.ceil(fixture.length / 4));
    // After the swap the savings token count is identically equal
    // (single-message request — nothing is deduped/truncated), so the
    // round-trip is well-defined: tokens_before == tokens_after.
    expect(payload.tokens_after).toBe(payload.tokens_before);
    expect(payload.compression_ratio).toBeCloseTo(1, 5);
  });

  // ─── Phase 3.2: tool-result summarisation (5 assertions) ─────────────────

  it('POST /v1/compress summarises role:tool JSON arrays while keeping the JSON parsable', async () => {
    // 1000-item array root — Phase 3.2 keeps first 2 + last 1 and splices
    // in a "...[N items truncated]..." marker. The downstream SDK must be
    // able to JSON.parse the result; the re-stringify + parse-verify guard
    // is the contract that prevents malformed payloads from reaching the LM.
    const items = Array.from({ length: 1000 }, (_, i) => ({ i }));
    const r = await httpRequest('POST', '/v1/compress', JSON.stringify({
      messages: [{ role: 'tool', content: JSON.stringify(items) }],
    }));
    expect(r.status).toBe(200);
    const payload = JSON.parse(r.body);
    expect(payload.messages).toHaveLength(1);
    const summarisedContent: string = payload.messages[0].content;
    expect(typeof summarisedContent).toBe('string');
    // Round-trip contract: the summarised string must re-parse cleanly.
    expect(() => JSON.parse(summarisedContent)).not.toThrow();
    const parsed = JSON.parse(summarisedContent);
    // 4 elements: items[0], items[1], truncation marker, items[999].
    expect(parsed.length).toBe(4);
    expect(parsed[0]).toEqual({ i: 0 });
    expect(parsed[1]).toEqual({ i: 1 });
    expect(typeof parsed[2]).toBe('string');
    expect(parsed[2]).toMatch(/\[\d+ items truncated\]/);
    expect(parsed[3]).toEqual({ i: 999 });
    expect(payload.transforms_applied).toContain('compress_tool_call');
    // Real savings — BPE counts the 4-element summary as far fewer tokens
    // than the original 1000-element array.
    expect(payload.tokens_saved).toBeGreaterThan(0);
  });

  it('POST /v1/compress leaves non-JSON tool content untouched (no compress_tool_call)', async () => {
    // Markdown prose / non-strict-JSON tool responses must NOT be touched —
    // the LM expects the literal text. The `compress_tool_call` transform
    // must remain absent so the drilldown UI shows it as never-transformed.
    const prose = '## Tool output\nLore ipsum. The fixture has multiple lines of prose the agent needs verbatim.';
    const r = await httpRequest('POST', '/v1/compress', JSON.stringify({
      messages: [{ role: 'tool', content: prose }],
    }));
    expect(r.status).toBe(200);
    const payload = JSON.parse(r.body);
    expect(payload.messages[0].content).toBe(prose);
    expect(payload.transforms_applied).not.toContain('compress_tool_call');
  });

  it('POST /v1/compress truncates long string values inside role:tool JSON objects', async () => {
    // Object root: walk every key, truncate string values > 500 chars to a
    // 500-char prefix + suffix marker noting the number of characters
    // removed. Short keys untouched. The 500 here mirrors the production
    // MAX_TOOL_OBJ_STR_LEN constant — if that knob changes, both must move.
    const fixture = {
      shortKey: 'tiny',
      longKey: 'A'.repeat(8000),
      veryLongKey: 'B'.repeat(20000),
    };
    const r = await httpRequest('POST', '/v1/compress', JSON.stringify({
      messages: [{ role: 'tool', content: JSON.stringify(fixture) }],
    }));
    expect(r.status).toBe(200);
    const payload = JSON.parse(r.body);
    expect(payload.messages).toHaveLength(1);
    // Round-trip contract — re-parse cleanly.
    const parsed = JSON.parse(payload.messages[0].content);
    expect(parsed.shortKey).toBe('tiny');
    expect(parsed.longKey.startsWith('A'.repeat(500))).toBe(true);
    // Suffix marker — Unicode U+2026 (horizontal ellipsis) + removed count.
    expect(parsed.longKey).toMatch(/…\[truncated \d+ chars\]…/);
    expect(parsed.veryLongKey.length).toBeLessThan(20000);
    expect(payload.transforms_applied).toContain('compress_tool_call');
    expect(payload.tokens_saved).toBeGreaterThan(0);
  });

  it('POST /v1/compress reverts tool-summarisation on JSON parse failure (no compress_tool_call)', async () => {
    // Fail-open safety: garbage that LOOKS like a tool response but fails
    // strict JSON.parse must NOT be mangled. The summarise step returns
    // null and the original content goes through untouched; the
    // `compress_tool_call` transform is never added to keep the drilldown
    // honest about what actually happened.
    const garbage = '{this is not JSON, even though it has braces}';
    const r = await httpRequest('POST', '/v1/compress', JSON.stringify({
      messages: [{ role: 'tool', content: garbage }],
    }));
    expect(r.status).toBe(200);
    const payload = JSON.parse(r.body);
    expect(payload.messages[0].content).toBe(garbage);
    expect(payload.transforms_applied).not.toContain('compress_tool_call');
  });

  it('POST /v1/compress summarises inner content inside role:user tool_result multi-part messages', async () => {
    // OpenAI / Anthropic structured outputs arrive as role:'user' messages
    // whose content is an array of {type:'tool_result', ...} parts. The
    // summariser walks each tool_result part and shrinks its inner content;
    // non-tool-result parts (text, image_url, etc) pass through untouched.
    const items = Array.from({ length: 800 }, (_, i) => ({ i, name: `item-${i}` }));
    const toolUseId = 'X-42';
    const toolResultPart = {
      type: 'tool_result',
      tool_use_id: toolUseId,
      // Top-level array — triggers the array-root summarise branch.
      // The 3.2 summarise step is TOP-LEVEL only (the design's "walk keys"
      // explicitly does not recurse below the parsed-JSON root), so the
      // fixture puts the truncation candidate at the root, not nested
      // under an object key. Each element carries a simple shape so we
      // can assert on the full first/last slice values.
      content: JSON.stringify(items),
    };
    const r = await httpRequest('POST', '/v1/compress', JSON.stringify({
      messages: [{ role: 'user', content: [toolResultPart] }],
    }));
    expect(r.status).toBe(200);
    const payload = JSON.parse(r.body);
    expect(payload.messages).toHaveLength(1);
    const newContent = payload.messages[0].content;
    // Multi-part shape preserved — still an array with one tool_result part.
    expect(Array.isArray(newContent)).toBe(true);
    expect(newContent).toHaveLength(1);
    expect(newContent[0].type).toBe('tool_result');
    // tool_use_id preserved — summarisation must NOT lose it.
    expect(newContent[0].tool_use_id).toBe(toolUseId);
    // Inner content was summarised: array-root branch kept first 2 + last 1
    // and spliced the 797-item truncation marker between them.
    const inner = JSON.parse(newContent[0].content);
    expect(Array.isArray(inner)).toBe(true);
    expect(inner.length).toBe(4);
    expect(inner[0]).toEqual({ i: 0, name: 'item-0' });
    expect(inner[1]).toEqual({ i: 1, name: 'item-1' });
    expect(typeof inner[2]).toBe('string');
    expect(inner[2]).toMatch(/\[\d+ items truncated\]/);
    expect(inner[3]).toEqual({ i: 799, name: 'item-799' });
    expect(payload.transforms_applied).toContain('compress_tool_call');
    expect(payload.tokens_saved).toBeGreaterThan(0);
  });

  it('404 for unknown routes, with the SDK-friendly error envelope', async () => {
    const r = await httpRequest('GET', '/does-not-exist');
    expect(r.status).toBe(404);
    const payload = JSON.parse(r.body);
    expect(payload.error.type).toBe('not_found');
    expect(payload.error.message).toContain('/does-not-exist');
  });

  it('rejects malformed JSON in compress body with 400 + invalid_request envelope', async () => {
    const r = await httpRequest('POST', '/v1/compress', 'this is not json');
    expect(r.status).toBe(400);
    const payload = JSON.parse(r.body);
    expect(payload.error.type).toBe('invalid_request');
  });
});

describe('in-process proxy — listen error handling', () => {
  it('transitions to "fallback" when the server emits an EADDRINUSE error', async () => {
    // Synthesize the listen-error path directly instead of trying to
    // occupy port 8787 with a real side-channel server. Node's async
    // socket-release timing makes real-port-contention unit tests
    // flaky — synthetic emit guarantees the on-error handler fires.
    firstDisposable = startInProcessProxy();
    await waitFor(() => getLocalProxyState() === 'starting');

    const internal = _getInternalServerForTest();
    expect(internal).not.toBeNull();

    const addrInUse: NodeJS.ErrnoException = Object.assign(
      new Error('address already in use 127.0.0.1:8787'),
      { code: 'EADDRINUSE', errno: -98, syscall: 'listen', address: '127.0.0.1', port: 8787 },
    );
    internal!.emit('error', addrInUse);

    await waitFor(() => getLocalProxyState() === 'fallback', 1000);
    expect(listenerEvents).toContain('fallback');
  });

  it('transitions to "failed" when the server emits a non-EADDRINUSE error', async () => {
    firstDisposable = startInProcessProxy();
    await waitFor(() => getLocalProxyState() === 'starting');

    const internal = _getInternalServerForTest();
    expect(internal).not.toBeNull();

    const permDenied: NodeJS.ErrnoException = Object.assign(
      new Error('permission denied'),
      { code: 'EACCES', errno: -13, syscall: 'listen' },
    );
    internal!.emit('error', permDenied);

    await waitFor(() => getLocalProxyState() === 'failed', 1000);
    expect(listenerEvents).toContain('failed');
  });
});

describe('in-process proxy — managed stats accessor', () => {
  it('getManagedProxyStats() returns a fresh snapshot — caller mutation cannot poison internals', async () => {
    // We don't startInProcessProxy() here because port 8787 may be in
    // TIME_WAIT from previous describe blocks' server.close() callbacks.
    // The endpoint-surface tests already cover the round-trip that
    // increments _stats via /v1/compress. This test locks the snapshot
    // immutability invariant without needing a live socket.
    const baseline = getManagedProxyStats();
    expect(baseline.totalCalls).toBe(0);

    const snapshot = getManagedProxyStats();
    // Returned object is NOT the same reference as _stats.
    expect(snapshot).not.toBe(baseline);

    // Caller mutates the snapshot — internals must be unaffected.
    (snapshot as { totalCalls: number }).totalCalls = 999_999;
    expect(getManagedProxyStats().totalCalls).toBe(0);
  });
});

// ─── CCR cross-call dedup (Phase 3.3 — module-level Map + LRU) ────────────────

describe('in-process proxy — CCR cross-call dedup', () => {
  beforeEach(() => {
    _clearCcrForTest();
  });

  it('POST /v1/compress populates ccr_hashes with one 16-hex-char hash per input message', async () => {
    // Wire-format invariant: regardless of transforms applied, the
    // `ccr_hashes` array length must equal the input `messages` length,
    // and every element must be a 64-bit (16 hex chars) SHA-256 prefix.
    firstDisposable = startInProcessProxy();
    await waitFor(() => getLocalProxyState() === 'running');
    const r = await httpRequest('POST', '/v1/compress', JSON.stringify({
      messages: [
        { role: 'user', content: 'alpha' },
        { role: 'user', content: 'beta' },
        { role: 'assistant', content: 'ack' },
      ],
    }));
    expect(r.status).toBe(200);
    const payload = JSON.parse(r.body);
    expect(Array.isArray(payload.ccr_hashes)).toBe(true);
    expect(payload.ccr_hashes).toHaveLength(3);
    for (const hash of payload.ccr_hashes) {
      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('cross-call ccr_hashes match for identical messages across disjoint compress calls', async () => {
    // Two /v1/compress calls with the same input message produce the
    // same hash — that's the dedup contract. The 16-hex hash is
    // deterministic across the 100ms gap between calls.
    firstDisposable = startInProcessProxy();
    await waitFor(() => getLocalProxyState() === 'running');
    const sharedMessage = { role: 'user', content: 'canonical fixture across calls' };

    const r1 = await httpRequest('POST', '/v1/compress', JSON.stringify({ messages: [sharedMessage] }));
    const p1 = JSON.parse(r1.body);
    expect(p1.ccr_hashes).toHaveLength(1);
    const first = p1.ccr_hashes[0];

    const r2 = await httpRequest('POST', '/v1/compress', JSON.stringify({ messages: [sharedMessage] }));
    const p2 = JSON.parse(r2.body);
    expect(p2.ccr_hashes).toHaveLength(1);
    // Same canonical payload → same hash. Dedup hit, returned the
    // pre-existing entry (LRU refresh on touch).
    expect(p2.ccr_hashes[0]).toBe(first);
  });

  it("role:'user' and role:'system' with identical text hash to different values", async () => {
    // The role prefix on the hash input gates collisions across roles.
    // Fixing the role-blending bug here would silently break the
    // cross-canvas CCR contract — guard against future regressions.
    firstDisposable = startInProcessProxy();
    await waitFor(() => getLocalProxyState() === 'running');
    const text = 'hello world';
    const r1 = await httpRequest('POST', '/v1/compress', JSON.stringify({
      messages: [{ role: 'user', content: text }],
    }));
    const r2 = await httpRequest('POST', '/v1/compress', JSON.stringify({
      messages: [{ role: 'system', content: text }],
    }));
    const p1 = JSON.parse(r1.body);
    const p2 = JSON.parse(r2.body);
    expect(p1.ccr_hashes[0]).not.toBe(p2.ccr_hashes[0]);
  });

  it('CCR cap=1000 invariant — pushing 1001 unique messages drops the oldest entry', async () => {
    // Bind port 8787 + fire 1001 real compress calls. Each call carries
    // one unique message whose content includes a Math.random() suffix
    // so no two calls can collide on hash. After the burst, GET
    // /v1/retrieve/stats should report `entries <= 1000`.
    firstDisposable = startInProcessProxy();
    await waitFor(() => getLocalProxyState() === 'running');
    for (let i = 0; i < 1001; i++) {
      await httpRequest('POST', '/v1/compress', JSON.stringify({
        messages: [{
          role: 'user',
          content: `unique fixture #${i} rand=${Math.random()}`,
        }],
      }));
    }
    const stats = await httpRequest('GET', '/v1/retrieve/stats');
    const payload = JSON.parse(stats.body);
    expect(payload.entries).toBeLessThanOrEqual(1000);
    // We expect the absolute cap (1000) — leave a tiny slack for
    // recentCall stats unrelated to CCR.
    expect(payload.entries).toBe(1000);
  });

  it('POST /v1/retrieve stores first 200 chars of content + returns cached:true + tokenCount for the stored hash', async () => {
    // Populate CCR via /v1/compress, then retrieve via /v1/retrieve.
    // The preview must be the first 200 chars of the original content
    // (NOT the summarised/truncated form — CCR records raw input).
    firstDisposable = startInProcessProxy();
    await waitFor(() => getLocalProxyState() === 'running');
    const originalContent = 'X'.repeat(300);

    const r1 = await httpRequest('POST', '/v1/compress', JSON.stringify({
      messages: [{ role: 'user', content: originalContent }],
    }));
    const p1 = JSON.parse(r1.body);
    const storedHash = p1.ccr_hashes[0];
    expect(storedHash).toMatch(/^[0-9a-f]{16}$/);

    const r2 = await httpRequest('POST', '/v1/retrieve', JSON.stringify({ hash: storedHash }));
    const p2 = JSON.parse(r2.body);
    expect(p2.hash).toBe(storedHash);
    expect(p2.cached).toBe(true);
    expect(p2.similarity).toBe(1.0);
    expect(typeof p2.tokenCount).toBe('number');
    expect(p2.tokenCount).toBeGreaterThan(0);
    // Preview is the FIRST 200 chars of the input content with a
    // truncation marker since the input was 300 chars.
    expect(p2.content.startsWith('X'.repeat(200))).toBe(true);
    expect(p2.content).toMatch(/…\[preview\]/);
    expect(p2.content.length).toBeLessThanOrEqual(212);  // 200 + suffix bytes
  });

  it('POST /v1/retrieve returns null content + cached:false on cache miss', async () => {
    // Negate of the hit path — unknown hash returns the SDK-fallback
    // shape so consumers can disambiguate.
    firstDisposable = startInProcessProxy();
    await waitFor(() => getLocalProxyState() === 'running');
    const r = await httpRequest('POST', '/v1/retrieve', JSON.stringify({ hash: 'nonexistent-hash-0123' }));
    expect(r.status).toBe(200);
    const p = JSON.parse(r.body);
    expect(p.cached).toBe(false);
    expect(p.similarity).toBe(0);
    expect(p.content).toBeNull();
  });

  it('GET /v1/retrieve/stats reports entries count + totalOriginalTokens + zero savings (stub proxy)', async () => {
    // Wire-format invariant: /v1/retrieve/stats now exposes the
    // aggregated CCR shape (entries + token totals). Stub proxy has
    // compressedTokens === originalTokens so savingsPercent stays 0
    // by design; Phase 4 introduces hit-rate tracking.
    firstDisposable = startInProcessProxy();
    await waitFor(() => getLocalProxyState() === 'running');
    await httpRequest('POST', '/v1/compress', JSON.stringify({
      messages: [
        { role: 'user', content: 'first' },
        { role: 'user', content: 'second' },
      ],
    }));
    const r = await httpRequest('GET', '/v1/retrieve/stats');
    expect(r.status).toBe(200);
    const payload = JSON.parse(r.body);
    expect(payload.enabled).toBe(true);
    expect(payload.entries).toBe(2);
    expect(payload.totalOriginalTokens).toBeGreaterThan(0);
    // Stub proxy identity → savings metrics are 0 by design.
    expect(payload.totalCompressedTokens).toBe(payload.totalOriginalTokens);
    expect(payload.totalTokensSaved).toBe(0);
    expect(payload.savingsPercent).toBe(0);    expect(payload.hitRate).toBe(0);
  });
});

describe('in-process proxy — recent-calls ring buffer', () => {
  beforeEach(() => {
    _clearRecentCallsForTest();
  });

  it('returns an empty array when no compress calls have been recorded', () => {
    const calls = getRecentCalls();
    expect(Array.isArray(calls)).toBe(true);
    expect(calls).toEqual([]);
  });

  it('returns a fresh array each call — caller reads see a stable snapshot across calls', () => {
    _pushRecentCallForTest(_makeCallEntry(0, 100, 25));
    const baseline = getRecentCalls();
    const snapshot = getRecentCalls();
    // Fresh array reference each call.
    expect(snapshot).not.toBe(baseline);
    // But same content.
    expect(snapshot).toEqual(baseline);
    expect(snapshot).toHaveLength(baseline.length);

    // Caller-side mutation is type-forbidden at compile-time
    // (ReadonlyArray). The runtime proxy contract: re-reading yields
    // internals unaltered by caller action. Seeding a new entry must
    // grow the ring deterministically.
    _pushRecentCallForTest(_makeCallEntry(1, 100, 25));
    expect(getRecentCalls()).toHaveLength(baseline.length + 1);
  });

  it('cap=20 invariant — pushing past the cap evicts the oldest entries', () => {
    // Seed 25 entries directly via the test push accessor so the cap
    // invariant is asserted without binding port 8787 (avoids the
    // TIME_WAIT race that flaked the 25-roundtrip variant).
    for (let i = 0; i < 25; i++) {
      _pushRecentCallForTest(_makeCallEntry(i, 100, 25));
    }

    const calls = getRecentCalls();
    expect(calls.length).toBe(20);
    // Ring is FIFO-evict + append, so oldest surviving is at index 0
    // and newest at index 19. After 25 pushes of idx 0..24, the surviving
    // entries are indices 5..24 (idx 0..4 evicted).
    expect(calls[0].messageCountIn).toBe(6);    // idx=5 → idx+1=6 (oldest survivor)
    expect(calls[19].messageCountIn).toBe(25);  // idx=24 → idx+1=25 (newest)
    // Second snapshot has the same set (stable order, not re-ordered).
    const callsAgain = getRecentCalls();
    expect(callsAgain).toEqual(calls);
  });

  it('each entry carries the public-locked fields used by the quick-pick', () => {
    const entry: RecentCompressCall = _makeCallEntry(7, 8000, 2000);
    _pushRecentCallForTest(entry);

    const calls = getRecentCalls();
    expect(calls).toHaveLength(1);
    const stored = calls[0];
    // Field presence — quick-pick UI consumes these verbatim.
    expect(stored).toHaveProperty('timestamp');
    expect(stored).toHaveProperty('tokensBefore');
    expect(stored).toHaveProperty('tokensAfter');
    expect(stored).toHaveProperty('tokensSaved');
    expect(stored).toHaveProperty('compressionRatio');
    expect(stored).toHaveProperty('transformsApplied');
    expect(stored).toHaveProperty('messageCountIn');
    expect(stored).toHaveProperty('messageCountOut');
    // Numeric invariants
    expect(typeof stored.timestamp).toBe('number');
    expect(stored.tokensSaved).toBe(2000);
    expect(stored.tokensBefore).toBe(8000);
    expect(stored.tokensAfter).toBe(6000);
    expect(stored.tokensSaved).toBe(stored.tokensBefore - stored.tokensAfter);
    expect(stored.compressionRatio).toBeCloseTo(6000 / 8000);
    expect(stored.messageCountIn).toBe(8);   // _makeCallEntry idx 7 → +1
    expect(stored.transformsApplied).toEqual(['dedupe', 'truncate']);
  });
});

/**
 * Helper for the ring-buffer tests — produces a RecentCompressCall
 * with predictable values derived from `idx`. Avoids relying on a
 * live HTTP roundtrip (port 8787 TIME_WAIT across siblings).
 */
function _makeCallEntry(idx: number, tokensBefore: number, tokensSaved: number): RecentCompressCall {
    const tokensAfter = tokensBefore - tokensSaved;
    return {
        timestamp: 1_700_000_000_000 + idx,
        tokensBefore,
        tokensAfter,
        tokensSaved,
        compressionRatio: tokensBefore > 0 ? tokensAfter / tokensBefore : 1,
        transformsApplied: ['dedupe', 'truncate'],
        messageCountIn: idx + 1,
        messageCountOut: Math.max(0, idx),
    };
}
