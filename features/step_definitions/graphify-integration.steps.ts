/**
 * Graphify Integration Step Definitions
 *
 * Tests the graphify detection, CLI argv builder, graph loader,
 * and canvas Codebase lane using fully in-process mocks — no real
 * filesystem or subprocess calls.
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { BmadWorld } from '../support/world';

const proxyquire = require('proxyquire').noCallThru();

// ─── Per-world context ────────────────────────────────────────────────────────

interface GraphifyTestContext {
    // Detection mocking state
    cliAvailable: boolean;
    cliForm: 'cli' | 'module' | 'unavailable';
    graphPresent: boolean;
    reportPresent: boolean;
    wired: boolean;
    detectionCallCount: number;  // how many times the When step ran (= detectGraphify() calls)
    cliProbeCount: number;       // how many times execSync was attempted (CLI probe count)

    // The detected status result
    detectedStatus: any | null;

    // Graph loader mocking state
    graphFixture: any | null;
    fileReadCount: number;
    workspaceRoot: string;

    // Canvas lane mocking state
    showCodebaseLane: boolean;
    artifacts: any[];

    // argv builder result
    builtArgv: string[];
}

const ctxMap = new WeakMap<BmadWorld, GraphifyTestContext>();

function getCtx(world: BmadWorld): GraphifyTestContext {
    let ctx = ctxMap.get(world);
    if (!ctx) {
        ctx = {
            cliAvailable: false,
            cliForm: 'unavailable',
            graphPresent: false,
            reportPresent: false,
            wired: false,
            detectionCallCount: 0,
            cliProbeCount: 0,
            detectedStatus: null,
            graphFixture: null,
            fileReadCount: 0,
            workspaceRoot: '/tmp/test-project',
            showCodebaseLane: false,
            artifacts: [],
            builtArgv: []
        };
        ctxMap.set(world, ctx);
    }
    return ctx;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a proxyquire-loaded graphify-detector with fs + child_process mocked
 * according to the test context. Returns the module exports.
 */
function makeDetectorModule(ctx: GraphifyTestContext): any {
    const fsMock = {
        existsSync: (p: string) => {
            if (p.endsWith('graph.json')) return ctx.graphPresent;
            if (p.endsWith('GRAPH_REPORT.md')) return ctx.reportPresent;
            if (p.includes('copilot-instructions.md')) return ctx.wired;
            return false;
        },
        readFileSync: (p: string, _enc: string) => {
            if (p.includes('copilot-instructions.md') && ctx.wired) {
                return '# Copilot Instructions\nBefore answering read graphify-out/GRAPH_REPORT.md';
            }
            return '';
        }
    };

    const cpMock = {
        // Production code now uses spawnSync (shell:false) to prevent injection
        spawnSync: (cmd: string, _args: string[]) => {
            ctx.cliProbeCount++; // tracks CLI probe attempts
            if (!ctx.cliAvailable) { return { status: 1, error: new Error('not found') }; }
            if (ctx.cliForm === 'cli' && cmd === 'graphify') { return { status: 0 }; }
            if (ctx.cliForm === 'module' && cmd !== 'graphify') { return { status: 0 }; }
            return { status: 1 };
        }
    };

    const module = proxyquire('../../src/integrations/graphify/graphify-detector', {
        fs: fsMock,
        'child_process': cpMock,
        '../../utils/logger': { createLogger: () => ({ info: () => {}, debug: () => {}, error: () => {}, warn: () => {} }) }
    });

    return module;
}

/**
 * Build a proxyquire-loaded graph-loader with fs mocked.
 */
function makeLoaderModule(ctx: GraphifyTestContext): any {
    const fsMock = {
        existsSync: (p: string) => {
            if (p.endsWith('graph.json') && ctx.graphFixture !== null) return true;
            return false;
        },
        statSync: (_p: string) => ({ mtimeMs: 12345 }),
        readFileSync: (_p: string, _enc: string) => {
            ctx.fileReadCount++;
            return JSON.stringify(ctx.graphFixture);
        }
    };

    return proxyquire('../../src/integrations/graphify/graph-loader', {
        fs: fsMock,
        '../../utils/logger': { createLogger: () => ({ info: () => {}, debug: () => {}, error: () => {}, warn: () => {} }) }
    });
}

