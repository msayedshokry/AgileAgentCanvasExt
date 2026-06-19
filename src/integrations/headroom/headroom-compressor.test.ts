/**
 * Regression guard for the Headroom compressor.
 *
 * Contract being locked:
 *  - when headroom.enabled is false, messages are returned unchanged
 *  - when headroom-ai is not installed, messages are returned unchanged
 *  - when the proxy is not running, messages are returned unchanged
 *  - when active, compress() is called with cache_align: true
 *  - compressionLevel setting (1-5) is passed as bias in compress options
 *  - when messages contain a large JSON payload, format: 'json' is passed
 *  - cumulative stats (tokensSaved, calls, ratio) accumulate across calls
 *  - a compress() failure falls back to unchanged messages
 *  - HeadroomClient.telemetry.getStats() is wired into toolTelemetry.record()
 *  - disposeHeadroomClient() closes the client and resets state
 *
 * NOTE: _primeCompressForTest() pre-sets _compressFn and _loadAttempted so
 * compressMessages skips its lazy-load path (which would call the real
 * detectHeadroom). This avoids the require.resolve-per-module scope issue
 * and ensures mockFetchOk controls the only health-check path.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock tool-telemetry ──────────────────────────────────────────────────
// Factory MUST NOT reference outer variables (vitest hoisting).

vi.mock('../../chat/tool-telemetry', () => {
  const record = vi.fn();
  return { toolTelemetry: { record } };
});

// ─── Mock headroom-ai ─────────────────────────────────────────────────────
// Factory MUST NOT reference outer variables (vitest hoisting).

vi.mock('headroom-ai', () => {
  const mockCompress = vi.fn().mockResolvedValue({
    messages: [] as any[],
    compressed: [] as any[],
    tokensBefore: 0,
    tokensAfter: 0,
    tokensSaved: 0,
    compressionRatio: 0,
    transformsApplied: [] as string[],
    ccrHashes: [] as string[],
  });

  const mockTelemetryGetStats = vi.fn().mockResolvedValue({
    enabled: true,
    totalCompressions: 42,
    totalRetrievals: 7,
    globalRetrievalRate: 0.15,
    toolSignaturesTracked: 12,
    avgCompressionRatio: 0.45,
    avgTokenReduction: 350,
  });

  const mockClientInstance = {
    health: vi.fn().mockResolvedValue({ status: 'healthy', version: '1.0.0' }),
    close: vi.fn(),
    telemetry: { getStats: mockTelemetryGetStats },
    compress: mockCompress,
  };

  return {
    compress: mockCompress,
    // Regular function (not arrow) so `new` constructability works
    HeadroomClient: vi.fn(function() { return mockClientInstance; }),
  };
});

// ─── Mock vscode ──────────────────────────────────────────────────────────

let mockHeadroomEnabled = true;
let mockCompressionLevel: number | undefined = 3;

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: vi.fn((key: string, defaultValue: any) => {
        if (key === 'headroom.enabled') return mockHeadroomEnabled ?? defaultValue;
        if (key === 'headroom.compressionLevel') return mockCompressionLevel ?? defaultValue;
        return defaultValue;
      }),
    }),
  },
}));

// ─── Global fetch mock ────────────────────────────────────────────────────

let mockFetchOk = false;
let mockFetchVersion = '1.0.0';

const mockFetch = vi.fn().mockImplementation(async () => {
  if (mockFetchOk) {
    return {
      ok: true,
      json: async () => ({ status: 'healthy', version: mockFetchVersion }),
    };
  }
  throw new Error('ECONNREFUSED');
}) as any;

(globalThis as any).fetch = mockFetch;

// Standalone simulate mock — primed via _primeSimulateForTest (avoids require() mock scope issue)
const mockSimulate = vi.fn().mockResolvedValue({
  tokensBefore: 2000,
  tokensAfter: 800,
  tokensSaved: 1200,
  estimatedSavings: { usd: 0.003, percent: 60 },
  transforms: ['cache_align', 'json_compact'],
  wasteSignals: ['repeated_greeting', 'boilerplate_license'],
});

// ─── Imports ───────────────────────────────────────────────────────────────

import * as headroomModule from 'headroom-ai';
import { toolTelemetry } from '../../chat/tool-telemetry';
import {
  compressMessages,
  getCompressionStats,
  resetCompressionStats,
  disposeHeadroomClient,
  _resetForTest,
  _setAvailabilityForTest,
  _primeCompressForTest,
  _primeClientForTest,
  _primeSimulateForTest,
} from './headroom-compressor';

// ─── Helpers ───────────────────────────────────────────────────────────────

function setEnabled(enabled: boolean) {
  mockHeadroomEnabled = enabled;
}

function setCompressionLevel(level: number | undefined) {
  mockCompressionLevel = level;
}

function setProxyRunning(running: boolean, version = '1.0.0') {
  mockFetchOk = running;
  mockFetchVersion = version;
}

/** Create a mock client via the mocked HeadroomClient constructor. */
function createMockClient(): any {
  return new (headroomModule as any).HeadroomClient();
}

