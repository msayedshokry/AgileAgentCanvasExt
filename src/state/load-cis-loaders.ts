import { createLogger } from '../utils/logger';
import type { ArtifactLoadCtx, ArtifactLoadFn, ArtifactLoadRegistry } from './reducer-types';

const cisLoadLogger = createLogger('load-cis-loaders');
const logDebug = (...args: unknown[]) => cisLoadLogger.debug(...args);

/**
 * CIS module load reducers — extracted from
 * `ArtifactStore.loadFromFolder` switch (Phase 11).
 *
 * Covers the 4 CIS singleton artifact types — each is a single
 * document per project saved under a canonical key.
 */

function setSingleton(
    ctx: ArtifactLoadCtx,
    artifactsKey: string,
    sourceKey: string,
): void {
    ctx.sourceFiles.set(sourceKey, ctx.fileUri);
    const d = ctx.data.content || ctx.data;
    ctx.artifacts.set(artifactsKey, d);
    logDebug(`Loaded ${ctx.artifactType}`);
}

// ─── storytelling ───────────────────────────────────────────────────────

const loadStorytelling: ArtifactLoadFn = (ctx) => {
    setSingleton(ctx, 'storytelling', 'storytelling');
};

// ─── problem-solving ────────────────────────────────────────────────────

const loadProblemSolving: ArtifactLoadFn = (ctx) => {
    setSingleton(ctx, 'problemSolving', 'problemSolving');
};

// ─── innovation-strategy ─────────────────────────────────────────────────

const loadInnovationStrategy: ArtifactLoadFn = (ctx) => {
    setSingleton(ctx, 'innovationStrategy', 'innovationStrategy');
};

// ─── design-thinking ─────────────────────────────────────────────────────

const loadDesignThinking: ArtifactLoadFn = (ctx) => {
    setSingleton(ctx, 'designThinking', 'designThinking');
};

// ─── Registration ───────────────────────────────────────────────────────

export const CIS_LOAD_REGISTERED_TYPES = [
    'storytelling',
    'problem-solving',
    'innovation-strategy',
    'design-thinking',
];

export function registerCisLoadReducers(registry: ArtifactLoadRegistry): void {
    registry.set('storytelling', loadStorytelling);
    registry.set('problem-solving', loadProblemSolving);
    registry.set('innovation-strategy', loadInnovationStrategy);
    registry.set('design-thinking', loadDesignThinking);
}
