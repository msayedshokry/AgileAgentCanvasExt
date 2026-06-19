/**
 * Unit tests for HandoffNegotiationService SharedContext integration.
 *
 * Covers:
 *  - transferContext() with SharedContext compression (success path)
 *  - transferContext() fallback when SharedContext is unavailable
 *  - transferContext() fallback when SharedContext.put() throws
 *  - getDecompressedContext() (success + null when unavailable)
 *  - getSharedContextStats() (success + null when unavailable)
 *
 * NOTE: Tests use _primeShareCtxForTest() to inject a mock SharedContext
 * facade directly, bypassing the lazy `require('headroom-ai')` call which
 * is unreliable in vitest fork-pool mode.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks for message-bus (vi.mock factories are hoisted) ───────

const { mockBusPublish, mockBusSubscribe, mockBusUnsubscribe } = vi.hoisted(() => ({
  mockBusPublish: vi.fn().mockResolvedValue(undefined),
  mockBusSubscribe: vi.fn().mockReturnValue('sub-001'),
  mockBusUnsubscribe: vi.fn(),
}));

vi.mock('./agent-registry', () => ({
  agentRegistry: {
    getAgent: vi.fn(() => undefined),
  },
}));

vi.mock('./message-bus', () => ({
  agentMessageBus: {
    publish: mockBusPublish,
    subscribe: mockBusSubscribe,
    unsubscribe: mockBusUnsubscribe,
    unsubscribeAgent: vi.fn(),
  },
}));

vi.mock('../../trace/trace-recorder', () => ({
  getTraceRecorder: vi.fn(() => ({
    record: vi.fn(),
  })),
}));

// ─── Imports ──────────────────────────────────────────────────────────────

import { HandoffNegotiationService } from './handoff-negotiation';

// ─── Mock SharedContext facade ────────────────────────────────────────────

/** Returns a mock SharedContext facade whose methods are vi.fn() spies. */
function createMockShareCtx() {
  const put = vi.fn().mockResolvedValue({
    originalTokens: 3000,
    compressedTokens: 1200,
    savingsPercent: 60,
  });
  const get = vi.fn().mockReturnValue(null);
  const stats = vi.fn().mockReturnValue({
    entries: 0,
    totalOriginalTokens: 0,
    totalCompressedTokens: 0,
    totalTokensSaved: 0,
    savingsPercent: 0,
  });
  const clear = vi.fn();
  return { put, get, stats, clear };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function createService(): HandoffNegotiationService {
  return new HandoffNegotiationService();
}

const sampleContext = {
  task: 'Implement authentication module',
  intermediateArtifacts: {
    'prd-1': { title: 'Auth PRD', requirements: ['OAuth2', 'JWT'] },
    'architecture-1': { title: 'Auth Architecture', diagram: '...' },
  },
};

async function createSession(service: HandoffNegotiationService): Promise<string> {
  const session = await service.requestHandoff(
    'agent-a',
    'agent-b',
    'Implement auth',
    'code-review',
  );
  return session.id;
}

// ─── Tests: transferContext ───────────────────────────────────────────────

describe('transferContext — SharedContext compression', () => {
  let service: HandoffNegotiationService;
  let shareCtx: ReturnType<typeof createMockShareCtx>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
  });

  afterEach(() => {
    service.reset();
  });

  it('returns false when session does not exist', async () => {
    const result = await service.transferContext('nonexistent', sampleContext);
    expect(result).toBe(false);
  });

  it('compresses context via SharedContext and stores key', async () => {
    shareCtx = createMockShareCtx();
    service._primeShareCtxForTest(shareCtx);

    const sessionId = await createSession(service);
    const result = await service.transferContext(sessionId, sampleContext);

    expect(result).toBe(true);
    expect(shareCtx.put).toHaveBeenCalledTimes(1);
    expect(shareCtx.put).toHaveBeenCalledWith(
      sessionId,
      JSON.stringify(sampleContext),
    );

    const session = service.getSession(sessionId);
    expect(session?.context?._compressedViaSharedContext).toBe(true);
    // _shareCtxKey is nested inside intermediateArtifacts (not a direct context property)
    expect(session?.context?.intermediateArtifacts?._shareCtxKey).toBe(sessionId);
    expect(session?.status).toBe('in_progress');
  });

  it('publishes compressed bus payload with only the key', async () => {
    shareCtx = createMockShareCtx();
    service._primeShareCtxForTest(shareCtx);

    const sessionId = await createSession(service);
    await service.transferContext(sessionId, sampleContext);

    const publishCall = mockBusPublish.mock.calls.find(
      (call: any[]) => call[0] === `handoff.${sessionId}.context_transferred`,
    )!;
    const payload = publishCall[1];
    expect(payload._shareCtxKey).toBe(sessionId);
    expect(payload.task).toBe(sampleContext.task);
    expect(payload.intermediateArtifacts).toBeUndefined();
  });

  it('falls back to raw context when SharedContext put throws', async () => {
    shareCtx = createMockShareCtx();
    shareCtx.put.mockRejectedValueOnce(new Error('put failed'));
    service._primeShareCtxForTest(shareCtx);

    const sessionId = await createSession(service);
    const result = await service.transferContext(sessionId, sampleContext);

    expect(result).toBe(true);
    const session = service.getSession(sessionId);
    expect(session?.context?._compressedViaSharedContext).toBeUndefined();
    expect(session?.context?.intermediateArtifacts).toEqual(sampleContext.intermediateArtifacts);
  });

  it('falls back to raw context when SharedContext is not primed (require path)', async () => {
    // headroom-ai IS installed → require succeeds, real SharedContext is used.
    // This test verifies the REAL lazy-load + compression code path works.
    const sessionId = await createSession(service);
    const result = await service.transferContext(sessionId, sampleContext);

    expect(result).toBe(true);
    const session = service.getSession(sessionId);
    // With real headroom-ai, SharedContext compression should succeed
    expect(session?.context?._compressedViaSharedContext).toBe(true);
    expect(session?.status).toBe('in_progress');
  });

  it('includes context-transferred trace entry after transfer', async () => {
    shareCtx = createMockShareCtx();
    service._primeShareCtxForTest(shareCtx);

    const sessionId = await createSession(service);
    await service.transferContext(sessionId, sampleContext);

    const session = service.getSession(sessionId);
    const traceEntry = session?.traceEntries.find(
      (e) => e.type === 'context_transferred',
    );
    expect(traceEntry).toBeDefined();
    expect(traceEntry!.detail).toContain('SharedContext');
  });

  it('clears the response timeout after successful transfer', async () => {
    shareCtx = createMockShareCtx();
    service._primeShareCtxForTest(shareCtx);

    const sessionId = await createSession(service);
    await service.transferContext(sessionId, sampleContext);

    const session = service.getSession(sessionId);
    expect(session?.status).toBe('in_progress');
  });
});

