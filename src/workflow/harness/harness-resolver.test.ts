import { describe, it, expect } from 'vitest';
import { resolveHarness, NO_LM_MESSAGE, type ResolverDeps } from './harness-resolver';

const deps = (over: Partial<ResolverDeps> & { installed?: string[]; lm?: boolean }): ResolverDeps => ({
  configuredHarness: over.configuredHarness ?? 'auto',
  selectedChatProvider: over.selectedChatProvider ?? 'auto',
  isOnPath: (name) => (over.installed ?? []).includes(name),
  hasLanguageModel: async () => over.lm ?? false,
});

describe('resolveHarness', () => {
  it('explicit harness that is installed wins', async () => {
    const r = await resolveHarness(deps({ configuredHarness: 'gemini', installed: ['claude', 'gemini'] }));
    expect(r.kind === 'cli' && r.adapter.id).toBe('gemini');
  });

  it('explicit harness that is missing is BLOCKED, never swapped for another CLI', async () => {
    const r = await resolveHarness(deps({ configuredHarness: 'codex', installed: ['claude'], lm: true }));
    expect(r.kind).toBe('none');
    expect(r.kind === 'none' && r.message).toMatch(/Codex.*not on PATH.*npm i -g @openai\/codex/);
  });

  it('auto prefers the CLI matching the chat-provider dropdown', async () => {
    const r = await resolveHarness(deps({ selectedChatProvider: 'pi', installed: ['claude', 'pi'] }));
    expect(r.kind === 'cli' && r.adapter.id).toBe('pi');
  });

  it('auto: Copilot pick without Copilot CLI uses the VS Code language model', async () => {
    const r = await resolveHarness(deps({ selectedChatProvider: 'copilot', installed: ['claude'], lm: true }));
    expect(r.kind).toBe('lm');
  });

  it('auto: falls through to the first installed CLI in preference order', async () => {
    const r = await resolveHarness(deps({ installed: ['aider', 'opencode'] }));
    expect(r.kind === 'cli' && r.adapter.id).toBe('opencode');
  });

  it('auto: cursor-agent is found under its alternate binary name', async () => {
    const r = await resolveHarness(deps({ installed: ['agent'] }));
    expect(r.kind === 'cli' && r.binary).toBe('agent');
  });

  it('auto: no CLI but a language model → lm', async () => {
    expect((await resolveHarness(deps({ lm: true }))).kind).toBe('lm');
  });

  it('nothing installed → BLOCKED with install hints for every harness', async () => {
    const r = await resolveHarness(deps({}));
    expect(r.kind).toBe('none');
    expect(r.kind === 'none' && r.message).toMatch(/Claude Code[\s\S]*Gemini CLI[\s\S]*Aider/);
  });

  it('vscode-lm without a model is BLOCKED with guidance', async () => {
    const r = await resolveHarness(deps({ configuredHarness: 'vscode-lm' }));
    expect(r).toEqual({ kind: 'none', message: NO_LM_MESSAGE });
  });

  it('an unknown configured value is treated as auto', async () => {
    const r = await resolveHarness(deps({ configuredHarness: 'nonsense', installed: ['codex'] }));
    expect(r.kind === 'cli' && r.adapter.id).toBe('codex');
  });
});
