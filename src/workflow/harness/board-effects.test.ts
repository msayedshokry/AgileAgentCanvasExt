import { describe, it, expect } from 'vitest';
import { answerFollowUp, appendNote, MAX_CARD_NOTES, planBoardEffects } from './board-effects';
import type { KanbanVerdict } from '../kanban-verdict';

const dev = { id: 'dev', name: 'Dev', harness: 'claude' };
const reviewer = { id: 'reviewer', name: 'Reviewer', harness: 'codex' };
const lead = { id: 'cos', name: 'Chief of Staff', harness: 'claude', lead: true };
const roster = [dev, reviewer, lead];
const v = (board: KanbanVerdict['board'], extra: Partial<KanbanVerdict> = {}): KanbanVerdict => ({ verdict: 'COMPLETED', board, ...extra });

describe('planBoardEffects', () => {
  it('turns notes, questions and proposals into effects attributed to the agent', () => {
    expect(planBoardEffects({
      verdict: v({ questions: ['8 or 12?'], proposals: [{ title: 'Rate limit' }], notes: 'Used rules.ts' }),
      agent: dev, fallbackAuthor: 'Claude Code', roster,
    })).toEqual([
      { type: 'note', author: 'Dev', text: 'Used rules.ts' },
      { type: 'questions', author: 'Dev', questions: ['8 or 12?'] },
      { type: 'proposals', author: 'Dev', proposals: [{ title: 'Rate limit' }] },
    ]);
  });

  it('hands off to a team member with the note', () => {
    expect(planBoardEffects({ verdict: v({ questions: [], proposals: [], handoff: { to: 'reviewer', note: 'check errors' } }), agent: dev, fallbackAuthor: 'x', roster }))
      .toEqual([{ type: 'handoff', to: reviewer, from: 'Dev', note: 'check errors' }]);
  });

  it('refuses handoffs to strangers, to itself and to the lead, and says so on the card', () => {
    for (const [to, why] of [['ghost', 'not on the team'], ['dev', 'to itself'], ['cos', 'the lead plans']] as const) {
      const effects = planBoardEffects({ verdict: v({ questions: [], proposals: [], handoff: { to } }), agent: dev, fallbackAuthor: 'x', roster });
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({ type: 'note', author: 'Board' });
      expect((effects[0] as { text: string }).text).toContain(why);
    }
  });

  it('reports what the sanitizer dropped and names an unassigned run by its CLI', () => {
    expect(planBoardEffects({ verdict: v(undefined, { boardDropped: ['2 questions over the limit of 3'] }), fallbackAuthor: 'Claude Code', roster }))
      .toEqual([{ type: 'note', author: 'Board', text: "Ignored from Claude Code's verdict: 2 questions over the limit of 3." }]);
  });

  it('does nothing for a plain verdict', () => {
    expect(planBoardEffects({ verdict: { verdict: 'COMPLETED' }, agent: dev, fallbackAuthor: 'x', roster })).toEqual([]);
  });
});

describe('helpers', () => {
  it('quotes the questions back with the answer', () => {
    expect(answerFollowUp(['8 or 12?'], ' 12 ')).toBe('You asked:\n- 8 or 12?\n\nThe user answered:\n12');
  });

  it('keeps only the newest notes', () => {
    const notes = Array.from({ length: MAX_CARD_NOTES }, (_, i) => i);
    expect(appendNote(notes, 99)).toHaveLength(MAX_CARD_NOTES);
    expect(appendNote(notes, 99).at(-1)).toBe(99);
    expect(appendNote(notes, 99)[0]).toBe(1);
  });
});
