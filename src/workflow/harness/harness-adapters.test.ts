import { describe, it, expect } from 'vitest';
import {
  HARNESS_ADAPTERS,
  buildHarnessLaunch,
  getHarnessAdapter,
  harnessForChatProvider,
  pointerPrompt,
  type LaunchContext,
  type PermissionPosture,
} from './harness-adapters';

const ctx = (posture: PermissionPosture, binary = 'bin'): LaunchContext => ({
  binary,
  posture,
  promptFile: '/ws/.ctx/_terminal-output/prompts/S-1-run.md',
  resultPath: '/ws/.ctx/_terminal-output/S-1-dev-result.json',
});

const launch = (id: string, posture: PermissionPosture) => {
  const adapter = getHarnessAdapter(id)!;
  return buildHarnessLaunch(adapter, ctx(posture, adapter.binaries[0]));
};

describe('harness adapter registry', () => {
  it('covers every harness the board promises to support', () => {
    expect(HARNESS_ADAPTERS.map((a) => a.id)).toEqual([
      'claude', 'codex', 'gemini', 'copilot-cli', 'cursor-agent', 'opencode', 'pi', 'aider',
    ]);
  });

  it('every adapter supports both postures and documents them', () => {
    for (const a of HARNESS_ADAPTERS) {
      expect(a.postures).toContain('full');
      expect(a.postureNotes.sandboxed.length).toBeGreaterThan(10);
      expect(a.installHint).toMatch(/install/i);
    }
  });

  it('never places the prompt text in argv: stdin adapters get stdinFile, others only reference the file', () => {
    for (const a of HARNESS_ADAPTERS) {
      for (const posture of ['sandboxed', 'full'] as const) {
        const spec = buildHarnessLaunch(a, ctx(posture, a.binaries[0]));
        expect(spec.args[0]).toBe(a.binaries[0]);
        if (a.delivery === 'stdin') {
          expect(spec.stdinFile).toBe(ctx(posture).promptFile);
        } else {
          expect(spec.stdinFile).toBeUndefined();
          expect(spec.args.join(' ')).toContain('_terminal-output/prompts/S-1-run.md');
        }
      }
    }
  });

  it('sandboxed posture never carries a bypass/yolo flag', () => {
    const bypass = /dangerously|bypassPermissions|yolo|--force|--allow-all|--auto$|--approve$/;
    for (const a of HARNESS_ADAPTERS) {
      const spec = buildHarnessLaunch(a, ctx('sandboxed', a.binaries[0]));
      for (const arg of spec.args) expect(arg).not.toMatch(bypass);
    }
  });
});

