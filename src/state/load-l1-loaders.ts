import * as vscode from 'vscode';

import { createLogger } from '../utils/logger';

import {
    mapSchemaEpicToInternal,
    mapSchemaStoryToInternal,
    mapSchemaRequirement,
    mapSchemaNonFunctionalRequirement,
    mapSchemaAdditionalRequirement,
    mergeEpicDuplicate,
} from './schema-mappers';

import type { ArtifactLoadCtx, ArtifactLoadFn, ArtifactLoadRegistry } from './reducer-types';

const l1LoadLogger = createLogger('load-l1-loaders');
const logDebug = (...args: unknown[]) => l1LoadLogger.debug(...args);

/**
 * L1 first-class load reducers — extracted from
 * `ArtifactStore.loadFromFolder` switch (Phase 11).
 *
 * Covers the 14+ "first-class" BMAD load cases.  Each loader reads
 * `ctx.data` (and per-file fields), and writes parsed artifacts into
 * `ctx.allEpics`, `ctx.artifacts`, `ctx.requirements`, etc.  Case
 * bodies are preserved verbatim from the original switch, just
 * relocated: every `this.X` → `ctx.X` (or an import), every
 * `allEpics.push(...)` → `ctx.allEpics.push(...)`.
 */

// ─── epics (manifest + monolithic duality + reqsInventory) ────────────────

const loadEpics: ArtifactLoadFn = async (ctx) => {
    const {
        data, fileUri, sourceFiles, allEpics, projectName, requirements,
        isEpicsManifest, loadEpicStoryRefs, perIdKey,
    } = ctx;

    sourceFiles.set('epics', fileUri);
    const epicsArray = data.content?.epics || data.epics || [data.content || data];

    if (isEpicsManifest) {
        // ── New format: manifest with refs ──────────────────
        const manifestParts = fileUri.path.split('/');
        manifestParts.pop();
        const manifestDirUri = fileUri.with({ path: manifestParts.join('/') });

        for (const ref of epicsArray) {
            const refPath = typeof ref === 'string' ? ref : ref.file;
            if (!refPath) continue;
            const epicFileUri = vscode.Uri.joinPath(manifestDirUri, refPath);
            try {
                const epicContent = await vscode.workspace.fs.readFile(epicFileUri);
                const epicJson = JSON.parse(Buffer.from(epicContent).toString('utf-8'));
                const epicData = epicJson.content || epicJson;
                const epic = mapSchemaEpicToInternal(epicData);
                if (epic) {
                    await loadEpicStoryRefs(epic, epicData, epicFileUri);
                    logDebug(`Loaded epic from ref: ${epic.id} - ${epic.title} (${epic.stories.length} stories)`);
                    const existingIndex = allEpics.findIndex((e) => e.id === epic.id);
                    if (existingIndex >= 0) {
                        mergeEpicDuplicate(allEpics[existingIndex], epic);
                    } else {
                        allEpics.push(epic);
                    }
                    sourceFiles.set(perIdKey('epic', epic.id), epicFileUri);
                }
            } catch (refErr: any) {
                logDebug(`Failed to load epic ref '${refPath}': ${refErr?.message ?? refErr}`);
            }
        }
    } else {
        // ── Old format: monolithic file with inline epic objects ──
        for (const epicData of epicsArray) {
            const epic = mapSchemaEpicToInternal(epicData);
            if (epic) {
                await loadEpicStoryRefs(epic, epicData, fileUri);
                logDebug(`Loaded epic: ${epic.id} - ${epic.title} (${epic.stories.length} stories)`);
                const existingIndex = allEpics.findIndex((e) => e.id === epic.id);
                if (existingIndex >= 0) {
                    mergeEpicDuplicate(allEpics[existingIndex], epic);
                } else {
                    allEpics.push(epic);
                }
            }
        }
    }

    // Extract project name (first non-empty wins — orchestrator-level guard
    // above is a separate write; here we just don't overwrite)
    if (!projectName) {
        ctx.projectName = data.metadata?.projectName ||
                          data.content?.overview?.projectName || '';
    }

    // Extract requirements inventory from epics.json
    // NOTE: This is a FALLBACK source. PRD is the authoritative source.
    const reqInventory = data.content?.requirementsInventory;
    if (reqInventory) {
        if (reqInventory.functional?.length) {
            requirements.functional.push(
                ...reqInventory.functional.map((fr: any) => mapSchemaRequirement(fr)),
            );
        }
        if (reqInventory.nonFunctional?.length) {
            requirements.nonFunctional.push(
                ...reqInventory.nonFunctional.map((nfr: any) => mapSchemaNonFunctionalRequirement(nfr)),
            );
        }
        if (reqInventory.additional?.length) {
            requirements.additional.push(
                ...reqInventory.additional.map((ar: any) => mapSchemaAdditionalRequirement(ar)),
            );
        }
    }
};

