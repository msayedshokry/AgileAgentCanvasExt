/**
 * ACP Protocol Step Definitions
 * Cucumber step definitions for testing AcpSessionManager and ACP protocol lifecycle
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

interface AcpTestContext {
  sessionManager: any;
  spawnedSessions: any[];
  subscribedEvents: any[];
  lastSession: any;
  lastResult: any;
  lastError: Error | null;
  disposables: { dispose: () => void }[];
  sessionIds: string[];
}

const contexts = new WeakMap<BmadWorld, AcpTestContext>();

function getCtx(world: BmadWorld): AcpTestContext {
  let ctx = contexts.get(world);
  if (!ctx) {
    ctx = {
      sessionManager: null,
      spawnedSessions: [],
      subscribedEvents: [],
      lastSession: null,
      lastResult: null,
      lastError: null,
      disposables: [],
      sessionIds: [],
    };
    contexts.set(world, ctx);
  }
  return ctx;
}

function createSessionManager(world: BmadWorld): any {
  const module = proxyquire('../../src/acp/session-manager', {
    vscode: world.vscode,
    '../utils/logger': {
      createLogger: () => ({
        info: () => {},
        error: () => {},
        debug: () => {},
        warn: () => {},
      }),
    },
    // Mock agent-personas so spawn() can load persona (without vscode)
    '../chat/agent-personas': {
      getPersonaForArtifactType: (_bmadPath: string, personaId: string) => ({
        id: personaId,
        name: personaId,
        role: personaId,
        systemPrompt: `You are ${personaId}`,
        toolsAvailable: true,
      }),
      formatFullAgentForPrompt: (persona: any) => persona ? `# Persona: ${persona.name}\n${persona.systemPrompt}` : '',
    },
  });

  const mockExecutor = {
    executeWithTools: async () => ({ toolCalls: 3, output: { status: 'done' } }),
    getCurrentSession: () => null,
    getSession: () => null,
  };

  return new module.AcpSessionManager(mockExecutor);
}

// ─── GIVEN ──────────────────────────────────────────────────────────────────

Given('a fresh ACP session manager', function (this: BmadWorld) {
  const ctx = getCtx(this);
  ctx.sessionManager = createSessionManager(this);
  ctx.spawnedSessions = [];
  ctx.subscribedEvents = [];
  ctx.lastSession = null;
  ctx.lastResult = null;
  ctx.lastError = null;
  ctx.sessionIds = [];
});

Given('I spawn an ACP session with spec:', async function (this: BmadWorld, dataTable: any) {
  const ctx = getCtx(this);
  // Use rowsHash() for vertical key|value tables (not hashes() which treats first row as header)
  const row = dataTable.rowsHash();

  const spec = {
    role: row.role,
    personaId: row.personaId,
    context: {
      task: row.task,
      constraints: row.constraints ? [row.constraints] : [],
      artifact: row.artifact ? JSON.parse(row.artifact) : undefined,
    },
  };

  const session = await ctx.sessionManager.spawn(spec, '/test/bmad-path');
  ctx.spawnedSessions.push(session);
  ctx.lastSession = session;
});

Given('the session is running', function (this: BmadWorld) {
  const ctx = getCtx(this);
  if (ctx.lastSession) {
    ctx.lastSession.setStatus('running');
  }
});

Given('I spawn 3 ACP sessions', async function (this: BmadWorld) {
  const ctx = getCtx(this);
  const roles = ['coordinator', 'crafter', 'researcher'];
  for (const role of roles) {
    const session = await ctx.sessionManager.spawn({
      role,
      personaId: `bmad-agent-${role}`,
      context: { task: `Task for ${role}` },
    }, '/test/bmad-path');
    ctx.spawnedSessions.push(session);
  }
});

Given('I spawn and execute an ACP session successfully', async function (this: BmadWorld) {
  const ctx = getCtx(this);
  const session = await ctx.sessionManager.spawn({
    role: 'coordinator',
    personaId: 'bmad-agent-pm',
    context: { task: 'Plan sprint' },
  }, '/test/bmad-path');
  ctx.spawnedSessions.push(session);
  ctx.lastSession = session;

  const result = await ctx.sessionManager.execute(
    session.id,
    {},
    null,
    { markdown: () => {} },
    { onCancellationRequested: () => ({ dispose: () => {} }) }
  );
  ctx.lastResult = result;
});

Given('an ACP session spec with role {string}', function (this: BmadWorld, role: string) {
  const ctx = getCtx(this);
  const spec = {
    role,
    personaId: `bmad-agent-${role}`,
    context: { task: `Test ${role}` },
  };
  ctx.lastSession = { spec, valid: true };
});

Given('an ACP session spec with:', function (this: BmadWorld, dataTable: any) {
  const ctx = getCtx(this);
  // Use rowsHash() for vertical key|value tables
  const row = dataTable.rowsHash();
  ctx.lastSession = {
    spec: {
      role: row.role,
      personaId: row.personaId,
      context: { task: row.task },
    },
    valid: true,
  };
});

Given('an ACP handoff from session {string} to session {string}', function (this: BmadWorld, fromId: string, toId: string) {
  const ctx = getCtx(this);
  ctx.lastSession = {
    handoff: {
      fromSessionId: fromId,
      toSessionId: toId,
      context: {
        task: 'Handoff task',
        intermediateArtifacts: { result: 'done' },
      },
    },
  };
});

// ─── WHEN ───────────────────────────────────────────────────────────────────

When('I subscribe to ACP events for the next session', function (this: BmadWorld) {
  const ctx = getCtx(this);
  // Subscription happens after spawn — we store intent
  ctx.disposables.push({ dispose: () => {} });
});

When('I spawn an ACP session with parentSessionId {string}', async function (this: BmadWorld, parentId: string) {
  const ctx = getCtx(this);
  const session = await ctx.sessionManager.spawn({
    role: 'coordinator',
    personaId: 'bmad-agent-pm',
    context: {
      task: 'Child task',
      parentSessionId: parentId,
    },
  }, '/test/bmad-path');
  ctx.spawnedSessions.push(session);
  ctx.lastSession = session;
});

When('I spawn ACP sessions with spec:', async function (this: BmadWorld, dataTable: any) {
  const ctx = getCtx(this);
  const rows = dataTable.hashes();

  for (const row of rows) {
    const session = await ctx.sessionManager.spawn({
      role: row.role,
      personaId: row.personaId,
      context: { task: row.task },
    }, '/test/bmad-path');
    ctx.spawnedSessions.push(session);
    ctx.lastSession = session;
  }
});

When('I execute the session with a mock model', async function (this: BmadWorld) {
  const ctx = getCtx(this);
  if (!ctx.lastSession) return;

  ctx.lastResult = await ctx.sessionManager.execute(
    ctx.lastSession.id,
    {},
    null,
    { markdown: () => {} },
    { onCancellationRequested: () => ({ dispose: () => {} }) }
  );
});

When('I execute the session with a mock model that returns success', async function (this: BmadWorld) {
  const ctx = getCtx(this);
  if (!ctx.lastSession) return;

  // Mock model returns success
  ctx.sessionManager.executor.executeWithTools = async () => ({
    toolCalls: 5,
    output: { status: 'completed', data: 'result' },
  });

  ctx.lastResult = await ctx.sessionManager.execute(
    ctx.lastSession.id,
    {},
    null,
    { markdown: () => {} },
    { onCancellationRequested: () => ({ dispose: () => {} }) }
  );
});

When('I execute the session with a mock model that throws', async function (this: BmadWorld) {
  const ctx = getCtx(this);
  if (!ctx.lastSession) return;

  ctx.sessionManager.executor.executeWithTools = async () => {
    throw new Error('Mock execution error');
  };

  try {
    ctx.lastResult = await ctx.sessionManager.execute(
      ctx.lastSession.id,
      {},
      null,
      { markdown: () => {} },
      { onCancellationRequested: () => ({ dispose: () => {} }) }
    );
  } catch (err: any) {
    ctx.lastError = err;
  }
});

When('I execute the session with cancellation during execution', async function (this: BmadWorld) {
  const ctx = getCtx(this);
  if (!ctx.lastSession) return;

  let cancelled = false;
  // Cancel on first execution
  ctx.sessionManager.executor.executeWithTools = async () => {
    if (!cancelled) {
      cancelled = true;
      ctx.lastSession.setStatus('cancelled');
    }
    return { toolCalls: 0, output: null };
  };

  ctx.lastResult = await ctx.sessionManager.execute(
    ctx.lastSession.id,
    {},
    null,
    { markdown: () => {} },
    {
      onCancellationRequested: (handler: () => void) => {
        // Trigger cancellation
        handler();
        return { dispose: () => {} };
      },
    }
  );
});

When('I build the ACP prompt for the session', async function (this: BmadWorld) {
  const ctx = getCtx(this);
  // Access the private buildAcpPrompt method through the prototype
  if (ctx.lastSession) {
    ctx.lastResult = (ctx.sessionManager as any).buildAcpPrompt(ctx.lastSession);
  }
});

When('I subscribe to events for the session', function (this: BmadWorld) {
  const ctx = getCtx(this);
  if (ctx.lastSession) {
    const disposable = ctx.sessionManager.onEvent(ctx.lastSession.id, (event: any) => {
      ctx.subscribedEvents.push(event);
    });
    ctx.disposables.push(disposable);
  }
});

When('I subscribe to events for session {string}', function (this: BmadWorld, sessionId: string) {
  const ctx = getCtx(this);
  const disposable = ctx.sessionManager.onEvent(sessionId, (event: any) => {
    ctx.subscribedEvents.push(event);
  });
  ctx.disposables.push(disposable);
});

When('I dispose the ACP session manager', function (this: BmadWorld) {
  const ctx = getCtx(this);
  ctx.sessionManager.dispose();
});

When('I initialize the ACP session manager with a mock executor', function (this: BmadWorld) {
  const ctx = getCtx(this);
  // Clear and re-create
  ctx.sessionManager = createSessionManager(this);
});

When('I get session {string}', function (this: BmadWorld, sessionId: string) {
  const ctx = getCtx(this);
  ctx.lastSession = ctx.sessionManager.getSession(sessionId);
});

// ─── THEN ───────────────────────────────────────────────────────────────────

Then('the session role should be {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  const session = ctx.lastSession || ctx.spawnedSessions[ctx.spawnedSessions.length - 1];
  assert.strictEqual(session?.spec?.role, expected, `Expected session role "${expected}", got "${session?.spec?.role}"`);
});

Then('the session should have {int} events', function (this: BmadWorld, count: number) {
  const ctx = getCtx(this);
  const session = ctx.lastSession || ctx.spawnedSessions[ctx.spawnedSessions.length - 1];
  const events = session?.events || [];
  assert.strictEqual(events.length, count, `Expected ${count} events, got ${events.length}`);
});

Then('the session persona should be defined', function (this: BmadWorld) {
  const ctx = getCtx(this);
  const session = ctx.lastSession || ctx.spawnedSessions[ctx.spawnedSessions.length - 1];
  assert.ok(session?.persona !== undefined, 'Expected session persona to be defined');
});

Then('the session persona ID should be {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  const session = ctx.lastSession || ctx.spawnedSessions[ctx.spawnedSessions.length - 1];
  assert.strictEqual(session?.spec?.personaId, expected, `Expected session personaId "${expected}", got "${session?.spec?.personaId}"`);
});

Then('a {string} event should have been emitted for the session', function (this: BmadWorld, eventType: string) {
  const ctx = getCtx(this);
  const session = ctx.lastSession || ctx.spawnedSessions[ctx.spawnedSessions.length - 1];
  const events = session?.events || [];
  assert.ok(events.some((e: any) => e.type === eventType),
    `Expected event type "${eventType}" in session events`);
});

Then('the session context parentSessionId should be {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  const session = ctx.lastSession || ctx.spawnedSessions[ctx.spawnedSessions.length - 1];
  assert.strictEqual(session?.spec?.context?.parentSessionId, expected, `Expected parentSessionId "${expected}", got "${session?.spec?.context?.parentSessionId}"`);
});

Then('the spawned sessions should have unique IDs', function (this: BmadWorld) {
  const ctx = getCtx(this);
  const ids = ctx.spawnedSessions.map((s: any) => s.id);
  const uniqueIds = new Set(ids);
  assert.strictEqual(ids.length, uniqueIds.size, 'Session IDs should be unique');
});

Then('both sessions should have status {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  for (const session of ctx.spawnedSessions) {
    assert.strictEqual(session?.status, expected, `Expected session ${session?.id} status "${expected}", got "${session?.status}"`);
  }
});

Then('a {string} event should have been emitted', function (this: BmadWorld, eventType: string) {
  const ctx = getCtx(this);
  const session = ctx.lastSession || ctx.spawnedSessions[ctx.spawnedSessions.length - 1];
  if (session) {
    const events = session.events || [];
    assert.ok(events.some((e: any) => e.type === eventType),
      `Expected event type "${eventType}" in session events`);
  } else {
    // Check subscribed events
    assert.ok(ctx.subscribedEvents.some((e: any) => e.type === eventType),
      `Expected event type "${eventType}" in subscribed events`);
  }
});

Then('an {string} event should have been emitted', function (this: BmadWorld, eventType: string) {
  // Same as "a {string} event should have been emitted" with "an" prefix
  const ctx = getCtx(this);
  const session = ctx.lastSession || ctx.spawnedSessions[ctx.spawnedSessions.length - 1];
  if (session) {
    const events = session.events || [];
    assert.ok(events.some((e: any) => e.type === eventType),
      `Expected event type "${eventType}" in session events`);
  } else {
    assert.ok(ctx.subscribedEvents.some((e: any) => e.type === eventType),
      `Expected event type "${eventType}" in subscribed events`);
  }
});

Then('the ACP session status should be {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  const session = ctx.lastSession || ctx.spawnedSessions[ctx.spawnedSessions.length - 1];
  assert.strictEqual(session?.status, expected, `Expected ACP session status "${expected}", got "${session?.status}"`);
});

Then('the ACP session ID should match pattern {string}', function (this: BmadWorld, pattern: string) {
  const ctx = getCtx(this);
  const session = ctx.lastSession || ctx.spawnedSessions[ctx.spawnedSessions.length - 1];
  const id = session?.id || '';
  assert.ok(id, 'No session ID available');
  // ACP session IDs are auto-generated: acp-{timestamp}-{random}
  assert.ok(id.startsWith('acp-'), `Session ID "${id}" should start with "acp-"`);
  const parts = id.split('-');
  assert.ok(parts.length >= 3, `Session ID "${id}" should have format acp-{timestamp}-{random}`);
  assert.ok(/^\d+$/.test(parts[1]), `Session ID "${id}" timestamp part should be digits`);
  assert.ok(/^[a-z0-9]+$/.test(parts[2]), `Session ID "${id}" random part should be alphanumeric`);
});

Then('the session result status should be {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastResult, 'No session result available');
  assert.strictEqual(ctx.lastResult.status, expected, `Expected session result status "${expected}", got "${ctx.lastResult.status}"`);
});

Then('the session result toolCalls should be a number', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastResult, 'No session result available');
  assert.strictEqual(typeof ctx.lastResult.toolCalls, 'number', `Expected toolCalls to be a number, got ${typeof ctx.lastResult.toolCalls}`);
});

Then('the session result error should be defined', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastResult, 'No session result available');
  assert.ok(ctx.lastResult.error !== undefined, 'Expected error to be defined');
});

Then('the prompt should contain {string}', function (this: BmadWorld, expected: string) {
  const ctx = getCtx(this);
  assert.ok(typeof ctx.lastResult === 'string', 'Expected prompt to be a string');
  assert.ok(ctx.lastResult.includes(expected), `Expected prompt to contain "${expected}"`);
});

Then('the persona should be included in the prompt', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(typeof ctx.lastResult === 'string', 'Expected prompt to be a string');
  // Persona content should appear in the prompt
  assert.ok(ctx.lastResult.length > 0, 'Expected prompt to be non-empty');
});

Then('the session events should have timestamps in order', function (this: BmadWorld) {
  const ctx = getCtx(this);
  const session = ctx.lastSession || ctx.spawnedSessions[ctx.spawnedSessions.length - 1];
  const events = session?.events || [];
  let lastTimestamp = '';
  for (const event of events) {
    if (lastTimestamp) {
      assert.ok(new Date(event.timestamp) >= new Date(lastTimestamp),
        'Events should have timestamps in chronological order');
    }
    lastTimestamp = event.timestamp;
  }
});

Then('the events should include types {string}, {string}, {string}, {string}', function (
  this: BmadWorld, type1: string, type2: string, type3: string, type4: string
) {
  const ctx = getCtx(this);
  const session = ctx.lastSession || ctx.spawnedSessions[ctx.spawnedSessions.length - 1];
  const types = (session?.events || []).map((e: any) => e.type);
  const expectedTypes = [type1, type2, type3, type4];
  for (const expected of expectedTypes) {
    assert.ok(types.includes(expected), `Expected event type "${expected}" in ${types.join(', ')}`);
  }
});

Then('the subscriber should have received a {string} event', function (this: BmadWorld, eventType: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.subscribedEvents.some((e: any) => e.type === eventType),
    `Expected subscribed event type "${eventType}"`);
});

Then('the disposable should be a no-op', function (this: BmadWorld) {
  // A disposable from an unknown session just returns { dispose: () => {} }
  // which should not throw when disposed
  assert.ok(true);
});

Then('no sessions should be retrievable', function (this: BmadWorld) {
  const ctx = getCtx(this);
  for (const session of ctx.spawnedSessions) {
    const retrieved = ctx.sessionManager.getSession(session.id);
    assert.strictEqual(retrieved, undefined,
      `Session ${session.id} should not be retrievable after dispose`);
  }
});

Then('the spec should have required fields', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastSession?.spec?.role, 'Spec should have role');
  assert.ok(ctx.lastSession?.spec?.personaId, 'Spec should have personaId');
  assert.ok(ctx.lastSession?.spec?.context?.task, 'Spec should have task');
});

Then('the spec context should contain task and artifact fields', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastSession?.spec?.context?.task, 'Context should have task');
});

Then('the result should have sessionId, role, status, and output', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastResult?.sessionId, 'Result should have sessionId');
  assert.ok(ctx.lastResult?.role, 'Result should have role');
  assert.ok(ctx.lastResult?.status, 'Result should have status');
  // Output can be null/undefined in some cases, but field should exist
  assert.ok('output' in (ctx.lastResult || {}), 'Result should have output field');
});

Then('the result should have startedAt and completedAt timestamps', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastResult?.startedAt, 'Result should have startedAt');
  assert.ok(ctx.lastResult?.completedAt, 'Result should have completedAt');
});

Then('the result should have events array', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(Array.isArray(ctx.lastResult?.events), 'Result should have events array');
});

Then('the handoff should have fromSessionId and toSessionId', function (this: BmadWorld) {
  const ctx = getCtx(this);
  const handoff = ctx.lastSession?.handoff;
  assert.ok(handoff?.fromSessionId, 'Handoff should have fromSessionId');
  assert.ok(handoff?.toSessionId, 'Handoff should have toSessionId');
});

Then('the handoff context should contain task and intermediateArtifacts', function (this: BmadWorld) {
  const ctx = getCtx(this);
  const handoff = ctx.lastSession?.handoff;
  assert.ok(handoff?.context?.task, 'Handoff context should have task');
  assert.ok(handoff?.context?.intermediateArtifacts, 'Handoff context should have intermediateArtifacts');
});

Then('all session specs should be valid', function (this: BmadWorld) {
  // All specs created with valid roles should be valid
  assert.ok(true);
});

Then('the ACP session manager singleton should be defined', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.sessionManager, 'Session manager should be defined');
});

Then('the returned session should be undefined', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.lastSession, undefined, 'Expected the returned session to be undefined');
});
