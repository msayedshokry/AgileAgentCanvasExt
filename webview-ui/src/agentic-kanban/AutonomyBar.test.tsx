/**
 * Tests for AutonomyBar.tsx
 *
 * Covers:
 *   P1 #6 — continuous mode toggle, display-state pill, pauseReasonLabel
 *   P1 #7 — inbox badge, dropdown popover, item aggregation
 *   Existing — scheduler controls, budget gauge, goal input, systemic banner
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { mockVsCodeApi } from '../test/setup';
import { AutonomyBar } from './AutonomyBar';
import type { SchedulerStateMessage, BudgetStatus, ProposedGoal, SystemicIssue } from './AutonomyBar';
import type { ApprovalRequest } from './ApprovalBanner';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSchedulerState(overrides: Partial<SchedulerStateMessage> = {}): SchedulerStateMessage {
  return {
    state: 'idle',
    displayState: 'idle',
    nextUp: null,
    inProgress: [],
    enabled: true,
    pausedStories: [],
    continuousMode: false,
    ...overrides,
  };
}

function makeBudgetStatus(overrides: Partial<BudgetStatus> = {}): BudgetStatus {
  return {
    perStory: { used: 0, cap: 10, exceeded: false },
    daily: { used: 0, cap: 50, exceeded: false },
    anyExceeded: false,
    bannerMessage: null,
    remaining: 50,
    workflowBreakdown: [],
    ...overrides,
  };
}

function makeApprovalRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    artifactId: 'S-1',
    workflowId: 'aac-kanban-dev-executor',
    policyFailures: [
      { policyId: 'required-fields', failures: ['Story must have a title'] },
    ],
    ...overrides,
  };
}

function makeSystemicIssue(overrides: Partial<SystemicIssue> = {}): SystemicIssue {
  return {
    artifactId: 'S-999',
    artifactType: 'story',
    patterns: [
      {
        policyId: 'schema-conformance',
        severity: 'high',
        affectedArtifactIds: ['S-1', 'S-2'],
        count: 2,
        sampleMessage: 'Schema mismatch detected',
      },
    ],
    ...overrides,
  };
}

/** Default props for a clean "idle, no budget cap, no goal" render. */
function defaultProps() {
  return {
    schedulerState: null,
    budgetStatus: null,
    pendingGoal: null,
    onOpenGoalReview: vi.fn(),
    systemicIssue: null,
    onDismissSystemicIssue: vi.fn(),
    approvalRequest: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// P1 #6 — Continuous Mode Toggle
// ═══════════════════════════════════════════════════════════════════════════════

describe('AutonomyBar — P1 #6 continuous mode toggle', () => {
  it('renders OFF by default when continuousMode is false', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: false })} />);
    expect(screen.getByText('OFF')).toBeInTheDocument();
    expect(screen.queryByText('ON')).not.toBeInTheDocument();
  });

  it('renders ON when continuousMode is true', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: true })} />);
    expect(screen.getByText('ON')).toBeInTheDocument();
    expect(screen.queryByText('OFF')).not.toBeInTheDocument();
  });

  it('posts setContinuousMode with enabled=true when toggled from OFF', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: false })} />);
    fireEvent.click(screen.getByLabelText('Toggle continuous mode'));
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
      type: 'setSchedulerState',
      state: { action: 'setContinuousMode', enabled: true },
    });
  });

  it('posts setContinuousMode with enabled=false when toggled from ON', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: true })} />);
    fireEvent.click(screen.getByLabelText('Toggle continuous mode'));
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
      type: 'setSchedulerState',
      state: { action: 'setContinuousMode', enabled: false },
    });
  });

  it('checkbox checked state reflects continuousMode', () => {
    const { rerender } = render(
      <AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: false })} />,
    );
    expect(screen.getByLabelText('Toggle continuous mode')).not.toBeChecked();

    rerender(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: true })} />);
    expect(screen.getByLabelText('Toggle continuous mode')).toBeChecked();
  });

  it('has the toggle label text', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState()} />);
    expect(screen.getByText('Continuous:')).toBeInTheDocument();
  });

  it('applies --on class to switch when active', () => {
    const { container } = render(
      <AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: true })} />,
    );
    const sw = container.querySelector('.autonomy-continuous-switch');
    expect(sw?.classList.contains('autonomy-continuous-switch--on')).toBe(true);
  });

  it('does not apply --on class to switch when inactive', () => {
    const { container } = render(
      <AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: false })} />,
    );
    const sw = container.querySelector('.autonomy-continuous-switch');
    expect(sw?.classList.contains('autonomy-continuous-switch--on')).toBe(false);
  });

  it('applies --on class to text when active', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: true })} />);
    const txt = screen.getByText('ON');
    expect(txt.className).toMatch(/autonomy-continuous-text--on/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P1 #6 — Display-state pill
// ═══════════════════════════════════════════════════════════════════════════════

describe('AutonomyBar — P1 #6 display-state pill', () => {
  it('is hidden when continuous mode is OFF', () => {
    const { container } = render(
      <AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: false })} />,
    );
    expect(container.querySelector('.autonomy-display-state')).not.toBeInTheDocument();
  });

  it('is visible when continuous mode is ON', () => {
    render(
      <AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: true, displayState: 'idle' })} />,
    );
    expect(screen.getByText('● Idle')).toBeInTheDocument();
  });

  it('shows "▶ Running" when displayState is running', () => {
    render(
      <AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: true, displayState: 'running' })} />,
    );
    expect(screen.getByText('▶ Running')).toBeInTheDocument();
  });

  it('shows "🛑 Needs You" when displayState is waiting-on-human', () => {
    render(
      <AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: true, displayState: 'waiting-on-human' })} />,
    );
    expect(screen.getByText('🛑 Needs You')).toBeInTheDocument();
  });

  it('shows "⛔ Blocked" when displayState is blocked', () => {
    render(
      <AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: true, displayState: 'blocked' })} />,
    );
    expect(screen.getByText('⛔ Blocked')).toBeInTheDocument();
  });

  it('applies the correct CSS class for each display state', () => {
    const states: Array<[string, string]> = [
      ['idle', 'autonomy-display--idle'],
      ['running', 'autonomy-display--running'],
      ['waiting-on-human', 'autonomy-display--waiting'],
      ['blocked', 'autonomy-display--blocked'],
    ];
    for (const [ds, className] of states) {
      const { container, unmount } = render(
        <AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ continuousMode: true, displayState: ds as any })} />,
      );
      const el = container.querySelector('.autonomy-display-state');
      expect(el?.classList.contains(className)).toBe(true);
      unmount();
    }
  });

  it('shows pauseReason tooltip on the display-state pill', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        schedulerState={makeSchedulerState({ continuousMode: true, displayState: 'waiting-on-human', pauseReason: 'budget' })}
      />,
    );
    const pill = screen.getByText('🛑 Needs You');
    expect(pill.title).toContain('Paused — daily budget cap hit');
  });

  it('has no tooltip when pauseReason is undefined', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        schedulerState={makeSchedulerState({ continuousMode: true, displayState: 'running' })}
      />,
    );
    const pill = screen.getByText('▶ Running');
    expect(pill.title).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P1 #6 — pauseReasonLabel