// ─── epic (standalone single-epic file with metadata merge) ──────────────

const loadEpic: ArtifactLoadFn = async (ctx) => {
    const { data, fileUri, allEpics, loadEpicStoryRefs, sourceFiles, perIdKey } = ctx;
    const epicData = {
        ...(data.metadata || {}),
        ...(data.content || data),
    };
    const epic = mapSchemaEpicToInternal(epicData);
    if (epic) {
        await loadEpicStoryRefs(epic, epicData, fileUri);
        logDebug(`Loaded standalone epic: ${epic.id} - ${epic.title} (${epic.stories.length} stories)`);
        const existingIndex = allEpics.findIndex((e) => e.id === epic.id);
        if (existingIndex >= 0) {
            mergeEpicDuplicate(allEpics[existingIndex], epic);
        } else {
            allEpics.push(epic);
        }
        sourceFiles.set(perIdKey('epic', epic.id), fileUri);
    }
};

// ─── story (standalone) ─────────────────────────────────────────────────

const loadStory: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, standaloneStories, sourceFiles, perIdKey } = ctx;
    const storyData = {
        ...(data.metadata || {}),
        ...(data.content || data),
    };
    const story = mapSchemaStoryToInternal(storyData);
    if (story) {
        logDebug(`Loaded standalone story: ${story.title}`);
        standaloneStories.push(story);
        sourceFiles.set(perIdKey('story', story.id), fileUri);
    }
};

// ─── use-case / usecase (parent linking or queue) ────────────────────────

const loadUseCase: ArtifactLoadFn = (ctx) => {
    const {
        data, fileName, allEpics, pendingUseCases, normalizeEpicId, epicIdFromUseCaseId,
    } = ctx;
    logDebug(`Found use-case: ${fileName}`);
    const ucData = data.content || data;
    const ucId = ucData.id || fileName.replace(/\.json$/, '');
    const summary = ucData.summary || ucData.description || '';
    const uc: any = {
        id: ucId,
        title: ucData.title || ucData.name || summary || `Use Case ${ucId}`,
        summary,
        description: summary,
        scenario: ucData.scenario || { context: '', before: '', after: '', impact: '' },
        actors: ucData.actors,
        status: ucData.status,
        primaryActor: ucData.primaryActor,
        secondaryActors: ucData.secondaryActors,
        trigger: ucData.trigger,
        preconditions: ucData.preconditions,
        postconditions: ucData.postconditions,
        mainFlow: ucData.mainFlow,
        alternativeFlows: ucData.alternativeFlows,
        exceptionFlows: ucData.exceptionFlows,
        businessRules: ucData.businessRules,
        relatedRequirements: ucData.relatedRequirements,
        relatedEpic: ucData.relatedEpic,
        relatedStories: ucData.relatedStories,
        sourceDocument: ucData.sourceDocument,
        notes: ucData.notes,
    };
    // Determine parent epic: prefer explicit epicId, fall back to ID prefix UC-N-*
    const parentEpicId = normalizeEpicId(
        ucData.epicId ||
        epicIdFromUseCaseId(uc.id),
    );
    if (parentEpicId) {
        const parentEpic = allEpics.find(
            (e: any) => normalizeEpicId(e.id) === parentEpicId,
        );
        if (parentEpic) {
            if (!parentEpic.useCases) { parentEpic.useCases = []; }
            const existing = parentEpic.useCases.find((u: any) => u.id === uc.id);
            if (existing) {
                const hasExistingContent = (existing.summary || existing.title || '').trim().length > 0;
                const hasNewContent = (uc.summary || uc.title || '').trim().length > 0;
                if (!hasExistingContent && hasNewContent) {
                    Object.assign(existing, uc);
                    logDebug(`Updated placeholder use-case ${uc.id} in epic ${parentEpicId}`);
                }
            } else {
                parentEpic.useCases.push(uc);
                logDebug(`Linked use-case ${uc.id} to epic ${parentEpicId}`);
            }
        } else {
            pendingUseCases.push({ uc, parentEpicId });
            logDebug(`Parent epic ${parentEpicId} not found for use-case ${uc.id}, queued for linking`);
        }
    } else {
        pendingUseCases.push({ uc, parentEpicId: null });
        logDebug(`No parent epic found for use-case ${uc.id}, queued for linking`);
    }
};

