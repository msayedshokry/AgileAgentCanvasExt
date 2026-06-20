import { createLogger } from '../utils/logger';
import { pickChanges } from './reducer-helpers';
import type {
    ArtifactReducerCtx,
    ArtifactReducerFn,
    ArtifactReducerRegistry,
} from './reducer-types';

const bmmLogger = createLogger('bmm-reductions');
const logDebug = (...args: unknown[]) => bmmLogger.debug(...args);

/**
 * BMM module artifact reducers — extracted from
 * `ArtifactStore.updateArtifact` switch (Phase 9).
 *
 * Covers the 12+ "BMM" (Business Method for AI) artifact types,
 * spanning array, singleton, and deprecated-alias cases.
 */

// ─── research (array) ──────────────────────────────────────────────────────

const reduceResearch: ArtifactReducerFn<'research'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('researches') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'research-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'researchType', 'topic', 'scope', 'goals', 'questions', 'methodology',
        'findings', 'competitiveAnalysis', 'marketAnalysis', 'trends',
        'technicalFindings', 'userResearch', 'recommendations', 'risks',
        'synthesis', 'references', 'appendices',
    ]));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('researches', arr);
    logDebug('[bmm-reductions] Updated research:', upd.id);
};

// ─── ux-design (array) ─────────────────────────────────────────────────────

const reduceUxDesign: ArtifactReducerFn<'ux-design'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('uxDesigns') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'ux-design-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'overview', 'coreExperience', 'designInspiration', 'designSystem',
        'userJourneys', 'wireframes', 'componentStrategy', 'pageLayouts',
        'uxPatterns', 'responsive', 'accessibility', 'interactions',
        'errorStates', 'emptyStates', 'loadingStates', 'implementationNotes', 'references',
    ]));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('uxDesigns', arr);
    logDebug('[bmm-reductions] Updated UX design:', upd.id);
};

// ─── readiness-report / readiness (array, deprecated alias) ──────────────

const reduceReadinessReport: ArtifactReducerFn<'readiness-report'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('readinessReports') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur: any = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'readiness-report-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'summary', 'assessment', 'blockers', 'risks', 'recommendations',
        'dependencyAnalysis', 'resourceAssessment', 'nextSteps', 'appendices',
    ]));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('readinessReports', arr);
    logDebug('[bmm-reductions] Updated readiness report:', upd.id);
};

// ─── sprint-status / sprint (array, deprecated alias) ─────────────────────

const reduceSprintStatus: ArtifactReducerFn<'sprint-status'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('sprintStatuses') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur: any = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'sprint-status-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'generated', 'project', 'projectKey', 'trackingSystem', 'storyLocation',
        'summary', 'epics', 'developmentStatus', 'statusDefinitions',
    ]));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('sprintStatuses', arr);
    logDebug('[bmm-reductions] Updated sprint status:', upd.id);
};

// ─── retrospective (array) ─────────────────────────────────────────────────

const reduceRetrospective: ArtifactReducerFn<'retrospective'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('retrospectives') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'retrospective-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'epicReference', 'summary', 'whatWentWell', 'whatDidNotGoWell',
        'lessonsLearned', 'storyAnalysis', 'technicalDebt', 'impactOnFutureWork',
        'teamFeedback', 'actionItems', 'metricsSnapshot',
    ]));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('retrospectives', arr);
    logDebug('[bmm-reductions] Updated retrospective:', upd.id);
};

// ─── change-proposal (array) ───────────────────────────────────────────────

const reduceChangeProposal: ArtifactReducerFn<'change-proposal'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('changeProposals') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'change-proposal-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'changeRequest', 'impactAnalysis', 'proposal', 'approval', 'implementation',
    ]));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('changeProposals', arr);
    logDebug('[bmm-reductions] Updated change proposal:', upd.id);
};

// ─── code-review (array) ───────────────────────────────────────────────────

const reduceCodeReview: ArtifactReducerFn<'code-review'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('codeReviews') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'code-review-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'storyReference', 'reviewSummary', 'findings',
        'acceptanceCriteriaVerification', 'testCoverageAnalysis', 'securityAnalysis',
        'architectureCompliance', 'nextSteps', 'reviewerNotes',
    ]));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('codeReviews', arr);
    logDebug('[bmm-reductions] Updated code review:', upd.id);
};

// ─── risks (singleton) ──────────────────────────────────────────────────────

const reduceRisks: ArtifactReducerFn<'risks'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('risks') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'risks-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, ['risks', 'assumptions', 'dependencies', 'riskMatrix', 'summary']));
    ctx.artifacts.set('risks', upd);
    logDebug('[bmm-reductions] Updated risks:', upd.id);
};

// ─── definition-of-done (singleton) ───────────────────────────────────────

