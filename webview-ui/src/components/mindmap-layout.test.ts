/**
 * Tests for mindmap-layout.ts — pure logic, no DOM.
 */
import { describe, it, expect } from 'vitest';
import { computeMindmap, computeMindmapLayout, LAYOUT_CONSTANTS } from './mindmap-layout';
import type { Artifact } from '../types';

const { NODE_W, NODE_H, LEVEL_GAP, LEAF_GAP, BRANCH_GAP, ROOT_GAP, ROOT_X, ROOT_Y, HEADER_OFFSET } = LAYOUT_CONSTANTS;
const colX = (col: number) => ROOT_X + col * (NODE_W + LEVEL_GAP);

function art(id: string, type: Artifact['type'], parentId?: string, title = id): Artifact {
  return {
    id, type, title, parentId,
    description: '',
    status: 'draft',
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    dependencies: [],
    metadata: {},
  };
}

function byId(nodes: Artifact[]): Map<string, Artifact> {
  return new Map(nodes.map(n => [n.id, n]));
}

const centerY = (a: Artifact) => a.position.y + a.size.height / 2;

/** A realistic BMAD chain: brief → vision → PRD → req/arch → epics → stories. */
function project(): Artifact[] {
  return [
    art('brief', 'product-brief'),
    art('vision', 'vision', 'brief'),
    art('prd', 'prd', 'vision'),
    art('FR-1', 'requirement', 'prd'),
    art('FR-2', 'requirement', 'prd'),
    art('arch', 'architecture', 'prd'),
    art('ADR-1', 'architecture-decision', 'arch'),
    art('E-1', 'epic', 'FR-1'),
    art('E-2', 'epic', 'FR-2'),
    art('S-1.1', 'story', 'E-1'),
    art('S-1.2', 'story', 'E-1'),
    art('S-2.1', 'story', 'E-2'),
    art('T-1', 'task', 'S-1.1'),
  ];
}

describe('computeMindmap — basics', () => {
  it('returns nothing for empty input', () => {
    expect(computeMindmap([])).toEqual({ nodes: [], columns: [] });
    expect(computeMindmapLayout([])).toEqual([]);
  });

  it('emits exactly the input artifacts — no virtual nodes', () => {
    const input = project();
    const { nodes } = computeMindmap(input);
    expect(nodes.map(n => n.id).sort()).toEqual(input.map(a => a.id).sort());
  });

  it('does not mutate the input', () => {
    const input = [art('v', 'vision')];
    computeMindmap(input);
    expect(input[0].position).toEqual({ x: 0, y: 0 });
  });

  it('gives every node the fixed card size', () => {
    for (const n of computeMindmapLayout(project())) {
      expect(n.size).toEqual({ width: NODE_W, height: NODE_H });
    }
  });

  it('places a lone root at the top-left origin', () => {
    const [v] = computeMindmapLayout([art('v', 'vision')]);
    expect(v.position).toEqual({ x: ROOT_X, y: ROOT_Y });
  });
});

describe('computeMindmap — hierarchy columns', () => {
  it('puts each hierarchy level in its own column, left to right', () => {
    const m = byId(computeMindmapLayout(project()));
    expect(m.get('brief')!.position.x).toBe(colX(0));
    expect(m.get('vision')!.position.x).toBe(colX(1));
    expect(m.get('prd')!.position.x).toBe(colX(2));
    expect(m.get('FR-1')!.position.x).toBe(colX(3));
    expect(m.get('arch')!.position.x).toBe(colX(3));
    expect(m.get('E-1')!.position.x).toBe(colX(4));
    expect(m.get('ADR-1')!.position.x).toBe(colX(4));
    expect(m.get('S-1.1')!.position.x).toBe(colX(5));
    expect(m.get('T-1')!.position.x).toBe(colX(6));
  });

  it('keeps orphans in the column of their type', () => {
    // No brief/vision/PRD: requirement column collapses to the left, and an
    // orphan story still lines up with the other stories.
    const m = byId(computeMindmapLayout([
      art('FR-1', 'requirement'),
      art('E-1', 'epic', 'FR-1'),
      art('S-1', 'story', 'E-1'),
      art('S-orphan', 'story'),
    ]));
    expect(m.get('FR-1')!.position.x).toBe(colX(0));
    expect(m.get('E-1')!.position.x).toBe(colX(1));
    expect(m.get('S-1')!.position.x).toBe(colX(2));
    expect(m.get('S-orphan')!.position.x).toBe(colX(2));
  });

  it('always places a child right of its parent, even for out-of-order types', () => {
    // A vision parented under an epic would naturally sit left of it.
    const m = byId(computeMindmapLayout([art('E', 'epic'), art('V', 'vision', 'E')]));
    expect(m.get('V')!.position.x).toBeGreaterThan(m.get('E')!.position.x);
  });

  it('places unknown types one level right of their parent', () => {
    const m = byId(computeMindmapLayout([art('S', 'story'), art('R', 'research', 'S')]));
    expect(m.get('R')!.position.x).toBe(m.get('S')!.position.x + NODE_W + LEVEL_GAP);
  });
});

