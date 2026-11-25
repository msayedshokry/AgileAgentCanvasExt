import { describe, it, expect } from 'vitest';
import { decideRetry } from './retry-policy';

describe('decideRetry', () => {
  it.each([
    ['connect ECONNREFUSED 127.0.0.1:443', 'network'],
    ['No verdict and no agent output for 15m — agent stopped as stuck', 'stuck'],
    ['Agent exited without writing a verdict file.', 'no-verdict'],
    ['something odd happened', 'unknown'],
  ])('retries a transient failure at once: %s', (summary, kind) => {
    const d = decideRetry(summary, false);
    expect(d).toMatchObject({ retry: true, delayMs: 0, failure: { kind } });
  });

  it.each([
    ['429 Too Many Requests', 'rate-limit', 60_000],
    ['API Error: 403 concurrent request limit exceeded', 'rate-limit', 60_000],
    ['overloaded_error: Overloaded', 'rate-limit', 60_000],
    ['API Error: 503 Service Unavailable', 'provider-error', 15_000],
  ])('retries a provider hiccup after a wait: %s', (summary, kind, delayMs) => {
    expect(decideRetry(summary, false)).toMatchObject({ retry: true, delayMs, failure: { kind } });
  });

  it.each([
    ['Failed to authenticate: OAuth session expired', 'signed-out'],
    ['OPENAI_API_KEY environment variable is missing', 'missing-key'],
    ['model_not_found', 'model-unavailable'],
    ["'codex' is not recognized as an internal or external command", 'not-installed'],
    ['insufficient_quota', 'quota'],
    ['No verdict within 120m (run time limit) — agent stopped', 'time-limit'],
    ['API Error: 400 prompt is too long: 215000 tokens > 200000 maximum', 'context-overflow'],
  ])('does not retry a failure that needs a person: %s', (summary, kind) => {
    const d = decideRetry(summary, false);
    expect(d.retry).toBe(false);
    expect(d.failure?.kind).toBe(kind);
  });

  it('finds a permanent cause inside a no-verdict summary and does not retry', () => {
    const d = decideRetry('Agent exited without writing a verdict file. Last output:\nFailed to authenticate', false);
    expect(d).toMatchObject({ retry: false, failure: { kind: 'signed-out' } });
  });

  it('never retries an aborted run', () => {
    expect(decideRetry('connect ECONNREFUSED', true).retry).toBe(false);
  });

  it('retries when there is no summary at all', () => {
    expect(decideRetry(undefined, false).retry).toBe(true);
  });
});
