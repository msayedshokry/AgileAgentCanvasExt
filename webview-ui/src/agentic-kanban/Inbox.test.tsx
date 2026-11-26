import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const posted = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../vscodeApi', () => ({ vscode: { postMessage: (m: Record<string, unknown>) => posted.push(m) } }));

import { InboxView, inboxCount } from './Inbox';
import type { InboxEntry } from './inbox-model';

const stopped: InboxEntry = {
  artifactId: 'S-1', kind: 'stopped', reason: 'The agent is signed out', since: Date.now() - 5 * 60_000,
  title: 'Login story', actions: ['sign-in', 'switch-agent'], onBoard: true,
};
const autopilot: InboxEntry = {
  artifactId: 'AUTOPILOT-nightly', kind: 'autopilot', reason: 'Autopilot "Nightly": BLOCKED', since: Date.now(),
  title: 'AUTOPILOT-nightly', actions: [], onBoard: false,
};
const noop = () => undefined;

beforeEach(() => { posted.length = 0; });

describe('Inbox view', () => {
  it('says nothing needs you when empty', () => {
    render(<InboxView entries={[]} approval={null} onRespondApproval={noop} onOpenCard={noop} />);
    expect(screen.getByText(/Nothing needs you/)).toBeTruthy();
    expect(inboxCount([], [], null)).toBe(0);
  });

  it('lists waiting items, selects the first, and offers its fix', () => {
    const onOpenCard = vi.fn();
    render(<InboxView entries={[stopped, autopilot]} approval={null} onRespondApproval={noop} onOpenCard={onOpenCard} />);
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(options[0].textContent).toContain('Login story');
    expect(options[0].textContent).toContain('5m');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(posted).toContainEqual({ type: 'kanban:fixAction', artifactId: 'S-1', action: 'sign-in' });
    fireEvent.click(screen.getByRole('button', { name: 'Open card' }));
    expect(onOpenCard).toHaveBeenCalledWith('S-1');

    fireEvent.click(options[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Show output' }));
    expect(posted).toContainEqual({ type: 'kanban:showOutput', artifactId: 'AUTOPILOT-nightly' });
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/ }));
    expect(posted).toContainEqual({ type: 'kanban:dismissInbox', artifactId: 'AUTOPILOT-nightly' });
  });

  it('shows an approval checkpoint once, as the prompt, and counts it', () => {
    const onRespond = vi.fn();
    const approvalEntry: InboxEntry = { ...stopped, kind: 'approval', reason: 'Approval needed to continue', actions: [] };
    const approval = { artifactId: 'S-1', workflowId: 'dev', policyFailures: [] };
    render(<InboxView entries={[approvalEntry]} approval={approval} onRespondApproval={onRespond} onOpenCard={noop} />);
    expect(inboxCount([approvalEntry], [], approval)).toBe(1);
    expect(screen.queryByText('Approval needed to continue')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onRespond).toHaveBeenCalledWith(true);
  });

  it('lists board-wide problems (budget, circuit breaker) above the cards', () => {
    const system = [{ type: 'budget' as const, severity: 'warning' as const, title: 'Daily budget cap hit', detail: '$5.00 / $5.00 used today' }];
    render(<InboxView entries={[stopped]} systemItems={system} approval={null} onRespondApproval={noop} onOpenCard={noop} />);
    const boardWide = screen.getByRole('list', { name: 'Board-wide' });
    expect(boardWide.textContent).toContain('Daily budget cap hit');
    expect(boardWide.textContent).toContain('$5.00 / $5.00 used today');
    expect(inboxCount([stopped], system, null)).toBe(2);
  });

  it('works from the keyboard: J/K move, A approves a card in review, Enter opens, E dismisses', () => {
    const onOpenCard = vi.fn();
    const onApprove = vi.fn();
    const review: InboxEntry = { ...stopped, artifactId: 'S-2', kind: 'approval', title: 'Review story', actions: [] };
    render(<InboxView entries={[stopped, review]} approval={null} onRespondApproval={noop} onOpenCard={onOpenCard} onApprove={onApprove} />);
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'j' });
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(list, { key: 'a' });
    expect(onApprove).toHaveBeenCalledWith('S-2');
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onOpenCard).toHaveBeenCalledWith('S-2');
    fireEvent.keyDown(list, { key: 'k' });
    fireEvent.keyDown(list, { key: 'e' });
    expect(posted).toContainEqual({ type: 'kanban:dismissInbox', artifactId: 'S-1' });
  });

  it('leaves the keys alone while you type an answer', () => {
    const question: InboxEntry = { ...stopped, kind: 'question', actions: [], details: ['8 or 12?'], onBoard: false };
    render(<InboxView entries={[question]} approval={null} onRespondApproval={noop} onOpenCard={noop} />);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Answer Login story' }), { key: 'e' });
    expect(posted).toEqual([]);
  });
});

describe('Inbox view — questions, proposals and the card', () => {
  const question: InboxEntry = {
    artifactId: 'S-1', kind: 'question', reason: 'Dev asks a question', since: Date.now(), details: ['Minimum password length: 8 or 12?'],
    title: 'Login story', actions: [], onBoard: true,
  };
  const proposal: InboxEntry = {
    artifactId: 'PROPOSALS-S-1', cardId: 'S-1', kind: 'proposal', reason: 'Dev proposes 2 new cards', since: Date.now(), details: ['Rate limiting', 'Audit log'],
    title: 'Login story', actions: [], onBoard: true,
  };

  it("shows the agent's question and sends the answer back when there is no card page", () => {
    render(<InboxView entries={[question]} approval={null} onRespondApproval={noop} onOpenCard={noop} />);
    expect(screen.getByText('Minimum password length: 8 or 12?')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Answer Login story' }), { target: { value: ' 12 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(posted).toContainEqual({ type: 'kanban:answerQuestions', artifactId: 'S-1', answer: '12' });
  });

  it('leaves the question to the card page when it shows one', () => {
    render(<InboxView entries={[question]} approval={null} onRespondApproval={noop} onOpenCard={noop} renderCard={(id) => <div>card page {id}</div>} />);
    expect(screen.getByText('card page S-1')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Answer Login story' })).toBeNull();
  });

  it('lists proposed cards, opens their review, and opens the card they came from', () => {
    const onOpenCard = vi.fn();
    render(<InboxView entries={[proposal]} approval={null} onRespondApproval={noop} onOpenCard={onOpenCard} />);
    expect(screen.getByText('Rate limiting')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(posted).toContainEqual({ type: 'kanban:reviewProposals', artifactId: 'S-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Open card' }));
    expect(onOpenCard).toHaveBeenCalledWith('S-1');
  });
});
