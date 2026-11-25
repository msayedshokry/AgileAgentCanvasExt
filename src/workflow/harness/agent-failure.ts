// ─── Agent failure classification ───────────────────────────────────────────
// Turns a CLI's last output / verdict summary into a plain-language reason and
// the actions that fix it. Patterns come from real failures observed on
// 2026-11-19 (expired OAuth, expired keys, unsupported model, retired client,
// missing OPENAI_API_KEY) plus the common quota/network/not-found cases.
// Pure: no vscode.

export type AgentFailureKind =
  | 'signed-out'
  | 'missing-key'
  | 'model-unavailable'
  | 'client-retired'
  | 'quota'
  | 'rate-limit'
  | 'context-overflow'
  | 'provider-error'
  | 'not-installed'
  | 'network'
  | 'stuck'
  | 'time-limit'
  | 'no-verdict'
  | 'aborted'
  /** The agent stopped to ask the user something (board.questions); answered from the Inbox. */
  | 'needs-answer'
  | 'unknown';

/** Fix actions the board offers; the extension knows how to perform each. */
export type AgentFixAction = 'sign-in' | 'set-api-key' | 'switch-agent' | 'retry' | 'install' | 'open-output' | 'move-back';

export interface AgentFailure {
  readonly kind: AgentFailureKind;
  /** One short sentence for the card. */
  readonly title: string;
  /** The evidence: the line(s) that matched, or the summary. */
  readonly detail: string;
  readonly actions: readonly AgentFixAction[];
}

interface Rule {
  kind: AgentFailureKind;
  pattern: RegExp;
  title: string;
  actions: AgentFixAction[];
}

const RULES: Rule[] = [
  { kind: 'aborted', pattern: /\bRun aborted\b|Aborted by user/i, title: 'Stopped by you', actions: ['retry'] },
  { kind: 'client-retired', pattern: /no longer supported|migrate to|deprecated client|upgrade (?:your )?(?:cli|client)/i, title: 'This agent version is no longer supported — update it or switch agent', actions: ['install', 'switch-agent'] },
  { kind: 'missing-key', pattern: /api[_ ]?key (?:client option )?must be set|missing api key|(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE)_API_KEY|no api key|api key (?:is )?(?:not set|required)/i, title: 'The agent has no API key configured', actions: ['set-api-key', 'switch-agent'] },
  // A 403 "concurrent request limit" is a temporary rejection, not bad credentials,
  // even when the CLI prefixes it with an authentication error.
  { kind: 'rate-limit', pattern: /concurrent request limit/i, title: 'Too many requests at once to the model service — it usually clears in a minute', actions: ['retry', 'switch-agent'] },
  { kind: 'context-overflow', pattern: /prompt is too long|context[_ ]length[_ ]exceeded|maximum context length|context window (?:is )?(?:full|exceeded)|exceeds? the (?:model'?s? )?context/i, title: 'The conversation outgrew the model\'s context window', actions: ['retry', 'open-output', 'move-back'] },
  { kind: 'signed-out', pattern: /oauth (?:session )?expired|failed to authenticate|not logged in|please (?:log|sign) ?in|login required|invalid credential|authentication_error|\b401\b|unauthori[sz]ed|(?:api )?key has expired|token (?:has )?expired|invalid api key/i, title: 'The agent is signed out or its credentials expired', actions: ['sign-in', 'switch-agent'] },
  { kind: 'model-unavailable', pattern: /model[^\n]{0,80}(?:not supported|not found|does not exist|not available|unavailable)|model_not_found|unknown model|no access to model/i, title: "The agent's configured model isn't available to this account", actions: ['switch-agent', 'open-output'] },
  { kind: 'quota', pattern: /insufficient_quota|quota (?:exceeded|exhausted|reached)|exceeded (?:your )?(?:current )?quota|usage limit|credit balance|billing|\b402\b/i, title: 'The agent used up its quota or credits', actions: ['switch-agent', 'open-output'] },
  { kind: 'rate-limit', pattern: /rate.?limit|\b429\b|\b529\b|too many requests|overloaded|per minute|\b[tr]pm\b/i, title: 'The model service is rate-limiting or overloaded — it usually clears in a minute', actions: ['retry', 'switch-agent'] },
  { kind: 'provider-error', pattern: /\b50[0234]\b|internal server error|bad gateway|service unavailable|gateway timeout|\bapi_error\b/i, title: 'The model service had a server error', actions: ['retry', 'switch-agent'] },
  { kind: 'not-installed', pattern: /is not recognized as an internal or external command|command not found|not on PATH|ENOENT/i, title: 'The agent CLI is not installed or not on PATH', actions: ['install', 'switch-agent'] },
  { kind: 'network', pattern: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|getaddrinfo|network (?:error|is unreachable)|socket hang up|fetch failed/i, title: 'The agent could not reach its model service', actions: ['retry', 'open-output'] },
  { kind: 'stuck', pattern: /no agent output for \d+m|stopped as stuck/i, title: 'The agent went silent and was stopped as stuck', actions: ['retry', 'open-output', 'switch-agent'] },
  { kind: 'time-limit', pattern: /\(run time limit\)/i, title: 'The agent hit the run time limit', actions: ['open-output', 'retry', 'move-back'] },
  { kind: 'no-verdict', pattern: /without (?:writing )?a verdict|No verdict within|no structured verdict/i, title: 'The agent finished without reporting a result', actions: ['open-output', 'retry', 'move-back'] },
];

/** First line (trimmed, bounded) of `text` that matches `pattern`. */
function matchingLine(text: string, pattern: RegExp): string {
  const line = text.split(/\r?\n/).find((l) => pattern.test(l)) ?? text;
  return line.trim().slice(0, 300);
}

/**
 * Classify a failure. Checks the most specific causes first, so a run that
 * "exited without a verdict" because the key expired is reported as signed-out.
 */
export function classifyAgentFailure(text: string | undefined): AgentFailure | undefined {
  if (!text || !text.trim()) return undefined;
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return { kind: rule.kind, title: rule.title, detail: matchingLine(text, rule.pattern), actions: rule.actions };
    }
  }
  return { kind: 'unknown', title: 'The agent run did not finish', detail: text.trim().slice(0, 300), actions: ['open-output', 'retry', 'move-back'] };
}

/** Human labels for fix actions (shared with the webview through messages). */
export const FIX_ACTION_LABELS: Readonly<Record<AgentFixAction, string>> = {
  'sign-in': 'Sign in',
  'set-api-key': 'Set API key',
  'switch-agent': 'Switch agent',
  'retry': 'Retry',
  'install': 'Install / update',
  'open-output': 'Show output',
  'move-back': 'Move back',
};
