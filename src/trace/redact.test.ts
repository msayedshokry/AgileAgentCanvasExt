import { describe, it, expect } from 'vitest';
import { redactText, redactTraceData } from './redact';

describe('trace redaction', () => {
  it('masks credential formats inside free text', () => {
    const text = 'key sk-ant-api03-abcdefghijklmnopqrstuv and AIzaSyA1234567890abcdefghijklmnopqrstu and Bearer abcdefghijklmnop1234';
    const out = redactText(text);
    expect(out).not.toMatch(/sk-ant-api03|AIzaSy|Bearer abcdef/);
    expect(out.match(/\[redacted\]/g)).toHaveLength(3);
  });

  it('masks secret-named keys at any depth and keeps other data', () => {
    const out = redactTraceData({ tool: 'write_file', input: { path: 'a.ts', headers: { Authorization: 'x' }, apiKey: 'k' } });
    expect(out).toEqual({ tool: 'write_file', input: { path: 'a.ts', headers: { Authorization: '[redacted]' }, apiKey: '[redacted]' } });
  });

  it('truncates bulky file bodies', () => {
    const out = redactTraceData({ content: 'x'.repeat(20_000) });
    expect(out.content.length).toBeLessThan(8_300);
    expect(out.content).toMatch(/truncated 11808 chars/);
  });

  it('does not mutate the input', () => {
    const input = { password: 'p' };
    redactTraceData(input);
    expect(input.password).toBe('p');
  });
});
