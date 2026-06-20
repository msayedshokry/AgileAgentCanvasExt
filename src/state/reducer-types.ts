import type * as vscode from 'vscode';
import type {
    BmadMetadata,
    BmadArtifact,
    Epic,
    Story,
    BmadArtifacts,
    BmadArtifactTypeMap,
    ArtifactChanges as _ArtifactChanges,
} from '../types';

/**
 * Re-export so {@link ArtifactReducerRegistry} can reference
 * `keyof BmadArtifactTypeMap` without consumers having to import
 * the canonical map directly from `../types`.  See the Phase 12
 * dispatch typing for context.
 */
export type { BmadArtifactTypeMap } from '../types';


/**
 * Phase 12: drop the local `Partial<any>` escape hatch by re-exporting
 * the canonical `ArtifactChanges<T>` from `types/index.ts`. The canonical
 * version is parameterised on `T` so callers see per-type narrowing when
 * they supply a specific `T`.  Reducers that need the most-defensive
 * `Partial<any>` shape can still cast inside their body.
 */
export type ArtifactChanges<T = BmadArtifact> = _ArtifactChanges<T>;

/**
 * Reducer types — Phase 9 extraction of the `updateArtifact` switch (was ~825 lines)
 * from ArtifactStore.  Each artifact type gets a pure async function that mutates
 * the artifacts Map in place.
 *
 * The dispatch flow is:
 *   updateArtifact(type, id, changes)
 *     → harness pre-flight
 *     → registry.get(type)(ctx, id, changes)
 *     → reconcileDerivedState / notifyChange / syncToFiles
 *
 * Phase 12: the local `Partial<any>` re-export that used to live here has been
 * removed.  Callers now consume the canonical `ArtifactChanges<T>` from
 * `types/index.ts` (re-exported above as the generic
 * `ArtifactChanges<T = BmadArtifact>`).  Each reducer names its `T`
 * literally — e.g. `ArtifactReducerFn<'epic'>` — so the `changes` parameter
 * type narrows to `Partial<Epic> & { metadata?: BmadMetadata }` inside
 * that reducer.
 */

/**
 * The dependency-injection bag passed to each reducer.  Mirrors the
 * callback deps used by `SprintStatusSync`, `ArtifactMigrator`, and
 * `ArtifactRepairer` — keeps reducers side-effect-bounded so they can
 * be unit-tested with a mock ctx.
 */
export interface ArtifactReducerCtx {
    /** Mutable store state — reducers `set/delete` on this map. */
    artifacts: Map<string, any>;
    /** Fire the change event + mark dirty. */
    notifyChange: () => void;
    /** Bidirectional epic ↔ requirement link sync. */
    syncRequirementLinks: (
        epicId: string,
        oldReqIds: string[],
        newReqIds: string[],
        reqType: 'functional' | 'nonFunctional',
    ) => void;
    /** Remove story refs from requirements when stories are gone. */
    removeStoryLinksFromRequirements: (storyIds: string[]) => void;
    /** Recompute cross-artifact derived state (testDesigns → testCases, etc.). */
    reconcileDerivedState: () => void;
    /** Source folder URI for disk writes (e.g. standalone story file). */
    sourceFolder: vscode.Uri | null;
    /** Output format — 'json' / 'markdown' / 'dual'. */
    outputFormat: 'json' | 'markdown' | 'dual';
    /** Find an artifact by id (for harness pre-flight). */
    findArtifactById: (id: string) => { type: string; artifact: any } | null;
}

