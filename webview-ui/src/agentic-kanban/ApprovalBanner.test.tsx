/**
 * Tests for ApprovalBanner.tsx
 *
 * Tests: null-state (renders nothing), policy failure rendering,
 * Approve/Deny button callbacks, workflowId display, multiple failures.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalBanner, type ApprovalRequest } from './ApprovalBanner';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    artifactId: 'S-1',
    workflowId: 'aac-kanban-dev-executor',
    policyFailures: [
      {
        policyId: 'required-fields',
        failures: ['Story must have a title', 'Story must have a user story (I want...)'],
      },
    ],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Null / empty state
// ═══════════════════════════════════════════════════════════════════════════════

describe('ApprovalBanner — null state', () => {
  it('renders nothing when request is null', () => {
    const { container } = render(
      <ApprovalBanner request={null} onRespond={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the banner when request is provided', () => {
    render(
      <ApprovalBanner request={makeRequest()} onRespond={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Rendering: policy failures
// ═══════════════════════════════════════════════════════════════════════════════

describe('ApprovalBanner — policy failure rendering', () => {
  it('renders the banner title', () => {
    render(
      <ApprovalBanner request={makeRequest()} onRespond={vi.fn()} />,
    );
    expect(
      screen.getByText('Agent needs your approval to proceed'),
    ).toBeInTheDocument();
  });

  it('renders the warning icon', () => {
    const { container } = render(
      <ApprovalBanner request={makeRequest()} onRespond={vi.fn()} />,
    );
    const icon = container.querySelector('.approval-banner-icon');
    expect(icon).toBeInTheDocument();
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders all policy failure IDs', () => {
    render(
      <ApprovalBanner request={makeRequest()} onRespond={vi.fn()} />,
    );
    expect(screen.getByText('required-fields')).toBeInTheDocument();
  });

  it('renders all failure messages', () => {
    render(
      <ApprovalBanner request={makeRequest()} onRespond={vi.fn()} />,
    );
    expect(
      screen.getByText('Story must have a title'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Story must have a user story (I want...)'),
    ).toBeInTheDocument();
  });

  it('renders multiple policy failure groups', () => {
    render(
      <ApprovalBanner
        request={makeRequest({
          policyFailures: [
            {
              policyId: 'required-fields',
              failures: ['Missing title'],
            },
            {
              policyId: 'schema-conformance',
              failures: ['Invalid schema: status must be a string'],
            },
          ],
        })}
        onRespond={vi.fn()}
      />,
    );
    expect(screen.getByText('required-fields')).toBeInTheDocument();
    expect(screen.getByText('schema-conformance')).toBeInTheDocument();
    expect(screen.getByText('Missing title')).toBeInTheDocument();
    expect(
      screen.getByText('Invalid schema: status must be a string'),
    ).toBeInTheDocument();
  });

  it('does not render the failure list when policyFailures is empty', () => {
    const { container } = render(
      <ApprovalBanner
        request={makeRequest({ policyFailures: [] })}
        onRespond={vi.fn()}
      />,
    );
    expect(
      container.querySelector('.approval-banner-failures'),
    ).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Rendering: artifact + workflow display
// ═══════════════════════════════════════════════════════════════════════════════

describe('ApprovalBanner — artifact and workflow display', () => {
  it('renders the artifact ID', () => {
    render(
      <ApprovalBanner request={makeRequest()} onRespond={vi.fn()} />,
    );
    expect(screen.getByText('S-1')).toBeInTheDocument();
  });

  it('renders the workflow ID when provided', () => {
    render(
      <ApprovalBanner
        request={makeRequest({ workflowId: 'aac-kanban-dev-executor' })}
        onRespond={vi.fn()}
      />,
    );
    expect(
      screen.getByText('aac-kanban-dev-executor'),
    ).toBeInTheDocument();
  });

  it('does not render workflow span when workflowId is undefined', () => {
    const { container } = render(
      <ApprovalBanner
        request={makeRequest({ workflowId: undefined })}
        onRespond={vi.fn()}
      />,
    );
    expect(
      container.querySelector('.approval-banner-workflow'),
    ).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Approve / Deny buttons
// ═══════════════════════════════════════════════════════════════════════════════

describe('ApprovalBanner — button rendering', () => {
  it('renders both Approve and Deny buttons', () => {
    render(
      <ApprovalBanner request={makeRequest()} onRespond={vi.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: 'Approve' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Deny' }),
    ).toBeInTheDocument();
  });

  it('Approve button has the approve CSS class', () => {
    render(
      <ApprovalBanner request={makeRequest()} onRespond={vi.fn()} />,
    );
    const btn = screen.getByRole('button', { name: 'Approve' });
    expect(btn.className).toMatch(/approval-banner-btn--approve/);
  });

  it('Deny button has the deny CSS class', () => {
    render(
      <ApprovalBanner request={makeRequest()} onRespond={vi.fn()} />,
    );
    const btn = screen.getByRole('button', { name: 'Deny' });
    expect(btn.className).toMatch(/approval-banner-btn--deny/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Click handlers
// ═══════════════════════════════════════════════════════════════════════════════

describe('ApprovalBanner — click handlers', () => {
  let onRespond: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onRespond = vi.fn();
  });

  it('calls onRespond(true) when Approve is clicked', () => {
    render(
      <ApprovalBanner request={makeRequest()} onRespond={onRespond} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onRespond).toHaveBeenCalledWith(true);
    expect(onRespond).toHaveBeenCalledTimes(1);
  });

  it('calls onRespond(false) when Deny is clicked', () => {
    render(
      <ApprovalBanner request={makeRequest()} onRespond={onRespond} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(onRespond).toHaveBeenCalledWith(false);
    expect(onRespond).toHaveBeenCalledTimes(1);
  });

  it('allows multiple clicks on Approve (each fires callback)', () => {
    render(
      <ApprovalBanner request={makeRequest()} onRespond={onRespond} />,
    );
    const approveBtn = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approveBtn);
    fireEvent.click(approveBtn);
    expect(onRespond).toHaveBeenCalledTimes(2);
    expect(onRespond).toHaveBeenCalledWith(true);
  });

  it('allows multiple clicks on Deny (each fires callback)', () => {
    render(
      <ApprovalBanner request={makeRequest()} onRespond={onRespond} />,
    );
    const denyBtn = screen.getByRole('button', { name: 'Deny' });
    fireEvent.click(denyBtn);
    fireEvent.click(denyBtn);
    expect(onRespond).toHaveBeenCalledTimes(2);
    expect(onRespond).toHaveBeenCalledWith(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Accessibility
// ═══════════════════════════════════════════════════════════════════════════════

describe('ApprovalBanner — accessibility', () => {
  it('has role="alert" for screen reader announcement', () => {
    render(
      <ApprovalBanner request={makeRequest()} onRespond={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has aria-live="assertive" for immediate announcement', () => {
    render(
      <ApprovalBanner request={makeRequest()} onRespond={vi.fn()} />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('ApprovalBanner — edge cases', () => {
  it('renders correctly with many policy failures', () => {
    const manyFailures = Array.from({ length: 10 }, (_, i) => ({
      policyId: `policy-${i}`,
      failures: [`Failure message ${i}a`, `Failure message ${i}b`],
    }));
    render(
      <ApprovalBanner
        request={makeRequest({ policyFailures: manyFailures })}
        onRespond={vi.fn()}
      />,
    );
    // All policy IDs should be visible
    for (let i = 0; i < 10; i++) {
      expect(screen.getByText(`policy-${i}`)).toBeInTheDocument();
    }
    // All failure messages should be visible
    expect(screen.getByText('Failure message 0a')).toBeInTheDocument();
    expect(screen.getByText('Failure message 9b')).toBeInTheDocument();
  });

  it('renders with an empty failures array inside a policy', () => {
    render(
      <ApprovalBanner
        request={makeRequest({
          policyFailures: [{ policyId: 'empty-policy', failures: [] }],
        })}
        onRespond={vi.fn()}
      />,
    );
    expect(screen.getByText('empty-policy')).toBeInTheDocument();
    // Nothing else rendered for this policy's failures
  });
});
