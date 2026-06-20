import { createLogger } from '../utils/logger';
import type {
    ArtifactDeleteCtx,
    ArtifactDeleteFn,
    ArtifactDeleteRegistry,
} from './reducer-types';

const cisDeleteLogger = createLogger('delete-cis-reductions');
const logDebug = (...args: unknown[]) => cisDeleteLogger.debug(...args);

/**
 * CIS module delete reducers — extracted from
 * `ArtifactStore.deleteArtifact` switch (Phase 10).
 *
 * Covers the 4 "CIS" (Creative Innovation & Strategy) singleton
 * delete cases.
 */

const deleteStorytelling: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('storytelling', undefined);
};

const deleteProblemSolving: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('problemSolving', undefined);
};

const deleteInnovationStrategy: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('innovationStrategy', undefined);
};

const deleteDesignThinking: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('designThinking', undefined);
};

// ─── Registration ──────────────────────────────────────────────────────────

export const CIS_DELETE_REGISTERED_TYPES = [
    'storytelling',
    'problem-solving',
    'innovation-strategy',
    'design-thinking',
];

export function registerCisDeleteReducers(registry: ArtifactDeleteRegistry): void {
    registry.set('storytelling', deleteStorytelling);
    registry.set('problem-solving', deleteProblemSolving);
    registry.set('innovation-strategy', deleteInnovationStrategy);
    registry.set('design-thinking', deleteDesignThinking);
}
