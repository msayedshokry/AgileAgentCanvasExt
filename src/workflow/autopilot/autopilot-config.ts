// ─── Autopilot definitions ───────────────────────────────────────────────────
// Recurring agent work — a weekly dead-code audit, a daily sprint summary —
// defined in `<outputFolder>/autopilots.json`:
//
//   { "autopilots": [
//       { "id": "weekly-dead-code", "name": "Weekly dead-code audit",
//         "schedule": "0 9 * * 1", "enabled": true,
//         "runbook": "Find unused exports with knip and ..." } ] }
//
// The runbook is the agent's instructions for every run: goal, background,
// constraints, steps, and what counts as done. Schedules use 5-field cron in
// local time and only fire while VS Code is open.
// Pure: no vscode.

import { parseCron, cronMatches, minuteKey, type CronSchedule } from './cron';

export const AUTOPILOTS_FILE = 'autopilots.json';
const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const MAX_RUNBOOK_CHARS = 20_000;

export interface Autopilot {
  readonly id: string;
  readonly name: string;
  readonly schedule: string;
  readonly runbook: string;
  readonly enabled: boolean;
}

export interface ParsedAutopilot extends Autopilot {
  readonly cron: CronSchedule;
}

export interface AutopilotConfig {
  readonly autopilots: readonly ParsedAutopilot[];
  /** One readable problem per invalid entry; valid entries still load. */
  readonly errors: readonly string[];
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

export function parseAutopilotConfig(text: string): AutopilotConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { autopilots: [], errors: [`${AUTOPILOTS_FILE} is not valid JSON: ${(err as Error).message}`] };
  }
  const list = (raw as { autopilots?: unknown })?.autopilots;
  if (!Array.isArray(list)) return { autopilots: [], errors: [`${AUTOPILOTS_FILE} needs an "autopilots" array`] };

  const autopilots: ParsedAutopilot[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  list.forEach((entry: unknown, i) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    const label = str(e.id) ?? `entry ${i + 1}`;
    const id = str(e.id);
    const schedule = str(e.schedule);
    const runbook = str(e.runbook);
    if (!id || !ID_RE.test(id)) return void errors.push(`${label}: "id" must be lowercase letters, digits and dashes`);
    if (seen.has(id)) return void errors.push(`${id}: duplicate id`);
    if (!schedule) return void errors.push(`${id}: "schedule" is required (cron, e.g. "0 9 * * 1-5")`);
    if (!runbook) return void errors.push(`${id}: "runbook" is required — the instructions the agent follows`);
    if (runbook.length > MAX_RUNBOOK_CHARS) return void errors.push(`${id}: "runbook" is longer than ${MAX_RUNBOOK_CHARS} characters`);
    let cron: CronSchedule;
    try {
      cron = parseCron(schedule);
    } catch (err) {
      return void errors.push(`${id}: schedule "${schedule}": ${(err as Error).message}`);
    }
    seen.add(id);
    autopilots.push({ id, name: str(e.name) ?? id, schedule, runbook, enabled: e.enabled !== false, cron });
  });
  return { autopilots, errors };
}

/** Enabled autopilots whose schedule matches `now` and that have not run this minute. */
export function dueAutopilots(
  autopilots: readonly ParsedAutopilot[],
  now: Date,
  lastFired: ReadonlyMap<string, string>,
): ParsedAutopilot[] {
  const key = minuteKey(now);
  return autopilots.filter((a) => a.enabled && lastFired.get(a.id) !== key && cronMatches(a.cron, now));
}

/** The synthetic card an autopilot run works on; its id keys locks, history and verdicts. */
export function autopilotArtifact(a: Autopilot): { id: string; type: string; title: string } {
  return { id: `AUTOPILOT-${a.id}`, type: 'autopilot', title: a.name };
}

export const AUTOPILOT_TEMPLATE = JSON.stringify({
  autopilots: [{
    id: 'weekly-dead-code',
    name: 'Weekly dead-code audit',
    schedule: '0 9 * * 1',
    enabled: false,
    runbook: [
      'Goal: list code that is no longer used.',
      'Steps: run the project\'s unused-code check (for example `npx knip`), confirm each finding by searching for references, and write the confirmed list to `_terminal-output/dead-code-report.md`.',
      'Constraints: do not delete or edit source files.',
      'Done when: the report exists. Verdict COMPLETED; BLOCKED if the check cannot run.',
    ].join('\n'),
  }],
}, null, 2) + '\n';
