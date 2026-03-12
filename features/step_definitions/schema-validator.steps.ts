/**
 * Schema Validator Step Definitions
 * Cucumber step definitions for testing SchemaValidator functionality
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as assert from 'assert';
import * as path from 'path';
import { BmadWorld } from '../support/world';

// We use proxyquire to load the module with mocked dependencies
const proxyquire = require('proxyquire').noCallThru();

// Track output channel messages for assertions
interface ValidatorTestContext {
    validator: any;
    initCount: number;
    lastValidation: { valid: boolean; errors: string[] } | null;
    lastStrictValidation: { valid: boolean; errors: string[] } | null;
    outputMessages: string[];
    _testLogger: { appendLine: (msg: string) => void };
}

// Per-world storage for test context
const contexts = new WeakMap<BmadWorld, ValidatorTestContext>();

function getCtx(world: BmadWorld): ValidatorTestContext {
    let ctx = contexts.get(world);
    if (!ctx) {
        ctx = {
            validator: null,
            initCount: 0,
            lastValidation: null,
            lastStrictValidation: null,
            outputMessages: [],
            _testLogger: { appendLine: () => {} },
        };
        contexts.set(world, ctx);
    }
    return ctx;
}

/**
 * Create a fresh SchemaValidator instance with mocked dependencies.
 * Each call returns a NEW instance (not the module singleton).
 */
function createValidator(world: BmadWorld): any {
    const ctx = getCtx(world);

    // Build a logger that captures output for test assertions
    ctx._testLogger = {
        appendLine: (msg: string) => { ctx.outputMessages.push(msg); },
    };

    const schemaValidatorModule = proxyquire('../../src/state/schema-validator', {});

    // Return a NEW instance, not the singleton
    return new schemaValidatorModule.SchemaValidator();
}

/** Resolve the real BMAD schemas path */
function getRealSchemasParentPath(): string {
    // resources/_bmad/ is the bmadPath; schemas are at resources/_bmad/schemas/
    return path.resolve(__dirname, '../../resources/_bmad');
}

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('a fresh schema validator', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.validator = createValidator(this);
    ctx.initCount = 0;
    ctx.lastValidation = null;
    ctx.lastStrictValidation = null;
    ctx.outputMessages = [];
});

Given('the schema validator is initialized', function (this: BmadWorld) {
    const ctx = getCtx(this);
    if (!ctx.validator.isInitialized()) {
        const bmadPath = getRealSchemasParentPath();
        ctx.validator.init(bmadPath, ctx._testLogger);
        ctx.initCount++;
    }
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I initialize the schema validator with the real BMAD schemas path', function (this: BmadWorld) {
    const ctx = getCtx(this);
    const bmadPath = getRealSchemasParentPath();
    ctx.validator.init(bmadPath, ctx._testLogger);
    ctx.initCount++;
});

When('I initialize the schema validator with the real BMAD schemas path again', function (this: BmadWorld) {
    const ctx = getCtx(this);
    const bmadPath = getRealSchemasParentPath();
    ctx.validator.init(bmadPath, ctx._testLogger);
    ctx.initCount++;
});

When('I initialize the schema validator with a non-existent path', function (this: BmadWorld) {
    const ctx = getCtx(this);
    ctx.validator.init('/non/existent/path/that/does/not/exist', ctx._testLogger);
    ctx.initCount++;
});

When('I validate changes for type {string} with:', function (this: BmadWorld, artifactType: string, dataTable: any) {
    const ctx = getCtx(this);
    const rows = dataTable.hashes();
    const changes: Record<string, any> = {};
    for (const row of rows) {
        changes[row.field] = row.value;
    }
    ctx.lastValidation = ctx.validator.validateChanges(artifactType, changes);
});

When('I validate changes for type {string} with integer field {string} value {int}', function (
    this: BmadWorld, artifactType: string, field: string, value: number
) {
    const ctx = getCtx(this);
    const changes: Record<string, any> = {};
    changes[field] = value;
    ctx.lastValidation = ctx.validator.validateChanges(artifactType, changes);
});

When('I validate changes for type {string} with nested metadata:', function (
    this: BmadWorld, artifactType: string, dataTable: any
) {
    const ctx = getCtx(this);
    const rows = dataTable.hashes();
    const row = rows[0]; // single row expected

    const changes: Record<string, any> = {
        metadata: {
            [row.metadataField]: row.metadataValue,
        },
        [row.contentField]: row.contentValue,
    };

    ctx.lastValidation = ctx.validator.validateChanges(artifactType, changes);
});

When('I strictly validate type {string} with:', function (this: BmadWorld, artifactType: string, dataTable: any) {
    const ctx = getCtx(this);
    const rows = dataTable.hashes();
    const data: Record<string, any> = {};
    for (const row of rows) {
        data[row.field] = row.value;
    }
    ctx.lastStrictValidation = ctx.validator.validate(artifactType, data);
});

When('I validate changes with many type errors for {string}', function (this: BmadWorld, artifactType: string) {
    const ctx = getCtx(this);

    // Build a changes object with many type-violating fields.
    // story schema has storyPoints as integer, status as enum, etc.
    // We send many wrong-typed fields to trigger multiple errors.
    const changes: Record<string, any> = {
        storyPoints: 'not-a-number',
        status: 'invalid-enum-value-1',
        priority: 'ZZZZZ',
        storyFormat: 'not-valid',
        // Array fields sent as wrong type
        tasks: 'should-be-array',
        acceptanceCriteria: 'should-be-array',
        solutionDetails: 'should-be-array',
        implementationDetails: 'should-be-array',
        requirementRefs: 'should-be-array',
        labels: 'should-be-array',
        uxReferences: 'should-be-array',
        references: 'should-be-array',
        history: 'should-be-array',
    };

    ctx.lastValidation = ctx.validator.validateChanges(artifactType, changes);
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the schema validator should be initialized', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.strictEqual(ctx.validator.isInitialized(), true, 'Expected validator to be initialized');
});

