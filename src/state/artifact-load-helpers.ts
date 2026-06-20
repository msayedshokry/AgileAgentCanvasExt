import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { mapSchemaStoryToInternal } from './schema-mappers';
import type { Epic, Story, TestCase, TestCaseType } from '../types';

const loadHelpersLogger = createLogger('artifact-load-helpers');
const logDebug = (...args: unknown[]) => loadHelpersLogger.debug(...args);
const logError = (...args: unknown[]) => loadHelpersLogger.error(...args);

/**
 * ArtifactLoadHelpers — extracted load-phase utilities from ArtifactStore.
 * 
 * Contains:
 *   - findAllJsonFiles        Recursive JSON file scanner
 *   - detectArtifactType      Artifact type detection from metadata/content/filename
 *   - loadUiState             UI state loader from .bmad-state.json
 *   - loadEpicStoryRefs       Story reference resolver for epics
 *   - removeStoryLinksFromRequirements   Clean story refs on delete
 *   - syncRequirementLinks              Bidirectional epic↔requirement link sync
 *   - checkForInlineStories   Migration nudge for inline stories
 */

/**
 * Recursively find all JSON files in a folder and its subfolders.
 *
 * @param folderUri  Root directory to search.
 * @param depth      Current recursion depth (callers should omit — used internally).
 * @param visited    Set of already-visited canonical paths (cycle detection).
 * @param maxDepth   Maximum recursion depth (default 10).
 */
export async function findAllJsonFiles(
    folderUri: vscode.Uri,
    depth = 0,
    visited: Set<string> = new Set(),
    maxDepth = 10
): Promise<vscode.Uri[]> {
    if (depth > maxDepth) {
        logDebug(`findAllJsonFiles: max depth (${maxDepth}) reached at ${folderUri.fsPath}`);
        return [];
    }

    // Cycle detection: normalise the path and skip if already seen
    const canonical = folderUri.fsPath.toLowerCase();
    if (visited.has(canonical)) {
        logDebug(`findAllJsonFiles: cycle detected at ${folderUri.fsPath}`);
        return [];
    }
    visited.add(canonical);

    const results: vscode.Uri[] = [];
    
    try {
        const entries = await vscode.workspace.fs.readDirectory(folderUri);
        
        for (const [name, type] of entries) {
            if (name.startsWith('.')) continue; // Skip hidden files/folders
            
            const entryUri = vscode.Uri.joinPath(folderUri, name);
            
            if ((type & vscode.FileType.File) !== 0 && name.endsWith('.json')) {
                results.push(entryUri);
            } else if ((type & vscode.FileType.Directory) !== 0) {
                // Recursively search subdirectories
                const subResults = await findAllJsonFiles(entryUri, depth + 1, visited, maxDepth);
                results.push(...subResults);
            }
        }
    } catch (e) {
        logDebug(`Could not read directory ${folderUri.fsPath}: ${e}`);
    }
    
    return results;
}

/**
 * Detect artifact type from content structure or filename
 */
