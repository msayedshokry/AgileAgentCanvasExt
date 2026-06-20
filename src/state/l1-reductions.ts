import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { ArtifactFileWriter } from './artifact-file-writer';
import { writeMarkdownCompanion } from './artifact-file-io';
import type {
    ArtifactChanges,
    ArtifactReducerCtx,
    ArtifactReducerFn,
    ArtifactReducerRegistry,
} from './reducer-types';
import type {
    Epic,
    FunctionalRequirement,
    Story,
    TestCase,
    TestDesign,
    TestStrategy,
    UseCase,
} from '../types';

const l1Logger = createLogger('l1-reductions');
const logDebug = (...args: unknown[]) => l1Logger.debug(...args);

/**
 * L1 first-class artifact reducers — extracted from
 * `ArtifactStore.updateArtifact` switch (Phase 9).
 *
 * Covers the 13 "first-class" BMAD artifacts that the LM tools touch
 * most often + a few administrative types.  Each function mutates the
 * artifacts Map in place per the original switch-arm logic.
 */

// ─── vision ─────────────────────────────────────────────────────────────────

const reduceVision: ArtifactReducerFn = (ctx, _artifactId, changes) => {
    const currentVision = ctx.artifacts.get('vision') || {};
    // Handle metadata updates
    if (changes.metadata) {
        ctx.artifacts.set('vision', {
            ...currentVision,
            ...changes.metadata,
            productName: changes.title || changes.metadata.productName || currentVision.productName,
        });
    } else {
        ctx.artifacts.set('vision', { ...currentVision, ...changes });
    }
};

// ─── epic ──────────────────────────────────────────────────────────────────

const reduceEpic: ArtifactReducerFn = (ctx, artifactId, changes) => {
    const epics: Epic[] = ctx.artifacts.get('epics') || [];
    const epicIndex = epics.findIndex((e: Epic) => e.id === artifactId);
    if (epicIndex < 0) {
        logDebug(`[l1-reductions] reduceEpic: epic ${artifactId} not found`);
        return;
    }

    const oldEpic = epics[epicIndex];
    // Merge changes: spread metadata fields first, then top-level fields.
    const updatedEpic = { ...oldEpic };

    if (changes.metadata && typeof changes.metadata === 'object') {
        Object.assign(updatedEpic, changes.metadata);
    }

    const { metadata: _meta, description, ...topFields } = changes;
    if (description) { updatedEpic.goal = description; }
    Object.assign(updatedEpic, topFields);

    epics[epicIndex] = updatedEpic;
    ctx.artifacts.set('epics', [...epics]);
    logDebug('[l1-reductions] Updated epic:', updatedEpic.id, updatedEpic.title);

    // Bidirectional linking: update relatedEpics on requirements
    ctx.syncRequirementLinks(
        artifactId,
        oldEpic.functionalRequirements || [],
        updatedEpic.functionalRequirements || [],
        'functional',
    );
    ctx.syncRequirementLinks(
        artifactId,
        oldEpic.nonFunctionalRequirements || [],
        updatedEpic.nonFunctionalRequirements || [],
        'nonFunctional',
    );
};

// ─── story ─────────────────────────────────────────────────────────────────
//
// Story reducer is the most complex: it can update an existing story OR
// create a new standalone story file + add it to the matching epic.
// On success, it also recalculates parent epic status.

