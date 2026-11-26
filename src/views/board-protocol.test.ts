import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../workflow/terminal-executor', () => ({ agentVerdicts: { event: vi.fn() } }));
vi.mock('../workflow/kanban-orchestrator', () => ({ setAgentResolver: vi.fn(), agentWaitAlert: { event: vi.fn() } }));
vi.mock('../workflow/kanban-verdict', () => ({ getOutputFolder: () => '' }));
vi.mock('./follow-up-messages', () => ({ followUpSender: vi.fn() }));
vi.mock('../workflow/goal-decomposer', () => ({ goalDecomposer: { on: vi.fn(), off: vi.fn(), pendingReview: () => [] } }));

import { applyAgentVerdict, epicContextFor, epicOf, proposalKey, saveEpicContext, type BoardProtocolDeps } from './board-protocol';
import type { AgentTeam } from '../workflow/harness/agent-team';
import type { KanbanVerdict } from '../workflow/kanban-verdict';

const dev = { id: 'dev', name: 'Dev', harness: 'claude' };
const reviewer = { id: 'reviewer', name: 'Reviewer', harness: 'codex' };

function makeDeps(over: Partial<BoardProtocolDeps> = {}) {
  const cards: Record<string, { type: string; artifact: Record<string, unknown> }> = {
    'S-1': { type: 'story', artifact: { id: 'S-1', agentNotes: [] } },
  };
  let team: AgentTeam = { agents: [dev, reviewer], assignments: { 'S-1': 'dev' } };
  const notified: unknown[][] = [];
  const proposed: unknown[][] = [];
  const deps: BoardProtocolDeps = {
    store: {
      findArtifactById: (id: string) => cards[id] ?? null,
      updateArtifact: vi.fn(async (_t: string, id: string, changes: { metadata?: Record<string, unknown> }) => {
        Object.assign(cards[id].artifact, changes.metadata ?? {});
      }),
      getEpics: () => [{ id: 'E-1', stories: [{ id: 'S-1' }] }] as never,
    } as never,
    readTeam: () => team,
    writeTeam: (t) => { team = t; },
    notify: (...args) => { notified.push(args); },
    propose: (...args) => { proposed.push(args); return { id: 'goal-1' }; },
    autoApprove: () => false,
    approveAll: vi.fn(async () => undefined),
    now: () => new Date('2026-11-25T10:00:00Z'),
    ...over,
  };
  return { deps, cards, notified, proposed, team: () => team };
}

const verdict = (board: KanbanVerdict['board'], extra: Partial<KanbanVerdict> = {}): KanbanVerdict => ({ verdict: 'COMPLETED', board, ...extra });
const notes = (cards: ReturnType<typeof makeDeps>['cards']) => cards['S-1'].artifact.agentNotes as Array<{ author: string; text: string }>;