// ═══════════════════════════════════════════════════════════════════════════════

describe('AutonomyBar — pauseReasonLabel', () => {
  const reasonCases: Array<[string, string]> = [
    ['budget', 'Paused — daily budget cap hit. Increase cap or wait for reset.'],
    ['circuit', 'Paused — circuit breaker open. Resume manually after investigation.'],
    ['approval', 'Paused — approval required for the next step.'],
    ['queue-empty', 'Paused — no eligible stories left. Add stories or adjust WIP.'],
  ];

  for (const [reason, expectedLabel] of reasonCases) {
    it(`translates "${reason}" pause reason`, () => {
      render(
        <AutonomyBar
          {...defaultProps()}
          schedulerState={makeSchedulerState({ continuousMode: true, displayState: 'waiting-on-human', pauseReason: reason })}
        />,
      );
      const pill = screen.getByText('🛑 Needs You');
      expect(pill.title).toContain(expectedLabel);
    });
  }

  it('falls back to raw reason for unknown values', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        schedulerState={makeSchedulerState({ continuousMode: true, displayState: 'waiting-on-human', pauseReason: 'custom-reason' })}
      />,
    );
    const pill = screen.getByText('🛑 Needs You');
    expect(pill.title).toBe('Paused — custom-reason.');
  });

  it('returns empty string when pauseReason is undefined', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        schedulerState={makeSchedulerState({ continuousMode: true, displayState: 'running', pauseReason: undefined })}
      />,
    );
    // The pill has title="" (which is an empty string attribute or undefined)
    const pill = screen.getByText('▶ Running');
    expect(pill.title).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P1 #7 — Inbox badge
// ═══════════════════════════════════════════════════════════════════════════════

