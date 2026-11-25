/**
 * Mind-map layout engine — a tidy left-to-right hierarchy.
 *
 * The tree comes from `parentId` links (brief → vision → PRD → requirements →
 * epics → stories → tasks). Each artifact type sits in a fixed hierarchy
 * level, and each level that has content gets one column, so a column always
 * means the same kind of thing ("Epics", "Stories") and can carry a header.
 *
 * Vertical placement is a classic tidy tree: leaves stack top to bottom in
 * source order, and every parent is centred on the span of its children.
 * Subtrees never interleave, so a parent's descendants always form one
 * contiguous band to its right — the band *is* the grouping, no boxes needed.
 */

import type { Artifact } from '../types';

// ── Layout constants ────────────────────────────────────────────────────────
// Single source of truth, shared with mindmap-layout.test.ts via LAYOUT_CONSTANTS.
const NODE_W = 184;        // card width
const NODE_H = 72;         // card height (compact card render height)
const LEVEL_GAP = 88;      // horizontal gap between level columns (room for elbow connectors)
const LEAF_GAP = 10;       // vertical gap between two leaf siblings
const BRANCH_GAP = 28;     // vertical gap when either neighbouring sibling has children
const ROOT_GAP = 64;       // vertical gap between separate root trees
const ROOT_X = 40;         // left margin
const ROOT_Y = 132;        // top margin: headers clear the floating toolbar at zoom 1
const HEADER_OFFSET = 52;  // column header sits this far above ROOT_Y

type Phase = 'discovery' | 'planning' | 'solutioning' | 'implementation' | 'details';

interface LevelInfo { level: number; label: string; phase: Phase }

/**
 * Hierarchy level per artifact type. Types sharing a level are siblings in
 * the BMAD model (e.g. requirements and architecture both hang off the PRD).
 */
const TYPE_LEVELS: Record<string, LevelInfo> = {
  'product-brief':         { level: 0, label: 'Briefs',        phase: 'discovery' },
  'vision':                { level: 1, label: 'Vision',        phase: 'discovery' },
  'prd':                   { level: 2, label: 'PRD',           phase: 'planning' },
  'requirement':           { level: 3, label: 'Requirements',  phase: 'planning' },
  'nfr':                   { level: 3, label: 'NFRs',          phase: 'planning' },
  'additional-req':        { level: 3, label: 'Additional',    phase: 'planning' },
  'risk':                  { level: 3, label: 'Risks',         phase: 'planning' },
  'architecture':          { level: 3, label: 'Architecture',  phase: 'solutioning' },
  'architecture-decision': { level: 4, label: 'Decisions',     phase: 'solutioning' },
  'system-component':      { level: 4, label: 'Components',    phase: 'solutioning' },
  'epic':                  { level: 4, label: 'Epics',         phase: 'implementation' },
  'story':                 { level: 5, label: 'Stories',       phase: 'implementation' },
  'use-case':              { level: 5, label: 'Use cases',     phase: 'implementation' },
  'test-strategy':         { level: 5, label: 'Test strategy', phase: 'details' },
  'test-design':           { level: 5, label: 'Test design',   phase: 'details' },
  'test-coverage':         { level: 5, label: 'Coverage',      phase: 'details' },
  'task':                  { level: 6, label: 'Tasks',         phase: 'details' },
  'test-case':             { level: 6, label: 'Test cases',    phase: 'details' },
};

