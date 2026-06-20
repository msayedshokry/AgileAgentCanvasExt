import { createLogger } from '../utils/logger';
import { pickChanges } from './reducer-helpers';
import type {
    ArtifactReducerCtx,
    ArtifactReducerFn,
    ArtifactReducerRegistry,
} from './reducer-types';

const cisLogger = createLogger('cis-reductions');
const logDebug = (...args: unknown[]) => cisLogger.debug(...args);

/**
 * CIS module artifact reducers — extracted from
 * `ArtifactStore.updateArtifact` switch (Phase 9).
 *
 * Covers the 4 "CIS" (Creative Innovation & Strategy) singleton
 * artifact types — all follow the same find-or-create, spread-then-
 * merge-content-fields pattern.
 */

// ─── storytelling ──────────────────────────────────────────────────────────

const reduceStorytelling: ArtifactReducerFn<'storytelling'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('storytelling') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'storytelling-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'storyType', 'frameworkName', 'storyTitle', 'purpose', 'targetAudience',
        'strategicContext', 'frameworkApplication', 'structure', 'completeStory',
        'elements', 'variations', 'visualElements', 'usageGuidelines', 'testing',
        'nextSteps',
    ]));
    ctx.artifacts.set('storytelling', upd);
    logDebug('[cis-reductions] Updated storytelling:', upd.id);
};

// ─── problem-solving ───────────────────────────────────────────────────────

const reduceProblemSolving: ArtifactReducerFn<'problem-solving'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('problemSolving') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'problem-solving-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'problemTitle', 'problemCategory', 'sessionInfo', 'problemDefinition',
        'diagnosis', 'analysis', 'solutionGeneration', 'solutionEvaluation',
        'recommendedSolution', 'implementationPlan', 'monitoring', 'lessonsLearned',
    ]));
    ctx.artifacts.set('problemSolving', upd);
    logDebug('[cis-reductions] Updated problem solving:', upd.id);
};

// ─── innovation-strategy ───────────────────────────────────────────────────

const reduceInnovationStrategy: ArtifactReducerFn<'innovation-strategy'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('innovationStrategy') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'innovation-strategy-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'companyName', 'strategicFocus', 'sessionInfo', 'strategicContext',
        'marketAnalysis', 'businessModelAnalysis', 'disruptionOpportunities',
        'innovationOpportunities', 'strategicOptions', 'recommendedStrategy',
        'executionRoadmap', 'successMetrics', 'risks', 'governanceAndReview', 'appendix',
    ]));
    ctx.artifacts.set('innovationStrategy', upd);
    logDebug('[cis-reductions] Updated innovation strategy:', upd.id);
};

// ─── design-thinking ───────────────────────────────────────────────────────

const reduceDesignThinking: ArtifactReducerFn<'design-thinking'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('designThinking') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'design-thinking-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, [
        'projectName', 'sessionInfo', 'designChallenge', 'empathize', 'define',
        'ideate', 'prototype', 'test', 'nextSteps',
    ]));
    ctx.artifacts.set('designThinking', upd);
    logDebug('[cis-reductions] Updated design thinking:', upd.id);
};

// ─── Registration ──────────────────────────────────────────────────────────

export const CIS_REGISTERED_TYPES = [
    'storytelling',
    'problem-solving',
    'innovation-strategy',
    'design-thinking',
];

export function registerCisReducers(registry: ArtifactReducerRegistry): void {
    registry.set('storytelling', reduceStorytelling);
    registry.set('problem-solving', reduceProblemSolving);
    registry.set('innovation-strategy', reduceInnovationStrategy);
    registry.set('design-thinking', reduceDesignThinking);
}
