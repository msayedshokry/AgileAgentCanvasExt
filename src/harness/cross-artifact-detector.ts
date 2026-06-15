// ─── Cross-Artifact Harness Pattern Detector ─────────────────────────────────
// Detects systemic issues when the same policy fails on ≥3 artifacts.
// Aggregates findings into a dismissable banner for the Kanban toolbar.
//
// Issue: #4 — Cross-Artifact Harness Pattern Detector

import { createLogger } from '../utils/logger';

const logger = createLogger('cross-artifact-detector');

/** Default threshold for systemic failure detection. */
export const DEFAULT_CORRELATION_THRESHOLD = 3;

/** A single harness finding on one artifact. */
export interface HarnessFinding {
  artifactId: string;
  policyId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message?: string;
}

/** A correlated pattern: the same policy failing on multiple artifacts. */
export interface CorrelatedPattern {
  policyId: string;
  severity: HarnessFinding['severity'];
  affectedArtifactIds: string[];
  count: number;
  sampleMessage?: string;
}

/** Result of cross-artifact correlation. */
export interface CorrelationResult {
  /** All systemic patterns found (≥ threshold occurrences). */
  patterns: CorrelatedPattern[];
  /** Whether any patterns were detected. */
  hasSystemicIssues: boolean;
  /** Total findings analyzed. */
  totalFindings: number;
}

export class CrossArtifactHarnessDetector {
  private threshold: number;

  constructor(threshold: number = DEFAULT_CORRELATION_THRESHOLD) {
    if (threshold < 1) throw new Error('Threshold must be ≥ 1');
    this.threshold = threshold;
  }

  /**
   * Analyze findings across artifacts to find systemic patterns.
   * Returns all policy failures that appear on ≥ threshold artifacts.
   */
  correlate(findings: HarnessFinding[]): CorrelationResult {
    // Group by policyId → list of findings
    const byPolicy = new Map<string, HarnessFinding[]>();
    for (const f of findings) {
      const list = byPolicy.get(f.policyId) ?? [];
      list.push(f);
      byPolicy.set(f.policyId, list);
    }

    const patterns: CorrelatedPattern[] = [];
    for (const [policyId, group] of byPolicy) {
      const uniqueArtifacts = Array.from(new Set(group.map(f => f.artifactId)));
      if (uniqueArtifacts.length >= this.threshold) {
        // Pick the highest severity seen for this policy
        const severity = group.reduce<HarnessFinding['severity']>(
          (max, f) => severityRank(f.severity) > severityRank(max) ? f.severity : max,
          'low',
        );
        patterns.push({
          policyId,
          severity,
          affectedArtifactIds: uniqueArtifacts,
          count: uniqueArtifacts.length,
          sampleMessage: group[0]?.message,
        });
      }
    }

    // Sort by severity then by count
    patterns.sort((a, b) => {
      const s = severityRank(b.severity) - severityRank(a.severity);
      return s !== 0 ? s : b.count - a.count;
    });

    const result: CorrelationResult = {
      patterns,
      hasSystemicIssues: patterns.length > 0,
      totalFindings: findings.length,
    };

    if (result.hasSystemicIssues) {
      logger.warn('Systemic issues detected', {
        patternCount: patterns.length,
        threshold: this.threshold,
      });
    }

    return result;
  }

  /** Update the threshold dynamically. */
  setThreshold(n: number): void {
    if (n < 1) throw new Error('Threshold must be ≥ 1');
    this.threshold = n;
  }
}

function severityRank(s: HarnessFinding['severity']): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[s];
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const crossArtifactHarnessDetector = new CrossArtifactHarnessDetector();
