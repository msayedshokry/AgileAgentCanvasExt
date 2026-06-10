/**
 * A2A Outbound Client Step Definitions
 *
 * C4: covers all behavior of A2AOutboundClient — previously had zero
 * direct test coverage. Uses a fetch-injection shim so no real network
 * IO is performed; the test owns the mocked fetch response and the
 * client under test is wired to call it.
 */

import { Given, When, Then, Before, After } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

interface MockResponse {
  status: number;
  statusText?: string;
  body: string;
  contentLength?: number;
}

interface A2ATestContext {
  client: any;
  /** Cached responses keyed by call index. Each fetch() pops the next one. */
  responses: MockResponse[];
  /** If set, fetch() throws this error instead of returning a response. */
  rejectWith: string | null;
  /** Result of the most recent operation. */
  lastResult: any;
  /** Error of the most recent operation (or null). */
  lastError: Error | null;
  /** Captures all URLs the mocked fetch was called with (for assertions). */
  callUrls: string[];
}

const contexts = new WeakMap<BmadWorld, A2ATestContext>();

function getCtx(world: BmadWorld): A2ATestContext {
  let ctx = contexts.get(world);
  if (!ctx) {
    ctx = {
      client: null,
      responses: [],
      rejectWith: null,
      lastResult: null,
      lastError: null,
      callUrls: [],
    };
    contexts.set(world, ctx);
  }
  return ctx;
}

function buildFetchStub(ctx: A2ATestContext): (url: string, init?: any) => Promise<any> {
  return async (url: string, _init?: any) => {
    ctx.callUrls.push(url);
    if (ctx.rejectWith) {
      throw new Error(ctx.rejectWith);
    }
    const next = ctx.responses.shift();
    if (!next) {
      throw new Error('A2A test exhausted mocked responses; no response queued for this call');
    }
    const headers = new Map<string, string>();
    if (next.contentLength !== undefined) {
      headers.set('content-length', String(next.contentLength));
    }
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      statusText: next.statusText ?? '',
      headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
      json: async () => JSON.parse(next.body),
      text: async () => next.body,
    };
  };
}

function buildClient(world: BmadWorld, allowedHosts: string[]): any {
  const ctx = getCtx(world);
  const module = proxyquire('../../src/acp/agent-bus/a2a-outbound-client', {
    '../../utils/logger': {
      createLogger: () => ({
        info: () => {},
        error: () => {},
        debug: () => {},
        warn: () => {},
      }),
    },
  });
  return new module.A2AOutboundClient({
    allowedHosts,
    // Disable retries to keep tests deterministic.
    maxRetries: 1,
    retryDelay: 0,
    pollInterval: 100,
    maxWaitTime: 1000,
  });
}

// ─── GIVEN ──────────────────────────────────────────────────────────────────

Before(function (this: BmadWorld) {
  const ctx = getCtx(this);
  ctx.responses = [];
  ctx.rejectWith = null;
  ctx.lastResult = null;
  ctx.lastError = null;
  ctx.callUrls = [];
});

Given('a fresh A2A outbound client with allowed hosts:', function (this: BmadWorld, dataTable: any) {
  // The Gherkin table can be either:
  //   | host        |            (one column, multiple rows of hostnames)
  // or
  //   | host         |
  //   | my-agent.dev|            (one row, one value)
  // Normalize both forms into a flat list of host strings.
  const rawRows = dataTable.raw();
  const allowedHosts: string[] = [];
  for (const row of rawRows) {
    if (row.length === 1) {
      const v = row[0];
      if (v && v.trim().length > 0) allowedHosts.push(v);
    } else {
      // Multi-column form: assume the host column is named "host".
      // `rowsHash` requires all rows to have 2+ columns; here we
      // fall back to a manual scan instead.
      const rowObj = dataTable.rowsHash();
      for (const [k, v] of Object.entries(rowObj)) {
        if (k.toLowerCase() === 'host' && v && (v as string).trim().length > 0) {
          allowedHosts.push(v as string);
        }
      }
      break; // rowsHash already consumed the table
    }
  }
  const ctx = getCtx(this);
  ctx.client = buildClient(this, allowedHosts);
  (ctx.client as any).__testAllowedHosts = allowedHosts;
  (globalThis as any).fetch = buildFetchStub(ctx);
});

