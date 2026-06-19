/**
 * Regression guard for the Headroom status bar item.
 *
 * Contract being locked:
 *  - disabled (headroom.enabled: false) → status bar is hidden
 *  - npm package not installed → status bar is hidden
 *  - proxy not running → shows "offline" hint with tooltip about starting the proxy
 *  - proxy running, zero compression calls → shows "Headroom" label with no savings %
 *  - active with cumulative stats → shows "XX%" with detailed tooltip
 *  - refreshHeadroomStatusBar() triggers a zero-delay re-render
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
import { getCompressionStats, getAvailability } from '../integrations/headroom';

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
  it('hides the status bar when headroom.enabled is false', () => {
    setEnabled(false);
    create();
    expect(mockItem.hide).toHaveBeenCalled();
  });

  it('shows nothing (empty text) when disabled', () => {
    setEnabled(false);
    create();
    expect(mockItem.text).toBe('');
  });
});

// ─── State 2: NOT INSTALLED ────────────────────────────────────────────────

describe('headroom status bar — not installed', () => {
  it('hides the status bar when npm package is not resolvable', () => {
    setAvailability({ installed: false, proxyRunning: false });
    create();
    expect(mockItem.hide).toHaveBeenCalled();
  });

  it('shows nothing (empty text) when not installed', () => {
    setAvailability({ installed: false, proxyRunning: false });
    create();
    expect(mockItem.text).toBe('');
  });
});

// ─── State 3: PROXY OFFLINE ────────────────────────────────────────────────

describe('headroom status bar — proxy offline', () => {
  it('shows the offline hint when the proxy is not running', () => {
    setAvailability({ installed: true, proxyRunning: false, version: '0.22.4' });
    create();
    expect(mockItem.text).toContain('Headroom: offline');
  });

  it('shows the rocket icon in the offline hint', () => {
    setAvailability({ installed: true, proxyRunning: false });
    create();
    expect(mockItem.text).toContain('$(rocket)');
  });

  it('shows a tooltip referencing the proxy start command', () => {
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
});

// ─── State 4: PROXY RUNNING, ZERO CALLS ────────────────────────────────────

describe('headroom status bar — zero calls', () => {
  it('shows the Headroom label without a percentage', () => {
    setAvailability({ installed: true, proxyRunning: true, version: '0.22.4' });
    setStats({ totalCalls: 0 });
    create();
    expect(mockItem.text).toBe('$(rocket) Headroom');
  });

  it('shows a tooltip indicating no calls have happened yet', () => {
    setAvailability({ installed: true, proxyRunning: true, version: '0.22.4' });
    setStats({ totalCalls: 0 });
    create();
    expect(mockItem.tooltip).toContain('No compression calls yet');
  });

  it('shows the version in the tooltip', () => {
    setAvailability({ installed: true, proxyRunning: true, version: '0.25.1' });
    setStats({ totalCalls: 0 });
    create();
    expect(mockItem.tooltip).toContain('0.25.1');
  });

  it('falls back to ? when version is undefined', () => {
    setAvailability({ installed: true, proxyRunning: true /* no version */ });
    setStats({ totalCalls: 0 });
    create();
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

  it('shows a detailed tooltip with tokens and calls', () => {
    setAvailability({ installed: true, proxyRunning: true });
    setStats({
      totalCalls: 12,
      totalTokensBefore: 50000,
      totalTokensAfter: 30000,
      totalTokensSaved: 20000,
    });
    create();
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
    expect(mockItem.text).toBe('');

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