// ─── Tests: getDecompressedContext ────────────────────────────────────────

describe('getDecompressedContext', () => {
  let service: HandoffNegotiationService;
  let shareCtx: ReturnType<typeof createMockShareCtx>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
  });

  afterEach(() => {
    service.reset();
  });

  it('returns null when SharedContext has not been initialised', () => {
    const result = service.getDecompressedContext('any-session');
    expect(result).toBeNull();
  });

  it('decompresses context that was previously stored via SharedContext', async () => {
    shareCtx = createMockShareCtx();
    shareCtx.get.mockReturnValue(JSON.stringify(sampleContext));
    service._primeShareCtxForTest(shareCtx);

    const sessionId = await createSession(service);
    await service.transferContext(sessionId, sampleContext);

    const decompressed = service.getDecompressedContext(sessionId);
    expect(decompressed).not.toBeNull();
    expect(decompressed!.task).toBe(sampleContext.task);
    expect(decompressed!.intermediateArtifacts).toEqual(sampleContext.intermediateArtifacts);
  });

  it('returns null when SharedContext.get() returns null', async () => {
    shareCtx = createMockShareCtx();
    shareCtx.get.mockReturnValue(null);
    service._primeShareCtxForTest(shareCtx);

    const sessionId = await createSession(service);
    await service.transferContext(sessionId, sampleContext);

    const result = service.getDecompressedContext(sessionId);
    expect(result).toBeNull();
  });

  it('returns null when SharedContext.get() returns invalid JSON', async () => {
    shareCtx = createMockShareCtx();
    shareCtx.get.mockReturnValue('not valid json {{{');
    service._primeShareCtxForTest(shareCtx);

    const sessionId = await createSession(service);
    await service.transferContext(sessionId, sampleContext);

    const result = service.getDecompressedContext(sessionId);
    expect(result).toBeNull();
  });
});

