// ─── Sprint plan core ────────────────────────────────────────────────────────
// TypeScript port of upstream BMAD v6.12 `bmad-sprint-planning/scripts/sprint_plan.py`.
// Pure logic only (no file IO): epic parsing, key grammar, the never-downgrade
// status merge, the status summary and structural validation. The LLM decides
// *which* files are epics; everything after that decision is deterministic.

import { createHash } from 'crypto';

export type EntryKind = 'epic' | 'story' | 'retro';

export interface PlanEntry {
  readonly key: string;
  readonly kind: EntryKind;
  readonly epicNum: number;
}

export interface EpicSource {
  readonly path: string;
  readonly text: string;
}

export interface KeyStatus {
  readonly key: string;
  readonly status: unknown;
}

export interface LegacyMapping {
  readonly key: string;
  readonly from: string;
  readonly to: string;
}

const EPIC_RE = /^#{1,3}\s*Epic\s+(\d+)\s*:?\s*(.*?)\s*#*\s*$/i;
const STORY_RE = /^#{2,4}\s*Story\s+(\d+)\.(\d+[a-z]?)\s*:?\s*(.*?)\s*#*\s*$/i;
/** Heading lines that mention Epic/Story but failed the strict patterns above. */
const SUSPECT_RE = /^#{1,4}\s.*\b(?:epic|story)\b/i;
const FENCE_RE = /^\s{0,3}(?:```|~~~)/;

const EPIC_KEY_RE = /^epic-(\d+)$/;
const RETRO_KEY_RE = /^epic-(\d+)-retrospective$/;
const STORY_KEY_RE = /^(\d+)-(\d+)([a-z]?)-.+/;

const STORY_RANK: Record<string, number> = { backlog: 0, 'ready-for-dev': 1, 'in-progress': 2, review: 3, done: 4 };
const EPIC_RANK: Record<string, number> = { backlog: 0, 'in-progress': 1, done: 2 };
const RETRO_RANK: Record<string, number> = { optional: 0, done: 1 };
export const RANKS: Record<EntryKind, Record<string, number>> = { epic: EPIC_RANK, story: STORY_RANK, retro: RETRO_RANK };
export const ACTION_STATUSES = ['open', 'in-progress', 'done'] as const;

/** v6 statuses still found in the wild; normalized on every read, never reset. */
const LEGACY_STATUS: Record<string, string> = { drafted: 'ready-for-dev', contexted: 'in-progress' };

const DEFAULT_STATUS: Record<EntryKind, string> = { epic: 'backlog', story: 'backlog', retro: 'optional' };
export const STALE_DAYS_DEFAULT = 7;
const SLUG_MAX = 60;

/**
 * Kept identical (modulo the leading "# ") to the STATUS DEFINITIONS block in
 * resources/_aac/skills/aac-sprint-planning/sprint-status-template.yaml; a test
 * pins the two together.
 */
export const HEADER_COMMENT = `STATUS DEFINITIONS:
==================
Epic Status:
  - backlog: Epic not yet started
  - in-progress: Epic actively being worked on
  - done: All stories in epic completed

Story Status:
  - backlog: Story only exists in epic file
  - ready-for-dev: Story file created, ready for development
  - in-progress: Developer actively working on implementation
  - review: Implementation complete, ready for review
  - done: Story completed

Retrospective Status:
  - optional: Can be completed but not required
  - done: Retrospective has been completed

Action Item Status:
  - open: Committed during a retrospective, not yet addressed
  - in-progress: Actively being worked on
  - done: Completed

WORKFLOW NOTES:
===============
- Mark epic as 'in-progress' when starting work on its first story
- Developer typically creates next story ONLY after previous one is 'done' to incorporate learnings
- Dev moves story to 'review', then Dev runs code-review (fresh context, ideally different LLM)
- Retrospective appends its action items to action_items; the status view surfaces open ones
`;

/** Unicode-aware slug; a title with nothing sluggable gets a short content hash. */
export function slug(text: string): string {
  const base = text.toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, '-').replace(/^-+|-+$/g, '');
  const cut = Array.from(base).slice(0, SLUG_MAX).join('').replace(/^-+|-+$/g, '');
  return cut || createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 8);
}

/** Kind and epic number for a recognized key, else undefined. */
export function classifyKey(key: string): { kind: EntryKind; epicNum: number } | undefined {
  const retro = RETRO_KEY_RE.exec(key);
  if (retro) return { kind: 'retro', epicNum: Number(retro[1]) };
  const epic = EPIC_KEY_RE.exec(key);
  if (epic) return { kind: 'epic', epicNum: Number(epic[1]) };
  const story = STORY_KEY_RE.exec(key);
  if (story) return { kind: 'story', epicNum: Number(story[1]) };
  return undefined;
}

/** Sort comparator for story keys: epic, story number, split suffix, then key. */
export function compareStoryKeys(a: string, b: string): number {
  const rank = (key: string): [number, number, string] => {
    const m = STORY_KEY_RE.exec(key);
    return m ? [Number(m[1]), Number(m[2]), m[3]] : [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, ''];
  };
  const [ra, rb] = [rank(a), rank(b)];
  return ra[0] - rb[0] || ra[1] - rb[1] || ra[2].localeCompare(rb[2]) || a.localeCompare(b);
}

/** Map a raw status through the legacy vocabulary. */
export function normalizeStatus(raw: unknown): { status: unknown; wasLegacy: boolean } {
  if (typeof raw === 'string' && raw in LEGACY_STATUS) return { status: LEGACY_STATUS[raw], wasLegacy: true };
  return { status: raw, wasLegacy: false };
}

export function isLegalStatus(kind: EntryKind, status: unknown): status is string {
  return typeof status === 'string' && Object.prototype.hasOwnProperty.call(RANKS[kind], status);
}

/** Parse epic files into ordered entries (epic, its stories, its retrospective). */
export function parseEpics(sources: readonly EpicSource[]): { entries: PlanEntry[]; warnings: string[] } {
  const epics = new Map<number, string[]>();
  const warnings: string[] = [];
  for (const { path, text } of sources) {
    let inFence = false;
    text.split(/\r?\n/).forEach((line, i) => {
      if (FENCE_RE.test(line)) { inFence = !inFence; return; }
      if (inFence) return;
      const epic = EPIC_RE.exec(line);
      if (epic) {
        if (!epics.has(Number(epic[1]))) epics.set(Number(epic[1]), []);
        return;
      }
      const story = STORY_RE.exec(line);
      if (story) {
        const epicNum = Number(story[1]);
        const key = `${epicNum}-${story[2]}-${slug(story[3])}`;
        const stories = epics.get(epicNum) ?? [];
        epics.set(epicNum, stories);
        if (stories.includes(key)) warnings.push(`duplicate story heading '${key}' at ${path}:${i + 1}`);
        else stories.push(key);
        return;
      }
      if (SUSPECT_RE.test(line)) warnings.push(`unparsed Epic/Story-like heading at ${path}:${i + 1}: ${line.trim()}`);
    });
  }
  const entries: PlanEntry[] = [];
  for (const epicNum of [...epics.keys()].sort((a, b) => a - b)) {
    entries.push({ key: `epic-${epicNum}`, kind: 'epic', epicNum });
    for (const key of epics.get(epicNum) ?? []) entries.push({ key, kind: 'story', epicNum });
    entries.push({ key: `epic-${epicNum}-retrospective`, kind: 'retro', epicNum });
  }
  return { entries, warnings };
}

export interface MergeReport {
  newEntries: string[];
  preserved: number;
  changed: number;
  upgradedFromDisk: string[];
  droppedOrphans: KeyStatus[];
  legacyMapped: LegacyMapping[];
  illegal: KeyStatus[];
  inSync: boolean;
}

/**
 * Merge computed defaults with existing statuses, never downgrading.
 * `storyFiles` holds story file names (`<key>.md`) present on disk; a story
 * with a file is floored at ready-for-dev.
 */
export function buildStatus(
  entries: readonly PlanEntry[],
  existing: Readonly<Record<string, unknown>>,
  storyFiles: ReadonlySet<string>,
  warnings: string[],
): { status: Map<string, string>; report: MergeReport } {
  const report: MergeReport = {
    newEntries: [], preserved: 0, changed: 0, upgradedFromDisk: [],
    droppedOrphans: [], legacyMapped: [], illegal: [], inSync: false,
  };
  const status = new Map<string, string>();
  for (const { key, kind } of entries) {
    const computed = kind === 'story' && storyFiles.has(`${key}.md`) ? 'ready-for-dev' : DEFAULT_STATUS[kind];
    const has = Object.prototype.hasOwnProperty.call(existing, key);
    const raw = has ? existing[key] : undefined;
    let merged = computed;
    if (has && raw !== null && raw !== undefined) {
      const { status: normalized, wasLegacy } = normalizeStatus(raw);
      if (wasLegacy) report.legacyMapped.push({ key, from: String(raw), to: String(normalized) });
      if (!isLegalStatus(kind, normalized)) {
        warnings.push(`illegal status '${String(raw)}' on '${key}' replaced with '${computed}'`);
        report.illegal.push({ key, status: raw });
      } else if (RANKS[kind][normalized] >= RANKS[kind][computed]) {
        merged = normalized;
      }
    }
    if (!has) report.newEntries.push(key);
    else if (merged === normalizeStatus(raw).status) report.preserved++;
    else report.changed++;
    if (kind === 'story' && computed === 'ready-for-dev' && (raw === undefined || raw === null || raw === 'backlog')) {
      report.upgradedFromDisk.push(key);
    }
    status.set(key, merged);
  }
  const computedKeys = new Set(entries.map((e) => e.key));
  report.droppedOrphans = Object.keys(existing).filter((k) => !computedKeys.has(k)).map((k) => ({ key: k, status: existing[k] }));
  report.inSync = report.newEntries.length === 0 && report.droppedOrphans.length === 0
    && report.illegal.length === 0 && report.legacyMapped.length === 0 && report.changed === 0;
  return { status, report };
}

/** Accepts `MM-DD-YYYY HH:MM`, `YYYY-MM-DD HH:MM` and `YYYY-MM-DD`. */
export function parseStamp(value: unknown): Date | undefined {
  const s = String(value).trim();
  let m = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/.exec(s);
  if (m) return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5]));
  m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)));
  return undefined;
}
