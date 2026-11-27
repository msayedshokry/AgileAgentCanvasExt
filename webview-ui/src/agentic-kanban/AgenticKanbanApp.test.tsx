/**
 * Integration tests for AgenticKanbanApp.
 *
 * The app is rendered for real and driven the way VS Code drives it: by
 * posting window messages and by user events. Assertions read the DOM and the
 * messages the webview posts back. These replace the simulated @webview
 * Cucumber scenarios, which modelled the board in plain objects instead of
 * rendering it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { mockVsCodeApi } from '../test/setup';
import { AgenticKanbanApp } from './AgenticKanbanApp';

// ── Helpers ─────────────────────────────────────────────────────────────────

interface TestArtifact {
  id: string;
  type?: string;
  status?: string;
  title?: string;
}

function send(data: Record<string, unknown>): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data }));
  });
}

function story(id: string, status = 'backlog', title = id): TestArtifact {
  return { id, type: 'story', status, title };
}

/** Render the app and deliver the first artifact snapshot, as the extension does. */
function renderBoard(artifacts: TestArtifact[]): void {
  render(<AgenticKanbanApp />);
  send({ type: 'updateArtifacts', artifacts });
}

function column(label: string): HTMLElement {
  return screen.getByLabelText(new RegExp(`^${label} column`));
}

