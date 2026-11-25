// ─── Automatic retry policy ─────────────────────────────────────────────────
// A failed run is retried automatically only when another attempt can
// plausibly succeed without anyone changing anything: a network blip, an
// agent that went silent, a run that ended without its verdict file. Failures
// that need a person (sign-in, API key, model access, install, spent quota)
// or that would just burn the same budget again (the run time limit) are
// surfaced at once with their fix actions instead of being retried.
// Pure: no vscode.

import { classifyAgentFailure, type AgentFailure, type AgentFailureKind } from './agent-failure';

/**
 * Failure kinds worth one automatic retry, with how long to wait first: a
 * rate limit or a provider outage needs a moment to clear, the rest can go
 * again at once. Everything else needs a person. Context overflow is not
 * here: the next run starts a fresh session anyway, but whether the card
 * needs splitting is the user's call.
 */
export const RETRY_DELAY_MS: Readonly<Partial<Record<AgentFailureKind, number>>> = {
  'network': 0,
  'stuck': 0,
  'no-verdict': 0,
  'unknown': 0,
  'rate-limit': 60_000,
  'provider-error': 15_000,
};

export const RETRYABLE_FAILURE_KINDS: ReadonlySet<AgentFailureKind> =
  new Set(Object.keys(RETRY_DELAY_MS) as AgentFailureKind[]);

export interface RetryDecision {
  readonly retry: boolean;
  /** The classified failure, when the summary named one. */
  readonly failure?: AgentFailure;
  /** How long to wait before the retry starts. */
  readonly delayMs: number;
  /** Why the run is or is not retried, for the log. */
  readonly reason: string;
}

/** Decide whether a run that ended with `summary` (an UNKNOWN verdict) gets another attempt. */
export function decideRetry(summary: string | undefined, aborted: boolean): RetryDecision {
  if (aborted) return { retry: false, delayMs: 0, reason: 'stopped by the user' };
  const failure = classifyAgentFailure(summary);
  if (!failure) return { retry: true, delayMs: 0, reason: 'no output to classify' };
  const delayMs = RETRY_DELAY_MS[failure.kind];
  return delayMs !== undefined
    ? { retry: true, failure, delayMs, reason: `retryable failure (${failure.kind})` }
    : { retry: false, failure, delayMs: 0, reason: `needs a person (${failure.kind}): ${failure.title}` };
}
