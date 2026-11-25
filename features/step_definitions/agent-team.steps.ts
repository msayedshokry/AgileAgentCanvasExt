/**
 * Agent Team Step Definitions
 * Cucumber step definitions for testing AgentTeamOrchestrator and team registry
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

interface TeamTestContext {
  orchestrator: any;
  teamRegistry: Record<string, any>;
  lastTeamMembers: any[];
  lastResults: any[];
  lastRoleTask: string;
  lastError: Error | null;
  streamMessages: string[];
  spawnedSessionIds: string[];
  /** Every session the orchestrator spawned, in order, with what it was given and returned. */
  spawned: Array<{ id: string; role: string; artifact: any; parentSessionId: string | undefined; output?: any }>;
}

const contexts = new WeakMap<BmadWorld, TeamTestContext>();

function getCtx(world: BmadWorld): TeamTestContext {
  let ctx = contexts.get(world);
  if (!ctx) {
    ctx = {
      orchestrator: null,
      teamRegistry: {},
      lastTeamMembers: [],
      lastResults: [],
      lastRoleTask: '',
      lastError: null,
      streamMessages: [],
      spawnedSessionIds: [],
      spawned: [],
    };
    contexts.set(world, ctx);
  }
  return ctx;
}

const TEAM_REGISTRY_MOCK = {
  'dev-story': {
    id: 'dev-story',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-tea', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/dev-story/workflow.yaml',
  },
  'create-prd': {
    id: 'create-prd',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/2-plan-workflows/create-prd/workflow-create-prd.md',
  },
};

