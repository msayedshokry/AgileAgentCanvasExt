import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import type { Artifact, ArtifactType, ArtifactStatus, EpicMetadata, RequirementMetadata, UseCaseMetadata, TestCaseMetadata, TestDesignMetadata, StoryMetadata } from '../types';
import { ArtifactCard } from './ArtifactCard';
import { DependencyArrows } from './DependencyArrows';
import { Icon } from './Icon';
import { Minimap } from './Minimap';
import { computeMindmapLayout } from './mindmap-layout';
import html2canvas from 'html2canvas';

export type LayoutMode = 'lanes' | 'mindmap';


interface CanvasProps {
  artifacts: Artifact[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenDetail: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Artifact>) => void;
  onToggleExpand: (id: string) => void;
  expandedIds: Set<string>;
  onRefineWithAI?: (artifact: Artifact) => void;
  onElicit?: (artifact: Artifact) => void;
  onExpandLane: (ids: string[]) => void;
  onCollapseLane: (ids: string[]) => void;
  /** When set, Canvas will pan to center on this artifact ID and briefly flash it. */
  centerOnId?: string | null;
  /** Called after centering so the parent can clear the request. */
  onCentered?: () => void;
  /** Called when the user presses `/` to open the search box (managed by App). */
  onOpenSearch?: () => void;
  /** Set of artifact IDs matching the current search query (from SearchBox). */
  searchMatchIds?: Set<string>;
  /** Incremented by parent to trigger a canvas screenshot capture. */
  screenshotTrigger?: number;
  /** Format requested for screenshot: 'png' or 'pdf'. */
  screenshotFormat?: 'png' | 'pdf';
  /** Called when the screenshot capture completes with the data URL (base64 PNG). */
  onScreenshotReady?: (dataUrl: string, format: 'png' | 'pdf') => void;
  /** Called when screenshot capture fails so the host can surface the error. */
  onScreenshotError?: (message: string) => void;
}

// Map each phase lane to the artifact types whose expand/collapse buttons live there.
// Epics are listed under Implementation because collapsing an epic hides its stories/use-cases.
const LANE_TYPES: Record<string, Artifact['type'][]> = {
  discovery:      ['product-brief', 'vision'],
  planning:       ['prd', 'requirement', 'nfr', 'additional-req', 'risk'],
  solutioning:    ['architecture', 'architecture-decision', 'system-component'],
  implementation: ['epic', 'test-strategy'],
};

// ---------- Lane layout constants ----------
// Original (default) lane layout — matches artifact-transformer.ts output
const LANE_DEFS: { key: string; left: number; width: number; cardTypes: ArtifactType[] }[] = [
  { key: 'discovery',      left: 30,   width: 320, cardTypes: ['product-brief', 'vision'] },
  { key: 'planning',       left: 370,  width: 320, cardTypes: ['prd', 'requirement', 'nfr', 'additional-req', 'risk'] },
  { key: 'solutioning',    left: 710,  width: 320, cardTypes: ['architecture', 'architecture-decision', 'system-component'] },
  { key: 'implementation', left: 1050, width: 400, cardTypes: ['epic', 'story', 'task', 'use-case', 'test-strategy', 'test-case', 'test-coverage'] },
];
const LANE_GAP = 20; // gap between lanes

// ---------- Filter-bar constants ----------
// Types grouped by lane for display
const FILTER_TYPE_GROUPS: { label: string; types: ArtifactType[] }[] = [
  { label: 'Discovery',       types: ['product-brief', 'vision'] },
  { label: 'Planning',        types: ['prd', 'requirement', 'nfr', 'additional-req', 'risk'] },
  { label: 'Solutioning',     types: ['architecture', 'architecture-decision', 'system-component'] },
  { label: 'Implementation',  types: ['epic', 'story', 'task', 'use-case', 'test-strategy', 'test-case', 'test-coverage'] },
];

// Compact status buckets — each bucket maps a display label to the raw statuses it represents
const STATUS_BUCKETS: { label: string; statuses: ArtifactStatus[] }[] = [
  { label: 'Draft',      statuses: ['draft', 'not-started', 'backlog', 'proposed'] },
  { label: 'Ready',      statuses: ['ready', 'ready-for-dev', 'accepted'] },
  { label: 'Active',     statuses: ['in-progress', 'implementing'] },
  { label: 'Review',     statuses: ['in-review', 'review', 'ready-for-review'] },
  { label: 'Done',       statuses: ['complete', 'completed', 'done', 'approved'] },
  { label: 'Other',      statuses: ['blocked', 'archived', 'deprecated', 'superseded', 'rejected'] },
];

// Short labels for filter buttons
const FILTER_TYPE_LABELS: Record<ArtifactType, string> = {
  'product-brief': 'Brief',
  'vision': 'Vision',
  'prd': 'PRD',
  'requirement': 'Req',
  'nfr': 'NFR',
  'additional-req': 'Add. Req',
  'risk': 'Risk',
  'architecture': 'Arch',
  'architecture-decision': 'Decision',
  'system-component': 'Component',
  'epic': 'Epic',
  'story': 'Story',
  'task': 'Task',
  'use-case': 'Use Case',
  'test-strategy': 'Test Strat',
  'test-case': 'Test Case',
  'test-coverage': 'Test Cov',
  'test-design': 'Test Design',
  // TEA module
  'traceability-matrix': 'Trace Matrix',
  'test-review': 'Test Review',
  'nfr-assessment': 'NFR Assess',
  'test-framework': 'Test FW',
  'ci-pipeline': 'CI Pipeline',
  'automation-summary': 'Auto Summary',
  'atdd-checklist': 'ATDD',
  'test-design-qa': 'TD (QA)',
  'test-design-architecture': 'TD (Arch)',
  'test-cases': 'Test Cases',
  // BMM module
  'research': 'Research',
  'ux-design': 'UX Design',
  'readiness-report': 'Readiness',
  'sprint-status': 'Sprint',
  'retrospective': 'Retro',
  'change-proposal': 'Change Prop',
  'code-review': 'Code Review',
  'risks': 'Risks',
  'definition-of-done': 'DoD',
  'fit-criteria': 'Fit Criteria',
  'success-metrics': 'Metrics',
  'project-overview': 'Proj Overview',
  'project-context': 'Proj Context',
  'tech-spec': 'Tech Spec',
  'test-summary': 'Test Summary',
  'source-tree': 'Source Tree',
  // CIS module
  'storytelling': 'Storytelling',
  'problem-solving': 'Problem Solve',
  'innovation-strategy': 'Innovation',
  'design-thinking': 'Design Think',
};

