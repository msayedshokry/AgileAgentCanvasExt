import { describe, it, expect } from 'vitest';
import { probeReadiness, AUTH_SPECS, type ReadinessDeps } from './harness-readiness';

function deps(over: Partial<ReadinessDeps> & { installed?: string[]; outputs?: Record<string, { output: string; code: number | null }> }): ReadinessDeps {
  return {
    isOnPath: (b) => (over.installed ?? []).includes(b),
    run: async (bin, args) => over.outputs?.[`${bin} ${args.join(' ')}`] ?? { output: '', code: 0 },
    env: over.env ?? {},
    aiderConfigHasApiBase: over.aiderConfigHasApiBase ?? (() => false),
  };
}

const byId = (list: Awaited<ReturnType<typeof probeReadiness>>, id: string) => list.find((r) => r.id === id)!;

describe('probeReadiness', () => {
  it('reads real claude/codex status outputs (captured 2026-11-19)', async () => {
    const list = await probeReadiness(deps({
      installed: ['claude', 'codex'],
      outputs: {
        'claude auth status': { output: '{\n  "loggedIn": false,\n  "authMethod": "none"\n}', code: 0 },
        'claude --version': { output: '2.1.294 (Claude Code)', code: 0 },
        'codex login status': { output: 'Logged in using ChatGPT', code: 0 },
        'codex --version': { output: 'codex-cli 0.163.0', code: 0 },
      },
    }));
    expect(byId(list, 'claude')).toMatchObject({ installed: true, version: '2.1.294', auth: 'signed-out' });
    expect(byId(list, 'codex')).toMatchObject({ auth: 'ready', authDetail: 'Signed in' });
  });

  it('an API key in the environment counts as ready even when the session is signed out', async () => {
    const list = await probeReadiness(deps({
      installed: ['claude'],
      env: { ANTHROPIC_API_KEY: 'sk-ant-x' },
      outputs: { 'claude auth status': { output: '{"loggedIn": false}', code: 0 } },
    }));
    expect(byId(list, 'claude')).toMatchObject({ auth: 'ready', authDetail: 'Uses ANTHROPIC_API_KEY' });
  });

  it('opencode with stored credentials is "configured"; aider honours a local API base', async () => {
    const list = await probeReadiness(deps({
      installed: ['opencode', 'aider'],
      outputs: { 'opencode auth list': { output: '┌ Credentials\n● OpenAI oauth', code: 0 } },
      aiderConfigHasApiBase: () => true,
    }));
    expect(byId(list, 'opencode').auth).toBe('configured');
    expect(byId(list, 'aider').auth).toBe('configured');
  });

  it('not installed → no probes, install hint kept; harnesses without a status check are unknown', async () => {
    const list = await probeReadiness(deps({ installed: ['pi'] }));
    expect(byId(list, 'gemini')).toMatchObject({ installed: false, authDetail: 'Not installed' });
    expect(byId(list, 'gemini').installHint).toMatch(/gemini-cli/);
    expect(byId(list, 'pi').auth).toBe('unknown');
    expect(byId(list, 'aider').canSignIn).toBe(false);
  });

  it('every harness has an auth spec', () => {
    expect(Object.keys(AUTH_SPECS).sort()).toEqual(['aider', 'claude', 'codex', 'copilot-cli', 'cursor-agent', 'gemini', 'opencode', 'pi']);
  });
});
