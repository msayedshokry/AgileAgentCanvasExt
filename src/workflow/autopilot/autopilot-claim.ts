// ─── Run claims ──────────────────────────────────────────────────────────────
// Two VS Code windows on the same folder both run the scheduler. Before a
// scheduled run starts, the window claims `<id>@<minute>` by creating a file
// exclusively; only the window whose create succeeds runs it. Claims older
// than a day are pruned. Pure fs: no vscode.

import * as fs from 'fs';
import * as path from 'path';

export const CLAIMS_DIR = '.autopilot-claims';
const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

function claimFile(outputFolder: string, id: string, minute: string): string {
  return path.join(outputFolder, CLAIMS_DIR, `${id}@${minute.replace(/:/g, '-')}`);
}

/** True when this caller won the claim for (id, minute). */
export function claimScheduledRun(outputFolder: string, id: string, minute: string): boolean {
  const file = claimFile(outputFolder, id, minute);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.closeSync(fs.openSync(file, 'wx'));
    return true;
  } catch {
    return false;
  }
}

export function pruneClaims(outputFolder: string, now: number): void {
  const dir = path.join(outputFolder, CLAIMS_DIR);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > CLAIM_TTL_MS) fs.rmSync(file, { force: true });
    } catch {
      // another window pruned it first
    }
  }
}
