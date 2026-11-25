// ─── Board actions from an agent's verdict ──────────────────────────────────
// Agents ask things of the board through their verdict file (see
// docs/plans/2026-11-25-agent-board-protocol.md, D1/D2):
//   board.questions  — things only the user can answer (→ Inbox)
//   board.proposals  — new cards the agent thinks are needed (→ approval)
//   board.handoff    — the agent who should take this card next
//   board.notes      — what the next agent on this card should know
// and the lead agent plans through a `lead` block (D5). Everything here is
// untrusted model output: it is shape-checked and length-capped before any of
// it reaches the board, and what is dropped is reported, never silent. Pure.

export const LIMITS = {
  questions: 3,
  proposals: 5,
  leadStories: 12,
  leadAssignments: 12,
  notesChars: 2000,
  textChars: 4000,
  titleChars: 200,
  acceptanceItems: 10,
} as const;

export interface BoardProposal { readonly title: string; readonly description?: string; readonly why?: string }
export interface BoardHandoff { readonly to: string; readonly note?: string }

export interface BoardActions {
  readonly questions: readonly string[];
  readonly proposals: readonly BoardProposal[];
  readonly handoff?: BoardHandoff;
  readonly notes?: string;
}

export interface LeadStory { readonly ref: string; readonly title: string; readonly description?: string; readonly acceptance?: readonly string[] }
export interface LeadAssignment { readonly card: string; readonly to: string; readonly why?: string }
export type LeadNext = 'wait' | 'review' | 'ask';

export interface LeadPlan {
  readonly stories: readonly LeadStory[];
  readonly assign: readonly LeadAssignment[];
  readonly next: LeadNext;
}

export interface Sanitized<T> { readonly value: T; readonly dropped: readonly string[] }

export const NO_BOARD_ACTIONS: BoardActions = { questions: [], proposals: [] };

const ID = /^[A-Za-z0-9][\w.-]{0,79}$/;

function text(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function capped<T>(items: T[], max: number, what: string, dropped: string[]): T[] {
  if (items.length > max) dropped.push(`${items.length - max} ${what} over the limit of ${max}`);
  return items.slice(0, max);
}

export function sanitizeBoardActions(raw: unknown): Sanitized<BoardActions> {
  const dropped: string[] = [];
  if (raw === undefined || raw === null) return { value: NO_BOARD_ACTIONS, dropped };
  if (typeof raw !== 'object') return { value: NO_BOARD_ACTIONS, dropped: ['the "board" block was not an object'] };
  const obj = raw as Record<string, unknown>;

  const questions = capped(
    list(obj.questions).map((q) => text(typeof q === 'object' && q ? (q as { text?: unknown }).text : q, LIMITS.textChars))
      .filter((q): q is string => !!q),
    LIMITS.questions, 'questions', dropped,
  );

  const seenTitles = new Set<string>();
  const proposals = capped(list(obj.proposals).flatMap((p): BoardProposal[] => {
    const rec = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    const title = text(rec.title, LIMITS.titleChars);
    if (!title) { dropped.push('a proposal without a title'); return []; }
    const key = title.toLowerCase();
    if (seenTitles.has(key)) { dropped.push(`a duplicate proposal "${title}"`); return []; }
    seenTitles.add(key);
    const description = text(rec.description, LIMITS.textChars);
    const why = text(rec.why, LIMITS.textChars);
    return [{ title, ...(description ? { description } : {}), ...(why ? { why } : {}) }];
  }), LIMITS.proposals, 'proposals', dropped);

  let handoff: BoardHandoff | undefined;
  if (obj.handoff !== undefined) {
    const rec = (obj.handoff && typeof obj.handoff === 'object' ? obj.handoff : {}) as Record<string, unknown>;
    const to = typeof rec.to === 'string' && ID.test(rec.to.trim()) ? rec.to.trim() : undefined;
    const note = text(rec.note, LIMITS.textChars);
    if (to) handoff = { to, ...(note ? { note } : {}) };
    else dropped.push('a handoff without a valid agent id');
  }

  const notes = text(obj.notes, LIMITS.notesChars);
  return { value: { questions, proposals, ...(handoff ? { handoff } : {}), ...(notes ? { notes } : {}) }, dropped };
}

export function sanitizeLeadPlan(raw: unknown): Sanitized<LeadPlan | undefined> {
  const dropped: string[] = [];
  if (raw === undefined || raw === null) return { value: undefined, dropped };
  if (typeof raw !== 'object') return { value: undefined, dropped: ['the "lead" block was not an object'] };
  const obj = raw as Record<string, unknown>;

  const refs = new Set<string>();
  const stories = capped(list(obj.stories).flatMap((s): LeadStory[] => {
    const rec = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    const ref = typeof rec.ref === 'string' && ID.test(rec.ref) ? rec.ref : undefined;
    const title = text(rec.title, LIMITS.titleChars);
    if (!ref || !title || refs.has(ref)) { dropped.push('a story without a unique ref and a title'); return []; }
    refs.add(ref);
    const description = text(rec.description, LIMITS.textChars);
    const acceptance = list(rec.acceptance).map((a) => text(a, LIMITS.textChars)).filter((a): a is string => !!a).slice(0, LIMITS.acceptanceItems);
    return [{ ref, title, ...(description ? { description } : {}), ...(acceptance.length ? { acceptance } : {}) }];
  }), LIMITS.leadStories, 'stories', dropped);

  const assign = capped(list(obj.assign).flatMap((a): LeadAssignment[] => {
    const rec = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
    const card = typeof rec.card === 'string' && ID.test(rec.card) ? rec.card : undefined;
    const to = typeof rec.to === 'string' && ID.test(rec.to) ? rec.to : undefined;
    if (!card || !to) { dropped.push('an assignment without a card and an agent'); return []; }
    const why = text(rec.why, LIMITS.textChars);
    return [{ card, to, ...(why ? { why } : {}) }];
  }), LIMITS.leadAssignments, 'assignments', dropped);

  const next: LeadNext = obj.next === 'review' || obj.next === 'ask' ? obj.next : 'wait';
  if (obj.next !== undefined && obj.next !== next) dropped.push(`an unknown "next" value; using "wait"`);
  return { value: { stories, assign, next }, dropped };
}

/** True when the agent asked the board for anything. */
export function hasBoardActions(a: BoardActions): boolean {
  return a.questions.length > 0 || a.proposals.length > 0 || !!a.handoff || !!a.notes;
}
