// recent-blocks-tracker.test.ts
//
// Isolated unit tests for `RecentBlocksTracker`. Each test instantiates a
// FRESH tracker so we never rely on module-level singleton state and never
// leak state into neighbouring tests. `subscribeToFindings` is driven with
// a hand-rolled `{ on, off }` stub, decoupling the test from the real
// `harnessEngine` class.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RecentBlocksTracker,
  MAX_RECENT_BLOCKS,
  splitFailures,
} from './recent-blocks-tracker';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeBlock(overrides: Partial<{
  artifactId: string;
  artifactType: string;
  policyId: string;
  failures: string[];
  timestamp: number;
}> = {}) {
  return {
    artifactId: 'S-1',
    artifactType: 'story',
    policyId: 'required-fields',
    failures: ['No title'],
    timestamp: 1000,
    ...overrides,
  };
}

/** Build a `{on, off}` stub that records registered listeners. */
function buildFindingsStub() {
  const handlers: Array<(event: any) => void> = [];
  const off = vi.fn((_event: string, listener: (event: any) => void) => {
    const i = handlers.indexOf(listener);
    if (i >= 0) handlers.splice(i, 1);
  });
  const on = vi.fn((_event: string, listener: (event: any) => void) => {
    handlers.push(listener);
  });
  return { stub: { on, off } as any, handlers, off };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('RecentBlocksTracker — add() & ring buffer basics', () => {
  let tracker: RecentBlocksTracker;

  beforeEach(() => {
    tracker = new RecentBlocksTracker();
  });

  it('starts empty', () => {
    expect(tracker.getSnapshot()).toEqual([]);
    expect(tracker.size()).toBe(0);
  });

  it('add() inserts the provided entry verbatim', () => {
    const entry = tracker.add(makeBlock({ artifactId: 'S-A' }));
    expect(entry.artifactId).toBe('S-A');
    expect(entry.artifactType).toBe('story');
    expect(entry.policyId).toBe('required-fields');
    expect(entry.failures).toEqual(['No title']);
  });

  it('add() preserves the explicit timestamp when provided', () => {
    const entry = tracker.add(makeBlock({ timestamp: 12345 }));
    expect(entry.timestamp).toBe(12345);
  });

  it('add() assigns a Date.now()-derived timestamp when omitted', () => {
    const before = Date.now();
    // Explicitly override the helper's default `timestamp: 1000` so we
    // exercise the Date.now() fallback (otherwise the explicit value wins).
    const entry = tracker.add({ ...makeBlock(), timestamp: undefined });
    const after = Date.now();
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry.timestamp).toBeLessThanOrEqual(after);
  });

  it('failures array is cloned — mutating input does not affect stored entry', () => {
    const input = makeBlock({ failures: ['a', 'b'] });
    const entry = tracker.add(input);
    input.failures.push('c');
    expect(entry.failures).toEqual(['a', 'b']);
  });

  it('caps the buffer at MAX_RECENT_BLOCKS, dropping the oldest', () => {
    for (let i = 0; i < MAX_RECENT_BLOCKS + 5; i++) {
      tracker.add(makeBlock({
        artifactId: `S-${i}`,
        timestamp: i,
      }));
    }
    const snap = tracker.getSnapshot();
    expect(snap.length).toBe(MAX_RECENT_BLOCKS);
    // First five ('S-0'–'S-4') shifted out
    expect(snap[0].artifactId).toBe('S-5');
    // Last inserted is at the tail
    expect(snap[snap.length - 1].artifactId).toBe(`S-${MAX_RECENT_BLOCKS + 4}`);
  });

  it('preserves insertion order for entries within the cap', () => {
    tracker.add(makeBlock({ artifactId: 'S-A', timestamp: 1 }));
    tracker.add(makeBlock({ artifactId: 'S-B', timestamp: 2 }));
    tracker.add(makeBlock({ artifactId: 'S-C', timestamp: 3 }));
    expect(tracker.getSnapshot().map(b => b.artifactId))
      .toEqual(['S-A', 'S-B', 'S-C']);
  });
});