// ─── use-cases (per-epic collection file) ────────────────────────────────

const loadUseCases: ArtifactLoadFn = (ctx) => {
    const {
        data, fileUri, sourceFolder, allEpics, pendingUseCases, normalizeEpicId,
    } = ctx;
    logDebug(`Found use-cases collection: ${ctx.fileName}`);
    const ucArr = (data.content?.useCases || []).map((ucRaw: any) => {
        const ucId = ucRaw.id || ctx.fileName.replace(/\.json$/, '');
        const summary = ucRaw.summary || ucRaw.description || '';
        return {
            id: ucId,
            title: ucRaw.title || ucRaw.name || summary || `Use Case ${ucId}`,
            summary,
            description: summary,
            scenario: ucRaw.scenario || { context: '', before: '', after: '', impact: '' },
            actors: ucRaw.actors,
            status: ucRaw.status,
            primaryActor: ucRaw.primaryActor,
            secondaryActors: ucRaw.secondaryActors,
            trigger: ucRaw.trigger,
            preconditions: ucRaw.preconditions,
            postconditions: ucRaw.postconditions,
            mainFlow: ucRaw.mainFlow,
            alternativeFlows: ucRaw.alternativeFlows,
            exceptionFlows: ucRaw.exceptionFlows,
            businessRules: ucRaw.businessRules,
            relatedRequirements: ucRaw.relatedRequirements,
            relatedEpic: ucRaw.relatedEpic,
            relatedStories: ucRaw.relatedStories,
            sourceDocument: ucRaw.sourceDocument,
            notes: ucRaw.notes,
        };
    });
    // Derive parent epic from metadata or directory path
    const ucRelPath = fileUri.path.replace(sourceFolder.path, '');
    const ucDirMatch = ucRelPath.match(/epics[\\/]epic-(\d+)/);
    const ucEpicId = normalizeEpicId(
        data.metadata?.epicId ||
        (ucDirMatch ? ucDirMatch[1] : null),
    );
    if (ucEpicId && ucArr.length) {
        const parentEpic = allEpics.find((e: any) => normalizeEpicId(e.id) === ucEpicId);
        if (parentEpic) {
            if (!parentEpic.useCases) { parentEpic.useCases = []; }
            for (const uc of ucArr) {
                const existing = parentEpic.useCases.find((u: any) => u.id === uc.id);
                if (!existing) {
                    parentEpic.useCases.push(uc);
                }
            }
            logDebug(`Linked ${ucArr.length} use-cases to epic ${ucEpicId}`);
        } else {
            // Queue for deferred linking
            for (const uc of ucArr) {
                pendingUseCases.push({ uc, parentEpicId: ucEpicId });
            }
            logDebug(`Parent epic ${ucEpicId} not yet loaded, queued ${ucArr.length} use-cases`);
        }
    }
};

