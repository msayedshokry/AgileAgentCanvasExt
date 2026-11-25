/**
 * First-run product tour: it must auto-start only when the extension's
 * globalState says this tour version was never seen — not on every launch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import App from './App';
import { mockVsCodeApi } from '@test/setup';
import { TOUR_VERSION } from './components/tour/tourSteps';
import type { Artifact } from './types';

const ARTIFACT: Artifact = {
  id: 'epic-1',
  type: 'epic',
  title: 'Epic',
  description: '',
  status: 'draft',
  position: { x: 100, y: 100 },
  size: { width: 280, height: 150 },
  dependencies: [],
  metadata: {},
};

function dispatch(data: Record<string, unknown>): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data }));
  });
}

function postedTypes(): string[] {
  return mockVsCodeApi.postMessage.mock.calls.map(([msg]) => (msg as { type: string }).type);
}

/** Load a project, let the host answer with `seenVersion`, then wait out the auto-start delay. */
function launch(seenVersion: number | null): void {
  render(<App />);
  dispatch({ type: 'updateArtifacts', artifacts: [ARTIFACT] });
  if (seenVersion !== null) dispatch({ type: 'productTour:seen', version: seenVersion });
  act(() => { vi.advanceTimersByTime(5000); });
}

describe('App product tour auto-start', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('asks the extension whether the tour was seen', () => {
    render(<App />);
    expect(postedTypes()).toContain('productTour:getSeen');
  });

  it('starts once and records it in the extension when never seen', () => {
    launch(0);
    // Marked when it opens (and again on close; the host never lowers the version).
    expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({ type: 'productTour:markSeen', version: TOUR_VERSION });
  });

  it('does not start on a later launch once the extension reports it seen', () => {
    launch(TOUR_VERSION);
    expect(postedTypes()).not.toContain('productTour:markSeen');
  });

  it('does not start when the extension never answers', () => {
    launch(null);
    expect(postedTypes()).not.toContain('productTour:markSeen');
  });

  it('does not start on an empty canvas', () => {
    render(<App />);
    dispatch({ type: 'productTour:seen', version: 0 });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(postedTypes()).not.toContain('productTour:markSeen');
  });
});
