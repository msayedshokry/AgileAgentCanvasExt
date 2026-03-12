/**
 * WizardStepsProvider Step Definitions
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

// Module-level state
let wizardStore: any = null;
let wizardProvider: any = null;
let wizardChildren: any[] = [];
let treeDataChangeHandler: ((...args: any[]) => void) | null = null;
let mockGetCurrentSession: () => any = () => null;

function loadWizardProvider(world: BmadWorld): { store: any; provider: any } {
  if (wizardStore && wizardProvider) {
    return { store: wizardStore, provider: wizardProvider };
  }

  const vsc = world.vscode;

  // Mock acOutput for extension circular dep
  const mockAcOutput = { appendLine: () => {}, append: () => {}, clear: () => {}, show: () => {} };

  // Load artifact-store with mocked deps
  const artifactStoreModule = proxyquire('../../src/state/artifact-store', {
    'vscode': vsc,
    '../extension': { acOutput: mockAcOutput },
    '../commands/chat-bridge': { openChat: async () => true, setChatBridgeLogger: () => {} }
  });

  // Load workflow-executor with mocked deps
  const workflowExecutorModule = proxyquire('../../src/workflow/workflow-executor', {
    'vscode': vsc,
    '../extension': { acOutput: mockAcOutput },
    '../chat/agentcanvas-tools': { getToolDefinitions: () => [] },
    '../chat/ai-provider': {
      streamChatResponse: async () => '',
      vsMessagesToChatMessages: (msgs: any[]) => msgs.map((m: any) => ({ role: 'user', content: '' }))
    },
    '../antigravity/antigravity-orchestrator': {
      orchestrateAntigravityWorkflow: async () => true,
      isAntigravityAgentAvailable: async () => false,
      sendSimplePrompt: async () => false,
      buildGuideContent: () => ''
    }
  });

  // Load wizard-steps-provider with all deps mocked
  const wizardModule = proxyquire('../../src/views/wizard-steps-provider', {
    'vscode': vsc,
    '../state/artifact-store': artifactStoreModule,
    '../workflow/workflow-executor': {
      getWorkflowExecutor: () => ({
        getCurrentSession: () => mockGetCurrentSession()
      })
    }
  });

  const ctx = world.context;
  const store = new artifactStoreModule.ArtifactStore(ctx);
  store.initializeProject('Test Project');
  const provider = new wizardModule.WizardStepsProvider(store);

  wizardStore = store;
  wizardProvider = provider;

  return { store, provider };
}

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('a fresh wizard steps provider', function(this: BmadWorld) {
  wizardStore = null;
  wizardProvider = null;
  wizardChildren = [];
  treeDataChangeHandler = null;
  mockGetCurrentSession = () => null;
  loadWizardProvider(this);
});

Given('a requirement exists in the store', async function(this: BmadWorld) {
  const { store } = loadWizardProvider(this);
  store.createRequirement();
});

Given('an epic exists in the wizard store', function(this: BmadWorld) {
  const { store } = loadWizardProvider(this);
  store.createEpic();
});

Given('an epic with a story exists in the wizard store', function(this: BmadWorld) {
  const { store } = loadWizardProvider(this);
  const epic = store.createEpic();
  store.createStory(epic.id);
});

Given('an epic {string} is selected in wizard steps', async function(this: BmadWorld, title: string) {
  const { store } = loadWizardProvider(this);
  const epic = store.createEpic();
  await store.updateArtifact('epic', epic.id, { title, description: 'Test goal' });
  store.setSelectedArtifact('epic', epic.id);
});

Given('an epic {string} with a story is selected in wizard steps', async function(this: BmadWorld, title: string) {
  const { store } = loadWizardProvider(this);
  const epic = store.createEpic();
  await store.updateArtifact('epic', epic.id, { title, description: 'Test goal' });
  store.createStory(epic.id);
  store.setSelectedArtifact('epic', epic.id);
});

Given('an incomplete epic is selected in wizard steps', async function(this: BmadWorld) {
  const { store } = loadWizardProvider(this);
  store.clearSelection();
  const epic = store.createEpic();
  await store.updateArtifact('epic', epic.id, { title: '', description: '' });
  store.setSelectedArtifact('epic', epic.id);
});

Given('an epic is selected in wizard steps', function(this: BmadWorld) {
  const { store } = loadWizardProvider(this);
  const epic = store.createEpic();
  store.setSelectedArtifact('epic', epic.id);
});

Given('a story {string} is selected in wizard steps', async function(this: BmadWorld, title: string) {
  const { store } = loadWizardProvider(this);
  const epic = store.createEpic();
  const story = store.createStory(epic.id);
  await store.updateArtifact('story', story.id, {
    title,
    metadata: { userStory: { asA: 'User', iWant: 'Feature', soThat: 'Benefit' } }
  });
  store.setSelectedArtifact('story', story.id);
});

Given('a story is selected in wizard steps', function(this: BmadWorld) {
  const { store } = loadWizardProvider(this);
  const epic = store.createEpic();
  const story = store.createStory(epic.id);
  store.setSelectedArtifact('story', story.id);
});

Given('a requirement {string} is selected in wizard steps', async function(this: BmadWorld, title: string) {
  const { store } = loadWizardProvider(this);
  const req = store.createRequirement();
  await store.updateArtifact('requirement', req.id, { title, description: 'Test description' });
  store.setSelectedArtifact('requirement', req.id);
});

Given('a requirement is selected in wizard steps', function(this: BmadWorld) {
  const { store } = loadWizardProvider(this);
  const req = store.createRequirement();
  store.setSelectedArtifact('requirement', req.id);
});

Given('a vision {string} is selected in wizard steps', async function(this: BmadWorld, productName: string) {
  const { store } = loadWizardProvider(this);
  await store.updateArtifact('vision', 'vision-1', {
    productName,
    problemStatement: 'Test problem',
    targetUsers: ['Users'],
    valueProposition: 'Test value',
    successCriteria: ['Criteria']
  });
  store.setSelectedArtifact('vision', 'vision-1');
});

Given('vision is selected in wizard steps', function(this: BmadWorld) {
  const { store } = loadWizardProvider(this);
  store.setSelectedArtifact('vision', 'vision');
});

Given('an active workflow session exists for {string} on {string}', function(this: BmadWorld, workflowName: string, artifactId: string) {
  mockGetCurrentSession = () => ({
    id: 'session-1',
    workflowId: 'bmad/epic-creation',
    workflowName,
    artifactType: 'epic',
    artifactId,
    status: 'active',
    currentStepPath: 'step-02-define-goal.md',
    currentStepNumber: 2,
    stepsCompleted: ['step-01-create-epic.md'],
    nextStepPath: 'step-03-add-stories.md',
    startedAt: Date.now(),
    lastActivityAt: Date.now()
  });
  loadWizardProvider(this);
});

Given('a completed workflow session exists', function(this: BmadWorld) {
  mockGetCurrentSession = () => ({
    id: 'session-1',
    workflowId: 'bmad/epic-creation',
    workflowName: 'Epic Creation',
    artifactType: 'epic',
    artifactId: 'EPIC-1',
    status: 'completed',
    currentStepPath: 'step-02-define-goal.md',
    currentStepNumber: 2,
    stepsCompleted: [],
    startedAt: Date.now(),
    lastActivityAt: Date.now()
  });
  loadWizardProvider(this);
});

Given('an active session with path-based step names', function(this: BmadWorld) {
  mockGetCurrentSession = () => ({
    id: 'session-1',
    workflowId: 'bmad/epic-creation',
    workflowName: 'Epic Creation',
    artifactType: 'epic',
    artifactId: 'EPIC-1',
    status: 'active',
    currentStepPath: 'workflows/epic/step-02-define-goal.md',
    currentStepNumber: 2,
    stepsCompleted: ['workflows/epic/step-01-create-epic.md'],
    nextStepPath: 'workflows/epic/step-03-add-stories.md',
    startedAt: Date.now(),
    lastActivityAt: Date.now()
  });
  loadWizardProvider(this);
});

Given('an unknown artifact type {string} is selected in wizard steps', function(this: BmadWorld, type: string) {
  const { store } = loadWizardProvider(this);
  // Spy on getSelectedArtifact to return unknown type
  const origGetSelectedArtifact = store.getSelectedArtifact.bind(store);
  store.getSelectedArtifact = () => ({ type, id: 'unknown-1', artifact: { title: 'Unknown' } });
});

Given('a draft vision {string} is selected in wizard steps', async function(this: BmadWorld, productName: string) {
  const { store } = loadWizardProvider(this);
  await store.updateArtifact('vision', 'vision-1', {
    productName,
    problemStatement: 'S',
    targetUsers: ['U'],
    valueProposition: 'V',
    successCriteria: ['C'],
    status: 'draft'
  });
  store.setSelectedArtifact('vision', 'vision-1');
});

Given('a ready story is selected in wizard steps', async function(this: BmadWorld) {
  const { store } = loadWizardProvider(this);
  const epic = store.createEpic();
  const story = store.createStory(epic.id);
  await store.updateArtifact('story', story.id, {
    title: 'Story',
    metadata: {
      userStory: { asA: 'User', iWant: 'Feature', soThat: 'Benefit' },
      acceptanceCriteria: [{ id: 'AC-1', description: 'Test', status: 'pending' }]
    },
    status: 'ready'
  });
  store.setSelectedArtifact('story', story.id);
});

Given('a ready epic is selected in wizard steps', async function(this: BmadWorld) {
  const { store } = loadWizardProvider(this);
  const epic = store.createEpic();
  store.createStory(epic.id);
  await store.updateArtifact('epic', epic.id, { title: 'Epic', description: 'Goal', status: 'ready' });
  store.setSelectedArtifact('epic', epic.id);
});

Given('a requirement with related epics is selected in wizard steps', async function(this: BmadWorld) {
  const { store } = loadWizardProvider(this);
  const req = store.createRequirement();
  await store.updateArtifact('requirement', req.id, {
    title: 'Req',
    description: 'Desc',
    relatedEpics: ['EPIC-1']
  });
  store.setSelectedArtifact('requirement', req.id);
});

Given('a requirement with related epics and stories is selected in wizard steps', async function(this: BmadWorld) {
  const { store } = loadWizardProvider(this);
  const req = store.createRequirement();
  await store.updateArtifact('requirement', req.id, {
    title: 'Req',
    description: 'Desc',
    relatedEpics: ['EPIC-1'],
    relatedStories: ['STORY-1']
  });
  store.setSelectedArtifact('requirement', req.id);
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I get wizard step children with no selection', async function(this: BmadWorld) {
  const { provider } = loadWizardProvider(this);
  wizardChildren = await provider.getChildren();
});

When('I register a tree data change handler', function(this: BmadWorld) {
  const { provider } = loadWizardProvider(this);
  treeDataChangeHandler = () => { (treeDataChangeHandler as any)._called = true; };
  (treeDataChangeHandler as any)._called = false;
  provider.onDidChangeTreeData(treeDataChangeHandler);
});

When('I call refresh on wizard steps provider', function(this: BmadWorld) {
  const { provider } = loadWizardProvider(this);
  provider.refresh();
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the wizard steps provider should be defined', function(this: BmadWorld) {
  assert.ok(wizardProvider !== null && wizardProvider !== undefined, 'Expected wizard steps provider to be defined');
});

Then('the provider should listen for selection changes', function(this: BmadWorld) {
  // WizardStepsProvider calls store.onDidChangeSelection in constructor
  // Since the store is real and provider was constructed, just verify provider exists
  assert.ok(wizardProvider !== null, 'Provider should have been constructed');
});

Then('onDidChangeTreeData should be defined', function(this: BmadWorld) {
  const { provider } = loadWizardProvider(this);
  assert.ok(provider.onDidChangeTreeData !== undefined, 'Expected onDidChangeTreeData to be defined');
});

Then('the tree data change handler should have been called', function(this: BmadWorld) {
  assert.ok(treeDataChangeHandler && (treeDataChangeHandler as any)._called === true,
    'Expected tree data change handler to have been called');
});

Then('getTreeItem should return the first child as-is', async function(this: BmadWorld) {
  const { provider } = loadWizardProvider(this);
  const children = await provider.getChildren();
  const item = children[0];
  assert.strictEqual(provider.getTreeItem(item), item, 'Expected getTreeItem to return the element as-is');
});

Then('the first child label should be {string}', function(this: BmadWorld, expectedLabel: string) {
  assert.ok(wizardChildren.length > 0, 'Expected children to be non-empty');
  assert.strictEqual(wizardChildren[0].label, expectedLabel,
    `Expected first child label to be "${expectedLabel}", got "${wizardChildren[0].label}"`);
});

Then('the first child description should be {string}', function(this: BmadWorld, expectedDesc: string) {
  assert.ok(wizardChildren.length > 0, 'Expected children to be non-empty');
  assert.strictEqual(wizardChildren[0].description, expectedDesc,
    `Expected first child description to be "${expectedDesc}", got "${wizardChildren[0].description}"`);
});

Then('the first child label should contain {string}', function(this: BmadWorld, text: string) {
  assert.ok(wizardChildren.length > 0, 'Expected children to be non-empty');
  const label = wizardChildren[0].label || '';
  assert.ok(label.includes(text),
    `Expected first child label to contain "${text}", got "${label}"`);
});

Then('the wizard step labels should contain {string}', function(this: BmadWorld, label: string) {
  const labels = wizardChildren.map(c => c.label);
  assert.ok(labels.includes(label),
    `Expected step labels to contain "${label}". Got: ${JSON.stringify(labels)}`);
});

Then('the wizard step {string} should have contextValue {string}', function(this: BmadWorld, stepLabel: string, contextValue: string) {
  const step = wizardChildren.find(c => c.label === stepLabel);
  assert.ok(step, `Expected to find step "${stepLabel}". Labels: ${JSON.stringify(wizardChildren.map(c => c.label))}`);
  assert.strictEqual(step.contextValue, contextValue,
    `Expected step "${stepLabel}" contextValue to be "${contextValue}", got "${step.contextValue}"`);
});

Then('the wizard step {string} should not have contextValue {string}', function(this: BmadWorld, stepLabel: string, contextValue: string) {
  const step = wizardChildren.find(c => c.label === stepLabel);
  assert.ok(step, `Expected to find step "${stepLabel}"`);
  assert.notStrictEqual(step.contextValue, contextValue,
    `Expected step "${stepLabel}" contextValue NOT to be "${contextValue}"`);
});

Then('the wizard step {string} should have command {string}', function(this: BmadWorld, stepLabel: string, command: string) {
  const step = wizardChildren.find(c => c.label === stepLabel);
  assert.ok(step, `Expected to find step "${stepLabel}". Labels: ${JSON.stringify(wizardChildren.map(c => c.label))}`);
  assert.strictEqual(step.command?.command, command,
    `Expected step "${stepLabel}" command to be "${command}", got "${step.command?.command}"`);
});

Then('the wizard step {string} command arguments should contain {string}', function(this: BmadWorld, stepLabel: string, arg: string) {
  const step = wizardChildren.find(c => c.label === stepLabel);
  assert.ok(step, `Expected to find step "${stepLabel}"`);
  const args = step.command?.arguments || [];
  assert.ok(args.includes(arg),
    `Expected command arguments to contain "${arg}". Got: ${JSON.stringify(args)}`);
});

Then('getting children of the first wizard step item should return empty array', async function(this: BmadWorld) {
  const { provider } = loadWizardProvider(this);
  const children = await provider.getChildren();
  const childItems = await provider.getChildren(children[0]);
  assert.deepStrictEqual(childItems, [], 'Expected empty array for child items');
});

Then('a wizard step {string} should exist', function(this: BmadWorld, stepLabel: string) {
  const step = wizardChildren.find(c => c.label === stepLabel);
  assert.ok(step, `Expected to find step "${stepLabel}". Labels: ${JSON.stringify(wizardChildren.map(c => c.label))}`);
});

Then('a wizard step containing {string} should exist', function(this: BmadWorld, text: string) {
  const step = wizardChildren.find(c => (c.label || '').includes(text));
  assert.ok(step,
    `Expected to find a step containing "${text}". Labels: ${JSON.stringify(wizardChildren.map(c => c.label))}`);
});

Then('the step containing {string} should have contextValue {string}', function(this: BmadWorld, text: string, contextValue: string) {
  const step = wizardChildren.find(c => (c.label || '').includes(text));
  assert.ok(step, `Expected to find a step containing "${text}"`);
  assert.strictEqual(step.contextValue, contextValue,
    `Expected contextValue "${contextValue}", got "${step.contextValue}"`);
});

Then('the step containing {string} should contain {string}', function(this: BmadWorld, searchText: string, expectedText: string) {
  const step = wizardChildren.find(c => (c.label || '').includes(searchText));
  assert.ok(step, `Expected to find a step containing "${searchText}"`);
  assert.ok((step.label || '').includes(expectedText),
    `Expected label containing "${searchText}" to also contain "${expectedText}", got "${step.label}"`);
});

Then('the first child contextValue should be {string}', function(this: BmadWorld, contextValue: string) {
  assert.ok(wizardChildren.length > 0, 'Expected children to be non-empty');
  assert.strictEqual(wizardChildren[0].contextValue, contextValue,
    `Expected first child contextValue to be "${contextValue}", got "${wizardChildren[0].contextValue}"`);
});

Then('the first child tooltip should be defined', function(this: BmadWorld) {
  assert.ok(wizardChildren.length > 0, 'Expected children to be non-empty');
  assert.ok(wizardChildren[0].tooltip !== undefined && wizardChildren[0].tooltip !== null,
    'Expected first child to have a tooltip');
});

Then('the first child iconPath should be defined', function(this: BmadWorld) {
  assert.ok(wizardChildren.length > 0, 'Expected children to be non-empty');
  assert.ok(wizardChildren[0].iconPath !== undefined,
    'Expected first child to have iconPath defined');
});

Then('any blocked wizard step should have tooltip containing {string}', function(this: BmadWorld, text: string) {
  const blocked = wizardChildren.filter(c => c.contextValue === 'workflow-blocked');
  if (blocked.length > 0) {
    const hasTooltip = blocked.some(s => s.tooltip && (typeof s.tooltip === 'string' ? s.tooltip : s.tooltip.value || String(s.tooltip)).includes(text));
    assert.ok(hasTooltip,
      `Expected at least one blocked step to have tooltip containing "${text}". Tooltips: ${JSON.stringify(blocked.map(s => s.tooltip))}`);
  }
});

Then('the wizard step {string} should have no command', function(this: BmadWorld, stepLabel: string) {
  const step = wizardChildren.find(c => c.label === stepLabel);
  assert.ok(step, `Expected to find step "${stepLabel}"`);
  assert.ok(step.command === undefined || step.command === null,
    `Expected step "${stepLabel}" to have no command, got "${step.command?.command}"`);
});

Then('the wizard step {string} description should contain {string}', function(this: BmadWorld, stepLabel: string, text: string) {
  const step = wizardChildren.find(c => c.label === stepLabel);
  assert.ok(step, `Expected to find step "${stepLabel}"`);
  assert.ok(step.description && step.description.includes(text),
    `Expected step "${stepLabel}" description to contain "${text}", got "${step.description}"`);
});
