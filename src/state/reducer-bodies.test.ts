// Phase 15 reducer body smoke sweep for tea-reductions, bmm-reductions,
// cis-reductions. Phase 12 surfaced 3 narrow-cast body sites in
// l1-reductions (description-mapped-to-goal, userStory default-fill,
// epicId wire-only). Manual audit found ZERO narrow-cast patterns in
// the 25 tea/bmm/cis reducer bodies (uniform `(changes as any)[f]`
// indexed access into a static for-loop list). This file is the
// regression guard: if a future contributor adds such a narrow cast,
// this sweep will fail.
//
// Note: tests were previously skipped because src/state/ was missing
// from vitest.config.ts include patterns. Added in Phase 15.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the logger so reducer-body logDebug calls don't pollute the
// reporter (84+ log lines per run otherwise).
vi.mock('../utils/logger', () => ({
    createLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    })),
}));

// Plain-string constants — do not need `vi.hoisted` (only `vi.fn`
// instances bound inside mock factories need hoisting; these
// strings aren't captured by anything earlier than top-level init).
const sampleId = 'phase15-sample-1';
const sampleUnknownKey = 'phase15-surprise';

// Import AFTER mock registration so the reducer files pick up the mock.
import {
    registerTeaReducers,
    TEA_REGISTERED_TYPES,
} from './tea-reductions';
import {
    registerBmmReducers,
    BMM_REGISTERED_TYPES,
} from './bmm-reductions';
import {
    registerCisReducers,
    CIS_REGISTERED_TYPES,
} from './cis-reductions';
import type {
    ArtifactReducerCtx,
    ArtifactReducerRegistry,
    WritableChanges,
} from './reducer-types';

function makeCtx(): ArtifactReducerCtx {
    return {
        artifacts: new Map<string, any>(),
        notifyChange: vi.fn(),
        syncRequirementLinks: vi.fn(),
        removeStoryLinksFromRequirements: vi.fn(),
        reconcileDerivedState: vi.fn(),
        sourceFolder: null,
        outputFormat: 'json',
        findArtifactById: () => null,
    };
}

// Payload matrix — three shapes that triangulate body coverage.
// (a) Empty: no-op branches, every if-changes-x guard is false,
//     field-list loops skipped.
// (b) Metadata-only: changes.metadata.status must tolerate undefined.
// (c) Unknown wire field: body MUST throw nothing when input has
//     unexpected keys — surfaces narrow-cast body bugs that mis-route
//     extras into unintended slots.
const PAYLOADS: ReadonlyArray<{
    label: string;
    changes: Record<string, unknown>;
}> = [
    { label: 'empty', changes: {} },
    { label: 'metadata-only', changes: { metadata: {} } },
    { label: 'unknown-wire-field', changes: { unknownWireField: sampleUnknownKey } },
];

function buildCases(types: readonly string[]) {
    const cases: Array<{ key: string; label: string; changes: Record<string, unknown> }> = [];
    for (const key of types) {
        for (const p of PAYLOADS) {
            cases.push({ key, label: p.label, changes: p.changes });
        }
    }
    return cases;
}

// Deprecated kebab-case alias pairs. Mirrors the @deprecated pair
// declarations in BmadArtifactTypeMap from src/types/index.ts.
const DEPRECATED_ALIAS_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ['nfr', 'nfr-assessment'],
    ['readiness', 'readiness-report'],
    ['sprint', 'sprint-status'],
];

