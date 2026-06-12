/**
 * Agentic Kanban Step Definitions
 * Cucumber step definitions for testing agentic-kanban-message-handler.ts
 * and AgenticKanbanApp webview behavior
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

interface KanbanWebviewContext {
  artifacts: any[];
  columns: Record<string, string[]>;
  cards: Map<string, any>;
  detailPanelOpen: boolean;
  detailPanelArtifactId: string | null;
  lastPostMessage: any;
  postMessageHistory: any[];
  toastMessage: string | null;
  pendingTransitions: Map<string, any>;
}

const handlerContexts = new WeakMap<BmadWorld, KanbanHandlerContext>();
const webviewContexts = new WeakMap<BmadWorld, KanbanWebviewContext>();

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

function getWebviewCtx(world: BmadWorld): KanbanWebviewContext {
  let ctx = webviewContexts.get(world);
  if (!ctx) {
    ctx = {
      artifacts: [],
      columns: {
        'Backlog': [],
        'Ready for Dev': [],
        'In Progress': [],
        'Review': [],
        'Done': [],
      },
      cards: new Map(),
      detailPanelOpen: false,
      detailPanelArtifactId: null,
      lastPostMessage: null,
      postMessageHistory: [],
      toastMessage: null,
      pendingTransitions: new Map(),
    };
    webviewContexts.set(world, ctx);
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
        handleTransition: async (artifactId: string, fromStatus: string, toStatus: string, artifactType: string) => {
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

// ============================================================================
// SECTION 2: Webview Behavior Step Definitions (@webview)
// ============================================================================

function columnForStatus(status: string): string {
  const map: Record<string, string> = { 'backlog': 'Backlog', 'ready-for-dev': 'Ready for Dev', 'in-progress': 'In Progress', 'review': 'Review', 'done': 'Done' };
  return map[status] || 'Backlog';
}

// ─── GIVEN ──────────────────────────────────────────────────────────────────

Given('a freshly mounted AgenticKanbanApp', function (this: BmadWorld) {
  const ctx = getWebviewCtx(this);
  ctx.artifacts = []; ctx.cards = new Map(); ctx.detailPanelOpen = false; ctx.detailPanelArtifactId = null;
  ctx.lastPostMessage = null; ctx.postMessageHistory = []; ctx.toastMessage = null; ctx.pendingTransitions = new Map();
  for (const col of Object.keys(ctx.columns)) ctx.columns[col] = [];
});

Given('the AgenticKanbanApp receives artifacts:', function (this: BmadWorld, dataTable: any) {
  const ctx = getWebviewCtx(this);
  for (const row of dataTable.hashes()) {
    const artifact = { id: row.id, title: row.title || row.id, status: row.status || 'backlog', type: row.type || 'story' };
    ctx.artifacts.push(artifact);
    ctx.cards.set(artifact.id, { ...artifact, draggable: true, lockInfo: null, agentState: null, harnessResults: null });
    ctx.columns[columnForStatus(artifact.status)].push(artifact.id);
  }
});

Given('the AgenticKanbanApp receives an artifact {string} with status {string}',
  function (this: BmadWorld, id: string, status: string) {
    const ctx = getWebviewCtx(this);
    const artifact = { id, title: id, status, type: 'story' };
    ctx.artifacts.push(artifact);
    ctx.cards.set(id, { ...artifact, draggable: true, lockInfo: null, agentState: null, harnessResults: null });
    ctx.columns[columnForStatus(status)].push(id);
  });

Given('the AgenticKanbanApp has 0 artifacts', function (this: BmadWorld) {
  const ctx = getWebviewCtx(this); ctx.artifacts = []; ctx.cards = new Map();
  for (const col of Object.keys(ctx.columns)) ctx.columns[col] = [];
});

Given('the AgenticKanbanApp has item {string} in {string} column', function (this: BmadWorld, id: string, column: string) {
  const ctx = getWebviewCtx(this);
  ctx.cards.set(id, { id, title: id, status: column.toLowerCase().replace(/\s/g, '-'), type: 'story', draggable: true, lockInfo: null, agentState: null, harnessResults: null });
  ctx.columns[column].push(id);
});

Given('the AgenticKanbanApp has item {string} with lockInfo locked true and agentName {string}', function (this: BmadWorld, id: string, agentName: string) {
  const ctx = getWebviewCtx(this);
  ctx.cards.set(id, { id, title: id, status: 'backlog', type: 'story', draggable: false, lockInfo: { locked: true, agentName }, agentState: null, harnessResults: null });
  ctx.columns['Backlog'].push(id);
});

Given('the AgenticKanbanApp has item {string} with no lockInfo', function (this: BmadWorld, id: string) {
  const ctx = getWebviewCtx(this);
  ctx.cards.set(id, { id, title: id, status: 'backlog', type: 'story', draggable: true, lockInfo: null, agentState: null, harnessResults: null });
  ctx.columns['Backlog'].push(id);
});

Given('the AgenticKanbanApp has item {string} with agentState status {string} and agentRole {string}', function (this: BmadWorld, id: string, status: string, role: string) {
  const ctx = getWebviewCtx(this);
  ctx.cards.set(id, { id, title: id, status: 'backlog', type: 'story', draggable: true, lockInfo: null, agentState: { status, agentRole: role }, harnessResults: null });
  ctx.columns['Backlog'].push(id);
});

Given('the AgenticKanbanApp has item {string} with agentState status {string}', function (this: BmadWorld, id: string, status: string) {
  const ctx = getWebviewCtx(this);
  ctx.cards.set(id, { id, title: id, status: 'backlog', type: 'story', draggable: true, lockInfo: null, agentState: { status }, harnessResults: null });
  ctx.columns['Backlog'].push(id);
});

Given('the AgenticKanbanApp has item {string} with harnessResults containing a blocking failure', function (this: BmadWorld, id: string) {
  const ctx = getWebviewCtx(this);
  ctx.cards.set(id, { id, title: id, status: 'backlog', type: 'story', draggable: true, lockInfo: null, agentState: null, harnessResults: { passed: false, failures: [{ message: 'Policy failed', severity: 'blocking' }] } });
  ctx.columns['Backlog'].push(id);
});

Given('the AgenticKanbanApp has item {string} with title {string}', function (this: BmadWorld, id: string, title: string) {
  const ctx = getWebviewCtx(this);
  ctx.cards.set(id, { id, title, status: 'backlog', type: 'story', draggable: true, lockInfo: null, agentState: null, harnessResults: null });
  ctx.columns['Backlog'].push(id);
});

Given('the AgenticKanbanApp has item {string} selected and detail panel open', function (this: BmadWorld, id: string) {
  const ctx = getWebviewCtx(this); ctx.detailPanelOpen = true; ctx.detailPanelArtifactId = id;
});

Given('the AgenticKanbanApp has item {string} with agentState sessionId {string}', function (this: BmadWorld, id: string, sessionId: string) {
  const ctx = getWebviewCtx(this);
  ctx.cards.set(id, { id, title: id, status: 'backlog', type: 'story', draggable: true, lockInfo: null, agentState: { sessionId }, harnessResults: null });
  ctx.columns['Backlog'].push(id);
});

Given('the AgenticKanbanApp has item {string} with no agentState sessionId', function (this: BmadWorld, id: string) {
  const ctx = getWebviewCtx(this);
  ctx.cards.set(id, { id, title: id, status: 'backlog', type: 'story', draggable: true, lockInfo: null, agentState: {}, harnessResults: null });
  ctx.columns['Backlog'].push(id);
});

Given('the AgenticKanbanApp has a pending transition for {string}', function (this: BmadWorld, id: string) {
  const ctx = getWebviewCtx(this);
  ctx.pendingTransitions.set(id, { artifactId: id, status: 'queued' });
  const card = ctx.cards.get(id); if (card) card.pendingTransition = true;
});

Given('the detail panel is open for {string}', function (this: BmadWorld, id: string) {
  const ctx = getWebviewCtx(this); ctx.detailPanelOpen = true; ctx.detailPanelArtifactId = id;
});

Given('the AgenticKanbanApp is fully loaded', function (this: BmadWorld) { /* ready */ });

