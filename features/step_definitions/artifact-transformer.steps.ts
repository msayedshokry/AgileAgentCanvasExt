/**
 * Artifact Transformer Step Definitions
 * Cucumber step definitions for testing buildArtifacts() layout logic
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import { BmadWorld } from '../support/world';

// We use proxyquire to load the module with mocked vscode dependency
const proxyquire = require('proxyquire').noCallThru();

// Load the module with vscode mocked out (buildArtifacts only uses store.getState())
const transformerModule = proxyquire('../../src/canvas/artifact-transformer', {
    vscode: {
        '@noCallThru': true,
        '@global': false
    }
});
const { buildArtifacts } = transformerModule;

// Per-world test context
interface TransformerTestContext {
    storeState: Record<string, any>;
    artifacts: any[];
}

const contexts = new WeakMap<BmadWorld, TransformerTestContext>();

function getCtx(world: BmadWorld): TransformerTestContext {
    let ctx = contexts.get(world);
    if (!ctx) {
        ctx = {
            storeState: {},
            artifacts: []
        };
        contexts.set(world, ctx);
    }
    return ctx;
}

/** Create a mock store from current state */
function mockStore(ctx: TransformerTestContext): any {
    return { getState: () => ctx.storeState } as any;
}

/** Find artifact by ID */
function findArtifact(ctx: TransformerTestContext, id: string): any {
    const artifact = ctx.artifacts.find(a => a.id === id);
    assert.ok(artifact, `No artifact found with id "${id}". Available: ${ctx.artifacts.map(a => a.id).join(', ')}`);
    return artifact;
}

/** Find first artifact of given type */
function findFirstOfType(ctx: TransformerTestContext, type: string): any {
    const artifact = ctx.artifacts.find(a => a.type === type);
    assert.ok(artifact, `No artifact found with type "${type}". Available types: ${[...new Set(ctx.artifacts.map(a => a.type))].join(', ')}`);
    return artifact;
}

/** Find second artifact of given type */
function findSecondOfType(ctx: TransformerTestContext, type: string): any {
    const all = ctx.artifacts.filter(a => a.type === type);
    assert.ok(all.length >= 2, `Expected at least 2 artifacts of type "${type}", found ${all.length}`);
    return all[1];
}

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('a fresh artifact transformer', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.storeState = {};
    ctx.artifacts = [];
});

Given('the store state has null productBrief and null vision', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.storeState.productBrief = null;
    ctx.storeState.vision = null;
});

Given('the store has a product brief with name {string} and tagline {string}', function (
    this: BmadWorld, name: string, tagline: string
) {
    const ctx = getCtx(this);
    ctx.storeState.productBrief = {
        productName: name,
        tagline,
        status: 'draft'
    };
});

Given('the store has a product brief with id {string} and name {string}', function (
    this: BmadWorld, id: string, name: string
) {
    const ctx = getCtx(this);
    ctx.storeState.productBrief = {
        id,
        productName: name,
        status: 'draft'
    };
});

Given('the store has a vision with productName {string} and problemStatement {string}', function (
    this: BmadWorld, productName: string, problemStatement: string
) {
    const ctx = getCtx(this);
    ctx.storeState.vision = { productName, problemStatement, status: 'draft' };
});

Given('the store has a vision with productName {string} and a very long problemStatement', function (
    this: BmadWorld, productName: string
) {
    const ctx = getCtx(this);
    ctx.storeState.vision = {
        productName,
        problemStatement: 'A'.repeat(500), // Very long to test height capping
        status: 'draft'
    };
});

Given('the store has {int} functional requirements', function (this: BmadWorld, count: number) {
    const ctx = getCtx(this);
    if (!ctx.storeState.requirements) ctx.storeState.requirements = {};
    ctx.storeState.requirements.functional = [];
    for (let i = 0; i < count; i++) {
        ctx.storeState.requirements.functional.push({
            id: `req-${i}`,
            title: `Requirement ${i + 1}`,
            description: `Description for requirement ${i + 1}`
        });
    }
});

Given('the store has {int} non-functional requirements', function (this: BmadWorld, count: number) {
    const ctx = getCtx(this);
    if (!ctx.storeState.requirements) ctx.storeState.requirements = {};
    ctx.storeState.requirements.nonFunctional = [];
    for (let i = 0; i < count; i++) {
        ctx.storeState.requirements.nonFunctional.push({
            id: `nfr-${i}`,
            title: `NFR ${i + 1}`,
            description: `Non-functional requirement ${i + 1}`,
            category: 'performance'
        });
    }
});

