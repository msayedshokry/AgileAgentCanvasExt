// ─── Questions an agent waits on during its run ──────────────────────────────
// (docs/plans/2026-11-26-agent-board-live.md, L2.) `board_ask` holds the tool
// call until the user answers in the Inbox, up to a limit. An answer given
// while the agent waits goes straight back into that run; otherwise it starts
// a follow-up run as before. At most one wait per card. Pure apart from the
// timer, which is injectable.

export const ASK_WAIT_MS = 10 * 60_000;

type Timer = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
const REAL_TIMER: Timer = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

export class LiveQuestions {
  private readonly waiting = new Map<string, { resolve: (answer: string | undefined) => void; handle: unknown }>();

  constructor(private readonly timer: Timer = REAL_TIMER) {}

  /** True when an agent is waiting for an answer on this card. */
  isWaiting(cardId: string): boolean {
    return this.waiting.has(cardId);
  }

  /** Wait for the user's answer; resolves undefined after `waitMs`, or when another wait replaces this one. */
  ask(cardId: string, waitMs = ASK_WAIT_MS): Promise<string | undefined> {
    this.cancel(cardId);
    return new Promise((resolve) => {
      const handle = this.timer.set(() => {
        this.waiting.delete(cardId);
        resolve(undefined);
      }, waitMs);
      this.waiting.set(cardId, { resolve, handle });
    });
  }

  /** Give a waiting agent its answer. Returns false when nobody is waiting (send a follow-up instead). */
  answer(cardId: string, answer: string): boolean {
    const w = this.waiting.get(cardId);
    if (!w) return false;
    this.timer.clear(w.handle);
    this.waiting.delete(cardId);
    w.resolve(answer);
    return true;
  }

  /** Stop waiting (the run ended or was stopped). */
  cancel(cardId: string): void {
    const w = this.waiting.get(cardId);
    if (!w) return;
    this.timer.clear(w.handle);
    this.waiting.delete(cardId);
    w.resolve(undefined);
  }
}
