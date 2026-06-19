/**
 * Regression guard for the Headroom status bar item.
 *
 * Contract being locked:
 *  - The bar is ALWAYS SHOWING (never hides after activation) so users
 *    always know Headroom's state.
 *  - disabled (headroom.enabled: false) → "Headroom: disabled" with a
 *    click-action that opens Headroom settings.
 *  - npm package not installed → "Headroom" with a warning icon and a
 *    tooltip explaining the SDK is missing.
 *  - proxy not running → "Headroom: proxy offline" with a tooltip
 *    pointing at the proxy start one-liner.
 *  - proxy running, zero compression calls → "Headroom" label (no %).
 *  - active with cumulative stats → "XX%" with detailed tooltip.
 *  - refreshHeadroomStatusBar() triggers a zero-delay re-render.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ─── Controllable mocks ────────────────────────────────────────────────────
// vi.mock factories are hoisted — use vi.fn() for the exports, then
// vi.mocked() per-test to set return values.

vi.mock('../integrations/headroom', () => ({
  getCompressionStats: vi.fn(() => ({
    totalCalls: 0,
    totalTokensBefore: 0,
    totalTokensAfter: 0,
    totalTokensSaved: 0,
    lastCompressionRatio: 0,
    lastSaved: 0,
    available: false,
  })),
  getAvailability: vi.fn(() => ({
    installed: false,
    proxyRunning: false,
  })),
  getCCRStats: vi.fn().mockResolvedValue(null),
}));

// ─── Mock handoff-negotiation ─────────────────────────────────────────────

vi.mock('../acp/agent-bus/handoff-negotiation', () => ({
  handoffNegotiation: {
    getSharedContextStats: vi.fn().mockReturnValue(null),
  },
}));

// ─── vscode mock ──────────────────────────────────────────────────────────

// Create a fresh mock status bar item so assertions don't bleed across tests.
function freshItem() {
  return {
    name: '',
    text: '',
    tooltip: '',
    command: undefined as any,
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  };
}

let mockItem = freshItem();

let mockHeadroomEnabled = true;

const mockConfig = {
  get: vi.fn((key: string, defaultValue: any) => {
    if (key === 'headroom.enabled') return mockHeadroomEnabled;
    return defaultValue;
  }),
};

vi.mock('vscode', () => ({
  StatusBarAlignment: { Right: 2 },
  window: {
    createStatusBarItem: vi.fn(() => {
      mockItem = freshItem();
      return mockItem;
    }),
  },
  workspace: {
    getConfiguration: () => mockConfig,
  },
}));

// ─── Imports (after mocks so hoisting resolves correctly) ──────────────────

import {
  createHeadroomStatusBar,
  refreshHeadroomStatusBar,
} from './headroom-status-bar';
import { getCompressionStats, getAvailability, getCCRStats } from '../integrations/headroom';
import { handoffNegotiation } from '../acp/agent-bus/handoff-negotiation';

// fake context — only needs subscriptions.push
const fakeContext: any = {
  subscriptions: [],
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function setAvailability(overrides: Partial<ReturnType<typeof getAvailability>>) {
  vi.mocked(getAvailability).mockReturnValue({
    installed: false,
    proxyRunning: false,
    ...overrides,
  });
}

function setStats(overrides: Partial<ReturnType<typeof getCompressionStats>>) {
  vi.mocked(getCompressionStats).mockReturnValue({
    totalCalls: 0,
    totalTokensBefore: 0,
    totalTokensAfter: 0,
    totalTokensSaved: 0,
    lastCompressionRatio: 0,
    lastSaved: 0,
    available: false,
    ...overrides,
  });
}

function setEnabled(enabled: boolean) {
  mockHeadroomEnabled = enabled;
}

function setSharedContextStats(stats: Record<string, any> | null) {
  vi.mocked(handoffNegotiation.getSharedContextStats).mockReturnValue(stats);
}

function setCCRStats(stats: Record<string, any> | null) {
  vi.mocked(getCCRStats).mockResolvedValue(stats);
}

// Create the status bar (resets module-level _item so state doesn't leak).
function create() {
  // Recreate the item mock since createStatusBarItem is called in createHeadroomStatusBar
  return createHeadroomStatusBar(fakeContext);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset to known good state
  vi.useFakeTimers();
  setEnabled(true);
  setAvailability({ installed: false, proxyRunning: false });
  setStats({ totalCalls: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── State 1: DISABLED (headroom.enabled = false) ─────────────────────────

describe('headroom status bar — disabled', () => {
  beforeEach(() => {
    // Explicitly set up an "otherwise-running" state to confirm that the
    // disabled-short-circuit fires before any availability branch is reached.
    setAvailability({ installed: true, proxyRunning: true });
  });

  it('shows the bar (never hides) when headroom.enabled is false', () => {
    setEnabled(false);
    create();
    expect(mockItem.show).toHaveBeenCalled();
    expect(mockItem.hide).not.toHaveBeenCalled();
  });

  it('shows "Headroom: disabled" with the circle-slash icon', () => {
    setEnabled(false);
    create();
    expect(mockItem.text).toBe('$(circle-slash) Headroom: disabled');
  });

  it('tooltip points at the Headroom settings page', () => {
    setEnabled(false);
    create();
    expect(mockItem.tooltip).toContain('Click to open Headroom settings');
  });

  it('command opens the workbench settings (filtered to agileagentcanvas.headroom)', () => {
    setEnabled(false);
    create();
    expect(mockItem.command).toEqual({
      command: 'workbench.action.openSettings',
      arguments: ['agileagentcanvas.headroom'],
      title: 'Open Headroom Settings',
    });
  });
});

// ─── State 2: NOT INSTALLED ────────────────────────────────────────────────

describe('headroom status bar — not installed', () => {
  it('shows the bar (never hides) when npm package is not resolvable', () => {
    setAvailability({ installed: false, proxyRunning: false });
    create();
    expect(mockItem.show).toHaveBeenCalled();
    expect(mockItem.hide).not.toHaveBeenCalled();
  });

  it('shows "Headroom" with the warning icon', () => {
    setAvailability({ installed: false, proxyRunning: false });
    create();
    expect(mockItem.text).toBe('$(warning) Headroom');
  });

  it('tooltip explains the SDK is missing', () => {
    setAvailability({ installed: false, proxyRunning: false });
    create();
    expect(mockItem.tooltip).toContain('Headroom SDK not detected');
    expect(mockItem.tooltip).toContain('headroom-ai');
  });
});

// ─── State 3: PROXY OFFLINE ────────────────────────────────────────────────

describe('headroom status bar — proxy offline', () => {
  it('shows the offline hint when the proxy is not running', () => {
    setAvailability({ installed: true, proxyRunning: false, version: '0.22.4' });
    create();
    expect(mockItem.text).toContain('Headroom: proxy offline');
  });

  it('shows the rocket icon in the offline hint', () => {
    setAvailability({ installed: true, proxyRunning: false });
    create();
    expect(mockItem.text).toContain('$(rocket)');
  });

  it('shows a tooltip referencing the proxy start command and port', () => {
    setAvailability({ installed: true, proxyRunning: false });
    create();
    expect(mockItem.tooltip).toContain('localhost:8787');
    expect(mockItem.tooltip).toContain('headroom-ai proxy');
  });

  it('does NOT show compression stats when offline', () => {
    setStats({ totalCalls: 5, totalTokensSaved: 1000, totalTokensBefore: 2000 });
    setAvailability({ installed: true, proxyRunning: false });
    create();
    expect(mockItem.text).not.toContain('%');
  });

  it('bar stays visible (never hides) when offline', () => {
    setAvailability({ installed: true, proxyRunning: false });
    create();
    expect(mockItem.show).toHaveBeenCalled();
  });
});

// ─── State 4: PROXY RUNNING, ZERO CALLS ────────────────────────────────────

describe('headroom status bar — zero calls', () => {
  it('shows the Headroom label without a percentage', () => {
    setAvailability({ installed: true, proxyRunning: true, version: '0.22.4' });
    setStats({ totalCalls: 0 });
    create();
    expect(mockItem.text).toBe('$(rocket) Headroom');
  });

  it('shows a tooltip indicating no calls have happened yet', async () => {
    setAvailability({ installed: true, proxyRunning: true, version: '0.22.4' });
    setStats({ totalCalls: 0 });
    create();
    await vi.advanceTimersByTimeAsync(0);
    expect(mockItem.tooltip).toContain('No compression calls yet');
  });

  it('shows the version in the tooltip', async () => {
    setAvailability({ installed: true, proxyRunning: true, version: '0.25.1' });
    setStats({ totalCalls: 0 });
    create();
    await vi.advanceTimersByTimeAsync(0);
    expect(mockItem.tooltip).toContain('0.25.1');
  });

  it('falls back to ? when version is undefined', async () => {
    setAvailability({ installed: true, proxyRunning: true /* no version */ });
    setStats({ totalCalls: 0 });
    create();
    await vi.advanceTimersByTimeAsync(0);
    expect(mockItem.tooltip).toContain('v?');
  });
});