export function detectArtifactType(data: any, fileName: string): string {
    // Check metadata first (standard BMAD schema)
    if (data.metadata?.artifactType) {
        return data.metadata.artifactType;
    }

    // Check flat documentType field (e.g. product-vision.json, product-brief.json)
    if (data.documentType) {
        const dt = data.documentType.toLowerCase();
        if (dt.includes('vision')) return 'vision';
        if (dt.includes('brief')) return 'product-brief';
        if (dt.includes('epic')) return 'epics';
        if (dt.includes('story')) return 'story';
        if (dt.includes('use-case') || dt.includes('usecase')) return 'use-case';
        if (dt.includes('requirement')) return 'requirements';
        if (dt.includes('architecture')) return 'architecture';
        if (dt.includes('prd')) return 'prd';
    }
    
    // Check content structure
    if (data.content?.epics || data.epics) return 'epics';
    if (data.content?.userStory || data.userStory) return 'story';
    if (data.content?.scenario || data.scenario) return 'use-case';
    if (data.content?.functional || data.functional) return 'requirements';
    if (data.content?.testCases || (Array.isArray(data.content) && data.content[0]?.steps !== undefined)) return 'test-cases';
    if (data.content?.testTypes || data.content?.tooling) return 'test-strategy';
    if (data.content?.productOverview || data.productOverview) return 'prd';
    if (data.content?.systemComponents || data.systemComponents || data.content?.architectureStyle) return 'architecture';
    if (data.content?.productName && (data.content?.tagline || data.content?.keyFeatures)) return 'product-brief';
    // visionStatement is a flat-schema alternative to problemStatement
    if (data.visionStatement || data.content?.problemStatement || data.problemStatement || 
        data.content?.valueProposition || data.valueProposition) return 'vision';
    
    // Check filename patterns (use word-boundary-aware matching to avoid false positives)
    const lowerName = fileName.toLowerCase();
    // Standalone epic files in epics/ subdirectory (e.g. epic-1.json, epic-15.json)
    if (/^epic-[a-z0-9_-]+\.json$/.test(lowerName)) return 'epic';
    if (/\bepics?\b/.test(lowerName)) return 'epics';
    if (/\bstory\b|\bstories\b/.test(lowerName)) return 'story';
    if (lowerName.startsWith('uc-') || /\buse-case\b|\busecase\b/.test(lowerName)) return 'use-case';
    if (/\brequirement/.test(lowerName)) return 'requirements';
    if (/\bvision\b/.test(lowerName)) return 'vision';
    if (/\bproduct-brief\b|\bproductbrief\b/.test(lowerName)) return 'product-brief';
    if (/\bprd\b/.test(lowerName)) return 'prd';
    if (/\barchitecture\b/.test(lowerName)) return 'architecture';
    if (/\btest-cases?\b|\btestcases?\b/.test(lowerName)) return 'test-cases';
    if (/\btest-strategy\b|\bteststrategy\b/.test(lowerName)) return 'test-strategy';
    if (/\btest-design\b|\btestdesign\b/.test(lowerName)) return 'test-design';
    // TEA module types (L2)
    if (/\btraceability[_-]?matrix\b/.test(lowerName)) return 'traceability-matrix';
    if (/\btest[_-]?review\b/.test(lowerName)) return 'test-review';
    if (/\bnfr[_-]?assessment\b|\bnfr\b/.test(lowerName)) return 'nfr-assessment';
    if (/\batdd[_-]?checklist\b/.test(lowerName)) return 'atdd-checklist';
    if (/\btest[_-]?framework\b/.test(lowerName)) return 'test-framework';
    if (/\bci[_-]?pipeline\b/.test(lowerName)) return 'ci-pipeline';
    if (/\bautomation[_-]?summary\b/.test(lowerName)) return 'automation-summary';
    // BMM module types (L2)
    if (/\bux[_-]?design\b/.test(lowerName)) return 'ux-design';
    if (/\btech[_-]?spec\b/.test(lowerName)) return 'tech-spec';
    if (/\breadiness[_-]?report\b|\breadiness\b/.test(lowerName)) return 'readiness-report';
    if (/\bproject[_-]?overview\b/.test(lowerName)) return 'project-overview';
    if (/\bproject[_-]?context\b/.test(lowerName)) return 'project-context';
    if (/\bsource[_-]?tree\b/.test(lowerName)) return 'source-tree';
    if (/\bsprint[_-]?status\b|\bsprint\b/.test(lowerName)) return 'sprint-status';
    if (/\bcode[_-]?review\b/.test(lowerName)) return 'code-review';
    if (/\bretrospective\b/.test(lowerName)) return 'retrospective';
    if (/\bchange[_-]?proposal\b/.test(lowerName)) return 'change-proposal';
    if (/\btest[_-]?summary\b/.test(lowerName)) return 'test-summary';
    if (/\bresearch\b/.test(lowerName)) return 'research';
    if (/\brisks?\b/.test(lowerName) && !/\brisk[_-]?matrix\b/.test(lowerName)) return 'risks';
    if (/\bdefinition[_-]?of[_-]?done\b|\bdod\b/.test(lowerName)) return 'definition-of-done';
    // CIS module types (L2)
    if (/\bstorytelling\b/.test(lowerName)) return 'storytelling';
    if (/\bproblem[_-]?solving\b/.test(lowerName)) return 'problem-solving';
    if (/\binnovation[_-]?strategy\b/.test(lowerName)) return 'innovation-strategy';
    if (/\bdesign[_-]?thinking\b/.test(lowerName)) return 'design-thinking';
    
    return 'unknown';
}

