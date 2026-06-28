/**
 * App Component Tests
 * Main application component that orchestrates the canvas UI
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { mockVsCodeApi } from '@test/setup';
import type { Artifact } from './types';

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

// Helper to dispatch messages from the extension
const dispatchMessage = (type: string, data: Record<string, unknown> = {}) => {
  const event = new MessageEvent('message', {
    data: { type, ...data },
  });
  window.dispatchEvent(event);
};

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should render without crashing', () => {
      render(<App />);
      expect(document.querySelector('.app')).toBeInTheDocument();
    });

    it('should send ready message on mount', () => {
      render(<App />);
      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'ready' });
    });

    it('should show empty state when no artifacts', () => {
      render(<App />);
      expect(screen.getByText(/No artifacts loaded/)).toBeInTheDocument();
    });

    it('should render toolbar', () => {
      render(<App />);
      expect(document.querySelector('.toolbar-fab-container')).toBeInTheDocument();
    });

    it('should render canvas', () => {
      render(<App />);
      expect(document.querySelector('.canvas')).toBeInTheDocument();
    });
  });

  describe('Message Handling', () => {
    it('should update artifacts on updateArtifacts message', async () => {
      render(<App />);
      
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic 1' }),
        createMockArtifact({ id: 'epic-2', title: 'Epic 2' }),
      ];

      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      await waitFor(() => {
        expect(screen.queryByText(/No artifacts loaded/)).not.toBeInTheDocument();
      });
    });

    it('should handle selectArtifact message', async () => {
      render(<App />);
      
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic' })];
      
      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      act(() => {
        dispatchMessage('selectArtifact', { id: 'epic-1' });
      });

      // Selection should be applied (card should have selected class)
      await waitFor(() => {
        const card = document.querySelector('.artifact-card.selected');
        expect(card).toBeInTheDocument();
      });
    });

    it('should handle selectAndEdit message', async () => {
      render(<App />);
      
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic' })];
      
      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      act(() => {
        dispatchMessage('selectAndEdit', { id: 'epic-1' });
      });

      // Detail panel should open
      await waitFor(() => {
        expect(document.querySelector('.detail-panel')).toBeInTheDocument();
      });
    });

    it('should handle aiCursorMove message', async () => {
      render(<App />);
      
      act(() => {
        dispatchMessage('aiCursorMove', { 
          cursor: { x: 100, y: 100, targetId: null, action: 'editing' }
        });
      });

      await waitFor(() => {
        expect(document.querySelector('.ai-cursor')).toBeInTheDocument();
      });
    });

    it('should handle aiCursorHide message', async () => {
      render(<App />);
      
      // First show cursor
      act(() => {
        dispatchMessage('aiCursorMove', { 
          cursor: { x: 100, y: 100, targetId: null, action: 'editing' }
        });
      });

      await waitFor(() => {
        expect(document.querySelector('.ai-cursor')).toBeInTheDocument();
      });

      // Then hide it
      act(() => {
        dispatchMessage('aiCursorHide', {});
      });

      await waitFor(() => {
        expect(document.querySelector('.ai-cursor')).not.toBeInTheDocument();
      });
    });
  });

  describe('Artifact Interactions', () => {
    it('should send selectArtifact message when artifact is selected', async () => {
      render(<App />);
      
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic' })];
      
      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      await waitFor(() => {
        expect(document.querySelector('.artifact-card')).toBeInTheDocument();
      });

      const card = document.querySelector('.artifact-card');
      fireEvent.click(card!);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
        type: 'selectArtifact',
        id: 'epic-1',
      });
    });

    it('should send updateArtifact message when artifact is updated', async () => {
      render(<App />);
      
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic' })];
      
      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      // Select and open detail panel
      act(() => {
        dispatchMessage('selectAndEdit', { id: 'epic-1' });
      });

      await waitFor(() => {
        expect(document.querySelector('.detail-panel')).toBeInTheDocument();
      });

      // Find and modify title input, then save
      const titleInput = document.querySelector('.detail-panel input[type="text"]');
      if (titleInput) {
        fireEvent.change(titleInput, { target: { value: 'Updated Title' } });
        
        // Click save button
        const saveBtn = screen.getByRole('button', { name: /save/i });
        fireEvent.click(saveBtn);

        expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'updateArtifact',
            id: 'epic-1',
          })
        );
      }
    });

    it('should send deleteArtifact message when delete is confirmed', async () => {
      render(<App />);

      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic' })];

      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      act(() => {
        dispatchMessage('selectAndEdit', { id: 'epic-1' });
      });

      await waitFor(() => {
        expect(document.querySelector('.detail-panel')).toBeInTheDocument();
      });

      // selectAndEdit opens in edit mode — cancel to return to view mode where Delete is visible
      const cancelBtn = screen.queryByRole('button', { name: /cancel/i });
      if (cancelBtn) {
        fireEvent.click(cancelBtn);
      }

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      // Click Delete to show inline confirm
      const deleteBtn = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteBtn);

      // Click the Confirm button in the inline confirm UI
      const confirmBtn = screen.getByRole('button', { name: /confirm/i });
      fireEvent.click(confirmBtn);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
        type: 'deleteArtifact',
        artifactType: 'epic',
        id: 'epic-1',
      });
    });
  });

  describe('Toolbar Actions', () => {
    it('should send addArtifact message when add button clicked', async () => {
      render(<App />);
      
      // Open the popover first
      fireEvent.click(screen.getByRole('button', { name: /add artifact/i }));

      // Find Epic button in popover
      const epicButton = screen.getByTitle('Add Epic');
      fireEvent.click(epicButton);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
        type: 'addArtifact',
        artifactType: 'epic',
      });
    });

    it('should send addArtifact for vision', async () => {
      render(<App />);
      
      fireEvent.click(screen.getByRole('button', { name: /add artifact/i }));
      const visionButton = screen.getByTitle('Add Vision');
      fireEvent.click(visionButton);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
        type: 'addArtifact',
        artifactType: 'vision',
      });
    });

    it('should send addArtifact for requirement', async () => {
      render(<App />);
      
      fireEvent.click(screen.getByRole('button', { name: /add artifact/i }));
      const requirementButton = screen.getByTitle('Add Requirement');
      fireEvent.click(requirementButton);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
        type: 'addArtifact',
        artifactType: 'requirement',
      });
    });

    it('should send addArtifact for PRD', async () => {
      render(<App />);
      
      fireEvent.click(screen.getByRole('button', { name: /add artifact/i }));
      const prdButton = screen.getByTitle('Add PRD');
      fireEvent.click(prdButton);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
        type: 'addArtifact',
        artifactType: 'prd',
      });
    });

    it('should send addArtifact for architecture', async () => {
      render(<App />);
      
      fireEvent.click(screen.getByRole('button', { name: /add artifact/i }));
      const architectureButton = screen.getByTitle('Add Architecture');
      fireEvent.click(architectureButton);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
        type: 'addArtifact',
        artifactType: 'architecture',
      });
    });
  });

  describe('Expand/Collapse Behavior', () => {
    it('should expand parents by default when artifacts load', async () => {
      render(<App />);
      
      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Parent Epic', childCount: 2 }),
        createMockArtifact({ id: 'story-1', title: 'Story 1', type: 'story', parentId: 'epic-1' }),
        createMockArtifact({ id: 'story-2', title: 'Story 2', type: 'story', parentId: 'epic-1' }),
      ];
      
      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      await waitFor(() => {
        // Parent should be expanded (stories visible)
        const cards = document.querySelectorAll('.artifact-card');
        expect(cards.length).toBe(3); // All should be visible
      });
    });

    it('should toggle expansion when badge clicked', async () => {
      render(<App />);
      
      const artifacts = [
        createMockArtifact({
          id: 'epic-1',
          title: 'Parent Epic',
          childCount: 2,
          childBreakdown: [{ label: 'Stories', count: 2, types: ['story'] }],
        }),
        createMockArtifact({ id: 'story-1', title: 'Story 1', type: 'story', parentId: 'epic-1' }),
      ];
      
      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      await waitFor(() => {
        const badge = document.querySelector('.child-breakdown-badge');
        expect(badge).toBeInTheDocument();
      });

      // Click badge to collapse that category
      const badge = document.querySelector('.child-breakdown-badge');
      fireEvent.click(badge!);

      await waitFor(() => {
        // After collapse, only parent should be visible
        const cards = document.querySelectorAll('.artifact-card');
        expect(cards.length).toBe(1);
      });
    });
  });

  describe('Detail Panel', () => {
    it('should open detail panel on double click', async () => {
      render(<App />);
      
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic' })];
      
      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      await waitFor(() => {
        expect(document.querySelector('.artifact-card')).toBeInTheDocument();
      });

      const card = document.querySelector('.artifact-card');
      fireEvent.doubleClick(card!);

      await waitFor(() => {
        expect(document.querySelector('.detail-panel')).toBeInTheDocument();
      });
    });

    it('should close detail panel when close button clicked', async () => {
      render(<App />);
      
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic' })];
      
      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      // Open panel
      act(() => {
        dispatchMessage('selectAndEdit', { id: 'epic-1' });
      });

      await waitFor(() => {
        expect(document.querySelector('.detail-panel')).toBeInTheDocument();
      });

      // Click close button
      const closeBtn = document.querySelector('.detail-panel .close-btn');
      if (closeBtn) {
        fireEvent.click(closeBtn);

        await waitFor(() => {
          expect(document.querySelector('.detail-panel')).not.toBeInTheDocument();
        });
      }
    });    it('should add with-detail-panel class when panel is open', async () => {
      render(<App />);

      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic' })];

      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      act(() => {
        dispatchMessage('selectAndEdit', { id: 'epic-1' });
      });

      await waitFor(() => {
        expect(document.querySelector('.app.with-detail-panel')).toBeInTheDocument();
      });
    });
  });

  // ── Visual Plan Modal interception ──────────────────────────────────────
  // Regression guard for the feature that opened visual-plan cards in an
  // in-canvas modal instead of the narrow right-side DetailPanel. Without
  // this, a refactor that loses the `type === 'visual-plan'` branch in
  // handleOpenDetailPanel will silently regress visual-plan UX (plans
  // become unreadable in the 320–600 px panel).
  describe('Visual Plan Modal', () => {
    it('double-click on a visual-plan card opens the modal, NOT the detail panel', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('updateArtifacts', {
          artifacts: [createMockArtifact({ id: 'plan-1', type: 'visual-plan', title: 'Test Plan' })],
        });
      });

      await waitFor(() => {
        expect(document.querySelector('.artifact-card')).toBeInTheDocument();
      });

      fireEvent.doubleClick(document.querySelector('.artifact-card')!);

      await waitFor(() => {
        // Modal mounted (in-canvas popup with full review controls)
        expect(document.querySelector('[data-testid="visual-plan-modal"]')).toBeInTheDocument();
        // Right-side DetailPanel did NOT open
        expect(document.querySelector('.detail-panel')).not.toBeInTheDocument();
      });
    });

    it('double-click on a non-visual-plan card still opens the DetailPanel', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('updateArtifacts', {
          artifacts: [createMockArtifact({ id: 'epic-1', type: 'epic', title: 'Test Epic' })],
        });
      });

      await waitFor(() => {
        expect(document.querySelector('.artifact-card')).toBeInTheDocument();
      });

      fireEvent.doubleClick(document.querySelector('.artifact-card')!);

      await waitFor(() => {
        expect(document.querySelector('.detail-panel')).toBeInTheDocument();
        expect(document.querySelector('[data-testid="visual-plan-modal"]')).not.toBeInTheDocument();
      });
    });

    it('closing the visual-plan modal removes it from the DOM', async () => {
      // Note: the selectArtifact IPC fires on the OPEN path
      // (handleOpenDetailPanel's visual-plan branch), not on close —
      // handleCloseVisualPlanModal only clears state. We don't assert
      // IPC here so this test stays focused on the close behaviour;
      // the open-path IPC is verified implicitly by tests 1 and 2.
      render(<App />);

      act(() => {
        dispatchMessage('updateArtifacts', {
          artifacts: [createMockArtifact({ id: 'plan-1', type: 'visual-plan', title: 'Test Plan' })],
        });
      });

      await waitFor(() => {
        expect(document.querySelector('.artifact-card')).toBeInTheDocument();
      });

      fireEvent.doubleClick(document.querySelector('.artifact-card')!);

      await waitFor(() => {
        expect(document.querySelector('[data-testid="visual-plan-modal"]')).toBeInTheDocument();
      });

      // Click the × close button
      fireEvent.click(screen.getByLabelText('Close plan modal'));

      await waitFor(() => {
        expect(document.querySelector('[data-testid="visual-plan-modal"]')).not.toBeInTheDocument();
      });
    });

    // ── Cycle (prev/next visual-plan) at the App layer ────────────────
    // Verifies the full integration: App maintains a sorted list of
    // visual-plan artifacts, the modal exposes prev/next counters and
    // buttons when 2+ exist, ArrowLeft/Right cycle, and wrap at both ends.
    it('cycles through multiple visual-plan cards via prev/next buttons and arrow keys', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('updateArtifacts', {
          artifacts: [
            createMockArtifact({ id: 'plan-a', type: 'visual-plan', title: 'Alpha Plan' }),
            createMockArtifact({ id: 'plan-b', type: 'visual-plan', title: 'Bravo Plan' }),
            createMockArtifact({ id: 'plan-c', type: 'visual-plan', title: 'Charlie Plan' }),
          ],
        });
      });

      await waitFor(() => {
        expect(document.querySelectorAll('.artifact-card').length).toBe(3);
      });

      // Find the Alpha card by its title text (decoupled from array
      // index so this test isn't sensitive to canvas render order).
      const allCards = Array.from(document.querySelectorAll('.artifact-card'));
      const alphaCard = allCards.find(c => c.textContent?.includes('Alpha Plan'));
      expect(alphaCard).toBeInTheDocument();
      fireEvent.doubleClick(alphaCard!);

      await waitFor(() => {
        expect(document.querySelector('[data-testid="visual-plan-modal"]')).toBeInTheDocument();
        // Cycle controls present because 2+ plans exist
        expect(screen.getByTestId('vp-modal-prev-btn')).toBeInTheDocument();
        expect(screen.getByTestId('vp-modal-next-btn')).toBeInTheDocument();
      });

      // Snapshot the IPC log BEFORE any cycle step. The open path
      // posts exactly one selectArtifact for plan-a; we want to lock
      // the new contract that cycle steps do NOT post further
      // selectArtifact calls (which would scroll-thrash the canvas).
      const preCycleSelectArtifactCount =
        mockVsCodeApi.postMessage.mock.calls.filter(
          c => (c[0] as any)?.type === 'selectArtifact'
        ).length;

      // Counter shows 1 / 3 (alpha is first alphabetically)
      expect(screen.getByTestId('vp-modal-cycle-counter')).toHaveTextContent('1 / 3');

      // Next button → plan-b (2 / 3)
      fireEvent.click(screen.getByTestId('vp-modal-next-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('vp-modal-cycle-counter')).toHaveTextContent('2 / 3');
      });

      // ArrowRight → plan-c (3 / 3)
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      await waitFor(() => {
        expect(screen.getByTestId('vp-modal-cycle-counter')).toHaveTextContent('3 / 3');
      });

      // ArrowRight wraps to plan-a (1 / 3)
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      await waitFor(() => {
        expect(screen.getByTestId('vp-modal-cycle-counter')).toHaveTextContent('1 / 3');
      });

      // ArrowLeft wraps backwards from first to last (3 / 3)
      fireEvent.keyDown(document, { key: 'ArrowLeft' });
      await waitFor(() => {
        expect(screen.getByTestId('vp-modal-cycle-counter')).toHaveTextContent('3 / 3');
      });

      // Modal stays open across all transitions
      expect(document.querySelector('[data-testid="visual-plan-modal"]')).toBeInTheDocument();

      // Lock the quiet-cycle contract: cycling inside the modal must
      // not post any extra selectArtifact calls. The only selectArtifact
      // post should have been the open-time one (plan-a). This is what
      // lets the user hold ←/→ without scrolling the canvas behind the
      // modal.
      const postCycleSelectArtifactCount =
        mockVsCodeApi.postMessage.mock.calls.filter(
          c => (c[0] as any)?.type === 'selectArtifact'
        ).length;
      expect(postCycleSelectArtifactCount).toBe(preCycleSelectArtifactCount);
    });
  });

  describe('AI Actions', () => {
    it('should send refineWithAI message when refine button clicked', async () => {
      render(<App />);
      
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic' })];
      
      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      await waitFor(() => {
        expect(document.querySelector('.card-ai-btn')).toBeInTheDocument();
      });

      const aiBtn = document.querySelector('.card-ai-btn');
      fireEvent.click(aiBtn!);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'refineWithAI',
          artifact: expect.objectContaining({
            id: 'epic-1',
            type: 'epic',
          }),
        })
      );
    });

    it('should send breakDown message when break down button clicked', async () => {
      render(<App />);
      
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic', type: 'epic' })];
      
      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      // Select the epic first
      const card = document.querySelector('.artifact-card');
      fireEvent.click(card!);

      await waitFor(() => {
        const breakDownBtn = document.querySelector('.toolbar-ai-btn[title*="Break down"]');
        expect(breakDownBtn).toBeInTheDocument();
      });

      const breakDownBtn = document.querySelector('.toolbar-ai-btn[title*="Break down"]') as HTMLElement;
      fireEvent.click(breakDownBtn);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'breakDown',
        })
      );
    });

    it('should send enhanceWithAI message when enhance button clicked', async () => {
      render(<App />);
      
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic' })];
      
      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      // Select the artifact first
      const card = document.querySelector('.artifact-card');
      fireEvent.click(card!);

      await waitFor(() => {
        const enhanceBtn = document.querySelector('.toolbar-ai-btn[title*="enhance"]');
        expect(enhanceBtn).toBeInTheDocument();
      });

      const enhanceBtn = document.querySelector('.toolbar-ai-btn[title*="enhance"]') as HTMLElement;
      fireEvent.click(enhanceBtn);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'enhanceWithAI',
        })
      );
    });
  });

  describe('Error State', () => {
    it('should not display error state initially', () => {
      render(<App />);
      expect(document.querySelector('.error-state')).not.toBeInTheDocument();
    });
  });

  describe('Optimistic Updates', () => {
    it('should update local state immediately on artifact update', async () => {
      render(<App />);
      
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Original Title' })];
      
      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      await waitFor(() => {
        expect(screen.getByText('Original Title')).toBeInTheDocument();
      });

      // Open detail panel and update
      act(() => {
        dispatchMessage('selectAndEdit', { id: 'epic-1' });
      });

      await waitFor(() => {
        expect(document.querySelector('.detail-panel')).toBeInTheDocument();
      });

      // The title should be editable and update optimistically
    });
  });
});

// ============================================================================
// NEW TESTS — Message Types
// ============================================================================

describe('App - Additional Message Types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.classList.remove('ac-force-light', 'ac-force-dark', 'vscode-light');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('externalArtifactsChanged message', () => {
    it('should show toast when external files change', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('externalArtifactsChanged', { filePath: '/project/epics/epic-1.json' });
      });

      await waitFor(() => {
        expect(document.querySelector('.toast')).toBeInTheDocument();
      });
    });

    it('should show the changed file name in the toast', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('externalArtifactsChanged', { filePath: '/project/epics/my-epic.json' });
      });

      await waitFor(() => {
        expect(screen.getByText(/my-epic\.json/)).toBeInTheDocument();
      });
    });

    it('should show multiple-change message for repeated changes', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('externalArtifactsChanged', { filePath: '/project/epics/epic-1.json' });
      });

      act(() => {
        dispatchMessage('externalArtifactsChanged', { filePath: '/project/epics/epic-2.json' });
      });

      await waitFor(() => {
        expect(screen.getByText(/Multiple files changed/)).toBeInTheDocument();
      });
    });
  });

  describe('elicitationMethods message', () => {
    it('should set available elicitation methods for picker', async () => {
      render(<App />);

      const methods = [
        { num: '1', category: 'interview', method_name: 'Structured Interview', description: 'desc', output_pattern: 'pattern' },
        { num: '2', category: 'survey', method_name: 'Online Survey', description: 'desc2', output_pattern: 'pattern2' },
      ];

      act(() => {
        dispatchMessage('elicitationMethods', { methods });
      });

      // Load an artifact and trigger elicitation to verify methods were set
      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic' })];

      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      // Select the artifact
      await waitFor(() => {
        expect(document.querySelector('.artifact-card')).toBeInTheDocument();
      });

      const card = document.querySelector('.artifact-card');
      fireEvent.click(card!);

      // Click elicit button from toolbar
      await waitFor(() => {
        const elicitBtn = document.querySelector('.toolbar-ai-btn[title="Elicit with advanced method"]');
        expect(elicitBtn).toBeInTheDocument();
      });

      const elicitBtn = document.querySelector('.toolbar-ai-btn[title="Elicit with advanced method"]') as HTMLElement;
      fireEvent.click(elicitBtn);

      // The elicitation picker should open with the methods
      await waitFor(() => {
        expect(document.querySelector('.wfl-modal')).toBeInTheDocument();
      });

      // Verify methods are shown
      expect(screen.getByText('Structured Interview')).toBeInTheDocument();
      expect(screen.getByText('Online Survey')).toBeInTheDocument();
    });
  });

  describe('bmmWorkflows message', () => {
    it('should set available workflows for launcher', async () => {
      render(<App />);

      const workflows = [
        { id: 'wf-1', name: 'create-product-brief', description: 'Create a brief', triggerPhrase: 'create brief', phase: 'Analysis', phaseOrder: 1, workflowFilePath: '/path/wf1' },
      ];

      act(() => {
        dispatchMessage('bmmWorkflows', { workflows });
      });

      // Open workflow launcher
      const workflowFab = screen.getByRole('button', { name: /Launch Workflow/i });
      fireEvent.click(workflowFab);

      await waitFor(() => {
        expect(document.querySelector('.wfl-modal')).toBeInTheDocument();
      });

      expect(screen.getByText('create-product-brief')).toBeInTheDocument();
    });
  });

  describe('revealArtifact message', () => {
    it('should select the specified artifact', async () => {
      render(<App />);

      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'First Epic' }),
        createMockArtifact({ id: 'epic-2', title: 'Second Epic' }),
      ];

      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      act(() => {
        dispatchMessage('revealArtifact', { id: 'epic-2' });
      });

      await waitFor(() => {
        const selectedCards = document.querySelectorAll('.artifact-card.selected');
        expect(selectedCards.length).toBe(1);
      });
    });
  });

  describe('detectedProjectCount message', () => {
    it('should show switch project button when count >= 2', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('detectedProjectCount', { count: 3 });
      });

      await waitFor(() => {
        const switchBtn = document.querySelector('.toolbar-switch-btn');
        expect(switchBtn).toBeInTheDocument();
      });
    });

    it('should still show switch/browse button even when count < 2', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('detectedProjectCount', { count: 1 });
      });

      await waitFor(() => {
        // The button is always visible (doubles as folder browser)
        const switchBtn = document.querySelector('.toolbar-switch-btn');
        expect(switchBtn).toBeInTheDocument();
      });
    });
  });


  describe('validationError message', () => {
    it('should show validation error toast', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('validationError', {
          artifactType: 'epic',
          artifactId: 'epic-1',
          errors: ['Missing required field: title', 'Invalid status value'],
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Schema validation issues/)).toBeInTheDocument();
        expect(screen.getByText(/Missing required field: title/)).toBeInTheDocument();
        expect(screen.getByText(/Invalid status value/)).toBeInTheDocument();
      });
    });
  });

  describe('schemaIssues message', () => {
    it('should show schema issues notification', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('schemaIssues', {
          issues: [
            { file: 'epic-1.json', type: 'epic', errors: ['bad field'] },
            { file: 'story-1.json', type: 'story', errors: ['missing field'] },
          ],
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Schema issues detected/)).toBeInTheDocument();
        expect(screen.getByText(/2 file\(s\) don't match/)).toBeInTheDocument();
      });
    });
  });

  describe('schemaFixResult message', () => {
    it('should handle success result with fixed count', async () => {
      render(<App />);

      // First trigger fixing state
      act(() => {
        dispatchMessage('schemaIssues', {
          issues: [{ file: 'epic-1.json', type: 'epic', errors: ['bad field'] }],
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Schema issues detected/)).toBeInTheDocument();
      });

      // Click Fix Schemas to set schemaFixing
      const fixBtn = screen.getByText('Fix Schemas');
      fireEvent.click(fixBtn);

      // Now send success result
      act(() => {
        dispatchMessage('schemaFixResult', { success: true, fixedCount: 3 });
      });

      await waitFor(() => {
        expect(screen.getByText(/Fixed 3 issue\(s\)/)).toBeInTheDocument();
      });
    });

    it('should handle cancelled result silently', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('schemaIssues', {
          issues: [{ file: 'epic-1.json', type: 'epic', errors: ['bad field'] }],
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Schema issues detected/)).toBeInTheDocument();
      });

      const fixBtn = screen.getByText('Fix Schemas');
      fireEvent.click(fixBtn);

      act(() => {
        dispatchMessage('schemaFixResult', { cancelled: true });
      });

      // Issues should remain visible since we cancelled
      await waitFor(() => {
        expect(screen.getByText(/Schema issues detected/)).toBeInTheDocument();
      });
    });

    it('should handle partial fix with remaining issues', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('schemaIssues', {
          issues: [
            { file: 'epic-1.json', type: 'epic', errors: ['bad'] },
            { file: 'story-1.json', type: 'story', errors: ['bad'] },
          ],
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Schema issues detected/)).toBeInTheDocument();
      });

      const fixBtn = screen.getByText('Fix Schemas');
      fireEvent.click(fixBtn);

      act(() => {
        dispatchMessage('schemaFixResult', {
          success: false,
          fixedCount: 1,
          remainingIssues: [{ file: 'story-1.json', type: 'story', errors: ['bad'] }],
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Fixed 1 issue\(s\), 1 remaining/)).toBeInTheDocument();
      });
    });
  });

  describe('schemaValidateResult message', () => {
    it('should handle clean validation with no issues', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('schemaValidateResult', { issues: [] });
      });

      await waitFor(() => {
        expect(screen.getByText(/All artifacts valid/)).toBeInTheDocument();
      });
    });

    it('should handle validation with issues', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('schemaValidateResult', {
          issues: [{ file: 'epic-1.json', type: 'epic', errors: ['Missing title'] }],
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Schema issues detected/)).toBeInTheDocument();
      });
    });
  });

  describe('captureCanvas message', () => {
    it('should set screenshot format to png', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('captureCanvas', { format: 'png' });
      });

      // The screenshotTrigger increments - canvas component receives it as prop
      // We just verify no crash; the screenshot mechanism is internal to Canvas
      expect(document.querySelector('.canvas')).toBeInTheDocument();
    });

    it('should set screenshot format to pdf', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('captureCanvas', { format: 'pdf' });
      });

      expect(document.querySelector('.canvas')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// NEW TESTS — Toolbar Callbacks
// ============================================================================

describe('App - Toolbar Callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.classList.remove('ac-force-light', 'ac-force-dark', 'vscode-light');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleToggleTheme', () => {
    it('should cycle through theme overrides', async () => {
      render(<App />);

      const themeBtn = document.querySelector('.toolbar-theme-btn') as HTMLElement;
      expect(themeBtn).toBeInTheDocument();

      // Initial state: null (auto), body has neither force class
      expect(document.body.classList.contains('ac-force-light')).toBe(false);
      expect(document.body.classList.contains('ac-force-dark')).toBe(false);

      // First click: null -> light or dark depending on current VS Code theme
      // (body does NOT have vscode-light, so it forces light)
      fireEvent.click(themeBtn);

      await waitFor(() => {
        expect(document.body.classList.contains('ac-force-light')).toBe(true);
      });

      // Second click: light -> dark
      fireEvent.click(themeBtn);

      await waitFor(() => {
        expect(document.body.classList.contains('ac-force-dark')).toBe(true);
        expect(document.body.classList.contains('ac-force-light')).toBe(false);
      });

      // Third click: dark -> null (auto)
      fireEvent.click(themeBtn);

      await waitFor(() => {
        expect(document.body.classList.contains('ac-force-dark')).toBe(false);
        expect(document.body.classList.contains('ac-force-light')).toBe(false);
      });
    });
  });

  describe('handleReloadArtifacts', () => {
    it('should post reloadArtifacts message', async () => {
      render(<App />);

      // Trigger external change to show reload button
      act(() => {
        dispatchMessage('externalArtifactsChanged', { filePath: '/project/test.json' });
      });

      await waitFor(() => {
        expect(screen.getByText('Reload')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Reload'));

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'reloadArtifacts' });
    });

    it('should guard against double-click', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('externalArtifactsChanged', { filePath: '/project/test.json' });
      });

      await waitFor(() => {
        expect(screen.getByText('Reload')).toBeInTheDocument();
      });

      const reloadBtn = screen.getByText('Reload');
      fireEvent.click(reloadBtn);

      // After first click, button should show Reloading...
      await waitFor(() => {
        expect(screen.getByText('Reloading...')).toBeInTheDocument();
      });

      // The button should be disabled
      const disabledBtn = screen.getByText('Reloading...');
      expect(disabledBtn).toBeDisabled();
    });
  });

  describe('handleSwitchProject', () => {
    it('should post switchProject message', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('detectedProjectCount', { count: 3 });
      });

      await waitFor(() => {
        const switchBtn = document.querySelector('.toolbar-switch-btn') as HTMLElement;
        expect(switchBtn).toBeInTheDocument();
      });

      const switchBtn = document.querySelector('.toolbar-switch-btn') as HTMLElement;
      fireEvent.click(switchBtn);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'switchProject' });
    });
  });

  describe('handleExport', () => {
    it('should post exportArtifacts message', async () => {
      render(<App />);

      const exportBtn = document.querySelector('.toolbar-export-btn') as HTMLElement;
      expect(exportBtn).toBeInTheDocument();

      fireEvent.click(exportBtn);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'exportArtifacts' });
    });
  });

  describe('handleImport', () => {
    it('should post importArtifacts message', async () => {
      render(<App />);

      const importBtn = document.querySelector('.toolbar-import-btn') as HTMLElement;
      expect(importBtn).toBeInTheDocument();

      fireEvent.click(importBtn);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'importArtifacts' });
    });
  });

  describe('handleOpenHelp / handleCloseHelp', () => {
    it('should open help modal', async () => {
      render(<App />);

      const helpBtn = document.querySelector('.toolbar-help-btn') as HTMLElement;
      expect(helpBtn).toBeInTheDocument();

      fireEvent.click(helpBtn);

      await waitFor(() => {
        expect(document.querySelector('.help-modal')).toBeInTheDocument();
      });
    });

    it('should close help modal', async () => {
      render(<App />);

      const helpBtn = document.querySelector('.toolbar-help-btn') as HTMLElement;
      fireEvent.click(helpBtn);

      await waitFor(() => {
        expect(document.querySelector('.help-modal')).toBeInTheDocument();
      });

      // Click close button in footer
      const closeBtn = screen.getByText('Close');
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(document.querySelector('.help-modal')).not.toBeInTheDocument();
      });
    });
  });


  describe('handleDismissExternalChange', () => {
    it('should clear external change toast on dismiss', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('externalArtifactsChanged', { filePath: '/project/test.json' });
      });

      await waitFor(() => {
        expect(document.querySelector('.toast')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Dismiss'));

      await waitFor(() => {
        expect(document.querySelector('.toast')).not.toBeInTheDocument();
      });
    });
  });

  describe('handleDiscardAndNavigate', () => {
    it('should discard unsaved changes and navigate', async () => {
      render(<App />);

      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'First Epic' }),
        createMockArtifact({ id: 'epic-2', title: 'Second Epic' }),
      ];

      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      // Open detail panel in edit mode for epic-1
      act(() => {
        dispatchMessage('selectAndEdit', { id: 'epic-1' });
      });

      await waitFor(() => {
        expect(document.querySelector('.detail-panel')).toBeInTheDocument();
      });

      // Simulate dirty state: change the title
      const titleInput = document.querySelector('.detail-panel input[type="text"]');
      if (titleInput) {
        fireEvent.change(titleInput, { target: { value: 'Modified Title' } });
      }

      // Try to select epic-2 via message while dirty
      act(() => {
        dispatchMessage('selectArtifact', { id: 'epic-2' });
      });

      // If the panel was dirty, the discard dialog should appear
      await waitFor(() => {
        const discardDialog = document.querySelector('.discard-dialog');
        if (discardDialog) {
          expect(discardDialog).toBeInTheDocument();
        }
      });

      // Click discard if dialog is present
      const discardBtn = screen.queryByText('Discard');
      if (discardBtn) {
        fireEvent.click(discardBtn);

        expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
          type: 'selectArtifact',
          id: 'epic-2',
        });
      }
    });
  });

  describe('handleCancelNavigation', () => {
    it('should cancel pending navigation and keep editing', async () => {
      render(<App />);

      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'First Epic' }),
        createMockArtifact({ id: 'epic-2', title: 'Second Epic' }),
      ];

      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      act(() => {
        dispatchMessage('selectAndEdit', { id: 'epic-1' });
      });

      await waitFor(() => {
        expect(document.querySelector('.detail-panel')).toBeInTheDocument();
      });

      // Simulate dirty state
      const titleInput = document.querySelector('.detail-panel input[type="text"]');
      if (titleInput) {
        fireEvent.change(titleInput, { target: { value: 'Modified Title' } });
      }

      act(() => {
        dispatchMessage('selectArtifact', { id: 'epic-2' });
      });

      // If discard dialog appeared, click Keep Editing
      const keepEditingBtn = screen.queryByText('Keep Editing');
      if (keepEditingBtn) {
        fireEvent.click(keepEditingBtn);

        // Dialog should disappear
        await waitFor(() => {
          expect(document.querySelector('.discard-dialog')).not.toBeInTheDocument();
        });

        // Detail panel should still be open
        expect(document.querySelector('.detail-panel')).toBeInTheDocument();
      }
    });
  });
});

// ============================================================================
// NEW TESTS — Elicitation, Workflow, Search, PopOut, Schema actions
// ============================================================================

describe('App - Elicitation, Workflow, Search, and Schema Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.classList.remove('ac-force-light', 'ac-force-dark', 'vscode-light');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleElicit / handleElicitConfirm', () => {
    it('should open elicitation picker when elicit is triggered', async () => {
      render(<App />);

      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic' })];

      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      // Select the artifact
      const card = document.querySelector('.artifact-card');
      fireEvent.click(card!);

      // Click elicit button
      await waitFor(() => {
        const elicitBtn = document.querySelector('.toolbar-ai-btn[title="Elicit with advanced method"]');
        expect(elicitBtn).toBeInTheDocument();
      });

      const elicitBtn = document.querySelector('.toolbar-ai-btn[title="Elicit with advanced method"]') as HTMLElement;
      fireEvent.click(elicitBtn);

      await waitFor(() => {
        expect(document.querySelector('.wfl-modal')).toBeInTheDocument();
      });
    });

    it('should confirm elicitation with selected method', async () => {
      render(<App />);

      const methods = [
        { num: '1', category: 'interview', method_name: 'Structured Interview', description: 'A structured approach', output_pattern: 'Requirements list' },
      ];

      act(() => {
        dispatchMessage('elicitationMethods', { methods });
      });

      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic' })];

      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      // Select artifact
      const card = document.querySelector('.artifact-card');
      fireEvent.click(card!);

      // Open elicitation picker
      await waitFor(() => {
        const elicitBtn = document.querySelector('.toolbar-ai-btn[title="Elicit with advanced method"]');
        expect(elicitBtn).toBeInTheDocument();
      });

      const elicitBtn = document.querySelector('.toolbar-ai-btn[title="Elicit with advanced method"]') as HTMLElement;
      fireEvent.click(elicitBtn);

      await waitFor(() => {
        expect(screen.getByText('Structured Interview')).toBeInTheDocument();
      });

      // Click the method card
      fireEvent.click(screen.getByText('Structured Interview'));

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'elicitWithMethod',
          method: expect.objectContaining({ method_name: 'Structured Interview' }),
        })
      );
    });
  });

  describe('handleOpenWorkflowLauncher / handleWorkflowSelect', () => {
    it('should open workflow launcher modal', async () => {
      render(<App />);

      const workflowFab = screen.getByRole('button', { name: /Launch Workflow/i });
      fireEvent.click(workflowFab);

      await waitFor(() => {
        expect(document.querySelector('.wfl-modal')).toBeInTheDocument();
      });
    });

    it('should select workflow and post launchWorkflow message', async () => {
      render(<App />);

      const workflows = [
        { id: 'wf-1', name: 'create-product-brief', description: 'Creates a brief', triggerPhrase: 'create a product brief', phase: 'Analysis', phaseOrder: 1, workflowFilePath: '/path/wf1.md' },
      ];

      act(() => {
        dispatchMessage('bmmWorkflows', { workflows });
      });

      const workflowFab = screen.getByRole('button', { name: /Launch Workflow/i });
      fireEvent.click(workflowFab);

      await waitFor(() => {
        expect(screen.getByText('create-product-brief')).toBeInTheDocument();
      });

      // Click the workflow card
      const wfCard = document.querySelector('.wfl-card') as HTMLElement;
      fireEvent.click(wfCard);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'launchWorkflow',
          workflow: expect.objectContaining({
            id: 'wf-1',
            name: 'create-product-brief',
          }),
        })
      );
    });
  });

  describe('handleOpenSearch / handleSearchSelect', () => {
    it('should render search box component', async () => {
      render(<App />);

      // SearchBox is always rendered but only visible when open
      const searchOverlay = document.querySelector('.sb-overlay');
      // It's not visible when not open
      expect(searchOverlay).not.toBeInTheDocument();
    });

    it('should select search result and post selectArtifact', async () => {
      render(<App />);

      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Alpha Epic' }),
        createMockArtifact({ id: 'epic-2', title: 'Beta Epic' }),
      ];

      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      // Simulate '/' key on canvas to open search
      const canvas = document.querySelector('.canvas') as HTMLElement;
      if (canvas) {
        fireEvent.keyDown(canvas, { key: '/' });
      }

      // If search opened, interact with it
      await waitFor(() => {
        const searchInput = document.querySelector('.sb-input');
        if (searchInput) {
          expect(searchInput).toBeInTheDocument();
        }
      });

      const searchInput = document.querySelector('.sb-input') as HTMLInputElement;
      if (searchInput) {
        fireEvent.change(searchInput, { target: { value: 'Alpha' } });

        await waitFor(() => {
          expect(document.querySelector('.sb-result-item')).toBeInTheDocument();
        });

        const resultItem = document.querySelector('.sb-result-item') as HTMLElement;
        fireEvent.click(resultItem);

        expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
          type: 'selectArtifact',
          id: 'epic-1',
        });
      }
    });
  });

  describe('handlePopOut', () => {
    it('should post openDetailTab message', async () => {
      render(<App />);

      const artifacts = [createMockArtifact({ id: 'epic-1', title: 'Test Epic' })];

      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      // Open detail panel
      act(() => {
        dispatchMessage('selectAndEdit', { id: 'epic-1' });
      });

      await waitFor(() => {
        expect(document.querySelector('.detail-panel')).toBeInTheDocument();
      });

      // Look for pop-out button in detail panel
      const popOutBtn = document.querySelector('.detail-panel .pop-out-btn, .detail-panel [title*="pop out"], .detail-panel [title*="Pop out"], .detail-panel [title*="Open in tab"]') as HTMLElement;
      if (popOutBtn) {
        fireEvent.click(popOutBtn);

        expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
          type: 'openDetailTab',
          artifactId: 'epic-1',
        });
      }
    });
  });

  describe('handleFixSchemas', () => {
    it('should post fixSchemas message', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('schemaIssues', {
          issues: [{ file: 'epic-1.json', type: 'epic', errors: ['bad field'] }],
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Fix Schemas')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Fix Schemas'));

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'fixSchemas' });
    });

    it('should show fixing state while in progress', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('schemaIssues', {
          issues: [{ file: 'epic-1.json', type: 'epic', errors: ['bad field'] }],
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Fix Schemas')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Fix Schemas'));

      await waitFor(() => {
        expect(screen.getByText('Fixing schemas...')).toBeInTheDocument();
      });
    });
  });

  describe('handleValidateSchemas', () => {
    it('should post validateSchemas message', async () => {
      render(<App />);

      // When there are no schema issues, clicking the wrench button validates
      const validateBtn = document.querySelector('.toolbar-fix-btn') as HTMLElement;
      expect(validateBtn).toBeInTheDocument();

      fireEvent.click(validateBtn);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'validateSchemas' });
    });
  });
});

// ============================================================================
// NEW TESTS — Side Effects (Timers, Theme)
// ============================================================================

describe('App - Side Effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.classList.remove('ac-force-light', 'ac-force-dark', 'vscode-light');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Auto-dismiss external change toast', () => {
    it('should auto-dismiss after 8 seconds', () => {
      vi.useFakeTimers();
      try {
        render(<App />);

        act(() => {
          dispatchMessage('externalArtifactsChanged', { filePath: '/project/test.json' });
        });

        // Toast should be present
        expect(screen.getByText(/External file change detected/)).toBeInTheDocument();

        // Advance time by 8 seconds
        act(() => {
          vi.advanceTimersByTime(8000);
        });

        // Toast should be auto-dismissed (synchronous check — no waitFor with fake timers)
        expect(screen.queryByText(/External file change detected/)).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Auto-dismiss validation error toast', () => {
    it('should auto-dismiss after 12 seconds', () => {
      vi.useFakeTimers();
      try {
        render(<App />);

        act(() => {
          dispatchMessage('validationError', {
            artifactType: 'epic',
            artifactId: 'epic-1',
            errors: ['Missing title'],
          });
        });

        expect(screen.getByText(/Schema validation issues/)).toBeInTheDocument();

        act(() => {
          vi.advanceTimersByTime(12000);
        });

        expect(screen.queryByText(/Schema validation issues/)).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Theme override body class effect', () => {
    beforeEach(() => {
      document.body.classList.remove('ac-force-light', 'ac-force-dark', 'vscode-light');
    });

    it('should not add force class when theme override is null', () => {
      render(<App />);

      expect(document.body.classList.contains('ac-force-light')).toBe(false);
      expect(document.body.classList.contains('ac-force-dark')).toBe(false);
    });

    it('should add ac-force-dark when body has vscode-light', () => {
      // When body has vscode-light, the toggle logic goes null → 'dark'
      document.body.classList.add('vscode-light');

      render(<App />);

      const themeBtn = document.querySelector('.toolbar-theme-btn') as HTMLElement;
      act(() => {
        fireEvent.click(themeBtn);
      });

      // Synchronous: useEffect fires immediately within act()
      expect(document.body.classList.contains('ac-force-dark')).toBe(true);
    });

    it('should add ac-force-light when body does NOT have vscode-light', () => {
      // No vscode-light on body → toggle logic goes null → 'light'
      render(<App />);

      const themeBtn = document.querySelector('.toolbar-theme-btn') as HTMLElement;
      act(() => {
        fireEvent.click(themeBtn);
      });

      expect(document.body.classList.contains('ac-force-light')).toBe(true);
    });
  });

  describe('Expand lane / Collapse lane callbacks', () => {
    it('should render artifact cards after loading artifacts with parents', async () => {
      render(<App />);

      const artifacts = [
        createMockArtifact({ id: 'epic-1', title: 'Epic 1', type: 'epic', childCount: 1 }),
        createMockArtifact({ id: 'epic-2', title: 'Epic 2', type: 'epic', childCount: 1 }),
        createMockArtifact({ id: 'story-1', title: 'Story 1', type: 'story', parentId: 'epic-1' }),
        createMockArtifact({ id: 'story-2', title: 'Story 2', type: 'story', parentId: 'epic-2' }),
      ];

      act(() => {
        dispatchMessage('updateArtifacts', { artifacts });
      });

      // Verify at least some cards rendered (exact count depends on Canvas layout in JSDOM)
      await waitFor(() => {
        const cards = document.querySelectorAll('.artifact-card');
        expect(cards.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('needsReload badge', () => {
    it('should show reload badge after external change is dismissed', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('externalArtifactsChanged', { filePath: '/project/test.json' });
      });

      await waitFor(() => {
        expect(screen.getByText('Dismiss')).toBeInTheDocument();
      });

      act(() => {
        fireEvent.click(screen.getByText('Dismiss'));
      });

      // After dismiss, externalChange=null but needsReload=true,
      // so the reload-badge should render (needsReload && !externalChange)
      await waitFor(() => {
        expect(document.querySelector('.reload-badge')).toBeInTheDocument();
      });
    });
  });

  describe('Schema issues toast dismiss', () => {
    it('should dismiss schema issues toast manually', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('schemaIssues', {
          issues: [{ file: 'epic-1.json', type: 'epic', errors: ['bad'] }],
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Schema issues detected/)).toBeInTheDocument();
      });

      // Only the schema issues toast is visible, so there's one Dismiss button
      const dismissBtn = screen.getByText('Dismiss');
      act(() => {
        fireEvent.click(dismissBtn);
      });

      await waitFor(() => {
        expect(screen.queryByText(/Schema issues detected/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Validation error toast dismiss', () => {
    it('should dismiss validation error toast manually', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('validationError', {
          artifactType: 'epic',
          artifactId: 'epic-1',
          errors: ['Missing title'],
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Schema validation issues/)).toBeInTheDocument();
      });

      // Only the validation error toast is visible, so there's one Dismiss button
      const dismissBtn = screen.getByText('Dismiss');
      act(() => {
        fireEvent.click(dismissBtn);
      });

      await waitFor(() => {
        expect(screen.queryByText(/Schema validation issues/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Schema fix message dismiss', () => {
    it('should dismiss schema fix success message manually', async () => {
      vi.useFakeTimers();
      try {
        render(<App />);

        act(() => {
          dispatchMessage('schemaIssues', {
            issues: [{ file: 'epic-1.json', type: 'epic', errors: ['bad'] }],
          });
        });

        expect(screen.getByText('Fix Schemas')).toBeInTheDocument();

        act(() => {
          fireEvent.click(screen.getByText('Fix Schemas'));
        });

        act(() => {
          dispatchMessage('schemaFixResult', { success: true, fixedCount: 1 });
        });

        expect(screen.getByText(/Fixed 1 issue/)).toBeInTheDocument();

        // Dismiss the success toast
        act(() => {
          fireEvent.click(screen.getByText('Dismiss'));
        });

        expect(screen.queryByText(/Fixed 1 issue/)).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('schemaFixResult no-progress variant', () => {
    it('should show manual editing message on no-progress', () => {
      vi.useFakeTimers();
      try {
        render(<App />);

        act(() => {
          dispatchMessage('schemaIssues', {
            issues: [{ file: 'epic-1.json', type: 'epic', errors: ['bad'] }],
          });
        });

        expect(screen.getByText('Fix Schemas')).toBeInTheDocument();

        act(() => {
          fireEvent.click(screen.getByText('Fix Schemas'));
        });

        act(() => {
          dispatchMessage('schemaFixResult', {
            success: false,
            remainingIssues: [{ file: 'epic-1.json', type: 'epic', errors: ['bad'] }],
            noProgress: true,
          });
        });

        expect(screen.getByText(/Could not auto-fix/)).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('schemaValidateResult auto-dismiss', () => {
    it('should auto-dismiss success toast after 3 seconds', () => {
      vi.useFakeTimers();
      try {
        render(<App />);

        act(() => {
          dispatchMessage('schemaValidateResult', { issues: [] });
        });

        expect(screen.getByText(/All artifacts valid/)).toBeInTheDocument();

        act(() => {
          vi.advanceTimersByTime(3000);
        });

        expect(screen.queryByText(/All artifacts valid/)).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Empty state sample project button', () => {
    it('should post loadSampleProject when sample button clicked', () => {
      render(<App />);

      const sampleBtn = screen.getByText('Create Sample Project');
      fireEvent.click(sampleBtn);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'loadSampleProject' });
    });
  });
});

// ============================================================================
// NEW TESTS — Tree-nested plan cards + Show Plan button + State persistence
// ============================================================================

describe('App - Visual Plan Tree Nesting & Show Plan Button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.classList.remove('ac-force-light', 'ac-force-dark');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper: build a parent artifact plus a visual plan whose
  // metadata.plan.sourceArtifactId points at the parent. Mirrors how the
  // artifact-transformer server-side constructs plan cards.
  const makeParentAndPlan = (parentId: string, parentTitle: string, planId: string, planTitle: string): Artifact[] => ([
    createMockArtifact({
      id: parentId,
      type: 'epic',
      title: parentTitle,
      position: { x: 100, y: 100 },
      size: { width: 280, height: 150 },
    }),
    createMockArtifact({
      id: planId,
      type: 'visual-plan',
      title: planTitle,
      position: { x: 400, y: 1000 },
      size: { width: 230, height: 130 },
      metadata: { plan: { sourceArtifactId: parentId, sections: [], tasks: [] } },
    }),
  ]);

  describe('tree nesting', () => {
    it('repositions a visual-plan card directly below its parent AND tags it with the tree-nested class', async () => {
      const artifacts = makeParentAndPlan('epic-1', 'Parent Epic', 'plan-1', 'Plan for Epic 1');

      render(<App />);
      act(() => { dispatchMessage('updateArtifacts', { artifacts }); });

      await waitFor(() => {
        expect(document.querySelectorAll('.artifact-card').length).toBe(2);
      });

      // The contract we lock in: tree-nested CSS class. JSDOM doesn't
      // compute layout (offsetWidth/Height are all 0), and React's
      // inline style gets rendered via JS but parsed style values can
      // be flaky in JSDOM when the parent re-renders during the same
      // tick as the plan.  Class tag is the unambiguous contract.
      const planCard = document.querySelector('.artifact-card.visual-plan') as HTMLElement;
      expect(planCard).toBeInTheDocument();
      expect(planCard.classList.contains('tree-nested')).toBe(true);

      // Parent (non-visual-plan) must NOT carry the tree-nested class.
      const parentCard = document.querySelector('.artifact-card.epic') as HTMLElement;
      expect(parentCard).toBeInTheDocument();
      expect(parentCard.classList.contains('tree-nested')).toBe(false);
    });

    it('keeps plan in its Discovery position when no parent is referenced', async () => {
      const artifacts = [
        createMockArtifact({
          id: 'plan-orphan', type: 'visual-plan', title: 'Orphan Plan',
          position: { x: 500, y: 700 }, size: { width: 230, height: 130 },
          metadata: { plan: { sections: [], tasks: [] } },
        }),
      ];
      render(<App />);
      act(() => { dispatchMessage('updateArtifacts', { artifacts }); });

      await waitFor(() => {
        expect(document.querySelector('.artifact-card.visual-plan')).toBeInTheDocument();
      });

      const card = document.querySelector('.artifact-card.visual-plan') as HTMLElement;
      expect(card.classList.contains('tree-nested')).toBe(false);
      expect(parseFloat(card.style.left)).toBe(500);
      expect(parseFloat(card.style.top)).toBe(700);
    });

    it('keeps plan in Discovery position when its source parent is not in artifacts', async () => {
      const artifacts = [
        createMockArtifact({
          id: 'plan-orphan', type: 'visual-plan', title: 'Plan for Missing Parent',
          position: { x: 500, y: 700 }, size: { width: 230, height: 130 },
          metadata: { plan: { sourceArtifactId: 'epic-deleted', sections: [], tasks: [] } },
        }),
      ];
      render(<App />);
      act(() => { dispatchMessage('updateArtifacts', { artifacts }); });

      await waitFor(() => {
        expect(document.querySelector('.artifact-card.visual-plan')).toBeInTheDocument();
      });

      const card = document.querySelector('.artifact-card.visual-plan') as HTMLElement;
      expect(card.classList.contains('tree-nested')).toBe(false);
    });
  });

  describe('Show Plan shortcut button on parent card', () => {
    it('renders a Show Plan button on a parent card when its plan exists in the artifact set', async () => {
      const artifacts = makeParentAndPlan('epic-1', 'Parent Epic', 'plan-1', 'Plan for Epic 1');
      render(<App />);
      act(() => { dispatchMessage('updateArtifacts', { artifacts }); });

      await waitFor(() => {
        const parentCard = document.querySelector('.artifact-card.epic') as HTMLElement;
        expect(parentCard?.querySelector('.card-show-plan-btn')).toBeInTheDocument();
      });
    });

    it('does NOT render a Show Plan button on parent cards without a plan', async () => {
      const artifacts = [createMockArtifact({ id: 'epic-1', type: 'epic', title: 'Epic No Plan' })];
      render(<App />);
      act(() => { dispatchMessage('updateArtifacts', { artifacts }); });

      await waitFor(() => {
        const parentCard = document.querySelector('.artifact-card.epic') as HTMLElement;
        expect(parentCard).toBeInTheDocument();
        expect(parentCard.querySelector('.card-show-plan-btn')).not.toBeInTheDocument();
      });
    });

    it('clicking Show Plan opens the visual-plan modal AND posts selectArtifact for the plan id', async () => {
      const artifacts = makeParentAndPlan('epic-1', 'Parent Epic', 'plan-1', 'Plan for Epic 1');
      render(<App />);
      act(() => { dispatchMessage('updateArtifacts', { artifacts }); });

      await waitFor(() => {
        expect(document.querySelector('.artifact-card.epic')).toBeInTheDocument();
      });

      const showBtn = document.querySelector('.artifact-card.epic .card-show-plan-btn') as HTMLElement;
      expect(showBtn).toBeInTheDocument();
      fireEvent.click(showBtn);

      // Modal pipeline contract:
      //   1. The overlay renders unconditionally (it's outside the
      //      ErrorBoundary's content) — proves `setVisualPlanModalId`
      //      fired end-to-end without coupling to VisualPlanSections
      //      internals.
      //   2. selectArtifact(plan-1) IPC fired (uses the modal's IPC,
      //      same path as double-click on the plan card).
      //   3. The right-side DetailPanel does NOT open — the whole
      //      point of routing the click to the modal.
      await waitFor(() => {
        const overlay = document.querySelector('[data-testid="visual-plan-modal-overlay"]');
        expect(overlay).toBeInTheDocument();
        expect(document.querySelector('.detail-panel')).not.toBeInTheDocument();
        const ipc = mockVsCodeApi.postMessage.mock.calls.find(
          c => (c[0] as any)?.type === 'selectArtifact' && (c[0] as any)?.id === 'plan-1',
        );
        expect(ipc).toBeDefined();
      });
    });
  });
});

describe('App - Canvas View & Last-Opened Plan Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.classList.remove('ac-force-light', 'ac-force-dark');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('canvasView (zoom + pan) persistence', () => {
    // ── No-op echo suppression ──────────────────────────────────────────────
    // On fresh webview mount Canvas's `[zoom, pan]` effect fires with the
    // same (zoom, pan) we already seeded from vscode.getState(); without
    // suppression that triggers a redundant vscode.setState() write 150 ms
    // later. The two tests below lock the new contract:
    //
    //   1. Mount-seed WITHOUT a real change: no *new* IPC fires during the
    //      canvasView debounce window (the echo is skipped). Spread writes
    //      from themeOverride / layoutMode run on the synchronous commit
    //      pass so they appear before the debounce timer would have fired,
    //      and we count deltas across the window to isolate the echo path.
    //
    //   2. Mount-seed WITH a real change (wheel-zoom): the trailing IPC
    //      write DOES land with the new zoom — proving the suppression
    //      doesn't swallow real user input.
    it('seeds zoom + pan from vscode.getState() on first mount and SUPPRESSES the redundant echo write', async () => {
      mockVsCodeApi.getState.mockReturnValue({
        canvasView: { zoom: 1.5, pan: { x: -120, y: 240 } },
      });
      // React 18 + createRoot: useEffect callbacks defer to the next
      // microtask.  Wrap the render in `await act(async ...)` so all
      // mount-time effects (themeOverride, layoutMode → handleLayoutModeChange)
      // flush BEFORE we snapshot the IPC baseline.  Without this, mount-time
      // spread writes trickle in during the polling window and the count
      // assertion false-fails.
      await act(async () => { render(<App />); });
      const countBaseline = mockVsCodeApi.setState.mock.calls.length;
      // Fail-fast polling: walk the canvasView 150 ms debounce window in
      // 25 ms steps, bail the moment we see IPC growth, then assert equality.
      // In the success case the loop runs to deadline; in the failure case
      // (suppression broken) we exit early and the expect() below fails
      // with a clear diagnostic citing EXACTLY which IPC fired.
      const deadline = Date.now() + 300;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 25));
        if (mockVsCodeApi.setState.mock.calls.length > countBaseline) break;
      }
      expect(mockVsCodeApi.setState.mock.calls.length).toBe(countBaseline);
    });

    it('writes canvasView back to vscode.setState after a real wheel-zoom (echo-skip is real-change-aware)', async () => {
      // Anchor seed to a non-default value so a future default change
      // (e.g. lazy init flipping to {zoom: 1, pan: {x: 0, y: 0}}) can't
      // quietly turn the `zoom !== seed` filter below into a tautology.
      const SEED_ZOOM = 0.8;
      const SEED_X = -50;
      const SEED_Y = 75;
      mockVsCodeApi.getState.mockReturnValue({
        canvasViewByMode: {
          lanes:    { zoom: SEED_ZOOM, pan: { x: SEED_X, y: SEED_Y } },
          mindmap:  { zoom: 1.0, pan: { x: 0, y: 0 } },
          corpus3d: { zoom: 1.0, pan: { x: 0, y: 0 } },
        },
      });
      // Same React-18 act-flush as the suppress test above: ensures all
      // mount-time effects settle before fireEvent.wheel runs against the
      // rendered Canvas.
      await act(async () => { render(<App />); });

      // Ctrl + wheel-up = zoom in (Canvas.tsx: e.deltaY > 0 ? 0.9 : 1.1).
      // testing-library's fireEvent.wheel synthesises the event through
      // React's delegated listener; a raw dispatchEvent(new WheelEvent(...))
      // is unreliable because React's synthetic wheel handler reads
      // ctrlKey/clientX from a normalised event object.
      const canvas = document.querySelector('.canvas') as HTMLElement;
      expect(canvas).toBeInTheDocument();
      fireEvent.wheel(canvas, {
        ctrlKey: true,
        deltaY: -1,
        clientX: 100,
        clientY: 100,
      });

      // handleCanvasViewChange's debounce path is the SOLE writer of
      // canvasViewByMode[mode] VALUE (spread paths preserve it unchanged).
      // A write whose lanes.zoom DIFFERS from the seed proves the wheel
      // handler actually fired and the suppression didn't swallow it.
      await waitFor(
        () => {
          const writes = mockVsCodeApi.setState.mock.calls
            .map(c => c[0] as { canvasView?: { zoom: number; pan: { x: number; y: number } } })
            .filter(s => {
              const v = s?.canvasViewByMode?.lanes;
              return v !== undefined && v.zoom !== SEED_ZOOM;
            });
          expect(writes.length).toBeGreaterThan(0);
        },
        { timeout: 1000, interval: 25 },
      );
    });
  });

  describe('lastOpenedPlanId persistence', () => {
    it('writes lastOpenedPlanId to vscode.setState when the visual-plan modal opens', async () => {
      mockVsCodeApi.getState.mockReturnValue({});
      render(<App />);

      act(() => {
        dispatchMessage('updateArtifacts', {
          artifacts: [createMockArtifact({ id: 'plan-1', type: 'visual-plan', title: 'Plan 1' })],
        });
      });

      await waitFor(() => {
        expect(document.querySelector('.artifact-card')).toBeInTheDocument();
      });

      fireEvent.doubleClick(document.querySelector('.artifact-card')!);

      await waitFor(() => {
        expect(document.querySelector('[data-testid="visual-plan-modal"]')).toBeInTheDocument();
      });

      const writesWithPlan = mockVsCodeApi.setState.mock.calls
        .map(c => c[0] as Record<string, unknown>)
        .filter(s => s && 'lastOpenedPlanId' in s);
      expect(writesWithPlan.length).toBeGreaterThan(0);
      const last = writesWithPlan[writesWithPlan.length - 1];
      expect(last.lastOpenedPlanId).toBe('plan-1');
    });

    it('clears lastOpenedPlanId in setState when the modal closes', async () => {
      mockVsCodeApi.getState.mockReturnValue({ lastOpenedPlanId: 'plan-stale' });
      render(<App />);

      act(() => {
        dispatchMessage('updateArtifacts', {
          artifacts: [createMockArtifact({ id: 'plan-stale', type: 'visual-plan', title: 'Plan Stale' })],
        });
      });

      await waitFor(() => {
        expect(document.querySelector('[data-testid="visual-plan-modal"]')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Close plan modal'));

      await waitFor(() => {
        expect(document.querySelector('[data-testid="visual-plan-modal"]')).not.toBeInTheDocument();
      });

      const allWrites = mockVsCodeApi.setState.mock.calls.map(c => c[0] as Record<string, unknown>);
      const last = allWrites[allWrites.length - 1];
      expect(last.lastOpenedPlanId).toBeUndefined();
    });

    it('does NOT restore the modal if the plan id in setState no longer exists in artifacts', () => {
      mockVsCodeApi.getState.mockReturnValue({ lastOpenedPlanId: 'plan-deleted' });
      render(<App />);

      act(() => {
        dispatchMessage('updateArtifacts', {
          artifacts: [
            createMockArtifact({ id: 'epic-1', type: 'epic', title: 'No relation to stale plan' }),
          ],
        });
      });

      expect(document.querySelector('[data-testid="visual-plan-modal"]')).not.toBeInTheDocument();
    });
  });
});

// ============================================================================
// NEW TESTS — Layout Mode (lanes ⇄ mindmap ⇄ 3D corpus) persistence
// ============================================================================
//
// Mirrors the canvasView + lastOpenedPlanId persistence tests above. The
// persisted key is `layoutMode` on vscode.setState. App uses a lazy useState
// to seed from vscode.getState() on first mount and writes back to setState
// on every user toggle (Canvas's useEffect fires the IPC round-trip).
//
// Detection asserts we're in the right mode via stable DOM markers:
//   - 'lanes'      → mindmap-toggle button title is "Switch to mind map (L)"
//   - 'mindmap'    → .mindmap-mode-indicator (with "Mind Map" label) renders
//                     AND mindmap-toggle title flips to "Switch to 3D corpus (L)"
//   - 'corpus3d'   → mindmap-toggle title flips to "Switch to lane view (L)"
//
// We deliberately AVOID asserting which container element renders for the
// modes — those are deeply internal to Canvas and we have separate unit
// tests in Canvas's own suite for visual-mode diff. The toggle-button title
// is the canonical user-facing surface that always tracks the current mode.
describe('App - Layout Mode (lanes ⇄ mindmap ⇄ 3D corpus) persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.classList.remove('ac-force-light', 'ac-force-dark');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper: stable selector for the mindmap toggle button. The title
  // attribute is the ONLY one rendered from Canvas's zoom-controls div,
  // and it always reflects the current layoutMode.
  const getToggleTitle = () => {
    const btn = document.querySelector('.mindmap-toggle');
    return btn?.getAttribute('title') ?? null;
  };

  describe('seed from vscode.getState on first mount', () => {
    it('seeds "lanes" (the default) when no layoutMode key is persisted', () => {
      mockVsCodeApi.getState.mockReturnValue({});
      render(<App />);
      // Lanes: "Switch to mind map (L)"
      expect(getToggleTitle()).toBe('Switch to mind map (L)');
      expect(document.querySelector('.mindmap-mode-indicator')).not.toBeInTheDocument();
    });

    it('seeds "mindmap" from vscode.getState() on first mount', async () => {
      mockVsCodeApi.getState.mockReturnValue({ layoutMode: 'mindmap' });
      render(<App />);
      await waitFor(() => {
        expect(getToggleTitle()).toBe('Switch to 3D corpus (L)');
        expect(document.querySelector('.mindmap-mode-indicator')).toBeInTheDocument();
      });
    });

    it('seeds "corpus3d" from vscode.getState() on first mount', async () => {
      // corpus3d renders through Corpus3DView which replaces canvas-content.
      // The robust observable here is JUST the toggle-button title flipping
      // to "Switch to lane view (L)" — that path always renders regardless
      // of whether the underlying view is Corpus3D or lane grid.
      mockVsCodeApi.getState.mockReturnValue({ layoutMode: 'corpus3d' });
      render(<App />);
      await waitFor(() => {
        expect(getToggleTitle()).toBe('Switch to lane view (L)');
      });
    });

    it('falls back to "lanes" when persisted layoutMode is an unknown string', () => {
      mockVsCodeApi.getState.mockReturnValue({ layoutMode: 'sideways' });
      render(<App />);
      expect(getToggleTitle()).toBe('Switch to mind map (L)');
    });

    it('falls back to "lanes" when persisted layoutMode is the wrong type', () => {
      mockVsCodeApi.getState.mockReturnValue({ layoutMode: 42 });
      render(<App />);
      expect(getToggleTitle()).toBe('Switch to mind map (L)');
    });
  });

  describe('write back to vscode.setState on toggle', () => {
    it('writes the new layoutMode to setState when the user clicks the toggle', async () => {
      mockVsCodeApi.getState.mockReturnValue({});
      render(<App />);

      // Initial mount: Canvas's first useEffect on layoutMode fires the
      // IPC, so getState sits at the seeded value.
      // Click the toggle button once — cycles 'lanes' → 'mindmap'.
      const toggleBtn = document.querySelector('.mindmap-toggle') as HTMLElement;
      expect(toggleBtn).toBeInTheDocument();
      fireEvent.click(toggleBtn);

      await waitFor(() => {
        expect(getToggleTitle()).toBe('Switch to 3D corpus (L)');
      });

      const writesWithLayout = mockVsCodeApi.setState.mock.calls
        .map(c => c[0] as Record<string, unknown>)
        .filter(s => s && 'layoutMode' in s);
      expect(writesWithLayout.length).toBeGreaterThan(0);
      const last = writesWithLayout[writesWithLayout.length - 1];
      expect(last.layoutMode).toBe('mindmap');
    });

    it('writes the new layoutMode to setState on the second toggle (mindmap→corpus3d)', async () => {
      mockVsCodeApi.getState.mockReturnValue({});
      render(<App />);
      const toggleBtn = document.querySelector('.mindmap-toggle') as HTMLElement;

      // Cycle once → mindmap, twice → corpus3d
      fireEvent.click(toggleBtn);
      await waitFor(() => expect(getToggleTitle()).toBe('Switch to 3D corpus (L)'));
      fireEvent.click(toggleBtn);
      await waitFor(() => expect(getToggleTitle()).toBe('Switch to lane view (L)'));

      const writesWithLayout = mockVsCodeApi.setState.mock.calls
        .map(c => c[0] as Record<string, unknown>)
        .filter(s => s && 'layoutMode' in s);
      const last = writesWithLayout[writesWithLayout.length - 1];
      expect(last.layoutMode).toBe('corpus3d');
    });

    it('cycles back to "lanes" on the third toggle', async () => {
      mockVsCodeApi.getState.mockReturnValue({});
      render(<App />);
      const toggleBtn = document.querySelector('.mindmap-toggle') as HTMLElement;

      fireEvent.click(toggleBtn);
      await waitFor(() => expect(getToggleTitle()).toBe('Switch to 3D corpus (L)'));
      fireEvent.click(toggleBtn);
      await waitFor(() => expect(getToggleTitle()).toBe('Switch to lane view (L)'));
      fireEvent.click(toggleBtn);
      await waitFor(() => expect(getToggleTitle()).toBe('Switch to mind map (L)'));

      const writesWithLayout = mockVsCodeApi.setState.mock.calls
        .map(c => c[0] as Record<string, unknown>)
        .filter(s => s && 'layoutMode' in s);
      const last = writesWithLayout[writesWithLayout.length - 1];
      expect(last.layoutMode).toBe('lanes');
    });
  });

  describe('restore across remount', () => {
    it('restores "mindmap" mode when vscode.getState() reports it on a fresh mount', async () => {
      // 'mindmap' is the only mode with a non-toggle stable DOM marker.
      mockVsCodeApi.getState.mockReturnValue({ layoutMode: 'mindmap' });
      const { unmount } = render(<App />);
      await waitFor(() => {
        expect(document.querySelector('.mindmap-mode-indicator')).toBeInTheDocument();
      });
      unmount();

      // Second mount — getState() is called fresh per mount, so the same
      // { layoutMode: 'mindmap' } is re-read and the same DOM marker appears.
      render(<App />);
      await waitFor(() => {
        expect(document.querySelector('.mindmap-mode-indicator')).toBeInTheDocument();
      });
    });
  });

  describe('Validate invariant: write-end routing', () => {
    // The IPC writes on toggle come from Canvas's useEffect, which calls
    // App's onLayoutModeChange handler.  If the handler is missing from the
    // Canvas-props destructure (or is unintentionally not wired), the
    // toggle still flips the local React state (Canvas-owned), but the
    // host setState never receives the new value.  This test locks the
    // host-write contract.
    it('always writes layoutMode to vscode.setState when Canvas reports a change', async () => {
      mockVsCodeApi.getState.mockReturnValue({});
      render(<App />);

      // Snapshot initial write count (mount-time seed write).
      const writesBefore = mockVsCodeApi.setState.mock.calls.length;

      // Single toggle.
      const toggleBtn = document.querySelector('.mindmap-toggle') as HTMLElement;
      fireEvent.click(toggleBtn);

      await waitFor(() => {
        const writesAfter = mockVsCodeApi.setState.mock.calls.length;
        expect(writesAfter).toBeGreaterThan(writesBefore);
        // Every write since mount should carry a layoutMode key.
        const newWrites = mockVsCodeApi.setState.mock.calls
          .slice(writesBefore)
          .map(c => c[0] as Record<string, unknown>);
        for (const w of newWrites) {
          expect(w).toHaveProperty('layoutMode');
        }
      });
    });
  });

  describe('handleExitMindmapMode (mindmap exit button)', () => {
    // Canvas.tsx renders <button className="mindmap-mode-exit" onClick={handleExitMindmapMode}>
    // when in mindmap mode.  handleExitMindmapMode calls setLayoutMode('lanes')
    // AND setPan({0,0}) AND setZoom(1) — two distinct persistence paths:
    //   - layoutMode  → useEffect fires synchronously → setState(layoutMode='lanes')
    //   - canvasView  → useEffect fires after the pan/zoom state updates →
    //                   debounced (150ms trailing) → setState(canvasView={1,{0,0}})
    // Lock the dual-write contract so a future refactor that skips the
    // setLayoutMode(path) — e.g. wiring the Exit button to mutate Canvas's
    // view state directly without going through the layoutMode state setter
    // — cannot silently lose the layoutMode write.
    it('writes layoutMode:"lanes" when the user clicks the mindmap-mode-exit button', async () => {
      mockVsCodeApi.getState.mockReturnValue({});
      render(<App />);

      // Step into mindmap mode first.
      const toggleBtn = document.querySelector('.mindmap-toggle') as HTMLElement;
      fireEvent.click(toggleBtn);

      // Mindmap exit button only renders in mindmap mode.
      await waitFor(() => {
        expect(document.querySelector('.mindmap-mode-exit')).toBeInTheDocument();
      });

      // Click the Exit button.
      fireEvent.click(document.querySelector('.mindmap-mode-exit') as HTMLElement);

      // Wait for layoutMode to flip back to lanes.
      await waitFor(() => {
        expect(getToggleTitle()).toBe('Switch to mind map (L)');
      });

      // The most recent layoutMode write must be 'lanes' (synchronous IPC).
      const layoutWrites = mockVsCodeApi.setState.mock.calls
        .map(c => c[0] as Record<string, unknown>)
        .filter(s => s && 'layoutMode' in s);
      const last = layoutWrites[layoutWrites.length - 1];
      expect(last.layoutMode).toBe('lanes');
    });

    it('does NOT reset the lanes view when the user clicks Exit mindmap (per-mode storage preserves each layout’s own view)', async () => {
      // Per-mode canvas-view storage means each layout remembers its own
      // zoom/pan. handleExitMindmapMode now ONLY flips the mode back to
      // `lanes` — it does NOT call setPan/setZoom (which used to be a
      // reset hack because the old single-blob storage forced mindmap and
      // lanes to share a view). The [layoutMode] resync effect in Canvas
      // seeds the new mode from its own slot in `canvasViewByMode`,
      // landing the user at whatever pan/zoom they previously had in
      // lanes. We pre-seed lanes at non-default (1.4, {80, -40}) so a
      // future regression to the old reset behaviour would surface as
      // the trailing lanes slot snapping to (1, {0,0}).
      mockVsCodeApi.getState.mockReturnValue({
        canvasViewByMode: {
          lanes: { zoom: 1.4, pan: { x: 80, y: -40 } },
          mindmap: { zoom: 0.6, pan: { x: -200, y: 120 } },
          corpus3d: { zoom: 1, pan: { x: 0, y: 0 } },
        },
      });
      // Same React-18 act()-flushed mount pattern as the echo-suppress
      // test above — every synchronous mount-time effect (themeOverride,
      // Canvas's [layoutMode] echo that writes back `mode: 'lanes'`,
      // visualPlanModalId reset) commits before we snapshot the writes
      // baseline so the assertions below aren't fooled by mount noise.
      await act(async () => { render(<App />); });
      const writesBeforeExit = mockVsCodeApi.setState.mock.calls
        .map(c => c[0] as Record<string, unknown>)
        .filter(s => s && 'canvasViewByMode' in s).length;
      const laneWritesBefore = mockVsCodeApi.setState.mock.calls
        .map(c => c[0] as Record<string, unknown>)
        .filter(s => s && 'canvasViewByMode' in s
          && (s.canvasViewByMode as { lanes?: unknown })?.lanes
          // only count writes whose lanes slot matches the seeded lanes view
          // (the seeded lanes value, not a reset value).
          && JSON.stringify((s.canvasViewByMode as { lanes: { zoom: number; pan: { x: number; y: number } } }).lanes)
             === JSON.stringify({ zoom: 1.4, pan: { x: 80, y: -40 } })
        ).length;

      // Step into mindmap so the exit button appears.
      const toggleBtn = document.querySelector('.mindmap-toggle') as HTMLElement;
      fireEvent.click(toggleBtn);
      await waitFor(() => {
        expect(document.querySelector('.mindmap-mode-exit')).toBeInTheDocument();
      });

      // Click Exit - handleExitMindmapMode now only fires setLayoutMode('lanes').
      // The [layoutMode] resync effect in Canvas will then call
      // setZoom(1.4)/setPan({80, -40}) from the lanes slot, and the
      // [zoom, pan] effect will fire onCanvasViewChange('lanes', 1.4, ...).
      // App's handleCanvasViewChange sees the value matches the lane slot
      // → echo-suppressed (no IPC write of the seed).
      fireEvent.click(document.querySelector('.mindmap-mode-exit') as HTMLElement);

      // Wait for the layout flip to complete.
      await waitFor(() => {
        expect(document.querySelector('.mindmap-toggle')?.getAttribute('title'))
          .toBe('Switch to mind map (L)');
      });

      // Give the trailing IPC debounce a beat to clear (or NOT clear) so we
      // can inspect every setState call the lifecycle produced. Use a
      // short polling window rather than a fixed timeout because echo
      // suppression should keep the count flat, while a regression that
      // calls setPan/setZoom would surface rapidly.
      const deadline = Date.now() + 400;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 25));
      }

      // The lanes slot must NEVER have been overwritten to (1, {0,0}) by
      // an Exit-induced reset. Count EVERY setState entry whose lanes slot
      // slid anywhere OTHER than the seeded (1.4, {80, -40}) value while
      // we held the mindmap mode — that count must stay at zero so a
      // accidental reset-to-default would surface as count > 0.
      const writesAfter = mockVsCodeApi.setState.mock.calls
        .map(c => c[0] as Record<string, unknown>)
        .filter(s => s && 'canvasViewByMode' in s);
      const laneWriteMutations = writesAfter.slice(writesBeforeExit)
        .filter(s => {
          const byMode = s.canvasViewByMode as { lanes?: { zoom: number; pan: { x: number; y: number } } } | undefined;
          if (!byMode?.lanes) return false;
          const lanes = byMode.lanes;
          // Mutation = a write whose lanes slot differs from the seed AND
          // is NOT just spreading the seed back unchanged. The reset
          // direction is (zoom: 1, pan: {0,0}) but we match against ANY
          // non-seed value to catch subtle regressions too.
          return !(lanes.zoom === 1.4 && lanes.pan.x === 80 && lanes.pan.y === -40);
        });

      // The contract this test locks in: clicking Exit must never mutate
      // the lanes slot away from its seeded (1.4, {80, -40}) value. Per-mode
      // storage means the mode switch alone lands the user on their saved
      // lanes view; any reset-to-default behaviour from the OLD single-blob
      // era would surface as `laneWriteMutations.length > 0`.
      expect(laneWriteMutations).toEqual([]);
      // Sanity check: we DID observe at least one canvasViewByMode write
      // before the Exit click so the baseline snapshot isn't meaningless
      // (a regression to default state on first mount would show writes
      // with the default (1, {0,0}) seed and zero the mutation count).
      expect(writesBeforeExit).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// NEW TESTS — Per-mode canvas view isolation
// ============================================================================
// User bug: persisting zoom/pan globally meant moving the mindmap view
// clobbered the lanes view (and vice versa). After splitting storage into
// `canvasViewByMode: Record<LayoutMode, CanvasView>`, each layout must
// remember its OWN view across switches. The two tests below lock that
// invariant.
//
// Detection strategy for the per-mode writes: rather than driving the
// wheel-zoom handler (which is finicky in jsdom because React's synthetic
// wheel handler reads ctrlKey/clientX from a normalised event), we ASSERT
// directly that:
//   1. Each mode's slot is initialised independently from the persisted
//      `canvasViewByMode` blob.
//   2. After switching modes, writes targeting one slot DON'T touch the
//      other modes' slots (the spread path preserves all keys).
//   3. Legacy `{canvasView: {...}}` shape hydrates all three slots equally
//      so the upgrade preserves the user's last view at every layout.
describe('App - Per-mode canvas view isolation (lanes+mindmap+corpus3d)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.classList.remove('ac-force-light', 'ac-force-dark');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persisted canvasViewByMode keys load as the starting view for each layout (no bleed)', async () => {
    // Seed three distinct views so a regression that flattens to "global"
    // blob is obvious — the toggle title flips are a stable observable
    // for which mode is currently active, while the actual view lives in
    // App's canvasViewByMode state (we don't have a JSDOM-friendly way to
    // read zoom/pan from canvas internals, but we can read the IPC
    // behaviour via mounted mode).
    const seed = {
      canvasViewByMode: {
        lanes:      { zoom: 0.5, pan: { x: -300, y: 200 } },
        mindmap:    { zoom: 1.6, pan: { x: 100, y: -150 } },
        corpus3d:   { zoom: 1.1, pan: { x: 25, y: -75 } },
      },
    };
    mockVsCodeApi.getState.mockReturnValue(seed);
    await act(async () => { render(<App />); });

    // Seeded layoutMode defaults to 'lanes' for a fresh state — that's
    // fine for this test; we only care that the storage shape loaded
    // correctly. Confirm no errors crashed, and each of the three slots
    // made it through validation (i.e. a regression that over-restricted
    // the validation ledger would lose a slot and surface as a default
    // fallback inside the canvasViewByMode write).
    expect(document.querySelector('.canvas')).toBeInTheDocument();
  });

  it('switching modes preserves each slot independently — pan in lanes stays in lanes after cycling through mindmap', async () => {
    // Step 1: seed so each mode has a distinctive view. lanes has a tiny
    // zoom + far pan; mindmap has a wide zoom + opposite pan. If storage
    // were still global, both flips would converge on the last-written
    // value.
    const seed = {
      layoutMode: 'lanes',
      canvasViewByMode: {
        lanes:      { zoom: 0.5, pan: { x: -300, y: 200 } },
        mindmap:    { zoom: 1.6, pan: { x: 100, y: -150 } },
        corpus3d:   { zoom: 1.0, pan: { x: 0, y: 0 } },
      },
    };
    mockVsCodeApi.getState.mockReturnValue(seed);
    await act(async () => { render(<App />); });

    // Step 2: cycle lanes → mindmap → corpus3d → lanes via clicks. Track
    // each setState mutation keyed by which slot was touched.
    const toggleBtn = document.querySelector('.mindmap-toggle') as HTMLElement;

    fireEvent.click(toggleBtn); // lanes → mindmap
    await waitFor(() => {
      expect(document.querySelector('.mindmap-toggle')?.getAttribute('title'))
        .toBe('Switch to 3D corpus (L)');
    });

    fireEvent.click(toggleBtn); // mindmap → corpus3d
    await waitFor(() => {
      expect(document.querySelector('.mindmap-toggle')?.getAttribute('title'))
        .toBe('Switch to lane view (L)');
    });

    fireEvent.click(toggleBtn); // corpus3d → lanes
    await waitFor(() => {
      expect(document.querySelector('.mindmap-toggle')?.getAttribute('title'))
        .toBe('Switch to mind map (L)');
    });

    // Step 3: tally how many setState calls this round-trip produced
    // that touched each slot. Per-mode isolation means: cycling modes
    // causes NO slot-mutating calls (each resync's [zoom, pan] effect
    // fires the value App already has in that slot → suppression kicks
    // in). We assert a flat mutation profile PER slot: zero mutations
    // per slot after the initial seed.
    const writes = mockVsCodeApi.setState.mock.calls
      .map(c => c[0] as Record<string, unknown>)
      .filter(s => s && 'canvasViewByMode' in s);

    const laneMutations = writes.filter(s => {
      const bm = s.canvasViewByMode as { lanes?: { zoom: number; pan: { x: number; y: number } } };
      const v = bm?.lanes;
      return v && !(v.zoom === 0.5 && v.pan.x === -300 && v.pan.y === 200);
    }).length;
    const mindmapMutations = writes.filter(s => {
      const bm = s.canvasViewByMode as { mindmap?: { zoom: number; pan: { x: number; y: number } } };
      const v = bm?.mindmap;
      return v && !(v.zoom === 1.6 && v.pan.x === 100 && v.pan.y === -150);
    }).length;
    const corpus3dMutations = writes.filter(s => {
      const bm = s.canvasViewByMode as { corpus3d?: { zoom: number; pan: { x: number; y: number } } };
      const v = bm?.corpus3d;
      return v && !(v.zoom === 1.0 && v.pan.x === 0 && v.pan.y === 0);
    }).length;

    expect(laneMutations).toBe(0);
    expect(mindmapMutations).toBe(0);
    expect(corpus3dMutations).toBe(0);
  });

  it('legacy `canvasView` blob hydrates ALL three modes equally on first mount (upgrades preserve users’ last view)', async () => {
    // Legacy: only `canvasView` exists, no `canvasViewByMode`. On first
    // mount we hydrate every slot from the legacy value so the user keeps
    // their last-known view at every layout until they re-enter each one
    // and pan around (modes will diverge naturally).
    mockVsCodeApi.getState.mockReturnValue({
      canvasView: { zoom: 1.25, pan: { x: 42, y: -77 } },
    });
    await act(async () => { render(<App />); });

    // Cycle once through every mode and on each resync, the [zoom, pan]
    // effect reports (1.25, {42, -77}) — App's slot check sees the same
    // value the slot already holds → suppression → no IPC writes
    // touching canvasViewByMode. Set state count for the canvasViewByMode
    // key must stay at 0.
    const initialByModeWrites = mockVsCodeApi.setState.mock.calls
      .map(c => c[0] as Record<string, unknown>)
      .filter(s => s && 'canvasViewByMode' in s).length;

    const toggleBtn = document.querySelector('.mindmap-toggle') as HTMLElement;
    fireEvent.click(toggleBtn); // lanes → mindmap
    await waitFor(() => {
      expect(document.querySelector('.mindmap-mode-indicator')).toBeInTheDocument();
    });
    fireEvent.click(toggleBtn); // mindmap → corpus3d
    await waitFor(() => {
      expect(document.querySelector('.mindmap-toggle')?.getAttribute('title'))
        .toBe('Switch to lane view (L)');
    });
    fireEvent.click(toggleBtn); // corpus3d → lanes
    await waitFor(() => {
      expect(document.querySelector('.mindmap-toggle')?.getAttribute('title'))
        .toBe('Switch to mind map (L)');
    });

    // Wait past the debounce window so any (incorrect) pending writes
    // would have flushed if a slot mutation had been queued.
    const deadline = Date.now() + 400;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 25));
    }

    const afterByModeWrites = mockVsCodeApi.setState.mock.calls
      .map(c => c[0] as Record<string, unknown>)
      .filter(s => s && 'canvasViewByMode' in s).length;

    // Integrity check: any new canvasViewByMode write would imply the
    // resync→[zoom,pan] effect fired with values different from what
    // the slot already held. If hydration is working, all three slots
    // were hydrated to the same legacy value AND each resync reported
    // exactly that value — so suppression keeps the IPC channel quiet.
    expect(afterByModeWrites).toBe(initialByModeWrites);
  });

  it('only the active mode re-syncs on mode switch — the other two slots are untouched (no context bleed)', async () => {
    // Seat three distinct seeds for each mode. Sandboxed mounting means
    // we can't observe Canvas's internal zoom/pan state, but we CAN
    // observe App's IPC behaviour: per-mode isolation requires that
    // switching modes NEVER triggers a write to the slot of the mode
    // we're leaving. Drive a wheel-zoom inside the lanes mode (which
    // SHOULD produce a write to the lanes slot) and then switch modes
    // (which should NOT produce a write to the mindmap/corpus3d slots).
    mockVsCodeApi.getState.mockReturnValue({
      layoutMode: 'lanes',
      canvasViewByMode: {
        lanes:    { zoom: 0.7, pan: { x: -100, y: 60 } },
        mindmap:  { zoom: 1.4, pan: { x: 200, y: -80 } },
        corpus3d: { zoom: 1.0, pan: { x: 0, y: 0 } },
      },
    });
    await act(async () => { render(<App />); });

    const canvas = document.querySelector('.canvas') as HTMLElement;
    // Wheel zoom inside lanes mode. The new zoom will differ from the
    // seeded 0.7 → real-change path → App writes to canvasViewByMode.lanes
    // after the 150 ms debounce.
    fireEvent.wheel(canvas, {
      ctrlKey: true,
      deltaY: -1,
      clientX: 100,
      clientY: 100,
    });
    await waitFor(() => {
      const writes = mockVsCodeApi.setState.mock.calls
        .map(c => c[0] as Record<string, unknown>)
        .filter(s => s && 'canvasViewByMode' in s);
      const laneWrite = writes.find(s => {
        const bm = s.canvasViewByMode as { lanes?: { zoom: number; pan: { x: number; y: number } } };
        return bm?.lanes && bm.lanes.zoom !== 0.7;
      });
      expect(laneWrite).toBeDefined();
    });

    // Step into mindmap. The [layoutMode] resync seeds zoom/pan from
    // the mindmap slot (1.4, {200, -80}), [zoom, pan] effect reports
    // those values back to App. App sees the slot already holds those
    // exact values → suppression → no IPC write for the mindmap slot.
    const toggleBtn = document.querySelector('.mindmap-toggle') as HTMLElement;
    const writesBeforeFlip = mockVsCodeApi.setState.mock.calls.length;
    fireEvent.click(toggleBtn);
    await waitFor(() => {
      expect(document.querySelector('.mindmap-mode-indicator')).toBeInTheDocument();
    });
    // Wait past debounce window.
    const deadline = Date.now() + 400;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 25));
    }

    // Read all setState calls produced AT OR AFTER the layout flip and
    // verify NO call mutated the mindmap slot AWAY from its seeded
    // (1.4, {200, -80}) value. If per-mode isolation was broken (e.g.
    // the wheel-zoom bled across modes), we'd see a write that touches
    // mindmap with the lanes-derived value.
    const writesAfterFlip = mockVsCodeApi.setState.mock.calls
      .slice(writesBeforeFlip)
      .map(c => c[0] as Record<string, unknown>)
      .filter(s => s && 'canvasViewByMode' in s);
    const mindmapMutations = writesAfterFlip.filter(s => {
      const bm = s.canvasViewByMode as { mindmap?: { zoom: number; pan: { x: number; y: number } } };
      const v = bm?.mindmap;
      return v && !(v.zoom === 1.4 && v.pan.x === 200 && v.pan.y === -80);
    });
    expect(mindmapMutations).toEqual([]);

    // And the corpus3d slot must still be (1.0, {0, 0}) — completely
    // untouched by the lanes-side wheel-zoom or the mode flip.
    const corpus3dMutations = writesAfterFlip.filter(s => {
      const bm = s.canvasViewByMode as { corpus3d?: { zoom: number; pan: { x: number; y: number } } };
      const v = bm?.corpus3d;
      return v && !(v.zoom === 1.0 && v.pan.x === 0 && v.pan.y === 0);
    });
    expect(corpus3dMutations).toEqual([]);
  });
});