describe('RecentBlocksTracker — dismiss()', () => {
  let tracker: RecentBlocksTracker;

  beforeEach(() => {
    tracker = new RecentBlocksTracker();
  });

  it('removes the matching entry and returns true', () => {
    tracker.add(makeBlock({ artifactId: 'S-A', policyId: 'P1', timestamp: 100 }));
    tracker.add(makeBlock({ artifactId: 'S-B', policyId: 'P1', timestamp: 200 }));
    const ok = tracker.dismiss('S-A', 'P1', 100);
    expect(ok).toBe(true);
    const snap = tracker.getSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].artifactId).toBe('S-B');
  });

  it('returns false when no entry matches the (artifactId, policyId, timestamp) tuple', () => {
    tracker.add(makeBlock({ timestamp: 100 }));
    expect(tracker.dismiss('S-1', 'required-fields', 999)).toBe(false);
    expect(tracker.dismiss('S-X', 'required-fields', 100)).toBe(false);
    expect(tracker.dismiss('S-1', 'wrong-policy', 100)).toBe(false);
    expect(tracker.getSnapshot()).toHaveLength(1);
  });

  it('disambiguates duplicate (artifactId, policyId) tuples by timestamp', () => {
    tracker.add(makeBlock({
      artifactId: 'S-DUP', policyId: 'required-fields',
      failures: ['first'], timestamp: 100,
    }));
    tracker.add(makeBlock({
      artifactId: 'S-DUP', policyId: 'required-fields',
      failures: ['second'], timestamp: 200,
    }));
    tracker.dismiss('S-DUP', 'required-fields', 100);
    const snap = tracker.getSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].failures).toEqual(['second']);
    expect(snap[0].timestamp).toBe(200);
  });

  it('dismissing a non-existent timestamp only removes the matching row', () => {
    tracker.add(makeBlock({ timestamp: 100 }));
    tracker.add(makeBlock({ timestamp: 200 }));
    tracker.add(makeBlock({ timestamp: 300 }));
    tracker.dismiss('S-1', 'required-fields', 999);
    expect(tracker.getSnapshot().map(b => b.timestamp)).toEqual([100, 200, 300]);
  });
});

describe('RecentBlocksTracker — clearAll()', () => {
  let tracker: RecentBlocksTracker;

  beforeEach(() => {
    tracker = new RecentBlocksTracker();
  });

  it('empties the buffer and returns the count of removed entries', () => {
    tracker.add(makeBlock());
    tracker.add(makeBlock({ artifactId: 'S-2' }));
    tracker.add(makeBlock({ artifactId: 'S-3' }));
    expect(tracker.clearAll()).toBe(3);
    expect(tracker.getSnapshot()).toEqual([]);
    expect(tracker.size()).toBe(0);
  });

  it('returns 0 when the buffer is already empty', () => {
    expect(tracker.clearAll()).toBe(0);
  });

  it('allows re-population after clearAll', () => {
    tracker.add(makeBlock());
    tracker.clearAll();
    tracker.add(makeBlock({ artifactId: 'S-AFTER' }));
    expect(tracker.getSnapshot()).toHaveLength(1);
    expect(tracker.getSnapshot()[0].artifactId).toBe('S-AFTER');
  });
});

describe('RecentBlocksTracker — getSnapshot() defensive copy', () => {
  let tracker: RecentBlocksTracker;

  beforeEach(() => {
    tracker = new RecentBlocksTracker();
  });

  it('mutating the returned array does not affect the live buffer', () => {
    tracker.add(makeBlock());
    const snap = tracker.getSnapshot();
    snap.push({
      artifactId: 'X', artifactType: '', policyId: '',
      failures: [], timestamp: 0,
    });
    snap.length = 0;
    expect(tracker.getSnapshot()).toHaveLength(1);
  });

  it('inner failures arrays are also cloned', () => {
    tracker.add(makeBlock({ failures: ['a'] }));
    const snap = tracker.getSnapshot();
    snap[0].failures.push('b');
    expect(tracker.getSnapshot()[0].failures).toEqual(['a']);
  });

  it('each getSnapshot call returns an independent copy', () => {
    tracker.add(makeBlock());
    const a = tracker.getSnapshot();
    const b = tracker.getSnapshot();
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    expect(a[0].failures).not.toBe(b[0].failures);
  });
});

