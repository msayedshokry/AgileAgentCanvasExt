import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { ArtifactFileWriter } from './artifact-file-writer';
import { writeMarkdownCompanion } from './artifact-file-io';
import { pickChanges } from './reducer-helpers';
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

// ─── Field allowlists (Phase 18 follow-up) ──────────────────────────────
//
// Each reducer body that calls `Object.assign(upd, pickChanges(...))`
// (or the l1-style `Object.assign(updatedTD, pickChanges(...))`
// equivalent) references a named `*_FIELDS` const declared here.
// L1 has only one such reducer — `reduceTestDesign` — which Phase 17
// previously inlined the field allowlist as a `const contentFields`
// declared inside the reducer body.  Phase 18 promotes that const up
// to module level (as `TEST_DESIGN_FIELDS`) so it is IDE jump-to-def
// discoverable alongside the cis/tea/bmm equivalents, instead of
// substring-grep-buried inside the reducer body.
//
// `readonly string[]` is the immutable-array convention.  An
// `as const` would give TypeScript a narrower element type (a union
// of the literal field names), but `pickChanges(changes, fieldList)`
// already accepts `readonly string[]`, so the wider type here keeps
// callers free of unnecessary casts.

const TEST_DESIGN_FIELDS: readonly string[] = [
    'epicInfo', 'summary', 'notInScope', 'riskAssessment',
    'entryExitCriteria', 'projectTeam', 'coveragePlan', 'testCases',
    'executionOrder', 'testEnvironment', 'resourceEstimates',
    'qualityGateCriteria', 'mitigationPlans', 'assumptionsAndDependencies',
    'defectManagement', 'approval', 'appendices',
];

const l1Logger = createLogger('l1-reductions');
const logDebug = (...args: unknown[]) => l1Logger.debug(...args);

/**
 * L1 first-class artifact reducers — extracted from
 * `ArtifactStore.updateArtifact` switch (Phase 9).
 *
 * Covers the 13 "first-class" BMAD artifacts that the LM tools touch
 * most often + a few administrative types.  Each function mutates the
 * artifacts Map in place per the original switch-arm logic.
 *
 * Only `reduceTestDesign` uses the `parts` pattern (see the Phase 17 /
 * Phase 18 narrative in `reducer-types.ts`); the other 12 reducers
 * either narrow-cast individual `changes.*` fields directly (since
 * their target types are first-class canonical types rather than
 * open-shape BMAD content types) or read the full `changes` blob as
 * a top-level replacement.  This is intentional — the L1 reducers
 * are FIRST-CLASS type-aware, while cis/tea/bmm are BMAD-content
 * keyed off map keys, which is what makes them amenable to the
 * generic `pickChanges` allowlist pattern.
 */

// ─── vision ───────────────────────────────────────────────────────────────

