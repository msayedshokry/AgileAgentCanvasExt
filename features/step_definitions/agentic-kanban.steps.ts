/**
 * Agentic Kanban Step Definitions
 * Cucumber step definitions for testing agentic-kanban-message-handler.ts.
 * Board (webview) behaviour is tested by rendering the real app in
 * webview-ui/src/agentic-kanban/AgenticKanbanApp.test.tsx.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

// ============================================================================
// SECTION 1: Message Handler Test Context
// ============================================================================

interface KanbanHandlerContext {
  store: any;
  handlerResult: boolean | null;
  lastMessage: any;
  webviewMessages: any[];
  infoMessages: string[];
  storeUpdates: Map<string, Map<string, any>>;
}

const handlerContexts = new WeakMap<BmadWorld, KanbanHandlerContext>();

// Exported so shared step definitions in features/support/ can resolve the
// kanban context (e.g. shared-store-steps.ts auto-detects lane vs kanban).
export function getHandlerCtx(world: BmadWorld): KanbanHandlerContext {
  let ctx = handlerContexts.get(world);
  if (!ctx) {
    ctx = {
      store: null,
      handlerResult: null,
      lastMessage: null,
      webviewMessages: [],
      infoMessages: [],
      storeUpdates: new Map(),
    };
    handlerContexts.set(world, ctx);
  }
  return ctx;
}

// ============================================================================
// SECTION 1: Message Handler Step Definitions
// ============================================================================

function handlerStubOverrides(ctx: KanbanHandlerContext, world: BmadWorld) {
  return {
    '../utils/logger': { createLogger: () => ({ info: () => {}, error: () => {}, debug: () => {}, warn: () => {} }) },
    '../state/artifact-store': { ArtifactStore: class {} },
    '../canvas/artifact-transformer': {
      buildArtifacts: (store: any) => {
        const storyMap = store.artifacts?.get('story');
        return storyMap ? Array.from(storyMap.values()) : [];
      },
      sendArtifactsToPanel: () => {},
    },
    '../workflow/lane-transitions': {
      laneTransitionEngine: {
        handleTransition: async (artifactId: string, _fromStatus: string, toStatus: string, artifactType: string) => {
          const found = ctx.store.findArtifactById(artifactId);
          if (!found) return { ok: false, status: 'blocked', blockedBy: ['Artifact not found'] };
          try {
            await ctx.store.updateArtifact(found.type, artifactId, { status: toStatus, artifactType: artifactType || found.type });
            return { ok: true, status: 'complete' };
          } catch { throw new Error('Store update failed'); }
        },
      },
    },
    // Stub kanban-settings to prevent loading the real vscode-dependent module
    '../workflow/kanban-settings': {
      isKanbanAutoAdvanceEnabled: () => false,
      setKanbanAutoAdvance: async () => {},
      getKanbanMaxIterations: () => 3,
    },
    '../chat/active-session': { getActiveChatSession: () => null },
    vscode: {
      ...world.vscode,
      window: { ...(world.vscode.window || {}), showInformationMessage: async (msg: string) => { ctx.infoMessages.push(msg); } },
      workspace: { ...(world.vscode.workspace || {}), workspaceFolders: undefined, getConfiguration: () => ({ get: () => false }) },
    }
  };
}

// ─── GIVEN ──────────────────────────────────────────────────────────────────

Given('a fresh agentic kanban message handler context', function (this: BmadWorld) {
  const ctx = getHandlerCtx(this);
  ctx.store = {
    artifacts: new Map(),
    findArtifactById: function (id: string) {
      for (const [type, map] of this.artifacts) { if (map.has(id)) return { artifact: map.get(id), type }; }
      return null;
    },
    updateArtifact: async function (type: string, id: string, changes: any) {
      if (!this.artifacts.has(type)) this.artifacts.set(type, new Map());
      const existing = this.artifacts.get(type).get(id) || {};
      this.artifacts.get(type).set(id, { ...existing, ...changes });
      if (!ctx.storeUpdates.has(type)) ctx.storeUpdates.set(type, new Map());
      ctx.storeUpdates.get(type)!.set(id, changes);
    },
    getState: () => ({}),
  };
  ctx.handlerResult = null;
  ctx.webviewMessages = [];
  ctx.infoMessages = [];
  ctx.storeUpdates = new Map();
});

Given('the artifact store has artifact {string} with type {string} and status {string}',
  function (this: BmadWorld, id: string, type: string, status: string) {
    const ctx = getHandlerCtx(this);
    if (!ctx.store.artifacts.has(type)) ctx.store.artifacts.set(type, new Map());
    ctx.store.artifacts.get(type).set(id, { id, type, status, title: `${type}-${id}` });
  });

Given('the artifact store does not have {string}', function (this: BmadWorld, id: string) {
  const ctx = getHandlerCtx(this);
  for (const [, map] of ctx.store.artifacts) { map.delete(id); }
});

Given('the artifact store has {int} artifacts', function (this: BmadWorld, count: number) {
  const ctx = getHandlerCtx(this);
  for (let i = 0; i < count; i++) {
    if (!ctx.store.artifacts.has('story')) ctx.store.artifacts.set('story', new Map());
    ctx.store.artifacts.get('story')!.set(`artifact-${i}`, { id: `artifact-${i}`, type: 'story', status: 'backlog', title: `Artifact ${i}` });
  }
});

// ─── WHEN ───────────────────────────────────────────────────────────────────

// Shared steps "the store updateArtifact will throw" and "the transition
// result blockedBy should contain {string}" live in
// features/support/shared-store-steps.ts — they auto-detect whether the
// active context is lane-transitions or agentic-kanban.

When('I send a {string} message with:', async function (this: BmadWorld, messageType: string, dataTable: any) {
  const ctx = getHandlerCtx(this);
  // The data table is formatted as key-value pairs (one key per row), so use
  // rowsHash() to get a single { key: value } object — hashes() would treat
  // each row as a header and return an array of single-key objects.
  const row = dataTable.rowsHash();
  const message: any = { type: messageType, ...row };

  const handlerModule = proxyquire('../../src/views/agentic-kanban-message-handler', handlerStubOverrides(ctx, this));
  ctx.handlerResult = await handlerModule.handleAgenticKanbanMessage(message, ctx.store, {} as any);
  // Also store on world so shared Then steps (e.g. webview-message-handler's) can read it
  (this as any)._lastHandlerReturnValue = ctx.handlerResult;
});

When('I send a {string} message providing a webview with:', async function (this: BmadWorld, messageType: string, dataTable: any) {
  const ctx = getHandlerCtx(this);
  // See comment in 'I send a {string} message with:' — key-value table needs rowsHash()
  const row = dataTable.rowsHash();
  const message: any = { type: messageType, ...row };

  const mockWebview = { postMessage: (msg: any) => { ctx.webviewMessages.push(msg); } };
  const handlerModule = proxyquire('../../src/views/agentic-kanban-message-handler', handlerStubOverrides(ctx, this));
  ctx.handlerResult = await handlerModule.handleAgenticKanbanMessage(message, ctx.store, {} as any, mockWebview as any);
  (this as any)._lastHandlerReturnValue = ctx.handlerResult;
});

When('I send an {string} message providing a webview', async function (this: BmadWorld, messageType: string) {
  const ctx = getHandlerCtx(this);
  const mockWebview = { postMessage: (msg: any) => { ctx.webviewMessages.push(msg); } };
  const handlerModule = proxyquire('../../src/views/agentic-kanban-message-handler', handlerStubOverrides(ctx, this));
  ctx.handlerResult = await handlerModule.handleAgenticKanbanMessage({ type: messageType }, ctx.store, {} as any, mockWebview as any);
  (this as any)._lastHandlerReturnValue = ctx.handlerResult;
});

When('I send a {string} message with sessionId {string}', async function (this: BmadWorld, messageType: string, sessionId: string) {
  const ctx = getHandlerCtx(this);
  const handlerModule = proxyquire('../../src/views/agentic-kanban-message-handler', handlerStubOverrides(ctx, this));
  ctx.handlerResult = await handlerModule.handleAgenticKanbanMessage({ type: messageType, sessionId }, ctx.store, {} as any);
  (this as any)._lastHandlerReturnValue = ctx.handlerResult;
});

When('I send a kanban {string} message', async function (this: BmadWorld, messageType: string) {
  const ctx = getHandlerCtx(this);
  const handlerModule = proxyquire('../../src/views/agentic-kanban-message-handler', handlerStubOverrides(ctx, this));
  ctx.handlerResult = await handlerModule.handleAgenticKanbanMessage({ type: messageType }, ctx.store, {} as any);
  (this as any)._lastHandlerReturnValue = ctx.handlerResult;
});

// ─── THEN ───────────────────────────────────────────────────────────────────

Then('the store should have updated {string} {string} with status {string}',
  function (this: BmadWorld, type: string, id: string, expectedStatus: string) {
    const ctx = getHandlerCtx(this);
    const artifact = ctx.store.artifacts.get(type)?.get(id);
    assert.ok(artifact, `Artifact ${type}/${id} should exist in store`);
    assert.strictEqual(artifact.status, expectedStatus, `Expected status "${expectedStatus}", got "${artifact.status}"`);
  });

Then('the webview should have received a {string} message', function (this: BmadWorld, expectedType: string) {
  // Try kanban handler context first
  const kanbanCtx = getHandlerCtx(this);
  const kanbanMsg = kanbanCtx.webviewMessages?.find((m: any) => m.type === expectedType);
  if (kanbanMsg) return;

  // Fall back to webview handler context (set by webview-message-handler's sendMessage)
  const webviewMsgs = (this as any)._webviewPostedMessages;
  if (webviewMsgs) {
    const match = webviewMsgs.find((m: any) => m.type === expectedType);
    if (match) return;
  }

  // Collect actual received types for a helpful error message
  const actualTypes: string[] = [];
  if (kanbanCtx.webviewMessages?.length) {
    actualTypes.push(...kanbanCtx.webviewMessages.map((m: any) => m.type));
  }
  if (webviewMsgs?.length) {
    actualTypes.push(...webviewMsgs.map((m: any) => m.type));
  }
  const actualStr = actualTypes.length
    ? `Got: [${actualTypes.join(', ')}]`
    : 'No messages were posted to the webview';

  assert.fail(`Webview did not receive "${expectedType}" message. ${actualStr}`);
});

Then('the webview should have received an {string} message', function (this: BmadWorld, expectedType: string) {
  const ctx = getHandlerCtx(this);
  const msg = ctx.webviewMessages.find((m: any) => m.type === expectedType);
  assert.ok(msg, `Expected webview to have received an "${expectedType}" message. Got types: [${ctx.webviewMessages.map((m: any) => m.type).join(', ')}]`);
});

Then('the updateArtifacts message should contain {int} artifacts', function (this: BmadWorld, count: number) {
  const ctx = getHandlerCtx(this);
  const msg = ctx.webviewMessages.find((m: any) => m.type === 'updateArtifacts');
  assert.ok(msg, 'Expected an updateArtifacts message');
  assert.strictEqual(msg.artifacts.length, count, `Expected ${count} artifacts, got ${msg.artifacts.length}`);
});

Then('the transition result should have ok true', function (this: BmadWorld) {
  const ctx = getHandlerCtx(this);
  const msg = ctx.webviewMessages.find((m: any) => m.type === 'transitionResult');
  assert.ok(msg, 'Expected a transitionResult message');
  assert.strictEqual(msg.ok, true, `Expected transitionResult ok to be true, got ${msg.ok}`);
});

Then('the transition result should have ok false', function (this: BmadWorld) {
  const ctx = getHandlerCtx(this);
  const msg = ctx.webviewMessages.find((m: any) => m.type === 'transitionResult');
  assert.ok(msg, 'Expected a transitionResult message');
  assert.strictEqual(msg.ok, false, `Expected transitionResult ok to be false, got ${msg.ok}`);
});

Then('the transition result should have status {string}', function (this: BmadWorld, expected: string) {
  const ctx = getHandlerCtx(this);
  const msg = ctx.webviewMessages.find((m: any) => m.type === 'transitionResult');
  assert.ok(msg, 'Expected a transitionResult message');
  assert.strictEqual(msg.status, expected, `Expected transitionResult status "${expected}", got "${msg.status}"`);
});

Then('the transition result blockedBy should have at least {int} item', function (this: BmadWorld, minCount: number) {
  const ctx = getHandlerCtx(this);
  const msg = ctx.webviewMessages.find((m: any) => m.type === 'transitionResult');
  assert.ok(msg, 'Expected a transitionResult message');
  assert.ok(Array.isArray(msg.blockedBy), 'Expected blockedBy to be an array');
  assert.ok(msg.blockedBy.length >= minCount, `Expected blockedBy to have at least ${minCount} items, got ${msg.blockedBy.length}`);
});

Then('an information message should have been shown', function (this: BmadWorld) {
  const ctx = getHandlerCtx(this);
  assert.ok(ctx.infoMessages.length > 0, 'Expected at least one info message');
});

Then('the information message should contain {string}', function (this: BmadWorld, expected: string) {
  const ctx = getHandlerCtx(this);
  assert.ok(ctx.infoMessages.some((m: string) => m.includes(expected)), `Expected an info message containing "${expected}"`);
});
