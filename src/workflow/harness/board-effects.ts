// ─── From an agent's verdict to board effects ────────────────────────────────
// Decides what the board does with a sanitized verdict (board-actions.ts):
// which notes to save, questions to raise, proposals to queue for approval,
// and whether a handoff is allowed. Pure, so every rule is unit-tested; the
// side effects live in views/board-protocol.ts.
// See docs/plans/2026-11-25-agent-board-protocol.md, D2 and flows A–D.

import type { BoardProposal } from './board-actions';
import type { TeamAgent } from './agent-team';
import type { KanbanVerdict } from '../kanban-verdict';

export type BoardEffect =
  | { readonly type: 'note'; readonly author: string; readonly text: string }
  | { readonly type: 'questions'; readonly author: string; readonly questions: readonly string[] }
  | { readonly type: 'proposals'; readonly author: string; readonly proposals: readonly BoardProposal[] }
  | { readonly type: 'handoff'; readonly to: TeamAgent; readonly from: string; readonly note?: string };

export interface PlanInput {
  readonly verdict: KanbanVerdict;
  /** The agent that ran; undefined when the card had no assignee. */
  readonly agent?: TeamAgent;
  /** Label for an unassigned run (the CLI's name). */
  readonly fallbackAuthor: string;
  readonly roster: readonly TeamAgent[];
}

export function planBoardEffects({ verdict, agent, fallbackAuthor, roster }: PlanInput): BoardEffect[] {
  const author = agent?.name ?? fallbackAuthor;
  const board = verdict.board;
  const effects: BoardEffect[] = [];
  const problems = [...(verdict.boardDropped ?? [])];

  if (board?.notes) effects.push({ type: 'note', author, text: board.notes });
  if (board?.questions.length) effects.push({ type: 'questions', author, questions: board.questions });
  if (board?.proposals.length) effects.push({ type: 'proposals', author, proposals: board.proposals });

  if (board?.handoff) {
    const to = roster.find((a) => a.id === board.handoff!.to);
    if (!to) problems.push(`a handoff to "${board.handoff.to}", who is not on the team`);
    else if (to.id === agent?.id) problems.push('a handoff to itself');
    else if (to.lead) problems.push(`a handoff to the lead "${to.name}" (the lead plans; it does not take stories)`);
    else effects.push({ type: 'handoff', to, from: author, ...(board.handoff.note ? { note: board.handoff.note } : {}) });
  }

  if (problems.length) {
    effects.push({ type: 'note', author: 'Board', text: `Ignored from ${author}'s verdict: ${problems.join('; ')}.` });
  }
  return effects;
}

/** Text of the follow-up the agent gets once the user answers its questions. */
export function answerFollowUp(questions: readonly string[], answer: string): string {
  return `You asked:\n${questions.map((q) => `- ${q}`).join('\n')}\n\nThe user answered:\n${answer.trim()}`;
}

/** Card notes are capped so the brief stays short; oldest go first. */
export const MAX_CARD_NOTES = 20;

export function appendNote<T>(existing: readonly T[], note: T): T[] {
  return [...existing, note].slice(-MAX_CARD_NOTES);
}
