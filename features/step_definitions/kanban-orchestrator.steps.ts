/**
 * Kanban Orchestrator step definitions.
 *
 * Loads the orchestrator via proxyquire with a scripted verdict queue so the
 * implement -> review -> done state machine can be tested deterministically,
 * without spawning real terminals or chat sessions.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

interface OrchCtx {
  verdicts: Array<{ verdict: string; fixRequests?: any[] }>;
  statusUpdates: string[];
  artifact: any;
  maxIter: number;
  orch?: any;
  result?: any;
}

function getCtx(world: BmadWorld): OrchCtx {
  const w = world as any;
  if (!w.__orch) {
    w.__orch = {
      verdicts: [],
      statusUpdates: [],
      artifact: { id: 'STORY-1', type: 'story', title: 'Login', status: 'ready-for-dev', metadata: {} },
      maxIter: 3,
    } as OrchCtx;
  }
  return w.__orch as OrchCtx;
}

function buildOrchestrator(world: BmadWorld): OrchCtx {
  const ctx = getCtx(world);

  const store = {
    findArtifactById: () => ({ type: 'story', artifact: ctx.artifact }),
    updateArtifact: async (_type: string, _id: string, changes: any) => {
      if (changes.status) ctx.statusUpdates.push(changes.status);
      const { metadata, ...top } = changes;
      Object.assign(ctx.artifact, top);
      if (metadata && typeof metadata === 'object') Object.assign(ctx.artifact, metadata);
    },
  };

  const nextVerdict = () => ctx.verdicts.shift() ?? { verdict: 'UNKNOWN' };

  const executor = {
    getWorkflowSkillContent: () => 'SKILL CONTENT',
    // Chat path would call this; tests use the terminal path, but provide it anyway.
    executeLaneTransition: async () => nextVerdict(),
  };

  const terminalExecutor = {
    executeAndAwaitVerdict: async () => nextVerdict(),
  };

  const mod = proxyquire('../../src/workflow/kanban-orchestrator', {
    vscode: {
      EventEmitter: class {
        event = (_listener: any) => ({ dispose: () => {} });
        fire(_evt: any) {}
        dispose() {}
      },
      window: { showWarningMessage: () => {} },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: '/fake/project' } }],
      },
    },
    '../utils/logger': {
      createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
    },
    './concurrency-queue': {
      concurrencyQueue: {
        isLocked: () => false,
        tryAcquire: () => ({ artifactId: ctx.artifact.id }),
        release: () => {},
      },
    },
    './terminal-executor': {
      terminalExecutor,
    },
    './kanban-settings': {
      getKanbanMaxIterations: () => ctx.maxIter,
    },
    './circuit-breaker': {
      circuitBreaker: {
        canRun: () => true,
        recordSuccess: () => {},
        recordFailure: () => {},
      },
    },
    './budget-enforcer': {
      budgetEnforcer: {
        canStart: () => true,
        getStatus: () => ({}),
      },
    },
    './auto-retry-engine': {
      autoRetryEngine: {
        run: async (_id: string, work: () => Promise<void>) => {
          try {
            await work();
            return { succeeded: true, attempts: [], finalCategory: 'unknown', totalAttempts: 1, storyId: _id };
          } catch (err) {
            return { succeeded: false, attempts: [{ error: err, attemptNumber: 1, startedAt: Date.now() }], finalCategory: 'transient', totalAttempts: 1, storyId: _id };
          }
        },
      },
    },
    './autonomous-git': {
      autonomousGit: {
        maybeBranch: async () => {},
        maybeCommit: async () => {},
        maybePR: async () => {},
      },
    },
  });

  ctx.orch = new mod.KanbanOrchestrator(store, executor, terminalExecutor);
  return ctx;
}

Given('a story on the agentic board', function (this: BmadWorld) {
  const w = this as any;
  w.__orch = undefined; // fresh per scenario
  const ctx = getCtx(this);
  ctx.verdicts = [];
  ctx.statusUpdates = [];
  ctx.artifact = { id: 'STORY-1', type: 'story', title: 'Login', status: 'ready-for-dev', metadata: {} };
  ctx.maxIter = 3;
});

Given('the lane agents will return verdicts {string}', function (this: BmadWorld, csv: string) {
  const ctx = getCtx(this);
  ctx.verdicts = csv.split(',').map(s => ({ verdict: s.trim(), fixRequests: [{ failing_criterion: 'x' }] }));
});

Given('the maximum iterations is {int}', function (this: BmadWorld, n: number) {
  getCtx(this).maxIter = n;
});

When('the orchestrator runs autonomously', async function (this: BmadWorld) {
  const ctx = buildOrchestrator(this);
  ctx.result = await ctx.orch.runAutonomous(ctx.artifact, {});
});

Then('the run succeeds', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.result.ok, true, `expected ok=true, got ${JSON.stringify(ctx.result)}`);
  assert.strictEqual(ctx.result.status, 'complete', `Expected status 'complete', got '${ctx.result.status}'`);
});

Then('the run is blocked', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.result.ok, false, `expected ok=false, got ${JSON.stringify(ctx.result)}`);
  assert.strictEqual(ctx.result.status, 'blocked', `Expected status 'blocked', got '${ctx.result.status}'`);
});

Then('the card reaches {string}', function (this: BmadWorld, status: string) {
  const ctx = getCtx(this);
  assert.ok(
    ctx.statusUpdates.includes(status),
    `expected status updates to include "${status}", got [${ctx.statusUpdates.join(', ')}]`
  );
});

Then('the card never reaches {string}', function (this: BmadWorld, status: string) {
  const ctx = getCtx(this);
  assert.ok(
    !ctx.statusUpdates.includes(status),
    `expected status updates to NOT include "${status}", got [${ctx.statusUpdates.join(', ')}]`
  );
});

Then('the card entered {string} at least {int} times', function (this: BmadWorld, status: string, n: number) {
  const ctx = getCtx(this);
  const count = ctx.statusUpdates.filter(s => s === status).length;
  assert.ok(count >= n, `expected "${status}" >= ${n} times, got ${count} ([${ctx.statusUpdates.join(', ')}])`);
});
