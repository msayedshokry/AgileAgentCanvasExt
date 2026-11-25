import { describe, it, expect } from 'vitest';
import { buildLeadRunbook, describeWake, LeadGuard, MAX_LEAD_RUNS_PER_EPIC, planLeadEffects, type EpicStory } from './lead-plan';

const lead = { id: 'cos', name: 'Chief of Staff', harness: 'claude', lead: true };
const dev = { id: 'dev', name: 'Dev', harness: 'claude', role: 'Implements web stories' };
const reviewer = { id: 'reviewer', name: 'Reviewer', harness: 'codex' };
const roster = [lead, dev, reviewer];
const stories: EpicStory[] = [
  { id: 'S-1', title: 'Login form', status: 'ready-for-dev' },
  { id: 'S-2', title: 'Session timeout', status: 'in-progress', assignee: 'dev' },
  { id: 'S-3', title: 'Remember me', status: 'done', assignee: 'dev' },
];

describe('buildLeadRunbook', () => {
  const runbook = buildLeadRunbook(stories, roster, { kind: 'finished', updates: ['S-3 "Remember me" finished: done'] });

  it('lists the members (not the lead) and the epic\'s stories with status and assignee', () => {
    expect(runbook).toContain('| `dev` | Dev | Implements web stories |');
    expect(runbook).toContain('| `reviewer` | Reviewer | — |');
    expect(runbook).not.toContain('| `cos` |');
    expect(runbook).toContain('| `S-2` | Session timeout | in-progress | dev |');
  });

  it('says why it was woken and how to answer', () => {
    expect(runbook).toContain('- S-3 "Remember me" finished: done');
    expect(runbook).toContain('"next": "wait"');
    expect(runbook).toContain('you never implement');
  });

  it('describes each wake reason', () => {
    expect(describeWake({ kind: 'start' })).toMatch(/just given this epic/);
    expect(describeWake({ kind: 'goal', goal: 'Add login' })).toContain('Add login');
  });
});

describe('planLeadEffects', () => {
  it('splits assignments into now (existing ready stories) and on approval (proposed refs)', () => {
    const effects = planLeadEffects({
      stories: [{ ref: 'a', title: 'Password reset' }],
      assign: [{ card: 'S-1', to: 'dev', why: 'UI' }, { card: 'a', to: 'reviewer' }],
      next: 'wait',
    }, stories, roster);
    expect(effects.propose.map((s) => s.ref)).toEqual(['a']);
    expect(effects.assignNow).toEqual([{ card: 'S-1', to: dev, why: 'UI' }]);
    expect(effects.assignOnApproval).toEqual([{ ref: 'a', to: reviewer }]);
    expect(effects.refused).toEqual([]);
  });

  it('refuses strangers, the lead, running or done stories, unknown cards and duplicate stories', () => {
    const effects = planLeadEffects({
      stories: [{ ref: 'x', title: 'login FORM' }],
      assign: [
        { card: 'S-1', to: 'ghost' }, { card: 'S-1', to: 'cos' }, { card: 'S-2', to: 'reviewer' },
        { card: 'S-3', to: 'reviewer' }, { card: 'S-99', to: 'dev' },
      ],
      next: 'review',
    }, stories, roster);
    expect(effects.propose).toEqual([]);
    expect(effects.assignNow).toEqual([]);
    expect(effects.refused).toHaveLength(6);
    expect(effects.next).toBe('review');
  });
});

describe('LeadGuard', () => {
  it('runs one lead at a time per epic and gathers wakes that arrive meanwhile', () => {
    const g = new LeadGuard();
    expect(g.request('E-1')).toBe('run');
    expect(g.request('E-1', 'S-1 finished')).toBe('queued');
    expect(g.request('E-1', 'S-2 finished')).toBe('queued');
    expect(g.finish('E-1', true)).toBe(true);
    expect(g.request('E-1')).toBe('run');
    expect(g.takeUpdates('E-1')).toEqual(['S-1 finished', 'S-2 finished']);
    expect(g.finish('E-1', true)).toBe(false);
  });

  it('stops a lead that does nothing twice in a row, until the user steps in', () => {
    const g = new LeadGuard();
    g.request('E-1'); g.finish('E-1', false);
    g.request('E-1'); g.finish('E-1', false);
    expect(g.request('E-1')).toBe('idle');
    g.reset('E-1');
    expect(g.request('E-1')).toBe('run');
  });

  it('caps lead runs per epic', () => {
    const g = new LeadGuard();
    for (let i = 0; i < MAX_LEAD_RUNS_PER_EPIC; i++) { expect(g.request('E-1')).toBe('run'); g.finish('E-1', true); }
    expect(g.request('E-1')).toBe('limit');
    expect(g.request('E-2')).toBe('run');
  });
});
