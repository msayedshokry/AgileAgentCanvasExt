// Early boot log — confirms JS execution started
const BOOT_START = Date.now();
console.log('[webview:boot] main.tsx evaluating at', new Date().toISOString());
console.log('[webview:boot] document.readyState:', document.readyState);
console.log('[webview:boot] URL:', document.URL);
console.log('[webview:boot] root element exists:', !!document.getElementById('root'));

import React from 'react';
import ReactDOM from 'react-dom/client';
import { RootApp } from './App';
import { vscode } from './vscodeApi';
import './styles/index.css';

console.log('[webview:boot] Imports loaded, elapsed:', Date.now() - BOOT_START, 'ms');

try {
  console.log('[webview:boot] Creating React root...');
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <RootApp />
    </React.StrictMode>
  );
  console.log('[webview:boot] React render() returned successfully, elapsed:', Date.now() - BOOT_START, 'ms');
} catch (err) {
  const msg = `[webview] Fatal render error: ${err instanceof Error ? err.message : String(err)}`;
  console.error(msg, err);
  // Post to extension so it appears in the output channel
  vscode.postMessage({ type: 'webviewError', error: msg, stack: err instanceof Error ? err.stack : undefined });
  // Show fallback UI
  document.getElementById('root')!.innerHTML = `<div style="padding:20px;color:var(--vscode-errorForeground,#f44);font-family:var(--vscode-font-family);"><h3>Webview Error</h3><pre style="white-space:pre-wrap;font-size:12px">${msg}</pre></div>`;
}