describe('Phase 15 — reducer body smoke sweep (tea/bmm/cis)', () => {
    let ctx: ArtifactReducerCtx;
    let registry: ArtifactReducerRegistry;

    beforeEach(() => {
        ctx = makeCtx();
        registry = new Map();
    });

    describe('registry membership invariants', () => {
        it('tea: every key in TEA_REGISTERED_TYPES is wired', () => {
            registerTeaReducers(registry);
            for (const k of TEA_REGISTERED_TYPES) {
                expect(registry.has(k)).toBe(true);
            }
        });
        it('bmm: every key in BMM_REGISTERED_TYPES is wired', () => {
            registerBmmReducers(registry);
            for (const k of BMM_REGISTERED_TYPES) {
                expect(registry.has(k)).toBe(true);
            }
        });
        it('cis: every key in CIS_REGISTERED_TYPES is wired', () => {
            registerCisReducers(registry);
            for (const k of CIS_REGISTERED_TYPES) {
                expect(registry.has(k)).toBe(true);
            }
        });

        it.each(DEPRECATED_ALIAS_PAIRS)(
            'alias %s and canonical %s resolve to the SAME handler instance',
            (alias, canonical) => {
                registerTeaReducers(registry);
                registerBmmReducers(registry);
                registerCisReducers(registry);
                expect(registry.get(alias)).toBe(registry.get(canonical));
            },
        );
    });

    describe('tea-reducers narrow-cast guard', () => {
        beforeEach(() => registerTeaReducers(registry));
        it.each(buildCases(TEA_REGISTERED_TYPES))(
            'reducer $key with payload $label: no-throw + id lands on entry + no unknown-key leakage',
            ({ key, changes }) => {
                const fn = registry.get(key)!;
                expect(() =>
                    fn(ctx, sampleId, changes as WritableChanges),
                ).not.toThrow();
                // Body-evidence assertion (Phase 15 round-3 sharpened):
                //   1. The reducer land SOMEWHERE in the map.
                //   2. The id created/updated equals our sampleId.
                //   3. A flat-collected string scan finds NO occurrence
                //      of `sampleUnknownKey` — would surface any
                //      narrow-cast body that incorrectly routed an
                //      unexpected key into a persisted field.
                expect(ctx.artifacts.size).toBeGreaterThan(0);
                const flatValues = Array.from(ctx.artifacts.values())
                    .map((v: unknown) => JSON.stringify(v))
                    .join('\n');
                // Singletons land at one slot directly; arrays land as a
                // 1-element array whose first entry is the just-created
                // item. Either way, the entry id MUST equal sampleId.
                expect(flatValues).toContain(`"id":"${sampleId}"`);
                expect(flatValues).not.toContain(sampleUnknownKey);
            },
        );
    });

    describe('bmm-reducers narrow-cast guard', () => {
        beforeEach(() => registerBmmReducers(registry));
        it.each(buildCases(BMM_REGISTERED_TYPES))(
            'reducer $key with payload $label: no-throw + id lands on entry + no unknown-key leakage',
            ({ key, changes }) => {
                const fn = registry.get(key)!;
                expect(() =>
                    fn(ctx, sampleId, changes as WritableChanges),
                ).not.toThrow();
                expect(ctx.artifacts.size).toBeGreaterThan(0);
                const flatValues = Array.from(ctx.artifacts.values())
                    .map((v: unknown) => JSON.stringify(v))
                    .join('\n');
                expect(flatValues).toContain(`"id":"${sampleId}"`);
                expect(flatValues).not.toContain(sampleUnknownKey);
            },
        );
    });

    describe('cis-reducers narrow-cast guard', () => {
        beforeEach(() => registerCisReducers(registry));
        it.each(buildCases(CIS_REGISTERED_TYPES))(
            'reducer $key with payload $label: no-throw + id lands on entry + no unknown-key leakage',
            ({ key, changes }) => {
                const fn = registry.get(key)!;
                expect(() =>
                    fn(ctx, sampleId, changes as WritableChanges),
                ).not.toThrow();
                expect(ctx.artifacts.size).toBeGreaterThan(0);
                const flatValues = Array.from(ctx.artifacts.values())
                    .map((v: unknown) => JSON.stringify(v))
                    .join('\n');
                expect(flatValues).toContain(`"id":"${sampleId}"`);
                expect(flatValues).not.toContain(sampleUnknownKey);
            },
        );
    });
});
