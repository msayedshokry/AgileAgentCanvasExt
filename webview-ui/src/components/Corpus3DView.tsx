import { useEffect, useRef, useState, useCallback } from 'react';
import type { Artifact } from '../types';
import { Color, Mesh, MeshLambertMaterial, Sprite, SpriteMaterial, SphereGeometry, BoxGeometry, ConeGeometry, CylinderGeometry, TorusGeometry, TetrahedronGeometry, DodecahedronGeometry, OctahedronGeometry, Group, CanvasTexture } from 'three';
import type { BufferGeometry } from 'three';

interface Corpus3DViewProps {
  artifacts: Artifact[];
  onSelect: (id: string | null) => void;
  onOpenDetail: (id: string) => void;
  selectedId: string | null;
}

/** Map artifact types to phase index */
function typeToPhase(type: Artifact['type']): number {
  const discovery = new Set(['product-brief', 'vision']);
  const planning = new Set(['prd', 'requirement', 'nfr', 'additional-req', 'risk']);
  const solutioning = new Set(['architecture', 'architecture-decision', 'system-component']);
  if (discovery.has(type)) return 0;
  if (planning.has(type)) return 1;
  if (solutioning.has(type)) return 2;
  return 3;
}

const PHASE_COLORS = ['#ab47bc', '#4fc3f7', '#ff9800', '#4caf50'];
const PHASE_NAMES = ['Discovery', 'Planning', 'Solutioning', 'Implementation'];

/** Blend two hex colors into a single midpoint color for link coloring */
function blendHex(hex1: string, hex2: string): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  const r = Math.round((r1 + r2) / 2).toString(16).padStart(2, '0');
  const g = Math.round((g1 + g2) / 2).toString(16).padStart(2, '0');
  const b = Math.round((b1 + b2) / 2).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

/** Create a floating label sprite for a node — short text above the 3D shape,
 * always faces the camera. */
function makeLabelSprite(name: string, color: string): Sprite {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 48);
  ctx.font = 'bold 18px sans-serif';
  // Shorten label to ~18 chars to keep sprite small
  const label = name.length > 18 ? name.slice(0, 16) + '…' : name;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 24);
  const tex = new CanvasTexture(c);
  const mat = new SpriteMaterial({ map: tex, transparent: true, opacity: 0.9 });
  const sprite = new Sprite(mat);
  sprite.scale.set(40, 8, 1);
  sprite.position.set(0, 2, 0); // float above the shape
  return sprite;
}

/** Return a THREE.Group containing a shape mesh + floating short-label sprite above it */
function createNodeMesh(type: string, color: string, val: number, name: string): Group {
  const c = new Color(color);
  let geometry: BufferGeometry;

  // Assign shapes by artifact type
  if (type === 'vision' || type === 'product-brief') {
    geometry = new SphereGeometry(1, 20, 20);
  } else if (type === 'epic') {
    geometry = new ConeGeometry(1, 1.5, 8);
  } else if (type === 'prd') {
    geometry = new BoxGeometry(1.3, 1.3, 1.3);
  } else if (type === 'architecture') {
    geometry = new TorusGeometry(0.9, 0.35, 10, 16);
  } else if (type === 'architecture-decision') {
    geometry = new TetrahedronGeometry(1.1);
  } else if (type === 'system-component') {
    geometry = new DodecahedronGeometry(1);
  } else if (type === 'story') {
    geometry = new CylinderGeometry(0.7, 0.9, 1.3, 8);
  } else if (type === 'risk') {
    geometry = new OctahedronGeometry(1);
  } else if (type === 'requirement' || type === 'nfr' || type === 'additional-req') {
    geometry = new BoxGeometry(1, 1, 1);
  } else {
    geometry = new SphereGeometry(0.9, 12, 12);
  }

  const material = new MeshLambertMaterial({ color: c });
  const mesh = new Mesh(geometry, material);

  // Scale by importance (val)
  const s = (val || 6) / 6;
  mesh.scale.set(s, s, s);

  // Add short label sprite floating above the shape
  const labelSprite = makeLabelSprite(name, color);

  const group = new Group();
  group.add(mesh);
  group.add(labelSprite);

  return group;
}

