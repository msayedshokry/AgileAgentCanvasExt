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

/** Board events an autopilot can run on (docs/plans/2026-11-26-agent-board-live.md, L5). */
export const TRIGGER_EVENTS = ['card.done', 'card.stopped', 'card.needs-answer', 'pr.merged', 'pr.checks-failed', 'goal.approved'] as const;
export type TriggerEvent = typeof TRIGGER_EVENTS[number];

export interface AutopilotTrigger {
  readonly event: TriggerEvent;
  /** Only for cards in this epic. */
  readonly epic?: string;
}

export interface Autopilot {
  readonly id: string;
  readonly name: string;
  /** Cron schedule; an autopilot has a schedule, an `on` trigger, or both. */
  readonly schedule?: string;
  readonly on?: AutopilotTrigger;
  readonly runbook: string;
  readonly enabled: boolean;
}

export interface ParsedAutopilot extends Autopilot {
  readonly cron?: CronSchedule;
}

/** Something that happened on the board, for `on` triggers. */
export interface BoardEvent {
  readonly event: TriggerEvent;
  readonly cardId?: string;
  readonly epicId?: string;
  readonly title?: string;
  readonly detail?: string;
}

/** Enabled autopilots whose `on` trigger matches this event. */
export function triggeredAutopilots(autopilots: readonly ParsedAutopilot[], evt: BoardEvent): ParsedAutopilot[] {
  return autopilots.filter((a) => a.enabled && a.on?.event === evt.event && (!a.on.epic || a.on.epic === evt.epicId));
}

/** What the run is told about the event that started it. */
export function describeEvent(evt: BoardEvent): string {
  const card = evt.cardId ? ` ${evt.cardId}${evt.title ? ` "${evt.title}"` : ''}` : '';
  const epic = evt.epicId && evt.epicId !== evt.cardId ? ` (epic ${evt.epicId})` : '';
  return `## What happened\n${evt.event}:${card}${epic}${evt.detail ? `\n${evt.detail}` : ''}\n`;
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
    let on: AutopilotTrigger | undefined;
    if (e.on !== undefined) {
      const onRaw = (e.on && typeof e.on === 'object' ? e.on : {}) as Record<string, unknown>;
      const event = onRaw.event;
      if (typeof event !== 'string' || !(TRIGGER_EVENTS as readonly string[]).includes(event)) {
        return void errors.push(`${id}: "on.event" must be one of ${TRIGGER_EVENTS.join(', ')}`);
      }
      const epic = str(onRaw.epic);
      on = { event: event as TriggerEvent, ...(epic ? { epic } : {}) };
    }
    if (!schedule && !on) return void errors.push(`${id}: needs a "schedule" (cron, e.g. "0 9 * * 1-5") or an "on" trigger (e.g. {"event": "card.done"})`);
    if (!runbook) return void errors.push(`${id}: "runbook" is required — the instructions the agent follows`);
    if (runbook.length > MAX_RUNBOOK_CHARS) return void errors.push(`${id}: "runbook" is longer than ${MAX_RUNBOOK_CHARS} characters`);
    let cron: CronSchedule | undefined;
    if (schedule) {
      try {
        cron = parseCron(schedule);
      } catch (err) {
        return void errors.push(`${id}: schedule "${schedule}": ${(err as Error).message}`);
      }
    }
    seen.add(id);
    autopilots.push({
      id, name: str(e.name) ?? id, runbook, enabled: e.enabled !== false,
      ...(schedule && cron ? { schedule, cron } : {}), ...(on ? { on } : {}),
    });
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
  return autopilots.filter((a) => a.enabled && !!a.cron && lastFired.get(a.id) !== key && cronMatches(a.cron, now));
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