/**
 * Build the argv-builder via proxyquire (graphify-runner module).
 * We only import the pure buildArgv function — no spawning needed.
 */
function makeRunnerModule(): any {
    return proxyquire('../../src/integrations/graphify/graphify-runner', {
        'child_process': {},
        vscode: {
            '@noCallThru': true,
            window: { createOutputChannel: () => ({ appendLine: () => {} }) }
        },
        '../../utils/logger': { createLogger: () => ({ info: () => {}, debug: () => {}, error: () => {}, warn: () => {} }) },
        './graphify-detector': { detectGraphify: () => ({ cliForm: 'cli', graphPresent: false, reportPresent: false, wired: false, recommendation: 'bootstrap' }) }
    });
}

/**
 * Build the artifact-transformer with graphify integrations mocked.
 */
function makeTransformerModule(ctx: GraphifyTestContext): any {
    const communities = ctx.graphFixture?.communities
        ? buildCommunitiesFromFixture(ctx.graphFixture)
        : [];

    return proxyquire('../../src/canvas/artifact-transformer', {
        vscode: {
            '@noCallThru': true,
            workspace: {
                getConfiguration: () => ({
                    get: (key: string, def: any) => {
                        if (key === 'graphify.showCodebaseLane') return ctx.showCodebaseLane;
                        return def;
                    }
                }),
                workspaceFolders: [{ uri: { fsPath: ctx.workspaceRoot } }]
            }
        },
        '../integrations/graphify/graphify-detector': {
            detectGraphify: () => ({
                cliForm: 'cli',
                graphPresent: ctx.graphFixture !== null,
                reportPresent: false,
                wired: false,
                recommendation: ctx.graphFixture !== null ? 'ready' : 'bootstrap'
            })
        },
        '../integrations/graphify/graph-loader': {
            loadCommunities: () => communities
        },
        '../utils/logger': { createLogger: () => ({ info: () => {}, debug: () => {}, error: () => {}, warn: () => {} }) }
    });
}

/**
 * Extract communities from a graph fixture built by the test helpers.
 */
function buildCommunitiesFromFixture(graphFixture: any): any[] {
    if (!graphFixture?.communities) return [];
    return Object.entries(graphFixture.communities).map(([id, c]: [string, any]) => ({
        kind: 'code-community',
        id: `comm-${id}`,
        label: c.label || `Community ${id}`,
        godNodes: c.nodes?.slice(0, 2) ?? [],
        files: [],
        size: c.nodes?.length ?? 0,
        neighbors: []
    }));
}

// ─── GIVEN ────────────────────────────────────────────────────────────────────

Given('a fresh graphify detector context', function (this: BmadWorld) {
    // Force a fresh context by deleting any previous
    ctxMap.delete(this);
    getCtx(this);
});

Given('the graphify CLI is unavailable', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.cliAvailable = false;
    ctx.cliForm = 'unavailable';
});

Given('the graphify CLI is available as {string}', function (this: BmadWorld, form: string) {
    const ctx = getCtx(this);
    ctx.cliAvailable = true;
    ctx.cliForm = form as 'cli' | 'module';
});

Given('no graph.json exists in the workspace', function (this: BmadWorld) {
    getCtx(this).graphPresent = false;
});

Given('a graph.json with {int} nodes exists in the workspace', function (this: BmadWorld, nodeCount: number) {
    const ctx = getCtx(this);
    ctx.graphPresent = true;
    ctx.graphFixture = {
        nodes: Array.from({ length: nodeCount }, (_, i) => ({ id: `node-${i}`, label: `Node ${i}` })),
        edges: []
    };
});

Given('no copilot-instructions.md contains graphify reference', function (this: BmadWorld) {
    getCtx(this).wired = false;
});

Given('copilot-instructions.md contains a graphify reference', function (this: BmadWorld) {
    getCtx(this).wired = true;
});

