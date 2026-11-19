import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { claudeProjectDirName, readClaudeUsage, readCodexUsage } from './cli-usage';

let home: string;
const cwd = path.join('D:', 'Work', 'my.repo');
const t0 = Date.parse('2026-11-19T10:00:00Z');

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-usage-')); });
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

describe('claude usage', () => {
  it('maps the working directory the way Claude Code names project folders', () => {
    expect(claudeProjectDirName('D:\\PersonalDev\\App\\.claude\\worktrees\\x')).toBe('D--PersonalDev-App--claude-worktrees-x');
  });

  it('sums usage since the run started, once per message id', () => {
    const dir = path.join(home, '.claude', 'projects', claudeProjectDirName(cwd));
    fs.mkdirSync(dir, { recursive: true });
    const line = (ts: string, id: string, input: number, output: number) => JSON.stringify({
      timestamp: ts, message: { id, model: 'claude-opus-5-5', usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: 100, cache_creation_input_tokens: 10 } },
    });
    fs.writeFileSync(path.join(dir, 's.jsonl'), [
      line('2026-11-19T09:00:00Z', 'old', 999, 999),           // before the run
      line('2026-11-19T10:00:01Z', 'm1', 5, 50),
      line('2026-11-19T10:00:01Z', 'm1', 5, 50),               // same message, second content block
      line('2026-11-19T10:00:05Z', 'm2', 7, 70),
      'not json',
    ].join('\n'));
    expect(readClaudeUsage(cwd, t0, home)).toEqual({
      model: 'claude-opus-5-5', inputTokens: 12, outputTokens: 120, cacheReadTokens: 200, cacheCreationTokens: 20,
    });
  });

  it('returns undefined when there is no log for the workspace', () => {
    expect(readClaudeUsage(cwd, t0, home)).toBeUndefined();
  });
});

describe('codex usage', () => {
  it('reads the last cumulative token_count of sessions started in this workspace after the run began', () => {
    const now = new Date();
    const dir = path.join(home, '.codex', 'sessions', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'));
    fs.mkdirSync(dir, { recursive: true });
    const since = Date.now() - 1000;
    const startedIso = new Date(since + 10).toISOString();
    const tc = (input: number, cached: number, output: number) => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output } } } });
    fs.writeFileSync(path.join(dir, 'rollout-a.jsonl'), [
      JSON.stringify({ type: 'session_meta', payload: { cwd, timestamp: startedIso, model: 'gpt-x' } }),
      tc(100, 40, 10),
      tc(300, 200, 30),
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'rollout-other.jsonl'), [
      JSON.stringify({ type: 'session_meta', payload: { cwd: path.join('C:', 'elsewhere'), timestamp: startedIso } }),
      tc(9999, 0, 9999),
    ].join('\n'));
    expect(readCodexUsage(cwd, since, home)).toEqual({ model: 'gpt-x', inputTokens: 100, cacheReadTokens: 200, outputTokens: 30, cacheCreationTokens: 0 });
  });
});