Given('the store has {int} additional requirements', function (this: BmadWorld, count: number) {
    const ctx = getCtx(this);
    if (!ctx.storeState.requirements) ctx.storeState.requirements = {};
    ctx.storeState.requirements.additional = [];
    for (let i = 0; i < count; i++) {
        ctx.storeState.requirements.additional.push({
            id: `add-req-${i}`,
            title: `Additional Req ${i + 1}`,
            description: `Additional requirement ${i + 1}`
        });
    }
});

Given('the store has a functional requirement with id {string} and title {string}', function (
    this: BmadWorld, id: string, title: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.requirements) ctx.storeState.requirements = {};
    if (!ctx.storeState.requirements.functional) ctx.storeState.requirements.functional = [];
    ctx.storeState.requirements.functional.push({ id, title, description: '' });
});

Given('the store has a PRD with productName {string} and purpose {string}', function (
    this: BmadWorld, productName: string, purpose: string
) {
    const ctx = getCtx(this);
    ctx.storeState.prd = {
        productOverview: { productName, purpose },
        status: 'draft'
    };
});

Given('the PRD has {int} risks', function (this: BmadWorld, count: number) {
    const ctx = getCtx(this);
    assert.ok(ctx.storeState.prd, 'PRD must exist before adding risks');
    ctx.storeState.prd.risks = [];
    for (let i = 0; i < count; i++) {
        ctx.storeState.prd.risks.push({
            id: `risk-${i}`,
            risk: `Risk ${i + 1}`,
            mitigation: `Mitigate risk ${i + 1}`,
            category: 'technical',
            probability: 'medium',
            impact: 'high'
        });
    }
});

Given('the store has architecture with projectName {string} and summary {string}', function (
    this: BmadWorld, projectName: string, summary: string
) {
    const ctx = getCtx(this);
    ctx.storeState.architecture = {
        overview: { projectName, summary },
        status: 'draft'
    };
});

Given('the architecture has {int} decisions', function (this: BmadWorld, count: number) {
    const ctx = getCtx(this);
    assert.ok(ctx.storeState.architecture, 'Architecture must exist before adding decisions');
    ctx.storeState.architecture.decisions = [];
    for (let i = 0; i < count; i++) {
        ctx.storeState.architecture.decisions.push({
            id: `arch-decision-${i}`,
            title: `Decision ${i + 1}`,
            context: `Context for decision ${i + 1}`,
            decision: `We decided ${i + 1}`,
            status: 'proposed'
        });
    }
});

Given('the architecture has {int} system components', function (this: BmadWorld, count: number) {
    const ctx = getCtx(this);
    assert.ok(ctx.storeState.architecture, 'Architecture must exist before adding components');
    ctx.storeState.architecture.systemComponents = [];
    for (let i = 0; i < count; i++) {
        ctx.storeState.architecture.systemComponents.push({
            id: `sys-component-${i}`,
            name: `Component ${i + 1}`,
            description: `Description for component ${i + 1}`,
            type: 'service'
        });
    }
});

Given('the store has an epic with title {string} and goal {string}', function (
    this: BmadWorld, title: string, goal: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    ctx.storeState.epics.push({ title, goal, status: 'draft' });
});

Given('the store has an epic with title {string} and {int} stories', function (
    this: BmadWorld, title: string, storyCount: number
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    const stories: any[] = [];
    for (let i = 0; i < storyCount; i++) {
        stories.push({
            id: `story-${ctx.storeState.epics.length}-${i}`,
            title: `Story ${i + 1}`,
            status: 'draft',
            storyPoints: 3
        });
    }
    ctx.storeState.epics.push({ title, goal: 'Goal', status: 'draft', stories });
});

Given('the store has an epic with id {string} and title {string} and {int} stories', function (
    this: BmadWorld, id: string, title: string, storyCount: number
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    const epicIdx = ctx.storeState.epics.length;
    const stories: any[] = [];
    for (let i = 0; i < storyCount; i++) {
        stories.push({
            id: `story-${epicIdx}-${i}`,
            title: `Story ${i + 1}`,
            status: 'draft',
            storyPoints: 3
        });
    }
    ctx.storeState.epics.push({ id, title, goal: 'Goal', status: 'draft', stories });
});