const reduceDefinitionOfDone: ArtifactReducerFn<'definition-of-done'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('definitionOfDone') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'definition-of-done-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, ['items', 'qualityGates', 'acceptanceSummary', 'templates', 'summary']));
    ctx.artifacts.set('definitionOfDone', upd);
    logDebug('[bmm-reductions] Updated definition of done:', upd.id);
};

// ─── project-overview (singleton) ──────────────────────────────────────────

const reduceProjectOverview: ArtifactReducerFn<'project-overview'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('projectOverview') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'project-overview-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'projectInfo', 'executiveSummary', 'projectClassification',
        'multiPartStructure', 'techStackSummary', 'keyFeatures',
        'architectureHighlights', 'codebaseAnalysis', 'development',
        'repositoryStructure', 'entryPoints', 'dataFlows', 'integrations',
        'knownIssues', 'recommendations', 'documentationMap', 'additionalNotes',
    ]));
    ctx.artifacts.set('projectOverview', upd);
    logDebug('[bmm-reductions] Updated project overview:', upd.id);
};

// ─── project-context (singleton) ───────────────────────────────────────────

const reduceProjectContext: ArtifactReducerFn<'project-context'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('projectContext') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'project-context-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'projectInfo', 'overview', 'techStack', 'implementationRules',
        'patterns', 'forbiddenPatterns', 'keyFiles', 'entryPoints',
        'developmentWorkflow', 'errorHandling', 'stateManagement',
        'apiInteraction', 'securityConsiderations', 'performanceConsiderations',
        'knownIssues', 'additionalNotes',
    ]));
    ctx.artifacts.set('projectContext', upd);
    logDebug('[bmm-reductions] Updated project context:', upd.id);
};

// ─── tech-spec (array) ─────────────────────────────────────────────────────

const reduceTechSpec: ArtifactReducerFn<'tech-spec'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('techSpecs') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'tech-spec-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'title', 'slug', 'version', 'overview', 'context', 'techStack',
        'dataModel', 'apiChanges', 'filesToModify', 'filesToCreate',
        'codePatterns', 'testPatterns', 'implementationPlan', 'testingStrategy',
        'risks', 'rollbackPlan', 'additionalContext', 'reviewers',
    ]));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('techSpecs', arr);
    logDebug('[bmm-reductions] Updated tech spec:', upd.id);
};

// ─── source-tree (singleton) ───────────────────────────────────────────────

const reduceSourceTree: ArtifactReducerFn<'source-tree'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('sourceTree') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'source-tree-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'overview', 'statistics', 'multiPartStructure', 'directoryStructure',
        'criticalDirectories', 'entryPoints', 'fileOrganizationPatterns',
        'namingConventions', 'keyFileTypes', 'assetLocations', 'configurationFiles',
        'buildArtifacts', 'testLocations', 'documentationLocations', 'moduleGraph',
        'developmentNotes', 'recommendations',
    ]));
    ctx.artifacts.set('sourceTree', upd);
    logDebug('[bmm-reductions] Updated source tree:', upd.id);
};

// ─── test-summary (singleton) ──────────────────────────────────────────────

const reduceTestSummary: ArtifactReducerFn<'test-summary'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('testSummary') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'test-summary-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'summary', 'generatedTests', 'coverageAnalysis', 'testPatterns',
        'recommendations', 'executionNotes',
    ]));
    ctx.artifacts.set('testSummary', upd);
    logDebug('[bmm-reductions] Updated test summary:', upd.id);
};

// ─── Registration ──────────────────────────────────────────────────────────

export const BMM_REGISTERED_TYPES = [
    'research',
    'ux-design',
    'readiness-report',
    'readiness',         // @deprecated alias for 'readiness-report' (plural array)
    'sprint-status',
    'sprint',            // @deprecated alias for 'sprint-status'
    'retrospective',
    'change-proposal',
    'code-review',
    'risks',
    'definition-of-done',
    'project-overview',
    'project-context',
    'tech-spec',
    'source-tree',
    'test-summary',
];

export function registerBmmReducers(registry: ArtifactReducerRegistry): void {
    registry.set('research', reduceResearch);
    registry.set('ux-design', reduceUxDesign);
    registry.set('readiness-report', reduceReadinessReport);
    registry.set('readiness', reduceReadinessReport);     // @deprecated alias
    registry.set('sprint-status', reduceSprintStatus);
    registry.set('sprint', reduceSprintStatus);           // @deprecated alias
    registry.set('retrospective', reduceRetrospective);
    registry.set('change-proposal', reduceChangeProposal);
    registry.set('code-review', reduceCodeReview);
    registry.set('risks', reduceRisks);
    registry.set('definition-of-done', reduceDefinitionOfDone);
    registry.set('project-overview', reduceProjectOverview);
    registry.set('project-context', reduceProjectContext);
    registry.set('tech-spec', reduceTechSpec);
    registry.set('source-tree', reduceSourceTree);
    registry.set('test-summary', reduceTestSummary);
}
