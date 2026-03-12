/**
 * Artifacts Tree Provider Step Definitions
 * Cucumber step definitions for testing ArtifactsTreeProvider functionality
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

// Module-level state for test results
let rootItems: any[] = [];
let expandedItems: any[] = [];
let lastItem: any = null;
let treeDataEventFired = false;

function getTreeProvider(world: BmadWorld): { store: any; provider: any } {
  if (!(world as any)._treeStore) {
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
      '../commands/chat-bridge': { openChat: async () => true, setChatBridgeLogger: () => {} }
    });

    const treeProviderModule = proxyquire('../../src/views/artifacts-tree-provider', {
      'vscode': world.vscode,
      '../state/artifact-store': artifactStoreModule,
      '../extension': mockExtension
    });

    const store = new artifactStoreModule.ArtifactStore();
    const provider = new treeProviderModule.ArtifactsTreeProvider(store);

    (world as any)._treeStore = store;
    (world as any)._treeProvider = provider;
  }
  return { store: (world as any)._treeStore, provider: (world as any)._treeProvider };
}

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('a fresh artifacts tree provider', function(this: BmadWorld) {
  // Reset module-level state
  rootItems = [];
  expandedItems = [];
  lastItem = null;
  treeDataEventFired = false;

  // Force re-creation
  (this as any)._treeStore = null;
  (this as any)._treeProvider = null;
  getTreeProvider(this);
});

Given('the store has project {string}', function(this: BmadWorld, projectName: string) {
  const { store } = getTreeProvider(this);
  store.initializeProject(projectName);
});

Given('the store has {int} requirements', function(this: BmadWorld, count: number) {
  const { store } = getTreeProvider(this);
  for (let i = 1; i <= count; i++) {
    store.addRequirement({ id: `FR-${i}`, title: `Req ${i}`, description: '' });
  }
});

Given('the store has {int} requirement with id {string}', function(this: BmadWorld, _count: number, id: string) {
  const { store } = getTreeProvider(this);
  store.addRequirement({ id, title: `Requirement ${id}`, description: '' });
});

Given('the store has {int} epic with title {string}', function(this: BmadWorld, _count: number, title: string) {
  const { store } = getTreeProvider(this);
  store.addEpic({ id: 'EPIC-1', title, goal: '', functionalRequirements: [], status: 'draft', stories: [] });
});

Given('the store has an epic with id {string} and title {string}', function(this: BmadWorld, id: string, title: string) {
  const { store } = getTreeProvider(this);
  store.addEpic({ id, title, goal: '', functionalRequirements: [], status: 'draft', stories: [] });
});

Given('the store has an epic with id {string} title {string} and status {string}', function(this: BmadWorld, id: string, title: string, status: string) {
  const { store } = getTreeProvider(this);
  store.addEpic({ id, title, goal: '', functionalRequirements: [], status, stories: [] });
});

Given('the epic {string} has {int} stories', function(this: BmadWorld, epicId: string, count: number) {
  const { store } = getTreeProvider(this);
  for (let i = 1; i <= count; i++) {
    store.addStory(epicId, {
      id: `STORY-${epicId}-${i}`,
      title: `Story ${i}`,
      userStory: { asA: '', iWant: '', soThat: '' },
      acceptanceCriteria: [],
      status: 'draft'
    });
  }
});

Given('the epic {string} has a story with id {string} and title {string}', function(this: BmadWorld, epicId: string, storyId: string, title: string) {
  const { store } = getTreeProvider(this);
  store.addStory(epicId, {
    id: storyId,
    title,
    userStory: { asA: '', iWant: '', soThat: '' },
    acceptanceCriteria: [],
    status: 'draft'
  });
});

Given('the epic {string} has a story with id {string} title {string} and {int} story points', function(this: BmadWorld, epicId: string, storyId: string, title: string, points: number) {
  const { store } = getTreeProvider(this);
  store.addStory(epicId, {
    id: storyId,
    title,
    userStory: { asA: '', iWant: '', soThat: '' },
    acceptanceCriteria: [],
    status: 'draft',
    storyPoints: points
  });
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I get root children', async function(this: BmadWorld) {
  const { provider } = getTreeProvider(this);
  rootItems = await provider.getChildren();
});

When('I expand the {string} category', async function(this: BmadWorld, contextValue: string) {
  const { provider } = getTreeProvider(this);
  // Get root items first
  const roots = await provider.getChildren();
  const category = roots.find((item: any) => item.contextValue === contextValue);
  assert.ok(category, `Category "${contextValue}" not found in root items`);
  expandedItems = await provider.getChildren(category);
});

When('I expand the epic {string}', async function(this: BmadWorld, epicId: string) {
  const { provider } = getTreeProvider(this);
  // Get epics category first
  const roots = await provider.getChildren();
  const epicsCategory = roots.find((item: any) => item.contextValue === 'category-epics');
  assert.ok(epicsCategory, 'category-epics not found');
  const epicItems = await provider.getChildren(epicsCategory);
  const epicItem = epicItems.find((item: any) => item.id === epicId);
  assert.ok(epicItem, `Epic "${epicId}" not found`);
  expandedItems = await provider.getChildren(epicItem);
});

When('I get children for a fake epic with id {string}', async function(this: BmadWorld, epicId: string) {
  const { provider } = getTreeProvider(this);
  const fakeEpicItem = { id: epicId, contextValue: 'epic' };
  expandedItems = await provider.getChildren(fakeEpicItem as any);
});

When('I call getTreeItem on the first item', function(this: BmadWorld) {
  const { provider } = getTreeProvider(this);
  assert.ok(rootItems.length > 0, 'No root items available');
  lastItem = provider.getTreeItem(rootItems[0]);
});

When('I subscribe to tree data changes', function(this: BmadWorld) {
  const { provider } = getTreeProvider(this);
  treeDataEventFired = false;
  provider.onDidChangeTreeData(() => {
    treeDataEventFired = true;
  });
});

When('I call refresh', function(this: BmadWorld) {
  const { provider } = getTreeProvider(this);
  provider.refresh();
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the tree items should not be empty', function(this: BmadWorld) {
  const items = expandedItems.length > 0 ? expandedItems : rootItems;
  assert.ok(items.length > 0, 'Expected items to not be empty');
});

Then('the tree items should be empty', function(this: BmadWorld) {
  assert.strictEqual(expandedItems.length, 0, 'Expected empty result');
});

Then('the tree items should contain {int} items', function(this: BmadWorld, count: number) {
  assert.strictEqual(expandedItems.length, count, `Expected ${count} items, got ${expandedItems.length}`);
});

Then('a tree item with context {string} or {string} should exist', function(this: BmadWorld, ctx1: string, ctx2: string) {
  const item = rootItems.find((i: any) => i.contextValue === ctx1 || i.contextValue === ctx2);
  assert.ok(item, `Expected tree item with contextValue "${ctx1}" or "${ctx2}"`);
  lastItem = item;
});

Then('a tree item with context {string} should exist', function(this: BmadWorld, contextValue: string) {
  const items = expandedItems.length > 0 ? expandedItems : rootItems;
  const item = items.find((i: any) => i.contextValue === contextValue);
  assert.ok(item, `Expected tree item with contextValue "${contextValue}"`);
  lastItem = item;
});

Then('that item label should contain {string}', function(this: BmadWorld, text: string) {
  assert.ok(lastItem, 'No item selected');
  const label = typeof lastItem.label === 'string' ? lastItem.label : lastItem.label?.label ?? '';
  assert.ok(label.includes(text), `Expected label to contain "${text}", got "${label}"`);
});

Then('that item label should be {string}', function(this: BmadWorld, text: string) {
  assert.ok(lastItem, 'No item selected');
  const label = typeof lastItem.label === 'string' ? lastItem.label : lastItem.label?.label ?? '';
  assert.strictEqual(label, text, `Expected label "${text}", got "${label}"`);
});

Then('the {string} item description should contain {string}', function(this: BmadWorld, contextValue: string, text: string) {
  const item = rootItems.find((i: any) => i.contextValue === contextValue);
  assert.ok(item, `Item with contextValue "${contextValue}" not found`);
  assert.ok(item.description?.includes(text), `Expected description to contain "${text}", got "${item.description}"`);
});

Then('item {int} label should contain {string}', function(this: BmadWorld, index: number, text: string) {
  const item = expandedItems[index - 1];
  assert.ok(item, `Item at index ${index} not found`);
  const label = typeof item.label === 'string' ? item.label : item.label?.label ?? '';
  assert.ok(label.includes(text), `Expected item ${index} label to contain "${text}", got "${label}"`);
});

Then('item {int} id should be {string}', function(this: BmadWorld, index: number, expectedId: string) {
  const item = expandedItems[index - 1];
  assert.ok(item, `Item at index ${index} not found`);
  assert.strictEqual(item.id, expectedId, `Expected id "${expectedId}", got "${item.id}"`);
});

Then('item {int} command should be {string}', function(this: BmadWorld, index: number, commandId: string) {
  const item = expandedItems[index - 1];
  assert.ok(item, `Item at index ${index} not found`);
  assert.ok(item.command, `Item ${index} has no command`);
  assert.strictEqual(item.command.command, commandId);
});

Then('item {int} command arguments should be {string} and {string}', function(this: BmadWorld, index: number, arg1: string, arg2: string) {
  const item = expandedItems[index - 1];
  assert.ok(item, `Item at index ${index} not found`);
  assert.ok(item.command?.arguments, `Item ${index} has no command arguments`);
  assert.deepStrictEqual(item.command.arguments, [arg1, arg2]);
});

Then('item {int} description should contain {string}', function(this: BmadWorld, index: number, text: string) {
  const item = expandedItems[index - 1];
  assert.ok(item, `Item at index ${index} not found`);
  assert.ok(item.description?.includes(text), `Expected item ${index} description to contain "${text}", got "${item.description}"`);
});

Then('item {int} iconPath should be defined', function(this: BmadWorld, index: number) {
  const item = expandedItems[index - 1];
  assert.ok(item, `Item at index ${index} not found`);
  assert.ok(item.iconPath !== undefined, `Expected item ${index} iconPath to be defined`);
});

Then('it should return the same item', function(this: BmadWorld) {
  assert.ok(lastItem, 'No item returned from getTreeItem');
  assert.strictEqual(lastItem, rootItems[0], 'getTreeItem should return the same object');
});

Then('the tree data change event should have fired', function(this: BmadWorld) {
  assert.ok(treeDataEventFired, 'Expected tree data change event to have fired');
});
