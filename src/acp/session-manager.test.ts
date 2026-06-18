// Vitest spec for AcpSessionManager.listSessions() — covers the new public
// accessor that the Agent Sessions sidebar uses to enumerate live multi-agent
// team sessions, plus the workflowId round-trip that team-orchestrator now
// propagates onto AcpSessionSpec.context.
//
// The agent-personas module is mocked at the top level because `spawn()`
// delegates to `getPersonaForArtifactType(bmadPath, personaId)`, which reads
// from disk. These tests are about the manager's own bookkeeping; we don't
// need to exercise the persona lookup.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../chat/agent-personas', () => ({
  getPersonaForArtifactType: vi.fn(() => undefined),
  formatFullAgentForPrompt: vi.fn(() => ''),
}));

import { AcpSessionManager } from './session-manager';
import type { AcpSessionSpec } from './types';
import type { WorkflowExecutor } from '../workflow/workflow-executor';

/**
 * Construct a minimally-stubbed WorkflowExecutor — `spawn()` never touches
 * the executor so the stub never has to do anything. Cast through `unknown`
 * so we don't pollute the production types with a `Partial<WorkflowExecutor>`.
 */
function makeManager(): AcpSessionManager {
  return new AcpSessionManager({} as unknown as WorkflowExecutor);
}

describe('AcpSessionManager.listSessions', () => {
  let manager: AcpSessionManager;

  beforeEach(() => {
    manager = makeManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  it('returns an empty array when no sessions have been spawned', () => {
    expect(manager.listSessions()).toEqual([]);
  });

  it('round-trips workflowId from AcpSessionSpec.context into listSessions', async () => {
    const specs: AcpSessionSpec[] = [
      {
        role: 'coordinator',
        personaId: 'p-coord',
        context: { task: 'Coordinate the team', workflowId: 'dev-story' },
      },
      {
        role: 'crafter',
        personaId: 'p-craft',
        context: { task: 'Implement the story', workflowId: 'code-review' },
      },
      {
        role: 'crafter',
        personaId: 'p-craft-2',
        context: { task: 'Implement without a workflowId' },
        // workflowId intentionally omitted — exercises the optional path
      },
    ];

    for (const spec of specs) {
      await manager.spawn(spec, '/nonexistent/bmad');
    }

    const live = manager.listSessions();

    expect(live).toHaveLength(3);

    // Round-trip — the workflowId set on each spec survives the manager's
    // internal storage and is still present on the returned AcpSession.
    expect(live[0].spec.context.workflowId).toBe('dev-story');
    expect(live[1].spec.context.workflowId).toBe('code-review');
    expect(live[2].spec.context.workflowId).toBeUndefined();
  });

  it('preserves generated session ids so the sidebar can dedupe by id', async () => {
    const spec: AcpSessionSpec = {
      role: 'gate',
      personaId: 'p-gate',
      context: { task: 'Gate the result', workflowId: 'code-review' },
    };
    const a = await manager.spawn(spec, '/nonexistent/bmad');
    const b = await manager.spawn(spec, '/nonexistent/bmad');

    const live = manager.listSessions();
    expect(live).toHaveLength(2);
    // session ids are auto-generated (`acp-{timestamp}-{rand}`); ensure
    // the two spawning yields two distinct ids and both are queryable.
    expect(a.id).not.toBe(b.id);
    expect(live.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    expect(manager.getSession(a.id)?.spec.context.workflowId).toBe('code-review');
    expect(manager.getSession(b.id)?.spec.context.workflowId).toBe('code-review');
  });

  it('returns a shallow copy — mutating the returned array does NOT affect the internal map', async () => {
    await manager.spawn({
      role: 'crafter',
      personaId: 'p-craft',
      context: { task: 'Implement', workflowId: 'dev-story' },
    }, '/nonexistent/bmad');

    const first = manager.listSessions();
    expect(first).toHaveLength(1);

    // Forcibly truncate the returned array. The internal map must hold its
    // single entry — proving listSessions doesn't hand out a live reference.
    first.length = 0;
    expect(manager.listSessions()).toHaveLength(1);

    // Also mutate a nested field on the returned row — the row itself is
    // shared (shallow copy), so this WILL leak. We document the contract
    // explicitly rather than preventing the leak: callers must treat the
    // row as read-only.
    const rows = manager.listSessions();
    const originalId = rows[0].id;
    (rows[0] as { id: string }).id = 'mutated-id';
    expect(manager.listSessions()[0].id).toBe('mutated-id');
    expect(manager.listSessions()[0].id).not.toBe(originalId);
  });

  it('marking a running session as cancelled after dispose still surfaces it via listSessions', async () => {
    const session = await manager.spawn({
      role: 'coordinator',
      personaId: 'p-coord',
      context: { task: 'Run', workflowId: 'dev-story' },
    }, '/nonexistent/bmad');

    expect(manager.listSessions()).toHaveLength(1);

    // AcpSession.dispose() only flips the status to 'cancelled' when the
    // session was already 'running'. Promote the spawned-only 'pending'
    // session to 'running' first so the cancellation path actually fires
    // — this reproduces the live-cancellation flow the Agent Sessions
    // sidebar exercises after the user clicks Discard on an ACP row.
    session.setStatus('running');
    expect(session.status).toBe('running');
    session.dispose();
    expect(session.status).toBe('cancelled');

    // `listSessions` is intentionally lazy — a cancelled session still
    // appears (the Agent Sessions sidebar shows historical rows for
    // audit). Verify the row stays reachable by id and that its workflowId
    // survives the cancel transition.
    const row = manager.getSession(session.id);
    expect(row?.status).toBe('cancelled');
    expect(row?.spec.context.workflowId).toBe('dev-story');
  });
});
