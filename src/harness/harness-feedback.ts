// ─── Harness Feedback Accumulator (Continuous Governance Loop) ──────────────
// Accumulates policy evaluation results per artifact over time and feeds
// corrections back into agent prompts. This completes the observe → evaluate →
// → policy → feedback loop that the pre-flight/post-flight gates alone don't
// provide.
//
// Flow:
//   1. Agent action completes → trigger evaluate(phase='continuous')
//   2. Policies evaluate the result → produce findings
//   3. Findings accumulated per artifact → stored here
//   4. Next agent prompt for that artifact → inject accumulated feedback
//   5. Agent sees the feedback and adjusts behavior
//
// Escalation: repeated failures of the same policy on the same artifact
// automatically escalate severity from 'advisory' → 'warning' → 'blocking'.

import type { EvaluationResult } from './policy-engine';

const logger = createLogger('harness-feedback');

// ── Logger (inlined to avoid circular dependency with utils/logger) ─────────
function createLogger(_name: string) {
  return {
    debug: (...args: unknown[]) => console.debug(`[${_name}]`, ...args),
    info: (...args: unknown[]) => console.info(`[${_name}]`, ...args),
    warn: (...args: unknown[]) => console.warn(`[${_name}]`, ...args),
    error: (...args: unknown[]) => console.error(`[${_name}]`, ...args),
  };
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface FeedbackEntry {
  policyId: string;
  policyName: string;
  passed: boolean;
  failures: string[];
  severity: 'advisory' | 'warning' | 'blocking';
  /** How many consecutive times this policy has failed on this artifact */
  consecutiveFailures: number;
  /** Total evaluation count for this policy on this artifact */
  totalEvaluations: number;
  /** ISO timestamp of the most recent evaluation */
  lastEvaluated: string;
}

export interface ArtifactFeedback {
  artifactId: string;
  artifactType: string;
  entries: FeedbackEntry[];
  /** ISO timestamp of the last evaluation for any policy on this artifact */
  lastChecked: string;
}

export interface FormattedFeedback {
  /** Human-readable summary for prompt injection */
  summary: string;
  /** Number of active failures currently tracked */
  activeFailureCount: number;
  /** Number of escalated (blocking/warning) failures */
  escalatedCount: number;
  /** ISO timestamp */
  timestamp: string;
}

// ── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  /** Max entries per artifact before pruning oldest */
  MAX_ENTRIES_PER_ARTIFACT: 50,
  /** Failure count before auto-escalating advisory → warning */
  ESCALATE_ADVISORY_AFTER: 3,
  /** Failure count before auto-escalating warning → blocking */
  ESCALATE_WARNING_AFTER: 6,
  /** Max total entries across all artifacts before pruning oldest entries */
  MAX_TOTAL_ENTRIES: 10000,
  /** Remove entries that have been resolved (passed) for this many successive checks */
  PRUNE_RESOLVED_AFTER: 5,
  /** Max total artifacts tracked to prevent memory leaks */
  MAX_ARTIFACTS: 500,
};

// ── Feedback Service ───────────────────────────────────────────────────────

export class HarnessFeedbackService {
  /** Per-artifact feedback state */
  private feedback = new Map<string, ArtifactFeedback>();

  /** Ordered list of artifact IDs (oldest first) for LRU-style eviction */
  private artifactOrder: string[] = [];

