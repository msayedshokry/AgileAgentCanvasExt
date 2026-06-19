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
import {
    startInProcessProxy,
    getManagedProxyStats,
    resetManagedProxyStats,
    _getInternalServerForTest,
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