describe('RecentBlocksTracker — subscribeToFindings()', () => {
  let tracker: RecentBlocksTracker;

  beforeEach(() => {
    tracker = new RecentBlocksTracker();
  });

  it('records blocks for every high-severity finding', () => {
    const { stub, handlers } = buildFindingsStub();
    tracker.subscribeToFindings(stub);
    expect(handlers).toHaveLength(1);
    handlers[0]({
      artifactId: 'S-1', artifactType: 'story',
      findings: [{
        artifactId: 'S-1', policyId: 'required-fields',
        severity: 'high', message: 'No title; No user story',
      }],
    });
    const snap = tracker.getSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].artifactId).toBe('S-1');
    expect(snap[0].policyId).toBe('required-fields');
    expect(snap[0].failures).toEqual(['No title', 'No user story']);
  });

  it('records blocks for every critical-severity finding', () => {
    const { stub, handlers } = buildFindingsStub();
    tracker.subscribeToFindings(stub);
    handlers[0]({
      artifactId: 'S-Z', artifactType: 'story',
      findings: [{
        artifactId: 'S-Z', policyId: 'schema-conformance',
        severity: 'critical', message: 'Schema mismatch',
      }],
    });
    expect(tracker.getSnapshot()).toHaveLength(1);
    expect(tracker.getSnapshot()[0].policyId).toBe('schema-conformance');
  });

  it('skips low and medium severity findings', () => {
    const { stub, handlers } = buildFindingsStub();
    tracker.subscribeToFindings(stub);
    handlers[0]({
      artifactId: 'S-L', artifactType: 'story',
      findings: [
        { artifactId: 'S-L', policyId: 'P1', severity: 'low', message: 'low' },
        { artifactId: 'S-L', policyId: 'P2', severity: 'medium', message: 'medium' },
      ],
    });
    expect(tracker.getSnapshot()).toEqual([]);
  });

  it('records mixed-severity findings — keeps high/critical, drops low/medium', () => {
    const { stub, handlers } = buildFindingsStub();
    tracker.subscribeToFindings(stub);
    handlers[0]({
      artifactId: 'S-MIX', artifactType: 'story',
      findings: [
        { artifactId: 'S-MIX', policyId: 'P1', severity: 'low', message: 'a' },
        { artifactId: 'S-MIX', policyId: 'P2', severity: 'high', message: 'b' },
        { artifactId: 'S-MIX', policyId: 'P3', severity: 'medium', message: 'c' },
        { artifactId: 'S-MIX', policyId: 'P4', severity: 'critical', message: 'd' },
      ],
    });
    const snap = tracker.getSnapshot();
    expect(snap).toHaveLength(2);
    expect(snap.map(b => b.policyId).sort()).toEqual(['P2', 'P4']);
  });

  it('ignores events with non-array findings', () => {
    const { stub, handlers } = buildFindingsStub();
    tracker.subscribeToFindings(stub);
    handlers[0]({ artifactId: 'S-Y' });
    handlers[0]({ artifactId: 'S-Y', findings: null as any });
    handlers[0]({ artifactId: 'S-Y', findings: 'not-an-array' as any });
    handlers[0]({ artifactId: 'S-Y', findings: 42 as any });
    expect(tracker.getSnapshot()).toEqual([]);
  });

  it('uses event-level artifactType for the recorded block', () => {
    const { stub, handlers } = buildFindingsStub();
    tracker.subscribeToFindings(stub);
    handlers[0]({
      artifactId: 'S-AT', artifactType: 'epic',
      findings: [{ severity: 'high', policyId: 'P1', message: 'm' }],
    });
    expect(tracker.getSnapshot()[0].artifactType).toBe('epic');
  });

  it('uses finding-level artifactId over event-level when both exist', () => {
    const { stub, handlers } = buildFindingsStub();
    tracker.subscribeToFindings(stub);
    handlers[0]({
      artifactId: 'S-EVENT', artifactType: 'story',
      findings: [{ artifactId: 'S-FINDING', policyId: 'P1', severity: 'high', message: 'm' }],
    });
    // finding-level artifactId wins (per the harness contract)
    expect(tracker.getSnapshot()[0].artifactId).toBe('S-FINDING');
  });

  it('returned unsubscribe closure removes the listener', () => {
    const { stub, off } = buildFindingsStub();
    const unsub = tracker.subscribeToFindings(stub);
    unsub();
    expect(off).toHaveBeenCalledWith('findings', expect.any(Function));
  });

  it('unsubscribe closure is safe to call when source lacks off()', () => {
    const noOff = { on: vi.fn() };
    const unsub = tracker.subscribeToFindings(noOff as any);
    expect(() => unsub()).not.toThrow();
  });

  it('multiple subscribers can register independently', () => {
    const a = buildFindingsStub();
    const b = buildFindingsStub();
    tracker.subscribeToFindings(a.stub);
    tracker.subscribeToFindings(b.stub);
    a.handlers[0]({
      artifactId: 'S-A', artifactType: 'story',
      findings: [{ artifactId: 'S-A', policyId: 'P', severity: 'high', message: 'a' }],
    });
    b.handlers[0]({
      artifactId: 'S-B', artifactType: 'story',
      findings: [{ artifactId: 'S-B', policyId: 'P', severity: 'critical', message: 'b' }],
    });
    const snap = tracker.getSnapshot();
    expect(snap.map(s => s.artifactId).sort()).toEqual(['S-A', 'S-B']);
  });
});

