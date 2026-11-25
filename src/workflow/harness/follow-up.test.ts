import { describe, it, expect } from 'vitest';
import { cleanFollowUp, FollowUpQueue, mergeFixRequests, MAX_FOLLOW_UP_CHARS, MAX_QUEUED_PER_CARD } from './follow-up';

describe('cleanFollowUp', () => {
  it('trims, caps length and rejects empty or non-text input', () => {
    expect(cleanFollowUp('  also handle empty passwords \n')).toBe('also handle empty passwords');
    expect(cleanFollowUp('x'.repeat(5000))).toHaveLength(MAX_FOLLOW_UP_CHARS);
    expect(cleanFollowUp('   ')).toBeUndefined();
    expect(cleanFollowUp(42)).toBeUndefined();
  });
});

describe('mergeFixRequests', () => {
  it('keeps review items, replaces earlier follow-ups, and adds the new ones', () => {
    const existing = [
      { failing_criterion: 'Review comment from @alice', reproduction: 'Handle nulls' },
      { failing_criterion: 'Follow-up from the user', reproduction: 'old ask' },
      'junk',
    ];
    expect(mergeFixRequests(existing, ['new ask'])).toEqual([
      { failing_criterion: 'Review comment from @alice', reproduction: 'Handle nulls' },
      { failing_criterion: 'Follow-up from the user', reproduction: 'new ask' },
    ]);
  });

  it('works when the card has no fix requests yet', () => {
    expect(mergeFixRequests(undefined, ['a', 'b'])).toHaveLength(2);
  });
});

describe('FollowUpQueue', () => {
  it('holds messages per card until taken, oldest first', () => {
    const q = new FollowUpQueue();
    expect(q.add('S-1', 'first')).toBe(1);
    expect(q.add('S-1', 'second')).toBe(2);
    q.add('S-2', 'other');
    expect(q.take('S-1')).toEqual(['first', 'second']);
    expect(q.pending('S-1')).toBe(0);
    expect(q.pending('S-2')).toBe(1);
  });

  it('keeps only the newest messages when a card gets too many', () => {
    const q = new FollowUpQueue();
    for (let i = 0; i < MAX_QUEUED_PER_CARD + 3; i++) q.add('S-1', `m${i}`);
    const taken = q.take('S-1');
    expect(taken).toHaveLength(MAX_QUEUED_PER_CARD);
    expect(taken[0]).toBe('m3');
  });
});
