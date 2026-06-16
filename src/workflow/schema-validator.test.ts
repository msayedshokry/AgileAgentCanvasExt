// ─── Regression tests: SchemaValidator.validateChanges rejects bad payloads ──
// Verifies that the typed contract (ArtifactChanges<T>) is enforced at runtime
// by the schema validation layer upstream of `updateArtifact`. Placed in
// src/workflow/ because vitest.config.ts limits `include` to this directory.
//
// Note: this tests the SchemaValidator sub-layer, not the full `updateArtifact`
// harness-policy enforcement path. For that, see the TODO below.

import { describe, it, expect, beforeAll } from 'vitest';
import { schemaValidator } from '../state/schema-validator';
import * as path from 'path';

// ─── Setup ──────────────────────────────────────────────────────────────────

// The BMAD schemas live at <projectRoot>/resources/_aac/
// We resolve from the test file location (src/workflow/) up to project root.
const projectRoot = path.resolve(__dirname, '..', '..');
const bmadResourcesPath = path.join(projectRoot, 'resources', '_aac');

let initialized = false;

beforeAll(() => {
    if (!initialized) {
        schemaValidator.init(bmadResourcesPath);
        initialized = true;
    }
});

// ─── Regression: bad payloads rejected ──────────────────────────────────────

describe('SchemaValidator.validateChanges — bad payloads rejected', () => {

    it('rejects a story status that is not in the allowed enum', () => {
        const result = schemaValidator.validateChanges('story', {
            status: 'invalid-lane-that-does-not-exist',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects trivial metadata-only changes with no substantive fields', () => {
        // The validator rejects when only bookkeeping fields are present
        // and there is no real content field.
        const result = schemaValidator.validateChanges('story', {
            artifactType: 'story',
            version: 1,
            lastUpdated: '2025-01-01',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('documents that epic validation is a no-op (epic has no schema mapping)', () => {
        // Epic intentionally has no schema in ARTIFACT_TYPE_TO_SCHEMA.
        // The typed contract (ArtifactChanges<Epic>) provides compile-time
        // safety; runtime epic validation is handled by harness policies
        // in updateArtifact, not by the schema validator.
        const result = schemaValidator.validateChanges('epic', {
            status: 'invalid-lane',
        });
        // No schema mapping -> validator skips gracefully.
        expect(result.valid).toBe(true);
    });

    it('gracefully accepts unknown artifact types (no schema mapping = skip)', () => {
        // Types without a mapping return valid:true (skip validation).
        // The LM tool input shape (keyof BmadArtifactTypeMap) prevents
        // this from happening in practice at the type level.
        const result = schemaValidator.validateChanges(
            'nonexistent-artifact-type-xyz',
            { status: 'broken' }
        );
        expect(result.valid).toBe(true);
    });

    // ── Positive: known-good payloads accepted ───────────────────────────

    it('accepts a valid status change for a story', () => {
        const result = schemaValidator.validateChanges('story', {
            status: 'ready',
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('accepts a title-only change for a story', () => {
        const result = schemaValidator.validateChanges('story', {
            title: 'Implement rate limiting',
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('accepts a title + status change for a requirement', () => {
        const result = schemaValidator.validateChanges('requirement', {
            id: 'FR-1',
            title: 'Test requirement',
            description: 'A test description',
        });
        expect(result.valid).toBe(true);
    });

    it('accepts a valid product-brief change (kebab-case canonical type)', () => {
        // Verify that the canonical kebab-case key from BmadArtifactTypeMap
        // is accepted by the validator.
        const result = schemaValidator.validateChanges('product-brief', {
            productName: 'Test Product',
        });
        expect(result.valid).toBe(true);
    });

    // ── Edge: deprecated camelCase still works ────────────────────────────

    it('documents that camelCase productBrief has no schema mapping (use kebab-case)', () => {
        // The ARTIFACT_TYPE_TO_SCHEMA mapping in schema-validator.ts
        // uses kebab-case keys, but the validator checks the passed
        // string directly — no camelCase mapping exists for this path.
        // This test documents that callers using camelCase must use the
        // canonical key.
        const result = schemaValidator.validateChanges('productBrief', {
            productName: 'Test',
        });
        // No mapping for 'productBrief' — gracefully accepted (no schema).
        expect(result.valid).toBe(true);
    });

    // ── Edge: short aliases removed from canonical ────────────────────────

    it('nfr short alias still has a runtime schema mapping (validator map is independent)', () => {
        // nfr was moved from BmadArtifactTypeMap to DeprecatedCamelCaseArtifactTypes.
        // The schema-validator's ARTIFACT_TYPE_TO_SCHEMA still maps 'nfr' to
        // the NFR assessment schema (it was never removed from the validator's
        // internal map). This test verifies the current behavior.
        const result = schemaValidator.validateChanges('nfr', {
            title: 'Performance NFR',
        });
        // nfr IS still in ARTIFACT_TYPE_TO_SCHEMA (the validator has its own
        // independent map), so it should validate against the NFR assessment schema.
        expect(result.valid).toBe(true);
    });
});
