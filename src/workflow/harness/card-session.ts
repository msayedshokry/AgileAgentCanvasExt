// ─── Per-card agent sessions ─────────────────────────────────────────────────
// A card that comes back for rework (review asked for changes, a failed
// verify) resumes the agent conversation it had last time, so the agent keeps
// what it learned instead of re-reading the whole project.
//
// A session is only resumed when resuming is safe. Any run that ended without
// a real verdict (UNKNOWN: stuck, out of context, a rejected request, an agent
// that gave up) marks its session poisoned — resuming it would replay the same
// broken state — and the next run starts fresh. A different working directory
// also starts fresh: CLIs store sessions per project directory.
//
// Keyed by card + workflow + harness, so a reviewer never inherits the
// developer's conversation. Persisted as one small JSON file.

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export const CARD_SESSIONS_FILE = 'agent-card-sessions.json';
const MAX_RECORDS = 300;

export interface CardSessionRecord {
  readonly sessionId: string;
  readonly cwd: string;
  /** Why the session must not be resumed; absent when it is safe. */
  readonly poisoned?: string;
  readonly updatedAt: number;
}

export interface SessionPlan {
  readonly key: string;
  readonly sessionId: string;
  /** True: continue `sessionId`. False: start a new conversation with that id. */
  readonly resume: boolean;
  readonly cwd: string;
}

export function cardSessionKey(artifactId: string, workflowId: string, harness: string): string {
  return `${artifactId}|${workflowId}|${harness}`;
}

function normalizeDir(dir: string): string {
  return path.resolve(dir).replace(/\\/g, '/').toLowerCase();
}

/** Pure: what the next run on this card should do. */
export function planSession(
  key: string,
  previous: CardSessionRecord | undefined,
  cwd: string,
  newId: () => string = randomUUID,
): SessionPlan {
  const canResume = previous !== undefined
    && !previous.poisoned
    && normalizeDir(previous.cwd) === normalizeDir(cwd);
  return canResume
    ? { key, sessionId: previous.sessionId, resume: true, cwd }
    : { key, sessionId: newId(), resume: false, cwd };
}

/** Pure: the record to keep after a run with `verdict` finished. */
export function recordAfterRun(plan: SessionPlan, verdict: string, summary: string | undefined, now: number): CardSessionRecord {
  const poisoned = verdict === 'UNKNOWN'
    ? `run ended without a verdict${summary ? `: ${summary.split('\n')[0].slice(0, 160)}` : ''}`
    : undefined;
  return { sessionId: plan.sessionId, cwd: plan.cwd, updatedAt: now, ...(poisoned ? { poisoned } : {}) };
}

/** File-backed store of the latest session per card key. */
export class CardSessionStore {
  constructor(private readonly file: string) {}

  static inFolder(outputFolder: string): CardSessionStore {
    return new CardSessionStore(path.join(outputFolder, CARD_SESSIONS_FILE));
  }

  private readAll(): Record<string, CardSessionRecord> {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, CardSessionRecord>) : {};
    } catch {
      return {};
    }
  }

  get(key: string): CardSessionRecord | undefined {
    const r = this.readAll()[key];
    return r && typeof r.sessionId === 'string' && typeof r.cwd === 'string' ? r : undefined;
  }

  set(key: string, record: CardSessionRecord): void {
    const entries = Object.entries({ ...this.readAll(), [key]: record })
      .sort(([, a], [, b]) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, MAX_RECORDS);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(entries), null, 2), 'utf-8');
  }
}
