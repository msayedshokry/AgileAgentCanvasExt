// ─── Harness adapters ────────────────────────────────────────────────────────
// One declarative adapter per coding-agent CLI the board can drive headless.
// Pure module (no vscode import) so every adapter is unit-testable.
//
// Every flag below was checked against the CLI's own `--help` or official
// docs on 2026-11-19 (versions noted). When a CLI changes its flags, update
// the adapter AND its test in harness-adapters.test.ts.
//
// Prompt delivery never puts prompt text on the command line:
//   - 'stdin'   the staged prompt file is piped to the CLI's stdin
//   - 'pointer' the CLI gets a short ASCII instruction naming the prompt file
//               (for CLIs without a documented stdin prompt contract)
//   - 'file'    the CLI takes the prompt file path as a flag value

import type { LaunchSpec } from './shell-command';

export type HarnessId =
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'copilot-cli'
  | 'cursor-agent'
  | 'opencode'
  | 'aider'
  | 'pi';

/**
 * How much the agent may do without asking.
 *  - sandboxed: edit files in the workspace; no unrestricted shell where the CLI can express that
 *  - full:      every tool auto-approved (the CLI's "yolo"/bypass mode)
 */
export type PermissionPosture = 'sandboxed' | 'full';

export type PromptDelivery = 'stdin' | 'pointer' | 'file';

export interface LaunchContext {
  /** Resolved executable name or path (adapters with several binary names use it). */
  readonly binary: string;
  /** Absolute path of the staged prompt file. */
  readonly promptFile: string;
  /** Absolute path where the agent must write its verdict JSON. */
  readonly resultPath: string;
  readonly posture: PermissionPosture;
}

export interface HarnessAdapter {
  readonly id: HarnessId;
  readonly label: string;
  /** Executable names probed on PATH, in preference order. */
  readonly binaries: readonly string[];
  readonly delivery: PromptDelivery;
  /** Where the user installs it; shown in BLOCKED messages and the harness check. */
  readonly installHint: string;
  /** Postures this CLI can honour headless. 'full' is always supported. */
  readonly postures: readonly PermissionPosture[];
  /** Plain-language description of what each posture allows for this CLI. */
  readonly postureNotes: Readonly<Record<PermissionPosture, string>>;
  buildLaunch(ctx: LaunchContext): LaunchSpec;
}

/**
 * Short ASCII instruction for 'pointer' delivery. Contains no shell
 * metacharacters beyond the file path, which the shell layer quotes.
 */
export function pointerPrompt(promptFile: string): string {
  const p = promptFile.replace(/\\/g, '/');
  return `Read the file ${p} and carry out the task it describes exactly, including writing the verdict JSON file it specifies.`;
}

const claude: HarnessAdapter = {
  id: 'claude',
  label: 'Claude Code',
  binaries: ['claude'],
  delivery: 'stdin',
  installHint: 'Install Claude Code: https://docs.claude.com/en/docs/claude-code',
  postures: ['sandboxed', 'full'],
  postureNotes: {
    sandboxed: 'Read and edit files only (Read, Write, Edit, Glob, Grep); no shell commands.',
    full: 'All tools auto-approved (--dangerously-skip-permissions).',
  },
  // claude 2.1.x: `-p` prints and exits; with no positional prompt it reads stdin.
  // `acceptEdits` alone does not approve Write on a NEW file (the verdict
  // path is fresh each run), so Write is allow-listed explicitly.
  buildLaunch: ({ binary, posture }) => ({
    args: posture === 'full'
      ? [binary, '-p', '--permission-mode', 'bypassPermissions', '--dangerously-skip-permissions']
      : [binary, '-p', '--permission-mode', 'acceptEdits', '--allowedTools', 'Read Write Edit Glob Grep'],
  }),
};

const codex: HarnessAdapter = {
  id: 'codex',
  label: 'OpenAI Codex CLI',
  binaries: ['codex'],
  delivery: 'stdin',
  installHint: 'Install Codex CLI: npm i -g @openai/codex',
  postures: ['sandboxed', 'full'],
  postureNotes: {
    sandboxed: 'workspace-write sandbox: edits and commands confined to the workspace, no network.',
    full: 'No sandbox and no approvals (--dangerously-bypass-approvals-and-sandbox).',
  },
  // codex-cli 0.163: `exec` is non-interactive and never prompts; it no longer
  // accepts --ask-for-approval. `-` reads the prompt from stdin.
  // --skip-git-repo-check: exec refuses to run outside a git repo otherwise.
  buildLaunch: ({ binary, posture }) => ({
    args: posture === 'full'
      ? [binary, 'exec', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '-']
      : [binary, 'exec', '--sandbox', 'workspace-write', '--skip-git-repo-check', '-'],
  }),
};

const gemini: HarnessAdapter = {
  id: 'gemini',
  label: 'Gemini CLI',
  binaries: ['gemini'],
  delivery: 'pointer',
  installHint: 'Install Gemini CLI: npm i -g @google/gemini-cli',
  postures: ['sandboxed', 'full'],
  postureNotes: {
    sandboxed: 'Edit tools auto-approved (--approval-mode auto_edit); shell commands are denied headless.',
    full: 'All tools auto-approved (--approval-mode yolo).',
  },
  // gemini 0.35: `-p/--prompt` forces headless mode.
  buildLaunch: ({ binary, posture, promptFile }) => ({
    args: [binary, '--approval-mode', posture === 'full' ? 'yolo' : 'auto_edit', '-p', pointerPrompt(promptFile)],
  }),
};

