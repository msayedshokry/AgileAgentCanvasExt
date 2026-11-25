// ─── Follow-up messages to a card's agent ────────────────────────────────────
// The user can reply to an agent from its card ("also handle empty
// passwords"). Board runs take one prompt, so a reply cannot reach a run
// mid-flight; instead it is queued and becomes the next run's fix request,
// which continues the same Claude conversation (card-session.ts). Pure.

export const MAX_FOLLOW_UP_CHARS = 2000;
export const MAX_QUEUED_PER_CARD = 10;

export interface FixRequest {
  readonly failing_criterion: string;
  readonly reproduction?: string;
}

/** The message as the user meant it, or undefined when there is nothing to send. */
export function cleanFollowUp(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined;
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, MAX_FOLLOW_UP_CHARS) : undefined;
}

/** Follow-ups as fix requests the agent must address, kept apart from review items. */
export function followUpFixRequests(messages: readonly string[]): FixRequest[] {
  return messages.map((m) => ({ failing_criterion: 'Follow-up from the user', reproduction: m }));
}

/** Merge new follow-ups into a card's existing fix requests, replacing older follow-ups. */
export function mergeFixRequests(existing: unknown, messages: readonly string[]): FixRequest[] {
  const kept = (Array.isArray(existing) ? existing : []).filter(
    (f): f is FixRequest => !!f && typeof f === 'object' && typeof (f as FixRequest).failing_criterion === 'string'
      && (f as FixRequest).failing_criterion !== 'Follow-up from the user',
  );
  return [...kept, ...followUpFixRequests(messages)];
}

/** Messages waiting for a card's current run to end. */
export class FollowUpQueue {
  private readonly queued = new Map<string, string[]>();

  /** Returns how many are now waiting for that card. */
  add(artifactId: string, message: string): number {
    const list = [...(this.queued.get(artifactId) ?? []), message].slice(-MAX_QUEUED_PER_CARD);
    this.queued.set(artifactId, list);
    return list.length;
  }

  pending(artifactId: string): number {
    return this.queued.get(artifactId)?.length ?? 0;
  }

  /** Remove and return everything queued for the card, oldest first. */
  take(artifactId: string): string[] {
    const list = this.queued.get(artifactId) ?? [];
    this.queued.delete(artifactId);
    return list;
  }
}
