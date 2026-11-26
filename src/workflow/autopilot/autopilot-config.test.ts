import { describe, it, expect } from 'vitest';
import { parseAutopilotConfig, dueAutopilots, autopilotArtifact, describeEvent, triggeredAutopilots, AUTOPILOT_TEMPLATE } from './autopilot-config';

const entry = (over: Record<string, unknown> = {}) => ({ id: 'daily', schedule: '0 9 * * *', runbook: 'Summarise the sprint', ...over });
const config = (...entries: unknown[]) => JSON.stringify({ autopilots: entries });

describe('parseAutopilotConfig', () => {
  it('loads a valid entry with defaults for name and enabled', () => {
    const { autopilots, errors } = parseAutopilotConfig(config(entry()));
    expect(errors).toEqual([]);
    expect(autopilots[0]).toMatchObject({ id: 'daily', name: 'daily', enabled: true });
  });

  it('keeps valid entries and reports each invalid one', () => {
    const { autopilots, errors } = parseAutopilotConfig(config(
      entry(),
      entry({ id: 'Bad Id' }),
      entry({ id: 'daily' }),
      entry({ id: 'no-book', runbook: ' ' }),
      entry({ id: 'bad-cron', schedule: '61 * * * *' }),
    ));
    expect(autopilots.map((a) => a.id)).toEqual(['daily']);
    expect(errors).toEqual([
      expect.stringContaining('lowercase letters'),
      'daily: duplicate id',
      expect.stringContaining('"runbook" is required'),
      expect.stringContaining('bad-cron: schedule "61 * * * *"'),
    ]);
  });

  it('reports a file that is not JSON or has no list', () => {
    expect(parseAutopilotConfig('{').errors[0]).toMatch(/not valid JSON/);
    expect(parseAutopilotConfig('{}').errors[0]).toMatch(/"autopilots" array/);
  });

  it('ships a template that parses, disabled by default', () => {
    const { autopilots, errors } = parseAutopilotConfig(AUTOPILOT_TEMPLATE);
    expect(errors).toEqual([]);
    expect(autopilots[0].enabled).toBe(false);
  });
});

describe('dueAutopilots', () => {
  const { autopilots } = parseAutopilotConfig(config(entry(), entry({ id: 'off', enabled: false }), entry({ id: 'later', schedule: '0 10 * * *' })));
  const nine = new Date(2026, 10, 25, 9, 0, 20);

  it('returns enabled autopilots due this minute', () => {
    expect(dueAutopilots(autopilots, nine, new Map()).map((a) => a.id)).toEqual(['daily']);
  });

  it('fires each autopilot once per minute', () => {
    expect(dueAutopilots(autopilots, nine, new Map([['daily', '2026-11-25T09:00']]))).toEqual([]);
  });
});

describe('autopilotArtifact', () => {
  it('gives each autopilot its own card id', () => {
    expect(autopilotArtifact({ id: 'daily', name: 'Daily', schedule: '', runbook: '', enabled: true }))
      .toEqual({ id: 'AUTOPILOT-daily', type: 'autopilot', title: 'Daily' });
  });
});

describe('event triggers', () => {
  it('accepts an autopilot with only an "on" trigger and rejects unknown events', () => {
    const { autopilots, errors } = parseAutopilotConfig(config(
      entry({ id: 'review', schedule: undefined, on: { event: 'card.done', epic: 'EPIC-1' } }),
      entry({ id: 'bad', schedule: undefined, on: { event: 'card.exploded' } }),
      entry({ id: 'none', schedule: undefined }),
    ));
    expect(autopilots.map((a) => a.id)).toEqual(['review']);
    expect(autopilots[0].cron).toBeUndefined();
    expect(errors[0]).toMatch(/^bad: "on.event" must be one of/);
    expect(errors[1]).toMatch(/^none: needs a "schedule"/);
  });

  it('matches enabled autopilots by event and epic, and never schedules trigger-only ones', () => {
    const { autopilots } = parseAutopilotConfig(config(
      entry({ id: 'any', schedule: undefined, on: { event: 'card.done' } }),
      entry({ id: 'epic', schedule: undefined, on: { event: 'card.done', epic: 'EPIC-1' } }),
      entry({ id: 'off', schedule: undefined, on: { event: 'card.done' }, enabled: false }),
    ));
    const ids = (epicId?: string) => triggeredAutopilots(autopilots, { event: 'card.done', cardId: 'S-1', epicId }).map((a) => a.id);
    expect(ids('EPIC-1')).toEqual(['any', 'epic']);
    expect(ids('EPIC-2')).toEqual(['any']);
    expect(triggeredAutopilots(autopilots, { event: 'pr.merged' })).toEqual([]);
    expect(dueAutopilots(autopilots, new Date(2026, 10, 25, 9, 0), new Map())).toEqual([]);
  });

  it('tells the run what happened', () => {
    expect(describeEvent({ event: 'card.stopped', cardId: 'S-1', title: 'Login', epicId: 'EPIC-1', detail: 'Timed out' }))
      .toBe('## What happened\ncard.stopped: S-1 "Login" (epic EPIC-1)\nTimed out\n');
  });
});
