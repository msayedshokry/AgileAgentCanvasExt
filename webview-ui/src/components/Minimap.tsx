import { useRef, useCallback, useMemo } from 'react';
import type { Artifact } from '../types';

interface MinimapProps {
  /** All artifacts (including hidden children — minimap shows everything) */
  artifacts: Artifact[];
  /** Currently visible artifacts (after expand/collapse filtering) */
  visibleArtifacts: Artifact[];
  /** Current canvas pan offset in pixels */
  pan: { x: number; y: number };
  /** Current canvas zoom level */
  zoom: number;
  /** Canvas viewport width in pixels */
  viewportWidth: number;
  /** Canvas viewport height in pixels */
  viewportHeight: number;
  /** Callback to update pan (for click-to-navigate and drag) */
  onPanTo: (pan: { x: number; y: number }) => void;
  /** Currently selected artifact ID */
  selectedId: string | null;
}

/**
 * Color mapping for artifact types in the minimap.
 * Matches the ::before accent colors on .artifact-card in index.css.
 */
const TYPE_COLORS: Record<string, string> = {
  'vision':        '#9333ea', // purple
  'product-brief': '#9333ea', // purple
  'prd':           '#ef4444', // red
  'requirement':   '#3b82f6', // blue
  'architecture':  '#06b6d4', // cyan
  'epic':          '#22c55e', // green
  'story':         '#eab308', // yellow
  'use-case':      '#f97316', // orange
  'test-case':     '#ef4444', // red
  'test-strategy': '#3b82f6', // blue
};

/** Minimap size constants */
const MINIMAP_WIDTH = 240;
const MINIMAP_HEIGHT = 160;
const MINIMAP_PADDING = 8;

export function Minimap({
  artifacts,
  visibleArtifacts,
  pan,
  zoom,
  viewportWidth,
  viewportHeight,
  onPanTo,
  selectedId,
}: MinimapProps) {
  const minimapRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Compute the bounding box of all artifacts in world space.
  // We use ALL artifacts (not just visible) so the minimap extent is stable
  // regardless of expand/collapse state.
  const worldBounds = useMemo(() => {
    if (artifacts.length === 0) {
      return { minX: 0, minY: 0, maxX: 2000, maxY: 1000 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const a of artifacts) {
      const x = a.position?.x ?? 0;
      const y = a.position?.y ?? 0;
      const w = a.size?.width ?? 250;
      const h = a.size?.height ?? 100;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    }
    // Add padding around the world bounds
    const pad = 60;
    return {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
    };
  }, [artifacts]);

  // Scale factor from world space to minimap space.
  // Fit the world bounding box into MINIMAP_WIDTH x MINIMAP_HEIGHT with padding.
  const scale = useMemo(() => {
    const worldW = worldBounds.maxX - worldBounds.minX;
    const worldH = worldBounds.maxY - worldBounds.minY;
    const innerW = MINIMAP_WIDTH - MINIMAP_PADDING * 2;
    const innerH = MINIMAP_HEIGHT - MINIMAP_PADDING * 2;
    return Math.min(innerW / worldW, innerH / worldH, 1);
  }, [worldBounds]);

  // Convert a world coordinate to minimap coordinate
  const toMinimap = useCallback(
    (wx: number, wy: number) => ({
      x: (wx - worldBounds.minX) * scale + MINIMAP_PADDING,
      y: (wy - worldBounds.minY) * scale + MINIMAP_PADDING,
    }),
    [worldBounds, scale]
  );

  // The viewport rectangle in world space:
  //   pan = translate applied to canvas-content
  //   The visible world region is: [-pan.x/zoom .. (-pan.x + viewportW)/zoom, similarly for Y]
  const viewportRect = useMemo(() => {
    const worldX = -pan.x / zoom;
    const worldY = -pan.y / zoom;
    const worldW = viewportWidth / zoom;
    const worldH = viewportHeight / zoom;
    const topLeft = toMinimap(worldX, worldY);
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: worldW * scale,
      height: worldH * scale,
    };
  }, [pan, zoom, viewportWidth, viewportHeight, scale, toMinimap]);

  // Convert a minimap click/drag position to the canvas pan needed to center
  // the viewport on that world position.
  const minimapToWorldPan = useCallback(
    (mx: number, my: number) => {
      // Minimap position to world position
      const worldX = (mx - MINIMAP_PADDING) / scale + worldBounds.minX;
      const worldY = (my - MINIMAP_PADDING) / scale + worldBounds.minY;
      // Center the viewport on that world position
      return {
        x: -(worldX * zoom - viewportWidth / 2),
        y: -(worldY * zoom - viewportHeight / 2),
      };
    },
    [scale, worldBounds, zoom, viewportWidth, viewportHeight]
  );

  // Handle click to navigate
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = minimapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      isDraggingRef.current = true;
      onPanTo(minimapToWorldPan(mx, my));

      const handleMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const mxm = ev.clientX - rect.left;
        const mym = ev.clientY - rect.top;
        onPanTo(minimapToWorldPan(mxm, mym));
      };
      const handleUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [minimapToWorldPan, onPanTo]
  );

  return (
    <div
      ref={minimapRef}
      className="minimap"
      onMouseDown={handleMouseDown}
      title="Click or drag to navigate"
    >
      {/* Artifact dots — only visible ones get full opacity */}
      {artifacts.map((a) => {
        const pos = toMinimap(a.position?.x ?? 0, a.position?.y ?? 0);
        const w = (a.size?.width ?? 250) * scale;
        const h = (a.size?.height ?? 100) * scale;
        const color = TYPE_COLORS[a.type] ?? '#888';
        const isVisible = visibleArtifacts.some((v) => v.id === a.id);
        const isSelected = a.id === selectedId;
        return (
          <div
            key={a.id}
            className={`minimap-artifact${isSelected ? ' selected' : ''}`}
            style={{
              left: pos.x,
              top: pos.y,
              width: Math.max(w, 2),
              height: Math.max(h, 2),
              background: color,
              opacity: isVisible ? 0.85 : 0.2,
            }}
          />
        );
      })}

      {/* Viewport rectangle */}
      <div
        className="minimap-viewport"
        style={{
          left: viewportRect.x,
          top: viewportRect.y,
          width: viewportRect.width,
          height: viewportRect.height,
        }}
      />
    </div>
  );
}
