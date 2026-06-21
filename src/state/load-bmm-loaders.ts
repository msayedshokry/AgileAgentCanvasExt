import { createLogger } from '../utils/logger';
import type { ArtifactLoadCtx, ArtifactLoadFn, ArtifactLoadRegistry } from './reducer-types';

const bmmLoadLogger = createLogger('load-bmm-loaders');
const logDebug = (...args: unknown[]) => bmmLoadLogger.debug(...args);

/**
 * BMM module load reducers — extracted from
 * `ArtifactStore.loadFromFolder` switch (Phase 11).
 *
 * Covers the 14 BMM artifact types.  Singletons are saved under a
 * canonical key; arrays are appended to a plural-collection entry and
 * indexed by per-id keys in `sourceFiles` for write-back.
 */

// ─── Arrays (research, ux-design, readiness-report, sprint-status, ...) ──
//
// Helper: push data into a plural-collection under both an array-name
// key and a per-id sourceFiles entry.  Idempotent: logs but does not
// dedup on load — duplicates are removed by `reconcileDerivedState()`
// or downstream consumers.

function pushArrayArtifact(
    ctx: ArtifactLoadCtx,
    artifactsKey: string,
    sourceKey: string,
    id: string,
    data: any,
): void {
    const existing: any[] = ctx.artifacts.get(artifactsKey) || [];
    existing.push(data);
    ctx.artifacts.set(artifactsKey, existing);
    ctx.sourceFiles.set(ctx.perIdKey(sourceKey, id), ctx.fileUri);
    logDebug(`Loaded ${ctx.artifactType} ${id} from ${ctx.fileName}`);
}

// Build the unified loader using a helper closure that derives per-id
// keys from incoming data.  We capture ctx via parameter to avoid
// re-importing it inside each arrow.

const loadResearch: ArtifactLoadFn = (ctx) => {
    const dd = ctx.data.content || ctx.data;
    const id = ctx.data.metadata?.id || dd.id || `research-${ctx.fileName}`;
    pushArrayArtifact(ctx, 'researches', 'research', id, dd);
};

const loadUxDesign: ArtifactLoadFn = (ctx) => {
    const dd = ctx.data.content || ctx.data;
    const id = ctx.data.metadata?.id || dd.id || `ux-design-${ctx.fileName}`;
    pushArrayArtifact(ctx, 'uxDesigns', 'uxDesign', id, dd);
};

const loadReadinessReport: ArtifactLoadFn = (ctx) => {
    const dd = ctx.data.content || ctx.data;
    const id = ctx.data.metadata?.id || dd.id || `readiness-report-${ctx.fileName}`;
    pushArrayArtifact(ctx, 'readinessReports', 'readinessReport', id, dd);
};

const loadSprintStatus: ArtifactLoadFn = (ctx) => {
    const dd = ctx.data.content || ctx.data;
    const id = ctx.data.metadata?.id || dd.id || `sprint-status-${ctx.fileName}`;
    pushArrayArtifact(ctx, 'sprintStatuses', 'sprintStatus', id, dd);
};

const loadRetrospective: ArtifactLoadFn = (ctx) => {
    const dd = ctx.data.content || ctx.data;
    const id = ctx.data.metadata?.id || dd.id || `retrospective-${ctx.fileName}`;
    pushArrayArtifact(ctx, 'retrospectives', 'retrospective', id, dd);
};

const loadChangeProposal: ArtifactLoadFn = (ctx) => {
    const dd = ctx.data.content || ctx.data;
    const id = ctx.data.metadata?.id || dd.id || `change-proposal-${ctx.fileName}`;
    pushArrayArtifact(ctx, 'changeProposals', 'changeProposal', id, dd);
};

const loadCodeReview: ArtifactLoadFn = (ctx) => {
    const dd = ctx.data.content || ctx.data;
    const id = ctx.data.metadata?.id || dd.id || `code-review-${ctx.fileName}`;
    pushArrayArtifact(ctx, 'codeReviews', 'codeReview', id, dd);
};

const loadTechSpec: ArtifactLoadFn = (ctx) => {
    const dd = ctx.data.content || ctx.data;
    const id = ctx.data.metadata?.id || dd.id || `tech-spec-${ctx.fileName}`;
    pushArrayArtifact(ctx, 'techSpecs', 'techSpec', id, dd);
};

// ─── Singletons (project-overview, project-context, source-tree, ...) ──

function setSingletonArtifact(
    ctx: ArtifactLoadCtx,
    artifactsKey: string,
    sourceKey: string,
): void {
    ctx.sourceFiles.set(sourceKey, ctx.fileUri);
    const d = ctx.data.content || ctx.data;
    ctx.artifacts.set(artifactsKey, d);
    logDebug(`Loaded ${ctx.artifactType}`);
}

const loadProjectOverview: ArtifactLoadFn = (ctx) => {
    setSingletonArtifact(ctx, 'projectOverview', 'projectOverview');
};

const loadProjectContext: ArtifactLoadFn = (ctx) => {
    setSingletonArtifact(ctx, 'projectContext', 'projectContext');
};

const loadSourceTree: ArtifactLoadFn = (ctx) => {
    setSingletonArtifact(ctx, 'sourceTree', 'sourceTree');
};

const loadTestSummary: ArtifactLoadFn = (ctx) => {
    setSingletonArtifact(ctx, 'testSummary', 'testSummary');
};

const loadRisks: ArtifactLoadFn = (ctx) => {
    setSingletonArtifact(ctx, 'risks', 'risks');
    logDebug('Loaded risks');
};

const loadDefinitionOfDone: ArtifactLoadFn = (ctx) => {
    setSingletonArtifact(ctx, 'definitionOfDone', 'definitionOfDone');
    logDebug('Loaded definition of done');
};

// ─── Registration ───────────────────────────────────────────────────────

export const BMM_LOAD_REGISTERED_TYPES = [
    'research',
    'ux-design',
    'readiness-report',
    'readiness',            // legacy alias for readiness-report
    'sprint-status',
    'sprint',               // legacy alias for sprint-status
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

export function registerBmmLoadReducers(registry: ArtifactLoadRegistry): void {
    registry.set('research', loadResearch);
    registry.set('ux-design', loadUxDesign);
    registry.set('readiness-report', loadReadinessReport);
    registry.set('readiness', loadReadinessReport);   // legacy alias
    registry.set('sprint-status', loadSprintStatus);
    registry.set('sprint', loadSprintStatus);         // legacy alias
    registry.set('retrospective', loadRetrospective);
    registry.set('change-proposal', loadChangeProposal);
    registry.set('code-review', loadCodeReview);
    registry.set('project-overview', loadProjectOverview);
    registry.set('project-context', loadProjectContext);
    registry.set('tech-spec', loadTechSpec);
    registry.set('source-tree', loadSourceTree);
    registry.set('test-summary', loadTestSummary);
    registry.set('risks', loadRisks);
    registry.set('definition-of-done', loadDefinitionOfDone);
}