const copilotCli: HarnessAdapter = {
  id: 'copilot-cli',
  label: 'GitHub Copilot CLI',
  binaries: ['copilot'],
  delivery: 'pointer',
  installHint: 'Install GitHub Copilot CLI: npm i -g @github/copilot',
  postures: ['sandboxed', 'full'],
  postureNotes: {
    sandboxed: 'File writes allowed, shell tool denied (--allow-tool=write --deny-tool=shell).',
    full: 'All tools allowed (--allow-all-tools).',
  },
  // docs.github.com copilot-cli command reference: -p runs programmatically
  // and exits; --no-ask-user stops it pausing for questions.
  buildLaunch: ({ binary, posture, promptFile }) => ({
    args: posture === 'full'
      ? [binary, '-p', pointerPrompt(promptFile), '--allow-all-tools', '--no-ask-user']
      : [binary, '-p', pointerPrompt(promptFile), '--allow-tool=write', '--deny-tool=shell', '--no-ask-user'],
  }),
};

const cursorAgent: HarnessAdapter = {
  id: 'cursor-agent',
  label: 'Cursor CLI',
  binaries: ['cursor-agent', 'agent'],
  delivery: 'pointer',
  installHint: 'Install Cursor CLI: https://cursor.com/docs/cli',
  postures: ['sandboxed', 'full'],
  postureNotes: {
    sandboxed: 'Print mode writes workspace files; unapproved shell commands are rejected.',
    full: 'Every action runs without approval (--force).',
  },
  // cursor.com/docs/cli/headless: print mode writes workspace files even
  // without --force; --force also approves shell, MCP and web tools.
  buildLaunch: ({ binary, posture, promptFile }) => ({
    args: [
      binary, '-p', pointerPrompt(promptFile), '--output-format', 'text',
      ...(posture === 'full' ? ['--force'] : []),
    ],
  }),
};

const opencode: HarnessAdapter = {
  id: 'opencode',
  label: 'OpenCode',
  binaries: ['opencode'],
  delivery: 'stdin',
  installHint: 'Install OpenCode: https://opencode.ai/docs/',
  postures: ['sandboxed', 'full'],
  postureNotes: {
    sandboxed: 'Uses the permission rules in your opencode config.',
    full: 'Auto-approves every permission not explicitly denied (--auto).',
  },
  // opencode 1.19: `run` with piped stdin; `--auto` is its yolo switch.
  buildLaunch: ({ binary, posture }) => ({
    args: posture === 'full' ? [binary, 'run', '--auto'] : [binary, 'run'],
  }),
};

const aider: HarnessAdapter = {
  id: 'aider',
  label: 'Aider',
  binaries: ['aider'],
  delivery: 'file',
  installHint: 'Install Aider: https://aider.chat/docs/install.html',
  postures: ['sandboxed', 'full'],
  postureNotes: {
    sandboxed: 'Edits files; shell-command suggestions disabled (--no-suggest-shell-commands).',
    full: 'Confirms every prompt, including suggested shell commands (--yes-always).',
  },
  // aider 0.86: --message-file runs one message and exits. The verdict file
  // is added with --file so aider is allowed to create it.
  buildLaunch: ({ binary, posture, promptFile, resultPath }) => ({
    args: [
      binary, '--message-file', promptFile, '--file', resultPath, '--yes-always',
      ...(posture === 'full' ? [] : ['--no-suggest-shell-commands']),
    ],
  }),
};

const pi: HarnessAdapter = {
  id: 'pi',
  label: 'Pi CLI',
  binaries: ['pi'],
  delivery: 'stdin',
  installHint: 'Install Pi CLI: https://github.com/badlogic/pi-mono',
  postures: ['sandboxed', 'full'],
  postureNotes: {
    sandboxed: 'Only read, write and edit tools enabled; no bash; project-local extensions not trusted.',
    full: 'All tools, and project-local files trusted (--approve).',
  },
  // pi 1.2: `-p` non-interactive with piped stdin; --tools is an allow-list.
  buildLaunch: ({ binary, posture }) => ({
    args: posture === 'full'
      ? [binary, '--no-session', '--approve', '-p']
      : [binary, '--no-session', '--tools', 'read,write,edit', '-p'],
  }),
};

/** All adapters, in auto-detection preference order. */
export const HARNESS_ADAPTERS: readonly HarnessAdapter[] = [
  claude, codex, gemini, copilotCli, cursorAgent, opencode, pi, aider,
];

export const HARNESS_IDS: readonly HarnessId[] = HARNESS_ADAPTERS.map((a) => a.id);

export function getHarnessAdapter(id: string): HarnessAdapter | undefined {
  return HARNESS_ADAPTERS.find((a) => a.id === id);
}

/**
 * Build the launch spec for an adapter, wiring stdin delivery. Callers never
 * construct LaunchSpec.stdinFile themselves, so delivery cannot drift from
 * the adapter's declaration.
 */
export function buildHarnessLaunch(adapter: HarnessAdapter, ctx: LaunchContext): LaunchSpec {
  if (!adapter.postures.includes(ctx.posture)) {
    throw new Error(`${adapter.label} cannot run with the "${ctx.posture}" permission posture`);
  }
  const spec = adapter.buildLaunch(ctx);
  return adapter.delivery === 'stdin' ? { args: spec.args, stdinFile: ctx.promptFile } : { args: spec.args };
}

/**
 * Map the canvas chat-provider dropdown value to the harness it implies, so
 * a user who picked "Codex" in the dropdown gets Codex on the board too.
 */
export function harnessForChatProvider(providerId: string): HarnessId | undefined {
  switch (providerId) {
    case 'claude': return 'claude';
    case 'codex': return 'codex';
    case 'opencode': return 'opencode';
    case 'aider': return 'aider';
    case 'pi': return 'pi';
    case 'copilot': return 'copilot-cli';
    case 'cursor': return 'cursor-agent';
    default: return undefined;
  }
}
