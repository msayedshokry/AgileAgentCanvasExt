import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { claudeTranscriptPath, sumTranscriptUsage } from './run-usage';

const assistant = (id: string, ts: string, usage: Record<string, number>) =>
  JSON.stringify({ type: 'assistant', timestamp: ts, message: { id, usage } });

describe('claudeTranscriptPath', () => {
  it("matches Claude Code's project folder naming", () => {
    expect(claudeTranscriptPath('D:\\work\\my.repo', 'abc', '/home/u'))
      .toBe(path.join('/home/u', '.claude', 'projects', 'D--work-my-repo', 'abc.jsonl'));
  });
});

describe('sumTranscriptUsage', () => {
  it('counts each message once even though it is logged per content block', () => {
    const jsonl = [
      assistant('m1', '2026-11-25T10:00:00Z', { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 }),
      assistant('m1', '2026-11-25T10:00:01Z', { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 }),
      assistant('m2', '2026-11-25T10:00:05Z', { input_tokens: 1, output_tokens: 50 }),
      JSON.stringify({ type: 'user', message: { content: 'hi' } }),
    ].join('\n');
    expect(sumTranscriptUsage(jsonl)).toEqual({ input: 11, output: 55, cacheRead: 100, cacheWrite: 20 });
  });

  it('only counts messages from this run when the session was resumed', () => {
    const jsonl = [
      assistant('old', '2026-11-25T09:00:00Z', { input_tokens: 999, output_tokens: 999 }),
      assistant('new', '2026-11-25T10:00:00Z', { input_tokens: 3, output_tokens: 4 }),
    ].join('\n');
    expect(sumTranscriptUsage(jsonl, Date.parse('2026-11-25T09:30:00Z'))).toEqual({ input: 3, output: 4, cacheRead: 0, cacheWrite: 0 });
  });

  it('ignores a half-written last line and returns undefined when there is no usage', () => {
    expect(sumTranscriptUsage(`${assistant('m1', '2026-11-25T10:00:00Z', { output_tokens: 2 })}\n{"type":"assistant","usage":`))
      .toEqual({ input: 0, output: 2, cacheRead: 0, cacheWrite: 0 });
    expect(sumTranscriptUsage('')).toBeUndefined();
  });
});