describe('applyAgentVerdict', () => {
  let ctx: ReturnType<typeof makeDeps>;
  beforeEach(() => { ctx = makeDeps(); });

  it('saves the agent\'s notes on the card', async () => {
    await applyAgentVerdict(ctx.deps, { artifactId: 'S-1', workflowId: 'w', agent: dev, verdict: verdict({ questions: [], proposals: [], notes: 'Used rules.ts' }) });
    expect(notes(ctx.cards)).toEqual([{ author: 'Dev', text: 'Used rules.ts', at: '2026-11-25 10:00' }]);
  });

  it('raises the agent\'s questions in the Inbox with their texts', async () => {
    await applyAgentVerdict(ctx.deps, { artifactId: 'S-1', workflowId: 'w', agent: dev, verdict: verdict({ questions: ['8 or 12?'], proposals: [] }, { verdict: 'BLOCKED' }) });
    expect(ctx.notified).toEqual([['S-1', 'question', 'Dev asks a question', { details: ['8 or 12?'] }]]);
  });

  it('queues proposals for review in the card\'s epic, with an Inbox entry of their own', async () => {
    await applyAgentVerdict(ctx.deps, { artifactId: 'S-1', workflowId: 'w', agent: dev, verdict: verdict({ questions: [], proposals: [{ title: 'Rate limit', why: 'Out of scope' }] }) });
    const [summary, source, stories] = ctx.proposed[0] as [string, unknown, Array<Record<string, unknown>>];
    expect(summary).toBe('Proposed by Dev while working on S-1');
    expect(source).toEqual({ cardId: 'S-1', agent: 'Dev' });
    expect(stories[0]).toMatchObject({ title: 'Rate limit', description: 'Why: Out of scope', epicId: 'E-1' });
    expect(ctx.notified).toEqual([[proposalKey('S-1'), 'proposal', 'Dev proposes 1 new card', { cardId: 'S-1', details: ['Rate limit'] }]]);
  });

  it('creates proposed cards straight away when auto-approve is on, and says so on the card', async () => {
    ctx = makeDeps({ autoApprove: () => true });
    await applyAgentVerdict(ctx.deps, { artifactId: 'S-1', workflowId: 'w', agent: dev, verdict: verdict({ questions: [], proposals: [{ title: 'Rate limit' }] }) });
    expect(ctx.deps.approveAll).toHaveBeenCalledWith('goal-1');
    expect(ctx.notified).toEqual([]);
    expect(notes(ctx.cards).at(-1)?.text).toBe('Created 1 card(s) Dev proposed (auto-approve is on).');
  });

  it('reassigns the card on a handoff and records it', async () => {
    await applyAgentVerdict(ctx.deps, { artifactId: 'S-1', workflowId: 'w', agent: dev, verdict: verdict({ questions: [], proposals: [], handoff: { to: 'reviewer', note: 'check errors' } }) });
    expect(ctx.team().assignments['S-1']).toBe('reviewer');
    expect(notes(ctx.cards).at(-1)).toMatchObject({ author: 'Dev', text: 'Handed off to Reviewer: check errors' });
  });

  it('keeps going when one effect fails', async () => {
    ctx = makeDeps({ propose: () => { throw new Error('boom'); } });
    await applyAgentVerdict(ctx.deps, { artifactId: 'S-1', workflowId: 'w', agent: dev, verdict: verdict({ questions: ['q?'], proposals: [{ title: 'x' }], notes: 'n' }) });
    expect(notes(ctx.cards)).toHaveLength(1);
    expect(ctx.notified).toHaveLength(1);
  });
});

describe('epicOf', () => {
  it('finds a story\'s epic, and an epic is its own', () => {
    const store = { getEpics: () => [{ id: 'E-1', stories: [{ id: 'S-1' }] }] } as never;
    expect(epicOf(store, 'S-1')).toBe('E-1');
    expect(epicOf(store, 'E-1')).toBe('E-1');
    expect(epicOf(store, 'X')).toBeUndefined();
  });
});

describe('epic context', () => {
  const epics = [{ id: 'E-1', stories: [{ id: 'S-1' }], agentContext: { paths: ['docs/auth.md'], urls: [] } }];

  it("gives a story its epic's context", () => {
    const store = { getEpics: () => epics } as never;
    expect(epicContextFor(store, 'S-1')).toEqual({ epicId: 'E-1', context: { paths: ['docs/auth.md'], urls: [] } });
    expect(epicContextFor(store, 'X')).toBeUndefined();
  });

  it('saves checked context on the epic, and reports problems without saving', async () => {
    const updateArtifact = vi.fn(async () => undefined);
    const store = { getEpics: () => epics, updateArtifact } as never;
    const post = vi.fn();
    await saveEpicContext(store, 'E-1', { paths: 'src/auth', urls: '', note: 'v2' }, post);
    expect(updateArtifact).toHaveBeenCalledWith('epic', 'E-1', { metadata: { agentContext: { paths: ['src/auth'], urls: [], note: 'v2' } } });
    expect(post).toHaveBeenLastCalledWith({ type: 'kanban:epicContextSaved', artifactId: 'E-1', context: { paths: ['src/auth'], urls: [], note: 'v2' } });
    await saveEpicContext(store, 'E-1', { paths: '../outside' }, post);
    expect(post).toHaveBeenLastCalledWith({ type: 'kanban:epicContextError', artifactId: 'E-1', error: 'Path "../outside" must stay inside the workspace' });
    expect(updateArtifact).toHaveBeenCalledTimes(1);
  });
});