// ─── epic-test-strategy / test-strategy (per-epic OR global) ─────────────

const loadTestStrategy: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, sourceFolder, allEpics, sourceFiles, normalizeEpicId } = ctx;
    // Defensive: if metadata declares test-summary, skip (matches original switch fall-through)
    if (data.metadata?.artifactType === 'test-summary') {
        return;
    }
    const tsRelPath = fileUri.path.replace(sourceFolder.path, '');
    const tsDirMatch = tsRelPath.match(/epics[\\/]epic-(\d+)/);
    const tsEpicId = normalizeEpicId(
        data.metadata?.epicId ||
        data.content?.epicId ||
        (tsDirMatch ? tsDirMatch[1] : null),
    );
    if (tsEpicId) {
        logDebug(`Found epic test-strategy: ${ctx.fileName}`);
        const parentEpic = allEpics.find((e: any) => normalizeEpicId(e.id) === tsEpicId);
        if (parentEpic) {
            parentEpic.testStrategy = data.content;
            logDebug(`Linked test-strategy to epic ${tsEpicId}`);
        } else {
            logDebug(`Parent epic ${tsEpicId} not yet loaded for test-strategy, skipped`);
        }
    } else {
        // Global test strategy
        sourceFiles.set('testStrategy', fileUri);
        const tsData = data.content || data;
        ctx.artifacts.set('testStrategy', tsData);
        logDebug(`Loaded global test strategy: ${tsData.title || '(unnamed)'}`);
    }
};

// ─── requirements (standalone authoritative reqs file) ───────────────────

const loadRequirements: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, requirements, standaloneReqsLoaded, sourceFiles } = ctx;
    sourceFiles.set('requirements', fileUri);
    const reqs = data.content || data;
    if (reqs.functional) {
        requirements.functional.push(
            ...reqs.functional.map((fr: any) => mapSchemaRequirement(fr)),
        );
        standaloneReqsLoaded.functional = true;
    }
    if (reqs.nonFunctional) {
        requirements.nonFunctional.push(
            ...reqs.nonFunctional.map((nfr: any) => mapSchemaNonFunctionalRequirement(nfr)),
        );
        standaloneReqsLoaded.nonFunctional = true;
    }
    if (reqs.additional) {
        requirements.additional.push(
            ...reqs.additional.map((ar: any) => mapSchemaAdditionalRequirement(ar)),
        );
        standaloneReqsLoaded.additional = true;
    }
    logDebug(`Loaded standalone requirements: ${reqs.functional?.length || 0} FR, ${reqs.nonFunctional?.length || 0} NFR, ${reqs.additional?.length || 0} additional`);
};

// ─── functional-requirements (domain-based) ──────────────────────────────

const loadFunctionalRequirements: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, requirements, sourceFiles } = ctx;
    sourceFiles.set('functionalRequirements', fileUri);
    const frContent = data.content || data;
    const domains = frContent.domains;
    let frCount = 0;
    if (domains && typeof domains === 'object') {
        for (const domainKey of Object.keys(domains)) {
            const domain = domains[domainKey];
            const domainReqs: any[] = domain.requirements || [];
            for (const fr of domainReqs) {
                const desc = fr.description
                    || (Array.isArray(fr.detailedRequirements)
                        ? fr.detailedRequirements.join(' ')
                        : '')
                    || (Array.isArray(fr.userStories)
                        ? fr.userStories.join(' ')
                        : '');
                const mapped = mapSchemaRequirement({
                    ...fr,
                    description: desc,
                    capabilityArea: fr.capabilityArea || domain.title || domainKey,
                    type: fr.type || 'functional',
                });
                if (!requirements.functional.find((existing: any) => existing.id === mapped.id)) {
                    requirements.functional.push(mapped);
                    frCount++;
                }
            }
        }
        logDebug(`Loaded ${frCount} functional requirements from ${Object.keys(domains).length} domains in ${ctx.fileName}`);
    }
    if (frContent.functional) {
        requirements.functional.push(
            ...frContent.functional.map((fr: any) => mapSchemaRequirement(fr)),
        );
    }
    if (frContent.nonFunctional) {
        requirements.nonFunctional.push(
            ...frContent.nonFunctional.map((nfr: any) => mapSchemaNonFunctionalRequirement(nfr)),
        );
    }
};

