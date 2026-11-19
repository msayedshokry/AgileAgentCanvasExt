// ─── Prompt staging ─────────────────────────────────────────────────────────
// Every headless run stages its prompt to a private file inside the workspace
// output folder. Inside the workspace (not os.tmpdir) so sandboxed CLIs are
// allowed to read it; mode 0600 + exclusive create so other local users and
// symlink tricks cannot read or redirect it; a `*` .gitignore so prompts
// never get committed.

import * as fs from 'fs';
import * as path from 'path';
import { sanitizeId } from '../kanban-verdict';

export const PROMPT_DIR_NAME = path.join('_terminal-output', 'prompts');
/** Prompt files older than this are swept on activation (crash leftovers). */
export const STALE_PROMPT_MS = 24 * 60 * 60 * 1000;

export function promptDir(outputFolder: string): string {
  return path.join(outputFolder, PROMPT_DIR_NAME);
}

function ensurePromptDir(outputFolder: string): string {
  const dir = promptDir(outputFolder);
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) {
    fs.writeFileSync(ignore, '*\n', 'utf-8');
  }
  return dir;
}

/** Write `prompt` to a fresh private file and return its absolute path. */
export function stagePromptFile(outputFolder: string, artifactId: string, runId: string, prompt: string): string {
  const dir = ensurePromptDir(outputFolder);
  const file = path.join(dir, `${sanitizeId(artifactId)}-${sanitizeId(runId)}.md`);
  fs.writeFileSync(file, prompt, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
  return path.resolve(file);
}

/** Remove a staged prompt. Missing files are fine; other errors are reported. */
export function disposePromptFile(file: string | undefined, onError?: (err: unknown) => void): void {
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') onError?.(err);
  }
}

/** Delete prompt files older than `maxAgeMs`. Returns how many were removed. */
export function sweepStalePromptFiles(outputFolder: string, now = Date.now(), maxAgeMs = STALE_PROMPT_MS): number {
  const dir = promptDir(outputFolder);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of entries) {
    if (!name.endsWith('.md')) continue;
    const file = path.join(dir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > maxAgeMs) {
        fs.unlinkSync(file);
        removed++;
      }
    } catch {
      // raced with another cleanup — ignore
    }
  }
  return removed;
}
