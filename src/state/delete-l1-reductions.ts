import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { ArtifactFileWriter } from './artifact-file-writer';
import type { ArtifactDeleteCtx, ArtifactDeleteFn, ArtifactDeleteRegistry } from './reducer-types';

const l1DeleteLogger = createLogger('delete-l1-reductions');
const logDebug = (...args: unknown[]) => l1DeleteLogger.debug(...args);

/**
 * L1 first-class delete reducers — extracted from
 * `ArtifactStore.deleteArtifact` switch (Phase 10).
 *
 * Covers the 11 first-class delete cases.  Most are simple
 * singleton/array-filter operations, but `epic` and `story` have
 * non-trivial disk-cleanup side effects (recursive epic folder
 * delete + exact-URI story file delete via tracked sourceFiles).
 */

// ─── Singletons (vision, product-brief, prd, architecture) ───────────────

const deleteVision: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('vision', undefined);
};

const deleteProductBrief: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('productBrief', undefined);
};

const deletePrd: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('prd', undefined);
};

const deleteArchitecture: ArtifactDeleteFn = (ctx) => {
    ctx.artifacts.set('architecture', undefined);
};

// ─── epic: complex — array filter + cross-ref sync + folder cleanup ─────

const deleteEpic: ArtifactDeleteFn = async (ctx, artifactId) => {
    const epics = ctx.artifacts.get('epics') || [];
    const epicToDelete = epics.find((e: any) => e.id === artifactId);
    const nextEpics = epics.filter((e: any) => e.id !== artifactId);
    ctx.artifacts.set('epics', nextEpics);

    if (epicToDelete) {
        // Drop the epic from each related requirement's relatedEpics.
        ctx.syncRequirementLinks(
            artifactId,
            epicToDelete.functionalRequirements || [],
            [],
            'functional',
        );
        ctx.syncRequirementLinks(
            artifactId,
            epicToDelete.nonFunctionalRequirements || [],
            [],
            'nonFunctional',
        );

        // Drop the deleted stories' IDs from any requirement.relatedStories.
        const deletedStoryIds = (epicToDelete.stories || []).map((s: any) => s.id);
        if (deletedStoryIds.length > 0) {
            ctx.removeStoryLinksFromRequirements(deletedStoryIds);
        }

        // Recursive disk delete — prevents shadow cards on reload.
        // Must be awaited to prevent race with syncToFiles re-creating files.
        if (ctx.sourceFolder) {
            const epicDir = ArtifactFileWriter.epicScopedDir(ctx.sourceFolder, artifactId);
            try {
                await vscode.workspace.fs.delete(epicDir, { recursive: true, useTrash: true });
                logDebug(`Deleted epic folder: ${epicDir.fsPath}`);
            } catch (err) {
                logDebug(`Failed to delete epic folder ${epicDir.fsPath}:`, err);
            }
        }
    }
};

// ─── story: complex — array filter + track + exact-URI disk cleanup ────

const deleteStory: ArtifactDeleteFn = async (ctx, artifactId) => {
    const epics = ctx.artifacts.get('epics') || [];
    let changed = false;
    let deletedStoryId: string | null = null;
    let deletedFromEpicId: string | null = null;

    epics.forEach((epic: any) => {
        if (epic.stories?.some((s: any) => s.id === artifactId)) {
            epic.stories = epic.stories.filter((s: any) => s.id !== artifactId);
            deletedStoryId = artifactId;
            deletedFromEpicId = epic.id;
            changed = true;
        }
    });

    if (changed) {
        ctx.artifacts.set('epics', [...epics]);
    }

    if (deletedStoryId) {
        ctx.removeStoryLinksFromRequirements([deletedStoryId]);
    }

    // Disk cleanup — exact URI from sourceFiles, falling back to derived path
    const storySourceKey = `story:${artifactId}`;
    if (ctx.sourceFiles.has(storySourceKey)) {
        const storyFileUri = ctx.sourceFiles.get(storySourceKey)!;
        try {
            await vscode.workspace.fs.delete(storyFileUri, { useTrash: true });
            logDebug(`Deleted exact story file: ${storyFileUri.fsPath}`);
        } catch (err) {
            logDebug('Failed to delete story file:', err);
        }
        ctx.sourceFiles.delete(storySourceKey);
    } else if (deletedStoryId && deletedFromEpicId && ctx.sourceFolder) {
        // Fallback to deriving the path if sourceFiles mapping was lost
        const epicDir = ArtifactFileWriter.epicScopedDir(ctx.sourceFolder, deletedFromEpicId);
        const storiesDir = vscode.Uri.joinPath(epicDir, 'stories');
        const storyFileName = `${String(deletedStoryId).replace(/[^a-zA-Z0-9.-]/g, '-')}.json`;
        const storyFileUri = vscode.Uri.joinPath(storiesDir, storyFileName);
        try {
            await vscode.workspace.fs.delete(storyFileUri, { useTrash: true });
            logDebug(`Deleted derived story file: ${storyFileUri.fsPath}`);
        } catch {
            /* file may not exist - ignore */
        }
    }
};