// ─── State 5: ACTIVE WITH STATS ────────────────────────────────────────────

describe('headroom status bar — active with stats', () => {
  it('shows the compression savings percentage', () => {
    setAvailability({ installed: true, proxyRunning: true });
    setStats({
      totalCalls: 5,
      totalTokensBefore: 10000,
      totalTokensSaved: 4000,
    });
    create();
    expect(mockItem.text).toContain('$(rocket)');
    expect(mockItem.text).toContain('%');
  });

  it('calculates the correct percentage (40% from 4000/10000)', () => {
    setAvailability({ installed: true, proxyRunning: true });
    setStats({
      totalCalls: 5,
      totalTokensBefore: 10000,
      totalTokensSaved: 4000,
    });
    create();
    expect(mockItem.text).toBe('$(rocket) 40%');
  });

  it('shows zero percent when tokensBefore is zero', () => {
    setAvailability({ installed: true, proxyRunning: true });
    setStats({
      totalCalls: 3,
      totalTokensBefore: 0,
      totalTokensSaved: 0,
    });
    create();
    expect(mockItem.text).toBe('$(rocket) 0%');
  });

  it('shows a detailed tooltip with tokens and calls', async () => {
    setAvailability({ installed: true, proxyRunning: true });
    setStats({
      totalCalls: 12,
      totalTokensBefore: 50000,
      totalTokensAfter: 30000,
      totalTokensSaved: 20000,
    });
    create();
    await vi.advanceTimersByTimeAsync(0);
    expect(mockItem.tooltip).toContain('Tokens saved');
    // toLocaleString is locale-dependent — check for the numeric substring
    const savedPart = (20000).toLocaleString();
    const beforePart = (50000).toLocaleString();
    expect(mockItem.tooltip).toContain(savedPart);
    expect(mockItem.tooltip).toContain(beforePart);
    expect(mockItem.tooltip).toContain('40%');
    expect(mockItem.tooltip).toContain('12');
  });
});

