// ─── Harness readiness ───────────────────────────────────────────────────────
// "Installed" is not "usable": every CLI on a real dev machine was installed
// but signed out or out of credit (2026-11-19). This module answers, per
// harness: installed? which version? signed in? how to fix it? The probes are
// local status commands (no model calls) checked against each CLI's help.

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HARNESS_ADAPTERS, type HarnessAdapter, type HarnessId } from './harness-adapters';

/**
 * ready       the CLI reports a signed-in session / key present
 * configured  credentials exist but the CLI cannot say whether they work
 * signed-out  the CLI reports no session / no key
 * unknown     the CLI offers no offline status check
 */
export type AuthState = 'ready' | 'configured' | 'signed-out' | 'unknown';

export interface AuthSpec {
  /** Local status command (args after the binary); never calls a model. */
  readonly probe?: readonly string[];
  readonly interpret?: (output: string, exitCode: number | null) => AuthState;
  /** Environment variables that hold a usable API key for this CLI. */
  readonly envKeys?: readonly string[];
  /** Args that start the CLI's sign-in flow (run in a visible terminal). */
  readonly login?: readonly string[];
  readonly loginHint: string;
}

export const AUTH_SPECS: Readonly<Record<HarnessId, AuthSpec>> = {
  claude: {
    // claude 2.1: `claude auth status` prints JSON with "loggedIn".
    probe: ['auth', 'status'],
    interpret: (out) => (/"loggedIn"\s*:\s*true/.test(out) ? 'ready' : /"loggedIn"\s*:\s*false/.test(out) ? 'signed-out' : 'unknown'),
    envKeys: ['ANTHROPIC_API_KEY'],
    login: ['auth', 'login'],
    loginHint: 'Signs in to your Anthropic account in the terminal.',
  },
  codex: {
    // codex-cli 0.163: `codex login status` → "Logged in using …" / "Not logged in".
    probe: ['login', 'status'],
    interpret: (out, code) => (/not logged in/i.test(out) ? 'signed-out' : /logged in/i.test(out) && code === 0 ? 'ready' : 'unknown'),
    envKeys: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
    login: ['login'],
    loginHint: 'Signs in with ChatGPT or an API key in the terminal.',
  },
  gemini: {
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    login: [],
    loginHint: 'Opens Gemini CLI; choose a sign-in method when it asks.',
  },
  'copilot-cli': {
    envKeys: ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'],
    login: [],
    loginHint: 'Opens Copilot CLI; type /login to sign in.',
  },
  'cursor-agent': {
    probe: ['status'],
    interpret: (out) => (/not (?:logged|signed) in/i.test(out) ? 'signed-out' : /(?:logged|signed) in/i.test(out) ? 'ready' : 'unknown'),
    envKeys: ['CURSOR_API_KEY'],
    login: ['login'],
    loginHint: 'Signs in to Cursor in the terminal.',
  },
  opencode: {
    // opencode 1.19: `opencode auth list` prints one "●" row per stored credential.
    probe: ['auth', 'list'],
    interpret: (out) => (/●/.test(out) ? 'configured' : 'signed-out'),
    login: ['auth', 'login'],
    loginHint: 'Adds a provider credential in the terminal.',
  },
  pi: {
    login: [],
    loginHint: 'Opens Pi; type /login to sign in to a provider.',
  },
  aider: {
    envKeys: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY'],
    loginHint: 'Aider reads API keys from environment variables or .aider.conf.yml (https://aider.chat/docs/config/api-keys.html).',
  },
};

export interface HarnessReadiness {
  readonly id: HarnessId;
  readonly label: string;
  readonly installed: boolean;
  readonly binary?: string;
  readonly version?: string;
  readonly auth: AuthState;
  /** One line explaining the auth state. */
  readonly authDetail: string;
  readonly installHint: string;
  readonly canSignIn: boolean;
}

