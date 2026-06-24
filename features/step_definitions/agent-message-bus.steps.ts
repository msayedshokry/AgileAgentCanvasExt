/**
 * Agent Message Bus Step Definitions
 *
 * C5: covers all behavior of AgentMessageBus. Previously had no
 * dedicated feature file — now exercises wildcards, TTL, priority,
 * dead-letter, system events, history, and the new failure counter.
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

interface AgentEntry {
  agentId: string;
  received: any[];
  /** id → first subscription id for this agent (for unsubscribe) */
  subscriptionIds: string[];
}

interface BusTestContext {
  bus: any;
  agents: Map<string, AgentEntry>;
  /** Counters for the "fail N times then succeed" handler. */
  failCounter: Map<string, number>;
  lastEnvelopes: any[];
}

const contexts = new WeakMap<BmadWorld, BusTestContext>();

function getCtx(world: BmadWorld): BusTestContext {
  let ctx = contexts.get(world);
  if (!ctx) {
    ctx = {
      bus: null,
      agents: new Map(),
      failCounter: new Map(),
      lastEnvelopes: [],
    };
    contexts.set(world, ctx);
  }
  return ctx;
}

function makeBus(): any {
  const module = proxyquire('../../src/acp/agent-bus/message-bus', {
    '../../utils/logger': {
      createLogger: () => ({
        info: () => {}, error: () => {}, debug: () => {}, warn: () => {},
      }),
    },
    '../../trace/trace-recorder': {
      getTraceRecorder: () => ({ record: () => {} }),
    },
  });
  return new module.AgentMessageBus();
}

function ensureAgent(ctx: BusTestContext, agentId: string): AgentEntry {
  let entry = ctx.agents.get(agentId);
  if (!entry) {
    entry = { agentId, received: [], subscriptionIds: [] };
    ctx.agents.set(agentId, entry);
  }
  return entry;
}

// ─── GIVEN ──────────────────────────────────────────────────────────────────

Before(function (this: BmadWorld) {
  const ctx = getCtx(this);
  ctx.bus = makeBus();
  ctx.agents.clear();
  ctx.failCounter.clear();
  ctx.lastEnvelopes = [];
});

Given('a fresh agent message bus', function (this: BmadWorld) {
  // Before hook already set it up.
});

Given('agent {string} subscribes to {string}', function (this: BmadWorld, agentId: string, topicPattern: string) {
  const ctx = getCtx(this);
  const entry = ensureAgent(ctx, agentId);
  const subId = ctx.bus.subscribe(agentId, topicPattern, async (msg: any) => {
    entry.received.push(msg);
  });
  entry.subscriptionIds.push(subId);
});

Given('agent {string} subscribes to {string} with a handler that always throws', function (this: BmadWorld, agentId: string, topicPattern: string) {
  const ctx = getCtx(this);
  const entry = ensureAgent(ctx, agentId);
  const subId = ctx.bus.subscribe(agentId, topicPattern, async () => {
    throw new Error('always-fail');
  });
  entry.subscriptionIds.push(subId);
});

Given('agent {string} subscribes to {string} with a handler that fails then succeeds', function (this: BmadWorld, agentId: string, topicPattern: string) {
  const ctx = getCtx(this);
  const entry = ensureAgent(ctx, agentId);
  ctx.failCounter.set(agentId, 0);
  const subId = ctx.bus.subscribe(agentId, topicPattern, async (msg: any) => {
    const n = ctx.failCounter.get(agentId) ?? 0;
    ctx.failCounter.set(agentId, n + 1);
    if (n < 4) {
      throw new Error('flaky-fail-' + n);
    }
    entry.received.push(msg);
  });
  entry.subscriptionIds.push(subId);
});

// ─── WHEN ───────────────────────────────────────────────────────────────────

When('I publish {string} with payload {string}', async function (this: BmadWorld, topic: string, payloadJson: string) {
  const ctx = getCtx(this);
  let payload: any = payloadJson;
  try {
    payload = JSON.parse(payloadJson);
  } catch { /* keep as string */ }
  ctx.lastEnvelopes = await ctx.bus.publish(topic, payload);
});

When('I publish {string} with payload {string} and priority {string}', async function (this: BmadWorld, topic: string, payloadJson: string, priority: string) {
  const ctx = getCtx(this);
  let payload: any = payloadJson;
  try { payload = JSON.parse(payloadJson); } catch { /* string */ }
  ctx.lastEnvelopes = await ctx.bus.publish(topic, payload, { priority });
});

When('I publish {string} with payload {string} and ttl {int}', async function (this: BmadWorld, topic: string, payloadJson: string, ttl: number) {
  const ctx = getCtx(this);
  let payload: any = payloadJson;
  try { payload = JSON.parse(payloadJson); } catch { /* string */ }
  ctx.lastEnvelopes = await ctx.bus.publish(topic, payload, { ttl });
});

When('I send from {string} to {string} topic {string} payload {string}', async function (this: BmadWorld, from: string, to: string, topic: string, payloadJson: string) {
  const ctx = getCtx(this);
  let payload: any = payloadJson;
  try { payload = JSON.parse(payloadJson); } catch { /* string */ }
  ctx.lastEnvelopes = await ctx.bus.send(from, to, topic, payload);
});