Given('the store has an epic with title {string} and a story with userStory {string} {string} {string}', function (
    this: BmadWorld, title: string, asA: string, iWant: string, soThat: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    ctx.storeState.epics.push({
        title,
        goal: 'Goal',
        status: 'draft',
        stories: [{
            id: `story-${ctx.storeState.epics.length}-0`,
            title: 'Story with User Story',
            status: 'draft',
            userStory: { asA, iWant, soThat }
        }]
    });
});

Given('the store has an epic with title {string} and {int} use cases', function (
    this: BmadWorld, title: string, ucCount: number
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    const useCases: any[] = [];
    for (let i = 0; i < ucCount; i++) {
        useCases.push({
            id: `UC-epic-${ctx.storeState.epics.length}-${i}`,
            title: `Use Case ${i + 1}`,
            description: `Description ${i + 1}`,
            status: 'draft'
        });
    }
    ctx.storeState.epics.push({ title, goal: 'Goal', status: 'draft', useCases });
});

Given('the store has an epic with title {string} and a story with {int} tasks', function (
    this: BmadWorld, title: string, taskCount: number
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    const tasks: any[] = [];
    for (let i = 0; i < taskCount; i++) {
        tasks.push({
            id: `task-${i}`,
            description: `Task ${i + 1} description`,
            completed: false
        });
    }
    ctx.storeState.epics.push({
        title,
        goal: 'Goal',
        status: 'draft',
        stories: [{
            id: `story-${ctx.storeState.epics.length}-0`,
            title: 'Story with Tasks',
            status: 'draft',
            tasks
        }]
    });
});

Given('the store has an epic with title {string} and a story with a completed task', function (
    this: BmadWorld, title: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    ctx.storeState.epics.push({
        title,
        goal: 'Goal',
        status: 'draft',
        stories: [{
            id: `story-${ctx.storeState.epics.length}-0`,
            title: 'Story',
            status: 'draft',
            tasks: [{ id: 'task-done', description: 'Done task', completed: true }]
        }]
    });
});

Given('the store has an epic with title {string} and a story with an incomplete task', function (
    this: BmadWorld, title: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    ctx.storeState.epics.push({
        title,
        goal: 'Goal',
        status: 'draft',
        stories: [{
            id: `story-${ctx.storeState.epics.length}-0`,
            title: 'Story',
            status: 'draft',
            tasks: [{ id: 'task-inc', description: 'Incomplete task', completed: false }]
        }]
    });
});

Given('the store has an epic with title {string} and stories with points {int}, {int}, {int}', function (
    this: BmadWorld, title: string, p1: number, p2: number, p3: number
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    const epicIdx = ctx.storeState.epics.length;
    ctx.storeState.epics.push({
        title,
        goal: 'Goal',
        status: 'draft',
        stories: [
            { id: `story-${epicIdx}-0`, title: 'S1', status: 'draft', storyPoints: p1 },
            { id: `story-${epicIdx}-1`, title: 'S2', status: 'draft', storyPoints: p2 },
            { id: `story-${epicIdx}-2`, title: 'S3', status: 'draft', storyPoints: p3 }
        ]
    });
});

Given('the store has an epic with title {string} and stories with statuses {string}, {string}, {string}', function (
    this: BmadWorld, title: string, s1: string, s2: string, s3: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    const epicIdx = ctx.storeState.epics.length;
    ctx.storeState.epics.push({
        title,
        goal: 'Goal',
        status: 'draft',
        stories: [
            { id: `story-${epicIdx}-0`, title: 'S1', status: s1, storyPoints: 1 },
            { id: `story-${epicIdx}-1`, title: 'S2', status: s2, storyPoints: 1 },
            { id: `story-${epicIdx}-2`, title: 'S3', status: s3, storyPoints: 1 }
        ]
    });
});

Given('the store has an epic with id {string} linked to requirement {string}', function (
    this: BmadWorld, epicId: string, reqId: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    ctx.storeState.epics.push({
        id: epicId,
        title: 'Linked Epic',
        goal: 'Goal',
        status: 'draft',
        functionalRequirements: [reqId]
    });
});

Given('the store has an epic with id {string} and title {string} and no stories', function (
    this: BmadWorld, id: string, title: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    ctx.storeState.epics.push({ id, title, goal: 'Goal', status: 'draft' });
});

Given('the store has an epic with id {string} and title {string} with upstream dependency {string}', function (
    this: BmadWorld, id: string, title: string, upstreamId: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    ctx.storeState.epics.push({
        id,
        title,
        goal: 'Goal',
        status: 'draft',
        epicDependencies: {
            upstream: [{ epicId: upstreamId, reason: 'depends on' }]
        }
    });
});

