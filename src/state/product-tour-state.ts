import type * as vscode from 'vscode';

/**
 * Remembers which version of the canvas product tour the user has seen.
 *
 * Lives in extension `globalState`, not webview state: the canvas has no
 * WebviewPanelSerializer, so `vscode.setState` in the webview is wiped on
 * every VS Code restart and the tour would show at each launch.
 */
export const PRODUCT_TOUR_SEEN_KEY = 'productTourSeenVersion';

/** Upper bound for a version the webview may report; rejects junk values. */
const MAX_TOUR_VERSION = 1000;

let memento: vscode.Memento | undefined;

export function initProductTourState(globalState: vscode.Memento): void {
    memento = globalState;
}

export function getProductTourSeenVersion(): number {
    const stored = memento?.get<unknown>(PRODUCT_TOUR_SEEN_KEY);
    return typeof stored === 'number' && Number.isInteger(stored) ? stored : 0;
}

export function isValidTourVersion(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_TOUR_VERSION;
}

/** Record the tour as seen. Never lowers a version already stored. */
export async function markProductTourSeen(version: number): Promise<void> {
    if (!memento || !isValidTourVersion(version)) return;
    if (version <= getProductTourSeenVersion()) return;
    await memento.update(PRODUCT_TOUR_SEEN_KEY, version);
}

/** Test-only: drop the memento between tests. */
export function resetProductTourStateForTests(): void {
    memento = undefined;
}
