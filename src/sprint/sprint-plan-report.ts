// ─── Sprint plan reports ─────────────────────────────────────────────────────
// Status summary and structural validation over an already-parsed
// sprint-status document. Pure: callers load the YAML and pass plain data.

import {
  ACTION_STATUSES, EntryKind, KeyStatus, LegacyMapping, STALE_DAYS_DEFAULT,
  classifyKey, compareStoryKeys, isLegalStatus, normalizeStatus, parseStamp,
} from './sprint-plan-core';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Recommendation {
  readonly skill: string;
  readonly story_key: string | null;
  readonly reason: string;
}

export interface StatusSummary {
  stories: Record<string, number>;
  epics: Record<string, number>;
  retrospectives: Record<string, number>;
  legacy_mapped: LegacyMapping[];
  illegal: KeyStatus[];
  unrecognized: KeyStatus[];
  open_action_items: Record<string, unknown>[];
  risks: string[];
  warnings: string[];
  recommendation: Recommendation | null;
  all_done: boolean;
}

type Doc = Readonly<Record<string, unknown>>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function openActionItems(items: unknown, warnings: string[]): Record<string, unknown>[] {
  const open: Record<string, unknown>[] = [];
  (Array.isArray(items) ? items : []).forEach((item, i) => {
    if (!isRecord(item)) {
      warnings.push(`action_items[${i}] is not a mapping and was skipped: ${JSON.stringify(item)}`);
      return;
    }
    const status = item.status;
    if (!(ACTION_STATUSES as readonly unknown[]).includes(status)) {
      warnings.push(`action_items[${i}] has a missing or unknown status (${JSON.stringify(status ?? null)})`);
      return;
    }
    if (status === 'open' || status === 'in-progress') {
      open.push({ epic: item.epic ?? null, action: item.action ?? null, owner: item.owner ?? null, status });
    }
  });
  return open;
}

/** Next skill to run, in priority order: resume, review, start ready, start backlog, retro. */
function recommend(byStatus: Map<string, string[]>, retroStatus: Map<number, string>): Recommendation | null {
  const first = (s: string) => byStatus.get(s)?.[0];
  const inProgress = first('in-progress');
  if (inProgress) return { skill: 'aac-dev-story', story_key: inProgress, reason: 'resume the in-progress story' };
  const review = first('review');
  if (review) return { skill: 'aac-code-review', story_key: review, reason: 'review the completed implementation' };
  const ready = first('ready-for-dev');
  if (ready) return { skill: 'aac-dev-story', story_key: ready, reason: 'start the next ready story' };
  const backlog = first('backlog');
  if (backlog) return { skill: 'aac-create-story', story_key: backlog, reason: 'create the first backlog story' };
  const openRetros = [...retroStatus].filter(([, s]) => s === 'optional').map(([n]) => n).sort((a, b) => a - b);
  if (openRetros.length) {
    return { skill: 'aac-retrospective', story_key: null, reason: `all stories done — epic-${openRetros[0]}-retrospective is still open` };
  }
  return null;
}

