import { describe, it, expect, vi } from 'vitest';

vi.mock('../workflow/terminal-executor', () => ({ setBoardLive: vi.fn() }));

import { runBoardTool, type BoardLiveDeps } from './board-live';
import { LiveQuestions } from '../workflow/board-live/live-questions';
import type { AgentVerdictEvent } from '../workflow/terminal-executor';

const dev = { id: 'dev', name: 'Dev', harness: 'claude' };
const scope = { runId: 'r1', cardId: 'S-1', agentId: 'dev' };

function setup(over: Partial<BoardLiveDeps> = {}) {
  const applied: AgentVerdictEvent[] = [];
  const notified: unknown[][] = [];
  const dismissed: string[] = [];
  const card = { id: 'S-1', title: 'Login', agentNotes: [] as unknown[] };
  const deps: BoardLiveDeps = {
    store: {
      findArtifactById: (id: string) => (id === 'S-1' ? { type: 'story', artifact: card } : null),
      getEpics: () => [{ id: 'E-1', title: 'Auth', stories: [{ id: 'S-1', title: 'Login', status: 'in-progress' }, { id: 'S-2', title: 'Logout', status: 'backlog' }] }] as never,
    } as never,
    readTeam: () => ({ agents: [dev], assignments: { 'S-1': 'dev' } }),
    apply: async (evt) => { applied.push(evt); },
    notifyQuestion: (...a) => { notified.push(a); },
    dismiss: (id) => { dismissed.push(id); },
    takeMessages: () => ['Use the new auth API'],
    questions: new LiveQuestions(),
    ...over,
  };
  return { deps, applied, notified, dismissed, card };
}

describe('runBoardTool: project memory', () => {
  it('searches and saves through the memory deps, as the running agent', async () => {
    const saved: string[][] = [];
    const { deps } = setup({ memory: { recall: (q) => (q === 'pnpm' ? ['- 2026-11-27 [lesson] Dev: Use pnpm.'] : []), remember: (...a) => { saved.push(a); } } });
    expect((await runBoardTool(deps, scope, 'board_recall', { query: 'pnpm' })).text).toBe('- 2026-11-27 [lesson] Dev: Use pnpm.');
    expect((await runBoardTool(deps, scope, 'board_recall', { query: 'yarn' })).text).toContain('Nothing in project memory');
    expect((await runBoardTool(deps, scope, 'board_remember', { text: 'Use pnpm.' })).ok).toBe(true);
    expect(saved).toEqual([['S-1', 'Dev', 'Use pnpm.']]);
  });

  it('says so when there is no project memory', async () => {
    const { deps } = setup();
    expect(await runBoardTool(deps, scope, 'board_recall', { query: 'x' })).toMatchObject({ ok: false });
  });
});

describe('runBoardTool', () => {
  it('reads the card and its epic', async () => {
    const { deps } = setup();
    expect((await runBoardTool(deps, scope, 'board_get_card', {})).text).toContain('"title": "Login"');
    const epic = await runBoardTool(deps, scope, 'board_list_epic', {});
    expect(epic.text).toBe('Epic E-1: Auth\n- S-1 | Login | in-progress | dev\n- S-2 | Logout | backlog | unassigned');
  });

  it('notes and proposes through the same applier as the verdict, as the running agent', async () => {
    const t = setup();
    await runBoardTool(t.deps, scope, 'board_note', { text: 'Half done' });
    await runBoardTool(t.deps, scope, 'board_propose', { proposals: [{ title: 'Rate limit' }] });
    expect(t.applied.map((e) => [e.artifactId, e.agent?.id, e.verdict.board])).toEqual([
      ['S-1', 'dev', { questions: [], proposals: [], notes: 'Half done' }],
      ['S-1', 'dev', { questions: [], proposals: [{ title: 'Rate limit' }] }],
    ]);
  });

  it('hands over messages the user sent during the run', async () => {
    expect((await runBoardTool(setup().deps, scope, 'board_check_messages', {})).text).toBe('1. Use the new auth API');
    expect((await runBoardTool(setup({ takeMessages: () => [] }).deps, scope, 'board_check_messages', {})).text).toBe('No new messages.');
  });

  it('asks the user and returns the answer in the same run', async () => {
    const t = setup();
    const call = runBoardTool(t.deps, scope, 'board_ask', { questions: ['8 or 12?'] });
    await Promise.resolve();
    expect(t.notified).toEqual([['S-1', 'Dev asks a question and is waiting', ['8 or 12?']]]);
    expect(t.deps.questions.answer('S-1', '12')).toBe(true);
    expect(await call).toEqual({ ok: true, text: 'The user answered:\n12' });
    expect(t.dismissed).toEqual(['S-1']);
    expect([...t.deps.questions.takeAnswered('S-1')]).toEqual(['8 or 12']); // so the verdict won't ask it again
  });

  it('tells the agent to end with BLOCKED when no answer comes in time', async () => {
    const t = setup({ askWaitMs: 5 });
    const res = await runBoardTool(t.deps, scope, 'board_ask', { questions: ['8 or 12?'] });
    expect(res.ok).toBe(false);
    expect(res.text).toMatch(/verdict BLOCKED/);
    expect(t.dismissed).toEqual([]);
  });

  it('reports a refused handoff back to the agent', async () => {
    const t = setup({ apply: async () => { t.card.agentNotes.push({ author: 'Board', text: 'Ignored from Dev\'s verdict: a handoff to itself.', at: 't' }); } });
    expect(await runBoardTool(t.deps, scope, 'board_handoff', { to: 'dev' })).toEqual({ ok: false, text: 'Ignored from Dev\'s verdict: a handoff to itself.' });
  });

  it('turns a failure into advice instead of throwing', async () => {
    const t = setup({ apply: async () => { throw new Error('disk full'); } });
    const res = await runBoardTool(t.deps, scope, 'board_note', { text: 'x' });
    expect(res).toMatchObject({ ok: false });
    expect(res.text).toMatch(/disk full.*verdict/);
  });
});
