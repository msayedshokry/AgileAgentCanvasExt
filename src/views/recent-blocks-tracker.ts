// ─── RecentBlocksTracker ─────────────────────────────────────────────────────
// Ring buffer of the most recent blocking harness evaluation failures, used by
// the SafetyPanel to surface per-artifact "blocked by policy X" entries.
//
// Design notes:
//   - Passive accumulator — does NOT proactively push state to the webview.
//     The message handler pulls `getSnapshot()` when it builds a safetyStatus
//     IPC payload. This keeps the tracker free of webview/transport coupling.
//   - Duck-typed `subscribeToFindings` source — accepts any object with an
//     `on('findings', ...)` method, so the tracker can be unit-tested with a
//     hand-rolled stub without coupling to the concrete `HarnessEngine` class.
//   - Defensive `getSnapshot()` — IPC payloads must be immutable from the
//     caller's perspective. Cloning a 20-item array is trivially cheap in V8.
//
// Lives in `src/views/` next to the message handler because it's a
// view-model feeding the React SafetyPanel, not part of the core harness.

import { createLogger } from '../utils/logger';

const logger = createLogger('recent-blocks-tracker');

/** Maximum number of entries kept in the ring buffer (oldest get shifted out). */
export const MAX_RECENT_BLOCKS = 20;

/** A single blocking-policy failure entry shown in the SafetyPanel. */
export interface RecentBlock {
  artifactId: string;
  artifactType: string;
  policyId: string;
  /** Per-failure breakdown — split from the harness combined message. */
  failures: string[];
  /**
   * Identifies a specific entry even when (artifactId, policyId) are
   * duplicated across NEEDS_FIXES iterations, so the dismiss IPC can
   * target one row without collapsing siblings.
   */
  timestamp: number;
}

/** Duck-typed interface for any object that emits 'findings' events. */
export interface HarnessFindingsLike {
  artifactId?: string;
  artifactType?: string;
  findings?: Array<{
    artifactId?: string;
    policyId?: string;
    severity?: string;
    message?: string;
  }>;
}

/** Minimal duck-typed source contract for `subscribeToFindings`. */
export interface FindingsSource {
  on(event: 'findings', listener: (event: HarnessFindingsLike) => void): unknown;
  off?(event: 'findings', listener: (event: HarnessFindingsLike) => void): unknown;
}

/**
 * Ring buffer of the last `MAX_RECENT_BLOCKS` blocking harness findings.
 *
 * NOT an EventEmitter — the tracker is a passive accumulator. Consumers
 * pull state via `getSnapshot()`. Use `subscribeToFindings()` once at
 * module load to wire it up to the harness's `'findings'` event stream.
 */
export class RecentBlocksTracker {
  private blocks: RecentBlock[] = [];
  /**
   * Lifecycle state — the currently-attached findings source and its
   * unsubscribe closure. `null` when nothing is subscribed. The pair
   * is only ever non-null together (set by `startup`, cleared by `shutdown`
   * or by a subsequent `startup` that replaced the prior subscription).
   */
  private currentSource: FindingsSource | null = null;
  private currentUnsubscribe: (() => void) | null = null;

  /**
   * Insert a block into the buffer. Returns the canonical entry that was
   * stored (with timestamp assigned if not provided). Older entries are
   * shifted out once `MAX_RECENT_BLOCKS` is exceeded.
   */
  add(input: Omit<RecentBlock, 'timestamp'> & { timestamp?: number }): RecentBlock {
    const entry: RecentBlock = {
      artifactId: input.artifactId,
      artifactType: input.artifactType,
      policyId: input.policyId,
      failures: Array.isArray(input.failures) ? [...input.failures] : [],
      timestamp: typeof input.timestamp === 'number' ? input.timestamp : Date.now(),
    };
    this.blocks.push(entry);
    while (this.blocks.length > MAX_RECENT_BLOCKS) {
      this.blocks.shift();
    }
    return entry;
  }

  /**
   * Remove one entry matched by (artifactId, policyId, timestamp) tuple.
   * Timestamp is REQUIRED so duplicate (artifactId, policyId) siblings —
   * e.g. from NEEDS_FIXES re-evaluations — can be dismissed independently.
   * Returns true if any entry was removed.
   */
  dismiss(artifactId: string, policyId: string, timestamp: number): boolean {
    const idx = this.blocks.findIndex(b =>
      b.artifactId === artifactId &&
      b.policyId === policyId &&
      b.timestamp === timestamp,
    );
    if (idx === -1) return false;
    this.blocks.splice(idx, 1);
    return true;
  }

  /**
   * Empty the buffer. Returns the number of entries that were removed
   * (0 if the buffer was already empty).
   */
  clearAll(): number {
    const removed = this.blocks.length;
    this.blocks.length = 0;
    if (removed > 0) {
      logger.debug(`[RecentBlocks] Cleared ${removed} entries`);
    }
    return removed;
  }

  /**
   * Defensive copy of the current buffer, safe to hand to the webview
   * without exposing the live array. `failures` arrays are also cloned
   * so consumers can't mutate internal state via the snapshot.
   */
  getSnapshot(): RecentBlock[] {
    return this.blocks.map(b => ({
      artifactId: b.artifactId,
      artifactType: b.artifactType,
      policyId: b.policyId,
      failures: [...b.failures],
      timestamp: b.timestamp,
    }));
  }

