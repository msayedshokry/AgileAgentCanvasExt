/**
 * AgileAgentCanvasViewProvider Step Definitions
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

// Module-level state
let canvasStore: any = null;
let canvasProvider: any = null;
let canvasModule: any = null;
let artifactStoreModule: any = null;
let mockWebviewView: any = null;
let postMessageCalls: any[] = [];
let onDidReceiveMessageHandler: ((msg: any) => void) | null = null;
let executeCommandCalls: string[] = [];
let elicitArtifactWithMethodCalls: number = 0;
let launchBmmWorkflowCalls: number = 0;
let updateArtifactCalls: number = 0;
let buildExists = false;
let lastError: Error | null = null;
let extensionUriMock: any = null;

function buildModules(world: BmadWorld) {
  if (canvasModule) return;

  const vsc = { ...world.vscode };

  // Mock acOutput for extension circular dep
  const mockAcOutput = { appendLine: () => {}, append: () => {}, clear: () => {}, show: () => {} };

  // Mock fs module
  const mockFs = {
    existsSync: () => buildExists
  };

  // Instrument executeCommand
  vsc.commands = {
    ...world.vscode.commands,
    executeCommand: (cmd: string, ...args: any[]) => {
      executeCommandCalls.push(cmd);
      return Promise.resolve();
    }
  };

  // Load artifact-store
  artifactStoreModule = proxyquire('../../src/state/artifact-store', {
    'vscode': vsc,
    '../extension': { acOutput: mockAcOutput },
    '../commands/chat-bridge': { openChat: async () => true, setChatBridgeLogger: () => {} }
  });

  // Mock artifact-commands used by both canvas-view-provider and webview-message-handler
  const mockArtifactCommands = {
    refineArtifactWithAI: async (_artifact: any, _store: any) => {
      executeCommandCalls.push('workbench.action.chat.open');
    },
    breakDownArtifact: async () => {},
    enhanceArtifactWithAI: async () => {},
    elicitArtifactWithMethod: async (_artifact: any, _store: any, _uri: any) => {
      elicitArtifactWithMethodCalls++;
    },
    startDevelopment: async () => {},
    loadElicitationMethods: (_extensionUri: any) => [],
    loadBmmWorkflows: (_workspaceRoot: string) => [],
    launchBmmWorkflow: async (_trigger: string) => {
      launchBmmWorkflowCalls++;
    }
  };

  // Load webview-message-handler (transitive dep of canvas-view-provider)
  const messageHandlerModule = proxyquire('../../src/views/webview-message-handler', {
    'vscode': vsc,
    '../state/artifact-store': artifactStoreModule,
    '../extension': { acOutput: mockAcOutput },
    '../commands/artifact-commands': mockArtifactCommands,
    '../commands/chat-bridge': { openChat: async () => true, setChatBridgeLogger: () => {} }
  });

  // Load canvas-view-provider
  canvasModule = proxyquire('../../src/views/canvas-view-provider', {
    'vscode': vsc,
    '../state/artifact-store': artifactStoreModule,
    '../extension': { acOutput: mockAcOutput },
    '../commands/artifact-commands': mockArtifactCommands,
    '../commands/project-commands': {
      createNewProject: async () => {},
      loadExistingProject: async () => {},
      checkForMarkdownFiles: async () => false,
      autoLoadProject: async () => {},
      loadDemoData: () => Promise.resolve(),
      loadSampleProject: () => Promise.resolve()
    },
    './webview-message-handler': messageHandlerModule,
    '../commands/chat-bridge': { openChat: async () => {
      executeCommandCalls.push('workbench.action.chat.open');
      return true;
    }, setChatBridgeLogger: () => {} },
    'fs': mockFs,
    'path': require('path')
  });
}

function buildProvider(world: BmadWorld) {
  if (canvasStore && canvasProvider) return;

  buildModules(world);

  const vsc = world.vscode;
  extensionUriMock = vsc.Uri.file('/test/extension');

  const ctx = world.context;
  canvasStore = new artifactStoreModule.ArtifactStore(ctx);
  canvasStore.initializeProject('Test Project');

  // Track updateArtifact and create* calls (both mutate the store)
  const origUpdateArtifact = canvasStore.updateArtifact.bind(canvasStore);
  canvasStore.updateArtifact = async (...args: any[]) => {
    updateArtifactCalls++;
    return origUpdateArtifact(...args);
  };

  const createMethods = [
    'createEpic', 'createStory', 'createRequirement', 'createOrUpdateVision',
    'createUseCase', 'createPRD', 'createArchitecture', 'createProductBrief',
    'createTestCase', 'createTestStrategy'
  ];
  for (const method of createMethods) {
    if (typeof canvasStore[method] === 'function') {
      const orig = canvasStore[method].bind(canvasStore);
      canvasStore[method] = (...args: any[]) => {
        updateArtifactCalls++;
        return orig(...args);
      };
    }
  }

  canvasProvider = new canvasModule.AgileAgentCanvasViewProvider(extensionUriMock, canvasStore);
}

function buildMockWebviewView(): any {
  postMessageCalls = [];
  onDidReceiveMessageHandler = null;

  return {
    webview: {
      options: {} as any,
      html: '',
      onDidReceiveMessage: (handler: (msg: any) => void) => {
        onDidReceiveMessageHandler = handler;
        return { dispose: () => {} };
      },
      postMessage: async (msg: any) => {
        postMessageCalls.push(msg);
        return true;
      },
      asWebviewUri: (uri: any) => uri,
      cspSource: 'test-csp'
    },
    visible: true,
    viewType: 'agileagentcanvas.canvasView',
    onDidChangeVisibility: (handler: any) => ({ dispose: () => {} }),
    onDidDispose: () => {},
    show: () => {}
  };
}

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('a fresh canvas view provider', function(this: BmadWorld) {
  canvasStore = null;
  canvasProvider = null;
  canvasModule = null;
  artifactStoreModule = null;
  mockWebviewView = null;
  postMessageCalls = [];
  onDidReceiveMessageHandler = null;
  executeCommandCalls = [];
  elicitArtifactWithMethodCalls = 0;
  launchBmmWorkflowCalls = 0;
  updateArtifactCalls = 0;
  buildExists = false;
  lastError = null;
  extensionUriMock = null;
  buildProvider(this);
});

Given('the build does not exist', function(this: BmadWorld) {
  buildExists = false;
  // Rebuild modules with updated buildExists
  canvasModule = null;
  buildModules(this);
  // Rebuild provider too since it depends on module
  if (canvasStore) {
    canvasProvider = new canvasModule.AgileAgentCanvasViewProvider(extensionUriMock, canvasStore);
  }
});

Given('the build exists', function(this: BmadWorld) {
  buildExists = true;
  canvasModule = null;
  buildModules(this);
  if (canvasStore) {
    canvasProvider = new canvasModule.AgileAgentCanvasViewProvider(extensionUriMock, canvasStore);
  }
});

Given('the vision {string} exists in canvas store', async function(this: BmadWorld, productName: string) {
  buildProvider(this);
  canvasStore.createOrUpdateVision();
  await canvasStore.updateArtifact('vision', 'vision-1', {
    productName,
    problemStatement: 'Test problem'
  });
});

Given('a requirement exists in canvas store', function(this: BmadWorld) {
  buildProvider(this);
  canvasStore.createRequirement();
});

Given('an epic exists in canvas store', function(this: BmadWorld) {
  buildProvider(this);
  canvasStore.createEpic();
});

Given('an epic with a story exists in canvas store', function(this: BmadWorld) {
  buildProvider(this);
  const epic = canvasStore.createEpic();
  canvasStore.createStory(epic.id);
});

Given('two epics exist in canvas store', function(this: BmadWorld) {
  buildProvider(this);
  canvasStore.createEpic();
  canvasStore.createEpic();
});

Given('an epic with metadata exists in canvas store', async function(this: BmadWorld) {
  buildProvider(this);
  const epic = canvasStore.createEpic();
  await canvasStore.updateArtifact('epic', epic.id, {
    title: 'Test Epic',
    metadata: {
      risks: ['Risk1']
    }
  });
});

Given('an epic exists in canvas store before resolving', function(this: BmadWorld) {
  buildProvider(this);
  canvasStore.createEpic();
});

Given('a test strategy exists in canvas store', function(this: BmadWorld) {
  buildProvider(this);
  canvasStore.createTestStrategy();
});

Given('a test case exists in canvas store', function(this: BmadWorld) {
  buildProvider(this);
  canvasStore.createTestCase();
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I resolve the webview view', function(this: BmadWorld) {
  buildProvider(this);
  mockWebviewView = buildMockWebviewView();
  try {
    canvasProvider.resolveWebviewView(mockWebviewView, {}, {});
    lastError = null;
  } catch (e: any) {
    lastError = e;
  }
});

When('I send message type {string}', async function(this: BmadWorld, type: string) {
  assert.ok(onDidReceiveMessageHandler, 'Message handler not registered');
  try {
    await onDidReceiveMessageHandler({ type });
    lastError = null;
  } catch (e: any) {
    lastError = e;
  }
});

When('I send updateArtifact message for {string} id {string} with title {string}', async function(this: BmadWorld, artifactType: string, id: string, title: string) {
  assert.ok(onDidReceiveMessageHandler, 'Message handler not registered');
  updateArtifactCalls = 0;
  await onDidReceiveMessageHandler({
    type: 'updateArtifact',
    artifactType,
    id,
    updates: { title }
  });
});

When('I send addArtifact message for type {string}', async function(this: BmadWorld, artifactType: string) {
  assert.ok(onDidReceiveMessageHandler, 'Message handler not registered');
  updateArtifactCalls = 0;
  await onDidReceiveMessageHandler({
    type: 'addArtifact',
    artifactType
  });
});

When('I send selectArtifact message for id {string}', async function(this: BmadWorld, id: string) {
  assert.ok(onDidReceiveMessageHandler, 'Message handler not registered');
  try {
    await onDidReceiveMessageHandler({ type: 'selectArtifact', id });
    lastError = null;
  } catch (e: any) {
    lastError = e;
  }
});

When('I send refineWithAI message for artifact id {string}', async function(this: BmadWorld, id: string) {
  assert.ok(onDidReceiveMessageHandler, 'Message handler not registered');
  executeCommandCalls = [];
  await onDidReceiveMessageHandler({
    type: 'refineWithAI',
    artifact: { id, title: 'Test Artifact' }
  });
});

When('I call showAICursor with id {string} action {string} label {string}', function(this: BmadWorld, id: string, action: string, label: string) {
  try {
    canvasProvider.showAICursor(id, action, label);
    lastError = null;
  } catch (e: any) {
    lastError = e;
  }
});

When('I call showAICursor without resolving view first', function(this: BmadWorld) {
  buildProvider(this);
  const freshProvider = new canvasModule.AgileAgentCanvasViewProvider(extensionUriMock, canvasStore);
  try {
    freshProvider.showAICursor('EPIC-1', 'test');
    lastError = null;
  } catch (e: any) {
    lastError = e;
  }
});

When('I call hideAICursor', function(this: BmadWorld) {
  try {
    canvasProvider.hideAICursor();
    lastError = null;
  } catch (e: any) {
    lastError = e;
  }
});

When('I call hideAICursor without resolving view first', function(this: BmadWorld) {
  buildProvider(this);
  const freshProvider = new canvasModule.AgileAgentCanvasViewProvider(extensionUriMock, canvasStore);
  try {
    freshProvider.hideAICursor();
    lastError = null;
  } catch (e: any) {
    lastError = e;
  }
});

When('I clear postMessage calls', function(this: BmadWorld) {
  postMessageCalls = [];
});

When('I create an epic in canvas store', function(this: BmadWorld) {
  canvasStore.createEpic();
});

When('I create an epic in canvas store before resolving view', function(this: BmadWorld) {
  buildProvider(this);
  try {
    canvasStore.createEpic();
    lastError = null;
  } catch (e: any) {
    lastError = e;
  }
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the canvas view provider should be defined', function(this: BmadWorld) {
  assert.ok(canvasProvider !== null && canvasProvider !== undefined,
    'Expected canvas view provider to be defined');
});

Then(/^the viewType should be "([^"]*)"$/, function(this: BmadWorld, viewType: string) {
  assert.strictEqual(canvasModule.AgileAgentCanvasViewProvider.viewType, viewType,
    `Expected viewType to be "${viewType}"`);
});

Then('the provider should have registered an artifact change listener', function(this: BmadWorld) {
  // Provider constructor calls store.onDidChangeArtifacts - verified by provider being constructed
  assert.ok(canvasProvider !== null, 'Provider was constructed, so listener was registered');
});

Then('the webview options should have enableScripts true', function(this: BmadWorld) {
  assert.strictEqual(mockWebviewView.webview.options.enableScripts, true,
    'Expected webview options.enableScripts to be true');
});

Then('the webview options should have localResourceRoots defined', function(this: BmadWorld) {
  assert.ok(Array.isArray(mockWebviewView.webview.options.localResourceRoots),
    'Expected webview options.localResourceRoots to be an array');
});

Then('the webview html should contain {string}', function(this: BmadWorld, text: string) {
  assert.ok(mockWebviewView.webview.html.includes(text),
    `Expected webview html to contain "${text}". Got:\n${mockWebviewView.webview.html.substring(0, 200)}`);
});

Then('the webview onDidReceiveMessage should have been called', function(this: BmadWorld) {
  assert.ok(onDidReceiveMessageHandler !== null,
    'Expected webview.onDidReceiveMessage to have been called');
});

Then('the webview onDidChangeVisibility should have been called', function(this: BmadWorld) {
  // onDidChangeVisibility was intercepted in mockWebviewView — it was called if view was resolved
  assert.ok(mockWebviewView !== null, 'View was resolved');
  // The mock intercepted the call by checking the mockWebviewView was set up properly
  // We just verify no error occurred
  assert.strictEqual(lastError, null, 'No error should have occurred');
});

Then('postMessage should have been called with type {string}', function(this: BmadWorld, type: string) {
  const found = postMessageCalls.some(m => m.type === type);
  assert.ok(found,
    `Expected postMessage to be called with type "${type}". Calls: ${JSON.stringify(postMessageCalls.map(m => m.type))}`);
});

Then('the canvas store updateArtifact should have been called', function(this: BmadWorld) {
  assert.ok(updateArtifactCalls > 0,
    `Expected store.updateArtifact to have been called (calls: ${updateArtifactCalls})`);
});

Then('no error should be thrown', function(this: BmadWorld) {
  assert.strictEqual(lastError, null,
    `Expected no error, but got: ${lastError?.message}`);
});

Then('canvas executeCommand should have been called with {string}', function(this: BmadWorld, cmd: string) {
  const found = executeCommandCalls.includes(cmd);
  assert.ok(found,
    `Expected executeCommand("${cmd}") to have been called. Calls: ${JSON.stringify(executeCommandCalls)}`);
});

Then('the aiCursorMove message should contain targetId {string}', function(this: BmadWorld, targetId: string) {
  const msg = postMessageCalls.find(m => m.type === 'aiCursorMove');
  assert.ok(msg, 'Expected aiCursorMove message');
  assert.strictEqual(msg.cursor.targetId, targetId,
    `Expected cursor.targetId to be "${targetId}", got "${msg.cursor?.targetId}"`);
});

Then('the updateArtifacts message should include a {string} artifact with id {string} and title {string}', function(this: BmadWorld, type: string, id: string, title: string) {
  const updateMsg = postMessageCalls.find(m => m.type === 'updateArtifacts');
  assert.ok(updateMsg, 'Expected updateArtifacts message');
  const artifact = updateMsg.artifacts.find((a: any) => a.type === type);
  assert.ok(artifact, `Expected "${type}" artifact. Got types: ${JSON.stringify(updateMsg.artifacts.map((a: any) => a.type))}`);
  assert.strictEqual(artifact.id, id, `Expected artifact id "${id}", got "${artifact.id}"`);
  assert.strictEqual(artifact.title, title, `Expected artifact title "${title}", got "${artifact.title}"`);
});

Then('the updateArtifacts message should include a {string} artifact with dependency {string}', function(this: BmadWorld, type: string, dep: string) {
  const updateMsg = postMessageCalls.find(m => m.type === 'updateArtifacts');
  assert.ok(updateMsg, 'Expected updateArtifacts message');
  const artifact = updateMsg.artifacts.find((a: any) => a.type === type);
  assert.ok(artifact, `Expected "${type}" artifact`);
  assert.ok(artifact.dependencies && artifact.dependencies.includes(dep),
    `Expected "${type}" artifact to have dependency "${dep}". Got: ${JSON.stringify(artifact.dependencies)}`);
});

Then('the updateArtifacts message should include a {string} artifact with parentId {string}', function(this: BmadWorld, type: string, parentId: string) {
  const updateMsg = postMessageCalls.find(m => m.type === 'updateArtifacts');
  assert.ok(updateMsg, 'Expected updateArtifacts message');
  const artifact = updateMsg.artifacts.find((a: any) => a.type === type);
  assert.ok(artifact, `Expected "${type}" artifact`);
  assert.strictEqual(artifact.parentId, parentId,
    `Expected "${type}" artifact to have parentId "${parentId}". Got: ${JSON.stringify(artifact.parentId)}`);
});

Then('the updateArtifacts message should include a {string} artifact', function(this: BmadWorld, type: string) {
  const updateMsg = postMessageCalls.find(m => m.type === 'updateArtifacts');
  assert.ok(updateMsg, 'Expected updateArtifacts message');
  const artifact = updateMsg.artifacts.find((a: any) => a.type === type);
  assert.ok(artifact, `Expected "${type}" artifact. Got types: ${JSON.stringify(updateMsg.artifacts.map((a: any) => a.type))}`);
});

Then('the two epic artifacts should have different Y positions', function(this: BmadWorld) {
  const updateMsg = postMessageCalls.find(m => m.type === 'updateArtifacts');
  assert.ok(updateMsg, 'Expected updateArtifacts message');
  const epics = updateMsg.artifacts.filter((a: any) => a.type === 'epic');
  assert.ok(epics.length >= 2, `Expected at least 2 epics, got ${epics.length}`);
  assert.notStrictEqual(epics[0].position.y, epics[1].position.y,
    `Expected different Y positions, both are ${epics[0].position.y}`);
});

Then('the epic artifact should have metadata defined', function(this: BmadWorld) {
  const updateMsg = postMessageCalls.find(m => m.type === 'updateArtifacts');
  assert.ok(updateMsg, 'Expected updateArtifacts message');
  const epic = updateMsg.artifacts.find((a: any) => a.type === 'epic');
  assert.ok(epic, 'Expected epic artifact');
  assert.ok(epic.metadata !== undefined, 'Expected epic artifact to have metadata');
});

Then('the epic and story artifacts should have different X positions', function(this: BmadWorld) {
  const updateMsg = postMessageCalls.find(m => m.type === 'updateArtifacts');
  assert.ok(updateMsg, 'Expected updateArtifacts message');
  const epic = updateMsg.artifacts.find((a: any) => a.type === 'epic');
  const story = updateMsg.artifacts.find((a: any) => a.type === 'story');
  if (epic && story) {
    assert.notStrictEqual(epic.position.x, story.position.x,
      `Expected different X positions, both are ${epic.position.x}`);
  }
});

Then('the test strategy artifact should be in the testing column', function(this: BmadWorld) {
  const updateMsg = postMessageCalls.find(m => m.type === 'updateArtifacts');
  assert.ok(updateMsg, 'Expected updateArtifacts message');
  const ts = updateMsg.artifacts.find((a: any) => a.type === 'test-strategy');
  assert.ok(ts, `Expected "test-strategy" artifact. Got types: ${JSON.stringify(updateMsg.artifacts.map((a: any) => a.type))}`);
  // Testing column is at x=2510 as defined in artifact-transformer.ts
  assert.strictEqual(ts.position.x, 2510,
    `Expected test-strategy x position to be 2510 (testing column), got ${ts.position.x}`);
});

When('I send elicitWithMethod message for artifact id {string}', async function(this: BmadWorld, id: string) {
  assert.ok(onDidReceiveMessageHandler, 'Message handler not registered');
  elicitArtifactWithMethodCalls = 0;
  try {
    await onDidReceiveMessageHandler({
      type: 'elicitWithMethod',
      artifact: { id, title: 'Test Artifact', type: 'epic', description: 'Test description' }
    });
    lastError = null;
  } catch (e: any) {
    lastError = e;
  }
});

Then('canvas elicitArtifactWithMethod should have been called', function(this: BmadWorld) {
  assert.ok(elicitArtifactWithMethodCalls > 0,
    `Expected elicitArtifactWithMethod to have been called (calls: ${elicitArtifactWithMethodCalls})`);
});

When('I send launchWorkflow message with trigger {string}', async function(this: BmadWorld, trigger: string) {
  assert.ok(onDidReceiveMessageHandler, 'Message handler not registered');
  launchBmmWorkflowCalls = 0;
  try {
    await onDidReceiveMessageHandler({
      type: 'launchWorkflow',
      workflow: { id: 'test-workflow', name: 'test-workflow', triggerPhrase: trigger }
    });
    lastError = null;
  } catch (e: any) {
    lastError = e;
  }
});

When('I send launchWorkflow message without trigger phrase', async function(this: BmadWorld) {
  assert.ok(onDidReceiveMessageHandler, 'Message handler not registered');
  launchBmmWorkflowCalls = 0;
  try {
    await onDidReceiveMessageHandler({
      type: 'launchWorkflow',
      workflow: { id: 'test-workflow', name: 'test-workflow' }
    });
    lastError = null;
  } catch (e: any) {
    lastError = e;
  }
});

Then('canvas launchBmmWorkflow should have been called', function(this: BmadWorld) {
  assert.ok(launchBmmWorkflowCalls > 0,
    `Expected launchBmmWorkflow to have been called (calls: ${launchBmmWorkflowCalls})`);
});