// ─── use-case: nested in epic — just filter ─────────────────────────────

const deleteUseCase: ArtifactDeleteFn = (ctx, artifactId) => {
    const epics = ctx.artifacts.get('epics') || [];
    let changed = false;
    epics.forEach((epic: any) => {
        if (epic.useCases?.some((uc: any) => uc.id === artifactId)) {
            epic.useCases = epic.useCases.filter((uc: any) => uc.id !== artifactId);
            changed = true;
        }
    });
    if (changed) {
        ctx.artifacts.set('epics', [...epics]);
    }
};

// ─── requirement: cross-array filter + epic refs cleanup ───────────────

const deleteRequirement: ArtifactDeleteFn = (ctx, artifactId) => {
    const requirements = ctx.artifacts.get('requirements') || {
        functional: [], nonFunctional: [], additional: [],
    };
    const nextFunctional = (requirements.functional || []).filter(
        (r: any) => r.id !== artifactId,
    );
    const nextNonFunctional = (requirements.nonFunctional || []).filter(
        (r: any) => r.id !== artifactId,
    );
    const nextAdditional = (requirements.additional || []).filter(
        (r: any) => r.id !== artifactId,
    );
    ctx.artifacts.set('requirements', {
        ...requirements,
        functional: nextFunctional,
        nonFunctional: nextNonFunctional,
        additional: nextAdditional,
    });

    // Clean up epic.functionalRequirements / epic.nonFunctionalRequirements refs
    const epics = ctx.artifacts.get('epics') || [];
    epics.forEach((epic: any) => {
        if (epic.functionalRequirements) {
            epic.functionalRequirements = epic.functionalRequirements.filter(
                (id: string) => id !== artifactId,
            );
        }
        if (epic.nonFunctionalRequirements) {
            epic.nonFunctionalRequirements = epic.nonFunctionalRequirements.filter(
                (id: string) => id !== artifactId,
            );
        }
    });
    ctx.artifacts.set('epics', [...epics]);
};

// ─── test-case: array filter ────────────────────────────────────────────

const deleteTestCase: ArtifactDeleteFn = (ctx, artifactId) => {
    const testCases = ctx.artifacts.get('testCases') || [];
    ctx.artifacts.set('testCases', testCases.filter((tc: any) => tc.id !== artifactId));
};

// ─── test-strategy: per-epic + fallback to top-level singleton ──────────

const deleteTestStrategy: ArtifactDeleteFn = (ctx, artifactId) => {
    const epics = ctx.artifacts.get('epics') || [];
    const tsOwnerEpic = epics.find((e: any) => e.testStrategy && e.testStrategy.id === artifactId);
    if (tsOwnerEpic) {
        tsOwnerEpic.testStrategy = undefined;
        ctx.artifacts.set('epics', [...epics]);
    } else {
        ctx.artifacts.set('testStrategy', undefined);
    }
};

// ─── test-design: splice by index ───────────────────────────────────────

const deleteTestDesign: ArtifactDeleteFn = (ctx, artifactId) => {
    const testDesigns = ctx.artifacts.get('testDesigns') || [];
    const tdIndex = testDesigns.findIndex((td: any) => td.id === artifactId);
    if (tdIndex >= 0) {
        testDesigns.splice(tdIndex, 1);
        ctx.artifacts.set('testDesigns', testDesigns);
    }
};

// ─── Registration ───────────────────────────────────────────────────────

export const L1_DELETE_REGISTERED_TYPES = [
    'vision',
    'product-brief',
    'prd',
    'architecture',
    'epic',
    'story',
    'use-case',
    'requirement',
    'test-case',
    'test-strategy',
    'test-design',
];

export function registerL1DeleteReducers(registry: ArtifactDeleteRegistry): void {
    registry.set('vision', deleteVision);
    registry.set('product-brief', deleteProductBrief);
    registry.set('prd', deletePrd);
    registry.set('architecture', deleteArchitecture);
    registry.set('epic', deleteEpic);
    registry.set('story', deleteStory);
    registry.set('use-case', deleteUseCase);
    registry.set('requirement', deleteRequirement);
    registry.set('test-case', deleteTestCase);
    registry.set('test-strategy', deleteTestStrategy);
    registry.set('test-design', deleteTestDesign);
}
