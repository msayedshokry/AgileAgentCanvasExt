import { vscode } from '../../vscodeApi';

export interface TourStep {
  id: string;
  /** CSS selector for the element to spotlight. Steps whose target is absent are skipped. */
  target: string;
  title: string;
  body: string;
}

export const TOUR_STATE_KEY = 'productTourSeen';

/** Bump when the step list changes enough that existing users should see it again. */
export const TOUR_VERSION = 1;

export const CANVAS_TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'lanes',
    target: '.column-header.discovery',
    title: 'Four Lanes, One Flow',
    body: 'Work moves left to right, from Discovery to Implementation.',
  },
  {
    id: 'add',
    target: '.toolbar-fab-btn',
    title: 'Add Artifacts',
    body: 'Create a brief, PRD, epic or story. Select a card first to add children under it.',
  },
  {
    id: 'ask',
    target: '.toolbar-ask-btn',
    title: 'Ask About Your Project',
    body: "Ask anything; answers use what's on this canvas.",
  },
  {
    id: 'workflows',
    target: '.workflow-fab',
    title: 'Let AI Do the Legwork',
    body: 'Launch a guided BMAD workflow. Results land on the canvas.',
  },
  {
    id: 'provider',
    target: '.provider-selector-trigger',
    title: 'Pick Your AI Tool',
    body: 'Choose who runs workflows: Copilot, Claude Code, Codex and more.',
  },
  {
    id: 'kanban',
    target: '.kanban-toggle-fab',
    title: 'Hand Off to Agents',
    body: 'Send stories to coding agents and track their progress.',
  },
  {
    id: 'more',
    target: '.toolbar-overflow-btn',
    title: 'Everything Else',
    body: 'Export, Jira, sprint planning and Help. Replay this tour here.',
  },
];

interface StoredState {
  [TOUR_STATE_KEY]?: number;
}

/**
 * Session cache only. Webview state is wiped when VS Code restarts (the canvas
 * has no panel serializer), so the durable flag lives in the extension's
 * globalState: ask with `requestTourSeenVersion`, record with `markTourSeen`.
 */
export function hasSeenTour(): boolean {
  const state = (vscode.getState() as StoredState | undefined) ?? {};
  return (state[TOUR_STATE_KEY] ?? 0) >= TOUR_VERSION;
}

/** Ask the extension which tour version was seen; it replies with `productTour:seen`. */
export function requestTourSeenVersion(): void {
  vscode.postMessage({ type: 'productTour:getSeen' });
}

/** Read the extension's reply; `null` for any other message. */
export function readTourSeenReply(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null;
  const msg = data as { type?: unknown; version?: unknown };
  return msg.type === 'productTour:seen' && typeof msg.version === 'number' ? msg.version : null;
}

export function markTourSeen(): void {
  const current = (vscode.getState() as Record<string, unknown> | undefined) ?? {};
  vscode.setState({ ...current, [TOUR_STATE_KEY]: TOUR_VERSION });
  vscode.postMessage({ type: 'productTour:markSeen', version: TOUR_VERSION });
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Placement = 'top' | 'bottom';

export interface PopoverPosition {
  top: number;
  left: number;
  placement: Placement;
}

const GAP = 12;
const EDGE = 8;

/**
 * Place the popover below the target when it fits, otherwise above,
 * and clamp it inside the viewport horizontally and vertically.
 */
export function computePopoverPosition(target: Rect, popover: Size, viewport: Size): PopoverPosition {
  const spaceBelow = viewport.height - (target.top + target.height);
  const fitsBelow = spaceBelow >= popover.height + GAP + EDGE;
  const fitsAbove = target.top >= popover.height + GAP + EDGE;
  const placement: Placement = fitsBelow || !fitsAbove ? 'bottom' : 'top';

  const rawTop = placement === 'bottom'
    ? target.top + target.height + GAP
    : target.top - popover.height - GAP;
  const maxTop = Math.max(EDGE, viewport.height - popover.height - EDGE);
  const top = Math.min(Math.max(rawTop, EDGE), maxTop);

  const centered = target.left + target.width / 2 - popover.width / 2;
  const maxLeft = Math.max(EDGE, viewport.width - popover.width - EDGE);
  const left = Math.min(Math.max(centered, EDGE), maxLeft);

  return { top, left, placement };
}
