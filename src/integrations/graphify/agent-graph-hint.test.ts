import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { codeGraphHint } from './agent-graph-hint';

const root = path.resolve('/work/app');
const graph = path.join(root, 'graphify-out', 'graph.json');
const has = (p: string) => p === graph;

describe('codeGraphHint', () => {
  it('points an agent in a worktree at the main checkout graph', () => {
    const hint = codeGraphHint({ root, runDir: path.resolve('/work/app.aac-worktrees/9.8'), exists: has, hasCli: () => true });
    expect(hint).toContain('graphify query "<question>"');
    expect(hint).toContain(`--graph "${graph}"`);
  });

  it('needs no --graph when the agent runs in the main checkout', () => {
    const hint = codeGraphHint({ root, runDir: root, exists: has, hasCli: () => true });
    expect(hint).toContain('graphify query "<question>"');
    expect(hint).not.toContain('--graph');
  });

  it('says nothing without a graph or without the graphify command', () => {
    expect(codeGraphHint({ root, runDir: root, exists: () => false, hasCli: () => true })).toBeUndefined();
    expect(codeGraphHint({ root, runDir: root, exists: has, hasCli: () => false })).toBeUndefined();
    expect(codeGraphHint({ root: undefined, runDir: root, exists: has, hasCli: () => true })).toBeUndefined();
  });

  it('stays short, since it goes into every run prompt', () => {
    const hint = codeGraphHint({ root, runDir: path.resolve('/work/app.aac-worktrees/9.8'), exists: has, hasCli: () => true })!;
    expect(hint.length).toBeLessThan(600);
  });
});