Given('the store has an epic with id {string} and title {string} with downstream dependency {string}', function (
    this: BmadWorld, id: string, title: string, downstreamId: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    ctx.storeState.epics.push({
        id,
        title,
        goal: 'Goal',
        status: 'draft',
        epicDependencies: {
            downstream: [{ epicId: downstreamId, reason: 'enables' }]
        }
    });
});

Given('the store has an epic with title {string} and 2 stories where story 1 is blocked by story 0', function (
    this: BmadWorld, title: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    const epicIdx = ctx.storeState.epics.length;
    const storyId0 = `story-${epicIdx}-0`;
    const storyId1 = `story-${epicIdx}-1`;
    ctx.storeState.epics.push({
        title,
        goal: 'Goal',
        status: 'draft',
        stories: [
            { id: storyId0, title: 'Story 0', status: 'draft' },
            {
                id: storyId1, title: 'Story 1', status: 'draft',
                dependencies: {
                    blockedBy: [{ storyId: storyId0 }]
                }
            }
        ]
    });
});

Given('the store has an epic with title {string} and 2 stories where story 0 blocks story 1', function (
    this: BmadWorld, title: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    const epicIdx = ctx.storeState.epics.length;
    const storyId0 = `story-${epicIdx}-0`;
    const storyId1 = `story-${epicIdx}-1`;
    ctx.storeState.epics.push({
        title,
        goal: 'Goal',
        status: 'draft',
        stories: [
            {
                id: storyId0, title: 'Story 0', status: 'draft',
                dependencies: {
                    blocks: [{ storyId: storyId1 }]
                }
            },
            { id: storyId1, title: 'Story 1', status: 'draft' }
        ]
    });
});

// --- Test Cases ---

Given('the store has {int} test cases linked to story {string} and epic {string}', function (
    this: BmadWorld, count: number, storyId: string, epicId: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.testCases) ctx.storeState.testCases = [];
    for (let i = 0; i < count; i++) {
        ctx.storeState.testCases.push({
            id: `TC-${storyId}-${i}`,
            title: `Test Case ${i + 1}`,
            storyId,
            epicId,
            status: 'draft'
        });
    }
});

Given('the store has {int} test cases linked to epic {string} with no story', function (
    this: BmadWorld, count: number, epicId: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.testCases) ctx.storeState.testCases = [];
    for (let i = 0; i < count; i++) {
        ctx.storeState.testCases.push({
            id: `TC-${epicId}-${i}`,
            title: `Epic Test ${i + 1}`,
            epicId,
            status: 'draft'
        });
    }
});

Given('the store has {int} orphan test cases', function (this: BmadWorld, count: number) {
    const ctx = getCtx(this);
    if (!ctx.storeState.testCases) ctx.storeState.testCases = [];
    for (let i = 0; i < count; i++) {
        ctx.storeState.testCases.push({
            id: `TC-orphan-${i}`,
            title: `Orphan Test ${i + 1}`,
            status: 'draft'
        });
    }
});

Given('the store has test cases for story {string} with statuses {string}, {string}, {string}', function (
    this: BmadWorld, storyId: string, s1: string, s2: string, s3: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.testCases) ctx.storeState.testCases = [];
    [s1, s2, s3].forEach((status, i) => {
        ctx.storeState.testCases.push({
            id: `TC-${storyId}-${i}`,
            title: `Test ${i + 1}`,
            storyId,
            epicId: 'EPIC-1',
            status
        });
    });
});

Given('the store has test cases for story {string} with statuses {string}, {string}', function (
    this: BmadWorld, storyId: string, s1: string, s2: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.testCases) ctx.storeState.testCases = [];
    [s1, s2].forEach((status, i) => {
        ctx.storeState.testCases.push({
            id: `TC-${storyId}-${i}`,
            title: `Test ${i + 1}`,
            storyId,
            epicId: 'EPIC-1',
            status
        });
    });
});

// --- Test Strategy ---

Given('the store has a test strategy with title {string} and scope {string}', function (
    this: BmadWorld, title: string, scope: string
) {
    const ctx = getCtx(this);
    ctx.storeState.testStrategy = { title, scope, status: 'draft' };
});

Given('the store has an epic with id {string} and title {string} and a test strategy {string}', function (
    this: BmadWorld, id: string, title: string, tsTitle: string
) {
    const ctx = getCtx(this);
    if (!ctx.storeState.epics) ctx.storeState.epics = [];
    ctx.storeState.epics.push({
        id,
        title,
        goal: 'Goal',
        status: 'draft',
        testStrategy: {
            id: `TS-${id}`,
            title: tsTitle,
            scope: 'Unit tests',
            status: 'draft'
        }
    });
});

