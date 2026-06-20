// Phase 14 regression test — ArtifactReducerDispatcher deprecated-alias hint.
//
// Verifies that warnIfDeprecatedAlias() fires the migration log only
// for the three deprecated kebab-case alias keys (nfr, readiness,
// sprint), from all three dispatch paths (dispatch, dispatchDelete,
// dispatchLoad), and stays silent for canonical spellings +
// unknown keys.
//
// Phase 15 round-5: switched assertion strategy from
// `expect(debugMock).toHaveBeenCalledTimes(N)` (which counts ALL
// debug calls including the dispatcher constructor's 3 "Built …"
// lines and every reducer body's "[…] Updated …" line) to a content
// filter that counts ONLY calls whose first arg contains the
// substring 'deprecated alias'. The alias-hint template literal
// starts with `[ArtifactReducerDispatcher.${source}] deprecated alias`
// — grepping on 'deprecated alias' matches the hint specifically and
// nothing else.
//
// This makes the assertions robust to:
//   - extra logDebug from the dispatcher constructor
//     (ArtifactReducerDispatcher.emit 3 "Built registry…" lines)
//   - extra logDebug from reducer bodies that fire AFTER the alias hint
//     (e.g. reduceNfrAssessment's "[tea-reductions] Updated NFR assessment:…")
//
// Pattern mirrors the vi.mock style used in
// src/workflow/artifact-store-update.test.ts — we mock
// '../utils/logger' so we can assert the captured debug calls without
// coupling to the channel implementation.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Capture the debug fn from the mocked createLogger so we can assert
// against calls. Only `debug` is asserted against — confirms the
// helper never escalates to info/warn/error. If a future maintainer
// "upgrades" the alias hint to logWarn, this assertion would miss
// it intentionally; the intent is low-loudness informational.
//
// Phase 15 fix: wrapped the let-binding in vi.hoisted(...) so the
// mock factory's closure capture happens BEFORE module evaluation
// completes. Without vi.hoisted, the `const debugMock = vi.fn()`
// declaration lands in the temporal dead zone when the auto-hoisted
// vi.mock(...) factory runs at import time — symptom was
// `ReferenceError: Cannot access 'debugMock' before initialization`
// at vitest start, masked pre-Phase 15 because this file was not
// in the include glob.
const { debugMock } = vi.hoisted(() => ({
    debugMock: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
    // Only returns `debug` — see comment above. Mocks `info`, `warn`,
    // `error` would create dead surface that future readers have to
    // skim; trim to the surface actually asserted.
    createLogger: vi.fn(() => ({ debug: debugMock })),
}));

// Import AFTER mock registration so the dispatcher picks up the mock.
import { ArtifactReducerDispatcher } from './reducer-registry';

/** Minimal stub for the reducers' per-operation ctx payload. */
function makeUpdateCtx() {
    return {
        artifacts: new Map<string, any>(),
        notifyChange: () => undefined,
        syncRequirementLinks: () => undefined,
        removeStoryLinksFromRequirements: () => undefined,
        reconcileDerivedState: () => undefined,
        sourceFolder: null,
        outputFormat: 'json' as const,
        findArtifactById: () => null,
    };
}

function makeDeleteCtx() {
    return {
        artifacts: new Map<string, any>(),
        sourceFiles: new Map<string, any>(),
        sourceFolder: null,
        notifyChange: () => undefined,
        getOutputChannel: () => ({ appendLine: () => undefined } as any),
        syncRequirementLinks: () => undefined,
        removeStoryLinksFromRequirements: () => undefined,
    };
}

// Minimal stub for vscode.Uri — we never exercise URI methods in this
// test, so a structural placeholder cast as `any` is sufficient. If
// the load reducer ever starts touching URI methods, swap this for a
// vi.mock('vscode') factory mirror of src/workflow/artifacts/...
const fakeUri: any = { scheme: 'file', fsPath: '/test', path: '/test' };

