// ─── "Needs you" attention tracking ──────────────────────────────────────────
// Autonomous runs are only useful if the user notices when one stops. This
// keeps the set of cards waiting on a human (stopped runs, approval
// checkpoints, stories paused after repeated failures) and shows it as a
// status-bar count with a jump list. The tracker is pure; the status bar and
// event wiring live in registerNeedsYou().

import * as vscode from 'vscode';
import { kanbanProgress, type KanbanProgressEvent } from '../workflow/kanban-orchestrator';
import { autoScheduler } from '../workflow/auto-scheduler';

export interface AttentionItem {
  readonly artifactId: string;
  readonly reason: string;
  readonly since: number;
}

export class NeedsYouTracker {
  private items = new Map<string, AttentionItem>();

  /** Apply a progress event; returns true when the set changed. */
  onProgress(evt: KanbanProgressEvent, now = Date.now()): boolean {
    const s = evt.agentState;
    if ((s as { agentRole?: string }).agentRole === 'approval-needed') {
      return this.set(evt.artifactId, 'Approval needed to continue', now);
    }
    if (s.status === 'interrupted' || s.status === 'failed') {
      return this.set(evt.artifactId, s.failure?.title ?? 'Agent run stopped', now);
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
        this.items.set(p.id, { artifactId: p.id, reason: `Paused: ${p.reason}`, since: p.pausedAt });
        changed = true;
      }
    }
    return changed;
  }

  dismiss(artifactId: string): boolean {
    return this.items.delete(artifactId);
  }

  list(): AttentionItem[] {
    return [...this.items.values()].sort((a, b) => a.since - b.since);
  }

  private set(artifactId: string, reason: string, now: number): boolean {
    const prev = this.items.get(artifactId);
    if (prev?.reason === reason) return false;
    this.items.set(artifactId, { artifactId, reason, since: prev?.since ?? now });
    return true;
  }
}

/** Status-bar count + "Show What Needs You" command; `focusCard` reveals a card on the board. */
export function registerNeedsYou(context: vscode.ExtensionContext, focusCard: (artifactId: string) => void): NeedsYouTracker {
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

  context.subscriptions.push(
    item,
    kanbanProgress.event((evt) => { if (tracker.onProgress(evt)) render(); }),
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
      if (tracker.dismiss(pick.id)) render();
    }),
  );

  const onScheduler = () => { if (tracker.syncPaused(autoScheduler.getPausedStories())) render(); };
  autoScheduler.on('stateChange', onScheduler);
  context.subscriptions.push({ dispose: () => autoScheduler.off('stateChange', onScheduler) });
  return tracker;
}
