import { createLogger } from '../utils/logger';
import type {
    ArtifactDeleteCtx,
    ArtifactDeleteFn,
    ArtifactDeleteRegistry,
} from './reducer-types';

const teaDeleteLogger = createLogger('delete-tea-reductions');
const logDebug = (...args: unknown[]) => teaDeleteLogger.debug(...args);

/**
 * TEA module delete reducers — extracted from
 * `ArtifactStore.deleteArtifact` switch (Phase 10).
 *
 * Covers the 7 "TEA" (Test Engineering & Automation) delete cases.
 * Most are simple singleton/array-filter operations.
 */

const deleteTraceabilityMatrix: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('traceabilityMatrix', undefined);
};

const deleteTestReview: ArtifactDeleteFn = (ctx, artifactId) => {
    const arr = ctx.artifacts.get('testReviews') || [];
    ctx.artifacts.set(
        'testReviews',
        arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId),
    );
    logDebug(`Deleted test review: ${artifactId}`);
};

const deleteNfrAssessment: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('nfrAssessment', undefined);
};

const deleteAtddChecklist: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('atddChecklist', undefined);
};

const deleteTestFramework: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('testFramework', undefined);
};

const deleteCiPipeline: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('ciPipeline', undefined);
};

const deleteAutomationSummary: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('automationSummary', undefined);
};

// ─── Registration ─────────────────────────────────────────────────────────

export const TEA_DELETE_REGISTERED_TYPES = [
    'traceability-matrix',
    'test-review',
    'nfr-assessment',
    'nfr',                 // @deprecated alias for 'nfr-assessment'
    'test-framework',
    'ci-pipeline',
    'automation-summary',
    'atdd-checklist',
];

export function registerTeaDeleteReducers(registry: ArtifactDeleteRegistry): void {
    registry.set('traceability-matrix', deleteTraceabilityMatrix);
    registry.set('test-review', deleteTestReview);
    registry.set('nfr-assessment', deleteNfrAssessment);
    registry.set('nfr', deleteNfrAssessment);          // @deprecated alias
    registry.set('test-framework', deleteTestFramework);
    registry.set('ci-pipeline', deleteCiPipeline);
    registry.set('automation-summary', deleteAutomationSummary);
    registry.set('atdd-checklist', deleteAtddChecklist);
}
