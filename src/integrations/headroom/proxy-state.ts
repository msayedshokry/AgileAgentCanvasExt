/**
 * Shared state for the in-process Headroom proxy.
 *
 * Why this exists: the proxy module needs to drive the status bar, and the
 * status bar needs to read what the proxy module is doing — without the
 * two importing each other. This module is the source of truth; both
 * sides depend only on it.
 *
 * States:
 *  - `idle`     — proxy has never been started (default on module load)
 *  - `starting` — `http.createServer` was constructed but not yet listening
 *  - `running`  — listening on 127.0.0.1:8787; `GET /v1/health` returns 200
 *  - `fallback` — port 8787 already in use by another process; extension
 *                 intentionally did not host its own server
 *  - `failed`   — listen error other than `EADDRINUSE`
 */

export type LocalProxyState =
    | 'idle'
    | 'starting'
    | 'running'
    | 'fallback'
    | 'failed';

let _state: LocalProxyState = 'idle';
const _listeners = new Set<(s: LocalProxyState) => void>();

/**
 * Replace the current state and notify subscribers.
 *
 * No-op transitions (setting the same state) are intentionally silent so
 * concurrent callers (subscription race during activation) don't trigger
 * noisy refreshes.
 */
export function setLocalProxyState(next: LocalProxyState): void {
    if (next === _state) { return; }
    _state = next;
    for (const listener of _listeners) {
        try { listener(next); } catch {
            // Listener errors must never break the state setter — drop them.
        }
    }
}

/** Read the current state (snapshot). */
export function getLocalProxyState(): LocalProxyState {
    return _state;
}

/**
 * Subscribe to state changes. The callback fires immediately with the
 * current state so subscribers can render once on attach without a
 * second refresh tick.
 *
 * Returns a disposer that unsubscribes.
 */
export function onLocalProxyStateChange(
    listener: (s: LocalProxyState) => void,
): () => void {
    listener(_state);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
}

/**
 * Test-only: drop every listener and reset state to `idle`.
 *
 * Vitest exercises `createHeadroomStatusBar` repeatedly in one process
 * — without this each `beforeEach` would leak another listener into
 * the module-level Set and pile up timers across hundreds of assertions.
 *
 * Not exported under any other name (no dual-purpose surface) so it
 * can't be misused at runtime.
 */
export function resetLocalProxyStateForTest(): void {
    _listeners.clear();
    _state = 'idle';
}