/** Prime the compressor so compressMessages skips its lazy-load + health-check path. */
function initProxyRunning() {
  setProxyRunning(true);
  _resetForTest();
  _setAvailabilityForTest({
    installed: true,
    proxyRunning: true,
    version: mockFetchVersion,
    proxyUrl: 'http://localhost:8787',
  });
  _primeCompressForTest(headroomModule.compress);
  _primeSimulateForTest(mockSimulate);
  _primeClientForTest(createMockClient());
}

const sampleMessages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Write a function.' },
];

const largeJsonMessage = {
  role: 'user',
  content: JSON.stringify({
    id: 'EPIC-1',
    title: 'Build Authentication System',
    description: 'A comprehensive auth system with OAuth2, JWT, and session management.',
    stories: Array.from({ length: 50 }, (_, i) => ({
      id: `S-1.${i}`,
      title: `Story ${i}`,
      description: `Description for story ${i}. ${'lorem ipsum '.repeat(20)}`,
      acceptanceCriteria: ['AC-1', 'AC-2', 'AC-3'],
    })),
  }),
};

beforeEach(() => {
  _resetForTest();
  setEnabled(true);
  setCompressionLevel(3);
  setProxyRunning(false);
  vi.mocked(headroomModule.compress).mockClear();
  vi.mocked(headroomModule.compress).mockResolvedValue({
    messages: [{ role: 'assistant', content: 'compressed' }],
    compressed: [{ role: 'assistant', content: 'compressed' }],
    tokensBefore: 1000,
    tokensAfter: 400,
    tokensSaved: 600,
    compressionRatio: 0.6,
    transformsApplied: [],
    ccrHashes: [],
  } as any);
  vi.mocked(toolTelemetry.record).mockClear();
  resetCompressionStats();
});

afterEach(() => {
  mockFetch.mockClear();
});

// ────────────────────────────────────────────────────────────────────────────
// Disabled setting
// ────────────────────────────────────────────────────────────────────────────

