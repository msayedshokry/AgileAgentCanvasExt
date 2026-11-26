// ─── Agent capacity ──────────────────────────────────────────────────────────
// (docs/plans/2026-11-26-agent-board-live.md, L7.) Each agent may have a set
// number of cards running at once (1 by default, like a person). A card whose
// agent is busy waits its turn: higher priority first, then first come. A
// stopped card leaves the line. Pure: no vscode, no timers.

export interface SlotRequest {
  readonly agentId: string;
  readonly capacity: number;
  readonly cardId: string;
  /** Lower runs sooner (see priorityRank). */
  readonly rank: number;
  readonly signal?: AbortSignal;
}

const PRIORITY_RANK: Readonly<Record<string, number>> = {
  P0: 0, P1: 1, P2: 2, P3: 3, 'must-have': 0, 'should-have': 1, 'could-have': 2, "won't-have": 4,
};

export function priorityRank(priority: unknown): number {
  return typeof priority === 'string' && priority in PRIORITY_RANK ? PRIORITY_RANK[priority] : 3;
}

interface Waiter { readonly req: SlotRequest; readonly seq: number; readonly grant: () => void; readonly fail: (e: Error) => void }

export class AgentSlots {
  private readonly running = new Map<string, Set<string>>();
  private readonly waiting = new Map<string, Waiter[]>();
  private seq = 0;

  /** Cards this agent is running now. */
  busy(agentId: string): number {
    return this.running.get(agentId)?.size ?? 0;
  }

  /** Cards waiting for this agent. */
  queued(agentId: string): string[] {
    return (this.waiting.get(agentId) ?? []).map((w) => w.req.cardId);
  }

  /**
   * Resolves with a release function once the agent has room; rejects with
   * "aborted" if the card is stopped while it waits. `onWait` is called
   * when the card has to wait.
   */
  acquire(req: SlotRequest, onWait?: (busy: number) => void): Promise<() => void> {
    const release = () => this.release(req.agentId, req.cardId);
    if (this.busy(req.agentId) < req.capacity) {
      this.take(req.agentId, req.cardId);
      return Promise.resolve(release);
    }
    onWait?.(this.busy(req.agentId));
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { req, seq: ++this.seq, grant: () => resolve(release), fail: reject };
      const line = [...(this.waiting.get(req.agentId) ?? []), waiter]
        .sort((a, b) => a.req.rank - b.req.rank || a.seq - b.seq);
      this.waiting.set(req.agentId, line);
      req.signal?.addEventListener('abort', () => {
        const remaining = (this.waiting.get(req.agentId) ?? []).filter((w) => w !== waiter);
        this.waiting.set(req.agentId, remaining);
        reject(new Error('aborted'));
      }, { once: true });
    });
  }

  private take(agentId: string, cardId: string): void {
    const set = this.running.get(agentId) ?? new Set<string>();
    set.add(cardId);
    this.running.set(agentId, set);
  }

  private release(agentId: string, cardId: string): void {
    const set = this.running.get(agentId);
    if (!set?.delete(cardId)) return; // already released
    const line = this.waiting.get(agentId) ?? [];
    while (line.length && this.busy(agentId) < line[0].req.capacity) {
      const next = line.shift()!;
      this.take(agentId, next.req.cardId);
      next.grant();
    }
    this.waiting.set(agentId, line);
  }
}