/**
 * A reducer applies `changes` to a single artifact found by `artifactId`
 * within `ctx.artifacts`.  May mutate the map, fire `notifyChange()`
 * directly when intermediate writes need to flush, or return without
 * doing anything if the artifact can't be found.
 *
 * Phase 12: parameterised on `T extends keyof BmadArtifactTypeMap & string`.
 * Each reducer declares its `T` literally — e.g.
 * `ArtifactReducerFn<'epic'>` — so the `changes` parameter type
 * narrows to `Partial<Epic> & { metadata?: BmadMetadata }` inside that
 * reducer, and the registry's heterogeneous Map stores reducers as
 * `ArtifactReducerFn<any>` to avoid variance friction at the collection
 * layer.
 *
 * A reducer MUST NOT call `reconcileDerivedState` / `notifyChange`
 * for the final pass — those happen in the orchestrator after the
 * reducer returns.  (Some reducers DO call them mid-flight, e.g. the
 * story reducer writes a standalone file before the orchestrator's
 * tail — those are intermediate, not terminal.)
 *
 * ## Dropping the `Partial<any>` escape hatch (and the indexed-access pattern)
 *
 * Before Phase 12, the `changes` param type was declared as
 * `ArtifactChanges = Partial<any> & { metadata?: BmadMetadata }`,
 * which silently accepted ANY shape from callers.  Phase 12 replaces
 * that with the canonical `ArtifactChanges<T>` (= `Partial<T> & { metadata? }`)
 * from `types/index.ts`.
 *
 * Before Phase 17, reducer bodies merged the wire packet's content
 * fields via an indexed-access for-loop boilerplate that was
 * duplicated 26+ times across the cis/tea/bmm/l1 reducer modules:
 *
 *     for (const f of [
 *         'a', 'b', 'c',
 *     ]) {
 *         if ((changes as any)[f] !== undefined) upd[f] = (changes as any)[f];
 *     }
 *
 * Phase 17 collapsed that loop into the canonical "parts" pattern:
 *
 *     Object.assign(upd, pickChanges(changes, ['a', 'b', 'c']));
 *
 * `pickChanges` lives in `src/state/reducer-helpers.ts`.  Phase 18
 * (commit `0a9641f`) lifted the per-file copies added by Phase 17
 * (commits `fec166e` cis, `1f47652` tea, `06adb75` bmm, `5aa0931` l1)
 * into that single shared module; all four reducer files now
 * `import { pickChanges } from './reducer-helpers'`.  Each call
 * site passes a `readonly string[]` allowlist of the content
 * fields that reducer body is willing to absorb from the wire packet.
 *
 * # Per-file allowlist convention
 *
 * The four reducer modules use two stylistic flavours of the
 * allowlist argument; both forms are accepted by
 * `pickChanges(changes: any, fieldList: readonly string[])` and
 * both are grep-discoverable:
 *
 * - **Inline array literal** (cis, tea, bmm style) — the field list
 *   appears directly inside the `Object.assign(upd, pickChanges(...))`
 *   call.  Used in 25 call sites across cis (4), tea (7), and bmm
 *   (14).  The field list is grep-discoverable by searching
 *   `pickChanges(changes, [` in each consuming file.
 *
 * - **Const-var declared inside the reducer body** (l1 style) —
 *   used by `l1-reductions.ts::reduceTestDesign`, which declares its
 *   `contentFields` array as a `const` inside the reducer body and
 *   passes the variable name: `Object.assign(updatedTD, pickChanges(changes, contentFields))`.
 *   The const-var form keeps the field list close to the reducer
 *   body that consumes it.
 *
 * Future reducers adopting the canonical pattern may use either
 * form — both are equally valid callers of the shared helper.
 */

/**
 * The full registry: maps artifact type strings (kebab-case + aliases)
 * to their reducer.  Built once at store construction time.
 *
 * Phase 12: typed as `Map<string, ArtifactReducerFn<any>>` for variance
 * safety — each entry's `T` literal is preserved via `Map.set(type, fn)`
 * call sites (see `l1/tea/bmm/cis-reductions.ts`), but the heterogeneous
 * collection is widened to `any` to avoid variance friction at the
 * type system level when calling `fn(ctx, id, changes)` with a union-shaped
 * changes argument from the orchestrator.
 */
/**
 * A reducer applies `changes` to a single artifact found by `artifactId`
 * within `ctx.artifacts`.  May mutate the map, fire `notifyChange()`
 * directly when intermediate writes need to flush, or return without
 * doing anything if the artifact can't be found.
 *
 * Phase 12: parameterised on `T extends keyof BmadArtifactTypeMap & string`.
 * Each reducer declares its `T` literally — e.g.
 * `ArtifactReducerFn<'epic'>` — so the `changes` parameter type
 * narrows to `Partial<Epic> & { metadata?: BmadMetadata }` inside that
 * reducer, and the registry's heterogeneous Map stores reducers as
 * `ArtifactReducerFn<any>` to avoid variance friction at the collection
 * layer.
 *
 * A reducer MUST NOT call `reconcileDerivedState` / `notifyChange`
 * for the final pass — those happen in the orchestrator after the
 * reducer returns.  (Some reducers DO call them mid-flight, e.g. the
 * story reducer writes a standalone file before the orchestrator's
 * tail — those are intermediate, not terminal.)
 */