function makeLoadCtx(): any {
    return {
        fileUri: fakeUri,
        fileName: '',
        artifactType: '',
        data: {},
        isEpicsManifest: false,
        allEpics: [],
        standaloneStories: [],
        pendingUseCases: [],
        unresolvedUseCases: [],
        requirements: { functional: [], nonFunctional: [], additional: [] },
        standaloneReqsLoaded: { functional: false, nonFunctional: false, additional: false },
        projectName: '',
        loadValidationIssues: [],
        artifacts: new Map<string, any>(),
        sourceFiles: new Map<string, any>(),
        sourceFolder: fakeUri,
        normalizeEpicId: (id: string | null) => id,
        epicIdFromUseCaseId: (id: string | null) => id,
        loadEpicStoryRefs: async () => undefined,
        perIdKey: (prefix: string, id: string) => `${prefix}:${id}`,
    };
}

const DEPRECATED_ALIASES = ['nfr', 'readiness', 'sprint'];
const DEPRECATED_CANONICAL: Record<string, string> = {
    nfr: 'nfr-assessment',
    readiness: 'readiness-report',
    sprint: 'sprint-status',
};

/**
 * Content filter on `debugMock` — counts ONLY logDebug calls whose
 * first arg contains the substring `'deprecated alias'`. The hint
 * is emitted by `warnIfDeprecatedAlias()` only when the dispatch key
 * is a deprecated alias; reducer bodies and the dispatcher
 * constructor do not produce this substring. Robust to extra
 * logDebug noise that may be added in the future.
 */
function countAliasHints(): number {
    return debugMock.mock.calls.filter(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes('deprecated alias'),
    ).length;
}

/** Most recent alias hint. Filters on the SAME substring as
 *  `countAliasHints()` ('deprecated alias') so the two helpers
 *  can't disagree silently if a future maintainer adds a different
 *  '[ArtifactReducerDispatcher]…' logDebug (e.g. a constructor banner).
 *  Returns null if no alias hint has been emitted — callers must
 *  assert count >= 1 before calling this helper. */
function lastAliasHint(): string | null {
    const filtered = debugMock.mock.calls.filter(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes('deprecated alias'),
    );
    return filtered.length === 0 ? null : (filtered[filtered.length - 1][0] as string);
}

