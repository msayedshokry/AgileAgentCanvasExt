// ─── Code graph note for board agents ────────────────────────────────────────
// graphify-out/ is usually gitignored, so the worktree a card runs in has no
// graph and the project's "query graphify first" rule never fires: agents
// fell back to grep. This note points them at the main checkout's graph.

import * as path from 'path';

export interface GraphHintInput {
  /** The workspace root (main checkout), where graphify-out/ lives. */
  readonly root: string | undefined;
  /** Where the agent runs: the card's worktree, or the root. */
  readonly runDir: string | undefined;
  readonly exists: (file: string) => boolean;
  /** The graphify command is on PATH (asked only when a graph exists). */
  readonly hasCli: () => boolean;
}

export function codeGraphHint({ root, runDir, exists, hasCli }: GraphHintInput): string | undefined {
  if (!root) return undefined;
  const graph = path.join(root, 'graphify-out', 'graph.json');
  if (!exists(graph) || !hasCli()) return undefined;
  const elsewhere = !!runDir && path.resolve(runDir) !== path.resolve(root);
  const flag = elsewhere ? ` --graph "${graph}"` : '';
  return [
    '## Code graph',
    `Before searching files for where something lives, ask the graph: \`graphify query "<question>"${flag}\``,
    `(about 2k tokens), or \`graphify explain "<symbol>"${flag}\` for one symbol.`,
    elsewhere ? 'It maps the main checkout, so it will not show your own edits.' : '',
  ].filter(Boolean).join('\n');
}