function createOrchestrator(world: BmadWorld): any {
  // Shared session store so spawn and execute can coordinate roles
  const spawnedSessions = new Map<string, any>();
  const ctx = getCtx(world);
  ctx.spawned = [];

  const module = proxyquire('../../src/acp/team-orchestrator', {
    vscode: world.vscode,
    '../utils/logger': {
      createLogger: () => ({
        info: () => {},
        error: () => {},
        debug: () => {},
        warn: () => {},
      }),
    },
    './session-manager': {
      acpSessionManager: {
        spawn: async (spec: any, _bmadPath: string) => {
          const id = `acp-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const session = {
            id,
            spec,
            status: 'pending',
            persona: { name: spec.personaId },
            createdAt: new Date(),
            events: [],
            addEvent: () => {},
            setStatus: () => {},
            dispose: () => {},
          };
          spawnedSessions.set(id, session);
          ctx.spawned.push({ id, role: spec.role, artifact: spec.context?.artifact, parentSessionId: spec.context?.parentSessionId });
          return session;
        },
        execute: async (sessionId: string, _model: any, _store: any, _stream: any, _token: any) => {
          // Look up the session to determine the correct role
          const session = spawnedSessions.get(sessionId);
          const role = session?.spec?.role || 'crafter';
          const output = { status: 'done', data: `Output for ${sessionId}` };
          const record = ctx.spawned.find(s => s.id === sessionId);
          if (record) record.output = output;
          return {
            sessionId,
            role,
            status: 'completed',
            output,
            toolCalls: 3,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            events: [],
          };
        },
        getSession: () => undefined,
      },
    },
    '../chat/agent-personas': {
      getPersonaForArtifactType: () => null,
      formatFullAgentForPrompt: () => 'mock persona prompt',
    },
  });

  return new module.AgentTeamOrchestrator();
}

// ─── GIVEN ──────────────────────────────────────────────────────────────────

Given('a fresh agent team orchestrator', function (this: BmadWorld) {
  const ctx = getCtx(this);
  ctx.orchestrator = createOrchestrator(this);
  ctx.lastTeamMembers = [];
  ctx.lastResults = [];
  ctx.lastRoleTask = '';
  ctx.lastError = null;
  ctx.streamMessages = [];
  ctx.spawnedSessionIds = [];
});

Given('an initial artifact with title {string}', function (this: BmadWorld, title: string) {
  const ctx = getCtx(this);
  (ctx as any).initialArtifact = { title, id: 'artifact-1', type: 'story' };
});

Given('a team definition with:', function (this: BmadWorld, dataTable: any) {
  const ctx = getCtx(this);
  // Use rowsHash() for vertical key|value tables (not hashes() which treats first row as header)
  const row = dataTable.rowsHash();
  ctx.lastTeamMembers = [{
    id: row.id,
    members: (row.members || '').split(',').map((m: string, i: number) => ({
      role: m.trim(),
      personaId: `bmad-agent-${m.trim()}`,
      order: i + 1,
    })),
    workflow: row.workflow,
  }];
});

Given('a team member with:', function (this: BmadWorld, dataTable: any) {
  const ctx = getCtx(this);
  // Use rowsHash() for vertical key|value tables
  const row = dataTable.rowsHash();
  ctx.lastTeamMembers = [{
    role: row.role,
    personaId: row.personaId,
    order: parseInt(row.order, 10),
  }];
});

// ─── WHEN ───────────────────────────────────────────────────────────────────

When('I inspect team {string} members', function (this: BmadWorld, teamId: string) {
  const ctx = getCtx(this);
  const team = TEAM_REGISTRY_MOCK[teamId as keyof typeof TEAM_REGISTRY_MOCK];
  ctx.lastTeamMembers = team ? [...team.members].sort((a, b) => a.order - b.order) : [];
});

When('I execute team {string} with task {string} and mock model', async function (this: BmadWorld, teamId: string, task: string) {
  const ctx = getCtx(this);
  const mockStream = {
    markdown: (msg: string) => {
      ctx.streamMessages.push(msg);
    },
  };
  const mockToken = {
    onCancellationRequested: () => ({ dispose: () => {} }),
    isCancellationRequested: false,
  };

  ctx.lastResults = await ctx.orchestrator.executeTeam(
    teamId,
    task,
    (ctx as any).initialArtifact || { title: task },
    {},
    null,
    '/test/bmad-path',
    mockStream,
    mockToken
  );
});

When('I execute team {string} with task {string} and mock model and a stream',
  async function (this: BmadWorld, teamId: string, task: string) {
    const ctx = getCtx(this);
    const mockStream = {
      markdown: (msg: string) => {
        ctx.streamMessages.push(msg);
      },
    };
    const mockToken = {
      onCancellationRequested: () => ({ dispose: () => {} }),
      isCancellationRequested: false,
    };

    ctx.lastResults = await ctx.orchestrator.executeTeam(
      teamId,
      task,
      (ctx as any).initialArtifact || { title: task },
      {},
      null,
      '/test/bmad-path',
      mockStream,
      mockToken
    );
  }
);

When('I execute team {string} with task {string} and mock model where crafter fails',
  async function (this: BmadWorld, teamId: string, task: string) {
    const ctx = getCtx(this);

    // Override execute to fail the second member (crafter)
    let failCallCount = 0;
    const failSessionManager = {
      spawn: async (spec: any) => {
        const id = `acp-fail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const session = {
          id,
          spec,
          status: 'pending',
          events: [],
          addEvent: () => {},
          setStatus: () => {},
          dispose: () => {},
        };
        return session;
      },
      execute: async (sessionId: string, _model: any, _store: any, _stream: any, _token: any) => {
        failCallCount++;
        if (failCallCount === 2) {
          // Second call = crafter, should fail
          return {
            sessionId, role: 'crafter', status: 'failed',
            output: null, toolCalls: 0,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            events: [],
            error: 'Crafter failed intentionally',
          };
        }
        return {
          sessionId, role: 'coordinator', status: 'completed',
          output: { status: 'done' }, toolCalls: 3,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          events: [],
        };
      },
      getSession: () => undefined,
    };
    const originalModule = proxyquire('../../src/acp/team-orchestrator', {
      vscode: this.vscode,
      '../utils/logger': {
        createLogger: () => ({
          info: () => {},
          error: () => {},
          debug: () => {},
          warn: () => {},
        }),
      },
      './session-manager': {
        acpSessionManager: failSessionManager,
      },
      '../chat/agent-personas': {
        getPersonaForArtifactType: () => null,
        formatFullAgentForPrompt: () => 'mock persona prompt',
      },
    });

    const failOrchestrator = new originalModule.AgentTeamOrchestrator();
    const mockStream = { markdown: () => {} };
    const mockToken = { onCancellationRequested: () => ({ dispose: () => {} }) };

    try {
      ctx.lastResults = await failOrchestrator.executeTeam(
        teamId, task, { title: task }, {}, null, '/test/bmad-path', mockStream, mockToken
      );
    } catch (err: any) {
      ctx.lastError = err;
    }
  }
);

When('I execute team {string} with task {string} and cancellation during crafter',
  async function (this: BmadWorld, teamId: string, task: string) {
    const ctx = getCtx(this);
    let callCount = 0;
    const mockStream = { markdown: () => {} };

    const cancelModule = proxyquire('../../src/acp/team-orchestrator', {
      vscode: this.vscode,
      '../utils/logger': {
        createLogger: () => ({
          info: () => {}, error: () => {}, debug: () => {}, warn: () => {},
        }),
      },
      './session-manager': {
        acpSessionManager: {
          spawn: async (spec: any) => ({
            id: `acp-cancel-${callCount}`,
            spec,
            status: 'pending',
            events: [],
            addEvent: () => {},
            setStatus: () => {},
            dispose: () => {},
          }),
          execute: async (sessionId: string) => {
            callCount++;
            if (callCount === 2) {
              // Second call (crafter) triggers cancellation
              return {
                sessionId, role: 'crafter', status: 'cancelled',
                output: null, toolCalls: 0,
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                events: [],
                error: 'Cancelled',
              };
            }
            return {
              sessionId, role: 'coordinator', status: 'completed',
              output: { status: 'done' }, toolCalls: 3,
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              events: [],
            };
          },
          getSession: () => undefined,
        },
      },
      '../chat/agent-personas': {
        getPersonaForArtifactType: () => null,
        formatFullAgentForPrompt: () => 'mock persona prompt',
      },
    });

    const cancelOrchestrator = new cancelModule.AgentTeamOrchestrator();
    const mockToken = { onCancellationRequested: () => ({ dispose: () => {} }) };

    try {
      ctx.lastResults = await cancelOrchestrator.executeTeam(
        teamId, task, { title: task }, {}, null, '/test/bmad-path', mockStream, mockToken
      );
    } catch (err: any) {
      ctx.lastError = err;
    }
  }
);

When('I execute team {string} with task {string}', async function (this: BmadWorld, teamId: string, task: string) {
  const ctx = getCtx(this);
  const mockStream = { markdown: () => {} };
  const mockToken = { onCancellationRequested: () => ({ dispose: () => {} }) };

  try {
    ctx.lastResults = await ctx.orchestrator.executeTeam(
      teamId, task, { title: task }, {}, null, '/test/bmad-path', mockStream, mockToken
    );
  } catch (err: any) {
    ctx.lastError = err;
  }
});

When('I execute team {string} with task {string} and mock model that throws',
  async function (this: BmadWorld, teamId: string, task: string) {
    const ctx = getCtx(this);

    const throwModule = proxyquire('../../src/acp/team-orchestrator', {
      vscode: this.vscode,
      '../utils/logger': {
        createLogger: () => ({
          info: () => {}, error: () => {}, debug: () => {}, warn: () => {},
        }),
      },
      './session-manager': {
        acpSessionManager: {
          spawn: async () => { throw new Error('Spawn error'); },
          execute: async () => { throw new Error('Execute error'); },
          getSession: () => undefined,
        },
      },
      '../chat/agent-personas': {
        getPersonaForArtifactType: () => null,
        formatFullAgentForPrompt: () => 'mock persona prompt',
      },
    });

    const throwOrchestrator = new throwModule.AgentTeamOrchestrator();
    const mockStream = { markdown: () => {} };
    const mockToken = { onCancellationRequested: () => ({ dispose: () => {} }) };

    try {
      ctx.lastResults = await throwOrchestrator.executeTeam(
        teamId, task, { title: task }, {}, null, '/test/bmad-path', mockStream, mockToken
      );
    } catch (err: any) {
      ctx.lastError = err;
    }
  }
);

// Squad used by the role-task steps: buildRoleTask(members, role, task, artifact, handoffNotes).
const SQUAD = [
  { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
  { role: 'researcher', personaId: 'aac-agent-analyst', order: 2 },
  { role: 'crafter', personaId: 'aac-agent-dev', order: 3 },
  { role: 'gate', personaId: 'aac-agent-architect', order: 4 },
];

When('I build a role task for {string} with original task {string}', function (this: BmadWorld, role: string, task: string) {
  const ctx = getCtx(this);
  // Access the private buildRoleTask via any cast
  ctx.lastRoleTask = (ctx.orchestrator as any).buildRoleTask(SQUAD, role, task, null, []);
});

When('I build a role task for {string} with original task {string} and artifact',
  function (this: BmadWorld, role: string, task: string) {
    const ctx = getCtx(this);
    const artifact = { id: 'test-1', title: task, type: 'story' };
    ctx.lastRoleTask = (ctx.orchestrator as any).buildRoleTask(SQUAD, role, task, artifact, []);
  }
);

When('I build a role task for {string} with previous results', function (this: BmadWorld, role: string) {
  const ctx = getCtx(this);
  const handoffNotes = [{ role: 'coordinator', text: 'plan' }];
  ctx.lastRoleTask = (ctx.orchestrator as any).buildRoleTask(SQUAD, role, 'Original task', null, handoffNotes);
});

// ─── THEN ───────────────────────────────────────────────────────────────────

Then('the team registry should contain team {string}', function (this: BmadWorld, teamId: string) {
  assert.ok(TEAM_REGISTRY_MOCK[teamId as keyof typeof TEAM_REGISTRY_MOCK],
    `Team "${teamId}" should exist in registry`);
});

Then('the {string} team should have {int} members', function (this: BmadWorld, teamId: string, count: number) {
  const team = TEAM_REGISTRY_MOCK[teamId as keyof typeof TEAM_REGISTRY_MOCK];
  assert.ok(team, `Team "${teamId}" should exist`);    assert.strictEqual(team.members.length, count, `Expected ${count} members, got ${team.members.length}`);
});

Then('the {string} team members should include roles {string}, {string}, {string}',
  function (this: BmadWorld, teamId: string, role1: string, role2: string, role3: string) {
    const team = TEAM_REGISTRY_MOCK[teamId as keyof typeof TEAM_REGISTRY_MOCK];
    assert.ok(team, `Team "${teamId}" should exist`);
    const roles = team.members.map((m: any) => m.role);
    assert.ok(roles.includes(role1), `Team should include role "${role1}"`);
    assert.ok(roles.includes(role2), `Team should include role "${role2}"`);
    assert.ok(roles.includes(role3), `Team should include role "${role3}"`);
  }
);

Then('member at order {int} should have role {string}', function (this: BmadWorld, order: number, role: string) {
  const ctx = getCtx(this);
  const member = ctx.lastTeamMembers.find((m: any) => m.order === order);    assert.ok(member, `Member at order ${order} should exist`);
    assert.strictEqual(member.role, role, `Expected member at order ${order} to have role "${role}", got "${member.role}"`);
});

Then('member with role {string} should have personaId {string}', function (this: BmadWorld, role: string, expectedPersonaId: string) {
  const ctx = getCtx(this);
  const member = ctx.lastTeamMembers.find((m: any) => m.role === role);
  assert.ok(member, `Member with role "${role}" should exist`);
  assert.strictEqual(member.personaId, expectedPersonaId, `Expected role "${role}" personaId "${expectedPersonaId}", got "${member?.personaId}"`);
});

Then('all team members should have been spawned', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastResults.length > 0, 'Expected at least one result');
});

Then('the coordinator should have been spawned first', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastResults.length >= 1, 'Expected at least 1 result');
  assert.strictEqual(ctx.lastResults[0].role, 'coordinator', `Expected first result role "coordinator", got "${ctx.lastResults[0].role}"`);
});

