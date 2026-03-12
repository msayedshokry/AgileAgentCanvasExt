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
