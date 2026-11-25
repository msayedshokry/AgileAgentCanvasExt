import { describe, it, expect } from 'vitest';
import { parseCron, cronMatches, nextRuns, minuteKey } from './cron';

// Local-time dates: 2026-11-25 is a Wednesday.
const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi);

describe('parseCron', () => {
  it.each([
    ['0 9 * * 1-5'],
    ['*/30 * * * *'],
    ['0 3 * * *'],
    ['15,45 8-18/2 1 1,6 0'],
    ['0 0 * * 7'],
  ])('accepts %s', (expr) => {
    expect(() => parseCron(expr)).not.toThrow();
  });

  it.each([
    ['* * * *', /5 fields/],
    ['60 * * * *', /minute "60" is outside 0-59/],
    ['* 24 * * *', /hour/],
    ['* * 0 * *', /day of month/],
    ['*/0 * * * *', /step/],
    ['a * * * *', /Invalid minute/],
    ['5-1 * * * *', /outside/],
  ])('rejects %s', (expr, message) => {
    expect(() => parseCron(expr)).toThrow(message);
  });
});

describe('cronMatches', () => {
  it('matches weekdays at 9:00 only', () => {
    const s = parseCron('0 9 * * 1-5');
    expect(cronMatches(s, at(2026, 11, 25, 9, 0))).toBe(true);   // Wednesday
    expect(cronMatches(s, at(2026, 11, 25, 9, 1))).toBe(false);
    expect(cronMatches(s, at(2026, 11, 29, 9, 0))).toBe(false);  // Sunday
  });

  it('treats 7 as Sunday', () => {
    expect(cronMatches(parseCron('0 0 * * 7'), at(2026, 11, 29, 0, 0))).toBe(true);
  });

  it('matches either day field when both are restricted', () => {
    const s = parseCron('0 0 1 * 3'); // the 1st, or any Wednesday
    expect(cronMatches(s, at(2026, 11, 25, 0, 0))).toBe(true);  // Wednesday
    expect(cronMatches(s, at(2026, 12, 1, 0, 0))).toBe(true);   // the 1st (Tuesday)
    expect(cronMatches(s, at(2026, 11, 26, 0, 0))).toBe(false);
  });
});

describe('nextRuns', () => {
  it('lists the next matching minutes after the given time', () => {
    const runs = nextRuns(parseCron('*/30 * * * *'), at(2026, 11, 25, 9, 10), 3);
    expect(runs.map(minuteKey)).toEqual(['2026-11-25T09:30', '2026-11-25T10:00', '2026-11-25T10:30']);
  });
});
