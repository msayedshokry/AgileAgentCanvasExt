/**
 * Mind-map layout engine
 *
 * Takes the flat Artifact[] array and computes new position coordinates
 * arranged as a horizontal tree (left-to-right).  The hierarchy is derived
 * from parentId relationships with a virtual project root gathering the
 * top-level artifacts.
 *
 * The algorithm:
 * 1. Build a tree from parentId links.
 * 2. Group orphan roots under virtual phase nodes.
 * 3. Recursively measure subtree extents (bottom-up).
 * 4. Assign positions top-down with wrapping children into a grid so that
 *    deep trees with many siblings stay compact instead of growing very tall.
 *
 * Children wrapping:
 *   When a node has more than MAX_CHILDREN_PER_COL children, the children
 *   wrap into additional columns placed side-by-side at the same depth.
 *   Each column is separated by COL_GAP.  The parent node connects to the
 *   left edge of the first column; arrows remain left-to-right.
 */

import type { Artifact } from '../types';

// ── Layout constants ────────────────────────────────────────────────────────
const NODE_W = 170;       // compact card width (was 200)
const NODE_H = 50;        // compact card height (was 60)
const H_GAP  = 60;        // horizontal gap between depth levels (was 80)
const V_GAP  = 16;        // vertical gap between sibling nodes
const ROOT_X = 40;        // left margin for root (was 60)
const ROOT_Y = 40;        // top margin (was 60)

// ── Wrapping constants ──────────────────────────────────────────────────────
const MAX_CHILDREN_PER_COL = 5;   // max children in one vertical column before wrapping
const COL_GAP = 20;               // horizontal gap between wrapped child columns

// Depth ordering: discovery items first, then planning, solutioning, impl
const DEPTH_ORDER: Record<string, number> = {
  'product-brief': 0,
  'vision': 1,
  'prd': 2,
  'requirement': 3,
  'nfr': 4,
  'additional-req': 5,
  'risk': 6,
  'architecture': 7,
  'architecture-decision': 8,
  'system-component': 9,
  'epic': 10,
  'story': 11,
  'use-case': 12,
  'task': 13,
  'test-strategy': 14,
  'test-design': 15,
  'test-case': 16,
  'test-coverage': 17,
};

interface TreeNode {
  artifact: Artifact;
  children: TreeNode[];
  /** Total height of this subtree (for vertical allocation) */
  subtreeHeight: number;
  /** Total width of this subtree (for horizontal allocation) */
  subtreeWidth: number;
}

/**
 * Sort children by DEPTH_ORDER then by title for stable layout.
 */
function sortChildren(children: TreeNode[]): TreeNode[] {
  return children.sort((a, b) => {
    const oa = DEPTH_ORDER[a.artifact.type] ?? 99;
    const ob = DEPTH_ORDER[b.artifact.type] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.artifact.title.localeCompare(b.artifact.title);
  });
}

/**
 * Split children into columns of at most MAX_CHILDREN_PER_COL.
 */
function splitIntoColumns(children: TreeNode[]): TreeNode[][] {
  if (children.length === 0) return [];
  const cols: TreeNode[][] = [];
  for (let i = 0; i < children.length; i += MAX_CHILDREN_PER_COL) {
    cols.push(children.slice(i, i + MAX_CHILDREN_PER_COL));
  }
  return cols;
}

/**
 * Compute the height of a single column of children (sum of subtreeHeights + gaps).
 */
function columnHeight(col: TreeNode[]): number {
  let h = 0;
  for (let i = 0; i < col.length; i++) {
    if (i > 0) h += V_GAP;
    h += col[i].subtreeHeight;
  }
  return h;
}

/**
 * Compute the maximum subtreeWidth across children in a column.
 * This tells us how wide that column extends to the right.
 */
function columnWidth(col: TreeNode[]): number {
  let w = 0;
  for (const child of col) {
    w = Math.max(w, child.subtreeWidth);
  }
  return w;
}

/**
 * Recursively compute subtreeHeight and subtreeWidth (bottom-up).
 *
 * For leaf nodes: subtreeHeight = NODE_H, subtreeWidth = NODE_W.
 *
 * For branch nodes with children split into columns:
 *   subtreeHeight = max height across all columns (they sit side by side)
 *   subtreeWidth  = NODE_W + H_GAP + sum of column widths + gaps between columns
 *
 * The subtreeHeight must be at least NODE_H (for the node itself).
 */
function measureSubtree(node: TreeNode): void {
  if (node.children.length === 0) {
    node.subtreeHeight = NODE_H;
    node.subtreeWidth = NODE_W;
    return;
  }

  // Measure all children first
  for (const child of node.children) {
    measureSubtree(child);
  }

  // Split children into columns
  const cols = splitIntoColumns(node.children);

  // Height = maximum column height (columns are placed side by side)
  let maxColH = 0;
  for (const col of cols) {
    maxColH = Math.max(maxColH, columnHeight(col));
  }
  node.subtreeHeight = Math.max(NODE_H, maxColH);

  // Width = NODE_W + H_GAP + total width of all columns side by side
  let totalColumnsWidth = 0;
  for (let ci = 0; ci < cols.length; ci++) {
    if (ci > 0) totalColumnsWidth += COL_GAP;
    totalColumnsWidth += columnWidth(cols[ci]);
  }
  node.subtreeWidth = NODE_W + H_GAP + totalColumnsWidth;
}

