/**
 * Regression: a status-only artifact update (as sent by a Kanban drag) must not
 * let harness auto-fix overwrite real story fields with generic placeholders.
 *
 * The harness mock here always returns a `fixedArtifact` full of generic values
 * (the shape the real required-fields policy produces). With the bug, those
 * values clobbered the story's real title/AC; with the fix they only fill
 * genuinely-empty fields of the merged candidate.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

function getDataStore(world: BmadWorld): any {
  const w = world as any;
  if (!w.__dataStore) {
    const mod = proxyquire('../../src/state/artifact-store', {
      vscode: world.vscode,
      '../extension': {
        acOutput: { appendLine: () => {}, append: () => {}, clear: () => {}, show: () => {} },
      },
      '../commands/chat-bridge': { openChat: async () => true, setChatBridgeLogger: () => {} },
      './artifact-file-io': {
        resolveArtifactTargetUri: async (opts: any) => world.vscode.Uri.file(`/test/${opts.fileName}`),
        writeJsonFile: async () => {},
        writeMarkdownCompanion: async (_j: any, md: string) => world.vscode.Uri.file(`/test/${md}`),
      },
      // Harness that "auto-fixes" missing story fields with generic content.
      '../harness/policy-engine': {
        harnessEngine: {
          evaluate: async () => [
            {
              policyId: 'required-fields',
              passed: true,
              severity: 'blocking',
              fixedArtifact: {
                title: 'Story STORY-1',
                userStory: { asA: 'user', iWant: 'to use this feature', soThat: 'I can complete my work' },
                acceptanceCriteria: [
                  { criterion: 'basic functionality works' },
                  { criterion: 'edge cases handled' },
                ],
              },
            },
          ],
        },
      },
    });
    w.__dataStore = new mod.ArtifactStore(world.context as any);
  }
  return w.__dataStore;
}

Given('an artifact store whose harness auto-fills missing story fields', function (this: BmadWorld) {
  (this as any).__dataStore = undefined;
  getDataStore(this);
});

Given(
  'a story {string} titled {string} with one acceptance criterion',
  function (this: BmadWorld, storyId: string, title: string) {
    const store = getDataStore(this);
    store.addEpic({
      id: 'EPIC-1',
      title: 'Epic',
      goal: '',
      functionalRequirements: [],
      status: 'draft',
      stories: [],
    });
    store.addStory('EPIC-1', {
      id: storyId,
      title,
      status: 'backlog',
      userStory: { asA: 'returning user', iWant: 'to log in', soThat: 'I can access my account' },
      acceptanceCriteria: [{ criterion: 'user logs in with valid credentials' }],
      tasks: [],
    });
  }
);

When(
  'I update story {string} status to {string}',
  async function (this: BmadWorld, storyId: string, status: string) {
    const store = getDataStore(this);
    await store.updateArtifact('story', storyId, { status });
  }
);

Then(
  'story {string} still has the title {string}',
  function (this: BmadWorld, storyId: string, title: string) {
    const store = getDataStore(this);
    const found = store.findArtifactById(storyId);
    assert.ok(found, `story ${storyId} not found`);
    assert.strictEqual(found.artifact.title, title, `title was clobbered: got "${found.artifact.title}"`);
  }
);

Then(
  'story {string} still has {int} acceptance criterion',
  function (this: BmadWorld, storyId: string, count: number) {
    const store = getDataStore(this);
    const found = store.findArtifactById(storyId);
    assert.ok(found, `story ${storyId} not found`);
    assert.strictEqual(
      (found.artifact.acceptanceCriteria || []).length,
      count,
      `AC count changed: got ${(found.artifact.acceptanceCriteria || []).length}`
    );
  }
);

Then(
  'story {string} has status {string}',
  function (this: BmadWorld, storyId: string, status: string) {
    const store = getDataStore(this);
    const found = store.findArtifactById(storyId);
    assert.ok(found, `story ${storyId} not found`);
    assert.strictEqual(found.artifact.status, status);
  }
);