/**
 * Load UI state from .bmad-state.json
 */
export async function loadUiState(folderUri: vscode.Uri, artifacts: Map<string, any>): Promise<void> {
    const possiblePaths = [
        vscode.Uri.joinPath(folderUri, 'planning-artifacts', '.bmad-state.json'),
        vscode.Uri.joinPath(folderUri, '.bmad-state.json')
    ];
    
    for (const stateUri of possiblePaths) {
        try {
            const content = await vscode.workspace.fs.readFile(stateUri);
            const stateData = JSON.parse(Buffer.from(content).toString('utf-8'));
            artifacts.set('uiState', stateData.ui);
            logDebug(`Loaded UI state from ${stateUri.fsPath}`);
            return;
        } catch {
            // Try next path
        }
    }
}

/**
 * Resolves storyRefs from an epic's JSON data and explicitly loads them.
 * Missing or unparseable files will generate "Broken Reference" story cards.
 */
export async function loadEpicStoryRefs(
    epic: Epic,
    epicData: any,
    epicFileUri: vscode.Uri,
    getOutputChannel: () => vscode.OutputChannel,
): Promise<void> {
    if (!epicData.storyRefs || !Array.isArray(epicData.storyRefs)) return;

    // Resolve the epic directory (where 'stories/' usually lives alongside 'epic.json')
    let epicDir = epicFileUri;
    const lastSlashPos = epicFileUri.path.lastIndexOf('/');
    if (lastSlashPos > 0) {
        epicDir = epicFileUri.with({ path: epicFileUri.path.substring(0, lastSlashPos) });
    }
    
    // Pre-read the stories directory to handle slug-based filenames
    // Many projects have files like "0.1-some-slug.json" but the ref just says "stories/0.1.json"
    let availableStoryFiles: [string, vscode.FileType][] = [];
    const storiesDirUri = vscode.Uri.joinPath(epicDir, 'stories');
    try {
        availableStoryFiles = await vscode.workspace.fs.readDirectory(storiesDirUri);
    } catch (e) {
        // Ignore if stories dir doesn't exist
    }

    for (const ref of epicData.storyRefs) {
        const refId = typeof ref === 'string' ? ref : ref.id;
        const refPath = typeof ref === 'string' ? ref : ref.file;
        
        let storyUri: vscode.Uri | null = null;
        let finalRefPath = refPath || String(refId);

        // 1. If we have availableStoryFiles, try to find by ID prefix
        if (refId) {
            const exactBase = `${refId}.json`;
            const expectedBase = `${refId}-`;
            const foundMatch = availableStoryFiles.find(([name, type]) => 
                type === vscode.FileType.File && (name === exactBase || name.startsWith(expectedBase))
            );
            if (foundMatch) {
                storyUri = vscode.Uri.joinPath(storiesDirUri, foundMatch[0]);
                finalRefPath = `stories/${foundMatch[0]}`;
            }
        }

        // 2. Fallback to the exact refPath provided
        if (!storyUri && refPath) {
            storyUri = vscode.Uri.joinPath(epicDir, refPath);
            finalRefPath = refPath;
        }

        if (!storyUri) continue;
        
        try {
            const storyContent = await vscode.workspace.fs.readFile(storyUri);
            const storyJson = JSON.parse(Buffer.from(storyContent).toString('utf-8'));
            const storyMerged = { ...(storyJson.metadata || {}), ...(storyJson.content || storyJson) };
            
            // Track source for deduplication logic later
            storyMerged._sourceEpicId = epic.id;
            
            const story = mapSchemaStoryToInternal(storyMerged);
            if (story) {
                // Prevent duplicate if also defined inline
                if (!epic.stories.find(s => String(s.id) === String(story.id))) {
                    epic.stories.push(story);
                    logDebug(`Specifically loaded storyRef: ${story.id} from ${storyUri.fsPath}`);
                }
            }
        } catch (err: any) {
            const errMsg = err?.message || String(err);
            if (errMsg.includes('ENOENT') || errMsg.includes('FileNotFound')) {
                logError(`❌ Missing referenced story file: ${storyUri.fsPath}`);
                getOutputChannel().appendLine(`❌ ERROR: Missing referenced story file found in epic ${epic.id}: ${storyUri.fsPath}`);
            } else {
                logError(`❌ Failed to parse referenced story file: ${storyUri.fsPath} (${errMsg})`);
                getOutputChannel().appendLine(`❌ ERROR: Failed to parse referenced story file in epic ${epic.id}: ${storyUri.fsPath} (${errMsg})`);
            }
            
            const refTitle = typeof ref === 'string' ? ref : ref.title;
            // Only push placeholder if not already populated inline
            if (refId && !epic.stories.find(s => String(s.id) === String(refId))) {
                const placeholderStory: any = {
                    id: refId,
                    title: `⚠️ Broken Reference: ${refTitle || finalRefPath}`,
                    status: 'draft',
                    userStory: { asA: '', iWant: '', soThat: '' },
                    acceptanceCriteria: [],
                    technicalNotes: `Missing or unparseable file: ${finalRefPath}`
                };
                epic.stories.push(placeholderStory as Story);
            }
        }
    }
}