  /**
   * Record evaluation results for an artifact.
   * Called by HarnessEngine.evaluate() after every evaluation phase.
   */
  recordEvaluation(
    artifactId: string,
    artifactType: string,
    results: EvaluationResult[]
  ): void {
    const now = new Date().toISOString();
    let existing = this.feedback.get(artifactId);

    if (!existing) {
      existing = {
        artifactId,
        artifactType,
        entries: [],
        lastChecked: now,
      };
      this.feedback.set(artifactId, existing);
      this.artifactOrder.push(artifactId);

      // LRU eviction: if we exceed the max, remove the oldest artifact
      if (this.artifactOrder.length > CONFIG.MAX_ARTIFACTS) {
        const oldest = this.artifactOrder.shift();
        if (oldest) this.feedback.delete(oldest);
      }
    }

    existing.lastChecked = now;

    for (const result of results) {
      const entry = existing.entries.find(e => e.policyId === result.policyId);

      if (entry) {
        // Update existing entry
        entry.totalEvaluations++;
        entry.lastEvaluated = now;

        if (result.passed) {
          // Policy passed — reset consecutive failures but keep the entry
          // so we can prune it only after N successive passes.
          entry.consecutiveFailures = 0;
          entry.passed = true;
          entry.failures = [];
        } else {
          // Policy failed — increment and potentially escalate
          entry.consecutiveFailures++;
          entry.passed = false;
          entry.failures = result.failures;
          entry.severity = this.calculateEscalatedSeverity(
            result.severity,
            entry.consecutiveFailures
          );
        }
      } else {
        // New entry
        existing.entries.push({
          policyId: result.policyId,
          policyName: result.policyId, // filled from result if available
          passed: result.passed,
          failures: result.failures || [],
          severity: result.passed ? 'advisory' : result.severity,
          consecutiveFailures: result.passed ? 0 : 1,
          totalEvaluations: 1,
          lastEvaluated: now,
        });
      }
    }

    // Prune entries that have been resolved for N+ successive checks
    existing.entries = existing.entries.filter(e =>
      !e.passed || e.consecutiveFailures > 0 || e.totalEvaluations <= CONFIG.PRUNE_RESOLVED_AFTER
    );

    // Enforce max entries per artifact (keep the most recent)
    if (existing.entries.length > CONFIG.MAX_ENTRIES_PER_ARTIFACT) {
      existing.entries.sort((a, b) =>
        b.lastEvaluated.localeCompare(a.lastEvaluated)
      );
      existing.entries = existing.entries.slice(0, CONFIG.MAX_ENTRIES_PER_ARTIFACT);
    }

    // Enforce total entries cap across all artifacts (safety net)
    let totalEntries = 0;
    for (const [, fb] of this.feedback) totalEntries += fb.entries.length;
    if (totalEntries > CONFIG.MAX_TOTAL_ENTRIES) {
      // Prune oldest entries from the current artifact first
      existing.entries.sort((a, b) => a.lastEvaluated.localeCompare(b.lastEvaluated));
      const excess = totalEntries - CONFIG.MAX_TOTAL_ENTRIES;
      existing.entries = existing.entries.slice(excess);
    }

    logger.debug(
      `[HarnessFeedback] Recorded ${results.length} results for ${artifactId} ` +
      `(${existing.entries.length} active entries)`
    );
  }

  /**
   * Get formatted feedback for an artifact, suitable for injection into
   * an agent prompt.
   */
  getFeedbackForArtifact(
    artifactId: string,
    artifactType: string
  ): FormattedFeedback | null {
    const existing = this.feedback.get(artifactId);
    if (!existing) return null;

    const activeFailures = existing.entries.filter(e => !e.passed);
    if (activeFailures.length === 0) return null;

    const escalated = activeFailures.filter(
      e => e.severity === 'blocking' || e.severity === 'warning'
    );

    // Build a concise summary
    const lines: string[] = [];
    lines.push(`## Harness Governance Feedback (${activeFailures.length} active)`);
    lines.push('');

    for (const entry of activeFailures) {
      const icon = entry.severity === 'blocking'
        ? '⛔'
        : entry.severity === 'warning'
          ? '⚠️'
          : '💡';
      lines.push(
        `${icon} **${entry.policyName}** (${entry.severity}, ` +
        `${entry.consecutiveFailures}x consecutive)`
      );
      for (const failure of entry.failures) {
        lines.push(`   - ${failure}`);
      }
    }

    lines.push('');
    lines.push(
      '> These issues were identified by the Harness governance system. ' +
      'Consider addressing them in your current work.'
    );

    return {
      summary: lines.join('\n'),
      activeFailureCount: activeFailures.length,
      escalatedCount: escalated.length,
      timestamp: existing.lastChecked,
    };
  }

  /**
   * Get all active feedback across all artifacts for dashboard/reporting.
   */
  getAllActiveFeedback(): ArtifactFeedback[] {
    const result: ArtifactFeedback[] = [];
    for (const [, feedback] of this.feedback) {
      const active = feedback.entries.filter(e => !e.passed);
      if (active.length > 0) {
        result.push({ ...feedback, entries: active });
      }
    }
    return result;
  }

  /**
   * Clear feedback for a specific artifact (e.g., after it's been archived
   * or the user explicitly dismissed the feedback).
   */
  clearArtifactFeedback(artifactId: string): void {
    this.feedback.delete(artifactId);
    this.artifactOrder = this.artifactOrder.filter(id => id !== artifactId);
  }

  /**
   * Reset the entire feedback state (e.g., on project switch).
   */
  reset(): void {
    this.feedback.clear();
    this.artifactOrder = [];
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private calculateEscalatedSeverity(
    baseSeverity: 'blocking' | 'advisory',
    consecutiveFailures: number
  ): 'advisory' | 'warning' | 'blocking' {
    if (baseSeverity === 'blocking') return 'blocking';
    if (consecutiveFailures >= CONFIG.ESCALATE_WARNING_AFTER) return 'blocking';
    if (consecutiveFailures >= CONFIG.ESCALATE_ADVISORY_AFTER) return 'warning';
    return 'advisory';
  }
}

// Singleton
export const harnessFeedback = new HarnessFeedbackService();
