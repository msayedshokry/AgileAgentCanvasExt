import { describe, it, expect } from 'vitest';
import { changeAffectsGraph } from './graph-watch-filter';

const out = '.agileagentcanvas-context';

describe('changeAffectsGraph', () => {
  it('counts source edits in the project', () => {
    expect(changeAffectsGraph('D:\\app\\src\\features\\export.ts', out)).toBe(true);
    expect(changeAffectsGraph('/app/docs/guide.md', out)).toBe(true);
  });

  it('ignores agent worktrees, backups, board artifacts and graph output', () => {
    for (const p of [
      'D:\\app\\.claude\\worktrees\\card-9\\src\\a.ts',
      'D:\\app.aac-worktrees\\9.8\\src\\a.ts',
      '/app/.bmad-backup/2026/epics.json',
      '/app/.claude/backups/x.json',
      `/app/${out}/epics/epic-1/stories/1.1.json`,
      '/app/graphify-out/graph.json',
      '/app/node_modules/x/index.js',
      '/app/.git/index',
    ]) expect(changeAffectsGraph(p, out)).toBe(false);
  });
});
