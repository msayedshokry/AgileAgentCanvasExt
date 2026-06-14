// ─── Failure Classifier ───────────────────────────────────────────────────────
// Classifies failures into transient / permanent / unknown via pattern matching.
// Used by retry engine (#18) and circuit breaker (#20).
//
// Issue: #14 — Failure Classifier

import { createLogger } from '../utils/logger';

const logger = createLogger('failure-classifier');

export type FailureCategory = 'transient' | 'permanent' | 'unknown';

export interface TraceEntryLike {
  message?: string;
  error?: string | Error;
  type?: string;
}

export interface ClassificationResult {
  category: FailureCategory;
  /** Matching pattern/regex that fired, if any. */
  matchedPattern?: string;
  /** Confidence 0..1; 1.0 for exact match, lower for heuristic. */
  confidence: number;
}

// ── Patterns ─────────────────────────────────────────────────────────────────

const TRANSIENT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/, label: 'network-error' },
  { pattern: /\b429\b|rate.?limit|too many requests/i, label: 'rate-limit' },
  { pattern: /\b5\d\d\b.*(?:unavailable|error|gateway)/i, label: 'http-5xx' },
  { pattern: /timeout.*exceeded|timed?\s*out/i, label: 'timeout' },
  { pattern: /service unavailable|api unavailable|temporarily unavailable/i, label: 'service-unavailable' },
  { pattern: /connection.*refused|connection.*reset/i, label: 'connection-failed' },
  { pattern: /socket hang up/i, label: 'socket-hangup' },
];

const PERMANENT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /schema validation failed|schema mismatch|invalid schema/i, label: 'schema-validation' },
  { pattern: /artifact not found|story not found|file not found/i, label: 'artifact-missing' },
  { pattern: /\b4\d\d\b.*(?:unauthorized|forbidden|not found|bad request)/i, label: 'http-4xx' },
  { pattern: /invalid input|invalid argument|invalid parameter|validation error/i, label: 'invalid-input' },
  { pattern: /permission denied|access denied/i, label: 'permission-denied' },
  { pattern: /syntax error|parse error|unexpected token/i, label: 'syntax-error' },
  { pattern: /type error|cannot read prop|cannot read property/i, label: 'type-error' },
  { pattern: /unsupported operation|not implemented/i, label: 'unsupported' },
];

// ── Classifier ───────────────────────────────────────────────────────────────

export class FailureClassifier {
  classify(error: unknown, traceEntries?: TraceEntryLike[]): ClassificationResult {
    const messages = this.collectMessages(error, traceEntries);
    const combined = messages.join('\n');
    if (!combined.trim()) {
      return { category: 'unknown', confidence: 0 };
    }

    // Permanent checks first — they tend to be more specific.
    for (const { pattern, label } of PERMANENT_PATTERNS) {
      if (pattern.test(combined)) {
        logger.debug('Classified as permanent', { pattern: label });
        return { category: 'permanent', matchedPattern: label, confidence: 0.9 };
      }
    }

    for (const { pattern, label } of TRANSIENT_PATTERNS) {
      if (pattern.test(combined)) {
        logger.debug('Classified as transient', { pattern: label });
        return { category: 'transient', matchedPattern: label, confidence: 0.85 };
      }
    }

    return { category: 'unknown', confidence: 0.3 };
  }

  private collectMessages(error: unknown, traceEntries?: TraceEntryLike[]): string[] {
    const out: string[] = [];
    if (error) {
      if (error instanceof Error) {
        out.push(error.message, error.name, error.stack ?? '');
      } else if (typeof error === 'string') {
        out.push(error);
      } else if (typeof error === 'object') {
        out.push(JSON.stringify(error));
      }
    }
    for (const entry of traceEntries ?? []) {
      if (entry.message) out.push(entry.message);
      if (entry.error) {
        if (typeof entry.error === 'string') out.push(entry.error);
        else if (entry.error instanceof Error) out.push(entry.error.message);
      }
      if (entry.type) out.push(entry.type);
    }
    return out;
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const failureClassifier = new FailureClassifier();
