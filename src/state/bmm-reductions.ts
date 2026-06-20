import { createLogger } from '../utils/logger';
import { pickChanges } from './reducer-helpers';
import type {
    ArtifactReducerCtx,
    ArtifactReducerFn,
    ArtifactReducerRegistry,
} from './reducer-types';

// ─── Field allowlists (Phase 18 follow-up) ──────────────────────────────
//
// Each reducer body that calls `Object.assign(upd, pickChanges(...))`
// references a named `*_FIELDS` const declared here.  Phase 17 left
// the field arrays as INLINE literals at the call sites — readable
// for short arrays but noisy once they exceeded ~10 fields (BMM has
// 17-field arrays in `reduceResearch` and `reduceUxDesign`, 18-field
// in `reduceTechSpec`).  This Phase 18 follow-up promotes each inline
// allowlist to a named module-level const, which gives readers an
// IDE jump-to-def target (`go to definition` on any `*_FIELDS`
// symbol lands here instead of requiring a substring grep across
// the consuming file).
//
// `readonly string[]` is the immutable-array convention.  An
// `as const` would give TypeScript a narrower element type (a union
// of the literal field names), but `pickChanges(changes, fieldList)`
// already accepts `readonly string[]`, so the wider type here keeps
// callers free of unnecessary casts if a future reducer needs to
// assemble the allowlist at runtime (none do today).

const RESEARCH_FIELDS: readonly string[] = [
    'researchType', 'topic', 'scope', 'goals', 'questions', 'methodology',
    'findings', 'competitiveAnalysis', 'marketAnalysis', 'trends',
    'technicalFindings', 'userResearch', 'recommendations', 'risks',
    'synthesis', 'references', 'appendices',
];

const UX_DESIGN_FIELDS: readonly string[] = [
    'overview', 'coreExperience', 'designInspiration', 'designSystem',
    'userJourneys', 'wireframes', 'componentStrategy', 'pageLayouts',
    'uxPatterns', 'responsive', 'accessibility', 'interactions',
    'errorStates', 'emptyStates', 'loadingStates', 'implementationNotes', 'references',
];

const READINESS_REPORT_FIELDS: readonly string[] = [
    'summary', 'assessment', 'blockers', 'risks', 'recommendations',
    'dependencyAnalysis', 'resourceAssessment', 'nextSteps', 'appendices',
];

const SPRINT_STATUS_FIELDS: readonly string[] = [
    'generated', 'project', 'projectKey', 'trackingSystem', 'storyLocation',
    'summary', 'epics', 'developmentStatus', 'statusDefinitions',
];

const RETROSPECTIVE_FIELDS: readonly string[] = [
    'epicReference', 'summary', 'whatWentWell', 'whatDidNotGoWell',
    'lessonsLearned', 'storyAnalysis', 'technicalDebt', 'impactOnFutureWork',
    'teamFeedback', 'actionItems', 'metricsSnapshot',
];

const CHANGE_PROPOSAL_FIELDS: readonly string[] = [
    'changeRequest', 'impactAnalysis', 'proposal', 'approval', 'implementation',
];

const CODE_REVIEW_FIELDS: readonly string[] = [
    'storyReference', 'reviewSummary', 'findings',
    'acceptanceCriteriaVerification', 'testCoverageAnalysis', 'securityAnalysis',
    'architectureCompliance', 'nextSteps', 'reviewerNotes',
];

const RISKS_FIELDS: readonly string[] = [
    'risks', 'assumptions', 'dependencies', 'riskMatrix', 'summary',
];

const DEFINITION_OF_DONE_FIELDS: readonly string[] = [
    'items', 'qualityGates', 'acceptanceSummary', 'templates', 'summary',
];

const PROJECT_OVERVIEW_FIELDS: readonly string[] = [
    'projectInfo', 'executiveSummary', 'projectClassification',
    'multiPartStructure', 'techStackSummary', 'keyFeatures',
    'architectureHighlights', 'codebaseAnalysis', 'development',
    'repositoryStructure', 'entryPoints', 'dataFlows', 'integrations',
    'knownIssues', 'recommendations', 'documentationMap', 'additionalNotes',
];

const PROJECT_CONTEXT_FIELDS: readonly string[] = [
    'projectInfo', 'overview', 'techStack', 'implementationRules',
    'patterns', 'forbiddenPatterns', 'keyFiles', 'entryPoints',
    'developmentWorkflow', 'errorHandling', 'stateManagement',
    'apiInteraction', 'securityConsiderations', 'performanceConsiderations',
    'knownIssues', 'additionalNotes',
];

const TECH_SPEC_FIELDS: readonly string[] = [
    'title', 'slug', 'version', 'overview', 'context', 'techStack',
    'dataModel', 'apiChanges', 'filesToModify', 'filesToCreate',
    'codePatterns', 'testPatterns', 'implementationPlan', 'testingStrategy',
    'risks', 'rollbackPlan', 'additionalContext', 'reviewers',
];

const SOURCE_TREE_FIELDS: readonly string[] = [
    'overview', 'statistics', 'multiPartStructure', 'directoryStructure',
    'criticalDirectories', 'entryPoints', 'fileOrganizationPatterns',
    'namingConventions', 'keyFileTypes', 'assetLocations', 'configurationFiles',
    'buildArtifacts', 'testLocations', 'documentationLocations', 'moduleGraph',
    'developmentNotes', 'recommendations',
];

