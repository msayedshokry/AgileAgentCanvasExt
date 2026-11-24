/**
 * Canvas ⇄ App view-sync loop tests.
 *
 * Canvas reports zoom/pan up via onCanvasViewChange and receives the saved
 * per-mode view back via initialCanvasView. A feedback bug between the two
 * shows up as flicker (zoom/pan oscillating between two values). These tests
 * mount Canvas inside a harness that reproduces App's per-mode persistence,
 * then assert the view settles and stays where the user put it in every mode.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { Canvas, type LayoutMode } from './Canvas';
import type { Artifact } from '../types';

vi.mock('html2canvas', () => ({ default: vi.fn() }));
vi.mock('./Corpus3DView', () => ({ Corpus3DView: () => <div data-testid="corpus3d" /> }));

type View = { zoom: number; pan: { x: number; y: number } };
const DEFAULT_VIEW: View = { zoom: 1, pan: { x: 0, y: 0 } };

const artifacts: Artifact[] = [
  { id: 'e1', type: 'epic', title: 'Epic 1', description: '', status: 'draft',
    position: { x: 100, y: 100 }, size: { width: 280, height: 150 }, dependencies: [], metadata: {} },
  { id: 'e2', type: 'epic', title: 'Epic 2', description: '', status: 'draft',
    position: { x: 900, y: 700 }, size: { width: 280, height: 150 }, dependencies: [], metadata: {} },
];

/** Mirrors App.tsx: per-mode view slots + echo suppression. */
function Harness({ onReport }: { onReport: (mode: LayoutMode, v: View) => void }) {
  const [mode, setMode] = useState<LayoutMode>('lanes');
  const [byMode, setByMode] = useState<Record<LayoutMode, View>>({
    lanes: DEFAULT_VIEW, mindmap: DEFAULT_VIEW, corpus3d: DEFAULT_VIEW,
  });
  const handleViewChange = (m: LayoutMode, zoom: number, pan: View['pan']) => {
    onReport(m, { zoom, pan });
    const slot = byMode[m];
    if (slot.zoom === zoom && slot.pan.x === pan.x && slot.pan.y === pan.y) return;
    setByMode(prev => ({ ...prev, [m]: { zoom, pan } }));
  };
  const mm = byMode.mindmap;
  return (
    <Canvas
      artifacts={artifacts}
      selectedId={null}
      onSelect={vi.fn()}
      onOpenDetail={vi.fn()}
      onUpdate={vi.fn()}
      onToggleExpand={vi.fn()}
      expandedIds={new Set()}
      expandedCategories={new Map()}
      onToggleCategoryExpand={vi.fn()}
      onRefineWithAI={vi.fn()}
      onExpandLane={vi.fn()}
      onCollapseLane={vi.fn()}
      initialLayoutMode={mode}
      onLayoutModeChange={setMode}
      initialCanvasView={byMode[mode]}
      onCanvasViewChange={handleViewChange}
      hasCustomMindmapView={mm.zoom !== 1 || mm.pan.x !== 0 || mm.pan.y !== 0}
    />
  );
}

const transform = () => (document.querySelector('.canvas-content') as HTMLElement | null)?.style.transform ?? null;
const canvasEl = () => document.querySelector('.canvas')!;
const toggleMode = () => fireEvent.click(document.querySelector('.mindmap-toggle')!);
const zoomIn = () => fireEvent.wheel(canvasEl(), { deltaY: -100, ctrlKey: true, clientX: 300, clientY: 200 });
const panBy = (dx: number, dy: number) => fireEvent.wheel(canvasEl(), { deltaX: dx, deltaY: dy });

/** Renders repeated with nothing happening must not change the view. */
async function expectSettled(onReport: ReturnType<typeof vi.fn>) {
  const before = transform();
  const callsBefore = onReport.mock.calls.length;
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  expect(transform()).toBe(before);
  expect(onReport.mock.calls.length).toBe(callsBefore);
}

describe('Canvas ⇄ App view sync (flicker regression)', () => {
  // Give the viewport a real size so mindmap auto-fit runs like in VS Code.
  const sizeProps = ['clientWidth', 'clientHeight'] as const;
  const originals = sizeProps.map(p => Object.getOwnPropertyDescriptor(HTMLElement.prototype, p));
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 800 });
  });
  afterAll(() => {
    sizeProps.forEach((p, i) => { if (originals[i]) Object.defineProperty(HTMLElement.prototype, p, originals[i]!); });
  });

  it('lanes: rapid zoom + pan settles on the last value', async () => {
    const onReport = vi.fn();
    render(<Harness onReport={onReport} />);
    zoomIn(); zoomIn(); panBy(40, 30); zoomIn(); panBy(-10, 20);
    const expected = transform();
    await expectSettled(onReport);
    expect(transform()).toBe(expected);
  });

  it('mindmap: entering mode settles (auto-fit vs restore do not fight)', async () => {
    const onReport = vi.fn();
    render(<Harness onReport={onReport} />);
    toggleMode(); // → mindmap
    await expectSettled(onReport);
    // Auto-fit wins over the default (never-customised) mindmap slot.
    expect(transform()).not.toBe('translate(0px, 0px) scale(1)');
    // Every report while in mindmap should converge — no A,B,A,B pattern.
    const mm = onReport.mock.calls.filter(c => c[0] === 'mindmap').map(c => JSON.stringify(c[1]));
    expect(new Set(mm).size).toBeLessThanOrEqual(2);
  });

  it('mindmap: rapid zoom + pan settles on the last value', async () => {
    const onReport = vi.fn();
    render(<Harness onReport={onReport} />);
    toggleMode(); // → mindmap
    await expectSettled(onReport);
    zoomIn(); panBy(25, 25); zoomIn(); zoomIn(); panBy(-60, 10);
    const expected = transform();
    await expectSettled(onReport);
    expect(transform()).toBe(expected);
  });

  it('cycling lanes → mindmap → corpus3d → lanes restores each mode view and settles', async () => {
    const onReport = vi.fn();
    render(<Harness onReport={onReport} />);
    zoomIn(); panBy(30, 10);
    await expectSettled(onReport);
    const lanesView = transform();

    toggleMode(); // → mindmap
    await expectSettled(onReport);
    zoomIn(); zoomIn();
    await expectSettled(onReport);
    const mindmapView = transform();

    toggleMode(); // → corpus3d
    await expectSettled(onReport);
    zoomIn(); // wheel over 3D view must not destabilise anything
    await expectSettled(onReport);

    toggleMode(); // → lanes
    await expectSettled(onReport);
    expect(transform()).toBe(lanesView);

    toggleMode(); // → mindmap again
    await expectSettled(onReport);
    expect(transform()).toBe(mindmapView);
  });
});
