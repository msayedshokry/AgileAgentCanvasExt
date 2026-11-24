import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SprintHealthStrip } from './SprintHealthStrip';
import type { SprintHealth } from './SprintPlanningView';

const base: SprintHealth = {
  recommendation: { skill: 'aac-code-review', story_key: '1-2-signup', reason: 'review the completed implementation' },
  allDone: false,
  risks: [],
  openActionItems: [],
  warnings: [],
};

describe('SprintHealthStrip', () => {
  it('shows the next recommended skill, story and reason', () => {
    render(<SprintHealthStrip health={base} />);
    expect(screen.getByText('aac-code-review')).toBeTruthy();
    expect(screen.getByText('1-2-signup')).toBeTruthy();
    expect(screen.getByText(/review the completed implementation/)).toBeTruthy();
  });

  it('says the sprint is complete when nothing is left', () => {
    render(<SprintHealthStrip health={{ ...base, recommendation: null, allDone: true }} />);
    expect(screen.getByText(/All stories and retrospectives are done/)).toBeTruthy();
  });

  it('lists risks', () => {
    render(<SprintHealthStrip health={{ ...base, risks: ['sprint-status.yaml may be stale (last updated 2026-11-01 10:00)'] }} />);
    expect(screen.getByText(/may be stale/)).toBeTruthy();
    expect(screen.getByLabelText('Sprint health').textContent).toContain('1 risk');
  });

  it('collapses open action items behind a count and expands them on demand', () => {
    const items = [{ epic: 1, action: 'Add a lint rule', owner: 'Charlie', status: 'open' }];
    render(<SprintHealthStrip health={{ ...base, openActionItems: items }} />);
    const toggle = screen.getByRole('button', { name: /1 open action item/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Add a lint rule')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Add a lint rule')).toBeTruthy();
    expect(screen.getByText(/Charlie/)).toBeTruthy();
  });

  it('renders nothing extra when there are no risks or action items', () => {
    render(<SprintHealthStrip health={base} />);
    expect(screen.queryByRole('button', { name: /action item/ })).toBeNull();
    expect(screen.getByLabelText('Sprint health').textContent).not.toContain('risk');
  });
});
