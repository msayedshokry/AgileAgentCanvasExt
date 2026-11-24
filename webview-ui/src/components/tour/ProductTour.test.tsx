import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductTour } from './ProductTour';
import {
  computePopoverPosition,
  hasSeenTour,
  markTourSeen,
  TOUR_STATE_KEY,
  TOUR_VERSION,
  type TourStep,
} from './tourSteps';
import { vscode } from '../../vscodeApi';

const STEPS: TourStep[] = [
  { id: 'a', target: '#target-a', title: 'Step A', body: 'Body A' },
  { id: 'missing', target: '#not-on-page', title: 'Missing', body: 'Never shown' },
  { id: 'b', target: '#target-b', title: 'Step B', body: 'Body B' },
];

function stubRect(el: Element, rect: { left: number; top: number; width: number; height: number }): void {
  el.getBoundingClientRect = () => ({
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => rect,
  });
}

function mountTargets(): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = '<button id="target-a">A</button><button id="target-b">B</button><span id="zero-size"></span>';
  document.body.appendChild(host);
  // jsdom has no layout; give the targets an on-screen box.
  stubRect(host.querySelector('#target-a')!, { left: 10, top: 10, width: 40, height: 20 });
  stubRect(host.querySelector('#target-b')!, { left: 100, top: 10, width: 40, height: 20 });
  return host;
}

describe('ProductTour', () => {
  let host: HTMLElement;
  beforeEach(() => { host = mountTargets(); });
  afterEach(() => { host.remove(); });

  it('skips steps whose target is not on the page and shows the count', () => {
    render(<ProductTour steps={STEPS} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Step A' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('advances with Next, goes back with Back, and finishes with Done', () => {
    const onClose = vi.fn();
    render(<ProductTour steps={STEPS} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog', { name: 'Step B' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'End Tour' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog', { name: 'Step A' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on End Tour and on Escape', () => {
    const onClose = vi.fn();
    render(<ProductTour steps={STEPS} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'End Tour' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('navigates with arrow keys without leaking them to the page', () => {
    const pageHandler = vi.fn();
    document.addEventListener('keydown', pageHandler);
    render(<ProductTour steps={STEPS} onClose={vi.fn()} />);

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Step B' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(screen.getByRole('dialog', { name: 'Step A' })).toBeInTheDocument();
    expect(pageHandler).not.toHaveBeenCalled();
    document.removeEventListener('keydown', pageHandler);
  });

  it('focuses the primary button so Enter advances', () => {
    render(<ProductTour steps={STEPS} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
  });

  it('skips targets that are rendered without a size', () => {
    render(<ProductTour steps={[{ id: 'z', target: '#zero-size', title: 'Zero', body: '' }, STEPS[0]]} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Step A' })).toBeInTheDocument();
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
  });

  it('closes immediately when no step target exists', () => {
    const onClose = vi.fn();
    render(<ProductTour steps={[STEPS[1]]} onClose={onClose} />);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('computePopoverPosition', () => {
  const viewport = { width: 800, height: 600 };
  const popover = { width: 300, height: 150 };

  it('places the popover below a target near the top', () => {
    const pos = computePopoverPosition({ top: 10, left: 100, width: 40, height: 30 }, popover, viewport);
    expect(pos.placement).toBe('bottom');
    expect(pos.top).toBe(52);
  });

  it('places the popover above a target near the bottom', () => {
    const pos = computePopoverPosition({ top: 540, left: 100, width: 40, height: 40 }, popover, viewport);
    expect(pos.placement).toBe('top');
    expect(pos.top).toBe(540 - 150 - 12);
  });

  it('clamps horizontally inside the viewport', () => {
    const right = computePopoverPosition({ top: 10, left: 780, width: 20, height: 20 }, popover, viewport);
    expect(right.left).toBe(800 - 300 - 8);
    const left = computePopoverPosition({ top: 10, left: 0, width: 20, height: 20 }, popover, viewport);
    expect(left.left).toBe(8);
  });
});

describe('tour persistence', () => {
  it('reports unseen until marked, preserving other webview state', () => {
    const getState = vi.mocked(vscode.getState);
    const setState = vi.mocked(vscode.setState);
    getState.mockReturnValue({ themeOverride: 'dark' });
    expect(hasSeenTour()).toBe(false);

    markTourSeen();
    expect(setState).toHaveBeenCalledWith({ themeOverride: 'dark', [TOUR_STATE_KEY]: TOUR_VERSION });

    getState.mockReturnValue({ [TOUR_STATE_KEY]: TOUR_VERSION });
    expect(hasSeenTour()).toBe(true);
    getState.mockReturnValue({});
  });
});
