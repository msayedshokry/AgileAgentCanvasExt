// ─── Follow-up messages from a card to its agent ────────────────────────────
// `kanban:followUp` from the detail panel. If the card's agent loop is idle,
// the message is sent now as a rework run; if it is mid-run, it waits and is
// sent the moment the card's lock frees up. Rules live in
// workflow/harness/follow-up.ts.

import * as vscode from 'vscode';
import type { ArtifactStore } from '../state/artifact-store';
import type { ArtifactChanges } from '../types';
import { cleanFollowUp, FollowUpQueue, mergeFixRequests } from '../workflow/harness/follow-up';
import { concurrencyQueue } from '../workflow/concurrency-queue';
import { kanbanOrchestrator } from '../workflow/kanban-orchestrator';
import { createLogger } from '../utils/logger';
import { errMsg } from '../utils/error';

const logger = createLogger('follow-up-messages');
const DRAIN_POLL_MS = 3000;

type Post = (message: Record<string, unknown>) => void;

export interface FollowUpDeps {
  readonly isBusy: (artifactId: string) => boolean;
  readonly run: (artifact: unknown) => Promise<unknown>;
  readonly pollMs?: number;
}

const DEFAULT_DEPS: FollowUpDeps = {
  isBusy: (id) => concurrencyQueue.isLocked(id),
  run: (artifact) => kanbanOrchestrator.runAutonomous(artifact, {}),
};

export class FollowUpSender {
  private readonly queue = new FollowUpQueue();
  private readonly waiting = new Map<string, ReturnType<typeof setInterval>>();

  constructor(private readonly store: ArtifactStore, private readonly deps: FollowUpDeps = DEFAULT_DEPS) {}

  /** Send now, or queue until the card's current run ends. */
  async submit(artifactId: string, text: unknown, post: Post): Promise<void> {
    const message = cleanFollowUp(text);
    if (!message || !this.store.findArtifactById(artifactId)) return;
    const pending = this.queue.add(artifactId, message);
    if (this.deps.isBusy(artifactId)) {
      post({ type: 'kanban:followUpQueued', artifactId, pending });
      this.waitForIdle(artifactId, post);
      return;
    }
    await this.send(artifactId, post);
  }

  dispose(): void {
    for (const timer of this.waiting.values()) clearInterval(timer);
    this.waiting.clear();
  }

  private waitForIdle(artifactId: string, post: Post): void {
    if (this.waiting.has(artifactId)) return;
    const timer = setInterval(() => {
      if (this.deps.isBusy(artifactId)) return;
      clearInterval(timer);
      this.waiting.delete(artifactId);
      void this.send(artifactId, post);
    }, this.deps.pollMs ?? DRAIN_POLL_MS);
    this.waiting.set(artifactId, timer);
  }

  private async send(artifactId: string, post: Post): Promise<void> {
    const messages = this.queue.take(artifactId);
    const found = this.store.findArtifactById(artifactId);
    if (messages.length === 0 || !found) return;
    const metadata = (found.artifact as { metadata?: { fixRequests?: unknown } }).metadata;
    await this.store.updateArtifact(found.type, artifactId, {
      metadata: { fixRequests: mergeFixRequests(metadata?.fixRequests, messages) },
      status: 'ready-for-dev',
    } as ArtifactChanges);
    post({ type: 'kanban:followUpSent', artifactId, count: messages.length });
    const fresh = this.store.findArtifactById(artifactId)?.artifact ?? found.artifact;
    void this.deps.run(fresh).catch((err) => logger.warn(`Follow-up run for ${artifactId} failed: ${errMsg(err)}`));
  }
}

let sender: FollowUpSender | undefined;

/** The one sender, so follow-ups and answers to questions share its queue. */
export function followUpSender(store: ArtifactStore): FollowUpSender {
  sender ??= new FollowUpSender(store);
  return sender;
}

/** Returns true when the message was ours. */
export async function handleFollowUpMessage(
  message: { type: string; [key: string]: unknown },
  store: ArtifactStore,
  webview?: vscode.Webview,
): Promise<boolean> {
  if (message.type !== 'kanban:followUp' || typeof message.artifactId !== 'string') return false;
  try {
    await followUpSender(store).submit(message.artifactId, message.text, (m) => { void webview?.postMessage(m); });
  } catch (err) {
    logger.warn(`kanban:followUp failed: ${errMsg(err)}`);
    void vscode.window.showErrorMessage(`Agile Agent Canvas: could not send the follow-up — ${errMsg(err)}`);
  }
  return true;
}
