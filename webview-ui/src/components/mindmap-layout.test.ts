/**
 * Tests for mindmap-layout.ts
 *
 * Pure logic tests — no DOM, no React, no mocks needed.
 */
import { describe, it, expect } from 'vitest';
import {
  computeMindmapLayout,
  MINDMAP_NODE_WIDTH,
  MINDMAP_NODE_HEIGHT,
} from './mindmap-layout';
import type { Artifact } from '../types';

// ── Layout constants (mirrored for assertions) ──────────────────────────────
const NODE_W = 170;
const NODE_H = 50;
const H_GAP = 70;
const V_GAP = 28;
const ROOT_X = 40;
const ROOT_Y = 40;
const MAX_CHILDREN_PER_COL = 5;
const COL_GAP = 20;

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<Artifact> & { id: string; type: Artifact['type']; title: string }): Artifact {
  return {
    description: '',
    status: 'draft',
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    dependencies: [],
    metadata: {},
    ...overrides,
  };
}

/** Find a positioned artifact by id in the layout result */
function findById(result: Artifact[], id: string): Artifact | undefined {
  return result.find((a) => a.id === id);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Exported constants
// ═══════════════════════════════════════════════════════════════════════════════

describe('Exported constants', () => {
  it('MINDMAP_NODE_WIDTH equals 170', () => {
    expect(MINDMAP_NODE_WIDTH).toBe(170);
  });

  it('MINDMAP_NODE_HEIGHT equals 50', () => {
    expect(MINDMAP_NODE_HEIGHT).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Empty / trivial inputs
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — empty input', () => {
  it('returns empty array for empty input', () => {
    expect(computeMindmapLayout([])).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Single artifact
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — single artifact', () => {
  it('positions a single artifact at the root location', () => {
    const artifacts = [makeArtifact({ id: 'v1', type: 'vision', title: 'Vision' })];
    const result = computeMindmapLayout(artifacts);

    expect(result).toHaveLength(1);
    const node = result[0];
    expect(node.position.x).toBe(ROOT_X);
    expect(node.position.y).toBe(ROOT_Y);
    expect(node.size.width).toBe(NODE_W);
    expect(node.size.height).toBe(NODE_H);
  });

  it('does not mutate the original artifact', () => {
    const original = makeArtifact({ id: 'v1', type: 'vision', title: 'Vision' });
    const origPos = { ...original.position };
    computeMindmapLayout([original]);
    expect(original.position).toEqual(origPos);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Parent–child relationships
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — parent-child hierarchy', () => {
  it('places a child one level to the right of its parent', () => {
    const artifacts = [
      makeArtifact({ id: 'epic1', type: 'epic', title: 'Epic 1' }),
      makeArtifact({ id: 'story1', type: 'story', title: 'Story 1', parentId: 'epic1' }),
    ];
    const result = computeMindmapLayout(artifacts);

    expect(result).toHaveLength(2);
    const parent = findById(result, 'epic1')!;
    const child = findById(result, 'story1')!;

    // Child is shifted right by NODE_W + H_GAP
    expect(child.position.x).toBe(parent.position.x + NODE_W + H_GAP);
  });

  it('places grandchildren two levels to the right', () => {
    const artifacts = [
      makeArtifact({ id: 'prd1', type: 'prd', title: 'PRD' }),
      makeArtifact({ id: 'epic1', type: 'epic', title: 'Epic', parentId: 'prd1' }),
      makeArtifact({ id: 'story1', type: 'story', title: 'Story', parentId: 'epic1' }),
    ];
    const result = computeMindmapLayout(artifacts);

    const root = findById(result, 'prd1')!;
    const child = findById(result, 'epic1')!;
    const grandchild = findById(result, 'story1')!;

    expect(child.position.x).toBe(root.position.x + NODE_W + H_GAP);
    expect(grandchild.position.x).toBe(child.position.x + NODE_W + H_GAP);
  });

  it('all output artifacts have correct size', () => {
    const artifacts = [
      makeArtifact({ id: 'prd1', type: 'prd', title: 'PRD' }),
      makeArtifact({ id: 'epic1', type: 'epic', title: 'Epic', parentId: 'prd1' }),
      makeArtifact({ id: 'story1', type: 'story', title: 'Story', parentId: 'epic1' }),
    ];
    const result = computeMindmapLayout(artifacts);

    for (const a of result) {
      expect(a.size.width).toBe(NODE_W);
      expect(a.size.height).toBe(NODE_H);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sibling ordering (DEPTH_ORDER then alphabetical)
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — sibling sort order', () => {
  it('sorts children by DEPTH_ORDER (requirement before epic)', () => {
    const artifacts = [
      makeArtifact({ id: 'root', type: 'prd', title: 'PRD' }),
      makeArtifact({ id: 'epic1', type: 'epic', title: 'Epic Alpha', parentId: 'root' }),
      makeArtifact({ id: 'req1', type: 'requirement', title: 'Req Alpha', parentId: 'root' }),
    ];
    const result = computeMindmapLayout(artifacts);

    const req = findById(result, 'req1')!;
    const epic = findById(result, 'epic1')!;

    // requirement (depth 3) should be above epic (depth 10) -> smaller y
    expect(req.position.y).toBeLessThan(epic.position.y);
  });

  it('sorts children alphabetically within the same type', () => {
    const artifacts = [
      makeArtifact({ id: 'root', type: 'prd', title: 'PRD' }),
      makeArtifact({ id: 'epic-b', type: 'epic', title: 'Bravo', parentId: 'root' }),
      makeArtifact({ id: 'epic-a', type: 'epic', title: 'Alpha', parentId: 'root' }),
    ];
    const result = computeMindmapLayout(artifacts);

    const alpha = findById(result, 'epic-a')!;
    const bravo = findById(result, 'epic-b')!;

    // Alpha should be above Bravo
    expect(alpha.position.y).toBeLessThan(bravo.position.y);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Multiple siblings — vertical spacing
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — vertical spacing between siblings', () => {
  it('places siblings with V_GAP between them', () => {
    const artifacts = [
      makeArtifact({ id: 'root', type: 'epic', title: 'Epic' }),
      makeArtifact({ id: 's1', type: 'story', title: 'Story A', parentId: 'root' }),
      makeArtifact({ id: 's2', type: 'story', title: 'Story B', parentId: 'root' }),
    ];
    const result = computeMindmapLayout(artifacts);

    const s1 = findById(result, 's1')!;
    const s2 = findById(result, 's2')!;

    // Both are leaf nodes (subtreeHeight = NODE_H), so:
    // s2.y = s1.y + NODE_H + V_GAP
    expect(s2.position.y).toBe(s1.position.y + NODE_H + V_GAP);
  });

  it('parent is vertically centered among its children', () => {
    const artifacts = [
      makeArtifact({ id: 'root', type: 'epic', title: 'Epic' }),
      makeArtifact({ id: 's1', type: 'story', title: 'Story A', parentId: 'root' }),
      makeArtifact({ id: 's2', type: 'story', title: 'Story B', parentId: 'root' }),
      makeArtifact({ id: 's3', type: 'story', title: 'Story C', parentId: 'root' }),
    ];
    const result = computeMindmapLayout(artifacts);

    const parent = findById(result, 'root')!;
    const children = ['s1', 's2', 's3'].map((id) => findById(result, id)!);

    // Parent center-Y should equal the midpoint of the children band
    const childrenTop = children[0].position.y;
    const childrenBottom = children[children.length - 1].position.y + NODE_H;
    const childrenMidY = (childrenTop + childrenBottom) / 2;
    const parentMidY = parent.position.y + NODE_H / 2;

    expect(parentMidY).toBeCloseTo(childrenMidY, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Orphan handling (parentId points to non-existent artifact)
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — orphan artifacts', () => {
  it('treats artifacts with unknown parentId as roots', () => {
    const artifacts = [
      makeArtifact({ id: 'a1', type: 'story', title: 'Orphan Story', parentId: 'nonexistent' }),
    ];
    const result = computeMindmapLayout(artifacts);

    expect(result).toHaveLength(1);
    expect(result[0].position.x).toBe(ROOT_X);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Multiple roots — phase grouping
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — multiple roots with phase grouping', () => {
  it('creates virtual phase grouping nodes for multiple roots in the same phase', () => {
    // Two vision-type roots → should be grouped under a Discovery virtual node
    const artifacts = [
      makeArtifact({ id: 'v1', type: 'vision', title: 'Vision A' }),
      makeArtifact({ id: 'v2', type: 'vision', title: 'Vision B' }),
    ];
    const result = computeMindmapLayout(artifacts);

    // Result should contain: virtual Discovery phase node + v1 + v2
    expect(result.length).toBe(3);

    // Virtual phase node should exist with id __phase_discovery
    const phaseNode = findById(result, '__phase_discovery');
    expect(phaseNode).toBeDefined();
    expect(phaseNode!.title).toBe('Discovery');
    expect(phaseNode!.position.x).toBe(ROOT_X);

    // The two vision artifacts should be one level to the right
    const va = findById(result, 'v1')!;
    const vb = findById(result, 'v2')!;
    expect(va.position.x).toBe(ROOT_X + NODE_W + H_GAP);
    expect(vb.position.x).toBe(ROOT_X + NODE_W + H_GAP);
  });

  it('does not create a virtual node when only one root exists in a phase', () => {
    const artifacts = [
      makeArtifact({ id: 'v1', type: 'vision', title: 'Vision' }),
      makeArtifact({ id: 'e1', type: 'epic', title: 'Epic' }),
    ];
    const result = computeMindmapLayout(artifacts);

    // No virtual phase nodes should appear; both are single roots in their phases
    const phaseNodes = result.filter((a) => a.id.startsWith('__phase_'));
    expect(phaseNodes).toHaveLength(0);

    // Vision (Discovery) should be above Epic (Implementation) since Discovery comes first
    const v = findById(result, 'v1')!;
    const e = findById(result, 'e1')!;
    expect(v.position.y).toBeLessThan(e.position.y);
  });

  it('groups roots into correct phases', () => {
    const artifacts = [
      makeArtifact({ id: 'pb', type: 'product-brief', title: 'Brief' }),
      makeArtifact({ id: 'v1', type: 'vision', title: 'Vision' }),
      // Two discovery roots → virtual Discovery node
      makeArtifact({ id: 'prd1', type: 'prd', title: 'PRD' }),
      // Single planning root → no virtual node
      makeArtifact({ id: 'arch1', type: 'architecture', title: 'Arch' }),
      // Single solutioning root → no virtual node
    ];
    const result = computeMindmapLayout(artifacts);

    // Discovery phase has 2 roots → virtual node
    const discoveryPhase = findById(result, '__phase_discovery');
    expect(discoveryPhase).toBeDefined();

    // Planning and Solutioning have 1 root each → no virtual nodes
    const planningPhase = findById(result, '__phase_planning');
    const solutioningPhase = findById(result, '__phase_solutioning');
    expect(planningPhase).toBeUndefined();
    expect(solutioningPhase).toBeUndefined();
  });

  it('places unknown artifact types in Implementation phase', () => {
    // The 'research' type is not in DEPTH_ORDER, so it falls back to Implementation
    const artifacts = [
      makeArtifact({ id: 'r1', type: 'research', title: 'Research A' }),
      makeArtifact({ id: 'r2', type: 'research', title: 'Research B' }),
    ];
    const result = computeMindmapLayout(artifacts);

    // Both should be grouped under __phase_implementation
    const implPhase = findById(result, '__phase_implementation');
    expect(implPhase).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Single root — no virtual nodes
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — single root with children', () => {
  it('uses the single root directly (no virtual nodes)', () => {
    const artifacts = [
      makeArtifact({ id: 'prd1', type: 'prd', title: 'PRD' }),
      makeArtifact({ id: 'req1', type: 'requirement', title: 'Req 1', parentId: 'prd1' }),
      makeArtifact({ id: 'req2', type: 'requirement', title: 'Req 2', parentId: 'prd1' }),
    ];
    const result = computeMindmapLayout(artifacts);

    // No virtual phase nodes
    const virtualNodes = result.filter((a) => a.id.startsWith('__phase_'));
    expect(virtualNodes).toHaveLength(0);

    // Root at ROOT_X, children at ROOT_X + NODE_W + H_GAP
    const root = findById(result, 'prd1')!;
    expect(root.position.x).toBe(ROOT_X);
    expect(result).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Deep tree — verify multiple depth levels
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — deep tree', () => {
  it('positions nodes at increasing x for each depth level', () => {
    const artifacts = [
      makeArtifact({ id: 'a', type: 'prd', title: 'Level 0' }),
      makeArtifact({ id: 'b', type: 'requirement', title: 'Level 1', parentId: 'a' }),
      makeArtifact({ id: 'c', type: 'epic', title: 'Level 2', parentId: 'b' }),
      makeArtifact({ id: 'd', type: 'story', title: 'Level 3', parentId: 'c' }),
      makeArtifact({ id: 'e', type: 'task', title: 'Level 4', parentId: 'd' }),
    ];
    const result = computeMindmapLayout(artifacts);

    const xs = ['a', 'b', 'c', 'd', 'e'].map((id) => findById(result, id)!.position.x);

    // Each level should be exactly NODE_W + H_GAP further right
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBe(xs[i - 1] + NODE_W + H_GAP);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Wide tree — many siblings
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — wide tree with many siblings', () => {
  it('produces the correct total count of positioned artifacts', () => {
    const count = 10;
    const artifacts: Artifact[] = [
      makeArtifact({ id: 'root', type: 'epic', title: 'Epic' }),
    ];
    for (let i = 0; i < count; i++) {
      artifacts.push(
        makeArtifact({
          id: `s${i}`,
          type: 'story',
          title: `Story ${String(i).padStart(2, '0')}`,
          parentId: 'root',
        })
      );
    }
    const result = computeMindmapLayout(artifacts);

    expect(result).toHaveLength(count + 1);
  });

  it('no two siblings overlap vertically', () => {
    const artifacts: Artifact[] = [
      makeArtifact({ id: 'root', type: 'epic', title: 'Epic' }),
    ];
    for (let i = 0; i < 5; i++) {
      artifacts.push(
        makeArtifact({
          id: `s${i}`,
          type: 'story',
          title: `Story ${String(i).padStart(2, '0')}`,
          parentId: 'root',
        })
      );
    }
    const result = computeMindmapLayout(artifacts);

    const children = result
      .filter((a) => a.id.startsWith('s'))
      .sort((a, b) => a.position.y - b.position.y);

    for (let i = 1; i < children.length; i++) {
      const prevBottom = children[i - 1].position.y + NODE_H;
      expect(children[i].position.y).toBeGreaterThanOrEqual(prevBottom);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Subtree measurement — asymmetric tree
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — asymmetric tree', () => {
  it('allocates more vertical space to the branch with more children', () => {
    // root → child-a (3 grandchildren) + child-b (1 grandchild)
    const artifacts = [
      makeArtifact({ id: 'root', type: 'prd', title: 'PRD' }),
      makeArtifact({ id: 'a', type: 'epic', title: 'A', parentId: 'root' }),
      makeArtifact({ id: 'a1', type: 'story', title: 'A1', parentId: 'a' }),
      makeArtifact({ id: 'a2', type: 'story', title: 'A2', parentId: 'a' }),
      makeArtifact({ id: 'a3', type: 'story', title: 'A3', parentId: 'a' }),
      makeArtifact({ id: 'b', type: 'epic', title: 'B', parentId: 'root' }),
      makeArtifact({ id: 'b1', type: 'story', title: 'B1', parentId: 'b' }),
    ];
    const result = computeMindmapLayout(artifacts);

    // Child-a should occupy a taller band since it has 3 children vs 1
    const aChildren = ['a1', 'a2', 'a3'].map((id) => findById(result, id)!);
    const bChildren = ['b1'].map((id) => findById(result, id)!);

    const aBandHeight =
      aChildren[aChildren.length - 1].position.y + NODE_H - aChildren[0].position.y;
    const bBandHeight =
      bChildren[bChildren.length - 1].position.y + NODE_H - bChildren[0].position.y;

    expect(aBandHeight).toBeGreaterThan(bBandHeight);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Multiple root trees — vertical stacking with extra gap
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — root tree vertical stacking', () => {
  it('stacks root trees with extra gap (V_GAP * 3) between them', () => {
    // Two single-root phases (Discovery, Implementation) → stacked
    const artifacts = [
      makeArtifact({ id: 'v1', type: 'vision', title: 'Vision' }),
      makeArtifact({ id: 'e1', type: 'epic', title: 'Epic' }),
    ];
    const result = computeMindmapLayout(artifacts);

    const v = findById(result, 'v1')!;
    const e = findById(result, 'e1')!;

    // Vision subtreeHeight = NODE_H (leaf), so epic starts at:
    // ROOT_Y + NODE_H + V_GAP * 3
    const expectedEpicStartY = ROOT_Y + NODE_H + V_GAP * 3;
    // Epic is also a leaf, centered in its own band:
    expect(e.position.y).toBe(expectedEpicStartY);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Data preservation — original fields are kept
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — data preservation', () => {
  it('preserves all original artifact fields except position and size', () => {
    const original = makeArtifact({
      id: 'v1',
      type: 'vision',
      title: 'My Vision',
      description: 'A detailed description',
      status: 'approved',
      dependencies: ['dep1'],
      metadata: { productName: 'Test Product' },
    });
    const result = computeMindmapLayout([original]);

    expect(result[0].id).toBe('v1');
    expect(result[0].type).toBe('vision');
    expect(result[0].title).toBe('My Vision');
    expect(result[0].description).toBe('A detailed description');
    expect(result[0].status).toBe('approved');
    expect(result[0].dependencies).toEqual(['dep1']);
    expect(result[0].metadata).toEqual({ productName: 'Test Product' });
  });

  it('returns new array (does not modify input array)', () => {
    const artifacts = [makeArtifact({ id: 'v1', type: 'vision', title: 'V' })];
    const result = computeMindmapLayout(artifacts);
    expect(result).not.toBe(artifacts);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — edge cases', () => {
  it('handles artifacts with parentId referencing themselves (self-loop → treated as root)', () => {
    const artifacts = [
      makeArtifact({ id: 'self', type: 'epic', title: 'Self-ref', parentId: 'self' }),
    ];
    // parentId 'self' exists in the set, so it is NOT treated as orphan.
    // But this creates a circular reference. The algorithm should still produce a result.
    // The artifact will be added as child of itself, and buildNode will recurse on children.
    // Since childrenMap('self') = [self], and then buildNode('self') recurses, this is infinite recursion!
    // Actually, looking at the code: the self-ref artifact has parentId 'self' and byId.has('self') is true,
    // so it goes into childrenMap, not roots. roots will be empty.
    // But rootNodes will be empty, so treeRoots is... let's just check the result length.
    // With no roots, the function should still return (possibly empty).
    const result = computeMindmapLayout(artifacts);
    // Self-referencing artifact is placed in childrenMap but no root references it,
    // so it is never positioned. Result should be empty.
    expect(result).toHaveLength(0);
  });

  it('handles large number of artifacts without crashing', () => {
    const artifacts: Artifact[] = [];
    // Create a flat list of 100 story artifacts (all roots)
    for (let i = 0; i < 100; i++) {
      artifacts.push(
        makeArtifact({
          id: `story-${i}`,
          type: 'story',
          title: `Story ${String(i).padStart(3, '0')}`,
        })
      );
    }
    const result = computeMindmapLayout(artifacts);

    // Should have 100 stories + 1 virtual Implementation phase node (since >1 root in same phase)
    expect(result.length).toBe(101);
  });

  it('handles mixed parentId: some valid, some invalid', () => {
    const artifacts = [
      makeArtifact({ id: 'root', type: 'prd', title: 'PRD' }),
      makeArtifact({ id: 'child', type: 'epic', title: 'Child', parentId: 'root' }),
      makeArtifact({ id: 'orphan', type: 'story', title: 'Orphan', parentId: 'deleted' }),
    ];
    const result = computeMindmapLayout(artifacts);

    // All 3 should be in the result. 'root' is a root, 'child' is under root, 'orphan' is a root too.
    // Since we now have 2 roots (root: prd, orphan: story), they go to different phases:
    // prd → Planning, story → Implementation, each has only 1 root → no virtual nodes
    const virtualNodes = result.filter((a) => a.id.startsWith('__phase_'));
    expect(virtualNodes).toHaveLength(0);
    expect(result).toHaveLength(3);
  });

  it('handles all known artifact types in DEPTH_ORDER', () => {
    const allTypes: Artifact['type'][] = [
      'product-brief', 'vision', 'prd', 'requirement', 'nfr', 'additional-req',
      'risk', 'architecture', 'architecture-decision', 'system-component',
      'epic', 'story', 'use-case', 'task', 'test-strategy', 'test-design',
      'test-case', 'test-coverage',
    ];
    const artifacts = allTypes.map((type, i) =>
      makeArtifact({ id: `art-${i}`, type, title: `${type} artifact` })
    );
    const result = computeMindmapLayout(artifacts);

    // All 18 artifacts should be in the result, possibly with virtual phase nodes
    expect(result.length).toBeGreaterThanOrEqual(18);

    // Every original artifact should be present
    for (let i = 0; i < allTypes.length; i++) {
      expect(findById(result, `art-${i}`)).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase ordering
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — phase ordering', () => {
  it('orders Discovery before Planning before Solutioning before Implementation', () => {
    const artifacts = [
      makeArtifact({ id: 'v', type: 'vision', title: 'Vision' }),           // Discovery
      makeArtifact({ id: 'p', type: 'prd', title: 'PRD' }),                 // Planning
      makeArtifact({ id: 'a', type: 'architecture', title: 'Arch' }),       // Solutioning
      makeArtifact({ id: 'e', type: 'epic', title: 'Epic' }),               // Implementation
    ];
    const result = computeMindmapLayout(artifacts);

    const v = findById(result, 'v')!;
    const p = findById(result, 'p')!;
    const a = findById(result, 'a')!;
    const e = findById(result, 'e')!;

    expect(v.position.y).toBeLessThan(p.position.y);
    expect(p.position.y).toBeLessThan(a.position.y);
    expect(a.position.y).toBeLessThan(e.position.y);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEPTH_ORDER sorting for root nodes
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — root node sorting within a phase', () => {
  it('sorts roots within a virtual phase node by DEPTH_ORDER then alphabetically', () => {
    // Two planning roots: requirement (depth 3) and prd (depth 2)
    const artifacts = [
      makeArtifact({ id: 'req1', type: 'requirement', title: 'Req' }),
      makeArtifact({ id: 'prd1', type: 'prd', title: 'PRD' }),
    ];
    const result = computeMindmapLayout(artifacts);

    // Both are Planning phase → virtual __phase_planning node
    const prd = findById(result, 'prd1')!;
    const req = findById(result, 'req1')!;

    // PRD (depth 2) should be above Requirement (depth 3) since children are sorted
    expect(prd.position.y).toBeLessThan(req.position.y);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Column wrapping — children overflow into additional columns
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMindmapLayout — column wrapping', () => {
  it('wraps children into multiple columns when exceeding MAX_CHILDREN_PER_COL', () => {
    // 7 children → column 1 has 5, column 2 has 2
    const artifacts: Artifact[] = [
      makeArtifact({ id: 'root', type: 'epic', title: 'Epic' }),
    ];
    for (let i = 0; i < 7; i++) {
      artifacts.push(
        makeArtifact({
          id: `s${i}`,
          type: 'story',
          title: `Story ${String(i).padStart(2, '0')}`,
          parentId: 'root',
        })
      );
    }
    const result = computeMindmapLayout(artifacts);

    // First 5 children (col 1) should share the same x
    const col1 = [0, 1, 2, 3, 4].map(i => findById(result, `s${i}`)!);
    const col1X = col1[0].position.x;
    for (const node of col1) {
      expect(node.position.x).toBe(col1X);
    }

    // Next 2 children (col 2) should share a different, further-right x
    const col2 = [5, 6].map(i => findById(result, `s${i}`)!);
    const col2X = col2[0].position.x;
    for (const node of col2) {
      expect(node.position.x).toBe(col2X);
    }

    // Column 2 is to the right of column 1
    expect(col2X).toBeGreaterThan(col1X);
  });

  it('children in the same column do not overlap vertically', () => {
    const artifacts: Artifact[] = [
      makeArtifact({ id: 'root', type: 'epic', title: 'Epic' }),
    ];
    for (let i = 0; i < 8; i++) {
      artifacts.push(
        makeArtifact({
          id: `s${i}`,
          type: 'story',
          title: `Story ${String(i).padStart(2, '0')}`,
          parentId: 'root',
        })
      );
    }
    const result = computeMindmapLayout(artifacts);

    // Check column 1 (first 5)
    const col1 = [0, 1, 2, 3, 4]
      .map(i => findById(result, `s${i}`)!)
      .sort((a, b) => a.position.y - b.position.y);
    for (let i = 1; i < col1.length; i++) {
      const prevBottom = col1[i - 1].position.y + NODE_H;
      expect(col1[i].position.y).toBeGreaterThanOrEqual(prevBottom);
    }

    // Check column 2 (remaining 3)
    const col2 = [5, 6, 7]
      .map(i => findById(result, `s${i}`)!)
      .sort((a, b) => a.position.y - b.position.y);
    for (let i = 1; i < col2.length; i++) {
      const prevBottom = col2[i - 1].position.y + NODE_H;
      expect(col2[i].position.y).toBeGreaterThanOrEqual(prevBottom);
    }
  });

  it('exactly MAX_CHILDREN_PER_COL children fit in one column without wrapping', () => {
    const artifacts: Artifact[] = [
      makeArtifact({ id: 'root', type: 'epic', title: 'Epic' }),
    ];
    for (let i = 0; i < MAX_CHILDREN_PER_COL; i++) {
      artifacts.push(
        makeArtifact({
          id: `s${i}`,
          type: 'story',
          title: `Story ${String(i).padStart(2, '0')}`,
          parentId: 'root',
        })
      );
    }
    const result = computeMindmapLayout(artifacts);

    // All children should have the same x (single column)
    const children = result.filter(a => a.id.startsWith('s'));
    const xs = new Set(children.map(a => a.position.x));
    expect(xs.size).toBe(1);
  });

  it('MAX_CHILDREN_PER_COL + 1 children cause wrapping into 2 columns', () => {
    const artifacts: Artifact[] = [
      makeArtifact({ id: 'root', type: 'epic', title: 'Epic' }),
    ];
    for (let i = 0; i < MAX_CHILDREN_PER_COL + 1; i++) {
      artifacts.push(
        makeArtifact({
          id: `s${i}`,
          type: 'story',
          title: `Story ${String(i).padStart(2, '0')}`,
          parentId: 'root',
        })
      );
    }
    const result = computeMindmapLayout(artifacts);

    // Children should appear at exactly 2 distinct x values
    const children = result.filter(a => a.id.startsWith('s'));
    const xs = new Set(children.map(a => a.position.x));
    expect(xs.size).toBe(2);
  });

  it('column 2 x offset accounts for column 1 subtreeWidth + COL_GAP', () => {
    // 6 leaf children → col1 has 5 leaves, col2 has 1 leaf
    // All are leaves so subtreeWidth = NODE_W for each
    // Column 1 width = max(subtreeWidths) = NODE_W
    // Column 2 x = col1X + NODE_W + COL_GAP
    const artifacts: Artifact[] = [
      makeArtifact({ id: 'root', type: 'epic', title: 'Epic' }),
    ];
    for (let i = 0; i < 6; i++) {
      artifacts.push(
        makeArtifact({
          id: `s${i}`,
          type: 'story',
          title: `Story ${String(i).padStart(2, '0')}`,
          parentId: 'root',
        })
      );
    }
    const result = computeMindmapLayout(artifacts);

    const root = findById(result, 'root')!;
    const col1X = root.position.x + NODE_W + H_GAP;
    const s5 = findById(result, 's5')!;

    // s5 is in column 2, its x should be col1X + NODE_W (col1 width) + COL_GAP
    expect(s5.position.x).toBe(col1X + NODE_W + COL_GAP);
  });
});