Then('the crafter should have been spawned second', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastResults.length >= 2, 'Expected at least 2 results');
  assert.strictEqual(ctx.lastResults[1].role, 'crafter', `Expected second result role "crafter", got "${ctx.lastResults[1].role}"`);
});

Then('the gate should have been spawned third', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastResults.length >= 3, 'Expected at least 3 results');
  assert.strictEqual(ctx.lastResults[2].role, 'gate', `Expected third result role "gate", got "${ctx.lastResults[2].role}"`);
});

function spawnedAs(ctx: TeamTestContext, role: string) {
  const s = ctx.spawned.find(x => x.role === role);
  assert.ok(s, `No ${role} session was spawned (spawned: ${ctx.spawned.map(x => x.role).join(', ')})`);
  return s;
}

Then('the coordinator should have received the initial artifact', function (this: BmadWorld) {
  const ctx = getCtx(this);
  const got = spawnedAs(ctx, 'coordinator').artifact;
  assert.deepStrictEqual(got, (ctx as any).initialArtifact, `Coordinator got ${JSON.stringify(got)}`);
});

Then('the crafter should have received the coordinator output', function (this: BmadWorld) {
  const ctx = getCtx(this);
  const coordinator = spawnedAs(ctx, 'coordinator');
  assert.ok(coordinator.output, 'Coordinator produced no output');
  const got = spawnedAs(ctx, 'crafter').artifact;
  assert.strictEqual(got, coordinator.output, `Crafter got ${JSON.stringify(got)}, not the coordinator output`);
});

