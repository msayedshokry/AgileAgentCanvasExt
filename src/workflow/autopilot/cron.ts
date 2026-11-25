// ─── Cron schedules ─────────────────────────────────────────────────────────
// Standard 5-field cron (minute hour day-of-month month day-of-week), matched
// against local time. Supports `*`, numbers, ranges `a-b`, lists `a,b` and
// steps `*/n` / `a-b/n`. Day-of-week 0 and 7 are both Sunday. As in classic
// cron, when both day fields are restricted a date matches either of them.
// Pure: no vscode, no timers.

interface Field {
  readonly min: number;
  readonly max: number;
}

const FIELDS: readonly Field[] = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 7 },  // day of week
];
const FIELD_NAMES = ['minute', 'hour', 'day of month', 'month', 'day of week'];

export interface CronSchedule {
  readonly sets: readonly ReadonlySet<number>[];
  /** Whether each day field was restricted (not `*`), for the either-day rule. */
  readonly domRestricted: boolean;
  readonly dowRestricted: boolean;
}

function parseField(text: string, field: Field, name: string): Set<number> {
  const out = new Set<number>();
  for (const part of text.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`Invalid ${name} "${part}"`);
    const step = m[2] !== undefined ? Number(m[2]) : 1;
    if (step < 1) throw new Error(`Invalid step in ${name} "${part}"`);
    let lo = field.min;
    let hi = field.max;
    if (m[1] !== '*') {
      const [a, b] = m[1].split('-').map(Number);
      lo = a;
      hi = b !== undefined ? b : (m[2] !== undefined ? field.max : a);
    }
    if (lo < field.min || hi > field.max || lo > hi) {
      throw new Error(`${name} "${part}" is outside ${field.min}-${field.max}`);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Parse a 5-field cron expression; throws with a readable message when invalid. */
export function parseCron(expr: string): CronSchedule {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Expected 5 fields (minute hour day month weekday), got ${parts.length}`);
  }
  const sets = parts.map((p, i) => parseField(p, FIELDS[i], FIELD_NAMES[i]));
  if (sets[4].has(7)) sets[4].add(0);
  return { sets, domRestricted: parts[2] !== '*', dowRestricted: parts[4] !== '*' };
}

export function cronMatches(schedule: CronSchedule, date: Date): boolean {
  const [min, hour, dom, month, dow] = schedule.sets;
  if (!min.has(date.getMinutes()) || !hour.has(date.getHours()) || !month.has(date.getMonth() + 1)) return false;
  const domOk = dom.has(date.getDate());
  const dowOk = dow.has(date.getDay());
  if (schedule.domRestricted && schedule.dowRestricted) return domOk || dowOk;
  return domOk && dowOk;
}

/** The next `count` matching minutes after `from` (searches up to a year ahead). */
export function nextRuns(schedule: CronSchedule, from: Date, count: number): Date[] {
  const out: Date[] = [];
  const t = new Date(from.getTime());
  t.setSeconds(0, 0);
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit && out.length < count; i++) {
    t.setMinutes(t.getMinutes() + 1);
    if (cronMatches(schedule, t)) out.push(new Date(t.getTime()));
  }
  return out;
}

/** Local-time minute key ("2026-11-25T09:00"), used to run each schedule once per minute. */
export function minuteKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
