import { createLogger } from '../utils/logger';
import type {
    ArtifactChanges,
    ArtifactDeleteCtx,
    ArtifactDeleteFn,
    ArtifactDeleteRegistry,
    ArtifactLoadCtx,
    ArtifactLoadFn,
    ArtifactLoadRegistry,
    ArtifactReducerCtx,
    ArtifactReducerFn,
    ArtifactReducerRegistry,
    BmadArtifactTypeMap,
} from './reducer-types';
import { registerL1Reducers, L1_REGISTERED_TYPES } from './l1-reductions';
import { registerTeaReducers, TEA_REGISTERED_TYPES } from './tea-reductions';
import { registerBmmReducers, BMM_REGISTERED_TYPES } from './bmm-reductions';
import { registerCisReducers, CIS_REGISTERED_TYPES } from './cis-reductions';
import { registerL1DeleteReducers, L1_DELETE_REGISTERED_TYPES } from './delete-l1-reductions';
import { registerTeaDeleteReducers, TEA_DELETE_REGISTERED_TYPES } from './delete-tea-reductions';
import { registerBmmDeleteReducers, BMM_DELETE_REGISTERED_TYPES } from './delete-bmm-reductions';
import { registerCisDeleteReducers, CIS_DELETE_REGISTERED_TYPES } from './delete-cis-reductions';
import { registerL1LoadReducers, L1_LOAD_REGISTERED_TYPES } from './load-l1-loaders';
import { registerTeaLoadReducers, TEA_LOAD_REGISTERED_TYPES } from './load-tea-loaders';
import { registerBmmLoadReducers, BMM_LOAD_REGISTERED_TYPES } from './load-bmm-loaders';
import { registerCisLoadReducers, CIS_LOAD_REGISTERED_TYPES } from './load-cis-loaders';

const regLogger = createLogger('reducer-registry');
const logDebug = (...args: unknown[]) => regLogger.debug(...args);

/**
 * Phase 12 deprecated-alias migration map.
 *
 * These short kebab-case keys (`nfr`, `readiness`, `sprint`) are registered
 * alongside their canonical spellings (`nfr-assessment`, `readiness-report`,
 * `sprint-status`) so legacy callers continue to work while we phase the
 * short forms out.  Each entry maps the deprecated alias to its canonical
 * replacement (the alias and canonical point to the same handler in the
 * registry — see `l1/tea/bmm/cis-reductions.ts`).
 *
 * Surface this as a runtime migration hint in `ArtifactReducerDispatcher.dispatch()`:
 * when a caller passes a deprecated key, we log one `logDebug` line so
 * maintainers observing the BMAD logger see a stderr nudge to migrate
 * to the canonical spelling.  We deliberately use `logDebug` (not
 * `logWarn`) because:
 *   - The call still succeeds — this is informational, not an error.
 *   - It can fire on every dispatch in a chat loop, so the loudness
 *     ceiling should be low enough that it doesn't drown real warnings.
 */
const DEPRECATED_ALIAS_MAP: Readonly<Record<string, string>> = Object.freeze({
    nfr: 'nfr-assessment',
    readiness: 'readiness-report',
    sprint: 'sprint-status',
});

/**
 * ArtifactReducerDispatcher — central registry that owns two parallel maps:
 *
 *   1. `registry`   — Phase 9 update reducers  (Map<type, ArtifactReducerFn>)
 *   2. `deleteRegistry` — Phase 10 delete reducers (Map<type, ArtifactDeleteFn>)
 *
 * Both maps are built once at construction time by per-domain `registerX*Reducers`
 * helpers.  Mirrors the constructor-injection pattern established by
 * `SprintStatusSync`, `ArtifactMigrator`, and `ArtifactRepairer`
 * (held as `private` field on ArtifactStore, initialized in the
 * constructor).
 *
 * Aliases (nfr/nfr-assessment, readiness/readiness-report, sprint/sprint-status)
 * are registered as separate keys pointing to the same handler function,
 * AND emit a runtime migration hint per dispatch via
 * `warnIfDeprecatedAlias()` — legacy callers get a stderr breadcrumb
 * to migrate to the canonical kebab-case spellings.
 */