Then('the gate should have received the crafter output', function (this: BmadWorld) {
  const ctx = getCtx(this);
  const crafter = spawnedAs(ctx, 'crafter');
  assert.ok(crafter.output, 'Crafter produced no output');
  const got = spawnedAs(ctx, 'gate').artifact;
  assert.strictEqual(got, crafter.output, `Gate got ${JSON.stringify(got)}, not the crafter output`);
});

Then('the returned results should have {int} entries', function (this: BmadWorld, count: number) {
  const ctx = getCtx(this);    assert.strictEqual(ctx.lastResults.length, count, `Expected ${count} results, got ${ctx.lastResults.length}`);
});

Then('the results should have {int} entry', function (this: BmadWorld, count: number) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.lastResults.length, count, `Expected ${count} results, got ${ctx.lastResults.length}`);
});

Then('each result should have status {string}', function (this: BmadWorld, expectedStatus: string) {
  const ctx = getCtx(this);
  for (const result of ctx.lastResults) {
    assert.strictEqual(result.status, expectedStatus, `Expected result for "${result.role}" status "${expectedStatus}", got "${result.status}"`);
  }
});

Then('each result should have a role matching the team member', function (this: BmadWorld) {
  const ctx = getCtx(this);
  const team = TEAM_REGISTRY_MOCK['dev-story'];
  for (let i = 0; i < ctx.lastResults.length; i++) {
    assert.strictEqual(ctx.lastResults[i].role, team.members[i].role, `Expected result ${i} role "${team.members[i].role}", got "${ctx.lastResults[i].role}"`);
  }
});

