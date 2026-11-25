import { describe, it, expect } from 'vitest';
import { memberBrief, parseRouting, parseGateVerdict, renderHandoffNotes, nextQueue, type SquadMember } from './squad-protocol';

const team: SquadMember[] = [
  { role: 'coordinator', personaId: 'pm', order: 1 },
  { role: 'researcher', personaId: 'analyst', order: 2 },
  { role: 'crafter', personaId: 'dev', order: 3 },
  { role: 'gate', personaId: 'architect', order: 4 },
];
const rest = team.slice(1);

describe('memberBrief', () => {
  it('names the member, the roster and its closing duty', () => {
    const brief = memberBrief(team, 'gate');
    expect(brief).toContain('You are the gate');
    expect(brief).toContain('- gate (you): reviews the result');
    expect(brief).toContain('- crafter: does the work');
    expect(brief).toContain('VERDICT: APPROVED');
  });
});

describe('parseRouting', () => {
  const roles = rest.map((m) => m.role);

  it('reads the roles the coordinator asked for, ignoring unknown ones', () => {
    expect(parseRouting('Plan...\nNEXT: crafter, gate, designer\nbecause small', roles)).toEqual(['crafter', 'gate']);
    expect(parseRouting('**Next:** gate', roles)).toEqual(['gate']);
  });

  it('is undefined without a usable NEXT line', () => {
    expect(parseRouting('just a plan', roles)).toBeUndefined();
    expect(parseRouting('NEXT: designer', roles)).toBeUndefined();
  });
});

describe('parseGateVerdict', () => {
  it.each([
    ['Looks good.\nVERDICT: APPROVED', 'approved'],
    ['**Verdict:** changes requested\n- add tests', 'changes-requested'],
    ['VERDICT: NEEDS_FIXES', 'changes-requested'],
    ['VERDICT: CHANGES_REQUESTED\n...\nVERDICT: APPROVED', 'approved'],
    ['no verdict here', 'unknown'],
  ])('%s → %s', (text, verdict) => {
    expect(parseGateVerdict(text)).toBe(verdict);
  });
});

describe('renderHandoffNotes', () => {
  it('renders notes in order and skips empty ones', () => {
    const text = renderHandoffNotes([{ role: 'coordinator', text: 'plan A' }, { role: 'crafter', text: '  ' }, { role: 'researcher', text: 'facts' }]);
    expect(text).toBe('## Handoff notes\n### From the coordinator\nplan A\n\n### From the researcher\nfacts');
  });

  it('bounds each note and keeps the newest notes when over budget', () => {
    const big = 'x'.repeat(5000);
    const text = renderHandoffNotes([
      { role: 'coordinator', text: 'oldest' }, { role: 'researcher', text: big },
      { role: 'crafter', text: big }, { role: 'gate', text: big },
    ]);
    expect(text).not.toContain('oldest');
    expect(text).toContain('### From the gate');
    expect(text.length).toBeLessThan(6500);
  });

  it('is empty when there is nothing to hand off', () => {
    expect(renderHandoffNotes([])).toBe('');
  });
});

describe('nextQueue', () => {
  it('limits the remaining members to the coordinator\'s routing and says who was skipped', () => {
    const r = nextQueue('coordinator', 'NEXT: crafter, gate', rest, team, 0);
    expect(r.queue.map((m) => m.role)).toEqual(['crafter', 'gate']);
    expect(r.note).toBe('coordinator skipped: researcher');
  });

  it('keeps everyone when the coordinator gave no routing', () => {
    expect(nextQueue('coordinator', 'a plan', rest, team, 0).queue).toEqual(rest);
  });

  it('sends changes back to the crafter once, then lets it end', () => {
    const first = nextQueue('gate', 'VERDICT: CHANGES_REQUESTED', [], team, 0);
    expect(first.queue.map((m) => m.role)).toEqual(['crafter', 'gate']);
    expect(first.rework).toBe(true);
    expect(nextQueue('gate', 'VERDICT: CHANGES_REQUESTED', [], team, 1).queue).toEqual([]);
  });

  it('ends after an approving gate', () => {
    expect(nextQueue('gate', 'VERDICT: APPROVED', [], team, 0).queue).toEqual([]);
  });
});
