import { describe, it, expect, vi } from 'vitest';

vi.mock('../workflow/kanban-orchestrator', () => ({ setLeadHandler: vi.fn(), kanbanOrchestrator: { runAutonomous: vi.fn() }, kanbanProgress: { event: vi.fn() } }));
vi.mock('../workflow/terminal-executor', () => ({ terminalExecutor: {} }));
vi.mock('../workflow/goal-decomposer', () => ({ goalDecomposer: { on: vi.fn(), off: vi.fn() } }));
vi.mock('../workflow/kanban-verdict', () => ({ getOutputFolder: () => '' }));
vi.mock('./needs-you', () => ({ notifyNeedsYou: vi.fn() }));

import { LeadCoordinator, MAX_STARTS_PER_LEAD_RUN, type LeadCoordinatorDeps } from './lead-coordinator';
import type { AgentTeam } from '../workflow/harness/agent-team';
import type { KanbanVerdict } from '../workflow/kanban-verdict';
import type { ProposedGoal } from '../workflow/goal-decomposer';

const lead = { id: 'cos', name: 'Chief of Staff', harness: 'claude', lead: true };
const dev = { id: 'dev', name: 'Dev', harness: 'claude', role: 'web' };

function setup(verdicts: KanbanVerdict[], over: Partial<LeadCoordinatorDeps> = {}) {
  const cards: Record<string, { type: string; artifact: Record<string, unknown> }> = {
    'E-1': { type: 'epic', artifact: { id: 'E-1', type: 'epic', title: 'Auth', status: 'in-progress' } },
    'S-1': { type: 'story', artifact: { id: 'S-1', title: 'Login form', status: 'ready-for-dev' } },
    'S-2': { type: 'story', artifact: { id: 'S-2', title: 'Logout', status: 'ready-for-dev' } },
  };
  const epics = [{ id: 'E-1', stories: [cards['S-1'].artifact, cards['S-2'].artifact] }];
  let team: AgentTeam = { agents: [lead, dev], assignments: { 'E-1': 'cos' } };
  const runbooks: string[] = [];
  const started: string[] = [];
  const notified: unknown[][] = [];
  const proposed: unknown[][] = [];
  const deps: LeadCoordinatorDeps = {
    store: {
      findArtifactById: (id: string) => cards[id] ?? null,
      updateArtifact: vi.fn(async (_t: string, id: string, ch: { metadata?: Record<string, unknown>; status?: string }) => {
        Object.assign(cards[id].artifact, ch.metadata ?? {}, ch.status ? { status: ch.status } : {});
      }),
      getEpics: () => epics as never,
      createEpic: vi.fn(() => { cards['E-9'] = { type: 'epic', artifact: { id: 'E-9', type: 'epic' } }; epics.push({ id: 'E-9', stories: [] }); return { id: 'E-9' }; }) as never,
    } as never,
    readTeam: () => team,
    writeTeam: (t) => { team = t; },
    runLead: vi.fn(async (_epic, runbook) => { runbooks.push(runbook); return verdicts.shift() ?? ({ verdict: 'COMPLETED', summary: 'Nothing to do', lead: { stories: [], assign: [], next: 'wait' } } as KanbanVerdict); }),
    startStory: (s) => { started.push(String(s.id)); },
    propose: (...a) => { proposed.push(a); return { id: 'goal-1' }; },
    autoApprove: () => false,
    approveAll: vi.fn(async () => undefined),
    notify: (...a) => { notified.push(a); },
    now: () => new Date('2026-11-25T10:00:00Z'),
    ...over,
  };
  return { c: new LeadCoordinator(deps), deps, cards, runbooks, started, notified, proposed, team: () => team };
}

const plan = (p: Partial<NonNullable<KanbanVerdict['lead']>>, summary = 'Plan'): KanbanVerdict =>
  ({ verdict: 'COMPLETED', summary, lead: { stories: [], assign: [], next: 'wait', ...p } });

