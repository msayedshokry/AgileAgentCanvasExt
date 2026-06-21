import { createLogger } from '../utils/logger';
import type { ArtifactLoadCtx, ArtifactLoadFn, ArtifactLoadRegistry } from './reducer-types';

const teaLoadLogger = createLogger('load-tea-loaders');
const logDebug = (...args: unknown[]) => teaLoadLogger.debug(...args);

/**
 * TEA module load reducers — extracted from
 * `ArtifactStore.loadFromFolder` switch (Phase 11).
 *
 * Covers the 7 TEA artifact types.  Five are singletons (single
 * source-of-truth file); two are arrays (multiple files of the same
 * type saved as separate per-id entries).
 */

// ─── traceability-matrix (singleton) ────────────────────────────────────

const loadTraceabilityMatrix: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts, sourceFiles } = ctx;
    sourceFiles.set('traceabilityMatrix', fileUri);
    const tmData = data.content || data;
    artifacts.set('traceabilityMatrix', tmData);
    logDebug('Loaded traceability matrix');
};

// ─── test-review (array) ────────────────────────────────────────────────

const loadTestReview: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts, sourceFiles, fileName, perIdKey } = ctx;
    const trData = data.content || data;
    const trId = data.metadata?.id || trData.id || `test-review-${fileName}`;
    sourceFiles.set(perIdKey('testReview', trId), fileUri);
    const existing = artifacts.get('testReviews') || [];
    existing.push(trData);
    artifacts.set('testReviews', existing);
    logDebug(`Loaded test review ${trId} from ${fileName}`);
};

// ─── nfr-assessment (singleton) ──────────────────────────────────────────

const loadNfrAssessment: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts, sourceFiles } = ctx;
    sourceFiles.set('nfrAssessment', fileUri);
    const nfrData = data.content || data;
    artifacts.set('nfrAssessment', nfrData);
    logDebug('Loaded NFR assessment');
};

// ─── atdd-checklist (singleton) ──────────────────────────────────────────

const loadAtddChecklist: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts, sourceFiles } = ctx;
    sourceFiles.set('atddChecklist', fileUri);
    const atddData = data.content || data;
    artifacts.set('atddChecklist', atddData);
    logDebug('Loaded ATDD checklist');
};

// ─── test-framework (singleton) ──────────────────────────────────────────

const loadTestFramework: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts, sourceFiles } = ctx;
    sourceFiles.set('testFramework', fileUri);
    const tfData = data.content || data;
    artifacts.set('testFramework', tfData);
    logDebug('Loaded test framework');
};

// ─── ci-pipeline (singleton) ─────────────────────────────────────────────

const loadCiPipeline: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts, sourceFiles } = ctx;
    sourceFiles.set('ciPipeline', fileUri);
    const ciData = data.content || data;
    artifacts.set('ciPipeline', ciData);
    logDebug('Loaded CI pipeline');
};

// ─── automation-summary (singleton) ──────────────────────────────────────

const loadAutomationSummary: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts, sourceFiles } = ctx;
    sourceFiles.set('automationSummary', fileUri);
    const asData = data.content || data;
    artifacts.set('automationSummary', asData);
    logDebug('Loaded automation summary');
};

// ─── Registration ───────────────────────────────────────────────────────

export const TEA_LOAD_REGISTERED_TYPES = [
    'traceability-matrix',
    'test-review',
    'nfr-assessment',
    'nfr',                  // legacy alias for nfr-assessment
    'atdd-checklist',
    'test-framework',
    'ci-pipeline',
    'automation-summary',
];

export function registerTeaLoadReducers(registry: ArtifactLoadRegistry): void {
    registry.set('traceability-matrix', loadTraceabilityMatrix);
    registry.set('test-review', loadTestReview);
    registry.set('nfr-assessment', loadNfrAssessment);
    registry.set('nfr', loadNfrAssessment);  // legacy alias
    registry.set('atdd-checklist', loadAtddChecklist);
    registry.set('test-framework', loadTestFramework);
    registry.set('ci-pipeline', loadCiPipeline);
    registry.set('automation-summary', loadAutomationSummary);
}