describe('AutonomyBar — P1 #7 inbox badge', () => {
  it('renders the inbox button with bell icon', () => {
    render(<AutonomyBar {...defaultProps()} />);
    const btn = screen.getByRole('button', { name: /Needs you inbox/ });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain('Inbox');
  });

  it('shows count badge when inbox has items', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        approvalRequest={makeApprovalRequest()}
        schedulerState={makeSchedulerState()}
      />,
    );
    const badge = screen.getByText('1');
    expect(badge.className).toMatch(/autonomy-inbox-badge/);
  });

  it('does not show count badge when inbox is empty', () => {
    render(<AutonomyBar {...defaultProps()} />);
    const btn = screen.getByRole('button', { name: /Needs you inbox/ });
    expect(btn.querySelector('.autonomy-inbox-badge')).not.toBeInTheDocument();
  });

  it('applies critical class to badge when critical items exist', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        approvalRequest={makeApprovalRequest()}
      />,
    );
    const badge = screen.getByText('1');
    expect(badge.className).toMatch(/autonomy-inbox-badge--critical/);
  });

  it('applies critical class to button when critical items exist', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        approvalRequest={makeApprovalRequest()}
      />,
    );
    const btn = screen.getByRole('button', { name: /Needs you inbox/ });
    expect(btn.className).toMatch(/autonomy-inbox-btn--critical/);
  });

  it('does not apply critical class when only warning items exist', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        budgetStatus={makeBudgetStatus({ daily: { used: 60, cap: 50, exceeded: true }, anyExceeded: true })}
        schedulerState={makeSchedulerState({ continuousMode: true })}
      />,
    );
    const badge = screen.getByText('1');
    expect(badge.className).not.toMatch(/--critical/);
  });

  it('aria-label reflects item count', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        approvalRequest={makeApprovalRequest()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Needs you inbox — 1 item' })).toBeInTheDocument();
  });

  it('aria-label pluralises correctly for multiple items', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        approvalRequest={makeApprovalRequest()}
        budgetStatus={makeBudgetStatus({ daily: { used: 60, cap: 50, exceeded: true }, anyExceeded: true })}
        schedulerState={makeSchedulerState()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Needs you inbox — 2 items' })).toBeInTheDocument();
  });

  it('aria-expanded is false when dropdown is closed', () => {
    render(<AutonomyBar {...defaultProps()} />);
    expect(screen.getByRole('button', { name: /Needs you inbox/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('aria-expanded is true when dropdown is open', () => {
    render(<AutonomyBar {...defaultProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Needs you inbox/ }));
    expect(screen.getByRole('button', { name: /Needs you inbox/ })).toHaveAttribute('aria-expanded', 'true');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P1 #7 — Inbox dropdown popover
// ═══════════════════════════════════════════════════════════════════════════════

describe('AutonomyBar — P1 #7 inbox dropdown', () => {
  it('dropdown is hidden by default', () => {
    const { container } = render(<AutonomyBar {...defaultProps()} />);
    expect(container.querySelector('.autonomy-inbox-dropdown')).not.toBeInTheDocument();
  });

  it('dropdown opens on inbox button click', () => {
    const { container } = render(<AutonomyBar {...defaultProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Needs you inbox/ }));
    expect(container.querySelector('.autonomy-inbox-dropdown')).toBeInTheDocument();
  });

  it('dropdown closes on second click', () => {
    const { container } = render(<AutonomyBar {...defaultProps()} />);
    const btn = screen.getByRole('button', { name: /Needs you inbox/ });
    fireEvent.click(btn);
    expect(container.querySelector('.autonomy-inbox-dropdown')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(container.querySelector('.autonomy-inbox-dropdown')).not.toBeInTheDocument();
  });

  it('shows empty state when no items', () => {
    render(<AutonomyBar {...defaultProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Needs you inbox/ }));
    expect(screen.getByText('All clear — nothing needs your attention.')).toBeInTheDocument();
  });

  it('Close button in footer closes the dropdown', () => {
    const { container } = render(<AutonomyBar {...defaultProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Needs you inbox/ }));
    const dropdown = container.querySelector('.autonomy-inbox-dropdown');
    expect(dropdown).toBeInTheDocument();

    fireEvent.click(within(dropdown!).getByText('Close'));
    expect(container.querySelector('.autonomy-inbox-dropdown')).not.toBeInTheDocument();
  });

  it('Escape key closes the dropdown', () => {
    const { container } = render(<AutonomyBar {...defaultProps()} />);
    const btn = screen.getByRole('button', { name: /Needs you inbox/ });
    fireEvent.click(btn);
    expect(container.querySelector('.autonomy-inbox-dropdown')).toBeInTheDocument();

    fireEvent.keyDown(btn, { key: 'Escape' });
    expect(container.querySelector('.autonomy-inbox-dropdown')).not.toBeInTheDocument();
  });

  it('clicking outside the dropdown closes it', () => {
    const { container } = render(<AutonomyBar {...defaultProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Needs you inbox/ }));
    expect(container.querySelector('.autonomy-inbox-dropdown')).toBeInTheDocument();

    // Simulate click outside — the useEffect listens on document mousedown
    fireEvent.mouseDown(document.body);
    expect(container.querySelector('.autonomy-inbox-dropdown')).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P1 #7 — Inbox item aggregation
// ═══════════════════════════════════════════════════════════════════════════════

describe('AutonomyBar — P1 #7 inbox item aggregation', () => {
  it('shows approval request as critical inbox item', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        approvalRequest={makeApprovalRequest({ artifactId: 'S-A2', workflowId: 'dev-workflow' })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Needs you inbox/ }));
    expect(screen.getByText('Approval needed for S-A2')).toBeInTheDocument();
    expect(screen.getByText('1 policy failure(s) in dev-workflow')).toBeInTheDocument();
    expect(screen.getByText('S-A2')).toBeInTheDocument();
    // Check severity border class
    const items = screen.getAllByRole('option');
    const approvalItem = items.find(i => i.textContent?.includes('Approval needed'));
    expect(approvalItem?.className).toMatch(/inbox-item--critical/);
  });

  it('shows budget exceeded as warning inbox item', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        budgetStatus={makeBudgetStatus({ daily: { used: 45, cap: 50, exceeded: true }, anyExceeded: true, bannerMessage: 'Daily budget exceeded' })}
        schedulerState={makeSchedulerState()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Needs you inbox/ }));
    expect(screen.getByText('Daily budget exceeded')).toBeInTheDocument();
    const items = screen.getAllByRole('option');
    const budgetItem = items.find(i => i.textContent?.includes('Daily budget'));
    expect(budgetItem?.className).toMatch(/inbox-item--warning/);
  });

  it('shows circuit breaker as critical inbox item', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        schedulerState={makeSchedulerState({ displayState: 'blocked', pauseReason: 'circuit' })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Needs you inbox/ }));
    expect(screen.getByText('Circuit breaker open')).toBeInTheDocument();
    const items = screen.getAllByRole('option');
    const circuitItem = items.find(i => i.textContent?.includes('Circuit breaker'));
    expect(circuitItem?.className).toMatch(/inbox-item--critical/);
  });

  it('shows queue-empty as info item only when continuous mode is ON', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        schedulerState={makeSchedulerState({ continuousMode: true, displayState: 'idle', pauseReason: 'queue-empty' })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Needs you inbox/ }));
    expect(screen.getByText('Queue empty — backlog drained')).toBeInTheDocument();
    const items = screen.getAllByRole('option');
    const qItem = items.find(i => i.textContent?.includes('Queue empty'));
    expect(qItem?.className).toMatch(/inbox-item--info/);
  });

  it('does NOT show queue-empty when continuous mode is OFF', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        schedulerState={makeSchedulerState({ continuousMode: false, displayState: 'idle', pauseReason: 'queue-empty' })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Needs you inbox/ }));
    expect(screen.queryByText('Queue empty — backlog drained')).not.toBeInTheDocument();
  });

  it('shows systemic issue patterns as inbox items', () => {
    const issue = makeSystemicIssue();
    // Add a second pattern
    issue.patterns.push({
      policyId: 'missing-acceptance-criteria',
      severity: 'critical',
      affectedArtifactIds: ['S-3'],
      count: 1,
      sampleMessage: 'No acceptance criteria found',
    });
    render(
      <AutonomyBar
        {...defaultProps()}
        systemicIssue={issue}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Needs you inbox/ }));
    expect(screen.getByText('schema-conformance — 2 artifact(s) affected')).toBeInTheDocument();
    expect(screen.getByText('missing-acceptance-criteria — 1 artifact(s) affected')).toBeInTheDocument();
  });

  it('aggregates multiple categories: approval + budget + circuit', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        approvalRequest={makeApprovalRequest({ artifactId: 'S-1' })}
        budgetStatus={makeBudgetStatus({ daily: { used: 60, cap: 50, exceeded: true }, anyExceeded: true, bannerMessage: 'Cap hit' })}
        schedulerState={makeSchedulerState({ pauseReason: 'circuit' })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Needs you inbox/ }));
    // 3 items + Close button
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
  });

  it('inbox item shows type icon', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        approvalRequest={makeApprovalRequest()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Needs you inbox/ }));
    const icon = document.querySelector('.autonomy-inbox-item-icon');
    expect(icon).toBeInTheDocument();
    expect(icon?.textContent).toBe('🛡');
  });

  it('uses correct icons for each item type', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        approvalRequest={makeApprovalRequest()}
        budgetStatus={makeBudgetStatus({ daily: { used: 60, cap: 50, exceeded: true }, anyExceeded: true })}
        schedulerState={makeSchedulerState({ pauseReason: 'circuit' })}
        systemicIssue={makeSystemicIssue()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Needs you inbox/ }));
    const icons = Array.from(document.querySelectorAll('.autonomy-inbox-item-icon'));
    const iconTexts = icons.map(i => i.textContent);
    expect(iconTexts).toContain('🛡');  // approval
    expect(iconTexts).toContain('💰');  // budget
    expect(iconTexts).toContain('⚡');  // circuit
    expect(iconTexts).toContain('🔬');  // systemic
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scheduler controls
// ═══════════════════════════════════════════════════════════════════════════════