Then('the stream should have received a message for each member role', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.streamMessages.length > 0, 'Expected stream messages');
});

Then('the agent team error should contain {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastError, 'No error was thrown');
  assert.ok(ctx.lastError!.message.includes(expected),
    `Expected error message to contain "${expected}" but got "${ctx.lastError!.message}"`);
});

Then('the stream messages should contain {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  // Strip markdown formatting (**bold**, emoji) to allow natural-language assertions
  const stripFormatting = (s: string) => s.replace(/\*\*/g, '').replace(/[🤖✅❌]/gu, '').trim();
  const allMessages = ctx.streamMessages.map(stripFormatting).join(' ');
  assert.ok(allMessages.includes(expected), `Expected stream to contain "${expected}" in:\n${allMessages}`);
});

Then('the coordinator should have completed', function (this: BmadWorld) {
  const ctx = getCtx(this);
  const coordResult = ctx.lastResults.find((r: any) => r.role === 'coordinator');
  assert.ok(coordResult, 'Expected coordinator result');    assert.strictEqual(coordResult.status, 'completed', `Expected coordinator status "completed", got "${coordResult.status}"`);
});

Then('the crafter should have failed', function (this: BmadWorld) {
  const ctx = getCtx(this);
  const craftResult = ctx.lastResults.find((r: any) => r.role === 'crafter');
  assert.ok(craftResult, 'Expected crafter result');    assert.strictEqual(craftResult.status, 'failed', `Expected crafter status "failed", got "${craftResult.status}"`);
});