describe('per-harness flags (verified against CLI help/docs 2026-11-19)', () => {
  it('claude', () => {
    expect(launch('claude', 'full').args).toEqual(
      ['claude', '-p', '--permission-mode', 'bypassPermissions', '--dangerously-skip-permissions']);
    expect(launch('claude', 'sandboxed').args).toEqual(
      ['claude', '-p', '--permission-mode', 'acceptEdits', '--allowedTools', 'Read Write Edit Glob Grep']);
  });

  it('claude names a new session or resumes the card session (verified against claude 2.1.294)', () => {
    const adapter = getHarnessAdapter('claude')!;
    expect(adapter.sessionResume).toBe(true);
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const fresh = buildHarnessLaunch(adapter, { ...ctx('sandboxed', 'claude'), session: { id, resume: false } });
    expect(fresh.args.slice(-2)).toEqual(['--session-id', id]);
    const resumed = buildHarnessLaunch(adapter, { ...ctx('full', 'claude'), session: { id, resume: true } });
    expect(resumed.args.slice(-2)).toEqual(['--resume', id]);
  });

  it('codex no longer passes --ask-for-approval (rejected by codex exec 0.163)', () => {
    for (const p of ['sandboxed', 'full'] as const) {
      expect(launch('codex', p).args).not.toContain('--ask-for-approval');
      expect(launch('codex', p).args.slice(0, 2)).toEqual(['codex', 'exec']);
      expect(launch('codex', p).args.at(-1)).toBe('-');
    }
    expect(launch('codex', 'sandboxed').args).toContain('workspace-write');
    // Without a Windows sandbox mode codex downgrades workspace-write to read-only.
    const sandboxed = launch('codex', 'sandboxed').args;
    expect(sandboxed[sandboxed.indexOf('-c') + 1]).toBe('windows.sandbox=unelevated');
    expect(launch('codex', 'full').args).toContain('--dangerously-bypass-approvals-and-sandbox');
  });

  it('gemini uses --approval-mode and -p', () => {
    expect(launch('gemini', 'sandboxed').args.slice(0, 4)).toEqual(['gemini', '--approval-mode', 'auto_edit', '-p']);
    expect(launch('gemini', 'full').args[2]).toBe('yolo');
  });

  it('copilot CLI denies shell when sandboxed', () => {
    expect(launch('copilot-cli', 'sandboxed').args).toEqual(expect.arrayContaining(['--deny-tool=shell', '--no-ask-user']));
    expect(launch('copilot-cli', 'full').args).toContain('--allow-all-tools');
  });

  it('opencode: sandboxed runs carry an edit-allow / shell-deny permission policy', () => {
    const sandboxed = launch('opencode', 'sandboxed');
    expect(sandboxed.args).toEqual(['opencode', 'run']);
    expect(JSON.parse(sandboxed.env!.OPENCODE_PERMISSION)).toEqual({ edit: 'allow', bash: 'deny', webfetch: 'deny' });
    expect(launch('opencode', 'full').env).toBeUndefined();
  });

  it('opencode: names the workspace with --dir when it is known', () => {
    const adapter = getHarnessAdapter('opencode')!;
    const spec = buildHarnessLaunch(adapter, { ...ctx('sandboxed', 'opencode'), workspaceDir: 'C:\\ws\\proj' });
    expect(spec.args).toEqual(['opencode', 'run', '--dir', 'C:/ws/proj']);
    expect(buildHarnessLaunch(adapter, { ...ctx('full', 'opencode'), workspaceDir: '/ws' }).args)
      .toEqual(['opencode', 'run', '--dir', '/ws', '--auto']);
  });

  it('cursor-agent only adds --force for full', () => {
    expect(launch('cursor-agent', 'sandboxed').args).not.toContain('--force');
    expect(launch('cursor-agent', 'full').args).toContain('--force');
  });

  it('aider passes the prompt and verdict files as flags', () => {
    const args = launch('aider', 'sandboxed').args;
    expect(args).toEqual(expect.arrayContaining(['--message-file', '--file', '--yes-always', '--no-suggest-shell-commands']));
  });

  it('pi restricts tools when sandboxed', () => {
    expect(launch('pi', 'sandboxed').args).toEqual(['pi', '--no-session', '--tools', 'read,write,edit', '-p']);
    expect(launch('pi', 'full').args).toEqual(['pi', '--no-session', '--approve', '-p']);
  });

  it('cursor-agent honours the resolved binary name', () => {
    const adapter = getHarnessAdapter('cursor-agent')!;
    expect(buildHarnessLaunch(adapter, ctx('full', 'agent')).args[0]).toBe('agent');
  });
});

describe('helpers', () => {
  it('pointerPrompt names the file with forward slashes', () => {
    expect(pointerPrompt('C:\\ws\\p.md')).toContain('C:/ws/p.md');
  });

  it('maps chat-provider dropdown values to harnesses', () => {
    expect(harnessForChatProvider('copilot')).toBe('copilot-cli');
    expect(harnessForChatProvider('cursor')).toBe('cursor-agent');
    expect(harnessForChatProvider('auto')).toBeUndefined();
  });
});

describe('model per agent (flags read from each CLI --help, 2026-11-25)', () => {
  const withModel = (id: string, model?: string) =>
    buildHarnessLaunch(getHarnessAdapter(id)!, { ...ctx('sandboxed', getHarnessAdapter(id)!.binaries[0]), model }).args;

  it.each([
    ['claude', ['--model', 'sonnet']],
    ['codex', ['-m', 'sonnet']],
    ['gemini', ['-m', 'sonnet']],
    ['opencode', ['-m', 'sonnet']],
    ['aider', ['--model', 'sonnet']],
    ['pi', ['--model', 'sonnet']],
  ])('%s passes the model with its own flag', (id, flag) => {
    const args = withModel(id, 'sonnet');
    const at = args.indexOf(flag[0]);
    expect(at).toBeGreaterThan(0);
    expect(args[at + 1]).toBe('sonnet');
    expect(getHarnessAdapter(id)!.acceptsModel).toBe(true);
  });

  it('keeps codex reading the prompt from stdin last', () => {
    expect(withModel('codex', 'gpt-reserve').at(-1)).toBe('-');
  });

  it('leaves the CLI default when no model is set', () => {
    for (const a of HARNESS_ADAPTERS) {
      const args = buildHarnessLaunch(a, ctx('sandboxed', a.binaries[0])).args;
      expect(args).not.toContain('--model');
      expect(args).not.toContain('-m');
    }
  });

  it('does not claim a model flag for CLIs whose flag is unverified', () => {
    expect(getHarnessAdapter('copilot-cli')!.acceptsModel).toBeFalsy();
    expect(getHarnessAdapter('cursor-agent')!.acceptsModel).toBeFalsy();
  });
});
