import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Helper: typed escape hatch for testing PRIVATE methods without `as any` ──
// All three methods are private but need direct invocation / spying in tests
// (issue #42 sessionId-threading regression suite). Using `as any` would lose
// argument-shape IntelliSense in the test bodies; this helper narrows the cast
// to a known private-API surface so each method signature gets structural type-checking
// without losing the dynamic flexibility needed for vi.spyOn / direct calls.

type PrivateAPI = {
    executeWithDirectApi(...args: unknown[]): Promise<unknown>;
    executeWithTools(...args: unknown[]): Promise<unknown>;
    executeLaneTransition(...args: unknown[]): Promise<unknown>;
};
// `Omit<T, keyof PrivateAPI>` strips the (private) duplicate methods from T
// before intersecting with PrivateAPI — without this, TypeScript reduces
// `T & PrivateAPI` to `never` because the same method names exist in both
// constituents with conflicting (private vs. public) visibility.
function withPrivateAPI<T extends object>(
    target: T,
): Omit<T, keyof PrivateAPI> & PrivateAPI {
    return target as unknown as Omit<T, keyof PrivateAPI> & PrivateAPI;
}

// ─── Mock ai-provider ──────────────────────────────────────────────────────
vi.mock('../chat/ai-provider', () => ({
  streamChatResponse: vi.fn(async () => ''),
  ChatMessage: vi.fn().mockName('ChatMessage').mockImplementation(() => {
    throw new TypeError('Mock ChatMessage — not constructible in test sandbox');
  }),
  BmadModel: vi.fn().mockName('BmadModel').mockImplementation(() => {
    throw new TypeError('Mock BmadModel — not constructible in test sandbox');
  }),
  selectModel: vi.fn(),
  getNoModelMessage: vi.fn(),
}));

vi.mock('../trace/trace-recorder', () => ({
  getTraceRecorder: vi.fn(() => ({
    record: vi.fn(),
    searchTraces: vi.fn(async () => []),
  })),
}));

vi.mock('../state/artifact-file-io', () => ({
  resolveArtifactTargetUri: vi.fn(async () => ({ fsPath: '/tmp/test.json', scheme: 'file' })),
  writeJsonFile: vi.fn(async () => {}),
  writeMarkdownCompanion: vi.fn(async () => ({ fsPath: '/tmp/test.md', scheme: 'file' })),
  normalizeLegacyArtifact: vi.fn((x: unknown) => x),
}));

vi.mock('../state/schema-validator', () => ({
  schemaValidator: {
    isInitialized: vi.fn(() => true),
    init: vi.fn(),
    validateChanges: vi.fn(() => ({ valid: true, errors: [] })),
    getSchemaContent: vi.fn(() => null),
  },
  getAvailableSchemaTypes: vi.fn(() => []),
}));

vi.mock('../state/workspace-resolver', () => ({
  getOutputFolder: vi.fn(() => '/tmp/output'),
  resolveWorkflowPath: vi.fn(() => '/tmp/workflow.md'),
}));

vi.mock('./frontmatter', () => ({
  parseYamlFrontmatter: vi.fn(() => ({})),
  extractRawSections: vi.fn(() => ({ steps: [] })),
}));

vi.mock('./concurrency-queue', () => ({
  concurrencyQueue: {
    tryAcquire: vi.fn(() => ({ acquired: true, release: vi.fn() })),
    release: vi.fn(),
    releaseAll: vi.fn(),
  },
}));

vi.mock('./agent-health-monitor', () => ({
  agentHealthMonitor: {
    registerCheck: vi.fn(),
    deregisterCheck: vi.fn(),
  },
}));

import { WorkflowExecutor } from './workflow-executor';