const TEST_SUMMARY_FIELDS: readonly string[] = [
    'summary', 'generatedTests', 'coverageAnalysis', 'testPatterns',
    'recommendations', 'executionNotes',
];

const bmmLogger = createLogger('bmm-reductions');
const logDebug = (...args: unknown[]) => bmmLogger.debug(...args);

/**
 * BMM module artifact reducers — extracted from
 * `ArtifactStore.updateArtifact` switch (Phase 9).
 *
 * Covers the 12+ "BMM" (Business Method for AI) artifact types,
 * spanning array, singleton, and deprecated-alias cases.  Field
 * allowlists for each reducer body live in the `*_FIELDS` const
 * block above (see the Phase 18 follow-up rationale there).
 */

// ─── research (array) ───────────────────────────────────────────────────

const reduceResearch: ArtifactReducerFn<'research'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('researches') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'research-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, RESEARCH_FIELDS));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('researches', arr);
    logDebug('[bmm-reductions] Updated research:', upd.id);
};

// ─── ux-design (array) ──────────────────────────────────────────────────

const reduceUxDesign: ArtifactReducerFn<'ux-design'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('uxDesigns') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'ux-design-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, UX_DESIGN_FIELDS));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('uxDesigns', arr);
    logDebug('[bmm-reductions] Updated UX design:', upd.id);
};

// ─── readiness-report / readiness (array, deprecated alias) ───────────────

const reduceReadinessReport: ArtifactReducerFn<'readiness-report'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('readinessReports') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur: any = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'readiness-report-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, READINESS_REPORT_FIELDS));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('readinessReports', arr);
    logDebug('[bmm-reductions] Updated readiness report:', upd.id);
};

// ─── sprint-status / sprint (array, deprecated alias) ──────────────────

const reduceSprintStatus: ArtifactReducerFn<'sprint-status'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('sprintStatuses') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur: any = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'sprint-status-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, SPRINT_STATUS_FIELDS));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('sprintStatuses', arr);
    logDebug('[bmm-reductions] Updated sprint status:', upd.id);
};

// ─── retrospective (array) ──────────────────────────────────────────────

const reduceRetrospective: ArtifactReducerFn<'retrospective'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('retrospectives') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'retrospective-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, RETROSPECTIVE_FIELDS));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('retrospectives', arr);
    logDebug('[bmm-reductions] Updated retrospective:', upd.id);
};

// ─── change-proposal (array) ───────────────────────────────────────────

const reduceChangeProposal: ArtifactReducerFn<'change-proposal'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('changeProposals') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'change-proposal-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, CHANGE_PROPOSAL_FIELDS));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('changeProposals', arr);
    logDebug('[bmm-reductions] Updated change proposal:', upd.id);
};

// ─── code-review (array) ────────────────────────────────────────────────

const reduceCodeReview: ArtifactReducerFn<'code-review'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('codeReviews') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'code-review-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, CODE_REVIEW_FIELDS));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('codeReviews', arr);
    logDebug('[bmm-reductions] Updated code review:', upd.id);
};

// ─── risks (singleton) ──────────────────────────────────────────────────

const reduceRisks: ArtifactReducerFn<'risks'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('risks') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'risks-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, RISKS_FIELDS));
    ctx.artifacts.set('risks', upd);
    logDebug('[bmm-reductions] Updated risks:', upd.id);
};

// ─── definition-of-done (singleton) ─────────────────────────────────────

const reduceDefinitionOfDone: ArtifactReducerFn<'definition-of-done'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('definitionOfDone') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'definition-of-done-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, DEFINITION_OF_DONE_FIELDS));
    ctx.artifacts.set('definitionOfDone', upd);
    logDebug('[bmm-reductions] Updated definition of done:', upd.id);
};

// ─── project-overview (singleton) ───────────────────────────────────────

const reduceProjectOverview: ArtifactReducerFn<'project-overview'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('projectOverview') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'project-overview-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, PROJECT_OVERVIEW_FIELDS));
    ctx.artifacts.set('projectOverview', upd);
    logDebug('[bmm-reductions] Updated project overview:', upd.id);
};

// ─── project-context (singleton) ────────────────────────────────────────

const reduceProjectContext: ArtifactReducerFn<'project-context'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('projectContext') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'project-context-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, PROJECT_CONTEXT_FIELDS));
    ctx.artifacts.set('projectContext', upd);
    logDebug('[bmm-reductions] Updated project context:', upd.id);
};

// ─── tech-spec (array) ──────────────────────────────────────────────────

const reduceTechSpec: ArtifactReducerFn<'tech-spec'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('techSpecs') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'tech-spec-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, TECH_SPEC_FIELDS));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('techSpecs', arr);
    logDebug('[bmm-reductions] Updated tech spec:', upd.id);
};

// ─── source-tree (singleton) ────────────────────────────────────────────

const reduceSourceTree: ArtifactReducerFn<'source-tree'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('sourceTree') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'source-tree-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, SOURCE_TREE_FIELDS));
    ctx.artifacts.set('sourceTree', upd);
    logDebug('[bmm-reductions] Updated source tree:', upd.id);
};

// ─── test-summary (singleton) ────────────────────────────────────────────

const reduceTestSummary: ArtifactReducerFn<'test-summary'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('testSummary') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'test-summary-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, TEST_SUMMARY_FIELDS));
    ctx.artifacts.set('testSummary', upd);
    logDebug('[bmm-reductions] Updated test summary:', upd.id);
};

// ─── Registration ───────────────────────────────────────────────────────

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