function card(title: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${title} —`) });
}

function posted(type: string): Array<Record<string, unknown>> {
  return mockVsCodeApi.postMessage.mock.calls
    .map(([msg]) => msg as Record<string, unknown>)
    .filter(msg => msg.type === type);
}

function toast(): HTMLElement {
  const el = document.querySelector('.kanban-toast');
  if (!el) throw new Error('No toast is shown');
  return el as HTMLElement;
}

/** Simulate an HTML5 drag of `cardEl` onto `target`. */
function dragTo(cardEl: HTMLElement, target: HTMLElement): void {
  const store = new Map<string, string>();
  const dataTransfer = {
    setData: (k: string, v: string) => store.set(k, v),
    getData: (k: string) => store.get(k) ?? '',
    effectAllowed: 'move',
    dropEffect: 'move',
  };
  fireEvent.dragStart(cardEl, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
}

afterEach(() => {
  vi.useRealTimers();
});

// ── Loading and columns ─────────────────────────────────────────────────────

describe('AgenticKanbanApp — loading and columns', () => {
  it('shows a loading skeleton until artifacts arrive', () => {
    render(<AgenticKanbanApp />);
    expect(screen.getByLabelText('Loading kanban board')).toBeInTheDocument();
    expect(posted('agenticKanbanReady')).toHaveLength(1);

    send({ type: 'updateArtifacts', artifacts: [story('S-1')] });
    expect(screen.queryByLabelText('Loading kanban board')).not.toBeInTheDocument();
  });

  it('renders one card per story or epic, skipping other artifact types', () => {
    renderBoard([
      story('S-1'), story('S-2'),
      { id: 'E-1', type: 'epic', status: 'backlog', title: 'Epic one' },
      { id: 'PRD-1', type: 'prd', status: 'draft', title: 'A PRD' },
    ]);
    expect(card('S-1')).toBeInTheDocument();
    expect(card('S-2')).toBeInTheDocument();
    expect(card('Epic one')).toBeInTheDocument();
    expect(screen.queryByText('A PRD')).not.toBeInTheDocument();
  });

  it('groups cards into the column matching their status', () => {
    renderBoard([
      story('a', 'backlog', 'Backlog Story'),
      story('b', 'ready-for-dev', 'Ready Story'),
      story('c', 'in-progress', 'Active Story'),
      story('d', 'review', 'Under Review Story'),
      story('e', 'done', 'Completed Story'),
    ]);
    expect(within(column('Backlog')).getByText('Backlog Story')).toBeInTheDocument();
    expect(within(column('Ready for Dev')).getByText('Ready Story')).toBeInTheDocument();
    expect(within(column('In Progress')).getByText('Active Story')).toBeInTheDocument();
    expect(within(column('Review')).getByText('Under Review Story')).toBeInTheDocument();
    expect(within(column('Done')).getByText('Completed Story')).toBeInTheDocument();
  });

  it('puts a card with an unknown status in Backlog', () => {
    renderBoard([story('x', 'unknown-status', 'Odd Story')]);
    expect(within(column('Backlog')).getByText('Odd Story')).toBeInTheDocument();
  });

  it('shows all five columns with their empty-state hint when there are no cards', () => {
    renderBoard([]);
    expect(within(column('Backlog')).getByText('Drop a story or epic here to begin')).toBeInTheDocument();
    expect(within(column('Ready for Dev')).getByText('Drop a story here to start development')).toBeInTheDocument();
    expect(within(column('In Progress')).getByText('Drop a story here to run a workflow')).toBeInTheDocument();
    expect(within(column('Review')).getByText('Drop a completed story here for review')).toBeInTheDocument();
    expect(within(column('Done')).getByText('Stories land here when complete')).toBeInTheDocument();
  });
});

// ── Drag and drop ───────────────────────────────────────────────────────────

describe('AgenticKanbanApp — drag and drop', () => {
  it('posts kanban:statusChanged when a card is dropped in another column', () => {
    renderBoard([story('story-drag', 'backlog', 'Drag Me')]);
    dragTo(card('Drag Me'), column('Ready for Dev'));
    expect(posted('kanban:statusChanged')).toEqual([{
      type: 'kanban:statusChanged',
      artifactId: 'story-drag',
      fromStatus: 'backlog',
      toStatus: 'ready-for-dev',
      artifactType: 'story',
    }]);
  });

  it('posts nothing when a card is dropped back in its own column', () => {
    renderBoard([story('story-same', 'backlog', 'Stay Put')]);
    dragTo(card('Stay Put'), column('Backlog'));
    expect(posted('kanban:statusChanged')).toHaveLength(0);
  });

  it('moves the card immediately, before the extension answers', () => {
    renderBoard([story('story-opt', 'backlog', 'Optimistic')]);
    dragTo(card('Optimistic'), column('Ready for Dev'));
    expect(within(column('Ready for Dev')).getByText('Optimistic')).toBeInTheDocument();
    expect(within(column('Backlog')).queryByText('Optimistic')).not.toBeInTheDocument();
  });

  it('confirms a successful transition with a "Moved to" toast', () => {
    renderBoard([story('story-ok', 'backlog', 'Will Move')]);
    dragTo(card('Will Move'), column('Ready for Dev'));
    send({ type: 'transitionResult', artifactId: 'story-ok', ok: true, status: 'complete' });
    expect(toast()).toHaveTextContent('Moved to ready for dev');
    expect(toast()).toHaveClass('kanban-toast--success');
  });

  it('shows the blocking reason and snaps the card back when a transition fails', () => {
    renderBoard([story('story-fail', 'backlog', 'Will Fail')]);
    dragTo(card('Will Fail'), column('Ready for Dev'));
    send({ type: 'transitionResult', artifactId: 'story-fail', ok: false, blockedBy: ['Concurrency lock held by Crafter'] });
    expect(toast()).toHaveTextContent('Transition failed: Concurrency lock held by Crafter');
    expect(toast()).toHaveClass('kanban-toast--error');
    expect(within(column('Backlog')).getByText('Will Fail')).toBeInTheDocument();
  });
});

// ── Card overlays from agent state ──────────────────────────────────────────

describe('AgenticKanbanApp — agent state on cards', () => {
  it('makes a locked card undraggable and names the agent holding the lock', () => {
    renderBoard([story('story-locked', 'backlog', 'Locked Story'), story('story-free', 'backlog', 'Free Story')]);
    send({
      type: 'agentStateUpdated',
      artifactId: 'story-locked',
      agentState: { status: 'running', agentRole: 'Coordinator' },
      lockInfo: { locked: true, agentName: 'Coordinator' },
    });
    expect(card('Locked Story')).toHaveAttribute('draggable', 'false');
    expect(within(card('Locked Story')).getByText('Locked: Coordinator')).toBeInTheDocument();
    expect(card('Free Story')).toHaveAttribute('draggable', 'true');
  });

  it('shows who is working on a running card', () => {
    renderBoard([story('story-running', 'in-progress', 'Busy Story')]);
    send({ type: 'agentStateUpdated', artifactId: 'story-running', agentState: { status: 'running', agentRole: 'Crafter' } });
    expect(within(card('Busy Story')).getByText('Crafter is working…')).toBeInTheDocument();
  });

  it('shows a queued badge while a run is pending', () => {
    renderBoard([story('story-pending', 'ready-for-dev', 'Waiting Story')]);
    send({ type: 'agentStateUpdated', artifactId: 'story-pending', agentState: { status: 'queued' } });
    expect(within(card('Waiting Story')).getByText('Starting…')).toBeInTheDocument();
  });

  it('keeps agent state when a later artifact refresh arrives', () => {
    renderBoard([story('story-keep', 'in-progress', 'Kept Story')]);
    send({ type: 'agentStateUpdated', artifactId: 'story-keep', agentState: { status: 'running', agentRole: 'Crafter' } });
    send({ type: 'updateArtifacts', artifacts: [story('story-keep', 'in-progress', 'Kept Story')] });
    expect(within(card('Kept Story')).getByText('Crafter is working…')).toBeInTheDocument();
  });
});

// ── Detail panel ────────────────────────────────────────────────────────────

describe('AgenticKanbanApp — detail panel', () => {
  it('opens the clicked card as a page in place of the board, and goes back from the Board button', () => {
    renderBoard([story('story-detail', 'backlog', 'Add Dark Mode')]);
    fireEvent.click(card('Add Dark Mode'));
    const back = screen.getByLabelText('Close detail panel');
    expect(screen.getByRole('heading', { name: 'Add Dark Mode' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add Dark Mode —/ })).not.toBeInTheDocument();

    fireEvent.click(back);
    expect(screen.queryByLabelText('Close detail panel')).not.toBeInTheDocument();
    expect(card('Add Dark Mode')).toBeInTheDocument();
  });

  it('offers a trace link only when the card has an agent session, and posts kanban:viewTrace', () => {
    renderBoard([story('with-trace', 'in-progress', 'Traced Story'), story('no-trace', 'backlog', 'Untraced Story')]);
    send({ type: 'agentStateUpdated', artifactId: 'with-trace', agentState: { status: 'running', sessionId: 'acp-session-4' } });

    fireEvent.click(card('Untraced Story'));
    expect(screen.queryByRole('button', { name: 'Trace →' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Close detail panel'));

    fireEvent.click(card('Traced Story'));
    fireEvent.click(screen.getByRole('button', { name: 'Trace →' }));
    expect(posted('kanban:viewTrace')).toEqual([{ type: 'kanban:viewTrace', sessionId: 'acp-session-4' }]);
  });
});

// ── Toolbar ─────────────────────────────────────────────────────────────────

describe('AgenticKanbanApp — toolbar', () => {
  it('Refresh posts agenticKanban:refresh and View Traces posts openTraceViewer', () => {
    renderBoard([story('S-1')]);
    // Both live in the toolbar's "More" menu, which closes after each action.
    fireEvent.click(screen.getByRole('button', { name: 'More board actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Refresh' }));
    expect(posted('agenticKanban:refresh')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'More board actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'View Traces' }));
    expect(posted('openTraceViewer')).toHaveLength(1);
  });
});

// ── Goal decomposition flow ─────────────────────────────────────────────────

const proposedGoal = {
  id: 'goal-1',
  goal: 'Add dark mode',
  status: 'review',
  proposedStories: [
    { id: 'story-1', title: 'Implement toggle', priority: 'P1' },
    { id: 'story-2', title: 'Persist preference', priority: 'P2' },
  ],
  approvedStories: [],
};

describe('AgenticKanbanApp — goal decomposition', () => {
  it('shows a decomposing toast when a goal is submitted', () => {
    renderBoard([]);
    send({ type: 'goalSubmitted', goalId: 'goal-1', text: 'Test goal' });
    expect(toast()).toHaveTextContent('Goal submitted (decomposing…)');
  });

  it('shows an error toast when submitting a goal fails', () => {
    renderBoard([]);
    send({ type: 'goalSubmitError', error: 'decomposition failed' });
    expect(toast()).toHaveTextContent('Goal submit failed: decomposition failed');
    expect(toast()).toHaveClass('kanban-toast--error');
  });

  it('opens the review modal listing every proposed story', () => {
    renderBoard([]);
    send({ type: 'goalReadyForReview', goal: proposedGoal });
    expect(screen.getByLabelText('Include story "Implement toggle"')).toBeChecked();
    expect(screen.getByLabelText('Include story "Persist preference"')).toBeChecked();
  });

  it('approves all proposed stories by default', () => {
    vi.useFakeTimers();
    renderBoard([]);
    send({ type: 'goalReadyForReview', goal: proposedGoal });
    fireEvent.click(screen.getByRole('button', { name: /Approve 2/ }));
    expect(posted('approveGoalStories')).toEqual([
      { type: 'approveGoalStories', goalId: 'goal-1', storyIds: ['story-1', 'story-2'] },
    ]);
  });

  it('leaves a deselected story out of the approval', () => {
    vi.useFakeTimers();
    renderBoard([]);
    send({ type: 'goalReadyForReview', goal: { ...proposedGoal, id: 'goal-2' } });
    fireEvent.click(screen.getByLabelText('Include story "Persist preference"'));
    fireEvent.click(screen.getByRole('button', { name: /Approve 1/ }));
    expect(posted('approveGoalStories')).toEqual([
      { type: 'approveGoalStories', goalId: 'goal-2', storyIds: ['story-1'] },
    ]);
  });

  it('closes the modal and reports the approved count when the goal is reviewed', () => {
    renderBoard([]);
    send({ type: 'goalReadyForReview', goal: proposedGoal });
    send({ type: 'goalReviewed', goal: { ...proposedGoal, status: 'approved', approvedStories: [{ id: 'story-1', title: 'Implement toggle' }] } });
    expect(screen.queryByLabelText('Include story "Implement toggle"')).not.toBeInTheDocument();
    expect(toast()).toHaveTextContent('Goal approved — 1 story(ies) dispatched');
  });

  it('refreshes the board when approved stories are dispatched', () => {
    renderBoard([]);
    send({ type: 'goalDispatched', goalId: 'goal-1', persisted: 1 });
    expect(posted('agenticKanban:refresh')).toHaveLength(1);
  });
});

// ── Dependency badges ───────────────────────────────────────────────────────

describe('AgenticKanbanApp — dependency badges', () => {
  it('shows "Blocked by N" on the affected card only', () => {
    renderBoard([story('story-1', 'backlog', 'Blocked Story'), story('story-2', 'backlog', 'Free Story')]);
    send({ type: 'updateDependencyBadges', badges: [{ id: 'story-1', blockedBy: 2, hasCycle: false, blockerTitles: ['story-2', 'story-3'] }] });
    const badge = within(card('Blocked Story')).getByLabelText('Blocked by 2 stories');
    expect(badge).toHaveTextContent('Blocked by 2');
    expect(badge).toHaveAttribute('title', 'Blocked by: story-2, story-3');
    expect(within(card('Free Story')).queryByText(/Blocked by/)).not.toBeInTheDocument();
  });

  it('marks a circular dependency', () => {
    renderBoard([story('story-1', 'backlog', 'Cyclic Story')]);
    send({ type: 'updateDependencyBadges', badges: [{ id: 'story-1', blockedBy: 1, hasCycle: true, blockerTitles: ['story-2'] }] });
    const badge = within(card('Cyclic Story')).getByLabelText('Blocked by 1 in a circular dependency');
    expect(badge).toHaveTextContent('Blocked by 1');
    expect(badge).toHaveClass('kanban-card-dep-badge--cycle');
  });

  it('clears every badge when an empty snapshot arrives', () => {
    renderBoard([story('story-1', 'backlog', 'Was Blocked')]);
    send({ type: 'updateDependencyBadges', badges: [{ id: 'story-1', blockedBy: 1, hasCycle: false, blockerTitles: ['story-2'] }] });
    send({ type: 'updateDependencyBadges', badges: [] });
    expect(within(card('Was Blocked')).queryByText(/Blocked by/)).not.toBeInTheDocument();
  });
});

// ── Messages wired into the autonomy bar ────────────────────────────────────
// AutonomyBar.test.tsx covers the bar itself; these check the app forwards
// the extension's broadcasts to it.

describe('AgenticKanbanApp — autonomy messages', () => {
  it('shows the scheduler state the extension reports', () => {
    renderBoard([]);
    send({ type: 'schedulerState', state: 'paused', displayState: 'idle', nextUp: null, inProgress: [], enabled: true, pausedStories: [], continuousMode: false });
    fireEvent.click(screen.getByRole('button', { name: /^Autopilot:/ }));
    expect(screen.getByRole('button', { name: /Resume/ })).toBeInTheDocument();
  });

  it('shows a systemic-issue banner and removes it on dismiss', () => {
    renderBoard([]);
    send({
      type: 'systemicIssue',
      patterns: [{ policyId: 'no-placeholders', severity: 'high', affectedArtifactIds: ['S-1', 'S-2', 'S-3'], count: 3 }],
      totalArtifactsAnalyzed: 3,
      detectedAt: new Date().toISOString(),
    });
    // The run controls (and the banner with them) live in the Autopilot popover.
    fireEvent.click(screen.getByRole('button', { name: /^Autopilot:/ }));
    const panel = screen.getByRole('dialog', { name: /^Autopilot:/ });
    expect(within(panel).getByRole('alert')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: /Dismiss/i }));
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces a branch created by the autonomous git hook', () => {
    renderBoard([]);
    send({ type: 'gitBranch', branchName: 'aac/story-S-1' });
    expect(toast()).toHaveTextContent('Branch created: aac/story-S-1');
  });
});

// ── Harness policy results ──────────────────────────────────────────────────

describe('AgenticKanbanApp — harness policy results', () => {
  const blockingFailure = [
    { policyId: 'required-fields', passed: false, severity: 'blocking', failures: ['Missing acceptance criteria'] },
    { policyId: 'no-placeholders', passed: true, severity: 'advisory', failures: [] },
  ];

  it('shows "Policy failed" on a card with a blocking failure and lists policies in the detail panel', () => {
    renderBoard([story('story-h', 'ready-for-dev', 'Checked Story'), story('story-ok', 'backlog', 'Clean Story')]);
    send({ type: 'harnessResults', artifactId: 'story-h', harnessResults: blockingFailure });

    expect(within(card('Checked Story')).getByText('Policy failed')).toBeInTheDocument();
    expect(within(card('Clean Story')).queryByText('Policy failed')).not.toBeInTheDocument();

    fireEvent.click(card('Checked Story'));
    expect(screen.getByText('1 failing')).toBeInTheDocument();
    expect(screen.getAllByText('required-fields').length).toBeGreaterThan(0);
    expect(screen.getByText('no-placeholders')).toBeInTheDocument();
  });

  it('applies results that arrive before the card does', () => {
    render(<AgenticKanbanApp />);
    send({ type: 'harnessResults', artifactId: 'story-late', harnessResults: blockingFailure });
    send({ type: 'updateArtifacts', artifacts: [story('story-late', 'backlog', 'Late Story')] });
    expect(within(card('Late Story')).getByText('Policy failed')).toBeInTheDocument();
  });

  it('does not show the badge for advisory-only failures, and clears it once the policy passes', () => {
    renderBoard([story('story-a', 'review', 'Advisory Story')]);
    send({ type: 'harnessResults', artifactId: 'story-a', harnessResults: [
      { policyId: 'no-placeholders', passed: false, severity: 'advisory', failures: ['TODO found'] },
    ] });
    expect(within(card('Advisory Story')).queryByText('Policy failed')).not.toBeInTheDocument();

    send({ type: 'harnessResults', artifactId: 'story-a', harnessResults: blockingFailure });
    expect(within(card('Advisory Story')).getByText('Policy failed')).toBeInTheDocument();
    send({ type: 'harnessResults', artifactId: 'story-a', harnessResults: [
      { policyId: 'required-fields', passed: true, severity: 'blocking', failures: [] },
    ] });
    expect(within(card('Advisory Story')).queryByText('Policy failed')).not.toBeInTheDocument();
  });
});

// ── Sidebar ─────────────────────────────────────────────────────────────────

describe('AgenticKanbanApp — sidebar', () => {
  const nav = () => screen.getByRole('navigation', { name: 'Board navigation' });

  it('lists running cards under Working and opens one as a page', () => {
    renderBoard([story('S-1', 'in-progress', 'Busy Story'), story('S-2', 'backlog', 'Idle Story')]);
    send({ type: 'agentStateUpdated', artifactId: 'S-1', agentState: { status: 'running', agentRole: 'Dev' } });
    fireEvent.click(within(nav()).getByRole('button', { name: /Working/ }));
    const list = screen.getByRole('region', { name: 'Working' });
    expect(within(list).getAllByRole('button').map(b => b.textContent)).toEqual([expect.stringContaining('Busy Story')]);
    fireEvent.click(within(list).getByRole('button', { name: /Busy Story/ }));
    expect(screen.getByRole('heading', { name: 'Busy Story' })).toBeInTheDocument();
  });

  it('counts the Inbox and opens it as a view', () => {
    renderBoard([story('S-1', 'in-progress', 'Asked Story')]);
    send({ type: 'kanban:inbox', items: [{ artifactId: 'S-1', kind: 'stopped', reason: 'Signed out', since: Date.now() }] });
    const inbox = within(nav()).getByRole('button', { name: /Inbox/ });
    expect(inbox.textContent).toContain('1');
    fireEvent.click(inbox);
    expect(screen.getByRole('listbox', { name: 'Needs you' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Asked Story' })).toBeInTheDocument();
  });

  it('narrows the board to one epic and back', () => {
    renderBoard([
      { id: 'E-1', type: 'epic', status: 'in-progress', title: 'Auth' },
      { ...story('S-1', 'backlog', 'Login'), parentId: 'E-1' } as TestArtifact,
      story('S-2', 'backlog', 'Billing'),
    ]);
    fireEvent.click(within(nav()).getByRole('button', { name: /Auth/ }));
    expect(screen.queryByRole('button', { name: /^Billing —/ })).not.toBeInTheDocument();
    expect(card('Login')).toBeInTheDocument();
    fireEvent.click(within(nav()).getByRole('button', { name: /^Board/ }));
    expect(card('Billing')).toBeInTheDocument();
  });
});

describe('AgenticKanbanApp — starting from the card page', () => {
  it('starts the agent and stays on the page', () => {
    renderBoard([story('S-9', 'ready-for-dev', 'Page Story')]);
    fireEvent.click(card('Page Story'));
    fireEvent.click(screen.getByRole('button', { name: 'Start agent' }));
    expect(posted('kanban:statusChanged')).toEqual([expect.objectContaining({ artifactId: 'S-9', toStatus: 'in-progress' })]);
    expect(screen.getByRole('heading', { name: 'Page Story' })).toBeInTheDocument();
  });
});
