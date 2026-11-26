// ─── "Needs you" attention tracking ──────────────────────────────────────────
// Autonomous runs are only useful if the user notices when one stops. This
// keeps the set of cards waiting on a human (stopped runs, approval
// checkpoints, stories paused after repeated failures) and shows it as a
// status-bar count with a jump list. The tracker is pure; the status bar and
// event wiring live in registerNeedsYou().

import * as vscode from 'vscode';
import { kanbanProgress, type KanbanProgressEvent } from '../workflow/kanban-orchestrator';
import { autoScheduler } from '../workflow/auto-scheduler';

export type AttentionKind = 'approval' | 'stopped' | 'paused' | 'autopilot' | 'question' | 'proposal' | 'assigned';

export interface AttentionItem {
  readonly artifactId: string;
  readonly kind: AttentionKind;
  readonly reason: string;
  readonly since: number;
  /** The card this is about, when the item is keyed by something else (proposals). */
  readonly cardId?: string;
  /** Texts the user needs to see: an agent's questions, or proposed card titles. */
  readonly details?: readonly string[];
}

export interface AttentionExtra {
  readonly cardId?: string;
  readonly details?: readonly string[];
}

export class NeedsYouTracker {
  private items = new Map<string, AttentionItem>();

  /** Apply a progress event; returns true when the set changed. */
  onProgress(evt: KanbanProgressEvent, now = Date.now()): boolean {
    const s = evt.agentState;
    if ((s as { agentRole?: string }).agentRole === 'approval-needed') {
      return this.set(evt.artifactId, 'approval', 'Approval needed to continue', now);
    }
    if (s.status === 'interrupted' || s.status === 'failed') {
      // A run that stopped to ask the user stays a question, not a generic stop.
      if (this.items.get(evt.artifactId)?.kind === 'question') return false;
      return this.set(evt.artifactId, 'stopped', s.failure?.title ?? 'Agent run stopped', now);
    }
    if (s.status === 'running' || s.status === 'completed') {
      return this.items.delete(evt.artifactId);
    }
    return false;
  }

  /** Merge stories the scheduler paused (e.g. after repeated failures). */
  syncPaused(paused: ReadonlyArray<{ id: string; reason?: string; pausedAt: number }>): boolean {
    let changed = false;
    for (const p of paused) {
      if (p.reason && !this.items.has(p.id)) {
        this.items.set(p.id, { artifactId: p.id, kind: 'paused', reason: `Paused: ${p.reason}`, since: p.pausedAt });
        changed = true;
      }
    }
    return changed;
  }

  /** Raise an item from outside the board (e.g. an autopilot run that needs a person). */
  notify(artifactId: string, kind: AttentionKind, reason: string, now = Date.now(), extra: AttentionExtra = {}): boolean {
    return this.set(artifactId, kind, reason, now, extra);
  }

  dismiss(artifactId: string): boolean {
    return this.items.delete(artifactId);
  }

  list(): AttentionItem[] {
    return [...this.items.values()].sort((a, b) => a.since - b.since);
  }

  private set(artifactId: string, kind: AttentionKind, reason: string, now: number, extra: AttentionExtra = {}): boolean {
    const prev = this.items.get(artifactId);
    const same = prev?.reason === reason && prev.kind === kind
      && JSON.stringify(prev.details ?? []) === JSON.stringify(extra.details ?? []);
    if (same) return false;
    this.items.set(artifactId, {
      artifactId, kind, reason, since: prev?.since ?? now,
      ...(extra.cardId ? { cardId: extra.cardId } : {}),
      ...(extra.details?.length ? { details: [...extra.details] } : {}),
    });
    return true;
  }
}

// The registered tracker, so the board's Inbox and autopilots reach the same list.
let active: { tracker: NeedsYouTracker; changed: () => void } | undefined;

export function needsYouList(): AttentionItem[] {
  return active?.tracker.list() ?? [];
}

/** Raise an item on the status bar and the board's Inbox; a no-op before activation. */
export function notifyNeedsYou(artifactId: string, kind: AttentionKind, reason: string, extra?: AttentionExtra): void {
  if (active?.tracker.notify(artifactId, kind, reason, Date.now(), extra)) active.changed();
}

export function dismissNeedsYou(artifactId: string): void {
  if (active?.tracker.dismiss(artifactId)) active.changed();
}

/**
 * Status-bar count + "Show What Needs You" command. `focusCard` reveals a card
 * on the board; `onChange` receives the list whenever it changes.
 */
export function registerNeedsYou(
  context: vscode.ExtensionContext,
  focusCard: (artifactId: string) => void,
  onChange: (items: AttentionItem[]) => void = () => undefined,
): NeedsYouTracker {
  const tracker = new NeedsYouTracker();
  const item = vscode.window.createStatusBarItem('agileagentcanvas.needsYou', vscode.StatusBarAlignment.Left, 50);
  item.name = 'Agile Agent Canvas: Needs You';
  item.command = 'agileagentcanvas.showNeedsYou';

  const render = () => {
    const list = tracker.list();
    if (list.length === 0) {
      item.hide();
      return;
    }
    item.text = `$(bell-dot) ${list.length} need${list.length === 1 ? 's' : ''} you`;
    item.tooltip = list.map((i) => `${i.artifactId}: ${i.reason}`).join('\n');
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    item.show();
  };
  const changed = () => { render(); onChange(tracker.list()); };
  active = { tracker, changed };

  context.subscriptions.push(
    item,
    kanbanProgress.event((evt) => { if (tracker.onProgress(evt)) changed(); }),
    vscode.commands.registerCommand('agileagentcanvas.showNeedsYou', async () => {
      const list = tracker.list();
      if (list.length === 0) {
        void vscode.window.showInformationMessage('Nothing on the board needs you right now.');
        return;
      }
      const pick = await vscode.window.showQuickPick(
        list.map((i) => ({ label: i.artifactId, description: i.reason, detail: `since ${new Date(i.since).toLocaleTimeString()}`, id: i.artifactId })),
        { title: 'Cards waiting on you', placeHolder: 'Pick a card to open it on the board' },
      );
      if (!pick) return;
      await vscode.commands.executeCommand('agileagentcanvas.agenticKanban.focus');
      focusCard(pick.id);
      if (tracker.dismiss(pick.id)) changed();
    }),
  );

  const onScheduler = () => { if (tracker.syncPaused(autoScheduler.getPausedStories())) changed(); };
  autoScheduler.on('stateChange', onScheduler);
  context.subscriptions.push({ dispose: () => { autoScheduler.off('stateChange', onScheduler); active = undefined; } });
  return tracker;
}
