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

export interface BudgetStatus {
  perStory: { used: number; cap: number; exceeded: boolean };
  daily: { used: number; cap: number; exceeded: boolean };
  anyExceeded: boolean;
  bannerMessage: string | null;
  remaining: number;
}

export class BudgetEnforcer {
  private config: BudgetConfig = { budgetPerStory: 0, budgetDaily: 0 };
  private paused = false;

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

    return {
      perStory: { used: perStoryUsed, cap: this.config.budgetPerStory, exceeded: perStoryExceeded },
      daily: { used: dailyUsed, cap: this.config.budgetDaily, exceeded: dailyExceeded },
      anyExceeded,
      bannerMessage,
      remaining: remaining === Infinity ? -1 : remaining,
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
      return false;
    }
    return true;
  }

  /** Manually unpause (e.g., user resets budget). */
  unpause(): void {
    this.paused = false;
    logger.info('Budget enforcer unpaused');
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
