// ─── Unit tests: goal-decomposer ──────────────────────────────────────────────
// Covers: submit → readyForReview → approveStories → dispatch (happy path) and
// submit throws when hooks not set (most common error path).

import { describe, it, expect, vi } from 'vitest';
import { GoalDecomposer, type ProposedStory } from './goal-decomposer';

const SAMPLE_STORIES: ProposedStory[] = [
  { id: 'p1', title: 'Add login' },
  { id: 'p2', title: 'Add logout' },
];

describe('GoalDecomposer', () => {
  it('happy: submit → approveStories → dispatch returns persisted ids and emits "dispatched"', async () => {
    const d = new GoalDecomposer();
    const persist = vi.fn(async (s: ProposedStory) => `art-${s.id}`);
    const decompose = vi.fn(async () => SAMPLE_STORIES);
    d.setHooks({ decompose, persistStory: persist, notifyScheduler: vi.fn() });

    const dispatchedIds: string[] = [];
    d.on('dispatched', (p) => dispatchedIds.push(...p.persistedIds));

    const id = await d.submit('Add auth', 'tester');
    const goal = d.getGoal(id)!;
    expect(goal.status).toBe('review');
    expect(goal.proposedStories).toHaveLength(2);

    await d.approveStories(id, ['p1']);
    expect(d.getGoal(id)?.approvedStories.map(s => s.id)).toEqual(['p1']);
    expect(d.getGoal(id)?.rejectedStories.map(s => s.id)).toEqual(['p2']);

    const ids = await d.dispatch(id);
    expect(ids).toEqual(['art-p1']);
    expect(dispatchedIds).toEqual(['art-p1']);
    expect(d.getGoal(id)?.status).toBe('dispatched');
  });

  it('error: submit throws when hooks have not been set', async () => {
    const d = new GoalDecomposer();
    await expect(d.submit('whatever')).rejects.toThrow(/hooks not set/);
  });
});