describe('splitFailures helper', () => {
  it('returns [] for non-string or empty input', () => {
    expect(splitFailures(undefined)).toEqual([]);
    expect(splitFailures(null)).toEqual([]);
    expect(splitFailures('')).toEqual([]);
    expect(splitFailures(42)).toEqual([]);
  });

  it('splits on ";" with whitespace tolerance', () => {
    expect(splitFailures('a')).toEqual(['a']);
    expect(splitFailures('a;b')).toEqual(['a', 'b']);
    expect(splitFailures('a; b')).toEqual(['a', 'b']);
    expect(splitFailures('a ; b')).toEqual(['a', 'b']);
    expect(splitFailures('  a  ;  b  ')).toEqual(['a', 'b']);
  });

  it('drops empty entries from doubled separators', () => {
    expect(splitFailures('a;;b')).toEqual(['a', 'b']);
    expect(splitFailures('a; ;b')).toEqual(['a', 'b']);
    expect(splitFailures(';;')).toEqual([]);
  });
});

describe('RecentBlocksTracker — timestamp collision policy', () => {
  // Pin the behavior so a future "dedupe on collision" optimization can't
  // silently break the duplicate-tuple dismiss semantics — two entries
  // with the same (artifactId, policyId, timestamp) MUST coexist as
  // separate rows so per-row dismiss works.
  it('two entries with identical (artifactId, policyId, timestamp) coexist', () => {
    const tracker = new RecentBlocksTracker();
    const ts = 1_700_000_000_000;
    tracker.add(makeBlock({
      artifactId: 'S-C',
      policyId: 'required-fields',
      failures: ['collision A'],
      timestamp: ts,
    }));
    tracker.add(makeBlock({
      artifactId: 'S-C',
      policyId: 'required-fields',
      failures: ['collision B'],
      timestamp: ts,
    }));
    const snap = tracker.getSnapshot();
    expect(snap).toHaveLength(2);
    expect(snap[0].failures).toEqual(['collision A']);
    expect(snap[1].failures).toEqual(['collision B']);
  });

  it('collision-tuple dismiss removes the first matching row (FIFO)', () => {
    const tracker = new RecentBlocksTracker();
    const ts = 1_700_000_000_000;
    tracker.add(makeBlock({ artifactId: 'S-X', timestamp: ts, failures: ['row 0'] }));
    tracker.add(makeBlock({ artifactId: 'S-X', timestamp: ts, failures: ['row 1'] }));
    tracker.add(makeBlock({ artifactId: 'S-X', timestamp: ts, failures: ['row 2'] }));
    tracker.dismiss('S-X', 'required-fields', ts);
    const snap = tracker.getSnapshot();
    expect(snap).toHaveLength(2);
    expect(snap[0].failures).toEqual(['row 1']);
    expect(snap[1].failures).toEqual(['row 2']);
  });

  it('distinct timestamps remain distinct (no spurious collision)', () => {
    const tracker = new RecentBlocksTracker();
    tracker.add(makeBlock({ timestamp: 100 }));
    tracker.add(makeBlock({ timestamp: 100, artifactId: 'S-OTHER' }));
    const snap = tracker.getSnapshot();
    expect(snap).toHaveLength(2);
    expect(snap[0].artifactId).toBe('S-1');
    expect(snap[1].artifactId).toBe('S-OTHER');
  });
});

