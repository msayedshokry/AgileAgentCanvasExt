import { describe, it, expect } from 'vitest';
import { buildSprintHealth, formatStamp } from './sprint-health';

const NOW = new Date(2026, 10, 25, 9, 30);
const DOC = `generated: 2026-11-20 10:00
last_updated: 2026-11-24 10:00
project: P
development_status:
  epic-1: in-progress
  1-1-login: done
  1-2-signup: review
  epic-1-retrospective: optional
action_items:
  - epic: 1
    action: Add a lint rule for date parsing
    owner: Charlie
    status: open
  - epic: 1
    action: Old
    owner: Charlie
    status: done
`;

describe('buildSprintHealth', () => {
  it('summarises the next step, risks and open action items', () => {
    const health = buildSprintHealth(DOC, NOW);
    expect(health?.recommendation).toEqual({ skill: 'aac-code-review', story_key: '1-2-signup', reason: 'review the completed implementation' });
    expect(health?.allDone).toBe(false);
    expect(health?.risks).toEqual(['1 story(ies) in review — run aac-code-review']);
    expect(health?.openActionItems).toEqual([{ epic: 1, action: 'Add a lint rule for date parsing', owner: 'Charlie', status: 'open' }]);
  });

  it('flags a file that has not been updated for over a week', () => {
    const stale = DOC.replace('last_updated: 2026-11-24 10:00', 'last_updated: 2026-11-01 10:00');
    expect(buildSprintHealth(stale, NOW)?.risks.some((r) => r.includes('stale'))).toBe(true);
  });

  it('returns null for text that is not a sprint-status document', () => {
    expect(buildSprintHealth('development_status: [unclosed', NOW)).toBeNull();
    expect(buildSprintHealth('- a\n- b\n', NOW)).toBeNull();
    expect(buildSprintHealth('project: P\n', NOW)).toBeNull();
    expect(buildSprintHealth('development_status: {}\n', NOW)).toBeNull();
  });
});

describe('formatStamp', () => {
  it('formats local time as YYYY-MM-DD HH:MM', () => {
    expect(formatStamp(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05 07:03');
  });
});
