/**
 * Tests for WorkflowLauncher.tsx
 *
 * Tests: rendering, search, phase tabs, workflow selection, escape/close
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkflowLauncher } from './WorkflowLauncher';
import type { BmmWorkflow } from '../types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeWorkflow(overrides: Partial<BmmWorkflow> & { id: string; name: string }): BmmWorkflow {
  return {
    description: `Description for ${overrides.name}`,
    triggerPhrase: `Create ${overrides.name}`,
    phase: 'Analysis',
    phaseOrder: 1,
    workflowFilePath: `/workflows/${overrides.id}.md`,
    ...overrides,
  };
}

const sampleWorkflows: BmmWorkflow[] = [
  makeWorkflow({ id: 'w1', name: 'create-product-brief', phase: 'Analysis', phaseOrder: 1, description: 'Creates a product brief. Use when the user says create brief.' }),
  makeWorkflow({ id: 'w2', name: 'create-prd', phase: 'Planning', phaseOrder: 2, description: 'Creates a PRD. Use when the user says create PRD.' }),
  makeWorkflow({ id: 'w3', name: 'create-architecture', phase: 'Solutioning', phaseOrder: 3 }),
  makeWorkflow({ id: 'w4', name: 'create-epics', phase: 'Implementation', phaseOrder: 4 }),
  makeWorkflow({ id: 'w5', name: 'create-vision', phase: 'Analysis', phaseOrder: 1 }),
];

const defaultProps = {
  workflows: sampleWorkflows,
  onSelect: vi.fn(),
  onClose: vi.fn(),
};

// ═══════════════════════════════════════════════════════════════════════════════
// Rendering
// ═══════════════════════════════════════════════════════════════════════════════

describe('WorkflowLauncher — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the modal overlay', () => {
    const { container } = render(<WorkflowLauncher {...defaultProps} />);
    expect(container.querySelector('.wfl-overlay')).toBeInTheDocument();
  });

  it('renders the modal dialog', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders "Launch Workflow" heading', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    expect(screen.getByText('Launch Workflow')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    expect(screen.getByText('Select a BMAD workflow to open in AI chat')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search workflows…')).toBeInTheDocument();
  });

  it('renders all workflow cards', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    expect(screen.getByText('create-product-brief')).toBeInTheDocument();
    expect(screen.getByText('create-prd')).toBeInTheDocument();
    expect(screen.getByText('create-architecture')).toBeInTheDocument();
    expect(screen.getByText('create-epics')).toBeInTheDocument();
    expect(screen.getByText('create-vision')).toBeInTheDocument();
  });

  it('shows total workflow count in footer', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    expect(screen.getByText('5 workflows')).toBeInTheDocument();
  });

  it('renders Cancel button', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase tabs
// ═══════════════════════════════════════════════════════════════════════════════

describe('WorkflowLauncher — phase tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "All" tab and phase tabs', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    // All + Analysis + Planning + Solutioning + Implementation = 5
    expect(tabs.length).toBe(5);
  });

  it('"All" tab is active by default', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    const allTab = screen.getAllByRole('tab')[0];
    expect(allTab.getAttribute('aria-selected')).toBe('true');
  });

  it('clicking a phase tab filters workflows', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    
    // Click "Planning" tab
    const tabs = screen.getAllByRole('tab');
    const planningTab = tabs.find(t => t.textContent?.includes('Planning'))!;
    fireEvent.click(planningTab);

    // Only create-prd should be visible
    expect(screen.getByText('create-prd')).toBeInTheDocument();
    expect(screen.queryByText('create-product-brief')).not.toBeInTheDocument();
    expect(screen.queryByText('create-architecture')).not.toBeInTheDocument();
  });

  it('shows phase count in tab badge', () => {
    const { container } = render(<WorkflowLauncher {...defaultProps} />);
    // Analysis has 2 workflows
    const tabCounts = container.querySelectorAll('.wfl-tab-count');
    // First count is "All" (5), then Analysis (2), Planning (1), Solutioning (1), Implementation (1)
    const allCount = tabCounts[0].textContent;
    expect(allCount).toBe('5');
  });

  it('footer text updates when filtering by phase', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    
    const tabs = screen.getAllByRole('tab');
    const analysisTab = tabs.find(t => t.textContent?.includes('Analysis'))!;
    fireEvent.click(analysisTab);

    expect(screen.getByText(/2 workflows/)).toBeInTheDocument();
    expect(screen.getByText(/in Analysis/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Search
// ═══════════════════════════════════════════════════════════════════════════════

describe('WorkflowLauncher — search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters by workflow name', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search workflows…');
    fireEvent.change(input, { target: { value: 'prd' } });

    expect(screen.getByText('create-prd')).toBeInTheDocument();
    expect(screen.queryByText('create-product-brief')).not.toBeInTheDocument();
  });

  it('filters by description', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search workflows…');
    fireEvent.change(input, { target: { value: 'product brief' } });

    expect(screen.getByText('create-product-brief')).toBeInTheDocument();
    expect(screen.queryByText('create-prd')).not.toBeInTheDocument();
  });

  it('filters by trigger phrase', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search workflows…');
    fireEvent.change(input, { target: { value: 'Create create-epics' } });

    expect(screen.getByText('create-epics')).toBeInTheDocument();
  });

  it('shows no results message when nothing matches', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search workflows…');
    fireEvent.change(input, { target: { value: 'zzzznotexist' } });

    expect(screen.getByText(/No workflows match/)).toBeInTheDocument();
  });

  it('shows search clear button when search has text', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search workflows…');
    fireEvent.change(input, { target: { value: 'test' } });

    expect(screen.getByTitle('Clear search')).toBeInTheDocument();
  });

  it('clears search when clear button is clicked', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search workflows…');
    fireEvent.change(input, { target: { value: 'test' } });

    fireEvent.click(screen.getByTitle('Clear search'));
    expect(input).toHaveValue('');
  });

  it('footer shows matching count with search text', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search workflows…');
    fireEvent.change(input, { target: { value: 'create-prd' } });

    expect(screen.getByText(/1 workflow/)).toBeInTheDocument();
    expect(screen.getByText(/matching "create-prd"/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Selection
// ═══════════════════════════════════════════════════════════════════════════════

describe('WorkflowLauncher — workflow selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onSelect when a workflow card is clicked', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    
    const card = screen.getByText('create-product-brief').closest('button')!;
    fireEvent.click(card);

    expect(defaultProps.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'w1', name: 'create-product-brief' })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Close behavior
// ═══════════════════════════════════════════════════════════════════════════════

describe('WorkflowLauncher — close behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes on overlay click', () => {
    const { container } = render(<WorkflowLauncher {...defaultProps} />);
    const overlay = container.querySelector('.wfl-overlay')!;
    
    // Click the overlay itself (not a child)
    fireEvent.click(overlay);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('does not close when clicking inside the modal', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    const modal = screen.getByRole('dialog');
    fireEvent.click(modal);
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('Escape closes when search is empty', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('first Escape clears search, second closes', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search workflows…');
    fireEvent.change(input, { target: { value: 'test' } });

    // First escape clears search
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(input).toHaveValue('');
    expect(defaultProps.onClose).not.toHaveBeenCalled();

    // Second escape closes
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('Cancel button calls onClose', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('close button calls onClose', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Close (Esc)'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Workflow card display
// ═══════════════════════════════════════════════════════════════════════════════

describe('WorkflowLauncher — card display', () => {
  it('shows phase badge on each card', () => {
    const { container } = render(<WorkflowLauncher {...defaultProps} />);
    const badges = container.querySelectorAll('.wfl-card-phase-badge');
    expect(badges.length).toBe(5);
  });

  it('shows description (before "Use when")', () => {
    render(<WorkflowLauncher {...defaultProps} />);
    // Description is "Creates a product brief. Use when the user says create brief."
    // Only the part before ". Use when" should be shown
    expect(screen.getByText('Creates a product brief')).toBeInTheDocument();
  });

  it('shows trigger phrase', () => {
    const { container } = render(<WorkflowLauncher {...defaultProps} />);
    const triggers = container.querySelectorAll('.wfl-card-trigger');
    expect(triggers.length).toBe(5);
  });

  it('groups by phase when "All" tab is active', () => {
    const { container } = render(<WorkflowLauncher {...defaultProps} />);
    const phaseLabels = container.querySelectorAll('.wfl-phase-label');
    // 4 phase groups: Analysis, Planning, Solutioning, Implementation
    expect(phaseLabels.length).toBe(4);
  });

  it('does not show phase labels when a specific tab is active', () => {
    const { container } = render(<WorkflowLauncher {...defaultProps} />);
    
    const tabs = screen.getAllByRole('tab');
    const analysisTab = tabs.find(t => t.textContent?.includes('Analysis'))!;
    fireEvent.click(analysisTab);

    const phaseLabels = container.querySelectorAll('.wfl-phase-label');
    expect(phaseLabels.length).toBe(0);
  });
});