describe('LeadCoordinator', () => {
  it('owns only epics assigned to the lead', () => {
    const { c } = setup([]);
    expect(c.owns({ id: 'E-1', type: 'epic' })).toBe(true);
    expect(c.owns({ id: 'S-1', type: 'story' })).toBe(false);
  });

  it('runs the lead with a runbook of the epic\'s stories, then assigns and starts what it planned', async () => {
    const t = setup([plan({ assign: [{ card: 'S-1', to: 'dev', why: 'UI work' }] }, 'Dev starts with the form')]);
    await t.c.start('E-1');
    expect(t.runbooks[0]).toContain('| `S-1` | Login form | ready-for-dev | unassigned |');
    expect(t.runbooks[0]).toContain('You were just given this epic');
    expect(t.team().assignments['S-1']).toBe('dev');
    expect(t.started).toEqual(['S-1']);
    expect(t.cards['S-1'].artifact.agentNotes).toEqual([{ author: 'Chief of Staff', text: 'Assigned to Dev: UI work', at: '2026-11-25 10:00' }]);
    expect(t.cards['E-1'].artifact.agentNotes).toEqual([{ author: 'Chief of Staff', text: 'Dev starts with the form', at: '2026-11-25 10:00' }]);
  });

  it('sends proposed stories to approval and assigns them once they become cards', async () => {
    const t = setup([plan({ stories: [{ ref: 'a', title: 'Password reset' }], assign: [{ card: 'a', to: 'dev' }] })]);
    await t.c.start('E-1');
    const [, , stories] = t.proposed[0] as [string, unknown, Array<{ id: string; epicId: string }>];
    expect(stories).toEqual([{ id: 'lead:E-1:a', title: 'Password reset', epicId: 'E-1' }]);
    expect(t.notified[0]).toEqual(['PROPOSALS-E-1', 'proposal', 'Chief of Staff proposes 1 new story', { cardId: 'E-1', details: ['Password reset'] }]);
    expect(t.started).toEqual([]);

    t.cards['S-7'] = { type: 'story', artifact: { id: 'S-7', title: 'Password reset', status: 'ready-for-dev' } };
    await t.c.storiesCreated({ id: 'goal-1', approvedStories: stories } as unknown as ProposedGoal, ['S-7']);
    expect(t.team().assignments['S-7']).toBe('dev');
    expect(t.started).toEqual(['S-7']);
  });

  it('moves the epic to review when the lead says the goal is met, and asks the user to check it', async () => {
    const t = setup([plan({ next: 'review' }, 'All stories done')]);
    await t.c.start('E-1');
    expect(t.cards['E-1'].artifact.status).toBe('review');
    expect(t.notified).toContainEqual(['E-1', 'approval', "Chief of Staff says this epic's goal is met. Check it and mark it done."]);
  });

  it('notes what it refused from the plan', async () => {
    const t = setup([plan({ assign: [{ card: 'S-1', to: 'cos' }, { card: 'S-1', to: 'ghost' }] })]);
    await t.c.start('E-1');
    expect(String((t.cards['E-1'].artifact.agentNotes as Array<{ text: string }>).at(-1)?.text)).toMatch(/^Not applied from the lead's plan: assigning S-1 to the lead itself; assigning S-1 to "ghost"/);
  });

  it('wakes the lead when a story of its epic ends, with what happened', async () => {
    const t = setup([plan({ assign: [{ card: 'S-2', to: 'dev' }] })]);
    await t.c.storyEnded({ artifactId: 'S-1', agentState: { status: 'completed' } });
    expect(t.runbooks[0]).toContain('- S-1 "Login form" finished and is done');
    expect(t.started).toEqual(['S-2']);
    await t.c.storyEnded({ artifactId: 'S-1', agentState: { status: 'running' } });
    expect(t.runbooks).toHaveLength(1);
  });

  it('stops a lead that does nothing twice, with an Inbox entry', async () => {
    const t = setup([]);
    await t.c.start('E-1');
    await t.c.storyEnded({ artifactId: 'S-1', agentState: { status: 'completed' } });
    await t.c.storyEnded({ artifactId: 'S-2', agentState: { status: 'completed' } });
    expect(t.runbooks).toHaveLength(2);
    expect(t.notified.at(-1)?.[1]).toBe('stopped');
    expect(String(t.notified.at(-1)?.[2])).toMatch(/ran twice without assigning or asking/);
  });

  it(`starts at most ${MAX_STARTS_PER_LEAD_RUN} stories per lead run`, async () => {
    const t = setup([plan({ assign: ['S-1', 'S-2', 'S-3', 'S-4'].map((card) => ({ card, to: 'dev' })) })]);
    for (const id of ['S-3', 'S-4']) {
      t.cards[id] = { type: 'story', artifact: { id, title: id, status: 'ready-for-dev' } };
      (t.deps.store.getEpics()[0].stories as unknown[]).push(t.cards[id].artifact);
    }
    await t.c.start('E-1');
    expect(t.started).toHaveLength(MAX_STARTS_PER_LEAD_RUN);
    expect(String((t.cards['E-1'].artifact.agentNotes as Array<{ text: string }>).at(-1)?.text)).toMatch(/1 assigned story waits to start/);
  });

  it('turns a goal into an epic owned by the lead and plans it', async () => {
    const t = setup([plan({})]);
    expect(await t.c.planGoal('Add login')).toBe('E-9');
    expect(t.team().assignments['E-9']).toBe('cos');
    expect(t.runbooks[0]).toContain('The user gave you this goal');
    expect(t.runbooks[0]).toContain('Add login');
  });
});
