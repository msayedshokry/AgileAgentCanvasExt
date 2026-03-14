/**
 * Toolbar Component Tests – Schema-aware Add menu
 *
 * Menu behavior (user-confirmed mappings):
 *   No selection / other cards → ROOT_TYPES: Epic, Requirement, PRD, Architecture, Vision, Brief
 *   Architecture selected      → ADR, Component
 *   PRD selected               → Requirement, NFR, Additional Req
 *   Epic selected              → Story, Use Case, Test Strategy, Test Case
 *   Story selected             → Test Case, Task
 *   Requirement selected       → ADR, Epic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toolbar } from './Toolbar';
import type { Artifact } from '../types';

const createMockArtifact = (overrides: Partial<Artifact> = {}): Artifact => ({
  id: 'test-1',
  type: 'epic',
  title: 'Test',
  description: '',
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

  beforeEach(() => vi.clearAllMocks());

  const openPopover = () => {
    fireEvent.click(screen.getByRole('button', { name: /add artifact/i }));
  };

  const getPopoverLabels = (): string[] => {
    const items = document.querySelectorAll('.toolbar-popover-item .toolbar-popover-label');
    return Array.from(items).map(el => el.textContent ?? '');
  };

  // ── Rendering ──────────────────────────────────────────────

  describe('Rendering', () => {
    it('renders the FAB container', () => {
      render(<Toolbar {...defaultProps} />);
      expect(document.querySelector('.toolbar-fab-container')).toBeInTheDocument();
    });

    it('opens and closes popover', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      expect(document.querySelector('.toolbar-popover')).toBeInTheDocument();
      openPopover();
      expect(document.querySelector('.toolbar-popover')).not.toBeInTheDocument();
    });
  });

  // ── No selection → ROOT_TYPES ──────────────────────────────

  describe('No selection → root types', () => {
    it('shows 6 root-level items', () => {
      render(<Toolbar {...defaultProps} selectedArtifact={null} />);
      openPopover();
      expect(getPopoverLabels()).toEqual([
        'Brief', 'Vision', 'PRD', 'Requirement', 'Architecture', 'Epic',
      ]);
    });
  });

  // ── Architecture selected → children ──────────────────────

  describe('Architecture selected', () => {
    it('shows ADR and Component', () => {
      const arch = createMockArtifact({ type: 'architecture' });
      render(<Toolbar {...defaultProps} selectedArtifact={arch} />);
      openPopover();
      expect(getPopoverLabels()).toEqual(['ADR', 'Component']);
    });
  });

  // ── PRD selected → children ───────────────────────────────

  describe('PRD selected', () => {
    it('shows Requirement, NFR, Additional Req', () => {
      const prd = createMockArtifact({ type: 'prd' });
      render(<Toolbar {...defaultProps} selectedArtifact={prd} />);
      openPopover();
      expect(getPopoverLabels()).toEqual(['Requirement', 'NFR', 'Additional Req']);
    });
  });

  // ── Epic selected → children ──────────────────────────────

  describe('Epic selected', () => {
    it('shows Story, Use Case, Test Strategy, Test Case', () => {
      const epic = createMockArtifact({ type: 'epic' });
      render(<Toolbar {...defaultProps} selectedArtifact={epic} />);
      openPopover();
      expect(getPopoverLabels()).toEqual(['Story', 'Use Case', 'Test Strategy', 'Test Case']);
    });
  });

  // ── Story selected → children ─────────────────────────────

  describe('Story selected', () => {
    it('shows Test Case and Task', () => {
      const story = createMockArtifact({ type: 'story' });
      render(<Toolbar {...defaultProps} selectedArtifact={story} />);
      openPopover();
      expect(getPopoverLabels()).toEqual(['Test Case', 'Task']);
    });
  });

  // ── Requirement selected → children ───────────────────────

  describe('Requirement selected', () => {
    it('shows ADR and Epic', () => {
      const req = createMockArtifact({ type: 'requirement' });
      render(<Toolbar {...defaultProps} selectedArtifact={req} />);
      openPopover();
      expect(getPopoverLabels()).toEqual(['ADR', 'Epic']);
    });
  });

  // ── Types with no children → ROOT_TYPES fallback ──────────

  describe('Types with no defined children → root fallback', () => {
    it.each([
      'product-brief', 'vision', 'test-case', 'use-case', 'test-strategy',
    ] as Artifact['type'][])('"%s" selected → shows root types', (type) => {
      const artifact = createMockArtifact({ type });
      render(<Toolbar {...defaultProps} selectedArtifact={artifact} />);
      openPopover();
      expect(getPopoverLabels().length).toBe(6);
    });
  });

  // ── Adding artifacts ──────────────────────────────────────

  describe('Adding artifacts', () => {
    it('calls onAddArtifact with epic', () => {
      const onAddArtifact = vi.fn();
      render(<Toolbar {...defaultProps} onAddArtifact={onAddArtifact} />);
      openPopover();
      fireEvent.click(screen.getByTitle('Add Epic'));
      expect(onAddArtifact).toHaveBeenCalledWith('epic');
    });

    it('calls onAddArtifact with story when epic selected', () => {
      const onAddArtifact = vi.fn();
      const epic = createMockArtifact({ type: 'epic' });
      render(<Toolbar {...defaultProps} onAddArtifact={onAddArtifact} selectedArtifact={epic} />);
      openPopover();
      fireEvent.click(screen.getByTitle('Add Story'));
      expect(onAddArtifact).toHaveBeenCalledWith('story');
    });

    it('closes popover after adding', () => {
      render(<Toolbar {...defaultProps} />);
      openPopover();
      fireEvent.click(screen.getByTitle('Add Epic'));
      expect(document.querySelector('.toolbar-popover')).not.toBeInTheDocument();
    });
  });

  // ── AI action buttons ─────────────────────────────────────

  describe('AI action buttons', () => {
    it('hides AI buttons when no artifact selected', () => {
      render(<Toolbar {...defaultProps} selectedArtifact={null} />);
      expect(document.querySelectorAll('.toolbar-ai-btn').length).toBe(0);
    });

    it('shows Enhance when artifact selected', () => {
      const a = createMockArtifact({ type: 'story' });
      render(<Toolbar {...defaultProps} selectedArtifact={a} />);
      expect(screen.getByTitle('Ask AI to enhance selected item')).toBeInTheDocument();
    });

    it('shows Break Down for epic', () => {
      const epic = createMockArtifact({ type: 'epic' });
      render(<Toolbar {...defaultProps} selectedArtifact={epic} />);
      expect(screen.getByTitle('Break down epic into stories')).toBeInTheDocument();
    });

    it('hides Break Down for story', () => {
      const story = createMockArtifact({ type: 'story' });
      render(<Toolbar {...defaultProps} selectedArtifact={story} />);
      expect(screen.queryByTitle(/Break down/i)).not.toBeInTheDocument();
    });
  });
});
