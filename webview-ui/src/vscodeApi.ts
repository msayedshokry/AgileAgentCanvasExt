// Shared VS Code webview API singleton
// Extracted so any component can post messages directly without prop-drilling.

interface VsCodeApi {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// Acquire VS Code API once at module load (required by VS Code).
// Must be called exactly once across the entire app.
const vscode: VsCodeApi = (function () {
  try {
    if (typeof acquireVsCodeApi === 'function') {
      return acquireVsCodeApi();
    }
  } catch (e) {
    console.error('Failed to acquire VS Code API:', e);
  }
  // Fallback for development/testing outside VS Code
  console.warn('Not running in VS Code webview, using mock API');
  return {
    postMessage: (msg: unknown) => console.log('Mock postMessage:', msg),
    getState: () => ({}),
    setState: () => {},
  };
})();

export { vscode };
export type { VsCodeApi };
