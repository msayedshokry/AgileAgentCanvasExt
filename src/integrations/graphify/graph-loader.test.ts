import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadGraph } from './graph-loader';

const dirs: string[] = [];
function workspaceWith(graph: unknown): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gfy-'));
  dirs.push(root);
  fs.mkdirSync(path.join(root, 'graphify-out'));
  fs.writeFileSync(path.join(root, 'graphify-out', 'graph.json'), JSON.stringify(graph));
  return root;
}

afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe('loadGraph', () => {
  it('reads relationships graphify writes as "links"', () => {
    const root = workspaceWith({
      nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      links: [{ source: 'a', target: 'b', relation: 'calls' }],
    });
    expect(loadGraph(root)?.edges).toEqual([{ source: 'a', target: 'b', relation: 'calls' }]);
  });

  it('still reads graphs that use "edges"', () => {
    const root = workspaceWith({ nodes: [{ id: 'a' }], edges: [{ source: 'a', target: 'a' }] });
    expect(loadGraph(root)?.edges).toHaveLength(1);
  });
});
