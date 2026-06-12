/**
 * Shared step definitions for the artifact store that work across multiple
 * feature contexts (lane-transitions, agentic-kanban).
 *
 * Both feature files mock the ArtifactStore with slightly different shapes
 * (lane uses LaneTestContext, kanban uses KanbanHandlerContext), but the
 * intent of these two steps is identical:
 *
 *   • "the store updateArtifact will throw"
 *     — Make the next call to `store.updateArtifact` throw. Used to test
 *       error paths in the transition engine and the kanban handler.
 *
 *   • "the transition result blockedBy should contain {string}"
 *     — Assert that the last transition result (delivered as a return value
 *       in lane scenarios, or as a `transitionResult` postMessage in kanban
 *       scenarios) has a `blockedBy` array containing the expected string.
 *
 * Rather than duplicate the step definition in each feature file (which
 * requires routing the mutation to the correct per-feature WeakMap-scoped
 * context), this module imports the context-getters from each step file
 * and auto-detects the active context.
 *
 * Resolution order:
 *   1. Lane transition context (set by `Given a fresh lane transition engine`)
 *   2. Agentic Kanban handler context (set by `Given a fresh agentic kanban
 *      message handler context`)
 *
 * If neither context is active, the step fails with a clear error message
 * instead of silently no-op'ing or throwing a confusing null-reference.
 */

import { Given, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from './world';

// Import context-getters from each step file. These were previously
// module-local — we now export them so the shared step can find the right
// context regardless of which feature file's Given step ran first.
import { getCtx as getLaneCtx } from '../step_definitions/lane-transitions.steps';
import { getHandlerCtx as getKanbanCtx } from '../step_definitions/agentic-kanban.steps';

/**
 * Resolve the active artifact store across lane / kanban contexts.
 * Returns the store object on which to install the throwing updateArtifact.
 */
function resolveActiveStore(world: BmadWorld): { store: any; source: string } | null {
  const laneCtx = getLaneCtx(world);
  if (laneCtx?.store) {
    return { store: laneCtx.store, source: 'lane-transitions' };
  }

  const kanbanCtx = getKanbanCtx(world);
  if (kanbanCtx?.store) {
    return { store: kanbanCtx.store, source: 'agentic-kanban' };
  }

  return null;
}

/**
 * True iff any of the per-feature contexts has been initialized for this
 * world. Used to give a better error message than "blockedBy undefined"
 * when the user forgot to call the appropriate `Given a fresh ...` step.
 *
 * NOTE: We can't just check `!!getLaneCtx(world) || getKanbanCtx(world)`
 * because the context-getters lazily create empty contexts on first call —
 * calling them on a fresh world would return a truthy empty ctx, defeating
 * the "no context" diagnostic. Instead we check for a truthy `store` on
 * either context, which mirrors `resolveActiveStore`'s "initialized" check.
 */
function hasActiveContext(world: BmadWorld): boolean {
  return !!(getLaneCtx(world)?.store || getKanbanCtx(world)?.store);
}

/**
 * Resolve the blockedBy array of the last transition result across contexts.
 * Lane scenarios store the result on `ctx.lastTransitionResult`; kanban
 * scenarios deliver it as a `transitionResult` postMessage on the webview.
 *
 * Precedence: lane is checked first, but only when it has a defined
 * `blockedBy` field. A successful lane transition has no `blockedBy`, so
 * the resolver falls through to kanban in that case — lane does NOT
 * monopolize the lookup just by being initialized first.
 */
function resolveBlockedBy(world: BmadWorld): string[] | undefined {
  const laneCtx = getLaneCtx(world);
  if (laneCtx?.lastTransitionResult?.blockedBy) {
    return laneCtx.lastTransitionResult.blockedBy;
  }

  const kanbanCtx = getKanbanCtx(world);
  if (kanbanCtx) {
    const msg = kanbanCtx.webviewMessages?.find((m: any) => m.type === 'transitionResult');
    if (msg?.blockedBy) return msg.blockedBy;
  }

  return undefined;
}

// ─── GIVEN ──────────────────────────────────────────────────────────────────

Given('the store updateArtifact will throw', function (this: BmadWorld) {
  const resolved = resolveActiveStore(this);
  assert.ok(
    resolved,
    'No active store context found. Run a `Given a fresh lane transition engine` ' +
    'or `Given a fresh agentic kanban message handler context` step first.'
  );
  resolved.store.updateArtifact = async () => {
    throw new Error('Store update error');
  };
});

// ─── THEN ───────────────────────────────────────────────────────────────────

Then('the transition result blockedBy should contain {string}', function (this: BmadWorld, expected: string) {
  // Distinguish "user forgot to initialize a context" from "context exists
  // but the transition produced no blockedBy (e.g. a successful transition
  // which has no failure reasons)".
  if (!hasActiveContext(this)) {
    assert.fail(
      'No active transition context found. Run a `Given a fresh lane transition engine` ' +
      'or `Given a fresh agentic kanban message handler context` step first, ' +
      'and trigger a transition (e.g. `When I handle transition for ...`).'
    );
  }

  const blockedBy = resolveBlockedBy(this);
  assert.ok(
    blockedBy,
    'Context is active but the transition produced no blockedBy. ' +
    'This step only matches a FAILING transition — a successful transition ' +
    '(ok: true, no blockedBy) would never satisfy this assertion. ' +
    'Was the transition actually run, and did it fail?'
  );
  const blockedByStr = (blockedBy as string[]).join(' ');
  assert.ok(
    blockedByStr.includes(expected),
    `Expected blockedBy to contain "${expected}", got: ${JSON.stringify(blockedBy)}`
  );
});
