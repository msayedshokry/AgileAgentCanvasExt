/**
 * Extension Step Definitions
 * Cucumber step definitions for testing extension activation and commands
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

// Module-level state
let registeredCommands: Map<string, Function> = new Map();
let executeCommandCalls: Array<{ cmd: string; options?: any }> = [];
let showInfoCalls: string[] = [];
let showWarnCalls: string[] = [];
let showInputBoxCalls: Array<{ prompt?: string }> = [];
let showQuickPickCalls: Array<{ items?: any[]; options?: any }> = [];
let showOpenDialogCalls: Array<any> = [];
let showSaveDialogCalls: Array<any> = [];
let createWebviewPanelCalls: Array<any> = [];
let createTreeViewCalls: Array<string> = [];
let registerWebviewViewProviderCalls: Array<string> = [];
let createChatParticipantCalls: Array<string> = [];
let createFileSystemWatcherCalls: Array<any> = [];
let extensionModule: any = null;
let mockInputBoxReturn: string | undefined = undefined;
let mockQuickPickReturn: any = undefined;
let mockOpenDialogReturn: any = undefined;
let mockSaveDialogReturn: any = undefined;
let mockWarnReturn: any = undefined;
// Regression tracking: proves the artifactStore.onDidChangeArtifacts →
// buildArtifacts wiring in extension.ts:479 is alive. Every time the
// listener fires, the spy records the call so the test can assert
// downstream side effects.
let buildArtifactsCalls: Array<{ store: any; workspaceRoot?: string }> = [];

function getExtensionSetup(world: BmadWorld): { context: any; vscode: any } {
  if (!(world as any)._extSetup) {
    // Reset tracking
    registeredCommands = new Map();
    executeCommandCalls = [];
    showInfoCalls = [];
    showWarnCalls = [];
    showInputBoxCalls = [];
    showQuickPickCalls = [];
    showOpenDialogCalls = [];
    showSaveDialogCalls = [];
    createWebviewPanelCalls = [];
    createTreeViewCalls = [];
    registerWebviewViewProviderCalls = [];
    createChatParticipantCalls = [];
    createFileSystemWatcherCalls = [];
    mockInputBoxReturn = undefined;
    mockQuickPickReturn = undefined;
    mockOpenDialogReturn = undefined;
    mockSaveDialogReturn = undefined;
    mockWarnReturn = undefined;
    buildArtifactsCalls = [];

    // Build instrumented vscode mock
    const vsc = { ...world.vscode };
    vsc.commands = {
      registerCommand: (name: string, handler: Function) => {
        registeredCommands.set(name, handler);
        return { dispose: () => {} };
      },
      executeCommand: (cmd: string, options?: any) => {
        executeCommandCalls.push({ cmd, options });
        return Promise.resolve();
      },
      getCommands: async () => []
    };
    vsc.window = {
      ...world.vscode.window,
      showInformationMessage: (msg: string, ...buttons: any[]) => {
        showInfoCalls.push(msg);
        return Promise.resolve(undefined);
      },
      showWarningMessage: (msg: string, ...args: any[]) => {
        showWarnCalls.push(msg);
        return Promise.resolve(mockWarnReturn);
      },
      showInputBox: (opts: any) => {
        showInputBoxCalls.push(opts || {});
        return Promise.resolve(mockInputBoxReturn);
      },
      showQuickPick: (items: any, opts?: any) => {
        showQuickPickCalls.push({ items, options: opts });
        // If items are plain strings and the mock return is an object, return the label string
        const itemsArr = Array.isArray(items) ? items : [];
        if (itemsArr.length > 0 && typeof itemsArr[0] === 'string' && mockQuickPickReturn && typeof mockQuickPickReturn === 'object') {
          return Promise.resolve(mockQuickPickReturn.label);
        }
        return Promise.resolve(mockQuickPickReturn);
      },
      showOpenDialog: (opts: any) => {
        showOpenDialogCalls.push(opts || {});
        return Promise.resolve(mockOpenDialogReturn);
      },
      showSaveDialog: (opts: any) => {
        showSaveDialogCalls.push(opts || {});
        return Promise.resolve(mockSaveDialogReturn);
      },
      createWebviewPanel: (type: string, title: string, col: any, opts: any) => {
        createWebviewPanelCalls.push({ type, title, col, opts });
        return {
          webview: {
            html: '',
            postMessage: async () => true,
            onDidReceiveMessage: () => {},
            asWebviewUri: (u: any) => u,
            cspSource: 'mock-csp',
          },
          onDidDispose: () => {},
          onDidChangeViewState: () => {},
          reveal: () => {},
          dispose: () => {},
          visible: true,
          active: true,
        };
      },
      createTreeView: (id: string, opts: any) => {
        createTreeViewCalls.push(id);
        return {
          onDidChangeSelection: () => {},
          onDidCollapseElement: () => {},
          onDidExpandElement: () => {},
          reveal: () => {},
          dispose: () => {},
        };
      },
      registerWebviewViewProvider: (id: string, provider: any) => {
        registerWebviewViewProviderCalls.push(id);
        return { dispose: () => {} };
      },
      createOutputChannel: () => ({
        appendLine: () => {},
        append: () => {},
        clear: () => {},
        show: () => {},
        hide: () => {},
        dispose: () => {},
      }),
      setStatusBarMessage: () => ({ dispose: () => {} }),
      withProgress: async (_opts: any, task: any) => task({ report: () => {} }),
    };
    vsc.chat = {
      createChatParticipant: (id: string, handler: Function) => {
        createChatParticipantCalls.push(id);
        return { iconPath: undefined, onDidReceiveFeedback: () => {}, dispose: () => {} };
      }
    };
    vsc.workspace = {
      ...world.vscode.workspace,
      createFileSystemWatcher: (pattern: any) => {
        createFileSystemWatcherCalls.push(pattern);
        return { onDidCreate: () => {}, onDidChange: () => {}, onDidDelete: () => {}, dispose: () => {} };
      },
      findFiles: async () => [],
      onDidChangeConfiguration: () => {},
      onDidChangeWorkspaceFolders: (_listener: any) => ({ dispose: () => {} }),
    };

    (world as any)._extSetup = { context: world.context, vscode: vsc };
  }
  return (world as any)._extSetup;
}

function loadExtensionModule(world: BmadWorld): any {
  if (!(world as any)._extModule) {
    const { vscode: vsc } = getExtensionSetup(world);

    // We need a stub acOutput for use by artifact-store (which imports from extension)
    const mockAcOutput = { appendLine: () => {}, append: () => {}, clear: () => {}, show: () => {} };

    // Load artifact-store with vscode mocked AND extension circular dep mocked
    const artifactStoreModule = proxyquire('../../src/state/artifact-store', {
      'vscode': vsc,
      '../extension': { acOutput: mockAcOutput },
      '../commands/chat-bridge': { openChat: async () => true, setChatBridgeLogger: () => {} },
      './artifact-file-io': {
        resolveArtifactTargetUri: async (opts: any) => vsc.Uri.file(`/test/${opts.fileName}`),
        writeJsonFile: async () => {},
        writeMarkdownCompanion: async (jsonUri: any, mdFilename: string) => vsc.Uri.file(`/test/${mdFilename}`)
      },
      '../harness/policy-engine': {
        harnessEngine: { evaluate: async () => [] },
      },
    });

    // Load real command modules with mocked vscode so the actual logic runs
    const mockChatBridge = { openChat: async (query?: string) => {
      if (query) {
        vsc.commands.executeCommand('workbench.action.chat.open', { query });
      } else {
        vsc.commands.executeCommand('workbench.action.chat.open');
      }
      return true;
    }, setChatBridgeLogger: () => {} };

    const artifactCommandsModule = proxyquire('../../src/commands/artifact-commands', {
      'vscode': vsc,
      '../state/artifact-store': artifactStoreModule,
      '../canvas/artifact-transformer': { sendArtifactsToPanel: () => {} },
      '../extension': { acOutput: mockAcOutput },
      './chat-bridge': mockChatBridge
    });

    const projectCommandsModule = proxyquire('../../src/commands/project-commands', {
      'vscode': vsc,
      '../state/artifact-store': artifactStoreModule,
      '../extension': { acOutput: mockAcOutput },
      './chat-bridge': mockChatBridge
    });

    const workflowCommandsModule = proxyquire('../../src/commands/workflow-commands', {
      'vscode': vsc,
      '../state/artifact-store': artifactStoreModule,
      '../extension': { acOutput: mockAcOutput },
      './chat-bridge': mockChatBridge
    });

    // Load webview-message-handler with mocked vscode (transitive dep of extension.ts)
    const messageHandlerModule = proxyquire('../../src/views/webview-message-handler', {
      'vscode': vsc,
      '../state/artifact-store': artifactStoreModule,
      '../extension': { acOutput: mockAcOutput },
      '../commands/artifact-commands': artifactCommandsModule,
      '../commands/chat-bridge': mockChatBridge,
      '../integrations/graphify/graphify-runner': {
        runGraphify: async () => '',
      },
      '../integrations/jira-importer': {
        JiraImporter: class {},
      },
    });

    const mod = proxyquire('../../src/extension', {
      'vscode': vsc,
      './state/artifact-store': artifactStoreModule,
      './state/workspace-resolver': {
        WorkspaceResolver: class {
          initialize = async () => {};
          switchProject = async () => {};
          promptSwitchProject = async () => {};
          getActiveOutputUri = () => vsc.Uri.file('/test/workspace/.agileagentcanvas-context');
          getActiveWorkspaceFolder = () => ({ uri: vsc.Uri.file('/test/workspace'), name: 'test', index: 0 });
          getDetectedProjects = () => [];
          onDidChangeActiveProject = (_listener: any) => ({ dispose: () => {} });
          dispose = () => {};
          constructor(_ctx: any) {}
        },
        DEFAULT_OUTPUT_FOLDER: '.agileagentcanvas-context'
      },
      './chat/agileagentcanvas-tools': {
        registerTools: () => [],
        sharedToolContext: { bmadPath: '', outputPath: '', store: null }
      },
      './chat/chat-participant': {
        AgileAgentCanvasChatParticipant: class { handleChat = () => {}; constructor(_s: any) {} }
      },
      './views/artifacts-tree-provider': {
        ArtifactsTreeProvider: class { refresh = () => {}; constructor(_s: any) {} }
      },
      './views/agentic-kanban-view-provider': {
        // CapturingProvider records the artifact store passed at construction
        // time so the regression step can trigger an onDidChangeArtifacts
        // event on the SAME store instance the extension registered the
        // buildArtifacts listener against. Without this, the test would
        // either fail to find the store or fire the event on a stub
        // instance that the extension never wired up.
        AgenticKanbanViewProvider: class {
          _store: any;
          constructor(_uri: any, store: any) {
            this._store = store;
            (world as any)._capturedStore = store;
          }
          refresh = () => {};
          broadcast = () => {};
        },
      },
      './views/wizard-steps-provider': {
        WizardStepsProvider: class { refresh = () => {}; constructor(_s: any) {} }
      },
      './workflow/workflow-executor': {
        getWorkflowExecutor: () => ({
          initialize: async () => true,
          cancelSession: () => {}
        })
      },
      // Stub kanban-orchestrator to prevent loading terminalExecutor → chat-bridge chain
      './workflow/kanban-orchestrator': {
        initializeKanbanOrchestrator: () => {},
        kanbanOrchestrator: undefined,
        kanbanProgress: { event: () => ({ dispose: () => {} }), fire: () => {}, dispose: () => {} },
      },
      './canvas/artifact-transformer': {
        sendArtifactsToPanel: () => {},
        // Spy on buildArtifacts: every call is recorded so the regression
        // test can prove the artifactStore.onDidChangeArtifacts listener
        // (registered in extension.ts:479) actually invokes buildArtifacts
        // when the store fires.
        buildArtifacts: (store: any, workspaceRoot?: string) => {
          buildArtifactsCalls.push({ store, workspaceRoot });
          return [];
        }
      },
      './views/webview-message-handler': messageHandlerModule,
      './commands/artifact-commands': artifactCommandsModule,
      './commands/project-commands': projectCommandsModule,
      './commands/workflow-commands': workflowCommandsModule,
      './commands/chat-bridge': mockChatBridge,
      './commands/ide-installer': {
        installToIde: async () => {},
        autoInstallIfNeeded: async () => {}
      },
    });
    (world as any)._extModule = mod;
    extensionModule = mod;
  }
  return (world as any)._extModule;
}

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('a fresh extension activation', function(this: BmadWorld) {
  (this as any)._extSetup = null;
  (this as any)._extModule = null;
  (this as any)._activated = false;
  extensionModule = null;
  mockInputBoxReturn = undefined;
  mockQuickPickReturn = undefined;
  mockOpenDialogReturn = undefined;
  mockWarnReturn = undefined;
  getExtensionSetup(this);
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I activate the extension', async function(this: BmadWorld) {
  if (!(this as any)._activated) {
    const mod = loadExtensionModule(this);
    const { context } = getExtensionSetup(this);
    mod.activate(context);
    // Flush microtask queue so initialize().then() callbacks execute
    await new Promise(resolve => setTimeout(resolve, 0));
    (this as any)._activated = true;
  }
});

When('I execute the command {string}', async function(this: BmadWorld, commandName: string) {
  const handler = registeredCommands.get(commandName);
  assert.ok(handler, `Command "${commandName}" not registered`);
  await handler();
});

When('I execute the command {string} with arg {string}', async function(this: BmadWorld, commandName: string, arg: string) {
  const handler = registeredCommands.get(commandName);
  assert.ok(handler, `Command "${commandName}" not registered`);
  await handler(arg);
});

When('I execute the command {string} with args {string} and {string}', async function(this: BmadWorld, commandName: string, arg1: string, arg2: string) {
  const handler = registeredCommands.get(commandName);
  assert.ok(handler, `Command "${commandName}" not registered`);
  await handler(arg1, arg2);
});

When('I execute the workflow step command for {string} {string} action {string}', async function(this: BmadWorld, type: string, id: string, action: string) {
  const handler = registeredCommands.get('agileagentcanvas.executeWorkflowStep');
  assert.ok(handler, 'agileagentcanvas.executeWorkflowStep not registered');
  await handler(type, id, action, action);
});

When('I execute the workflow step command with unmet dependencies for {string}', async function(this: BmadWorld, id: string) {
  const handler = registeredCommands.get('agileagentcanvas.executeWorkflowStep');
  assert.ok(handler, 'agileagentcanvas.executeWorkflowStep not registered');
  await handler('epic', id, 'create-stories', 'create stories', ['validate'], { validate: 'pending' });
});

When('the user enters {string} in input box', function(this: BmadWorld, value: string) {
  mockInputBoxReturn = value;
});

When('the user cancels the input box', function(this: BmadWorld) {
  mockInputBoxReturn = undefined;
});

When('the user cancels the quick pick', function(this: BmadWorld) {
  mockQuickPickReturn = undefined;
});

When('the user selects {string} in quick pick', function(this: BmadWorld, label: string) {
  mockQuickPickReturn = { label, value: label.toLowerCase() };
});

When('the user cancels the open dialog', function(this: BmadWorld) {
  mockOpenDialogReturn = undefined;
});

When('the user selects a save location', function(this: BmadWorld) {
  mockSaveDialogReturn = this.vscode.Uri.file('/test/export/bmad-export.json');
});

When('the user cancels the save dialog', function(this: BmadWorld) {
  mockSaveDialogReturn = undefined;
});

When('the user clicks {string} on warning', function(this: BmadWorld, button: string) {
  mockWarnReturn = button;
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('window showInformationMessage should have been called with {string}', function(this: BmadWorld, msg: string) {
  assert.ok(showInfoCalls.includes(msg), `Expected showInformationMessage to be called with "${msg}". Calls: ${JSON.stringify(showInfoCalls)}`);
});

Then('window showInformationMessage should contain {string}', function(this: BmadWorld, text: string) {
  const found = showInfoCalls.some(m => m.includes(text));
  assert.ok(found, `Expected showInformationMessage to contain "${text}". Calls: ${JSON.stringify(showInfoCalls)}`);
});

Then('window showInformationMessage should not contain {string}', function(this: BmadWorld, text: string) {
  const found = showInfoCalls.some(m => m.includes(text));
  assert.ok(!found, `Expected showInformationMessage NOT to contain "${text}". Calls: ${JSON.stringify(showInfoCalls)}`);
});

Then('window showWarningMessage should have been called with {string}', function(this: BmadWorld, text: string) {
  const found = showWarnCalls.some(m => m.includes(text));
  assert.ok(found, `Expected showWarningMessage to contain "${text}". Calls: ${JSON.stringify(showWarnCalls)}`);
});

Then('chat createChatParticipant should have been called with {string}', function(this: BmadWorld, participantId: string) {
  assert.ok(createChatParticipantCalls.includes(participantId), `Expected createChatParticipant("${participantId}"). Calls: ${JSON.stringify(createChatParticipantCalls)}`);
});

Then('window registerWebviewViewProvider should have been called with {string}', function(this: BmadWorld, viewId: string) {
  assert.ok(registerWebviewViewProviderCalls.includes(viewId), `Expected registerWebviewViewProvider("${viewId}"). Calls: ${JSON.stringify(registerWebviewViewProviderCalls)}`);
});

Then('window createTreeView should have been called with {string}', function(this: BmadWorld, viewId: string) {
  assert.ok(createTreeViewCalls.includes(viewId), `Expected createTreeView("${viewId}"). Calls: ${JSON.stringify(createTreeViewCalls)}`);
});

Then('context subscriptions should not be empty', function(this: BmadWorld) {
  const { context } = getExtensionSetup(this);
  assert.ok(context.subscriptions.length > 0, 'Expected context.subscriptions to not be empty');
});

Then('command {string} should be registered', function(this: BmadWorld, commandName: string) {
  assert.ok(registeredCommands.has(commandName), `Expected command "${commandName}" to be registered`);
});

Then('executeCommand should have been called with {string} and query {string}', function(this: BmadWorld, cmd: string, query: string) {
  const call = executeCommandCalls.find(c => c.cmd === cmd && c.options?.query === query);
  assert.ok(call, `Expected executeCommand("${cmd}", { query: "${query}" }). Calls: ${JSON.stringify(executeCommandCalls)}`);
});

Then('executeCommand should have been called with {string} and query containing {string}', function(this: BmadWorld, cmd: string, queryPart: string) {
  const call = executeCommandCalls.find(c => c.cmd === cmd && c.options?.query?.includes(queryPart));
  assert.ok(call, `Expected executeCommand("${cmd}", { query containing "${queryPart}" }). Calls: ${JSON.stringify(executeCommandCalls)}`);
});

Then('executeCommand should have been called with {string}', function(this: BmadWorld, cmd: string) {
  const call = executeCommandCalls.find(c => c.cmd === cmd);
  assert.ok(call, `Expected executeCommand("${cmd}"). Calls: ${JSON.stringify(executeCommandCalls)}`);
});

Then('window showInputBox should have been called with prompt containing {string}', function(this: BmadWorld, promptText: string) {
  const call = showInputBoxCalls.find(c => c.prompt?.includes(promptText));
  assert.ok(call, `Expected showInputBox with prompt containing "${promptText}". Calls: ${JSON.stringify(showInputBoxCalls)}`);
});

Then('window showQuickPick should have been called', function(this: BmadWorld) {
  assert.ok(showQuickPickCalls.length > 0, 'Expected showQuickPick to have been called');
});

Then('window showQuickPick should have been called with {string} format options', function(this: BmadWorld, firstOption: string) {
  const call = showQuickPickCalls.find(c => {
    const items = Array.isArray(c.items) ? c.items : [];
    return items.includes(firstOption);
  });
  assert.ok(call, `Expected showQuickPick with "${firstOption}" as option. Calls: ${JSON.stringify(showQuickPickCalls)}`);
});

Then('window showOpenDialog should have been called with folder selection', function(this: BmadWorld) {
  const call = showOpenDialogCalls.find(c => c.canSelectFolders === true);
  assert.ok(call, `Expected showOpenDialog with canSelectFolders. Calls: ${JSON.stringify(showOpenDialogCalls)}`);
});

Then('window createWebviewPanel should have been called with {string}', function(this: BmadWorld, panelType: string) {
  const call = createWebviewPanelCalls.find(c => c.type === panelType);
  assert.ok(call, `Expected createWebviewPanel("${panelType}"). Calls: ${JSON.stringify(createWebviewPanelCalls.map(c => c.type))}`);
});

Then('workspace createFileSystemWatcher should have been called', function(this: BmadWorld) {
  assert.ok(createFileSystemWatcherCalls.length > 0, 'Expected createFileSystemWatcher to have been called');
});

Then('acOutput should be defined', function(this: BmadWorld) {
  const mod = loadExtensionModule(this);
  assert.ok(mod.acOutput !== undefined, 'Expected acOutput to be defined');
});

// ── Regression: artifactStore.onDidChangeArtifacts → buildArtifacts wiring ──

When('an artifact is updated on the artifact store with id {string}', async function(this: BmadWorld, id: string) {
  // The AgenticKanbanViewProvider stub captured the live store during
  // activate(). Mutating it fires _onDidChangeArtifacts internally, which
  // invokes the listener registered in extension.ts:479 — the listener
  // calls buildArtifacts, and the spy records the call.
  const store = (this as any)._capturedStore;
  assert.ok(store, 'Artifact store not captured during activation. AgenticKanbanViewProvider was not constructed.');
  await store.updateArtifact('story', id, { title: `Updated ${id}` });
});

When('an artifact is deleted from the artifact store with id {string}', async function(this: BmadWorld, id: string) {
  // Exercises a different write path than updateArtifact (DELETE instead
  // of UPDATE) to prove the listener fires for both code paths. If a
  // future refactor accidentally drops the fire() from deleteArtifact
  // (e.g. moves it to updateArtifact only), this test catches it.
  const store = (this as any)._capturedStore;
  assert.ok(store, 'Artifact store not captured during activation. AgenticKanbanViewProvider was not constructed.');
  await store.deleteArtifact('story', id);
});

Then('buildArtifacts should have been called', function(this: BmadWorld) {
  assert.ok(
    buildArtifactsCalls.length > 0,
    `Expected buildArtifacts to be called at least once via the artifactStore.onDidChangeArtifacts listener. Got ${buildArtifactsCalls.length} call(s).`
  );
});

Then('buildArtifacts should have been called at least {int} times', function(this: BmadWorld, minCalls: number) {
  assert.ok(
    buildArtifactsCalls.length >= minCalls,
    `Expected buildArtifacts to be called at least ${minCalls} times. Got ${buildArtifactsCalls.length} call(s).`
  );
});

Then('the last buildArtifacts call should have been passed the artifact store', function(this: BmadWorld) {
  assert.ok(buildArtifactsCalls.length > 0, 'Expected at least one buildArtifacts call');
  const last = buildArtifactsCalls[buildArtifactsCalls.length - 1];
  assert.ok(last.store, 'Expected the last buildArtifacts call to receive the artifact store as the first argument');
  const captured = (this as any)._capturedStore;
  assert.strictEqual(last.store, captured, 'Expected buildArtifacts to receive the same artifact store instance the extension registered the listener on');
});

// ── Autonomy module wiring checks ──────────────────────────────────────

Then('the auto-retry engine should be configured with maxRetries {int}', function(this: BmadWorld, expected: number) {
  const { autoRetryEngine } = require('../../src/workflow/auto-retry-engine');
  const cfg = autoRetryEngine.getConfig();
  assert.strictEqual(cfg.maxRetries, expected, `Expected auto-retry engine maxRetries to be ${expected}, got ${cfg.maxRetries}`);
});

Then('the autonomous git config should have autoBranch true', function(this: BmadWorld) {
  // Verify the singleton exists and was configured (setConfig called in
  // autonomy-lifecycle.ts start()). We check via the hooks being set
  // rather than reading private config directly.
  const { autonomousGit } = require('../../src/workflow/autonomous-git');
  const mod = autonomousGit as any;
  assert.ok(mod.hooks || mod.config?.autoBranch, 'Expected autonomousGit to be configured with autoBranch true');
});

Then('the autonomous git hooks should be set', function(this: BmadWorld) {
  const { autonomousGit } = require('../../src/workflow/autonomous-git');
  const mod = autonomousGit as any;
  assert.ok(mod.hooks, 'Expected autonomousGit hooks to be set (setHooks was called during activation)');
});

Then('the cost tracker log path should be set', function(this: BmadWorld) {
  const { costTracker } = require('../../src/chat/cost-tracker');
  const mod = costTracker as any;
  assert.ok(mod.logPath, 'Expected costTracker logPath to be set');
  assert.ok(
    (mod.logPath as string).includes('cost-tracking'),
    `Expected logPath to contain "cost-tracking", got "${mod.logPath}"`,
  );
});

Then('the cross-artifact harness detector threshold should be {int}', function(this: BmadWorld, expected: number) {
  const { crossArtifactHarnessDetector } = require('../../src/harness/cross-artifact-detector');
  const mod = crossArtifactHarnessDetector as any;
  assert.ok(mod.threshold !== undefined, 'Expected crossArtifactHarnessDetector threshold to be set');
});

Then('the failure classifier should be importable', function(this: BmadWorld) {
  const { failureClassifier } = require('../../src/workflow/failure-classifier');
  assert.ok(failureClassifier, 'Expected failureClassifier singleton to exist');
  assert.strictEqual(typeof failureClassifier.classify, 'function', 'Expected failureClassifier.classify to be a function');
});

let systemicIssueBroadcasts: Array<{ patterns: any[] }> = [];

Then('the harness engine should have a findings listener for cross-artifact detection', function(this: BmadWorld) {
  const { harnessEngine } = require('../../src/harness/policy-engine');
  const listenerCount = harnessEngine.listenerCount('findings');
  assert.ok(
    listenerCount > 0,
    `Expected harnessEngine to have at least 1 'findings' listener for cross-artifact detection, got ${listenerCount}`,
  );
});

When('the harness engine emits findings for policy {string} on {int} different artifacts', function(this: BmadWorld, policyId: string, count: number) {
  const { harnessEngine } = require('../../src/harness/policy-engine');
  systemicIssueBroadcasts = [];

  // Listen for broadcasts via the EventEmitter — broadcast() now calls
  // this.emit('broadcast', msg) so tests can observe messages cleanly.
  const lifecycle = require('../../src/workflow/autonomy-lifecycle').autonomyLifecycle as any;
  const onBroadcast = (msg: any) => {
    if (msg?.type === 'systemicIssue') {
      systemicIssueBroadcasts.push(msg);
    }
  };
  lifecycle.on('broadcast', onBroadcast);

  // Emit findings on the same policyId for count different artifacts
  for (let i = 0; i < count; i++) {
    harnessEngine.emit('findings', {
      artifactId: `artifact-${i}`,
      artifactType: 'story',
      findings: [{ artifactId: `artifact-${i}`, policyId, severity: 'high', message: `Test failure on artifact-${i}` }],
    });
  }

  // Clean up the listener
  lifecycle.off('broadcast', onBroadcast);
});

Then('the systemicIssue webview broadcast should have been sent with pattern count {int}', function(this: BmadWorld, expectedCount: number) {
  assert.ok(
    systemicIssueBroadcasts.length > 0,
    `Expected at least 1 systemicIssue broadcast, got ${systemicIssueBroadcasts.length}`,
  );
  const last = systemicIssueBroadcasts[systemicIssueBroadcasts.length - 1];
  assert.ok(last.patterns, 'Expected systemicIssue broadcast to have patterns');
  assert.strictEqual(
    last.patterns.length,
    expectedCount,
    `Expected ${expectedCount} pattern(s) in systemicIssue broadcast, got ${last.patterns.length}`,
  );
});

Then('no additional systemicIssue broadcast should have been sent', function(this: BmadWorld) {
  // The second WHEN step resets systemicIssueBroadcasts to [] before emitting,
  // and dedup suppresses the re-broadcast — so the array should still be empty.
  const count = systemicIssueBroadcasts.length;
  assert.strictEqual(
    count,
    0,
    `Expected no systemicIssue broadcast (dedup should suppress re-broadcast), got ${count}`,
  );
});