export interface ReadinessDeps {
  readonly isOnPath: (bin: string) => boolean;
  /** Run `<binary> ...args` with a timeout; resolves output + exit code (never rejects). */
  readonly run: (binary: string, args: readonly string[]) => Promise<{ output: string; code: number | null }>;
  readonly env: NodeJS.ProcessEnv;
  /** Aider honours a local OpenAI-compatible server from its config file. */
  readonly aiderConfigHasApiBase: () => boolean;
}

const firstLine = (s: string): string => s.split(/\r?\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 80) ?? '';
/** "2.1.294 (Claude Code)" → "2.1.294": the label is already shown next to it. */
const versionOnly = (s: string): string => firstLine(s).replace(/\s*\([^)]*\)\s*$/, '');

async function authFor(adapter: HarnessAdapter, binary: string, deps: ReadinessDeps): Promise<{ auth: AuthState; detail: string }> {
  const spec = AUTH_SPECS[adapter.id];
  const envKey = spec.envKeys?.find((k) => (deps.env[k] ?? '').trim().length > 0);
  if (spec.probe && spec.interpret) {
    const { output, code } = await deps.run(binary, spec.probe);
    const state = spec.interpret(output, code);
    if (state === 'ready') return { auth: 'ready', detail: 'Signed in' };
    if (envKey) return { auth: 'ready', detail: `Uses ${envKey}` };
    if (state === 'configured') return { auth: 'configured', detail: 'Credentials stored; validity is checked on first run' };
    if (state === 'signed-out') return { auth: 'signed-out', detail: 'Not signed in' };
  }
  if (envKey) return { auth: 'ready', detail: `Uses ${envKey}` };
  if (adapter.id === 'aider' && deps.aiderConfigHasApiBase()) {
    return { auth: 'configured', detail: 'Uses the API base in .aider.conf.yml' };
  }
  if (adapter.id === 'aider') return { auth: 'signed-out', detail: 'No API key in the environment' };
  return { auth: 'unknown', detail: 'Sign-in state is checked on first run' };
}

export async function probeReadiness(deps: ReadinessDeps): Promise<HarnessReadiness[]> {
  return Promise.all(HARNESS_ADAPTERS.map(async (adapter): Promise<HarnessReadiness> => {
    const binary = adapter.binaries.find((b) => deps.isOnPath(b));
    const base = { id: adapter.id, label: adapter.label, installHint: adapter.installHint, canSignIn: AUTH_SPECS[adapter.id].login !== undefined };
    if (!binary) {
      return { ...base, installed: false, auth: 'unknown', authDetail: 'Not installed' };
    }
    const [{ output }, auth] = await Promise.all([deps.run(binary, ['--version']), authFor(adapter, binary, deps)]);
    return { ...base, installed: true, binary, version: versionOnly(output) || undefined, auth: auth.auth, authDetail: auth.detail };
  }));
}

// ── Default (real) dependencies ───────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 10_000;

export function runProbe(binary: string, args: readonly string[]): Promise<{ output: string; code: number | null }> {
  return new Promise((resolve) => {
    // Binary names and args are fixed literals from this module, never user
    // input. Windows needs a shell so npm's .cmd shims resolve.
    const opts = { timeout: PROBE_TIMEOUT_MS, windowsHide: true, env: { ...process.env, NO_COLOR: '1' } };
    const done = (err: cp.ExecFileException | null, stdout: string, stderr: string) => {
      const code = err && typeof err.code === 'number' ? err.code : err ? null : 0;
      resolve({ output: `${stdout ?? ''}\n${stderr ?? ''}`, code });
    };
    if (process.platform === 'win32') cp.exec([binary, ...args].join(' '), opts, done);
    else cp.execFile(binary, [...args], opts, done);
  });
}

export function aiderConfigHasApiBase(home = os.homedir()): boolean {
  try {
    return /^\s*openai-api-base\s*:/m.test(fs.readFileSync(path.join(home, '.aider.conf.yml'), 'utf-8'));
  } catch {
    return false;
  }
}
