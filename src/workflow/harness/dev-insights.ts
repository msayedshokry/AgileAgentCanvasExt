// ─── Engineering metrics, release notes, story ↔ code mapping ───────────────
// Pure functions over data the extension already records: the run history
// (agent-run-history.jsonl), the artifact store, and agent commit subjects
// ("agent: <workflow> completed <story>").

import type { RunHistoryEntry } from './run-history';

// ── Engineering metrics ──────────────────────────────────────────────────────

export interface HarnessStats { harness: string; runs: number; succeeded: number; successRate: number; avgDurationMs: number }
export interface StoryStats { artifactId: string; runs: number; fixCycles: number; leadTimeMs?: number; done: boolean }
export interface EngineeringMetrics {
  since: number;
  totalRuns: number;
  successRate: number;
  harnesses: HarnessStats[];
  stories: StoryStats[];
  medianLeadTimeMs?: number;
  /** Stops by reason (verdict) to show where runs fail. */
  failures: Record<string, number>;
}

const SUCCESS = new Set(['COMPLETED', 'APPROVED']);

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function computeMetrics(history: readonly RunHistoryEntry[], since = 0): EngineeringMetrics {
  const runs = history.filter((e) => e.finishedAt >= since && e.harness !== 'none');
  const byHarness = new Map<string, RunHistoryEntry[]>();
  const byStory = new Map<string, RunHistoryEntry[]>();
  const failures: Record<string, number> = {};
  for (const e of runs) {
    byHarness.set(e.harness, [...(byHarness.get(e.harness) ?? []), e]);
    byStory.set(e.artifactId, [...(byStory.get(e.artifactId) ?? []), e]);
    if (!SUCCESS.has(e.verdict)) failures[e.verdict] = (failures[e.verdict] ?? 0) + 1;
  }
  const harnesses = [...byHarness.entries()].map(([harness, list]) => {
    const succeeded = list.filter((e) => SUCCESS.has(e.verdict)).length;
    return {
      harness,
      runs: list.length,
      succeeded,
      successRate: succeeded / list.length,
      avgDurationMs: list.reduce((s, e) => s + (e.finishedAt - e.startedAt), 0) / list.length,
    };
  }).sort((a, b) => b.runs - a.runs);
  const stories = [...byStory.entries()].map(([artifactId, list]) => {
    const ordered = [...list].sort((a, b) => a.startedAt - b.startedAt);
    const approved = ordered.find((e) => e.verdict === 'APPROVED');
    return {
      artifactId,
      runs: list.length,
      fixCycles: list.filter((e) => e.verdict === 'NEEDS_FIXES').length,
      leadTimeMs: approved ? approved.finishedAt - ordered[0].startedAt : undefined,
      done: !!approved,
    };
  }).sort((a, b) => b.runs - a.runs);
  const succeeded = runs.filter((e) => SUCCESS.has(e.verdict)).length;
  return {
    since,
    totalRuns: runs.length,
    successRate: runs.length ? succeeded / runs.length : 0,
    harnesses,
    stories,
    medianLeadTimeMs: median(stories.map((s) => s.leadTimeMs).filter((x): x is number => x !== undefined)),
    failures,
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  const m = Math.round(ms / 60000);
  if (m < 1) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (m < 120) return `${m}m`;
  return `${(m / 60).toFixed(1)}h`;
}

export function renderMetricsMarkdown(m: EngineeringMetrics, costByStory: Map<string, number> = new Map()): string {
  const lines = [
    '# Engineering metrics',
    '',
    `Since ${m.since ? new Date(m.since).toLocaleDateString() : 'the first recorded run'} · ${m.totalRuns} agent runs · ${pct(m.successRate)} succeeded · median lead time ${formatDuration(m.medianLeadTimeMs)}`,
    '',
    '## By agent',
    '',
    '| Agent | Runs | Succeeded | Avg duration |',
    '|---|---:|---:|---:|',
    ...m.harnesses.map((h) => `| ${h.harness} | ${h.runs} | ${pct(h.successRate)} | ${formatDuration(h.avgDurationMs)} |`),
    '',
    '## Where runs stop',
    '',
    ...(Object.keys(m.failures).length
      ? Object.entries(m.failures).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- **${k}**: ${v}`)
      : ['_No failed runs._']),
    '',
    '## By story',
    '',
    '| Story | Runs | Fix cycles | Lead time | Cost |',
    '|---|---:|---:|---:|---:|',
    ...m.stories.map((s) => `| ${s.artifactId}${s.done ? ' ✓' : ''} | ${s.runs} | ${s.fixCycles} | ${formatDuration(s.leadTimeMs)} | ${costByStory.has(s.artifactId) ? `$${costByStory.get(s.artifactId)!.toFixed(2)}` : '—'} |`),
    '',
  ];
  return lines.join('\n');
}

// ── Release notes ────────────────────────────────────────────────────────────

export interface DoneStory { id: string; title: string; epicTitle?: string; description?: string; doneAt?: number }

export function renderReleaseNotes(stories: readonly DoneStory[], heading = 'Release notes'): string {
  if (stories.length === 0) return `# ${heading}\n\n_No stories were completed in this period._\n`;
  const byEpic = new Map<string, DoneStory[]>();
  for (const s of stories) byEpic.set(s.epicTitle ?? 'Other changes', [...(byEpic.get(s.epicTitle ?? 'Other changes') ?? []), s]);
  const lines = [`# ${heading}`, ''];
  for (const [epic, list] of byEpic) {
    lines.push(`## ${epic}`, '');
    for (const s of list) {
      const first = (s.description ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean);
      lines.push(`- **${s.title}** (${s.id})${first ? ` — ${first.slice(0, 160)}` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ── Story ↔ code ─────────────────────────────────────────────────────────────

const AGENT_SUBJECT = /^agent: \S+ completed (\S+)$/;

/** Story ids from agent commit subjects, most recent first, de-duplicated. */
export function storiesFromCommitSubjects(subjects: readonly string[]): string[] {
  const out: string[] = [];
  for (const s of subjects) {
    const m = s.trim().match(AGENT_SUBJECT);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}