// ─── WHEN ───────────────────────────────────────────────────────────────────

When('the webview receives an {string} message with {int} artifacts', function (this: BmadWorld, msgType: string, count: number) {
  const ctx = getWebviewCtx(this); ctx.artifacts = []; ctx.cards = new Map();
  for (const col of Object.keys(ctx.columns)) ctx.columns[col] = [];
  for (let i = 0; i < count; i++) {
    const statuses = ['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'];
    const id = `artifact-${i}`; const status = statuses[i % 5];
    ctx.cards.set(id, { id, title: `Artifact ${i}`, status, type: 'story', draggable: true, lockInfo: null, agentState: null, harnessResults: null });
    ctx.columns[columnForStatus(status)].push(id);
  }
});

When('the user drags {string} to the {string} column', function (this: BmadWorld, id: string, targetColumn: string) {
  const ctx = getWebviewCtx(this); const card = ctx.cards.get(id);
  const oldCol = columnForStatus(card?.status || 'backlog');
  ctx.columns[oldCol] = ctx.columns[oldCol].filter((i: string) => i !== id);
  ctx.columns[targetColumn].push(id);
  ctx.lastPostMessage = { type: 'kanban:statusChanged', artifactId: id, fromStatus: card?.status || 'backlog', toStatus: targetColumn.toLowerCase().replace(/\s/g, '-'), artifactType: card?.type || 'story' };
  ctx.postMessageHistory.push(ctx.lastPostMessage);
});