Given('a mock fetch that returns:', function (this: BmadWorld, dataTable: any) {
  const ctx = getCtx(this);
  // REPLACE the response queue with this single response. The Background
  // sets up a default; per-scenario overrides should win, not stack.
  const rawRows = dataTable.raw();
  if (rawRows.length === 0) return;
  const headers = rawRows[0].map((h: string) => h.trim());
  const row: MockResponse = {
    status: 200,
    body: '',
  };
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    const value = rawRows.length > 1 ? rawRows[1][i] : undefined;
    if (value === undefined) continue;
    if (key === 'status') row.status = Number(value);
    else if (key === 'statusText') row.statusText = value;
    else if (key === 'body') row.body = value;
    else if (key === 'contentLength') row.contentLength = Number(value);
  }
  ctx.responses = [row];
});

Given('a mock fetch that returns the same response {int} times:', function (this: BmadWorld, count: number, dataTable: any) {
  const ctx = getCtx(this);
  const rawRows = dataTable.raw();
  if (rawRows.length === 0) return;
  const headers = rawRows[0].map((h: string) => h.trim());
  const baseRow: MockResponse = {
    status: 200,
    body: '',
  };
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    const value = rawRows.length > 1 ? rawRows[1][i] : undefined;
    if (value === undefined) continue;
    if (key === 'status') baseRow.status = Number(value);
    else if (key === 'statusText') baseRow.statusText = value;
    else if (key === 'body') baseRow.body = value;
    else if (key === 'contentLength') baseRow.contentLength = Number(value);
  }
  ctx.responses = [];
  for (let i = 0; i < count; i++) {
    ctx.responses.push({ ...baseRow });
  }
});

Given('a mock fetch that rejects with {string}', function (this: BmadWorld, message: string) {
  getCtx(this).rejectWith = message;
});

Given('the client has poll interval {int}ms', function (this: BmadWorld, ms: number) {
  const ctx = getCtx(this);
  const allowed = (ctx.client as any).__testAllowedHosts ?? [];
  const module = proxyquire('../../src/acp/agent-bus/a2a-outbound-client', {
    '../../utils/logger': {
      createLogger: () => ({ info() {}, error() {}, debug() {}, warn() {} }),
    },
  });
  ctx.client = new module.A2AOutboundClient({
    allowedHosts: allowed,
    maxRetries: 1,
    retryDelay: 0,
    pollInterval: ms,
    maxWaitTime: 1000,
  });
  (ctx.client as any).__testAllowedHosts = allowed;
});

Given('the client has poll interval {int}ms and maxWaitTime {int}ms', function (this: BmadWorld, pollMs: number, maxMs: number) {
  const ctx = getCtx(this);
  const allowed = (ctx.client as any).__testAllowedHosts ?? [];
  const module = proxyquire('../../src/acp/agent-bus/a2a-outbound-client', {
    '../../utils/logger': {
      createLogger: () => ({ info() {}, error() {}, debug() {}, warn() {} }),
    },
  });
  ctx.client = new module.A2AOutboundClient({
    allowedHosts: allowed,
    maxRetries: 1,
    retryDelay: 0,
    pollInterval: pollMs,
    maxWaitTime: maxMs,
  });
  (ctx.client as any).__testAllowedHosts = allowed;
});

// ─── WHEN ───────────────────────────────────────────────────────────────────

When('I call fetchAgentCard with {string}', async function (this: BmadWorld, url: string) {
  const ctx = getCtx(this);
  try {
    ctx.lastResult = await ctx.client.fetchAgentCard(url);
    ctx.lastError = null;
  } catch (err) {
    ctx.lastError = err as Error;
    ctx.lastResult = null;
  }
});

When('I call sendMessage to {string} with text {string}', async function (this: BmadWorld, url: string, text: string) {
  const ctx = getCtx(this);
  try {
    ctx.lastResult = await ctx.client.sendMessage(url, text);
    ctx.lastError = null;
  } catch (err) {
    ctx.lastError = err as Error;
    ctx.lastResult = null;
  }
});