export function removeStoryLinksFromRequirements(storyIds: string[], artifacts: Map<string, any>): void {
    const requirements = artifacts.get('requirements');
    if (!requirements) return;

    const lists = [requirements.functional || [], requirements.nonFunctional || [], requirements.additional || []];
    let changed = false;

    lists.forEach((reqList: any[]) => {
        reqList.forEach((req: any) => {
            if (Array.isArray(req.relatedStories)) {
                const next = req.relatedStories.filter((id: string) => !storyIds.includes(id));
                if (next.length !== req.relatedStories.length) {
                    req.relatedStories = next;
                    changed = true;
                }
            }
        });
    });

    if (changed) {
        artifacts.set('requirements', { ...requirements });
    }
}

/**
 * Sync relatedEpics on requirements when an epic's linked requirements change
 * This ensures bidirectional linking between epics and requirements
 */
export function syncRequirementLinks(
    epicId: string,
    oldReqIds: string[],
    newReqIds: string[],
    reqType: 'functional' | 'nonFunctional',
    artifacts: Map<string, any>,
): void {
    const requirements = artifacts.get('requirements');
    if (!requirements) return;

    const reqList = reqType === 'functional' ? requirements.functional : requirements.nonFunctional;
    if (!reqList) return;

    // Find requirements that were removed from the epic
    const removedReqIds = oldReqIds.filter(id => !newReqIds.includes(id));
    // Find requirements that were added to the epic
    const addedReqIds = newReqIds.filter(id => !oldReqIds.includes(id));

    let changed = false;

    // Remove epicId from removed requirements' relatedEpics
    for (const reqId of removedReqIds) {
        const req = reqList.find((r: any) => r.id === reqId);
        if (req && req.relatedEpics) {
            const idx = req.relatedEpics.indexOf(epicId);
            if (idx !== -1) {
                req.relatedEpics.splice(idx, 1);
                changed = true;
                logDebug(`Removed ${epicId} from ${reqId}.relatedEpics`);
            }
        }
    }

    // Add epicId to added requirements' relatedEpics
    for (const reqId of addedReqIds) {
        const req = reqList.find((r: any) => r.id === reqId);
        if (req) {
            if (!req.relatedEpics) {
                req.relatedEpics = [];
            }
            if (!req.relatedEpics.includes(epicId)) {
                req.relatedEpics.push(epicId);
                changed = true;
                logDebug(`Added ${epicId} to ${reqId}.relatedEpics`);
            }
        }
    }

    if (changed) {
        artifacts.set('requirements', { ...requirements });
    }
}

/**
 * Check if the project's epics.json still contains inline story objects.
 * If so, show a one-time nudge suggesting migration.
 * Runs fire-and-forget — does not block the load path.
 */