/** Counts, risks, open action items and the next recommended action. */
export function summarizeStatus(data: Doc, date?: string, staleDays = STALE_DAYS_DEFAULT): StatusSummary {
  const dev = isRecord(data.development_status) ? data.development_status : {};
  const warnings: string[] = [];
  const counts: Record<EntryKind, Record<string, number>> = { story: {}, epic: {}, retro: {} };
  const byStatus = new Map<string, string[]>();
  const legacy: LegacyMapping[] = [];
  const illegal: KeyStatus[] = [];
  const unrecognized: KeyStatus[] = [];
  const epicNums = new Set<number>();
  const storyEpicNums = new Set<number>();
  const epicStatus = new Map<number, string>();
  const retroStatus = new Map<number, string>();

  for (const [key, raw] of Object.entries(dev)) {
    const parsed = classifyKey(key);
    if (!parsed) { unrecognized.push({ key, status: raw }); continue; }
    const { status, wasLegacy } = normalizeStatus(raw);
    if (wasLegacy) legacy.push({ key, from: String(raw), to: String(status) });
    if (!isLegalStatus(parsed.kind, status)) { illegal.push({ key, status: raw }); continue; }
    counts[parsed.kind][status] = (counts[parsed.kind][status] ?? 0) + 1;
    if (parsed.kind === 'story') {
      byStatus.set(status, [...(byStatus.get(status) ?? []), key]);
      storyEpicNums.add(parsed.epicNum);
    } else if (parsed.kind === 'epic') {
      epicNums.add(parsed.epicNum);
      epicStatus.set(parsed.epicNum, status);
    } else {
      retroStatus.set(parsed.epicNum, status);
    }
  }
  for (const keys of byStatus.values()) keys.sort(compareStoryKeys);

  const risks: string[] = [];
  const stamp = data.last_updated ?? data.generated;
  if (date && stamp !== undefined && stamp !== null) {
    const now = parseStamp(date);
    const then = parseStamp(stamp);
    if (!now || !then) {
      warnings.push(`timestamp format not recognized (--date ${JSON.stringify(date)}, file ${JSON.stringify(String(stamp))}); staleness check skipped`);
    } else if (now.getTime() - then.getTime() > staleDays * DAY_MS) {
      risks.push(`sprint-status.yaml may be stale (last updated ${String(stamp)})`);
    }
  }
  for (const keys of byStatus.values()) {
    for (const key of keys) {
      const num = classifyKey(key)?.epicNum;
      if (num !== undefined && !epicNums.has(num)) risks.push(`orphaned story '${key}' has no epic-${num} entry`);
    }
  }
  for (const [num, status] of epicStatus) {
    if (status === 'in-progress' && !storyEpicNums.has(num)) risks.push(`in-progress epic 'epic-${num}' has no stories`);
  }
  const inReview = byStatus.get('review')?.length ?? 0;
  if (inReview) risks.push(`${inReview} story(ies) in review — run aac-code-review`);
  if (unrecognized.length) risks.push(`${unrecognized.length} unrecognized key(s) in development_status — run validate`);

  const openItems = openActionItems(data.action_items, warnings);
  const recommendation = recommend(byStatus, retroStatus);
  return {
    stories: counts.story, epics: counts.epic, retrospectives: counts.retro,
    legacy_mapped: legacy, illegal, unrecognized, open_action_items: openItems,
    risks, warnings, recommendation, all_done: recommendation === null,
  };
}

/** Structural problems in a parsed document; empty when valid. */
export function validateDoc(data: unknown): { problems: string[]; legacy_mapped: LegacyMapping[] } {
  const problems: string[] = [];
  const legacy: LegacyMapping[] = [];
  if (!isRecord(data)) {
    problems.push(`top level is not a mapping (got ${Array.isArray(data) ? 'list' : typeof data})`);
    return { problems, legacy_mapped: legacy };
  }
  for (const field of ['generated', 'last_updated', 'project', 'development_status']) {
    if (data[field] === undefined || data[field] === null) problems.push(`missing required key '${field}'`);
  }
  for (const field of ['generated', 'last_updated']) {
    const value = data[field];
    if (value !== undefined && value !== null && !parseStamp(value)) {
      problems.push(`'${field}' timestamp ${JSON.stringify(String(value))} is not MM-DD-YYYY HH:MM or YYYY-MM-DD[ HH:MM]`);
    }
  }
  const dev = data.development_status;
  if (dev !== undefined && dev !== null && !isRecord(dev)) {
    problems.push('development_status is not a mapping');
  } else if (isRecord(dev)) {
    if (Object.keys(dev).length === 0) problems.push('development_status is empty');
    for (const [key, raw] of Object.entries(dev)) {
      const parsed = classifyKey(key);
      if (!parsed) {
        problems.push(`unrecognized key '${key}' (expected epic-N, N-M-slug, or epic-N-retrospective)`);
        continue;
      }
      const { status, wasLegacy } = normalizeStatus(raw);
      if (wasLegacy) legacy.push({ key, from: String(raw), to: String(status) });
      if (!isLegalStatus(parsed.kind, status)) problems.push(`illegal ${parsed.kind} status ${JSON.stringify(raw)} on '${key}'`);
    }
  }
  const items = data.action_items;
  if (items !== undefined && items !== null) {
    if (!Array.isArray(items)) problems.push('action_items is not a list');
    else items.forEach((item, i) => {
      if (!isRecord(item)) problems.push(`action_items[${i}] is not a mapping`);
      else if (!(ACTION_STATUSES as readonly unknown[]).includes(item.status)) {
        problems.push(`action_items[${i}] has a missing or unknown status (${JSON.stringify(item.status ?? null)})`);
      }
    });
  }
  return { problems, legacy_mapped: legacy };
}