// --- Full pipeline ---

Given('the store has a full project with all phases', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.storeState = {
        productBrief: {
            productName: 'Full Product',
            tagline: 'Complete project',
            status: 'approved'
        },
        vision: {
            productName: 'Full Product Vision',
            problemStatement: 'We need everything',
            status: 'approved'
        },
        prd: {
            productOverview: { productName: 'Full PRD', purpose: 'Everything' },
            status: 'approved'
        },
        requirements: {
            functional: [
                { id: 'REQ-1', title: 'Feature 1', description: 'Build feature 1' }
            ]
        },
        architecture: {
            overview: { projectName: 'Full Arch', summary: 'Monolith' },
            status: 'approved',
            decisions: [{ id: 'DEC-1', title: 'Use TypeScript', context: 'Type safety' }]
        },
        epics: [{
            id: 'EPIC-1',
            title: 'Epic 1',
            goal: 'Build it',
            status: 'in-progress',
            functionalRequirements: ['REQ-1'],
            stories: [{
                id: 'STORY-1',
                title: 'Story 1',
                status: 'draft',
                storyPoints: 5
            }]
        }]
    };
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I build artifacts from an empty store', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.storeState = {};
    ctx.artifacts = buildArtifacts(mockStore(ctx));
});

When('I build artifacts from the store', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.artifacts = buildArtifacts(mockStore(ctx));
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the artifact count should be {int}', function (this: BmadWorld, expected: number) {
    const ctx = getCtx(this);
    assert.strictEqual(ctx.artifacts.length, expected,
        `Expected ${expected} artifacts but got ${ctx.artifacts.length}. Types: ${ctx.artifacts.map(a => `${a.id}(${a.type})`).join(', ')}`);
});

Then('the artifact count should be at least {int}', function (this: BmadWorld, minimum: number) {
    const ctx = getCtx(this);
    assert.ok(ctx.artifacts.length >= minimum,
        `Expected at least ${minimum} artifacts but got ${ctx.artifacts.length}`);
});

Then('artifact {string} should have type {string}', function (this: BmadWorld, id: string, type: string) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.type, type);
});

Then('artifact {string} should have title {string}', function (this: BmadWorld, id: string, title: string) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.title, title);
});

Then('artifact {string} should have status {string}', function (this: BmadWorld, id: string, status: string) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.status, status);
});

Then('artifact {string} position x should be {int}', function (this: BmadWorld, id: string, x: number) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.position.x, x);
});

Then('artifact {string} position y should be greater than artifact {string} position y', function (
    this: BmadWorld, id1: string, id2: string
) {
    const ctx = getCtx(this);
    const a1 = findArtifact(ctx, id1);
    const a2 = findArtifact(ctx, id2);
    assert.ok(a1.position.y > a2.position.y,
        `Expected ${id1} y(${a1.position.y}) > ${id2} y(${a2.position.y})`);
});

Then('artifact {string} should have {int} dependencies', function (this: BmadWorld, id: string, count: number) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.dependencies.length, count);
});

Then('artifact {string} should have no parentId', function (this: BmadWorld, id: string) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.ok(!artifact.parentId, `Expected no parentId but got "${artifact.parentId}"`);
});

Then('artifact {string} parentId should be {string}', function (this: BmadWorld, id: string, parentId: string) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.parentId, parentId);
});

Then('artifact {string} childCount should be {int}', function (this: BmadWorld, id: string, count: number) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.childCount, count);
});

Then('artifact {string} dependencies should include {string}', function (this: BmadWorld, id: string, depId: string) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.ok(artifact.dependencies.includes(depId),
        `Expected "${id}" dependencies to include "${depId}", got: ${artifact.dependencies.join(', ')}`);
});

Then('artifact {string} width should be {int}', function (this: BmadWorld, id: string, width: number) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.size.width, width);
});

Then('artifact {string} height should be greater than {int}', function (this: BmadWorld, id: string, minHeight: number) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.ok(artifact.size.height > minHeight,
        `Expected "${id}" height > ${minHeight}, got ${artifact.size.height}`);
});

Then('artifact {string} metadata totalStoryPoints should be {int}', function (this: BmadWorld, id: string, points: number) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.metadata.totalStoryPoints, points);
});

