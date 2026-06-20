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
// for short arrays but noisy once they exceeded ~10 fields.  This
// Phase 18 follow-up promotes each inline allowlist to a named
// module-level const, which gives readers an IDE jump-to-def target
// (`go to definition` on `STORYTELLING_FIELDS` lands here instead of
// requiring a substring grep across the consuming file).
//
// `readonly string[]` is the immutable-array convention.  An
// `as const` would give TypeScript a narrower element type (a union
// of the literal field names), but `pickChanges(changes, fieldList)`
// already accepts `readonly string[]`, so the wider type here keeps
// callers free of unnecessary casts if a future reducer needs to
// assemble the allowlist at runtime (none do today).

const STORYTELLING_FIELDS: readonly string[] = [
    'storyType', 'frameworkName', 'storyTitle', 'purpose', 'targetAudience',
    'strategicContext', 'frameworkApplication', 'structure', 'completeStory',
    'elements', 'variations', 'visualElements', 'usageGuidelines', 'testing',
    'nextSteps',
];

const PROBLEM_SOLVING_FIELDS: readonly string[] = [
    'problemTitle', 'problemCategory', 'sessionInfo', 'problemDefinition',
    'diagnosis', 'analysis', 'solutionGeneration', 'solutionEvaluation',
    'recommendedSolution', 'implementationPlan', 'monitoring', 'lessonsLearned',
];

const INNOVATION_STRATEGY_FIELDS: readonly string[] = [
    'companyName', 'strategicFocus', 'sessionInfo', 'strategicContext',
    'marketAnalysis', 'businessModelAnalysis', 'disruptionOpportunities',
    'innovationOpportunities', 'strategicOptions', 'recommendedStrategy',
    'executionRoadmap', 'successMetrics', 'risks', 'governanceAndReview', 'appendix',
];

const DESIGN_THINKING_FIELDS: readonly string[] = [
    'projectName', 'sessionInfo', 'designChallenge', 'empathize', 'define',
    'ideate', 'prototype', 'test', 'nextSteps',
];

const cisLogger = createLogger('cis-reductions');
const logDebug = (...args: unknown[]) => cisLogger.debug(...args);

/**
 * CIS module artifact reducers — extracted from
 * `ArtifactStore.updateArtifact` switch (Phase 9).
 *
 * Covers the 4 "CIS" (Creative Innovation & Strategy) singleton
 * artifact types — all follow the same find-or-create, spread-then-
 * merge-content-fields pattern.  Field allowlists for each reducer
 * body live in the `*_FIELDS` const block above (see the Phase 18
 * follow-up rationale).
 */

// ─── storytelling ──────────────────────────────────────────────────────

const reduceStorytelling: ArtifactReducerFn<'storytelling'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('storytelling') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'storytelling-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, STORYTELLING_FIELDS));
    ctx.artifacts.set('storytelling', upd);
    logDebug('[cis-reductions] Updated storytelling:', upd.id);
};

// ─── problem-solving ──────────────────────────────────────────────────

const reduceProblemSolving: ArtifactReducerFn<'problem-solving'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('problemSolving') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'problem-solving-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, PROBLEM_SOLVING_FIELDS));
    ctx.artifacts.set('problemSolving', upd);
    logDebug('[cis-reductions] Updated problem solving:', upd.id);
};

// ─── innovation-strategy ──────────────────────────────────────────────

const reduceInnovationStrategy: ArtifactReducerFn<'innovation-strategy'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('innovationStrategy') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'innovation-strategy-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, INNOVATION_STRATEGY_FIELDS));
    ctx.artifacts.set('innovationStrategy', upd);
    logDebug('[cis-reductions] Updated innovation strategy:', upd.id);
};

// ─── design-thinking ───────────────────────────────────────────────────

const reduceDesignThinking: ArtifactReducerFn<'design-thinking'> = (ctx, artifactId, changes) => {
    const cur: any = ctx.artifacts.get('designThinking') || {};
    const upd = { ...cur };
    if (!upd.id) upd.id = artifactId || 'design-thinking-1';
    if (changes.status) upd.status = changes.status;
    if (changes.metadata?.status) upd.status = changes.metadata.status;
    Object.assign(upd, pickChanges(changes, DESIGN_THINKING_FIELDS));
    ctx.artifacts.set('designThinking', upd);
    logDebug('[cis-reductions] Updated design thinking:', upd.id);
};

// ─── Registration ───────────────────────────────────────────────────────

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