export class ArtifactReducerDispatcher {
    private registry: ArtifactReducerRegistry;
    private deleteRegistry: ArtifactDeleteRegistry;
    private loadRegistry: ArtifactLoadRegistry;

    constructor() {
        this.registry = new Map();
        registerL1Reducers(this.registry);
        registerTeaReducers(this.registry);
        registerBmmReducers(this.registry);
        registerCisReducers(this.registry);

        this.deleteRegistry = new Map();
        registerL1DeleteReducers(this.deleteRegistry);
        registerTeaDeleteReducers(this.deleteRegistry);
        registerBmmDeleteReducers(this.deleteRegistry);
        registerCisDeleteReducers(this.deleteRegistry);

        this.loadRegistry = new Map();
        registerL1LoadReducers(this.loadRegistry);
        registerTeaLoadReducers(this.loadRegistry);
        registerBmmLoadReducers(this.loadRegistry);
        registerCisLoadReducers(this.loadRegistry);

        logDebug(
            `[ArtifactReducerDispatcher] Built update registry with ${this.registry.size} handlers ` +
            `(L1: ${L1_REGISTERED_TYPES.length}, TEA: ${TEA_REGISTERED_TYPES.length}, ` +
            `BMM: ${BMM_REGISTERED_TYPES.length}, CIS: ${CIS_REGISTERED_TYPES.length})`,
        );
        logDebug(
            `[ArtifactReducerDispatcher] Built delete registry with ${this.deleteRegistry.size} handlers ` +
            `(L1: ${L1_DELETE_REGISTERED_TYPES.length}, TEA: ${TEA_DELETE_REGISTERED_TYPES.length}, ` +
            `BMM: ${BMM_DELETE_REGISTERED_TYPES.length}, CIS: ${CIS_DELETE_REGISTERED_TYPES.length})`,
        );
        logDebug(
            `[ArtifactReducerDispatcher] Built load registry with ${this.loadRegistry.size} handlers ` +
            `(L1: ${L1_LOAD_REGISTERED_TYPES.length}, TEA: ${TEA_LOAD_REGISTERED_TYPES.length}, ` +
            `BMM: ${BMM_LOAD_REGISTERED_TYPES.length}, CIS: ${CIS_LOAD_REGISTERED_TYPES.length})`,
        );
    }

    // ─── Update dispatch (Phase 9) ────────────────────────────────────────────

    /**
     * Dispatch a type/id/changes triple to the matching update reducer.
     * Returns true if a handler was found and called; false if the
     * type is unknown (orchestrator logs a warning).
     *
     * Phase 12: emits one `logDebug` per call when `artifactType` matches
     * a deprecated alias key (`nfr`, `readiness`, `sprint`).  The hint
     * names the canonical kebab-case replacement so legacy callers
     * have a stderr breadcrumb for the eventual migration.  See
     * `DEPRECATED_ALIAS_MAP` and `warnIfDeprecatedAlias()`.
     */
    async dispatch(
        ctx: ArtifactReducerCtx,
        artifactType: string,
        artifactId: string,
        changes: ArtifactChanges,
    ): Promise<boolean> {
        this.warnIfDeprecatedAlias(artifactType, artifactId, 'dispatch');
        const fn: ArtifactReducerFn | undefined = this.registry.get(artifactType);
        if (!fn) {
            return false;
        }
        await fn(ctx, artifactId, changes);
        return true;
    }

    /**
     * Direct accessor for testing/extension — returns a copy of the
     * update-registry keys, so callers can't mutate the inner Map.
     */
    listRegisteredTypes(): string[] {
        return Array.from(this.registry.keys());
    }

    /**
     * Lookup accessor for tests — returns true if an update handler exists.
     */
    has(artifactType: string): boolean {
        return this.registry.has(artifactType);
    }

    // ─── Delete dispatch (Phase 10) ──────────────────────────────────────────

