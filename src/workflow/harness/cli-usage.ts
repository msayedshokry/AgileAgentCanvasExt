// ─── Real token usage from CLI session logs ──────────────────────────────────
// Claude Code and Codex record exact token usage in their local session logs,
// so cost can be measured instead of estimated from text length:
//   claude  ~/.claude/projects/<cwd with non-alphanumerics → '-'>/<session>.jsonl
//           assistant lines carry message.usage {input_tokens, output_tokens,
//           cache_creation_input_tokens, cache_read_input_tokens}
//   codex   ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl; session_meta has the
//           cwd, token_count events carry info.total_token_usage
// Formats verified against real logs on 2026-11-19. Other harnesses fall back
// to the estimate.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface CliUsage {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

/** Fields read from the CLIs' JSONL logs (everything else is ignored). */
interface UsageFields {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cached_input_tokens?: number;
}
interface ClaudeLogLine {
  timestamp?: string;
  message?: { id?: string; model?: string; usage?: UsageFields };
}
interface CodexInfo { total_token_usage?: UsageFields }
interface CodexLogLine {
  type?: string;
  info?: CodexInfo;
  payload?: { type?: string; cwd?: string; timestamp?: string; model?: string; info?: CodexInfo };
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function jsonLines(file: string): unknown[] {
  try {
    return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).flatMap((l) => {
      try { return [JSON.parse(l)]; } catch { return []; }
    });
  } catch {
    return [];
  }
}

function filesModifiedSince(dir: string, sinceMs: number, suffix = '.jsonl'): string[] {
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith(suffix))
      .map((f) => path.join(dir, f))
      .filter((f) => fs.statSync(f).mtimeMs >= sinceMs);
  } catch {
    return [];
  }
}

/** Claude Code's project folder name for a working directory. */
export function claudeProjectDirName(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

/** Sum Claude usage for assistant messages logged at or after `sinceMs` in `cwd`. */
export function readClaudeUsage(cwd: string, sinceMs: number, home = os.homedir()): CliUsage | undefined {
  const dir = path.join(home, '.claude', 'projects', claudeProjectDirName(cwd));
  let model = 'claude';
  let found = false;
  const total = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  const seen = new Set<string>();
  for (const file of filesModifiedSince(dir, sinceMs)) {
    for (const line of jsonLines(file) as ClaudeLogLine[]) {
      const usage = line?.message?.usage;
      if (!usage || Date.parse(line.timestamp ?? '') < sinceMs) continue;
      // Streaming writes one line per content block with the same message id.
      const id = line.message?.id;
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      found = true;
      model = line.message?.model ?? model;
      total.inputTokens += num(usage.input_tokens);
      total.outputTokens += num(usage.output_tokens);
      total.cacheReadTokens += num(usage.cache_read_input_tokens);
      total.cacheCreationTokens += num(usage.cache_creation_input_tokens);
    }
  }
  return found ? { model, ...total } : undefined;
}

/** Usage of the Codex session(s) started in `cwd` at or after `sinceMs` (last cumulative count per session). */
export function readCodexUsage(cwd: string, sinceMs: number, home = os.homedir()): CliUsage | undefined {
  const start = new Date(sinceMs);
  const days = [start, new Date()].map((d) => path.join(home, '.codex', 'sessions',
    String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')));
  const norm = (p: string) => path.resolve(p).toLowerCase();
  let found = false;
  let model = 'codex';
  const total = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  for (const file of new Set(days.flatMap((d) => filesModifiedSince(d, sinceMs)))) {
    const lines = jsonLines(file) as CodexLogLine[];
    const meta = lines.find((l) => l?.type === 'session_meta')?.payload;
    if (!meta?.cwd || norm(meta.cwd) !== norm(cwd) || Date.parse(meta.timestamp ?? '') < sinceMs) continue;
    model = meta.model ?? model;
    const last = [...lines].reverse().find((l) => l?.payload?.type === 'token_count' || l?.type === 'token_count');
    const usage = (last?.payload ?? last)?.info?.total_token_usage;
    if (!usage) continue;
    found = true;
    const cached = num(usage.cached_input_tokens);
    total.inputTokens += Math.max(0, num(usage.input_tokens) - cached);
    total.cacheReadTokens += cached;
    total.outputTokens += num(usage.output_tokens);
  }
  return found ? { model, ...total } : undefined;
}

export function readCliUsage(harness: string, cwd: string, sinceMs: number, home?: string): CliUsage | undefined {
  try {
    if (harness === 'claude') return readClaudeUsage(cwd, sinceMs, home);
    if (harness === 'codex') return readCodexUsage(cwd, sinceMs, home);
  } catch {
    // unreadable logs → caller estimates
  }
  return undefined;
}
