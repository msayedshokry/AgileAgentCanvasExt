/**
 * Tests for VisualPlanModal.tsx — the in-canvas popup for visual-plan review.
 *
 * Covers:
 *   - Rendering with and without a plan payload
 *   - Open in Editor button posts the openVisualPlan IPC
 *   - Approve / Request Changes / Comment buttons forward to the IPC
 *   - Backdrop click and Escape key both close the modal
 *   - Empty plan shows the renderer empty state (graceful fallback)
 *   - Generating plan shows the spinner (graceful fallback)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VisualPlanModal } from './VisualPlanModal';
import type { VisualPlan } from './types';

// Mock vscodeApi so postMessage calls in the modal are recorded, not thrown.
const postMessageMock = vi.fn();
vi.mock('../vscodeApi', () => ({
  vscode: {
    postMessage: (msg: unknown) => postMessageMock(msg),
    getState: () => ({}),
    setState: () => undefined,
  },
}));

const samplePlan: VisualPlan = {
  id: 'plan-1',
  title: 'Refactor auth flow',
  goal: 'Migrate to OAuth2',
  status: 'pending',
  createdAt: 0,
  updatedAt: 0,
  sourceArtifactId: 'epic-1',
  targets: ['src/auth/**'],
  sections: [
    {
      id: 'sec-overview',
      kind: 'overview',
      markdown: '## Summary\n\nReplace legacy session-cookie auth with OAuth2.',
    },
    {
      id: 'sec-tasks',
      kind: 'tasks',
      tasks: [
        { id: 't1', title: 'Add OAuth2 client config', priority: 'P1' },
        { id: 't2', title: 'Migrate login route', priority: 'P2' },
      ],
    },
  ],
  comments: [],
};

describe('VisualPlanModal', () => {
  beforeEach(() => {
    postMessageMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Rendering ────────────────────────────────────────────────────────────

  it('renders without crashing', () => {
    const { container } = render(
      <VisualPlanModal artifactId="plan-1" plan={samplePlan} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('uses vp-modal-overlay + vp-modal classes', () => {
    const { container } = render(
      <VisualPlanModal artifactId="plan-1" plan={samplePlan} onClose={vi.fn()} />
    );
    expect(container.querySelector('.vp-modal-overlay')).toBeInTheDocument();
    expect(container.querySelector('.vp-modal')).toBeInTheDocument();
  });

  it('renders toolbar title and Open-in-Editor + close buttons', () => {
    render(<VisualPlanModal artifactId="plan-1" plan={samplePlan} onClose={vi.fn()} />);
    // Toolbar shows the plan title; the sections header also shows it, so expect 2+ matches
    expect(screen.getAllByText(samplePlan.title).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText('Open in new editor window')).toBeInTheDocument();
    expect(screen.getByLabelText('Close plan modal')).toBeInTheDocument();
  });

  it('renders with null plan (graceful empty state)', () => {
    render(<VisualPlanModal artifactId="plan-1" plan={null} onClose={vi.fn()} />);
    expect(screen.getByText(/still (generating|finalising)/i)).toBeInTheDocument();
  });

  it('renders generating-state spinner when plan.status === "generating"', () => {
    const generatingPlan: VisualPlan = { ...samplePlan, status: 'generating', goal: 'test goal' };
    render(<VisualPlanModal artifactId="plan-1" plan={generatingPlan} onClose={vi.fn()} />);
    expect(screen.getByText(/Generating Visual Plan/)).toBeInTheDocument();
  });

  it('shows the plan title in the renderer header when plan is loaded', () => {
    render(<VisualPlanModal artifactId="plan-1" plan={samplePlan} onClose={vi.fn()} />);
    // Plan title now appears in both the modal toolbar AND the sections header
    const matches = screen.getAllByText(samplePlan.title);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  // ── IPC: Open in Editor ──────────────────────────────────────────────────

  it('posts openVisualPlan IPC when Open-in-Editor is clicked', () => {
    render(<VisualPlanModal artifactId="plan-1" plan={samplePlan} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Open in new editor window'));
    expect(postMessageMock).toHaveBeenCalledWith({
      type: 'openVisualPlan',
      artifactId: 'plan-1',
    });
  });

  // ── IPC: Approve / Request Changes / Comment ────────────────────────────

  it('posts visualPlan:approve when Approve & Dispatch is clicked with a selection', () => {
    render(<VisualPlanModal artifactId="plan-1" plan={samplePlan} onClose={vi.fn()} />);
    // The renderer opens on `sections[0]` (overview) — switch to the
    // Tasks outline so the checkboxes are in the DOM.
    fireEvent.click(screen.getByText('Tasks'));
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // select t1
    fireEvent.click(screen.getByText('Approve & Dispatch'));
    expect(postMessageMock).toHaveBeenCalledWith({
      type: 'visualPlan:approve',
      planId: 'plan-1',
      taskIds: ['t1'],
    });
  });

  it('posts visualPlan:requestChanges when Request Changes is clicked', () => {
    render(<VisualPlanModal artifactId="plan-1" plan={samplePlan} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Request Changes'));
    expect(postMessageMock).toHaveBeenCalledWith({
      type: 'visualPlan:requestChanges',
      planId: 'plan-1',
      comments: [],
    });
  });

  // ── Close behaviors ─────────────────────────────────────────────────────

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn();
    render(<VisualPlanModal artifactId="plan-1" plan={samplePlan} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close plan modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <VisualPlanModal artifactId="plan-1" plan={samplePlan} onClose={onClose} />
    );
    fireEvent.click(container.querySelector('.vp-modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when the modal body is clicked (stopPropagation)', () => {
    const onClose = vi.fn();
    const { container } = render(
      <VisualPlanModal artifactId="plan-1" plan={samplePlan} onClose={onClose} />
    );
    fireEvent.click(container.querySelector('.vp-modal')!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<VisualPlanModal artifactId="plan-1" plan={samplePlan} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose on other keys', () => {
    const onClose = vi.fn();
    render(<VisualPlanModal artifactId="plan-1" plan={samplePlan} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── Cleanup ─────────────────────────────────────────────────────────────

  it('removes keydown listener on unmount', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <VisualPlanModal artifactId="plan-1" plan={samplePlan} onClose={onClose} />
    );
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── Cycle (prev/next visual-plan) ────────────────────────────────────────

  // A small set of visual-plan artifacts used to drive the cycle tests.
  // IDs are sorted alphabetically: plan-a, plan-b, plan-c.
  const allPlans = [
    { id: 'plan-a', type: 'visual-plan' } as const,
    { id: 'plan-b', type: 'visual-plan' } as const,
    { id: 'plan-c', type: 'visual-plan' } as const,
  ];

  it('hides prev/next controls when allPlans is undefined', () => {
    render(
      <VisualPlanModal artifactId="plan-a" plan={samplePlan} onClose={vi.fn()} />
    );
    expect(screen.queryByTestId('vp-modal-prev-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('vp-modal-next-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('vp-modal-cycle-counter')).not.toBeInTheDocument();
  });

  it('hides prev/next controls when only one plan exists', () => {
    render(
      <VisualPlanModal
        artifactId="plan-a"
        plan={samplePlan}
        allPlans={[allPlans[0]]}
        onNavigate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByTestId('vp-modal-prev-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('vp-modal-next-btn')).not.toBeInTheDocument();
  });

  it('renders cycle controls with correct counter when 2+ plans', () => {
    render(
      <VisualPlanModal
        artifactId="plan-b"
        plan={samplePlan}
        allPlans={allPlans as any}
        onNavigate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId('vp-modal-prev-btn')).toBeInTheDocument();
    expect(screen.getByTestId('vp-modal-next-btn')).toBeInTheDocument();
    expect(screen.getByTestId('vp-modal-cycle-counter')).toHaveTextContent('2 / 3');
  });

  it('calls onNavigate(-1) when prev button is clicked', () => {
    const onNavigate = vi.fn();
    render(
      <VisualPlanModal
        artifactId="plan-b"
        plan={samplePlan}
        allPlans={allPlans as any}
        onNavigate={onNavigate}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('vp-modal-prev-btn'));
    expect(onNavigate).toHaveBeenCalledWith(-1);
  });

  it('calls onNavigate(1) when next button is clicked', () => {
    const onNavigate = vi.fn();
    render(
      <VisualPlanModal
        artifactId="plan-b"
        plan={samplePlan}
        allPlans={allPlans as any}
        onNavigate={onNavigate}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('vp-modal-next-btn'));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it('does not call onNavigate when ArrowLeft/Right pressed and no cycle is active', () => {
    const onNavigate = vi.fn();
    render(
      <VisualPlanModal artifactId="plan-a" plan={samplePlan} onNavigate={onNavigate} onClose={vi.fn()} />
    );
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('calls onNavigate(-1) on ArrowLeft', () => {
    const onNavigate = vi.fn();
    render(
      <VisualPlanModal
        artifactId="plan-b"
        plan={samplePlan}
        allPlans={allPlans as any}
        onNavigate={onNavigate}
        onClose={vi.fn()}
      />
    );
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(onNavigate).toHaveBeenCalledWith(-1);
  });

  it('calls onNavigate(1) on ArrowRight', () => {
    const onNavigate = vi.fn();
    render(
      <VisualPlanModal
        artifactId="plan-b"
        plan={samplePlan}
        allPlans={allPlans as any}
        onNavigate={onNavigate}
        onClose={vi.fn()}
      />
    );
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it('does NOT call onNavigate on ArrowLeft when an input is focused', () => {
    const onNavigate = vi.fn();
    render(
      <VisualPlanModal
        artifactId="plan-b"
        plan={samplePlan}
        allPlans={allPlans as any}
        onNavigate={onNavigate}
        onClose={vi.fn()}
      />
    );
    // Render a throwaway input and fire keydown with it as the target,
    // matching how the real listener inspects `e.target`.
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowLeft' });
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    document.body.removeChild(input);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('Escape still closes the modal even with cycle controls active', () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    render(
      <VisualPlanModal
        artifactId="plan-b"
        plan={samplePlan}
        allPlans={allPlans as any}
        onNavigate={onNavigate}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
