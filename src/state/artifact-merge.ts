import { createLogger } from '../utils/logger';
import type { BmadArtifacts, Epic, TestCase } from '../types';

const mergeLogger = createLogger('artifact-merge');
const logDebug = (...args: unknown[]) => mergeLogger.debug(...args);

/**
 * ArtifactMerge — extracted state-merge helpers from ArtifactStore.
 *
 * Pure functions that operate on either a `BmadArtifacts` view or the
 * raw artifacts Map.  No callbacks required other than `notifyChange`
 * for mutations.  Side-effect-free lookup, mutation-isolated merge.
 */

/**
 * Find an artifact by ID across all types.
 * Pure read-only scan of the `BmadArtifacts` view — no state mutation.
 *
 * Returns `{ type, artifact } | null` — `id` is exposed by callers via
 * the original id argument when they log/re-export the match.
 */
export function findArtifactById(
    state: BmadArtifacts,
    id: string,
): { type: string; artifact: any } | null {
    // Check vision
    if (id === 'vision-1' && state.vision) {
        return { type: 'vision', artifact: state.vision };
    }

    // Check PRD
    if (id === 'prd-1' && state.prd) {
        return { type: 'prd', artifact: state.prd };
    }

    // Check architecture
    if (id === 'architecture-1' && state.architecture) {
        return { type: 'architecture', artifact: state.architecture };
    }

    // Check product brief
    if (id === 'product-brief-1' && state.productBrief) {
        return { type: 'product-brief', artifact: state.productBrief };
    }

    // Check requirements (functional)
    const req = state.requirements?.functional.find(r => r.id === id);
    if (req) {
        return { type: 'requirement', artifact: req };
    }

    // Check requirements (non-functional)
    const nfr = state.requirements?.nonFunctional?.find((r: any) => r.id === id);
    if (nfr) {
        return { type: 'requirement', artifact: nfr };
    }

    // Check epics
    const epic = state.epics?.find(e => e.id === id);
    if (epic) {
        return { type: 'epic', artifact: epic };
    }

    // Check stories across all epics
    for (const e of state.epics || []) {
        const story = e.stories?.find(s => s.id === id);
        if (story) {
            return { type: 'story', artifact: { ...story, epicId: e.id } };
        }
    }

    // Check use-cases across all epics
    for (const e of state.epics || []) {
        const uc = e.useCases?.find((u: any) => u.id === id);
        if (uc) {
            return { type: 'use-case', artifact: { ...uc, epicId: e.id } };
        }
    }

    // Check test cases
    const testCase = state.testCases?.find(tc => tc.id === id);
    if (testCase) {
        return { type: 'test-case', artifact: testCase };
    }

    // Check test strategies on epics (per-epic test strategies)
    for (const e of state.epics || []) {
        if (e.testStrategy && e.testStrategy.id === id) {
            return { type: 'test-strategy', artifact: { ...e.testStrategy, epicId: e.id } };
        }
    }

    // Check top-level test strategy (project singleton, backward compat)
    if (state.testStrategy && (id === 'TS-1' || id === state.testStrategy.id)) {
        return { type: 'test-strategy', artifact: state.testStrategy };
    }

    // Check readiness reports (plural array — search by id or metadata.id).
    // Without this, harness pre-flight at updateArtifact's top saw
    // existingArtifact = {} for these types and auto-fix policies could
    // clobber real content with placeholders (the same data-loss pattern
    // that previously bit epic updates).
    const readiness = state.readinessReports?.find((a: any) => a.id === id || a.metadata?.id === id);
    if (readiness) {
        return { type: 'readiness-report', artifact: readiness };
    }

    // Check sprint statuses (plural array — search by id or metadata.id)
    const sprint = state.sprintStatuses?.find((a: any) => a.id === id || a.metadata?.id === id);
    if (sprint) {
        return { type: 'sprint-status', artifact: sprint };
    }

    return null;
}

/**
 * Merge imported state into existing state (used by import "Merge" mode).
 * Adds new items without removing existing ones. For arrays (epics, requirements,
 * test cases) items are deduplicated by ID; for singleton artifacts (vision, prd,
 * architecture, productBrief, testStrategy) existing values are preserved.
 */
export function mergeFromState(
    artifacts: Map<string, any>,
    notifyChange: () => void,
    data: Partial<BmadArtifacts>,
): void {
    // Project name: only overwrite if currently empty
    if (data.projectName && !artifacts.get('projectName')) {
        artifacts.set('projectName', data.projectName);
    }

    // Singleton artifacts: keep existing, fill empty slots
    if (data.vision && !artifacts.get('vision')) {
        artifacts.set('vision', data.vision);
    }
    if (data.prd && !artifacts.get('prd')) {
        artifacts.set('prd', data.prd);
    }
    if (data.architecture && !artifacts.get('architecture')) {
        artifacts.set('architecture', data.architecture);
    }
    if (data.productBrief && !artifacts.get('productBrief')) {
        artifacts.set('productBrief', data.productBrief);
    }
    if (data.testStrategy && !artifacts.get('testStrategy')) {
        artifacts.set('testStrategy', data.testStrategy);
    }

    // Epics: merge by ID (add new epics, merge new stories into existing epics)
    if (data.epics && data.epics.length > 0) {
        const existing: Epic[] = artifacts.get('epics') || [];
        const existingMap = new Map(existing.map(e => [e.id, e]));

        for (const importedEpic of data.epics) {
            const match = existingMap.get(importedEpic.id);
            if (match) {
                // Merge stories into existing epic
                const existingStoryIds = new Set((match.stories || []).map(s => s.id));
                for (const story of importedEpic.stories || []) {
                    if (!existingStoryIds.has(story.id)) {
                        match.stories.push(story);
                    }
                }
            } else {
                existing.push(importedEpic);
            }
        }
        artifacts.set('epics', existing);
    }

    // Requirements: merge by ID
    if (data.requirements) {
        const existing = artifacts.get('requirements') || { functional: [], nonFunctional: [], additional: [] };
        const mergeList = (target: any[], source: any[]) => {
            const ids = new Set(target.map((r: any) => r.id));
            for (const item of source) {
                if (!ids.has(item.id)) {
                    target.push(item);
                }
            }
        };
        if (data.requirements.functional) mergeList(existing.functional, data.requirements.functional);
        if (data.requirements.nonFunctional) mergeList(existing.nonFunctional, data.requirements.nonFunctional);
        if (data.requirements.additional) mergeList(existing.additional, data.requirements.additional);
        artifacts.set('requirements', existing);
    }

    // Test cases: merge by ID
    if (data.testCases && data.testCases.length > 0) {
        const existing: TestCase[] = artifacts.get('testCases') || [];
        const existingIds = new Set(existing.map(tc => tc.id));
        for (const tc of data.testCases) {
            if (!existingIds.has(tc.id)) {
                existing.push(tc);
            }
        }
        artifacts.set('testCases', existing);
    }

    notifyChange();
    logDebug(`[ArtifactMerge] mergeFromState: merged data into current project`);
}