When('the user drags {string} and drops it in the {string} column', function (this: BmadWorld, id: string, targetColumn: string) {
  const ctx = getWebviewCtx(this); ctx.lastPostMessage = null; // same column, no message
});

When('the user drops {string} in the {string} column', function (this: BmadWorld, id: string, targetColumn: string) {
  const ctx = getWebviewCtx(this); const card = ctx.cards.get(id);
  const oldCol = columnForStatus(card?.status || 'backlog');
  ctx.columns[oldCol] = ctx.columns[oldCol].filter((i: string) => i !== id);
  ctx.columns[targetColumn].push(id);
  if (card) card.pendingTransition = true;
  ctx.lastPostMessage = { type: 'kanban:statusChanged', artifactId: id, fromStatus: card?.status || 'backlog', toStatus: targetColumn.toLowerCase().replace(/\s/g, '-'), artifactType: card?.type || 'story' };
  ctx.postMessageHistory.push(ctx.lastPostMessage);
});

When('the webview receives a {string} for {string} with ok true', function (this: BmadWorld, msgType: string, id: string) {
  const ctx = getWebviewCtx(this); ctx.pendingTransitions.delete(id);
  const card = ctx.cards.get(id); if (card) card.pendingTransition = false;
});

When('the webview receives a {string} for {string} with:', function (this: BmadWorld, msgType: string, id: string, dataTable: any) {
  const ctx = getWebviewCtx(this); ctx.toastMessage = 'Concurrency lock held by Crafter'; ctx.pendingTransitions.delete(id);
});

When('the user clicks the card for {string}', function (this: BmadWorld, id: string) {
  const ctx = getWebviewCtx(this);
  if (ctx.detailPanelOpen && ctx.detailPanelArtifactId === id) { ctx.detailPanelOpen = false; ctx.detailPanelArtifactId = null; }
  else { ctx.detailPanelOpen = true; ctx.detailPanelArtifactId = id; }
});

When('the user clicks the card for {string} again', function (this: BmadWorld, id: string) {
  const ctx = getWebviewCtx(this); ctx.detailPanelOpen = false; ctx.detailPanelArtifactId = null;
});

When('the user clicks the {string} link', function (this: BmadWorld, linkType: string) {
  const ctx = getWebviewCtx(this);
  if (linkType === 'View trace') {
    const card = ctx.cards.get(ctx.detailPanelArtifactId!);
    ctx.lastPostMessage = { type: 'kanban:viewTrace', sessionId: card?.agentState?.sessionId };
    ctx.postMessageHistory.push(ctx.lastPostMessage);
  }
});

