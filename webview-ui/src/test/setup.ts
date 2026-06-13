/**
 * Webview Test Setup
 */

import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock VS Code API that the webview uses
const mockVsCodeApi = {
  postMessage: vi.fn(),
  getState: vi.fn().mockReturnValue({}),
  setState: vi.fn(),
};

// Mock acquireVsCodeApi global function
vi.stubGlobal('acquireVsCodeApi', () => mockVsCodeApi);

// Export for use in tests
export { mockVsCodeApi };

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  mockVsCodeApi.getState.mockReturnValue({});
});

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

// Mock Element.scrollIntoView (not implemented in JSDOM)
Element.prototype.scrollIntoView = vi.fn();

// Mock HTMLCanvasElement context for jsdom (no native CanvasRenderingContext2D).
// html2canvas-based screenshot tests need getContext to return a usable mock
// so the finalCanvas draw + toDataURL chain works.
const _origGc = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
  if (type === '2d') {
    // Return a mock 2D context — vitest tests use vi.fn() for assertions.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mocks = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 0 }),
      getImageData: vi.fn(),
      putImageData: vi.fn(),
      createLinearGradient: vi.fn(),
      createPattern: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
    };
    return mocks;
  }
  return _origGc.call(this, type, ...args);
};

// In jsdom, HTMLCanvasElement.toDataURL() returns 'data:,' which is not a
// valid PNG. Stub it to return a minimal valid base64 data URL so screenshot
// tests don't fail on the final canvas conversion.  The stub preserves the
// requested MIME type so callers that pass 'image/jpeg' get the correct prefix.
// We don't restore these stubs — jsdom never had a real implementation.
HTMLCanvasElement.prototype.toDataURL = function (type?: string, _quality?: any) {
  const mime = type || 'image/png';
  return `data:${mime};base64,iVBORw0KGgo=`;
};
