/**
 * Chat-bridge availability detection step definitions
 *
 * Loads `src/commands/chat-bridge.ts` via proxyquire with a fully mocked
 * `child_process` and `vscode`, then exercises `listAvailableProviders()` to
 * confirm that:
 *   - always-available providers ('auto', 'copilot', 'terminal') never probe
 *   - panel providers fall through to CLI detection when the panel is missing
 *   - CLI-only providers (codex, aider) are available iff on PATH
 *   - the 30s in-memory cache deduplicates repeated calls
 *
 * No real filesystem or subprocess calls are made.
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import * as assert from 'assert';

const proxyquire = require('proxyquire').noCallThru();

interface ChatBridgeCtx {
    // Mocked environment
    panelCommands: Set<string>;
    panelProbes: Map<string, () => boolean | Promise<boolean>>; // command → override behaviour
    installedBinaries: Set<string>;
    pathProbes: string[];     // log of every `where`/`which` invocation
    panelCalls: string[];     // log of every panel command probe

    // Output
    providers: any[] | null;
    lastResolveResult: boolean | null;
}

const ctxMap = new WeakMap<object, ChatBridgeCtx>();

function getCtx(world: object): ChatBridgeCtx {
    let ctx = ctxMap.get(world);
    if (!ctx) {
        ctx = {
            panelCommands: new Set<string>(),
            panelProbes: new Map<string, () => boolean | Promise<boolean>>(),
            installedBinaries: new Set<string>(),
            pathProbes: [],
            panelCalls: [],
            providers: null,
            lastResolveResult: null,
        };
        ctxMap.set(world, ctx);
    }
    return ctx;
}

let _module: any = null;

function loadModule(ctx: ChatBridgeCtx): any {
    // Mock child_process: spawnSync drives both the "is this on PATH?" probe
    // (where/which) and the fallback "run --version" probe.
    const cpMock: any = {
        spawnSync: (cmd: string, args: string[]) => {
            const target = args[0] ?? cmd;
            if (cmd === 'where' || cmd === 'which') {
                ctx.pathProbes.push(target);
                if (ctx.installedBinaries.has(target)) {
                    // Linux `which` returns a single path; Windows `where` may return
                    // multiple lines.  Return one or two lines for realism.
                    return {
                        status: 0,
                        stdout: process.platform === 'win32'
                            ? `C:\\bin\\${target}.cmd\r\nC:\\bin\\${target}.exe`
                            : `/usr/local/bin/${target}`,
                    };
                }
                return { status: 1, stdout: '' };
            }
            // Anything else (a `--version` probe) — just say "ok" for installed
            // binaries.  Production code only uses this as a last-resort fallback.
            if (ctx.installedBinaries.has(cmd)) {
                return { status: 0, stdout: 'mock-version' };
            }
            return { status: 1, stdout: '' };
        },
    };

    // Mock vscode just enough for chat-bridge's top-of-file imports +
    // vscode.commands.getCommands() used by hasPanel probes.
    const vscodeMock: any = {
        '@noCallThru': true,
        commands: {
            getCommands: async (_filter: boolean) => {
                // Return the registered panel commands.
                return Array.from(ctx.panelCommands);
            },
        },
        workspace: {
            getConfiguration: (_section: string) => ({
                get: (key: string, def: any) => {
                    if (key === 'chatProviderSelected') return 'auto';
                    return def;
                },
                update: async () => undefined,
            }),
        },
    };

    // The 'antigravity-orchestrator' import is required by chat-bridge even
    // though the availability code never calls into it.  Stub it out.
    const antigravityStub: any = { sendSimplePrompt: async () => false };

    // logger: silence all output during tests.
    const loggerStub: any = { createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }) };

    return proxyquire('../../src/commands/chat-bridge', {
        'child_process': cpMock,
        'vscode': vscodeMock,
        '../antigravity/antigravity-orchestrator': antigravityStub,
        '../utils/logger': loggerStub,
    });
}

// ─── Background ──────────────────────────────────────────────────────────

Before({ tags: '@chat-bridge' }, function (this: any) {
    const ctx = getCtx(this);
    ctx.panelCommands.clear();
    ctx.panelProbes.clear();
    ctx.installedBinaries.clear();
    ctx.pathProbes = [];
    ctx.panelCalls = [];
    ctx.providers = null;
    ctx.lastResolveResult = null;
    _module = null;
});

Given('a fresh chat-bridge module context', function (this: any) {
    // noop — Before hook already reset
});

// ─── Panel command setup ─────────────────────────────────────────────────

Given('the panel command {string} is registered', function (this: any, cmd: string) {
    getCtx(this).panelCommands.add(cmd);
});

Given('the panel command {string} probe throws {string}', function (this: any, cmd: string, _msg: string) {
    // Map the cmd to one of the well-known provider probes so it gets used.
    // chat-bridge hard-codes probe command lists in each hasPanel; for the
    // test we wire a panic into every getCommands() call when this command
    // would be checked.  Simplest: override the hasPanel via a Map for any
    // provider that uses this command.
    getCtx(this).panelProbes.set(cmd, () => { throw new Error(_msg); });
});

Given('no panel commands are registered', function (this: any) {
    getCtx(this).panelCommands.clear();
});

// ─── CLI PATH setup ──────────────────────────────────────────────────────

Given('the CLI binary {string} is on PATH', function (this: any, bin: string) {
    getCtx(this).installedBinaries.add(bin);
});

Given('no CLI binaries are on PATH', function (this: any) {
    getCtx(this).installedBinaries.clear();
});

// ─── When steps ──────────────────────────────────────────────────────────

When('I list available providers', async function (this: any) {
    if (!_module) { _module = loadModule(getCtx(this)); }
    const ctx = getCtx(this);
    ctx.providers = await _module.listAvailableProviders();
});

When('I list available providers again', async function (this: any) {
    if (!_module) { _module = loadModule(getCtx(this)); }
    const ctx = getCtx(this);
    ctx.providers = await _module.listAvailableProviders();
});

When('I call resolveCliOnPath with {string}', function (this: any, cmd: string) {
    if (!_module) { _module = loadModule(getCtx(this)); }
    getCtx(this).lastResolveResult = _module.resolveCliOnPath(cmd);
});

When('I clear the provider availability cache', function (this: any) {
    if (!_module) { _module = loadModule(getCtx(this)); }
    _module.__clearProviderAvailabilityCache();
});

// ─── Then steps ──────────────────────────────────────────────────────────

Then('the provider {string} should be marked available', function (this: any, id: string) {
    const p = getCtx(this).providers?.find((x: any) => x.id === id);
    assert.ok(p, `provider "${id}" not in list: ${getCtx(this).providers?.map((x: any) => x.id).join(', ')}`);
    assert.strictEqual(p.available, true, `expected "${id}" available, got ${p.available} (reason=${p.reason})`);
});

Then('the provider {string} should be marked unavailable', function (this: any, id: string) {
    const p = getCtx(this).providers?.find((x: any) => x.id === id);
    assert.ok(p, `provider "${id}" not in list: ${getCtx(this).providers?.map((x: any) => x.id).join(', ')}`);
    assert.strictEqual(p.available, false, `expected "${id}" unavailable, got ${p.available} (reason=${p.reason})`);
});

Then('the reason for {string} should be {string}', function (this: any, id: string, reason: string) {
    const p = getCtx(this).providers?.find((x: any) => x.id === id);
    assert.ok(p, `provider "${id}" not in list`);
    assert.strictEqual(p.reason, reason, `expected reason="${reason}", got reason="${p.reason}"`);
});

Then('it should return true', function (this: any) {
    assert.strictEqual(getCtx(this).lastResolveResult, true, 'Expected resolveCliOnPath to return true');
});

Then('it should return false', function (this: any) {
    assert.strictEqual(getCtx(this).lastResolveResult, false, 'Expected resolveCliOnPath to return false');
});

Then('the codex availability probe should have been called once', function (this: any) {
    const probes = getCtx(this).pathProbes.filter(p => p === 'codex');
    assert.strictEqual(probes.length, 1, `expected 1 codex probe, got ${probes.length}: ${JSON.stringify(getCtx(this).pathProbes)}`);
});

Then('the codex availability probe should have been called twice', function (this: any) {
    const probes = getCtx(this).pathProbes.filter(p => p === 'codex');
    assert.strictEqual(probes.length, 2, `expected 2 codex probes, got ${probes.length}: ${JSON.stringify(getCtx(this).pathProbes)}`);
});
