// ─── Webviews that show the Agentic board ────────────────────────────────────
// The board can live in more than one webview: the Canvas editor tab (where
// people use it), the canvas sidebar view, and the dedicated board view.
// Live updates (a run ended, progress lines, Inbox, team changes) must reach
// every one of them, not only the dedicated view, which is usually hidden.
// A webview joins when it sends the board handler a message; one that has
// been closed drops out the first time a post to it fails.

import * as vscode from 'vscode';

const hosts = new Set<vscode.Webview>();
const added = new vscode.EventEmitter<vscode.Webview>();

/** Fires once per webview when it starts talking to the board. */
export const onBoardHostAdded = added.event;

export function addBoardHost(webview: vscode.Webview): void {
  if (hosts.has(webview)) return;
  hosts.add(webview);
  added.fire(webview);
}

/** Post to every board webview except `skip` (already posted to by the caller). */
export function postToBoardHosts(message: unknown, skip?: vscode.Webview): void {
  for (const webview of [...hosts]) {
    if (webview === skip) continue;
    try {
      void Promise.resolve(webview.postMessage(message)).then(undefined, () => hosts.delete(webview));
    } catch {
      hosts.delete(webview); // disposed panel
    }
  }
}

/** For tests. */
export function boardHostCount(): number {
  return hosts.size;
}

export function clearBoardHosts(): void {
  hosts.clear();
}