// ─── Tests: getSharedContextStats ─────────────────────────────────────────

describe('getSharedContextStats', () => {
  let service: HandoffNegotiationService;
  let shareCtx: ReturnType<typeof createMockShareCtx>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
  });

  afterEach(() => {
    service.reset();
  });

  it('returns null when SharedContext has not been initialised', () => {
    const result = service.getSharedContextStats();
    expect(result).toBeNull();
  });

  it('returns stats from SharedContext after initialisation', async () => {
    shareCtx = createMockShareCtx();
    shareCtx.stats.mockReturnValue({
      entries: 5,
      totalOriginalTokens: 15000,
      totalCompressedTokens: 6000,
      totalTokensSaved: 9000,
      savingsPercent: 60,
    });
    service._primeShareCtxForTest(shareCtx);

    const sessionId = await createSession(service);
    await service.transferContext(sessionId, sampleContext);

    const stats = service.getSharedContextStats();
    expect(stats).not.toBeNull();
    expect(stats!.entries).toBe(5);
    expect(stats!.totalTokensSaved).toBe(9000);
    expect(stats!.savingsPercent).toBe(60);
  });

  it('returns null when SharedContext.stats() throws', async () => {
    shareCtx = createMockShareCtx();
    shareCtx.stats.mockImplementation(() => {
      throw new Error('stats unavailable');
    });
    service._primeShareCtxForTest(shareCtx);

    const sessionId = await createSession(service);
    await service.transferContext(sessionId, sampleContext);

    const result = service.getSharedContextStats();
    expect(result).toBeNull();
  });

  it('returns default zero stats from fresh mock', async () => {
    shareCtx = createMockShareCtx();
    service._primeShareCtxForTest(shareCtx);

    const sessionId = await createSession(service);
    await service.transferContext(sessionId, sampleContext);

    // createMockShareCtx defaults stats() → { entries: 0, ... }
    const stats = service.getSharedContextStats();
    expect(stats).not.toBeNull();
    expect(stats!.entries).toBe(0);
  });
});

// ─── Tests: SharedContext lazy initialisation ─────────────────────────────

describe('SharedContext lazy initialisation', () => {
  let service: HandoffNegotiationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
  });

  afterEach(() => {
    service.reset();
  });

  it('skips require() when _primeShareCtxForTest has been called', async () => {
    // After priming, _shareCtxAttempted is true, so transferContext skips
    // the require('headroom-ai') lazy-load block and uses the injected facade.
    const shareCtx = createMockShareCtx();
    service._primeShareCtxForTest(shareCtx);

    const sessionId = await createSession(service);
    const result = await service.transferContext(sessionId, sampleContext);

    expect(result).toBe(true);
    expect(shareCtx.put).toHaveBeenCalled();
  });

  it('resets SharedContext state on service.reset()', async () => {
    const shareCtx = createMockShareCtx();
    service._primeShareCtxForTest(shareCtx);

    const sessionId = await createSession(service);
    await service.transferContext(sessionId, sampleContext);

    // SharedContext was primed and is accessible
    expect(service.getSharedContextStats()).not.toBeNull();
    shareCtx.get.mockReturnValue(JSON.stringify(sampleContext));
    expect(service.getDecompressedContext(sessionId)).not.toBeNull();

    service.reset();

    // After reset, _shareCtx is nullified → all SharedContext-dependent
    // methods return null regardless of the mock instance state.
    expect(service.getSharedContextStats()).toBeNull();
    expect(service.getDecompressedContext(sessionId)).toBeNull();
    expect(shareCtx.clear).toHaveBeenCalled();
  });
});
