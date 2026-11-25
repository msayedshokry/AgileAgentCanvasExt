import { describe, it, expect } from 'vitest';
import { buildInboxEntries, waitingFor, type InboxItem } from './inbox-model';
import type { KanbanItem } from '../components/kanban/KanbanTypes';

const card = (id: string, extra: Partial<KanbanItem> = {}): KanbanItem =>
  ({ id, key: id, title: `Story ${id}`, status: 'in-progress', type: 'story', isEpic: false, ...extra }) as KanbanItem;

describe('buildInboxEntries', () => {
  it('puts approvals first, then whatever has waited longest', () => {
    const items: InboxItem[] = [
      { artifactId: 'S-2', kind: 'stopped', reason: 'Signed out', since: 20 },
      { artifactId: 'S-1', kind: 'paused', reason: 'Paused: failed 3 runs', since: 10 },
      { artifactId: 'S-3', kind: 'approval', reason: 'Approval needed to continue', since: 30 },
    ];
    expect(buildInboxEntries(items, [card('S-1'), card('S-2'), card('S-3')]).map((e) => e.artifactId)).toEqual(['S-3', 'S-1', 'S-2']);
  });

  it('names the card and offers the fix actions of a stopped run', () => {
    const stopped = card('S-1', {
      agentState: { status: 'interrupted', failure: { kind: 'signed-out', title: 'Signed out', detail: '', actions: ['sign-in', 'switch-agent'] } },
    });
    const [entry] = buildInboxEntries([{ artifactId: 'S-1', kind: 'stopped', reason: 'Signed out', since: 1 }], [stopped]);
    expect(entry).toMatchObject({ title: 'Story S-1', actions: ['sign-in', 'switch-agent'], onBoard: true });
  });

  it('keeps items that are not cards, naming an autopilot run by its autopilot', () => {
    const [entry] = buildInboxEntries([{ artifactId: 'AUTOPILOT-nightly', kind: 'autopilot', reason: 'Autopilot "Nightly": BLOCKED', since: 1 }], []);
    expect(entry).toMatchObject({ title: 'Nightly', reason: 'BLOCKED', actions: [], onBoard: false });
  });
});

describe('waitingFor', () => {
  it('reads as a short wait time', () => {
    const now = 10 * 24 * 3600_000;
    expect(waitingFor(now - 30_000, now)).toBe('just now');
    expect(waitingFor(now - 12 * 60_000, now)).toBe('12m');
    expect(waitingFor(now - 3 * 3600_000, now)).toBe('3h');
    expect(waitingFor(now - 50 * 3600_000, now)).toBe('2d');
  });
});
