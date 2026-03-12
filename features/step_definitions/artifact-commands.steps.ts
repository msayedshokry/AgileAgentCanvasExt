/**
 * Artifact Commands Step Definitions
 * Tests for loadBmmWorkflows and launchBmmWorkflow
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

// Module-level state
let artifactCommandsModule: any = null;

// In-memory virtual filesystem
// Maps absolute path strings to either:
//   - string: file content
//   - 'DIR': indicates a directory
const vfsFiles: Map<string, string> = new Map();
const vfsDirs: Set<string> = new Set();

let loadResult: any[] = [];
let openChatCalls: string[] = [];
let lastError: Error | null = null;

const WORKSPACE_ROOT = '/test/extension/resources';

// ─────────────────────────────────────────────────────────────────────────────
// Virtual filesystem helpers
// ─────────────────────────────────────────────────────────────────────────────

function vfsReset() {
  vfsFiles.clear();
  vfsDirs.clear();
  // Always register the base resources directory
  vfsDirs.add(WORKSPACE_ROOT);
}

/**
 * Register a file and all its parent directories in the VFS.
 */
function vfsAddFile(filePath: string, content: string) {
  vfsFiles.set(filePath, content);
  // Ensure all parent dirs exist
  let dir = filePath.replace(/[/\\][^/\\]+$/, '');
  while (dir && dir !== '.' && !vfsDirs.has(dir)) {
    vfsDirs.add(dir);
    dir = dir.replace(/[/\\][^/\\]+$/, '');
  }
}

/**
 * Build a Dirent-like object for readdirSync.
 */