const reduceStory: ArtifactReducerFn = async (ctx, artifactId, changes) => {
    const allEpics: Epic[] = ctx.artifacts.get('epics') || [];
    let storyFound = false;

    for (const epic of allEpics) {
        const storyIndex = epic.stories?.findIndex((s: Story) => s.id === artifactId);
        if (storyIndex !== undefined && storyIndex >= 0) {
            const oldStory = epic.stories![storyIndex];
            const updatedStory = { ...oldStory };

            if (changes.metadata && typeof changes.metadata === 'object') {
                Object.assign(updatedStory, changes.metadata);
            }

            const { metadata: _meta, ...topFields } = changes;
            Object.assign(updatedStory, topFields);

            // Dynamic status: downgrade to in-progress if there are open tasks
            const doneStatuses = ['done', 'verified'];
            const hasOpenTasks = updatedStory.tasks?.some((t: any) => !doneStatuses.includes(t.status));
            if (hasOpenTasks && ['done', 'completed'].includes(updatedStory.status?.toLowerCase() || '')) {
                updatedStory.status = 'in-progress';
                logDebug(`[l1-reductions] Story ${updatedStory.id} status downgraded to in-progress due to open tasks.`);
            }

            epic.stories![storyIndex] = updatedStory;
            storyFound = true;
            logDebug('[l1-reductions] Updated story:', updatedStory.id, updatedStory.title);
            break;
        }
    }

    if (storyFound) {
        ctx.artifacts.set('epics', [...allEpics]);
    } else {
        // ── Create new standalone story ──────────────────────────────────
        const newStory: Story = {
            id: artifactId,
            title: changes.title || `Story ${artifactId}`,
            status: changes.status || 'draft',
            storyPoints: changes.storyPoints,
            userStory: changes.userStory,
            acceptanceCriteria: changes.acceptanceCriteria || [],
            technicalNotes: changes.technicalNotes,
            tasks: changes.tasks || [],
            dependencies: changes.dependencies,
            requirementRefs: changes.requirementRefs,
            ...changes,
        };

        // Determine parent epicId — from changes, or derive from ID pattern
        let epicId = changes.epicId;
        if (!epicId) {
            const idMatch = artifactId.match(/^S?-?(\d+)[.\-]/i);
            if (idMatch) {
                epicId = `EPIC-${parseInt(idMatch[1], 10)}`;
            }
        }

        let parentEpic: Epic | undefined;
        if (epicId) {
            const normalizedTarget = epicId.replace(/^EPIC[\s-]*/i, '');
            parentEpic = allEpics.find((e: Epic) => {
                const normalizedEpicId = (e.id || '').replace(/^EPIC[\s-]*/i, '');
                return normalizedEpicId === normalizedTarget;
            });
        }

        if (parentEpic) {
            if (!parentEpic.stories) { parentEpic.stories = []; }
            parentEpic.stories.push(newStory);
            ctx.artifacts.set('epics', [...allEpics]);
            l1Logger.debug(`[l1-reductions] Created new story ${artifactId} in epic ${parentEpic.id}`);
        } else if (allEpics.length > 0) {
            l1Logger.debug(`[l1-reductions] WARNING: No epic found for epicId "${epicId}" — story ${artifactId} created but not linked to any epic`);
        }

        // Write standalone story file to disk
        if (ctx.sourceFolder) {
            try {
                const storyFileContent = {
                    metadata: {
                        schemaVersion: '1.0.0',
                        artifactType: 'story',
                        timestamps: {
                            created: new Date().toISOString(),
                            lastModified: new Date().toISOString(),
                        },
                        status: newStory.status || 'draft',
                    },
                    content: {
                        id: artifactId,
                        epicId: epicId || '',
                        title: newStory.title,
                        status: newStory.status || 'draft',
                        userStory: newStory.userStory,
                        acceptanceCriteria: newStory.acceptanceCriteria,
                        storyPoints: newStory.storyPoints,
                        technicalNotes: newStory.technicalNotes,
                        tasks: newStory.tasks,
                        dependencies: newStory.dependencies,
                        requirementRefs: newStory.requirementRefs,
                    },
                };

                const epicNum = (epicId || '').replace(/\D/g, '') || '0';
                const safeTitle = (newStory.title || artifactId)
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
                    .substring(0, 60);
                const fileName = `${epicNum}-${safeTitle}.json`;

                const storiesDir = vscode.Uri.joinPath(
                    ArtifactFileWriter.epicScopedDir(ctx.sourceFolder, epicId || '0'),
                    'stories',
                );
                try { await vscode.workspace.fs.createDirectory(storiesDir); } catch { /* exists */ }

                const fileUri = vscode.Uri.joinPath(storiesDir, fileName);

                if (ctx.outputFormat === 'json' || ctx.outputFormat === 'dual') {
                    await vscode.workspace.fs.writeFile(
                        fileUri,
                        Buffer.from(JSON.stringify(storyFileContent, null, 2), 'utf-8'),
                    );
                }
                if (ctx.outputFormat === 'markdown' || ctx.outputFormat === 'dual') {
                    const storyMdName = fileName.replace(/\.json$/, '.md');
                    const story = storyFileContent.content;
                    let storyMd = `# Story ${story.id}: ${story.title}\n\n`;
                    storyMd += `**Epic:** ${story.epicId}\n`;
                    storyMd += `**Status:** ${story.status || 'draft'}\n\n`;
                    if (story.userStory) storyMd += `## User Story\n\n${story.userStory}\n\n`;
                    if (story.acceptanceCriteria?.length) {
                        storyMd += `## Acceptance Criteria\n\n`;
                        for (const ac of story.acceptanceCriteria) {
                            storyMd += `- ${typeof ac === 'string' ? ac : ac.criterion || JSON.stringify(ac)}\n`;
                        }
                        storyMd += '\n';
                    }
                    if (story.technicalNotes) storyMd += `## Technical Notes\n\n${story.technicalNotes}\n\n`;
                    await writeMarkdownCompanion(fileUri, storyMdName, storyMd);
                }
                l1Logger.debug(`[l1-reductions] Wrote standalone story file: ${fileName}`);
            } catch (err: any) {
                l1Logger.debug(`[l1-reductions] Failed to write standalone story file: ${err?.message ?? err}`);
            }
        }
    }

    // Recalculate parent epic statuses
    for (const epic of allEpics) {
        if (!epic.stories || epic.stories.length === 0) continue;
        const hasActive = epic.stories.some((s: Story) => !['done', 'completed', 'archived', 'cancelled'].includes(s.status?.toLowerCase() || ''));
        if (hasActive && ['done', 'completed'].includes(epic.status?.toLowerCase() || '')) {
            epic.status = 'in-progress';
        }
    }
};

