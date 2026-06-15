// ─── Unit tests: failure-classifier ───────────────────────────────────────────
// Covers: transient (ECONNRESET) → 'transient' (happy path) and
// permanent (schema validation) → 'permanent' (most common error path).

import { describe, it, expect } from 'vitest';
import { FailureClassifier } from './failure-classifier';

describe('FailureClassifier', () => {
  it('happy: network error is classified as transient with the matching label', () => {
    const c = new FailureClassifier();
    const r = c.classify(new Error('connect ECONNRESET 127.0.0.1:443'));
    expect(r.category).toBe('transient');
    expect(r.matchedPattern).toBe('network-error');
  });

  it('error: schema validation failure is classified as permanent', () => {
    const c = new FailureClassifier();
    const r = c.classify(new Error('schema validation failed: missing required field "title"'));
    expect(r.category).toBe('permanent');
    expect(r.matchedPattern).toBe('schema-validation');
  });
});