describe('ArtifactReducerDispatcher — Phase 14 deprecated-alias migration hint', () => {
    let dispatcher: ArtifactReducerDispatcher;

    beforeEach(() => {
        // Phase 15 round-5: only one mockClear needed. The content
        // filter on 'deprecated alias' immune to the constructor's
        // 3 "Built registry…" logDebug calls + reducer body logDebug
        // calls. Single clear is the pre-existing simple choice.
        debugMock.mockClear();
        dispatcher = new ArtifactReducerDispatcher();
    });

    /**
     * Identity invariant: the deprecated alias and its canonical
     * spelling point to the SAME registered handler.
     */
    describe('registry invariants', () => {
        it.each(Object.entries(DEPRECATED_CANONICAL))(
            "alias '%s' and canonical '%s' are both registered",
            (alias, canonical) => {
                expect(dispatcher.has(alias)).toBe(true);
                expect(dispatcher.has(canonical)).toBe(true);
            },
        );
    });

    describe('dispatch()', () => {
        it.each(DEPRECATED_ALIASES)(
            "fires migration hint with canonical mapping for deprecated alias '%s'",
            async (alias) => {
                await dispatcher.dispatch(makeUpdateCtx(), alias, 'artifact-1', {});
                expect(countAliasHints()).toBe(1);
                const message = lastAliasHint();
                expect(message).toMatch(/ArtifactReducerDispatcher\.dispatch/);
                expect(message).toMatch(new RegExp(`deprecated alias '${alias}'`));
                expect(message).toMatch(new RegExp(`canonical '${DEPRECATED_CANONICAL[alias]}'`));
                expect(message).toMatch(/\(artifactId=artifact-1\)/);
            },
        );

        it.each(['nfr-assessment', 'readiness-report', 'sprint-status', 'epic', 'vision', 'unknown-thing'])(
            'is silent for canonical/unknown key "%s"',
            async (key) => {
                await dispatcher.dispatch(makeUpdateCtx(), key, 'id', {});
                expect(countAliasHints()).toBe(0);
            },
        );
    });

    describe('dispatchDelete()', () => {
        it.each(DEPRECATED_ALIASES)(
            "fires migration hint with source=dispatchDelete for deprecated alias '%s'",
            async (alias) => {
                await dispatcher.dispatchDelete(makeDeleteCtx(), alias, 'artifact-1');
                expect(countAliasHints()).toBe(1);
                const message = lastAliasHint();
                expect(message).toMatch(/ArtifactReducerDispatcher\.dispatchDelete/);
                expect(message).toMatch(new RegExp(`deprecated alias '${alias}'`));
                expect(message).toMatch(new RegExp(`canonical '${DEPRECATED_CANONICAL[alias]}'`));
            },
        );

        it('is silent for canonical key', async () => {
            await dispatcher.dispatchDelete(makeDeleteCtx(), 'nfr-assessment', 'id');
            expect(countAliasHints()).toBe(0);
        });
    });

    describe('dispatchLoad()', () => {
        it.each(DEPRECATED_ALIASES)(
            "fires migration hint with source=dispatchLoad for deprecated alias '%s' and omits artifactId suffix",
            async (alias) => {
                await dispatcher.dispatchLoad(makeLoadCtx(), alias);
                expect(countAliasHints()).toBe(1);
                const message = lastAliasHint();
                expect(message).toMatch(/ArtifactReducerDispatcher\.dispatchLoad/);
                expect(message).toMatch(new RegExp(`deprecated alias '${alias}'`));
                expect(message).toMatch(new RegExp(`canonical '${DEPRECATED_CANONICAL[alias]}'`));
                // dispatchLoad has no per-id artifact — verify the helper
                // does NOT print (artifactId=undefined) and instead omits
                // the suffix entirely.
                expect(message).not.toMatch(/\(artifactId=undefined\)/);
                expect(message).not.toMatch(/\(artifactId=/);
            },
        );

        it('is silent for canonical key', async () => {
            await dispatcher.dispatchLoad(makeLoadCtx(), 'nfr-assessment');
            expect(countAliasHints()).toBe(0);
        });
    });

    it('uses one logDebug per call (no accumulation across multiple calls)', async () => {
        await dispatcher.dispatch(makeUpdateCtx(), 'nfr', 'a', {});
        await dispatcher.dispatch(makeUpdateCtx(), 'nfr', 'b', {});
        await dispatcher.dispatch(makeUpdateCtx(), 'readiness', 'c', {});
        // Three alias dispatches → three alias hints. Reducer body
        // logDebugs don't add to the alias-hint count (filtered out).
        expect(countAliasHints()).toBe(3);
    });

    /**
     * Positive-path guard — the most important behavioural guarantee.
     * A future refactor that accidentally short-circuits the
     * warn → dispatch pipeline (e.g. early-returns inside the helper,
     * or a guard that returns false when the alias is hit) would
     * silently break the underlying reducer call. This block asserts:
     *   1. Warning fires (alias-hint captured by content filter).
     *   2. The reducer registered under the alias key STILL runs.
     *   3. With the expected (ctx, artifactId, changes) triple.
     *
     * Phase 15 round-5: uses `dispatcher['registry']` bracket access
     * onto the private Map (no `as any` cast). Bracket-string indexing
     * bypasses TS's visibility check on private fields, so the line
     * compiles cleanly without an escape annotation; round-4 had a
     * dead `@ts-expect-error` inside the JSDoc block which was inert
     * and removed in round-5.
     */
    describe('positive-path: warning + handler both run on deprecated alias', () => {
        it('dispatch() fires warning AND invokes the registered handler', async () => {
            const handler = vi.fn();
            dispatcher['registry'].set('nfr', handler);
            const ctx = makeUpdateCtx();
            const changes = { metadata: { status: 'draft' } };
            await dispatcher.dispatch(ctx, 'nfr', 'artifact-1', changes);
            expect(countAliasHints()).toBe(1);
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(ctx, 'artifact-1', changes);
        });

        it('dispatchDelete() fires warning AND invokes the registered handler', async () => {
            const handler = vi.fn();
            dispatcher['deleteRegistry'].set('readiness', handler);
            const ctx = makeDeleteCtx();
            await dispatcher.dispatchDelete(ctx, 'readiness', 'artifact-1');
            expect(countAliasHints()).toBe(1);
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(ctx, 'artifact-1');
        });

        it('dispatchLoad() fires warning AND invokes the registered handler', async () => {
            const handler = vi.fn();
            dispatcher['loadRegistry'].set('sprint', handler);
            const ctx = makeLoadCtx();
            await dispatcher.dispatchLoad(ctx, 'sprint');
            expect(countAliasHints()).toBe(1);
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(ctx);
        });
    });
});
