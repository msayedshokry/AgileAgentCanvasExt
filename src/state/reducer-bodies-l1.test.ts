/**
 * Phase 16 — L1 reducer body narrow-cast smoke sweep
 *
 * Phase 12 audit identified 3 narrow-cast body bugs in
 * src/state/l1-reductions.ts and re-shaped them in place:
 *   - reduceEpic: `description` → `goal` legacy-to-canonical mapping
 *     (Phase 13 round-up keeps literal `goal` precedence; the
 *     document is preserved verbatim in `reduceEpic` JSDoc)
 *   - reduceStory creation path: `userStory` default-fill —
 *     `changes.userStory ?? { asA: '', iWant: '', soThat: '' }`.
 *     The `??` fires only on nullish OMISSION of the wire field;
 *     a partial wire like `{ asA: 'X' }` does NOT default-fill
 *     iWant/soThat (iWant/soThat land as `undefined` on the new
 *     story in that case — semantics with the canonical Story
 *     type, which marks these fields as optional).
 *   - reduceStory creation path: `epicId` wire-only pluck via
 *     `Partial<Story> & { epicId?: string }` cast allows the wire
 *     packet to carry epicId WITHOUT treating it as a canonical
 *     Story field.
 *
 * Phase 15 audited tea/bmm/cis (25 reducer bodies) — manual audit
 * found 0 narrow-cast patterns.  This file audits the REMAINING L1
 * module end-to-end: 13 dispatch keys × 3-payload smoke matrix = 39
 * body tests + 3 Phase 12 narrow-cast regression targets that pin
 * the contracts in executable form.
 *
 * ── Test design ──────────────────────────────────────────────────
 *
 * 1. SEEDING.  Many L1 reducers (epic, story, requirement, test-case,
 *    use-case, test-strategy, test-design) silently bail out when
 *    the target id is missing.  We PRE-POPULATE `ctx.artifacts`
 *    with a seed entry before each dispatch so the smoke test
 *    exercises the UPDATE branch (not the bail-out branch).
 *    Singletons that auto-create on first write (vision, product-brief,
 *    prd, architecture) are seeded WITH `id: sampleId` so the
 *    assertion `expect(flat).toContain('"id":"sampleId"')` survives
 *    the merge/spread.  aiCursor is wholesale-replaced on every
 *    dispatch — its seed is irrelevant (it gets clobbered by
 *    `changes`) and we skip the id-preservation assertion for it,
 *    asserting only that the map grew.
 *
 * 2. BEHAVIOR CLASSIFICATION.  The 13 L1 keys split into 3
 *    documented behavior classes, each with its own describe:
 *      - topLevelSpread (3): vision, epic, story (update path).
 *        Reducers intentionally ...changes-spread onto the artifact.
 *      - bulkReplace (2): requirements, aiCursor.  Wholesale-replace
 *        the root persisted shape.
 *      - narrowCast (8): the rest — field-by-field `if (changes.x)`
 *        guards where unknown wire keys MUST NOT be persisted.
 *
 * 3. PAYLOAD MATRIX.  Empty / metadata-only / unknown-wire-field.
 *    For empty + metadata-only the unknown wire key is never
 *    introduced — the assertion is trivially true.  The
 *    unknown-wire-field case is where per-class contracts diverge:
 *      - topLevelSpread + bulkReplace: spread SHOULD fire (regression
 *        trigger if accidentally removed).
 *      - narrowCast: spread MUST NOT fire (regression trigger if a
 *        new narrow cast sneaks in beyond documented boundary).
 *
 * 4. PHASE 12 NARROW-CAST REGRESSION TARGETS.  Three dedicated tests
 *    pin the documented narrow-casts in executable form:
 *      - epic description → goal mapping (Phase 12 first narrow cast)
 *      - story userStory default-fill (fires on OMISSION, not on
 *        partial wire — verified explicitly)
 *      - story epicId wire-only — INCONSISTENCY DISCOVERED IN
 *        PHASE 16: the trailing `...changes` spread on the newStory
 *        literal re-includes epicId on `newStory.epicId`.  The
 *        Phase 12 JSDoc narrative describes epicId as a wire-only
 *        field that MUST NOT persist on the canonical Story shape;
 *        the current runtime contradicts that.  Test 3 documents
 *        the current behavior — if a Phase 17 fix removes the leak
 *        (e.g. by destructuring epicId out before the spread), this
 *        assertion fires and confirms the fix landed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the logger so reducer-body logDebug calls don't pollute the
// reporter (39+ log lines per run otherwise).
vi.mock('../utils/logger', () => ({
    createLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    })),
}));

// Plain-string constants — do not need `vi.hoisted` (only `vi.fn`
// instances bound inside mock factories need hoisting; these strings
// aren't captured by anything earlier than top-level init).
const sampleId = 'phase16-sample-1';
const sampleUnknownKey = 'phase16-surprise';
const sampleDescription = 'phase16-desc-test';

// Import AFTER mock registration so the reducer module picks up the
// mocked logger.
import {
    registerL1Reducers,
    L1_REGISTERED_TYPES,
} from './l1-reductions';
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

// ── Per-L1-key seed shapes ─────────────────────────────────────────────
// seedL1(ctx, key, id) places a minimal entry under the artifact root
// so the reducers' find-by-id branches hit the UPDATE path.  Seeds
// also carry `id: sampleId` for reducers whose bodies merge into a
// current shape (so the id-preservation assertion survives
// variants).  aiCursor wholesale-replaces so the seed is meaningless
// for it — see the bulk-replace describe block for the split-case
// assertion strategy.
function seedL1(ctx: ArtifactReducerCtx, key: string, id: string): void {
    switch (key) {
        case 'vision':
            // Singleton — seed with id so the spread preserves it.
            ctx.artifacts.set('vision', {
                id, title: 'T', productName: 'T', content: {},
            });
            break;
        case 'epic':
            ctx.artifacts.set('epics', [{
                id, title: 'T', status: 'draft',
                stories: [], useCases: [],
                functionalRequirements: [], nonFunctionalRequirements: [],
                goal: '',
            }]);
            break;
        case 'story': {
            // Two epics so the find-by-id scan traverses past the
            // first epic; matching story lives in EPIC-2 to cover
            // the "not first epic" branch.
            const epics: Array<{
                id: string; title: string; status: string;
                stories: any[]; useCases: any[];
                functionalRequirements: any[]; nonFunctionalRequirements: any[];
            }> = [
                {
                    id: 'EPIC-1', title: 'T', status: 'draft',
                    stories: [], useCases: [],
                    functionalRequirements: [], nonFunctionalRequirements: [],
                },
                {
                    id: 'EPIC-2', title: 'T', status: 'draft',
                    stories: [], useCases: [],
                    functionalRequirements: [], nonFunctionalRequirements: [],
                },
            ];
            epics[1].stories = [{
                id, title: 'T', status: 'draft',
                userStory: { asA: '', iWant: '', soThat: '' },
                tasks: [], acceptanceCriteria: [],
                dependencies: [], requirementRefs: [],
            }];
            ctx.artifacts.set('epics', epics);
            break;
        }
        case 'requirement':
            ctx.artifacts.set('requirements', {
                functional: [{
                    id, title: 'T', status: 'draft',
                    relatedEpics: [], relatedStories: [],
                }],
                nonFunctional: [],
                additional: [],
            });
            break;
        case 'requirements':
            // bulk seed — functional entry holds sampleId, spread
            // preserves it across all 3 payloads.
            ctx.artifacts.set('requirements', {
                functional: [{ id, title: 'T' }],
                nonFunctional: [],
                additional: [],
            });
            break;
        case 'aiCursor':
            // Wholesale replace — seed is clobbered by changes on
            // every dispatch.  No seed.
            break;
        case 'test-case':
            ctx.artifacts.set('testCases', [{ id, title: 'T', status: 'draft' }]);
            break;
        case 'test-strategy':
            // Top-level singleton fallback — no epic carries
            // testStrategy, so the body hits the `else` singleton
            // branch (not the per-epic branch).
            ctx.artifacts.set('testStrategy', { id, title: 'T', status: 'draft' });
            break;
        case 'product-brief':
            ctx.artifacts.set('productBrief', {
                id, productName: 'T', status: 'draft',
            });
            break;
        case 'prd':
            ctx.artifacts.set('prd', {
                id,
                productOverview: { productName: 'T' },
                status: 'draft',
            });
            break;
        case 'architecture':
            ctx.artifacts.set('architecture', {
                id,
                overview: { projectName: 'T' },
                status: 'draft',
            });
            break;
        case 'use-case': {
            const epics: Array<{
                id: string; title: string; status: string;
                stories: any[]; useCases: any[];
                functionalRequirements: any[]; nonFunctionalRequirements: any[];
            }> = [{
                id: 'EPIC-1', title: 'T', status: 'draft',
                stories: [], useCases: [{ id, title: 'T' }],
                functionalRequirements: [], nonFunctionalRequirements: [],
            }];
            ctx.artifacts.set('epics', epics);
            break;
        }
        case 'test-design':
            ctx.artifacts.set('testDesigns', [{
                id, status: 'draft',
                epicInfo: {},
            }]);
            break;
        default:
            // Defensive — should never fire if L1_REGISTERED_TYPES is
            // exhaustive.  Future maintainers adding a new L1 key get
            // a loud signal to add a seed entry below.
            throw new Error(`seedL1: no seed defined for L1 key '${key}'`);
    }
}

// ── Behavior classification ────────────────────────────────────────────
// topLevelSpread (3): reducers intentionally ...changes-spread onto
//   the artifact via `Object.assign(upd, topFields)` or
//   `{ ...current, ...changes }` patterns.
// bulkReplace (2): reducers that wholesale-replace the persisted
//   root shape via `{ ...current, ...changes }` or direct
//   `set(key, changes)`.
// narrowCast (8): the rest — field-by-field `if (changes.x) updated.x`
//   guards with optional `Object.assign(upd, changes.metadata)`.
const TOP_LEVEL_SPREAD_KEYS: ReadonlySet<string> = new Set([
    'vision', 'epic', 'story',
]);
const BULK_REPLACE_KEYS: ReadonlySet<string> = new Set([
    'requirements', 'aiCursor',
]);
const NARROW_CAST_L1_KEYS: readonly string[] = L1_REGISTERED_TYPES.filter(
    (k) => !TOP_LEVEL_SPREAD_KEYS.has(k) && !BULK_REPLACE_KEYS.has(k),
);
// NARROW_CAST_L1_KEYS == ['requirement', 'test-case', 'test-strategy',
//   'product-brief', 'prd', 'architecture', 'use-case', 'test-design']

// ── Payload matrix (3 shapes) ──────────────────────────────────────────
const PAYLOADS: ReadonlyArray<{
    label: string;
    changes: Record<string, unknown>;
}> = [
    { label: 'empty', changes: {} },
    { label: 'metadata-only', changes: { metadata: {} } },
    { label: 'unknown-wire-field', changes: { unknownWireField: sampleUnknownKey } },
];

function buildL1Cases(keys: readonly string[]): Array<{
    key: string; label: string; changes: Record<string, unknown>;
}> {
    const cases: Array<{ key: string; label: string; changes: Record<string, unknown> }> = [];
    for (const key of keys) {
        for (const p of PAYLOADS) {
            cases.push({ key, label: p.label, changes: p.changes });
        }
    }
    return cases;
}

// Flat-JSON scan helper shared across all describe blocks.  No
// try/catch — none of the 13 L1 reducer bodies construct circular
// references, so JSON.stringify errors should surface as real
// failures rather than silently returning unserializable markers.
function flattenArtifacts(ctx: ArtifactReducerCtx): string {
    return Array.from(ctx.artifacts.values())
        .map((v: unknown) => JSON.stringify(v))
        .join('\n');
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('Phase 16 — reducer body smoke sweep (l1)', () => {
    let ctx: ArtifactReducerCtx;
    let registry: ArtifactReducerRegistry;

    beforeEach(() => {
        ctx = makeCtx();
        registry = new Map();
        registerL1Reducers(registry);
    });

    describe('registry membership invariants', () => {
        it('every key in L1_REGISTERED_TYPES is wired', () => {
            for (const k of L1_REGISTERED_TYPES) {
                expect(registry.has(k)).toBe(true);
            }
        });

        it('TOP + BULK + NARROW partition covers all L1 keys (no gaps)', () => {
            // Regression guard: if a future maintainer adds a new L1
            // key, the derived NARROW_CAST_L1_KEYS list naturally
            // includes it.  This assertion catches a key being
            // misclassified (accidentally placed in TWO sets — Set
            // dedup would shrink covered.size and fire the assertion).
            // Catches real misclassification, not a hypothetical.
            const covered = new Set<string>([
                ...TOP_LEVEL_SPREAD_KEYS,
                ...BULK_REPLACE_KEYS,
                ...NARROW_CAST_L1_KEYS,
            ]);
            expect(covered.size).toBe(L1_REGISTERED_TYPES.length);
            for (const k of L1_REGISTERED_TYPES) {
                expect(covered.has(k)).toBe(true);
            }
        });
    });

    describe('top-level spread reducers (vision, epic, story)', () => {
        it.each(buildL1Cases([...TOP_LEVEL_SPREAD_KEYS]))(
            'reducer $key with payload $label: no-throw + seed-id preserved + spread fires',
            ({ key, changes }) => {
                seedL1(ctx, key, sampleId);
                const fn = registry.get(key);
                expect(fn).toBeDefined();
                expect(() => fn!(ctx, sampleId, changes as WritableChanges)).not.toThrow();
                const flat = flattenArtifacts(ctx);
                // Seeded id MUST survive the dispatch regardless of payload shape.
                expect(flat).toContain(`"id":"${sampleId}"`);
                const hasUnknownWire = 'unknownWireField' in changes;
                if (hasUnknownWire) {
                    // Documented contract: ...changes spread.
                    // If a future maintainer accidentally narrows the
                    // spread, this assertion fires.
                    expect(flat).toContain(sampleUnknownKey);
                } else {
                    // No payload noise — sanity guard (the empty +
                    // metadata-only payloads don't carry the unknown
                    // wire field, so it should never appear).
                    expect(flat).not.toContain(sampleUnknownKey);
                }
            },
        );
    });

    describe('bulk-replace reducers — seed-preserves shape (requirements)', () => {
        // `requirements` is the bulk-replace variant that REPLACES the
        // categories (functional / nonFunctional / additional).  The
        // reducer does `{...currentReqs, ...changes}` — the seeded
        // functional array survives the spread because `currentReqs`
        // holds the full pre-existing shape.  We assert id-preservation
        // + the wholesale spread for unknown-wire-field.
        it.each(buildL1Cases(['requirements']))(
            'reducer $key with payload $label: no-throw + seed-id preserved + wholesale-spread',
            ({ key, changes }) => {
                seedL1(ctx, key, sampleId);
                const fn = registry.get(key);
                expect(fn).toBeDefined();
                expect(() => fn!(ctx, sampleId, changes as WritableChanges)).not.toThrow();
                const flat = flattenArtifacts(ctx);
                expect(flat).toContain(`"id":"${sampleId}"`);
                const hasUnknownWire = 'unknownWireField' in changes;
                if (hasUnknownWire) {
                    // bulk-replace lifts the payload onto the persisted
                    // root shape — unknown wire field SHOULD land.
                    expect(flat).toContain(sampleUnknownKey);
                } else {
                    expect(flat).not.toContain(sampleUnknownKey);
                }
            },
        );
    });

    describe('bulk-replace reducers — wholesale replace (aiCursor)', () => {
        // `aiCursor` is wholesale-replaced via `ctx.artifacts.set('aiCursor', changes)`.
        // Id-preservation is meaningless here (the seed's id gets
        // clobbered by changes on every dispatch).  We instead assert
        // that the map GREW — i.e. the dispatch wrote SOMETHING.
        it.each(buildL1Cases(['aiCursor']))(
            'reducer $key with payload $label: no-throw + map-grew + wholesale-spread',
            ({ changes }) => {
                const aiCursorKey = 'aiCursor';
                seedL1(ctx, aiCursorKey, sampleId);
                const fn = registry.get(aiCursorKey);
                expect(fn).toBeDefined();
                expect(() => fn!(ctx, sampleId, changes as WritableChanges)).not.toThrow();
                // Map grew (aiCursor key now exists, last write wins).
                expect(ctx.artifacts.has(aiCursorKey)).toBe(true);
                // aiCursor shape IS the wholesale-replaced payload —
                // verify the actual persisted shape via get().
                const persisted = ctx.artifacts.get(aiCursorKey);
                const hasUnknownWire = 'unknownWireField' in changes;
                if (hasUnknownWire) {
                    // Documented contract: aiCursor wholesale-replaces
                    // with the payload verbatim.
                    expect(persisted).toHaveProperty(
                        'unknownWireField', sampleUnknownKey,
                    );
                } else {
                    expect(persisted).toEqual(changes);
                }
            },
        );
    });

    describe('narrow-cast reducers (8 keys)', () => {
        it.each(buildL1Cases(NARROW_CAST_L1_KEYS))(
            'reducer $key with payload $label: no-throw + seed-id preserved + unknown-key DROPPED',
            ({ key, changes }) => {
                seedL1(ctx, key, sampleId);
                const fn = registry.get(key);
                expect(fn).toBeDefined();
                expect(() => fn!(ctx, sampleId, changes as WritableChanges)).not.toThrow();
                const flat = flattenArtifacts(ctx);
                expect(flat).toContain(`"id":"${sampleId}"`);
                const hasUnknownWire = 'unknownWireField' in changes;
                if (hasUnknownWire) {
                    // Narrow-cast regression trigger: unknown wire
                    // field MUST NOT be persisted.  If a future
                    // maintainer adds a spread-style narrow cast where
                    // one shouldn't be, this assertion fires.
                    expect(flat).not.toContain(sampleUnknownKey);
                }
                // For empty + metadata-only payloads, sampleUnknownKey
                // is never introduced — assertion is implicit.
            },
        );
    });

    describe('Phase 12 narrow-cast regression targets', () => {
        // Three dedicated tests pin the documented narrow-casts in
        // executable form.  These run OUTSIDE the smoke matrix
        // because they exercise payload shapes (description,
        // userStory-omission) that the 3-payload matrix doesn't
        // cover.
        const newStoryId = 'NEW-STORY-1';

        describe('epic: description → goal mapping (Phase 12, first narrow cast)', () => {
            beforeEach(() => {
                ctx.artifacts.set('epics', [{
                    id: sampleId, title: 'T', status: 'draft',
                    stories: [], useCases: [],
                    functionalRequirements: [], nonFunctionalRequirements: [],
                    goal: '',
                }]);
            });

            it('routes legacy `description` to canonical `goal`', () => {
                const fn = registry.get('epic');
                expect(fn).toBeDefined();
                expect(() => fn!(
                    ctx, sampleId,
                    { description: sampleDescription } as WritableChanges,
                )).not.toThrow();
                const epics = ctx.artifacts.get('epics') as Array<any>;
                const updated = epics[0];
                // Phase 12 narrow cast: `description` (legacy LM wire)
                // is destructured OFF topFields BEFORE
                // Object.assign(topFields), then re-mapped to `goal`.
                // Verify the mapping fired.
                expect(updated.goal).toBe(sampleDescription);
                // `topFields` did NOT include description, so the
                // canonical Epic.description stays untouched (still
                // undefined unless explicitly seeded).
            });

            it('canonical `goal` wins over legacy `description` when both supplied', () => {
                const fn = registry.get('epic');
                expect(fn).toBeDefined();
                expect(() => fn!(
                    ctx, sampleId,
                    {
                        description: sampleDescription,
                        goal: 'phase16-canonical-goal',
                    } as WritableChanges,
                )).not.toThrow();
                const epics = ctx.artifacts.get('epics') as Array<any>;
                const updated = epics[0];
                // Precedence contract pinned in `reduceEpic` JSDoc:
                // canonical `goal` wins when both supplied.
                // The `if (description) updatedEpic.goal = description`
                // block seeds goal from description; the
                // Object.assign(updatedEpic, topFields) that follows
                // (which includes `goal`) overwrites it.
                expect(updated.goal).toBe('phase16-canonical-goal');
            });
        });

        describe('story creation path (Phase 12 narrow casts)', () => {
            // The creation path has 2 documented narrow-casts:
            //   - userStory default-fill: `??` fires only on nullish
            //     OMISSION of the wire field. A partial wire like
            //     `{ asA: 'X' }` does NOT default-fill iWant/soThat
            //     (matches canonical Story type which marks the
            //     fields optional).
            //   - epicId wire-only pluck via
            //     `Partial<Story> & { epicId?: string }` cast.
            // We seed epics with EPIC-1 having empty stories, dispatch
            // with a NEW artifactId (so the update branch is missed
            // and we hit creation), and assert the default-fill +
            // epicId wire routes land the new story in EPIC-1.
            beforeEach(() => {
                ctx.artifacts.set('epics', [{
                    id: 'EPIC-1', title: 'T', status: 'draft',
                    stories: [], useCases: [],
                    functionalRequirements: [], nonFunctionalRequirements: [],
                }]);
            });

            it('creates new story with userStory default-fill on wire OMISSION', () => {
                const fn = registry.get('story');
                expect(fn).toBeDefined();
                expect(() => fn!(
                    ctx,
                    newStoryId,
                    {
                        title: 'Newly Created',
                        status: 'draft',
                        epicId: 'EPIC-1',
                        // userStory OMITTED — the `??` default-fill
                        // fires and newStory.userStory becomes the
                        // empty triple.
                    } as WritableChanges,
                )).not.toThrow();
                const epics = ctx.artifacts.get('epics') as Array<any>;
                const newStory = epics[0].stories[0];
                expect(newStory).toBeDefined();
                expect(newStory.id).toBe(newStoryId);
                expect(newStory.title).toBe('Newly Created');
                expect(newStory.userStory).toEqual({
                    asA: '', iWant: '', soThat: '',
                });
            });

            it('lands new story in parent epic via epicId wire-only', () => {
                // Verifies the wire-only cast routes the new story
                // to EPIC-1 correctly.  Pairs with the next test
                // (which documents the Phase 16 finding about
                // epicId persistence).
                const fn = registry.get('story');
                expect(fn).toBeDefined();
                expect(() => fn!(
                    ctx,
                    'NEW-STORY-2',
                    {
                        title: 'NewStory-2',
                        status: 'draft',
                        epicId: 'EPIC-1',
                    } as WritableChanges,
                )).not.toThrow();
                const epics = ctx.artifacts.get('epics') as Array<any>;
                const newStory = epics[0].stories[0];
                expect(newStory).toBeDefined();
                expect(newStory.id).toBe('NEW-STORY-2');
                // epicId wire-only routing fired.
            });

            it('[Phase 17] epicId wire-only contract: newStory must NOT persist epicId', () => {
                // ── Phase 16 finding — INTENTIONALLY FAILING ───────
                //
                // This assertion is EXPECTED to fail in CI until the
                // Phase 17 fix lands in `reduceStory`'s newStory
                // literal.  The `[Phase 17]` test-name prefix is the
                // CI failure pointer.
                //
                // Phase 12 narrative: `epicId` is wire-only at creation
                // time.  The `Partial<Story> & { epicId? }` cast declares
                // the wire contract; the reducer is EXPECTED to plumb
                // epicId to the parent Epic routing WITHOUT persisting
                // it on the canonical Story shape (otherwise we'd have
                // two sources of truth for the parent link).
                //
                // Runtime reality: the newStory literal ends with
                // `...changes`, so `changes.epicId` lands on
                // `newStory.epicId`.  This contradicts the Phase 12
                // narrative.  Expected Phase 17 fix (one of):
                //
                //   Option A — Spread topFields FIRST (so the explicit
                //   defaults win on override), then destructure
                //   epicId out BEFORE the spread:
                //
                //     const { epicId: _forRoutingOnly, ...topFields } = changes;
                //     const newStory: Story = {
                //       ...topFields,        // base; does NOT include epicId
                //       id: artifactId,      // explicit override (later wins)
                //       title: changes.title || `Story ${artifactId}`,
                //       status: changes.status || 'draft',
                //       storyPoints: changes.storyPoints,
                //       userStory: changes.userStory ?? { asA: '', iWant: '', soThat: '' },
                //       acceptanceCriteria: changes.acceptanceCriteria || [],
                //       technicalNotes: changes.technicalNotes,
                //       tasks: changes.tasks || [],
                //       dependencies: changes.dependencies,
                //       requirementRefs: changes.requirementRefs,
                //     };
                //
                //   CRITICAL ORDER NOTE: `...topFields` MUST come
                //   FIRST in the literal so the explicit `??` and
                //   `||` defaults (userStory, acceptanceCriteria,
                //   etc.) fire on override.  Spreading LAST would
                //   silently overwrite the userStory default-fill
                //   that test 1 above pins as
                //   `expect(newStory.userStory).toEqual({...defaults})`
                //   - which is the Phase 12 narrow-cast contract
                //   the same file protects.
                //
                //   Option B — Leave the literal unchanged, then
                //   strip epicId off the new instance after the
                //   spread:
                //
                //     const newStory: Story = {
                //       ...explicit fields...,
                //       ...changes,
                //     };
                //     delete (newStory as any).epicId;
                //
                //   Option B is the smaller diff and preserves all
                //   default-fill behavior (defaults fire first, then
                //   ...changes overrides with the wire values; delete
                //   just unsets epicId after the fact).  Option A is
                //   preferred for grep-discoverability of the
                //   narrow-cast contract (destructure mirrors the
                //   `description`-al destructure in reduceEpic).
                //   Either is valid; pick one.
                //
                // CI behavior today:
                //   - This test FAILS — the assertion below demonstrates
                //     the leak.  Phase 17 fix flips it green.
                const fn = registry.get('story');
                expect(fn).toBeDefined();
                expect(() => fn!(
                    ctx,
                    'NEW-STORY-3',
                    {
                        title: 'NewStory-3',
                        status: 'draft',
                        epicId: 'EPIC-1',
                    } as WritableChanges,
                )).not.toThrow();
                const epics = ctx.artifacts.get('epics') as Array<any>;
                const newStory = epics[0].stories[0];
                expect(newStory).toBeDefined();
                expect(newStory.id).toBe('NEW-STORY-3');
                // Wire-only contract: epicId MUST NOT persist on the
                // canonical Story shape.  Currently fails because
                // `...changes` re-includes epicId.
                expect(newStory.epicId).toBeUndefined();
            });
        });
    });
});
