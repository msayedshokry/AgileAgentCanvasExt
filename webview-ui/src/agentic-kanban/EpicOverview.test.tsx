import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../vscodeApi', () => ({ vscode: { postMessage: vi.fn() } }));

import { breakdownByAssignee, epicProgress, EpicBreakdown, EpicOverview } from './EpicOverview';
import type { KanbanItem } from '../components/kanban/KanbanTypes';

const s = (id: string, status: string, assignee?: KanbanItem['assignee']): KanbanItem =>
  ({ id, key: id, title: `Story ${id}`, status, type: 'story', isEpic: false, epicKey: 'E-1', ...(assignee ? { assignee } : {}) });
const dev = { id: 'dev', name: 'Dev' };
const maya = { id: 'maya', name: 'Maya', person: true };
const STORIES = [s('S-1', 'done', dev), s('S-2', 'in-progress', dev), s('S-3', 'review', maya), s('S-4', 'backlog'), s('S-5', 'ready-for-dev')];

describe('epicProgress', () => {
  it('counts done, under way (in progress or review) and not started', () => {
    expect(epicProgress(STORIES)).toEqual({ done: 1, active: 2, notStarted: 2, total: 5 });
    expect(epicProgress([])).toEqual({ done: 0, active: 0, notStarted: 0, total: 0 });
  });
});

describe('breakdownByAssignee', () => {
  it('counts stories per agent or person, busiest first, unassigned last', () => {
    expect(breakdownByAssignee(STORIES)).toEqual([
      { id: 'dev', name: 'Dev', person: false, done: 1, total: 2 },
      { id: 'maya', name: 'Maya', person: true, done: 0, total: 1 },
      { id: '', name: 'Unassigned', person: false, done: 0, total: 2 },
    ]);
  });
});

describe('EpicOverview', () => {
  it('shows the percentage done and the stories by column, done first, and opens one', () => {
    const onOpenCard = vi.fn();
    render(<EpicOverview stories={STORIES} onOpenCard={onOpenCard} />);
    expect(screen.getByText('20%')).toBeTruthy();
    expect(screen.getByRole('img', { name: '1 done, 2 under way, 2 not started' })).toBeTruthy();
    const groups = [...document.querySelectorAll('.epic-story-group-label .card-page-status')].map((g) => g.textContent);
    expect(groups).toEqual(['Done', 'Review', 'In Progress', 'Ready for Dev', 'Backlog']);
    fireEvent.click(screen.getByRole('button', { name: /Story S-3/ }));
    expect(onOpenCard).toHaveBeenCalledWith('S-3');
  });

  it('says how to get stories when the epic has none', () => {
    render(<EpicOverview stories={[]} />);
    expect(screen.getByText(/No stories yet/)).toBeTruthy();
  });

  it('labels people and agents in the breakdown', () => {
    render(<EpicBreakdown stories={STORIES} />);
    const rows = [...document.querySelectorAll('.epic-breakdown-row')].map((r) => r.querySelector('.epic-breakdown-name')?.textContent + '|' + r.querySelector('.epic-breakdown-tag')?.textContent);
    expect(rows).toEqual(['Dev|Agent', 'Maya|Person', 'Unassigned|undefined']);
    expect(document.querySelectorAll('.epic-breakdown-row .agent-avatar')[1]?.textContent).toBe('M');
  });
});