// ─── Refresh function ──────────────────────────────────────────────────────

describe('refreshHeadroomStatusBar', () => {
  it('is a callable exported function', () => {
    expect(typeof refreshHeadroomStatusBar).toBe('function');
  });

  it('triggers the show path when state transitions from disabled to enabled', async () => {
    // Start disabled
    setEnabled(false);
    setAvailability({ installed: false, proxyRunning: false });
    create();
    expect(mockItem.text).toBe('$(circle-slash) Headroom: disabled');

    // Toggle enabled and simulate a proxy now running
    setEnabled(true);
    setAvailability({ installed: true, proxyRunning: true });
    setStats({
      totalCalls: 1,
      totalTokensBefore: 1000,
      totalTokensSaved: 500,
    });

    refreshHeadroomStatusBar();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockItem.text).toBe('$(rocket) 50%');
  });
});

// ─── SharedContext tooltip section ──────────────────────────────────────────

describe('headroom status bar — SharedContext tooltip', () => {
  beforeEach(() => {
    setAvailability({ installed: true, proxyRunning: true });
    setStats({ totalCalls: 1, totalTokensBefore: 10000, totalTokensSaved: 4000 });
    setCCRStats(null);
  });

  it('shows SharedContext section when entries > 0', async () => {
    setSharedContextStats({
      entries: 3,
      totalOriginalTokens: 4500,
      totalCompressedTokens: 2000,
      totalTokensSaved: 2500,
      savingsPercent: 55,
    });
    create();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockItem.tooltip).toContain('SharedContext (A2A handoffs)');
    expect(mockItem.tooltip).toContain('Compressed entries: 3');
    expect(mockItem.tooltip).toContain('Tokens saved');
    expect(mockItem.tooltip).toContain('55% avg');
  });

  it('hides SharedContext section when stats return null', async () => {
    setSharedContextStats(null);
    create();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockItem.tooltip).not.toContain('SharedContext');
    expect(mockItem.tooltip).not.toContain('A2A handoffs');
  });

  it('hides SharedContext section when entries is 0', async () => {
    setSharedContextStats({
      entries: 0,
      totalOriginalTokens: 0,
      totalCompressedTokens: 0,
      totalTokensSaved: 0,
      savingsPercent: 0,
    });
    create();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockItem.tooltip).not.toContain('SharedContext');
  });

  it('includes token savings with locale formatting', async () => {
    setSharedContextStats({
      entries: 1,
      totalOriginalTokens: 10000,
      totalCompressedTokens: 3500,
      totalTokensSaved: 6500,
      savingsPercent: 65,
    });
    create();
    await vi.advanceTimersByTimeAsync(0);

    const savedPart = (6500).toLocaleString();
    expect(mockItem.tooltip).toContain(savedPart);
    expect(mockItem.tooltip).toContain('65% avg');
  });
});