export async function checkForInlineStories(
    folderUri: vscode.Uri,
    sourceFiles: Map<string, vscode.Uri>,
): Promise<boolean> {
    try {
        const epicsUri = sourceFiles.get('epics');
        if (!epicsUri) { return false; }

        const raw = Buffer.from(await vscode.workspace.fs.readFile(epicsUri)).toString('utf-8');
        const parsed = JSON.parse(raw);
        const epics = parsed?.content?.epics || parsed?.epics || [];

        let inlineCount = 0;
        for (const epic of epics) {
            for (const story of (epic.stories || [])) {
                // Inline stories are objects; migrated stories are string refs
                if (typeof story === 'object' && story !== null) {
                    inlineCount += 1;
                }
            }
        }

        if (inlineCount === 0) { return false; }

        const action = await vscode.window.showInformationMessage(
            `This project has ${inlineCount} inline ${inlineCount === 1 ? 'story' : 'stories'} in epics.json. ` +
            `Run "Migrate to Reference Architecture" to extract them to standalone files for single-source-of-truth management.`,
            'Migrate Now',
            'Dismiss'
        );

        if (action === 'Migrate Now') {
            await vscode.commands.executeCommand('agileagentcanvas.migrateToRefArch');
        }
        return true;
    } catch {
        // Silent — detection is best-effort, should never break load
        return false;
    }
}