// ─── vision (multi-schema: standard + flat + nested) ────────────────────

const loadVision: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts, sourceFiles, projectName } = ctx;
    sourceFiles.set('vision', fileUri);
    const visionData = data.content || data;
    const visionSubObj = visionData.vision && typeof visionData.vision === 'object'
        ? visionData.vision : null;

    // Product name: standard schema or flat schema (data.product.name)
    const visionProductName =
        visionData.productName ||
        data.product?.name ||
        data.metadata?.projectName || '';

    // problemStatement
    const rawPS = visionData.problemStatement || visionSubObj?.problemStatement;
    const flatProblemStatement: string =
        typeof rawPS === 'string' ? rawPS :
        rawPS && typeof rawPS === 'object'
            ? [rawPS.coreProblem, ...(Array.isArray(rawPS.impacts) ? rawPS.impacts : [])].filter(Boolean).join(' ')
            : (data.visionStatement || '');

    // valueProposition
    const rawVP = visionData.valueProposition || data.valueProposition ||
        visionSubObj?.proposedSolution || visionSubObj?.statement;
    const flatValueProposition: string =
        Array.isArray(rawVP) ? rawVP.join(' ') :
        typeof rawVP === 'string' ? rawVP : '';

    // targetUsers + successMetrics
    const rawTargetUsers = visionData.targetUsers || [];
    const rawSC = visionData.successCriteria || visionData.successMetrics || data.successMetrics || [];

    const vision = {
        productName: visionProductName,
        problemStatement: flatProblemStatement,
        vision: visionSubObj || undefined,
        targetUsers: rawTargetUsers,
        successMetrics: rawSC,
        valueProposition: flatValueProposition,
        successCriteria: rawSC.map((s: any) =>
            typeof s === 'string' ? s :
            s.metric ? `${s.metric}: ${s.target || s.description || ''}`.trim() :
            s.criterion ? `${s.criterion}${s.target ? ': ' + s.target : ''}` :
            JSON.stringify(s),
        ),
        status: data.status || data.metadata?.status || 'draft',
    };
    artifacts.set('vision', vision);
    logDebug(`Loaded vision: ${vision.productName}`);

    if (!projectName && vision.productName) {
        ctx.projectName = vision.productName;
    }
};

// ─── product-brief ──────────────────────────────────────────────────────

const loadProductBrief: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts, projectName } = ctx;
    sourceFilesSetEpicsCompat(ctx, fileUri);  // see helper below
    const pbData = data.content || data;
    artifacts.set('productBrief', pbData);
    if (!projectName) ctx.projectName = pbData.productName || data.metadata?.projectName || '';
    logDebug(`Loaded product-brief: ${pbData.productName || '(unnamed)'}`);
};

// ─── prd ────────────────────────────────────────────────────────────────