Then('artifact {string} metadata doneStoryCount should be {int}', function (this: BmadWorld, id: string, count: number) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.metadata.doneStoryCount, count);
});

Then('artifact {string} metadata totalStoryCount should be {int}', function (this: BmadWorld, id: string, count: number) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.metadata.totalStoryCount, count);
});

Then('artifact {string} metadata totalCount should be {int}', function (this: BmadWorld, id: string, count: number) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.metadata.totalCount, count);
});

Then('artifact {string} metadata passCount should be {int}', function (this: BmadWorld, id: string, count: number) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.metadata.passCount, count);
});

Then('artifact {string} metadata failCount should be {int}', function (this: BmadWorld, id: string, count: number) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.metadata.failCount, count);
});

Then('artifact {string} metadata draftCount should be {int}', function (this: BmadWorld, id: string, count: number) {
    const ctx = getCtx(this);
    const artifact = findArtifact(ctx, id);
    assert.strictEqual(artifact.metadata.draftCount, count);
});

// --- Type-based assertions ---

Then('the artifacts should contain type {string}', function (this: BmadWorld, type: string) {
    const ctx = getCtx(this);
    const hasType = ctx.artifacts.some(a => a.type === type);
    assert.ok(hasType, `Expected artifacts to contain type "${type}". Types present: ${[...new Set(ctx.artifacts.map(a => a.type))].join(', ')}`);
});

Then('the artifact count for type {string} should be {int}', function (this: BmadWorld, type: string, count: number) {
    const ctx = getCtx(this);
    const actual = ctx.artifacts.filter(a => a.type === type).length;
    assert.strictEqual(actual, count, `Expected ${count} artifacts of type "${type}", got ${actual}`);
});

Then('all {string} artifacts position x should be at least {int}', function (this: BmadWorld, type: string, minX: number) {
    const ctx = getCtx(this);
    const typed = ctx.artifacts.filter(a => a.type === type);
    assert.ok(typed.length > 0, `No artifacts of type "${type}" found`);
    for (const a of typed) {
        assert.ok(a.position.x >= minX,
            `Artifact "${a.id}" position.x=${a.position.x} is less than ${minX}`);
    }
});

Then('the first {string} artifact parentId should be {string}', function (this: BmadWorld, type: string, parentId: string) {
    const ctx = getCtx(this);
    const artifact = findFirstOfType(ctx, type);
    assert.strictEqual(artifact.parentId, parentId);
});

Then('the first {string} artifact description should contain {string}', function (this: BmadWorld, type: string, text: string) {
    const ctx = getCtx(this);
    const artifact = findFirstOfType(ctx, type);
    assert.ok(artifact.description.includes(text),
        `Expected description to contain "${text}", got: "${artifact.description}"`);
});

Then('the first {string} artifact should have status {string}', function (this: BmadWorld, type: string, status: string) {
    const ctx = getCtx(this);
    const artifact = findFirstOfType(ctx, type);
    assert.strictEqual(artifact.status, status);
});

Then('the first {string} artifact width should be {int}', function (this: BmadWorld, type: string, width: number) {
    const ctx = getCtx(this);
    const artifact = findFirstOfType(ctx, type);
    assert.strictEqual(artifact.size.width, width);
});

Then('the second {string} artifact dependencies should include the first story id', function (this: BmadWorld, type: string) {
    const ctx = getCtx(this);
    const stories = ctx.artifacts.filter(a => a.type === type);
    assert.ok(stories.length >= 2, `Expected at least 2 "${type}" artifacts`);
    const firstId = stories[0].id;
    assert.ok(stories[1].dependencies.includes(firstId),
        `Expected second story dependencies to include "${firstId}", got: ${stories[1].dependencies.join(', ')}`);
});

Then('all {string} artifacts should have non-overlapping Y positions', function (this: BmadWorld, type: string) {
    const ctx = getCtx(this);
    const typed = ctx.artifacts.filter(a => a.type === type);
    assert.ok(typed.length >= 2, `Need at least 2 "${type}" artifacts to check overlap`);

    // Sort by Y position
    typed.sort((a: any, b: any) => a.position.y - b.position.y);

    for (let i = 1; i < typed.length; i++) {
        const prev = typed[i - 1];
        const curr = typed[i];
        const prevBottom = prev.position.y + prev.size.height;
        assert.ok(curr.position.y >= prevBottom,
            `Artifacts "${prev.id}" (y=${prev.position.y}, h=${prev.size.height}) and "${curr.id}" (y=${curr.position.y}) overlap`);
    }
});
