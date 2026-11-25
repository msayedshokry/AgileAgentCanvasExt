import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const posted = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../vscodeApi', () => ({ vscode: { postMessage: (m: Record<string, unknown>) => posted.push(m) } }));

import { Inbox } from './Inbox';
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

describe('Inbox', () => {
  it('stays closed and says nothing needs you when empty', () => {
    render(<Inbox entries={[]} approval={null} onRespondApproval={noop} onOpenCard={noop} />);
    const trigger = screen.getByRole('button', { name: 'Inbox, nothing needs you' });
    fireEvent.click(trigger);
    expect(screen.getByText(/Nothing needs you/)).toBeTruthy();
  });

  it('counts waiting items and offers each card its fix', () => {
    const onOpenCard = vi.fn();
    render(<Inbox entries={[stopped, autopilot]} approval={null} onRespondApproval={noop} onOpenCard={onOpenCard} />);
    fireEvent.click(screen.getByRole('button', { name: 'Inbox, 2 need you' }));
    expect(screen.getByText('Login story')).toBeTruthy();
    expect(screen.getByText('5m')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(posted).toContainEqual({ type: 'kanban:fixAction', artifactId: 'S-1', action: 'sign-in' });

    fireEvent.click(screen.getByRole('button', { name: 'Show output' }));
    expect(posted).toContainEqual({ type: 'kanban:showOutput', artifactId: 'AUTOPILOT-nightly' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[1]);
    expect(posted).toContainEqual({ type: 'kanban:dismissInbox', artifactId: 'AUTOPILOT-nightly' });

    fireEvent.click(screen.getByRole('button', { name: 'Open card' }));
    expect(onOpenCard).toHaveBeenCalledWith('S-1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens by itself for an approval and shows it once, as the prompt', () => {
    const onRespond = vi.fn();
    const approvalEntry: InboxEntry = { ...stopped, kind: 'approval', reason: 'Approval needed to continue', actions: [] };
    render(
      <Inbox
        entries={[approvalEntry]}
        approval={{ artifactId: 'S-1', workflowId: 'dev', policyFailures: [] }}
        onRespondApproval={onRespond}
        onOpenCard={noop}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Inbox' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inbox, 1 needs you' })).toBeTruthy();
    expect(screen.queryByText('Approval needed to continue')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onRespond).toHaveBeenCalledWith(true);
  });

  it('lists board-wide problems (budget, circuit breaker) above the cards', () => {
    render(
      <Inbox
        entries={[stopped]}
        systemItems={[{ type: 'budget', severity: 'warning', title: 'Daily budget cap hit', detail: '$5.00 / $5.00 used today' }]}
        approval={null}
        onRespondApproval={noop}
        onOpenCard={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Inbox, 2 need you' }));
    const rows = screen.getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Daily budget cap hit');
    expect(rows[0].textContent).toContain('$5.00 / $5.00 used today');
    expect(rows[1].textContent).toContain('Login story');
  });

  it('closes on Escape', () => {
    render(<Inbox entries={[stopped]} approval={null} onRespondApproval={noop} onOpenCard={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /Inbox/ }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Inbox — questions and proposals', () => {
  const question: InboxEntry = {
    artifactId: 'S-1', kind: 'question', reason: 'Dev asks a question', since: Date.now(), details: ['Minimum password length: 8 or 12?'],
    title: 'Login story', actions: [], onBoard: true,
  };
  const proposal: InboxEntry = {
    artifactId: 'PROPOSALS-S-1', cardId: 'S-1', kind: 'proposal', reason: 'Dev proposes 2 new cards', since: Date.now(), details: ['Rate limiting', 'Audit log'],
    title: 'Login story', actions: [], onBoard: true,
  };

  it("shows the agent's question and sends the answer back", () => {
    render(<Inbox entries={[question]} approval={null} onRespondApproval={noop} onOpenCard={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /Inbox/ }));
    expect(screen.getByText('Minimum password length: 8 or 12?')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Answer Login story' }), { target: { value: ' 12 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(posted).toContainEqual({ type: 'kanban:answerQuestions', artifactId: 'S-1', answer: '12' });
  });

  it('lists proposed cards, opens their review, and opens the card they came from', () => {
    const onOpenCard = vi.fn();
    render(<Inbox entries={[proposal]} approval={null} onRespondApproval={noop} onOpenCard={onOpenCard} />);
    fireEvent.click(screen.getByRole('button', { name: /Inbox/ }));
    expect(screen.getByText('Rate limiting')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(posted).toContainEqual({ type: 'kanban:reviewProposals', artifactId: 'S-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Open card' }));
    expect(onOpenCard).toHaveBeenCalledWith('S-1');
  });
});
