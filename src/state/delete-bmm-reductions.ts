import { createLogger } from '../utils/logger';
import type {
    ArtifactDeleteCtx,
    ArtifactDeleteFn,
    ArtifactDeleteRegistry,
} from './reducer-types';

const bmmDeleteLogger = createLogger('delete-bmm-reductions');
const logDebug = (...args: unknown[]) => bmmDeleteLogger.debug(...args);

/**
 * BMM module delete reducers — extracted from
 * `ArtifactStore.deleteArtifact` switch (Phase 10).
 *
 * Covers the 12+ "BMM" (Business Method for AI) delete cases, spanning
 * singletons, arrays, and deprecated-aliases.
 */

const deleteResearch: ArtifactDeleteFn = (ctx, artifactId) => {
    const arr = ctx.artifacts.get('researches') || [];
    ctx.artifacts.set(
        'researches',
        arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId),
    );
    logDebug(`Deleted research: ${artifactId}`);
};

const deleteUxDesign: ArtifactDeleteFn = (ctx, artifactId) => {
    const arr = ctx.artifacts.get('uxDesigns') || [];
    ctx.artifacts.set(
        'uxDesigns',
        arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId),
    );
    logDebug(`Deleted UX design: ${artifactId}`);
};

const deleteReadinessReport: ArtifactDeleteFn = (ctx, artifactId) => {
    const arr = ctx.artifacts.get('readinessReports') || [];
    ctx.artifacts.set(
        'readinessReports',
        arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId),
    );
    logDebug(`Deleted readiness report: ${artifactId}`);
};

const deleteSprintStatus: ArtifactDeleteFn = (ctx, artifactId) => {
    const arr = ctx.artifacts.get('sprintStatuses') || [];
    ctx.artifacts.set(
        'sprintStatuses',
        arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId),
    );
    logDebug(`Deleted sprint status: ${artifactId}`);
};

const deleteRetrospective: ArtifactDeleteFn = (ctx, artifactId) => {
    const arr = ctx.artifacts.get('retrospectives') || [];
    ctx.artifacts.set(
        'retrospectives',
        arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId),
    );
    logDebug(`Deleted retrospective: ${artifactId}`);
};

const deleteChangeProposal: ArtifactDeleteFn = (ctx, artifactId) => {
    const arr = ctx.artifacts.get('changeProposals') || [];
    ctx.artifacts.set(
        'changeProposals',
        arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId),
    );
    logDebug(`Deleted change proposal: ${artifactId}`);
};

const deleteCodeReview: ArtifactDeleteFn = (ctx, artifactId) => {
    const arr = ctx.artifacts.get('codeReviews') || [];
    ctx.artifacts.set(
        'codeReviews',
        arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId),
    );
    logDebug(`Deleted code review: ${artifactId}`);
};

const deleteProjectOverview: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('projectOverview', undefined);
};

const deleteProjectContext: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('projectContext', undefined);
};

const deleteTechSpec: ArtifactDeleteFn = (ctx, artifactId) => {
    const arr = ctx.artifacts.get('techSpecs') || [];
    ctx.artifacts.set(
        'techSpecs',
        arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId),
    );
    logDebug(`Deleted tech spec: ${artifactId}`);
};

const deleteSourceTree: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('sourceTree', undefined);
};

const deleteTestSummary: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('testSummary', undefined);
};

const deleteRisks: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('risks', undefined);
};

const deleteDefinitionOfDone: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('definitionOfDone', undefined);
};

// ─── Registration ──────────────────────────────────────────────────────────

export const BMM_DELETE_REGISTERED_TYPES = [
    'research',
    'ux-design',
    'readiness-report',
    'readiness',           // @deprecated alias for 'readiness-report'
    'sprint-status',
    'sprint',              // @deprecated alias for 'sprint-status'
    'retrospective',
    'change-proposal',
    'code-review',
    'project-overview',
    'project-context',
    'tech-spec',
    'source-tree',
    'test-summary',
    'risks',
    'definition-of-done',
];

export function registerBmmDeleteReducers(registry: ArtifactDeleteRegistry): void {
    registry.set('research', deleteResearch);
    registry.set('ux-design', deleteUxDesign);
    registry.set('readiness-report', deleteReadinessReport);
    registry.set('readiness', deleteReadinessReport);        // @deprecated alias
    registry.set('sprint-status', deleteSprintStatus);
    registry.set('sprint', deleteSprintStatus);              // @deprecated alias
    registry.set('retrospective', deleteRetrospective);
    registry.set('change-proposal', deleteChangeProposal);
    registry.set('code-review', deleteCodeReview);
    registry.set('project-overview', deleteProjectOverview);
    registry.set('project-context', deleteProjectContext);
    registry.set('tech-spec', deleteTechSpec);
    registry.set('source-tree', deleteSourceTree);
    registry.set('test-summary', deleteTestSummary);
    registry.set('risks', deleteRisks);
    registry.set('definition-of-done', deleteDefinitionOfDone);
}
