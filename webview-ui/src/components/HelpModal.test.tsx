/**
 * Tests for HelpModal.tsx
 *
 * Covers: rendering, section content, close behavior (button, overlay, Escape).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpModal } from './HelpModal';

describe('HelpModal', () => {
  // ── Rendering ───────────────────────────────────────────────────────────

  it('renders without crashing', () => {
    const { container } = render(<HelpModal onClose={vi.fn()} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders the title', () => {
    render(<HelpModal onClose={vi.fn()} />);
    expect(screen.getByText('Agile Agent Canvas Help')).toBeInTheDocument();
  });

  it('renders all 11 help sections', () => {
    render(<HelpModal onClose={vi.fn()} />);
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('Canvas Navigation')).toBeInTheDocument();
    expect(screen.getByText('Canvas Features')).toBeInTheDocument();
    expect(screen.getByText('Artifacts')).toBeInTheDocument();
    expect(screen.getByText('Card Actions')).toBeInTheDocument();
    expect(screen.getByText('Detail Panel')).toBeInTheDocument();
    expect(screen.getByText('AI Features')).toBeInTheDocument();
    expect(screen.getByText('Workflows')).toBeInTheDocument();
    expect(screen.getByText('Export & Import')).toBeInTheDocument();
    expect(screen.getByText('Schema Validation')).toBeInTheDocument();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
  });

  it('renders representative items from each section', () => {
    render(<HelpModal onClose={vi.fn()} />);
    // Getting Started
    expect(screen.getByText(/Use Agile Agent Canvas: New Project/)).toBeInTheDocument();
    // Canvas Navigation
    expect(screen.getByText(/Pan: Click and drag/)).toBeInTheDocument();
    // Canvas Features
    expect(screen.getByText(/Search \(\/\): Fuzzy search/)).toBeInTheDocument();
    // Artifacts
    expect(screen.getByText(/Product Brief, Vision/)).toBeInTheDocument();
    // Card Actions
    expect(screen.getByText(/Info \(i\): Open the detail panel/)).toBeInTheDocument();
    // Detail Panel
    expect(screen.getByText(/Edit Mode: Click Edit/)).toBeInTheDocument();
    // AI Features
    expect(screen.getByText(/Enhance \(sparkle\)/)).toBeInTheDocument();
    // Workflows
    expect(screen.getByText(/Click the Workflows button/)).toBeInTheDocument();
    // Export & Import
    expect(screen.getByText(/Export: Save your project/)).toBeInTheDocument();
    // Schema Validation
    expect(screen.getByText(/Validate: Click the wrench/)).toBeInTheDocument();
    // Keyboard Shortcuts
    expect(screen.getByText(/Escape: Close modals/)).toBeInTheDocument();
  });

  it('renders the footer tip', () => {
    render(<HelpModal onClose={vi.fn()} />);
    expect(screen.getByText(/Tip: Use Ctrl\+Shift\+P/)).toBeInTheDocument();
  });

  it('renders close button with aria-label', () => {
    render(<HelpModal onClose={vi.fn()} />);
    expect(screen.getByLabelText('Close help')).toBeInTheDocument();
  });

  it('renders footer Close button', () => {
    render(<HelpModal onClose={vi.fn()} />);
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  // ── CSS classes ─────────────────────────────────────────────────────────

  it('has help-overlay and help-modal classes', () => {
    const { container } = render(<HelpModal onClose={vi.fn()} />);
    expect(container.querySelector('.help-overlay')).toBeInTheDocument();
    expect(container.querySelector('.help-modal')).toBeInTheDocument();
  });

  it('renders help-section for each section', () => {
    const { container } = render(<HelpModal onClose={vi.fn()} />);
    const sections = container.querySelectorAll('.help-section');
    expect(sections.length).toBe(11);
  });

  // ── Close behaviors ─────────────────────────────────────────────────────

  it('calls onClose when X button clicked', () => {
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close help'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when footer Close button clicked', () => {
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<HelpModal onClose={onClose} />);
    const overlay = container.querySelector('.help-overlay')!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when modal body clicked (stopPropagation)', () => {
    const onClose = vi.fn();
    const { container } = render(<HelpModal onClose={onClose} />);
    const modal = container.querySelector('.help-modal')!;
    fireEvent.click(modal);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose on other keys', () => {
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── Cleanup ─────────────────────────────────────────────────────────────

  it('removes keydown listener on unmount', () => {
    const onClose = vi.fn();
    const { unmount } = render(<HelpModal onClose={onClose} />);
    unmount();
    // After unmount, Escape should not trigger onClose
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