describe('computeMindmap — tidy vertical placement', () => {
  it('centres a parent on the span of its children', () => {
    const m = byId(computeMindmapLayout(project()));
    const e1 = m.get('E-1')!;
    const first = m.get('S-1.1')!;
    const last = m.get('S-1.2')!;
    expect(centerY(e1)).toBe((centerY(first) + centerY(last)) / 2);
  });

  it('aligns a single child with its parent (straight connector)', () => {
    const m = byId(computeMindmapLayout(project()));
    expect(m.get('vision')!.position.y).toBe(m.get('brief')!.position.y);
  });

  it('stacks leaf siblings with the leaf gap', () => {
    const m = byId(computeMindmapLayout([
      art('E', 'epic'), art('S1', 'story', 'E'), art('S2', 'story', 'E'),
    ]));
    expect(m.get('S2')!.position.y - m.get('S1')!.position.y).toBe(NODE_H + LEAF_GAP);
  });

  it('separates sibling branches with the larger branch gap', () => {
    const m = byId(computeMindmapLayout([
      art('R', 'requirement'),
      art('E1', 'epic', 'R'), art('S1', 'story', 'E1'),
      art('E2', 'epic', 'R'), art('S2', 'story', 'E2'),
    ]));
    expect(m.get('S2')!.position.y - m.get('S1')!.position.y).toBe(NODE_H + BRANCH_GAP);
  });

  it('separates root trees with the root gap', () => {
    const m = byId(computeMindmapLayout([art('E1', 'epic'), art('E2', 'epic')]));
    expect(m.get('E2')!.position.y - m.get('E1')!.position.y).toBe(NODE_H + ROOT_GAP);
  });

  it('keeps each subtree in its own contiguous band (no overlaps)', () => {
    const nodes = computeMindmapLayout(project());
    for (const a of nodes) {
      for (const b of nodes) {
        if (a === b || a.position.x !== b.position.x) continue;
        const apart = a.position.y + NODE_H <= b.position.y || b.position.y + NODE_H <= a.position.y;
        expect(apart, `${a.id} overlaps ${b.id}`).toBe(true);
      }
    }
    // All of E-1's stories sit above all of E-2's.
    const m = byId(nodes);
    expect(m.get('S-1.2')!.position.y).toBeLessThan(m.get('S-2.1')!.position.y);
  });
});

describe('computeMindmap — sibling order', () => {
  it('keeps source order within a type (E-2 before E-10 as authored)', () => {
    const m = byId(computeMindmapLayout([
      art('R', 'requirement'),
      art('E-2', 'epic', 'R', 'Zeta'),
      art('E-10', 'epic', 'R', 'Alpha'),
    ]));
    expect(m.get('E-2')!.position.y).toBeLessThan(m.get('E-10')!.position.y);
  });

  it('orders mixed siblings by hierarchy type', () => {
    const m = byId(computeMindmapLayout([
      art('prd', 'prd'),
      art('arch', 'architecture', 'prd'),
      art('risk', 'risk', 'prd'),
      art('FR', 'requirement', 'prd'),
    ]));
    const ys = ['FR', 'risk', 'arch'].map(id => m.get(id)!.position.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });
});

describe('computeMindmap — robustness', () => {
  it('treats a missing parent as a root', () => {
    const [s] = computeMindmapLayout([art('S', 'story', 'missing')]);
    expect(s.position).toEqual({ x: ROOT_X, y: ROOT_Y });
  });

  it('renders every node of a parentId cycle instead of dropping it', () => {
    const nodes = computeMindmapLayout([art('A', 'epic', 'B'), art('B', 'story', 'A')]);
    expect(nodes.map(n => n.id).sort()).toEqual(['A', 'B']);
  });

  it('ignores a self-parent link', () => {
    const nodes = computeMindmapLayout([art('A', 'epic', 'A')]);
    expect(nodes).toHaveLength(1);
  });
});

describe('computeMindmap — column headers', () => {
  it('emits one header per occupied column, above the first row', () => {
    const { columns } = computeMindmap(project());
    expect(columns.map(c => c.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const c of columns) {
      expect(c.x).toBe(colX(c.index));
      expect(c.y).toBe(ROOT_Y - HEADER_OFFSET);
      expect(c.width).toBe(NODE_W);
    }
  });

  it('labels a column by its types, most frequent first, with a count', () => {
    const { columns } = computeMindmap(project());
    expect(columns[3]).toMatchObject({ label: 'Requirements · Architecture', count: 3, phase: 'planning' });
    expect(columns[4]).toMatchObject({ label: 'Epics · Decisions', count: 3, phase: 'implementation' });
    expect(columns[5]).toMatchObject({ label: 'Stories', count: 3 });
  });

  it('caps the label at three types and summarises the rest', () => {
    const { columns } = computeMindmap([
      art('prd', 'prd'),
      art('a', 'requirement', 'prd'), art('b', 'nfr', 'prd'),
      art('c', 'risk', 'prd'), art('d', 'architecture', 'prd'),
    ]);
    expect(columns[1].label).toMatch(/ \+1$/);
    expect(columns[1].label.split(' · ')).toHaveLength(3);
  });

  it('title-cases unknown types', () => {
    const { columns } = computeMindmap([art('x', 'ux-design')]);
    expect(columns[0].label).toBe('Ux design');
  });
});