describe('compressMessages — disabled setting', () => {
  it('returns messages unchanged when headroom.enabled is false', async () => {
    setEnabled(false);
    const result = await compressMessages(sampleMessages);
    expect(result.messages).toBe(sampleMessages);
    expect(result.saved).toBe(0);
    expect(result.ratio).toBe(0);
  });

  it('does not call the headroom-ai compress function when disabled', async () => {
    setEnabled(false);
    await compressMessages(sampleMessages);
    expect(headroomModule.compress).not.toHaveBeenCalled();
  });

  it('does not alter cumulative stats when disabled', async () => {
    setEnabled(false);
    await compressMessages(sampleMessages);
    const stats = getCompressionStats();
    expect(stats.totalCalls).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Proxy not running
// ────────────────────────────────────────────────────────────────────────────

describe('compressMessages — proxy not running', () => {
  it('returns messages unchanged when proxy is unreachable', async () => {
    setProxyRunning(false);
    const result = await compressMessages(sampleMessages);
    expect(result.messages).toBe(sampleMessages);
    expect(result.saved).toBe(0);
  });

  it('does not call compress when proxy is not running', async () => {
    setProxyRunning(false);
    await compressMessages(sampleMessages);
    expect(headroomModule.compress).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Compression success
// ────────────────────────────────────────────────────────────────────────────

describe('compressMessages — success', () => {
  it('calls headroom-ai compress when proxy is running', async () => {
    initProxyRunning();
    await compressMessages(sampleMessages);
    expect(headroomModule.compress).toHaveBeenCalledTimes(1);
  });

  it('passes the messages through to compress', async () => {
    initProxyRunning();
    await compressMessages(sampleMessages);
    const callArgs = vi.mocked(headroomModule.compress).mock.calls[0];
    expect(callArgs[0]).toEqual(sampleMessages);
  });

  it('passes cache_align: true in the options', async () => {
    initProxyRunning();
    await compressMessages(sampleMessages);
    const callArgs = vi.mocked(headroomModule.compress).mock.calls[0];
    expect(callArgs[1]).toMatchObject({ cache_align: true });
  });

  it('passes bias (compressionLevel) in the options', async () => {
    initProxyRunning();
    await compressMessages(sampleMessages);
    const callArgs = vi.mocked(headroomModule.compress).mock.calls[0];
    expect(callArgs[1]).toMatchObject({ bias: 3 });
  });

  it('passes bias matching the compressionLevel setting (level 5)', async () => {
    setCompressionLevel(5);
    initProxyRunning();
    await compressMessages(sampleMessages);
    const callArgs = vi.mocked(headroomModule.compress).mock.calls[0];
    expect(callArgs[1]).toMatchObject({ bias: 5 });
  });

  it('defaults bias to 3 when compressionLevel is not set', async () => {
    setCompressionLevel(undefined);
    initProxyRunning();
    await compressMessages(sampleMessages);
    const callArgs = vi.mocked(headroomModule.compress).mock.calls[0];
    // mock get() returns undefined, getCompressionLevel falls back to default 3
    expect(callArgs[1]).toMatchObject({ bias: 3 });
  });

  it('returns the compressed messages', async () => {
    initProxyRunning();
    const result = await compressMessages(sampleMessages);
    expect(result.messages).toEqual([{ role: 'assistant', content: 'compressed' }]);
  });

  it('accumulates compression stats after each call', async () => {
    initProxyRunning();
    await compressMessages(sampleMessages);
    await compressMessages(sampleMessages);

    const stats = getCompressionStats();
    expect(stats.totalCalls).toBe(2);
    expect(stats.totalTokensSaved).toBe(1200);
    expect(stats.totalTokensBefore).toBe(2000);
  });

  it('tracks the last compression ratio', async () => {
    initProxyRunning();
    await compressMessages(sampleMessages);

    const stats = getCompressionStats();
    expect(stats.lastCompressionRatio).toBe(0.6);
    expect(stats.lastSaved).toBe(600);
  });

  it('marks stats.available as true when proxy is running', async () => {
    initProxyRunning();
    const stats = getCompressionStats();
    expect(stats.available).toBe(true);
  });

  it('records telemetry via toolTelemetry after successful compress', async () => {
    initProxyRunning();
    await compressMessages(sampleMessages);
    // Wait for the fire-and-forget telemetry promise
    await vi.waitFor(() => vi.mocked(toolTelemetry.record).mock.calls.length > 0, { timeout: 2000 });

    expect(toolTelemetry.record).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(toolTelemetry.record).mock.calls[0][0];
    expect(callArgs.tool).toBe('headroom-compress');
    expect(callArgs.status).toBe('ok');
    expect(callArgs.metadata).toBeDefined();
    expect(callArgs.metadata!.tokensSaved).toBe(600);
    expect(callArgs.metadata!.compressionRatio).toBe(0.6);
    expect(callArgs.metadata!.telemetry).toBeDefined();
    expect(callArgs.metadata!.telemetry.totalCompressions).toBe(42);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// JSON routing
// ────────────────────────────────────────────────────────────────────────────

describe('compressMessages — JSON routing', () => {
  it('passes format: json when a message contains a large JSON payload', async () => {
    initProxyRunning();
    await compressMessages([...sampleMessages, largeJsonMessage]);
    const callArgs = vi.mocked(headroomModule.compress).mock.calls[0];
    expect(callArgs[1]).toHaveProperty('format', 'json');
  });

  it('does NOT pass format: json for normal text messages', async () => {
    initProxyRunning();
    await compressMessages(sampleMessages);
    const callArgs = vi.mocked(headroomModule.compress).mock.calls[0];
    expect(callArgs[1]).not.toHaveProperty('format', 'json');
  });

  it('detects JSON in fenced code blocks (```json ... ```)', async () => {
    initProxyRunning();
    const msgWithCodeFence = {
      role: 'user',
      content: 'Here is the artifact:\n```json\n' + JSON.stringify({ id: 'X', data: 'A'.repeat(2000) }) + '\n```',
    };
    await compressMessages([msgWithCodeFence]);
    const callArgs = vi.mocked(headroomModule.compress).mock.calls[0];
    expect(callArgs[1]).toHaveProperty('format', 'json');
  });

  it('does not route small JSON payloads (<=1KB) to SmartCrusher', async () => {
    initProxyRunning();
    const smallJson = { role: 'user', content: JSON.stringify({ a: 1 }) };
    await compressMessages([smallJson]);
    const callArgs = vi.mocked(headroomModule.compress).mock.calls[0];
    expect(callArgs[1]).not.toHaveProperty('format', 'json');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Compress failure falls back
// ────────────────────────────────────────────────────────────────────────────

describe('compressMessages — failure fallback', () => {
  it('returns messages unchanged when compress throws', async () => {
    initProxyRunning();
    vi.mocked(headroomModule.compress).mockRejectedValueOnce(new Error('compression error'));
    const result = await compressMessages(sampleMessages);
    expect(result.messages).toBe(sampleMessages);
    expect(result.saved).toBe(0);
  });

  it('does not update stats on compress failure', async () => {
    initProxyRunning();
    vi.mocked(headroomModule.compress).mockRejectedValueOnce(new Error('compression error'));
    await compressMessages(sampleMessages);
    const stats = getCompressionStats();
    expect(stats.totalCalls).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Stats reset
// ────────────────────────────────────────────────────────────────────────────

describe('resetCompressionStats', () => {
  it('resets all cumulative counters to zero', async () => {
    initProxyRunning();
    await compressMessages(sampleMessages);
    await compressMessages(sampleMessages);

    resetCompressionStats();
    const stats = getCompressionStats();
    expect(stats.totalCalls).toBe(0);
    expect(stats.totalTokensSaved).toBe(0);
    expect(stats.totalTokensBefore).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// disposeHeadroomClient
// ────────────────────────────────────────────────────────────────────────────

describe('disposeHeadroomClient', () => {
  it('closes the HeadroomClient and nulls out state', async () => {
    initProxyRunning();

    // Grab a reference to the mock client before dispose destroys it
    const clientBefore = (headroomModule as any).HeadroomClient();
    await compressMessages(sampleMessages);

    disposeHeadroomClient();

    // Verify the client's close() was called
    expect(clientBefore.close).toHaveBeenCalled();
  });

  it('re-initializes cleanly after dispose + reset', async () => {
    initProxyRunning();
    await compressMessages(sampleMessages);

    disposeHeadroomClient();
    _resetForTest();

    // Re-prime so the lazy-load re-creates client + compress
    initProxyRunning();
    const result = await compressMessages(sampleMessages);
    expect(result.saved).toBe(600);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// simulateMessages
// ────────────────────────────────────────────────────────────────────────────

import { simulateMessages } from './headroom-compressor';

describe('simulateMessages', () => {
  beforeEach(() => {
    vi.mocked(mockSimulate).mockClear();
  });

  it('returns null when headroom.enabled is false', async () => {
    setEnabled(false);
    const result = await simulateMessages(sampleMessages);
    expect(result).toBeNull();
  });

  it('returns null when proxy is not running', async () => {
    setProxyRunning(false);
    _resetForTest();
    _setAvailabilityForTest({ installed: false, proxyRunning: false });
    const result = await simulateMessages(sampleMessages);
    expect(result).toBeNull();
  });

  it('calls headroom.simulate when available', async () => {
    initProxyRunning();
    const result = await simulateMessages(sampleMessages);
    expect(mockSimulate).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result!.tokensSaved).toBe(1200);
    expect(result!.transforms).toContain('cache_align');
    expect(result!.wasteSignals).toHaveLength(2);
  });

  it('passes model hint to simulate', async () => {
    initProxyRunning();
    await simulateMessages(sampleMessages, 'gpt-4');
    expect(mockSimulate).toHaveBeenCalledWith(sampleMessages, { model: 'gpt-4' });
  });

  it('returns null on simulate failure', async () => {
    initProxyRunning();
    vi.mocked(mockSimulate).mockRejectedValueOnce(new Error('simulate error'));
    const result = await simulateMessages(sampleMessages);
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// retrieveFromCCR
// ────────────────────────────────────────────────────────────────────────────

import { retrieveFromCCR } from './headroom-compressor';

describe('retrieveFromCCR', () => {
  it('returns null when _client is not set', async () => {
    _resetForTest();
    const result = await retrieveFromCCR('abc123');
    expect(result).toBeNull();
  });

  it('calls client.retrieve(hash) when client is available', async () => {
    initProxyRunning();
    const client = createMockClient();
    client.retrieve = vi.fn().mockResolvedValue({ original: 'decompressed content', hash: 'abc123' });
    _primeClientForTest(client);

    const result = await retrieveFromCCR('abc123');
    expect(client.retrieve).toHaveBeenCalledWith('abc123', undefined);
    expect(result).toEqual({ original: 'decompressed content', hash: 'abc123' });
  });

  it('passes query option to client.retrieve', async () => {
    initProxyRunning();
    const client = createMockClient();
    client.retrieve = vi.fn().mockResolvedValue({ original: 'filtered' });
    _primeClientForTest(client);

    const result = await retrieveFromCCR('abc123', 'keyword');
    expect(client.retrieve).toHaveBeenCalledWith('abc123', { query: 'keyword' });
    expect(result).toEqual({ original: 'filtered' });
  });

  it('returns null on retrieve failure', async () => {
    initProxyRunning();
    const client = createMockClient();
    client.retrieve = vi.fn().mockRejectedValue(new Error('not found'));
    _primeClientForTest(client);

    const result = await retrieveFromCCR('abc123');
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getCCRStats
// ────────────────────────────────────────────────────────────────────────────

import { getCCRStats } from './headroom-compressor';

describe('getCCRStats', () => {
  it('returns null when _client is not set', async () => {
    _resetForTest();
    const result = await getCCRStats();
    expect(result).toBeNull();
  });

  it('calls client.getCCRStats() when client is available', async () => {
    initProxyRunning();
    const client = createMockClient();
    client.getCCRStats = vi.fn().mockResolvedValue({ entries: 10, totalSize: 5000 });
    _primeClientForTest(client);

    const result = await getCCRStats();
    expect(client.getCCRStats).toHaveBeenCalled();
    expect(result).toEqual({ entries: 10, totalSize: 5000 });
  });

  it('returns null on getCCRStats failure', async () => {
    initProxyRunning();
    const client = createMockClient();
    client.getCCRStats = vi.fn().mockRejectedValue(new Error('stats error'));
    _primeClientForTest(client);

    const result = await getCCRStats();
    expect(result).toBeNull();
  });
});
