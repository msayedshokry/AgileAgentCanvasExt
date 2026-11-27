// Changes that never reach the code graph: graphify output, board artifacts,
// agent worktrees, backups, dependencies, git internals. An agent editing in
// its worktree used to set off a graph update every few seconds.

const IGNORED_SEGMENTS = ['graphify-out', 'node_modules', '.git', '.bmad-backup', '.aac-backup'];

export function changeAffectsGraph(fsPath: string, outputFolderName: string): boolean {
  const parts = fsPath.replace(/\\/g, '/').split('/');
  if (parts.some((p) => IGNORED_SEGMENTS.includes(p) || p === outputFolderName || p.endsWith('.aac-worktrees'))) return false;
  const i = parts.indexOf('.claude');
  return !(i >= 0 && ['worktrees', 'backups'].includes(parts[i + 1]));
}
