/**
 * Artifact Store Step Definitions
 * Cucumber step definitions for testing ArtifactStore functionality
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

// We need to use proxyquire to load the module with mocks
const proxyquire = require('proxyquire').noCallThru();

// Helper to get or create ArtifactStore
function getArtifactStore(world: BmadWorld): any {
  if (!world.artifactStore) {
    // Mock the extension module
    const mockExtension = {
      acOutput: {
        appendLine: () => {},
        append: () => {},
        clear: () => {},
        show: () => {},
      }
    };
    
    // Load artifact-store with mocked dependencies
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
    
    world.artifactStore = new artifactStoreModule.ArtifactStore(world.context as any);
  }
  return world.artifactStore;
}

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('a fresh artifact store', function(this: BmadWorld) {
  // Force re-creation of artifact store
  this.artifactStore = null as any;
  getArtifactStore(this);
});

Given('I initialize a project named {string}', function(this: BmadWorld, projectName: string) {
  const store = getArtifactStore(this);
  store.initializeProject(projectName);
});

Given('I create a vision artifact', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  store.createOrUpdateVision();
});

Given('I add an epic with title {string}', function(this: BmadWorld, title: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const nextId = epics.length + 1;
  
  store.addEpic({
    id: `EPIC-${nextId}`,
    title: title,
    goal: '',
    functionalRequirements: [],
    status: 'draft',
    stories: []
  });
  
  // Track the created artifact
  this.createdArtifacts.set(title, `EPIC-${nextId}`);
});

Given('I create a story in epic {string}', function(this: BmadWorld, epicTitleOrId: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.id === epicTitleOrId || e.title === epicTitleOrId);
  
  if (!epic) {
    throw new Error(`Epic "${epicTitleOrId}" not found`);
  }
  
  const story = store.createStory(epic.id);
  this.lastResult = story;
});

Given('I create a requirement with title {string}', function(this: BmadWorld, title: string) {
  const store = getArtifactStore(this);
  const req = store.createRequirement();
  store.updateArtifact('requirement', req.id, { title });
  this.createdArtifacts.set(title, req.id);
});

Given('I select the epic {string}', function(this: BmadWorld, epicTitle: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.title === epicTitle);
  
  if (!epic) {
    throw new Error(`Epic "${epicTitle}" not found`);
  }
  
  store.setSelectedArtifact('epic', epic.id);
});

Given('I subscribe to state changes', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  
  // Store event counter in world for later verification
  this.createdArtifacts.set('_eventCount', 0);
  
  // Subscribe to count events
  store.onDidChangeArtifacts(() => {
    const currentCount = this.createdArtifacts.get('_eventCount') || 0;
    this.createdArtifacts.set('_eventCount', currentCount + 1);
  });
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I initialize project {string}', function(this: BmadWorld, projectName: string) {
  const store = getArtifactStore(this);
  store.initializeProject(projectName);
});

When('I create vision artifact', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  store.createOrUpdateVision();
});

When('I update the vision with:', function(this: BmadWorld, dataTable: any) {
  const store = getArtifactStore(this);
  const changes: any = {};
  
  for (const row of dataTable.hashes()) {
    changes[row.field] = row.value;
  }
  
  store.updateArtifact('vision', 'vision-1', changes);
});

When('I add epic with title {string}', function(this: BmadWorld, title: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const nextId = epics.length + 1;
  
  store.addEpic({
    id: `EPIC-${nextId}`,
    title: title,
    goal: '',
    functionalRequirements: [],
    status: 'draft',
    stories: []
  });
  
  this.createdArtifacts.set(title, `EPIC-${nextId}`);
});

When('I update the epic {string} with title {string}', function(this: BmadWorld, oldTitle: string, newTitle: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.title === oldTitle);
  
  if (!epic) {
    throw new Error(`Epic "${oldTitle}" not found`);
  }
  
  store.updateArtifact('epic', epic.id, { title: newTitle });
  
  // Update tracking
  this.createdArtifacts.delete(oldTitle);
  this.createdArtifacts.set(newTitle, epic.id);
});

When('I update the epic {string} with description {string}', function(this: BmadWorld, epicTitle: string, description: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.title === epicTitle);
  
  if (!epic) {
    throw new Error(`Epic "${epicTitle}" not found`);
  }
  
  store.updateArtifact('epic', epic.id, { description });
});

When('I delete the epic {string}', function(this: BmadWorld, epicTitle: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epicIndex = epics.findIndex((e: any) => e.title === epicTitle);
  
  if (epicIndex < 0) {
    throw new Error(`Epic "${epicTitle}" not found`);
  }
  
  // Remove the epic directly from the array (getEpics returns the actual array)
  epics.splice(epicIndex, 1);
  
  this.createdArtifacts.delete(epicTitle);
});

When('I create story in epic {string}', function(this: BmadWorld, epicTitle: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.title === epicTitle);
  
  if (!epic) {
    throw new Error(`Epic "${epicTitle}" not found`);
  }
  
  const story = store.createStory(epic.id);
  this.lastResult = story;
});

When('I update the story with user story:', function(this: BmadWorld, dataTable: any) {
  const store = getArtifactStore(this);
  
  if (!this.lastResult || !this.lastResult.id) {
    throw new Error('No story was created in a previous step');
  }
  
  // Build userStory from table - table has columns like | asA | developer |
  const userStoryData: any = {};
  const rows = dataTable.raw();
  for (const row of rows) {
    const key = row[0];
    const value = row[1];
    if (key && value) {
      userStoryData[key] = value;
    }
  }
  
  store.updateArtifact('story', this.lastResult.id, { 
    metadata: { userStory: userStoryData }
  });
});

When('I delete the first story from epic {string}', function(this: BmadWorld, epicTitle: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.title === epicTitle);
  
  if (!epic) {
    throw new Error(`Epic "${epicTitle}" not found`);
  }
  
  if (epic.stories.length > 0) {
    epic.stories.splice(0, 1);
  }
});

When('I create requirement with title {string}', function(this: BmadWorld, title: string) {
  const store = getArtifactStore(this);
  const req = store.createRequirement();
  store.updateArtifact('requirement', req.id, { title });
  this.createdArtifacts.set(title, req.id);
});

When('I add a requirement', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const req = store.createRequirement();
  this.lastResult = req;
});

When('I update the requirement {string} with description {string}', function(this: BmadWorld, title: string, description: string) {
  const store = getArtifactStore(this);
  const reqId = this.createdArtifacts.get(title);
  
  if (!reqId) {
    throw new Error(`Requirement "${title}" not found`);
  }
  
  store.updateArtifact('requirement', reqId, { description });
});

When('I delete the requirement {string}', function(this: BmadWorld, title: string) {
  const store = getArtifactStore(this);
  const requirements = store.getRequirements();
  const reqIndex = requirements.functional.findIndex((r: any) => r.title === title);
  
  if (reqIndex >= 0) {
    requirements.functional.splice(reqIndex, 1);
  }
  
  this.createdArtifacts.delete(title);
});

When('I select epic {string}', function(this: BmadWorld, epicTitleOrId: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.id === epicTitleOrId || e.title === epicTitleOrId);
  
  if (!epic) {
    // Fall back to direct ID selection (e.g. for factory-created epics)
    store.setSelectedArtifact('epic', epicTitleOrId);
    return;
  }
  
  store.setSelectedArtifact('epic', epic.id);
});

When('I select the vision', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  store.setSelectedArtifact('vision', 'vision-1');
});

When('I select requirement {string}', function(this: BmadWorld, title: string) {
  const store = getArtifactStore(this);
  const reqId = this.createdArtifacts.get(title);
  
  if (!reqId) {
    throw new Error(`Requirement "${title}" not found`);
  }
  
  store.setSelectedArtifact('requirement', reqId);
});

When('I clear the selection', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  store.clearSelection();
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the project name should be {string}', function(this: BmadWorld, expectedName: string) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.strictEqual(state.projectName, expectedName);
});

Then('the artifact store should have no artifacts', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  assert.strictEqual(epics.length, 0, 'Expected no epics');
});

Then('the store should contain a vision artifact', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.ok(state.vision !== undefined, 'Vision should exist');
});

Then('the vision should have default values', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.ok(state.vision !== undefined, 'Vision should exist');
  // When creating vision after initializing a project, productName comes from project name
  // When creating vision standalone, productName defaults to 'New Product'
  assert.ok(state.vision!.productName !== undefined && state.vision!.productName.length > 0, 'Product name should be set');
  assert.strictEqual(state.vision!.status, 'draft');
});

Then('there should be exactly {int} vision artifact(s)', function(this: BmadWorld, count: number) {
  const store = getArtifactStore(this);
  const state = store.getState();
  const visionCount = state.vision ? 1 : 0;
  assert.strictEqual(visionCount, count);
});

Then('the vision product name should be {string}', function(this: BmadWorld, expectedName: string) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.strictEqual(state.vision?.productName, expectedName);
});

Then('the vision problem statement should be {string}', function(this: BmadWorld, expected: string) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.strictEqual(state.vision?.problemStatement, expected);
});

Then('the vision target audience should be {string}', function(this: BmadWorld, expected: string) {
  const store = getArtifactStore(this);
  const state = store.getState();
  // targetAudience might be in targetUsers array or as a string field
  const hasTarget = state.vision?.targetUsers?.includes(expected) || 
                   (state.vision as any)?.targetAudience === expected;
  assert.ok(hasTarget, `Vision should have target audience "${expected}"`);
});

Then('the store should contain {int} epic(s)', function(this: BmadWorld, count: number) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  assert.strictEqual(epics.length, count, `Expected ${count} epic(s), got ${epics.length}`);
});

Then('the epic {string} should exist', function(this: BmadWorld, title: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.title === title);
  assert.ok(epic !== undefined, `Epic "${title}" should exist`);
});

Then('the epic {string} should not exist', function(this: BmadWorld, title: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.title === title);
  assert.ok(epic === undefined, `Epic "${title}" should not exist`);
});

Then('the epic {string} should have goal {string}', function(this: BmadWorld, title: string, expectedGoal: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.title === title);
  assert.strictEqual(epic?.goal, expectedGoal);
});

Then(/^the epic "([^"]*)" should contain (\d+) stor(?:y|ies)$/, function(this: BmadWorld, epicTitle: string, count: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.title === epicTitle);
  assert.strictEqual(epic?.stories?.length, parseInt(count, 10), `Expected ${count} stories, got ${epic?.stories?.length}`);
});

Then('the story should have user story {string}', function(this: BmadWorld, expected: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  
  // Find the story we created
  let foundStory: any = null;
  for (const epic of epics) {
    if (this.lastResult) {
      foundStory = epic.stories.find((s: any) => s.id === this.lastResult.id);
      if (foundStory) break;
    }
  }
  
  assert.ok(foundStory !== undefined, 'Story should be found');
  
  const userStoryStr = `As a ${foundStory.userStory.asA}, I want ${foundStory.userStory.iWant}, so that ${foundStory.userStory.soThat}`;
  assert.strictEqual(userStoryStr, expected);
});

Then('the store should contain {int} requirement(s)', function(this: BmadWorld, count: number) {
  const store = getArtifactStore(this);
  const requirements = store.getRequirements();
  assert.strictEqual(requirements.functional.length, count);
});

Then('the requirement {string} should have description {string}', function(this: BmadWorld, title: string, expectedDesc: string) {
  const store = getArtifactStore(this);
  const requirements = store.getRequirements();
  const req = requirements.functional.find((r: any) => r.title === title);
  assert.strictEqual(req?.description, expectedDesc);
});

Then('the selected artifact type should be {string}', function(this: BmadWorld, expectedType: string) {
  const store = getArtifactStore(this);
  const selected = store.getSelectedArtifact?.() || store._selectedArtifact;
  assert.strictEqual(selected?.type, expectedType);
});

Then('the selected artifact should be {string}', function(this: BmadWorld, expectedTitle: string) {
  const store = getArtifactStore(this);
  const selected = store.getSelectedArtifact?.() || store._selectedArtifact;
  assert.strictEqual(selected?.artifact?.title, expectedTitle);
});

Then('no artifact should be selected', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const selected = store.getSelectedArtifact?.() || store._selectedArtifact;
  assert.strictEqual(selected, null);
});

Then('a state change event should have been fired', function(this: BmadWorld) {
  const eventCount = this.createdArtifacts.get('_eventCount') || 0;
  assert.ok(eventCount > 0, `Expected at least 1 event, got ${eventCount}`);
});

Then('{int} state change event(s) should have been fired', function(this: BmadWorld, count: number) {
  const eventCount = this.createdArtifacts.get('_eventCount') || 0;
  assert.ok(eventCount >= count, `Expected at least ${count} events, got ${eventCount}`);
});

// ============================================================================
// Test Case Steps
// ============================================================================

Given('I create a test case', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const tc = store.createTestCase();
  this.lastResult = tc;
  this.createdArtifacts.set(tc.id, tc.id);
});

When('I create a test case linked to the last story', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  if (!this.lastResult || !this.lastResult.id) {
    throw new Error('No story created in a previous step');
  }
  const tc = store.createTestCase(this.lastResult.id);
  this.createdArtifacts.set(tc.id, tc.id);
  this.createdArtifacts.set('_lastTestCase', tc);
  this.lastResult = tc;
});

When('I update the test case {string} with title {string}', function(this: BmadWorld, tcId: string, title: string) {
  const store = getArtifactStore(this);
  store.updateArtifact('test-case', tcId, { title });
});

When('I delete the test case {string}', function(this: BmadWorld, tcId: string) {
  const store = getArtifactStore(this);
  store.deleteArtifact('test-case', tcId);
  this.createdArtifacts.delete(tcId);
});

When('I create a test strategy', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const ts = store.createTestStrategy();
  this.lastResult = ts;
});

When('I update the test strategy with title {string}', function(this: BmadWorld, title: string) {
  const store = getArtifactStore(this);
  store.updateArtifact('test-strategy', 'TS-1', { title });
});

When('I delete the test strategy', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  store.deleteArtifact('test-strategy', 'TS-1');
});

Then('the store should contain {int} test case(s)', function(this: BmadWorld, count: number) {
  const store = getArtifactStore(this);
  const state = store.getState();
  const actual = (state.testCases || []).length;
  assert.strictEqual(actual, count, `Expected ${count} test case(s), got ${actual}`);
});

Then('the test case should have id {string}', function(this: BmadWorld, expectedId: string) {
  const store = getArtifactStore(this);
  const state = store.getState();
  const tc = (state.testCases || []).find((t: any) => t.id === expectedId);
  assert.ok(tc !== undefined, `Expected test case with id "${expectedId}"`);
});

Then('the test case should be linked to the story', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  const tc = (state.testCases || [])[0];
  assert.ok(tc !== undefined, 'Expected at least one test case');
  assert.ok(tc.storyId !== undefined, `Expected test case to have storyId, got ${JSON.stringify(tc)}`);
});

Then('the test case should be linked to epic {string}', function(this: BmadWorld, epicTitle: string) {
  const store = getArtifactStore(this);
  const state = store.getState();
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.title === epicTitle);
  assert.ok(epic, `Epic "${epicTitle}" not found`);
  const tc = (state.testCases || [])[0];
  assert.ok(tc !== undefined, 'Expected at least one test case');
  assert.strictEqual(tc.epicId, epic.id, `Expected test case epicId to be "${epic.id}", got "${tc.epicId}"`);
});

Then('the test case {string} should have title {string}', function(this: BmadWorld, tcId: string, expectedTitle: string) {
  const store = getArtifactStore(this);
  const state = store.getState();
  const tc = (state.testCases || []).find((t: any) => t.id === tcId);
  assert.ok(tc !== undefined, `Test case "${tcId}" not found`);
  assert.strictEqual(tc.title, expectedTitle, `Expected title "${expectedTitle}", got "${tc.title}"`);
});

Then('the store should contain a test strategy', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.ok(state.testStrategy !== undefined, 'Expected test strategy to exist');
});

Then('the test strategy should have id {string}', function(this: BmadWorld, expectedId: string) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.strictEqual(state.testStrategy?.id, expectedId, `Expected test strategy id "${expectedId}"`);
});

Then('there should be exactly {int} test strategy', function(this: BmadWorld, count: number) {
  const store = getArtifactStore(this);
  const state = store.getState();
  const actual = state.testStrategy ? 1 : 0;
  assert.strictEqual(actual, count, `Expected ${count} test strategy, got ${actual}`);
});

Then('the test strategy should have title {string}', function(this: BmadWorld, expectedTitle: string) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.strictEqual(state.testStrategy?.title, expectedTitle, `Expected test strategy title "${expectedTitle}"`);
});

Then('the store should not contain a test strategy', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.ok(state.testStrategy === undefined || state.testStrategy === null,
    'Expected no test strategy');
});

// ============================================================================
// Factory Method Steps
// ============================================================================

When('I use createEpic to create an epic', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const epic = store.createEpic();
  this.lastResult = epic;
});

When('I use createEpic to create {int} epics', function(this: BmadWorld, count: number) {
  const store = getArtifactStore(this);
  for (let i = 0; i < count; i++) {
    this.lastResult = store.createEpic();
  }
});

When('I delete the epic with id {string}', function(this: BmadWorld, id: string) {
  const store = getArtifactStore(this);
  store.deleteArtifact('epic', id);
});

Then('the created epic should have id {string}', function(this: BmadWorld, expectedId: string) {
  assert.ok(this.lastResult, 'No epic was created');
  assert.strictEqual(this.lastResult.id, expectedId);
});

When('I create a use case in epic {string}', function(this: BmadWorld, epicId: string) {
  const store = getArtifactStore(this);
  const uc = store.createUseCase(epicId);
  this.lastResult = uc;
});

When('I try to create a use case in epic {string}', function(this: BmadWorld, epicId: string) {
  const store = getArtifactStore(this);
  try {
    store.createUseCase(epicId);
    this.lastError = null;
  } catch (err: any) {
    this.lastError = err;
  }
});

When('I create a use case without specifying an epic', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const uc = store.createUseCase();
  this.lastResult = uc;
});

Then('the use case should have id {string}', function(this: BmadWorld, expectedId: string) {
  assert.ok(this.lastResult, 'No use case was created');
  assert.strictEqual(this.lastResult.id, expectedId);
});

Then(/^the epic "([^"]*)" should have (\d+) use cases?$/, function(this: BmadWorld, epicId: string, count: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.id === epicId);
  assert.ok(epic, `Epic "${epicId}" not found`);
  const actual = (epic.useCases || []).length;
  assert.strictEqual(actual, parseInt(count, 10), `Expected ${count} use case(s), got ${actual}`);
});

Then(/^the epic "([^"]*)" should have (\d+) stor(?:y|ies)$/, function(this: BmadWorld, epicId: string, count: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.id === epicId || e.title === epicId);
  assert.ok(epic, `Epic "${epicId}" not found`);
  const actual = (epic.stories || []).length;
  assert.strictEqual(actual, parseInt(count, 10), `Expected ${count} story(ies), got ${actual}`);
});

Then('an error should have been thrown with message containing {string}', function(this: BmadWorld, text: string) {
  assert.ok(this.lastError, 'No error was thrown');
  assert.ok(this.lastError.message.includes(text), `Error "${this.lastError.message}" should contain "${text}"`);
});

When('I create a product brief', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  this.lastResult = store.createProductBrief();
});

Then('the store should contain a product brief', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.ok(state.productBrief, 'Expected product brief to exist');
});

Then('the product brief should have id {string}', function(this: BmadWorld, expectedId: string) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.strictEqual(state.productBrief?.id, expectedId);
});

Then('the store should not contain a product brief', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.ok(!state.productBrief, 'Expected no product brief');
});

When('I create a PRD', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  this.lastResult = store.createPRD();
});

Then('the store should contain a PRD', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.ok(state.prd, 'Expected PRD to exist');
});

Then('the PRD should have id {string}', function(this: BmadWorld, expectedId: string) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.strictEqual(state.prd?.id, expectedId);
});

Then('the store should not contain a PRD', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.ok(!state.prd, 'Expected no PRD');
});

When('I create an architecture', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  this.lastResult = store.createArchitecture();
});

Then('the store should contain an architecture', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.ok(state.architecture, 'Expected architecture to exist');
});

Then('the architecture should have id {string}', function(this: BmadWorld, expectedId: string) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.strictEqual(state.architecture?.id, expectedId);
});

Then('the store should not contain an architecture', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.ok(!state.architecture, 'Expected no architecture');
});

// ============================================================================
// Delete Artifact Steps
// ============================================================================

When('I delete artifact type {string} with id {string}', function(this: BmadWorld, type: string, id: string) {
  const store = getArtifactStore(this);
  store.deleteArtifact(type, id);
});

Then('the store should not contain a vision', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.ok(!state.vision, 'Expected no vision');
});

Given('I link requirement {string} to epic {string}', function(this: BmadWorld, reqTitle: string, epicId: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.id === epicId);
  assert.ok(epic, `Epic "${epicId}" not found`);
  const reqId = this.createdArtifacts.get(reqTitle);
  assert.ok(reqId, `Requirement "${reqTitle}" not found`);
  
  if (!epic.functionalRequirements) epic.functionalRequirements = [];
  epic.functionalRequirements.push(reqId);
  
  // Also update the requirement's relatedEpics
  store.updateArtifact('requirement', reqId, { relatedEpics: [epicId] });
});

Then('the requirement {string} should not reference epic {string}', function(this: BmadWorld, reqTitle: string, epicId: string) {
  const store = getArtifactStore(this);
  const requirements = store.getRequirements();
  const reqId = this.createdArtifacts.get(reqTitle);
  const req = requirements.functional.find((r: any) => r.id === reqId);
  assert.ok(req, `Requirement "${reqTitle}" not found`);
  const refs = req.relatedEpics || [];
  assert.ok(!refs.includes(epicId), `Requirement should not reference epic "${epicId}"`);
});

Then('epic {string} should not reference requirement {string}', function(this: BmadWorld, epicId: string, reqTitle: string) {
  const store = getArtifactStore(this);
  const epics = store.getEpics();
  const epic = epics.find((e: any) => e.id === epicId);
  // Epic might have been deleted — if so, test passes
  if (!epic) return;
  const reqId = this.createdArtifacts.get(reqTitle);
  const funcReqs = epic.functionalRequirements || [];
  assert.ok(!funcReqs.includes(reqId), `Epic should not reference requirement "${reqTitle}"`);
});

When('I delete artifact type {string} with id the id of {string}', function(this: BmadWorld, type: string, name: string) {
  const store = getArtifactStore(this);
  const id = this.createdArtifacts.get(name);
  assert.ok(id, `Artifact "${name}" ID not found in createdArtifacts`);
  store.deleteArtifact(type, id);
});

Given('I create a test design', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  store.artifacts.set('testDesign', { id: 'test-design-1', title: 'Test Design', status: 'draft' });
  store.notifyChange();
});

Then('the store should not contain a test design', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  assert.ok(!state.testDesign, 'Expected no test design');
});

// ============================================================================
// findArtifactById Steps
// ============================================================================

When('I find artifact by id {string}', function(this: BmadWorld, id: string) {
  const store = getArtifactStore(this);
  this.lastResult = store.findArtifactById(id);
});

When('I find artifact by id the id of {string}', function(this: BmadWorld, name: string) {
  const store = getArtifactStore(this);
  const id = this.createdArtifacts.get(name);
  assert.ok(id, `Artifact "${name}" ID not found`);
  this.lastResult = store.findArtifactById(id);
});

Then('the found artifact type should be {string}', function(this: BmadWorld, expectedType: string) {
  assert.ok(this.lastResult, 'No artifact was found');
  assert.strictEqual(this.lastResult.type, expectedType);
});

Then('no artifact should be found', function(this: BmadWorld) {
  assert.strictEqual(this.lastResult, null, 'Expected no artifact to be found');
});

// ============================================================================
// loadFromState / mergeFromState Steps
// ============================================================================

When('I load state with project name {string} and a vision and {int} epics', function(this: BmadWorld, name: string, epicCount: number) {
  const store = getArtifactStore(this);
  const epics = Array.from({ length: epicCount }, (_, i) => ({
    id: `EPIC-${i + 1}`,
    title: `Imported Epic ${i + 1}`,
    goal: '',
    functionalRequirements: [],
    status: 'draft',
    stories: [],
  }));
  store.loadFromState({
    projectName: name,
    vision: {
      productName: 'Imported Product',
      problemStatement: '',
      targetUsers: [],
      valueProposition: '',
      successCriteria: [],
      status: 'draft',
    },
    epics,
  });
});

When('I merge state with {int} new epic', function(this: BmadWorld, count: number) {
  const store = getArtifactStore(this);
  const epics = Array.from({ length: count }, (_, i) => ({
    id: `EPIC-IMPORTED-${i + 1}`,
    title: `Imported Epic ${i + 1}`,
    goal: '',
    functionalRequirements: [],
    status: 'draft',
    stories: [],
  }));
  store.mergeFromState({ epics });
});

When('I merge state with a duplicate EPIC-1', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  store.mergeFromState({
    epics: [{
      id: 'EPIC-1',
      title: 'Duplicate Epic',
      goal: '',
      functionalRequirements: [],
      status: 'draft',
      stories: [],
    }],
  });
});

When('I merge state with a different vision and a PRD', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  store.mergeFromState({
    vision: {
      productName: 'Different Product',
      problemStatement: '',
      targetUsers: [],
      valueProposition: '',
      successCriteria: [],
      status: 'draft',
    },
    prd: {
      id: 'prd-1',
      status: 'draft',
      productOverview: { productName: 'Imported PRD', purpose: '', problemStatement: '' },
    },
  });
});

Then('the vision product name should not have changed', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  // initializeProject("Merge Test") creates vision with productName = projectName = 'Merge Test'
  // createOrUpdateVision() sees vision already exists and does nothing
  // mergeFromState doesn't overwrite existing singletons
  assert.strictEqual(state.vision?.productName, 'Merge Test');
});

When('I merge state that adds a story to EPIC-1', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  store.mergeFromState({
    epics: [{
      id: 'EPIC-1',
      title: 'New Epic 1',
      goal: '',
      functionalRequirements: [],
      status: 'draft',
      stories: [{
        id: 'STORY-1-99',
        title: 'Merged Story',
        userStory: { asA: '', iWant: '', soThat: '' },
        acceptanceCriteria: [],
        status: 'draft',
      }],
    }],
  });
});

When('I merge state with {int} new requirement and {int} duplicate', function(this: BmadWorld, newCount: number, dupCount: number) {
  const store = getArtifactStore(this);
  // The existing requirement from createRequirement has id FR-1
  const reqs: any[] = [];
  // Add duplicates of existing
  for (let i = 0; i < dupCount; i++) {
    reqs.push({ id: 'FR-1', title: 'Duplicate Req', description: '' });
  }
  // Add new
  for (let i = 0; i < newCount; i++) {
    reqs.push({ id: `FR-NEW-${i + 1}`, title: `New Req ${i + 1}`, description: '' });
  }
  store.mergeFromState({ requirements: { functional: reqs, nonFunctional: [], additional: [] } });
});

When('I merge state with {int} new test case and {int} duplicate', function(this: BmadWorld, newCount: number, dupCount: number) {
  const store = getArtifactStore(this);
  const tcs: any[] = [];
  // Duplicate of existing TC-1
  for (let i = 0; i < dupCount; i++) {
    tcs.push({ id: 'TC-1', title: 'Dup TC', type: 'acceptance', status: 'draft', steps: [], relatedRequirements: [] });
  }
  // New
  for (let i = 0; i < newCount; i++) {
    tcs.push({ id: `TC-NEW-${i + 1}`, title: `New TC ${i + 1}`, type: 'acceptance', status: 'draft', steps: [], relatedRequirements: [] });
  }
  store.mergeFromState({ testCases: tcs });
});

// ============================================================================
// clearProject Steps
// ============================================================================

When('I clear the project', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  store.clearProject();
});

// ============================================================================
// Refine and Workflow Context Steps
// ============================================================================

When('I set refine context to an artifact', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  store.setRefineContext({ id: 'art-1', type: 'epic' });
});

Then('the refine context should not be null', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  assert.ok(store.getRefineContext() !== null, 'Refine context should not be null');
});

When('I clear the refine context', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  store.clearRefineContext();
});

Then('the refine context should be null', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  assert.strictEqual(store.getRefineContext(), null);
});

When('I set pending workflow launch with trigger {string}', function(this: BmadWorld, trigger: string) {
  const store = getArtifactStore(this);
  store.setPendingWorkflowLaunch({ triggerPhrase: trigger, workflowFilePath: '/test/wf.md' });
});

Then('the pending workflow launch should have trigger {string}', function(this: BmadWorld, trigger: string) {
  const store = getArtifactStore(this);
  const launch = store.getPendingWorkflowLaunch();
  assert.ok(launch, 'Pending workflow launch should exist');
  assert.strictEqual(launch.triggerPhrase, trigger);
});

When('I clear the pending workflow launch', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  store.clearPendingWorkflowLaunch();
});

Then('the pending workflow launch should be null', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  assert.strictEqual(store.getPendingWorkflowLaunch(), null);
});

// ============================================================================
// hasSelection Steps (select epic step is above, unified to handle both title and ID)
// ============================================================================

Then('hasSelection should return false', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  assert.strictEqual(store.hasSelection(), false);
});

Then('hasSelection should return true', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  assert.strictEqual(store.hasSelection(), true);
});

// ============================================================================
// generateAllArtifactsMarkdown Steps
// ============================================================================

When('I generate all artifacts markdown', function(this: BmadWorld) {
  const store = getArtifactStore(this);
  const state = store.getState();
  this.lastResult = store.generateAllArtifactsMarkdown(state);
});

Then('the markdown should contain {string}', function(this: BmadWorld, text: string) {
  assert.ok(typeof this.lastResult === 'string', 'Expected markdown string');
  assert.ok(this.lastResult.includes(text), `Markdown should contain "${text}". Got: ${this.lastResult.substring(0, 200)}`);
});

Then('the markdown should not contain {string}', function(this: BmadWorld, text: string) {
  assert.ok(typeof this.lastResult === 'string', 'Expected markdown string');
  assert.ok(!this.lastResult.includes(text), `Markdown should NOT contain "${text}"`);
});