Then('the gate should NOT have been spawned', function (this: BmadWorld) {
  const ctx = getCtx(this);
  const gateResult = ctx.lastResults.find((r: any) => r.role === 'gate');
  assert.strictEqual(gateResult, undefined, 'Gate should NOT have been spawned');
});

Then('the crafter should have started but been cancelled', function (this: BmadWorld) {
  const ctx = getCtx(this);
  const craftResult = ctx.lastResults.find((r: any) => r.role === 'crafter');
  assert.ok(craftResult, 'Expected crafter result');    assert.strictEqual(craftResult.status, 'cancelled', `Expected crafter status "cancelled", got "${craftResult.status}"`);
});

Then('an error should have been thrown', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastError, 'Expected an error to have been thrown');
});

Then('the role task should contain {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastRoleTask.includes(expected),
    `Expected role task to contain "${expected}"`);
});

Then('the role task should contain the serialized artifact', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastRoleTask.includes('test-1') || ctx.lastRoleTask.includes('story'),
    'Expected role task to contain artifact data');
});

Then('the team should have id {string}', function (this: BmadWorld, expectedId: string) {
  const ctx = getCtx(this);    assert.strictEqual(ctx.lastTeamMembers[0]?.id, expectedId, `Expected team id "${expectedId}", got "${ctx.lastTeamMembers[0]?.id}"`);
});

Then('the team should have {int} members', function (this: BmadWorld, count: number) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.lastTeamMembers[0]?.members?.length, count, `Expected ${count} team members, got ${ctx.lastTeamMembers[0]?.members?.length}`);
});

Then('the team workflow should be {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);    assert.strictEqual(ctx.lastTeamMembers[0]?.workflow, expected, `Expected team workflow "${expected}", got "${ctx.lastTeamMembers[0]?.workflow}"`);
});

Then('the member role should be {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.lastTeamMembers[0]?.role, expected, `Expected member role "${expected}", got "${ctx.lastTeamMembers[0]?.role}"`);
});

Then('the member personaId should be {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);    assert.strictEqual(ctx.lastTeamMembers[0]?.personaId, expected, `Expected member personaId "${expected}", got "${ctx.lastTeamMembers[0]?.personaId}"`);
});

Then('the member order should be {int}', function (this: BmadWorld, expected: number) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.lastTeamMembers[0]?.order, expected, `Expected member order ${expected}, got ${ctx.lastTeamMembers[0]?.order}`);
});

Then('the second spawned session parentSessionId should be the first session ID', function (this: BmadWorld) {
  const { spawned } = getCtx(this);
  assert.ok(spawned.length >= 2, `Expected at least 2 spawned sessions, got ${spawned.length}`);
  assert.strictEqual(spawned[0].parentSessionId, undefined, 'The first session should have no parent');
  assert.strictEqual(spawned[1].parentSessionId, spawned[0].id, `Second parent is "${spawned[1].parentSessionId}", expected "${spawned[0].id}"`);
});

Then('the third spawned session parentSessionId should be the second session ID', function (this: BmadWorld) {
  const { spawned } = getCtx(this);
  assert.ok(spawned.length >= 3, `Expected at least 3 spawned sessions, got ${spawned.length}`);
  assert.strictEqual(spawned[2].parentSessionId, spawned[1].id, `Third parent is "${spawned[2].parentSessionId}", expected "${spawned[1].id}"`);
});
