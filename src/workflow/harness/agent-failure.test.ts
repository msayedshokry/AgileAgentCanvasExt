import { describe, it, expect } from 'vitest';
import { classifyAgentFailure } from './agent-failure';

// Real outputs captured from the 2026-11-19 smoke run.
const REAL: Array<[string, string]> = [
  ['Failed to authenticate: OAuth session expired and could not be refreshed', 'signed-out'],
  ['ERROR: {"type":"error","status":400,"error":{"message":"The \'gpt-6.1-sol\' model is not supported when using Codex with a ChatGPT account.","code":"model_not_found"}}', 'model-unavailable'],
  ['Error: This client is no longer supported for Gemini Code Assist for individuals. To continue using Gemini, please migrate to the Antigravity suite', 'client-retired'],
  ['Error: This API key has expired. Create a new API key in OpenCode Console', 'signed-out'],
  ['401 {"type":"error","error":{"type":"authentication_error","message":"Invalid credential"}}', 'signed-out'],
  ['litellm.AuthenticationError: The api_key client option must be set either by passing api_key to the client or by setting the OPENAI_API_KEY environment variable', 'missing-key'],
];

describe('classifyAgentFailure', () => {
  it.each(REAL)('classifies real CLI output: %s', (text, kind) => {
    expect(classifyAgentFailure(text)?.kind).toBe(kind);
  });

  it('finds the cause inside a "no verdict" summary with the last output appended', () => {
    const summary = 'Agent exited without writing a verdict file. Last output:\nnoise\nFailed to authenticate: OAuth session expired';
    const f = classifyAgentFailure(summary)!;
    expect(f.kind).toBe('signed-out');
    expect(f.detail).toBe('Failed to authenticate: OAuth session expired');
    expect(f.actions).toContain('sign-in');
  });

  it.each([
    ['429 Too Many Requests', 'quota'],
    ["'claude' is not recognized as an internal or external command", 'not-installed'],
    ['connect ECONNREFUSED 127.0.0.1:8080', 'network'],
    ['Run aborted', 'aborted'],
    ['Agent exited without writing a verdict file.', 'no-verdict'],
    ['something odd happened', 'unknown'],
  ])('%s → %s', (text, kind) => {
    expect(classifyAgentFailure(text)?.kind).toBe(kind);
  });

  it('returns undefined for empty input', () => {
    expect(classifyAgentFailure('  ')).toBeUndefined();
  });
});