// ─── requirement / requirements ───────────────────────────────────────────

const reduceRequirement: ArtifactReducerFn = (ctx, artifactId, changes) => {
    const requirements = ctx.artifacts.get('requirements') || { functional: [], nonFunctional: [], additional: [] };
    const reqIndex = requirements.functional.findIndex((r: FunctionalRequirement) => r.id === artifactId);
    if (reqIndex < 0) {
        logDebug(`[l1-reductions] reduceRequirement: ${artifactId} not found`);
        return;
    }

    const updatedReq = { ...requirements.functional[reqIndex] };
    if (changes.title) updatedReq.title = changes.title;
    if (changes.description) updatedReq.description = changes.description;
    if (changes.status) updatedReq.status = changes.status;
    if (changes.relatedEpics) updatedReq.relatedEpics = changes.relatedEpics;
    if (changes.relatedStories) updatedReq.relatedStories = changes.relatedStories;
    if (changes.metadata && typeof changes.metadata === 'object') {
        Object.assign(updatedReq, changes.metadata);
    }

    requirements.functional[reqIndex] = updatedReq;
    ctx.artifacts.set('requirements', { ...requirements });
    logDebug('[l1-reductions] Updated requirement:', updatedReq.id, updatedReq.title);
};

const reduceRequirementsBulk: ArtifactReducerFn = (ctx, _artifactId, changes) => {
    // Bulk replacement of category arrays — no per-item validation
    const currentReqs = ctx.artifacts.get('requirements') || {};
    ctx.artifacts.set('requirements', { ...currentReqs, ...changes });
};

// ─── aiCursor ──────────────────────────────────────────────────────────────

const reduceAiCursor: ArtifactReducerFn = (ctx, _artifactId, changes) => {
    // UI-only cursor tracking (current artifact, position). No BMAD schema.
    ctx.artifacts.set('aiCursor', changes);
};

// ─── test-case ─────────────────────────────────────────────────────────────

const reduceTestCase: ArtifactReducerFn = (ctx, artifactId, changes) => {
    const testCases: TestCase[] = ctx.artifacts.get('testCases') || [];
    const tcIndex = testCases.findIndex((tc: TestCase) => tc.id === artifactId);
    if (tcIndex < 0) {
        logDebug(`[l1-reductions] reduceTestCase: ${artifactId} not found`);
        return;
    }

    const updated = { ...testCases[tcIndex] };
    if (changes.title) updated.title = changes.title;
    if (changes.status) updated.status = changes.status;
    if (changes.metadata) {
        Object.assign(updated, changes.metadata);
    }

    testCases[tcIndex] = updated;
    ctx.artifacts.set('testCases', [...testCases]);
    logDebug('[l1-reductions] Updated test case:', updated.id, updated.title);
};

// ─── test-strategy ─────────────────────────────────────────────────────────

const reduceTestStrategy: ArtifactReducerFn = (ctx, artifactId, changes) => {
    // Check if this is a per-epic test strategy
    const epics: Epic[] = ctx.artifacts.get('epics') || [];
    const ownerEpic = epics.find(e => e.testStrategy && e.testStrategy.id === artifactId);
    if (ownerEpic && ownerEpic.testStrategy) {
        if (changes.title) ownerEpic.testStrategy.title = changes.title;
        if (changes.status) ownerEpic.testStrategy.status = changes.status;
        if (changes.metadata) {
            Object.assign(ownerEpic.testStrategy, changes.metadata);
        }
        ctx.artifacts.set('epics', [...epics]);
    } else {
        // Fall back to top-level project singleton
        const currentTS: Partial<TestStrategy> = ctx.artifacts.get('testStrategy') || {};
        if (changes.title) currentTS.title = changes.title;
        if (changes.status) currentTS.status = changes.status;
        if (changes.metadata) {
            Object.assign(currentTS, changes.metadata);
        }
        ctx.artifacts.set('testStrategy', { ...currentTS });
    }
};

// ─── product-brief / prd / architecture (singleton updates) ──────────────

const reduceProductBrief: ArtifactReducerFn = (ctx, _artifactId, changes) => {
    const current = ctx.artifacts.get('productBrief') || {};
    const updated = { ...current };
    if (changes.title) updated.productName = changes.title;
    if (changes.status) updated.status = changes.status;
    if (changes.metadata) Object.assign(updated, changes.metadata);
    ctx.artifacts.set('productBrief', updated);
};

