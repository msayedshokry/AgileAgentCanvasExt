// ─── Unit tests: budget-enforcer ─────────────────────────────────────────────
// Covers: formatGauge returns a real "$X / $Y (Z%)" string when a cap is set
// (happy path) and setConfig clamps negative values to zero (most common
// error path).

import { describe, it, expect, vi } from 'vitest';
import { BudgetEnforcer } from './budget-enforcer';

// Stub the cost tracker so the budget status is deterministic without
// pulling in the full AI provider chain.
vi.mock('../chat/cost-tracker', () => ({
  costTracker: {
    perWorkflowBreakdown: vi.fn().mockReturnValue([]),
    costForArtifact: () => 0.42,
    totalCost: () => 1.50,
  },
}));

describe('BudgetEnforcer', () => {
  it('happy: formatGauge returns "$1.50 / $5.00 (30%)" when a daily cap is set', () => {
    const be = new BudgetEnforcer();
    be.setConfig({ budgetDaily: 5 });
    expect(be.formatGauge()).toBe('$1.5000 / $5.00 (30%)');
  });

  it('error: setConfig clamps negative values to zero', () => {
    const be = new BudgetEnforcer();
    be.setConfig({ budgetPerStory: -5, budgetDaily: -10 });
    expect(be.getConfig().budgetPerStory).toBe(0);
    expect(be.getConfig().budgetDaily).toBe(0);
  });
});
