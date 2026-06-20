import { createLogger } from '../utils/logger';
import type {
    ArtifactChanges,
    ArtifactDeleteCtx,
    ArtifactDeleteFn,
    ArtifactDeleteRegistry,
    ArtifactReducerCtx,
    ArtifactReducerFn,
    ArtifactReducerRegistry,
} from './reducer-types';
import { registerL1Reducers, L1_REGISTERED_TYPES } from './l1-reductions';
import { registerTeaReducers, TEA_REGISTERED_TYPES } from './tea-reductions';
import { registerBmmReducers, BMM_REGISTERED_TYPES } from './bmm-reductions';
import { registerCisReducers, CIS_REGISTERED_TYPES } from './cis-reductions';
import { registerL1DeleteReducers, L1_DELETE_REGISTERED_TYPES } from './delete-l1-reductions';
import { registerTeaDeleteReducers, TEA_DELETE_REGISTERED_TYPES } from './delete-tea-reductions';
import { registerBmmDeleteReducers, BMM_DELETE_REGISTERED_TYPES } from './delete-bmm-reductions';
import { registerCisDeleteReducers, CIS_DELETE_REGISTERED_TYPES } from './delete-cis-reductions';

const regLogger = createLogger('reducer-registry');
const logDebug = (...args: unknown[]) => regLogger.debug(...args);

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
 * are registered as separate keys pointing to the same handler function.
 */
export class ArtifactReducerDispatcher {
    private registry: ArtifactReducerRegistry;
    private deleteRegistry: ArtifactDeleteRegistry;

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
    }

    // ─── Update dispatch (Phase 9) ────────────────────────────────────────────

    /**
     * Dispatch a type/id/changes triple to the matching update reducer.
     * Returns true if a handler was found and called; false if the
     * type is unknown (orchestrator logs a warning).
     */
    async dispatch(
        ctx: ArtifactReducerCtx,
        artifactType: string,
        artifactId: string,
        changes: ArtifactChanges,
    ): Promise<boolean> {
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
     */
    async dispatchDelete(
        ctx: ArtifactDeleteCtx,
        artifactType: string,
        artifactId: string,
    ): Promise<boolean> {
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
}
