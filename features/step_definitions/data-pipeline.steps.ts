/**
 * Data Pipeline Step Definitions
 * Tests for the 3-layer data pipeline:
 *   Layer 1: mapSchema* disk loading preserves all fields
 *   Layer 2: stateToArtifacts sends correct metadata to webview
 *   Layer 3: updateArtifact save handlers preserve all fields
 *   Round-trip: load → webview → save → verify
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

// Module-level state
let dpStore: any = null;
let dpStoreModule: any = null;
let dpCanvasModule: any = null;
let lastLoadedArtifact: any = null;
let lastWebviewMetadata: any = null;
let lastRoundTrippedArtifact: any = null;

function getStoreModule(world: BmadWorld): any {
  if (!dpStoreModule) {
    const mockExtension = {
      acOutput: {
        appendLine: () => {},
        append: () => {},
        clear: () => {},
        show: () => {},
      }
    };
    dpStoreModule = proxyquire('../../src/state/artifact-store', {
      'vscode': world.vscode,
      '../extension': mockExtension,
      '../commands/chat-bridge': { openChat: async () => true, setChatBridgeLogger: () => {} }
    });
  }
  return dpStoreModule;
}

function getStore(world: BmadWorld): any {
  if (!dpStore) {
    const mod = getStoreModule(world);
    dpStore = new mod.ArtifactStore(world.context as any);
    dpStore.initializeProject('Data Pipeline Test');
  }
  return dpStore;
}

function getCanvasModule(world: BmadWorld): any {
  if (!dpCanvasModule) {
    const mockExtension = {
      acOutput: { appendLine: () => {}, append: () => {}, clear: () => {}, show: () => {} }
    };
    const mockFs = { existsSync: () => false };
    const storeMod = getStoreModule(world);
    const mockArtifactCommands = {
      refineArtifactWithAI: async () => {},
      breakDownArtifact: async () => {},
      enhanceArtifactWithAI: async () => {},
      elicitArtifactWithMethod: async () => {},
      startDevelopment: async () => {},
      loadElicitationMethods: () => [],
      loadBmmWorkflows: () => [],
      launchBmmWorkflow: async () => {}
    };
    const messageHandlerModule = proxyquire('../../src/views/webview-message-handler', {
      'vscode': world.vscode,
      '../state/artifact-store': storeMod,
      '../extension': mockExtension,
      '../commands/artifact-commands': mockArtifactCommands,
      '../commands/chat-bridge': { openChat: async () => true, setChatBridgeLogger: () => {} }
    });
    const mockProjectCommands = {
      createNewProject: async () => {},
      loadExistingProject: async () => {},
      checkForMarkdownFiles: async () => false,
      autoLoadProject: async () => {},
      loadDemoData: () => Promise.resolve(),
      loadSampleProject: () => Promise.resolve()
    };
    dpCanvasModule = proxyquire('../../src/views/canvas-view-provider', {
      'vscode': world.vscode,
      '../state/artifact-store': storeMod,
      '../extension': mockExtension,
      '../commands/artifact-commands': mockArtifactCommands,
      '../commands/project-commands': mockProjectCommands,
      './webview-message-handler': messageHandlerModule,
      '../commands/chat-bridge': { openChat: async () => true, setChatBridgeLogger: () => {} },
      'fs': mockFs,
      'path': require('path')
    });
  }
  return dpCanvasModule;
}

// ============================================================================
// Test data factories
// ============================================================================

function fullStoryData(): any {
  return {
    id: 'STORY-TEST-1',
    title: 'Full Story',
    status: 'draft',
    storyPoints: 5,
    priority: 'high',
    estimatedEffort: '2 days',
    storyFormat: 'prose',
    background: 'Some background context',
    problemStatement: 'The core problem',
    proposedSolution: 'The proposed solution',
    technicalNotes: 'Some technical notes',
    assignee: 'alice',
    reviewer: 'bob',
    notes: 'Some notes',
    solutionDetails: ['Detail 1', 'Detail 2'],
    implementationDetails: ['Impl 1', 'Impl 2'],
    definitionOfDone: ['DoD 1', 'DoD 2'],
    requirementRefs: ['FR-1'],
    labels: ['frontend', 'auth'],
    userStory: {
      asA: 'developer',
      iWant: 'to build features',
      soThat: 'users are happy'
    },
    acceptanceCriteria: [
      { given: 'a user', when: 'they log in', then: 'they see dashboard' }
    ],
    tasks: [
      { id: 'T1', description: 'Task 1', completed: false, estimatedHours: 4 }
    ],
    dependencies: {
      blockedBy: ['STORY-0'],
      blocks: [],
      externalDependencies: []
    },
    devNotes: {
      overview: 'Dev overview',
      testingStrategy: 'Unit tests'
    },
    uxReferences: [
      { type: 'figma', reference: 'https://figma.com/abc', description: 'Main screen' }
    ],
    references: [
      { source: 'PRD', section: 'Auth', relevance: 'high' }
    ],
    history: [
      { fromStatus: 'draft', toStatus: 'ready', changedBy: 'alice', timestamp: '2025-01-01' }
    ]
  };
}

function fullStoryDataForRoundTrip(): any {
  return {
    id: 'STORY-RT-1',
    title: 'Round Trip Story',
    status: 'draft',
    storyPoints: 5,
    priority: 'high',
    estimatedEffort: '2 days',
    storyFormat: 'prose',
    background: 'Some background',
    problemStatement: 'The problem',
    proposedSolution: 'The solution',
    technicalNotes: 'Tech notes',
    assignee: 'alice',
    reviewer: 'bob',
    notes: 'Some notes',
    solutionDetails: ['Detail 1', 'Detail 2'],
    implementationDetails: ['Impl 1', 'Impl 2'],
    definitionOfDone: ['DoD 1', 'DoD 2'],
    requirementRefs: ['FR-1'],
    labels: ['frontend', 'auth'],
    userStory: {
      asA: 'developer',
      iWant: 'to build features',
      soThat: 'users are happy'
    },
    acceptanceCriteria: [
      { given: 'a user', when: 'they log in', then: 'they see dashboard' }
    ],
    tasks: [],
    dependencies: { blockedBy: [], blocks: [], externalDependencies: [] }
  };
}

function fullEpicData(): any {
  return {
    id: 'EPIC-TEST-1',
    title: 'Full Epic',
    goal: 'Deliver authentication',
    status: 'draft',
    priority: 'high',
    storyCount: 3,
    acceptanceSummary: 'All criteria met',
    valueDelivered: 'Secure login',
    implementationNotes: ['Note 1', 'Note 2'],
    epicDependencies: {
      upstream: ['EPIC-0'],
      downstream: ['EPIC-2'],
      relatedEpics: ['EPIC-3']
    },
    effortEstimate: {
      totalSprints: 2,
      totalDays: 10
    },
    functionalRequirements: ['FR-1'],
    nonFunctionalRequirements: ['NFR-1'],
    additionalRequirements: [],
    definitionOfDone: ['All tests pass', 'Code reviewed'],
    risks: [
      { risk: 'Tight deadline', impact: 'high', mitigation: 'Prioritize' }
    ],
    fitCriteria: { functional: [], nonFunctional: [] },
    successMetrics: { codeQuality: [], operational: [] },
    technicalSummary: { architecturePattern: 'MVC' },
    stories: [],
    useCases: [{
      id: 'UC-TEST-1',
      title: 'Login Use Case',
      summary: 'User logs in',
      description: 'User logs in to system',
      primaryActor: 'end-user',
      secondaryActors: ['admin'],
      trigger: 'User clicks button',
      preconditions: ['User has account', 'System is running'],
      postconditions: ['User is authenticated'],
      mainFlow: [
        { step: 1, action: 'Enter credentials' },
        { step: 2, action: 'Click login' }
      ],
      alternativeFlows: ['Forgot password flow'],
      exceptionFlows: [{ name: 'Invalid credentials', trigger: 'Wrong password', handling: 'Show error' }],
      businessRules: ['Must use 2FA for admin'],
      relatedRequirements: ['FR-1'],
      relatedEpic: 'EPIC-TEST-1',
      relatedStories: ['STORY-1'],
      sourceDocument: 'PRD.md',
      notes: 'Important note',
      scenario: { context: 'Login page', before: 'Not logged in', after: 'Logged in', impact: 'High' },
      actors: ['end-user', 'admin'],
      status: 'draft'
    }]
  };
}

function fullRequirementData(): any {
  return {
    id: 'FR-TEST-1',
    title: 'Full Requirement',
    description: 'Detailed requirement description',
    capabilityArea: 'Authentication',
    priority: 'high',
    status: 'approved',
    type: 'functional',
    rationale: 'Business need',
    source: 'PRD.md',
    metrics: { target: '99.9%', threshold: '99%', unit: 'uptime', measurementMethod: 'monitoring' },
    verificationMethod: 'automated-test',
    verificationNotes: 'E2E tests required',
    acceptanceCriteria: { given: 'Valid credentials', when: 'Login attempt', then: 'Access granted' },
    dependencies: ['FR-0', 'FR-2'],
    implementationNotes: 'Use OAuth2',
    notes: 'Review with security team',
    relatedEpics: ['EPIC-1'],
    relatedStories: ['STORY-1']
  };
}

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('a fresh data pipeline test store', function(this: BmadWorld) {
  dpStore = null;
  dpStoreModule = null;
  dpCanvasModule = null;
  lastLoadedArtifact = null;
  lastWebviewMetadata = null;
  lastRoundTrippedArtifact = null;
  getStore(this);
});

// --- Layer 1: Loading ---

Given('I load a story with all schema fields populated', function(this: BmadWorld) {
  const store = getStore(this);
  // Access private method via prototype trick - call mapSchemaStoryToInternal
  const data = fullStoryData();
  lastLoadedArtifact = store.mapSchemaStoryToInternal(data);
});

Given('I load a story with only required fields', function(this: BmadWorld) {
  const store = getStore(this);
  lastLoadedArtifact = store.mapSchemaStoryToInternal({
    id: 'STORY-MIN-1',
    title: 'Minimal Story'
  });
});

Given('I load an epic with all schema fields populated', function(this: BmadWorld) {
  const store = getStore(this);
  lastLoadedArtifact = store.mapSchemaEpicToInternal(fullEpicData());
});

Given('I load an epic with a fully populated inline use case', function(this: BmadWorld) {
  const store = getStore(this);
  const epicData = fullEpicData();
  lastLoadedArtifact = store.mapSchemaEpicToInternal(epicData);
});

Given('I load a requirement with all schema fields populated', function(this: BmadWorld) {
  const store = getStore(this);
  lastLoadedArtifact = store.mapSchemaRequirement(fullRequirementData());
});

Given('I load a requirement with only required fields', function(this: BmadWorld) {
  const store = getStore(this);
  lastLoadedArtifact = store.mapSchemaRequirement({
    id: 'FR-MIN-1',
    title: 'Minimal Requirement',
    description: 'Minimal description'
  });
});

// --- Layer 3: Save handler setup ---

Given('I have an epic with a fully populated story in the store', function(this: BmadWorld) {
  const store = getStore(this);
  // Create an epic with a fully populated story
  const epicData = {
    id: 'EPIC-SAVE-1',
    title: 'Save Test Epic',
    goal: 'Test saving',
    status: 'draft',
    stories: [fullStoryDataForRoundTrip()],
    useCases: [],
    functionalRequirements: [],
    nonFunctionalRequirements: [],
    additionalRequirements: []
  };
  const epic = store.mapSchemaEpicToInternal(epicData);
  const epics = store.getEpics() || [];
  epics.push(epic);
  // Use internal artifacts map to set the epics
  store.artifacts.set('epics', epics);
});

Given('I have a requirement with all fields in the store', function(this: BmadWorld) {
  const store = getStore(this);
  const req = store.mapSchemaRequirement(fullRequirementData());
  const requirements = store.getRequirements() || { functional: [], nonFunctional: [], additional: [] };
  requirements.functional.push(req);
  store.artifacts.set('requirements', requirements);
});

Given('I have a PRD artifact in the store', function(this: BmadWorld) {
  const store = getStore(this);
  store.artifacts.set('prd', {
    title: 'Original PRD',
    productOverview: { productName: 'Original PRD' },
    scope: 'Original scope',
    status: 'draft'
  });
});

Given('I have an architecture artifact in the store', function(this: BmadWorld) {
  const store = getStore(this);
  store.artifacts.set('architecture', {
    title: 'Original Architecture',
    overview: { projectName: 'Original Architecture' },
    techStack: 'Python',
    status: 'draft'
  });
});

Given('I have a product-brief artifact in the store', function(this: BmadWorld) {
  const store = getStore(this);
  store.artifacts.set('productBrief', {
    productName: 'Original Brief',
    targetMarket: 'SMB',
    status: 'draft'
  });
});

Given('I have an epic with a fully populated use case in the store', function(this: BmadWorld) {
  const store = getStore(this);
  const epicData = fullEpicData();
  const epic = store.mapSchemaEpicToInternal(epicData);
  const epics = store.getEpics() || [];
  epics.push(epic);
  store.artifacts.set('epics', epics);
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I update the story with new metadata for all fields', async function(this: BmadWorld) {
  const store = getStore(this);
  await store.updateArtifact('story', 'STORY-RT-1', {
    title: 'Updated Story',
    metadata: {
      storyFormat: 'prose',
      background: 'Updated background',
      problemStatement: 'Updated problem',
      proposedSolution: 'Updated solution',
      solutionDetails: ['New detail'],
      implementationDetails: ['New impl'],
      definitionOfDone: ['New DoD'],
      notes: 'Updated notes',
      assignee: 'charlie',
      reviewer: 'dave',
      labels: ['backend', 'perf'],
      estimatedEffort: '3 days',
      storyPoints: 8,
      priority: 'critical',
      userStory: { asA: 'admin', iWant: 'to manage', soThat: 'things work' },
      acceptanceCriteria: [{ given: 'x', when: 'y', then: 'z' }]
    }
  });
});

When('I update the requirement with new metadata for all fields', async function(this: BmadWorld) {
  const store = getStore(this);
  await store.updateArtifact('requirement', 'FR-TEST-1', {
    title: 'Updated Requirement',
    metadata: {
      type: 'non-functional',
      rationale: 'Updated rationale',
      source: 'Architecture.md',
      capabilityArea: 'Performance',
      implementationNotes: 'Cache queries',
      notes: 'Updated notes',
      verificationMethod: 'manual-test',
      verificationNotes: 'Load testing',
      dependencies: ['FR-99'],
      priority: 'critical',
      status: 'approved',
      metrics: { target: '100ms', threshold: '200ms', unit: 'latency', measurementMethod: 'APM' }
    }
  });
});

When('I update the PRD with title {string} and metadata sections', async function(this: BmadWorld, title: string) {
  const store = getStore(this);
  await store.updateArtifact('prd', 'prd-1', {
    title,
    metadata: {
      scope: 'Full system'
    }
  });
});

When('I update the architecture with title {string} and metadata sections', async function(this: BmadWorld, title: string) {
  const store = getStore(this);
  await store.updateArtifact('architecture', 'arch-1', {
    title,
    metadata: {
      techStack: 'Node.js'
    }
  });
});

When('I update the product-brief with title {string} and metadata sections', async function(this: BmadWorld, title: string) {
  const store = getStore(this);
  await store.updateArtifact('product-brief', 'pb-1', {
    title,
    metadata: {
      targetMarket: 'Enterprise'
    }
  });
});

When('I update the use case with new metadata for all fields', async function(this: BmadWorld) {
  const store = getStore(this);
  await store.updateArtifact('use-case', 'UC-TEST-1', {
    title: 'Updated Use Case',
    metadata: {
      primaryActor: 'admin',
      trigger: 'Updated trigger',
      notes: 'Updated note',
      preconditions: ['New precondition'],
      postconditions: ['New postcondition'],
      mainFlow: [{ step: 1, action: 'New action' }],
      businessRules: ['New rule'],
      alternativeFlows: ['New alt flow'],
      scenario: { context: 'Updated', before: 'Before', after: 'After', impact: 'Medium' }
    }
  });
});

// --- Round-trip WHEN steps ---

When('I extract story metadata as the webview would receive it', function(this: BmadWorld) {
  const store = getStore(this);
  const canvasMod = getCanvasModule(this);
  const extensionUri = this.vscode.Uri.file('/test/extension');
  const provider = new canvasMod.AgileAgentCanvasViewProvider(extensionUri, store);
  // Access stateToArtifacts via the provider
  const state = store.getState();
  const artifacts = provider.stateToArtifacts(state);
  const storyArtifact = artifacts.find((a: any) => a.type === 'story' && a.id === 'STORY-RT-1');
  assert.ok(storyArtifact, 'Story artifact not found in stateToArtifacts output');
  lastWebviewMetadata = storyArtifact.metadata;
});

When('I save the story back using the webview metadata format', async function(this: BmadWorld) {
  const store = getStore(this);
  // Simulate what DetailPanel.handleSave does:
  // sends { title, description, status, metadata: { ...artifact.metadata, ...editedData } }
  await store.updateArtifact('story', 'STORY-RT-1', {
    title: 'Round Trip Story',
    metadata: lastWebviewMetadata
  });
  // Read back the saved story
  const epics = store.getEpics();
  for (const epic of epics) {
    const story = epic.stories?.find((s: any) => s.id === 'STORY-RT-1');
    if (story) {
      lastRoundTrippedArtifact = story;
      break;
    }
  }
  assert.ok(lastRoundTrippedArtifact, 'Round-tripped story not found');
});

When('I extract requirement metadata as the webview would receive it', function(this: BmadWorld) {
  const store = getStore(this);
  const canvasMod = getCanvasModule(this);
  const extensionUri = this.vscode.Uri.file('/test/extension');
  const provider = new canvasMod.AgileAgentCanvasViewProvider(extensionUri, store);
  const state = store.getState();
  const artifacts = provider.stateToArtifacts(state);
  const reqArtifact = artifacts.find((a: any) => a.type === 'requirement' && a.id === 'FR-TEST-1');
  assert.ok(reqArtifact, 'Requirement artifact not found in stateToArtifacts output');
  lastWebviewMetadata = reqArtifact.metadata;
});

When('I save the requirement back using the webview metadata format', async function(this: BmadWorld) {
  const store = getStore(this);
  await store.updateArtifact('requirement', 'FR-TEST-1', {
    title: 'Full Requirement',
    metadata: lastWebviewMetadata
  });
  const requirements = store.getRequirements();
  lastRoundTrippedArtifact = requirements.functional.find((r: any) => r.id === 'FR-TEST-1');
  assert.ok(lastRoundTrippedArtifact, 'Round-tripped requirement not found');
});

When('I extract epic metadata as the webview would receive it', function(this: BmadWorld) {
  const store = getStore(this);
  // Put the loaded epic into the store
  const epics = store.getEpics() || [];
  // The epic was loaded in the Given step into lastLoadedArtifact
  epics.push(lastLoadedArtifact);
  store.artifacts.set('epics', epics);

  const canvasMod = getCanvasModule(this);
  const extensionUri = this.vscode.Uri.file('/test/extension');
  const provider = new canvasMod.AgileAgentCanvasViewProvider(extensionUri, store);
  const state = store.getState();
  const artifacts = provider.stateToArtifacts(state);
  const epicArtifact = artifacts.find((a: any) => a.type === 'epic' && a.id === 'EPIC-TEST-1');
  assert.ok(epicArtifact, 'Epic artifact not found in stateToArtifacts output');
  lastWebviewMetadata = epicArtifact.metadata;
});

When('I extract use case metadata as the webview would receive it', function(this: BmadWorld) {
  const store = getStore(this);
  const canvasMod = getCanvasModule(this);
  const extensionUri = this.vscode.Uri.file('/test/extension');
  const provider = new canvasMod.AgileAgentCanvasViewProvider(extensionUri, store);
  const state = store.getState();
  const artifacts = provider.stateToArtifacts(state);
  const ucArtifact = artifacts.find((a: any) => a.type === 'use-case' && a.id === 'UC-TEST-1');
  assert.ok(ucArtifact, 'Use-case artifact not found in stateToArtifacts output');
  lastWebviewMetadata = ucArtifact.metadata;
});

// ============================================================================
// THEN Steps - Layer 1: Loading assertions
// ============================================================================

Then('the loaded story should have all populated fields preserved', function() {
  assert.ok(lastLoadedArtifact, 'No artifact was loaded');
  assert.strictEqual(lastLoadedArtifact.id, 'STORY-TEST-1');
  assert.strictEqual(lastLoadedArtifact.title, 'Full Story');
});

Then('the loaded story userStory should have asA {string}', function(value: string) {
  assert.strictEqual(lastLoadedArtifact.userStory?.asA, value);
});

Then('the loaded story userStory should have iWant {string}', function(value: string) {
  assert.strictEqual(lastLoadedArtifact.userStory?.iWant, value);
});

Then('the loaded story userStory should have soThat {string}', function(value: string) {
  assert.strictEqual(lastLoadedArtifact.userStory?.soThat, value);
});

Then('the loaded story should have title {string}', function(value: string) {
  assert.strictEqual(lastLoadedArtifact.title, value);
});

// Generic field assertions for loaded artifacts
Then('the loaded story should have field {string} with value {string}', function(field: string, value: string) {
  assert.strictEqual(lastLoadedArtifact[field], value, `Story field "${field}" expected "${value}" but got "${lastLoadedArtifact[field]}"`);
});

Then('the loaded story should have field {string} with numeric value {int}', function(field: string, value: number) {
  assert.strictEqual(lastLoadedArtifact[field], value, `Story field "${field}" expected ${value} but got ${lastLoadedArtifact[field]}`);
});

Then('the loaded story should have field {string} with undefined value', function(field: string) {
  assert.strictEqual(lastLoadedArtifact[field], undefined, `Story field "${field}" expected undefined but got "${lastLoadedArtifact[field]}"`);
});

Then('the loaded story should have array field {string} with {int} items', function(field: string, count: number) {
  assert.ok(Array.isArray(lastLoadedArtifact[field]), `Story field "${field}" should be an array`);
  assert.strictEqual(lastLoadedArtifact[field].length, count, `Story field "${field}" expected ${count} items but got ${lastLoadedArtifact[field].length}`);
});

// Epic field assertions
Then('the loaded epic should have all populated fields preserved', function() {
  assert.ok(lastLoadedArtifact, 'No artifact was loaded');
  assert.strictEqual(lastLoadedArtifact.id, 'EPIC-TEST-1');
  assert.strictEqual(lastLoadedArtifact.title, 'Full Epic');
});

Then('the loaded epic should have field {string} with value {string}', function(field: string, value: string) {
  assert.strictEqual(lastLoadedArtifact[field], value, `Epic field "${field}" expected "${value}" but got "${lastLoadedArtifact[field]}"`);
});

Then('the loaded epic should have field {string} with numeric value {int}', function(field: string, value: number) {
  assert.strictEqual(lastLoadedArtifact[field], value, `Epic field "${field}" expected ${value} but got ${lastLoadedArtifact[field]}`);
});

Then('the loaded epic should have array field {string} with {int} items', function(field: string, count: number) {
  assert.ok(Array.isArray(lastLoadedArtifact[field]), `Epic field "${field}" should be an array but got ${typeof lastLoadedArtifact[field]}`);
  assert.strictEqual(lastLoadedArtifact[field].length, count, `Epic field "${field}" expected ${count} items but got ${lastLoadedArtifact[field].length}`);
});

Then('the loaded epic should have object field {string} with key {string}', function(field: string, key: string) {
  assert.ok(lastLoadedArtifact[field], `Epic field "${field}" should exist`);
  assert.ok(lastLoadedArtifact[field][key] !== undefined, `Epic field "${field}" should have key "${key}"`);
});

// Epic inline use-case assertions
Then('the loaded epic use case should have field {string} with value {string}', function(field: string, value: string) {
  const uc = lastLoadedArtifact.useCases?.[0];
  assert.ok(uc, 'No use case found in loaded epic');
  assert.strictEqual(uc[field], value, `Use case field "${field}" expected "${value}" but got "${uc[field]}"`);
});

Then('the loaded epic use case should have array field {string} with {int} items', function(field: string, count: number) {
  const uc = lastLoadedArtifact.useCases?.[0];
  assert.ok(uc, 'No use case found in loaded epic');
  assert.ok(Array.isArray(uc[field]), `Use case field "${field}" should be an array but got ${typeof uc[field]}`);
  assert.strictEqual(uc[field].length, count, `Use case field "${field}" expected ${count} items but got ${uc[field].length}`);
});

// Requirement field assertions
Then('the loaded requirement should have all populated fields preserved', function() {
  assert.ok(lastLoadedArtifact, 'No artifact was loaded');
  assert.strictEqual(lastLoadedArtifact.id, 'FR-TEST-1');
  assert.strictEqual(lastLoadedArtifact.title, 'Full Requirement');
});

Then('the loaded requirement should have title {string}', function(value: string) {
  assert.strictEqual(lastLoadedArtifact.title, value);
});

Then('the loaded requirement should have field {string} with value {string}', function(field: string, value: string) {
  assert.strictEqual(lastLoadedArtifact[field], value, `Requirement field "${field}" expected "${value}" but got "${lastLoadedArtifact[field]}"`);
});

Then('the loaded requirement should have field {string} with undefined value', function(field: string) {
  assert.strictEqual(lastLoadedArtifact[field], undefined, `Requirement field "${field}" expected undefined but got "${lastLoadedArtifact[field]}"`);
});

Then('the loaded requirement should have array field {string} with {int} items', function(field: string, count: number) {
  assert.ok(Array.isArray(lastLoadedArtifact[field]), `Requirement field "${field}" should be an array`);
  assert.strictEqual(lastLoadedArtifact[field].length, count, `Requirement field "${field}" expected ${count} items but got ${lastLoadedArtifact[field].length}`);
});

Then('the loaded requirement should have object field {string} with key {string}', function(field: string, key: string) {
  assert.ok(lastLoadedArtifact[field], `Requirement field "${field}" should exist`);
  assert.ok(lastLoadedArtifact[field][key] !== undefined, `Requirement field "${field}" should have key "${key}"`);
});

// ============================================================================
// THEN Steps - Layer 3: Save handler assertions
// ============================================================================

Then('the saved story should preserve field {string} with value {string}', function(field: string, value: string) {
  const store = dpStore;
  const epics = store.getEpics();
  let story: any = null;
  for (const epic of epics) {
    story = epic.stories?.find((s: any) => s.id === 'STORY-RT-1');
    if (story) break;
  }
  assert.ok(story, 'Saved story not found');
  assert.strictEqual(story[field], value, `Saved story field "${field}" expected "${value}" but got "${story[field]}"`);
});

Then('the saved story should preserve field {string} with numeric value {int}', function(field: string, value: number) {
  const store = dpStore;
  const epics = store.getEpics();
  let story: any = null;
  for (const epic of epics) {
    story = epic.stories?.find((s: any) => s.id === 'STORY-RT-1');
    if (story) break;
  }
  assert.ok(story, 'Saved story not found');
  assert.strictEqual(story[field], value, `Saved story field "${field}" expected ${value} but got ${story[field]}`);
});

Then('the saved story should preserve array field {string} with {int} items', function(field: string, count: number) {
  const store = dpStore;
  const epics = store.getEpics();
  let story: any = null;
  for (const epic of epics) {
    story = epic.stories?.find((s: any) => s.id === 'STORY-RT-1');
    if (story) break;
  }
  assert.ok(story, 'Saved story not found');
  assert.ok(Array.isArray(story[field]), `Saved story field "${field}" should be an array`);
  assert.strictEqual(story[field].length, count, `Saved story field "${field}" expected ${count} items but got ${story[field].length}`);
});

// Requirement save assertions
Then('the saved requirement should preserve field {string} with value {string}', function(field: string, value: string) {
  const store = dpStore;
  const requirements = store.getRequirements();
  const req = requirements.functional.find((r: any) => r.id === 'FR-TEST-1');
  assert.ok(req, 'Saved requirement not found');
  assert.strictEqual(req[field], value, `Saved requirement field "${field}" expected "${value}" but got "${req[field]}"`);
});

Then('the saved requirement should preserve array field {string} with {int} items', function(field: string, count: number) {
  const store = dpStore;
  const requirements = store.getRequirements();
  const req = requirements.functional.find((r: any) => r.id === 'FR-TEST-1');
  assert.ok(req, 'Saved requirement not found');
  assert.ok(Array.isArray(req[field]), `Saved requirement field "${field}" should be an array`);
  assert.strictEqual(req[field].length, count, `Saved requirement field "${field}" expected ${count} items but got ${req[field].length}`);
});

// PRD save assertions
Then('the saved PRD should have productOverview.productName {string}', function(value: string) {
  const store = dpStore;
  const prd = store.artifacts.get('prd');
  assert.ok(prd, 'PRD not found');
  assert.strictEqual(prd.productOverview?.productName, value, `PRD productOverview.productName expected "${value}" but got "${prd.productOverview?.productName}"`);
});

Then('the saved PRD should have metadata field {string} with value {string}', function(field: string, value: string) {
  const store = dpStore;
  const prd = store.artifacts.get('prd');
  assert.ok(prd, 'PRD not found');
  assert.strictEqual(prd[field], value, `PRD field "${field}" expected "${value}" but got "${prd[field]}"`);
});

// Architecture save assertions
Then('the saved architecture should have overview.projectName {string}', function(value: string) {
  const store = dpStore;
  const arch = store.artifacts.get('architecture');
  assert.ok(arch, 'Architecture not found');
  assert.strictEqual(arch.overview?.projectName, value, `Architecture overview.projectName expected "${value}" but got "${arch.overview?.projectName}"`);
});

Then('the saved architecture should have metadata field {string} with value {string}', function(field: string, value: string) {
  const store = dpStore;
  const arch = store.artifacts.get('architecture');
  assert.ok(arch, 'Architecture not found');
  assert.strictEqual(arch[field], value, `Architecture field "${field}" expected "${value}" but got "${arch[field]}"`);
});

// Product-brief save assertions
Then('the saved product-brief should have productName {string}', function(value: string) {
  const store = dpStore;
  const pb = store.artifacts.get('productBrief');
  assert.ok(pb, 'Product-brief not found');
  assert.strictEqual(pb.productName, value, `Product-brief productName expected "${value}" but got "${pb.productName}"`);
});

Then('the saved product-brief should have metadata field {string} with value {string}', function(field: string, value: string) {
  const store = dpStore;
  const pb = store.artifacts.get('productBrief');
  assert.ok(pb, 'Product-brief not found');
  assert.strictEqual(pb[field], value, `Product-brief field "${field}" expected "${value}" but got "${pb[field]}"`);
});

// Use-case save assertions
Then('the saved use case should preserve field {string} with value {string}', function(field: string, value: string) {
  const store = dpStore;
  const epics = store.getEpics();
  let uc: any = null;
  for (const epic of epics) {
    uc = epic.useCases?.find((u: any) => u.id === 'UC-TEST-1');
    if (uc) break;
  }
  assert.ok(uc, 'Saved use case not found');
  assert.strictEqual(uc[field], value, `Saved use case field "${field}" expected "${value}" but got "${uc[field]}"`);
});

Then('the saved use case should preserve array field {string} with {int} items', function(field: string, count: number) {
  const store = dpStore;
  const epics = store.getEpics();
  let uc: any = null;
  for (const epic of epics) {
    uc = epic.useCases?.find((u: any) => u.id === 'UC-TEST-1');
    if (uc) break;
  }
  assert.ok(uc, 'Saved use case not found');
  assert.ok(Array.isArray(uc[field]), `Saved use case field "${field}" should be an array`);
  assert.strictEqual(uc[field].length, count, `Saved use case field "${field}" expected ${count} items but got ${uc[field].length}`);
});

// ============================================================================
// THEN Steps - Round-trip assertions
// ============================================================================

Then('the round-tripped story should have field {string} with value {string}', function(field: string, value: string) {
  assert.ok(lastRoundTrippedArtifact, 'No round-tripped artifact');
  assert.strictEqual(lastRoundTrippedArtifact[field], value, `Round-tripped story field "${field}" expected "${value}" but got "${lastRoundTrippedArtifact[field]}"`);
});

Then('the round-tripped story should have array field {string} with {int} items', function(field: string, count: number) {
  assert.ok(lastRoundTrippedArtifact, 'No round-tripped artifact');
  assert.ok(Array.isArray(lastRoundTrippedArtifact[field]), `Round-tripped story field "${field}" should be an array`);
  assert.strictEqual(lastRoundTrippedArtifact[field].length, count, `Round-tripped story field "${field}" expected ${count} items but got ${lastRoundTrippedArtifact[field].length}`);
});

Then('the round-tripped requirement should have field {string} with value {string}', function(field: string, value: string) {
  assert.ok(lastRoundTrippedArtifact, 'No round-tripped artifact');
  assert.strictEqual(lastRoundTrippedArtifact[field], value, `Round-tripped requirement field "${field}" expected "${value}" but got "${lastRoundTrippedArtifact[field]}"`);
});

Then('the round-tripped requirement should have array field {string} with {int} items', function(field: string, count: number) {
  assert.ok(lastRoundTrippedArtifact, 'No round-tripped artifact');
  assert.ok(Array.isArray(lastRoundTrippedArtifact[field]), `Round-tripped requirement field "${field}" should be an array`);
  assert.strictEqual(lastRoundTrippedArtifact[field].length, count, `Round-tripped requirement field "${field}" expected ${count} items but got ${lastRoundTrippedArtifact[field].length}`);
});

// Epic metadata assertions (Layer 2 verification)
Then('the epic metadata should contain field {string} with value {string}', function(field: string, value: string) {
  assert.ok(lastWebviewMetadata, 'No webview metadata extracted');
  assert.strictEqual(lastWebviewMetadata[field], value, `Epic metadata field "${field}" expected "${value}" but got "${lastWebviewMetadata[field]}"`);
});

Then('the epic metadata should contain array field {string} with {int} items', function(field: string, count: number) {
  assert.ok(lastWebviewMetadata, 'No webview metadata extracted');
  assert.ok(Array.isArray(lastWebviewMetadata[field]), `Epic metadata field "${field}" should be an array`);
  assert.strictEqual(lastWebviewMetadata[field].length, count, `Epic metadata field "${field}" expected ${count} items but got ${lastWebviewMetadata[field].length}`);
});

Then('the epic metadata should contain object field {string} with key {string}', function(field: string, key: string) {
  assert.ok(lastWebviewMetadata, 'No webview metadata extracted');
  assert.ok(lastWebviewMetadata[field], `Epic metadata field "${field}" should exist`);
  assert.ok(lastWebviewMetadata[field][key] !== undefined, `Epic metadata field "${field}" should have key "${key}"`);
});

// Use-case metadata assertions (Layer 2 verification)
Then('the use case metadata should contain field {string} with value {string}', function(field: string, value: string) {
  assert.ok(lastWebviewMetadata, 'No webview metadata extracted');
  assert.strictEqual(lastWebviewMetadata[field], value, `Use case metadata field "${field}" expected "${value}" but got "${lastWebviewMetadata[field]}"`);
});

Then('the use case metadata should contain array field {string} with {int} items', function(field: string, count: number) {
  assert.ok(lastWebviewMetadata, 'No webview metadata extracted');
  assert.ok(Array.isArray(lastWebviewMetadata[field]), `Use case metadata field "${field}" should be an array`);
  assert.strictEqual(lastWebviewMetadata[field].length, count, `Use case metadata field "${field}" expected ${count} items but got ${lastWebviewMetadata[field].length}`);
});
