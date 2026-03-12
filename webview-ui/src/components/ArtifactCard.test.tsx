/**
 * ArtifactCard Component Tests
 * Individual artifact card displayed on the canvas
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactCard } from './ArtifactCard';
import type { Artifact } from '../types';

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

describe('ArtifactCard', () => {
  const defaultProps = {
    artifact: createMockArtifact(),
    isSelected: false,
    isExpanded: false,
    onSelect: vi.fn(),
    onOpenDetail: vi.fn(),
    onUpdate: vi.fn(),
    onToggleExpand: vi.fn(),
    onRefineWithAI: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render artifact card', () => {
      render(<ArtifactCard {...defaultProps} />);
      expect(document.querySelector('.artifact-card')).toBeInTheDocument();
    });

    it('should render artifact title', () => {
      render(<ArtifactCard {...defaultProps} />);
      expect(screen.getByText('Test Epic')).toBeInTheDocument();
    });

    it('should render artifact description', () => {
      render(<ArtifactCard {...defaultProps} />);
      expect(screen.getByText('Test description')).toBeInTheDocument();
    });

    it('should render artifact type', () => {
      render(<ArtifactCard {...defaultProps} />);
      expect(screen.getByText('Epic')).toBeInTheDocument();
    });

    it('should render artifact status badge', () => {
      render(<ArtifactCard {...defaultProps} />);
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('should render type icon', () => {
      render(<ArtifactCard {...defaultProps} />);
      // SVG icon rendered inside .artifact-icon
      expect(document.querySelector('.artifact-icon svg.icon')).toBeInTheDocument();
    });

    it('should render info button', () => {
      render(<ArtifactCard {...defaultProps} />);
      expect(screen.getByTitle('View details')).toBeInTheDocument();
    });

    it('should render AI refine button', () => {
      render(<ArtifactCard {...defaultProps} />);
      expect(screen.getByTitle('Refine with AI')).toBeInTheDocument();
    });
  });

  describe('Artifact Types', () => {
    const types: Array<{ type: Artifact['type']; label: string }> = [
      { type: 'vision', label: 'Vision' },
      { type: 'requirement', label: 'Requirement' },
      { type: 'epic', label: 'Epic' },
      { type: 'story', label: 'Story' },
      { type: 'use-case', label: 'Use Case' },
      { type: 'prd', label: 'PRD' },
      { type: 'architecture', label: 'Architecture' },
      { type: 'product-brief', label: 'Product Brief' },
    ];

    types.forEach(({ type, label }) => {
      it(`should render ${type} with correct icon and label`, () => {
        const artifact = createMockArtifact({ type, title: `Test ${type}` });
        render(<ArtifactCard {...defaultProps} artifact={artifact} />);
        // SVG icon rendered inside .artifact-icon
        expect(document.querySelector('.artifact-icon svg.icon')).toBeInTheDocument();
        expect(screen.getByText(label)).toBeInTheDocument();
      });
    });
  });

  describe('Status Badges', () => {
    const statuses: Array<{ status: Artifact['status']; label: string }> = [
      { status: 'draft', label: 'Draft' },
      { status: 'ready', label: 'Ready' },
      { status: 'in-progress', label: 'In Progress' },
      { status: 'complete', label: 'Complete' },
      { status: 'done', label: 'Done' },
      { status: 'approved', label: 'Approved' },
      { status: 'review', label: 'Review' },
      { status: 'archived', label: 'Archived' },
    ];

    statuses.forEach(({ status, label }) => {
      it(`should render ${status} status as "${label}"`, () => {
        const artifact = createMockArtifact({ status });
        render(<ArtifactCard {...defaultProps} artifact={artifact} />);
        expect(screen.getByText(label)).toBeInTheDocument();
      });
    });

    it('should handle unknown status gracefully', () => {
      const artifact = createMockArtifact({ status: 'unknown' as any });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      expect(screen.getByText('unknown')).toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    it('should add selected class when isSelected is true', () => {
      render(<ArtifactCard {...defaultProps} isSelected={true} />);
      expect(document.querySelector('.artifact-card.selected')).toBeInTheDocument();
    });

    it('should not have selected class when isSelected is false', () => {
      render(<ArtifactCard {...defaultProps} isSelected={false} />);
      expect(document.querySelector('.artifact-card.selected')).not.toBeInTheDocument();
    });

    it('should call onSelect on click', () => {
      const onSelect = vi.fn();
      render(<ArtifactCard {...defaultProps} onSelect={onSelect} />);
      
      const card = document.querySelector('.artifact-card');
      fireEvent.click(card!);
      
      expect(onSelect).toHaveBeenCalledWith('test-1');
    });

    it('should not call onSelect when clicking on a button', () => {
      const onSelect = vi.fn();
      render(<ArtifactCard {...defaultProps} onSelect={onSelect} />);
      
      const aiBtn = screen.getByTitle('Refine with AI');
      fireEvent.click(aiBtn);
      
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('Double Click', () => {
    it('should call onOpenDetail on double click', () => {
      const onOpenDetail = vi.fn();
      render(<ArtifactCard {...defaultProps} onOpenDetail={onOpenDetail} />);
      
      const card = document.querySelector('.artifact-card');
      fireEvent.doubleClick(card!);
      
      expect(onOpenDetail).toHaveBeenCalledWith('test-1');
    });
  });

  describe('Info Button', () => {
    it('should call onOpenDetail when info button clicked', () => {
      const onOpenDetail = vi.fn();
      render(<ArtifactCard {...defaultProps} onOpenDetail={onOpenDetail} />);
      
      const infoBtn = screen.getByTitle('View details');
      fireEvent.click(infoBtn);
      
      expect(onOpenDetail).toHaveBeenCalledWith('test-1');
    });
  });

  describe('AI Refine Button', () => {
    it('should call onRefineWithAI when AI button clicked', () => {
      const onRefineWithAI = vi.fn();
      render(<ArtifactCard {...defaultProps} onRefineWithAI={onRefineWithAI} />);
      
      const aiBtn = screen.getByTitle('Refine with AI');
      fireEvent.click(aiBtn);
      
      expect(onRefineWithAI).toHaveBeenCalledWith(defaultProps.artifact);
    });

    it('should not throw when onRefineWithAI is not provided', () => {
      render(<ArtifactCard {...defaultProps} onRefineWithAI={undefined} />);
      
      const aiBtn = screen.getByTitle('Refine with AI');
      expect(() => fireEvent.click(aiBtn)).not.toThrow();
    });
  });

  describe('Expand/Collapse', () => {
    it('should show expand button when artifact has children', () => {
      const artifact = createMockArtifact({ childCount: 2 });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      expect(document.querySelector('.expand-btn')).toBeInTheDocument();
    });

    it('should not show expand button when artifact has no children', () => {
      const artifact = createMockArtifact({ childCount: 0 });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      expect(document.querySelector('.expand-btn')).not.toBeInTheDocument();
    });

    it('should show child count on expand button', () => {
      const artifact = createMockArtifact({ childCount: 5 });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should show collapse icon when expanded', () => {
      const artifact = createMockArtifact({ childCount: 2 });
      render(<ArtifactCard {...defaultProps} artifact={artifact} isExpanded={true} />);
      
      const expandIcon = document.querySelector('.expand-icon svg.icon');
      expect(expandIcon).toBeInTheDocument();
    });

    it('should show expand icon when collapsed', () => {
      const artifact = createMockArtifact({ childCount: 2 });
      render(<ArtifactCard {...defaultProps} artifact={artifact} isExpanded={false} />);
      
      const expandIcon = document.querySelector('.expand-icon svg.icon');
      expect(expandIcon).toBeInTheDocument();
    });

    it('should call onToggleExpand when expand button clicked', () => {
      const onToggleExpand = vi.fn();
      const artifact = createMockArtifact({ childCount: 2 });
      render(<ArtifactCard {...defaultProps} artifact={artifact} onToggleExpand={onToggleExpand} />);
      
      const expandBtn = document.querySelector('.expand-btn');
      fireEvent.click(expandBtn!);
      
      expect(onToggleExpand).toHaveBeenCalledWith('test-1');
    });

    it('should add has-children class when artifact has children', () => {
      const artifact = createMockArtifact({ childCount: 2 });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      expect(document.querySelector('.artifact-card.has-children')).toBeInTheDocument();
    });

    it('should add expanded class when isExpanded is true', () => {
      const artifact = createMockArtifact({ childCount: 2 });
      render(<ArtifactCard {...defaultProps} artifact={artifact} isExpanded={true} />);
      
      expect(document.querySelector('.artifact-card.expanded')).toBeInTheDocument();
    });

    it('should add collapsed class when isExpanded is false', () => {
      const artifact = createMockArtifact({ childCount: 2 });
      render(<ArtifactCard {...defaultProps} artifact={artifact} isExpanded={false} />);
      
      expect(document.querySelector('.artifact-card.collapsed')).toBeInTheDocument();
    });
  });

  describe('Inline Title Editing', () => {
    it('should enter edit mode when clicking title while selected', () => {
      render(<ArtifactCard {...defaultProps} isSelected={true} />);
      
      const title = screen.getByText('Test Epic');
      fireEvent.click(title);
      
      expect(document.querySelector('.artifact-title input')).toBeInTheDocument();
    });

    it('should not enter edit mode when clicking title while not selected', () => {
      render(<ArtifactCard {...defaultProps} isSelected={false} />);
      
      const title = screen.getByText('Test Epic');
      fireEvent.click(title);
      
      expect(document.querySelector('.artifact-title input')).not.toBeInTheDocument();
    });

    it('should show current title in edit input', () => {
      render(<ArtifactCard {...defaultProps} isSelected={true} />);
      
      const title = screen.getByText('Test Epic');
      fireEvent.click(title);
      
      const input = document.querySelector('.artifact-title input') as HTMLInputElement;
      expect(input.value).toBe('Test Epic');
    });

    it('should call onUpdate when title changed and saved', () => {
      const onUpdate = vi.fn();
      render(<ArtifactCard {...defaultProps} isSelected={true} onUpdate={onUpdate} />);
      
      const title = screen.getByText('Test Epic');
      fireEvent.click(title);
      
      const input = document.querySelector('.artifact-title input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Updated Title' } });
      fireEvent.blur(input);
      
      expect(onUpdate).toHaveBeenCalledWith('test-1', { title: 'Updated Title' });
    });

    it('should save on Enter key', () => {
      const onUpdate = vi.fn();
      render(<ArtifactCard {...defaultProps} isSelected={true} onUpdate={onUpdate} />);
      
      const title = screen.getByText('Test Epic');
      fireEvent.click(title);
      
      const input = document.querySelector('.artifact-title input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Updated Title' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      
      expect(onUpdate).toHaveBeenCalledWith('test-1', { title: 'Updated Title' });
    });

    it('should cancel on Escape key', () => {
      const onUpdate = vi.fn();
      render(<ArtifactCard {...defaultProps} isSelected={true} onUpdate={onUpdate} />);
      
      const title = screen.getByText('Test Epic');
      fireEvent.click(title);
      
      const input = document.querySelector('.artifact-title input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Updated Title' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      
      expect(onUpdate).not.toHaveBeenCalled();
      expect(screen.getByText('Test Epic')).toBeInTheDocument();
    });

    it('should not call onUpdate if title unchanged', () => {
      const onUpdate = vi.fn();
      render(<ArtifactCard {...defaultProps} isSelected={true} onUpdate={onUpdate} />);
      
      const title = screen.getByText('Test Epic');
      fireEvent.click(title);
      
      const input = document.querySelector('.artifact-title input') as HTMLInputElement;
      fireEvent.blur(input);
      
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('should trim whitespace from title', () => {
      const onUpdate = vi.fn();
      render(<ArtifactCard {...defaultProps} isSelected={true} onUpdate={onUpdate} />);
      
      const title = screen.getByText('Test Epic');
      fireEvent.click(title);
      
      const input = document.querySelector('.artifact-title input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '  Updated Title  ' } });
      fireEvent.blur(input);
      
      expect(onUpdate).toHaveBeenCalledWith('test-1', { title: 'Updated Title' });
    });
  });

  describe('Dependencies', () => {
    it('should show dependency badges when story has blockedBy dependencies', () => {
      const artifact = createMockArtifact({
        type: 'story',
        metadata: {
          dependencies: { blockedBy: [{ storyId: 's-1', reason: 'test' }], blocks: [] },
        },
      });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      expect(screen.getByText(/Blocked by:/)).toBeInTheDocument();
    });

    it('should show blocks badge when story blocks other stories', () => {
      const artifact = createMockArtifact({
        type: 'story',
        metadata: {
          dependencies: { blockedBy: [], blocks: [{ storyId: 's-2', reason: 'test' }] },
        },
      });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      expect(screen.getByText(/Blocks:/)).toBeInTheDocument();
    });

    it('should not show dependency badges when no blockedBy or blocks', () => {
      const artifact = createMockArtifact({
        type: 'story',
        dependencies: [],
        metadata: {
          dependencies: { blockedBy: [], blocks: [] },
        },
      });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      expect(screen.queryByText(/Blocked by:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Blocks:/)).not.toBeInTheDocument();
    });
  });

  describe('Positioning', () => {
    it('should apply position styles from artifact', () => {
      const artifact = createMockArtifact({ position: { x: 200, y: 300 } });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      const card = document.querySelector('.artifact-card') as HTMLElement;
      expect(card.style.left).toBe('200px');
      expect(card.style.top).toBe('300px');
    });

    it('should apply width from artifact size', () => {
      const artifact = createMockArtifact({ size: { width: 350, height: 200 } });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      const card = document.querySelector('.artifact-card') as HTMLElement;
      expect(card.style.width).toBe('350px');
    });
  });

  describe('Verbose Preview Badges (Epic)', () => {
    it('should show UC badge when epic has use cases', () => {
      const artifact = createMockArtifact({
        type: 'epic',
        metadata: { useCases: [{ id: '1', title: 'UC1', summary: 'test', scenario: {} }] },
      });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      expect(screen.getByText('UC')).toBeInTheDocument();
    });

    it('should show FC badge when epic has fit criteria', () => {
      const artifact = createMockArtifact({
        type: 'epic',
        metadata: { fitCriteria: { functional: [], nonFunctional: [], security: [] } },
      });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      expect(screen.getByText('FC')).toBeInTheDocument();
    });

    it('should show SM badge when epic has success metrics', () => {
      const artifact = createMockArtifact({
        type: 'epic',
        metadata: { successMetrics: { codeQuality: [], operational: [], customerImpact: [], deployment: [] } },
      });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      expect(screen.getByText('SM')).toBeInTheDocument();
    });

    it('should show R badge when epic has risks', () => {
      const artifact = createMockArtifact({
        type: 'epic',
        metadata: { risks: [{ risk: 'test', impact: 'high', mitigation: 'test' }] },
      });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      expect(screen.getByText('R')).toBeInTheDocument();
    });

    it('should show DoD badge when epic has definition of done', () => {
      const artifact = createMockArtifact({
        type: 'epic',
        metadata: { definitionOfDone: ['criterion 1'] },
      });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      expect(screen.getByText('DoD')).toBeInTheDocument();
    });

    it('should not show verbose badges for non-epic types', () => {
      const artifact = createMockArtifact({
        type: 'story',
        metadata: { useCases: [{ id: '1', title: 'UC1', summary: 'test', scenario: {} }] },
      });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);
      
      expect(screen.queryByText('UC')).not.toBeInTheDocument();
    });
  });

  describe('CSS Classes', () => {
    it('should include artifact type as class', () => {
      render(<ArtifactCard {...defaultProps} />);
      expect(document.querySelector('.artifact-card.epic')).toBeInTheDocument();
    });

    it('should apply type class for color bar styling', () => {
      render(<ArtifactCard {...defaultProps} />);
      const card = document.querySelector('.artifact-card');
      // Color is applied via CSS ::before pseudo-element using the type class
      expect(card?.classList.contains('epic')).toBe(true);
    });
  });

  describe('Title Tooltip', () => {
    it('should show edit hint tooltip when selected', () => {
      render(<ArtifactCard {...defaultProps} isSelected={true} />);
      const title = screen.getByRole('heading', { level: 3 });
      expect(title).toHaveAttribute('title', 'Click to edit title');
    });

    it('should not show edit hint tooltip when not selected', () => {
      render(<ArtifactCard {...defaultProps} isSelected={false} />);
      const title = screen.getByRole('heading', { level: 3 });
      expect(title).not.toHaveAttribute('title');
    });
  });

  describe('Risk-type cards (BMM standalone risks)', () => {
    it('should render a risk card with correct type label', () => {
      const artifact = createMockArtifact({
        id: 'R-001',
        type: 'risk' as any,
        title: 'Data breach risk',
        description: 'Potential unauthorized access to user data',
        status: 'approved',
        metadata: {
          category: 'security',
          probability: 'high',
          impact: 'critical',
          riskScore: '9.5',
          mitigation: 'Implement encryption',
          owner: 'Security Team',
          source: 'bmm-risks',
        },
      });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);

      expect(screen.getByText('Data breach risk')).toBeInTheDocument();
      expect(screen.getByText(/Risk/)).toBeInTheDocument();
    });

    it('should render a risk card with parentId pointing to PRD', () => {
      const artifact = createMockArtifact({
        id: 'R-002',
        type: 'risk' as any,
        title: 'Vendor lock-in',
        description: 'Heavy dependency on single cloud provider',
        parentId: 'prd-1',
        metadata: {
          category: 'technical',
          probability: 'medium',
          impact: 'high',
          mitigation: 'Multi-cloud strategy',
          contingency: 'Migration playbook',
          source: 'bmm-risks',
        },
      });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);

      expect(screen.getByText('Vendor lock-in')).toBeInTheDocument();
      expect(screen.getByText('Heavy dependency on single cloud provider')).toBeInTheDocument();
    });

    it('should apply risk CSS class for styling', () => {
      const artifact = createMockArtifact({
        id: 'R-003',
        type: 'risk' as any,
        title: 'Schedule delay',
        description: '',
        metadata: { category: 'schedule' },
      });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);

      const card = document.querySelector('.artifact-card');
      expect(card?.classList.contains('risk')).toBe(true);
    });

    it('should show status badge for risk cards', () => {
      const artifact = createMockArtifact({
        id: 'R-004',
        type: 'risk' as any,
        title: 'Regulatory compliance',
        description: 'Pending GDPR assessment',
        status: 'draft',
        metadata: { category: 'legal' },
      });
      render(<ArtifactCard {...defaultProps} artifact={artifact} />);

      expect(screen.getByText('Draft')).toBeInTheDocument();
    });
  });
});
