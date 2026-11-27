// The card page: what the card asks for, and the one action that fits its state.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const posted = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../vscodeApi', () => ({ vscode: { postMessage: (m: Record<string, unknown>) => posted.push(m) } }));

import { AgenticDetailPanel } from './AgenticDetailPanel';
import { artifactToKanbanItem, cardBrief } from './kanban-helpers';
import type { KanbanItem } from '../components/kanban/KanbanTypes';

const STORY: KanbanItem = {
  id: 'S-1', key: 'S-1', title: 'Password reset', status: 'ready-for-dev', type: 'story', isEpic: false,
  epicKey: 'E-1', epicTitle: 'Authentication',
  description: 'Users get a one-time link by email.',
  userStory: { asA: 'a signed-out user', iWant: 'to reset my password', soThat: 'I can sign in again' },
  acceptanceCriteria: [{ given: 'a known email', when: 'I ask for a reset', then: 'I get a link', status: 'verified' }, { criterion: 'Links expire after 30 minutes' }],
};

const page = (item: KanbanItem, handlers: Partial<Pick<ComponentProps<typeof AgenticDetailPanel>, 'onStart' | 'onStop' | 'onApprove' | 'onOpenCard'>> = {}) =>
  render(<AgenticDetailPanel item={item} onClose={() => undefined} chatSessionActive={false} {...handlers} />);

beforeEach(() => { posted.length = 0; });

describe('card page', () => {
  it('shows the title, user story, description and acceptance criteria', () => {
    page(STORY);
    expect(screen.getByRole('heading', { name: 'Password reset' })).toBeTruthy();
    expect(screen.getByText(/I want to reset my password/).textContent).toBe('As a signed-out user, I want to reset my password, so that I can sign in again.');
    expect(screen.getByText('Users get a one-time link by email.')).toBeTruthy();
    const criteria = screen.getAllByRole('listitem').filter((li) => li.className.includes('card-page-ac'));
    expect(criteria.map((li) => li.textContent)).toEqual(['Given a known email when I ask for a reset then I get a linkverified', 'Links expire after 30 minutes']);
  });

  it('says so when the card has no description', () => {
    page({ ...STORY, description: undefined, userStory: undefined, acceptanceCriteria: undefined });
    expect(screen.getByText('No description yet.')).toBeTruthy();
  });

  it('offers Start on a ready card and opens the epic from the breadcrumb', () => {
    const onStart = vi.fn();
    const onOpenCard = vi.fn();
    page(STORY, { onStart, onOpenCard });
    fireEvent.click(screen.getByRole('button', { name: 'Start agent' }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ id: 'S-1' }));
    const [crumb, epicLink] = screen.getAllByRole('button', { name: 'Authentication' });
    fireEvent.click(crumb);
    fireEvent.click(epicLink);
    expect(onOpenCard).toHaveBeenNthCalledWith(1, 'E-1');
    expect(onOpenCard).toHaveBeenNthCalledWith(2, 'E-1');
  });

  it('offers Stop while an agent has the card, and no Start', () => {
    const onStop = vi.fn();
    page({ ...STORY, status: 'in-progress', agentState: { status: 'running' } }, { onStop, onStart: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Start agent' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Stop agent' }));
    expect(onStop).toHaveBeenCalled();
  });

  it('in review, approves the card or sends you to the composer to ask for changes', () => {
    const onApprove = vi.fn();
    page({ ...STORY, status: 'review' }, { onApprove, onStart: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Start agent' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }));
    expect(document.activeElement?.tagName).toBe('TEXTAREA');
    fireEvent.click(screen.getByRole('button', { name: 'Approve and mark done' }));
    expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({ id: 'S-1' }));
  });

  it('never offers Start on a card assigned to a person', () => {
    page({ ...STORY, assignee: { id: 'maya', name: 'Maya', person: true } }, { onStart: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Start agent' })).toBeNull();
  });
});

describe('cardBrief', () => {
  it('reads description, user story and criteria from the artifact, skipping junk', () => {
    const item = artifactToKanbanItem({
      id: 'S-2', type: 'story', title: 'T', description: '  Do it  ',
      metadata: { userStory: { asA: 'dev', iWant: '', soThat: 7 }, acceptanceCriteria: ['Works', '', null, { then: 'ok', and: ['x', 3] }, { id: 'empty' }] },
    });
    expect(item.description).toBe('Do it');
    expect(item.userStory).toEqual({ asA: 'dev', iWant: undefined, soThat: undefined });
    expect(item.acceptanceCriteria).toEqual([
      { criterion: 'Works' },
      { id: undefined, criterion: undefined, given: undefined, when: undefined, then: 'ok', status: undefined, and: ['x'] },
    ]);
  });

  it('returns nothing for an artifact without them', () => {
    expect(cardBrief({ id: 'E', metadata: { acceptanceCriteria: 'not a list' } })).toEqual({});
  });
});

describe('restatesStory', () => {
  it('hides a description that only repeats the user story', async () => {
    const { restatesStory } = await import('./AgenticDetailPanel');
    const story = { asA: 'Software Engineer', iWant: 'a URL-safe slug for each task title', soThat: 'links are readable' };
    expect(restatesStory('As a Software Engineer, I want a URL-safe slug for each task title, so that links are readable.', story)).toBe(true);
    expect(restatesStory('Slugs use lowercase ASCII and dashes.', story)).toBe(false);
    expect(restatesStory('Anything', undefined)).toBe(false);
  });
});

describe('card page — live questions and people', () => {
  it('shows a running agent’s question with an answer box, and sends the answer', () => {
    render(<AgenticDetailPanel item={{ ...STORY, status: 'in-progress', agentState: { status: 'running' } }} onClose={() => undefined} chatSessionActive={false} pendingQuestions={['Slack or email first?']} />);
    expect(screen.getByRole('region', { name: 'The agent is waiting for your answer' }).textContent).toContain('Slack or email first?');
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer to the agent' }), { target: { value: 'Slack' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(posted).toContainEqual({ type: 'kanban:answerQuestions', artifactId: 'S-1', answer: 'Slack' });
  });

  it('leaves the answer box to the Inbox when the page is shown inside it', () => {
    render(<AgenticDetailPanel item={STORY} onClose={() => undefined} chatSessionActive={false} pendingQuestions={['Slack or email first?']} answerElsewhere />);
    expect(screen.queryByRole('region', { name: 'The agent is waiting for your answer' })).toBeNull();
  });

  it('offers no agent message box on a card a person works', () => {
    render(<AgenticDetailPanel item={{ ...STORY, assignee: { id: 'maya', name: 'Maya', person: true } }} onClose={() => undefined} chatSessionActive={false} />);
    expect(screen.getByText(/Maya works this card by hand/)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /Message/ })).toBeNull();
  });
});