When('I call waitForCompletion on {string} for task {string}', async function (this: BmadWorld, url: string, taskId: string) {
  const ctx = getCtx(this);
  try {
    ctx.lastResult = await ctx.client.waitForCompletion(url, taskId);
    ctx.lastError = null;
  } catch (err) {
    ctx.lastError = err as Error;
    ctx.lastResult = null;
  }
});

When('I call sendMessageAndWait to {string} with text {string}', async function (this: BmadWorld, url: string, text: string) {
  const ctx = getCtx(this);
  try {
    ctx.lastResult = await ctx.client.sendMessageAndWait(url, text);
    ctx.lastError = null;
  } catch (err) {
    ctx.lastError = err as Error;
    ctx.lastResult = null;
  }
});

// ─── THEN ───────────────────────────────────────────────────────────────────

Then('the result should be a valid A2A agent card', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(
    ctx.lastResult,
    `Expected a result, got null. Error: ${ctx.lastError?.name ?? 'none'}: ${ctx.lastError?.message ?? 'n/a'}`
  );
  // Two of the test scenarios use name="a" and name="agent"; we accept
  // either since the Gherkin fixture body is small.
  assert.ok(
    ctx.lastResult.name === 'agent' || ctx.lastResult.name === 'a',
    `Expected name 'agent' or 'a', got ${ctx.lastResult.name}`
  );
  assert.ok(ctx.lastResult.url, 'Expected url to be set');
});

Then('the result should have id {string}', function (this: BmadWorld, id: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastResult, 'Expected a result, got null');
  assert.strictEqual(ctx.lastResult.id, id);
});

Then('the result should have state {string}', function (this: BmadWorld, state: string) {
  const ctx = getCtx(this);
  assert.ok(
    ctx.lastResult,
    `Expected a result, got null. Error was: ${ctx.lastError?.name ?? 'none'}: ${ctx.lastError?.message ?? 'n/a'}`
  );
  assert.strictEqual(ctx.lastResult.status?.state, state);
});

Then('the result should have {int} history message(s)', function (this: BmadWorld, n: number) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastResult, 'Expected a result, got null');
  assert.strictEqual(ctx.lastResult.history?.length ?? 0, n);
});

Then('the result should have {int} artifact(s)', function (this: BmadWorld, n: number) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastResult, 'Expected a result, got null');
  assert.strictEqual(ctx.lastResult.artifacts?.length ?? 0, n);
});

Then('an A2ANetworkError should be thrown', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastError, 'Expected an error to be thrown');
  assert.strictEqual(ctx.lastError.name, 'A2ANetworkError',
    `Expected A2ANetworkError, got ${ctx.lastError.name}: ${ctx.lastError.message}`);
});

Then('an A2ANetworkError should be thrown with {string}', function (this: BmadWorld, fragment: string) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastError, 'Expected an error to be thrown');
  assert.strictEqual(ctx.lastError.name, 'A2ANetworkError',
    `Expected A2ANetworkError, got ${ctx.lastError.name}: ${ctx.lastError.message}`);
  assert.ok(
    ctx.lastError.message.includes(fragment),
    `Expected error message to include "${fragment}", got: ${ctx.lastError.message}`
  );
});

Then('an A2AInvalidCardError should be thrown', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastError, 'Expected an error to be thrown');
  assert.strictEqual(ctx.lastError.name, 'A2AInvalidCardError',
    `Expected A2AInvalidCardError, got ${ctx.lastError.name}: ${ctx.lastError.message}`);
});

Then('an A2ATimeoutError should be thrown', function (this: BmadWorld) {
  const ctx = getCtx(this);
  assert.ok(ctx.lastError, 'Expected an error to be thrown');
  assert.strictEqual(ctx.lastError.name, 'A2ATimeoutError',
    `Expected A2ATimeoutError, got ${ctx.lastError.name}: ${ctx.lastError.message}`);
});

// Restore global fetch after each scenario
After(function () {
  try {
    delete (globalThis as any).fetch;
  } catch {
    // best-effort
  }
});
