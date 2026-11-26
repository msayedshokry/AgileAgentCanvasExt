// ─── PR events for autopilot triggers ────────────────────────────────────────
// (docs/plans/2026-11-26-agent-board-live.md, L5.) Cards the board touched
// this session are polled for their PR every few minutes (through the `gh`
// check that already exists, harness/pull-request.ts). An event fires on a
// change, not a state: a PR that becomes merged, or checks that start
// failing. The transition rule is pure; the poller takes the fetch as a
// dependency.

export interface PrSnapshot {
  readonly state: string;
  readonly failing: readonly string[];
}

export type PrEvent = { readonly event: 'pr.merged' } | { readonly event: 'pr.checks-failed'; readonly checks: readonly string[] };

/** Events between two looks at the same card's PR. The first look only sets the baseline. */
export function prTransitions(prev: PrSnapshot | undefined, now: PrSnapshot): PrEvent[] {
  if (!prev) return [];
  const events: PrEvent[] = [];
  if (prev.state !== 'MERGED' && now.state === 'MERGED') events.push({ event: 'pr.merged' });
  const newlyFailing = now.failing.filter((c) => !prev.failing.includes(c));
  if (newlyFailing.length) events.push({ event: 'pr.checks-failed', checks: newlyFailing });
  return events;
}

export const PR_POLL_MS = 5 * 60_000;
const WATCH_FOR_MS = 7 * 24 * 60 * 60_000;

export class PrWatcher {
  private readonly watched = new Map<string, { since: number; last?: PrSnapshot }>();

  constructor(
    private readonly fetchPr: (cardId: string) => Promise<PrSnapshot | undefined>,
    private readonly emit: (cardId: string, evt: PrEvent) => void,
  ) {}

  /** Start (or keep) watching a card's PR. */
  watch(cardId: string, now = Date.now()): void {
    if (!this.watched.has(cardId)) this.watched.set(cardId, { since: now });
  }

  watching(): string[] {
    return [...this.watched.keys()];
  }

  /** One polling pass. A merged or closed PR, or a card watched for a week, stops being watched. */
  async poll(now = Date.now()): Promise<void> {
    for (const [cardId, entry] of [...this.watched]) {
      if (now - entry.since > WATCH_FOR_MS) { this.watched.delete(cardId); continue; }
      let snap: PrSnapshot | undefined;
      try {
        snap = await this.fetchPr(cardId);
      } catch {
        continue; // gh missing or offline: try next time
      }
      if (!snap) continue;
      for (const evt of prTransitions(entry.last, snap)) this.emit(cardId, evt);
      if (snap.state === 'MERGED' || snap.state === 'CLOSED') this.watched.delete(cardId);
      else entry.last = snap;
    }
  }
}
