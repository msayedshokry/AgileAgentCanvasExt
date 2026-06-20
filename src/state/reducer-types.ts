import type * as vscode from 'vscode';
import type { BmadMetadata } from '../types';

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