function makeDirent(name: string, isDir: boolean): any {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isSymbolicLink: () => false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock fs module
// ─────────────────────────────────────────────────────────────────────────────

const mockFs = {
  existsSync: (p: string) => vfsFiles.has(p) || vfsDirs.has(p),
  readFileSync: (p: string, _enc: string) => {
    if (vfsFiles.has(p)) return vfsFiles.get(p)!;
    throw new Error(`ENOENT: no such file: ${p}`);
  },
  readdirSync: (p: string, opts?: any): any[] => {
    if (!vfsDirs.has(p)) throw new Error(`ENOENT: no such dir: ${p}`);

    const useWithFileTypes = opts && opts.withFileTypes;
    // Collect immediate children of p
    const sep = '/';
    const prefix = p.endsWith(sep) ? p : p + sep;
    const children = new Set<string>();

    for (const filePath of vfsFiles.keys()) {
      if (filePath.startsWith(prefix)) {
        const rest = filePath.slice(prefix.length);
        const child = rest.split('/')[0];
        if (child) children.add(child);
      }
    }
    for (const dirPath of vfsDirs) {
      if (dirPath.startsWith(prefix)) {
        const rest = dirPath.slice(prefix.length);
        const child = rest.split('/')[0];
        if (child) children.add(child);
      }
    }

    if (useWithFileTypes) {
      return Array.from(children).map(child => {
        const childPath = prefix + child;
        const isDir = vfsDirs.has(childPath);
        return makeDirent(child, isDir);
      });
    }

    return Array.from(children);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Module builder
// ─────────────────────────────────────────────────────────────────────────────

function buildArtifactCommandsModule(world: BmadWorld) {
  openChatCalls = [];

  const mockAcOutput = {
    appendLine: () => {},
    append: () => {},
    clear: () => {},
    show: () => {},
  };

  artifactCommandsModule = proxyquire('../../src/commands/artifact-commands', {
    'vscode': world.vscode,
    'fs': mockFs,
    'path': require('path').posix,
    '../extension': { acOutput: mockAcOutput },
    '../commands/chat-bridge': {
      openChat: async (trigger: string) => {
        openChatCalls.push(trigger ?? '');
        return true;
      },
      setChatBridgeLogger: () => {},
    },
    '../state/artifact-store': {},
    '../canvas/artifact-transformer': { sendArtifactsToPanel: () => {} },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GIVEN Steps
// ─────────────────────────────────────────────────────────────────────────────

Given('a fresh artifact commands context', function (this: BmadWorld) {
  artifactCommandsModule = null;
  loadResult = [];
  openChatCalls = [];
  lastError = null;
  vfsReset();
  buildArtifactCommandsModule(this);
});

Given('no workflows directory exists', function (this: BmadWorld) {
  // VFS is empty by default (reset in Background) — no workflows dir registered
  // Ensure _bmad/bmm/workflows is NOT in the VFS (bundled resources path)
  const wfRoot = `${WORKSPACE_ROOT}/_bmad/bmm/workflows`;
  vfsDirs.delete(wfRoot);
});

Given('a workflow.yaml file at {string} with name {string} and description {string}',
  function (this: BmadWorld, location: string, name: string, description: string) {
    const wfRoot = `${WORKSPACE_ROOT}/_bmad/bmm/workflows`;
    // location may be "document-project" (top-level) or "4-implementation/code-review" (subdirectory)
    const parts = location.split('/');

    let filePath: string;
    if (parts.length === 1) {
      // Top-level: workflow.yaml directly in the folder
      filePath = `${wfRoot}/${location}/workflow.yaml`;
    } else {
      // Subdirectory: workflow.yaml inside phase/sub folder
      filePath = `${wfRoot}/${location}/workflow.yaml`;
    }

    const content = `name: ${name}\ndescription: ${description}\n`;
    vfsDirs.add(wfRoot);
    vfsAddFile(filePath, content);
  }
);

Given('a workflow.md file at {string} with name {string} and description {string}',
  function (this: BmadWorld, location: string, name: string, description: string) {
    const wfRoot = `${WORKSPACE_ROOT}/_bmad/bmm/workflows`;
    const filePath = `${wfRoot}/${location}/workflow.md`;
    const content = `---\nname: ${name}\ndescription: ${description}\n---\n`;
    vfsDirs.add(wfRoot);
    vfsAddFile(filePath, content);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// WHEN Steps
// ─────────────────────────────────────────────────────────────────────────────

When('I call loadBmmWorkflows', function (this: BmadWorld) {
  try {
    loadResult = artifactCommandsModule.loadBmmWorkflows(WORKSPACE_ROOT);
    lastError = null;
  } catch (e: any) {
    lastError = e;
    loadResult = [];
  }
});

When('I call launchBmmWorkflow with trigger {string}', async function (this: BmadWorld, trigger: string) {
  try {
    await artifactCommandsModule.launchBmmWorkflow(trigger);
    lastError = null;
  } catch (e: any) {
    lastError = e;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// THEN Steps
// ─────────────────────────────────────────────────────────────────────────────

Then('the result should be an empty array', function (this: BmadWorld) {
  assert.ok(Array.isArray(loadResult), 'Expected result to be an array');
  assert.strictEqual(loadResult.length, 0,
    `Expected empty array but got ${loadResult.length} items`);
});

Then('the result should contain {int} workflow', function (this: BmadWorld, count: number) {
  assert.ok(Array.isArray(loadResult), 'Expected result to be an array');
  assert.strictEqual(loadResult.length, count,
    `Expected ${count} workflow(s), got ${loadResult.length}: ${JSON.stringify(loadResult.map((w: any) => w.name))}`);
});

Then('the result should contain {int} workflows', function (this: BmadWorld, count: number) {
  assert.ok(Array.isArray(loadResult), 'Expected result to be an array');
  assert.strictEqual(loadResult.length, count,
    `Expected ${count} workflow(s), got ${loadResult.length}: ${JSON.stringify(loadResult.map((w: any) => w.name))}`);
});

Then('workflow {int} should have name {string}', function (this: BmadWorld, index: number, name: string) {
  const workflow = loadResult[index];
  assert.ok(workflow, `Expected workflow at index ${index}`);
  assert.strictEqual(workflow.name, name,
    `Expected workflow[${index}].name to be "${name}", got "${workflow.name}"`);
});

Then('workflow {int} should have phase {string}', function (this: BmadWorld, index: number, phase: string) {
  const workflow = loadResult[index];
  assert.ok(workflow, `Expected workflow at index ${index}`);
  assert.strictEqual(workflow.phase, phase,
    `Expected workflow[${index}].phase to be "${phase}", got "${workflow.phase}"`);
});

Then('workflow {int} triggerPhrase should be {string}', function (this: BmadWorld, index: number, phrase: string) {
  const workflow = loadResult[index];
  assert.ok(workflow, `Expected workflow at index ${index}`);
  assert.strictEqual(workflow.triggerPhrase, phrase,
    `Expected workflow[${index}].triggerPhrase to be "${phrase}", got "${workflow.triggerPhrase}"`);
});

Then('workflow {int} phaseOrder should be {int}', function (this: BmadWorld, index: number, order: number) {
  const workflow = loadResult[index];
  assert.ok(workflow, `Expected workflow at index ${index}`);
  assert.strictEqual(workflow.phaseOrder, order,
    `Expected workflow[${index}].phaseOrder to be ${order}, got ${workflow.phaseOrder}`);
});

Then('workflow {int} id should not be empty', function (this: BmadWorld, index: number) {
  const workflow = loadResult[index];
  assert.ok(workflow, `Expected workflow at index ${index}`);
  assert.ok(workflow.id && workflow.id.length > 0,
    `Expected workflow[${index}].id to be non-empty, got "${workflow.id}"`);
});

Then('openChat should have been called with {string}', function (this: BmadWorld, trigger: string) {
  assert.ok(openChatCalls.includes(trigger),
    `Expected openChat to be called with "${trigger}". Calls: ${JSON.stringify(openChatCalls)}`);
});

Then('no artifact command error should be thrown', function (this: BmadWorld) {
  assert.strictEqual(lastError, null,
    `Expected no error, but got: ${lastError?.message}`);
});
