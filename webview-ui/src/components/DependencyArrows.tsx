import React from 'react';
import type { Artifact } from '../types';
import type { LayoutMode } from './Canvas';

interface DependencyArrowsProps {
  artifacts: Artifact[];
  /** When set, arrows connecting highlighted artifacts get boosted; all others dim. */
  highlightedIds?: Set<string> | null;
  /** Current layout mode — in mindmap mode, parent→child tree lines are drawn. */
  layoutMode?: LayoutMode;
  /** When set, arrows whose category is in this set are hidden. */
  hiddenLineCategories?: Set<string>;
}

// Colour per dependency relationship inferred from artifact types involved.
// arch/epic/req → downstream = structural (blue, more prominent)
// story → story (cross-deps) = peer (yellow, subtle)
// everything else = default (neutral border colour, subtle)
const STRUCTURAL_TYPES = new Set<Artifact['type']>(['architecture', 'epic', 'requirement', 'prd', 'vision', 'product-brief']);

function arrowStyle(fromType: Artifact['type'], toType: Artifact['type']): {
  stroke: string;
  strokeWidth: number;
  opacity: number;
  markerId: string;
  category: 'structural' | 'peer' | 'default';
} {
  if (STRUCTURAL_TYPES.has(fromType) && STRUCTURAL_TYPES.has(toType)) {
    // Structural flow: bright, solid
    return { stroke: 'var(--vscode-charts-blue)', strokeWidth: 2, opacity: 0.7, markerId: 'arrowhead-structural', category: 'structural' as const };
  }
  if (fromType === 'story' && toType === 'story') {
    // Peer story cross-refs: warm, dashed-ish
    return { stroke: 'var(--vscode-charts-yellow)', strokeWidth: 1.5, opacity: 0.55, markerId: 'arrowhead-peer', category: 'peer' as const };
  }
  // Default: remaining cross-references (epic → req, architecture → epic, etc.)
  return { stroke: 'var(--vscode-editorWidget-border)', strokeWidth: 1.5, opacity: 0.5, markerId: 'arrowhead-default', category: 'default' as const };
}

/** Compute a cubic-bezier path between two endpoints */
function computePath(
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number }
): string {
  let startX: number, startY: number, endX: number, endY: number;
  let cp1x: number, cp1y: number, cp2x: number, cp2y: number;

  const fromCenterX = from.x + from.width / 2;
  const toCenterX = to.x + to.width / 2;

  if (toCenterX >= fromCenterX) {
    // Normal left-to-right: right-edge of source → left-edge of target
    startX = from.x + from.width;
    startY = from.y + from.height / 2;
    endX = to.x;
    endY = to.y + to.height / 2;
    const midX = (startX + endX) / 2;
    cp1x = midX; cp1y = startY;
    cp2x = midX; cp2y = endY;
  } else {
    // Reverse direction: draw from left-edge of source → right-edge of target
    startX = from.x;
    startY = from.y + from.height / 2;
    endX = to.x + to.width;
    endY = to.y + to.height / 2;
    const spread = Math.max(60, Math.abs(startY - endY) * 0.5);
    cp1x = startX - spread; cp1y = startY;
    cp2x = endX + spread;   cp2y = endY;
  }

  return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
}

/**
 * Orthogonal "elbow" connector for mind-map tree lines: out of the parent's
 * right edge, down a vertical trunk just left of the child column, into the
 * child's left edge. Siblings in one column share the trunk, so a parent's
 * children read as one bracket.
 */
const ELBOW_RADIUS = 8;
const TRUNK_INSET = 28; // trunk distance from the child column's left edge

function computeElbowPath(
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number }
): string {
  const sx = from.x + from.width;
  const sy = from.y + from.height / 2;
  const ex = to.x;
  const ey = to.y + to.height / 2;
  const dy = ey - sy;
  if (Math.abs(dy) < 1 || ex <= sx) return `M ${sx} ${sy} L ${ex} ${ey}`;
  const trunkX = Math.max(sx + ELBOW_RADIUS, ex - TRUNK_INSET);
  const r = Math.min(ELBOW_RADIUS, Math.abs(dy) / 2, trunkX - sx, ex - trunkX);
  const dir = dy > 0 ? 1 : -1;
  return [
    `M ${sx} ${sy}`,
    `H ${trunkX - r}`,
    `Q ${trunkX} ${sy} ${trunkX} ${sy + dir * r}`,
    `V ${ey - dir * r}`,
    `Q ${trunkX} ${ey} ${trunkX + r} ${ey}`,
    `H ${ex}`,
  ].join(' ');
}

interface ArrowData {
  key: string;
  fromId: string;
  toId: string;
  path: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  markerId: string;
  /** If true, this is a tree-structure line (parent→child), not a dependency arrow */
  isTreeLine?: boolean;
  /** Non-tree dependency drawn in mind-map mode (dashed, subdued). */
  isCrossLink?: boolean;
}

