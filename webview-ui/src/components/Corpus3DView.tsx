import { useEffect, useRef, useState } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const graphInitRef = useRef(false);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string>('');

  // Refs for latest values used in graph closures
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const artifactsRef = useRef(artifacts);
  artifactsRef.current = artifacts;

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
          .linkColor((link: any) => {
            const sc = link.source.color || '#ffffff';
            const tc = link.target.color || '#ffffff';
            return blendHex(sc, tc) + '55'; // blended phase color at ~33% opacity
          })
          .linkWidth(0.4)
          .linkDirectionalArrowLength(2.5)
          .linkDirectionalArrowRelPos(1)
          .linkDirectionalParticles(1)
          .linkDirectionalParticleSpeed(0.003)
          .linkDirectionalParticleWidth(1.2)
          .linkDirectionalParticleColor((link: any) => link.target.color ? link.target.color + 'aa' : 'rgba(255,255,255,0.6)')
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

        // Auto-rotation
        let userInteracted = false;
        let angle = 0;

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

        const stopRotation = () => {
          if (userInteracted) return;
          userInteracted = true;
          if (rotateInterval) {
            clearInterval(rotateInterval);
            rotateInterval = undefined;
          }
        };

        container.addEventListener('mousedown', stopRotation, { once: true });
        container.addEventListener('touchstart', stopRotation, { once: true });
        container.addEventListener('wheel', stopRotation, { once: true });

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

  // Selection highlight — update custom mesh colors directly
  useEffect(() => {
    if (!graphRef.current) return;
    try {
      const selected = selectedId;
      // Use the graph's internal reference to custom meshes
      const { nodes } = graphRef.current.graphData();        nodes.forEach((n: any) => {
        const obj = n.__threeObj;
        if (!obj) return;
        // obj is a Group — get the first child (the shape mesh) and update its material color
        const group = obj as Group;
        const mesh = group.children[0] as Mesh;
        if (!mesh || !mesh.material) return;
        const mat = mesh.material as MeshLambertMaterial;
        mat.color.set(selected && n.id === selected ? '#ffffff' : n.color);
      });
    } catch { /* graph not ready */ }
  }, [selectedId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {loadState === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--vscode-foreground)', flexDirection: 'column', gap: 12,
        }}>
          <div style={{
            width: 32, height: 32,
            border: '3px solid var(--vscode-editorWidget-border)',
            borderTopColor: 'var(--vscode-focusBorder)',
            borderRadius: '50%',
            animation: 'corpus-spin 1s linear infinite',
          }} />
          <p>Building corpus landscape…</p>
          <style>{`@keyframes corpus-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {loadState === 'error' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--vscode-errorForeground)', flexDirection: 'column', gap: 8, padding: 20,
        }}>
          <p>Failed to load corpus view</p>
          <p style={{ fontSize: 11, opacity: 0.7 }}>{loadError}</p>
        </div>
      )}

      {loadState === 'ready' && (
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 10,
          display: 'flex', flexDirection: 'column', gap: 4,
          background: 'rgba(0,0,0,0.5)', padding: '8px 12px', borderRadius: 6,
          fontSize: 11, color: 'var(--vscode-foreground)',
        }}>
          {PHASE_NAMES.map((name, i) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: PHASE_COLORS[i], display: 'inline-block' }} />
              <span>{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