Then('the schema validator should not be initialized', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.strictEqual(ctx.validator.isInitialized(), false, 'Expected validator to NOT be initialized');
});

Then('the schema validator should have relaxed validators', function (this: BmadWorld) {
    const ctx = getCtx(this);
    // Verify by calling validateChanges on a known type — if relaxed validators exist, it works
    const result = ctx.validator.validateChanges('story', { title: 'test' });
    assert.strictEqual(result.valid, true, 'Expected relaxed validator to work for story type');
});

Then('the schema validator should have no schema load errors', function (this: BmadWorld) {
    const ctx = getCtx(this);
    // Only check for actual file-level load errors (not relaxed validator build failures)
    const loadErrors = ctx.outputMessages.filter(
        (m: string) => m.includes('Failed to load schema')
    );
    assert.strictEqual(
        loadErrors.length, 0,
        `Expected no schema load errors, but got: ${loadErrors.join('\n')}`
    );
});

Then('the relaxed validator build warnings should only be for known problematic schemas', function (this: BmadWorld) {
    const ctx = getCtx(this);
    // Some TEA schemas have internal $ref paths that break when content is hoisted.
    // This is expected and known. We just verify the failures are only for those schemas.
    const knownProblematic = [
        'tea/test-design.schema.json',
        'tea/traceability-matrix.schema.json',
    ];

    const buildWarnings = ctx.outputMessages.filter(
        (m: string) => m.includes('Failed to build relaxed validator')
    );

    for (const warning of buildWarnings) {
        const isKnown = knownProblematic.some(schema => warning.includes(schema));
        assert.ok(
            isKnown,
            `Unexpected relaxed validator build failure: ${warning}`
        );
    }
});

Then('the initialization count should be {int}', function (this: BmadWorld, expected: number) {
    const ctx = getCtx(this);
    // The idempotency check: initCount tracks how many times we called init(),
    // but the validator's internal `initialized` flag should mean the second call
    // was a no-op. We verify by checking that only one "Initialized with" message exists.
    const initMessages = ctx.outputMessages.filter((m: string) => m.includes('Initialized with'));
    assert.strictEqual(
        initMessages.length, expected,
        `Expected ${expected} initialization(s), got ${initMessages.length}: ${initMessages.join('; ')}`
    );
});

Then('getSupportedTypes should return all mapped artifact types', function (this: BmadWorld) {
    const ctx = getCtx(this);
    const types = ctx.validator.getSupportedTypes();
    assert.ok(Array.isArray(types), 'Expected getSupportedTypes to return an array');
    assert.ok(types.length > 30, `Expected at least 30 supported types, got ${types.length}`);
});

Then('getSupportedTypes should include {string}', function (this: BmadWorld, typeName: string) {
    const ctx = getCtx(this);
    const types: string[] = ctx.validator.getSupportedTypes();
    assert.ok(types.includes(typeName), `Expected "${typeName}" in supported types: ${types.join(', ')}`);
});

Then('the validation result should be valid', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.ok(ctx.lastValidation, 'No validation result available');
    assert.strictEqual(ctx.lastValidation.valid, true,
        `Expected valid, but got errors: ${ctx.lastValidation.errors.join('; ')}`);
});

Then('the validation result should be invalid', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.ok(ctx.lastValidation, 'No validation result available');
    assert.strictEqual(ctx.lastValidation.valid, false, 'Expected validation to be invalid');
});

Then('the validation errors should be empty', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.ok(ctx.lastValidation, 'No validation result available');
    assert.strictEqual(ctx.lastValidation.errors.length, 0,
        `Expected no errors but got: ${ctx.lastValidation.errors.join('; ')}`);
});

Then('the validation errors should not be empty', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.ok(ctx.lastValidation, 'No validation result available');
    assert.ok(ctx.lastValidation.errors.length > 0, 'Expected validation errors but got none');
});

Then('the validation errors should mention {string}', function (this: BmadWorld, keyword: string) {
    const ctx = getCtx(this);
    assert.ok(ctx.lastValidation, 'No validation result available');
    const allErrors = ctx.lastValidation.errors.join(' ');
    assert.ok(
        allErrors.includes(keyword),
        `Expected errors to mention "${keyword}", but got: ${ctx.lastValidation.errors.join('; ')}`
    );
});

Then('the strict validation result should be invalid', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.ok(ctx.lastStrictValidation, 'No strict validation result available');
    assert.strictEqual(ctx.lastStrictValidation.valid, false, 'Expected strict validation to be invalid');
});

Then('the strict validation result should be valid', function (this: BmadWorld) {
    const ctx = getCtx(this);
    assert.ok(ctx.lastStrictValidation, 'No strict validation result available');
    assert.strictEqual(ctx.lastStrictValidation.valid, true,
        `Expected valid, but got errors: ${ctx.lastStrictValidation.errors.join('; ')}`);
});

Then('the validation errors should have at most {int} entries', function (this: BmadWorld, maxEntries: number) {
    const ctx = getCtx(this);
    assert.ok(ctx.lastValidation, 'No validation result available');
    assert.ok(
        ctx.lastValidation.errors.length <= maxEntries,
        `Expected at most ${maxEntries} errors but got ${ctx.lastValidation.errors.length}: ` +
        ctx.lastValidation.errors.join('; ')
    );
});