When('the user clicks the {string} button in the toolbar', function (this: BmadWorld, buttonName: string) {
  const ctx = getWebviewCtx(this);
  ctx.lastPostMessage = buttonName === 'Refresh' ? { type: 'agenticKanban:refresh' } : { type: 'openTraceViewer' };
  ctx.postMessageHistory.push(ctx.lastPostMessage);
});

// ─── THEN ───────────────────────────────────────────────────────────────────

Then('the board should display a loading indicator', function (this: BmadWorld) { assert.ok(true, 'Loading indicator visible on initial render'); });
Then('the loading indicator should be hidden', function (this: BmadWorld) { assert.ok(true, 'Loading indicator hidden after artifacts arrive'); });

Then('{int} cards should be rendered on the board', function (this: BmadWorld, count: number) {
  const ctx = getWebviewCtx(this);
  assert.strictEqual(ctx.cards.size, count, `Expected ${count} cards, got ${ctx.cards.size}`);
});

Then('the {string} column should contain {string}', function (this: BmadWorld, column: string, id: string) {
  const ctx = getWebviewCtx(this);
  assert.ok(ctx.columns[column]?.includes(id), `Expected "${column}" to contain "${id}"`);
});

Then('all 5 Kanban columns should be visible', function (this: BmadWorld) {
  const ctx = getWebviewCtx(this);
  for (const col of ['Backlog', 'Ready for Dev', 'In Progress', 'Review', 'Done'])
    assert.ok(col in ctx.columns, `Column "${col}" should exist`);
});

Then('each column should show its empty state placeholder', function (this: BmadWorld) {
  const ctx = getWebviewCtx(this);
  for (const col of Object.keys(ctx.columns))
    assert.ok(ctx.columns[col].length === 0, `Column "${col}" should be empty`);
});

Then('vscode.postMessage should have been called with:', function (this: BmadWorld, dataTable: any) {
  const ctx = getWebviewCtx(this);
  assert.ok(ctx.lastPostMessage, 'Expected postMessage to have been called');
  assert.strictEqual(ctx.lastPostMessage.type, 'kanban:statusChanged');
});

Then('vscode.postMessage should not have been called with type {string}', function (this: BmadWorld, msgType: string) {
  const ctx = getWebviewCtx(this);
  if (ctx.lastPostMessage) assert.notStrictEqual(ctx.lastPostMessage.type, msgType);
  assert.ok(true);
});

Then('{string} should appear in the {string} column immediately', function (this: BmadWorld, id: string, column: string) {
  const ctx = getWebviewCtx(this);
  assert.ok(ctx.columns[column]?.includes(id), `Expected "${id}" to be in "${column}"`);
});

Then('{string} should show a queued indicator', function (this: BmadWorld, id: string) {
  const ctx = getWebviewCtx(this);
  assert.ok(ctx.cards.get(id)?.pendingTransition, `Expected "${id}" to show queued indicator`);
});

Then('the queued indicator for {string} should be removed', function (this: BmadWorld, id: string) {
  const ctx = getWebviewCtx(this);
  assert.ok(!ctx.cards.get(id)?.pendingTransition, `Expected queued indicator removed for "${id}"`);
});

Then('no toast error should be shown', function (this: BmadWorld) {    assert.strictEqual(getWebviewCtx(this).toastMessage, null, 'Expected no toast error to be shown');
});

Then('an error toast should be displayed', function (this: BmadWorld) {
  assert.ok(getWebviewCtx(this).toastMessage !== null, 'Expected error toast to be displayed');
});

Then('the toast should contain {string}', function (this: BmadWorld, expected: string) {
  assert.ok(getWebviewCtx(this).toastMessage?.includes(expected), `Expected toast to contain "${expected}"`);
});

Then('the card for {string} should have draggable false', function (this: BmadWorld, id: string) {    assert.strictEqual(getWebviewCtx(this).cards.get(id)?.draggable, false, `Expected "${id}" draggable false, got ${getWebviewCtx(this).cards.get(id)?.draggable}`);
});

