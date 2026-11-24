// ─── Harness results per Kanban card ────────────────────────────────────────
// Keeps the latest harness outcome for each policy on each artifact, so the
// Agentic Kanban card can show a "Policy failed" badge and the detail panel
// can list policies. Pure (no vscode import) so it can be unit-tested.
//
// Results are merged per policy: a pre-flight failure stays visible until
// that same policy passes, even if a later continuous check of other policies
// passes in between.

import type { HarnessEvaluatedEvent } from '../harness/policy-engine';

/** The shape the webview's KanbanItem.harnessResults expects. */
export interface CardHarnessResult {
  policyId: string;
  passed: boolean;
  severity: 'blocking' | 'advisory';
  failures: string[];
}

export class HarnessCardResults {
  private readonly byArtifact = new Map<string, Map<string, CardHarnessResult>>();

  /** Merge one evaluation and return the artifact's full, current result list. */
  record(event: HarnessEvaluatedEvent): CardHarnessResult[] {
    let policies = this.byArtifact.get(event.artifactId);
    if (!policies) {
      policies = new Map();
      this.byArtifact.set(event.artifactId, policies);
    }
    for (const r of event.results) {
      policies.set(r.policyId, {
        policyId: r.policyId,
        passed: r.passed,
        severity: r.severity,
        failures: [...r.failures],
      });
    }
    return this.get(event.artifactId);
  }

  get(artifactId: string): CardHarnessResult[] {
    return Array.from(this.byArtifact.get(artifactId)?.values() ?? []);
  }

  entries(): Array<[string, CardHarnessResult[]]> {
    return Array.from(this.byArtifact.keys(), id => [id, this.get(id)]);
  }
}
