// ─── Run recovery after a reload or crash ───────────────────────────────────
// Every journaled run from the previous session ends in exactly one state:
//   finished    its verdict file was written before/while the window reloaded
//   re-adopted  its agent terminal survived the reload: keep the lock and
//               wait for the verdict, then release
//   interrupted the agent is gone: release the lock and return the card to
//               the column it was in before the run
// All environment access is injected so the rules are unit-tested.

import type { KanbanVerdict } from '../kanban-verdict';
import type { RunJournal, RunRecord } from './run-journal';

export type RecoveryOutcome =
  | { readonly kind: 'finished'; readonly record: RunRecord; readonly verdict: KanbanVerdict }
  | { readonly kind: 're-adopted'; readonly record: RunRecord }
  | { readonly kind: 'interrupted'; readonly record: RunRecord; readonly reverted: boolean };

export interface RecoveryDeps {
  readonly journal: RunJournal;
  /** Verdict written by this run (run id checked), if any. */
  readonly readVerdict: (record: RunRecord) => KanbanVerdict | undefined;
  readonly isTerminalAlive: (record: RunRecord) => boolean;
  readonly acquireLock: (record: RunRecord) => boolean;
  readonly releaseLock: (artifactId: string) => void;
  readonly getStatus: (record: RunRecord) => string | undefined;
  readonly setStatus: (record: RunRecord, status: string) => Promise<void>;
  /** Start watching a re-adopted run; must call `done` when it finishes. */
  readonly watch: (record: RunRecord, done: (verdict: KanbanVerdict | undefined) => void) => void;
  readonly report: (outcome: RecoveryOutcome) => void;
}

/** Columns a run moves a card into; only these are reverted on interruption. */
const RUN_COLUMNS = new Set(['in-progress', 'review']);

export async function recoverRuns(deps: RecoveryDeps): Promise<RecoveryOutcome[]> {
  const outcomes: RecoveryOutcome[] = [];
  for (const record of deps.journal.list()) {
    const verdict = deps.readVerdict(record);
    let outcome: RecoveryOutcome;

    if (verdict) {
      deps.journal.remove(record.runId);
      deps.releaseLock(record.artifactId);
      outcome = { kind: 'finished', record, verdict };
    } else if (deps.isTerminalAlive(record) && deps.acquireLock(record)) {
      outcome = { kind: 're-adopted', record };
      deps.watch(record, (late) => {
        deps.journal.remove(record.runId);
        deps.releaseLock(record.artifactId);
        if (late) deps.report({ kind: 'finished', record, verdict: late });
        else deps.report({ kind: 'interrupted', record, reverted: false });
      });
    } else {
      deps.journal.remove(record.runId);
      deps.releaseLock(record.artifactId);
      let reverted = false;
      const current = deps.getStatus(record);
      if (record.revertTo && current && current !== record.revertTo && RUN_COLUMNS.has(current)) {
        await deps.setStatus(record, record.revertTo);
        reverted = true;
      }
      outcome = { kind: 'interrupted', record, reverted };
    }
    deps.report(outcome);
    outcomes.push(outcome);
  }
  return outcomes;
}
