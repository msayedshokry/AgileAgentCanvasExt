// ─── Unit tests: HarnessEngine (policy evaluation edge cases) ────────────────
// Covers: evaluate() phase filtering, artifactType scoping, auto-fix paths,
// continuous evaluation, findings events, trace recording, registration.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HarnessEngine, harnessEngine } from './policy-engine';
import type { HarnessPolicy, EvaluationContext } from './policy-engine';
import { getTraceRecorder } from '../trace/trace-recorder';
import { schemaValidator } from '../state/schema-validator';
import { repairDataWithSchema } from '../state/schema-repair-engine';
import { harnessFeedback } from './harness-feedback';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../state/schema-validator', () => ({
  schemaValidator: {
    validateChanges: vi.fn(),
    getSchemaContent: vi.fn(),
  },
}));

vi.mock('../state/schema-repair-engine', () => ({
  repairDataWithSchema: vi.fn(),
}));

vi.mock('../trace/trace-recorder', () => ({
  getTraceRecorder: vi.fn(() => ({
    record: vi.fn(),
    searchTraces: vi.fn(),
  })),
}));

vi.mock('./harness-feedback', () => ({
  harnessFeedback: {
    recordEvaluation: vi.fn(),
    getFeedbackForArtifact: vi.fn(() => null),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    artifactType: 'story',
    artifactId: 'S-1',
    artifact: { id: 'S-1', type: 'story', title: 'Test Story' },
    ...overrides,
  };
}

function makePassingPolicy(overrides: Partial<HarnessPolicy> = {}): HarnessPolicy {
  return {
    id: overrides.id ?? 'pass-policy',
    name: 'Passing Policy',
    description: 'Always passes',
    type: 'pre-flight',
    severity: 'blocking',
    evaluate: vi.fn(async () => null),
    ...overrides,
  };
}

function makeFailingPolicy(overrides: Partial<HarnessPolicy> = {}): HarnessPolicy {
  return {
    id: overrides.id ?? 'fail-policy',
    name: 'Failing Policy',
    description: 'Always fails',
    type: 'pre-flight',
    severity: 'blocking',
    evaluate: vi.fn(async () => ['failure reason']),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase filtering
// ═══════════════════════════════════════════════════════════════════════════════

describe('HarnessEngine.evaluate — phase filtering', () => {
  it('evaluates only pre-flight policies when phase is pre-flight', async () => {
    const engine = new HarnessEngine();
    const preFlight = makePassingPolicy({ id: 'pre', type: 'pre-flight' });
    const postFlight = makePassingPolicy({ id: 'post', type: 'post-flight' });
    const continuous = makePassingPolicy({ id: 'cont', type: 'continuous' });
    engine.registerPolicy(preFlight);
    engine.registerPolicy(postFlight);
    engine.registerPolicy(continuous);

    const results = await engine.evaluate(makeContext(), 'pre-flight');

    expect(results).toHaveLength(1);
    expect(results[0].policyId).toBe('pre');
  });

  it('evaluates only post-flight policies when phase is post-flight', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makePassingPolicy({ id: 'pre', type: 'pre-flight' }));
    engine.registerPolicy(makePassingPolicy({ id: 'post', type: 'post-flight' }));
    engine.registerPolicy(makePassingPolicy({ id: 'cont', type: 'continuous' }));

    const results = await engine.evaluate(makeContext(), 'post-flight');

    expect(results).toHaveLength(1);
    expect(results[0].policyId).toBe('post');
  });

  it('evaluates only continuous policies when phase is continuous', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makePassingPolicy({ id: 'pre', type: 'pre-flight' }));
    engine.registerPolicy(makePassingPolicy({ id: 'post', type: 'post-flight' }));
    engine.registerPolicy(makePassingPolicy({ id: 'cont', type: 'continuous' }));

    const results = await engine.evaluate(makeContext(), 'continuous');

    expect(results).toHaveLength(1);
    expect(results[0].policyId).toBe('cont');
  });

  it('returns empty results when no policies match the phase', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makePassingPolicy({ id: 'pre', type: 'pre-flight' }));

    const results = await engine.evaluate(makeContext(), 'post-flight');

    expect(results).toEqual([]);
  });

  it('returns empty results when no policies are registered', async () => {
    const engine = new HarnessEngine();

    const results = await engine.evaluate(makeContext(), 'pre-flight');

    expect(results).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ArtifactType filtering
// ═══════════════════════════════════════════════════════════════════════════════

describe('HarnessEngine.evaluate — artifactType filtering', () => {
  it('evaluates policy with matching artifactType', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makePassingPolicy({
      id: 'story-only',
      type: 'pre-flight',
      artifactType: 'story',
    }));

    const results = await engine.evaluate(
      makeContext({ artifactType: 'story' }),
      'pre-flight',
    );

    expect(results).toHaveLength(1);
    expect(results[0].policyId).toBe('story-only');
  });

  it('skips policy with non-matching artifactType', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makePassingPolicy({
      id: 'epic-only',
      type: 'pre-flight',
      artifactType: 'epic',
    }));

    const results = await engine.evaluate(
      makeContext({ artifactType: 'story' }),
      'pre-flight',
    );

    expect(results).toEqual([]);
  });

  it('evaluates policy without artifactType for any artifact (universal)', async () => {
    const engine = new HarnessEngine();
    // No artifactType → applies to all artifact types
    const universal = makePassingPolicy({ id: 'universal', type: 'pre-flight' });
    delete (universal as any).artifactType;
    engine.registerPolicy(universal);

    const results = await engine.evaluate(
      makeContext({ artifactType: 'epic' }),
      'pre-flight',
    );

    expect(results).toHaveLength(1);
    expect(results[0].policyId).toBe('universal');
  });

  it('mixes universal + scoped policies correctly', async () => {
    const engine = new HarnessEngine();
    const universal = makePassingPolicy({ id: 'universal', type: 'pre-flight' });
    delete (universal as any).artifactType;
    engine.registerPolicy(universal);
    engine.registerPolicy(makePassingPolicy({
      id: 'story-check',
      type: 'pre-flight',
      artifactType: 'story',
    }));
    engine.registerPolicy(makePassingPolicy({
      id: 'epic-only',
      type: 'pre-flight',
      artifactType: 'epic',
    }));

    const results = await engine.evaluate(
      makeContext({ artifactType: 'story' }),
      'pre-flight',
    );

    // universal + story-check, not epic-only
    expect(results).toHaveLength(2);
    const ids = results.map(r => r.policyId).sort();
    expect(ids).toEqual(['story-check', 'universal']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Evaluation results
// ═══════════════════════════════════════════════════════════════════════════════

describe('HarnessEngine.evaluate — evaluation results', () => {
  it('sets passed=true when policy returns null (no failures)', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makePassingPolicy({ id: 'ok', type: 'pre-flight' }));

    const results = await engine.evaluate(makeContext(), 'pre-flight');

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].failures).toEqual([]);
  });

  it('sets passed=false when policy returns failures array', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makeFailingPolicy({ id: 'bad', type: 'pre-flight' }));

    const results = await engine.evaluate(makeContext(), 'pre-flight');

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].failures).toEqual(['failure reason']);
  });

  it('sets passed=true when policy returns empty failures array', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy({
      id: 'empty-fail',
      name: 'Empty Fail',
      description: 'Returns empty array',
      type: 'pre-flight',
      severity: 'blocking',
      evaluate: vi.fn(async () => []),
    });

    const results = await engine.evaluate(makeContext(), 'pre-flight');

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it('includes fixed=false and no fixedArtifact for non-auto-fixing policies', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makeFailingPolicy({ id: 'no-fix', type: 'pre-flight' }));

    const results = await engine.evaluate(makeContext(), 'pre-flight');

    expect(results[0].fixed).toBe(false);
    expect(results[0].fixedArtifact).toBeUndefined();
  });

  it('includes severity from policy definition', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makeFailingPolicy({
      id: 'adv',
      type: 'pre-flight',
      severity: 'advisory',
    }));

    const results = await engine.evaluate(makeContext(), 'pre-flight');

    expect(results[0].severity).toBe('advisory');
  });

  it('includes ISO timestamp', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makePassingPolicy({ id: 'time', type: 'pre-flight' }));

    const results = await engine.evaluate(makeContext(), 'pre-flight');

    expect(results[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('returns results for multiple policies ordered by registration', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makeFailingPolicy({ id: 'first', type: 'pre-flight' }));
    engine.registerPolicy(makePassingPolicy({ id: 'second', type: 'pre-flight' }));
    engine.registerPolicy(makeFailingPolicy({ id: 'third', type: 'pre-flight', severity: 'advisory' }));

    const results = await engine.evaluate(makeContext(), 'pre-flight');

    expect(results).toHaveLength(3);
    expect(results[0].policyId).toBe('first');
    expect(results[1].policyId).toBe('second');
    expect(results[2].policyId).toBe('third');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Auto-fix
// ═══════════════════════════════════════════════════════════════════════════════

describe('HarnessEngine.evaluate — auto-fix', () => {
  it('calls autoFix when policy has failures and autoFix is defined', async () => {
    const autoFix = vi.fn(async () => ({ ok: true, data: { id: 'S-1', title: 'Fixed' } }));
    const engine = new HarnessEngine();
    engine.registerPolicy({
      id: 'auto-fixable',
      name: 'Auto-fixable',
      description: 'Can auto-fix',
      type: 'pre-flight',
      severity: 'blocking',
      evaluate: vi.fn(async () => ['fail']),
      autoFix,
    });

    await engine.evaluate(makeContext(), 'pre-flight');

    expect(autoFix).toHaveBeenCalledTimes(1);
  });

  it('sets fixed=true when autoFix succeeds', async () => {
    const fixedData = { id: 'S-1', type: 'story', title: 'Auto-fixed' };
    // evaluate must fail on first call so autoFix is triggered,
    // then pass on re-evaluation after the fix is applied
    const evaluateFn = vi.fn()
      .mockResolvedValueOnce(['initial failure'])
      .mockResolvedValueOnce(null);

    const engine = new HarnessEngine();
    engine.registerPolicy({
      id: 'auto-fixable',
      name: 'Auto-fixable',
      description: 'Can auto-fix',
      type: 'pre-flight',
      severity: 'blocking',
      evaluate: evaluateFn as any,
      autoFix: vi.fn(async () => ({ ok: true, data: fixedData })),
    });

    const results = await engine.evaluate(makeContext(), 'pre-flight');

    expect(results[0].fixed).toBe(true);
    expect(results[0].fixedArtifact).toEqual(fixedData);
  });

  it('re-evaluates with fixed artifact after autoFix succeeds', async () => {
    const evaluateFn = vi.fn()
      .mockResolvedValueOnce(['initial failure'])
      .mockResolvedValueOnce(null);

    const engine = new HarnessEngine();
    engine.registerPolicy({
      id: 're-eval-test',
      name: 'Re-eval Test',
      description: 'Tests re-evaluation',
      type: 'pre-flight',
      severity: 'blocking',
      evaluate: evaluateFn as any,
      autoFix: vi.fn(async () => ({ ok: true, data: { id: 'S-1', title: 'Fixed' } })),
    });

    const results = await engine.evaluate(makeContext(), 'pre-flight');

    expect(evaluateFn).toHaveBeenCalledTimes(2);
    expect(results[0].passed).toBe(true);
  });

  it('does not call autoFix when policy passes (no failures)', async () => {
    const autoFix = vi.fn();
    const engine = new HarnessEngine();
    engine.registerPolicy({
      id: 'no-fix-needed',
      name: 'No Fix Needed',
      description: 'Passes',
      type: 'pre-flight',
      severity: 'blocking',
      evaluate: vi.fn(async () => null),
      autoFix,
    });

    await engine.evaluate(makeContext(), 'pre-flight');

    expect(autoFix).not.toHaveBeenCalled();
  });

  it('autoFix throw is caught, policy still reports failures', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy({
      id: 'broken-fix',
      name: 'Broken Fix',
      description: 'Auto-fix throws',
      type: 'pre-flight',
      severity: 'blocking',
      evaluate: vi.fn(async () => ['failure']),
      autoFix: vi.fn(async () => { throw new Error('Auto-fix crashed'); }),
    });

    const results = await engine.evaluate(makeContext(), 'pre-flight');

    // Should not throw — auto-fix failure is caught
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].fixed).toBe(false);
  });

  it('autoFix returns ok:false — stays as failed without fix', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy({
      id: 'fix-rejected',
      name: 'Fix Rejected',
      description: 'Auto-fix returns ok:false',
      type: 'pre-flight',
      severity: 'blocking',
      evaluate: vi.fn(async () => ['failure']),
      autoFix: vi.fn(async () => ({ ok: false })),
    });

    const results = await engine.evaluate(makeContext(), 'pre-flight');

    expect(results[0].passed).toBe(false);
    expect(results[0].fixed).toBe(false);
    expect(results[0].fixedArtifact).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Continuous evaluation (evaluateContinuous)
// ═══════════════════════════════════════════════════════════════════════════════

describe('HarnessEngine.evaluateContinuous', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls searchTraces with the correct artifactId', async () => {
    const searchTraces = vi.fn(async () => []);
    vi.mocked(getTraceRecorder).mockReturnValue({
      record: vi.fn(),
      searchTraces,
    } as never);

    const engine = new HarnessEngine();
    await engine.evaluateContinuous('S-99', 'story', 'sess-1');

    expect(searchTraces).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: 'S-99', limit: 100 }),
    );
  });

  it('evaluates only continuous-phase policies', async () => {
    vi.mocked(getTraceRecorder).mockReturnValue({
      record: vi.fn(),
      searchTraces: vi.fn(async () => []),
    } as never);

    const engine = new HarnessEngine();
    engine.registerPolicy(makePassingPolicy({ id: 'pre', type: 'pre-flight' }));
    engine.registerPolicy(makePassingPolicy({ id: 'cont-1', type: 'continuous' }));
    engine.registerPolicy(makePassingPolicy({ id: 'cont-2', type: 'continuous' }));

    const results = await engine.evaluateContinuous('S-1', 'story', 'sess-1');

    const ids = results.map(r => r.policyId);
    expect(ids).not.toContain('pre');
    expect(ids).toContain('cont-1');
    expect(ids).toContain('cont-2');
  });

  it('passes traceEntries to continuous policy evaluation context', async () => {
    const traceEntries = [
      { sessionId: 's1', type: 'error', agent: 'tool', timestamp: '2024-01-01T00:00:00Z', data: { error: 'boom' } },
    ];
    vi.mocked(getTraceRecorder).mockReturnValue({
      record: vi.fn(),
      searchTraces: vi.fn(async () => traceEntries),
    } as never);

    const evaluateFn = vi.fn(async (ctx: EvaluationContext) => {
      // Verify trace entries are passed
      if (ctx.traceEntries?.length) return ['found trace entries'];
      return null;
    });

    const engine = new HarnessEngine();
    engine.registerPolicy({
      id: 'trace-check',
      name: 'Trace Check',
      description: 'Checks trace entries',
      type: 'continuous',
      severity: 'advisory',
      evaluate: evaluateFn,
    });

    const results = await engine.evaluateContinuous('S-1', 'story', 'sess-1');

    expect(results[0].passed).toBe(false);
    expect(results[0].failures).toContain('found trace entries');
  });

  it('handles searchTraces throwing gracefully', async () => {
    vi.mocked(getTraceRecorder).mockReturnValue({
      record: vi.fn(),
      searchTraces: vi.fn(async () => { throw new Error('Trace DB unavailable'); }),
    } as never);

    const engine = new HarnessEngine();
    engine.registerPolicy(makePassingPolicy({ id: 'cont', type: 'continuous' }));

    // Should not throw
    const results = await engine.evaluateContinuous('S-1', 'story', 'sess-1');

    expect(results).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Built-in policies registration
// ═══════════════════════════════════════════════════════════════════════════════

describe('HarnessEngine — built-in policies', () => {
  it('builtInPolicies() returns 6 policies', () => {
    const policies = HarnessEngine.builtInPolicies();
    expect(policies).toHaveLength(6);
  });

  it('includes schema-conformance policy', () => {
    const policies = HarnessEngine.builtInPolicies();
    const p = policies.find(p => p.id === 'schema-conformance');
    expect(p).toBeDefined();
    expect(p!.type).toBe('pre-flight');
    expect(p!.severity).toBe('blocking');
  });

  it('includes required-fields policy for stories', () => {
    const policies = HarnessEngine.builtInPolicies();
    const p = policies.find(p => p.id === 'required-fields');
    expect(p).toBeDefined();
    expect(p!.type).toBe('pre-flight');
    expect(p!.severity).toBe('blocking');
    expect(p!.artifactType).toBe('story');
  });

  it('includes no-placeholders policy (advisory post-flight)', () => {
    const policies = HarnessEngine.builtInPolicies();
    const p = policies.find(p => p.id === 'no-placeholders');
    expect(p).toBeDefined();
    expect(p!.type).toBe('post-flight');
    expect(p!.severity).toBe('advisory');
  });

  it('includes token-budget policy for epics', () => {
    const policies = HarnessEngine.builtInPolicies();
    const p = policies.find(p => p.id === 'token-budget');
    expect(p).toBeDefined();
    expect(p!.type).toBe('post-flight');
    expect(p!.severity).toBe('advisory');
    expect(p!.artifactType).toBe('epic');
  });

  it('includes trace-anomaly continuous policy', () => {
    const policies = HarnessEngine.builtInPolicies();
    const p = policies.find(p => p.id === 'trace-anomaly');
    expect(p).toBeDefined();
    expect(p!.type).toBe('continuous');
    expect(p!.severity).toBe('advisory');
  });

  it('includes feedback-accumulation continuous policy', () => {
    const policies = HarnessEngine.builtInPolicies();
    const p = policies.find(p => p.id === 'feedback-accumulation');
    expect(p).toBeDefined();
    expect(p!.type).toBe('continuous');
    expect(p!.severity).toBe('advisory');
  });

  it('registerPolicy adds policy and increments total count', async () => {
    const engine = new HarnessEngine();

    // Register built-in policies
    for (const p of HarnessEngine.builtInPolicies()) {
      engine.registerPolicy(p);
    }

    // Register a custom policy
    engine.registerPolicy(makePassingPolicy({ id: 'custom', type: 'pre-flight' }));

    // Evaluate pre-flight on a story: schema-conformance (universal) +
    // required-fields (artifactType: story) + custom = 3 pre-flight policies
    vi.mocked(schemaValidator.validateChanges as any).mockReturnValue({ valid: true, errors: [] } as never);

    const results = await engine.evaluate(
      { artifactType: 'story', artifactId: 'S-1', artifact: { id: 'S-1', type: 'story', title: 'T' } },
      'pre-flight',
    );

    // 3 applicable: schema-conformance, required-fields, custom
    expect(results).toHaveLength(3);
    const ids = results.map((r: { policyId: string }) => r.policyId);
    expect(ids).toContain('schema-conformance');
    expect(ids).toContain('required-fields');
    expect(ids).toContain('custom');
  });

  it('modules-level harnessEngine auto-registers built-in policies', async () => {
    // The module-level import runs the for-loop that calls
    // registerPolicy for each builtInPolicies().
    // Evaluate pre-flight on a story — should get schema-conformance + required-fields
    vi.mocked(schemaValidator.validateChanges as any).mockReturnValue({ valid: true, errors: [] } as never);

    const results = await harnessEngine.evaluate(
      { artifactType: 'story', artifactId: 'S-1', artifact: { id: 'S-1', type: 'story', title: 'T' } },
      'pre-flight',
    );

    // schema-conformance (universal) + required-fields (artifactType: story)
    expect(results.length).toBeGreaterThanOrEqual(2);
    const ids = results.map((r: { policyId: string }) => r.policyId);
    expect(ids).toContain('schema-conformance');
    expect(ids).toContain('required-fields');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Findings event emission
// ═══════════════════════════════════════════════════════════════════════════════

describe('HarnessEngine — findings event', () => {
  it('emits findings for failed policies', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makeFailingPolicy({ id: 'fail-1', type: 'pre-flight', severity: 'blocking' }));

    const findings: unknown[] = [];
    engine.on('findings', (event) => findings.push(event));

    await engine.evaluate(makeContext({ artifactId: 'S-F1', artifactType: 'story' }), 'pre-flight');

    expect(findings).toHaveLength(1);
    const f = findings[0] as Record<string, unknown>;
    expect(f.artifactId).toBe('S-F1');
    expect(((f.findings as unknown[])?.[0] as Record<string, unknown>)?.policyId).toBe('fail-1');
  });

  it('does not emit findings for passed policies', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makePassingPolicy({ id: 'pass-1', type: 'pre-flight' }));

    const findings: unknown[] = [];
    engine.on('findings', (event) => findings.push(event));

    await engine.evaluate(makeContext(), 'pre-flight');

    expect(findings).toHaveLength(0);
  });

  it('emits severity high for blocking failures', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makeFailingPolicy({
      id: 'block-fail',
      type: 'pre-flight',
      severity: 'blocking',
    }));

    const findings: unknown[] = [];
    engine.on('findings', (event) => findings.push(event));

    await engine.evaluate(makeContext(), 'pre-flight');

    const f = findings[0] as Record<string, unknown>;
    expect(((f.findings as unknown[])?.[0] as Record<string, unknown>)?.severity).toBe('high');
  });

  it('emits severity low for advisory failures', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makeFailingPolicy({
      id: 'adv-fail',
      type: 'post-flight',
      severity: 'advisory',
    }));

    const findings: unknown[] = [];
    engine.on('findings', (event) => findings.push(event));

    await engine.evaluate(makeContext(), 'post-flight');

    const f = findings[0] as Record<string, unknown>;
    expect(((f.findings as unknown[])?.[0] as Record<string, unknown>)?.severity).toBe('low');
  });

  it('findings message contains failures text joined by semicolons', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy({
      id: 'multi-fail',
      name: 'Multi Fail',
      description: 'Multiple failures',
      type: 'pre-flight',
      severity: 'blocking',
      evaluate: vi.fn(async () => ['error one', 'error two']),
    });

    const findings: unknown[] = [];
    engine.on('findings', (event) => findings.push(event));

    await engine.evaluate(makeContext(), 'pre-flight');

    const f = findings[0] as Record<string, unknown>;
    expect(((f.findings as unknown[])?.[0] as Record<string, unknown>)?.message).toBe('error one; error two');
  });

  it('emits one findings event per failed policy', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makeFailingPolicy({ id: 'f1', type: 'pre-flight' }));
    engine.registerPolicy(makePassingPolicy({ id: 'p1', type: 'pre-flight' })); // passes — no event
    engine.registerPolicy(makeFailingPolicy({ id: 'f2', type: 'pre-flight', severity: 'advisory' }));

    const findings: unknown[] = [];
    engine.on('findings', (event) => findings.push(event));

    await engine.evaluate(makeContext(), 'pre-flight');

    expect(findings).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// registerPolicy
