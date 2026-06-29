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

  // ── Overflow kebab menu ──────────────────────────────────

  describe('Overflow kebab', () => {
    const overflowProps = {
      onExport: vi.fn(),
      onImport: vi.fn(),
      onJira: vi.fn(),
      onSprintView: vi.fn(),
      onAsk: vi.fn(),
      onCatalogue: vi.fn(),
      onHelp: vi.fn(),
      onValidateSchemas: vi.fn(),
      onFixSchemas: vi.fn(),
      onGraphify: vi.fn(),
    };

    const openOverflow = () => {
      fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    };

    const overflowLabels = (): string[] => {
      const items = document.querySelectorAll('.toolbar-popover--right .toolbar-popover-label');
      return Array.from(items).map(el => el.textContent ?? '');
    };

    it('renders the kebab button', () => {
      render(<Toolbar {...defaultProps} />);
      expect(screen.getByRole('button', { name: /more actions/i })).toBeInTheDocument();
    });

    it('does not render any overflow popover by default', () => {
      render(<Toolbar {...defaultProps} />);
      expect(document.querySelector('.toolbar-popover--right')).not.toBeInTheDocument();
    });

    it('opens overflow popover on click', () => {
      render(<Toolbar {...defaultProps} {...overflowProps} />);
      openOverflow();
      expect(document.querySelector('.toolbar-popover--right')).toBeInTheDocument();
    });

    it('lists Export, Import, Sprint, Jira, graphify, Catalogue, Help, Validate schemas (Ask is always-visible, not in menu)', () => {
      render(<Toolbar {...defaultProps} {...overflowProps} />);
      openOverflow();
      expect(overflowLabels()).toEqual([
        'Export', 'Import', 'Validate schemas', 'Sprint Plan',
        'Jira', 'graphify', 'Catalogue', 'Help',
      ]);
    });

    it('renders Ask button outside the overflow menu (always-visible starting point)', () => {
      const onAsk = vi.fn();
      render(<Toolbar {...defaultProps} {...overflowProps} onAsk={onAsk} />);
      const askBtn = screen.getByTitle('Ask Agile Agent Canvas a question');
      expect(askBtn).toBeInTheDocument();
      // Confirm it's NOT inside the overflow popover
      expect(askBtn.closest('.toolbar-overflow-wrapper')).toBeNull();
      // Clicking it should NOT require opening the overflow
      fireEvent.click(askBtn);
      expect(onAsk).toHaveBeenCalledOnce();
    });

    it('calls onExport and closes popover', () => {
      const onExport = vi.fn();
      render(<Toolbar {...defaultProps} {...overflowProps} onExport={onExport} />);
      openOverflow();
      fireEvent.click(screen.getByRole('menuitem', { name: /export/i }));
      expect(onExport).toHaveBeenCalledOnce();
      expect(document.querySelector('.toolbar-popover--right')).not.toBeInTheDocument();
    });

    it('calls onImport and closes popover', () => {
      const onImport = vi.fn();
      render(<Toolbar {...defaultProps} {...overflowProps} onImport={onImport} />);
      openOverflow();
      fireEvent.click(screen.getByRole('menuitem', { name: /import/i }));
      expect(onImport).toHaveBeenCalledOnce();
    });

    it('shows schema issue badge on kebab when issues exist', () => {
      render(<Toolbar {...defaultProps} {...overflowProps} schemaIssueCount={3} />);
      const kebab = screen.getByRole('button', { name: /more actions/i });
      expect(kebab.querySelector('.toolbar-overflow-badge')?.textContent).toBe('3');
    });

    it('does not show schema issue badge when there are no issues', () => {
      render(<Toolbar {...defaultProps} {...overflowProps} schemaIssueCount={0} />);
      const kebab = screen.getByRole('button', { name: /more actions/i });
      expect(kebab.querySelector('.toolbar-overflow-badge')).toBeNull();
    });

    it('routes to onFixSchemas when issues exist (not onValidateSchemas)', () => {
      const onValidateSchemas = vi.fn();
      const onFixSchemas = vi.fn();
      render(
        <Toolbar {...defaultProps} {...overflowProps}
          schemaIssueCount={2}
          onValidateSchemas={onValidateSchemas}
          onFixSchemas={onFixSchemas}
        />
      );
      openOverflow();
      fireEvent.click(screen.getByRole('menuitem', { name: /fix schemas/i }));
      expect(onFixSchemas).toHaveBeenCalledOnce();
      expect(onValidateSchemas).not.toHaveBeenCalled();
    });

    it('opens overflow popover and closes the Add popover (mutual exclusion)', () => {
      render(<Toolbar {...defaultProps} {...overflowProps} />);
      // Open Add popover first
      fireEvent.click(screen.getByRole('button', { name: /add artifact/i }));
      expect(document.querySelector('.toolbar-popover:not(.toolbar-popover--right)')).toBeInTheDocument();
      // Now open overflow
      openOverflow();
      expect(document.querySelector('.toolbar-popover--right')).toBeInTheDocument();
      // Add popover should be closed
      expect(document.querySelector('.toolbar-popover:not(.toolbar-popover--right)')).not.toBeInTheDocument();
    });

    it('hides overflow items whose handlers are not provided', () => {
      // Only onHelp provided; everything else should be absent
      render(<Toolbar {...defaultProps} onHelp={vi.fn()} />);
      openOverflow();
      expect(overflowLabels()).toEqual(['Help']);
    });
  });
});