export function Corpus3DView({ artifacts, onSelect, onOpenDetail, selectedId }: Corpus3DViewProps) {
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const graphInitRef = useRef(false);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Build highlight/dim map from search query
  const matchedSet = useCallback(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return new Set(
      artifacts
        .filter(a => (a.title || a.id).toLowerCase().includes(q))
        .map(a => a.id)
    );
  }, [searchQuery, artifacts]);



  // ── Graph data builder (all artifacts — no filtering) ──────────────────

  /** Build nodes + links from all artifacts */
  function buildGraphData(allArtifacts: Artifact[]) {
    const nodes = allArtifacts.map(a => ({
      id: a.id,
      name: a.title || a.id,
      type: a.type,
      phase: typeToPhase(a.type),
      color: PHASE_COLORS[typeToPhase(a.type)],
      val: a.type === 'epic' ? 14 : 6,
    }));

    const nodeIds = new Set(nodes.map(n => n.id));
    const links: { source: string; target: string }[] = [];
    const linkSet = new Set<string>();
    for (const a of allArtifacts) {
      if (a.parentId && nodeIds.has(a.parentId)) {
        const key = `${a.parentId}→${a.id}`;
        if (!linkSet.has(key)) { linkSet.add(key); links.push({ source: a.parentId, target: a.id }); }
      }
      for (const depId of a.dependencies) {
        if (nodeIds.has(depId)) {
          const key = `${a.id}→${depId}`;
          if (!linkSet.has(key)) { linkSet.add(key); links.push({ source: a.id, target: depId }); }
        }
      }
    }
    return { nodes, links };
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container || artifacts.length === 0 || graphInitRef.current) return;

    let cancelled = false;
    let rotateInterval: ReturnType<typeof setInterval> | undefined;

    const startGraph = async () => {
      try {
        let FG = (window as any).ForceGraph3D;
        if (!FG) {
          await new Promise(r => setTimeout(r, 500));
          FG = (window as any).ForceGraph3D;
          if (!FG) {
            setLoadState('error');
            setLoadError('3d-force-graph script not loaded.');
            return;
          }
        }
        if (cancelled || !container) return;

        // Build graph data — all artifacts visible
        const graphData = buildGraphData(artifacts);

        const graph = FG()(container)
          .graphData(graphData)
          .nodeLabel((n: any) => n.name)
          .nodeColor((n: any) => n.color)
          .nodeVal((n: any) => n.val)
          .nodeThreeObject((n: any) => createNodeMesh(n.type, n.color, n.val, n.name))
          .linkWidth(0.4)
          .linkDirectionalArrowLength(2.5)
          .linkDirectionalArrowRelPos(1)
          .linkDirectionalParticles(1)
          .linkDirectionalParticleSpeed(0.003)
          .linkDirectionalParticleWidth(1.2)
          .linkDirectionalParticleColor((link: any) => link.target.color ? link.target.color + 'aa' : 'rgba(255,255,255,0.6)')
          .linkColor((link: any) => {
            const sc = link.source.color || '#ffffff';
            const tc = link.target.color || '#ffffff';
            const blended = blendHex(sc, tc) + '55';
            const matches = matchedSet();
            if (matches) {
              const srcMatched = matches.has((link.source as any).id);
              const tgtMatched = matches.has((link.target as any).id);
              if (!srcMatched && !tgtMatched) return 'rgba(60,60,60,0.15)';
              if (srcMatched && tgtMatched) return blended;
              return blended.replace('55', '33');
            }
            return blended;
          })
          .backgroundColor('rgba(30, 30, 30, 0)')
          .d3AlphaDecay(0.05)
          .d3VelocityDecay(0.45)
          .warmupTicks(80)
          .cooldownTicks(50)
          .onNodeClick((n: any) => {
            onSelectRef.current(n.id);
            onOpenDetail(n.id);
          })
          .onNodeHover((n: any) => { container.style.cursor = n ? 'pointer' : 'default'; })
          .onEngineStop(() => {
            if (!cancelled) {
              graphInitRef.current = true;
              graphRef.current = graph;
              setLoadState('ready');
              startRotation();
            }
          });

        // Auto-rotation — declare before use
        let userInteracted = false;
        let angle = 0;

        const stopRotation = () => {
          if (userInteracted) return;
          userInteracted = true;
          if (rotateInterval) {
            clearInterval(rotateInterval);
            rotateInterval = undefined;
          }
        };

        const startRotation = () => {
          if (userInteracted || cancelled) return;
          rotateInterval = setInterval(() => {
            if (cancelled || userInteracted) {
              clearInterval(rotateInterval);
              rotateInterval = undefined;
              return;
            }
            angle += 0.001;
            graph.cameraPosition({
              x: 500 * Math.sin(angle),
              y: 200,
              z: 500 * Math.cos(angle),
            });
          }, 50);
        };

        container.addEventListener('mousedown', stopRotation, { once: true });
        container.addEventListener('touchstart', stopRotation, { once: true });
        container.addEventListener('wheel', stopRotation, { once: true });

        // Auto-frame matching node if only one match
        const frameMatchedNode = () => {
          const matches = matchedSet();
          if (!matches || matches.size === 0) return;
          const firstId = Array.from(matches)[0];
          const node = graph.graphData().nodes.find((n: any) => n.id === firstId);
          if (node && node.__xyz) {
            const [x, y, z] = node.__xyz;
            graph.cameraPosition({ x: x + 80, y: y + 60, z: z + 100 }, { x, y, z }, 1200);
          }
        };

        setTimeout(frameMatchedNode, 600);

      } catch (err) {
        console.error('[Corpus3DView] Error:', err);
        setLoadState('error');
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    };

    startGraph();

    return () => {
      cancelled = true;
      if (rotateInterval) clearInterval(rotateInterval);
      if (container) container.querySelectorAll('canvas').forEach(c => c.remove());
      graphInitRef.current = false;
      graphRef.current = null;
    };
  }, [artifacts.length]);

  // Re-apply highlight colors when search query changes (nodes may not re-render)
  useEffect(() => {
    if (!graphRef.current || loadState !== 'ready') return;
    try {
      const { nodes } = graphRef.current.graphData();
      const matches = matchedSet();
      nodes.forEach((n: any) => {
        const obj = n.__threeObj;
        if (!obj) return;
        const group = obj as Group;
        const mesh = group.children[0] as Mesh;
        if (!mesh || !mesh.material) return;
        const mat = mesh.material as MeshLambertMaterial;
        if (matches) {
          if (!matches.has(n.id)) mat.color.set('#3c3c3c');
          else mat.color.set(n.color);
        } else {
          mat.color.set(n.color);
        }
      });
      // Re-frame on new search
      if (matches && matches.size === 1) {
        const id = Array.from(matches)[0];
        const node = graphRef.current.graphData().nodes.find((n: any) => n.id === id);
        if (node && node.__xyz) {
          const [x, y, z] = node.__xyz;
          graphRef.current.cameraPosition({ x: x + 80, y: y + 60, z: z + 100 }, { x, y, z }, 1200);
        }
      }
    } catch { /* graph not ready */ }
  }, [searchQuery, loadState]);

  // Selection highlight — update custom mesh colors directly
  useEffect(() => {
    if (!graphRef.current) return;
    try {
      const selected = selectedId;
      const { nodes } = graphRef.current.graphData();
      const matches = matchedSet();
      nodes.forEach((n: any) => {
        const obj = n.__threeObj;
        if (!obj) return;
        const group = obj as Group;
        const mesh = group.children[0] as Mesh;
        if (!mesh || !mesh.material) return;
        const mat = mesh.material as MeshLambertMaterial;
        const isDimmed = matches ? !matches.has(n.id) : false;
        const isMatched = matches ? matches.has(n.id) : false;
        if (isDimmed) {
          mat.color.set('#3c3c3c');
        } else if (selected && n.id === selected) {
          mat.color.set('#ffffff');
        } else if (isMatched) {
          mat.color.set('#ffffff');
        } else {
          mat.color.set(n.color);
        }
      });
    } catch { /* graph not ready */ }
  }, [selectedId, matchedSet]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {loadState === 'loading' && (
        <div className="corpus-3d-loading-wrap">
          <div className="corpus-3d-spinner" />
          <p>Building corpus landscape…</p>
          <style>{`@keyframes corpus-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {loadState === 'error' && (
        <div className="corpus-3d-error-wrap">
          <p>Failed to load corpus view</p>
          <p className="corpus-3d-error-detail">{loadError}</p>
        </div>
      )}

      {loadState === 'ready' && (
        <>
          {/* Search box */}
          <div className="corpus-3d-search-box">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="rgba(255,255,255,0.5)" className="corpus-3d-search-icon">
              <path d="M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zm-.82 4.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04z"/>
            </svg>
            <input
              type="text"
              placeholder="Search artifacts…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="corpus-3d-search-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="corpus-3d-search-clear"
                title="Clear search"
              >×</button>
            )}
          </div>

          {/* Match count badge */}
          {searchQuery && (
            <div className="corpus-3d-match-count">
              {matchedSet() ? `${matchedSet()!.size} found` : 'No matches'}
            </div>
          )}

          {/* Phase legend */}
          <div className="corpus-3d-phase-legend">
            {PHASE_NAMES.map((name, i) => (
              <div key={name} className="corpus-3d-phase-legend-row">
                <span className={`corpus-3d-phase-swatch corpus-3d-phase-swatch--${i}`} />
                <span>{name}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
