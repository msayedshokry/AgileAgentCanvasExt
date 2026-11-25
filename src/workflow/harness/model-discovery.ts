// ─── Model discovery per agent CLI ───────────────────────────────────────────
// The agent editor offers the models each installed CLI can actually run,
// asked of the CLI itself rather than a list baked in here that would go
// stale. Every command below is read-only and starts no model call:
//   claude   — `list_models` control request over stream-json, no user turn
//              sent; --bare skips the user's hooks and plugins.
//   codex    — `codex debug models` (JSON).
//   opencode — `opencode models` (one provider/model per line).
//   pi       — `pi --list-models` (table: provider, model, …).
// Other CLIs, or a failed discovery, fall back to typing a model by hand.
// A saved model is never dropped because a later list omits it.
// Verified locally 2026-11-25: claude 2.1.294, codex-cli 0.163, opencode 1.19, pi 1.2.

import * as cp from 'child_process';

export interface DiscoveredModel {
  /** What is passed to the CLI's model flag. */
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

export interface ModelCatalog {
  readonly models: readonly DiscoveredModel[];
  /** False when this CLI has no listing command: the editor asks for a typed model. */
  readonly supported: boolean;
  /** Why discovery failed, when it did. */
  readonly error?: string;
}

const DISCOVERY_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_MODELS = 200;

export const CLAUDE_LIST_MODELS_REQUEST =
  `${JSON.stringify({ type: 'control_request', request_id: 'aac-list-models', request: { subtype: 'list_models' } })}\n`;

// ── Parsers (pure) ──────────────────────────────────────────────────────────

export function parseClaudeModels(stdout: string): DiscoveredModel[] {
  for (const line of stdout.split('\n')) {
    if (!line.includes('"control_response"')) continue;
    try {
      const msg = JSON.parse(line) as { response?: { response?: { models?: unknown } } };
      const models = msg.response?.response?.models;
      if (!Array.isArray(models)) continue;
      return models
        .filter((m): m is { value: string; displayName?: string; description?: string } => typeof m?.value === 'string')
        .map((m) => ({ id: m.value, label: m.displayName ?? m.value, ...(m.description ? { description: m.description } : {}) }));
    } catch {
      continue;
    }
  }
  return [];
}

export function parseCodexModels(stdout: string): DiscoveredModel[] {
  const start = stdout.indexOf('{');
  if (start < 0) return [];
  try {
    const data = JSON.parse(stdout.slice(start)) as { models?: Array<{ slug?: unknown; display_name?: unknown; description?: unknown }> };
    return (data.models ?? [])
      .filter((m) => typeof m.slug === 'string')
      .map((m) => ({
        id: m.slug as string,
        label: typeof m.display_name === 'string' ? m.display_name : (m.slug as string),
        ...(typeof m.description === 'string' ? { description: m.description } : {}),
      }));
  } catch {
    return [];
  }
}

export function parseOpenCodeModels(stdout: string): DiscoveredModel[] {
  return stdout.split(/\r?\n/).map((l) => l.trim())
    .filter((l) => /^[\w.-]+\/[\w.:@[\]-]+$/.test(l))
    .map((id) => ({ id, label: id }));
}

/** `pi --list-models`: a header row starting with "provider", then provider/model columns. */
export function parsePiModels(stdout: string): DiscoveredModel[] {
  const lines = stdout.split(/\r?\n/);
  const header = lines.findIndex((l) => /^provider\s+model\b/.test(l.trim()));
  if (header < 0) return [];
  return lines.slice(header + 1)
    .map((l) => l.trim().split(/\s+/))
    .filter((cols) => cols.length >= 2 && cols[0] && cols[1])
    .map(([provider, model]) => ({ id: `${provider}/${model}`, label: `${model} (${provider})` }));
}

// ── Running the CLI ─────────────────────────────────────────────────────────

export type DiscoveryRunner = (binary: string, args: readonly string[], stdin?: string) => Promise<string>;

/** Runs a fixed, literal discovery command (never user input) and returns stdout. */
export const runDiscovery: DiscoveryRunner = (binary, args, stdin) =>
  new Promise((resolve, reject) => {
    // Windows needs a shell so npm's .cmd shims resolve. The command is built
    // from fixed literals (STRATEGIES), so joining it is safe.
    const opts = { windowsHide: true, env: { ...process.env, NO_COLOR: '1' } };
    const child = process.platform === 'win32'
      ? cp.spawn([binary, ...args].join(' '), { ...opts, shell: true })
      : cp.spawn(binary, [...args], opts);
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${binary} did not list its models within ${DISCOVERY_TIMEOUT_MS / 1000}s`)); }, DISCOVERY_TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', () => { clearTimeout(timer); resolve(out); });
    child.stdin.end(stdin ?? '');
  });

interface Strategy {
  readonly args: readonly string[];
  readonly stdin?: string;
  readonly parse: (stdout: string) => DiscoveredModel[];
}

const STRATEGIES: Readonly<Record<string, Strategy>> = {
  claude: {
    args: ['--bare', '--print', '--verbose', '--input-format', 'stream-json', '--output-format', 'stream-json', '--strict-mcp-config'],
    stdin: CLAUDE_LIST_MODELS_REQUEST,
    parse: parseClaudeModels,
  },
  codex: { args: ['debug', 'models'], parse: parseCodexModels },
  opencode: { args: ['models'], parse: parseOpenCodeModels },
  pi: { args: ['--list-models'], parse: parsePiModels },
};

export function supportsModelDiscovery(harnessId: string): boolean {
  return harnessId in STRATEGIES;
}

const cache = new Map<string, { at: number; catalog: ModelCatalog }>();

/** The CLI's own model list (cached for 10 minutes); never throws. */
export async function discoverModels(
  harnessId: string,
  binary: string,
  run: DiscoveryRunner = runDiscovery,
  now = Date.now(),
): Promise<ModelCatalog> {
  const strategy = STRATEGIES[harnessId];
  if (!strategy) return { models: [], supported: false };
  const key = `${harnessId}:${binary}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.catalog;
  let catalog: ModelCatalog;
  try {
    const models = strategy.parse(await run(binary, strategy.args, strategy.stdin)).slice(0, MAX_MODELS);
    catalog = models.length > 0
      ? { models, supported: true }
      : { models: [], supported: true, error: `${binary} returned no models (is it signed in?)` };
  } catch (err) {
    catalog = { models: [], supported: true, error: err instanceof Error ? err.message : String(err) };
  }
  // Failures are not cached, so the next open retries.
  if (!catalog.error) cache.set(key, { at: now, catalog });
  return catalog;
}

export function clearModelDiscoveryCache(): void {
  cache.clear();
}