export function Canvas({ artifacts, selectedId, onSelect, onOpenDetail, onUpdate, onToggleExpand, expandedIds, onRefineWithAI, onElicit, onExpandLane, onCollapseLane, centerOnId, onCentered, onOpenSearch, searchMatchIds, screenshotTrigger, screenshotFormat, onScreenshotReady, onScreenshotError }: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panStartOffset, setPanStartOffset] = useState({ x: 0, y: 0 });
  const [flashId, setFlashId] = useState<string | null>(null);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showHint, setShowHint] = useState(true);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [focusMode, setFocusMode] = useState(false);
  const [showFilterBar, setShowFilterBar] = useState(false);
  // Empty set = all types visible (default); non-empty = only those types are hidden
  const [hiddenTypes, setHiddenTypes] = useState<Set<ArtifactType>>(new Set());
  // Empty set = all status buckets visible; non-empty = those bucket indices are hidden
  const [hiddenStatusBuckets, setHiddenStatusBuckets] = useState<Set<number>>(new Set());
  // Lane hiding state
  const [hiddenLanes, setHiddenLanes] = useState<Set<string>>(new Set());
  // Layout mode: 'lanes' (default column view) or 'mindmap' (tree view)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('lanes');
  // Screenshot capture in progress
  const [capturing, setCapturing] = useState(false);

  // Track viewport size for the minimap
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const updateSize = () => setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pan to center on an artifact and briefly flash it when centerOnId is set
  useEffect(() => {
    if (!centerOnId) return;
    // Use adjusted positions so centering matches the visible card location
    const art = visibleArtifacts.find(a => a.id === centerOnId)
             || artifacts.find(a => a.id === centerOnId);
    if (!art || !canvasRef.current) return;

    const viewportW = canvasRef.current.clientWidth;
    const viewportH = canvasRef.current.clientHeight;
    const newPanX = viewportW / 2 - (art.position.x + art.size.width / 2) * zoom;
    const newPanY = viewportH / 2 - (art.position.y + art.size.height / 2) * zoom;

    setPan({ x: newPanX, y: newPanY });
    setFlashId(centerOnId);
    onCentered?.();

    const t = setTimeout(() => setFlashId(null), 1200);
    return () => clearTimeout(t);
  }, [centerOnId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Screenshot capture: triggered by parent incrementing screenshotTrigger ──
  const prevTriggerRef = useRef(screenshotTrigger ?? 0);
  useEffect(() => {
    const trigger = screenshotTrigger ?? 0;
    if (trigger === prevTriggerRef.current) return;
    prevTriggerRef.current = trigger;

    const el = contentRef.current;
    if (!el || !onScreenshotReady) return;
    const fmt = screenshotFormat ?? 'png';

    setCapturing(true);

    // Compute the bounding box of all artifact cards so we can crop the
    // screenshot to just the content area (not the full 4000x4000 canvas).
    const cards = el.querySelectorAll('.artifact-card');
    if (cards.length === 0) {
      setCapturing(false);
      onScreenshotError?.('No artifact cards found on the canvas.');
      return;
    }

    // Convert modern CSS color(srgb r g b) / color(srgb r g b / a) values
    // to rgb()/rgba() that html2canvas can parse.  Modern Chromium (which
    // VSCode embeds) now returns computed colours in the color(srgb ...)
    // format, but html2canvas v1.4.1 only understands rgb/rgba/hsl/hsla/hex.
    // This regex handles standalone values AND color() embedded in compound
    // properties like box-shadow (e.g. "color(srgb 0 0 0 / 0.5) 0px 2px 4px").
    const sanitizeColor = (v: string): string => {
      if (!v) return v;
      return v.replace(
        /color\(srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.e+-]+))?\)/gi,
        (_match, r, g, b, a) => {
          const ri = Math.round(Math.min(1, Math.max(0, parseFloat(r))) * 255);
          const gi = Math.round(Math.min(1, Math.max(0, parseFloat(g))) * 255);
          const bi = Math.round(Math.min(1, Math.max(0, parseFloat(b))) * 255);
          if (a !== undefined) {
            return `rgba(${ri}, ${gi}, ${bi}, ${parseFloat(a)})`;
          }
          return `rgb(${ri}, ${gi}, ${bi})`;
        }
      );
    };

    // Defer the heavy DOM-cloning and html2canvas work to the next animation
    // frame so React has time to render the spinner overlay first.
    const rafId = requestAnimationFrame(() => {

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cards.forEach(card => {
      const rect = card as HTMLElement;
      const left = rect.offsetLeft;
      const top = rect.offsetTop;
      const right = left + rect.offsetWidth;
      const bottom = top + rect.offsetHeight;
      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, right);
      maxY = Math.max(maxY, bottom);
    });

    // Add some padding around the content
    const PAD = 40;
    minX = Math.max(0, minX - PAD);
    minY = Math.max(0, minY - PAD);
    maxX += PAD;
    maxY += PAD;
    const cropW = maxX - minX;
    const cropH = maxY - minY;

    // Capture strategy: instead of passing the huge 4000×4000 canvas-content
    // element to html2canvas (which can hang/OOM with very large DOM subtrees),
    // we build a lightweight temporary off-screen container that holds only
    // clones of the visible cards and the dependency-arrows SVG, repositioned
    // so the bounding-box origin is at (0,0).

    // Resolve the background colour now — CSS custom properties may not be
    // available inside the html2canvas rendering context.
    const resolvedBg = sanitizeColor(getComputedStyle(el).backgroundColor) || '#1e1e1e';

    const tempContainer = document.createElement('div');
    tempContainer.style.cssText = [
      'position: fixed',
      'left: -99999px',
      'top: 0',
      `width: ${cropW}px`,
      `height: ${cropH}px`,
      'overflow: hidden',
      `background: ${resolvedBg}`,
      'z-index: -1',
    ].join(';');
    document.body.appendChild(tempContainer);

    // Clone the dependency-arrows SVG and shift it so arrows render
    // in the correct positions relative to the cropped bounding box.
    const arrowsSvg = el.querySelector('.dependency-arrows');
    if (arrowsSvg) {
      const arrowClone = arrowsSvg.cloneNode(true) as HTMLElement;
      arrowClone.style.position = 'absolute';
      arrowClone.style.left = `${-minX}px`;
      arrowClone.style.top = `${-minY}px`;
      // Use the real element dimensions rather than a stale React memo
      arrowClone.style.width = `${el.scrollWidth}px`;
      arrowClone.style.height = `${el.scrollHeight}px`;

      // Resolve CSS variables in SVG attributes (stroke, fill) so they
      // render correctly inside the html2canvas rendering context
      // where CSS custom properties may not be available.
      const resolveCssVar = (val: string): string => {
        if (!val || !val.startsWith('var(')) return val;
        const tmp = document.createElement('div');
        tmp.style.color = val;
        document.body.appendChild(tmp);
        const resolved = getComputedStyle(tmp).color;
        document.body.removeChild(tmp);
        return sanitizeColor(resolved);
      };
      arrowClone.querySelectorAll('path, polygon, line, circle').forEach(svgEl => {
        const stroke = svgEl.getAttribute('stroke');
        if (stroke?.startsWith('var(')) svgEl.setAttribute('stroke', resolveCssVar(stroke));
        const fill = svgEl.getAttribute('fill');
        if (fill?.startsWith('var(')) svgEl.setAttribute('fill', resolveCssVar(fill));
      });

      tempContainer.appendChild(arrowClone);
    }

    // Clone each visible card, repositioned relative to the crop origin.
    // Also inline all computed styles so they survive the iframe clone that
    // html2canvas performs (CSS custom-properties / stylesheet rules are
    // NOT available inside the cloned iframe document).
    cards.forEach(card => {
      const clone = card.cloneNode(true) as HTMLElement;
      const orig = card as HTMLElement;
      clone.style.position = 'absolute';
      clone.style.left = `${orig.offsetLeft - minX}px`;
      clone.style.top = `${orig.offsetTop - minY}px`;
      clone.style.width = `${orig.offsetWidth}px`;
      clone.style.height = `${orig.offsetHeight}px`;

      // Inline key computed styles on the clone and its descendants so
      // that html2canvas (which clones into an iframe without our stylesheets)
      // can read them directly from element.style.  All colour values are
      // sanitized through sanitizeColor() to convert the modern
      // color(srgb ...) syntax (emitted by Chromium ≥128) to rgb()/rgba()
      // that html2canvas v1.4.1 can parse.
      const inlineStyles = (src: Element, dst: Element) => {
        const cs = getComputedStyle(src);
        const ds = (dst as HTMLElement).style;
        ds.backgroundColor = sanitizeColor(cs.backgroundColor);
        ds.color = sanitizeColor(cs.color);
        ds.borderColor = sanitizeColor(cs.borderColor);
        ds.borderWidth = cs.borderWidth;
        ds.borderStyle = cs.borderStyle;
        ds.borderRadius = cs.borderRadius;
        ds.boxShadow = sanitizeColor(cs.boxShadow);
        ds.fontSize = cs.fontSize;
        ds.fontWeight = cs.fontWeight;
        ds.fontFamily = cs.fontFamily;
        ds.padding = cs.padding;
        ds.margin = cs.margin;
        ds.opacity = cs.opacity;
        ds.overflow = cs.overflow;
        ds.display = cs.display;
        ds.flexDirection = cs.flexDirection;
        ds.alignItems = cs.alignItems;
        ds.justifyContent = cs.justifyContent;
        ds.gap = cs.gap;
        ds.textAlign = cs.textAlign;
        ds.lineHeight = cs.lineHeight;
        ds.letterSpacing = cs.letterSpacing;
        ds.textDecoration = sanitizeColor(cs.textDecoration);
        ds.whiteSpace = cs.whiteSpace;
        ds.textOverflow = cs.textOverflow;
        ds.minWidth = cs.minWidth;
        ds.maxWidth = cs.maxWidth;
        ds.minHeight = cs.minHeight;
        ds.maxHeight = cs.maxHeight;
        // Recurse into children
        const srcChildren = src.children;
        const dstChildren = dst.children;
        for (let i = 0; i < srcChildren.length && i < dstChildren.length; i++) {
          inlineStyles(srcChildren[i], dstChildren[i]);
        }
      };
      inlineStyles(orig, clone);

      tempContainer.appendChild(clone);
    });

    // Race html2canvas against a timeout so it cannot freeze forever.
    const TIMEOUT_MS = 30_000;
    let settled = false;

    const cleanup = () => {
      if (tempContainer.parentNode) document.body.removeChild(tempContainer);
    };

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`Screenshot capture timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS);
    });

    Promise.race([
      html2canvas(tempContainer, {
        width: cropW,
        height: cropH,
        backgroundColor: resolvedBg,
        useCORS: true,
        logging: false,
        imageTimeout: 5000,
      }),
      timeoutPromise,
    ])
      .then((canvas: HTMLCanvasElement) => {
        if (settled) return;
        settled = true;
        cleanup();
        setCapturing(false);
        const dataUrl = canvas.toDataURL('image/png');
        onScreenshotReady(dataUrl, fmt);
      })
      .catch((err: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        setCapturing(false);
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Canvas] screenshot capture failed:', msg);
        onScreenshotError?.(msg);
      });

    }); // end requestAnimationFrame

    return () => cancelAnimationFrame(rafId);
  }, [screenshotTrigger, screenshotFormat, onScreenshotReady, onScreenshotError]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter visible artifacts based on expanded state
  // For multi-level hierarchy, check ALL ancestors are expanded
  const visibleArtifactsRaw = useMemo(() => {
    // Build a map for quick lookup
    const artifactMap = new Map<string, Artifact>();
    artifacts.forEach(a => artifactMap.set(a.id, a));
    
    // Check if all ancestors of an artifact are expanded
    const areAllAncestorsExpanded = (artifact: Artifact): boolean => {
      if (!artifact.parentId) return true; // No parent = always visible
      
      // Parent must be expanded
      if (!expandedIds.has(artifact.parentId)) return false;
      
      // Check parent's ancestors recursively
      const parent = artifactMap.get(artifact.parentId);
      if (!parent) return true; // Parent not found, assume visible
      
      return areAllAncestorsExpanded(parent);
    };
    
    return artifacts.filter(areAllAncestorsExpanded);
  }, [artifacts, expandedIds]);

  // ---------------------------------------------------------------------------
  // Dynamic epic-row compaction: when an epic is collapsed, its row band
  // shrinks to just the epic card height and subsequent rows shift upward.
  // This produces adjusted y-positions for ALL implementation-lane artifacts,
  // adjusted rowY/rowHeight for epic row bands, and adjusted test-strategy
  // row bands.
  // ---------------------------------------------------------------------------
  const ROW_PADDING = 20;

  const { visibleArtifacts, adjustedRowBands, adjustedTestBands } = useMemo(() => {
    // Collect epics that have row bands, sorted by their original rowY
    const epics = artifacts
      .filter(a => a.type === 'epic' && a.rowY !== undefined)
      .sort((a, b) => (a.rowY ?? 0) - (b.rowY ?? 0));

    if (epics.length === 0) {
      return {
        visibleArtifacts: visibleArtifactsRaw,
        adjustedRowBands: [] as { epic: Artifact; adjustedRowY: number; adjustedRowHeight: number }[],
        adjustedTestBands: artifacts
          .filter(a => a.type === 'test-strategy' && a.rowY !== undefined && (a.rowHeight ?? 0) > 0)
          .map(ts => ({ artifact: ts, adjustedRowY: ts.rowY!, adjustedRowHeight: ts.rowHeight! })),
      };
    }

    // Build a map from epicId → all descendant artifact IDs (children + grandchildren)
    const epicDescendants = new Map<string, Set<string>>();
    for (const epic of epics) {
      const descendants = new Set<string>();
      // Find all direct and indirect children of this epic
      const queue = [epic.id];
      while (queue.length > 0) {
        const parentId = queue.pop()!;
        for (const a of artifacts) {
          if (a.parentId === parentId && a.id !== epic.id) {
            descendants.add(a.id);
            queue.push(a.id);
          }
        }
      }
      epicDescendants.set(epic.id, descendants);
    }

    // Compute per-epic: collapsed row height vs expanded row height
    const rowBands: { epic: Artifact; adjustedRowY: number; adjustedRowHeight: number }[] = [];
    let cumulativeDelta = 0;

    for (const epic of epics) {
      const originalRowY = epic.rowY!;
      const originalRowHeight = epic.rowHeight!;
      const isExpanded = expandedIds.has(epic.id);

      let effectiveRowHeight: number;
      if (isExpanded || (epic.childCount ?? 0) === 0) {
        // Expanded or no children — keep original height
        effectiveRowHeight = originalRowHeight;
      } else {
        // Collapsed — shrink to just the epic card height + padding
        const epicCardH = epic.size?.height ?? 100;
        effectiveRowHeight = epicCardH + ROW_PADDING * 2;
      }

      const adjustedRowY = originalRowY - cumulativeDelta;
      rowBands.push({ epic, adjustedRowY, adjustedRowHeight: effectiveRowHeight });

      const saved = originalRowHeight - effectiveRowHeight;
      cumulativeDelta += saved;
    }

    // Build yDelta map for each artifact ID
    const yDeltaMap = new Map<string, number>();

    // For each epic, compute its delta and assign it + its descendants the same delta.
    for (let i = 0; i < epics.length; i++) {
      const epic = epics[i];
      const band = rowBands[i];
      const epicDelta = (epic.rowY!) - band.adjustedRowY;
      yDeltaMap.set(epic.id, epicDelta);
      const descendants = epicDescendants.get(epic.id);
      if (descendants) {
        for (const descId of descendants) {
          yDeltaMap.set(descId, epicDelta);
        }
      }
    }

    // The total delta after all epics is cumulativeDelta — apply to test-strategy/test-case
    // artifacts that come after all epic rows.
    const totalDelta = cumulativeDelta;

    // Apply y-adjustments to visibleArtifactsRaw
    const adjusted = visibleArtifactsRaw.map(a => {
      const delta = yDeltaMap.get(a.id);
      if (delta && delta !== 0) {
        return {
          ...a,
          position: { ...a.position, y: a.position.y - delta },
          // Also adjust rowY/rowHeight for epics if they have them
          ...(a.rowY !== undefined ? { rowY: a.rowY - delta } : {}),
        };
      }
      // For test-strategy and orphan test-cases not under any epic, apply totalDelta
      if (totalDelta > 0 && !yDeltaMap.has(a.id) &&
          (a.type === 'test-strategy' || (a.type === 'test-case' && !a.parentId))) {
        return {
          ...a,
          position: { ...a.position, y: a.position.y - totalDelta },
          ...(a.rowY !== undefined ? { rowY: a.rowY - totalDelta } : {}),
        };
      }
      return a;
    });

    // Adjust test-strategy bands
    const testBands = artifacts
      .filter(a => a.type === 'test-strategy' && a.rowY !== undefined && (a.rowHeight ?? 0) > 0)
      .map(ts => ({
        artifact: ts,
        adjustedRowY: ts.rowY! - totalDelta,
        adjustedRowHeight: ts.rowHeight!,
      }));

    return { visibleArtifacts: adjusted, adjustedRowBands: rowBands, adjustedTestBands: testBands };
  }, [artifacts, visibleArtifactsRaw, expandedIds]);

  // Compute expandable IDs per lane (artifacts with children in that lane's types)
  const laneExpandableIds = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const lane of Object.keys(LANE_TYPES)) {
      result[lane] = artifacts
        .filter(a => LANE_TYPES[lane].includes(a.type) && (a.childCount ?? 0) > 0)
        .map(a => a.id);
    }
    return result;
  }, [artifacts]);

  // Implementation lane width: fit exactly the rightmost *visible* story/use-case/test card + padding.
  // Falls back to just covering the epic column when no children exist.
  const implLaneWidth = useMemo(() => {
    const LANE_LEFT = 1050;
    const PADDING = 30;
    let maxRight = LANE_LEFT + 310; // minimum: just the epic column (280 wide + 30 pad)
    visibleArtifacts.forEach(a => {
      if (a.type === 'story' || a.type === 'use-case' || a.type === 'test-case' || a.type === 'test-strategy' || a.type === 'epic' || a.type === 'task' || a.type === 'test-coverage' || a.type === 'risk') {
        const right = (a.position?.x ?? 0) + (a.size?.width ?? 250);
        if (right > maxRight) maxRight = right;
      }
    });
    return maxRight - LANE_LEFT + PADDING;
  }, [visibleArtifacts]);

  // ---------------------------------------------------------------------------
  // Lane hiding: compute effective lane positions and per-artifact x-offset
  // when lanes are hidden.
  // ---------------------------------------------------------------------------
  const laneLayout = useMemo(() => {
    // Default effective width for implementation lane
    const effectiveImplWidth = implLaneWidth;
    const HIDDEN_TAB_WIDTH = 28; // width of collapsed lane tab

    if (hiddenLanes.size === 0) {
      // No lanes hidden — return original positions with zero offsets
      const positions: Record<string, { left: number; width: number; visible: boolean }> = {};
      for (const lane of LANE_DEFS) {
        const w = lane.key === 'implementation' ? effectiveImplWidth : lane.width;
        positions[lane.key] = { left: lane.left, width: w, visible: true };
      }
      return { positions, xOffset: 0, hiddenCardTypes: new Set<ArtifactType>() };
    }

    // Compute positions for visible lanes, packed left
    // Hidden lanes get a small tab width so their indicator is positioned correctly
    const positions: Record<string, { left: number; width: number; visible: boolean }> = {};
    const hiddenCardTypes = new Set<ArtifactType>();
    let currentLeft = LANE_DEFS[0].left; // start at first lane's original left

    for (const lane of LANE_DEFS) {
      const isVisible = !hiddenLanes.has(lane.key);
      const laneWidth = lane.key === 'implementation' ? effectiveImplWidth : lane.width;
      if (isVisible) {
        positions[lane.key] = { left: currentLeft, width: laneWidth, visible: true };
        currentLeft += laneWidth + LANE_GAP;
      } else {
        positions[lane.key] = { left: currentLeft, width: 0, visible: false };
        lane.cardTypes.forEach(t => hiddenCardTypes.add(t));
        currentLeft += HIDDEN_TAB_WIDTH + LANE_GAP;
      }
    }

    // Compute how much each original lane left needs to shift
    // xOffset for a card = newLaneLeft - originalLaneLeft
    return { positions, xOffset: 0 /* unused, per-lane shifts below */, hiddenCardTypes };
  }, [hiddenLanes, implLaneWidth]);

  // Build a lookup: given an artifact type, what's the x-offset?
  const laneXOffsets = useMemo(() => {
    if (hiddenLanes.size === 0) return null; // no shifting needed

    const offsets = new Map<string, number>(); // laneKey → dx
    for (const lane of LANE_DEFS) {
      const pos = laneLayout.positions[lane.key];
      if (pos && pos.visible) {
        offsets.set(lane.key, pos.left - lane.left);
      }
    }

    // Map artifact type to lane key
    const typeToLane = new Map<ArtifactType, string>();
    for (const lane of LANE_DEFS) {
      for (const t of lane.cardTypes) {
        typeToLane.set(t, lane.key);
      }
    }

    return { offsets, typeToLane };
  }, [hiddenLanes.size, laneLayout.positions]);

  // Compute per-lane heights from visible artifacts so each lane adapts
  // independently when cards are collapsed/expanded.
  const LANE_TOP = 68;

  const laneHeights = useMemo(() => {
    const LANE_CONTENT_TYPES: Record<string, string[]> = {
      discovery:      ['product-brief', 'vision'],
      planning:       ['prd', 'requirement', 'nfr', 'additional-req', 'risk'],
      solutioning:    ['architecture', 'architecture-decision', 'system-component'],
      implementation: ['epic', 'story', 'use-case', 'test-strategy', 'test-case', 'test-coverage', 'task'],
    };
    const BOTTOM_PADDING = 60;
    const MIN_BOTTOM = LANE_TOP + 200;   // shortest lane is 200px tall
    const heights: Record<string, number> = {};
    for (const [lane, types] of Object.entries(LANE_CONTENT_TYPES)) {
      let maxBottom = MIN_BOTTOM;
      visibleArtifacts.forEach(a => {
        if (types.includes(a.type)) {
          const bottom = (a.position?.y ?? 0) + (a.size?.height ?? 100);
          if (bottom > maxBottom) maxBottom = bottom;
        }
      });
      heights[lane] = maxBottom - LANE_TOP + BOTTOM_PADDING;
    }
    return heights;
  }, [visibleArtifacts]);

  // ---------------------------------------------------------------------------
  // Dependency highlighting: when a card is selected, highlight:
  //   - The selected card itself
  //   - ALL ancestors (walk UP via parentId — unlimited depth)
  //   - Direct (1-hop) cross-reference neighbours of the SELECTED card only
  //     (dependency arrows, metadata refs, blocking deps, etc.)
  //
  // Children are NOT highlighted — selecting a parent doesn't light up its
  // entire sub-tree.  Ancestors are always shown so you can trace "where does
  // this card sit in the hierarchy?"  Cross-refs show peer relationships.
  // ---------------------------------------------------------------------------
  const connectedIds = useMemo<Set<string> | null>(() => {
    if (!selectedId) return null;

    // --- Build parent map and directed cross-ref map ---
    // Cross-refs are stored ONLY in the forward direction (a → b):
    // when card A's metadata references card B, we record A → B.
    // This ensures that selecting B does NOT highlight A (no reverse lookup).
    const parentOf = new Map<string, string>();           // child → parent
    const crossRef = new Map<string, Set<string>>();

    const addXRef = (from: string, to: string) => {
      if (!from || !to || from === to) return;
      if (!crossRef.has(from)) crossRef.set(from, new Set());
      crossRef.get(from)!.add(to);
    };

    for (const a of artifacts) {
      // Parent-child link
      if (a.parentId) {
        parentOf.set(a.id, a.parentId);
      }

      // Explicit dependency arrows — cross-ref (1-hop)
      for (const depId of a.dependencies) {
        addXRef(a.id, depId);
      }

      // Metadata cross-references (1-hop)
      const m = a.metadata;
      if (m) {
        switch (a.type) {
          case 'requirement': {
            const rm = m as RequirementMetadata;
            rm.relatedEpics?.forEach(id => addXRef(a.id, id));
            rm.relatedStories?.forEach(id => addXRef(a.id, id));
            rm.dependencies?.forEach(id => addXRef(a.id, id));
            break;
          }
          case 'story': {
            const sm = m as StoryMetadata;
            // Only add epicId cross-ref if it differs from the parent
            // (parentId already handles the parent→child walk-up;
            //  adding it as a cross-ref would indirectly highlight children)
            if (sm.epicId && sm.epicId !== a.parentId) addXRef(a.id, sm.epicId);
            sm.requirementRefs?.forEach(id => addXRef(a.id, id));
            // blockedBy/blocks items may be objects {storyId, ...} or plain string IDs
            sm.dependencies?.blockedBy?.forEach((item: any) => {
              const id = typeof item === 'string' ? item : item?.storyId;
              if (id) addXRef(a.id, id);
            });
            // blocks: bidirectional — selecting either story highlights the other
            sm.dependencies?.blocks?.forEach((item: any) => {
              const id = typeof item === 'string' ? item : item?.storyId;
              if (id) {
                addXRef(a.id, id);   // selecting this story highlights blocked story
                addXRef(id, a.id);   // selecting blocked story highlights this blocker
              }
            });
            sm.dependencies?.relatedStories?.forEach(id => addXRef(a.id, id));
            break;
          }
          case 'epic': {
            const em = m as EpicMetadata;
            em.functionalRequirements?.forEach(id => addXRef(a.id, id));
            em.nonFunctionalRequirements?.forEach(id => addXRef(a.id, id));
            em.additionalRequirements?.forEach(id => addXRef(a.id, id));
            em.dependencies?.forEach(id => addXRef(a.id, id));
            // upstream/downstream items may be objects {epicId, reason} or strings
            em.epicDependencies?.upstream?.forEach((item: any) => {
              const id = typeof item === 'string' ? item : item?.epicId;
              if (id) addXRef(a.id, id);
            });
            // downstream: bidirectional — selecting this epic highlights downstream and vice versa
            em.epicDependencies?.downstream?.forEach((item: any) => {
              const id = typeof item === 'string' ? item : item?.epicId;
              if (id) {
                addXRef(a.id, id);   // selecting this epic highlights downstream
                addXRef(id, a.id);   // selecting downstream epic highlights this one
              }
            });
            // relatedEpics: bidirectional
            em.epicDependencies?.relatedEpics?.forEach((id: string) => {
              if (id) {
                addXRef(a.id, id);
                addXRef(id, a.id);
              }
            });
            break;
          }
          case 'use-case': {
            const uc = m as UseCaseMetadata;
            if (uc.relatedEpic && uc.relatedEpic !== a.parentId) addXRef(a.id, uc.relatedEpic);
            uc.relatedStories?.forEach(id => addXRef(a.id, id));
            uc.relatedRequirements?.forEach(id => addXRef(a.id, id));
            break;
          }
          case 'test-case': {
            const tc = m as TestCaseMetadata;
            // Skip metadata refs that duplicate the parentId relationship
            if (tc.storyId && tc.storyId !== a.parentId) addXRef(a.id, tc.storyId);
            if (tc.epicId && tc.epicId !== a.parentId) addXRef(a.id, tc.epicId);
            tc.relatedRequirements?.forEach(id => addXRef(a.id, id));
            break;
          }
          case 'test-coverage': {
            // Test coverage cards reference their parent story/epic
            const tcm = m as any;
            if (tcm.storyId && tcm.storyId !== a.parentId) addXRef(a.id, tcm.storyId);
            if (tcm.epicId && tcm.epicId !== a.parentId) addXRef(a.id, tcm.epicId);
            break;
          }
          case 'test-design': {
            const td = m as TestDesignMetadata;
            if (td.epicInfo?.epicId && td.epicInfo.epicId !== a.parentId) addXRef(a.id, td.epicInfo.epicId);
            break;
          }
        }
      }
    }

    const result = new Set<string>();
    result.add(selectedId);

    // Step 1: Walk UP to all ancestors (unlimited depth)
    let cur = selectedId;
    while (parentOf.has(cur)) {
      const parent = parentOf.get(cur)!;
      result.add(parent);
      cur = parent;
    }

    // Step 2: Walk DOWN to all descendants (unlimited depth)
    // Build parent → children[] map
    const childrenOf = new Map<string, string[]>();
    for (const a of artifacts) {
      if (a.parentId) {
        let kids = childrenOf.get(a.parentId);
        if (!kids) { kids = []; childrenOf.set(a.parentId, kids); }
        kids.push(a.id);
      }
    }
    const walkDown = (id: string) => {
      const kids = childrenOf.get(id);
      if (!kids) return;
      for (const kid of kids) {
        if (!result.has(kid)) {
          result.add(kid);
          walkDown(kid);
        }
      }
    };
    walkDown(selectedId);

    // Step 3: Collect 1-hop cross-ref neighbours of the selected card only
    const neighbours = crossRef.get(selectedId);
    if (neighbours) {
      for (const n of neighbours) {
        result.add(n);
      }
    }

    // If the only ID is the selected card itself, no connections exist —
    // don't dim anything (return null = no highlighting active).
    return result.size > 1 ? result : null;
  }, [selectedId, artifacts]);

  // ---------------------------------------------------------------------------
  // Focus-mode tree: extends connectedIds with direct children of the selected
  // card and its ancestors.  Cross-ref'd nodes do NOT have their children
  // expanded — only the selected card's own lineage sub-tree is shown.
  // ---------------------------------------------------------------------------
  const focusTreeIds = useMemo<Set<string> | null>(() => {
    if (!focusMode || !selectedId || !connectedIds) return null;

    // Build parent → children[] map once
    const childrenOf = new Map<string, string[]>();
    const parentOf = new Map<string, string>();
    for (const a of artifacts) {
      if (a.parentId) {
        parentOf.set(a.id, a.parentId);
        let kids = childrenOf.get(a.parentId);
        if (!kids) { kids = []; childrenOf.set(a.parentId, kids); }
        kids.push(a.id);
      }
    }

    // Identify the selected card's ancestor chain (excluding cross-refs)
    const ancestorChain = new Set<string>();
    ancestorChain.add(selectedId);
    let cur = selectedId;
    while (parentOf.has(cur)) {
      const parent = parentOf.get(cur)!;
      ancestorChain.add(parent);
      cur = parent;
    }

    // Start with everything connectedIds already has (ancestors + cross-refs)
    const result = new Set(connectedIds);

    // Walk DOWN: for every ID in the ancestor chain (NOT cross-refs), add direct children
    for (const id of ancestorChain) {
      const kids = childrenOf.get(id);
      if (kids) {
        for (const kid of kids) {
          result.add(kid);
        }
      }
    }

    return result;
  }, [focusMode, selectedId, connectedIds, artifacts]);

  // Compute canvas-content dimensions from actual content bounds so the SVG
  // container (and by extension dependency arrows) is never clipped.
  const canvasContentSize = useMemo(() => {
    const MIN_SIZE = 4000;
    const PADDING = 200;
    let maxRight = 0;
    let maxBottom = 0;
    visibleArtifacts.forEach(a => {
      const right = (a.position?.x ?? 0) + (a.size?.width ?? 250);
      const bottom = (a.position?.y ?? 0) + (a.size?.height ?? 100);
      if (right > maxRight) maxRight = right;
      if (bottom > maxBottom) maxBottom = bottom;
    });
    return {
      width: Math.max(MIN_SIZE, maxRight + PADDING),
      height: Math.max(MIN_SIZE, maxBottom + PADDING),
    };
  }, [visibleArtifacts]);

  // Handle mouse wheel for zooming
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      
      // Get mouse position relative to canvas
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calculate zoom
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.25, Math.min(2, zoom * zoomFactor));
      
      // Adjust pan to keep mouse position fixed
      const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
      const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);
      
      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    } else {
      // Scroll to pan
      setPan(p => ({
        x: p.x - e.deltaX,
        y: p.y - e.deltaY
      }));
    }
  }, [zoom, pan]);

  // Start panning on mouse down (left click on canvas background)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start pan if clicking on canvas background (not on a card)
    const target = e.target as HTMLElement;
    const isCanvasBackground = target === canvasRef.current || 
                                target === contentRef.current ||
                                target.classList.contains('canvas') ||
                                target.classList.contains('canvas-content');
    
    if (e.button === 0 && isCanvasBackground) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      setPanStartOffset({ x: pan.x, y: pan.y });
      // Don't deselect here — deselect only on double-click on empty space
      // or when another card is selected (handled by ArtifactCard.onSelect)
    }
    // Middle mouse button always pans
    if (e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      setPanStartOffset({ x: pan.x, y: pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPan({
        x: panStartOffset.x + dx,
        y: panStartOffset.y + dy
      });
    }
  }, [isPanning, panStart, panStartOffset]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Double-click on empty canvas space deselects the current card
  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isCanvasBackground = target === canvasRef.current ||
                                target === contentRef.current ||
                                target.classList.contains('canvas') ||
                                target.classList.contains('canvas-content');
    if (isCanvasBackground) {
      onSelect(null);
    }
  }, [onSelect]);

  // Keyboard shortcuts for canvas navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Don't intercept when an input/textarea/select is focused
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const PAN_STEP = 60;
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setPan(p => ({ ...p, y: p.y + PAN_STEP }));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setPan(p => ({ ...p, y: p.y - PAN_STEP }));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setPan(p => ({ ...p, x: p.x + PAN_STEP }));
        break;
      case 'ArrowRight':
        e.preventDefault();
        setPan(p => ({ ...p, x: p.x - PAN_STEP }));
        break;
      case '+':
      case '=':
        e.preventDefault();
        setZoom(z => Math.min(2, z * 1.2));
        break;
      case '-':
        e.preventDefault();
        setZoom(z => Math.max(0.25, z * 0.8));
        break;
      case '0':
        e.preventDefault();
        setZoom(1);
        setPan({ x: 0, y: 0 });
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        setShowMinimap(v => !v);
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        if (selectedId) {
          setFocusMode(fm => !fm);
        }
        break;
      case 't':
      case 'T':
        e.preventDefault();
        setShowFilterBar(v => !v);
        break;
      case 'l':
      case 'L':
        e.preventDefault();
        setLayoutMode(m => m === 'lanes' ? 'mindmap' : 'lanes');
        // When switching back to lanes, reset pan/zoom. For mindmap, the
        // fit-to-view useEffect handles zoom/pan automatically.
        if (layoutMode === 'mindmap') {
          setPan({ x: 0, y: 0 });
          setZoom(1);
        }
        break;
      case '/':
        e.preventDefault();
        onOpenSearch?.();
        break;
      case 'Escape':
        e.preventDefault();
        if (showFilterBar) {
          setShowFilterBar(false);
        } else if (focusMode) {
          setFocusMode(false);
        } else {
          onSelect(null);
        }
        break;
    }
  }, [onSelect, selectedId, focusMode, showFilterBar, onOpenSearch, layoutMode]);

  // Prevent context menu on right click
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Renders a single expand/collapse toggle button for a lane header.
  // Shows "v" (expand all) unless every expandable card is already expanded,
  // in which case shows ">" (collapse all).
  const renderLaneButtons = (lane: string) => {
    const ids = laneExpandableIds[lane];
    if (!ids || ids.length === 0) return null;
    const allExpanded = ids.every(id => expandedIds.has(id));
    return (
      <span className="lane-toggle-btns">
        <button
          className="lane-btn"
          title={allExpanded ? 'Collapse all in lane' : 'Expand all in lane'}
          onClick={(e) => { e.stopPropagation(); allExpanded ? onCollapseLane(ids) : onExpandLane(ids); }}
        >{allExpanded ? <Icon name="chevron-right" size={12} /> : <Icon name="chevron-down" size={12} />}</button>
      </span>
    );
  };

  // ---------------------------------------------------------------------------
  // Type/status filter: compute hidden status set from bucket indices
  // ---------------------------------------------------------------------------
  const hiddenStatuses = useMemo<Set<ArtifactStatus>>(() => {
    if (hiddenStatusBuckets.size === 0) return new Set();
    const result = new Set<ArtifactStatus>();
    hiddenStatusBuckets.forEach(idx => {
      const bucket = STATUS_BUCKETS[idx];
      if (bucket) bucket.statuses.forEach(s => result.add(s));
    });
    return result;
  }, [hiddenStatusBuckets]);

  const hasActiveFilters = hiddenTypes.size > 0 || hiddenStatuses.size > 0;

  // ---------------------------------------------------------------------------
  // Focus-mode filtering: when focus mode is active, show only tree members.
  // Type/status filters also applied here.
  // Also determines the effective highlight set for dependency arrows.
  // ---------------------------------------------------------------------------
  const displayArtifacts = useMemo(() => {
    let result = visibleArtifacts;

    // Focus mode filter
    if (focusTreeIds) {
      result = result.filter(a => focusTreeIds.has(a.id));
    }

    // Type/status filter (skip if no active filters)
    if (hasActiveFilters) {
      result = result.filter(a => {
        if (hiddenTypes.has(a.type)) return false;
        if (hiddenStatuses.has(a.status)) return false;
        return true;
      });
    }

    // Lane hiding: remove cards in hidden lanes and shift x-positions
    if (hiddenLanes.size > 0) {
      result = result.filter(a => !laneLayout.hiddenCardTypes.has(a.type));

      if (laneXOffsets) {
        result = result.map(a => {
          const laneKey = laneXOffsets.typeToLane.get(a.type);
          const dx = laneKey ? (laneXOffsets.offsets.get(laneKey) ?? 0) : 0;
          if (dx === 0) return a;
          return { ...a, position: { ...a.position, x: a.position.x + dx } };
        });
      }
    }

    return result;
  }, [visibleArtifacts, focusTreeIds, hasActiveFilters, hiddenTypes, hiddenStatuses, hiddenLanes, laneLayout, laneXOffsets]);

  // When in mindmap mode, recompute positions using the tree layout engine.
  // In lanes mode, pass through displayArtifacts unchanged.
  const finalArtifacts = useMemo(() => {
    if (layoutMode !== 'mindmap') return displayArtifacts;
    // Filter out virtual phase nodes that don't exist in the original data
    return computeMindmapLayout(displayArtifacts);
  }, [layoutMode, displayArtifacts]);

  // Compute group bounding boxes for mindmap mode.
  // For every artifact that has children in the layout, compute a bounding box
  // that encompasses the parent and all its descendants.
  const mindmapGroupBoxes = useMemo(() => {
    if (layoutMode !== 'mindmap' || finalArtifacts.length === 0) return [];

    // Build a parent→children lookup from positioned artifacts
    const byId = new Map<string, Artifact>();
    const childrenMap = new Map<string, string[]>();
    for (const a of finalArtifacts) {
      byId.set(a.id, a);
      if (a.parentId && !a.id.startsWith('__phase_')) {
        let kids = childrenMap.get(a.parentId);
        if (!kids) { kids = []; childrenMap.set(a.parentId, kids); }
        kids.push(a.id);
      }
    }

    // Collect all descendants of a given root
    function collectDescendants(rootId: string): string[] {
      const ids: string[] = [rootId];
      const queue = [rootId];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const kids = childrenMap.get(cur);
        if (kids) {
          for (const kid of kids) {
            ids.push(kid);
            queue.push(kid);
          }
        }
      }
      return ids;
    }

    // Only create group boxes for non-virtual artifacts that have children
    const groups: { id: string; colorIndex: number; x: number; y: number; w: number; h: number }[] = [];
    const PAD = 14; // padding around the group
    let groupIdx = 0;

    for (const a of finalArtifacts) {
      if (a.id.startsWith('__phase_')) continue;
      const kids = childrenMap.get(a.id);
      if (!kids || kids.length === 0) continue;

      // Collect all descendant IDs and compute bounding box
      const allIds = collectDescendants(a.id);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of allIds) {
        const node = byId.get(id);
        if (!node) continue;
        const nx = node.position?.x ?? 0;
        const ny = node.position?.y ?? 0;
        const nw = node.size?.width ?? 170;
        const nh = node.size?.height ?? 50;
        if (nx < minX) minX = nx;
        if (ny < minY) minY = ny;
        if (nx + nw > maxX) maxX = nx + nw;
        if (ny + nh > maxY) maxY = ny + nh;
      }

      groups.push({
        id: a.id,
        colorIndex: groupIdx++,
        x: minX - PAD,
        y: minY - PAD,
        w: maxX - minX + PAD * 2,
        h: maxY - minY + PAD * 2,
      });
    }

    return groups;
  }, [layoutMode, finalArtifacts]);

  // Auto fit-to-view when entering mindmap mode.
  // Computes optimal zoom to fit all mindmap nodes in the viewport with padding.
  useEffect(() => {
    if (layoutMode !== 'mindmap' || finalArtifacts.length === 0) return;
    const el = canvasRef.current;
    if (!el) return;
    const vpW = el.clientWidth;
    const vpH = el.clientHeight;
    if (vpW === 0 || vpH === 0) return;

    // Compute bounding box of all mindmap nodes
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    for (const a of finalArtifacts) {
      const ax = a.position?.x ?? 0;
      const ay = a.position?.y ?? 0;
      const aw = a.size?.width ?? 170;
      const ah = a.size?.height ?? 50;
      if (ax < minX) minX = ax;
      if (ay < minY) minY = ay;
      if (ax + aw > maxX) maxX = ax + aw;
      if (ay + ah > maxY) maxY = ay + ah;
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW === 0 || contentH === 0) return;

    const FIT_PADDING = 60; // px padding on each side
    const fitZoomW = (vpW - FIT_PADDING * 2) / contentW;
    const fitZoomH = (vpH - FIT_PADDING * 2) / contentH;
    // Pick the smaller of the two to ensure everything fits, but cap between 0.3 and 1
    const fitZoom = Math.max(0.3, Math.min(1, Math.min(fitZoomW, fitZoomH)));

    // Center the content in the viewport
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const panX = vpW / 2 - centerX * fitZoom;
    const panY = vpH / 2 - centerY * fitZoom;

    setZoom(fitZoom);
    setPan({ x: panX, y: panY });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode, finalArtifacts]);

  // In focus mode use the tree for arrow highlighting; otherwise use single-hop connectedIds
  const arrowHighlightIds = focusTreeIds ?? connectedIds;

  // Search match IDs now come from the SearchBox component via props.
  // Provide a stable default so downstream code doesn't need to null-check.
  const effectiveSearchMatchIds = searchMatchIds ?? new Set<string>();

  return (
    <div
      ref={canvasRef}
      className={`canvas ${isPanning ? 'panning' : ''} ${focusMode ? 'focus-mode' : ''} ${layoutMode === 'mindmap' ? 'mindmap-mode' : ''}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleCanvasDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <div
        ref={contentRef}
        className="canvas-content"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: canvasContentSize.width,
          height: canvasContentSize.height,
        }}
      >
        {/* Mindmap group boxes — rendered behind cards & arrows */}
        {layoutMode === 'mindmap' && mindmapGroupBoxes.map(box => (
          <div
            key={`group-${box.id}`}
            className={`mindmap-group-box group-color-${box.colorIndex % 8}`}
            style={{
              position: 'absolute',
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
            }}
          />
        ))}

        {/* Dependency arrows layer - only for displayed artifacts */}
        <DependencyArrows artifacts={finalArtifacts} highlightedIds={arrowHighlightIds} layoutMode={layoutMode} />
        
        {/* Render visible artifacts with absolute positioning */}
        {finalArtifacts.map(artifact => (
          <ArtifactCard
            key={artifact.id}
            artifact={artifact}
            isSelected={artifact.id === selectedId}
            isExpanded={expandedIds.has(artifact.id)}
            isFlashing={artifact.id === flashId}
            isDimmed={!focusMode && connectedIds != null && !connectedIds.has(artifact.id)}
            isSearchMatch={effectiveSearchMatchIds.has(artifact.id)}
            compact={layoutMode === 'mindmap'}
            onSelect={onSelect}
            onOpenDetail={onOpenDetail}
            onUpdate={onUpdate}
            onToggleExpand={onToggleExpand}
            onRefineWithAI={onRefineWithAI}
            onElicit={onElicit}
          />
        ))}

        {/* ── Lane chrome (column view only) ── */}
        {layoutMode === 'lanes' && (<>
        {/* Column headers for visual guidance - BMAD workflow phases */}
        <div className="column-headers">
          {LANE_DEFS.map(lane => {
            const pos = laneLayout.positions[lane.key];
            if (!pos) return null;
            if (!pos.visible) {
              // Hidden lane: render a collapsed indicator tab
              return (
                <button
                  key={`hidden-${lane.key}`}
                  className={`lane-hidden-tab ${lane.key}`}
                  style={{ left: pos.left }}
                  title={`Show ${lane.key} lane`}
                  onClick={() => setHiddenLanes(prev => { const next = new Set(prev); next.delete(lane.key); return next; })}
                >
                  <Icon name="chevron-right" size={10} />
                  <span className="lane-hidden-tab-label">{lane.key.charAt(0).toUpperCase() + lane.key.slice(1)}</span>
                </button>
              );
            }
            return (
              <div key={lane.key} className={`column-header ${lane.key}`} style={{ left: pos.left + 20 }}>
                {lane.key.charAt(0).toUpperCase() + lane.key.slice(1)}
                {renderLaneButtons(lane.key)}
                <button
                  className="lane-hide-btn"
                  title={`Hide ${lane.key} lane`}
                  onClick={(e) => { e.stopPropagation(); setHiddenLanes(prev => { const next = new Set(prev); next.add(lane.key); return next; }); }}
                >
                  <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevron-right" size={10} /></span>
                </button>
              </div>
            );
          })}
        </div>
        
        {/* Sub-headers showing artifact types */}
        <div className="column-subheaders">
          {laneLayout.positions.discovery?.visible && (
            <div className="column-subheader" style={{ left: laneLayout.positions.discovery.left + 20 }}>Brief / Vision</div>
          )}
          {laneLayout.positions.planning?.visible && (
            <div className="column-subheader" style={{ left: laneLayout.positions.planning.left + 20 }}>PRD / Risks / Reqs</div>
          )}
          {laneLayout.positions.solutioning?.visible && (
            <div className="column-subheader" style={{ left: laneLayout.positions.solutioning.left + 20 }}>Architecture / Decisions / Components</div>
          )}
          {laneLayout.positions.implementation?.visible && (
            <>
              <div className="column-subheader" style={{ left: laneLayout.positions.implementation.left + 20 }}>Epics</div>
              <div className="column-subheader" style={{ left: laneLayout.positions.implementation.left + 340 }}>Stories | Tasks | Use Cases | Tests</div>
            </>
          )}
        </div>
        
        {/* Epic row bands — horizontal swimlanes showing which stories/use-cases belong to each epic */}
        {laneLayout.positions.implementation?.visible && adjustedRowBands.map(({ epic, adjustedRowY, adjustedRowHeight }, i) => {
            const epicMeta = epic.metadata as EpicMetadata;
            const total = epicMeta?.totalStoryCount ?? 0;
            const done = epicMeta?.doneStoryCount ?? 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const subGroups = epicMeta?.subGroups;
            const isEpicExpanded = expandedIds.has(epic.id);
            // Band left edge aligns with implementation lane position.
            const implPos = laneLayout.positions.implementation;
            const bandLeft = implPos.left;
            return (
              <div
                key={`row-band-${epic.id}`}
                className={`epic-row-band ${i % 2 === 0 ? 'even' : 'odd'}`}
                style={{
                  top: adjustedRowY,
                  height: adjustedRowHeight,
                  left: bandLeft,
                  width: implLaneWidth,
                  right: 'unset',
                }}
              >
                {isEpicExpanded && subGroups?.stories && (
                  <div
                    className="epic-subgroup-label"
                    style={{
                      left: subGroups.stories.x - 1050,
                      top: (subGroups.stories.y - (epic.rowY ?? 0)) - 20,
                      width: subGroups.stories.width,
                    }}
                  >
                    Stories
                  </div>
                )}
                {isEpicExpanded && subGroups?.useCases && (
                  <div
                    className="epic-subgroup-label"
                    style={{
                      left: subGroups.useCases.x - 1050,
                      top: (subGroups.useCases.y - (epic.rowY ?? 0)) - 20,
                      width: subGroups.useCases.width,
                    }}
                  >
                    Use Cases
                  </div>
                )}
                {isEpicExpanded && subGroups?.testStrategy && (
                  <div
                    className="epic-subgroup-label"
                    style={{
                      left: subGroups.testStrategy.x - 1050,
                      top: (subGroups.testStrategy.y - (epic.rowY ?? 0)) - 20,
                      width: subGroups.testStrategy.width,
                    }}
                  >
                    Test Strategy
                  </div>
                )}
                {isEpicExpanded && subGroups?.testCases && (
                  <div
                    className="epic-subgroup-label"
                    style={{
                      left: subGroups.testCases.x - 1050,
                      top: (subGroups.testCases.y - (epic.rowY ?? 0)) - 20,
                      width: subGroups.testCases.width,
                    }}
                  >
                    Tests
                  </div>
                )}
                {isEpicExpanded && subGroups?.risks && (
                  <div
                    className="epic-subgroup-label"
                    style={{
                      left: subGroups.risks.x - 1050,
                      top: (subGroups.risks.y - (epic.rowY ?? 0)) - 20,
                      width: subGroups.risks.width,
                    }}
                  >
                    Risks
                  </div>
                )}
                {total > 0 && (
                  <div className="epic-row-progress">
                    <div
                      className="epic-row-progress-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })
        }

        {/* Testing row band — horizontal swimlane for orphan test-strategy / test-case cards */}
        {laneLayout.positions.implementation?.visible && adjustedTestBands.map(({ artifact: ts, adjustedRowY, adjustedRowHeight }) => {
            const bandLeft = laneLayout.positions.implementation.left;
            return (
              <div
                key={`testing-row-band-${ts.id}`}
                className="testing-row-band"
                style={{
                  top: adjustedRowY,
                  height: adjustedRowHeight,
                  left: bandLeft,
                  width: implLaneWidth,
                  right: 'unset',
                }}
              >
                <div className="testing-row-label">Testing</div>
              </div>
            );
          })
        }

        {/* Swim lane column backgrounds */}
        <div className="swim-lanes">
          {LANE_DEFS.map(lane => {
            const pos = laneLayout.positions[lane.key];
            if (!pos || !pos.visible) return null;
            const w = lane.key === 'implementation' ? implLaneWidth : pos.width;
            return (
              <div
                key={lane.key}
                className={`swim-lane ${lane.key}`}
                style={{ left: pos.left, width: w, top: LANE_TOP, height: laneHeights[lane.key] ?? 200 }}
              />
            );
          })}
        </div>
        </>)}
        {/* ── End lane chrome ── */}
      </div>
      
      {/* Interactive minimap for spatial navigation */}
      {showMinimap && (
        <Minimap
          artifacts={layoutMode === 'mindmap' ? finalArtifacts : artifacts}
          visibleArtifacts={layoutMode === 'mindmap' ? finalArtifacts : visibleArtifacts}
          pan={pan}
          zoom={zoom}
          viewportWidth={viewportSize.width}
          viewportHeight={viewportSize.height}
          onPanTo={setPan}
          selectedId={selectedId}
        />
      )}

      {/* Focus mode indicator */}
      {focusMode && (
        <div className="focus-mode-indicator">
          <span className="focus-mode-label">Focus Mode</span>
          <span className="focus-mode-count">{focusTreeIds ? focusTreeIds.size : 0} cards</span>
          <button className="focus-mode-exit" onClick={() => setFocusMode(false)}>
            <kbd>Esc</kbd> Exit
          </button>
        </div>
      )}

      {/* Mind-map mode indicator */}
      {layoutMode === 'mindmap' && (
        <div className="mindmap-mode-indicator">
          <span className="mindmap-mode-label">Mind Map</span>
          <span className="mindmap-mode-count">{finalArtifacts.length} nodes</span>
          <button className="mindmap-mode-exit" onClick={() => { setLayoutMode('lanes'); setPan({ x: 0, y: 0 }); setZoom(1); }}>
            <kbd>L</kbd> Exit
          </button>
        </div>
      )}

      {/* Type/status filter bar */}
      {showFilterBar && (
        <div className="filter-bar">
          <div className="filter-bar-section">
            <span className="filter-bar-label">Types</span>
            <div className="filter-bar-buttons">
              {FILTER_TYPE_GROUPS.map(group => (
                <span key={group.label} className="filter-group">
                  {group.types.map(t => {
                    const active = !hiddenTypes.has(t);
                    return (
                      <button
                        key={t}
                        className={`filter-btn type-filter ${t} ${active ? 'active' : 'inactive'}`}
                        title={`${active ? 'Hide' : 'Show'} ${FILTER_TYPE_LABELS[t]}`}
                        onClick={() => setHiddenTypes(prev => {
                          const next = new Set(prev);
                          if (next.has(t)) next.delete(t); else next.add(t);
                          return next;
                        })}
                      >
                        {FILTER_TYPE_LABELS[t]}
                      </button>
                    );
                  })}
                </span>
              ))}
            </div>
          </div>
          <div className="filter-bar-section">
            <span className="filter-bar-label">Status</span>
            <div className="filter-bar-buttons">
              {STATUS_BUCKETS.map((bucket, idx) => {
                const active = !hiddenStatusBuckets.has(idx);
                return (
                  <button
                    key={bucket.label}
                    className={`filter-btn status-filter ${active ? 'active' : 'inactive'}`}
                    title={`${active ? 'Hide' : 'Show'} ${bucket.label} (${bucket.statuses.join(', ')})`}
                    onClick={() => setHiddenStatusBuckets(prev => {
                      const next = new Set(prev);
                      if (next.has(idx)) next.delete(idx); else next.add(idx);
                      return next;
                    })}
                  >
                    {bucket.label}
                  </button>
                );
              })}
            </div>
          </div>
          {hasActiveFilters && (
            <button
              className="filter-bar-clear"
              onClick={() => { setHiddenTypes(new Set()); setHiddenStatusBuckets(new Set()); }}
            >
              Clear all
            </button>
          )}
          <div className="filter-bar-count">
            {finalArtifacts.length}/{visibleArtifacts.length} visible
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="zoom-controls">
        <button onClick={() => setZoom(z => Math.min(2, z * 1.2))}>+</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.max(0.25, z * 0.8))}>−</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset</button>
        <button
          className="minimap-toggle"
          title={showMinimap ? 'Hide minimap' : 'Show minimap'}
          onClick={() => setShowMinimap(v => !v)}
        >
          <Icon name="search" size={14} />
        </button>
        <button
          className={`mindmap-toggle ${layoutMode === 'mindmap' ? 'active' : ''}`}
          title={layoutMode === 'mindmap' ? 'Switch to lane view (L)' : 'Switch to mind map (L)'}
          onClick={() => {
            const goingToLanes = layoutMode === 'mindmap';
            setLayoutMode(m => m === 'lanes' ? 'mindmap' : 'lanes');
            if (goingToLanes) { setPan({ x: 0, y: 0 }); setZoom(1); }
            // For mindmap, fit-to-view useEffect handles zoom/pan
          }}
        >
          <Icon name="split" size={14} />
        </button>
      </div>

      {/* Pan instructions – collapsible */}
      <div className={`canvas-hint${showHint ? '' : ' collapsed'}`}>
        <button
          className="canvas-hint-toggle"
          onClick={() => setShowHint(v => !v)}
          title={showHint ? 'Hide keyboard shortcuts' : 'Show keyboard shortcuts'}
          aria-expanded={showHint}
          aria-label="Canvas keyboard shortcuts"
        >
          <span className="canvas-hint-icon">&#9000;</span>
          {!showHint && <span className="canvas-hint-label">Keys</span>}
        </button>
        {showHint && (
          <div className="canvas-hint-items">
            <span className="canvas-hint-item"><kbd>Drag</kbd> Pan</span>
            <span className="canvas-hint-item"><kbd>Scroll</kbd> Pan</span>
            <span className="canvas-hint-item"><kbd>Ctrl+Scroll</kbd> Zoom</span>
            <span className="canvas-hint-item"><kbd>Arrows</kbd> Pan</span>
            <span className="canvas-hint-item"><kbd>+/−</kbd> Zoom</span>
            <span className="canvas-hint-item"><kbd>0</kbd> Reset</span>
            <span className="canvas-hint-item"><kbd>M</kbd> Minimap</span>
            <span className="canvas-hint-item"><kbd>F</kbd> Focus</span>
            <span className="canvas-hint-item"><kbd>T</kbd> Filters</span>
            <span className="canvas-hint-item"><kbd>L</kbd> {layoutMode === 'mindmap' ? 'Lanes' : 'Mind Map'}</span>
            <span className="canvas-hint-item"><kbd>/</kbd> Search</span>
            <span className="canvas-hint-item"><kbd>Esc</kbd> {focusMode ? 'Exit focus' : showFilterBar ? 'Close filters' : 'Deselect'}</span>
          </div>
        )}
      </div>
      {/* Screenshot capture overlay */}
      {capturing && (
        <div className="canvas-capture-overlay">
          <div className="canvas-capture-spinner" />
          <span className="canvas-capture-label">Exporting canvas…</span>
        </div>
      )}
    </div>
  );
}
