import { describe, it, expect } from 'vitest';
import { parseAutopilotConfig, dueAutopilots, autopilotArtifact, AUTOPILOT_TEMPLATE } from './autopilot-config';

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
