import { describe, it, expect } from 'vitest';
import { HarnessCardResults } from './harness-card-results';
import type { HarnessEvaluatedEvent } from '../harness/policy-engine';

function evaluated(
  artifactId: string,
  phase: HarnessEvaluatedEvent['phase'],
  results: Array<[policyId: string, passed: boolean, severity?: 'blocking' | 'advisory']>,
): HarnessEvaluatedEvent {
  return {
    artifactId,
    artifactType: 'story',
    phase,
    results: results.map(([policyId, passed, severity = 'blocking']) => ({
      policyId,
      passed,
      severity,
      failures: passed ? [] : [`${policyId} failed`],
      fixed: false,
      timestamp: '2026-11-24T00:00:00.000Z',
    })),
  };
}

describe('HarnessCardResults', () => {
  it('returns the card-shaped results for one evaluation', () => {
    const store = new HarnessCardResults();
    expect(store.record(evaluated('S-1', 'pre-flight', [['required-fields', false]]))).toEqual([
      { policyId: 'required-fields', passed: false, severity: 'blocking', failures: ['required-fields failed'] },
    ]);
  });

  it('keeps a failure from one phase when a later phase checks other policies', () => {
    const store = new HarnessCardResults();
    store.record(evaluated('S-1', 'pre-flight', [['required-fields', false]]));
    const after = store.record(evaluated('S-1', 'continuous', [['trace-anomaly', true, 'advisory']]));
    expect(after.map(r => [r.policyId, r.passed])).toEqual([['required-fields', false], ['trace-anomaly', true]]);
  });

  it('replaces a policy result when that policy is evaluated again', () => {
    const store = new HarnessCardResults();
    store.record(evaluated('S-1', 'pre-flight', [['required-fields', false]]));
    const after = store.record(evaluated('S-1', 'pre-flight', [['required-fields', true]]));
    expect(after).toEqual([{ policyId: 'required-fields', passed: true, severity: 'blocking', failures: [] }]);
  });

  it('keeps cards separate and lists every card for replay', () => {
    const store = new HarnessCardResults();
    store.record(evaluated('S-1', 'pre-flight', [['required-fields', false]]));
    store.record(evaluated('S-2', 'post-flight', [['no-placeholders', true, 'advisory']]));
    expect(store.get('S-1').map(r => r.policyId)).toEqual(['required-fields']);
    expect(store.entries().map(([id]) => id)).toEqual(['S-1', 'S-2']);
    expect(store.get('unknown')).toEqual([]);
  });

  it('copies failure lists so later edits to the event do not leak in', () => {
    const store = new HarnessCardResults();
    const evt = evaluated('S-1', 'pre-flight', [['required-fields', false]]);
    store.record(evt);
    evt.results[0].failures.push('mutated');
    expect(store.get('S-1')[0].failures).toEqual(['required-fields failed']);
  });
});