/**
 * Recursively assign positions (top-down).
 *
 * Children are split into columns. Each column is placed at the same base X,
 * offset further right for subsequent columns. Within each column, children
 * are stacked vertically, centered in the column's allocated height band.
 */
function positionSubtree(
  node: TreeNode,
  x: number,
  yStart: number,
  out: Artifact[]
): void {
  // Center this node vertically within its allocated band
  const centerY = yStart + node.subtreeHeight / 2 - NODE_H / 2;

  out.push({
    ...node.artifact,
    position: { x, y: centerY },
    size: { width: NODE_W, height: NODE_H },
  });

  if (node.children.length === 0) return;

  // Split children into columns
  const cols = splitIntoColumns(node.children);

  // Compute each column's width (max subtreeWidth of its members)
  const colWidths = cols.map(col => columnWidth(col));

  // Starting X for children: to the right of this node
  let colX = x + NODE_W + H_GAP;

  for (let ci = 0; ci < cols.length; ci++) {
    const col = cols[ci];
    const colH = columnHeight(col);

    // Center this column vertically within the subtree band
    let childY = yStart;
    if (colH < node.subtreeHeight) {
      childY += (node.subtreeHeight - colH) / 2;
    }

    for (const child of col) {
      positionSubtree(child, colX, childY, out);
      childY += child.subtreeHeight + V_GAP;
    }

    // Advance X for the next column
    colX += colWidths[ci] + COL_GAP;
  }
}

/**
 * Compute mind-map positions for all artifacts.
 * Returns a new array of Artifact objects with updated position/size.
 * The original artifacts are not mutated.
 */
export function computeMindmapLayout(artifacts: Artifact[]): Artifact[] {
  if (artifacts.length === 0) return [];

  // Build lookup and children map
  const byId = new Map<string, Artifact>();
  const childrenMap = new Map<string, Artifact[]>();

  for (const a of artifacts) {
    byId.set(a.id, a);
  }

  // Identify roots (no parentId, or parentId not in the set)
  const roots: Artifact[] = [];
  for (const a of artifacts) {
    if (!a.parentId || !byId.has(a.parentId)) {
      roots.push(a);
    } else {
      let kids = childrenMap.get(a.parentId);
      if (!kids) { kids = []; childrenMap.set(a.parentId, kids); }
      kids.push(a);
    }
  }

  // Build tree nodes recursively
  function buildNode(artifact: Artifact): TreeNode {
    const kids = childrenMap.get(artifact.id) || [];
    const childNodes = kids.map(k => buildNode(k));
    return {
      artifact,
      children: sortChildren(childNodes),
      subtreeHeight: 0,
      subtreeWidth: 0,
    };
  }

  const rootNodes = roots
    .map(r => buildNode(r))
    .sort((a, b) => {
      const oa = DEPTH_ORDER[a.artifact.type] ?? 99;
      const ob = DEPTH_ORDER[b.artifact.type] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.artifact.title.localeCompare(b.artifact.title);
    });

  // If there's just one root, use it as the tree root directly.
  // If there are multiple roots, create virtual phase grouping nodes.
  let treeRoots: TreeNode[];

  if (rootNodes.length === 1) {
    treeRoots = rootNodes;
  } else {
    // Group roots into phase clusters
    const phases: { label: string; types: Set<string>; nodes: TreeNode[] }[] = [
      { label: 'Discovery',      types: new Set(['product-brief', 'vision']), nodes: [] },
      { label: 'Planning',       types: new Set(['prd', 'requirement', 'nfr', 'additional-req', 'risk']), nodes: [] },
      { label: 'Solutioning',    types: new Set(['architecture', 'architecture-decision', 'system-component']), nodes: [] },
      { label: 'Implementation', types: new Set(['epic', 'story', 'use-case', 'task', 'test-strategy', 'test-design', 'test-case', 'test-coverage']), nodes: [] },
    ];

    for (const rn of rootNodes) {
      const phase = phases.find(p => p.types.has(rn.artifact.type));
      if (phase) {
        phase.nodes.push(rn);
      } else {
        phases[3].nodes.push(rn);
      }
    }

    // Build phase group nodes
    const phaseNodes: TreeNode[] = [];
    for (const phase of phases) {
      if (phase.nodes.length === 0) continue;
      if (phase.nodes.length === 1) {
        phaseNodes.push(phase.nodes[0]);
      } else {
        const virtualArtifact: Artifact = {
          id: `__phase_${phase.label.toLowerCase()}`,
          type: 'vision',
          title: phase.label,
          description: '',
          status: 'approved',
          position: { x: 0, y: 0 },
          size: { width: NODE_W, height: NODE_H },
          dependencies: [],
          metadata: {},
        };
        phaseNodes.push({
          artifact: virtualArtifact,
          children: phase.nodes,
          subtreeHeight: 0,
          subtreeWidth: 0,
        });
      }
    }

    treeRoots = phaseNodes;
  }

  // Measure all subtrees
  for (const root of treeRoots) {
    measureSubtree(root);
  }

  // Position all subtrees stacked vertically
  const result: Artifact[] = [];
  let y = ROOT_Y;
  for (const root of treeRoots) {
    positionSubtree(root, ROOT_X, y, result);
    y += root.subtreeHeight + V_GAP * 3; // extra gap between root trees
  }

  return result;
}

/**
 * Exported constants so Canvas.tsx can use consistent sizing
 */
export const MINDMAP_NODE_WIDTH = NODE_W;
export const MINDMAP_NODE_HEIGHT = NODE_H;