const loadPrd: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts, projectName, requirements, standaloneReqsLoaded } = ctx;
    sourceFilesSetEpicsCompat(ctx, fileUri);  // see helper below
    const prdData = data.content || data;
    artifacts.set('prd', prdData);
    if (!projectName) {
        ctx.projectName = prdData.productOverview?.productName || data.metadata?.projectName || '';
    }
    logDebug(`Loaded PRD: ${prdData.productOverview?.productName || '(unnamed)'}`);

    // PRD is the seed source for NFR and additional requirements.
    // Standalone requirements.json (if exists) takes priority per category.
    const prdReqs = prdData.requirements;
    if (prdReqs) {
        if (!standaloneReqsLoaded.nonFunctional
            && Array.isArray(prdReqs.nonFunctional) && prdReqs.nonFunctional.length > 0) {
            requirements.nonFunctional.push(
                ...prdReqs.nonFunctional.map((nfr: any) => mapSchemaNonFunctionalRequirement(nfr)),
            );
            logDebug(`Extracted ${prdReqs.nonFunctional.length} non-functional requirements from PRD`);
        } else if (standaloneReqsLoaded.nonFunctional) {
            logDebug(`Skipped PRD NFR extraction (standalone requirements.json takes priority)`);
        }
        if (!standaloneReqsLoaded.additional
            && Array.isArray(prdReqs.additional) && prdReqs.additional.length > 0) {
            requirements.additional.push(
                ...prdReqs.additional.map((ar: any) => mapSchemaAdditionalRequirement(ar)),
            );
            logDebug(`Extracted ${prdReqs.additional.length} additional requirements from PRD`);
        } else if (standaloneReqsLoaded.additional) {
            logDebug(`Skipped PRD additional extraction (standalone requirements.json takes priority)`);
        }
    }
};

// ─── architecture ───────────────────────────────────────────────────────

const loadArchitecture: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts } = ctx;
    sourceFilesSetEpicsCompat(ctx, fileUri);
    const archData = data.content || data;
    artifacts.set('architecture', archData);
    logDebug(`Loaded architecture: ${archData.overview?.projectName || '(unnamed)'}`);
};

// Inline helper for the simple singletons above (DRY: same sourceFiles.set(...) pattern)
function sourceFilesSetEpicsCompat(_ctx: ArtifactLoadCtx, _fileUri: vscode.Uri) {
    // origin: each case did `this.sourceFiles.set('<key>', fileUri)`.  We dispatch
    // on artifactType below so each case sets its own key.
    // (Kept as a no-op stub; the actual set is inline in each loader for clarity.)
}

// ─── test-case / test-cases (file may have single TC or array) ───────────

const loadTestCase: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts, sourceFiles, fileName } = ctx;
    sourceFiles.set('testCases', fileUri);
    const tcContent = data.content || data;
    const tcArray: any[] = tcContent.testCases || (Array.isArray(tcContent) ? tcContent : [tcContent]);
    const existingTCs: any[] = artifacts.get('testCases') || [];
    const merged = [...existingTCs];
    tcArray.forEach((tc: any) => {
        if (!tc) return;
        if (!tc.id) {
            tc.id = `TC-${merged.length + 1}`;
        }
        if (!merged.find((e: any) => e.id === tc.id)) {
            merged.push(tc);
        }
    });
    artifacts.set('testCases', merged);
    logDebug(`Loaded ${tcArray.length} test case(s) from ${fileName}`);
};

// ─── test-design / test-design-qa / test-design-architecture (array push) ─

const loadTestDesign: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts, sourceFiles, perIdKey, fileName } = ctx;
    const tdContent = data.content || data;
    const tdId = tdContent.id || `test-design-${fileName}`;
    sourceFiles.set(perIdKey('testDesign', tdId), fileUri);
    const existingTDs = artifacts.get('testDesigns') || [];
    existingTDs.push(tdContent);
    artifacts.set('testDesigns', existingTDs);
    logDebug(`Loaded test-design ${tdId} from ${fileName}`);
};

// ─── Correct sourceFiles keys for simple singletons ─────────────────────
//
// Inline overrides so each loader sets its own canonical sourceFiles key.
// (Replaces the no-op helper above.)

function epicsCompatSetProductBrief(ctx: ArtifactLoadCtx, fileUri: vscode.Uri) {
    ctx.sourceFiles.set('productBrief', fileUri);
}
function epicsCompatSetPrd(ctx: ArtifactLoadCtx, fileUri: vscode.Uri) {
    ctx.sourceFiles.set('prd', fileUri);
}
function epicsCompatSetArchitecture(ctx: ArtifactLoadCtx, fileUri: vscode.Uri) {
    ctx.sourceFiles.set('architecture', fileUri);
}

