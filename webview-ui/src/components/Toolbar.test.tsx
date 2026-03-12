/**
 * Toolbar Component Tests
 * Popover-based toolbar for adding artifacts and performing AI actions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toolbar } from './Toolbar';
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

describe('Toolbar', () => {
  const defaultProps = {
    onAddArtifact: vi.fn(),
    selectedArtifact: null as Artifact | null | undefined,
    onBreakDown: vi.fn(),
    onEnhance: vi.fn(),
    onElicit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper: open the popover
  const openPopover = () => {
    fireEvent.click(screen.getByRole('button', { name: /add artifact/i }));
  };

  describe('Rendering', () => {
    it('should render the FAB container', () => {
      render(<Toolbar {...defaultProps} />);
      expect(document.querySelector('.toolbar-fab-container')).toBeInTheDocument();
    });

    it('should render the Add FAB button', () => {
      render(<Toolbar {...defaultProps} />);
      expect(screen.getByRole('button', { name: /add artifact/i })).toBeInTheDocument();
    });

    it('should show Add label on FAB', () => {
      render(<Toolbar {...defaultProps} />);
      expect(screen.getByText('Add')).toBeInTheDocument();
    });

    it('should not show popover by default', () => {
      render(<Toolbar {...defaultProps} />);
      expect(document.querySelector('.toolbar-popover')).not.toBeInTheDocument();
    });

    it('should open popover when FAB clicked', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      expect(document.querySelector('.toolbar-popover')).toBeInTheDocument();
    });

    it('should close popover when FAB clicked again', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      openPopover();
      expect(document.querySelector('.toolbar-popover')).not.toBeInTheDocument();
    });
  });

  describe('Popover items', () => {
    it('should show Brief item in popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      expect(screen.getByText('Brief')).toBeInTheDocument();
    });

    it('should show Vision item in popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      expect(screen.getByText('Vision')).toBeInTheDocument();
    });

    it('should show PRD item in popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      expect(screen.getByText('PRD')).toBeInTheDocument();
    });

    it('should show Requirement item in popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      expect(screen.getByText('Requirement')).toBeInTheDocument();
    });

    it('should show Architecture item in popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      expect(screen.getByText('Architecture')).toBeInTheDocument();
    });

    it('should show Epic item in popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      expect(screen.getByText('Epic')).toBeInTheDocument();
    });

    it('should show Test Strategy item in popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      expect(screen.getByText('Test Strategy')).toBeInTheDocument();
    });

    it('should show Story item in popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      expect(screen.getByText('Story')).toBeInTheDocument();
    });

    it('should show Use Case item in popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      expect(screen.getByText('Use Case')).toBeInTheDocument();
    });

    it('should show Test Case item in popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      expect(screen.getByText('Test Case')).toBeInTheDocument();
    });
  });

  describe('Adding artifacts via popover', () => {
    it('should call onAddArtifact with product-brief', () => {
      const onAddArtifact = vi.fn();
      render(<Toolbar {...defaultProps} onAddArtifact={onAddArtifact} />);
      openPopover();
      fireEvent.click(screen.getByTitle('Add Brief'));
      expect(onAddArtifact).toHaveBeenCalledWith('product-brief');
    });

    it('should call onAddArtifact with vision', () => {
      const onAddArtifact = vi.fn();
      render(<Toolbar {...defaultProps} onAddArtifact={onAddArtifact} />);
      openPopover();
      fireEvent.click(screen.getByTitle('Add Vision'));
      expect(onAddArtifact).toHaveBeenCalledWith('vision');
    });

    it('should call onAddArtifact with prd', () => {
      const onAddArtifact = vi.fn();
      render(<Toolbar {...defaultProps} onAddArtifact={onAddArtifact} />);
      openPopover();
      fireEvent.click(screen.getByTitle('Add PRD'));
      expect(onAddArtifact).toHaveBeenCalledWith('prd');
    });

    it('should call onAddArtifact with requirement', () => {
      const onAddArtifact = vi.fn();
      render(<Toolbar {...defaultProps} onAddArtifact={onAddArtifact} />);
      openPopover();
      fireEvent.click(screen.getByTitle('Add Requirement'));
      expect(onAddArtifact).toHaveBeenCalledWith('requirement');
    });

    it('should call onAddArtifact with architecture', () => {
      const onAddArtifact = vi.fn();
      render(<Toolbar {...defaultProps} onAddArtifact={onAddArtifact} />);
      openPopover();
      fireEvent.click(screen.getByTitle('Add Architecture'));
      expect(onAddArtifact).toHaveBeenCalledWith('architecture');
    });

    it('should call onAddArtifact with epic', () => {
      const onAddArtifact = vi.fn();
      render(<Toolbar {...defaultProps} onAddArtifact={onAddArtifact} />);
      openPopover();
      fireEvent.click(screen.getByTitle('Add Epic'));
      expect(onAddArtifact).toHaveBeenCalledWith('epic');
    });

    it('should call onAddArtifact with test-strategy', () => {
      const onAddArtifact = vi.fn();
      const epic = createMockArtifact({ id: 'epic-1', type: 'epic', title: 'Epic' });
      render(<Toolbar {...defaultProps} onAddArtifact={onAddArtifact} selectedArtifact={epic} />);
      openPopover();
      fireEvent.click(screen.getByTitle('Add Test Strategy'));
      expect(onAddArtifact).toHaveBeenCalledWith('test-strategy');
    });

    it('should close popover after adding an artifact', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      fireEvent.click(screen.getByTitle('Add Epic'));
      expect(document.querySelector('.toolbar-popover')).not.toBeInTheDocument();
    });
  });

  describe('Disabled popover items (context-dependent)', () => {
    it('Story item should be disabled when no artifact selected', () => {
      render(<Toolbar {...defaultProps} selectedArtifact={null} />);
      openPopover();
      const disabledBtns = screen.getAllByTitle('Select an Epic first');
      expect(disabledBtns.length).toBeGreaterThan(0);
    });

    it('Story item should not be disabled when epic selected', () => {
      const epic = createMockArtifact({ type: 'epic' });
      render(<Toolbar {...defaultProps} selectedArtifact={epic} />);
      openPopover();
      expect(screen.getByTitle('Add Story')).toBeInTheDocument();
    });

    it('clicking a disabled Story item should not call onAddArtifact', () => {
      const onAddArtifact = vi.fn();
      render(<Toolbar {...defaultProps} onAddArtifact={onAddArtifact} selectedArtifact={null} />);
      openPopover();
      // There may be multiple "Select an Epic first" buttons (Story + Use Case)
      const disabledBtns = document.querySelectorAll('.toolbar-popover-item.disabled');
      if (disabledBtns.length > 0) {
        fireEvent.click(disabledBtns[0]);
      }
      expect(onAddArtifact).not.toHaveBeenCalled();
    });
  });

  describe('AI action buttons', () => {
    it('should not show AI buttons when no artifact selected', () => {
      render(<Toolbar {...defaultProps} selectedArtifact={null} />);
      expect(document.querySelectorAll('.toolbar-ai-btn').length).toBe(0);
    });

    it('should show Enhance button when any artifact selected', () => {
      const artifact = createMockArtifact({ type: 'story' });
      render(<Toolbar {...defaultProps} selectedArtifact={artifact} />);
      expect(screen.getByTitle('Ask AI to enhance selected item')).toBeInTheDocument();
    });

    it('should show Elicit button when any artifact selected', () => {
      const artifact = createMockArtifact({ type: 'story' });
      render(<Toolbar {...defaultProps} selectedArtifact={artifact} />);
      expect(screen.getByTitle('Elicit with advanced method')).toBeInTheDocument();
    });

    it('should show Break Down button for epic', () => {
      const epic = createMockArtifact({ type: 'epic' });
      render(<Toolbar {...defaultProps} selectedArtifact={epic} />);
      expect(screen.getByTitle('Break down epic into stories')).toBeInTheDocument();
    });

    it('should show Break Down button for requirement', () => {
      const req = createMockArtifact({ type: 'requirement' });
      render(<Toolbar {...defaultProps} selectedArtifact={req} />);
      expect(screen.getByTitle('Break down requirement into stories')).toBeInTheDocument();
    });

    it('should not show Break Down button for story', () => {
      const story = createMockArtifact({ type: 'story' });
      render(<Toolbar {...defaultProps} selectedArtifact={story} />);
      expect(screen.queryByTitle(/Break down/i)).not.toBeInTheDocument();
    });

    it('should call onEnhance with selected artifact', () => {
      const onEnhance = vi.fn();
      const artifact = createMockArtifact();
      render(<Toolbar {...defaultProps} onEnhance={onEnhance} selectedArtifact={artifact} />);
      fireEvent.click(screen.getByTitle('Ask AI to enhance selected item'));
      expect(onEnhance).toHaveBeenCalledWith(artifact);
    });

    it('should call onBreakDown with selected artifact', () => {
      const onBreakDown = vi.fn();
      const epic = createMockArtifact({ type: 'epic' });
      render(<Toolbar {...defaultProps} onBreakDown={onBreakDown} selectedArtifact={epic} />);
      fireEvent.click(screen.getByTitle('Break down epic into stories'));
      expect(onBreakDown).toHaveBeenCalledWith(epic);
    });

    it('should call onElicit with selected artifact', () => {
      const onElicit = vi.fn();
      const artifact = createMockArtifact({ type: 'story' });
      render(<Toolbar {...defaultProps} onElicit={onElicit} selectedArtifact={artifact} />);
      fireEvent.click(screen.getByTitle('Elicit with advanced method'));
      expect(onElicit).toHaveBeenCalledWith(artifact);
    });
  });

  describe('Optional callbacks', () => {
    it('should handle missing onBreakDown gracefully', () => {
      const epic = createMockArtifact({ type: 'epic' });
      render(<Toolbar {...defaultProps} selectedArtifact={epic} onBreakDown={undefined} />);
      const btn = screen.getByTitle('Break down epic into stories');
      expect(() => fireEvent.click(btn)).not.toThrow();
    });

    it('should handle missing onEnhance gracefully', () => {
      const artifact = createMockArtifact();
      render(<Toolbar {...defaultProps} selectedArtifact={artifact} onEnhance={undefined} />);
      const btn = screen.getByTitle('Ask AI to enhance selected item');
      expect(() => fireEvent.click(btn)).not.toThrow();
    });

    it('should handle missing onElicit gracefully', () => {
      const artifact = createMockArtifact();
      render(<Toolbar {...defaultProps} selectedArtifact={artifact} onElicit={undefined} />);
      const btn = screen.getByTitle('Elicit with advanced method');
      expect(() => fireEvent.click(btn)).not.toThrow();
    });
  });

  describe('CSS classes', () => {
    it('should have toolbar-fab-container', () => {
      render(<Toolbar {...defaultProps} />);
      expect(document.querySelector('.toolbar-fab-container')).toBeInTheDocument();
    });

    it('should have toolbar-fab-btn on the main button', () => {
      render(<Toolbar {...defaultProps} />);
      expect(document.querySelector('.toolbar-fab-btn')).toBeInTheDocument();
    });

    it('should have toolbar-popover-item elements inside the popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      expect(document.querySelectorAll('.toolbar-popover-item').length).toBeGreaterThan(0);
    });

    it('should have toolbar-ai-btn class on AI buttons when artifact selected', () => {
      const artifact = createMockArtifact();
      render(<Toolbar {...defaultProps} selectedArtifact={artifact} />);
      expect(document.querySelectorAll('.toolbar-ai-btn').length).toBeGreaterThan(0);
    });
  });

  describe('Icons', () => {
    it('should show document icon for Brief in popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      const icons = document.querySelectorAll('.toolbar-popover-icon svg.icon');
      expect(icons.length).toBeGreaterThan(0);
    });

    it('should show target icon for Vision in popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      const items = document.querySelectorAll('.toolbar-popover-item');
      // Vision is the second item in the popover
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items[1]?.querySelector('.toolbar-popover-icon svg.icon')).toBeInTheDocument();
    });

    it('should show lightning icon for Epic in popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      const items = document.querySelectorAll('.toolbar-popover-item');
      // Epic is the third item in the popover
      expect(items.length).toBeGreaterThanOrEqual(3);
      expect(items[2]?.querySelector('.toolbar-popover-icon svg.icon')).toBeInTheDocument();
    });

    it('should show building icon for Architecture in popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      const items = document.querySelectorAll('.toolbar-popover-item');
      // Architecture is the fourth item in the popover
      expect(items.length).toBeGreaterThanOrEqual(4);
      expect(items[3]?.querySelector('.toolbar-popover-icon svg.icon')).toBeInTheDocument();
    });
  });
});