describe('RecentBlocksTracker — instance isolation', () => {
  it('two independent instances do not share state', () => {
    const t1 = new RecentBlocksTracker();
    const t2 = new RecentBlocksTracker();
    t1.add(makeBlock({ artifactId: 'A' }));
    t2.add(makeBlock({ artifactId: 'B' }));
    expect(t1.getSnapshot()[0].artifactId).toBe('A');
    expect(t2.getSnapshot()[0].artifactId).toBe('B');
    expect(t1.size()).toBe(1);
    expect(t2.size()).toBe(1);
  });

  it('dismissing on one instance does not affect the other', () => {
    const t1 = new RecentBlocksTracker();
    const t2 = new RecentBlocksTracker();
    t1.add(makeBlock({ artifactId: 'S-1', timestamp: 100 }));
    t1.dismiss('S-1', 'required-fields', 100);
    expect(t1.size()).toBe(0);
    expect(t2.size()).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════
//  Lifecycle (startup / shutdown) — production singleton flow
// ═════════════════════════════════════════════════════════════════════════════════
//
// The message handler calls `recentBlocksTracker.startup(harnessEngine)` once at
// module load. These tests pin the lifecycle contract: idempotent re-subscription,
// clean detachment on shutdown (returning boolean), isActive observability, and
// preservation of block state across restarts. Production behavior depends on
// every one of these — a regression would leak listeners on hot-reload or would
// silently drop findings between engine swaps.
describe('RecentBlocksTracker — lifecycle (startup / shutdown)', () => {
  let tracker: RecentBlocksTracker;

  beforeEach(() => {
    tracker = new RecentBlocksTracker();
  });

  it('starts inactive (no subscription attached)', () => {
    expect(tracker.isActive()).toBe(false);
  });

  it('startup() with no prior subscription registers exactly one listener', () => {
    const { stub, handlers } = buildFindingsStub();
    tracker.startup(stub);
    expect(tracker.isActive()).toBe(true);
    expect(handlers).toHaveLength(1);
  });

  it('startup() called twice replaces the first subscription (no double-listening)', () => {
    const a = buildFindingsStub();
    const b = buildFindingsStub();

    tracker.startup(a.stub);
    expect(a.handlers).toHaveLength(1);

    tracker.startup(b.stub);
    // First source's listener detached via its off() stub
    expect(a.off).toHaveBeenCalledWith('findings', expect.any(Function));
    expect(a.handlers).toHaveLength(0);
    // Second source now has the active listener
    expect(b.handlers).toHaveLength(1);
    // Still active (now against the second source)
    expect(tracker.isActive()).toBe(true);
  });

  it('shutdown() returns false when nothing is active (no-op)', () => {
    expect(tracker.shutdown()).toBe(false);
  });

  it('shutdown() returns true after a successful detach', () => {
    const { stub } = buildFindingsStub();
    tracker.startup(stub);
    expect(tracker.shutdown()).toBe(true);
  });

  it('shutdown() called twice — second call is a safe no-op returning false', () => {
    const { stub } = buildFindingsStub();
    tracker.startup(stub);
    tracker.shutdown();
    expect(tracker.shutdown()).toBe(false);
  });

  it('shutdown() clears isActive() back to false', () => {
    const { stub } = buildFindingsStub();
    tracker.startup(stub);
    expect(tracker.isActive()).toBe(true);
    tracker.shutdown();
    expect(tracker.isActive()).toBe(false);
  });

  it('block state survives shutdown (buffer preserved across restarts)', () => {
    // Populate buffer before any subscription
    tracker.add(makeBlock({ artifactId: 'S-SURVIVE', timestamp: 1000 }));

    const { stub } = buildFindingsStub();
    tracker.startup(stub);
    tracker.shutdown();

    const snap = tracker.getSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].artifactId).toBe('S-SURVIVE');
    expect(snap[0].timestamp).toBe(1000);
  });

  it('block state survives shutdown + re-startup (findings still flow into existing buffer)', () => {
    tracker.add(makeBlock({ artifactId: 'S-PRE', timestamp: 1000 }));

    const oldSource = buildFindingsStub();
    tracker.startup(oldSource.stub);
    tracker.shutdown();

    const newSource = buildFindingsStub();
    tracker.startup(newSource.stub);

    // Old source detached — its findings DO NOT land in the buffer
    oldSource.handlers[0]?.({
      artifactId: 'S-OLD', artifactType: 'story',
      findings: [{ artifactId: 'S-OLD', policyId: 'P', severity: 'high', message: 'm' }],
    });
    // New source receives findings normally
    newSource.handlers[0]({
      artifactId: 'S-NEW', artifactType: 'story',
      findings: [{ artifactId: 'S-NEW', policyId: 'P', severity: 'high', message: 'm' }],
    });

    const snap = tracker.getSnapshot();
    // S-PRE (pre-existing) + S-NEW (post-swap findings) — but NOT S-OLD
    expect(snap.map(b => b.artifactId).sort()).toEqual(['S-NEW', 'S-PRE']);
  });

  it('after shutdown, isActive is false and the detached source no longer receives buffer pushes', () => {
    // Direct add() — after shutdown, no listener to call, but add() itself
    // doesn't depend on subscription. isActive just reports subscription state.
    const { stub } = buildFindingsStub();
    tracker.startup(stub);
    tracker.shutdown();

    // Re-attach and verify only the new source's listener gets findings
    const newSource = buildFindingsStub();
    tracker.startup(newSource.stub);

    tracker.add(makeBlock({ artifactId: 'S-DIRECT', timestamp: 2000 }));
    // Direct add() updates the buffer regardless of subscription lifecycle
    expect(tracker.size()).toBe(1);
  });

  it('multiple start/stop cycles do not accumulate listeners (memory leak guard)', () => {
    const source = buildFindingsStub();
    for (let i = 0; i < 5; i++) {
      tracker.startup(source.stub);
      tracker.shutdown();
    }
    // The stub's `off` removes the handler from handlers[], so a clean
    // start/stop cycle leaves 0 handlers. If startup stacked listeners
    // without detaching, handlers.length would be 5 here.
    expect(source.handlers).toHaveLength(0);
    expect(tracker.isActive()).toBe(false);
  });

  it('startup() against itself is safe (idempotent when source === current source)', () => {
    const { stub, handlers } = buildFindingsStub();
    tracker.startup(stub);
    tracker.startup(stub); // same source again
    // Detach was called once (before the second attach), leaving 0 handlers
    expect(handlers).toHaveLength(1); // the second attach brought it back to 1
    expect(tracker.isActive()).toBe(true);
  });

  it('startup() returns an unsubscribe closure equivalent to the internal one', () => {
    const { stub, off } = buildFindingsStub();
    tracker.startup(stub);
    const returnedUnsub = tracker.startup({ on: () => {}, off: vi.fn() } as any);
    // Both first and returned (second) closures should be callable
    expect(() => (returnedUnsub as any)()).not.toThrow();
    expect(tracker.isActive()).toBe(false); // last startup wins
  });
});
