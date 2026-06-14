// ─── Auto-Retry Engine ────────────────────────────────────────────────────────
// Retries workflows on transient failures with exponential backoff. Skips
// permanent failures. Configurable maxRetries (default 3).
//
// Issue: #18 — Auto-Retry Engine

import { failureClassifier, FailureCategory } from './failure-classifier';
import { createLogger } from '../utils/logger';

const logger = createLogger('auto-retry-engine');

// ── Types ────────────────────────────────────────────────────────────────────

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  backoffMultiplier: number;
}

export interface RetryAttempt {
  attemptNumber: number;
  startedAt: number;
  finishedAt?: number;
  error?: unknown;
  category?: FailureCategory;
  succeeded?: boolean;
}

export interface RetryResult {
  storyId: string;
  totalAttempts: number;
  attempts: RetryAttempt[];
  finalCategory: FailureCategory;
  succeeded: boolean;
}

export type WorkFn = () => Promise<void>;

// ── Engine ───────────────────────────────────────────────────────────────────

export class AutoRetryEngine {
  private config: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 1_000,
    backoffMultiplier: 2,
  };

  setConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /** Run `work` with retry on transient failures. Skips on permanent. */
  async run(storyId: string, work: WorkFn): Promise<RetryResult> {
    const attempts: RetryAttempt[] = [];
    let delay = this.config.initialDelayMs;
    let lastCategory: FailureCategory = 'unknown';

    for (let i = 0; i <= this.config.maxRetries; i++) {
      const attempt: RetryAttempt = { attemptNumber: i + 1, startedAt: Date.now() };
      attempts.push(attempt);
      try {
        await work();
        attempt.finishedAt = Date.now();
        attempt.succeeded = true;
        // No category on success — only failures get classified.
        logger.info('Retry succeeded', { storyId, attempt: i + 1 });
        return {
          storyId,
          totalAttempts: i + 1,
          attempts,
          finalCategory: 'unknown', // success — no failure category
          succeeded: true,
        };
      } catch (err) {
        attempt.finishedAt = Date.now();
        attempt.error = err;
        const classification = failureClassifier.classify(err);
        attempt.category = classification.category;
        lastCategory = classification.category;

        if (classification.category === 'permanent') {
          logger.warn('Permanent failure — skipping retries', { storyId, attempt: i + 1 });
          break;
        }

        if (classification.category === 'unknown') {
          // Treat unknown as not-retryable by default — safer to surface
          logger.warn('Unknown failure — skipping retries', { storyId, attempt: i + 1 });
          break;
        }

        // Transient — retry with backoff if attempts remain
        if (i < this.config.maxRetries) {
          logger.info('Transient failure — retrying', {
            storyId, attempt: i + 1, delay, error: String(err),
          });
          await sleep(delay);
          delay *= this.config.backoffMultiplier;
        }
      }
    }

    logger.warn('Retries exhausted', { storyId, totalAttempts: attempts.length });
    return {
      storyId,
      totalAttempts: attempts.length,
      attempts,
      finalCategory: lastCategory,
      succeeded: false,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const autoRetryEngine = new AutoRetryEngine();
