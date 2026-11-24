// ─── Shell-aware command-line construction ──────────────────────────────────
// Pure helpers (no vscode import) that turn a harness LaunchSpec into the one
// line typed into a terminal. Three shell families are supported because a
// public extension cannot assume the user's default shell:
//
//   posix       bash / zsh / sh / Git Bash / fish-compatible quoting
//   powershell  Windows PowerShell 5.1 and PowerShell 7 (pwsh)
//   cmd         cmd.exe
//
// Prompts never travel on the command line: they are staged to a file and
// either piped to stdin or referenced by a short ASCII pointer argument, so
// the only values quoted here are flags and file paths.

export type ShellKind = 'posix' | 'powershell' | 'cmd';

/** A fully-resolved harness invocation. */
export interface LaunchSpec {
  /** argv, first element is the executable. */
  readonly args: readonly string[];
  /** When set, this file's contents are fed to the process on stdin. */
  readonly stdinFile?: string;
  /** Extra environment variables for the CLI (e.g. a permission policy). */
  readonly env?: Readonly<Record<string, string>>;
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Shell statement(s) that set `env` for the command that follows. */
function envPrefix(env: Readonly<Record<string, string>> | undefined, kind: ShellKind): string {
  const entries = Object.entries(env ?? {});
  for (const [name] of entries) {
    if (!ENV_NAME.test(name)) throw new Error(`Invalid environment variable name: ${JSON.stringify(name)}`);
  }
  return entries.map(([name, value]) => {
    switch (kind) {
      case 'powershell':
        return `$env:${name}=${"'" + value.replace(/'/g, "''") + "'"}; `;
      case 'cmd':
        // set "N=V" protects the value; cmd still expands %VAR% and !VAR!.
        if (/[%!&|<>^\r\n]/.test(value)) {
          throw new Error(`Environment value cannot be safely set in cmd.exe: ${JSON.stringify(value)}`);
        }
        return `set "${name}=${value}" && `;
      default:
        return `${name}=${quoteArg(value, kind)} `;
    }
  }).join('');
}

// Deliberately excludes `,` and `@`: PowerShell turns `a,b` into an array
// (passed to native commands as separate argv entries) and `@x` into splatting.
const SAFE_ARG = /^[A-Za-z0-9_\-./:=]+$/;

/**
 * Classify a shell executable path (e.g. `vscode.env.shell`).
 * Unknown or empty values fall back by platform: PowerShell on Windows
 * (VS Code's default there), POSIX elsewhere.
 */
export function detectShellKind(shellPath: string | undefined, platform: NodeJS.Platform): ShellKind {
  const shell = (shellPath ?? '').toLowerCase().replace(/\\/g, '/');
  const base = shell.split('/').pop() ?? '';
  if (base.includes('pwsh') || base.includes('powershell')) return 'powershell';
  if (base === 'cmd' || base === 'cmd.exe') return 'cmd';
  if (base.length > 0) return 'posix';
  return platform === 'win32' ? 'powershell' : 'posix';
}

/** Quote one argument so the given shell passes it through as a single literal argv entry. */
export function quoteArg(arg: string, kind: ShellKind): string {
  if (arg === '') return kind === 'cmd' ? '""' : "''";
  if (SAFE_ARG.test(arg)) return arg;
  switch (kind) {
    case 'powershell':
      // Single-quoted strings are fully literal in PowerShell; only ' needs doubling.
      return "'" + arg.replace(/'/g, "''") + "'";
    case 'cmd':
      // cmd has no literal quoting; double quotes group, %VAR% still expands.
      // Escape % by doubling is not honoured interactively, so reject it.
      if (/[%"\r\n]/.test(arg)) {
        throw new Error(`Argument cannot be safely quoted for cmd.exe: ${JSON.stringify(arg)}`);
      }
      return `"${arg}"`;
    default:
      return "'" + arg.replace(/'/g, "'\\''") + "'";
  }
}

/** File paths are passed with forward slashes, which every target shell and CLI accepts. */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Build the single command line typed into the terminal.
 *
 * - posix:      `cli args < 'file'`
 * - cmd:        `cli args < "file"`
 * - powershell: `& { $OutputEncoding=UTF8; Get-Content -Raw -Encoding UTF8 'file' | cli args }`
 *   (PowerShell has no `<` operator; the UTF-8 pin stops PS 5.1 transcoding
 *   non-ASCII prompt text to '?'. The script block scopes the assignment.)
 */
export function buildCommandLine(spec: LaunchSpec, kind: ShellKind): string {
  if (spec.args.length === 0) throw new Error('LaunchSpec.args must not be empty');
  const [exe, ...rest] = spec.args;
  const invoke = kind === 'powershell' && !SAFE_ARG.test(exe)
    ? `& ${quoteArg(exe, kind)}`
    : quoteArg(exe, kind);
  const argv = [invoke, ...rest.map((a) => quoteArg(a, kind))].join(' ');
  const env = envPrefix(spec.env, kind);
  if (!spec.stdinFile) {
    // PowerShell needs a script block so the assignments and the call form one line.
    return env && kind === 'powershell' ? `& { ${env}${argv} }` : `${env}${argv}`;
  }

  const file = normalizePath(spec.stdinFile);
  switch (kind) {
    case 'powershell':
      return `& { ${env}$OutputEncoding=[System.Text.UTF8Encoding]::new(); Get-Content -Raw -Encoding UTF8 ${quoteArg(file, kind)} | ${argv} }`;
    case 'cmd':
      return `${env}${argv} < ${quoteArg(file, kind)}`;
    default:
      return `${env}${argv} < ${quoteArg(file, kind)}`;
  }
}
