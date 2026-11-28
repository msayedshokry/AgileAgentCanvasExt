import { describe, it, expect } from 'vitest';
import { hasBoardActions, LIMITS, NO_BOARD_ACTIONS, sanitizeBoardActions, sanitizeLeadPlan } from './board-actions';

describe('sanitizeBoardActions', () => {
  it('reads questions, proposals, handoff and notes', () => {
    const { value, dropped } = sanitizeBoardActions({
      questions: [{ text: ' Minimum password length: 8 or 12? ' }, 'Plain string question'],
      proposals: [{ title: 'Add rate limiting', description: 'On /login', why: 'Out of scope here' }],
      handoff: { to: 'reviewer', note: 'Check the error states' },
      notes: 'Used src/auth/rules.ts',
    });
    expect(value).toEqual({
      questions: ['Minimum password length: 8 or 12?', 'Plain string question'],
      proposals: [{ title: 'Add rate limiting', description: 'On /login', why: 'Out of scope here' }],
      handoff: { to: 'reviewer', note: 'Check the error states' },
      notes: 'Used src/auth/rules.ts',
    });
    expect(dropped).toEqual([]);
    expect(hasBoardActions(value)).toBe(true);
  });

  it('reads up to the limit of memory lessons, trimmed and capped', () => {
    const { value, dropped } = sanitizeBoardActions({ memory: [' Use pnpm. ', 7, '', 'y'.repeat(900), 'c', 'd'] });
    expect(value.memory).toHaveLength(LIMITS.memory);
    expect(value.memory?.[0]).toBe('Use pnpm.');
    expect(value.memory?.[1]).toHaveLength(LIMITS.memoryChars);
    expect(dropped).toEqual(['1 memory items over the limit of 3']);
    expect(hasBoardActions(value)).toBe(true);
  });

  it('treats a missing block as no actions', () => {
    expect(sanitizeBoardActions(undefined)).toEqual({ value: NO_BOARD_ACTIONS, dropped: [] });
    expect(hasBoardActions(NO_BOARD_ACTIONS)).toBe(false);
  });

  it('caps counts and lengths, and says what it dropped', () => {
    const { value, dropped } = sanitizeBoardActions({
      questions: ['a', 'b', 'c', 'd', 'e'],
      proposals: [{ title: 'One' }, { title: 'one' }, { description: 'no title' }],
      notes: 'x'.repeat(5000),
    });
    expect(value.questions).toHaveLength(LIMITS.questions);
    expect(value.proposals).toEqual([{ title: 'One' }]);
    expect(value.notes).toHaveLength(LIMITS.notesChars);
    expect([...dropped].sort()).toEqual(['2 questions over the limit of 3', 'a duplicate proposal "one"', 'a proposal without a title']);
  });

  it('rejects a handoff to something that is not an agent id, and junk blocks', () => {
    expect(sanitizeBoardActions({ handoff: { to: 'rm -rf /' } }).dropped).toEqual(['a handoff without a valid agent id']);
    expect(sanitizeBoardActions('nope').dropped).toEqual(['the "board" block was not an object']);
  });
});

describe('sanitizeLeadPlan', () => {
  it('reads stories, assignments and next', () => {
    const { value, dropped } = sanitizeLeadPlan({
      stories: [{ ref: 'a', title: 'Login form', acceptance: ['Shows errors', ''] }],
      assign: [{ card: 'a', to: 'dev', why: 'UI work' }, { card: 'S-12', to: 'reviewer' }],
      next: 'wait',
    });
    expect(value).toEqual({
      stories: [{ ref: 'a', title: 'Login form', acceptance: ['Shows errors'] }],
      assign: [{ card: 'a', to: 'dev', why: 'UI work' }, { card: 'S-12', to: 'reviewer' }],
      next: 'wait',
    });
    expect(dropped).toEqual([]);
  });

  it('drops stories without a unique ref, assignments without a target, and unknown next values', () => {
    const { value, dropped } = sanitizeLeadPlan({
      stories: [{ ref: 'a', title: 'One' }, { ref: 'a', title: 'Dup' }, { title: 'No ref' }],
      assign: [{ card: 'a' }],
      next: 'done',
    });
    expect(value?.stories.map((s) => s.ref)).toEqual(['a']);
    expect(value?.assign).toEqual([]);
    expect(value?.next).toBe('wait');
    expect(dropped).toHaveLength(4);
  });

  it('is absent when the agent wrote no lead block', () => {
    expect(sanitizeLeadPlan(undefined)).toEqual({ value: undefined, dropped: [] });
  });
});