const reducePRD: ArtifactReducerFn = (ctx, _artifactId, changes) => {
    const current = ctx.artifacts.get('prd') || {};
    const updated = { ...current };
    if (changes.title) {
        if (!updated.productOverview) updated.productOverview = {};
        updated.productOverview.productName = changes.title;
    }
    if (changes.status) updated.status = changes.status;
    if (changes.metadata) Object.assign(updated, changes.metadata);
    ctx.artifacts.set('prd', updated);
};

const reduceArchitecture: ArtifactReducerFn = (ctx, _artifactId, changes) => {
    const current = ctx.artifacts.get('architecture') || {};
    const updated = { ...current };
    if (changes.title) {
        if (!updated.overview) updated.overview = {};
        updated.overview.projectName = changes.title;
    }
    if (changes.status) updated.status = changes.status;
    if (changes.metadata) Object.assign(updated, changes.metadata);
    ctx.artifacts.set('architecture', updated);
};

// ─── use-case (nested in epic) ────────────────────────────────────────────

const reduceUseCase: ArtifactReducerFn = (ctx, artifactId, changes) => {
    const allEpics: Epic[] = ctx.artifacts.get('epics') || [];
    let found = false;
    for (const epic of allEpics) {
        const ucIndex = epic.useCases?.findIndex((uc: UseCase) => uc.id === artifactId);
        if (ucIndex !== undefined && ucIndex >= 0) {
            const updatedUC = { ...epic.useCases![ucIndex] };
            if (changes.title) updatedUC.title = changes.title;
            if (changes.metadata) Object.assign(updatedUC, changes.metadata);
            epic.useCases![ucIndex] = updatedUC;
            found = true;
            logDebug('[l1-reductions] Updated use case:', updatedUC.id, updatedUC.title);
            break;
        }
    }
    if (found) {
        ctx.artifacts.set('epics', [...allEpics]);
    }
};

// ─── test-design (TEA-adjacent; placed in L1 due to test-plan flow) ───────

const reduceTestDesign: ArtifactReducerFn = (ctx, artifactId, changes) => {
    const testDesigns: TestDesign[] = ctx.artifacts.get('testDesigns') || [];
    const tdIndex = testDesigns.findIndex(td => td.id === artifactId);
    const currentTD: TestDesign | any = tdIndex >= 0 ? testDesigns[tdIndex] : {};
    const updatedTD = { ...currentTD };
    if (!updatedTD.id) {
        updatedTD.id = artifactId || 'test-design-1';
    }
    if (changes.status) updatedTD.status = changes.status;
    if (changes.metadata && typeof changes.metadata === 'object') {
        if (changes.metadata.status) updatedTD.status = changes.metadata.status;
    }
    // Merge flattened content fields (LLM sends them at top level, not wrapped in `content`)
    const contentFields = [
        'epicInfo', 'summary', 'notInScope', 'riskAssessment',
        'entryExitCriteria', 'projectTeam', 'coveragePlan', 'testCases',
        'executionOrder', 'testEnvironment', 'resourceEstimates',
        'qualityGateCriteria', 'mitigationPlans', 'assumptionsAndDependencies',
        'defectManagement', 'approval', 'appendices',
    ];
    for (const field of contentFields) {
        if ((changes as any)[field] !== undefined) {
            (updatedTD as any)[field] = (changes as any)[field];
        }
    }
    if (tdIndex >= 0) {
        testDesigns[tdIndex] = updatedTD;
    } else {
        testDesigns.push(updatedTD);
    }
    ctx.artifacts.set('testDesigns', testDesigns);
    logDebug('[l1-reductions] Updated test design:', updatedTD.id);
    // coveragePlan→TC extraction runs via reconcileDerivedState() in orchestrator tail
};

// ─── Registration ──────────────────────────────────────────────────────────

export const L1_REGISTERED_TYPES = [
    'vision',
    'epic',
    'story',
    'requirement',
    'requirements',     // bulk update
    'aiCursor',
    'test-case',
    'test-strategy',
    'product-brief',
    'prd',
    'architecture',
    'use-case',
    'test-design',
];

export function registerL1Reducers(registry: ArtifactReducerRegistry): void {
    registry.set('vision', reduceVision);
    registry.set('epic', reduceEpic);
    registry.set('story', reduceStory);
    registry.set('requirement', reduceRequirement);
    registry.set('requirements', reduceRequirementsBulk);
    registry.set('aiCursor', reduceAiCursor);
    registry.set('test-case', reduceTestCase);
    registry.set('test-strategy', reduceTestStrategy);
    registry.set('product-brief', reduceProductBrief);
    registry.set('prd', reducePRD);
    registry.set('architecture', reduceArchitecture);
    registry.set('use-case', reduceUseCase);
    registry.set('test-design', reduceTestDesign);
}
