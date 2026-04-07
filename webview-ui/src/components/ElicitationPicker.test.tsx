/**
 * Tests for ElicitationPicker.tsx
 *
 * Tests: rendering, search, category tabs, method selection, escape/close, grouping
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ElicitationPicker } from './ElicitationPicker';
import type { Artifact, ElicitationMethod } from '../types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<Artifact> & { id: string; type: Artifact['type']; title: string }): Artifact {
  return {
    description: '',
    status: 'draft',
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    dependencies: [],
    metadata: {},
    ...overrides,
  };
}

function makeMethod(overrides: Partial<ElicitationMethod> & { method_name: string }): ElicitationMethod {
  return {
    num: '1',
    category: 'discovery',
    description: `Description for ${overrides.method_name}`,
    output_pattern: 'Structured notes',
    ...overrides,
  };
}

const sampleArtifact = makeArtifact({ id: 'epic-1', type: 'epic', title: 'User Authentication' });

const sampleMethods: ElicitationMethod[] = [
  makeMethod({ num: '1', method_name: 'Stakeholder Interview', category: 'discovery', description: 'One-on-one interviews', output_pattern: 'Interview notes' }),
  makeMethod({ num: '2', method_name: 'Survey', category: 'discovery', description: 'Questionnaire-based', output_pattern: 'Survey results' }),
  makeMethod({ num: '3', method_name: 'Workshop', category: 'collaborative', description: 'Group facilitation', output_pattern: 'Workshop summary' }),
  makeMethod({ num: '4', method_name: 'Prototyping', category: 'creative', description: 'Build mockups', output_pattern: 'Prototype feedback' }),
  makeMethod({ num: '5', method_name: 'Focus Group', category: 'collaborative', description: 'Group discussion', output_pattern: 'Focus group notes' }),
];

const defaultProps = {
  artifact: sampleArtifact,
  methods: sampleMethods,
  onSelect: vi.fn(),
  onClose: vi.fn(),
};

// ═══════════════════════════════════════════════════════════════════════════════
// Rendering
// ═══════════════════════════════════════════════════════════════════════════════

describe('ElicitationPicker — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the modal overlay', () => {
    const { container } = render(<ElicitationPicker {...defaultProps} />);
    expect(container.querySelector('.wfl-overlay')).toBeInTheDocument();
  });

  it('renders the modal dialog', () => {
    render(<ElicitationPicker {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders "Choose Elicitation Method" heading', () => {
    render(<ElicitationPicker {...defaultProps} />);
    expect(screen.getByText('Choose Elicitation Method')).toBeInTheDocument();
  });

  it('shows artifact type and title in header', () => {
    render(<ElicitationPicker {...defaultProps} />);
    expect(screen.getByText('epic')).toBeInTheDocument();
    expect(screen.getByText(/User Authentication/)).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<ElicitationPicker {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search methods, descriptions, outputs…')).toBeInTheDocument();
  });

  it('renders all method cards', () => {
    render(<ElicitationPicker {...defaultProps} />);
    expect(screen.getByText('Stakeholder Interview')).toBeInTheDocument();
    expect(screen.getByText('Survey')).toBeInTheDocument();
    expect(screen.getByText('Workshop')).toBeInTheDocument();
    expect(screen.getByText('Prototyping')).toBeInTheDocument();
    expect(screen.getByText('Focus Group')).toBeInTheDocument();
  });

  it('shows total method count in footer', () => {
    render(<ElicitationPicker {...defaultProps} />);
    expect(screen.getByText('5 methods')).toBeInTheDocument();
  });

  it('renders Cancel button', () => {
    render(<ElicitationPicker {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Category tabs
// ═══════════════════════════════════════════════════════════════════════════════

describe('ElicitationPicker — category tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "All" tab and category tabs', () => {
    render(<ElicitationPicker {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    // All + discovery + collaborative + creative = 4
    expect(tabs.length).toBe(4);
  });

  it('"All" tab is active by default', () => {
    render(<ElicitationPicker {...defaultProps} />);
    const allTab = screen.getAllByRole('tab')[0];
    expect(allTab.getAttribute('aria-selected')).toBe('true');
  });

  it('clicking a category tab filters methods', () => {
    render(<ElicitationPicker {...defaultProps} />);
    
    const tabs = screen.getAllByRole('tab');
    const collabTab = tabs.find(t => t.textContent?.includes('Collaborative'))!;
    fireEvent.click(collabTab);

    expect(screen.getByText('Workshop')).toBeInTheDocument();
    expect(screen.getByText('Focus Group')).toBeInTheDocument();
    expect(screen.queryByText('Stakeholder Interview')).not.toBeInTheDocument();
    expect(screen.queryByText('Prototyping')).not.toBeInTheDocument();
  });

  it('shows category count in tab badge', () => {
    const { container } = render(<ElicitationPicker {...defaultProps} />);
    const tabCounts = container.querySelectorAll('.wfl-tab-count');
    // All (5), discovery (2), collaborative (2), creative (1)
    expect(tabCounts[0].textContent).toBe('5');
  });

  it('footer updates when filtering by category', () => {
    render(<ElicitationPicker {...defaultProps} />);
    
    const tabs = screen.getAllByRole('tab');
    const creativeTab = tabs.find(t => t.textContent?.includes('Creative'))!;
    fireEvent.click(creativeTab);

    expect(screen.getByText(/1 method/)).toBeInTheDocument();
    expect(screen.getByText(/in Creative/)).toBeInTheDocument();
  });

  it('capitalizes category names', () => {
    render(<ElicitationPicker {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    const labels = tabs.map(t => t.textContent);
    // Should contain "Discovery" (capitalized), not "discovery"
    expect(labels.some(l => l?.includes('Discovery'))).toBe(true);
    expect(labels.some(l => l?.includes('Collaborative'))).toBe(true);
    expect(labels.some(l => l?.includes('Creative'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Category grouping
// ═══════════════════════════════════════════════════════════════════════════════

describe('ElicitationPicker — category grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows category group headers when "All" tab is active', () => {
    const { container } = render(<ElicitationPicker {...defaultProps} />);
    const groupLabels = container.querySelectorAll('.wfl-phase-label');
    // 3 categories: discovery, collaborative, creative
    expect(groupLabels.length).toBe(3);
    expect(groupLabels[0].textContent).toBe('Discovery');
    expect(groupLabels[1].textContent).toBe('Collaborative');
    expect(groupLabels[2].textContent).toBe('Creative');
  });

  it('hides group headers when a specific category tab is selected', () => {
    const { container } = render(<ElicitationPicker {...defaultProps} />);

    const tabs = screen.getAllByRole('tab');
    const collabTab = tabs.find(t => t.textContent?.includes('Collaborative'))!;
    fireEvent.click(collabTab);

    const groupLabels = container.querySelectorAll('.wfl-phase-label');
    expect(groupLabels.length).toBe(0);
  });

  it('wraps method cards inside phase group containers', () => {
    const { container } = render(<ElicitationPicker {...defaultProps} />);
    const groups = container.querySelectorAll('.wfl-phase-group');
    // 3 groups: discovery (2 cards), collaborative (2 cards), creative (1 card)
    expect(groups.length).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Search
// ═══════════════════════════════════════════════════════════════════════════════

describe('ElicitationPicker — search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters by method name', () => {
    render(<ElicitationPicker {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search methods, descriptions, outputs…');
    fireEvent.change(input, { target: { value: 'Workshop' } });

    expect(screen.getByText('Workshop')).toBeInTheDocument();
    expect(screen.queryByText('Stakeholder Interview')).not.toBeInTheDocument();
  });

  it('filters by description', () => {
    render(<ElicitationPicker {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search methods, descriptions, outputs…');
    fireEvent.change(input, { target: { value: 'one-on-one' } });

    expect(screen.getByText('Stakeholder Interview')).toBeInTheDocument();
    expect(screen.queryByText('Workshop')).not.toBeInTheDocument();
  });

  it('filters by output pattern', () => {
    render(<ElicitationPicker {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search methods, descriptions, outputs…');
    fireEvent.change(input, { target: { value: 'Prototype feedback' } });

    expect(screen.getByText('Prototyping')).toBeInTheDocument();
    expect(screen.queryByText('Survey')).not.toBeInTheDocument();
  });

  it('shows no results message when nothing matches', () => {
    render(<ElicitationPicker {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search methods, descriptions, outputs…');
    fireEvent.change(input, { target: { value: 'zzzznotexist' } });

    expect(screen.getByText(/No methods match/)).toBeInTheDocument();
  });

  it('shows search clear button when search has text', () => {
    render(<ElicitationPicker {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search methods, descriptions, outputs…');
    fireEvent.change(input, { target: { value: 'test' } });

    expect(screen.getByTitle('Clear search')).toBeInTheDocument();
  });

  it('clears search when clear button is clicked', () => {
    render(<ElicitationPicker {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search methods, descriptions, outputs…');
    fireEvent.change(input, { target: { value: 'test' } });

    fireEvent.click(screen.getByTitle('Clear search'));
    expect(input).toHaveValue('');
  });

  it('footer shows matching count with search text', () => {
    render(<ElicitationPicker {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search methods, descriptions, outputs…');
    fireEvent.change(input, { target: { value: 'Workshop' } });

    expect(screen.getByText(/1 method/)).toBeInTheDocument();
    expect(screen.getByText(/matching "Workshop"/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Selection
// ═══════════════════════════════════════════════════════════════════════════════

describe('ElicitationPicker — method selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onSelect when a method card is clicked', () => {
    render(<ElicitationPicker {...defaultProps} />);
    
    const card = screen.getByText('Workshop').closest('button')!;
    fireEvent.click(card);

    expect(defaultProps.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ method_name: 'Workshop', category: 'collaborative' })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Close behavior
// ═══════════════════════════════════════════════════════════════════════════════

describe('ElicitationPicker — close behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes on overlay click', () => {
    const { container } = render(<ElicitationPicker {...defaultProps} />);
    const overlay = container.querySelector('.wfl-overlay')!;
    
    fireEvent.click(overlay);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('does not close when clicking inside the modal', () => {
    render(<ElicitationPicker {...defaultProps} />);
    const modal = screen.getByRole('dialog');
    fireEvent.click(modal);
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('Escape closes when search is empty', () => {
    render(<ElicitationPicker {...defaultProps} />);
    
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('first Escape clears search, second closes', () => {
    render(<ElicitationPicker {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search methods, descriptions, outputs…');
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
    render(<ElicitationPicker {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('close button calls onClose', () => {
    render(<ElicitationPicker {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Close (Esc)'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Method card display
// ═══════════════════════════════════════════════════════════════════════════════

describe('ElicitationPicker — card display', () => {
  it('shows category badge on each card', () => {
    const { container } = render(<ElicitationPicker {...defaultProps} />);
    const badges = container.querySelectorAll('.wfl-card-phase-badge');
    expect(badges.length).toBe(5);
  });

  it('shows description', () => {
    render(<ElicitationPicker {...defaultProps} />);
    expect(screen.getByText('One-on-one interviews')).toBeInTheDocument();
    expect(screen.getByText('Group facilitation')).toBeInTheDocument();
  });

  it('shows output pattern', () => {
    render(<ElicitationPicker {...defaultProps} />);
    expect(screen.getByText('Interview notes')).toBeInTheDocument();
    expect(screen.getByText('Survey results')).toBeInTheDocument();
  });
});
