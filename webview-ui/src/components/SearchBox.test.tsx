/**
 * Tests for SearchBox.tsx
 *
 * Tests: rendering, fuzzy matching, keyboard nav, escape behavior, match reporting
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBox } from './SearchBox';
import type { Artifact } from '../types';

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

const sampleArtifacts: Artifact[] = [
  makeArtifact({ id: 'epic-1', type: 'epic', title: 'User Authentication' }),
  makeArtifact({ id: 'story-1', type: 'story', title: 'Login Page', status: 'in-progress' }),
  makeArtifact({ id: 'story-2', type: 'story', title: 'Registration Flow' }),
  makeArtifact({ id: 'req-1', type: 'requirement', title: 'Password Policy' }),
  makeArtifact({ id: 'arch-1', type: 'architecture', title: 'API Gateway' }),
];

const defaultProps = {
  artifacts: sampleArtifacts,
  open: true,
  onClose: vi.fn(),
  onSelectResult: vi.fn(),
  onMatchesChange: vi.fn(),
};

// ═══════════════════════════════════════════════════════════════════════════════
// Rendering
// ═══════════════════════════════════════════════════════════════════════════════

describe('SearchBox — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(<SearchBox {...defaultProps} open={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the overlay when open is true', () => {
    const { container } = render(<SearchBox {...defaultProps} />);
    expect(container.querySelector('.sb-overlay')).toBeInTheDocument();
  });

  it('renders search input with placeholder', () => {
    render(<SearchBox {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search artifacts...')).toBeInTheDocument();
  });

  it('renders close button', () => {
    render(<SearchBox {...defaultProps} />);
    expect(screen.getByTitle('Close search (Esc)')).toBeInTheDocument();
  });

  it('does not show results dropdown initially (empty query)', () => {
    const { container } = render(<SearchBox {...defaultProps} />);
    expect(container.querySelector('.sb-results')).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Searching / filtering
// ═══════════════════════════════════════════════════════════════════════════════

describe('SearchBox — search filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows matching results when query matches title', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'Login' } });

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('matches by artifact type string', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'architecture' } });

    expect(screen.getByText('API Gateway')).toBeInTheDocument();
  });

  it('matches by type label', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'Epic' } });

    expect(screen.getByText('User Authentication')).toBeInTheDocument();
  });

  it('shows "No matching artifacts" for no results', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'zzzznotexist' } });

    expect(screen.getByText('No matching artifacts')).toBeInTheDocument();
  });

  it('shows match count', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'story' } });

    // Two stories match
    expect(screen.getByText('2 matches')).toBeInTheDocument();
  });

  it('shows singular "match" for single result', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'Password' } });

    expect(screen.getByText('1 match')).toBeInTheDocument();
  });

  it('is case-insensitive', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'login page' } });

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Match reporting
// ═══════════════════════════════════════════════════════════════════════════════

describe('SearchBox — onMatchesChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports match IDs when query changes', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'story' } });

    // Should have called onMatchesChange with Set containing story-1 and story-2
    const lastCall = defaultProps.onMatchesChange.mock.calls[defaultProps.onMatchesChange.mock.calls.length - 1][0];
    expect(lastCall).toBeInstanceOf(Set);
    expect(lastCall.has('story-1')).toBe(true);
    expect(lastCall.has('story-2')).toBe(true);
  });

  it('clears matches when search box closes', () => {
    const { rerender } = render(<SearchBox {...defaultProps} open={true} />);
    rerender(<SearchBox {...defaultProps} open={false} />);

    const lastCall = defaultProps.onMatchesChange.mock.calls[defaultProps.onMatchesChange.mock.calls.length - 1][0];
    expect(lastCall.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Keyboard navigation
// ═══════════════════════════════════════════════════════════════════════════════

describe('SearchBox — keyboard navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ArrowDown moves highlight to next item', () => {
    const { container } = render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'story' } });

    // First item is highlighted by default
    let highlighted = container.querySelectorAll('.sb-result-item.highlighted');
    expect(highlighted).toHaveLength(1);

    // Press ArrowDown
    fireEvent.keyDown(container.querySelector('.sb-overlay')!, { key: 'ArrowDown' });
    highlighted = container.querySelectorAll('.sb-result-item.highlighted');
    expect(highlighted).toHaveLength(1);
  });

  it('ArrowUp wraps around to last item', () => {
    const { container } = render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'story' } });

    // Press ArrowUp from index 0 → should wrap to last
    fireEvent.keyDown(container.querySelector('.sb-overlay')!, { key: 'ArrowUp' });

    const items = container.querySelectorAll('.sb-result-item');
    const lastItem = items[items.length - 1];
    expect(lastItem.classList.contains('highlighted')).toBe(true);
  });

  it('Enter selects the highlighted item and closes', () => {
    const { container } = render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'Login' } });

    fireEvent.keyDown(container.querySelector('.sb-overlay')!, { key: 'Enter' });

    expect(defaultProps.onSelectResult).toHaveBeenCalledWith('story-1');
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('clicking a result item selects it and closes', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'Login' } });

    fireEvent.click(screen.getByText('Login Page').closest('button')!);

    expect(defaultProps.onSelectResult).toHaveBeenCalledWith('story-1');
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Escape behavior
// ═══════════════════════════════════════════════════════════════════════════════

describe('SearchBox — escape behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('first Escape clears the query when there is text', () => {
    const { container } = render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'test' } });

    fireEvent.keyDown(container.querySelector('.sb-overlay')!, { key: 'Escape' });

    // Query should be cleared but search should still be open
    expect(input).toHaveValue('');
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('second Escape closes the search when query is empty', () => {
    const { container } = render(<SearchBox {...defaultProps} />);

    fireEvent.keyDown(container.querySelector('.sb-overlay')!, { key: 'Escape' });

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('close button calls onClose', () => {
    render(<SearchBox {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Close search (Esc)'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Mouse hover
// ═══════════════════════════════════════════════════════════════════════════════

describe('SearchBox — mouse interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mouseEnter on a result item highlights it', () => {
    const { container } = render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'story' } });

    const items = container.querySelectorAll('.sb-result-item');
    fireEvent.mouseEnter(items[1]); // hover second item

    expect(items[1].classList.contains('highlighted')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Result display
// ═══════════════════════════════════════════════════════════════════════════════

describe('SearchBox — result display', () => {
  it('shows type label, title, and status for each result', () => {
    const { container } = render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search artifacts...');
    fireEvent.change(input, { target: { value: 'Login' } });

    expect(screen.getByText('Story')).toBeInTheDocument(); // type label
    expect(screen.getByText('Login Page')).toBeInTheDocument(); // title
    expect(screen.getByText('In Progress')).toBeInTheDocument(); // status label
  });
});
