import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../workflow/kanban-orchestrator', () => ({ kanbanOrchestrator: { runAutonomous: vi.fn() } }));
vi.mock('../workflow/concurrency-queue', () => ({ concurrencyQueue: { isLocked: () => false } }));

import { FollowUpSender } from './follow-up-messages';

function fakeStore() {
  const artifact: { id: string; status: string; metadata: Record<string, unknown> } = {
    id: 'S-1', status: 'done', metadata: { fixRequests: [{ failing_criterion: 'Review comment from @alice', reproduction: 'nulls' }] },
  };
  return {
    artifact,
    findArtifactById: (id: string) => (id === 'S-1' ? { type: 'story', artifact } : undefined),
    updateArtifact: vi.fn(async (_t: string, _id: string, changes: { metadata: Record<string, unknown>; status: string }) => {
      artifact.metadata = { ...artifact.metadata, ...changes.metadata };
      artifact.status = changes.status;
    }),
  };
}

const makeRun = () => vi.fn<(artifact: unknown) => Promise<unknown>>(async () => undefined);

describe('FollowUpSender', () => {
  let busy: boolean;
  let run: ReturnType<typeof makeRun>;
  let posted: Array<Record<string, unknown>>;
  beforeEach(() => {
    vi.useFakeTimers();
    busy = false;
    run = makeRun();
    posted = [];
  });
  afterEach(() => { vi.useRealTimers(); });

  it('sends right away when the agent is idle: fix request added, card reopened, run started', async () => {
    const store = fakeStore();
    await new FollowUpSender(store as never, { isBusy: () => busy, run }).submit('S-1', '  also handle empty passwords ', (m) => posted.push(m));
    expect(store.artifact.status).toBe('ready-for-dev');
    expect(store.artifact.metadata.fixRequests).toEqual([
      { failing_criterion: 'Review comment from @alice', reproduction: 'nulls' },
      { failing_criterion: 'Follow-up from the user', reproduction: 'also handle empty passwords' },
    ]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(posted).toContainEqual({ type: 'kanban:followUpSent', artifactId: 'S-1', count: 1 });
  });

  it('queues while the agent is running and sends everything once it is free', async () => {
    const store = fakeStore();
    busy = true;
    const sender = new FollowUpSender(store as never, { isBusy: () => busy, run, pollMs: 100 });
    await sender.submit('S-1', 'first', (m) => posted.push(m));
    await sender.submit('S-1', 'second', (m) => posted.push(m));
    expect(posted).toContainEqual({ type: 'kanban:followUpQueued', artifactId: 'S-1', pending: 2 });
    await vi.advanceTimersByTimeAsync(300);
    expect(run).not.toHaveBeenCalled();

    busy = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);
    expect((store.artifact.metadata.fixRequests as unknown[]).slice(-2)).toEqual([
      { failing_criterion: 'Follow-up from the user', reproduction: 'first' },
      { failing_criterion: 'Follow-up from the user', reproduction: 'second' },
    ]);
    sender.dispose();
  });

  it('ignores empty messages and unknown cards', async () => {
    const store = fakeStore();
    const sender = new FollowUpSender(store as never, { isBusy: () => busy, run });
    await sender.submit('S-1', '   ', (m) => posted.push(m));
    await sender.submit('NOPE', 'hello', (m) => posted.push(m));
    expect(run).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
  });
});
