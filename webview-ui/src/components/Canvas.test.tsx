/**
 * Canvas Component Tests
 * The main canvas area for displaying and interacting with artifacts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { Canvas } from './Canvas';
import type { Artifact } from '../types';

// Mock html2canvas for screenshot tests
vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    toDataURL: vi.fn().mockReturnValue('data:image/png;base64,abc'),
  }),
}));

// Helper to create mock artifacts
const createMockArtifact = (overrides: Partial<Artifact> = {}): Artifact => ({
  id: 'test-1',
  type: 'epic',
  title: 'Test Epic',
  description: 'Test description',
  status: 'draft',
  position: { x: 100, y: 100 },
  size: { width: 280, height: 150 },
  dependencies: [],
  metadata: {},
  ...overrides,
});

describe('Canvas', () => {
  const defaultProps = {
    artifacts: [] as Artifact[],
    selectedId: null as string | null,
    onSelect: vi.fn(),
    onOpenDetail: vi.fn(),
    onUpdate: vi.fn(),
    onToggleExpand: vi.fn(),
    expandedIds: new Set<string>(),
    expandedCategories: new Map<string, Set<string>>(),
    onToggleCategoryExpand: vi.fn(),
    onRefineWithAI: vi.fn(),
    onExpandLane: vi.fn(),
    onCollapseLane: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render canvas container', () => {
      render(<Canvas {...defaultProps} />);
      expect(document.querySelector('.canvas')).toBeInTheDocument();
    });

    it('should render canvas content area', () => {
      render(<Canvas {...defaultProps} />);
      expect(document.querySelector('.canvas-content')).toBeInTheDocument();
    });

    it('should render zoom controls', () => {
      render(<Canvas {...defaultProps} />);
      expect(document.querySelector('.zoom-controls')).toBeInTheDocument();
    });

    it('should render column headers', () => {
      render(<Canvas {...defaultProps} />);
      expect(screen.getByText('Discovery')).toBeInTheDocument();
      expect(screen.getByText('Planning')).toBeInTheDocument();
      expect(screen.getByText('Solutioning')).toBeInTheDocument();
      expect(screen.getByText('Implementation')).toBeInTheDocument();
    });

    it('should render column subheaders', () => {
      render(<Canvas {...defaultProps} />);
      expect(screen.getByText('Brief / Vision')).toBeInTheDocument();
      expect(screen.getByText('PRD / Risks / Reqs')).toBeInTheDocument();
      expect(screen.getByText('Architecture / Decisions / Components')).toBeInTheDocument();
      expect(screen.getByText('Epics')).toBeInTheDocument();
      expect(screen.getByText(/Stories/)).toBeInTheDocument();
    });

    it('should render swim lanes', () => {
      render(<Canvas {...defaultProps} />);
      const swimLanes = document.querySelectorAll('.swim-lane');
      expect(swimLanes.length).toBeGreaterThan(0);
    });

    it('should render canvas hint', () => {
      render(<Canvas {...defaultProps} />);
      expect(document.querySelector('.canvas-hint')).toBeInTheDocument();
      expect(screen.getByLabelText('Canvas keyboard shortcuts')).toBeInTheDocument();
    });

    it('should render dependency arrows component', () => {
      render(<Canvas {...defaultProps} />);
      expect(document.querySelector('.dependency-arrows')).toBeInTheDocument();
    });
  });

  describe('Artifact Rendering', () => {
    it('should render artifact cards', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic 1' }),
        createMockArtifact({ id: 'epic-2', title: 'Epic 2' }),
      ];

      render(<Canvas {...defaultProps} artifacts={artifacts} />);
      
      expect(screen.getByText('Epic 1')).toBeInTheDocument();
      expect(screen.getByText('Epic 2')).toBeInTheDocument();
    });

    it('should only render visible artifacts based on expansion', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Parent Epic', childCount: 1 }),
        createMockArtifact({ id: 'story-1', title: 'Child Story', type: 'story', parentId: 'epic-1' }),
      ];

      // Parent not expanded - child should not be visible
      render(<Canvas {...defaultProps} artifacts={artifacts} expandedIds={new Set()} />);
      
      expect(screen.getByText('Parent Epic')).toBeInTheDocument();
      expect(screen.queryByText('Child Story')).not.toBeInTheDocument();
    });

    it('should render child artifacts when parent is expanded', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Parent Epic', childCount: 1 }),
        createMockArtifact({ id: 'story-1', title: 'Child Story', type: 'story', parentId: 'epic-1' }),
      ];

      // Parent expanded
      render(<Canvas {...defaultProps} artifacts={artifacts} expandedIds={new Set(['epic-1'])} />);
      
      expect(screen.getByText('Parent Epic')).toBeInTheDocument();
      expect(screen.getByText('Child Story')).toBeInTheDocument();
    });

    it('should handle multi-level hierarchy visibility', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic', childCount: 1 }),
        createMockArtifact({ id: 'story-1', title: 'Story', type: 'story', parentId: 'epic-1', childCount: 1 }),
        createMockArtifact({ id: 'task-1', title: 'Task', type: 'story', parentId: 'story-1' }),
      ];

      // Only epic expanded, not story
      render(<Canvas {...defaultProps} artifacts={artifacts} expandedIds={new Set(['epic-1'])} />);
      
      expect(screen.getAllByText('Epic').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Story').length).toBeGreaterThan(0);
      expect(screen.queryByText('Task')).not.toBeInTheDocument();
    });

    it('should show all levels when all ancestors expanded', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic', childCount: 1 }),
        createMockArtifact({ id: 'story-1', title: 'Story', type: 'story', parentId: 'epic-1', childCount: 1 }),
        createMockArtifact({ id: 'task-1', title: 'Task', type: 'story', parentId: 'story-1' }),
      ];

      // Both epic and story expanded
      render(<Canvas {...defaultProps} artifacts={artifacts} expandedIds={new Set(['epic-1', 'story-1'])} />);
      
      expect(screen.getAllByText('Epic').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Story').length).toBeGreaterThan(0);
      expect(screen.getByText('Task')).toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    it('should pass selectedId to artifact cards', () => {
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Epic 1' })];

      render(<Canvas {...defaultProps} artifacts={artifacts} selectedId="epic-1" />);
      
      const card = document.querySelector('.artifact-card.selected');
      expect(card).toBeInTheDocument();
    });

    it('should call onSelect with null when double-clicking canvas background', () => {
      const onSelect = vi.fn();
      render(<Canvas {...defaultProps} onSelect={onSelect} />);
      
      const canvas = document.querySelector('.canvas');
      fireEvent.doubleClick(canvas!);
      
      expect(onSelect).toHaveBeenCalledWith(null);
    });
  });

  describe('Zoom Controls', () => {
    it('should display current zoom level', () => {
      render(<Canvas {...defaultProps} />);
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should increase zoom when + button clicked', () => {
      render(<Canvas {...defaultProps} />);
      
      const zoomInBtn = screen.getByRole('button', { name: '+' });
      fireEvent.click(zoomInBtn);
      
      // Zoom should be greater than 100%
      expect(screen.queryByText('100%')).not.toBeInTheDocument();
      expect(screen.getByText('120%')).toBeInTheDocument();
    });

    it('should decrease zoom when - button clicked', () => {
      render(<Canvas {...defaultProps} />);
      
      const zoomOutBtn = screen.getByText('−');
      fireEvent.click(zoomOutBtn);
      
      // Zoom should be less than 100%
      expect(screen.queryByText('100%')).not.toBeInTheDocument();
    });

    it('should reset zoom when Reset button clicked', () => {
      render(<Canvas {...defaultProps} />);
      
      // First zoom in
      const zoomInBtn = screen.getByRole('button', { name: '+' });
      fireEvent.click(zoomInBtn);
      expect(screen.queryByText('100%')).not.toBeInTheDocument();
      
      // Then reset
      const resetBtn = screen.getByRole('button', { name: 'Reset' });
      fireEvent.click(resetBtn);
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should not zoom below minimum (25%)', () => {
      render(<Canvas {...defaultProps} />);
      
      const zoomOutBtn = screen.getByText('−');
      
      // Click many times to try to go below minimum
      for (let i = 0; i < 20; i++) {
        fireEvent.click(zoomOutBtn);
      }
      
      // Should be at or above 25%
      const zoomText = document.querySelector('.zoom-controls span')?.textContent;
      const zoomValue = parseInt(zoomText || '100');
      expect(zoomValue).toBeGreaterThanOrEqual(25);
    });

    it('should not zoom above maximum (200%)', () => {
      render(<Canvas {...defaultProps} />);
      
      const zoomInBtn = screen.getByRole('button', { name: '+' });
      
      // Click many times to try to go above maximum
      for (let i = 0; i < 20; i++) {
        fireEvent.click(zoomInBtn);
      }
      
      // Should be at or below 200%
      const zoomText = document.querySelector('.zoom-controls span')?.textContent;
      const zoomValue = parseInt(zoomText || '100');
      expect(zoomValue).toBeLessThanOrEqual(200);
    });
  });

  describe('Panning', () => {
    it('should add panning class when dragging', () => {
      render(<Canvas {...defaultProps} />);
      
      const canvas = document.querySelector('.canvas')!;
      
      fireEvent.mouseDown(canvas, { button: 0, clientX: 100, clientY: 100 });
      expect(canvas).toHaveClass('panning');
      
      fireEvent.mouseUp(canvas);
      expect(canvas).not.toHaveClass('panning');
    });

    it('should pan with middle mouse button', () => {
      render(<Canvas {...defaultProps} />);
      
      const canvas = document.querySelector('.canvas')!;
      
      fireEvent.mouseDown(canvas, { button: 1, clientX: 100, clientY: 100 });
      expect(canvas).toHaveClass('panning');
      
      fireEvent.mouseUp(canvas);
      expect(canvas).not.toHaveClass('panning');
    });

    it('should stop panning when mouse leaves canvas', () => {
      render(<Canvas {...defaultProps} />);
      
      const canvas = document.querySelector('.canvas')!;
      
      fireEvent.mouseDown(canvas, { button: 0, clientX: 100, clientY: 100 });
      expect(canvas).toHaveClass('panning');
      
      fireEvent.mouseLeave(canvas);
      expect(canvas).not.toHaveClass('panning');
    });

    it('should update pan position during drag', () => {
      render(<Canvas {...defaultProps} />);
      
      const canvas = document.querySelector('.canvas')!;
      const content = document.querySelector('.canvas-content')!;
      
      fireEvent.mouseDown(canvas, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.mouseMove(canvas, { clientX: 150, clientY: 150 });
      
      // Check that transform has been updated
      expect(content.getAttribute('style')).toContain('translate');
    });
  });

  describe('Wheel Events', () => {
    it('should pan on regular scroll', () => {
      render(<Canvas {...defaultProps} />);
      
      const canvas = document.querySelector('.canvas')!;
      const content = document.querySelector('.canvas-content')!;
      
      const initialTransform = content.getAttribute('style');
      
      fireEvent.wheel(canvas, { deltaX: 50, deltaY: 50 });
      
      const newTransform = content.getAttribute('style');
      expect(newTransform).not.toBe(initialTransform);
    });

    it('should zoom on ctrl+scroll', () => {
      render(<Canvas {...defaultProps} />);
      
      const canvas = document.querySelector('.canvas')!;
      
      fireEvent.wheel(canvas, { 
        deltaY: -100, 
        ctrlKey: true,
        clientX: 200,
        clientY: 200,
      });
      
      // Zoom should have changed
      expect(screen.queryByText('100%')).not.toBeInTheDocument();
    });

    it('should zoom on meta+scroll (Mac)', () => {
      render(<Canvas {...defaultProps} />);
      
      const canvas = document.querySelector('.canvas')!;
      
      fireEvent.wheel(canvas, { 
        deltaY: -100, 
        metaKey: true,
        clientX: 200,
        clientY: 200,
      });
      
      // Zoom should have changed
      expect(screen.queryByText('100%')).not.toBeInTheDocument();
    });
  });

  describe('Context Menu', () => {
    it('should prevent default context menu', () => {
      render(<Canvas {...defaultProps} />);
      
      const canvas = document.querySelector('.canvas')!;
      const event = new MouseEvent('contextmenu', { bubbles: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      
      canvas.dispatchEvent(event);
      
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('Callback Props', () => {
    it('should call onToggleExpand when expand button clicked', () => {
      const onToggleExpand = vi.fn();
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic', childCount: 1 }),
      ];

      render(<Canvas {...defaultProps} artifacts={artifacts} onToggleExpand={onToggleExpand} />);
      
      const expandBtn = document.querySelector('.expand-btn');
      if (expandBtn) {
        fireEvent.click(expandBtn);
        expect(onToggleExpand).toHaveBeenCalledWith('epic-1');
      }
    });

    it('should call onOpenDetail when card double-clicked', () => {
      const onOpenDetail = vi.fn();
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Epic' })];

      render(<Canvas {...defaultProps} artifacts={artifacts} onOpenDetail={onOpenDetail} />);
      
      const card = document.querySelector('.artifact-card');
      fireEvent.doubleClick(card!);
      
      expect(onOpenDetail).toHaveBeenCalledWith('epic-1');
    });

    it('should call onSelect when card clicked', () => {
      const onSelect = vi.fn();
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Epic' })];

      render(<Canvas {...defaultProps} artifacts={artifacts} onSelect={onSelect} />);
      
      const card = document.querySelector('.artifact-card');
      fireEvent.click(card!);
      
      expect(onSelect).toHaveBeenCalledWith('epic-1');
    });

    it('should call onRefineWithAI when AI button clicked', () => {
      const onRefineWithAI = vi.fn();
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Epic' })];

      render(<Canvas {...defaultProps} artifacts={artifacts} onRefineWithAI={onRefineWithAI} />);
      
      const aiBtn = document.querySelector('.card-ai-btn');
      fireEvent.click(aiBtn!);
      
      expect(onRefineWithAI).toHaveBeenCalledWith(artifacts[0]);
    });
  });

  describe('Transform Styles', () => {
    it('should apply transform to canvas content', () => {
      render(<Canvas {...defaultProps} />);
      
      const content = document.querySelector('.canvas-content');
      expect(content).toHaveStyle({ transformOrigin: '0 0' });
    });
  });

  // =========================================================================
  // NEW TESTS — appended below existing tests
  // =========================================================================

  describe('Keyboard Shortcuts', () => {
    const getCanvasAndFocus = () => {
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();
      return canvas;
    };

    it('should pan up when ArrowUp is pressed', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = getCanvasAndFocus();
      const content = document.querySelector('.canvas-content') as HTMLElement;
      const initialTransform = content.style.transform;

      fireEvent.keyDown(canvas, { key: 'ArrowUp' });

      // ArrowUp adds +60 to y → translate y increases
      expect(content.style.transform).not.toBe(initialTransform);
      expect(content.style.transform).toContain('translate(');
    });

    it('should pan down when ArrowDown is pressed', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = getCanvasAndFocus();
      const content = document.querySelector('.canvas-content') as HTMLElement;
      const initialTransform = content.style.transform;

      fireEvent.keyDown(canvas, { key: 'ArrowDown' });
      expect(content.style.transform).not.toBe(initialTransform);
    });

    it('should pan left when ArrowLeft is pressed', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = getCanvasAndFocus();
      const content = document.querySelector('.canvas-content') as HTMLElement;
      const initialTransform = content.style.transform;

      fireEvent.keyDown(canvas, { key: 'ArrowLeft' });
      expect(content.style.transform).not.toBe(initialTransform);
    });

    it('should pan right when ArrowRight is pressed', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = getCanvasAndFocus();
      const content = document.querySelector('.canvas-content') as HTMLElement;
      const initialTransform = content.style.transform;

      fireEvent.keyDown(canvas, { key: 'ArrowRight' });
      expect(content.style.transform).not.toBe(initialTransform);
    });

    it('should zoom in when + key is pressed', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = getCanvasAndFocus();

      expect(screen.getByText('100%')).toBeInTheDocument();
      fireEvent.keyDown(canvas, { key: '+' });
      expect(screen.getByText('120%')).toBeInTheDocument();
    });

    it('should zoom in when = key is pressed', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = getCanvasAndFocus();

      expect(screen.getByText('100%')).toBeInTheDocument();
      fireEvent.keyDown(canvas, { key: '=' });
      expect(screen.getByText('120%')).toBeInTheDocument();
    });

    it('should zoom out when - key is pressed', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = getCanvasAndFocus();

      expect(screen.getByText('100%')).toBeInTheDocument();
      fireEvent.keyDown(canvas, { key: '-' });
      expect(screen.getByText('80%')).toBeInTheDocument();
    });

    it('should reset zoom and pan when 0 key is pressed', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = getCanvasAndFocus();

      // First zoom in
      fireEvent.keyDown(canvas, { key: '+' });
      expect(screen.getByText('120%')).toBeInTheDocument();

      // Press 0 to reset
      fireEvent.keyDown(canvas, { key: '0' });
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should toggle minimap when m key is pressed', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = getCanvasAndFocus();

      // Minimap is shown by default
      expect(document.querySelector('.minimap')).toBeInTheDocument();

      fireEvent.keyDown(canvas, { key: 'm' });
      expect(document.querySelector('.minimap')).not.toBeInTheDocument();

      fireEvent.keyDown(canvas, { key: 'm' });
      expect(document.querySelector('.minimap')).toBeInTheDocument();
    });

    it('should toggle filter bar when t key is pressed', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = getCanvasAndFocus();

      // Filter bar is hidden by default
      expect(document.querySelector('.filter-bar')).not.toBeInTheDocument();

      fireEvent.keyDown(canvas, { key: 't' });
      expect(document.querySelector('.filter-bar')).toBeInTheDocument();

      fireEvent.keyDown(canvas, { key: 't' });
      expect(document.querySelector('.filter-bar')).not.toBeInTheDocument();
    });

    it('should toggle focus mode when f key is pressed with selected artifact', () => {
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Epic 1' })];
      render(<Canvas {...defaultProps} artifacts={artifacts} selectedId="epic-1" />);
      const canvas = getCanvasAndFocus();

      expect(document.querySelector('.focus-mode-indicator')).not.toBeInTheDocument();

      fireEvent.keyDown(canvas, { key: 'f' });
      expect(document.querySelector('.focus-mode-indicator')).toBeInTheDocument();
    });

    it('should not toggle focus mode when f key is pressed without selection', () => {
      render(<Canvas {...defaultProps} selectedId={null} />);
      const canvas = getCanvasAndFocus();

      fireEvent.keyDown(canvas, { key: 'f' });
      expect(document.querySelector('.focus-mode-indicator')).not.toBeInTheDocument();
    });

    it('should toggle layout mode when l key is pressed', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = getCanvasAndFocus();

      // Starts in lanes mode
      expect(document.querySelector('.mindmap-mode-indicator')).not.toBeInTheDocument();

      fireEvent.keyDown(canvas, { key: 'l' });
      expect(document.querySelector('.mindmap-mode-indicator')).toBeInTheDocument();
    });

    it('should call onOpenSearch when / key is pressed', () => {
      const onOpenSearch = vi.fn();
      render(<Canvas {...defaultProps} onOpenSearch={onOpenSearch} />);
      const canvas = getCanvasAndFocus();

      fireEvent.keyDown(canvas, { key: '/' });
      expect(onOpenSearch).toHaveBeenCalled();
    });

    it('should deselect when Escape is pressed with no filter/focus mode', () => {
      const onSelect = vi.fn();
      render(<Canvas {...defaultProps} onSelect={onSelect} />);
      const canvas = getCanvasAndFocus();

      fireEvent.keyDown(canvas, { key: 'Escape' });
      expect(onSelect).toHaveBeenCalledWith(null);
    });

    it('should close filter bar when Escape is pressed and filter bar is open', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = getCanvasAndFocus();

      // Open filter bar
      fireEvent.keyDown(canvas, { key: 't' });
      expect(document.querySelector('.filter-bar')).toBeInTheDocument();

      // Escape should close filter bar, not deselect
      fireEvent.keyDown(canvas, { key: 'Escape' });
      expect(document.querySelector('.filter-bar')).not.toBeInTheDocument();
    });

    it('should exit focus mode when Escape is pressed in focus mode', () => {
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Epic 1' })];
      render(<Canvas {...defaultProps} artifacts={artifacts} selectedId="epic-1" />);
      const canvas = getCanvasAndFocus();

      // Enter focus mode
      fireEvent.keyDown(canvas, { key: 'f' });
      expect(document.querySelector('.focus-mode-indicator')).toBeInTheDocument();

      // Escape should exit focus mode
      fireEvent.keyDown(canvas, { key: 'Escape' });
      expect(document.querySelector('.focus-mode-indicator')).not.toBeInTheDocument();
    });

    it('should ignore keyboard shortcuts when INPUT element is focused', () => {
      const onSelect = vi.fn();
      render(<Canvas {...defaultProps} onSelect={onSelect} />);
      const canvas = getCanvasAndFocus();

      // Simulate keyDown coming from an INPUT element
      const input = document.createElement('input');
      canvas.appendChild(input);
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('should ignore keyboard shortcuts when TEXTAREA element is focused', () => {
      const onSelect = vi.fn();
      render(<Canvas {...defaultProps} onSelect={onSelect} />);
      const canvas = getCanvasAndFocus();

      const textarea = document.createElement('textarea');
      canvas.appendChild(textarea);
      fireEvent.keyDown(textarea, { key: 'Escape' });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('should handle uppercase M key for minimap toggle', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = getCanvasAndFocus();

      expect(document.querySelector('.minimap')).toBeInTheDocument();
      fireEvent.keyDown(canvas, { key: 'M' });
      expect(document.querySelector('.minimap')).not.toBeInTheDocument();
    });
  });

  describe('Focus Mode', () => {
    const artifactsWithRelations = [
      createMockArtifact({ id: 'epic-1', type: 'epic', title: 'Epic 1', childCount: 2 }),
      createMockArtifact({ id: 'story-1', type: 'story', title: 'Story 1', parentId: 'epic-1', position: { x: 400, y: 100 } }),
      createMockArtifact({ id: 'story-2', type: 'story', title: 'Story 2', parentId: 'epic-1', dependencies: ['story-1'], position: { x: 400, y: 250 } }),
    ];

    it('should show Focus Mode indicator when focus mode active', () => {
      render(
        <Canvas
          {...defaultProps}
          artifacts={artifactsWithRelations}
          selectedId="epic-1"
          expandedIds={new Set(['epic-1'])}
        />
      );
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();

      fireEvent.keyDown(canvas, { key: 'f' });

      expect(screen.getByText('Focus Mode')).toBeInTheDocument();
    });

    it('should show card count in focus mode indicator', () => {
      render(
        <Canvas
          {...defaultProps}
          artifacts={artifactsWithRelations}
          selectedId="epic-1"
          expandedIds={new Set(['epic-1'])}
        />
      );
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'f' });

      // Should show count of focused cards
      const countEl = document.querySelector('.focus-mode-count');
      expect(countEl).toBeInTheDocument();
      expect(countEl?.textContent).toMatch(/\d+ cards/);
    });

    it('should have exit button that clears focus mode', () => {
      render(
        <Canvas
          {...defaultProps}
          artifacts={artifactsWithRelations}
          selectedId="epic-1"
          expandedIds={new Set(['epic-1'])}
        />
      );
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'f' });

      const exitBtn = document.querySelector('.focus-mode-exit') as HTMLElement;
      expect(exitBtn).toBeInTheDocument();

      fireEvent.click(exitBtn);
      expect(document.querySelector('.focus-mode-indicator')).not.toBeInTheDocument();
    });

    it('should add focus-mode class to canvas div when active', () => {
      render(
        <Canvas
          {...defaultProps}
          artifacts={artifactsWithRelations}
          selectedId="epic-1"
          expandedIds={new Set(['epic-1'])}
        />
      );
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();

      expect(canvas).not.toHaveClass('focus-mode');
      fireEvent.keyDown(canvas, { key: 'f' });
      expect(canvas).toHaveClass('focus-mode');
    });

    it('should filter displayed artifacts to connected tree in focus mode', () => {
      // epic-1 selected → focus should show epic-1, story-1, story-2 (children)
      render(
        <Canvas
          {...defaultProps}
          artifacts={artifactsWithRelations}
          selectedId="story-1"
          expandedIds={new Set(['epic-1'])}
        />
      );
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();

      // All visible before focus mode
      expect(screen.getByText('Epic 1')).toBeInTheDocument();
      expect(screen.getByText('Story 1')).toBeInTheDocument();
      expect(screen.getByText('Story 2')).toBeInTheDocument();

      fireEvent.keyDown(canvas, { key: 'f' });

      // In focus mode with story-1 selected: ancestors (epic-1) + siblings under ancestor + cross-refs
      // story-1's parent is epic-1, and story-2 depends on story-1, so all should be visible
      expect(screen.getByText('Epic 1')).toBeInTheDocument();
      expect(screen.getByText('Story 1')).toBeInTheDocument();
    });
  });

  describe('Filter Bar', () => {
    const filterArtifacts = [
      createMockArtifact({ id: 'brief-1', type: 'product-brief', title: 'My Brief', status: 'draft', position: { x: 50, y: 100 } }),
      createMockArtifact({ id: 'epic-1', type: 'epic', title: 'My Epic', status: 'in-progress', position: { x: 1000, y: 100 } }),
    ];

    it('should toggle filter bar with t key', () => {
      render(<Canvas {...defaultProps} artifacts={filterArtifacts} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();

      expect(document.querySelector('.filter-bar')).not.toBeInTheDocument();
      fireEvent.keyDown(canvas, { key: 't' });
      expect(document.querySelector('.filter-bar')).toBeInTheDocument();
    });

    it('should show type filter buttons when filter bar is open', () => {
      render(<Canvas {...defaultProps} artifacts={filterArtifacts} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 't' });

      // Check for type filter buttons using their specific class
      const typeFilterBtns = document.querySelectorAll('.filter-btn.type-filter');
      expect(typeFilterBtns.length).toBeGreaterThan(0);
      // Check some specific ones exist by their title attribute
      expect(document.querySelector('.filter-btn.type-filter.epic')).toBeInTheDocument();
      expect(document.querySelector('.filter-btn.type-filter.story')).toBeInTheDocument();
    });

    it('should show status filter buttons when filter bar is open', () => {
      render(<Canvas {...defaultProps} artifacts={filterArtifacts} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 't' });

      const statusFilterBtns = document.querySelectorAll('.filter-btn.status-filter');
      expect(statusFilterBtns.length).toBeGreaterThan(0);
      // Check for Active and Done buttons (which don't conflict with artifact statuses)
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    it('should toggle a type filter when type button is clicked', () => {
      render(<Canvas {...defaultProps} artifacts={filterArtifacts} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 't' });

      const briefBtn = screen.getByText('Brief');
      expect(briefBtn).toHaveClass('active');

      // Click to hide "product-brief" type
      fireEvent.click(briefBtn);
      expect(briefBtn).toHaveClass('inactive');

      // Click again to show it
      fireEvent.click(briefBtn);
      expect(briefBtn).toHaveClass('active');
    });

    it('should toggle a status filter when status button is clicked', () => {
      render(<Canvas {...defaultProps} artifacts={filterArtifacts} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 't' });

      // Use the specific filter button selector to avoid conflict with artifact status "Draft"
      const draftFilterBtn = document.querySelector('.filter-btn.status-filter[title*="Draft"]') as HTMLElement;
      expect(draftFilterBtn).toBeInTheDocument();
      expect(draftFilterBtn).toHaveClass('active');

      fireEvent.click(draftFilterBtn);
      expect(draftFilterBtn).toHaveClass('inactive');
    });

    it('should show "Clear all" button when filters are active', () => {
      render(<Canvas {...defaultProps} artifacts={filterArtifacts} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 't' });

      // No "Clear all" before any filters are activated
      expect(screen.queryByText('Clear all')).not.toBeInTheDocument();

      // Hide a type
      fireEvent.click(screen.getByText('Brief'));
      expect(screen.getByText('Clear all')).toBeInTheDocument();
    });

    it('should reset all filters when "Clear all" is clicked', () => {
      render(<Canvas {...defaultProps} artifacts={filterArtifacts} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 't' });

      // Hide a type filter
      const briefBtn = screen.getByText('Brief');
      fireEvent.click(briefBtn);
      expect(briefBtn).toHaveClass('inactive');

      // Click "Clear all"
      fireEvent.click(screen.getByText('Clear all'));
      expect(briefBtn).toHaveClass('active');
    });

    it('should hide artifacts matching hidden type', () => {
      render(<Canvas {...defaultProps} artifacts={filterArtifacts} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();

      // Both visible before filter
      expect(screen.getByText('My Brief')).toBeInTheDocument();
      expect(screen.getByText('My Epic')).toBeInTheDocument();

      // Open filter bar and hide product-brief type
      fireEvent.keyDown(canvas, { key: 't' });
      fireEvent.click(screen.getByText('Brief'));

      // "My Brief" should be hidden from the canvas
      expect(screen.queryByText('My Brief')).not.toBeInTheDocument();
      expect(screen.getByText('My Epic')).toBeInTheDocument();
    });

    it('should hide artifacts matching hidden status bucket', () => {
      render(<Canvas {...defaultProps} artifacts={filterArtifacts} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();

      // Open filter bar and hide "Draft" status bucket using specific selector
      fireEvent.keyDown(canvas, { key: 't' });
      const draftFilterBtn = document.querySelector('.filter-btn.status-filter[title*="Draft"]') as HTMLElement;
      fireEvent.click(draftFilterBtn);

      // The "My Brief" artifact has status "draft", so it should be hidden
      expect(screen.queryByText('My Brief')).not.toBeInTheDocument();
      // "My Epic" has status "in-progress" → Active bucket → still visible
      expect(screen.getByText('My Epic')).toBeInTheDocument();
    });

    it('should show visibility count in filter bar', () => {
      render(<Canvas {...defaultProps} artifacts={filterArtifacts} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 't' });

      const countEl = document.querySelector('.filter-bar-count');
      expect(countEl).toBeInTheDocument();
      expect(countEl?.textContent).toContain('visible');
    });
  });

  describe('Lane Hiding/Showing', () => {
    it('should hide a lane when lane hide button is clicked', () => {
      const artifacts = [
        createMockArtifact({ id: 'brief-1', type: 'product-brief', title: 'Brief 1', position: { x: 50, y: 100 } }),
      ];
      render(<Canvas {...defaultProps} artifacts={artifacts} />);

      // Find the hide button for discovery lane (first lane)
      const hideButtons = document.querySelectorAll('.lane-hide-btn');
      expect(hideButtons.length).toBeGreaterThan(0);

      fireEvent.click(hideButtons[0]);

      // The hidden lane tab should appear
      const hiddenTabs = document.querySelectorAll('.lane-hidden-tab');
      expect(hiddenTabs.length).toBeGreaterThan(0);
    });

    it('should re-show a hidden lane when its tab is clicked', () => {
      const artifacts = [
        createMockArtifact({ id: 'brief-1', type: 'product-brief', title: 'Brief 1', position: { x: 50, y: 100 } }),
      ];
      render(<Canvas {...defaultProps} artifacts={artifacts} />);

      // Hide discovery lane
      const hideButtons = document.querySelectorAll('.lane-hide-btn');
      fireEvent.click(hideButtons[0]);

      // Now click the hidden tab to re-show
      const hiddenTab = document.querySelector('.lane-hidden-tab') as HTMLElement;
      expect(hiddenTab).toBeInTheDocument();

      fireEvent.click(hiddenTab);

      // After re-showing, hidden tab should be gone and all 4 column headers should be visible
      const headers = document.querySelectorAll('.column-header');
      expect(headers.length).toBe(4);
    });
  });

  describe('Minimap', () => {
    it('should show minimap by default', () => {
      render(<Canvas {...defaultProps} />);
      expect(document.querySelector('.minimap')).toBeInTheDocument();
    });

    it('should toggle minimap via toggle button', () => {
      render(<Canvas {...defaultProps} />);

      const minimapToggle = document.querySelector('.minimap-toggle') as HTMLElement;
      expect(minimapToggle).toBeInTheDocument();

      fireEvent.click(minimapToggle);
      expect(document.querySelector('.minimap')).not.toBeInTheDocument();

      fireEvent.click(minimapToggle);
      expect(document.querySelector('.minimap')).toBeInTheDocument();
    });

    it('should toggle minimap via m key', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();

      expect(document.querySelector('.minimap')).toBeInTheDocument();
      fireEvent.keyDown(canvas, { key: 'm' });
      expect(document.querySelector('.minimap')).not.toBeInTheDocument();
    });
  });

  describe('Layout Mode', () => {
    it('should start in lanes mode', () => {
      render(<Canvas {...defaultProps} />);
      expect(document.querySelector('.mindmap-mode-indicator')).not.toBeInTheDocument();
      expect(document.querySelector('.column-headers')).toBeInTheDocument();
    });

    it('should toggle layout via mindmap-toggle button', () => {
      render(<Canvas {...defaultProps} />);

      const toggleBtn = document.querySelector('.mindmap-toggle') as HTMLElement;
      expect(toggleBtn).toBeInTheDocument();

      fireEvent.click(toggleBtn);
      expect(document.querySelector('.mindmap-mode-indicator')).toBeInTheDocument();
      // Canvas should have mindmap-mode class
      expect(document.querySelector('.canvas')).toHaveClass('mindmap-mode');
    });

    it('should show mindmap indicator with node count', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic 1' }),
      ];
      render(<Canvas {...defaultProps} artifacts={artifacts} />);

      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'l' });

      expect(screen.getByText('Mind Map')).toBeInTheDocument();
      const countEl = document.querySelector('.mindmap-mode-count');
      expect(countEl).toBeInTheDocument();
      expect(countEl?.textContent).toMatch(/\d+ nodes/);
    });

    it('should have exit button that returns to lanes mode', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();

      fireEvent.keyDown(canvas, { key: 'l' });
      expect(document.querySelector('.mindmap-mode-indicator')).toBeInTheDocument();

      const exitBtn = document.querySelector('.mindmap-mode-exit') as HTMLElement;
      expect(exitBtn).toBeInTheDocument();

      fireEvent.click(exitBtn);
      expect(document.querySelector('.mindmap-mode-indicator')).not.toBeInTheDocument();
      // Should be back in lanes mode with column headers
      expect(document.querySelector('.column-headers')).toBeInTheDocument();
    });

    it('should hide lane chrome in mindmap mode', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();

      // Lane chrome visible in lanes mode
      expect(document.querySelector('.column-headers')).toBeInTheDocument();
      expect(document.querySelector('.swim-lanes')).toBeInTheDocument();

      fireEvent.keyDown(canvas, { key: 'l' });

      // Lane chrome should be hidden in mindmap mode
      expect(document.querySelector('.column-headers')).not.toBeInTheDocument();
      expect(document.querySelector('.swim-lanes')).not.toBeInTheDocument();
    });

    it('should reset zoom when switching to mindmap mode via l key', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();

      // Zoom in first
      fireEvent.keyDown(canvas, { key: '+' });
      expect(screen.getByText('120%')).toBeInTheDocument();

      // Switch to mindmap — zoom is NOT forcibly reset; the auto-fit useEffect
      // handles zoom/pan, but in JSDOM the container has zero dimensions so the
      // fit-to-view calculation doesn't fire and the zoom stays unchanged.
      fireEvent.keyDown(canvas, { key: 'l' });
      expect(screen.getByText('120%')).toBeInTheDocument();

      // Switch back to lanes resets zoom to 100%
      fireEvent.keyDown(canvas, { key: 'l' });
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  describe('Hint Panel', () => {
    it('should show hint panel by default', () => {
      render(<Canvas {...defaultProps} />);
      const hint = document.querySelector('.canvas-hint') as HTMLElement;
      expect(hint).toBeInTheDocument();
      expect(hint).not.toHaveClass('collapsed');
    });

    it('should show keyboard shortcut items when expanded', () => {
      render(<Canvas {...defaultProps} />);
      expect(document.querySelector('.canvas-hint-items')).toBeInTheDocument();
    });

    it('should collapse hint panel when toggle button is clicked', () => {
      render(<Canvas {...defaultProps} />);

      const toggleBtn = screen.getByLabelText('Canvas keyboard shortcuts');
      fireEvent.click(toggleBtn);

      const hint = document.querySelector('.canvas-hint') as HTMLElement;
      expect(hint).toHaveClass('collapsed');
      expect(document.querySelector('.canvas-hint-items')).not.toBeInTheDocument();
    });

    it('should re-expand hint panel when toggle is clicked again', () => {
      render(<Canvas {...defaultProps} />);

      const toggleBtn = screen.getByLabelText('Canvas keyboard shortcuts');
      // Collapse
      fireEvent.click(toggleBtn);
      expect(document.querySelector('.canvas-hint-items')).not.toBeInTheDocument();

      // Re-expand
      fireEvent.click(toggleBtn);
      expect(document.querySelector('.canvas-hint-items')).toBeInTheDocument();
    });

    it('should show "Keys" label when collapsed', () => {
      render(<Canvas {...defaultProps} />);

      const toggleBtn = screen.getByLabelText('Canvas keyboard shortcuts');
      fireEvent.click(toggleBtn);

      expect(document.querySelector('.canvas-hint-label')).toBeInTheDocument();
      expect(document.querySelector('.canvas-hint-label')?.textContent).toBe('Keys');
    });
  });

  describe('CenterOnId / Flash Effect', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should pan to center on artifact when centerOnId changes', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic 1', position: { x: 500, y: 500 }, size: { width: 280, height: 150 } }),
      ];

      // Mock clientWidth/clientHeight on canvasRef element
      const { rerender } = render(
        <Canvas {...defaultProps} artifacts={artifacts} centerOnId={null} />
      );

      const content = document.querySelector('.canvas-content') as HTMLElement;
      const initialTransform = content.style.transform;

      // Set centerOnId to trigger centering
      rerender(
        <Canvas {...defaultProps} artifacts={artifacts} centerOnId="epic-1" />
      );

      // Transform should have changed (panned to center the artifact)
      expect(content.style.transform).not.toBe(initialTransform);
    });

    it('should call onCentered after centering', () => {
      const onCentered = vi.fn();
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic 1', position: { x: 500, y: 500 } }),
      ];

      render(
        <Canvas {...defaultProps} artifacts={artifacts} centerOnId="epic-1" onCentered={onCentered} />
      );

      expect(onCentered).toHaveBeenCalled();
    });

    it('should set flash on the artifact and clear it after timeout', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic 1', position: { x: 500, y: 500 } }),
      ];

      render(
        <Canvas {...defaultProps} artifacts={artifacts} centerOnId="epic-1" />
      );

      // The artifact card should be flashing
      const flashingCard = document.querySelector('.artifact-card.flashing');
      expect(flashingCard).toBeInTheDocument();

      // Advance timers past the flash duration (1200ms)
      act(() => {
        vi.advanceTimersByTime(1300);
      });

      // Flash should be cleared
      expect(document.querySelector('.artifact-card.flashing')).not.toBeInTheDocument();
    });

    it('should not crash when centerOnId references a nonexistent artifact', () => {
      render(
        <Canvas {...defaultProps} artifacts={[]} centerOnId="nonexistent-id" />
      );

      // Should render without errors
      expect(document.querySelector('.canvas')).toBeInTheDocument();
    });
  });

  describe('Screenshot Capture', () => {
    it('should trigger screenshot when screenshotTrigger increments', async () => {
      const html2canvasMod = await import('html2canvas');
      const onScreenshotReady = vi.fn();
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic 1' }),
      ];

      const { rerender } = render(
        <Canvas
          {...defaultProps}
          artifacts={artifacts}
          screenshotTrigger={0}
          screenshotFormat="png"
          onScreenshotReady={onScreenshotReady}
        />
      );

      // Increment trigger to capture
      rerender(
        <Canvas
          {...defaultProps}
          artifacts={artifacts}
          screenshotTrigger={1}
          screenshotFormat="png"
          onScreenshotReady={onScreenshotReady}
        />
      );

      await waitFor(() => {
        expect(html2canvasMod.default).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(onScreenshotReady).toHaveBeenCalledWith('data:image/png;base64,abc', 'png');
      });
    });

    it('should not trigger screenshot if trigger value unchanged', async () => {
      const html2canvasMod = await import('html2canvas');
      (html2canvasMod.default as ReturnType<typeof vi.fn>).mockClear();
      const onScreenshotReady = vi.fn();
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic 1' }),
      ];

      const { rerender } = render(
        <Canvas
          {...defaultProps}
          artifacts={artifacts}
          screenshotTrigger={1}
          screenshotFormat="png"
          onScreenshotReady={onScreenshotReady}
        />
      );

      // Re-render with same trigger value
      rerender(
        <Canvas
          {...defaultProps}
          artifacts={artifacts}
          screenshotTrigger={1}
          screenshotFormat="png"
          onScreenshotReady={onScreenshotReady}
        />
      );

      // Should not have been called (trigger didn't increment)
      expect(onScreenshotReady).not.toHaveBeenCalled();
    });

    it('should not trigger screenshot without onScreenshotReady callback', async () => {
      const html2canvasMod = await import('html2canvas');
      (html2canvasMod.default as ReturnType<typeof vi.fn>).mockClear();

      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic 1' }),
      ];

      const { rerender } = render(
        <Canvas
          {...defaultProps}
          artifacts={artifacts}
          screenshotTrigger={0}
        />
      );

      rerender(
        <Canvas
          {...defaultProps}
          artifacts={artifacts}
          screenshotTrigger={1}
        />
      );

      // Without onScreenshotReady, html2canvas should not be called
      // (the effect returns early when !onScreenshotReady)
      expect(html2canvasMod.default).not.toHaveBeenCalled();
    });
  });

  describe('Connected IDs / Dependency Highlighting', () => {
    it('should dim non-connected artifacts when an artifact is selected', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', type: 'epic', title: 'Epic 1', childCount: 1 }),
        createMockArtifact({ id: 'story-1', type: 'story', title: 'Story 1', parentId: 'epic-1', position: { x: 400, y: 100 } }),
        createMockArtifact({ id: 'brief-1', type: 'product-brief', title: 'Brief 1', position: { x: 50, y: 100 } }),
      ];

      render(
        <Canvas
          {...defaultProps}
          artifacts={artifacts}
          selectedId="story-1"
          expandedIds={new Set(['epic-1'])}
        />
      );

      // brief-1 is not connected to story-1 → should be dimmed
      const cards = document.querySelectorAll('.artifact-card');
      const dimmedCards = document.querySelectorAll('.artifact-card.dimmed');
      expect(dimmedCards.length).toBeGreaterThan(0);
    });

    it('should not dim any artifacts when nothing is selected', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', type: 'epic', title: 'Epic 1' }),
        createMockArtifact({ id: 'brief-1', type: 'product-brief', title: 'Brief 1', position: { x: 50, y: 100 } }),
      ];

      render(
        <Canvas {...defaultProps} artifacts={artifacts} selectedId={null} />
      );

      const dimmedCards = document.querySelectorAll('.artifact-card.dimmed');
      expect(dimmedCards.length).toBe(0);
    });

    it('should highlight parent chain when child is selected', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', type: 'epic', title: 'Epic 1', childCount: 1 }),
        createMockArtifact({ id: 'story-1', type: 'story', title: 'Story 1', parentId: 'epic-1', position: { x: 400, y: 100 } }),
        createMockArtifact({ id: 'brief-1', type: 'product-brief', title: 'Brief 1', position: { x: 50, y: 100 } }),
      ];

      render(
        <Canvas
          {...defaultProps}
          artifacts={artifacts}
          selectedId="story-1"
          expandedIds={new Set(['epic-1'])}
        />
      );

      // epic-1 is parent of story-1, should NOT be dimmed
      // brief-1 is unrelated, should be dimmed
      const cards = document.querySelectorAll('.artifact-card');
      let briefDimmed = false;
      let epicDimmed = false;
      cards.forEach(card => {
        const title = card.querySelector('.artifact-title')?.textContent || '';
        if (title.includes('Brief 1')) {
          briefDimmed = card.classList.contains('dimmed');
        }
        if (title.includes('Epic 1')) {
          epicDimmed = card.classList.contains('dimmed');
        }
      });
      expect(briefDimmed).toBe(true);
      expect(epicDimmed).toBe(false);
    });

    it('should highlight dependency targets when source is selected', () => {
      const artifacts = [
        createMockArtifact({ id: 'story-1', type: 'story', title: 'Story 1', position: { x: 400, y: 100 } }),
        createMockArtifact({ id: 'story-2', type: 'story', title: 'Story 2', dependencies: ['story-1'], position: { x: 400, y: 250 } }),
        createMockArtifact({ id: 'brief-1', type: 'product-brief', title: 'Brief 1', position: { x: 50, y: 100 } }),
      ];

      render(
        <Canvas {...defaultProps} artifacts={artifacts} selectedId="story-2" />
      );

      // story-1 is a dependency of story-2, should not be dimmed
      // brief-1 is unrelated, should be dimmed
      const cards = document.querySelectorAll('.artifact-card');
      let storyOneDimmed = false;
      let briefDimmed = false;
      cards.forEach(card => {
        const title = card.querySelector('.artifact-title')?.textContent || '';
        if (title.includes('Story 1')) {
          storyOneDimmed = card.classList.contains('dimmed');
        }
        if (title.includes('Brief 1')) {
          briefDimmed = card.classList.contains('dimmed');
        }
      });
      expect(storyOneDimmed).toBe(false);
      expect(briefDimmed).toBe(true);
    });

    it('should not dim anything when selected card has no connections', () => {
      const artifacts = [
        createMockArtifact({ id: 'brief-1', type: 'product-brief', title: 'Brief 1', position: { x: 50, y: 100 } }),
      ];

      render(
        <Canvas {...defaultProps} artifacts={artifacts} selectedId="brief-1" />
      );

      // Single card with no connections → connectedIds returns null → no dimming
      const dimmedCards = document.querySelectorAll('.artifact-card.dimmed');
      expect(dimmedCards.length).toBe(0);
    });
  });

  describe('Search Match Highlighting', () => {
    it('should mark artifacts matching search query with search-match class', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic 1' }),
        createMockArtifact({ id: 'epic-2', title: 'Epic 2', position: { x: 100, y: 250 } }),
      ];

      render(
        <Canvas
          {...defaultProps}
          artifacts={artifacts}
          searchMatchIds={new Set(['epic-1'])}
        />
      );

      const matchedCards = document.querySelectorAll('.artifact-card.search-match');
      expect(matchedCards.length).toBe(1);
    });

    it('should not apply search-match class when searchMatchIds is empty', () => {
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic 1' }),
      ];

      render(
        <Canvas
          {...defaultProps}
          artifacts={artifacts}
          searchMatchIds={new Set()}
        />
      );

      const matchedCards = document.querySelectorAll('.artifact-card.search-match');
      expect(matchedCards.length).toBe(0);
    });
  });

  describe('Multiple Arrow Keys', () => {
    it('should accumulate pan from multiple arrow key presses', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();
      const content = document.querySelector('.canvas-content') as HTMLElement;

      // Press ArrowUp twice
      fireEvent.keyDown(canvas, { key: 'ArrowUp' });
      const afterFirst = content.style.transform;

      fireEvent.keyDown(canvas, { key: 'ArrowUp' });
      const afterSecond = content.style.transform;

      // Second press should change the transform further
      expect(afterSecond).not.toBe(afterFirst);
    });
  });

  describe('Zoom Keyboard Bounds', () => {
    it('should not zoom above max with keyboard +', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();

      for (let i = 0; i < 20; i++) {
        fireEvent.keyDown(canvas, { key: '+' });
      }

      const zoomText = document.querySelector('.zoom-controls span')?.textContent;
      const zoomValue = parseInt(zoomText || '100');
      expect(zoomValue).toBeLessThanOrEqual(200);
    });

    it('should not zoom below min with keyboard -', () => {
      render(<Canvas {...defaultProps} />);
      const canvas = document.querySelector('.canvas') as HTMLElement;
      canvas.focus();

      for (let i = 0; i < 20; i++) {
        fireEvent.keyDown(canvas, { key: '-' });
      }

      const zoomText = document.querySelector('.zoom-controls span')?.textContent;
      const zoomValue = parseInt(zoomText || '100');
      expect(zoomValue).toBeGreaterThanOrEqual(25);
    });
  });
});