export const DependencyArrows = React.memo(function DependencyArrows({ artifacts, highlightedIds, layoutMode, hiddenLineCategories }: DependencyArrowsProps) {
  const isMindmap = layoutMode === 'mindmap';

  // Build a map of artifact positions and types by ID
  const infoMap = new Map<string, { x: number; y: number; width: number; height: number; type: Artifact['type'] }>();
  artifacts.forEach(a => {
    infoMap.set(a.id, {
      x: a.position.x,
      y: a.position.y,
      width: a.size.width,
      height: a.size.height,
      type: a.type,
    });
  });

  // Build a parent lookup so we can skip redundant parent→child arrows in lanes mode
  const parentOf = new Map<string, string>();
  artifacts.forEach(a => {
    if (a.parentId) {
      parentOf.set(a.id, a.parentId);
    }
  });

  const arrows: ArrowData[] = [];

  // Track which parent→child edges are drawn so we don't duplicate
  const drawnEdges = new Set<string>();

  // ── In mindmap mode, draw parent→child tree lines first ──────────────
  if (isMindmap) {
    artifacts.forEach(artifact => {
      if (!artifact.parentId) return;
      if (hiddenLineCategories?.has('tree')) return;
      const from = infoMap.get(artifact.parentId);
      const to = infoMap.get(artifact.id);
      if (!from || !to) return;

      const edgeKey = `tree:${artifact.parentId}-${artifact.id}`;
      drawnEdges.add(`${artifact.parentId}-${artifact.id}`);
      arrows.push({
        key: edgeKey,
        fromId: artifact.parentId,
        toId: artifact.id,
        path: computeElbowPath(from, to),
        stroke: 'var(--rule-strong)',
        strokeWidth: 1.25,
        opacity: 1,
        markerId: '',
        isTreeLine: true,
      });
    });
  }

  // ── Dependency arrows ────────────────────────────────────────────────
  artifacts.forEach(artifact => {
    artifact.dependencies.forEach(depId => {
      // In lanes mode: skip arrows where the dependency is the card's own parent
      // AND the card is spatially nested inside the parent (e.g. story in epic row).
      // Epics reference a parent requirement but live in a separate column — the arrow
      // is still needed to show the cross-column dependency link.
      // In mindmap mode: skip this filter — but skip if we already drew this edge as a tree line.
      if (!isMindmap) {
        if (depId === artifact.parentId && artifact.type !== 'epic') return;
      } else {
        // Don't draw a dependency arrow over an already-drawn tree line
        if (drawnEdges.has(`${depId}-${artifact.id}`) || drawnEdges.has(`${artifact.id}-${depId}`)) return;
      }

      const from = infoMap.get(depId);
      const to = infoMap.get(artifact.id);

      if (from && to) {
        const style = arrowStyle(from.type, artifact.type);
        if (hiddenLineCategories?.has(style.category)) return;
        const path = computePath(from, to);
        // In the mind map the tree carries the hierarchy; cross-links stay
        // quiet (dashed, faint) until a selection highlights them.
        const crossLink = isMindmap ? { opacity: style.opacity * 0.45, isCrossLink: true } : {};
        arrows.push({ key: `${depId}-${artifact.id}`, fromId: depId, toId: artifact.id, path, ...style, ...crossLink });
      }
    });
  });

  return (
    <svg className="dependency-arrows">
      <defs>
        <marker id="arrowhead-structural" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="var(--vscode-charts-blue)" />
        </marker>
        <marker id="arrowhead-peer" markerWidth="9" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 9 3, 0 6" fill="var(--vscode-charts-yellow)" />
        </marker>
        <marker id="arrowhead-default" markerWidth="9" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 9 3, 0 6" fill="var(--vscode-editorWidget-border)" />
        </marker>
      </defs>

      {arrows.map(({ key, fromId, toId, path, stroke, strokeWidth, opacity, markerId, isTreeLine, isCrossLink }) => {
        // When highlighting is active, boost arrows between highlighted nodes, dim others
        let finalOpacity = opacity;
        let finalStrokeWidth = strokeWidth;
        if (highlightedIds && highlightedIds.size > 0) {
          const isHighlighted = highlightedIds.has(fromId) && highlightedIds.has(toId);
          if (isHighlighted) {
            finalOpacity = isCrossLink ? 0.9 : Math.min(1, opacity + 0.3);
            finalStrokeWidth = strokeWidth + (isTreeLine ? 0.5 : 1);
          } else {
            finalOpacity = isTreeLine ? 0.25 : 0.06;
          }
        }
        return (
          <path
            key={key}
            d={path}
            stroke={stroke}
            strokeWidth={finalStrokeWidth}
            fill="none"
            markerEnd={markerId ? `url(#${markerId})` : undefined}
            opacity={finalOpacity}
            strokeDasharray={isCrossLink ? '4 4' : undefined}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
});
