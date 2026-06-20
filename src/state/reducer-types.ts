import type * as vscode from 'vscode';
import type { BmadMetadata, Epic, Story, BmadArtifacts } from '../types';

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
 */

/**
 * Runtime shape of the third argument to `updateArtifact`.  The body of
 * the LM tool wire can be any of the per-type shapes defined in
 * `BmadArtifactTypeMap`; here we accept `Partial<any>` to absorb the
 * structural spread form callers (chat-participant.ts, etc.) send.
 *
 * Callers that want compile-time safety should use:
 *   `Partial<BmadArtifactTypeMap[T]> & { metadata?: BmadMetadata }`
 */
export type ArtifactChanges = Partial<any> & { metadata?: BmadMetadata };

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
 * A reducer MUST NOT call `reconcileDerivedState` / `notifyChange`
 * for the final pass — those happen in the orchestrator after the
 * reducer returns.  (Some reducers DO call them mid-flight, e.g. the
 * story reducer writes a standalone file before the orchestrator's
 * tail — those are intermediate, not terminal.)
 */
export type ArtifactReducerFn = (
    ctx: ArtifactReducerCtx,
    artifactId: string,
    changes: ArtifactChanges,
) => void | Promise<void>;

/**
 * The full registry: maps artifact type strings (kebab-case + aliases)
 * to their reducer.  Built once at store construction time.
 */
export type ArtifactReducerRegistry = Map<string, ArtifactReducerFn>;

/** A reducer module exposes a register hook that adds its cases to a map. */
export type ArtifactReducerRegistration = (registry: ArtifactReducerRegistry) => void;

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