    /**
     * Dispatch a type/id pair to the matching delete reducer.  Returns
     * true if a handler was found and called; false if the type is
     * unknown (orchestrator logs a debug message).
     *
     * Phase 14: emits the same runtime deprecation hint as
     * `dispatch()` when `artifactType` is a deprecated alias key.
     * The original Phase 12 implementation only wired the warning
     * into `dispatch()`; extending to all three dispatch paths
     * closes a half-migrated coverage gap exposed by code review.
     */
    async dispatchDelete(
        ctx: ArtifactDeleteCtx,
        artifactType: string,
        artifactId: string,
    ): Promise<boolean> {
        this.warnIfDeprecatedAlias(artifactType, artifactId, 'dispatchDelete');
        const fn: ArtifactDeleteFn | undefined = this.deleteRegistry.get(artifactType);
        if (!fn) {
            return false;
        }
        await fn(ctx, artifactId);
        return true;
    }

    /**
     * Direct accessor for testing/extension — returns a copy of the
     * delete-registry keys.
     */
    listRegisteredDeleteTypes(): string[] {
        return Array.from(this.deleteRegistry.keys());
    }

    /**
     * Lookup accessor for tests — returns true if a delete handler exists.
     */
    hasDelete(artifactType: string): boolean {
        return this.deleteRegistry.has(artifactType);
    }

    // ─── Load dispatch (Phase 11) ──────────────────────────────────────────

    /**
     * Dispatch a load reducer for the current `artifactType`.  The orchestrator
     * (loadFromFolder) mutates the per-file fields on `ctx` BEFORE dispatching.
     * Returns true if a handler was found and called; false if the type is
     * unknown (orchestrator logs a debug message and falls back to its
     * inline default branch that detects epics/story from content shape).
     *
     * Phase 14: emits the same runtime deprecation hint as `dispatch()` /
     * `dispatchDelete()` when `artifactType` is a deprecated alias key.
     * Note `dispatchLoad` takes no `artifactId` — the helper handles this
     * by omitting the `(artifactId=...)` suffix from the log line.
     */
    async dispatchLoad(ctx: ArtifactLoadCtx, artifactType: string): Promise<boolean> {
        this.warnIfDeprecatedAlias(artifactType, undefined, 'dispatchLoad');
        const fn: ArtifactLoadFn | undefined = this.loadRegistry.get(artifactType);
        if (!fn) {
            return false;
        }
        await fn(ctx);
        return true;
    }

    /**
     * Direct accessor for testing/extension — returns a copy of the
     * load-registry keys.
     */
    listRegisteredLoadTypes(): string[] {
        return Array.from(this.loadRegistry.keys());
    }

    /**
     * Lookup accessor for tests — returns true if a load handler exists.
     */
    hasLoad(artifactType: string): boolean {
        return this.loadRegistry.has(artifactType);
    }

    // ─── Phase 14: Deprecated-alias migration hint ───────────────────────

    /**
     * Phase 14: emit one `logDebug` per dispatch call when `artifactType`
     * matches a deprecated alias key in `DEPRECATED_ALIAS_MAP`.
     *
     * Used by `dispatch()`, `dispatchDelete()`, and `dispatchLoad()` —
     * kept as a private method so the alias set + message format live
     * in one place.
     *
     * `artifactId` is optional: `dispatchLoad` doesn't carry a per-id
     * artifact (it operates on file-shaped ctx), so we omit the suffix
     * rather than printing `artifactId=undefined`.  `source` is the
     * dispatch method name so log triage can distinguish which path
     * the legacy caller is taking.
     *
     * Loudness is `logDebug` (not `logWarn`) because:
     *   - Calls still succeed — this is informational, not an error.
     *   - Per-dispatch loops (chat, telemetry replay) can fire this
     *     many times per second; the loudness ceiling must be low
     *     enough that real warnings aren't drowned.
     */
    private warnIfDeprecatedAlias(
        artifactType: string,
        artifactId: string | undefined,
        source: 'dispatch' | 'dispatchDelete' | 'dispatchLoad',
    ): void {
        const canonical = DEPRECATED_ALIAS_MAP[artifactType];
        if (canonical === undefined) {
            return;
        }
        const idSuffix = artifactId !== undefined ? ` (artifactId=${artifactId})` : '';
        logDebug(
            `[ArtifactReducerDispatcher.${source}] deprecated alias '${artifactType}' used; ` +
            `migrate caller to canonical '${canonical}'${idSuffix}`,
        );
    }
}
