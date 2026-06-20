import { createLogger } from '../utils/logger';
import type {
    ArtifactChanges,
    ArtifactReducerCtx,
    ArtifactReducerFn,
    ArtifactReducerRegistry,
} from './reducer-types';
import { registerL1Reducers, L1_REGISTERED_TYPES } from './l1-reductions';
import { registerTeaReducers, TEA_REGISTERED_TYPES } from './tea-reductions';
import { registerBmmReducers, BMM_REGISTERED_TYPES } from './bmm-reductions';
import { registerCisReducers, CIS_REGISTERED_TYPES } from './cis-reductions';

const regLogger = createLogger('reducer-registry');
const logDebug = (...args: unknown[]) => regLogger.debug(...args);

/**
 * ArtifactReducerDispatcher — central registry that owns the
 * `Map<string, ArtifactReducerFn>` for all artifact types.
 *
 * Mirrors the constructor-injection pattern established by
 * `SprintStatusSync`, `ArtifactMigrator`, and `ArtifactRepairer`
 * (held as `private` field on ArtifactStore, initialized in the
 * constructor).
 *
 * Sub-modules contribute their reducers via
 * `registerXReducers(this.registry)` calls in the constructor.
 */
export class ArtifactReducerDispatcher {
    private registry: ArtifactReducerRegistry;

    constructor() {
        this.registry = new Map();
        registerL1Reducers(this.registry);
        registerTeaReducers(this.registry);
        registerBmmReducers(this.registry);
        registerCisReducers(this.registry);
        logDebug(
            `[ArtifactReducerDispatcher] Built registry with ${this.registry.size} handlers ` +
            `(L1: ${L1_REGISTERED_TYPES.length}, TEA: ${TEA_REGISTERED_TYPES.length}, ` +
            `BMM: ${BMM_REGISTERED_TYPES.length}, CIS: ${CIS_REGISTERED_TYPES.length})`,
        );
    }

    /**
     * Dispatch a type/id/changes triple to the matching reducer.
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
     * keys, so callers can't mutate the inner Map.
     */
    listRegisteredTypes(): string[] {
        return Array.from(this.registry.keys());
    }

    /**
     * Lookup accessor for tests — returns true if a handler exists.
     */
    has(artifactType: string): boolean {
        return this.registry.has(artifactType);
    }
}