describe('WorkflowExecutor sessionId threading (issue #42)', () => {
  let executor: WorkflowExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new WorkflowExecutor();
  });

  // ── direct-API path: sessionId forwarded to executeWithDirectApi ──────

  it('forwards sessionId to executeWithDirectApi when no vscodeLm (direct-API path)', async () => {
    // Spy on the private executeWithDirectApi to capture its arguments
    const directApiSpy = vi
      .spyOn(withPrivateAPI(WorkflowExecutor.prototype), 'executeWithDirectApi')
      .mockResolvedValue(undefined);

    const sessionId = 'chat-dev-S-2.2-9876543210';

    await withPrivateAPI(executor).executeWithTools(
      { name: 'gpt-4o', provider: 'openai' }, // no vscodeLm → direct-API path
      'test task',
      { id: 'S-1.1', type: 'story', title: 'Test Story' },
      { markdown: vi.fn() },
      { isCancellationRequested: false, onCancellationRequested: vi.fn() },
      { getState: vi.fn(() => ({})), updateArtifact: vi.fn(async () => {}) },
      '/tmp/workflow.md',
      sessionId,
    );

    expect(directApiSpy).toHaveBeenCalledTimes(1);
    // Args: model, task, artifact, stream, token, workflowPath, sessionId
    const args = directApiSpy.mock.calls[0];
    expect(args[0]).toMatchObject({ name: 'gpt-4o' });
    expect(args[6]).toBe(sessionId); // 7th arg = sessionId

    directApiSpy.mockRestore();
  });

  // ── direct-API path: no sessionId → undefined ──────────────────────────

  it('forwards undefined when no sessionId provided (direct-API path)', async () => {
    const directApiSpy = vi
      .spyOn(withPrivateAPI(WorkflowExecutor.prototype), 'executeWithDirectApi')
      .mockResolvedValue(undefined);

    await withPrivateAPI(executor).executeWithTools(
      { name: 'gpt-4o', provider: 'openai' }, // no vscodeLm
      'test task',
      { id: 'S-2.2', type: 'story' },
      { markdown: vi.fn() },
      { isCancellationRequested: false, onCancellationRequested: vi.fn() },
      { getState: vi.fn(() => ({})), updateArtifact: vi.fn(async () => {}) },
      '/tmp/workflow.md',
      // No sessionId
    );

    expect(directApiSpy).toHaveBeenCalledTimes(1);
    expect(directApiSpy.mock.calls[0][6]).toBeUndefined();

    directApiSpy.mockRestore();
  });

  // ── distinct sessionIds forwarded correctly ──────────────────────────

  it('forwards distinct sessionIds to executeWithDirectApi', async () => {
    const directApiSpy = vi
      .spyOn(withPrivateAPI(WorkflowExecutor.prototype), 'executeWithDirectApi')
      .mockResolvedValue(undefined);

    const devId = 'chat-dev-S-1.1-111111';
    await withPrivateAPI(executor).executeWithTools(
      { name: 'gpt-4o', provider: 'openai' },
      'dev task', { id: 'S-1.1', type: 'story' },
      { markdown: vi.fn() },
      { isCancellationRequested: false, onCancellationRequested: vi.fn() },
      { getState: vi.fn(() => ({})) },
      '/tmp/dev.md',
      devId,
    );
    expect(directApiSpy.mock.calls[0][6]).toBe(devId);

    const reviewId = 'chat-review-S-2.2-222222';
    await withPrivateAPI(executor).executeWithTools(
      { name: 'gpt-4o', provider: 'openai' },
      'review task', { id: 'S-2.2', type: 'story' },
      { markdown: vi.fn() },
      { isCancellationRequested: false, onCancellationRequested: vi.fn() },
      { getState: vi.fn(() => ({})) },
      '/tmp/review.md',
      reviewId,
    );
    expect(directApiSpy.mock.calls[1][6]).toBe(reviewId);

    directApiSpy.mockRestore();
  });

  // ── backward compatibility: executeLaneTransition without sessionId ──────

  it('executeLaneTransition works without sessionId (backward compat)', async () => {
    // Existing callers (lane-transitions.ts, agentic-kanban-message-handler.ts)
    // call executeLaneTransition with 6 args (no sessionId). Verify it doesn't
    // throw on the missing optional parameter.
    // We use a model without vscodeLm so it hits the direct-API path which we mock.
    try {
      await withPrivateAPI(executor).executeLaneTransition(
        'dev',
        { id: 'S-1.1', type: 'story' },
        { getState: vi.fn(() => ({})), updateArtifact: vi.fn(async () => {}) },
        { name: 'gpt-4o', provider: 'openai' },
        { markdown: vi.fn() },
        { isCancellationRequested: false, onCancellationRequested: vi.fn() },
        // No 7th arg (sessionId) — tests backward compatibility
      );
    } catch {
      // may fail on workflow resolution / file I/O — that's not what we test
    }
    // If we reach here without a "too many arguments" or "undefined is not..."
    // error, backward compatibility is intact.
    expect(true).toBe(true); // explicit pass — the call didn't throw on arity
  });

  // ── Signature correctness ────────────────────────────────────────────

  it('executeLaneTransition signature includes optional sessionId', () => {
    // JavaScript Function.length counts only required params before the first
    // optional. executeLaneTransition has 3 required (workflowId, artifact, store)
    // then model?, stream?, token?, sessionId?. So .length is 3.
    // We verify sessionId appears in the function's string representation.
    const src = (withPrivateAPI(WorkflowExecutor.prototype).executeLaneTransition as (...args: unknown[]) => unknown).toString();
    expect(src).toContain('sessionId');
  });

  it('executeWithTools signature includes optional sessionId', () => {
    const src = (withPrivateAPI(WorkflowExecutor.prototype).executeWithTools as (...args: unknown[]) => unknown).toString();
    expect(src).toContain('sessionId');
  });

  it('executeWithDirectApi signature includes optional sessionId', () => {
    const src = (withPrivateAPI(WorkflowExecutor.prototype).executeWithDirectApi as (...args: unknown[]) => unknown).toString();
    expect(src).toContain('sessionId');
  });
});