// Override the simple singletons to use their proper keys.
const loadProductBriefFinal: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts, projectName } = ctx;
    epicsCompatSetProductBrief(ctx, fileUri);
    const pbData = data.content || data;
    artifacts.set('productBrief', pbData);
    if (!projectName) ctx.projectName = pbData.productName || data.metadata?.projectName || '';
    logDebug(`Loaded product-brief: ${pbData.productName || '(unnamed)'}`);
};

const loadPrdFinal: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts, projectName, requirements, standaloneReqsLoaded } = ctx;
    epicsCompatSetPrd(ctx, fileUri);
    const prdData = data.content || data;
    artifacts.set('prd', prdData);
    if (!projectName) {
        ctx.projectName = prdData.productOverview?.productName || data.metadata?.projectName || '';
    }
    logDebug(`Loaded PRD: ${prdData.productOverview?.productName || '(unnamed)'}`);
    const prdReqs = prdData.requirements;
    if (prdReqs) {
        if (!standaloneReqsLoaded.nonFunctional
            && Array.isArray(prdReqs.nonFunctional) && prdReqs.nonFunctional.length > 0) {
            requirements.nonFunctional.push(
                ...prdReqs.nonFunctional.map((nfr: any) => mapSchemaNonFunctionalRequirement(nfr)),
            );
            logDebug(`Extracted ${prdReqs.nonFunctional.length} non-functional requirements from PRD`);
        } else if (standaloneReqsLoaded.nonFunctional) {
            logDebug(`Skipped PRD NFR extraction (standalone requirements.json takes priority)`);
        }
        if (!standaloneReqsLoaded.additional
            && Array.isArray(prdReqs.additional) && prdReqs.additional.length > 0) {
            requirements.additional.push(
                ...prdReqs.additional.map((ar: any) => mapSchemaAdditionalRequirement(ar)),
            );
            logDebug(`Extracted ${prdReqs.additional.length} additional requirements from PRD`);
        } else if (standaloneReqsLoaded.additional) {
            logDebug(`Skipped PRD additional extraction (standalone requirements.json takes priority)`);
        }
    }
};

const loadArchitectureFinal: ArtifactLoadFn = (ctx) => {
    const { data, fileUri, artifacts } = ctx;
    epicsCompatSetArchitecture(ctx, fileUri);
    const archData = data.content || data;
    artifacts.set('architecture', archData);
    logDebug(`Loaded architecture: ${archData.overview?.projectName || '(unnamed)'}`);
};

// ─── Registration ───────────────────────────────────────────────────────

export const L1_LOAD_REGISTERED_TYPES = [
    'epics',
    'epic',
    'story',
    'use-case',
    'usecase',         // legacy spelling
    'use-cases',
    'epic-test-strategy',
    'test-strategy',
    'requirements',
    'functional-requirements',
    'vision',
    'product-brief',
    'prd',
    'architecture',
    'test-case',
    'test-cases',      // legacy/plural spelling
    'test-design',
    'test-design-qa',
    'test-design-architecture',
];

export function registerL1LoadReducers(registry: ArtifactLoadRegistry): void {
    registry.set('epics', loadEpics);
    registry.set('epic', loadEpic);
    registry.set('story', loadStory);
    registry.set('use-case', loadUseCase);
    registry.set('usecase', loadUseCase);             // legacy alias
    registry.set('use-cases', loadUseCases);
    registry.set('epic-test-strategy', loadTestStrategy);
    registry.set('test-strategy', loadTestStrategy);
    registry.set('requirements', loadRequirements);
    registry.set('functional-requirements', loadFunctionalRequirements);
    registry.set('vision', loadVision);
    registry.set('product-brief', loadProductBriefFinal);
    registry.set('prd', loadPrdFinal);
    registry.set('architecture', loadArchitectureFinal);
    registry.set('test-case', loadTestCase);
    registry.set('test-cases', loadTestCase);         // legacy alias
    registry.set('test-design', loadTestDesign);
    registry.set('test-design-qa', loadTestDesign);
    registry.set('test-design-architecture', loadTestDesign);
}
