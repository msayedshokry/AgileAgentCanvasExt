import { describe, it, expect } from 'vitest';
import { parseIssues, planIssueSync, type GhIssue } from './github-issues';

const issue = (number: number, state: 'OPEN' | 'CLOSED' = 'OPEN'): GhIssue => ({ number, title: `Issue ${number}`, body: '', state, url: `u/${number}`, labels: [] });

describe('parseIssues', () => {
  it('reads gh issue list JSON and drops malformed rows', () => {
    const json = JSON.stringify([
      { number: 4, title: 'Login', body: 'b', state: 'OPEN', url: 'https://x/4', labels: [{ name: 'bug' }] },
      { title: 'no number' },
    ]);
    expect(parseIssues(json)).toEqual([{ number: 4, title: 'Login', body: 'b', state: 'OPEN', url: 'https://x/4', labels: ['bug'] }]);
    expect(parseIssues('nope')).toEqual([]);
  });
});

describe('planIssueSync', () => {
  it('imports open issues that have no story, but not closed ones', () => {
    const actions = planIssueSync([issue(1), issue(2, 'CLOSED')], []);
    expect(actions).toEqual([{ kind: 'import', issue: issue(1) }]);
  });

  it('closes the issue when its story is done', () => {
    expect(planIssueSync([issue(1)], [{ id: 'S-1', status: 'done', issueNumber: 1 }]))
      .toEqual([{ kind: 'close-issue', issueNumber: 1, storyId: 'S-1' }]);
  });

  it('reopens the issue when a done story was moved back', () => {
    expect(planIssueSync([issue(1, 'CLOSED')], [{ id: 'S-1', status: 'in-progress', issueNumber: 1 }], new Map([['S-1', 'done']])))
      .toEqual([{ kind: 'reopen-issue', issueNumber: 1, storyId: 'S-1' }]);
  });

  it('marks the story done when the issue was closed on GitHub', () => {
    expect(planIssueSync([issue(1, 'CLOSED')], [{ id: 'S-1', status: 'ready-for-dev', issueNumber: 1 }], new Map([['S-1', 'ready-for-dev']])))
      .toEqual([{ kind: 'mark-story-done', storyId: 'S-1', issueNumber: 1 }]);
  });

  it('does nothing when both sides agree', () => {
    expect(planIssueSync([issue(1), issue(2, 'CLOSED')], [
      { id: 'S-1', status: 'in-progress', issueNumber: 1 },
      { id: 'S-2', status: 'done', issueNumber: 2 },
    ])).toEqual([]);
  });
});
