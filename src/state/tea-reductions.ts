import { createLogger } from '../utils/logger';
import { pickChanges } from './reducer-helpers';
import type {
    ArtifactReducerCtx,
    ArtifactReducerFn,
    ArtifactReducerRegistry,
} from './reducer-types';

const teaLogger = createLogger('tea-reductions');
const logDebug = (...args: unknown[]) => teaLogger.debug(...args);

/**
 * TEA module artifact reducers — extracted from
 * `ArtifactStore.updateArtifact` switch (Phase 9).
 *
 * Covers the 7 "TEA" (Test Engineering & Automation) artifact types.
 * Each reducer applies a common pattern:
 *   1. Look up singleton (`get`) or find-by-id within array
 *   2. Spread existing + apply status + metadata + flattened content fields
 *   3. Persist back
 */

// ─── traceability-matrix (singleton) ───────────────────────────────────────

const reduceTraceabilityMatrix: ArtifactReducerFn<'traceability-matrix'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('traceabilityMatrix') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'traceability-matrix-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'storyInfo', 'traceability', 'gateDecision', 'cicdYamlSnippet',
        'relatedArtifacts', 'signOff',
    ]));
    ctx.artifacts.set('traceabilityMatrix', upd);
    logDebug('[tea-reductions] Updated traceability matrix:', upd.id);
};

// ─── test-review (array) ───────────────────────────────────────────────────

const reduceTestReview: ArtifactReducerFn<'test-review'> = (ctx, artifactId, changes) => {
    const arr: any[] = ctx.artifacts.get('testReviews') || [];
    const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
    const cur = idx >= 0 ? arr[idx] : {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'test-review-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'reviewInfo', 'executiveSummary', 'qualityAssessment', 'qualityScoreBreakdown',
        'criticalIssues', 'recommendations', 'bestPracticesFound', 'testFileAnalysis',
        'coverageAnalysis', 'contextAndIntegration', 'knowledgeBaseReferences',
        'nextSteps', 'decision', 'appendix',
    ]));
    if (idx >= 0) arr[idx] = upd; else arr.push(upd);
    ctx.artifacts.set('testReviews', arr);
    logDebug('[tea-reductions] Updated test review:', upd.id);
};

// ─── nfr-assessment / nfr (singleton, deprecated alias) ──────────────────

const reduceNfrAssessment: ArtifactReducerFn<'nfr-assessment'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('nfrAssessment') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'nfr-assessment-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'featureInfo', 'executiveSummary', 'nfrRequirements', 'assessments', 'quickWins',
        'recommendedActions', 'monitoringHooks', 'failFastMechanisms', 'evidenceGaps',
        'findingsSummary', 'gateYamlSnippet', 'testEvidence', 'signOff',
    ]));
    ctx.artifacts.set('nfrAssessment', upd);
    logDebug('[tea-reductions] Updated NFR assessment:', upd.id);
};

// ─── test-framework (singleton) ────────────────────────────────────────────

const reduceTestFramework: ArtifactReducerFn<'test-framework'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('testFramework') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'test-framework-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'framework', 'configuration', 'directoryStructure', 'fixtures', 'helpers',
        'pageObjects', 'mocking', 'dependencies', 'scripts', 'setupInstructions',
        'bestPractices',
    ]));
    ctx.artifacts.set('testFramework', upd);
    logDebug('[tea-reductions] Updated test framework:', upd.id);
};

// ─── ci-pipeline (singleton) ───────────────────────────────────────────────

const reduceCiPipeline: ArtifactReducerFn<'ci-pipeline'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('ciPipeline') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'ci-pipeline-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'platform', 'pipeline', 'jobs', 'testExecution', 'qualityGates', 'artifacts',
        'notifications', 'caching', 'secrets', 'documentation',
    ]));
    ctx.artifacts.set('ciPipeline', upd);
    logDebug('[tea-reductions] Updated CI pipeline:', upd.id);
};

// ─── automation-summary (singleton) ───────────────────────────────────────

const reduceAutomationSummary: ArtifactReducerFn<'automation-summary'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('automationSummary') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'automation-summary-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'summary', 'coverageAnalysis', 'testsCreated', 'fixturesCreated',
        'factoriesCreated', 'bmadIntegration', 'automationStrategy', 'recommendations',
        'executionResults',
    ]));
    ctx.artifacts.set('automationSummary', upd);
    logDebug('[tea-reductions] Updated automation summary:', upd.id);
};

// ─── atdd-checklist (singleton) ────────────────────────────────────────────

const reduceAtddChecklist: ArtifactReducerFn<'atdd-checklist'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('atddChecklist') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'atdd-checklist-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'storyInfo', 'storySummary', 'acceptanceCriteria', 'failingTestsCreated',
        'testScenarios', 'dataFactoriesCreated', 'fixturesCreated', 'mockRequirements',
        'requiredDataTestIds', 'pageObjects', 'implementationChecklist', 'runningTests',
        'redGreenRefactorWorkflow', 'knowledgeBaseReferences', 'testExecutionEvidence',
        'completionStatus',
    ]));
    ctx.artifacts.set('atddChecklist', upd);
    logDebug('[tea-reductions] Updated ATDD checklist:', upd.id);
};

// ─── Registration ──────────────────────────────────────────────────────────

export const TEA_REGISTERED_TYPES = [
    'traceability-matrix',
    'test-review',
    'nfr-assessment',
    'nfr',          // @deprecated alias for 'nfr-assessment'
    'test-framework',
    'ci-pipeline',
    'automation-summary',
    'atdd-checklist',
];

export function registerTeaReducers(registry: ArtifactReducerRegistry): void {
    registry.set('traceability-matrix', reduceTraceabilityMatrix);
    registry.set('test-review', reduceTestReview);
    registry.set('nfr-assessment', reduceNfrAssessment);
    registry.set('nfr', reduceNfrAssessment);  // @deprecated alias
    registry.set('test-framework', reduceTestFramework);
    registry.set('ci-pipeline', reduceCiPipeline);
    registry.set('automation-summary', reduceAutomationSummary);
    registry.set('atdd-checklist', reduceAtddChecklist);
}