export function reconcileDerivedState(artifacts: Map<string, any>): void {
    const epics: Epic[] = artifacts.get('epics') || [];
    const testDesigns: any[] = artifacts.get('testDesigns') || [];

    // ── 1. Extract coveragePlan items from test-design into testCases ──
    // We partition existing TCs into "from-file" (test-cases.json) and
    // "from-coveragePlan" so we can rebuild the latter without losing the
    // former.  A TC is considered "from-coveragePlan" if its id matches
    // the coveragePlan item IDs.
    const allTCs: TestCase[] = artifacts.get('testCases') || [];
    const coveragePlanItemIds = new Set<string>();
    const priorities = ['p0', 'p1', 'p2', 'p3'] as const;

    for (const testDesign of testDesigns) {
        if (testDesign?.coveragePlan) {
            for (const pKey of priorities) {
                for (const item of (testDesign.coveragePlan[pKey] || [])) {
                    if (item.id) coveragePlanItemIds.add(item.id);
                }
            }
        }
    }

    // Keep only TCs that did NOT originate from coveragePlan
    const fileTCs = allTCs.filter((tc: TestCase) => !coveragePlanItemIds.has(tc.id));
    const extractedTCs: TestCase[] = [];

    for (const testDesign of testDesigns) {
        if (testDesign?.coveragePlan) {
            const tdEpicId = testDesign.epicInfo?.epicId || '';
            const normEpicId = tdEpicId.replace(/^EPIC-/i, '').replace(/^Epic\s*/i, '').trim();
            const tdEpicStoryIds = new Set<string>();
            const matchingEpic = epics.find((e: Epic) => e.id === tdEpicId || e.id === normEpicId);
            if (matchingEpic) {
                (matchingEpic.stories || []).forEach((s: Story) => tdEpicStoryIds.add(s.id));
            }

            // Scope-based story fallback
            let scopeStoryId: string | undefined;
            const scopeMatch = (testDesign.summary?.scope || '').match(/\bS-[\d]+\.[\d]+\b/i);
            if (scopeMatch) scopeStoryId = scopeMatch[0];

            for (const pKey of priorities) {
                const items: any[] = testDesign.coveragePlan[pKey] || [];
                for (const item of items) {
                if (!item.id) continue;
                // Skip if a file-originated TC already has this ID
                if (fileTCs.find((tc: TestCase) => tc.id === item.id)) continue;
                if (extractedTCs.find((tc: TestCase) => tc.id === item.id)) continue;

                // Derive storyId from test ID prefix: "1.3-COMP-001" → "S-1.3"
                let storyId: string | undefined;
                const prefixMatch = item.id.match(/^([\d]+\.[\d]+)-/);
                if (prefixMatch) {
                    const candidate = `S-${prefixMatch[1]}`;
                    if (tdEpicStoryIds.has(candidate)) {
                        storyId = candidate;
                    } else if (tdEpicStoryIds.has(prefixMatch[1])) {
                        storyId = prefixMatch[1];
                    }
                }
                if (!storyId && scopeStoryId && tdEpicStoryIds.has(scopeStoryId)) {
                    storyId = scopeStoryId;
                }

                // Map testLevel → TestCaseType
                const rawLevel = (item.testLevel || '').toLowerCase();
                let tcType: TestCaseType = 'acceptance';
                if (rawLevel === 'unit') tcType = 'unit';
                else if (rawLevel === 'integration' || rawLevel === 'performance') tcType = 'integration';
                else if (rawLevel === 'e2e') tcType = 'e2e';

                extractedTCs.push({
                    id: item.id,
                    title: item.requirement || item.id,
                    description: item.testApproach || '',
                    type: tcType,
                    status: 'draft',
                    priority: pKey === 'p0' ? 'P0' : pKey === 'p1' ? 'P1' : pKey === 'p2' ? 'P2' : 'P3',
                    storyId,
                    epicId: tdEpicId || undefined,
                    relatedRequirements: item.requirementId ? [item.requirementId] : [],
                    tags: item.riskLink ? [item.riskLink] : []
                });
                }
            }
        }
    }

    artifacts.set('testCases', [...fileTCs, ...extractedTCs]);

    // ── 2. Attach test-design riskAssessment risks to matching epic ──
    for (const testDesign of testDesigns) {
        if (testDesign?.riskAssessment && testDesign.epicInfo?.epicId) {
            const tdEpicIdRaw = testDesign.epicInfo.epicId;
            const tdEpicId = tdEpicIdRaw.replace(/^EPIC-/i, '').replace(/^Epic\s*/i, '').trim();
            const ra = testDesign.riskAssessment;
            const tdRisks: any[] = [
                ...(ra.highPriority || []),
                ...(ra.mediumPriority || []),
                ...(ra.lowPriority || [])
            ];
        if (tdRisks.length > 0) {
            const normalized = tdRisks.map((r: any) => ({
                id: r.riskId || r.id,
                title: r.description || r.risk || `Risk ${r.riskId || ''}`,
                risk: r.description || r.risk,
                description: r.description || r.risk,
                category: r.category,
                probability: r.probability,
                impact: r.impact,
                riskScore: r.score,
                mitigation: r.mitigation,
                owner: r.owner,
                testStrategy: r.testStrategy,
                relatedRequirements: r.relatedRequirements,
                status: 'identified'
            }));
            const targetEpic = epics.find((e: Epic) => e.id === tdEpicId);
                if (targetEpic) {
                    // Remove previously-attached TD risks, then re-add
                    // (idempotent: we identify TD risks by their normalized IDs)
                    const tdRiskIds = new Set(normalized.map((r: any) => r.id));
                    const nonTdRisks = (targetEpic.risks || []).filter((r: any) => !tdRiskIds.has(r.id));
                    targetEpic.risks = [...nonTdRisks, ...normalized];
                }
            }
        }
    }
    
    // ── 3. test_execution_status from sprintStatuses ──────────────────────
    // Story/Epic statuses are the single source of truth in their JSON files.
    // Only test execution statuses are applied from sprintStatuses.
    const sprintStatusesArr = artifacts.get('sprintStatuses') || [];
    for (const sprintStatus of sprintStatusesArr) {
        if (sprintStatus.test_execution_status) {
            const testCases: any[] = artifacts.get('testCases') || [];
            for (const [testId, rawStatus] of Object.entries(sprintStatus.test_execution_status)) {
                let status: any = 'draft';
                if (rawStatus === 'ready') status = 'ready';
                else if (rawStatus === 'passed') status = 'passed';
                else if (rawStatus === 'failed') status = 'failed';
                else if (rawStatus === 'blocked') status = 'blocked';

                const tc = testCases.find((t: any) => t.id === testId);
                if (tc) {
                    tc.status = status;
                }
            }
            artifacts.set('testCases', testCases);
        }
    }
}

