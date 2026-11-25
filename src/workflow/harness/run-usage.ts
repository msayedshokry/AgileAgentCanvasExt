// ─── Run usage (tokens) ──────────────────────────────────────────────────────
// What a run consumed, read after it ends from the harness's own session
// transcript. Claude Code writes `~/.claude/projects/<cwd-slug>/<session>.jsonl`
// with `message.usage` on assistant entries; because board runs set the
// session id, the run's tokens can be summed without parsing terminal output.
// Tokens, not dollars: a price table here would go stale and mislead.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface RunUsage {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

/** Claude Code's project folder name: every non-alphanumeric character becomes '-'. */
export function claudeTranscriptPath(cwd: string, sessionId: string, home = os.homedir()): string {
  return path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${sessionId}.jsonl`);
}

interface UsageFields {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Sum the usage of assistant messages at or after `sinceMs` (a resumed session
 * also holds earlier runs). Each message is logged once per content block with
 * the same id, so usage is counted once per message id.
 */
export function sumTranscriptUsage(jsonl: string, sinceMs = 0): RunUsage | undefined {
  const byMessage = new Map<string, UsageFields>();
  for (const line of jsonl.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let entry: { type?: string; timestamp?: string; message?: { id?: string; usage?: UsageFields } };
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // a partially written last line
    }
    const usage = entry.message?.usage;
    if (entry.type !== 'assistant' || !usage) continue;
    if (sinceMs && Date.parse(entry.timestamp ?? '') < sinceMs) continue;
    byMessage.set(entry.message?.id ?? `line-${byMessage.size}`, usage);
  }
  if (byMessage.size === 0) return undefined;
  let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
  for (const u of byMessage.values()) {
    input += num(u.input_tokens);
    output += num(u.output_tokens);
    cacheRead += num(u.cache_read_input_tokens);
    cacheWrite += num(u.cache_creation_input_tokens);
  }
  return { input, output, cacheRead, cacheWrite };
}

/** Usage for a finished Claude Code run, or undefined when there is no transcript. */
export function readClaudeRunUsage(cwd: string, sessionId: string, sinceMs: number): RunUsage | undefined {
  try {
    return sumTranscriptUsage(fs.readFileSync(claudeTranscriptPath(cwd, sessionId), 'utf-8'), sinceMs);
  } catch {
    return undefined; // not a Claude run, or the CLI kept no transcript
  }
}
