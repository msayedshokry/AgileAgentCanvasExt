/**
 * Phase 14 regression test — `ArtifactReducerDispatcher` deprecated-alias hint.
 *
 * Verifies that `warnIfDeprecatedAlias()` fires the migration log only
 * for the three deprecated kebab-case alias keys (`nfr`, `readiness`,
 * `sprint`), from all three dispatch paths (`dispatch`,
 * `dispatchDelete`, `dispatchLoad`), and stays silent for canonical
 * spellings + unknown keys.
 *
 * Pattern mirrors the vi.mock based style used in
 * src/workflow/artifact-store-update.test.ts — we mock
 * `../utils/logger` so we can assert the captured debug calls without
 * coupling to the channel implementation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Capture the debug fn from the mocked createLogger so we can assert
// against calls.  Only `debug` is asserted against — confirms the
// helper never escalates to info/warn/error.  If a future maintainer
// "upgrades" the alias hint to `logWarn`, this assertion would miss
// it intentionally; the intent is low-loudness informational.
const debugMock = vi.fn();

vi.mock('../utils/logger', () => ({
    // Only returns `debug` — see comment above.  Mocks `info`, `warn`,
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

// Minimal stub for `vscode.Uri` — the mock returned by `vi.mock('vscode')`
// at the top of `artifact-store-update.test.ts` produces a Uri-shaped
// object with the same shape.  We pass `unknown as any` to bypass the
// strict `vscode.Uri` literal type since we never exercise URI methods
// in this test.
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

describe('ArtifactReducerDispatcher — Phase 14 deprecated-alias migration hint', () => {
    let dispatcher: ArtifactReducerDispatcher;

    beforeEach(() => {
        debugMock.mockClear();
        dispatcher = new ArtifactReducerDispatcher();
    });

    /**
     * Identity invariant: the deprecated alias and its canonical
     * spelling point to the SAME registered handler.  Document this
     * expectation up front so the rest of the test set reads as
     * "warning fires + canonical handler runs".
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
                expect(debugMock).toHaveBeenCalledTimes(1);
                const message = debugMock.mock.calls[0][0] as string;
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
                expect(debugMock).not.toHaveBeenCalled();
            },
        );
    });

    describe('dispatchDelete()', () => {
        it.each(DEPRECATED_ALIASES)(
            "fires migration hint with source=dispatchDelete for deprecated alias '%s'",
            async (alias) => {
                await dispatcher.dispatchDelete(makeDeleteCtx(), alias, 'artifact-1');
                expect(debugMock).toHaveBeenCalledTimes(1);
                const message = debugMock.mock.calls[0][0] as string;
                expect(message).toMatch(/ArtifactReducerDispatcher\.dispatchDelete/);
                expect(message).toMatch(new RegExp(`deprecated alias '${alias}'`));
                expect(message).toMatch(new RegExp(`canonical '${DEPRECATED_CANONICAL[alias]}'`));
            },
        );

        it('is silent for canonical key', async () => {
            await dispatcher.dispatchDelete(makeDeleteCtx(), 'nfr-assessment', 'id');
            expect(debugMock).not.toHaveBeenCalled();
        });
    });

    describe('dispatchLoad()', () => {
        it.each(DEPRECATED_ALIASES)(
            "fires migration hint with source=dispatchLoad for deprecated alias '%s' and omits artifactId suffix",
            async (alias) => {
                await dispatcher.dispatchLoad(makeLoadCtx(), alias);
                expect(debugMock).toHaveBeenCalledTimes(1);
                const message = debugMock.mock.calls[0][0] as string;
                expect(message).toMatch(/ArtifactReducerDispatcher\.dispatchLoad/);
                expect(message).toMatch(new RegExp(`deprecated alias '${alias}'`));
                expect(message).toMatch(new RegExp(`canonical '${DEPRECATED_CANONICAL[alias]}'`));
                // dispatchLoad has no per-id artifact — verify the helper
                // does NOT print `(artifactId=undefined)` and instead omits
                // the suffix entirely.
                expect(message).not.toMatch(/\(artifactId=undefined\)/);
                expect(message).not.toMatch(/\(artifactId=/);
            },
        );

        it('is silent for canonical key', async () => {
            await dispatcher.dispatchLoad(makeLoadCtx(), 'nfr-assessment');
            expect(debugMock).not.toHaveBeenCalled();
        });
    });

    it('uses one logDebug per call (no accumulation across multiple calls)', async () => {
        await dispatcher.dispatch(makeUpdateCtx(), 'nfr', 'a', {});
        await dispatcher.dispatch(makeUpdateCtx(), 'nfr', 'b', {});
        await dispatcher.dispatch(makeUpdateCtx(), 'readiness', 'c', {});
        expect(debugMock).toHaveBeenCalledTimes(3);
    });

    /**
     * Positive-path guard — the most important behavioural guarantee.
     * A future refactor that accidentally short-circuits the
     * warn → dispatch pipeline (e.g. early-returns inside the helper,
     * or a guard that returns false when the alias is hit) would
     * silently break the underlying reducer call.  This block asserts:
     *   1. Warning fires (debug captured).
     *   2. The reducer registered under the alias key STILL runs.
     *   3. With the expected (ctx, artifactId, changes) triple.
     */
    describe('positive-path: warning + handler both run on deprecated alias', () => {
        it('dispatch() fires warning AND invokes the registered handler', async () => {
            const handler = vi.fn();
            dispatcher['registry'].set('nfr', handler);
            const ctx = makeUpdateCtx();
            const changes = { metadata: { status: 'draft' } };
            await dispatcher.dispatch(ctx, 'nfr', 'artifact-1', changes);
            expect(debugMock).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(ctx, 'artifact-1', changes);
        });

        it('dispatchDelete() fires warning AND invokes the registered handler', async () => {
            const handler = vi.fn();
            dispatcher['deleteRegistry'].set('readiness', handler);
            const ctx = makeDeleteCtx();
            await dispatcher.dispatchDelete(ctx, 'readiness', 'artifact-1');
            expect(debugMock).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(ctx, 'artifact-1');
        });

        it('dispatchLoad() fires warning AND invokes the registered handler', async () => {
            const handler = vi.fn();
            dispatcher['loadRegistry'].set('sprint', handler);
            const ctx = makeLoadCtx();
            await dispatcher.dispatchLoad(ctx, 'sprint');
            expect(debugMock).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(ctx);
        });
    });
});