  /** Number of entries currently in the buffer. */
  size(): number {
    return this.blocks.length;
  }

  /**
   * Subscribe to a harness-like `'findings'` event source. Only findings
   * with severity `'high'` or `'critical'` are recorded — advisory
   * (low/medium) findings are filtered out.
   *
   * Returns an unsubscribe closure; safe to discard for singleton use.
   *
   * Production callers should prefer `startup()`/`shutdown()` lifecycle
   * methods, which track ownership so a re-subscribed source replaces
   * (rather than stacks with) any prior source. This method stays public
   * for unit tests that need to wire a fresh tracker to a stub source.
   */
  subscribeToFindings(source: FindingsSource): () => void {
    const listener = (event: HarnessFindingsLike) => {
      const findings = Array.isArray(event?.findings) ? event.findings : [];
      for (const f of findings) {
        const sev = typeof f?.severity === 'string' ? f.severity : '';
        if (sev !== 'high' && sev !== 'critical') continue;
        this.add({
          artifactId: typeof f?.artifactId === 'string' ? f.artifactId : '',
          artifactType: typeof event?.artifactType === 'string' ? event.artifactType : '',
          policyId: typeof f?.policyId === 'string' ? f.policyId : '',
          failures: splitFailures(f?.message),
        });
      }
    };
    source.on('findings', listener);
    return () => {
      if (typeof source.off === 'function') {
        source.off('findings', listener);
      }
    };
  }

  // ── Lifecycle (startup / shutdown) ───────────────────────────────────────
  //
  // The harness engine is a long-lived singleton, but in test/process
  // hot-reload scenarios the engine can be replaced (e.g. after VS Code
  // restart of the extension host). These methods let external code
  // detach the OLD engine's listener and attach to a NEW one atomically
  // without leaking the prior listener.

  /**
   * Lifecycle-aware subscription. Idempotent: if a previous subscription
   * is still active, it is torn down first so listeners never stack.
   *
   * Returns a state-aware unsubscribe closure for the just-installed
   * listener. Calling the returned closure:
   *   - Detaches the listener from the source (via `source.off` if present)
   *   - Clears the tracker's active state if it was still the current
   *     subscription (so `isActive()` flips to `false` correctly)
   *   - Is idempotent — subsequent calls are no-ops
   *
   * Block state is preserved across the swap — the buffer is NOT cleared
   * here. Call `clearAll()` explicitly if the caller wants a clean slate.
   */
  startup(source: FindingsSource): () => void {
    // Detach any existing subscription first; this also clears tracker state.
    if (this.currentUnsubscribe) {
      logger.debug('[RecentBlocks] Replacing existing subscription');
      this.currentUnsubscribe();
    }
    this.currentSource = source;
    // Wrap the raw unsubscribe so that calling it externally also keeps
    // `isActive()` honest. The wrapper compares its identity to the
    // tracker's currentUnsubscribe before clearing state — if a newer
    // startup() has since replaced this subscription, we MUST NOT clear
    // the tracker's active state (which now points at the newer closure).
    const rawUnsub = this.subscribeToFindings(source);
    let detached = false;
    const wrappedUnsub: () => void = () => {
      if (detached) return;
      detached = true;
      rawUnsub();
      if (this.currentUnsubscribe === wrappedUnsub) {
        this.currentUnsubscribe = null;
        this.currentSource = null;
        logger.debug('[RecentBlocks] Subscription detached via returned closure');
      }
    };
    this.currentUnsubscribe = wrappedUnsub;
    logger.debug('[RecentBlocks] Subscribed to findings source');
    return wrappedUnsub;
  }

  /**
   * Cleanly tear down the current subscription.
   *   - Returns `false` when nothing was subscribed (no-op).
   *   - Returns `true` after successfully detaching.
   *
   * Calling `shutdown()` multiple times is safe (subsequent calls return
   * `false`). Block state is NOT cleared by `shutdown()` — call
   * `clearAll()` explicitly if the caller wants a clean slate.
   */
  shutdown(): boolean {
    if (!this.currentUnsubscribe) return false;
    this.currentUnsubscribe();
    // The wrapped closure clears `currentUnsubscribe` itself; this is a
    // safety net for sources without `.off()` whose rawUnsub is a no-op.
    if (this.currentUnsubscribe) {
      this.currentUnsubscribe = null;
      this.currentSource = null;
    }
    logger.debug('[RecentBlocks] Shut down');
    return true;
  }

  /** True when a findings source is currently attached. */
  isActive(): boolean {
    return this.currentUnsubscribe !== null;
  }
}

/**
 * Split a harness combined-failure message into individual failure strings.
 * Splits on `;`, trims whitespace, drops empty entries. Tolerant of
 * inconsistent spacing (`a;b`, `a; b`, `a ; b` all produce ['a','b']).
 *
 * Exported for direct unit testing — production callers go through
 * `subscribeToFindings()` which invokes it on each event.
 */
export function splitFailures(message: unknown): string[] {
  if (typeof message !== 'string' || message.length === 0) return [];
  return message.split(';').map(s => s.trim()).filter(Boolean);
}

/**
 * Production singleton bound to the harness engine. The message handler
 * subscribes to `harnessEngine` once at module load and queries the
 * tracker for every `safetyStatus` IPC payload.
 */
export const recentBlocksTracker = new RecentBlocksTracker();