// ─── CCR store tooltip section ──────────────────────────────────────────────

describe('headroom status bar — CCR tooltip', () => {
  beforeEach(() => {
    setAvailability({ installed: true, proxyRunning: true });
    setStats({ totalCalls: 1, totalTokensBefore: 10000, totalTokensSaved: 4000 });
    setSharedContextStats(null);
  });

  it('shows CCR Store section when getCCRStats returns data', async () => {
    setCCRStats({
      enabled: true,
      totalCompressions: 42,
      totalRetrievals: 7,
      globalRetrievalRate: 0.15,
      toolSignaturesTracked: 12,
      avgCompressionRatio: 0.45,
      avgTokenReduction: 350,
    });
    create();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockItem.tooltip).toContain('CCR Store');
    expect(mockItem.tooltip).toContain('totalCompressions');
    expect(mockItem.tooltip).toContain('42');
    expect(mockItem.tooltip).toContain('globalRetrievalRate');
    // toLocaleString() is locale-dependent — check the key exists, not the exact value
    expect(mockItem.tooltip).toMatch(/globalRetrievalRate: [\d,.]+/);
  });

  it('hides CCR Store section when getCCRStats returns null', async () => {
    setCCRStats(null);
    create();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockItem.tooltip).not.toContain('CCR Store');
  });

  it('hides CCR Store section when getCCRStats rejects', async () => {
    vi.mocked(getCCRStats).mockRejectedValue(new Error('fetch failed'));
    create();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockItem.tooltip).not.toContain('CCR Store');
  });

  it('formats numeric values with locale', async () => {
    setCCRStats({
      totalEntries: 1234,
      totalSize: 567890,
    });
    create();
    await vi.advanceTimersByTimeAsync(0);

    const entriesPart = (1234).toLocaleString();
    const sizePart = (567890).toLocaleString();
    expect(mockItem.tooltip).toContain(entriesPart);
    expect(mockItem.tooltip).toContain(sizePart);
  });
});

// ─── Combined SharedContext + CCR sections ──────────────────────────────────

describe('headroom status bar — combined sections', () => {
  it('shows both SharedContext and CCR sections when both return data', async () => {
    setAvailability({ installed: true, proxyRunning: true });
    setStats({ totalCalls: 3, totalTokensBefore: 20000, totalTokensSaved: 8000 });
    setSharedContextStats({
      entries: 2,
      totalOriginalTokens: 3000,
      totalCompressedTokens: 1200,
      totalTokensSaved: 1800,
      savingsPercent: 60,
    });
    setCCRStats({ totalCompressions: 10, totalRetrievals: 3 });

    create();
    await vi.advanceTimersByTimeAsync(0);

    // Compressor section
    expect(mockItem.tooltip).toContain('Headroom Compression');
    // SharedContext section
    expect(mockItem.tooltip).toContain('SharedContext (A2A handoffs)');
    expect(mockItem.tooltip).toContain('Compressed entries: 2');
    // CCR section
    expect(mockItem.tooltip).toContain('CCR Store');
    expect(mockItem.tooltip).toContain('totalCompressions');
    // Click command wires up Headroom settings
    expect(mockItem.command).toEqual({
      command: 'workbench.action.openSettings',
      arguments: ['agileagentcanvas.headroom'],
      title: 'Open Headroom Settings',
    });
  });

  it('bar text still shows compression percentage when sections are present', async () => {
    setAvailability({ installed: true, proxyRunning: true });
    setStats({ totalCalls: 1, totalTokensBefore: 10000, totalTokensSaved: 3000 });
    setSharedContextStats({
      entries: 1,
      totalOriginalTokens: 1000,
      totalCompressedTokens: 500,
      totalTokensSaved: 500,
      savingsPercent: 50,
    });
    setCCRStats({ flag: true });

    create();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockItem.text).toBe('$(rocket) 30%');
  });
});