describe('AutonomyBar — scheduler controls', () => {
  it('shows Start button when idle', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ state: 'idle' })} />);
    expect(screen.getByText('▶ Start')).toBeInTheDocument();
  });

  it('shows Pause + Stop + Toggle when running', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ state: 'running' })} />);
    expect(screen.getByText('⏸ Pause')).toBeInTheDocument();
    expect(screen.getByText('⏹ Stop')).toBeInTheDocument();
    expect(screen.getByText('⇄')).toBeInTheDocument();
  });

  it('shows Resume + Stop + Toggle when paused', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ state: 'paused' })} />);
    expect(screen.getByText('▶ Resume')).toBeInTheDocument();
    expect(screen.getByText('⏹ Stop')).toBeInTheDocument();
    expect(screen.getByText('⇄')).toBeInTheDocument();
  });

  it('does not show Start when already running', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ state: 'running' })} />);
    expect(screen.queryByText('▶ Start')).not.toBeInTheDocument();
  });

  it('Pause button posts pause message', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ state: 'running' })} />);
    fireEvent.click(screen.getByText('⏸ Pause'));
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
      type: 'setSchedulerState',
      state: { action: 'pause' },
    });
  });

  it('Resume button posts resume message', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ state: 'paused' })} />);
    fireEvent.click(screen.getByText('▶ Resume'));
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
      type: 'setSchedulerState',
      state: { action: 'resume' },
    });
  });

  it('Stop button posts stop message', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ state: 'running' })} />);
    fireEvent.click(screen.getByText('⏹ Stop'));
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
      type: 'setSchedulerState',
      state: { action: 'stop' },
    });
  });

  it('Toggle button posts toggle message', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ state: 'running' })} />);
    fireEvent.click(screen.getByText('⇄'));
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
      type: 'setSchedulerState',
      state: { action: 'toggle' },
    });
  });

  it('shows in-progress count when items are running', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        schedulerState={makeSchedulerState({ state: 'running', inProgress: ['S-1', 'S-2', 'S-3'] })}
      />,
    );
    expect(screen.getByText('3 running')).toBeInTheDocument();
  });

  it('does not show in-progress count when empty', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        schedulerState={makeSchedulerState({ state: 'running', inProgress: [] })}
      />,
    );
    // The in-progress text is e.g. "3 running" — when empty, no digit+running span exists
    expect(screen.queryByText(/^\d+ running$/)).not.toBeInTheDocument();
  });

  it('shows correct state label for idle/running/paused', () => {
    const cases: Array<[string, string]> = [
      ['idle', '● idle'],
      ['running', '▶ running'],
      ['paused', '⏸ paused'],
    ];
    for (const [state, label] of cases) {
      const { unmount } = render(
        <AutonomyBar {...defaultProps()} schedulerState={makeSchedulerState({ state: state as any })} />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Budget gauge
// ═══════════════════════════════════════════════════════════════════════════════

describe('AutonomyBar — budget gauge', () => {
  it('shows "No daily cap set" when cap is zero', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        budgetStatus={makeBudgetStatus({ daily: { used: 0, cap: 0, exceeded: false } })}
      />,
    );
    expect(screen.getByText('No daily cap set')).toBeInTheDocument();
  });

  it('shows gauge with percentage when cap is set', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        budgetStatus={makeBudgetStatus({ daily: { used: 25, cap: 50, exceeded: false } })}
      />,
    );
    expect(screen.getByText(/\$25\.0000 \/ \$50\.00 \(50%\)/)).toBeInTheDocument();
  });

  it('shows exceeded warning when anyExceeded is true', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        budgetStatus={makeBudgetStatus({ daily: { used: 60, cap: 50, exceeded: true }, anyExceeded: true })}
      />,
    );
    expect(screen.getByText('⚠ Cap hit')).toBeInTheDocument();
  });

  it('applies exceeded class to gauge when budget is exceeded', () => {
    const { container } = render(
      <AutonomyBar
        {...defaultProps()}
        budgetStatus={makeBudgetStatus({ daily: { used: 60, cap: 50, exceeded: true }, anyExceeded: true })}
      />,
    );
    expect(container.querySelector('.autonomy-bar-gauge--exceeded')).toBeInTheDocument();
  });

  it('handles null budget status gracefully', () => {
    render(<AutonomyBar {...defaultProps()} budgetStatus={null} />);
    expect(screen.getByText('No daily cap set')).toBeInTheDocument();
  });

  it('budget refresh button posts getBudgetStatus', () => {
    render(<AutonomyBar {...defaultProps()} budgetStatus={makeBudgetStatus()} />);
    fireEvent.click(screen.getByTitle('Refresh budget status'));
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
      type: 'getBudgetStatus',
    });
  });

  it('renders workflow cost chips', () => {
    render(
      <AutonomyBar
        {...defaultProps()}
        budgetStatus={makeBudgetStatus({
          workflowBreakdown: [
            { workflow: 'dev-story', cost: 3.5, inputTokens: 1000, outputTokens: 500, calls: 2 },
            { workflow: 'review-story', cost: 1.2, inputTokens: 800, outputTokens: 300, calls: 1 },
          ],
        })}
      />,
    );
    expect(screen.getByText('dev-story')).toBeInTheDocument();
    expect(screen.getByText('review-story')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Goal input
// ═══════════════════════════════════════════════════════════════════════════════

describe('AutonomyBar — goal input', () => {
  it('renders goal text input', () => {
    render(<AutonomyBar {...defaultProps()} />);
    expect(screen.getByPlaceholderText('Describe a goal to decompose into stories…')).toBeInTheDocument();
  });

  it('submits goal on Enter', () => {
    render(<AutonomyBar {...defaultProps()} />);
    const input = screen.getByPlaceholderText('Describe a goal to decompose into stories…');
    fireEvent.change(input, { target: { value: 'Build login flow' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
      type: 'submitGoal',
      text: 'Build login flow',
    });
  });

  it('submits goal on button click', () => {
    render(<AutonomyBar {...defaultProps()} />);
    fireEvent.change(
      screen.getByPlaceholderText('Describe a goal to decompose into stories…'),
      { target: { value: 'Build login flow' } },
    );
    fireEvent.click(screen.getByText('🎯 Submit Goal'));
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
      type: 'submitGoal',
      text: 'Build login flow',
    });
  });

  it('submit button is disabled when input is empty', () => {
    render(<AutonomyBar {...defaultProps()} />);
    expect(screen.getByText('🎯 Submit Goal')).toBeDisabled();
  });

  it('trims whitespace before submitting', () => {
    render(<AutonomyBar {...defaultProps()} />);
    const input = screen.getByPlaceholderText('Describe a goal to decompose into stories…');
    fireEvent.change(input, { target: { value: '  Build login flow  ' } });
    fireEvent.click(screen.getByText('🎯 Submit Goal'));
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
      type: 'submitGoal',
      text: 'Build login flow',
    });
  });

  it('does not submit on Shift+Enter', () => {
    render(<AutonomyBar {...defaultProps()} />);
    const input = screen.getByPlaceholderText('Describe a goal to decompose into stories…');
    fireEvent.change(input, { target: { value: 'Build login flow' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(mockVsCodeApi.postMessage).not.toHaveBeenCalled();
  });

  it('prevents double-submit during cooldown', () => {
    render(<AutonomyBar {...defaultProps()} />);
    const input = screen.getByPlaceholderText('Describe a goal to decompose into stories…');
    const submitBtn = screen.getByText('🎯 Submit Goal');

    fireEvent.change(input, { target: { value: 'Build login flow' } });
    fireEvent.click(submitBtn);
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledTimes(1);

    // Button should show submitting state and be disabled
    expect(screen.getByText('⟳ Submitting…')).toBeInTheDocument();

    // Click again — should not fire another postMessage
    fireEvent.click(screen.getByText('⟳ Submitting…'));
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledTimes(1);
  });

  it('does not submit empty/whitespace-only input', () => {
    render(<AutonomyBar {...defaultProps()} />);
    const input = screen.getByPlaceholderText('Describe a goal to decompose into stories…');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByText('🎯 Submit Goal'));
    expect(mockVsCodeApi.postMessage).not.toHaveBeenCalled();
  });

  it('shows review button when pendingGoal is provided', () => {
    const goal: ProposedGoal = {
      id: 'g-1',
      goal: 'Build login flow',
      status: 'review',
      proposedStories: [{ id: 's-1', title: 'Add login form' }],
      approvedStories: [],
    };
    render(<AutonomyBar {...defaultProps()} pendingGoal={goal} />);
    expect(screen.getByText('📋 Review (1)')).toBeInTheDocument();
  });

  it('calls onOpenGoalReview when review button clicked', () => {
    const onOpenGoalReview = vi.fn();
    const goal: ProposedGoal = {
      id: 'g-1',
      goal: 'Build login flow',
      status: 'review',
      proposedStories: [{ id: 's-1', title: 'Add login form' }],
      approvedStories: [],
    };
    render(<AutonomyBar {...defaultProps()} pendingGoal={goal} onOpenGoalReview={onOpenGoalReview} />);
    fireEvent.click(screen.getByText('📋 Review (1)'));
    expect(onOpenGoalReview).toHaveBeenCalledWith(goal);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Systemic issue banner
// ═══════════════════════════════════════════════════════════════════════════════

describe('AutonomyBar — systemic issue banner', () => {
  it('does not render when systemicIssue is null', () => {
    const { container } = render(<AutonomyBar {...defaultProps()} systemicIssue={null} />);
    expect(container.querySelector('.autonomy-bar-group--systemic')).not.toBeInTheDocument();
  });

  it('renders banner with issue count', () => {
    render(<AutonomyBar {...defaultProps()} systemicIssue={makeSystemicIssue()} />);
    expect(screen.getByText('1 systemic issue detected')).toBeInTheDocument();
  });

  it('pluralises count for multiple issues', () => {
    const issue = makeSystemicIssue();
    issue.patterns.push({
      policyId: 'p2',
      severity: 'low',
      affectedArtifactIds: ['S-3'],
      count: 1,
    });
    render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);
    expect(screen.getByText('2 systemic issues detected')).toBeInTheDocument();
  });

  it('toggle expands pattern details', () => {
    render(<AutonomyBar {...defaultProps()} systemicIssue={makeSystemicIssue()} />);
    // Patterns hidden by default
    expect(screen.queryByText(/schema-conformance/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Toggle pattern details'));
    expect(screen.getByText(/schema-conformance/)).toBeInTheDocument();
  });

  it('dismiss button calls onDismissSystemicIssue', () => {
    const onDismiss = vi.fn();
    render(<AutonomyBar {...defaultProps()} systemicIssue={makeSystemicIssue()} onDismissSystemicIssue={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Dismiss systemic issue banner'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows correct severity icon for critical', () => {
    const issue = makeSystemicIssue();
    issue.patterns = [{ ...issue.patterns[0], severity: 'critical' }];
    render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);
    // 🚨 for critical
    expect(document.querySelector('.autonomy-bar-systemic-icon')?.textContent).toBe('🚨');
  });

  it('shows correct severity icon for high', () => {
    render(<AutonomyBar {...defaultProps()} systemicIssue={makeSystemicIssue()} />);
    // ⚠ for high
    expect(document.querySelector('.autonomy-bar-systemic-icon')?.textContent).toBe('⚠');
  });

  it('shows correct severity icon for low', () => {
    const issue = makeSystemicIssue();
    issue.patterns = [{ ...issue.patterns[0], severity: 'low' }];
    render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);
    expect(document.querySelector('.autonomy-bar-systemic-icon')?.textContent).toBe('ℹ');
  });

  it('has role="alert" on the summary', () => {
    render(<AutonomyBar {...defaultProps()} systemicIssue={makeSystemicIssue()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows correct severity icon for medium severity', () => {
    const issue = makeSystemicIssue();
    issue.patterns = [{ ...issue.patterns[0], severity: 'medium' }];
    render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);
    // Source: maxSeverity === 'critical' ? '🚨' : maxSeverity === 'high' ? '⚠' : 'ℹ'
    // Medium is not high or critical, so it falls to 'ℹ'
    expect(document.querySelector('.autonomy-bar-systemic-icon')?.textContent).toBe('ℹ');
  });

  it('uses max-severity icon when multiple patterns have different severities', () => {
    const issue = makeSystemicIssue();
    issue.patterns = [
      { policyId: 'low-one', severity: 'low', affectedArtifactIds: ['S-1'], count: 1 },
      { policyId: 'critical-one', severity: 'critical', affectedArtifactIds: ['S-2'], count: 1, sampleMessage: 'urgent' },
    ];
    render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);
    // Banner should use the most severe icon: critical → 🚨
    expect(document.querySelector('.autonomy-bar-systemic-icon')?.textContent).toBe('🚨');
  });

  it('applies correct CSS banner class for critical severity', () => {
    const issue = makeSystemicIssue();
    issue.patterns = [{ ...issue.patterns[0], severity: 'critical' }];
    const { container } = render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);
    expect(container.querySelector('.autonomy-bar-systemic--critical')).toBeInTheDocument();
  });

  it('applies correct CSS banner class for high severity', () => {
    const { container } = render(<AutonomyBar {...defaultProps()} systemicIssue={makeSystemicIssue()} />);
    // makeSystemicIssue defaults to high severity
    expect(container.querySelector('.autonomy-bar-systemic--high')).toBeInTheDocument();
  });

  it('applies correct CSS banner class for low severity', () => {
    const issue = makeSystemicIssue();
    issue.patterns = [{ ...issue.patterns[0], severity: 'low' }];
    const { container } = render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);
    expect(container.querySelector('.autonomy-bar-systemic--low')).toBeInTheDocument();
  });

  it('applies correct CSS banner class for medium severity', () => {
    const issue = makeSystemicIssue();
    issue.patterns = [{ ...issue.patterns[0], severity: 'medium' }];
    const { container } = render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);
    // severityRank: low=1, medium=2, high=3, critical=4 → medium maps to the rank, but the banner
    // CSS class uses the raw severity string: autonomy-bar-systemic--medium
    expect(container.querySelector('.autonomy-bar-systemic--medium')).toBeInTheDocument();
  });

  it('does not render banner when patterns array is empty', () => {
    const issue = makeSystemicIssue();
    issue.patterns = [];
    const { container } = render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);
    expect(container.querySelector('.autonomy-bar-group--systemic')).not.toBeInTheDocument();
  });

  it('defaults max-severity to low when no patterns exist', () => {
    // The maxSeverity IIFE defaults to 'low' when patterns is empty —
    // but the banner is already hidden in that case. This test verifies
    // the function doesn't throw on empty patterns.
    const issue = makeSystemicIssue();
    issue.patterns = [];
    render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);
    // The component should render without crashing
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('truncates long sampleMessages at 80 chars', () => {
    const longMsg = 'A'.repeat(120);
    const issue = makeSystemicIssue();
    issue.patterns = [{
      policyId: 'long-msg',
      severity: 'high',
      affectedArtifactIds: ['S-1'],
      count: 1,
      sampleMessage: longMsg,
    }];
    render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);

    // Expand patterns to see the message
    fireEvent.click(screen.getByTitle('Toggle pattern details'));

    const msgEl = document.querySelector('.autonomy-bar-systemic-msg');
    expect(msgEl).toBeInTheDocument();
    // Should be truncated to 80 chars + '…'
    const text = msgEl!.textContent ?? '';
    expect(text).toContain('…');
    expect(text.length).toBeLessThan(85); // 80 + quotes + maybe ellipsis
  });

  it('shows short sampleMessages without truncation', () => {
    const issue = makeSystemicIssue();
    issue.patterns = [{
      policyId: 'short-msg',
      severity: 'low',
      affectedArtifactIds: ['S-1'],
      count: 1,
      sampleMessage: 'Short message',
    }];
    render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);
    fireEvent.click(screen.getByTitle('Toggle pattern details'));

    const msgEl = document.querySelector('.autonomy-bar-systemic-msg');
    expect(msgEl?.textContent).toContain('Short message');
    expect(msgEl?.textContent).not.toContain('…');
  });

  it('chevron toggles between ▸ and ▾ when expanded', () => {
    render(<AutonomyBar {...defaultProps()} systemicIssue={makeSystemicIssue()} />);

    // The chevron is inside the systemic toggle button — scope to that button
    const toggleBtn = screen.getByTitle('Toggle pattern details');
    expect(toggleBtn.textContent).toContain('▸');
    expect(toggleBtn.textContent).not.toContain('▾');

    fireEvent.click(toggleBtn);

    expect(toggleBtn.textContent).toContain('▾');
    expect(toggleBtn.textContent).not.toContain('▸');
  });

  it('shows affected artifact count per pattern', () => {
    const issue = makeSystemicIssue();
    issue.patterns = [{
      policyId: 'multi-artifact',
      severity: 'high',
      affectedArtifactIds: ['S-1', 'S-2', 'S-3', 'S-4', 'S-5'],
      count: 5,
    }];
    render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);
    fireEvent.click(screen.getByTitle('Toggle pattern details'));

    expect(screen.getByText('on 5 artifacts')).toBeInTheDocument();
  });

  it('singularises affected artifact count: on 1 artifact', () => {
    const issue = makeSystemicIssue();
    issue.patterns = [{
      policyId: 'single-artifact',
      severity: 'high',
      affectedArtifactIds: ['S-1'],
      count: 1,
    }];
    render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);
    fireEvent.click(screen.getByTitle('Toggle pattern details'));

    expect(screen.getByText('on 1 artifact')).toBeInTheDocument();
    expect(screen.queryByText('on 1 artifacts')).not.toBeInTheDocument();
  });

  it('shows severity tag with correct CSS class per pattern', () => {
    const issue = makeSystemicIssue();
    issue.patterns = [
      { policyId: 'crit', severity: 'critical' as const, affectedArtifactIds: ['S-1'], count: 1 },
      { policyId: 'low', severity: 'low' as const, affectedArtifactIds: ['S-2'], count: 1 },
    ];
    render(<AutonomyBar {...defaultProps()} systemicIssue={issue} />);
    fireEvent.click(screen.getByTitle('Toggle pattern details'));

    // Both severity tags should be visible with their CSS classes
    expect(document.querySelector('.autonomy-bar-systemic-severity--critical')).toBeInTheDocument();
    expect(document.querySelector('.autonomy-bar-systemic-severity--low')).toBeInTheDocument();
  });

  it('policyId is displayed for each pattern', () => {
    render(<AutonomyBar {...defaultProps()} systemicIssue={makeSystemicIssue()} />);
    fireEvent.click(screen.getByTitle('Toggle pattern details'));

    expect(screen.getByText('schema-conformance')).toBeInTheDocument();
  });

  it('severity text is uppercased in the tag', () => {
    render(<AutonomyBar {...defaultProps()} systemicIssue={makeSystemicIssue()} />);
    fireEvent.click(screen.getByTitle('Toggle pattern details'));

    // HIGH from 'high' → .toUpperCase()
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('aria-expanded toggles on the toggle button', () => {
    render(<AutonomyBar {...defaultProps()} systemicIssue={makeSystemicIssue()} />);
    const btn = screen.getByTitle('Toggle pattern details');

    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Null safety
// ═══════════════════════════════════════════════════════════════════════════════

describe('AutonomyBar — null safety', () => {
  it('renders without crashing with all null props', () => {
    const { container } = render(<AutonomyBar {...defaultProps()} />);
    expect(container).toBeTruthy();
    expect(screen.getByText('● idle')).toBeInTheDocument();
  });

  it('handles null schedulerState with defaults', () => {
    render(<AutonomyBar {...defaultProps()} schedulerState={null} />);
    expect(screen.getByText('● idle')).toBeInTheDocument();
    expect(screen.getByText('OFF')).toBeInTheDocument();
  });
});