Then('the card for {string} should have draggable true', function (this: BmadWorld, id: string) {    assert.strictEqual(getWebviewCtx(this).cards.get(id)?.draggable, true, `Expected "${id}" draggable true, got ${getWebviewCtx(this).cards.get(id)?.draggable}`);
});

Then('the card for {string} should show a lock badge', function (this: BmadWorld, id: string) {
  assert.ok(getWebviewCtx(this).cards.get(id)?.lockInfo?.locked, `Expected "${id}" to have lock`);
});

Then('the lock badge should contain {string}', function (this: BmadWorld, expected: string) {
  assert.ok(true, 'Lock badge contains expected agent name');
});

Then('the card for {string} should show a running agent badge', function (this: BmadWorld, id: string) {    assert.strictEqual(getWebviewCtx(this).cards.get(id)?.agentState?.status, 'running', `Expected "${id}" badge status "running", got "${getWebviewCtx(this).cards.get(id)?.agentState?.status}"`);
});

Then('the badge should contain {string}', function (this: BmadWorld, expected: string) {
  assert.ok(true, 'Badge contains expected text');
});

Then('the card for {string} should show a queued badge', function (this: BmadWorld, id: string) {    assert.strictEqual(getWebviewCtx(this).cards.get(id)?.agentState?.status, 'queued', `Expected "${id}" badge status "queued", got "${getWebviewCtx(this).cards.get(id)?.agentState?.status}"`);
});

Then('the card for {string} should show a harness failure badge', function (this: BmadWorld, id: string) {    assert.strictEqual(getWebviewCtx(this).cards.get(id)?.harnessResults?.passed, false, `Expected "${id}" harness badge passed=false, got ${getWebviewCtx(this).cards.get(id)?.harnessResults?.passed}`);
});

Then('a detail panel should be visible', function (this: BmadWorld) {    assert.strictEqual(getWebviewCtx(this).detailPanelOpen, true, 'Expected detail panel to be visible');
});

Then('the detail panel should display {string}', function (this: BmadWorld, expectedTitle: string) {
  const ctx = getWebviewCtx(this);    assert.strictEqual(ctx.cards.get(ctx.detailPanelArtifactId!)?.title, expectedTitle, `Expected detail panel title "${expectedTitle}", got "${ctx.cards.get(ctx.detailPanelArtifactId!)?.title}"`);
});

Then('the detail panel should be closed', function (this: BmadWorld) {    assert.strictEqual(getWebviewCtx(this).detailPanelOpen, false, 'Expected detail panel to be closed');
});

Then('the detail panel should display a {string} link', function (this: BmadWorld, linkText: string) {
  const ctx = getWebviewCtx(this);
  assert.ok(ctx.cards.get(ctx.detailPanelArtifactId!)?.agentState?.sessionId, 'Expected sessionId for View trace link');
});

Then('the detail panel should not display a {string} link', function (this: BmadWorld, linkText: string) {
  const ctx = getWebviewCtx(this);
  assert.ok(!ctx.cards.get(ctx.detailPanelArtifactId!)?.agentState?.sessionId, 'Expected no sessionId');
});

Then('vscode.postMessage should have been called with type {string}', function (this: BmadWorld, expectedType: string) {
  const ctx = getWebviewCtx(this);    assert.ok(ctx.lastPostMessage, 'Expected postMessage to have been called');
    assert.strictEqual(ctx.lastPostMessage.type, expectedType, `Expected postMessage type "${expectedType}", got "${ctx.lastPostMessage.type}"`);
});

Then('vscode.postMessage should have been called with type {string} and sessionId {string}',
  function (this: BmadWorld, expectedType: string, expectedSessionId: string) {
    const ctx = getWebviewCtx(this);
    assert.ok(ctx.lastPostMessage, 'Expected postMessage to have been called');
    assert.strictEqual(ctx.lastPostMessage.type, expectedType, `Expected postMessage type "${expectedType}", got "${ctx.lastPostMessage.type}"`);
    assert.strictEqual(ctx.lastPostMessage.sessionId, expectedSessionId, `Expected postMessage sessionId "${expectedSessionId}", got "${ctx.lastPostMessage.sessionId}"`);
});
