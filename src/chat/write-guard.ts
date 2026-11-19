// ─── Write guard for the AI file-write tool ─────────────────────────────────
// The language model chooses the path, so a prompt-injected artifact could
// try to write a file that executes later (git hooks, VS Code tasks, npm
// scripts, CI workflows) or escape the workspace through a symlink. This
// guard resolves real paths and refuses those targets.

import * as fs from 'fs';
import * as path from 'path';

export type WriteCheck =
  | { readonly ok: true; readonly resolved: string }
  | { readonly ok: false; readonly reason: string };

/** Path segments that hold auto-executed or tooling configuration. */
const DENIED_SEGMENTS = ['.git', '.vscode', '.husky', 'node_modules', '.devcontainer'];
/** File names that run code or hold secrets when other tools read them. */
const DENIED_BASENAMES = [
  'package.json', 'package-lock.json', '.npmrc', '.yarnrc', '.yarnrc.yml', '.envrc',
  'makefile', 'dockerfile', '.gitattributes', '.gitmodules',
];

const isWindows = process.platform === 'win32';
const norm = (p: string): string => (isWindows ? p.toLowerCase() : p);

/** Real path of `p`, or of its deepest existing ancestor joined with the rest. */
function realpathOfNearest(p: string): string {
  let current = path.resolve(p);
  const tail: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...tail);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.join(current, ...tail);
      tail.unshift(path.basename(current));
      current = parent;
    }
  }
}

function within(target: string, root: string): boolean {
  const t = norm(target);
  const r = norm(root);
  return t === r || t.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

export function checkWritablePath(target: string, allowedRoots: readonly string[]): WriteCheck {
  if (!path.isAbsolute(target)) {
    return { ok: false, reason: `Path must be absolute: "${target}"` };
  }
  const resolved = realpathOfNearest(target);
  const roots = allowedRoots.filter(Boolean).map((r) => realpathOfNearest(r));
  const root = roots.find((r) => within(resolved, r));
  if (!root) {
    return { ok: false, reason: `"${target}" is outside the allowed AgileAgentCanvas paths (or escapes them through a link).` };
  }
  const rel = path.relative(root, resolved);
  const segments = rel.split(path.sep).map((s) => s.toLowerCase());
  const hit = segments.slice(0, -1).find((s) => DENIED_SEGMENTS.includes(s)) ?? segments.find((s) => DENIED_SEGMENTS.includes(s));
  if (hit) {
    return { ok: false, reason: `Writing inside "${hit}" is not allowed for agents: it holds tooling that runs automatically.` };
  }
  const base = path.basename(resolved).toLowerCase();
  if (DENIED_BASENAMES.includes(base) || base.startsWith('.env')) {
    return { ok: false, reason: `Writing "${path.basename(resolved)}" is not allowed for agents: it can run code or hold secrets.` };
  }
  if (segments[0] === '.github' && segments[1] === 'workflows') {
    return { ok: false, reason: 'Writing CI workflows (.github/workflows) is not allowed for agents.' };
  }
  return { ok: true, resolved };
}