/** Column header label for a type, also used for types outside TYPE_LEVELS. */
function typeLabel(type: string): string {
  const known = TYPE_LEVELS[type]?.label;
  if (known) return known;
  const words = type.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Order of types within one parent's children: hierarchy level, then table order. */
const TYPE_ORDER = new Map(Object.keys(TYPE_LEVELS).map((t, i) => [t, i]));

export interface MindmapColumn {
  /** Column index (0 = leftmost). */
  index: number;
  x: number;
  y: number;
  width: number;
  /** Type labels present in this column, most frequent first. */
  label: string;
  count: number;
  phase: Phase;
}

export interface MindmapLayout {
  nodes: Artifact[];
  columns: MindmapColumn[];
}

interface TreeNode {
  artifact: Artifact;
  order: number;      // index in the input — preserves the author's ordering
  level: number;      // hierarchy level (pre-compression)
  children: TreeNode[];
  y: number;
}

function compareSiblings(a: TreeNode, b: TreeNode): number {
  if (a.level !== b.level) return a.level - b.level;
  const ta = TYPE_ORDER.get(a.artifact.type) ?? Number.MAX_SAFE_INTEGER;
  const tb = TYPE_ORDER.get(b.artifact.type) ?? Number.MAX_SAFE_INTEGER;
  if (ta !== tb) return ta - tb;
  return a.order - b.order;
}

/** Build the forest from parentId links. Cycles are broken, nothing is dropped. */
function buildForest(artifacts: Artifact[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  artifacts.forEach((artifact, order) => {
    byId.set(artifact.id, { artifact, order, level: 0, children: [], y: 0 });
  });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.artifact.parentId ? byId.get(node.artifact.parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  // Assign levels top-down; a child always sits at least one level right of
  // its parent, even if its type would put it further left.
  const visited = new Set<TreeNode>();
  const assign = (node: TreeNode, parentLevel: number) => {
    visited.add(node);
    const natural = TYPE_LEVELS[node.artifact.type]?.level;
    node.level = parentLevel < 0
      ? (natural ?? 0)
      : Math.max(natural ?? parentLevel + 1, parentLevel + 1);
    node.children = node.children.filter(c => !visited.has(c));
    node.children.sort(compareSiblings);
    for (const child of node.children) assign(child, node.level);
  };
  for (const root of roots) assign(root, -1);

  // Nodes only reachable through a parentId cycle: promote the first one of
  // each cycle to a root so it still renders.
  for (const node of byId.values()) {
    if (visited.has(node)) continue;
    node.children = node.children.filter(c => !visited.has(c));
    roots.push(node);
    assign(node, -1);
  }

  return roots.sort(compareSiblings);
}

/** Tidy-tree vertical placement. Returns the y just below the subtree. */
function placeSubtree(node: TreeNode, top: number): number {
  if (node.children.length === 0) {
    node.y = top;
    return top + NODE_H;
  }
  let cursor = top;
  node.children.forEach((child, i) => {
    if (i > 0) {
      const prev = node.children[i - 1];
      const branchy = prev.children.length > 0 || child.children.length > 0;
      cursor += branchy ? BRANCH_GAP : LEAF_GAP;
    }
    cursor = placeSubtree(child, cursor);
  });
  const first = node.children[0].y;
  const last = node.children[node.children.length - 1].y;
  node.y = (first + last) / 2;
  return cursor;
}

function walk(nodes: TreeNode[], visit: (n: TreeNode) => void): void {
  for (const n of nodes) {
    visit(n);
    walk(n.children, visit);
  }
}

/**
 * Compute the mind-map: positioned copies of the artifacts plus one header
 * descriptor per occupied column. Input artifacts are not mutated.
 */
export function computeMindmap(artifacts: Artifact[]): MindmapLayout {
  if (artifacts.length === 0) return { nodes: [], columns: [] };

  const roots = buildForest(artifacts);

  // Compress levels so empty levels (e.g. no PRD) don't leave blank columns.
  const usedLevels = new Set<number>();
  walk(roots, n => usedLevels.add(n.level));
  const columnOf = new Map([...usedLevels].sort((a, b) => a - b).map((lvl, i) => [lvl, i]));
  const columnX = (col: number) => ROOT_X + col * (NODE_W + LEVEL_GAP);

  let cursor = ROOT_Y;
  roots.forEach((root, i) => {
    if (i > 0) cursor += ROOT_GAP;
    cursor = placeSubtree(root, cursor);
  });

  const nodes: Artifact[] = [];
  const typeCounts = new Map<number, Map<string, number>>();
  walk(roots, n => {
    const col = columnOf.get(n.level)!;
    nodes.push({
      ...n.artifact,
      position: { x: columnX(col), y: n.y },
      size: { width: NODE_W, height: NODE_H },
    });
    const counts = typeCounts.get(col) ?? new Map<string, number>();
    counts.set(n.artifact.type, (counts.get(n.artifact.type) ?? 0) + 1);
    typeCounts.set(col, counts);
  });

  const MAX_LABELS = 3;
  const columns: MindmapColumn[] = [...typeCounts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, counts]) => {
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const names = ranked.slice(0, MAX_LABELS).map(([t]) => typeLabel(t));
      const extra = ranked.length - MAX_LABELS;
      const dominant = ranked[0][0];
      return {
        index,
        x: columnX(index),
        y: ROOT_Y - HEADER_OFFSET,
        width: NODE_W,
        label: extra > 0 ? `${names.join(' · ')} +${extra}` : names.join(' · '),
        count: ranked.reduce((sum, [, c]) => sum + c, 0),
        phase: TYPE_LEVELS[dominant]?.phase ?? 'details',
      };
    });

  return { nodes, columns };
}

/** Positioned artifacts only — kept for callers that don't render headers. */
export function computeMindmapLayout(artifacts: Artifact[]): Artifact[] {
  return computeMindmap(artifacts).nodes;
}

export const LAYOUT_CONSTANTS = {
  NODE_W,
  NODE_H,
  LEVEL_GAP,
  LEAF_GAP,
  BRANCH_GAP,
  ROOT_GAP,
  ROOT_X,
  ROOT_Y,
  HEADER_OFFSET,
} as const;
