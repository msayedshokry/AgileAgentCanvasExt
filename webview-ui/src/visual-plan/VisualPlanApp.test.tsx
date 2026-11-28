// The plan's own tab follows its plan: written by an agent, retried, deleted.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { VisualPlan } from './types';

const posted: unknown[] = [];
vi.mock('../vscodeApi', () => ({ vscode: { postMessage: (m: unknown) => posted.push(m), getState: () => ({}), setState: () => undefined } }));

import { VisualPlanApp } from './VisualPlanApp';

const plan = (over: Partial<VisualPlan> = {}): VisualPlan => ({
  id: 'plan-a', title: 'Core loop', goal: 'Build the core loop', status: 'generating',
  createdAt: 0, updatedAt: 0, sections: [], comments: [], ...over,
});
const deliver = (data: unknown) => act(() => { window.dispatchEvent(new MessageEvent('message', { data })); });

beforeEach(() => { posted.length = 0; });

describe('the plan tab', () => {
  it('fills in when the agent writes the plan it is showing', () => {
    render(<VisualPlanApp />);
    deliver({ type: 'visualPlan:ready', plan: plan() });
    expect(screen.getByText('Generating Visual Plan…')).toBeInTheDocument();
    const written = plan({ status: 'pending', title: 'Core loop plan', sections: [{ id: 's1', kind: 'overview', markdown: 'Overview text' }] });
    deliver({ type: 'visualPlan:changed', plans: [plan({ id: 'other' }), written] });
    expect(screen.getByText('Core loop plan')).toBeInTheDocument();
  });

  it('follows a retry to the new plan, and empties when its plan is deleted', () => {
    render(<VisualPlanApp />);
    deliver({ type: 'visualPlan:ready', plan: plan({ status: 'failed' }) });
    expect(screen.getByTestId('vp-failed')).toBeInTheDocument();
    deliver({ type: 'visualPlan:deleted', planId: 'plan-a' });
    deliver({ type: 'visualPlan:generating', planId: 'plan-b', goal: 'Build the core loop' });
    expect(screen.getByText('Generating Visual Plan…')).toBeInTheDocument();
    deliver({ type: 'visualPlan:deleted', planId: 'plan-b' });
    expect(screen.getByText('No Visual Plan Yet')).toBeInTheDocument();
  });
});