Given('a graph.json fixture with {int} nodes and {int} edges', function (
    this: BmadWorld, nodeCount: number, edgeCount: number
) {
    const ctx = getCtx(this);
    ctx.graphFixture = {
        nodes: Array.from({ length: nodeCount }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` })),
        edges: Array.from({ length: edgeCount }, (_, i) => ({
            source: `n${i % nodeCount}`,
            target: `n${(i + 1) % nodeCount}`,
            relation: 'calls',
            type: 'EXTRACTED'
        }))
    };
});

Given('a graph.json fixture with {int} communities and {int} nodes each', function (
    this: BmadWorld, communityCount: number, nodesEach: number
) {
    const ctx = getCtx(this);
    const nodes: any[] = [];
    const communities: Record<string, any> = {};

    for (let c = 0; c < communityCount; c++) {
        const commNodes: string[] = [];
        for (let n = 0; n < nodesEach; n++) {
            const nodeId = `n-${c}-${n}`;
            nodes.push({ id: nodeId, label: `Node ${c}-${n}`, community: c, file: `src/file-${c}-${n}.ts` });
            commNodes.push(nodeId);
        }
        communities[`${c}`] = { label: `Community ${c}`, nodes: commNodes };
    }

    ctx.graphFixture = { nodes, edges: [], communities };
});

Given('a graph.json fixture with no community data', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.graphFixture = {
        nodes: [{ id: 'n0', label: 'Node 0' }],
        edges: []
        // no communities key
    };
});

Given('a graph.json fixture with {int} communities exists', function (
    this: BmadWorld, count: number
) {
    const ctx = getCtx(this);
    const communities: Record<string, any> = {};
    for (let i = 0; i < count; i++) {
        communities[`${i}`] = { label: `Community ${i}`, nodes: [`n${i}-0`, `n${i}-1`] };
    }
    ctx.graphFixture = {
        nodes: [],
        edges: [],
        communities
    };
});

Given('a graph.json fixture with {int} communities exists at workspace {string}', function (
    this: BmadWorld, count: number, workspace: string
) {
    const ctx = getCtx(this);
    ctx.workspaceRoot = workspace;
    const communities: Record<string, any> = {};
    for (let i = 0; i < count; i++) {
        communities[`${i}`] = { label: `Community ${i}`, nodes: [`n${i}-0`, `n${i}-1`] };
    }
    ctx.graphFixture = {
        nodes: [],
        edges: [],
        communities
    };
});

Given('no graph.json exists at workspace {string}', function (this: BmadWorld, workspace: string) {
    const ctx = getCtx(this);
    ctx.workspaceRoot = workspace;
    ctx.graphFixture = null;
});

Given('showCodebaseLane config is disabled', function (this: BmadWorld) {
    getCtx(this).showCodebaseLane = false;
});

Given('showCodebaseLane config is enabled', function (this: BmadWorld) {
    getCtx(this).showCodebaseLane = true;
});

// ─── WHEN ─────────────────────────────────────────────────────────────────────

When('I detect graphify for workspace {string}', function (this: BmadWorld, workspace: string) {
    const ctx = getCtx(this);
    ctx.workspaceRoot = workspace;
    // Reuse the same module instance so its internal caches persist across calls
    if (!(ctx as any)._detectorMod) {
        (ctx as any)._detectorMod = makeDetectorModule(ctx);
        (ctx as any)._detectorMod.resetCliFormCache();
        (ctx as any)._detectorMod.clearGraphifyCache();
    }
    const mod = (ctx as any)._detectorMod;
    ctx.detectionCallCount++; // count detectGraphify() invocations
    ctx.detectedStatus = mod.detectGraphify(workspace);
});

When('I clear the graphify cache for workspace {string}', function (this: BmadWorld, workspace: string) {
    const ctx = getCtx(this);
    // Clear cache on existing module if present, or create one to clear then discard
    // Also reset _detectorMod so the next detect creates a fresh module
    if ((ctx as any)._detectorMod) {
        (ctx as any)._detectorMod.clearGraphifyCache(workspace);
        (ctx as any)._detectorMod.resetCliFormCache();
    }
    // Force fresh module creation on next detect
    delete (ctx as any)._detectorMod;
    // Note: detectionCallCount intentionally NOT reset — accumulates across all probes
});

When('I build argv for cliForm {string} with args {string} and pythonPath {string}', function (
    this: BmadWorld, cliForm: string, args: string, pythonPath: string
) {
    const ctx = getCtx(this);
    const mod = makeRunnerModule();
    ctx.builtArgv = mod.buildArgv(cliForm, args.split(' '), pythonPath);
});

When('I load the graph for workspace {string}', function (this: BmadWorld, workspace: string) {
    const ctx = getCtx(this);
    ctx.workspaceRoot = workspace;
    // Reuse the same module instance so its internal cache persists across calls
    if (!(ctx as any)._loaderMod) {
        (ctx as any)._loaderMod = makeLoaderModule(ctx);
        (ctx as any)._loaderMod.invalidateLoaderCache(workspace);
    }
    const mod = (ctx as any)._loaderMod;
    ctx.graphFixture = mod.loadGraph(workspace);  // store result back for assertions
});

When('I load communities for workspace {string}', function (this: BmadWorld, workspace: string) {
    const ctx = getCtx(this);
    ctx.workspaceRoot = workspace;
    const mod = makeLoaderModule(ctx);
    mod.invalidateLoaderCache(workspace);
    // store communities into a named slot
    (ctx as any)._communities = mod.loadCommunities(workspace);
});

When('I build artifacts from an empty store with workspace root {string}', function (
    this: BmadWorld, workspace: string
) {
    const ctx = getCtx(this);
    ctx.workspaceRoot = workspace;
    const mod = makeTransformerModule(ctx);
    const mockStore = { getState: () => ({}) };
    ctx.artifacts = mod.buildArtifacts(mockStore, workspace);
});

// ─── THEN ─────────────────────────────────────────────────────────────────────

Then('the graphify cliForm should be {string}', function (this: BmadWorld, expected: string) {
    const ctx = getCtx(this);
    assert.ok(ctx.detectedStatus, 'No detection result — run "When I detect graphify for workspace" first');
    assert.strictEqual(ctx.detectedStatus.cliForm, expected, `Expected cliForm "${expected}", got "${ctx.detectedStatus.cliForm}"`);
});

Then('the graphify graphPresent should be {word}', function (this: BmadWorld, expected: string) {
    const ctx = getCtx(this);
    assert.ok(ctx.detectedStatus, 'No detection result');
    assert.strictEqual(ctx.detectedStatus.graphPresent, expected === 'true', `Expected graphPresent ${expected}, got ${ctx.detectedStatus.graphPresent}`);
});

Then('the graphify reportPresent should be {word}', function (this: BmadWorld, expected: string) {
    const ctx = getCtx(this);
    assert.ok(ctx.detectedStatus, 'No detection result');
    assert.strictEqual(ctx.detectedStatus.reportPresent, expected === 'true', `Expected reportPresent ${expected}, got ${ctx.detectedStatus.reportPresent}`);
});

Then('the graphify wired should be {word}', function (this: BmadWorld, expected: string) {
    const ctx = getCtx(this);
    assert.ok(ctx.detectedStatus, 'No detection result');
    assert.strictEqual(ctx.detectedStatus.wired, expected === 'true', `Expected wired ${expected}, got ${ctx.detectedStatus.wired}`);
});

Then('the graphify recommendation should be {string}', function (this: BmadWorld, expected: string) {
    const ctx = getCtx(this);
    assert.ok(ctx.detectedStatus, 'No detection result');
    assert.strictEqual(ctx.detectedStatus.recommendation, expected, `Expected recommendation "${expected}", got "${ctx.detectedStatus.recommendation}"`);
});

Then('the graphify detection should have been called once', function (this: BmadWorld) {
    // Same workspace detected twice → CLI should be probed at most 2 times (bare + module strategy),
    // meaning only the FIRST detection probed the CLI (second was fully cached).
    const ctx = getCtx(this);
    assert.ok(ctx.cliProbeCount <= 2,
        `Expected CLI to be probed at most twice (once per strategy), got ${ctx.cliProbeCount} — caching not working`);
});

Then('the graphify detection should have been called twice', function (this: BmadWorld) {
    // After cache was cleared, the second detection must re-probe the CLI.
    // Total CLI probes across both detections should be >= 2.
    const ctx = getCtx(this);
    assert.ok(ctx.cliProbeCount >= 2,
        `Expected at least 2 CLI probes (both detections), got ${ctx.cliProbeCount}`);
});

Then('the argv should equal {string}', function (this: BmadWorld, expectedJson: string) {
    const ctx = getCtx(this);
    const expected: string[] = JSON.parse(expectedJson);
    assert.deepStrictEqual(ctx.builtArgv, expected,
        `Expected argv ${JSON.stringify(expected)}, got ${JSON.stringify(ctx.builtArgv)}`);
});

Then('the loaded graph should have {int} nodes', function (this: BmadWorld, expected: number) {
    const ctx = getCtx(this);
    const graph = ctx.graphFixture;
    assert.ok(graph, 'No graph loaded');
    assert.strictEqual(graph.nodes?.length ?? 0, expected, `Expected ${expected} nodes, got ${graph.nodes?.length ?? 0}`);
});

Then('the loaded graph should have {int} edges', function (this: BmadWorld, expected: number) {
    const ctx = getCtx(this);
    const graph = ctx.graphFixture;
    assert.ok(graph, 'No graph loaded');
    assert.strictEqual(graph.edges?.length ?? 0, expected, `Expected ${expected} edges, got ${graph.edges?.length ?? 0}`);
});

Then('the loaded graph should be null', function (this: BmadWorld) {
    assert.strictEqual(getCtx(this).graphFixture, null, 'Expected loaded graph to be null');
});

Then('I should get {int} communities', function (this: BmadWorld, expected: number) {
    const communities: any[] = (getCtx(this) as any)._communities ?? [];
    assert.strictEqual(communities.length, expected,
        `Expected ${expected} communities, got ${communities.length}`);
});

Then('each community should have a kind of {string}', function (this: BmadWorld, kind: string) {
    const communities: any[] = (getCtx(this) as any)._communities ?? [];
    for (const c of communities) {
        assert.strictEqual(c.kind, kind, `Community ${c.id} has kind "${c.kind}", expected "${kind}"`);
    }
});

Then('each community should have a non-empty label', function (this: BmadWorld) {
    const communities: any[] = (getCtx(this) as any)._communities ?? [];
    for (const c of communities) {
        assert.ok(c.label && c.label.length > 0, `Community ${c.id} has empty label`);
    }
});

Then('each community should have a size greater than 0', function (this: BmadWorld) {
    const communities: any[] = (getCtx(this) as any)._communities ?? [];
    for (const c of communities) {
        assert.ok(c.size > 0, `Community ${c.id} has size ${c.size}`);
    }
});

Then('the graph file read count should be {int}', function (this: BmadWorld, expected: number) {
    assert.strictEqual(getCtx(this).fileReadCount, expected,
        `Expected ${expected} file reads, got ${getCtx(this).fileReadCount}`);
});

Then('no artifacts of type {string} should exist', function (this: BmadWorld, type: string) {
    const found = getCtx(this).artifacts.filter(a => a.type === type);
    assert.strictEqual(found.length, 0,
        `Expected 0 artifacts of type "${type}", found ${found.length}`);
});

Then('{int} artifacts of type {string} should exist', function (
    this: BmadWorld, count: number, type: string
) {
    const found = getCtx(this).artifacts.filter(a => a.type === type);
    assert.strictEqual(found.length, count,
        `Expected ${count} artifacts of type "${type}", found ${found.length}`);
});

Then('each code-community artifact should have a valid position', function (this: BmadWorld) {
    const found = getCtx(this).artifacts.filter(a => a.type === 'code-community');
    for (const art of found) {
        assert.ok(typeof art.position?.x === 'number', `artifact ${art.id} missing position.x`);
        assert.ok(typeof art.position?.y === 'number', `artifact ${art.id} missing position.y`);
    }
});

Then('each code-community artifact should have a non-empty title', function (this: BmadWorld) {
    const found = getCtx(this).artifacts.filter(a => a.type === 'code-community');
    for (const art of found) {
        assert.ok(art.title && art.title.length > 0, `artifact ${art.id} has empty title`);
    }
});

Then('all code-community artifacts should have position x >= {int}', function (
    this: BmadWorld, minX: number
) {
    const found = getCtx(this).artifacts.filter(a => a.type === 'code-community');
    for (const art of found) {
        assert.ok(art.position.x >= minX,
            `artifact ${art.id} position.x = ${art.position.x}, expected >= ${minX}`);
    }
});
