/**
 * Workflow Executor Step Definitions
 * Cucumber step definitions for testing WorkflowExecutor functionality
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

// We need to use proxyquire to load the module with mocks
const proxyquire = require('proxyquire').noCallThru();

// Module-level variables for parsed results
let parsedFrontmatter: any = null;
let parsedBody: string = '';
let stepNavigation: any = null;
let promptDetection: any = null;
let queryResult: any[] = [];
let menuResult: string = '';
let resolvedValue: string = '';
let updateResult: any = null;
let switchResult: boolean = false;
let retrievedSession: any = null;
let storedSessionIds: Map<string, string> = new Map();
let storedActivityTime: Date | null = null;
let singletonInstances: any[] = [];
let workflowDefinition: any = null;

// Helper to get or create WorkflowExecutor
function getWorkflowExecutor(world: BmadWorld): any {
  if (!world.workflowExecutor) {
    // Mock the extension module
    const mockExtension = {
      acOutput: {
        appendLine: () => {},
        append: () => {},
        clear: () => {},
        show: () => {},
      }
    };
    
    // Load workflow-executor with mocked dependencies
    const workflowModule = proxyquire('../../src/workflow/workflow-executor', {
      'vscode': world.vscode,
      '../extension': mockExtension,
      '../chat/agentcanvas-tools': {
        getToolDefinitions: () => []
      },
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
    
    world.workflowExecutor = new workflowModule.WorkflowExecutor();
    
    // Also store the registry and parser for direct access
    (world as any)._workflowRegistry = workflowModule.WORKFLOW_REGISTRY;
    (world as any)._parseFrontmatter = workflowModule.parseFrontmatter;
    (world as any)._getWorkflowExecutor = workflowModule.getWorkflowExecutor;
  }
  return world.workflowExecutor;
}

function getWorkflowRegistry(world: BmadWorld): any[] {
  getWorkflowExecutor(world); // Ensure module is loaded
  return (world as any)._workflowRegistry || [];
}

function getParseFrontmatter(world: BmadWorld): any {
  getWorkflowExecutor(world); // Ensure module is loaded
  return (world as any)._parseFrontmatter;
}

function getGetWorkflowExecutor(world: BmadWorld): any {
  getWorkflowExecutor(world); // Ensure module is loaded
  return (world as any)._getWorkflowExecutor;
}

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('a fresh workflow executor', function(this: BmadWorld) {
  // Reset stored state
  parsedFrontmatter = null;
  parsedBody = '';
  stepNavigation = null;
  promptDetection = null;
  queryResult = [];
  menuResult = '';
  resolvedValue = '';
  updateResult = null;
  switchResult = false;
  retrievedSession = null;
  storedSessionIds.clear();
  storedActivityTime = null;
  singletonInstances = [];
  workflowDefinition = null;
  
  // Force re-creation of executor
  this.workflowExecutor = null as any;
  getWorkflowExecutor(this);
});

Given('I have an active session', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  executor.createSession('/path.md', 'Test', 'epic', 'EPIC-1', {});
});

Given('I store the session ID as {string}', function(this: BmadWorld, name: string) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  if (session) {
    storedSessionIds.set(name, session.id);
  }
});

Given('I store the session last activity time', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  if (session) {
    storedActivityTime = new Date(session.lastActivityAt.getTime());
  }
});

Given('I complete the current session', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  executor.completeSession();
});

Given('a workflow definition with:', function(this: BmadWorld, dataTable: any) {
  workflowDefinition = {};
  // Use raw() since the table is in key | value format
  for (const row of dataTable.raw()) {
    const key = row[0]?.trim();
    const value = row[1]?.trim();
    if (key && value !== undefined) {
      workflowDefinition[key] = value;
    }
  }
  // Handle artifact types as array if present
  if (workflowDefinition.artifactTypes) {
    workflowDefinition.artifactTypes = workflowDefinition.artifactTypes.split(',').map((s: string) => s.trim());
  }
  // Handle tags as array if present
  if (workflowDefinition.tags) {
    workflowDefinition.tags = workflowDefinition.tags.split(',').map((s: string) => s.trim());
  }
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I parse frontmatter from content:', function(this: BmadWorld, docString: string) {
  const parseFrontmatter = getParseFrontmatter(this);
  const result = parseFrontmatter(docString);
  parsedFrontmatter = result.frontmatter;
  parsedBody = result.body;
});

When('I create a session with:', function(this: BmadWorld, dataTable: any) {
  const executor = getWorkflowExecutor(this);
  const data: any = {};
  
  for (const row of dataTable.raw()) {
    data[row[0]] = row[1];
  }
  
  executor.createSession(
    data.path,
    data.name,
    data.artifactType,
    data.artifactId,
    data.artifact ? JSON.parse(data.artifact) : { id: data.artifactId }
  );
});

When('I also store the session ID as {string}', function(this: BmadWorld, name: string) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  if (session) {
    storedSessionIds.set(name, session.id);
  }
});

When('I get session with ID {string}', function(this: BmadWorld, id: string) {
  const executor = getWorkflowExecutor(this);
  retrievedSession = executor.getSession(id);
});

When('I update the session with input {string}', function(this: BmadWorld, input: string) {
  const executor = getWorkflowExecutor(this);
  updateResult = executor.updateSession(input);
});

When('I update the session with input {string} and mark step completed', function(this: BmadWorld, input: string) {
  const executor = getWorkflowExecutor(this);
  updateResult = executor.updateSession(input, undefined, true);
});

When('I update the session with input {string} and next step {string}', function(this: BmadWorld, input: string, nextStep: string) {
  const executor = getWorkflowExecutor(this);
  updateResult = executor.updateSession(input, nextStep, true);
});

When('I complete the session', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  executor.completeSession();
});

When('I cancel the session', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  executor.cancelSession();
});

When('I switch to session {string}', function(this: BmadWorld, sessionName: string) {
  const executor = getWorkflowExecutor(this);
  const sessionId = storedSessionIds.get(sessionName) || sessionName;
  switchResult = executor.setCurrentSession(sessionId);
});

When('I parse step navigation from content:', async function(this: BmadWorld, docString: string) {
  const executor = getWorkflowExecutor(this);
  stepNavigation = await executor.parseStepNavigation(docString);
});

When('I detect user prompt in response:', function(this: BmadWorld, docString: string) {
  const executor = getWorkflowExecutor(this);
  promptDetection = executor.detectUserPrompt(docString);
});

When('I detect user prompt in response {string}', function(this: BmadWorld, response: string) {
  const executor = getWorkflowExecutor(this);
  promptDetection = executor.detectUserPrompt(response);
});

When('I get all workflows', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  queryResult = executor.getAllWorkflows();
});

When('I get workflows for module {string}', function(this: BmadWorld, module: string) {
  const executor = getWorkflowExecutor(this);
  queryResult = executor.getWorkflowsByModule(module);
});

When('I get workflows with tag {string}', function(this: BmadWorld, tag: string) {
  const executor = getWorkflowExecutor(this);
  queryResult = executor.getWorkflowsByTag(tag);
});

When('I get workflows for artifact type {string}', function(this: BmadWorld, artifactType: string) {
  const executor = getWorkflowExecutor(this);
  queryResult = executor.getWorkflowsForArtifact(artifactType);
});

When('I get available workflows for artifact {string}', function(this: BmadWorld, artifactType: string) {
  const executor = getWorkflowExecutor(this);
  queryResult = executor.getAvailableWorkflows(artifactType);
});

When('I get workflow menu for {string}', function(this: BmadWorld, artifactType: string) {
  const executor = getWorkflowExecutor(this);
  menuResult = executor.getWorkflowMenu(artifactType);
});

When('I get all available workflows menu', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  menuResult = executor.getAllAvailableWorkflowsMenu();
});

When('I resolve variable {string}', function(this: BmadWorld, variable: string) {
  const executor = getWorkflowExecutor(this);
  resolvedValue = executor.resolveVariable(variable);
});

When('I get the workflow executor singleton twice', function(this: BmadWorld) {
  const getExecutor = getGetWorkflowExecutor(this);
  singletonInstances = [getExecutor(), getExecutor()];
});

// ============================================================================
// THEN Steps
// ============================================================================

// Registry assertions
Then('the workflow registry should contain at least {int} workflows', function(this: BmadWorld, count: number) {
  const registry = getWorkflowRegistry(this);
  assert.ok(registry.length >= count, `Expected at least ${count} workflows, got ${registry.length}`);
});

Then('workflows should exist in module {string}', function(this: BmadWorld, module: string) {
  const registry = getWorkflowRegistry(this);
  const workflows = registry.filter((w: any) => w.module === module);
  assert.ok(workflows.length > 0, `No workflows found for module "${module}"`);
});

Then('all workflow IDs should be unique', function(this: BmadWorld) {
  const registry = getWorkflowRegistry(this);
  const ids = registry.map((w: any) => w.id);
  const uniqueIds = new Set(ids);
  assert.strictEqual(ids.length, uniqueIds.size, 'Workflow IDs are not unique');
});

Then('all workflows should have required fields', function(this: BmadWorld) {
  const registry = getWorkflowRegistry(this);
  for (const workflow of registry) {
    assert.ok(workflow.id, 'Workflow missing id');
    assert.ok(workflow.name, 'Workflow missing name');
    assert.ok(workflow.description, 'Workflow missing description');
    assert.ok(workflow.module, 'Workflow missing module');
    assert.ok(workflow.path, 'Workflow missing path');
    assert.ok(workflow.format, 'Workflow missing format');
  }
});

Then('the {string} module should contain at least {int} workflows', function(this: BmadWorld, module: string, count: number) {
  const registry = getWorkflowRegistry(this);
  const workflows = registry.filter((w: any) => w.module === module);
  assert.ok(workflows.length >= count, `Expected at least ${count} workflows in ${module}, got ${workflows.length}`);
});

Then('the {string} module should have workflow {string}', function(this: BmadWorld, module: string, workflowId: string) {
  const registry = getWorkflowRegistry(this);
  const workflows = registry.filter((w: any) => w.module === module);
  const ids = workflows.map((w: any) => w.id);
  assert.ok(ids.includes(workflowId), `Workflow "${workflowId}" not found in module "${module}"`);
});

// Frontmatter assertions
Then('the frontmatter name should be {string}', function(this: BmadWorld, expected: string) {
  assert.strictEqual(parsedFrontmatter?.name, expected);
});

Then('the frontmatter description should be {string}', function(this: BmadWorld, expected: string) {
  assert.strictEqual(parsedFrontmatter?.description, expected);
});

Then('the frontmatter output_format should be {string}', function(this: BmadWorld, expected: string) {
  assert.strictEqual(parsedFrontmatter?.output_format, expected);
});

Then('the body should be {string}', function(this: BmadWorld, expected: string) {
  // Replace escaped newlines with actual newlines for comparison
  const normalizedExpected = expected.replace(/\\n/g, '\n');
  assert.strictEqual(parsedBody, normalizedExpected);
});

Then('the frontmatter should be empty', function(this: BmadWorld) {
  assert.deepStrictEqual(parsedFrontmatter, {});
});

Then('the frontmatter should be null', function(this: BmadWorld) {
  assert.strictEqual(parsedFrontmatter, null);
});

Then('the frontmatter tags should contain {string} and {string}', function(this: BmadWorld, tag1: string, tag2: string) {
  assert.ok(Array.isArray(parsedFrontmatter?.tags), 'Tags should be an array');
  assert.ok(parsedFrontmatter.tags.includes(tag1), `Tags should contain "${tag1}"`);
  assert.ok(parsedFrontmatter.tags.includes(tag2), `Tags should contain "${tag2}"`);
});

Then('the frontmatter config timeout should be {int}', function(this: BmadWorld, expected: number) {
  assert.strictEqual(parsedFrontmatter?.config?.timeout, expected);
});

Then('the frontmatter config retries should be {int}', function(this: BmadWorld, expected: number) {
  assert.strictEqual(parsedFrontmatter?.config?.retries, expected);
});

Then('the frontmatter editWorkflow should be {string}', function(this: BmadWorld, expected: string) {
  assert.strictEqual(parsedFrontmatter?.editWorkflow, expected);
});

Then('the frontmatter validateWorkflow should be {string}', function(this: BmadWorld, expected: string) {
  assert.strictEqual(parsedFrontmatter?.validateWorkflow, expected);
});

Then('the frontmatter nextStepFile should be {string}', function(this: BmadWorld, expected: string) {
  assert.strictEqual(parsedFrontmatter?.nextStepFile, expected);
});

// Session assertions
Then(/^the session ID should match pattern "([^"]*)"$/, function(this: BmadWorld, pattern: string) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  const regex = new RegExp(pattern);
  assert.ok(regex.test(session?.id || ''), `Session ID "${session?.id}" does not match pattern "${pattern}"`);
});

Then('the session workflow path should be {string}', function(this: BmadWorld, expected: string) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  assert.strictEqual(session?.workflowPath, expected);
});

Then('the session workflow name should be {string}', function(this: BmadWorld, expected: string) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  assert.strictEqual(session?.workflowName, expected);
});

Then('the session artifact type should be {string}', function(this: BmadWorld, expected: string) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  assert.strictEqual(session?.artifactType, expected);
});

Then('the session artifact ID should be {string}', function(this: BmadWorld, expected: string) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  assert.strictEqual(session?.artifactId, expected);
});

Then('the session status should be {string}', function(this: BmadWorld, expected: string) {
  const executor = getWorkflowExecutor(this);
  // Get session from all sessions, not just current (completed sessions are no longer current)
  const sessions = Array.from((executor as any).sessions?.values() || []);
  const session = sessions[sessions.length - 1] || executor.getCurrentSession();
  assert.strictEqual(session?.status, expected);
});

Then('the session current step number should be {int}', function(this: BmadWorld, expected: number) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  assert.strictEqual(session?.currentStepNumber, expected);
});

Then('the session steps completed should be empty', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  assert.deepStrictEqual(session?.stepsCompleted, []);
});

Then('the session user inputs should be empty', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  assert.deepStrictEqual(session?.userInputs, []);
});

Then('the current session should be the created session', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  const current = executor.getCurrentSession();
  assert.ok(current !== null, 'Current session should not be null');
});

Then('session ID {string} should be different from {string}', function(this: BmadWorld, name1: string, name2: string) {
  const id1 = storedSessionIds.get(name1);
  const id2 = storedSessionIds.get(name2);
  assert.ok(id1 !== id2, `Session IDs should be different: ${id1} vs ${id2}`);
});

Then('the session workflow ID should be {string}', function(this: BmadWorld, expected: string) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  assert.strictEqual(session?.workflowId, expected);
});

Then('the current session should be null', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  assert.strictEqual(session, null);
});

Then('the current session should not be null', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  assert.ok(session !== null, 'Current session should not be null');
});

Then('the current session workflow name should be {string}', function(this: BmadWorld, expected: string) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  assert.strictEqual(session?.workflowName, expected);
});

Then('getting the session by its ID should return the same session', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  const current = executor.getCurrentSession();
  const retrieved = executor.getSession(current?.id);
  assert.strictEqual(retrieved, current);
});

Then('the retrieved session should be null', function(this: BmadWorld) {
  assert.strictEqual(retrievedSession, null);
});

Then('the session should have {int} user input(s)', function(this: BmadWorld, count: number) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession() || updateResult;
  assert.strictEqual(session?.userInputs?.length, count);
});

Then('the session user input {int} should be {string}', function(this: BmadWorld, index: number, expected: string) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession() || updateResult;
  assert.strictEqual(session?.userInputs?.[index - 1]?.input, expected);
});

Then('the session should have {int} completed step(s)', function(this: BmadWorld, count: number) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession() || updateResult;
  assert.strictEqual(session?.stepsCompleted?.length, count);
});

Then('the session current step path should be {string}', function(this: BmadWorld, expected: string) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession() || updateResult;
  assert.strictEqual(session?.currentStepPath, expected);
});

Then('the session last activity time should be updated', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession() || updateResult;
  assert.ok(
    session?.lastActivityAt.getTime() >= (storedActivityTime?.getTime() || 0),
    'Last activity time should be updated'
  );
});

Then('the update result should be null', function(this: BmadWorld) {
  assert.strictEqual(updateResult, null);
});

Then('the switch should succeed', function(this: BmadWorld) {
  assert.strictEqual(switchResult, true);
});

Then('the switch should fail', function(this: BmadWorld) {
  assert.strictEqual(switchResult, false);
});

// Step navigation assertions
Then('the next step should be {string}', function(this: BmadWorld, expected: string) {
  assert.strictEqual(stepNavigation?.nextStep, expected);
});

Then('the this step should be {string}', function(this: BmadWorld, expected: string) {
  assert.strictEqual(stepNavigation?.thisStep, expected);
});

Then('the next step should be undefined', function(this: BmadWorld) {
  assert.strictEqual(stepNavigation?.nextStep, undefined);
});

Then('the this step should be undefined', function(this: BmadWorld) {
  assert.strictEqual(stepNavigation?.thisStep, undefined);
});

// Prompt detection assertions
Then('waiting for input should be true', function(this: BmadWorld) {
  assert.strictEqual(promptDetection?.waitingForInput, true);
});

Then('waiting for input should be false', function(this: BmadWorld) {
  assert.strictEqual(promptDetection?.waitingForInput, false);
});

Then('menu options should contain {string}', function(this: BmadWorld, expected: string) {
  assert.ok(
    promptDetection?.menuOptions?.includes(expected),
    `Menu options should contain "${expected}"`
  );
});

Then('continue option should be true', function(this: BmadWorld) {
  assert.strictEqual(promptDetection?.continueOption, true);
});

Then(/^menu options starting with "\[A\]" should appear only once$/, function(this: BmadWorld) {
  const aOptions = promptDetection?.menuOptions?.filter((o: string) => o.startsWith('[A]')) || [];
  assert.strictEqual(aOptions.length, 1, 'Should have exactly one [A] option');
});

// Query result assertions
Then('the result should be the workflow registry', function(this: BmadWorld) {
  const registry = getWorkflowRegistry(this);
  assert.strictEqual(queryResult, registry);
});

Then('the result should contain more than {int} workflows', function(this: BmadWorld, count: number) {
  assert.ok(queryResult.length > count, `Expected more than ${count} workflows, got ${queryResult.length}`);
});

Then('all returned workflows should have module {string}', function(this: BmadWorld, module: string) {
  assert.ok(queryResult.length > 0, 'Expected at least one workflow');
  assert.ok(queryResult.every((w: any) => w.module === module), `Not all workflows have module "${module}"`);
});

Then('all returned workflows should have tag {string}', function(this: BmadWorld, tag: string) {
  assert.ok(queryResult.length > 0, 'Expected at least one workflow');
  assert.ok(queryResult.every((w: any) => w.tags?.includes(tag)), `Not all workflows have tag "${tag}"`);
});

Then('the result should be empty', function(this: BmadWorld) {
  assert.deepStrictEqual(queryResult, []);
});

Then('all returned workflows should support artifact {string}', function(this: BmadWorld, artifactType: string) {
  assert.ok(queryResult.length > 0, 'Expected at least one workflow');
  assert.ok(
    queryResult.every((w: any) => w.artifactTypes?.includes(artifactType)),
    `Not all workflows support artifact "${artifactType}"`
  );
});

Then('the result should not be empty', function(this: BmadWorld) {
  assert.ok(queryResult.length > 0, 'Result should not be empty');
});

Then('all results should have path, name, and description', function(this: BmadWorld) {
  for (const result of queryResult) {
    assert.ok(result.path, 'Result should have path');
    assert.ok(result.name, 'Result should have name');
    assert.ok(result.description, 'Result should have description');
  }
});

Then('the result should contain workflow named {string}', function(this: BmadWorld, name: string) {
  const names = queryResult.map((w: any) => w.name);
  assert.ok(names.includes(name), `Result should contain workflow named "${name}"`);
});

// Menu assertions
Then('the menu should contain {string}', function(this: BmadWorld, expected: string) {
  assert.ok(menuResult.includes(expected), `Menu should contain "${expected}"`);
});

Then(/^the menu should match pattern "([^"]*)"$/, function(this: BmadWorld, pattern: string) {
  const regex = new RegExp(pattern);
  assert.ok(regex.test(menuResult), `Menu should match pattern "${pattern}"`);
});

// Variable resolution assertions
Then('the resolved value should be {string}', function(this: BmadWorld, expected: string) {
  assert.strictEqual(resolvedValue, expected);
});

// Getter assertions
Then('the BMAD path should be empty', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  assert.strictEqual(executor.getBmadPath(), '');
});

Then('the project root should be empty', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  assert.strictEqual(executor.getProjectRoot(), '');
});

// Singleton assertions
Then('both instances should be the same', function(this: BmadWorld) {
  assert.strictEqual(singletonInstances[0], singletonInstances[1]);
});

// Interface/definition assertions
Then('the definition should have all required fields', function(this: BmadWorld) {
  assert.ok(workflowDefinition.id, 'Definition should have id');
  assert.ok(workflowDefinition.name, 'Definition should have name');
  assert.ok(workflowDefinition.description, 'Definition should have description');
  assert.ok(workflowDefinition.module, 'Definition should have module');
  assert.ok(workflowDefinition.path, 'Definition should have path');
  assert.ok(workflowDefinition.format, 'Definition should have format');
});

Then('the definition phase should be {string}', function(this: BmadWorld, expected: string) {
  assert.strictEqual(workflowDefinition.phase, expected);
});

Then('the definition category should be {string}', function(this: BmadWorld, expected: string) {
  assert.strictEqual(workflowDefinition.category, expected);
});

Then('the session should have all required fields', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  
  assert.ok(session.id, 'Session should have id');
  assert.ok(session.workflowId !== undefined, 'Session should have workflowId');
  assert.ok(session.workflowPath, 'Session should have workflowPath');
  assert.ok(session.workflowName, 'Session should have workflowName');
  assert.ok(session.currentStepPath, 'Session should have currentStepPath');
  assert.ok(session.currentStepNumber !== undefined, 'Session should have currentStepNumber');
  assert.ok(session.stepsCompleted, 'Session should have stepsCompleted');
  assert.ok(session.artifactType, 'Session should have artifactType');
  assert.ok(session.artifactId, 'Session should have artifactId');
  assert.ok(session.artifact !== undefined, 'Session should have artifact');
  assert.ok(session.userInputs, 'Session should have userInputs');
  assert.ok(session.startedAt, 'Session should have startedAt');
  assert.ok(session.lastActivityAt, 'Session should have lastActivityAt');
  assert.ok(session.status, 'Session should have status');
});

Then('the session started at should be a valid date', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  assert.ok(session?.startedAt instanceof Date, 'startedAt should be a Date');
});

Then('the session last activity at should be a valid date', function(this: BmadWorld) {
  const executor = getWorkflowExecutor(this);
  const session = executor.getCurrentSession();
  assert.ok(session?.lastActivityAt instanceof Date, 'lastActivityAt should be a Date');
});
