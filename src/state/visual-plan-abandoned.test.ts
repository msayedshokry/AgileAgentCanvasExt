import { describe, it, expect } from 'vitest';
import { ABANDONED_PLAN_MS, isEmptyFailedPlan, settleAbandonedPlan } from './visual-plan-store';
import type { VisualPlan } from '../types/visual-plan';

// Shape of a real stub left behind when the agent never wrote the plan.
const stub = (over: Partial<VisualPlan> = {}): VisualPlan => ({
  id: 'plan-1782817069606-xjeqc1', title: 'Plan changes for Core Loop Walking Skeleton',
  goal: 'Plan changes for Core Loop Walking Skeleton', status: 'generating',
  createdAt: 1_782_817_069_606, updatedAt: 1_782_817_069_606, sections: [], comments: [], ...over,
});

describe('abandoned visual plans', () => {
  it('a stub still generating long after it was made reads as failed', () => {
    expect(settleAbandonedPlan(stub(), 1_795_000_000_000).status).toBe('failed');
  });

  it('a plan still being written keeps spinning', () => {
    const fresh = stub({ updatedAt: 1_000_000 });
    expect(settleAbandonedPlan(fresh, 1_000_000 + ABANDONED_PLAN_MS - 1).status).toBe('generating');
  });

  it('a plan with content is never marked failed, however old', () => {
    const written = stub({ sections: [{ id: 's', kind: 'openQuestions', title: 'Q', questions: [] } as never] });
    expect(settleAbandonedPlan(written, 1_795_000_000_000).status).toBe('generating');
  });

  it('only failed plans with nothing in them leave the canvas', () => {
    expect(isEmptyFailedPlan(stub({ status: 'failed' }))).toBe(true);
    expect(isEmptyFailedPlan(stub())).toBe(false);
    expect(isEmptyFailedPlan(stub({ status: 'failed', sections: [{ id: 's' } as never] }))).toBe(false);
  });
});
