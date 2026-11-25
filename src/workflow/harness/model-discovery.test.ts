// Fixtures are trimmed copies of real output captured 2026-11-25
// (claude 2.1.294, codex-cli 0.163, opencode 1.19, pi 1.2).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clearModelDiscoveryCache, discoverModels, parseClaudeModels, parseCodexModels, parseOpenCodeModels, parsePiModels,
  CLAUDE_LIST_MODELS_REQUEST, supportsModelDiscovery,
} from './model-discovery';

const CLAUDE_OUT = [
  '{"type":"system","subtype":"init"}',
  JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: 'aac-list-models', response: { models: [
    { value: 'default', resolvedModel: 'claude-opus-5-5', displayName: 'Default (recommended)', description: 'Use the default model' },
    { value: 'sonnet', displayName: 'Sonnet', description: 'Sonnet 5.5 · Efficient for routine tasks' },
    { value: 'claude-fable-5-1[1m]', displayName: 'Fable' },
  ] } } }),
].join('\n');

const CODEX_OUT = 'WARNING: something\n{"models":[{"slug":"gpt-reserve","display_name":"GPT-Reserve","description":"Fast and affordable agentic coding model."},{"slug":"gpt-max"}]}';
const OPENCODE_OUT = 'opencode/beam-free\nopencode/big-pickle\n\nsome log line\nanthropic/claude-sonnet-5-5\n';
const PI_OUT = [
  "[utils] container detection failed: ENOENT: no such file or directory, open 'C:\\proc\\1\\cgroup'",
  'provider     model                         context  max-out  thinking  images',
  'agnes        agnes-1.5-flash               8.2K     4.1K     no        no    ',
  'anthropic    claude-haiku-4-5              200K     64K      yes       yes   ',
].join('\n');

describe('model list parsers', () => {
  it('reads the Claude control response', () => {
    expect(parseClaudeModels(CLAUDE_OUT)).toEqual([
      { id: 'default', label: 'Default (recommended)', description: 'Use the default model' },
      { id: 'sonnet', label: 'Sonnet', description: 'Sonnet 5.5 · Efficient for routine tasks' },
      { id: 'claude-fable-5-1[1m]', label: 'Fable' },
    ]);
  });

  it('reads codex JSON even after a warning line', () => {
    expect(parseCodexModels(CODEX_OUT)).toEqual([
      { id: 'gpt-reserve', label: 'GPT-Reserve', description: 'Fast and affordable agentic coding model.' },
      { id: 'gpt-max', label: 'gpt-max' },
    ]);
  });

  it('keeps only provider/model lines from opencode', () => {
    expect(parseOpenCodeModels(OPENCODE_OUT).map((m) => m.id)).toEqual(['opencode/beam-free', 'opencode/big-pickle', 'anthropic/claude-sonnet-5-5']);
  });

  it('reads the pi table after its log noise', () => {
    expect(parsePiModels(PI_OUT)).toEqual([
      { id: 'agnes/agnes-1.5-flash', label: 'agnes-1.5-flash (agnes)' },
      { id: 'anthropic/claude-haiku-4-5', label: 'claude-haiku-4-5 (anthropic)' },
    ]);
  });

  it('returns nothing for output it does not recognise', () => {
    expect(parseClaudeModels('not json')).toEqual([]);
    expect(parseCodexModels('{broken')).toEqual([]);
    expect(parsePiModels('no table here')).toEqual([]);
  });
});

describe('discoverModels', () => {
  beforeEach(() => clearModelDiscoveryCache());

  it('asks claude over stream-json without hooks, and caches the list', async () => {
    const run = vi.fn(async () => CLAUDE_OUT);
    const first = await discoverModels('claude', 'claude', run, 0);
    expect(first.models).toHaveLength(3);
    expect(run).toHaveBeenCalledWith('claude', expect.arrayContaining(['--bare', '--input-format', 'stream-json']), CLAUDE_LIST_MODELS_REQUEST);
    await discoverModels('claude', 'claude', run, 60_000);
    expect(run).toHaveBeenCalledTimes(1);
    await discoverModels('claude', 'claude', run, 11 * 60_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('reports CLIs without a listing command as manual entry', async () => {
    const run = vi.fn();
    expect(await discoverModels('gemini', 'gemini', run)).toEqual({ models: [], supported: false });
    expect(run).not.toHaveBeenCalled();
    expect(supportsModelDiscovery('aider')).toBe(false);
    expect(supportsModelDiscovery('codex')).toBe(true);
  });

  it('explains a failed discovery and retries next time instead of caching it', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('spawn codex ENOENT')).mockResolvedValueOnce(CODEX_OUT);
    expect(await discoverModels('codex', 'codex', run, 0)).toEqual({ models: [], supported: true, error: 'spawn codex ENOENT' });
    expect((await discoverModels('codex', 'codex', run, 1)).models).toHaveLength(2);
  });

  it('says so when the CLI answers with no models', async () => {
    const catalog = await discoverModels('opencode', 'opencode', async () => '', 0);
    expect(catalog.error).toMatch(/returned no models/);
  });
});
