/**
 * Tests for renderers/shared.tsx
 *
 * Tests Md (markdown renderer), CollapsibleSection, and ArtifactPicker components.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Md, CollapsibleSection, ArtifactPicker } from './shared';
import { mockVsCodeApi } from '../../test/setup';
import type { Artifact } from '../../types';

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

// ═══════════════════════════════════════════════════════════════════════════════
// Md — Markdown renderer
// ═══════════════════════════════════════════════════════════════════════════════

describe('Md', () => {
  it('renders null when text is undefined', () => {
    const { container } = render(<Md text={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders null when text is null', () => {
    const { container } = render(<Md text={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders null when text is empty string', () => {
    const { container } = render(<Md text="" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders markdown text as HTML', () => {
    const { container } = render(<Md text="**bold text**" />);
    const mdDiv = container.querySelector('.md-content');
    expect(mdDiv).toBeInTheDocument();
    expect(mdDiv!.innerHTML).toContain('<strong>bold text</strong>');
  });

  it('renders plain text correctly', () => {
    const { container } = render(<Md text="Hello world" />);
    const mdDiv = container.querySelector('.md-content');
    expect(mdDiv).toBeInTheDocument();
    expect(mdDiv!.textContent).toContain('Hello world');
  });

  it('applies custom className', () => {
    const { container } = render(<Md text="test" className="custom-class" />);
    const mdDiv = container.querySelector('.md-content');
    expect(mdDiv!.classList.contains('custom-class')).toBe(true);
  });

  it('has md-content class when no custom className', () => {
    const { container } = render(<Md text="test" />);
    const mdDiv = container.querySelector('.md-content');
    expect(mdDiv).toBeInTheDocument();
    // Should NOT have a trailing space in class name
    expect(mdDiv!.className).toBe('md-content');
  });

  it('renders GFM features (line breaks)', () => {
    const { container } = render(<Md text={"line 1\nline 2"} />);
    const mdDiv = container.querySelector('.md-content');
    // With breaks: true, newlines become <br>
    expect(mdDiv!.innerHTML).toContain('<br>');
  });

  it('renders markdown lists', () => {
    const { container } = render(<Md text={"- item 1\n- item 2"} />);
    const mdDiv = container.querySelector('.md-content');
    expect(mdDiv!.querySelector('ul')).toBeInTheDocument();
    expect(mdDiv!.querySelectorAll('li')).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CollapsibleSection
// ═══════════════════════════════════════════════════════════════════════════════

describe('CollapsibleSection', () => {
  beforeEach(() => {
    mockVsCodeApi.getState.mockReturnValue({});
  });

  it('renders the title', () => {
    render(
      <CollapsibleSection title="Test Section" sectionId="test-1">
        <p>Content</p>
      </CollapsibleSection>
    );
    expect(screen.getByText('Test Section')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <CollapsibleSection title="Section" sectionId="test-2">
        <p>Child content</p>
      </CollapsibleSection>
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders count when provided', () => {
    render(
      <CollapsibleSection title="Items" count={5} sectionId="test-3">
        <p>Content</p>
      </CollapsibleSection>
    );
    expect(screen.getByText('(5)')).toBeInTheDocument();
  });

  it('does not render count when not provided', () => {
    const { container } = render(
      <CollapsibleSection title="Items" sectionId="test-4">
        <p>Content</p>
      </CollapsibleSection>
    );
    expect(container.querySelector('.section-count')).not.toBeInTheDocument();
  });

  it('starts expanded by default', () => {
    const { container } = render(
      <CollapsibleSection title="Section" sectionId="test-5">
        <p>Content</p>
      </CollapsibleSection>
    );
    const section = container.querySelector('.detail-section');
    expect(section!.classList.contains('collapsed')).toBe(false);
  });

  it('starts collapsed when defaultCollapsed is true', () => {
    const { container } = render(
      <CollapsibleSection title="Section" sectionId="test-6" defaultCollapsed>
        <p>Content</p>
      </CollapsibleSection>
    );
    const section = container.querySelector('.detail-section');
    expect(section!.classList.contains('collapsed')).toBe(true);
  });

  it('toggles collapsed state on click', () => {
    const { container } = render(
      <CollapsibleSection title="Section" sectionId="test-7">
        <p>Content</p>
      </CollapsibleSection>
    );
    const header = container.querySelector('.collapsible-header')!;
    const section = container.querySelector('.detail-section')!;

    expect(section.classList.contains('collapsed')).toBe(false);

    // Click to collapse
    fireEvent.click(header);
    expect(section.classList.contains('collapsed')).toBe(true);

    // Click to expand
    fireEvent.click(header);
    expect(section.classList.contains('collapsed')).toBe(false);
  });

  it('toggles on Enter key', () => {
    const { container } = render(
      <CollapsibleSection title="Section" sectionId="test-8">
        <p>Content</p>
      </CollapsibleSection>
    );
    const header = container.querySelector('.collapsible-header')!;
    const section = container.querySelector('.detail-section')!;

    fireEvent.keyDown(header, { key: 'Enter' });
    expect(section.classList.contains('collapsed')).toBe(true);
  });

  it('toggles on Space key', () => {
    const { container } = render(
      <CollapsibleSection title="Section" sectionId="test-9">
        <p>Content</p>
      </CollapsibleSection>
    );
    const header = container.querySelector('.collapsible-header')!;
    const section = container.querySelector('.detail-section')!;

    fireEvent.keyDown(header, { key: ' ' });
    expect(section.classList.contains('collapsed')).toBe(true);
  });

  it('persists collapsed state to VS Code API', () => {
    const { container } = render(
      <CollapsibleSection title="Section" sectionId="persist-test">
        <p>Content</p>
      </CollapsibleSection>
    );
    const header = container.querySelector('.collapsible-header')!;

    fireEvent.click(header);

    // Should have called setState with collapsedSections containing our sectionId
    expect(mockVsCodeApi.setState).toHaveBeenCalled();
    const lastCall = mockVsCodeApi.setState.mock.calls[mockVsCodeApi.setState.mock.calls.length - 1][0];
    expect(lastCall.collapsedSections).toContain('persist-test');
  });

  it('reads persisted collapsed state on mount', () => {
    mockVsCodeApi.getState.mockReturnValue({
      collapsedSections: ['stored-section'],
    });

    const { container } = render(
      <CollapsibleSection title="Section" sectionId="stored-section">
        <p>Content</p>
      </CollapsibleSection>
    );
    const section = container.querySelector('.detail-section')!;
    expect(section.classList.contains('collapsed')).toBe(true);
  });

  it('applies custom className', () => {
    const { container } = render(
      <CollapsibleSection title="Section" sectionId="test-cls" className="custom">
        <p>Content</p>
      </CollapsibleSection>
    );
    const section = container.querySelector('.detail-section')!;
    expect(section.classList.contains('custom')).toBe(true);
  });

  it('has role="button" and tabIndex on header', () => {
    const { container } = render(
      <CollapsibleSection title="Section" sectionId="test-a11y">
        <p>Content</p>
      </CollapsibleSection>
    );
    const header = container.querySelector('.collapsible-header')!;
    expect(header.getAttribute('role')).toBe('button');
    expect(header.getAttribute('tabindex')).toBe('0');
  });

  it('shows chevron that rotates when collapsed', () => {
    const { container } = render(
      <CollapsibleSection title="Section" sectionId="test-chevron">
        <p>Content</p>
      </CollapsibleSection>
    );
    const chevron = container.querySelector('.collapse-chevron')!;
    expect(chevron.classList.contains('rotated')).toBe(false);

    const header = container.querySelector('.collapsible-header')!;
    fireEvent.click(header);
    expect(chevron.classList.contains('rotated')).toBe(true);
  });

  it('content div has hidden class when collapsed', () => {
    const { container } = render(
      <CollapsibleSection title="Section" sectionId="test-hidden" defaultCollapsed>
        <p>Content</p>
      </CollapsibleSection>
    );
    const content = container.querySelector('.collapsible-content')!;
    expect(content.classList.contains('hidden')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ArtifactPicker
// ═══════════════════════════════════════════════════════════════════════════════

describe('ArtifactPicker', () => {
  const epicA = makeArtifact({ id: 'epic-1', type: 'epic', title: 'Epic Alpha', status: 'draft' });
  const epicB = makeArtifact({ id: 'epic-2', type: 'epic', title: 'Epic Bravo', status: 'in-progress' });
  const epicC = makeArtifact({ id: 'epic-3', type: 'epic', title: 'Epic Charlie', status: 'done' });
  const epicD = makeArtifact({ id: 'epic-4', type: 'epic', title: 'Epic Delta', status: 'draft' });
  const storyX = makeArtifact({ id: 'story-1', type: 'story', title: 'Story X' });

  const defaultArtifacts = [epicA, epicB, epicC, epicD, storyX];

  it('renders a list of artifacts matching the given type', () => {
    const onChange = vi.fn();
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={onChange}
      />
    );

    // 4 epics should be listed
    expect(screen.getByText('epic-1')).toBeInTheDocument();
    expect(screen.getByText('epic-2')).toBeInTheDocument();
    expect(screen.getByText('epic-3')).toBeInTheDocument();
    expect(screen.getByText('epic-4')).toBeInTheDocument();
    // story should NOT be listed
    expect(screen.queryByText('story-1')).not.toBeInTheDocument();
  });

  it('shows search input when more than 3 matching artifacts', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText('Search epics...')).toBeInTheDocument();
  });

  it('does not show search input when 3 or fewer artifacts match', () => {
    const few = [epicA, epicB, epicC]; // exactly 3
    render(
      <ArtifactPicker
        artifacts={few}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );

    expect(screen.queryByPlaceholderText('Search epics...')).not.toBeInTheDocument();
  });

  it('filters artifacts by search query (by ID)', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search epics...');
    fireEvent.change(searchInput, { target: { value: 'epic-2' } });

    expect(screen.getByText('epic-2')).toBeInTheDocument();
    expect(screen.queryByText('epic-1')).not.toBeInTheDocument();
    expect(screen.queryByText('epic-3')).not.toBeInTheDocument();
  });

  it('filters artifacts by search query (by title)', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search epics...');
    fireEvent.change(searchInput, { target: { value: 'Charlie' } });

    expect(screen.getByText('epic-3')).toBeInTheDocument();
    expect(screen.queryByText('epic-1')).not.toBeInTheDocument();
  });

  it('shows empty message when no artifacts match search', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search epics...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    expect(screen.getByText('No epics matching "nonexistent"')).toBeInTheDocument();
  });

  it('shows empty message when no artifacts of the type exist', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="requirement"
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('No requirements available')).toBeInTheDocument();
  });

  it('calls onChange with toggled ID in multi mode', () => {
    const onChange = vi.fn();
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={onChange}
        mode="multi"
      />
    );

    // Click on epic-1 checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // epic-1 is first (sorted by id)

    expect(onChange).toHaveBeenCalledWith(['epic-1']);
  });

  it('calls onChange to remove ID in multi mode when already selected', () => {
    const onChange = vi.fn();
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={['epic-1', 'epic-2']}
        onChange={onChange}
        mode="multi"
      />
    );

    // Click on epic-1 to deselect
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(onChange).toHaveBeenCalledWith(['epic-2']);
  });

  it('uses radio buttons in single mode', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
        mode="single"
      />
    );

    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(4);
  });

  it('calls onChange with single ID in single mode', () => {
    const onChange = vi.fn();
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={onChange}
        mode="single"
      />
    );

    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]); // epic-2

    expect(onChange).toHaveBeenCalledWith(['epic-2']);
  });

  it('selects a different item in single mode replacing previous selection', () => {
    const onChange = vi.fn();
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={['epic-2']}
        onChange={onChange}
        mode="single"
      />
    );

    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0]); // click epic-1 while epic-2 is selected

    expect(onChange).toHaveBeenCalledWith(['epic-1']);
  });

  it('excludes specified artifact IDs', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
        excludeIds={['epic-2']}
      />
    );

    expect(screen.queryByText('epic-2')).not.toBeInTheDocument();
    expect(screen.getByText('epic-1')).toBeInTheDocument();
  });

  it('shows "Add by ID" button when allowCustom is true', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
        allowCustom
      />
    );

    expect(screen.getByText('+ Add by ID')).toBeInTheDocument();
  });

  it('does not show "Add by ID" button when allowCustom is false', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
        allowCustom={false}
      />
    );

    expect(screen.queryByText('+ Add by ID')).not.toBeInTheDocument();
  });

  it('shows custom input field when "Add by ID" is clicked', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
        allowCustom
      />
    );

    fireEvent.click(screen.getByText('+ Add by ID'));
    expect(screen.getByPlaceholderText('Type epic ID...')).toBeInTheDocument();
    expect(screen.getByText('Add')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('adds a custom ID via the Add button', () => {
    const onChange = vi.fn();
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={onChange}
        allowCustom
      />
    );

    fireEvent.click(screen.getByText('+ Add by ID'));
    const input = screen.getByPlaceholderText('Type epic ID...');
    fireEvent.change(input, { target: { value: 'custom-epic-99' } });
    fireEvent.click(screen.getByText('Add'));

    expect(onChange).toHaveBeenCalledWith(['custom-epic-99']);
  });

  it('adds a custom ID via Enter key', () => {
    const onChange = vi.fn();
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={onChange}
        allowCustom
      />
    );

    fireEvent.click(screen.getByText('+ Add by ID'));
    const input = screen.getByPlaceholderText('Type epic ID...');
    fireEvent.change(input, { target: { value: 'custom-epic-99' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['custom-epic-99']);
  });

  it('cancels custom input on Escape', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
        allowCustom
      />
    );

    fireEvent.click(screen.getByText('+ Add by ID'));
    expect(screen.getByPlaceholderText('Type epic ID...')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('Type epic ID...');
    fireEvent.keyDown(input, { key: 'Escape' });

    // Should hide the custom input and show "Add by ID" button again
    expect(screen.getByText('+ Add by ID')).toBeInTheDocument();
  });

  it('cancels custom input on Cancel button click', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
        allowCustom
      />
    );

    fireEvent.click(screen.getByText('+ Add by ID'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.getByText('+ Add by ID')).toBeInTheDocument();
  });

  it('shows custom ID tags for selectedIds not in available artifacts', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={['external-epic-99']}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('external-epic-99')).toBeInTheDocument();
  });

  it('removes custom ID tag on remove button click', () => {
    const onChange = vi.fn();
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={['external-epic-99']}
        onChange={onChange}
      />
    );

    // Find the remove button (×) next to the custom tag
    const removeBtn = screen.getByTitle('Remove');
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('clears search when clear button is clicked', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search epics...');
    fireEvent.change(searchInput, { target: { value: 'epic-2' } });

    // Only epic-2 shown
    expect(screen.queryByText('epic-1')).not.toBeInTheDocument();

    // Click clear button
    const clearBtn = screen.getByTitle('Clear search');
    fireEvent.click(clearBtn);

    // All epics back
    expect(screen.getByText('epic-1')).toBeInTheDocument();
    expect(screen.getByText('epic-2')).toBeInTheDocument();
  });

  it('uses custom placeholder', () => {
    render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
        placeholder="Find an epic..."
      />
    );

    expect(screen.getByPlaceholderText('Find an epic...')).toBeInTheDocument();
  });

  it('marks selected items with selected class', () => {
    const { container } = render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={['epic-2']}
        onChange={vi.fn()}
      />
    );

    const selectedItems = container.querySelectorAll('.artifact-picker-item.selected');
    expect(selectedItems).toHaveLength(1);
  });

  it('displays artifact status with appropriate class', () => {
    const { container } = render(
      <ArtifactPicker
        artifacts={defaultArtifacts}
        artifactType="epic"
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );

    const statusBadges = container.querySelectorAll('.artifact-picker-status');
    expect(statusBadges.length).toBe(4); // 4 epics
    // First one should have status-draft class
    expect(statusBadges[0].classList.contains('status-draft')).toBe(true);
  });
});
