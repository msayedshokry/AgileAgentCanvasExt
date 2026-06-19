// ─── Budget Enforcement & Webview Display ─────────────────────────────────────
// Configurable budget caps (per-story and daily). Auto-pauses the scheduler
// when caps are hit.
//
// Issue: #11 — Budget Enforcement & Webview Display

import { costTracker } from '../chat/cost-tracker';
import { createLogger } from '../utils/logger';

const logger = createLogger('budget-enforcer');

export interface BudgetConfig {
  /** Max USD per individual story. 0 = no per-story cap. */
  budgetPerStory: number;
  /** Max USD per day. 0 = no daily cap. */
  budgetDaily: number;
}

/** Per-workflow cost breakdown row — audit gap #20/#42 surfaced to UI.
 *
 *  One row per workflow name with cumulative spend for that workflow's LLM
 *  calls (entries tagged with `sessionId === "workflow:<name>"`). The
 *  fallback bucket `'chat-session'` (plain chat turns not bound to a named
 *  workflow) is also surfaced so the user can see residual spend. */
export interface WorkflowCostRow {
  workflow: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export interface BudgetStatus {
  perStory: { used: number; cap: number; exceeded: boolean };
  daily: { used: number; cap: number; exceeded: boolean };
  anyExceeded: boolean;
  bannerMessage: string | null;
  remaining: number;
  /** Per-workflow subtotals (audit gap #20/#42, surfaced audit #EXT-folowup).
   *  Sorted by cost DESC; rows with `cost === 0` are omitted. */
  workflowBreakdown: WorkflowCostRow[];
}

export class BudgetEnforcer {
  private config: BudgetConfig = { budgetPerStory: 0, budgetDaily: 0 };
  private paused = false;
  /** Callback when the budget exceeds a cap and auto-pauses. */
  private onPaused: (() => void) | null = null;
  /** Callback when unpause() is called manually. */
  private onUnpaused: (() => void) | null = null;

  /** Register a callback fired when the budget enforcer auto-pauses. Pass null to clear. */
  setOnPaused(fn: (() => void) | null): void { this.onPaused = fn; }

  /** Register a callback fired when unpause() is called. Pass null to clear. */
  setOnUnpaused(fn: (() => void) | null): void { this.onUnpaused = fn; }

  setConfig(config: Partial<BudgetConfig>): void {
    if (config.budgetPerStory !== undefined) this.config.budgetPerStory = Math.max(0, config.budgetPerStory);
    if (config.budgetDaily !== undefined) this.config.budgetDaily = Math.max(0, config.budgetDaily);
  }

  getConfig(): BudgetConfig {
    return { ...this.config };
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** Compute current status (daily = since midnight UTC). */
  getStatus(artifactId?: string): BudgetStatus {
    const since = startOfDayUTC();
    const perStoryUsed = artifactId ? costTracker.costForArtifact(artifactId) : 0;
    const dailyUsed = costTracker.totalCost({ since });

    const perStoryExceeded = this.config.budgetPerStory > 0 && perStoryUsed >= this.config.budgetPerStory;
    const dailyExceeded = this.config.budgetDaily > 0 && dailyUsed >= this.config.budgetDaily;
    const anyExceeded = perStoryExceeded || dailyExceeded;

    let bannerMessage: string | null = null;
    if (dailyExceeded) {
      bannerMessage = `Budget exhausted: $${dailyUsed.toFixed(4)} / $${this.config.budgetDaily} daily cap`;
    } else if (perStoryExceeded) {
      bannerMessage = `Per-story budget exhausted: $${perStoryUsed.toFixed(4)} / $${this.config.budgetPerStory}`;
    }

    const remaining = this.config.budgetDaily > 0 ? Math.max(0, this.config.budgetDaily - dailyUsed) : Infinity;

    // Per-workflow breakdown (audit gap #20/#42, surfaced follow-up):
    // queried against the SAME `since` window as the daily cap so the two
    // totals are guaranteed to reconcile. Rows with `cost === 0` are filtered
    // out so the webview can render an empty chip row without a "—".
    // Capped at 12 rows to keep the gauge compact; overflow workflows are
    // summed into an "Other" row that reconciles back to `daily.used`, then
    // the final list is re-sorted DESC so "Other" settles at its correct
    // visual rank (its cost can exceed a top-12 row when many cheap workflows
    // stack up — re-sort prevents the row from appearing cheaper than it is).
    const CAP = 12;
    const raw = costTracker.perWorkflowBreakdown({ since }).filter(r => r.cost > 0);
    const assembled: WorkflowCostRow[] = raw.length > CAP
      ? [
          ...raw.slice(0, CAP),
          {
            workflow: 'Other',
            cost: raw.slice(CAP).reduce((s, r) => s + r.cost, 0),
            inputTokens: raw.slice(CAP).reduce((s, r) => s + r.inputTokens, 0),
            outputTokens: raw.slice(CAP).reduce((s, r) => s + r.outputTokens, 0),
            calls: raw.slice(CAP).reduce((s, r) => s + r.calls, 0),
          },
        ]
      : raw;
    const workflowBreakdown: WorkflowCostRow[] = assembled.sort((a, b) => b.cost - a.cost);

    return {
      perStory: { used: perStoryUsed, cap: this.config.budgetPerStory, exceeded: perStoryExceeded },
      daily: { used: dailyUsed, cap: this.config.budgetDaily, exceeded: dailyExceeded },
      anyExceeded,
      bannerMessage,
      remaining: remaining === Infinity ? -1 : remaining,
      workflowBreakdown,
    };
  }

  /**
   * Check if a new workflow can be started. Returns true if allowed.
   * Auto-pauses the scheduler if any cap is hit.
   */
  canStart(artifactId: string): boolean {
    const status = this.getStatus(artifactId);
    if (status.anyExceeded) {
      this.paused = true;
      logger.warn('Budget cap hit — auto-paused', { status });
      this.onPaused?.();
      return false;
    }
    return true;
  }

  /** Manually unpause (e.g., user resets budget). */
  unpause(): void {
    this.paused = false;
    logger.info('Budget enforcer unpaused');
    this.onUnpaused?.();
  }

  /**
   * Record a spend against the budget. This is the primary way to track costs
   * for autonomous workflow execution. It records the cost in the costTracker
   * so that getStatus() and canStart() reflect the new spend.
   *
   * @param artifactId The artifact being worked on (for per-story tracking)
   * @param sessionId  The workflow/session ID (for grouping)
   * @param model      The model label (e.g. 'gpt-4o', 'Copilot (GPT-4o)')
   * @param inputTokens  Estimated input token count
   * @param outputTokens Estimated output token count
   */
  recordSpend(
    artifactId: string,
    sessionId: string,
    model: string,
    inputTokens: number,
    outputTokens: number
  ): void {
    costTracker.record(sessionId, model, { inputTokens, outputTokens }, artifactId);
    logger.debug('Budget spend recorded', {
      artifactId, model, inputTokens, outputTokens,
    });
  }

  /** Format a budget gauge string for display: "$0.42 / $5.00 (8%)". */
  formatGauge(): string {
    const { daily } = this.getStatus();
    if (daily.cap === 0) return 'No budget set';
    const pct = (daily.used / daily.cap) * 100;
    return `$${daily.used.toFixed(4)} / $${daily.cap.toFixed(2)} (${pct.toFixed(0)}%)`;
  }
}

function startOfDayUTC(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// ── Singleton ────────────────────────────────────────────────────────────────

export const budgetEnforcer = new BudgetEnforcer();
