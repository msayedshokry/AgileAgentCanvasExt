// Webview script and style URLs carry the file's build time. The bundle is
// always assets/index.js and the version rarely changes, so after an update
// the webview kept serving its cached copy and new UI never showed up.

import * as fs from 'fs';
import * as vscode from 'vscode';

export function webviewAssetUri(webview: vscode.Webview, file: vscode.Uri): vscode.Uri {
  const uri = webview.asWebviewUri(file);
  try {
    return uri.with({ query: `v=${Math.floor(fs.statSync(file.fsPath).mtimeMs)}` });
  } catch {
    return uri; // missing file: the page shows its own fallback
  }
}