export type ArtifactReducerFn<
    T extends keyof BmadArtifactTypeMap & string = keyof BmadArtifactTypeMap & string,
> = (
    ctx: ArtifactReducerCtx,
    artifactId: string,
    changes: ArtifactChanges<BmadArtifactTypeMap[T]>,
) => void | Promise<void>;

export type ArtifactReducerRegistry = Map<string, ArtifactReducerFn<any>>;

/** A reducer module exposes a register hook that adds its cases to a map. */
export type ArtifactReducerRegistration = (registry: ArtifactReducerRegistry) => void;

/**
 * Phase 12: writable changes shape used in harness-pre-flight auto-fix
 * loops. The pre-flight mutates the changes object by string key when
 * applying auto-fixed fields, which the canonical
 * `ArtifactChanges<BmadArtifact>` union does not permit (arbitrary
 * string-key indexing is rejected by TS). This named alias declares
 * the *writable* contract explicitly so the cast at the auto-fix site
 * is discoverable and lint-greppable, not an ad-hoc
 * `Record<string, any>`.
 *
 * NB: the actual dispatch path still passes `ArtifactChanges<T>` to
 * reducers; only the harness pre-flight widens locally.
 */
export type WritableChanges = Record<string, any>;

// ──────────────────────────────────────────────────────────────────────
// Phase 10: Delete reducer types — mirror of update reducers for the
// `deleteArtifact` switch.  Same per-domain module pattern, but the
// dependency-injection bag differs (no `changes`, no output-format
// writing; needs sourceFiles + sourceFolder for disk cleanup on
// `epic` and `story` deletes).
// ──────────────────────────────────────────────────────────────────────

/**
 * DI bag passed to delete reducers.  Distinct from `ArtifactReducerCtx`
 * because delete cases do not mutate field-level state (no `changes`)
 * and have side-effecting disk cleanup needs.
 *
 * `outputChannel` is exposed as a lazy getter (not eagerly captured)
 * because the only delete cases that log warnings (epic + story
 * disk-cleanup failure paths) are rarely exercised by tests, and the
 * vitest mock issue from Phase 9 taught us not to grab the channel
 * up-front.
 */
export interface ArtifactDeleteCtx {
    /** Mutable store state — reducers `set/delete` on this map. */
    artifacts: Map<string, any>;
    /** Source-file URI map — `story:${id}` -> disk URI for exact-URI deletes. */
    sourceFiles: Map<string, vscode.Uri>;
    /** Source folder URI — used for `epicDir` recursive cleanup. */
    sourceFolder: vscode.Uri | null;
    /** Fire the change event after the orchestrator's notifyChange. */
    notifyChange: () => void;
    /** Lazy accessor — only created by reducers that emit warnings. */
    getOutputChannel: () => vscode.OutputChannel;
    /** Bidirectional epic ↔ requirement link sync (epic delete sets newReqIds=[]). */
    syncRequirementLinks: (
        epicId: string,
        oldReqIds: string[],
        newReqIds: string[],
        reqType: 'functional' | 'nonFunctional',
    ) => void;
    /** Remove story refs from requirements when stories are gone. */
    removeStoryLinksFromRequirements: (storyIds: string[]) => void;
}

/**
 * A delete reducer removes a single artifact by `artifactId` from
 * `ctx.artifacts` and may perform disk cleanup.  Mirrors
 * `ArtifactReducerFn` but with no `changes` argument.
 */
export type ArtifactDeleteFn = (
    ctx: ArtifactDeleteCtx,
    artifactId: string,
) => void | Promise<void>;

export type ArtifactDeleteRegistry = Map<string, ArtifactDeleteFn>;

/** A delete-reducer module exposes a register hook for its cases. */
export type ArtifactDeleteRegistration = (registry: ArtifactDeleteRegistry) => void;

// ──────────────────────────────────────────────────────────────────────
// Phase 11: Load reducer types — for the `loadFromFolder` switch.
// ──────────────────────────────────────────────────────────────────────

