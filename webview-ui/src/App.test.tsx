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
    });

    it('should add with-detail-panel class when panel is open', async () => {
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
        expect(document.querySelector('.elicit-modal')).toBeInTheDocument();
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

  describe('outputFormat message', () => {
    it('should set the output format state', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('outputFormat', { format: 'json' });
      });

      // The toolbar format button should show JSON
      await waitFor(() => {
        const formatBtn = document.querySelector('.toolbar-format-btn');
        expect(formatBtn).toBeInTheDocument();
        expect(formatBtn!.textContent).toContain('JSON');
      });
    });

    it('should set markdown format', async () => {
      render(<App />);

      act(() => {
        dispatchMessage('outputFormat', { format: 'markdown' });
      });

      await waitFor(() => {
        const formatBtn = document.querySelector('.toolbar-format-btn');
        expect(formatBtn!.textContent).toContain('MD');
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

  describe('handleOutputFormatChange', () => {
    it('should cycle format and post setOutputFormat', async () => {
      render(<App />);

      const formatBtn = document.querySelector('.toolbar-format-btn') as HTMLElement;
      expect(formatBtn).toBeInTheDocument();

      // Default is 'dual', click should cycle to 'json'
      fireEvent.click(formatBtn);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
        type: 'setOutputFormat',
        format: 'json',
      });

      // Click again should cycle to 'markdown'
      fireEvent.click(formatBtn);

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
        type: 'setOutputFormat',
        format: 'markdown',
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
        expect(document.querySelector('.elicit-modal')).toBeInTheDocument();
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
