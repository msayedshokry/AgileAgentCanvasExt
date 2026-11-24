// ─── Run journal ─────────────────────────────────────────────────────────────
// One record per in-flight harness run, persisted on every start and finish
// (not only on a clean shutdown) so a VS Code reload or crash mid-run can be
// resolved deterministically on the next activation. Pure fs; no vscode.

import * as fs from 'fs';
import * as path from 'path';

export interface RunRecord {
  readonly runId: string;
  readonly artifactId: string;
  readonly artifactType: string;
  readonly workflowId: string;
  readonly harness: string;
  /** Name of the VS Code terminal running the agent (to find it after a reload). */
  readonly terminalName: string;
  readonly resultPath: string;
  /** ms epoch */
  readonly startedAt: number;
  /** Column to return the card to if the run is lost. */
  readonly revertTo?: string;
}

export const RUN_JOURNAL_FILE = 'agent-runs.json';

function isRunRecord(value: unknown): value is RunRecord {
  const r = value as Record<string, unknown>;
  return !!r && typeof r === 'object'
    && typeof r.runId === 'string' && typeof r.artifactId === 'string'
    && typeof r.artifactType === 'string' && typeof r.workflowId === 'string'
    && typeof r.harness === 'string' && typeof r.terminalName === 'string'
    && typeof r.resultPath === 'string' && typeof r.startedAt === 'number'
    && (r.revertTo === undefined || typeof r.revertTo === 'string');
}

export class RunJournal {
  constructor(private readonly filePath: string) {}

  static inFolder(outputFolder: string): RunJournal {
    return new RunJournal(path.join(outputFolder, RUN_JOURNAL_FILE));
  }

  /** Valid records only; a corrupt file reads as empty (and is reported). */
  list(onError?: (err: unknown) => void): RunRecord[] {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      const parsed: unknown = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      return Array.isArray(parsed) ? parsed.filter(isRunRecord) : [];
    } catch (err) {
      onError?.(err);
      return [];
    }
  }

  add(record: RunRecord): void {
    this.write([...this.list().filter((r) => r.artifactId !== record.artifactId), record]);
  }

  remove(runId: string): void {
    const records = this.list();
    const next = records.filter((r) => r.runId !== runId);
    if (next.length !== records.length) this.write(next);
  }

  private write(records: RunRecord[]): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(records, null, 2), 'utf-8');
    fs.renameSync(tmp, this.filePath);  // atomic replace: a crash never leaves half a file
  }
}