/**
 * DI bag passed to load reducers.  Constructed ONCE per
 * `loadFromFolder` invocation; the orchestrator mutates the per-file
 * fields (`fileUri`, `fileName`, `artifactType`, `data`,
 * `isEpicsManifest`) each iteration BEFORE calling `dispatchLoad()`.
 *
 * The shared scratch containers (`allEpics`, `standaloneStories`,
 * `pendingUseCases`, `unresolvedUseCases`, `requirements`,
 * `standaloneReqsLoaded`, `projectName`, `loadValidationIssues`)
 * accumulate state across iterations of the per-file loop, then are
 * written back to `ctx.artifacts` in the orchestrator's post-loop tail.
 *
 * Key differences from update/delete ctx:
 *   - File-shaped (not artifact-id shaped) — there is no `artifactId`
 *     parameter; the loader picks id(s) from `ctx.data`.
 *   - Scratch state is mutable — loaders may push/filter the shared
 *     containers directly.  This mirrors the inline switch's
 *     `allEpics.push(...)` / `pendingUseCases.push(...)`, just
 *     relocated to the ctx.
 *   - Local helpers (`normalizeEpicId`, `epicIdFromUseCaseId`) lifted
 *     to ctx so loaders don't see them as closure-locals.
 */
export interface ArtifactLoadCtx {
    // ── Per-file fields (mutated each iteration before dispatch) ──
    /** Source URI of the file currently being processed. */
    fileUri: vscode.Uri;
    /** Relative path used for logs and validation messages. */
    fileName: string;
    /** Detected or metadata-declared artifact type. */
    artifactType: string;
    /** Parsed JSON contents of the file. */
    data: any;
    /** True only when `data.content.epics` is a manifest of refs (not inline epics). */
    isEpicsManifest: boolean;

    // ── Per-iteration output (read by epics / use-case linking) ──
    /** All detected epics; mutated by cases `epics` and `epic`. */
    allEpics: Epic[];
    /** Standalone story files awaiting post-loop routing by epicId. */
    standaloneStories: Story[];
    /** Use cases with no parent epic yet; post-loop falls back to name match. */
    pendingUseCases: { uc: any; parentEpicId: string | null }[];
    /** Use cases that couldn't be linked even after fallback (logged). */
    unresolvedUseCases: any[];
    /** Mutable map of FR/NFR/additional requirement lists.
     *  Concrete shape (NOT `BmadArtifacts['requirements']`) — that indexed
     *  access resolves to `... | undefined` in this project's strict tsconfig,
     *  which TS refuses to narrow on `let` rebinding inside `loadFromFolder`. */
    requirements: {
        functional: any[];
        nonFunctional: any[];
        additional: any[];
    };
    /** Tracks which req categories came from a standalone file (skips PRD fallback). */
    standaloneReqsLoaded: { functional: boolean; nonFunctional: boolean; additional: boolean };
    /** Mutable project name string; first non-empty write wins. */
    projectName: string;
    /** Schema-validation issues collected across iterations. */
    loadValidationIssues: { file: string; type: string; errors: string[] }[];

    // ── Persistent store state ──
    /** Mutable store Map. */
    artifacts: Map<string, any>;
    /** Per-id source-file URI map (e.g. `epic:EPIC-1`, `story:S-1.1`). */
    sourceFiles: Map<string, vscode.Uri>;
    /** Source folder URI (for epic-scoped or test-strategy path derivation). */
    sourceFolder: vscode.Uri;

    // ── Helpers (lifted from inline closure) ──
    /** Coerce `EPIC3`, `EPIC-3`, `3`, etc. → `EPIC-3`. */
    normalizeEpicId: (id: string | null) => string | null;
    /** Parse `EPIC-N` from a use-case id like `UC-3-foo`. */
    epicIdFromUseCaseId: (id: string | null) => string | null;
    /** Async epic-story-ref resolver (delegated to ArtifactStore private). */
    loadEpicStoryRefs: (epic: Epic, epicData: any, fileUri: vscode.Uri) => Promise<void>;
    /** ArtifactStore static perIdKey helper for stable lookup keys. */
    perIdKey: (prefix: string, id: string) => string;
    /** Build from BMAD schema using the store's perIdKey helper. */
}

/**
 * A load reducer reads `ctx.data` (and ctx fields) and writes parsed
 * artifacts into `ctx.allEpics`, `ctx.artifacts.set('vision', ...)`,
 * `ctx.requirements.functional.push(...)`, etc.  Returns
 * `void | Promise<void>` — no return value is needed because correctly
 * loaded state is observable through the mutations themselves.
 */
export type ArtifactLoadFn = (ctx: ArtifactLoadCtx) => void | Promise<void>;

export type ArtifactLoadRegistry = Map<string, ArtifactLoadFn>;

/** A load-reducer module exposes a register hook that adds its cases to a map. */
export type ArtifactLoadRegistration = (registry: ArtifactLoadRegistry) => void;