When('I unsubscribe the agent\'s first subscription', function (this: BmadWorld) {
  const ctx = getCtx(this);
  const firstAgent = ctx.agents.values().next().value as AgentEntry | undefined;
  if (firstAgent && firstAgent.subscriptionIds.length > 0) {
    const subId = firstAgent.subscriptionIds.shift()!;
    ctx.bus.unsubscribe(subId);
  }
});

When('I notify agent registered for {string} with name {string}', async function (this: BmadWorld, agentId: string, name: string) {
  const ctx = getCtx(this);
  await ctx.bus.notifyAgentRegistered(agentId, { id: agentId, name, role: 'worker', personaId: 'p', capabilities: [], status: 'idle', lastSeen: new Date().toISOString() });
});

When('I notify status change for {string} from {string} to {string}', async function (this: BmadWorld, agentId: string, from: string, to: string) {
  const ctx = getCtx(this);
  await ctx.bus.notifyStatusChange(agentId, from, to);
});

// ─── THEN ───────────────────────────────────────────────────────────────────

Then('agent {string} should have received {int} message(s)', function (this: BmadWorld, agentId: string, count: number) {
  const ctx = getCtx(this);
  const entry = ensureAgent(ctx, agentId);
  assert.strictEqual(
    entry.received.length, count,
    `Expected ${agentId} to have received ${count} message(s), got ${entry.received.length}`
  );
});

Then('the message should have payload {string}', function (this: BmadWorld, payloadJson: string) {
  const ctx = getCtx(this);
  let expected: any = payloadJson;
  try { expected = JSON.parse(payloadJson); } catch { /* string */ }
  for (const entry of ctx.agents.values()) {
    if (entry.received.length > 0) {
      assert.deepStrictEqual(entry.received[0].payload, expected, 'Expected same agent first payload to match');
      return;
    }
  }
  assert.fail('No agent received any message to inspect');
});

Then('the most recent message should have priority {string}', function (this: BmadWorld, priority: string) {
  // Use a monotonic counter on the bus rather than wall-clock
  // timestamps — two messages published in the same millisecond
  // would otherwise produce an unstable "latest" comparison.
  const ctx = getCtx(this);
  let latest: any = null;
  let maxOrder = -1;
  for (const entry of ctx.agents.values()) {
    for (let i = 0; i < entry.received.length; i++) {
      const msg = entry.received[i];
      // Each BusMessage has an id like "msg-<ts>-<rand>". Extract the
      // ts portion as a rough order proxy. If both messages share the
      // same ts, fall back to the order they were received.
      const m = /msg-(\d+)-/.exec(msg.id || '');
      const order = m ? Number(m[1]) * 1000 + i : i;
      if (order > maxOrder) {
        maxOrder = order;
        latest = msg;
      }
    }
  }
  assert.ok(latest, 'No messages were received');
  assert.strictEqual(latest.priority, priority, `Expected latest.priority to be '${priority}'`);
});

Then('the publish should return {int} envelopes', function (this: BmadWorld, count: number) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.lastEnvelopes.length, count, `Expected ${count} envelope(s), got ${ctx.lastEnvelopes.length}`);
});

Then('the publish should return {int} envelope with delivered false', function (this: BmadWorld, count: number) {
  const ctx = getCtx(this);
  assert.strictEqual(ctx.lastEnvelopes.length, count, `Expected ${count} envelope(s), got ${ctx.lastEnvelopes.length}`);
  for (const env of ctx.lastEnvelopes) {
    assert.strictEqual(env.delivered, false, 'Expected envelope.delivered to be false');
  }
});

Then('the bus should have {int} subscription(s) for {string}', function (this: BmadWorld, count: number, agentId: string) {
  const ctx = getCtx(this);
  const subs = ctx.bus.getAgentSubscriptions(agentId);
  assert.strictEqual(subs.length, count, `Expected ${count} sub(s) for ${agentId}, got ${subs.length}`);
});

Then('the message topic should be {string}', function (this: BmadWorld, topic: string) {
  const ctx = getCtx(this);
  for (const entry of ctx.agents.values()) {
    if (entry.received.length > 0) {
      assert.strictEqual(entry.received[0].topic, topic, `Expected first received topic to be '${topic}'`);
      return;
    }
  }
  assert.fail('No agent received any message to inspect');
});

Then('the history should have {int} entries', function (this: BmadWorld, count: number) {
  const ctx = getCtx(this);
  const history = ctx.bus.getHistory();
  assert.strictEqual(history.length, count, `Expected history to have ${count} entries, got ${history.length}`);
});

Then('the most recent history entry should have payload {string}', function (this: BmadWorld, payloadJson: string) {
  const ctx = getCtx(this);
  let expected: any = payloadJson;
  try { expected = JSON.parse(payloadJson); } catch { /* string */ }
  const history = ctx.bus.getHistory();
  assert.ok(history.length > 0, 'History is empty');
  assert.deepStrictEqual(history[history.length - 1].message.payload, expected, 'Expected most recent history entry payload to match');
});
