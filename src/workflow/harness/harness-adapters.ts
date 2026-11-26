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
  /** Workspace root the agent works in (for CLIs that need it named explicitly). */
  readonly workspaceDir?: string;
  /**
   * Conversation to start or continue, for adapters with `sessionResume`.
   * See card-session.ts for when a session is resumed.
   */
  readonly session?: { readonly id: string; readonly resume: boolean };
  /** Model id for adapters with `acceptsModel`; undefined uses the CLI's default. */
  readonly model?: string;
  /**
   * The board's MCP server for this run (adapters with `boardTools`): the
   * shim command and, for Claude Code, a ready MCP config file.
   */
  readonly board?: BoardMcpLaunch;
}

export interface BoardMcpLaunch {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  /** `{"mcpServers": {"aac_board": …}}` written for this run (Claude Code's --mcp-config). */
  readonly configFile: string;
}

export const BOARD_MCP_SERVER = 'aac_board';
/** board_ask waits up to 10 minutes for the user; give the call a minute more. */
export const BOARD_TOOL_TIMEOUT_SEC = 660;

/** A TOML literal string: no escapes, so Windows paths pass as they are. */
const tomlLiteral = (s: string) => `'${s.replace(/'/g, '')}'`;

/** Codex `-c` overrides that register the board server for this run only. */
function codexBoardOverrides(board: BoardMcpLaunch | undefined): string[] {
  if (!board) return [];
  const prefix = `mcp_servers.${BOARD_MCP_SERVER}`;
  const env = Object.entries(board.env).map(([k, v]) => `${k} = ${tomlLiteral(v)}`).join(', ');
  return [
    '-c', `${prefix}.command=${tomlLiteral(board.command)}`,
    '-c', `${prefix}.args=[${board.args.map(tomlLiteral).join(', ')}]`,
    ...(env ? ['-c', `${prefix}.env={ ${env} }`] : []),
    // Headless exec refuses MCP calls that would need approval; these tools only
    // act on the run's own card, so this one server is pre-approved (0.163
    // accepts auto|approve|prompt|writes). board_ask may wait 10 minutes.
    '-c', `${prefix}.default_tools_approval_mode='approve'`,
    '-c', `${prefix}.tool_timeout_sec=${BOARD_TOOL_TIMEOUT_SEC}`,
  ];
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
  /** True when the CLI can start a conversation with a chosen id and resume it later. */
  readonly sessionResume?: boolean;
  /** True when buildLaunch passes `ctx.model` to the CLI's model flag (flag checked against the CLI's --help). */
  readonly acceptsModel?: boolean;
  /** True when buildLaunch can register the board's MCP server for one run (`ctx.board`). */
  readonly boardTools?: boolean;
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
  // `--session-id <uuid>` names a new conversation; `--resume <uuid>` continues it.
  sessionResume: true,
  acceptsModel: true,
  // --mcp-config loads the board server for this run only; in the sandboxed
  // posture its tools are allow-listed by server name (claude 2.1.294).
  boardTools: true,
  buildLaunch: ({ binary, posture, session, model, board }) => ({
    args: [
      ...(posture === 'full'
        ? [binary, '-p', '--permission-mode', 'bypassPermissions', '--dangerously-skip-permissions']
        : [binary, '-p', '--permission-mode', 'acceptEdits', '--allowedTools', `Read Write Edit Glob Grep${board ? ` mcp__${BOARD_MCP_SERVER}` : ''}`]),
      ...(session ? [session.resume ? '--resume' : '--session-id', session.id] : []),
      ...(model ? ['--model', model] : []),
      ...(board ? ['--mcp-config', board.configFile] : []),
    ],
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
    sandboxed: 'workspace-write sandbox (unelevated on Windows): edits and commands confined to the workspace, no network.',
    full: 'No sandbox and no approvals (--dangerously-bypass-approvals-and-sandbox).',
  },
  // codex-cli 0.163: `exec` is non-interactive and never prompts; it no longer
  // accepts --ask-for-approval. `-` reads the prompt from stdin.
  // --skip-git-repo-check: exec refuses to run outside a git repo otherwise.
  // windows.sandbox=unelevated: on Windows, codex silently downgrades
  // workspace-write to read-only unless a Windows sandbox mode is configured,
  // so every shell write is "rejected: blocked by policy". The key is ignored
  // on other platforms. Unquoted so it stays a SAFE_ARG in every shell.
  acceptsModel: true,
  // `-c mcp_servers.<name>.*` registers the board server for this run without
  // touching ~/.codex/config.toml (checked with `codex mcp list`, 0.163).
  boardTools: true,
  buildLaunch: ({ binary, posture, model, board }) => {
    const m = [...(model ? ['-m', model] : []), ...codexBoardOverrides(board)];
    return {
      args: posture === 'full'
        ? [binary, 'exec', ...m, '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '-']
        : [binary, 'exec', ...m, '--sandbox', 'workspace-write', '-c', 'windows.sandbox=unelevated', '--skip-git-repo-check', '-'],
    };
  },
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
  acceptsModel: true,
  buildLaunch: ({ binary, posture, promptFile, model }) => ({
    args: [binary, ...(model ? ['-m', model] : []), '--approval-mode', posture === 'full' ? 'yolo' : 'auto_edit', '-p', pointerPrompt(promptFile)],
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

/** OpenCode permission policy for the sandboxed posture. */
export const OPENCODE_SANDBOX_PERMISSION = JSON.stringify({ edit: 'allow', bash: 'deny', webfetch: 'deny' });

const opencode: HarnessAdapter = {
  id: 'opencode',
  label: 'OpenCode',
  binaries: ['opencode'],
  delivery: 'stdin',
  installHint: 'Install OpenCode: https://opencode.ai/docs/',
  postures: ['sandboxed', 'full'],
  postureNotes: {
    sandboxed: 'File edits allowed, shell commands and web fetches denied (OPENCODE_PERMISSION).',
    full: 'Auto-approves every permission not explicitly denied (--auto).',
  },
  // opencode 1.19: `run` with piped stdin; `--auto` is its yolo switch.
  // Headless runs have nobody to answer an "ask" permission, which OpenCode
  // then rejects, so sandboxed runs could never write the verdict file
  // (verified against a local model, 2026-11-19). The run-scoped
  // OPENCODE_PERMISSION policy allows edits and denies shell and web.
  // OpenCode takes its project root from the inherited PWD variable, which can
  // point anywhere (VS Code launched from another shell); writes under the
  // real workspace then count as "external_directory" and are rejected.
  // --dir names the workspace explicitly.
  acceptsModel: true,
  buildLaunch: ({ binary, posture, workspaceDir, model }) => {
    const dir = workspaceDir ? ['--dir', workspaceDir.replace(/\\/g, '/')] : [];
    const m = model ? ['-m', model] : [];
    return posture === 'full'
      ? { args: [binary, 'run', ...dir, ...m, '--auto'] }
      : { args: [binary, 'run', ...dir, ...m], env: { OPENCODE_PERMISSION: OPENCODE_SANDBOX_PERMISSION } };
  },
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
  acceptsModel: true,
  buildLaunch: ({ binary, posture, promptFile, resultPath, model }) => ({
    args: [
      binary, ...(model ? ['--model', model] : []), '--message-file', promptFile, '--file', resultPath, '--yes-always',
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
  acceptsModel: true,
  buildLaunch: ({ binary, posture, model }) => {
    const m = model ? ['--model', model] : [];
    return {
      args: posture === 'full'
        ? [binary, '--no-session', ...m, '--approve', '-p']
        : [binary, '--no-session', ...m, '--tools', 'read,write,edit', '-p'],
    };
  },
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
  const env = spec.env ? { env: spec.env } : {};
  return adapter.delivery === 'stdin' ? { args: spec.args, stdinFile: ctx.promptFile, ...env } : { args: spec.args, ...env };
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
