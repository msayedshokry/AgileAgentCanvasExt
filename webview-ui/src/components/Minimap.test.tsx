/**
 * Tests for Minimap.tsx
 *
 * Covers: rendering, artifact dots, visibility/selection, viewport rect,
 * click-to-navigate, drag-to-navigate, world bounds computation.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { Artifact } from '../types';
import { Minimap } from './Minimap';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'a-1',
    type: 'epic',
    title: 'Epic 1',
    description: '',
    status: 'draft',
    position: { x: 100, y: 100 },
    size: { width: 280, height: 120 },
    dependencies: [],
    metadata: {},
    ...overrides,
  };
}

const defaultProps = {
  artifacts: [] as Artifact[],
  visibleArtifacts: [] as Artifact[],
  pan: { x: 0, y: 0 },
  zoom: 1,
  viewportWidth: 1200,
  viewportHeight: 800,
  onPanTo: vi.fn(),
  selectedId: null as string | null,
};

// ── Rendering ──────────────────────────────────────────────────────────────

describe('Minimap', () => {
  it('renders without crashing when no artifacts', () => {
    const { container } = render(<Minimap {...defaultProps} />);
    expect(container.querySelector('.minimap')).toBeInTheDocument();
  });

  it('renders minimap-viewport element', () => {
    const { container } = render(<Minimap {...defaultProps} />);
    expect(container.querySelector('.minimap-viewport')).toBeInTheDocument();
  });

  it('has title attribute for tooltip', () => {
    const { container } = render(<Minimap {...defaultProps} />);
    expect(container.querySelector('.minimap')!.getAttribute('title')).toBe(
      'Click or drag to navigate'
    );
  });

  // ── Artifact dots ────────────────────────────────────────────────────────

  it('renders a minimap-artifact div for each artifact', () => {
    const artifacts = [
      makeArtifact({ id: 'a-1' }),
      makeArtifact({ id: 'a-2', position: { x: 400, y: 200 } }),
    ];
    const { container } = render(
      <Minimap {...defaultProps} artifacts={artifacts} visibleArtifacts={artifacts} />
    );
    const dots = container.querySelectorAll('.minimap-artifact');
    expect(dots.length).toBe(2);
  });

  it('applies type-specific background colors', () => {
    const artifacts = [
      makeArtifact({ id: 'epic-1', type: 'epic' }),
      makeArtifact({ id: 'story-1', type: 'story', position: { x: 300, y: 200 } }),
    ];
    const { container } = render(
      <Minimap {...defaultProps} artifacts={artifacts} visibleArtifacts={artifacts} />
    );
    const dots = container.querySelectorAll('.minimap-artifact');
    // JSDOM normalizes hex to rgb(); epic=#22c55e -> rgb(34, 197, 94), story=#eab308 -> rgb(234, 179, 8)
    expect((dots[0] as HTMLElement).style.background).toBe('rgb(34, 197, 94)');
    expect((dots[1] as HTMLElement).style.background).toBe('rgb(234, 179, 8)');
  });

  it('uses fallback color for unknown artifact types', () => {
    const artifacts = [
      makeArtifact({ id: 'x-1', type: 'research' as any }),
    ];
    const { container } = render(
      <Minimap {...defaultProps} artifacts={artifacts} visibleArtifacts={artifacts} />
    );
    const dot = container.querySelector('.minimap-artifact') as HTMLElement;
    // JSDOM normalizes #888 -> rgb(136, 136, 136)
    expect(dot.style.background).toBe('rgb(136, 136, 136)');
  });

  // ── Visibility ───────────────────────────────────────────────────────────

  it('gives visible artifacts full opacity and hidden ones low opacity', () => {
    const a1 = makeArtifact({ id: 'a-1' });
    const a2 = makeArtifact({ id: 'a-2', position: { x: 400, y: 200 } });
    const { container } = render(
      <Minimap {...defaultProps} artifacts={[a1, a2]} visibleArtifacts={[a1]} />
    );
    const dots = container.querySelectorAll('.minimap-artifact');
    expect((dots[0] as HTMLElement).style.opacity).toBe('0.85'); // visible
    expect((dots[1] as HTMLElement).style.opacity).toBe('0.2'); // hidden
  });

  // ── Selection ────────────────────────────────────────────────────────────

  it('adds selected class to the selected artifact', () => {
    const a1 = makeArtifact({ id: 'a-1' });
    const { container } = render(
      <Minimap {...defaultProps} artifacts={[a1]} visibleArtifacts={[a1]} selectedId="a-1" />
    );
    const dot = container.querySelector('.minimap-artifact');
    expect(dot!.classList.contains('selected')).toBe(true);
  });

  it('does not add selected class to non-selected artifacts', () => {
    const a1 = makeArtifact({ id: 'a-1' });
    const { container } = render(
      <Minimap {...defaultProps} artifacts={[a1]} visibleArtifacts={[a1]} selectedId="other" />
    );
    const dot = container.querySelector('.minimap-artifact');
    expect(dot!.classList.contains('selected')).toBe(false);
  });

  // ── Viewport rect ───────────────────────────────────────────────────────

  it('renders viewport rect with position and size', () => {
    const { container } = render(<Minimap {...defaultProps} />);
    const viewport = container.querySelector('.minimap-viewport') as HTMLElement;
    // Should have left, top, width, height set
    expect(viewport.style.left).toBeTruthy();
    expect(viewport.style.top).toBeTruthy();
    expect(viewport.style.width).toBeTruthy();
    expect(viewport.style.height).toBeTruthy();
  });

  // ── World bounds ─────────────────────────────────────────────────────────

  it('uses default world bounds when no artifacts', () => {
    const { container } = render(<Minimap {...defaultProps} />);
    // With default bounds (0,0 to 2000,1000), artifacts should render
    // We just verify it doesn't crash and renders the viewport
    expect(container.querySelector('.minimap-viewport')).toBeInTheDocument();
  });

  it('computes world bounds from artifact positions', () => {
    const artifacts = [
      makeArtifact({ id: 'a-1', position: { x: 0, y: 0 }, size: { width: 200, height: 100 } }),
      makeArtifact({ id: 'a-2', position: { x: 500, y: 300 }, size: { width: 200, height: 100 } }),
    ];
    const { container } = render(
      <Minimap {...defaultProps} artifacts={artifacts} visibleArtifacts={artifacts} />
    );
    // Both dots should render, and their positions should reflect the computed bounds
    const dots = container.querySelectorAll('.minimap-artifact');
    expect(dots.length).toBe(2);
    // First dot should be closer to top-left, second closer to bottom-right
    const dot1Left = parseFloat((dots[0] as HTMLElement).style.left);
    const dot2Left = parseFloat((dots[1] as HTMLElement).style.left);
    expect(dot2Left).toBeGreaterThan(dot1Left);
  });

  // ── Artifact with missing position/size ─────────────────────────────────

  it('handles artifacts with undefined position/size gracefully', () => {
    const artifacts = [
      makeArtifact({ id: 'a-1', position: undefined as any, size: undefined as any }),
    ];
    const { container } = render(
      <Minimap {...defaultProps} artifacts={artifacts} visibleArtifacts={artifacts} />
    );
    expect(container.querySelector('.minimap-artifact')).toBeInTheDocument();
  });

  // ── Minimum dot size ────────────────────────────────────────────────────

  it('enforces minimum 2px width and height for dots', () => {
    // Use very large world to make artifacts tiny
    const artifacts = [
      makeArtifact({ id: 'a-1', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } }),
      makeArtifact({ id: 'a-2', position: { x: 10000, y: 10000 }, size: { width: 1, height: 1 } }),
    ];
    const { container } = render(
      <Minimap {...defaultProps} artifacts={artifacts} visibleArtifacts={artifacts} />
    );
    const dots = container.querySelectorAll('.minimap-artifact');
    for (const dot of dots) {
      const w = parseFloat((dot as HTMLElement).style.width);
      const h = parseFloat((dot as HTMLElement).style.height);
      expect(w).toBeGreaterThanOrEqual(2);
      expect(h).toBeGreaterThanOrEqual(2);
    }
  });

  // ── Click to navigate ────────────────────────────────────────────────────

  it('calls onPanTo when minimap is clicked', () => {
    const onPanTo = vi.fn();
    const artifacts = [
      makeArtifact({ id: 'a-1', position: { x: 100, y: 100 } }),
    ];
    const { container } = render(
      <Minimap {...defaultProps} artifacts={artifacts} visibleArtifacts={artifacts} onPanTo={onPanTo} />
    );
    const minimap = container.querySelector('.minimap')!;

    // Mock getBoundingClientRect
    vi.spyOn(minimap, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 240, bottom: 160,
      width: 240, height: 160, x: 0, y: 0, toJSON: () => {},
    });

    fireEvent.mouseDown(minimap, { clientX: 120, clientY: 80 });
    expect(onPanTo).toHaveBeenCalledTimes(1);
    expect(onPanTo).toHaveBeenCalledWith(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
    );
  });

  it('supports drag navigation (mousemove after mousedown)', () => {
    const onPanTo = vi.fn();
    const artifacts = [
      makeArtifact({ id: 'a-1', position: { x: 100, y: 100 } }),
    ];
    const { container } = render(
      <Minimap {...defaultProps} artifacts={artifacts} visibleArtifacts={artifacts} onPanTo={onPanTo} />
    );
    const minimap = container.querySelector('.minimap')!;

    vi.spyOn(minimap, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 240, bottom: 160,
      width: 240, height: 160, x: 0, y: 0, toJSON: () => {},
    });

    // Start drag
    fireEvent.mouseDown(minimap, { clientX: 120, clientY: 80 });
    expect(onPanTo).toHaveBeenCalledTimes(1);

    // Move during drag
    fireEvent(window, new MouseEvent('mousemove', { clientX: 150, clientY: 90 }));
    expect(onPanTo).toHaveBeenCalledTimes(2);

    // Release
    fireEvent(window, new MouseEvent('mouseup'));

    // Further moves should not trigger onPanTo
    fireEvent(window, new MouseEvent('mousemove', { clientX: 200, clientY: 100 }));
    expect(onPanTo).toHaveBeenCalledTimes(2);
  });

  it('stops propagation and prevents default on mouseDown', () => {
    const onPanTo = vi.fn();
    const artifacts = [makeArtifact({ id: 'a-1' })];
    const { container } = render(
      <Minimap {...defaultProps} artifacts={artifacts} visibleArtifacts={artifacts} onPanTo={onPanTo} />
    );
    const minimap = container.querySelector('.minimap')!;

    vi.spyOn(minimap, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 240, bottom: 160,
      width: 240, height: 160, x: 0, y: 0, toJSON: () => {},
    });

    const event = new MouseEvent('mousedown', { clientX: 50, clientY: 50, bubbles: true });
    const stopPropSpy = vi.spyOn(event, 'stopPropagation');
    const preventSpy = vi.spyOn(event, 'preventDefault');

    minimap.dispatchEvent(event);
    expect(stopPropSpy).toHaveBeenCalled();
    expect(preventSpy).toHaveBeenCalled();
  });

  // ── Multiple type colors ─────────────────────────────────────────────────

  it('maps all known types to their specific colors', () => {
    // JSDOM normalizes hex to rgb, so we check against rgb values
    const typeColorMap: Record<string, string> = {
      'vision': 'rgb(147, 51, 234)',
      'product-brief': 'rgb(147, 51, 234)',
      'prd': 'rgb(239, 68, 68)',
      'requirement': 'rgb(59, 130, 246)',
      'architecture': 'rgb(6, 182, 212)',
      'epic': 'rgb(34, 197, 94)',
      'story': 'rgb(234, 179, 8)',
      'use-case': 'rgb(249, 115, 22)',
      'test-case': 'rgb(239, 68, 68)',
      'test-strategy': 'rgb(59, 130, 246)',
    };
    const artifacts = Object.keys(typeColorMap).map((type, i) =>
      makeArtifact({ id: `${type}-1`, type: type as any, position: { x: i * 300, y: 0 } })
    );
    const { container } = render(
      <Minimap {...defaultProps} artifacts={artifacts} visibleArtifacts={artifacts} />
    );
    const dots = container.querySelectorAll('.minimap-artifact');
    Object.values(typeColorMap).forEach((color, i) => {
      expect((dots[i] as HTMLElement).style.background).toBe(color);
    });
  });
});
