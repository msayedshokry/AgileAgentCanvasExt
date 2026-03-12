import type { Artifact } from '../types';
import type { LayoutMode } from './Canvas';

interface DependencyArrowsProps {
  artifacts: Artifact[];
  /** When set, arrows connecting highlighted artifacts get boosted; all others dim. */
  highlightedIds?: Set<string> | null;
  /** Current layout mode — in mindmap mode, parent→child tree lines are drawn. */
  layoutMode?: LayoutMode;
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
} {
  if (STRUCTURAL_TYPES.has(fromType) && STRUCTURAL_TYPES.has(toType)) {
    // Structural flow: bright, solid
    return { stroke: 'var(--vscode-charts-blue)', strokeWidth: 2, opacity: 0.7, markerId: 'arrowhead-structural' };
  }
  if (fromType === 'story' && toType === 'story') {
    // Peer story cross-refs: warm, dashed-ish
    return { stroke: 'var(--vscode-charts-yellow)', strokeWidth: 1.5, opacity: 0.55, markerId: 'arrowhead-peer' };
  }
  // Default: remaining cross-references (epic → req, architecture → epic, etc.)
  return { stroke: 'var(--vscode-editorWidget-border)', strokeWidth: 1.5, opacity: 0.5, markerId: 'arrowhead-default' };
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
}

export function DependencyArrows({ artifacts, highlightedIds, layoutMode }: DependencyArrowsProps) {
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
      const from = infoMap.get(artifact.parentId);
      const to = infoMap.get(artifact.id);
      if (!from || !to) return;

      const edgeKey = `tree:${artifact.parentId}-${artifact.id}`;
      drawnEdges.add(`${artifact.parentId}-${artifact.id}`);

      const path = computePath(from, to);
      arrows.push({
        key: edgeKey,
        fromId: artifact.parentId,
        toId: artifact.id,
        path,
        stroke: 'var(--vscode-editorWidget-border)',
        strokeWidth: 1.5,
        opacity: 0.35,
        markerId: '',  // no arrowhead for tree lines
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
        const path = computePath(from, to);
        arrows.push({ key: `${depId}-${artifact.id}`, fromId: depId, toId: artifact.id, path, ...style });
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

      {arrows.map(({ key, fromId, toId, path, stroke, strokeWidth, opacity, markerId, isTreeLine }) => {
        // When highlighting is active, boost arrows between highlighted nodes, dim others
        let finalOpacity = opacity;
        let finalStrokeWidth = strokeWidth;
        if (highlightedIds && highlightedIds.size > 0) {
          const isHighlighted = highlightedIds.has(fromId) && highlightedIds.has(toId);
          if (isHighlighted) {
            finalOpacity = Math.min(1, opacity + 0.3);
            finalStrokeWidth = strokeWidth + (isTreeLine ? 0.5 : 1);
          } else {
            finalOpacity = isTreeLine ? 0.12 : 0.08;
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
            strokeDasharray={isTreeLine ? '6 3' : undefined}
          />
        );
      })}
    </svg>
  );
}
