/**
 * Chat Participant Step Definitions
 * Cucumber step definitions for testing AgileAgentCanvasChatParticipant functionality
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

// Module-level state
let chatResult: any = null;
let markdownCalls: string[] = [];
let buttonCalls: { command: string; args: any; title: string }[] = [];

// Configurable mock return values (changed per-scenario via Given steps)
let mockCurrentSession: any = null;
let mockBuildContinuePromptResult: string | null = null;
let mockInitializeResult: boolean = true;
let mockGetWorkflowsByModuleResult: any[] = [
  { path: '/path/workflow.md', name: 'Test Workflow', description: 'Test description' }
];
let mockGetWorkflowsByTagResult: any[] = [];
let mockGetAvailableWorkflowsResult: any[] = [
  { path: '/path/workflow.md', name: 'Test Workflow', description: 'Test description' }
];

// Mock workflow executor - returns null session by default
const mockWorkflowExecutor = {
  initialize: async () => mockInitializeResult,
  getAvailableWorkflows: () => mockGetAvailableWorkflowsResult,
  getWorkflowsByModule: () => mockGetWorkflowsByModuleResult,
  getWorkflowsByTag: () => mockGetWorkflowsByTagResult,
  buildWorkflowPrompt: async () => 'Test prompt',
  createSession: () => ({ id: 'ws-123', workflowName: 'Test Workflow', currentStepNumber: 0 }),
  detectUserPrompt: () => ({ waitingForInput: false }),
  getCurrentSession: () => mockCurrentSession,
  buildContinuePrompt: async () => mockBuildContinuePromptResult,
  getBmadPath: () => '/test/extension/resources/_bmad',
  executeWithTools: async () => {}
};

// Mock agileagentcanvas-tools module
const mockAgileAgentCanvasTools = {
  sharedToolContext: { bmadPath: '', outputPath: '', store: null },
  registerTools: () => [{ dispose: () => {} }],
  getToolDefinitions: () => []
};

// Mock ai-provider module — no vscode dependency in test runner
const mockAiProvider = {
  selectModel: async () => null,
  getModel: async () => null,
  streamChatResponse: async () => '',
  getNoModelMessage: () => '**AI not available** (test mode)',
  vsMessagesToChatMessages: (msgs: any[]) => msgs.map((m: any) => ({ role: 'user', content: '' }))
};

function getChatParticipant(world: BmadWorld): { store: any; participant: any } {
  if (!(world as any)._chatStore) {
    const mockExtension = {
      acOutput: {
        appendLine: () => {},
        append: () => {},
        clear: () => {},
        show: () => {},
      }
    };

    const artifactStoreModule = proxyquire('../../src/state/artifact-store', {
      'vscode': world.vscode,
      '../extension': mockExtension,
      '../commands/chat-bridge': { openChat: async () => true, setChatBridgeLogger: () => {} },
      './artifact-file-io': {
        resolveArtifactTargetUri: async (opts: any) => world.vscode.Uri.file(`/test/${opts.fileName}`),
        writeJsonFile: async () => {},
        writeMarkdownCompanion: async (jsonUri: any, mdFilename: string) => world.vscode.Uri.file(`/test/${mdFilename}`)
      }
    });

    const chatParticipantModule = proxyquire('../../src/chat/chat-participant', {
      'vscode': world.vscode,
      '../state/artifact-store': artifactStoreModule,
      '../extension': mockExtension,
      '../workflow/workflow-executor': {
        getWorkflowExecutor: () => mockWorkflowExecutor
      },
      './agileagentcanvas-tools': mockAgileAgentCanvasTools,
      './ai-provider': mockAiProvider
    });

    const store = new artifactStoreModule.ArtifactStore();
    const participant = new chatParticipantModule.AgileAgentCanvasChatParticipant(store);

    (world as any)._chatStore = store;
    (world as any)._chatParticipant = participant;
  }
  return { store: (world as any)._chatStore, participant: (world as any)._chatParticipant };
}

function buildMockStream(): any {
  markdownCalls = [];
  buttonCalls = [];
  return {
    markdown: (text: string) => { markdownCalls.push(text); },
    progress: () => {},
    button: (opts: any) => { buttonCalls.push(opts); },
    anchor: () => {},
    filetree: () => {},
    reference: () => {},
    push: () => {}
  };
}

function buildMockContext(): any {
  return { history: [] };
}

function buildMockToken(): any {
  return {
    isCancellationRequested: false,
    onCancellationRequested: () => {}
  };
}

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('a fresh chat participant', function(this: BmadWorld) {
  chatResult = null;
  markdownCalls = [];
  buttonCalls = [];
  // Reset configurable mock return values
  mockCurrentSession = null;
  mockBuildContinuePromptResult = null;
  mockInitializeResult = true;
  mockGetWorkflowsByModuleResult = [
    { path: '/path/workflow.md', name: 'Test Workflow', description: 'Test description' }
  ];
  mockGetWorkflowsByTagResult = [];
  mockGetAvailableWorkflowsResult = [
    { path: '/path/workflow.md', name: 'Test Workflow', description: 'Test description' }
  ];
  (this as any)._chatStore = null;
  (this as any)._chatParticipant = null;
  getChatParticipant(this);
});

Given('the chat store has project {string}', function(this: BmadWorld, projectName: string) {
  const { store } = getChatParticipant(this);
  store.initializeProject(projectName);
});

Given('the chat store has a requirement with id {string} and title {string}', function(this: BmadWorld, id: string, title: string) {
  const { store } = getChatParticipant(this);
  store.addRequirement({ id, title, description: 'Description' });
});

Given('the chat store has an epic with id {string} and title {string}', function(this: BmadWorld, id: string, title: string) {
  const { store } = getChatParticipant(this);
  store.addEpic({ id, title, goal: 'Test goal', functionalRequirements: [], status: 'draft', stories: [] });
});

Given('the chat store has refine context with id {string} and title {string}', function(this: BmadWorld, id: string, title: string) {
  const { store } = getChatParticipant(this);
  store.setRefineContext({ id, title, type: 'epic' });
});

Given('the chat store has refine context for {string} with refinements', function(this: BmadWorld, epicId: string) {
  const { store } = getChatParticipant(this);
  store.setRefineContext({
    id: epicId,
    type: 'epic',
    refinements: { title: 'Refined Title', goal: 'Refined goal' }
  });
});

Given('the chat store has complete artifacts', function(this: BmadWorld) {
  const { store } = getChatParticipant(this);
  store.initializeProject('Test Project');
  store.createOrUpdateVision();
  store.updateArtifact('vision', 'main', { problemStatement: 'Test problem' });
  store.addRequirement({ id: 'FR-1', title: 'Requirement', description: 'Description' });
  store.addEpic({ id: 'EPIC-1', title: 'Test Epic', goal: 'Test goal', functionalRequirements: ['FR-1'], status: 'draft', stories: [] });
  store.addStory('EPIC-1', { id: 'STORY-1-1', title: 'Test Story', status: 'draft' });
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I send a chat request with command {string} and prompt {string}', async function(this: BmadWorld, command: string, prompt: string) {
  const { participant } = getChatParticipant(this);
  const stream = buildMockStream();
  const request = {
    command,
    prompt,
    references: [],
    toolReferences: [],
    model: {},
    attempt: 0,
    enableCommandDetection: false
  };
  chatResult = await participant.handleChat(request, buildMockContext(), stream, buildMockToken());
});

When('I send a chat request with no command and prompt {string}', async function(this: BmadWorld, prompt: string) {
  const { participant } = getChatParticipant(this);
  const stream = buildMockStream();
  const request = {
    command: undefined,
    prompt,
    references: [],
    toolReferences: [],
    model: {},
    attempt: 0,
    enableCommandDetection: false
  };
  chatResult = await participant.handleChat(request, buildMockContext(), stream, buildMockToken());
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the markdown stream should have been called', function(this: BmadWorld) {
  assert.ok(markdownCalls.length > 0, 'Expected markdown to have been called');
});

Then('the markdown stream should contain {string}', function(this: BmadWorld, text: string) {
  const allOutput = markdownCalls.join('\n');
  assert.ok(allOutput.includes(text), `Expected markdown output to contain "${text}", got:\n${allOutput}`);
});

Then('the result metadata command should be defined', function(this: BmadWorld) {
  assert.ok(chatResult?.metadata?.command !== undefined, 'Expected result.metadata.command to be defined');
});

Then('the result metadata command should be {string}', function(this: BmadWorld, expected: string) {
  assert.strictEqual(chatResult?.metadata?.command, expected, `Expected command "${expected}", got "${chatResult?.metadata?.command}"`);
});

Then('the result metadata status should be {string}', function(this: BmadWorld, expected: string) {
  assert.strictEqual(chatResult?.metadata?.status, expected, `Expected status "${expected}", got "${chatResult?.metadata?.status}". Markdown output:\n${markdownCalls.join('\n')}`);
});

Then('the chat store should have at least {int} epic', function(this: BmadWorld, min: number) {
  const { store } = getChatParticipant(this);
  const epics = store.getEpics();
  assert.ok(epics.length >= min, `Expected at least ${min} epic(s), got ${epics.length}`);
});

// ============================================================================
// Apply Command — Artifact-type Refine Context Steps
// ============================================================================

Given('the chat store has refine context for vision with refinements', function(this: BmadWorld) {
  const { store } = getChatParticipant(this);
  store.createOrUpdateVision();
  store.setRefineContext({
    id: 'main',
    type: 'vision',
    refinements: { productName: 'Refined Product', problemStatement: 'Refined problem' }
  });
});

Given('the chat store has refine context for story {string} with refinements', function(this: BmadWorld, storyId: string) {
  const { store } = getChatParticipant(this);
  store.setRefineContext({
    id: storyId,
    type: 'story',
    refinements: { title: 'Refined Story Title', technicalNotes: 'Some notes' }
  });
});

Given('the chat store has refine context for requirement {string} with refinements', function(this: BmadWorld, reqId: string) {
  const { store } = getChatParticipant(this);
  store.setRefineContext({
    id: reqId,
    type: 'requirement',
    refinements: { title: 'Refined Req Title', description: 'Better description' }
  });
});

Given('the chat store has refine context for test-case {string} with refinements', function(this: BmadWorld, tcId: string) {
  const { store } = getChatParticipant(this);
  store.setRefineContext({
    id: tcId,
    type: 'test-case',
    refinements: { title: 'Refined TC', steps: ['Step1', 'Step2'] }
  });
});

Given('the chat store has refine context for test-strategy {string} with refinements', function(this: BmadWorld, tsId: string) {
  const { store } = getChatParticipant(this);
  store.setRefineContext({
    id: tsId,
    type: 'test-strategy',
    refinements: { title: 'Refined Strategy', approach: 'BDD' }
  });
});

Given('the chat store has refine context for product-brief with refinements', function(this: BmadWorld) {
  const { store } = getChatParticipant(this);
  store.createProductBrief();
  store.setRefineContext({
    id: 'product-brief-1',
    type: 'product-brief',
    refinements: { overview: 'New overview', suggestions: ['remove-me'] }
  });
});

Given('the chat store has refine context for prd with refinements', function(this: BmadWorld) {
  const { store } = getChatParticipant(this);
  store.createPRD();
  store.setRefineContext({
    id: 'prd-1',
    type: 'prd',
    refinements: { productOverview: { productName: 'Updated', purpose: '', problemStatement: '' }, suggestions: ['remove-me'] }
  });
});

Given('the chat store has refine context for architecture with refinements', function(this: BmadWorld) {
  const { store } = getChatParticipant(this);
  store.createArchitecture();
  store.setRefineContext({
    id: 'architecture-1',
    type: 'architecture',
    refinements: { systemType: 'Microservices', suggestions: ['remove-me'] }
  });
});

Given('the chat store has refine context for use-case {string} with refinements', function(this: BmadWorld, ucId: string) {
  const { store } = getChatParticipant(this);
  store.setRefineContext({
    id: ucId,
    type: 'use-case',
    refinements: { title: 'Refined UC', summary: 'Better summary' }
  });
});

Given('the chat store has refine context for unsupported type', function(this: BmadWorld) {
  const { store } = getChatParticipant(this);
  store.setRefineContext({
    id: 'unknown-1',
    type: 'unknown-type',
    refinements: { something: 'value' }
  });
});

// ============================================================================
// Status Command — Active Session Steps
// ============================================================================

Given('the workflow executor has an active session', function(this: BmadWorld) {
  mockCurrentSession = {
    id: 'ws-test-123',
    workflowName: 'Test Refinement Workflow',
    status: 'active',
    currentStepNumber: 2,
    stepsCompleted: ['step-1/init', 'step-2/gather'],
    artifactType: 'epic',
    artifactId: 'EPIC-1',
    startedAt: new Date('2025-01-15T10:00:00Z'),
    lastActivityAt: new Date('2025-01-15T10:05:00Z'),
    userInputs: [
      { step: 'step-1/init', input: 'Start the refinement process for this epic with full analysis' }
    ],
    artifact: {}
  };
});

Given('the workflow executor has an active session with no steps or inputs', function(this: BmadWorld) {
  mockCurrentSession = {
    id: 'ws-empty-001',
    workflowName: 'Quick Workflow',
    status: 'active',
    currentStepNumber: 0,
    stepsCompleted: [],
    artifactType: 'story',
    artifactId: 'STORY-1-1',
    startedAt: new Date('2025-01-15T10:00:00Z'),
    lastActivityAt: new Date('2025-01-15T10:00:00Z'),
    userInputs: [],
    artifact: {}
  };
});

// ============================================================================
// Continue Command — Active Session Steps
// ============================================================================

Given('the workflow executor has an active session with a continue prompt', function(this: BmadWorld) {
  mockCurrentSession = {
    id: 'ws-cont-456',
    workflowName: 'Continue Workflow',
    status: 'active',
    currentStepNumber: 1,
    stepsCompleted: [],
    artifactType: 'epic',
    artifactId: 'EPIC-1',
    startedAt: new Date(),
    lastActivityAt: new Date(),
    userInputs: [],
    artifact: {}
  };
  mockBuildContinuePromptResult = 'Please analyze the epic...';
});

Given('the workflow executor has an active session with no next step', function(this: BmadWorld) {
  mockCurrentSession = {
    id: 'ws-done-789',
    workflowName: 'Done Workflow',
    status: 'active',
    currentStepNumber: 3,
    stepsCompleted: ['s1', 's2', 's3'],
    artifactType: 'epic',
    artifactId: 'EPIC-1',
    startedAt: new Date(),
    lastActivityAt: new Date(),
    userInputs: [],
    artifact: {}
  };
  mockBuildContinuePromptResult = null; // no next step
});

// ============================================================================
// Workflows Command — Configurable Steps
// ============================================================================

Given('the workflow executor has module workflows', function(this: BmadWorld) {
  mockGetWorkflowsByModuleResult = [
    { path: '/p/wf1.md', name: 'Module WF 1', description: 'First workflow', phase: 'analysis', tags: ['validation'] },
    { path: '/p/wf2.md', name: 'Module WF 2', description: 'Second workflow', phase: 'analysis', tags: [] },
    { path: '/p/wf3.md', name: 'Module WF 3', description: 'Third workflow', phase: 'solutioning', tags: ['architecture'] }
  ];
});

Given('the workflow executor has no module workflows', function(this: BmadWorld) {
  mockGetWorkflowsByModuleResult = [];
});

Given('the workflow executor has no artifact workflows', function(this: BmadWorld) {
  mockGetAvailableWorkflowsResult = [];
});

Given('the workflow executor has tagged workflows', function(this: BmadWorld) {
  mockGetWorkflowsByTagResult = [
    { path: '/p/twf.md', name: 'Tagged WF', description: 'Tag match', module: 'bmm' }
  ];
});

Given('the workflow executor returns not initialized', function(this: BmadWorld) {
  mockInitializeResult = false;
});

// ============================================================================
// Additional THEN Steps
// ============================================================================

Then('the result metadata filter should be {string}', function(this: BmadWorld, expected: string) {
  assert.strictEqual(chatResult?.metadata?.filter, expected, `Expected filter "${expected}", got "${chatResult?.metadata?.filter}"`);
});

Then('the result metadata sessionId should be defined', function(this: BmadWorld) {
  assert.ok(chatResult?.metadata?.sessionId, 'Expected result.metadata.sessionId to be defined');
});

Then('the markdown stream should not contain {string}', function(this: BmadWorld, text: string) {
  const allOutput = markdownCalls.join('\n');
  assert.ok(!allOutput.includes(text), `Expected markdown output NOT to contain "${text}", got:\n${allOutput.substring(0, 300)}`);
});