// ═══════════════════════════════════════════════════════════════════════════════

describe('HarnessEngine.registerPolicy', () => {
  it('adds a policy that is evaluated in subsequent calls', async () => {
    const engine = new HarnessEngine();

    // No policies initially
    let results = await engine.evaluate(makeContext(), 'pre-flight');
    expect(results).toEqual([]);

    // Register one
    engine.registerPolicy(makePassingPolicy({ id: 'added', type: 'pre-flight' }));
    results = await engine.evaluate(makeContext(), 'pre-flight');
    expect(results).toHaveLength(1);
    expect(results[0].policyId).toBe('added');
  });

  it('multiple registrations of the same policy ID are independent entries', async () => {
    const engine = new HarnessEngine();
    engine.registerPolicy(makePassingPolicy({ id: 'dup', type: 'pre-flight' }));
    engine.registerPolicy(makePassingPolicy({ id: 'dup', type: 'pre-flight' }));

    const results = await engine.evaluate(makeContext(), 'pre-flight');

    // Both are registered and evaluated
    expect(results).toHaveLength(2);
    expect(results[0].policyId).toBe('dup');
    expect(results[1].policyId).toBe('dup');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Null/undefined artifact edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('HarnessEngine.evaluate — artifact edge cases', () => {
  it('passes undefined artifact to policy evaluate function', async () => {
    const evaluateFn = vi.fn(async () => ['no artifact']);
    const engine = new HarnessEngine();
    engine.registerPolicy({
      id: 'null-check',
      name: 'Null Check',
      description: 'Handles null artifact',
      type: 'pre-flight',
      severity: 'blocking',
      evaluate: evaluateFn,
    });

    const results = await engine.evaluate(
      makeContext({ artifact: undefined }),
      'pre-flight',
    );

    expect(results[0].passed).toBe(false);
    expect(evaluateFn).toHaveBeenCalledWith(
      expect.objectContaining({ artifact: undefined }),
    );
  });

  it('passes null artifact to policy evaluate function', async () => {
    const evaluateFn = vi.fn(async () => ['null artifact']);
    const engine = new HarnessEngine();
    engine.registerPolicy({
      id: 'null-check-2',
      name: 'Null Check 2',
      description: 'Handles null artifact',
      type: 'pre-flight',
      severity: 'blocking',
      evaluate: evaluateFn,
    });

    const results = await engine.evaluate(
      makeContext({ artifact: null as never }),
      'pre-flight',
    );

    expect(results[0].passed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Trace recording
// ═══════════════════════════════════════════════════════════════════════════════

describe('HarnessEngine.evaluate — trace recording', () => {
  it('records a decision trace entry for each policy', async () => {
    const record = vi.fn();
    vi.mocked(getTraceRecorder).mockReturnValue({ record, searchTraces: vi.fn() } as never);

    const engine = new HarnessEngine();
    engine.registerPolicy(makePassingPolicy({ id: 'p1', type: 'pre-flight' }));
    engine.registerPolicy(makeFailingPolicy({ id: 'p2', type: 'pre-flight' }));

    await engine.evaluate(makeContext({ artifactId: 'S-T1', sessionId: 'sess-1' }), 'pre-flight');

    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'sess-1',
      type: 'decision',
      agent: 'harness',
    }));
  });

  it('uses default sessionId when context sessionId is undefined', async () => {
    const record = vi.fn();
    vi.mocked(getTraceRecorder).mockReturnValue({ record, searchTraces: vi.fn() } as never);

    const engine = new HarnessEngine();
    engine.registerPolicy(makePassingPolicy({ id: 'p1', type: 'pre-flight' }));

    await engine.evaluate(makeContext({ sessionId: undefined }), 'pre-flight');

    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'harness', // default
    }));
  });

  it('trace recording failure does not throw', async () => {
    vi.mocked(getTraceRecorder).mockReturnValue({
      record: vi.fn(() => { throw new Error('DB write failure'); }),
      searchTraces: vi.fn(),
    } as never);

    const engine = new HarnessEngine();
    engine.registerPolicy(makePassingPolicy({ id: 'p1', type: 'pre-flight' }));

    // Should not throw
    const results = await engine.evaluate(makeContext(), 'pre-flight');
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });
});