const reduceVision: ArtifactReducerFn<'vision'> = (ctx, _artifactId, changes) => {
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

// ─── epic ───────────────────────────────────────────────────────────────

const reduceEpic: ArtifactReducerFn<'epic'> = (ctx, artifactId, changes) => {
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

    // Phase 13: `description` is now a canonical optional field on `Epic`
    // (promoted from LM-wire-only as part of the data-shape fix).  Legacy
    // LM prompts that send `description` continue to work: this reducer
    // maps `description` → `goal` so the canonical storage is in `goal`.
    // The cast is gone — `changes: ArtifactChanges<Epic>` now includes
    // `description?: string` natively through the canonical map.
    const { metadata: _meta, description, ...topFields } = changes;
    if (description) { updatedEpic.goal = description; }
    Object.assign(updatedEpic, topFields);
    // Precedence contract (Phase 13 round-up): when callers supply
    // BOTH `description` and `goal`, the canonical `goal` wins — the
    // `if (description)` block above seeds `goal` for description-only
    // callers, and the Object.assign that follows overwrites it if a
    // canonical `goal` was provided in the same changes packet.
    // Intentional: canonical beats legacy synonym, but worth pinning
    // here so future maintainers don't reshuffle and silently invert
    // the precedence.

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

// ─── story ──────────────────────────────────────────────────────────────
//
// Story reducer is the most complex: it can update an existing story OR
// create a new standalone story file + add it to the matching epic.
// On success, it also recalculates parent epic status.

const reduceStory: ArtifactReducerFn<'story'> = async (ctx, artifactId, changes) => {
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
        // Phase 17 fix (epicId wire-only contract enforcement):
        // destructure `epicId` out of `changes` BEFORE the `newStory`
        // literal so the spread that follows cannot re-include epicId
        // onto the canonical Story shape — closing the leak that the
        // `[Phase 17] epicId wire-only contract` regression guard in
        // `reducer-bodies-l1.test.ts` was holding open.  Mirrors the
        // `description`-al destructure pattern in `reduceEpic` (per-call
        // site expression of the wire-only contract: peel-DESTRUCTURE
        // → use-for-routing → never-re-include-via-spread).
        //
        // Phase 12 narrow-cast contract: the
        // `Partial<Story> & { epicId?: string }` cast declares the EXACT
        // shape of the wire packet (canonical Story + the one wire-only
        // `epicId`).  Phase 13 sweep: epicId is a creation-time parenting
        // hint (which Epic does the new story attach to), NOT a Story-level
        // attribute — after creation, the parent relationship is the
        // CONTAINING EPIC, so promoting epicId to canonical Story would
        // create two sources of truth for the same parent link.  The
        // narrow cast (and Phase 17 destructure) is therefore the correct
        // expression of the wire contract, not a candidate for
        // canonical-field promotion like the previous description → goal
        // case.
        // Wildcard note: `topFields` is `Partial<Story>` — the destructure
        // removed ONLY `epicId`.  This is INTENTIONAL — `story` is a
        // TOP_LEVEL_SPREAD key in the smoke matrix, so unknown wire keys
        // MUST spread through (preserves the prior `...changes` tail
        // behavior).  `metadata` similarly flows through unchanged because
        // the SMOKE matrix expects the topLevelSpread reducers to lift
        // the wire packet verbatim; do NOT "fix" this by stripping
        // metadata the way `reduceEpic` does, or you will regress the
        // smoke-matrix test for unknownWireField + metadata-only payloads.
        const { epicId: routingEpicId, ...topFields } = (changes as Partial<Story> & { epicId?: string });
        const newStory: Story = {
            ...topFields,        // base (excludes epicId)
            id: artifactId,      // explicit overrides win on tie
            title: changes.title || `Story ${artifactId}`,
            status: changes.status || 'draft',
            storyPoints: changes.storyPoints,
            // Phase 12: LM wire sends partial `userStory` (`{ asA? }`),
            // but `Story.userStory` is required. Default-fill at the call
            // site so an omitted LM wire field doesn't write
            // `{asA: undefined, iWant: undefined, soThat: undefined}` to
            // the store. Schema validation upstream at the LM tool
            // boundary is the enforcement layer for the field shape; the
            // cast preserves the wire packet's optionality.
            // Phase 17 ORDER NOTE: the `...topFields` spread runs FIRST
            // and the explicit userStory line runs AFTER, so the
            // default-fill wins on override — preserving the smoke
            // contract pinned by `'creates new story with userStory
            // default-fill on wire OMISSION'` in
            // `reducer-bodies-l1.test.ts`.
            userStory: changes.userStory ?? { asA: '', iWant: '', soThat: '' },
            acceptanceCriteria: changes.acceptanceCriteria || [],
            technicalNotes: changes.technicalNotes,
            tasks: changes.tasks || [],
            dependencies: changes.dependencies,
            requirementRefs: changes.requirementRefs,
        };

        // Determine parent epicId from the destructured `routingEpicId`
        // (captured above), or derive from ID pattern.  This is the
        // SINGLE permitted `epicId` consumer — by the time we reach
        // here, the canonical-S Story is already epicId-free due to
        // the destructure.
        let epicId = routingEpicId;
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

// ─── requirement / requirements ──────────────────────────────────────────

const reduceRequirement: ArtifactReducerFn<'requirement'> = (ctx, artifactId, changes) => {
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

const reduceRequirementsBulk: ArtifactReducerFn<'requirements'> = (ctx, _artifactId, changes) => {
    // Bulk replacement of category arrays — no per-item validation
    const currentReqs = ctx.artifacts.get('requirements') || {};
    ctx.artifacts.set('requirements', { ...currentReqs, ...changes });
};

// ─── aiCursor ────────────────────────────────────────────────────────────

const reduceAiCursor: ArtifactReducerFn<'aiCursor'> = (ctx, _artifactId, changes) => {
    // UI-only cursor tracking (current artifact, position). No BMAD schema.
    ctx.artifacts.set('aiCursor', changes);
};

// ─── test-case ───────────────────────────────────────────────────────────

const reduceTestCase: ArtifactReducerFn<'test-case'> = (ctx, artifactId, changes) => {
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

// ─── test-strategy ────────────────────────────────────────────────────────

const reduceTestStrategy: ArtifactReducerFn<'test-strategy'> = (ctx, artifactId, changes) => {
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

// ─── product-brief / prd / architecture (singleton updates) ────────────

const reduceProductBrief: ArtifactReducerFn<'product-brief'> = (ctx, _artifactId, changes) => {
    const current = ctx.artifacts.get('productBrief') || {};
    const updated = { ...current };
    if (changes.title) updated.productName = changes.title;
    if (changes.status) updated.status = changes.status;
    if (changes.metadata) Object.assign(updated, changes.metadata);
    ctx.artifacts.set('productBrief', updated);
};

const reducePRD: ArtifactReducerFn<'prd'> = (ctx, _artifactId, changes) => {
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

const reduceArchitecture: ArtifactReducerFn<'architecture'> = (ctx, _artifactId, changes) => {
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

// ─── use-case (nested in epic) ──────────────────────────────────────────

const reduceUseCase: ArtifactReducerFn<'use-case'> = (ctx, artifactId, changes) => {
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

// ─── test-design (TEA-adjacent; placed in L1 due to test-plan flow) ─────

const reduceTestDesign: ArtifactReducerFn<'test-design'> = (ctx, artifactId, changes) => {
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
    // Merge flattened content fields (LLM sends them at top level, not wrapped in `content`).
    // The field allowlist is the module-level `TEST_DESIGN_FIELDS` const,
    // promoted from inside-reducer-body by Phase 18 to match the cis/tea/bmm
    // convention (IDE jump-to-def discoverable).
    Object.assign(updatedTD, pickChanges(changes, TEST_DESIGN_FIELDS));
    if (tdIndex >= 0) {
        testDesigns[tdIndex] = updatedTD;
    } else {
        testDesigns.push(updatedTD);
    }
    ctx.artifacts.set('testDesigns', testDesigns);
    logDebug('[l1-reductions] Updated test design:', updatedTD.id);
    // coveragePlan→TC extraction runs via reconcileDerivedState() in orchestrator tail
};

// ─── Registration ───────────────────────────────────────────────────────

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
