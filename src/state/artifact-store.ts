import * as vscode from 'vscode';
import PDFDocument from 'pdfkit';
import { acOutput } from '../extension';
import { openChat } from '../commands/chat-bridge';
import { schemaValidator } from './schema-validator';
import { repairDataWithSchema } from './schema-repair-engine';
import {
    BmadArtifacts,
    RequirementStatus,
    VerificationMethod,
    FunctionalRequirement,
    NonFunctionalRequirement,
    AdditionalRequirement,
    PriorityLevel,
    EpicEffortEstimate,
    EpicDependencies,
    Epic,
    StoryTask,
    StoryDependencies,
    StoryDevNotes,
    StoryDevAgentRecord,
    StoryHistoryEntry,
    Story,
    AcceptanceCriterion,
    UseCase,
    UseCaseFlowStep,
    UseCaseAlternativeFlow,
    UseCaseExceptionFlow,
    FitCriteria,
    SuccessMetrics,
    Risk,
    TechnicalSummary,
    AICursor,
    WizardStep,
    PrdUserPersona,
    UserJourneyStep,
    PrdUserJourney,
    DomainConcept,
    PrdSuccessCriterion,
    PrdConstraint,
    PrdRisk,
    PRD,
    ArchitectureDecision,
    ArchitecturePattern,
    SystemComponent,
    TechStack,
    SecurityArchitecture,
    Architecture,
    ProductBriefTargetUser,
    ProductBriefFeature,
    ProductBrief,
    TestCase,
    TestStrategy,
    TestDesign,
    TestCaseType,
    TestCaseStatus,
    TestStep,
    // TEA module types
    TraceabilityMatrix,
    TestReview,
    NfrAssessment,
    TestFramework,
    CiPipeline,
    AutomationSummary,
    AtddChecklist,
    // BMM module types
    Research,
    UxDesign,
    ReadinessReport,
    SprintStatus,
    Retrospective,
    ChangeProposal,
    CodeReview,
    Risks,
    DefinitionOfDone,
    ProjectOverview,
    ProjectContext,
    TechSpec,
    // CIS module types
    Storytelling,
    ProblemSolving,
    InnovationStrategy,
    DesignThinking
} from '../types';

// Re-export all types so existing imports of these from artifact-store still work
export {
    BmadArtifacts,
    RequirementStatus,
    VerificationMethod,
    FunctionalRequirement,
    NonFunctionalRequirement,
    AdditionalRequirement,
    PriorityLevel,
    EpicEffortEstimate,
    EpicDependencies,
    Epic,
    StoryTask,
    StoryDependencies,
    StoryDevNotes,
    StoryDevAgentRecord,
    StoryHistoryEntry,
    Story,
    AcceptanceCriterion,
    UseCase,
    UseCaseFlowStep,
    UseCaseAlternativeFlow,
    UseCaseExceptionFlow,
    FitCriteria,
    SuccessMetrics,
    Risk,
    TechnicalSummary,
    AICursor,
    WizardStep,
    PrdUserPersona,
    UserJourneyStep,
    PrdUserJourney,
    DomainConcept,
    PrdSuccessCriterion,
    PrdConstraint,
    PrdRisk,
    PRD,
    ArchitectureDecision,
    ArchitecturePattern,
    SystemComponent,
    TechStack,
    SecurityArchitecture,
    Architecture,
    ProductBriefTargetUser,
    ProductBriefFeature,
    ProductBrief,
    TestCase,
    TestStrategy,
    TestDesign,
    TestCaseType,
    TestCaseStatus,
    TestStep,
    // TEA module types
    TraceabilityMatrix,
    TestReview,
    NfrAssessment,
    TestFramework,
    CiPipeline,
    AutomationSummary,
    AtddChecklist,
    // BMM module types
    Research,
    UxDesign,
    ReadinessReport,
    SprintStatus,
    Retrospective,
    ChangeProposal,
    CodeReview,
    Risks,
    DefinitionOfDone,
    ProjectOverview,
    ProjectContext,
    TechSpec,
    // CIS module types
    Storytelling,
    ProblemSolving,
    InnovationStrategy,
    DesignThinking
};

/**
 * Escape a value for safe inclusion in a CSV cell (RFC 4180).
 *
 * 1. Neutralises formula injection: if the value starts with `=`, `+`, `-`,
 *    `@`, `\t`, or `\r` the cell is prefixed with a single-quote so
 *    spreadsheet programs treat it as a literal string.
 * 2. Doubles any embedded double-quotes (`"` → `""`).
 * 3. Wraps the result in double-quotes so commas and newlines inside the
 *    value don't break the CSV structure.
 */
function csvEscape(value: string | undefined | null): string {
    if (value == null) return '""';
    let v = String(value);
    // Formula injection protection — prefix with ' (displayed literally by most spreadsheets)
    if (/^[=+\-@\t\r]/.test(v)) {
        v = `'${v}`;
    }
    // RFC 4180: double any embedded quotes, then wrap in quotes
    return `"${v.replace(/"/g, '""')}"`;
}


/**
 * ArtifactStore - Manages shared state between chat and canvas
 * 
 * Simple Map-based state management for the prototype.
 * In production, this could use Yjs CRDT for true collaborative editing.
 */
export class ArtifactStore {
    private artifacts: Map<string, any>;
    private context: vscode.ExtensionContext;
    private _onDidChangeArtifacts = new vscode.EventEmitter<void>();
    readonly onDidChangeArtifacts = this._onDidChangeArtifacts.event;
    
    // Selection change event (for workflow progress panel)
    private _onDidChangeSelection = new vscode.EventEmitter<void>();
    readonly onDidChangeSelection = this._onDidChangeSelection.event;
    
    // Track source files for writing back
    private sourceFolder: vscode.Uri | null = null;
    private sourceFiles: Map<string, vscode.Uri> = new Map();
    
    // Track selected artifact for context-aware workflow progress
    private _selectedArtifact: { type: string; id: string; artifact: any } | null = null;

    // Self-write suppression: tracks when syncToFiles is in flight (or recently completed)
    // so the file watcher can skip notifications caused by our own writes.
    private _syncingUntil = 0;

    // Dirty flag: set to true whenever in-memory state changes and needs syncing.
    // syncToFiles() checks this and skips if nothing changed (L4).
    private _dirty = false;

    // Simple async lock: prevents concurrent fixSchemas / syncToFiles calls from
    // interleaving writes and reads.  Callers should check `isFixInProgress()`
    // before starting a fix, or await the promise stored here.
    private _fixInProgress: Promise<void> | null = null;


    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.artifacts = new Map();

        // Initialize default state
        this.initializeDefaultState();
    }

    private initializeDefaultState() {
        if (!this.artifacts.has('projectName')) {
            this.artifacts.set('projectName', '');
        }
        if (!this.artifacts.has('currentStep')) {
            this.artifacts.set('currentStep', 'vision');
        }
        if (!this.artifacts.has('epics')) {
            this.artifacts.set('epics', []);
        }
        if (!this.artifacts.has('requirements')) {
            this.artifacts.set('requirements', {
                functional: [],
                nonFunctional: [],
                additional: []
            });
        }
    }

    private notifyChange() {
        this._dirty = true;
        this._onDidChangeArtifacts.fire();
    }

    // =====================================================================
    // reconcileDerivedState()  —  single source of truth for cross-artifact
    // derived data.  Called after every updateArtifact() AND at the end of
    // loadProjectFiles() so both paths produce identical results.
    //
    // The method is **idempotent**: it reads the current in-memory artifacts
    // and rebuilds/replaces derived entries.  It never appends blindly, so
    // calling it twice produces the same result.
    //
    // Derived operations handled:
    //   1. test-design.coveragePlan  →  TestCase[] in `testCases`
    //   2. test-design.riskAssessment  →  risks[] on matching epic
    // =====================================================================
    reconcileDerivedState(): void {
        const epics: Epic[] = this.artifacts.get('epics') || [];
        const testDesign: any = this.artifacts.get('testDesign');

        // ── 1. Extract coveragePlan items from test-design into testCases ──
        // We partition existing TCs into "from-file" (test-cases.json) and
        // "from-coveragePlan" so we can rebuild the latter without losing the
        // former.  A TC is considered "from-coveragePlan" if its id matches
        // the coveragePlan item IDs.
        const allTCs: TestCase[] = this.artifacts.get('testCases') || [];
        const coveragePlanItemIds = new Set<string>();

        if (testDesign?.coveragePlan) {
            const tdEpicId = testDesign.epicInfo?.epicId || '';
            const tdEpicStoryIds = new Set<string>();
            const matchingEpic = epics.find((e: Epic) => e.id === tdEpicId);
            if (matchingEpic) {
                (matchingEpic.stories || []).forEach((s: Story) => tdEpicStoryIds.add(s.id));
            }

            // Scope-based story fallback
            let scopeStoryId: string | undefined;
            const scopeMatch = (testDesign.summary?.scope || '').match(/\bS-[\d]+\.[\d]+\b/i);
            if (scopeMatch) scopeStoryId = scopeMatch[0];

            const priorities = ['p0', 'p1', 'p2', 'p3'] as const;

            // Collect all coveragePlan item IDs
            for (const pKey of priorities) {
                for (const item of (testDesign.coveragePlan[pKey] || [])) {
                    if (item.id) coveragePlanItemIds.add(item.id);
                }
            }

            // Keep only TCs that did NOT originate from coveragePlan
            const fileTCs = allTCs.filter((tc: TestCase) => !coveragePlanItemIds.has(tc.id));
            const extractedTCs: TestCase[] = [];

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

            this.artifacts.set('testCases', [...fileTCs, ...extractedTCs]);
        }

        // ── 2. Attach test-design riskAssessment risks to matching epic ──
        if (testDesign?.riskAssessment && testDesign.epicInfo?.epicId) {
            const tdEpicId = testDesign.epicInfo.epicId;
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

    /**
     * Returns true if syncToFiles() is currently in flight or completed very
     * recently (grace period accounts for file-watcher debounce).  Used by
     * the file watcher in extension.ts to suppress false "external change"
     * notifications caused by our own writes.
     */
    isSyncing(): boolean {
        return Date.now() < this._syncingUntil;
    }

    /**
     * Mark the in-memory state as dirty — the next `syncToFiles()` call will
     * write to disk.  Call this after any mutation to the artifacts map.
     */
    markDirty(): void {
        this._dirty = true;
    }

    /**
     * Returns true if a fix-schemas operation is currently running.
     */
    isFixInProgress(): boolean {
        return this._fixInProgress !== null;
    }

    /**
     * Run a fix-schemas operation exclusively — only one can run at a time.
     * If another fix is already in progress, the returned promise rejects.
     *
     * The callback receives the store and should perform the
     * backup → syncToFiles → loadFromFolder sequence.
     */
    async runExclusiveFix(fn: () => Promise<void>): Promise<void> {
        if (this._fixInProgress) {
            throw new Error('A Fix Schemas operation is already in progress.');
        }

        this._fixInProgress = fn().finally(() => {
            this._fixInProgress = null;
        });

        return this._fixInProgress;
    }

    /**
     * Clear all project data (used before loading a new project)
     */
    clearProject() {
        this.artifacts.clear();
        this.sourceFolder = null;
        this.sourceFiles.clear();
        this.initializeDefaultState();
        this.notifyChange(); // Notify so UI clears
    }

    /**
     * Get the source folder where artifacts were loaded from (.agentcanvas-context folder)
     */
    getSourceFolder(): vscode.Uri | null {
        return this.sourceFolder;
    }

    /**
     * Get the project root (parent of output folder).
     * BMAD resources are bundled inside the extension (resources/_bmad), not in the workspace.
     */
    getProjectRoot(): string | null {
        if (!this.sourceFolder) return null;
        
        // sourceFolder is typically the output folder (e.g. .agentcanvas-context)
        // Project root is the parent directory
        const sourcePath = this.sourceFolder.fsPath;
        const outputFolder = vscode.workspace.getConfiguration('agentcanvas').get('outputFolder', '.agentcanvas-context') as string;
        // Escape special regex characters in the folder name
        const escaped = outputFolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parentPath = sourcePath.replace(new RegExp(`[/\\\\]${escaped}.*$`), '');
        return parentPath !== sourcePath ? parentPath : null;
    }

    /**
     * Get the on-disk URI for a given artifact store key (e.g. 'vision', 'prd',
     * 'epics', 'risks', 'testDesign', etc.).
     * Returns null if no file has been loaded/written for that key.
     */
    getArtifactFileUri(storeKey: string): vscode.Uri | null {
        return this.sourceFiles.get(storeKey) ?? null;
    }

    /**
     * Read the full on-disk JSON for a given artifact store key.
     * Returns the parsed object (typically `{ metadata, content }` envelope)
     * or null if the file doesn't exist or can't be read.
     */
    async readArtifactFile(storeKey: string): Promise<any | null> {
        const fileUri = this.sourceFiles.get(storeKey);
        if (!fileUri) return null;
        try {
            const raw = await vscode.workspace.fs.readFile(fileUri);
            return JSON.parse(Buffer.from(raw).toString('utf-8'));
        } catch {
            return null;
        }
    }

    /**
     * Initialize a new BMAD project
     */
    initializeProject(projectName: string) {
        this.artifacts.set('projectName', projectName);
        this.artifacts.set('currentStep', 'vision');
        this.artifacts.set('vision', {
            productName: projectName,
            problemStatement: 'Define the problem this project solves...',
            targetUsers: [],
            valueProposition: '',
            successCriteria: [],
            status: 'draft'
        });
        this.artifacts.set('requirements', {
            functional: [],
            nonFunctional: [],
            additional: []
        });
        this.artifacts.set('epics', []);
        this.notifyChange();
        
        // Show info message with next steps
        vscode.window.showInformationMessage(
            `Project "${projectName}" created! Use @agentcanvas in chat to define vision and requirements.`,
            'Open Chat'
        ).then(selection => {
            if (selection === 'Open Chat') {
                openChat();
            }
        });
    }

    /**
     * Get the current state
     */
    getState(): BmadArtifacts {
        return {
            projectName: this.artifacts.get('projectName') || '',
            currentStep: this.artifacts.get('currentStep') || 'vision',
            vision: this.artifacts.get('vision'),
            requirements: this.artifacts.get('requirements'),
            epics: this.artifacts.get('epics'),
            aiCursor: this.artifacts.get('aiCursor'),
            prd: this.artifacts.get('prd'),
            architecture: this.artifacts.get('architecture'),
            productBrief: this.artifacts.get('productBrief'),
            testCases: this.artifacts.get('testCases'),
            testStrategy: this.artifacts.get('testStrategy'),
            testDesign: this.artifacts.get('testDesign'),
            // TEA module artifacts
            traceabilityMatrix: this.artifacts.get('traceabilityMatrix'),
            testReview: this.artifacts.get('testReview'),
            nfrAssessment: this.artifacts.get('nfrAssessment'),
            testFramework: this.artifacts.get('testFramework'),
            ciPipeline: this.artifacts.get('ciPipeline'),
            automationSummary: this.artifacts.get('automationSummary'),
            atddChecklist: this.artifacts.get('atddChecklist'),
            // BMM module artifacts
            research: this.artifacts.get('research'),
            uxDesign: this.artifacts.get('uxDesign'),
            readinessReport: this.artifacts.get('readinessReport'),
            sprintStatus: this.artifacts.get('sprintStatus'),
            retrospective: this.artifacts.get('retrospective'),
            changeProposal: this.artifacts.get('changeProposal'),
            codeReview: this.artifacts.get('codeReview'),
            risks: this.artifacts.get('risks'),
            definitionOfDone: this.artifacts.get('definitionOfDone'),
            projectOverview: this.artifacts.get('projectOverview'),
            projectContext: this.artifacts.get('projectContext'),
            techSpec: this.artifacts.get('techSpec'),
            sourceTree: this.artifacts.get('sourceTree'),
            testSummary: this.artifacts.get('testSummary'),
            // CIS module artifacts
            storytelling: this.artifacts.get('storytelling'),
            problemSolving: this.artifacts.get('problemSolving'),
            innovationStrategy: this.artifacts.get('innovationStrategy'),
            designThinking: this.artifacts.get('designThinking')
        };
    }

    /**
     * Get load-time validation issues (if any files failed schema validation when loaded).
     * Returns an empty array when there are no issues.
     */
    getLoadValidationIssues(): { file: string; type: string; errors: string[] }[] {
        return this.artifacts.get('_loadValidationIssues') || [];
    }

    /**
     * Get requirements
     */
    getRequirements() {
        return this.artifacts.get('requirements') || {
            functional: [],
            nonFunctional: [],
            additional: []
        };
    }

    /**
     * Get epics
     */
    getEpics(): Epic[] {
        return this.artifacts.get('epics') || [];
    }

    /**
     * Update a specific artifact
     */
    async updateArtifact(
        artifactType: string,
        artifactId: string,
        changes: Partial<any>
    ): Promise<void> {
        console.log('updateArtifact called:', artifactType, artifactId, changes);
        
        switch (artifactType) {
            case 'vision':
                const currentVision = this.artifacts.get('vision') || {};
                // Handle metadata updates
                if (changes.metadata) {
                    this.artifacts.set('vision', { 
                        ...currentVision, 
                        ...changes.metadata,
                        productName: changes.title || changes.metadata.productName || currentVision.productName
                    });
                } else {
                    this.artifacts.set('vision', { ...currentVision, ...changes });
                }
                break;

            case 'epic':
                const epics = this.artifacts.get('epics') || [];
                const epicIndex = epics.findIndex((e: Epic) => e.id === artifactId);
                if (epicIndex >= 0) {
                    const oldEpic = epics[epicIndex];
                    // Merge changes: spread metadata fields first, then top-level fields.
                    // This ensures fields like stories, risks, definitionOfDone, etc.
                    // are accepted whether sent inside a metadata wrapper or at the top level.
                    const updatedEpic = { ...oldEpic };

                    // Apply metadata-wrapped fields first (if present)
                    if (changes.metadata && typeof changes.metadata === 'object') {
                        Object.assign(updatedEpic, changes.metadata);
                    }

                    // Apply top-level fields — map 'description' → 'goal', skip 'metadata' (already handled)
                    const { metadata: _meta, description, ...topFields } = changes;
                    if (description) { updatedEpic.goal = description; }
                    // Spread all other top-level fields (stories, risks, definitionOfDone,
                    // functionalRequirements, title, status, etc.)
                    Object.assign(updatedEpic, topFields);

                    epics[epicIndex] = updatedEpic;
                    this.artifacts.set('epics', [...epics]);
                    console.log('Updated epic:', updatedEpic.id, updatedEpic.title);
                    
                    // Bidirectional linking: update relatedEpics on requirements
                    this.syncRequirementLinks(
                        artifactId,
                        oldEpic.functionalRequirements || [],
                        updatedEpic.functionalRequirements || [],
                        'functional'
                    );
                    this.syncRequirementLinks(
                        artifactId,
                        oldEpic.nonFunctionalRequirements || [],
                        updatedEpic.nonFunctionalRequirements || [],
                        'nonFunctional'
                    );
                }
                break;

            case 'story':
                // Find story across all epics by story ID
                const allEpics = this.artifacts.get('epics') || [];
                let storyFound = false;
                
                for (const epic of allEpics) {
                    const storyIndex = epic.stories?.findIndex((s: Story) => s.id === artifactId);
                    if (storyIndex !== undefined && storyIndex >= 0) {
                        // Merge changes: accept fields at top level or inside metadata.
                        // Schema validator has already checked field names/types.
                        const updatedStory = { ...epic.stories[storyIndex] };

                        // Apply metadata-wrapped fields first
                        if (changes.metadata && typeof changes.metadata === 'object') {
                            Object.assign(updatedStory, changes.metadata);
                        }

                        // Apply top-level fields — spread all (skip metadata, already handled)
                        const { metadata: _meta, ...topFields } = changes;
                        Object.assign(updatedStory, topFields);

                        epic.stories[storyIndex] = updatedStory;
                        storyFound = true;
                        console.log('Updated story:', updatedStory.id, updatedStory.title);
                        break;
                    }
                }
                
                if (storyFound) {
                    this.artifacts.set('epics', [...allEpics]);
                }
                break;

            case 'requirement': {
                // Find and update a single functional requirement.
                // Schema validator has already checked field names/types
                // so we can safely spread all metadata fields.
                const requirements = this.artifacts.get('requirements') || { functional: [], nonFunctional: [], additional: [] };
                const reqIndex = requirements.functional.findIndex((r: FunctionalRequirement) => r.id === artifactId);
                if (reqIndex >= 0) {
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
                    this.artifacts.set('requirements', { ...requirements });
                    console.log('Updated requirement:', updatedReq.id, updatedReq.title);
                }
                break;
            }

            case 'requirements':
                // Bulk requirements update — replaces category arrays wholesale.
                // No per-item schema validation here; individual requirements are
                // validated when updated via the 'requirement' case above.
                // There is no BMAD schema for the bulk { functional, nonFunctional,
                // additional } envelope — this is an internal-only store type.
                const currentReqs = this.artifacts.get('requirements') || {};
                this.artifacts.set('requirements', { ...currentReqs, ...changes });
                break;

            case 'aiCursor':
                // UI-only cursor tracking (current artifact, position).
                // Not a BMAD methodology artifact — intentionally has no schema.
                this.artifacts.set('aiCursor', changes);
                break;

            case 'test-case': {
                const testCases: TestCase[] = this.artifacts.get('testCases') || [];
                const tcIndex = testCases.findIndex((tc: TestCase) => tc.id === artifactId);
                if (tcIndex >= 0) {
                    const updated = { ...testCases[tcIndex] };
                    if (changes.title) updated.title = changes.title;
                    if (changes.status) updated.status = changes.status;
                    if (changes.metadata) {
                        Object.assign(updated, changes.metadata);
                    }
                    testCases[tcIndex] = updated;
                    this.artifacts.set('testCases', [...testCases]);
                    console.log('Updated test case:', updated.id, updated.title);
                }
                break;
            }

            case 'test-strategy': {
                // Check if this is a per-epic test strategy
                const epicsForTS = this.getEpics();
                const ownerEpic = epicsForTS.find(e => e.testStrategy && e.testStrategy.id === artifactId);
                if (ownerEpic && ownerEpic.testStrategy) {
                    // Update the per-epic test strategy in-place
                    if (changes.title) ownerEpic.testStrategy.title = changes.title;
                    if (changes.status) ownerEpic.testStrategy.status = changes.status;
                    if (changes.metadata) {
                        Object.assign(ownerEpic.testStrategy, changes.metadata);
                    }
                    // Trigger epics update so the change is persisted
                    this.artifacts.set('epics', [...epicsForTS]);
                } else {
                    // Fall back to top-level project singleton
                    const currentTS = this.artifacts.get('testStrategy') || {};
                    if (changes.title) currentTS.title = changes.title;
                    if (changes.status) currentTS.status = changes.status;
                    if (changes.metadata) {
                        Object.assign(currentTS, changes.metadata);
                    }
                    this.artifacts.set('testStrategy', { ...currentTS });
                }
                break;
            }

            case 'product-brief': {
                const currentPB = this.artifacts.get('productBrief') || {};
                const updatedPB = { ...currentPB };
                if (changes.title) updatedPB.productName = changes.title;
                if (changes.status) updatedPB.status = changes.status;
                if (changes.metadata) {
                    Object.assign(updatedPB, changes.metadata);
                }
                this.artifacts.set('productBrief', updatedPB);
                break;
            }

            case 'prd': {
                const currentPRD = this.artifacts.get('prd') || {};
                const updatedPRD = { ...currentPRD };
                if (changes.title) {
                    // PRD title maps to productOverview.productName
                    if (!updatedPRD.productOverview) updatedPRD.productOverview = {};
                    updatedPRD.productOverview.productName = changes.title;
                }
                if (changes.status) updatedPRD.status = changes.status;
                if (changes.metadata) {
                    Object.assign(updatedPRD, changes.metadata);
                }
                this.artifacts.set('prd', updatedPRD);
                break;
            }

            case 'architecture': {
                const currentArch = this.artifacts.get('architecture') || {};
                const updatedArch = { ...currentArch };
                if (changes.title) {
                    // Architecture title maps to overview.projectName
                    if (!updatedArch.overview) updatedArch.overview = {};
                    updatedArch.overview.projectName = changes.title;
                }
                if (changes.status) updatedArch.status = changes.status;
                if (changes.metadata) {
                    Object.assign(updatedArch, changes.metadata);
                }
                this.artifacts.set('architecture', updatedArch);
                break;
            }

            case 'use-case': {
                // Use cases are nested inside epics — find the parent epic and update
                const ucAllEpics = this.artifacts.get('epics') || [];
                let ucFound = false;
                for (const epic of ucAllEpics) {
                    const ucIndex = epic.useCases?.findIndex((uc: any) => uc.id === artifactId);
                    if (ucIndex !== undefined && ucIndex >= 0) {
                        const updatedUC = { ...epic.useCases[ucIndex] };
                        if (changes.title) updatedUC.title = changes.title;
                        if (changes.metadata) {
                            Object.assign(updatedUC, changes.metadata);
                        }
                        epic.useCases[ucIndex] = updatedUC;
                        ucFound = true;
                        console.log('Updated use case:', updatedUC.id, updatedUC.title);
                        break;
                    }
                }
                if (ucFound) {
                    this.artifacts.set('epics', [...ucAllEpics]);
                }
                break;
            }

            case 'test-design': {
                const currentTD: any = this.artifacts.get('testDesign') || {};
                const updatedTD = { ...currentTD };
                // Assign an id if not already present
                if (!updatedTD.id) {
                    updatedTD.id = artifactId || 'test-design-1';
                }
                if (changes.status) updatedTD.status = changes.status;
                if (changes.metadata && typeof changes.metadata === 'object') {
                    // Metadata fields (status, etc.) go directly on the object
                    if (changes.metadata.status) updatedTD.status = changes.metadata.status;
                }
                // Merge content fields — the LLM sends flattened content fields
                // (same as other artifact types: fields from schema's `content` are
                // sent at the top level of `changes`, not wrapped in a `content` key)
                const contentFields = [
                    'epicInfo', 'summary', 'notInScope', 'riskAssessment',
                    'entryExitCriteria', 'projectTeam', 'coveragePlan', 'testCases',
                    'executionOrder', 'testEnvironment', 'resourceEstimates',
                    'qualityGateCriteria', 'mitigationPlans', 'assumptionsAndDependencies',
                    'defectManagement', 'approval', 'appendices'
                ];
                for (const field of contentFields) {
                    if (changes[field] !== undefined) {
                        updatedTD[field] = changes[field];
                    }
                }
                this.artifacts.set('testDesign', updatedTD);
                console.log('Updated test design:', updatedTD.id);
                // coveragePlan→TC extraction and riskAssessment→epic.risks
                // attachment are handled by reconcileDerivedState() which runs
                // after the switch block — no inline extraction needed here.
                break;
            }

            // =================================================================
            // TEA module artifact types
            // =================================================================

            case 'traceability-matrix': {
                const cur: any = this.artifacts.get('traceabilityMatrix') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'traceability-matrix-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['storyInfo', 'traceability', 'gateDecision', 'cicdYamlSnippet', 'relatedArtifacts', 'signOff']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('traceabilityMatrix', upd);
                console.log('Updated traceability matrix:', upd.id);
                break;
            }

            case 'test-review': {
                const cur: any = this.artifacts.get('testReview') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'test-review-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['reviewInfo', 'executiveSummary', 'qualityAssessment', 'qualityScoreBreakdown', 'criticalIssues', 'recommendations', 'bestPracticesFound', 'testFileAnalysis', 'coverageAnalysis', 'contextAndIntegration', 'knowledgeBaseReferences', 'nextSteps', 'decision', 'appendix']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('testReview', upd);
                console.log('Updated test review:', upd.id);
                break;
            }

            case 'nfr-assessment':
            case 'nfr': {
                const cur: any = this.artifacts.get('nfrAssessment') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'nfr-assessment-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['featureInfo', 'executiveSummary', 'nfrRequirements', 'assessments', 'quickWins', 'recommendedActions', 'monitoringHooks', 'failFastMechanisms', 'evidenceGaps', 'findingsSummary', 'gateYamlSnippet', 'testEvidence', 'signOff']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('nfrAssessment', upd);
                console.log('Updated NFR assessment:', upd.id);
                break;
            }

            case 'test-framework': {
                const cur: any = this.artifacts.get('testFramework') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'test-framework-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['framework', 'configuration', 'directoryStructure', 'fixtures', 'helpers', 'pageObjects', 'mocking', 'dependencies', 'scripts', 'setupInstructions', 'bestPractices']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('testFramework', upd);
                console.log('Updated test framework:', upd.id);
                break;
            }

            case 'ci-pipeline': {
                const cur: any = this.artifacts.get('ciPipeline') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'ci-pipeline-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['platform', 'pipeline', 'jobs', 'testExecution', 'qualityGates', 'artifacts', 'notifications', 'caching', 'secrets', 'documentation']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('ciPipeline', upd);
                console.log('Updated CI pipeline:', upd.id);
                break;
            }

            case 'automation-summary': {
                const cur: any = this.artifacts.get('automationSummary') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'automation-summary-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['summary', 'coverageAnalysis', 'testsCreated', 'fixturesCreated', 'factoriesCreated', 'bmadIntegration', 'automationStrategy', 'recommendations', 'executionResults']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('automationSummary', upd);
                console.log('Updated automation summary:', upd.id);
                break;
            }

            case 'atdd-checklist': {
                const cur: any = this.artifacts.get('atddChecklist') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'atdd-checklist-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['storyInfo', 'storySummary', 'acceptanceCriteria', 'failingTestsCreated', 'testScenarios', 'dataFactoriesCreated', 'fixturesCreated', 'mockRequirements', 'requiredDataTestIds', 'pageObjects', 'implementationChecklist', 'runningTests', 'redGreenRefactorWorkflow', 'knowledgeBaseReferences', 'testExecutionEvidence', 'completionStatus']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('atddChecklist', upd);
                console.log('Updated ATDD checklist:', upd.id);
                break;
            }

            // =================================================================
            // BMM module artifact types
            // =================================================================

            case 'research': {
                const cur: any = this.artifacts.get('research') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'research-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['researchType', 'topic', 'scope', 'goals', 'questions', 'methodology', 'findings', 'competitiveAnalysis', 'marketAnalysis', 'trends', 'technicalFindings', 'userResearch', 'recommendations', 'risks', 'synthesis', 'references', 'appendices']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('research', upd);
                console.log('Updated research:', upd.id);
                break;
            }

            case 'ux-design': {
                const cur: any = this.artifacts.get('uxDesign') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'ux-design-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['overview', 'coreExperience', 'designInspiration', 'designSystem', 'userJourneys', 'wireframes', 'componentStrategy', 'pageLayouts', 'uxPatterns', 'responsive', 'accessibility', 'interactions', 'errorStates', 'emptyStates', 'loadingStates', 'implementationNotes', 'references']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('uxDesign', upd);
                console.log('Updated UX design:', upd.id);
                break;
            }

            case 'readiness-report':
            case 'readiness': {
                const cur: any = this.artifacts.get('readinessReport') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'readiness-report-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['summary', 'assessment', 'blockers', 'risks', 'recommendations', 'dependencyAnalysis', 'resourceAssessment', 'nextSteps', 'appendices']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('readinessReport', upd);
                console.log('Updated readiness report:', upd.id);
                break;
            }

            case 'sprint-status':
            case 'sprint': {
                const cur: any = this.artifacts.get('sprintStatus') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'sprint-status-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['generated', 'project', 'projectKey', 'trackingSystem', 'storyLocation', 'summary', 'epics', 'developmentStatus', 'statusDefinitions']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('sprintStatus', upd);
                console.log('Updated sprint status:', upd.id);
                break;
            }

            case 'retrospective': {
                const cur: any = this.artifacts.get('retrospective') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'retrospective-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['epicReference', 'summary', 'whatWentWell', 'whatDidNotGoWell', 'lessonsLearned', 'storyAnalysis', 'technicalDebt', 'impactOnFutureWork', 'teamFeedback', 'actionItems', 'metricsSnapshot']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('retrospective', upd);
                console.log('Updated retrospective:', upd.id);
                break;
            }

            case 'change-proposal': {
                const cur: any = this.artifacts.get('changeProposal') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'change-proposal-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['changeRequest', 'impactAnalysis', 'proposal', 'approval', 'implementation']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('changeProposal', upd);
                console.log('Updated change proposal:', upd.id);
                break;
            }

            case 'code-review': {
                const cur: any = this.artifacts.get('codeReview') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'code-review-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['storyReference', 'reviewSummary', 'findings', 'acceptanceCriteriaVerification', 'testCoverageAnalysis', 'securityAnalysis', 'architectureCompliance', 'nextSteps', 'reviewerNotes']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('codeReview', upd);
                console.log('Updated code review:', upd.id);
                break;
            }

            case 'risks': {
                const cur: any = this.artifacts.get('risks') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'risks-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['risks', 'assumptions', 'dependencies', 'riskMatrix', 'summary']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('risks', upd);
                console.log('Updated risks:', upd.id);
                break;
            }

            case 'definition-of-done': {
                const cur: any = this.artifacts.get('definitionOfDone') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'definition-of-done-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['items', 'qualityGates', 'acceptanceSummary', 'templates', 'summary']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('definitionOfDone', upd);
                console.log('Updated definition of done:', upd.id);
                break;
            }

            case 'project-overview': {
                const cur: any = this.artifacts.get('projectOverview') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'project-overview-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['projectInfo', 'executiveSummary', 'projectClassification', 'multiPartStructure', 'techStackSummary', 'keyFeatures', 'architectureHighlights', 'codebaseAnalysis', 'development', 'repositoryStructure', 'entryPoints', 'dataFlows', 'integrations', 'knownIssues', 'recommendations', 'documentationMap', 'additionalNotes']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('projectOverview', upd);
                console.log('Updated project overview:', upd.id);
                break;
            }

            case 'project-context': {
                const cur: any = this.artifacts.get('projectContext') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'project-context-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['projectInfo', 'overview', 'techStack', 'implementationRules', 'patterns', 'forbiddenPatterns', 'keyFiles', 'entryPoints', 'developmentWorkflow', 'errorHandling', 'stateManagement', 'apiInteraction', 'securityConsiderations', 'performanceConsiderations', 'knownIssues', 'additionalNotes']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('projectContext', upd);
                console.log('Updated project context:', upd.id);
                break;
            }

            case 'tech-spec': {
                const cur: any = this.artifacts.get('techSpec') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'tech-spec-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['title', 'slug', 'version', 'overview', 'context', 'techStack', 'dataModel', 'apiChanges', 'filesToModify', 'filesToCreate', 'codePatterns', 'testPatterns', 'implementationPlan', 'testingStrategy', 'risks', 'rollbackPlan', 'additionalContext', 'reviewers']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('techSpec', upd);
                console.log('Updated tech spec:', upd.id);
                break;
            }

            // =================================================================
            // CIS module artifact types
            // =================================================================

            case 'storytelling': {
                const cur: any = this.artifacts.get('storytelling') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'storytelling-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['storyType', 'frameworkName', 'storyTitle', 'purpose', 'targetAudience', 'strategicContext', 'frameworkApplication', 'structure', 'completeStory', 'elements', 'variations', 'visualElements', 'usageGuidelines', 'testing', 'nextSteps']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('storytelling', upd);
                console.log('Updated storytelling:', upd.id);
                break;
            }

            case 'problem-solving': {
                const cur: any = this.artifacts.get('problemSolving') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'problem-solving-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['problemTitle', 'problemCategory', 'sessionInfo', 'problemDefinition', 'diagnosis', 'analysis', 'solutionGeneration', 'solutionEvaluation', 'recommendedSolution', 'implementationPlan', 'monitoring', 'lessonsLearned']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('problemSolving', upd);
                console.log('Updated problem solving:', upd.id);
                break;
            }

            case 'innovation-strategy': {
                const cur: any = this.artifacts.get('innovationStrategy') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'innovation-strategy-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['companyName', 'strategicFocus', 'sessionInfo', 'strategicContext', 'marketAnalysis', 'businessModelAnalysis', 'disruptionOpportunities', 'innovationOpportunities', 'strategicOptions', 'recommendedStrategy', 'executionRoadmap', 'successMetrics', 'risks', 'governanceAndReview', 'appendix']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('innovationStrategy', upd);
                console.log('Updated innovation strategy:', upd.id);
                break;
            }

            case 'design-thinking': {
                const cur: any = this.artifacts.get('designThinking') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'design-thinking-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['projectName', 'sessionInfo', 'designChallenge', 'empathize', 'define', 'ideate', 'prototype', 'test', 'nextSteps']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('designThinking', upd);
                console.log('Updated design thinking:', upd.id);
                break;
            }

            case 'source-tree': {
                const cur: any = this.artifacts.get('sourceTree') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'source-tree-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['overview', 'statistics', 'multiPartStructure', 'directoryStructure', 'criticalDirectories', 'entryPoints', 'fileOrganizationPatterns', 'namingConventions', 'keyFileTypes', 'assetLocations', 'configurationFiles', 'buildArtifacts', 'testLocations', 'documentationLocations', 'moduleGraph', 'developmentNotes', 'recommendations']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('sourceTree', upd);
                console.log('Updated source tree:', upd.id);
                break;
            }

            case 'test-summary': {
                const cur: any = this.artifacts.get('testSummary') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'test-summary-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['summary', 'generatedTests', 'coverageAnalysis', 'testPatterns', 'recommendations', 'executionNotes']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('testSummary', upd);
                console.log('Updated test summary:', upd.id);
                break;
            }
                
            default:
                console.warn(`[ArtifactStore] Unknown artifact type "${artifactType}" — changes were ignored. Known types: vision, product-brief, prd, architecture, epic, story, requirement, requirements, aiCursor, test-case, test-strategy, test-design, use-case, traceability-matrix, test-review, nfr-assessment, test-framework, ci-pipeline, automation-summary, atdd-checklist, research, ux-design, readiness-report, sprint-status, retrospective, change-proposal, code-review, risks, definition-of-done, project-overview, project-context, tech-spec, source-tree, test-summary, storytelling, problem-solving, innovation-strategy, design-thinking`);
        }

        this.reconcileDerivedState();
        this.notifyChange();

        // Auto-sync if enabled
        const autoSync = vscode.workspace.getConfiguration('agentcanvas').get('autoSync', true);
        if (autoSync) {
            await this.syncToFiles();
        }
    }

    /**
     * Delete an artifact by type/id.
     * For epics, also removes associated stories and use cases.
     */
    async deleteArtifact(artifactType: string, artifactId: string): Promise<void> {
        console.log('deleteArtifact called:', artifactType, artifactId);

        switch (artifactType) {
            case 'vision':
                this.artifacts.set('vision', undefined);
                break;

            case 'product-brief':
                this.artifacts.set('productBrief', undefined);
                break;

            case 'prd':
                this.artifacts.set('prd', undefined);
                break;

            case 'architecture':
                this.artifacts.set('architecture', undefined);
                break;

            case 'epic': {
                const epics = this.artifacts.get('epics') || [];
                const epicToDelete = epics.find((e: Epic) => e.id === artifactId);
                const nextEpics = epics.filter((e: Epic) => e.id !== artifactId);
                this.artifacts.set('epics', nextEpics);

                if (epicToDelete) {
                    this.syncRequirementLinks(
                        artifactId,
                        epicToDelete.functionalRequirements || [],
                        [],
                        'functional'
                    );
                    this.syncRequirementLinks(
                        artifactId,
                        epicToDelete.nonFunctionalRequirements || [],
                        [],
                        'nonFunctional'
                    );

                    const deletedStoryIds = (epicToDelete.stories || []).map((story: Story) => story.id);
                    if (deletedStoryIds.length > 0) {
                        this.removeStoryLinksFromRequirements(deletedStoryIds);
                    }
                }
                break;
            }

            case 'story': {
                const epics = this.artifacts.get('epics') || [];
                let changed = false;
                let deletedStoryId: string | null = null;
                epics.forEach((epic: Epic) => {
                    if (epic.stories?.some((s: Story) => s.id === artifactId)) {
                        epic.stories = epic.stories.filter((s: Story) => s.id !== artifactId);
                        deletedStoryId = artifactId;
                        changed = true;
                    }
                });
                if (changed) {
                    this.artifacts.set('epics', [...epics]);
                }
                if (deletedStoryId) {
                    this.removeStoryLinksFromRequirements([deletedStoryId]);
                }
                break;
            }

            case 'use-case': {
                const epics = this.artifacts.get('epics') || [];
                let changed = false;
                epics.forEach((epic: Epic) => {
                    if (epic.useCases?.some((uc: UseCase) => uc.id === artifactId)) {
                        epic.useCases = epic.useCases.filter((uc: UseCase) => uc.id !== artifactId);
                        changed = true;
                    }
                });
                if (changed) {
                    this.artifacts.set('epics', [...epics]);
                }
                break;
            }

            case 'requirement': {
                const requirements = this.artifacts.get('requirements') || { functional: [], nonFunctional: [], additional: [] };
                const nextFunctional = (requirements.functional || []).filter((r: FunctionalRequirement) => r.id !== artifactId);
                const nextNonFunctional = (requirements.nonFunctional || []).filter((r: NonFunctionalRequirement) => r.id !== artifactId);
                const nextAdditional = (requirements.additional || []).filter((r: AdditionalRequirement) => r.id !== artifactId);
                this.artifacts.set('requirements', {
                    ...requirements,
                    functional: nextFunctional,
                    nonFunctional: nextNonFunctional,
                    additional: nextAdditional
                });

                const epics = this.artifacts.get('epics') || [];
                epics.forEach((epic: Epic) => {
                    if (epic.functionalRequirements) {
                        epic.functionalRequirements = epic.functionalRequirements.filter((id: string) => id !== artifactId);
                    }
                    if (epic.nonFunctionalRequirements) {
                        epic.nonFunctionalRequirements = epic.nonFunctionalRequirements.filter((id: string) => id !== artifactId);
                    }
                });
                this.artifacts.set('epics', [...epics]);
                break;
            }

            case 'test-case': {
                const testCases: TestCase[] = this.artifacts.get('testCases') || [];
                this.artifacts.set('testCases', testCases.filter((tc: TestCase) => tc.id !== artifactId));
                break;
            }

            case 'test-strategy': {
                // Check if this is a per-epic test strategy
                const epicsForTSDel = this.getEpics();
                const tsOwnerEpic = epicsForTSDel.find(e => e.testStrategy && e.testStrategy.id === artifactId);
                if (tsOwnerEpic) {
                    tsOwnerEpic.testStrategy = undefined;
                    this.artifacts.set('epics', [...epicsForTSDel]);
                } else {
                    // Fall back to top-level project singleton
                    this.artifacts.set('testStrategy', undefined);
                }
                break;
            }

            case 'test-design':
                this.artifacts.set('testDesign', undefined);
                break;

            // TEA module artifacts
            case 'traceability-matrix':
                this.artifacts.set('traceabilityMatrix', undefined);
                break;
            case 'test-review':
                this.artifacts.set('testReview', undefined);
                break;
            case 'nfr-assessment':
                this.artifacts.set('nfrAssessment', undefined);
                break;
            case 'atdd-checklist':
                this.artifacts.set('atddChecklist', undefined);
                break;
            case 'test-framework':
                this.artifacts.set('testFramework', undefined);
                break;
            case 'ci-pipeline':
                this.artifacts.set('ciPipeline', undefined);
                break;
            case 'automation-summary':
                this.artifacts.set('automationSummary', undefined);
                break;

            // BMM module artifacts
            case 'research':
                this.artifacts.set('research', undefined);
                break;
            case 'ux-design':
                this.artifacts.set('uxDesign', undefined);
                break;
            case 'readiness-report':
                this.artifacts.set('readinessReport', undefined);
                break;
            case 'sprint-status':
                this.artifacts.set('sprintStatus', undefined);
                break;
            case 'retrospective':
                this.artifacts.set('retrospective', undefined);
                break;
            case 'change-proposal':
                this.artifacts.set('changeProposal', undefined);
                break;
            case 'code-review':
                this.artifacts.set('codeReview', undefined);
                break;
            case 'project-overview':
                this.artifacts.set('projectOverview', undefined);
                break;
            case 'project-context':
                this.artifacts.set('projectContext', undefined);
                break;
            case 'tech-spec':
                this.artifacts.set('techSpec', undefined);
                break;
            case 'source-tree':
                this.artifacts.set('sourceTree', undefined);
                break;
            case 'test-summary':
                this.artifacts.set('testSummary', undefined);
                break;
            case 'risks':
                this.artifacts.set('risks', undefined);
                break;
            case 'definition-of-done':
                this.artifacts.set('definitionOfDone', undefined);
                break;

            // CIS module artifacts
            case 'storytelling':
                this.artifacts.set('storytelling', undefined);
                break;
            case 'problem-solving':
                this.artifacts.set('problemSolving', undefined);
                break;
            case 'innovation-strategy':
                this.artifacts.set('innovationStrategy', undefined);
                break;
            case 'design-thinking':
                this.artifacts.set('designThinking', undefined);
                break;

            default:
                console.log('Unknown artifact type:', artifactType);
        }

        this.notifyChange();

        const autoSync = vscode.workspace.getConfiguration('agentcanvas').get('autoSync', true);
        if (autoSync) {
            await this.syncToFiles();
        }
    }

    private removeStoryLinksFromRequirements(storyIds: string[]): void {
        const requirements = this.artifacts.get('requirements');
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
            this.artifacts.set('requirements', { ...requirements });
        }
    }

    /**
     * Sync relatedEpics on requirements when an epic's linked requirements change
     * This ensures bidirectional linking between epics and requirements
     */
    private syncRequirementLinks(
        epicId: string,
        oldReqIds: string[],
        newReqIds: string[],
        reqType: 'functional' | 'nonFunctional'
    ): void {
        const requirements = this.artifacts.get('requirements');
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
                    acOutput.appendLine(`[ArtifactStore] Removed ${epicId} from ${reqId}.relatedEpics`);
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
                    acOutput.appendLine(`[ArtifactStore] Added ${epicId} to ${reqId}.relatedEpics`);
                }
            }
        }

        if (changed) {
            this.artifacts.set('requirements', { ...requirements });
        }
    }

    /**
     * Add a new epic
     */
    addEpic(epic: Epic): void {
        const epics = this.artifacts.get('epics') || [];
        this.artifacts.set('epics', [...epics, epic]);
        this.notifyChange();
    }

    /**
     * Add a story to an epic
     */
    addStory(epicId: string, story: Story): void {
        const epics = this.artifacts.get('epics') || [];
        const epic = epics.find((e: Epic) => e.id === epicId);
        if (epic) {
            epic.stories.push(story);
            this.artifacts.set('epics', [...epics]);
            this.notifyChange();
        }
    }

    /**
     * Add a new functional requirement
     */
    addRequirement(requirement: FunctionalRequirement): void {
        const requirements = this.artifacts.get('requirements') || { 
            functional: [], 
            nonFunctional: [], 
            additional: [] 
        };
        requirements.functional.push(requirement);
        this.artifacts.set('requirements', requirements);
        this.notifyChange();
    }

    /**
     * Create a new epic with default values and return it
     * Used by canvas "Add Epic" button
     */
    createEpic(): Epic {
        const epics = this.artifacts.get('epics') || [];
        // Derive next ID from the highest existing numeric suffix to avoid collisions after deletion
        const maxNum = epics.reduce((max: number, e: Epic) => {
            const m = e.id.match(/^EPIC-(\d+)$/);
            return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        const nextId = maxNum + 1;
        
        const newEpic: Epic = {
            id: `EPIC-${nextId}`,
            title: `New Epic ${nextId}`,
            goal: '',
            functionalRequirements: [],
            status: 'draft',
            stories: []
        };
        
        this.addEpic(newEpic);
        acOutput.appendLine(`[ArtifactStore] Created new epic: ${newEpic.id}`);
        return newEpic;
    }

    /**
     * Create a new story and add it to an epic
     * If no epicId provided, creates in first epic or creates a new epic
     */
    createStory(epicId?: string): Story {
        const epics = this.artifacts.get('epics') || [];
        
        // Find target epic or create one
        let targetEpic: Epic;
        if (epicId) {
            targetEpic = epics.find((e: Epic) => e.id === epicId);
            if (!targetEpic) {
                throw new Error(`Epic ${epicId} not found`);
            }
        } else if (epics.length > 0) {
            // Do not silently pick epics[0]; callers must supply an explicit epicId
            throw new Error("createStory: epicId is required when epics exist. Pass the parent epic's ID explicitly.");
        } else {
            // Create a new epic first
            targetEpic = this.createEpic();
        }
        
        // Derive next ID from the highest existing numeric suffix to avoid collisions after deletion
        const epicNum = targetEpic.id.replace('EPIC-', '');
        const storyMaxNum = (targetEpic.stories || []).reduce((max: number, s: Story) => {
            const m = s.id.match(/^STORY-\d+-(\d+)$/);
            return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        const storyNum = storyMaxNum + 1;
        
        const newStory: Story = {
            id: `STORY-${epicNum}-${storyNum}`,
            title: `New Story ${storyNum}`,
            userStory: {
                asA: '',
                iWant: '',
                soThat: ''
            },
            acceptanceCriteria: [],
            status: 'draft'
        };
        
        this.addStory(targetEpic.id, newStory);
        acOutput.appendLine(`[ArtifactStore] Created new story: ${newStory.id} in ${targetEpic.id}`);
        return newStory;
    }

    /**
     * Create a new functional requirement with default values
     */
    createRequirement(): FunctionalRequirement {
        const requirements = this.artifacts.get('requirements') || { 
            functional: [], 
            nonFunctional: [], 
            additional: [] 
        };
        // Derive next ID from the highest existing numeric suffix to avoid collisions after deletion
        const maxReqNum = requirements.functional.reduce((max: number, r: FunctionalRequirement) => {
            const m = r.id.match(/^FR-(\d+)$/);
            return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        const nextId = maxReqNum + 1;
        
        const newReq: FunctionalRequirement = {
            id: `FR-${nextId}`,
            title: `New Requirement ${nextId}`,
            description: ''
        };
        
        this.addRequirement(newReq);
        acOutput.appendLine(`[ArtifactStore] Created new requirement: ${newReq.id}`);
        return newReq;
    }

    /**
     * Initialize or update the vision
     */
    createOrUpdateVision(): void {
        const currentVision = this.artifacts.get('vision');
        if (!currentVision) {
            this.artifacts.set('vision', {
                productName: 'New Product',
                problemStatement: '',
                targetUsers: [],
                valueProposition: '',
                successCriteria: [],
                status: 'draft'
            });
            this.notifyChange();
            acOutput.appendLine(`[ArtifactStore] Created new vision`);
        }
    }

    /**
     * Create a new use case and add it to an epic
     * If no epicId provided, adds to first epic or creates a new epic
     */
    createUseCase(epicId?: string): UseCase {
        const epics = this.artifacts.get('epics') || [];
        
        // Find target epic or create one
        let targetEpic: Epic;
        if (epicId) {
            targetEpic = epics.find((e: Epic) => e.id === epicId);
            if (!targetEpic) {
                throw new Error(`Epic ${epicId} not found`);
            }
        } else if (epics.length > 0) {
            // Do not silently pick epics[0]; callers must supply an explicit epicId
            throw new Error('createUseCase: epicId is required when epics exist. Pass the parent epic\'s ID explicitly.');
        } else {
            // Create a new epic first
            targetEpic = this.createEpic();
        }
        
        // Initialize useCases array if not present
        if (!targetEpic.useCases) {
            targetEpic.useCases = [];
        }
        
        // Derive next ID from the highest existing numeric suffix to avoid collisions after deletion
        const epicNum = targetEpic.id.replace('EPIC-', '');
        const ucMaxNum = (targetEpic.useCases || []).reduce((max: number, uc: UseCase) => {
            const m = uc.id.match(/^UC-\d+-(\d+)$/);
            return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        const ucNum = ucMaxNum + 1;
        
        const newUseCase: UseCase = {
            id: `UC-${epicNum}-${ucNum}`,
            title: `New Use Case ${ucNum}`,
            summary: '',
            scenario: {
                context: '',
                before: '',
                after: '',
                impact: ''
            }
        };
        
        // Add to epic's useCases array
        targetEpic.useCases.push(newUseCase);
        
        // Update the epic in storage
        const epicIndex = epics.findIndex((e: Epic) => e.id === targetEpic.id);
        if (epicIndex !== -1) {
            epics[epicIndex] = targetEpic;
            this.artifacts.set('epics', epics);
        }
        
        this.notifyChange();
        
        acOutput.appendLine(`[ArtifactStore] Created new use case: ${newUseCase.id} in ${targetEpic.id}`);
        return newUseCase;
    }

    /**
     * Create a new Product Brief with default values
     */
    createProductBrief(): ProductBrief {
        const existing = this.artifacts.get('productBrief');
        if (existing) {
            acOutput.appendLine(`[ArtifactStore] ProductBrief already exists, returning existing`);
            return existing;
        }
        
        const newBrief: ProductBrief = {
            id: 'product-brief-1',
            productName: 'New Product',
            status: 'draft',
            vision: {
                statement: '',
                problemStatement: ''
            }
        };
        
        this.artifacts.set('productBrief', newBrief);
        this.notifyChange();
        acOutput.appendLine(`[ArtifactStore] Created new product brief`);
        return newBrief;
    }

    /**
     * Create a new PRD (Product Requirements Document) with default values
     */
    createPRD(): PRD {
        const existing = this.artifacts.get('prd');
        if (existing) {
            acOutput.appendLine(`[ArtifactStore] PRD already exists, returning existing`);
            return existing;
        }
        
        const newPRD: PRD = {
            id: 'prd-1',
            status: 'draft',
            productOverview: {
                productName: 'New Product',
                purpose: '',
                problemStatement: ''
            }
        };
        
        this.artifacts.set('prd', newPRD);
        this.notifyChange();
        acOutput.appendLine(`[ArtifactStore] Created new PRD`);
        return newPRD;
    }

    /**
     * Create a new Architecture document with default values
     */
    createArchitecture(): Architecture {
        const existing = this.artifacts.get('architecture');
        if (existing) {
            acOutput.appendLine(`[ArtifactStore] Architecture already exists, returning existing`);
            return existing;
        }
        
        const newArch: Architecture = {
            id: 'architecture-1',
            status: 'draft',
            overview: {
                projectName: 'New Project',
                summary: ''
            },
            decisions: []
        };
        
        this.artifacts.set('architecture', newArch);
        this.notifyChange();
        acOutput.appendLine(`[ArtifactStore] Created new architecture`);
        return newArch;
    }

    /**
     * Create a new test case, optionally linked to a story and/or epic.
     * If storyId is provided, epicId is derived automatically from the epic tree.
     * If only epicId is provided (epic-level test case), storyId remains undefined.
     */
    createTestCase(storyId?: string, directEpicId?: string): TestCase {
        const testCases: TestCase[] = this.artifacts.get('testCases') || [];
        // Derive next ID from the highest existing numeric suffix to avoid collisions after deletion
        const maxTcNum = testCases.reduce((max: number, tc: TestCase) => {
            const m = tc.id.match(/^TC-(\d+)$/);
            return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        const nextId = maxTcNum + 1;

        // Determine epicId: derive from story first, then use directly-supplied epicId
        let epicId: string | undefined = directEpicId;
        if (storyId) {
            const epics: Epic[] = this.artifacts.get('epics') || [];
            for (const epic of epics) {
                if (epic.stories?.some((s: Story) => s.id === storyId)) {
                    epicId = epic.id;
                    break;
                }
            }
        }

        const newTestCase: TestCase = {
            id: `TC-${nextId}`,
            title: `New Test Case ${nextId}`,
            type: 'acceptance',
            status: 'draft',
            storyId,
            epicId,
            steps: [],
            relatedRequirements: []
        };

        this.artifacts.set('testCases', [...testCases, newTestCase]);
        this.notifyChange();
        acOutput.appendLine(`[ArtifactStore] Created new test case: ${newTestCase.id}`);
        return newTestCase;
    }

    /**
     * Create a test strategy.
     * When epicId is provided, the strategy is stored on the epic (per-epic).
     * Otherwise falls back to the top-level project singleton for backward compat.
     */
    createTestStrategy(epicId?: string): TestStrategy {
        if (epicId) {
            // Per-epic test strategy
            const epics: Epic[] = this.artifacts.get('epics') || [];
            const epic = epics.find((e: Epic) => e.id === epicId);
            if (epic) {
                if (epic.testStrategy) {
                    acOutput.appendLine(`[ArtifactStore] TestStrategy already exists on epic ${epicId}, returning existing`);
                    return epic.testStrategy;
                }
                // Derive next numeric suffix: scan all epics for existing TS-N ids
                let maxTsNum = 0;
                for (const e of epics) {
                    if (e.testStrategy) {
                        const m = e.testStrategy.id.match(/^TS-(\d+)$/);
                        if (m) maxTsNum = Math.max(maxTsNum, parseInt(m[1], 10));
                    }
                }
                // Also check the top-level singleton
                const topLevel = this.artifacts.get('testStrategy');
                if (topLevel) {
                    const m = topLevel.id?.match(/^TS-(\d+)$/);
                    if (m) maxTsNum = Math.max(maxTsNum, parseInt(m[1], 10));
                }
                const nextId = maxTsNum + 1;

                const newStrategy: TestStrategy = {
                    id: `TS-${nextId}`,
                    title: `Test Strategy`,
                    status: 'draft',
                    epicId,
                    testTypes: ['unit', 'integration', 'e2e', 'acceptance'],
                    tooling: [],
                    coverageTargets: [],
                    riskAreas: []
                };
                epic.testStrategy = newStrategy;
                this.artifacts.set('epics', [...epics]);
                this.notifyChange();
                acOutput.appendLine(`[ArtifactStore] Created new test strategy ${newStrategy.id} on epic ${epicId}`);
                return newStrategy;
            }
        }

        // Fallback: project-level singleton (backward compat)
        const existing = this.artifacts.get('testStrategy');
        if (existing) {
            acOutput.appendLine(`[ArtifactStore] TestStrategy already exists, returning existing`);
            return existing;
        }

        const newStrategy: TestStrategy = {
            id: 'TS-1',
            title: 'Test Strategy',
            status: 'draft',
            testTypes: ['unit', 'integration', 'e2e', 'acceptance'],
            tooling: [],
            coverageTargets: [],
            riskAreas: []
        };

        this.artifacts.set('testStrategy', newStrategy);
        this.notifyChange();
        acOutput.appendLine(`[ArtifactStore] Created new test strategy`);
        return newStrategy;
    }

    /**
     * Set current wizard step
     */
    setCurrentStep(step: WizardStep): void {
        this.artifacts.set('currentStep', step);
        this.notifyChange();
    }

    /**
     * Update AI cursor position
     */
    updateAICursor(cursor: AICursor | undefined): void {
        this.artifacts.set('aiCursor', cursor);
        this.notifyChange();
    }

    /**
     * Load artifacts from .agentcanvas-context folder
     * Recursively searches ALL subfolders for JSON files
     * Handles various artifact types: epics, stories, use-cases, requirements
     */
    async loadFromFolder(folderUri: vscode.Uri): Promise<void> {
        acOutput.appendLine(`[ArtifactStore] loadFromFolder called with: ${folderUri.fsPath}`);
        
        // Track source folder for syncing back
        this.sourceFolder = folderUri;
        this.sourceFiles.clear();
        
        try {
            const allEpics: Epic[] = [];
            const standaloneStories: Story[] = [];
            const pendingUseCases: { uc: any; parentEpicId: string | null }[] = [];
            const unresolvedUseCases: any[] = [];

            const normalizeEpicId = (id: string | null): string | null => {
                if (!id) return null;
                const match = id.match(/EPIC[\s-]*(\d+)/i);
                if (match) return `EPIC-${parseInt(match[1], 10)}`;
                const numeric = id.match(/^(\d+)$/);
                if (numeric) return `EPIC-${parseInt(numeric[1], 10)}`;
                return id;
            };

            const epicIdFromUseCaseId = (id: string | null): string | null => {
                if (!id) return null;
                const match = id.match(/^UC-(\d+)(?:-|$)/i);
                if (!match) return null;
                return `EPIC-${match[1]}`;
            };
            let projectName = '';
            let requirements: BmadArtifacts['requirements'] = {
                functional: [],
                nonFunctional: [],
                additional: []
            };

            // Recursively find ALL JSON files in the folder and subfolders
            const allJsonFiles = await this.findAllJsonFiles(folderUri);
            acOutput.appendLine(`[ArtifactStore] Found ${allJsonFiles.length} JSON files total`);

            // Lazily initialise the schema validator for load-time checks.
            if (!schemaValidator.isInitialized()) {
                try {
                    const bmadPath = vscode.Uri.joinPath(
                        vscode.Uri.file(
                            require('path').join(
                                (vscode.extensions.getExtension('mohamed-sayed.agentcanvas')?.extensionUri ??
                                 vscode.Uri.file(__dirname + '/../..')).fsPath,
                                'resources', '_bmad'
                            )
                        )
                    ).fsPath;
                    schemaValidator.init(bmadPath, acOutput);
                } catch {
                    // Validator unavailable — load will proceed without checks.
                }
            }

            /** Accumulates per-file validation warnings for the load summary. */
            const loadValidationIssues: { file: string; type: string; errors: string[] }[] = [];

            // Process each JSON file based on its content
            for (const fileUri of allJsonFiles) {
                try {
                    const content = await vscode.workspace.fs.readFile(fileUri);
                    const data = JSON.parse(Buffer.from(content).toString('utf-8'));
                    const fileName = fileUri.path.split('/').pop() || '';
                    
                    acOutput.appendLine(`[ArtifactStore] Processing: ${fileName}`);

                    // Detect artifact type from metadata or content structure
                    const artifactType = data.metadata?.artifactType || this.detectArtifactType(data, fileName);

                    // ── Load-time schema validation (warn-only) ──
                    // Validate the raw JSON against the full schema before the
                    // store flattens it.  Issues are collected and logged at the
                    // end of loading so the user can fix the source files.
                    if (schemaValidator.isInitialized() && artifactType) {
                        const result = schemaValidator.validate(artifactType, data);
                        if (!result.valid) {
                            loadValidationIssues.push({
                                file: fileName,
                                type: artifactType,
                                errors: result.errors,
                            });
                        }
                    }

                    switch (artifactType) {
                        case 'epics':
                        case 'epic':
                            // File contains epics (possibly with embedded stories)
                            this.sourceFiles.set('epics', fileUri);
                            const epicsArray = data.content?.epics || data.epics || [data.content || data];
                            
                            for (const epicData of epicsArray) {
                                const epic = this.mapSchemaEpicToInternal(epicData);
                                if (epic) {
                                    acOutput.appendLine(`[ArtifactStore] Loaded epic: ${epic.id} - ${epic.title} (${epic.stories.length} stories)`);
                                    const existingIndex = allEpics.findIndex(e => e.id === epic.id);
                                    if (existingIndex >= 0) {
                                        // Merge stories from duplicate epic, deduplicating by ID and title
                                        const existingStoryIds = new Set(allEpics[existingIndex].stories.map((s: Story) => s.id));
                                        const existingStoryTitles = new Set(allEpics[existingIndex].stories.map((s: Story) => s.title.toLowerCase().trim()));
                                        const newStories = epic.stories.filter((s: Story) =>
                                            !existingStoryIds.has(s.id) && !existingStoryTitles.has(s.title.toLowerCase().trim())
                                        );
                                        allEpics[existingIndex].stories = [
                                            ...allEpics[existingIndex].stories,
                                            ...newStories
                                        ];
                                    } else {
                                        allEpics.push(epic);
                                    }
                                }
                            }
                            
                            // Extract project name
                            if (!projectName) {
                                projectName = data.metadata?.projectName || 
                                             data.content?.overview?.projectName || '';
                            }
                            
                            // Extract requirements inventory
                            const reqInventory = data.content?.requirementsInventory;
                            if (reqInventory) {
                                if (reqInventory.functional?.length) {
                                    requirements.functional.push(
                                        ...reqInventory.functional.map((fr: any) => this.mapSchemaRequirement(fr))
                                    );
                                }
                                if (reqInventory.nonFunctional?.length) {
                                    requirements.nonFunctional.push(
                                        ...reqInventory.nonFunctional.map((nfr: any) => this.mapSchemaNonFunctionalRequirement(nfr))
                                    );
                                }
                                if (reqInventory.additional?.length) {
                                    requirements.additional.push(
                                        ...reqInventory.additional.map((ar: any) => this.mapSchemaAdditionalRequirement(ar))
                                    );
                                }
                            }
                            break;
                            
                        case 'story':
                            // Standalone story file
                            const storyData = data.content || data;
                            const story = this.mapSchemaStoryToInternal(storyData);
                            if (story) {
                                acOutput.appendLine(`[ArtifactStore] Loaded standalone story: ${story.title}`);
                                standaloneStories.push(story);
                            }
                            break;
                            
                        case 'use-case':
                        case 'usecase': {
                            // Use case file — link to its parent epic via epicId field or ID prefix UC-N-*
                            acOutput.appendLine(`[ArtifactStore] Found use-case: ${fileName}`);
                            const ucData = data.content || data;
                            const ucId = ucData.id || fileName.replace(/\.json$/, '');
                            const summary = ucData.summary || ucData.description || '';
                            const uc: UseCase = {
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
                                notes: ucData.notes
                            };
                            // Determine parent epic: prefer explicit epicId, fall back to ID prefix UC-N-*
                            const parentEpicId = normalizeEpicId(
                                ucData.epicId ||
                                epicIdFromUseCaseId(uc.id)
                            );
                            if (parentEpicId) {
                                const epicsArr: any[] = this.artifacts.get('epics') || [];
                                const parentEpic = epicsArr.find((e: any) => normalizeEpicId(e.id) === parentEpicId);
                                if (parentEpic) {
                                    if (!parentEpic.useCases) { parentEpic.useCases = []; }
                                    const existing = parentEpic.useCases.find((u: any) => u.id === uc.id);
                                    if (existing) {
                                        const hasExistingContent = (existing.summary || existing.title || '').trim().length > 0;
                                        const hasNewContent = (uc.summary || uc.title || '').trim().length > 0;
                                        if (!hasExistingContent && hasNewContent) {
                                            Object.assign(existing, uc);
                                            acOutput.appendLine(`[ArtifactStore] Updated placeholder use-case ${uc.id} in epic ${parentEpicId}`);
                                        }
                                    } else {
                                        parentEpic.useCases.push(uc);
                                        acOutput.appendLine(`[ArtifactStore] Linked use-case ${uc.id} to epic ${parentEpicId}`);
                                    }
                                } else {
                                    pendingUseCases.push({ uc, parentEpicId });
                                    acOutput.appendLine(`[ArtifactStore] Parent epic ${parentEpicId} not found for use-case ${uc.id}, queued for linking`);
                                }
                            } else {
                                pendingUseCases.push({ uc, parentEpicId: null });
                                acOutput.appendLine(`[ArtifactStore] No parent epic found for use-case ${uc.id}, queued for linking`);
                            }
                            break;
                        }
                            
                        case 'requirements':
                            // Standalone requirements file
                            const reqs = data.content || data;
                            if (reqs.functional) {
                                requirements.functional.push(
                                    ...reqs.functional.map((fr: any) => this.mapSchemaRequirement(fr))
                                );
                            }
                            if (reqs.nonFunctional) {
                                requirements.nonFunctional.push(
                                    ...reqs.nonFunctional.map((nfr: any) => this.mapSchemaNonFunctionalRequirement(nfr))
                                );
                            }
                            if (reqs.additional) {
                                requirements.additional.push(
                                    ...reqs.additional.map((ar: any) => this.mapSchemaAdditionalRequirement(ar))
                                );
                            }
                            break;
                        
                        case 'functional-requirements': {
                            // Domain-based functional requirements file
                            // Structure: content.domains.{domainKey}.requirements[]
                            this.sourceFiles.set('functionalRequirements', fileUri);
                            const frContent = data.content || data;
                            const domains = frContent.domains;
                            if (domains && typeof domains === 'object') {
                                let frCount = 0;
                                for (const domainKey of Object.keys(domains)) {
                                    const domain = domains[domainKey];
                                    const domainReqs: any[] = domain.requirements || [];
                                    for (const fr of domainReqs) {
                                        // Synthesize description from detailedRequirements/userStories if no description
                                        const desc = fr.description
                                            || (fr.detailedRequirements && Array.isArray(fr.detailedRequirements)
                                                ? fr.detailedRequirements.join(' ')
                                                : '')
                                            || (fr.userStories && Array.isArray(fr.userStories)
                                                ? fr.userStories.join(' ')
                                                : '');
                                        const mapped = this.mapSchemaRequirement({
                                            ...fr,
                                            description: desc,
                                            // Carry domain context for display
                                            capabilityArea: fr.capabilityArea || domain.title || domainKey,
                                            type: fr.type || 'functional'
                                        });
                                        // Deduplicate by ID
                                        if (!requirements.functional.find((existing: any) => existing.id === mapped.id)) {
                                            requirements.functional.push(mapped);
                                            frCount++;
                                        }
                                    }
                                }
                                acOutput.appendLine(`[ArtifactStore] Loaded ${frCount} functional requirements from ${Object.keys(domains).length} domains in ${fileName}`);
                            }
                            // Also check for top-level functional/nonFunctional/additional arrays
                            if (frContent.functional) {
                                requirements.functional.push(
                                    ...frContent.functional.map((fr: any) => this.mapSchemaRequirement(fr))
                                );
                            }
                            if (frContent.nonFunctional) {
                                requirements.nonFunctional.push(
                                    ...frContent.nonFunctional.map((nfr: any) => this.mapSchemaNonFunctionalRequirement(nfr))
                                );
                            }
                            break;
                        }
                        
                        case 'vision':
                            // Vision file — supports both standard BMAD schema (data.content.*)
                            // and flat product-vision schema (data.product.name, data.visionStatement, etc.)
                            // Also handles nested content.vision.{statement, problemStatement, proposedSolution}
                            this.sourceFiles.set('vision', fileUri);
                            const visionData = data.content || data;
                            // The vision sub-object may contain statement/problemStatement/proposedSolution
                            const visionSubObj = visionData.vision && typeof visionData.vision === 'object' ? visionData.vision : null;

                            // Product name: standard schema or flat schema (data.product.name)
                            const visionProductName =
                                visionData.productName ||
                                data.product?.name ||
                                data.metadata?.projectName || '';

                            // problemStatement: check nested vision sub-object first, then flat field
                            const rawPS = visionData.problemStatement || visionSubObj?.problemStatement;
                            const flatProblemStatement: string =
                                typeof rawPS === 'string' ? rawPS :
                                rawPS && typeof rawPS === 'object'
                                    ? [rawPS.coreProblem, ...(Array.isArray(rawPS.impacts) ? rawPS.impacts : [])].filter(Boolean).join(' ')
                                    : (data.visionStatement || '');

                            // valueProposition: check nested vision sub-object, then flat field
                            const rawVP = visionData.valueProposition || data.valueProposition ||
                                visionSubObj?.proposedSolution || visionSubObj?.statement;
                            const flatValueProposition: string =
                                Array.isArray(rawVP) ? rawVP.join(' ') :
                                typeof rawVP === 'string' ? rawVP : '';

                            // targetUsers: preserve rich objects for the renderer
                            const rawTargetUsers = visionData.targetUsers || [];

                            // successMetrics/successCriteria: check visionData (content level) first, then data root
                            const rawSC = visionData.successCriteria || visionData.successMetrics || data.successMetrics || [];

                            const vision = {
                                productName: visionProductName,
                                problemStatement: flatProblemStatement,
                                // Pass through the nested vision sub-object so the renderer
                                // can display statement/problemStatement/proposedSolution
                                vision: visionSubObj || undefined,
                                // Preserve rich targetUsers objects (renderer normalizes both strings and objects)
                                targetUsers: rawTargetUsers,
                                // Preserve rich successMetrics objects (renderer normalizes both strings and objects)
                                successMetrics: rawSC,
                                valueProposition: flatValueProposition,
                                // Keep flat successCriteria for backward compat with any code reading it
                                successCriteria: rawSC.map((s: any) =>
                                    typeof s === 'string' ? s :
                                    s.metric ? `${s.metric}: ${s.target || s.description || ''}`.trim() :
                                    s.criterion ? `${s.criterion}${s.target ? ': ' + s.target : ''}` :
                                    JSON.stringify(s)
                                ),
                                status: data.status || data.metadata?.status || 'draft'
                            };
                            this.artifacts.set('vision', vision);
                            acOutput.appendLine(`[ArtifactStore] Loaded vision: ${vision.productName}`);
                            
                            // Use vision product name as project name if not set
                            if (!projectName && vision.productName) {
                                projectName = vision.productName;
                            }
                            break;
                            
                        case 'product-brief': {
                            this.sourceFiles.set('productBrief', fileUri);
                            const pbData = data.content || data;
                            this.artifacts.set('productBrief', pbData);
                            if (!projectName) projectName = pbData.productName || data.metadata?.projectName || '';
                            acOutput.appendLine(`[ArtifactStore] Loaded product-brief: ${pbData.productName || '(unnamed)'}`);
                            break;
                        }

                        case 'prd': {
                            this.sourceFiles.set('prd', fileUri);
                            const prdData = data.content || data;
                            this.artifacts.set('prd', prdData);
                            if (!projectName) projectName = prdData.productOverview?.productName || data.metadata?.projectName || '';
                            acOutput.appendLine(`[ArtifactStore] Loaded PRD: ${prdData.productOverview?.productName || '(unnamed)'}`);
                            break;
                        }

                        case 'architecture': {
                            this.sourceFiles.set('architecture', fileUri);
                            const archData = data.content || data;
                            this.artifacts.set('architecture', archData);
                            acOutput.appendLine(`[ArtifactStore] Loaded architecture: ${archData.overview?.projectName || '(unnamed)'}`);
                            break;
                        }

                        case 'test-cases':
                        case 'test-case': {
                            // File may contain a single TC or an array under content.testCases
                            this.sourceFiles.set('testCases', fileUri);
                            const tcContent = data.content || data;
                            const tcArray: any[] = tcContent.testCases || (Array.isArray(tcContent) ? tcContent : [tcContent]);
                            const existingTCs: any[] = this.artifacts.get('testCases') || [];
                            // Merge, avoiding duplicates by id
                            const merged = [...existingTCs];
                            tcArray.forEach((tc: any) => {
                                if (tc && tc.id && !merged.find((e: any) => e.id === tc.id)) {
                                    merged.push(tc);
                                }
                            });
                            this.artifacts.set('testCases', merged);
                            acOutput.appendLine(`[ArtifactStore] Loaded ${tcArray.length} test case(s) from ${fileName}`);
                            break;
                        }

                        case 'test-design':
                        case 'test-design-qa':
                        case 'test-design-architecture': {
                            // Store test-design in memory.  CoveragePlan→TC extraction
                            // and riskAssessment→epic.risks attachment are handled by
                            // reconcileDerivedState() which runs after all files are
                            // loaded and allEpics is stored — no inline extraction here.
                            this.sourceFiles.set('testDesign', fileUri);
                            const tdContent = data.content || data;
                            this.artifacts.set('testDesign', tdContent);
                            acOutput.appendLine(`[ArtifactStore] Loaded test-design from ${fileName}`);
                            break;
                        }

                        case 'test-strategy': {
                            this.sourceFiles.set('testStrategy', fileUri);
                            const tsData = data.content || data;
                            this.artifacts.set('testStrategy', tsData);
                            acOutput.appendLine(`[ArtifactStore] Loaded test strategy: ${tsData.title || '(unnamed)'}`);
                            break;
                        }

                        // ─── TEA module artifacts ───────────────────────────────────
                        case 'traceability-matrix': {
                            this.sourceFiles.set('traceabilityMatrix', fileUri);
                            const tmData = data.content || data;
                            this.artifacts.set('traceabilityMatrix', tmData);
                            acOutput.appendLine(`[ArtifactStore] Loaded traceability matrix`);
                            break;
                        }

                        case 'test-review': {
                            this.sourceFiles.set('testReview', fileUri);
                            const trData = data.content || data;
                            this.artifacts.set('testReview', trData);
                            acOutput.appendLine(`[ArtifactStore] Loaded test review`);
                            break;
                        }

                        case 'nfr-assessment': {
                            this.sourceFiles.set('nfrAssessment', fileUri);
                            const nfrData = data.content || data;
                            this.artifacts.set('nfrAssessment', nfrData);
                            acOutput.appendLine(`[ArtifactStore] Loaded NFR assessment`);
                            break;
                        }

                        case 'atdd-checklist': {
                            this.sourceFiles.set('atddChecklist', fileUri);
                            const atddData = data.content || data;
                            this.artifacts.set('atddChecklist', atddData);
                            acOutput.appendLine(`[ArtifactStore] Loaded ATDD checklist`);
                            break;
                        }

                        case 'test-framework': {
                            this.sourceFiles.set('testFramework', fileUri);
                            const tfData = data.content || data;
                            this.artifacts.set('testFramework', tfData);
                            acOutput.appendLine(`[ArtifactStore] Loaded test framework`);
                            break;
                        }

                        case 'ci-pipeline': {
                            this.sourceFiles.set('ciPipeline', fileUri);
                            const ciData = data.content || data;
                            this.artifacts.set('ciPipeline', ciData);
                            acOutput.appendLine(`[ArtifactStore] Loaded CI pipeline`);
                            break;
                        }

                        case 'automation-summary': {
                            this.sourceFiles.set('automationSummary', fileUri);
                            const asData = data.content || data;
                            this.artifacts.set('automationSummary', asData);
                            acOutput.appendLine(`[ArtifactStore] Loaded automation summary`);
                            break;
                        }

                        // ─── BMM module artifacts ───────────────────────────────────
                        case 'research': {
                            this.sourceFiles.set('research', fileUri);
                            const resData = data.content || data;
                            this.artifacts.set('research', resData);
                            acOutput.appendLine(`[ArtifactStore] Loaded research`);
                            break;
                        }

                        case 'ux-design': {
                            this.sourceFiles.set('uxDesign', fileUri);
                            const uxData = data.content || data;
                            this.artifacts.set('uxDesign', uxData);
                            acOutput.appendLine(`[ArtifactStore] Loaded UX design`);
                            break;
                        }

                        case 'readiness-report': {
                            this.sourceFiles.set('readinessReport', fileUri);
                            const rrData = data.content || data;
                            this.artifacts.set('readinessReport', rrData);
                            acOutput.appendLine(`[ArtifactStore] Loaded readiness report`);
                            break;
                        }

                        case 'sprint-status': {
                            this.sourceFiles.set('sprintStatus', fileUri);
                            const ssData = data.content || data;
                            this.artifacts.set('sprintStatus', ssData);
                            acOutput.appendLine(`[ArtifactStore] Loaded sprint status`);
                            break;
                        }

                        case 'retrospective': {
                            this.sourceFiles.set('retrospective', fileUri);
                            const retroData = data.content || data;
                            this.artifacts.set('retrospective', retroData);
                            acOutput.appendLine(`[ArtifactStore] Loaded retrospective`);
                            break;
                        }

                        case 'change-proposal': {
                            this.sourceFiles.set('changeProposal', fileUri);
                            const cpData = data.content || data;
                            this.artifacts.set('changeProposal', cpData);
                            acOutput.appendLine(`[ArtifactStore] Loaded change proposal`);
                            break;
                        }

                        case 'code-review': {
                            this.sourceFiles.set('codeReview', fileUri);
                            const crData = data.content || data;
                            this.artifacts.set('codeReview', crData);
                            acOutput.appendLine(`[ArtifactStore] Loaded code review`);
                            break;
                        }

                        case 'project-overview': {
                            this.sourceFiles.set('projectOverview', fileUri);
                            const poData = data.content || data;
                            this.artifacts.set('projectOverview', poData);
                            acOutput.appendLine(`[ArtifactStore] Loaded project overview`);
                            break;
                        }

                        case 'project-context': {
                            this.sourceFiles.set('projectContext', fileUri);
                            const pcData = data.content || data;
                            this.artifacts.set('projectContext', pcData);
                            acOutput.appendLine(`[ArtifactStore] Loaded project context`);
                            break;
                        }

                        case 'tech-spec': {
                            this.sourceFiles.set('techSpec', fileUri);
                            const tspcData = data.content || data;
                            this.artifacts.set('techSpec', tspcData);
                            acOutput.appendLine(`[ArtifactStore] Loaded tech spec`);
                            break;
                        }

                        case 'source-tree': {
                            this.sourceFiles.set('sourceTree', fileUri);
                            const stData = data.content || data;
                            this.artifacts.set('sourceTree', stData);
                            acOutput.appendLine(`[ArtifactStore] Loaded source tree`);
                            break;
                        }

                        case 'test-summary': {
                            this.sourceFiles.set('testSummary', fileUri);
                            const tsmData = data.content || data;
                            this.artifacts.set('testSummary', tsmData);
                            acOutput.appendLine(`[ArtifactStore] Loaded test summary`);
                            break;
                        }

                        case 'risks': {
                            this.sourceFiles.set('risks', fileUri);
                            const risksData = data.content || data;
                            this.artifacts.set('risks', risksData);
                            acOutput.appendLine(`[ArtifactStore] Loaded risks`);
                            break;
                        }

                        case 'definition-of-done': {
                            this.sourceFiles.set('definitionOfDone', fileUri);
                            const dodData = data.content || data;
                            this.artifacts.set('definitionOfDone', dodData);
                            acOutput.appendLine(`[ArtifactStore] Loaded definition of done`);
                            break;
                        }

                        // ─── CIS module artifacts ───────────────────────────────────
                        case 'storytelling': {
                            this.sourceFiles.set('storytelling', fileUri);
                            const storyData = data.content || data;
                            this.artifacts.set('storytelling', storyData);
                            acOutput.appendLine(`[ArtifactStore] Loaded storytelling`);
                            break;
                        }

                        case 'problem-solving': {
                            this.sourceFiles.set('problemSolving', fileUri);
                            const psData = data.content || data;
                            this.artifacts.set('problemSolving', psData);
                            acOutput.appendLine(`[ArtifactStore] Loaded problem solving`);
                            break;
                        }

                        case 'innovation-strategy': {
                            this.sourceFiles.set('innovationStrategy', fileUri);
                            const isData = data.content || data;
                            this.artifacts.set('innovationStrategy', isData);
                            acOutput.appendLine(`[ArtifactStore] Loaded innovation strategy`);
                            break;
                        }

                        case 'design-thinking': {
                            this.sourceFiles.set('designThinking', fileUri);
                            const dtData = data.content || data;
                            this.artifacts.set('designThinking', dtData);
                            acOutput.appendLine(`[ArtifactStore] Loaded design thinking`);
                            break;
                        }

                        default:
                            // Try to detect content structure
                            if (data.content?.epics || data.epics) {
                                // Has epics array - treat as epics file
                                const epics = data.content?.epics || data.epics;
                                for (const epicData of epics) {
                                    const epic = this.mapSchemaEpicToInternal(epicData);
                                    if (epic) {
                                        const existingIndex = allEpics.findIndex(e => e.id === epic.id);
                                        if (existingIndex >= 0) {
                                            // Merge stories, deduplicating by ID and title
                                            const existingStoryIds = new Set(allEpics[existingIndex].stories.map((s: Story) => s.id));
                                            const existingStoryTitles = new Set(allEpics[existingIndex].stories.map((s: Story) => s.title.toLowerCase().trim()));
                                            const newStories = epic.stories.filter((s: Story) =>
                                                !existingStoryIds.has(s.id) && !existingStoryTitles.has(s.title.toLowerCase().trim())
                                            );
                                            allEpics[existingIndex].stories = [
                                                ...allEpics[existingIndex].stories,
                                                ...newStories
                                            ];
                                        } else {
                                            allEpics.push(epic);
                                        }
                                    }
                                }
                            } else if (data.content?.userStory || data.userStory) {
                                // Has userStory - treat as story
                                const story = this.mapSchemaStoryToInternal(data.content || data);
                                if (story) standaloneStories.push(story);
                            }
                            break;
                    }
                } catch (e) {
                    acOutput.appendLine(`[ArtifactStore] Could not parse ${fileUri.fsPath}: ${e}`);
                }
            }

            // If we have standalone stories but no epics, create a default epic for them
            if (standaloneStories.length > 0) {
                if (allEpics.length === 0) {
                    // Create a default epic to hold standalone stories
                    allEpics.push({
                        id: 'EPIC-DEFAULT',
                        title: 'Imported Stories',
                        goal: 'Stories imported from standalone files',
                        functionalRequirements: [],
                        status: 'draft',
                        stories: standaloneStories
                    });
                    acOutput.appendLine(`[ArtifactStore] Created default epic for ${standaloneStories.length} standalone stories`);
                } else {
                    // Add standalone stories to the first epic, deduplicating by ID and title
                    // across ALL epics (the same story may appear in any epic)
                    const allExistingIds = new Set<string>();
                    const allExistingTitles = new Set<string>();
                    for (const epic of allEpics) {
                        for (const s of epic.stories) {
                            allExistingIds.add(s.id);
                            allExistingTitles.add(s.title.toLowerCase().trim());
                        }
                    }
                    const newStories = standaloneStories.filter((s: Story) =>
                        !allExistingIds.has(s.id) && !allExistingTitles.has(s.title.toLowerCase().trim())
                    );
                    if (newStories.length > 0) {
                        allEpics[0].stories = [...allEpics[0].stories, ...newStories];
                        acOutput.appendLine(`[ArtifactStore] Added ${newStories.length} standalone stories to first epic (${standaloneStories.length - newStories.length} duplicates skipped)`);
                    } else {
                        acOutput.appendLine(`[ArtifactStore] All ${standaloneStories.length} standalone stories already present in first epic, skipping`);
                    }
                }
            }

            // Link any pending use-cases now that epics are loaded
            if (pendingUseCases.length > 0) {
                let linkedCount = 0;
                let unresolvedCount = 0;
                pendingUseCases.forEach(({ uc, parentEpicId }) => {
                    const resolvedEpicId = normalizeEpicId(
                        parentEpicId || epicIdFromUseCaseId(uc.id)
                    );
                    if (!resolvedEpicId) {
                        acOutput.appendLine(`[ArtifactStore] No parent epic found for use-case ${uc.id}, skipping link`);
                        unresolvedCount += 1;
                        unresolvedUseCases.push(uc);
                        return;
                    }
                    const parentEpic = allEpics.find((e: any) => normalizeEpicId(e.id) === resolvedEpicId);
                    if (parentEpic) {
                        if (!parentEpic.useCases) { parentEpic.useCases = []; }
                        const existing = parentEpic.useCases.find((u: any) => u.id === uc.id);
                        if (existing) {
                            const hasExistingContent = (existing.summary || existing.title || '').trim().length > 0;
                            const hasNewContent = (uc.summary || uc.title || '').trim().length > 0;
                            if (!hasExistingContent && hasNewContent) {
                                Object.assign(existing, uc);
                                acOutput.appendLine(`[ArtifactStore] Updated placeholder use-case ${uc.id} in epic ${resolvedEpicId}`);
                            }
                        } else {
                            parentEpic.useCases.push(uc);
                            acOutput.appendLine(`[ArtifactStore] Linked use-case ${uc.id} to epic ${resolvedEpicId}`);
                            linkedCount += 1;
                        }
                    } else {
                        acOutput.appendLine(`[ArtifactStore] Parent epic ${resolvedEpicId} not found for use-case ${uc.id}`);
                        unresolvedCount += 1;
                        unresolvedUseCases.push(uc);
                    }
                });
                acOutput.appendLine(`[ArtifactStore] Use-case linking summary: ${linkedCount} linked, ${unresolvedCount} unresolved`);
            }

            if (unresolvedUseCases.length > 0) {
                const existingUnlinked = allEpics.find((e: any) => e.id === 'EPIC-UNLINKED');
                if (existingUnlinked) {
                    existingUnlinked.useCases = [
                        ...(existingUnlinked.useCases || []),
                        ...unresolvedUseCases
                    ];
                } else {
                    allEpics.push({
                        id: 'EPIC-UNLINKED',
                        title: 'Unlinked Use Cases',
                        goal: 'Use cases that need an epic link',
                        functionalRequirements: [],
                        nonFunctionalRequirements: [],
                        additionalRequirements: [],
                        status: 'draft',
                        stories: [],
                        useCases: unresolvedUseCases
                    });
                }
                acOutput.appendLine(`[ArtifactStore] Created Unlinked Use Cases epic with ${unresolvedUseCases.length} use-cases`);
            }

            // Load .bmad-state.json if exists (for UI state)
            await this.loadUiState(folderUri);

            // NOTE: Deferred test-design risk resolution is no longer needed.
            // reconcileDerivedState() handles riskAssessment→epic.risks attachment
            // after allEpics is stored, regardless of file loading order.

            // Set loaded data
            const hasData = allEpics.length > 0 || requirements.functional.length > 0
                || this.artifacts.get('productBrief') || this.artifacts.get('prd')
                || this.artifacts.get('architecture') || this.artifacts.get('testCases')
                || this.artifacts.get('testStrategy') || this.artifacts.get('vision');
            if (hasData) {
                this.artifacts.set('projectName', projectName);
                this.artifacts.set('epics', allEpics);

                // Deduplicate requirements by ID (epics.json requirementsInventory
                // and standalone requirements files can contain overlapping entries)
                const seenFr = new Set<string>();
                requirements.functional = requirements.functional.filter(r => {
                    if (seenFr.has(r.id)) return false;
                    seenFr.add(r.id);
                    return true;
                });
                const seenNfr = new Set<string>();
                requirements.nonFunctional = requirements.nonFunctional.filter(r => {
                    if (seenNfr.has(r.id)) return false;
                    seenNfr.add(r.id);
                    return true;
                });
                const seenAdd = new Set<string>();
                requirements.additional = requirements.additional.filter(r => {
                    if (seenAdd.has(r.id)) return false;
                    seenAdd.add(r.id);
                    return true;
                });

                this.artifacts.set('requirements', requirements);
                this.artifacts.set('currentStep', 'review');
                
                const totalStories = allEpics.reduce((sum, e) => sum + (e.stories?.length || 0), 0);
                const tcCount = (this.artifacts.get('testCases') || []).length;
                acOutput.appendLine(`[ArtifactStore] SUCCESS: Loaded ${allEpics.length} epics, ${totalStories} stories, ${requirements.functional.length} FRs, ${tcCount} test cases`);

                // ── Log load-time schema validation summary ──
                // Always update the stored issues so stale data from a
                // previous load is cleared (e.g. after "Fix Schemas").
                this.artifacts.set('_loadValidationIssues', loadValidationIssues);

                if (loadValidationIssues.length > 0) {
                    acOutput.appendLine(
                        `[ArtifactStore] SCHEMA WARNINGS: ${loadValidationIssues.length} file(s) have schema issues:`
                    );
                    for (const issue of loadValidationIssues) {
                        acOutput.appendLine(
                            `  ${issue.file} (${issue.type}): ${issue.errors.join('; ')}`
                        );
                    }
                    acOutput.appendLine(
                        `[ArtifactStore] Data was loaded but may be incomplete. ` +
                        `Fix the source files to match the BMAD schemas.`
                    );

                    // Show a native VS Code warning so the user is prompted even
                    // if the canvas webview isn't visible yet.
                    // BUT skip this during a fix/validate operation — the webview
                    // already receives the result via schemaFixResult / schemaValidateResult,
                    // and re-showing this warning would create an infinite loop.
                    if (!this._fixInProgress) {
                        const fileList = loadValidationIssues.map(i => i.file).join(', ');
                        vscode.window.showWarningMessage(
                            `${loadValidationIssues.length} file(s) have schema issues: ${fileList}. ` +
                            `Open the AgentCanvas canvas and click "Fix Schemas" to auto-repair.`,
                            'Open Canvas'
                        ).then(choice => {
                            if (choice === 'Open Canvas') {
                                vscode.commands.executeCommand('agentcanvas.openCanvas');
                            }
                        });
                    }
                }

                // Rebuild all cross-artifact derived state (coveragePlan→TCs,
                // riskAssessment→epic.risks) from whatever is now in memory.
                // This runs AFTER artifacts.set('epics', allEpics) so epics
                // are available for storyId resolution and risk attachment.
                this.reconcileDerivedState();

                this.notifyChange();
            } else {
                acOutput.appendLine('[ArtifactStore] WARNING: No artifacts found in folder');
            }

        } catch (error) {
            acOutput.appendLine(`[ArtifactStore] ERROR loading BMAD artifacts: ${error}`);
        }
    }

    /**
     * Back up all artifact JSON files from the source folder into a timestamped
     * `.bmad-backup/<timestamp>/` directory alongside the source folder.
     *
     * Returns the backup folder URI on success, or `null` if there was nothing
     * to back up or the source folder is unknown.
     */
    async backupArtifactFiles(): Promise<vscode.Uri | null> {
        if (!this.sourceFolder) {
            acOutput.appendLine('[ArtifactStore] backupArtifactFiles: no sourceFolder — skipping');
            return null;
        }

        const allJsonFiles = await this.findAllJsonFiles(this.sourceFolder);
        if (allJsonFiles.length === 0) {
            acOutput.appendLine('[ArtifactStore] backupArtifactFiles: no JSON files found — skipping');
            return null;
        }

        // Build backup folder: <parent>/.bmad-backup/<ISO timestamp>
        const parentUri = vscode.Uri.joinPath(this.sourceFolder, '..');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFolderUri = vscode.Uri.joinPath(parentUri, '.bmad-backup', timestamp);

        try {
            await vscode.workspace.fs.createDirectory(backupFolderUri);
        } catch {
            // directory may already exist
        }

        let copied = 0;
        for (const fileUri of allJsonFiles) {
            try {
                // Preserve relative path from sourceFolder
                const relativePath = fileUri.fsPath
                    .substring(this.sourceFolder.fsPath.length)
                    .replace(/^[/\\]+/, '');
                const destUri = vscode.Uri.joinPath(backupFolderUri, relativePath);

                // Ensure sub-directory exists
                const destDir = vscode.Uri.joinPath(destUri, '..');
                try { await vscode.workspace.fs.createDirectory(destDir); } catch { /* ok */ }

                await vscode.workspace.fs.copy(fileUri, destUri, { overwrite: true });
                copied++;
            } catch (e) {
                acOutput.appendLine(`[ArtifactStore] backupArtifactFiles: failed to copy ${fileUri.fsPath}: ${e}`);
            }
        }

        acOutput.appendLine(
            `[ArtifactStore] backupArtifactFiles: backed up ${copied}/${allJsonFiles.length} files to ${backupFolderUri.fsPath}`
        );
        return backupFolderUri;
    }

    /**
     * Remove old backup folders, keeping only the most recent `keepCount`.
     * Called automatically after a successful backup to prevent unlimited growth.
     *
     * @param keepCount  Number of recent backups to retain (default 5).
     */
    async pruneOldBackups(keepCount = 5): Promise<void> {
        if (!this.sourceFolder) return;

        const parentUri = vscode.Uri.joinPath(this.sourceFolder, '..');
        const backupRootUri = vscode.Uri.joinPath(parentUri, '.bmad-backup');

        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(backupRootUri);
        } catch {
            // .bmad-backup doesn't exist — nothing to prune
            return;
        }

        // Only look at directories (timestamp folders)
        const dirs = entries
            .filter(([, type]) => type === vscode.FileType.Directory)
            .map(([name]) => name)
            .sort(); // ISO timestamps sort lexicographically

        if (dirs.length <= keepCount) return;

        const toRemove = dirs.slice(0, dirs.length - keepCount);
        for (const dirName of toRemove) {
            try {
                const dirUri = vscode.Uri.joinPath(backupRootUri, dirName);
                await vscode.workspace.fs.delete(dirUri, { recursive: true });
                acOutput.appendLine(
                    `[ArtifactStore] pruneOldBackups: removed old backup ${dirName}`
                );
            } catch (e) {
                acOutput.appendLine(
                    `[ArtifactStore] pruneOldBackups: failed to remove ${dirName}: ${e}`
                );
            }
        }
    }

    /**
     * Recursively find all JSON files in a folder and its subfolders.
     *
     * @param folderUri  Root directory to search.
     * @param depth      Current recursion depth (callers should omit — used internally).
     * @param visited    Set of already-visited canonical paths (cycle detection).
     * @param maxDepth   Maximum recursion depth (default 10).
     */
    private async findAllJsonFiles(
        folderUri: vscode.Uri,
        depth = 0,
        visited: Set<string> = new Set(),
        maxDepth = 10
    ): Promise<vscode.Uri[]> {
        if (depth > maxDepth) {
            acOutput.appendLine(`[ArtifactStore] findAllJsonFiles: max depth (${maxDepth}) reached at ${folderUri.fsPath}`);
            return [];
        }

        // Cycle detection: normalise the path and skip if already seen
        const canonical = folderUri.fsPath.toLowerCase();
        if (visited.has(canonical)) {
            acOutput.appendLine(`[ArtifactStore] findAllJsonFiles: cycle detected at ${folderUri.fsPath}`);
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
                    const subResults = await this.findAllJsonFiles(entryUri, depth + 1, visited, maxDepth);
                    results.push(...subResults);
                }
            }
        } catch (e) {
            acOutput.appendLine(`[ArtifactStore] Could not read directory ${folderUri.fsPath}: ${e}`);
        }
        
        return results;
    }

    /**
     * Detect artifact type from content structure or filename
     */
    private detectArtifactType(data: any, fileName: string): string {
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
    private async loadUiState(folderUri: vscode.Uri): Promise<void> {
        const possiblePaths = [
            vscode.Uri.joinPath(folderUri, 'planning-artifacts', '.bmad-state.json'),
            vscode.Uri.joinPath(folderUri, '.bmad-state.json')
        ];
        
        for (const stateUri of possiblePaths) {
            try {
                const content = await vscode.workspace.fs.readFile(stateUri);
                const stateData = JSON.parse(Buffer.from(content).toString('utf-8'));
                this.artifacts.set('uiState', stateData.ui);
                acOutput.appendLine(`[ArtifactStore] Loaded UI state from ${stateUri.fsPath}`);
                return;
            } catch {
                // Try next path
            }
        }
    }

    /**
     * Map epic from schema format to internal Epic type
     */
    private mapSchemaEpicToInternal(epicData: any): Epic | null {
        if (!epicData) return null;
        
        const stories: Story[] = [];
        const useCases: any[] = [];
        
        // Map stories if present, deduplicating by both ID and normalized title
        // (the same story can appear multiple times with different IDs in the data)
        if (epicData.stories && Array.isArray(epicData.stories)) {
            const seenIds = new Set<string>();
            const seenTitles = new Set<string>();
            for (const storyData of epicData.stories) {
                const story = this.mapSchemaStoryToInternal(storyData);
                if (story) {
                    const normTitle = story.title.toLowerCase().trim();
                    if (seenIds.has(story.id) || seenTitles.has(normTitle)) {
                        continue; // skip duplicate
                    }
                    seenIds.add(story.id);
                    seenTitles.add(normTitle);
                    stories.push(story);
                }
            }
        }

        if (epicData.useCases && Array.isArray(epicData.useCases)) {
            epicData.useCases.forEach((uc: any, index: number) => {
                const summary = uc.summary || uc.description || '';
                useCases.push({
                    id: uc.id || `UC-${index + 1}`,
                    title: uc.title || uc.name || summary || `Use Case ${index + 1}`,
                    summary,
                    description: uc.description || summary,
                    scenario: uc.scenario || { context: '', before: '', after: '', impact: '' },
                    actors: uc.actors,
                    status: uc.status,
                    primaryActor: uc.primaryActor,
                    secondaryActors: uc.secondaryActors,
                    trigger: uc.trigger,
                    preconditions: uc.preconditions,
                    postconditions: uc.postconditions,
                    mainFlow: uc.mainFlow,
                    alternativeFlows: uc.alternativeFlows,
                    exceptionFlows: uc.exceptionFlows,
                    businessRules: uc.businessRules,
                    relatedRequirements: uc.relatedRequirements,
                    relatedEpic: uc.relatedEpic,
                    relatedStories: uc.relatedStories,
                    sourceDocument: uc.sourceDocument,
                    notes: uc.notes
                });
            });
        }

        return {
            id: epicData.id || `EPIC-${Date.now()}`,
            title: epicData.title || 'Untitled Epic',
            goal: epicData.goal || epicData.description || '',
            valueDelivered: epicData.valueDelivered,
            functionalRequirements: epicData.functionalRequirements || [],
            nonFunctionalRequirements: epicData.nonFunctionalRequirements || [],
            additionalRequirements: epicData.additionalRequirements || [],
            status: this.mapStatus(epicData.status),
            stories,
            priority: epicData.priority,
            storyCount: epicData.storyCount,
            dependencies: epicData.dependencies,
            epicDependencies: epicData.epicDependencies,
            effortEstimate: epicData.effortEstimate,
            implementationNotes: epicData.implementationNotes,
            acceptanceSummary: epicData.acceptanceSummary,
            // Verbose fields
            useCases,
            fitCriteria: epicData.fitCriteria,
            successMetrics: epicData.successMetrics,
            // Schema $ref wraps risks as {risks: [{risk, mitigation}]} — unwrap to flat Risk[]
            risks: Array.isArray(epicData.risks)
                ? epicData.risks
                : Array.isArray(epicData.risks?.risks)
                    ? epicData.risks.risks
                    : epicData.risks,
            // Schema $ref wraps DoD as {items: [{item}]} — unwrap to string[]
            definitionOfDone: Array.isArray(epicData.definitionOfDone)
                ? epicData.definitionOfDone
                : Array.isArray(epicData.definitionOfDone?.items)
                    ? epicData.definitionOfDone.items.map((i: any) => typeof i === 'string' ? i : i.item || '')
                    : epicData.definitionOfDone,
            technicalSummary: epicData.technicalSummary,
            testStrategy: epicData.testStrategy
        };
    }

    /**
     * Map story from schema format to internal Story type
     */
    private mapSchemaStoryToInternal(storyData: any): Story | null {
        if (!storyData) return null;

        // Map acceptance criteria — supports both GWT and prose formats
        const acceptanceCriteria: AcceptanceCriterion[] = [];
        if (storyData.acceptanceCriteria && Array.isArray(storyData.acceptanceCriteria)) {
            for (const ac of storyData.acceptanceCriteria) {
                if (ac.criterion) {
                    // Prose format
                    acceptanceCriteria.push({
                        id: ac.id,
                        criterion: ac.criterion
                    });
                } else {
                    // GWT format
                    acceptanceCriteria.push({
                        id: ac.id,
                        given: ac.given || '',
                        when: ac.when || '',
                        then: ac.then || '',
                        and: ac.and || []
                    });
                }
            }
        }

        // Handle user story format
        let userStory = storyData.userStory;
        if (!userStory || typeof userStory === 'string') {
            // Try to parse from formatted string or create default
            userStory = {
                asA: 'user',
                iWant: storyData.title || 'accomplish a task',
                soThat: 'I can achieve my goal'
            };
        }

        return {
            id: storyData.id || `STORY-${Date.now()}`,
            title: storyData.title || 'Untitled Story',
            userStory: {
                asA: userStory.asA || 'user',
                iWant: userStory.iWant || storyData.title || '',
                soThat: userStory.soThat || ''
            },
            acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : [{
                given: 'the feature is implemented',
                when: 'the user uses it',
                then: 'it works as expected'
            }],
            technicalNotes: storyData.technicalNotes,
            status: this.mapStatus(storyData.status),
            storyPoints: storyData.storyPoints,
            priority: storyData.priority,
            estimatedEffort: storyData.estimatedEffort,
            storyFormat: storyData.storyFormat,
            background: storyData.background,
            problemStatement: storyData.problemStatement,
            proposedSolution: storyData.proposedSolution,
            solutionDetails: storyData.solutionDetails,
            implementationDetails: storyData.implementationDetails,
            definitionOfDone: storyData.definitionOfDone,
            requirementRefs: storyData.requirementRefs,
            uxReferences: storyData.uxReferences,
            references: storyData.references,
            notes: storyData.notes,
            dependencies: storyData.dependencies,
            tasks: storyData.tasks,
            devNotes: storyData.devNotes,
            devAgentRecord: storyData.devAgentRecord,
            history: storyData.history,
            labels: storyData.labels,
            assignee: storyData.assignee,
            reviewer: storyData.reviewer
        };
    }

    /**
     * Map status string to valid status enum
     */
    private mapStatus(status: string | undefined): 'draft' | 'ready' | 'in-progress' | 'done' {
        if (!status) return 'draft';
        const normalized = status.toLowerCase();
        if (normalized === 'ready' || normalized === 'approved') return 'ready';
        if (normalized === 'in-progress' || normalized === 'in_progress') return 'in-progress';
        if (normalized === 'done' || normalized === 'complete' || normalized === 'completed') return 'done';
        return 'draft';
    }

    /**
     * Map functional requirement from schema
     */
    private mapSchemaRequirement(fr: any): FunctionalRequirement {
        return {
            id: fr.id || '',
            title: fr.title || '',
            description: fr.description || '',
            capabilityArea: fr.capabilityArea,
            relatedEpics: fr.relatedEpics || [],
            relatedStories: fr.relatedStories || [],
            priority: fr.priority,
            status: fr.status,
            type: fr.type,
            rationale: fr.rationale,
            source: fr.source,
            metrics: fr.metrics,
            verificationMethod: fr.verificationMethod,
            verificationNotes: fr.verificationNotes,
            acceptanceCriteria: fr.acceptanceCriteria,
            dependencies: fr.dependencies,
            implementationNotes: fr.implementationNotes,
            notes: fr.notes
        };
    }

    /**
     * Map non-functional requirement from schema
     */
    private mapSchemaNonFunctionalRequirement(nfr: any): NonFunctionalRequirement {
        return {
            id: nfr.id || '',
            title: nfr.title || '',
            description: nfr.description || '',
            category: nfr.category || '',
            metrics: nfr.metrics
        };
    }

    /**
     * Map additional requirement from schema
     */
    private mapSchemaAdditionalRequirement(ar: any): AdditionalRequirement {
        return {
            id: ar.id || '',
            title: ar.title || '',
            description: ar.description || '',
            category: ar.category || ''
        };
    }
    /**
     * Sync current state to files.
     *
     * Sets `_syncingUntil` before any writes begin so the file watcher in
     * extension.ts can call `isSyncing()` to suppress false "external change"
     * notifications caused by our own writes.  After all writes finish (or
     * fail) a short grace period covers file-watcher debounce.
     *
     * Each artifact write is wrapped in its own try/catch so a single failure
     * does not abort the remaining saves.  Errors are collected and logged.
     */

    // ─────────────────────────────────────────────────────────────────────
    //  fixAndSyncToFiles — schema-aware repair + re-write
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Read every JSON file from the source folder, apply targeted
     * schema-conformance repairs, write repaired files back to disk,
     * then run the normal `syncToFiles()` pass so that any artifacts
     * that only exist in memory (e.g. use-cases embedded in epics) also
     * get their own properly-structured files.
     *
     * Repairs applied per file:
     *   • Ensure `metadata.timestamps.created` exists (all types with metadata)
     *   • Strip properties not allowed by `additionalProperties: false`
     *   • product-brief / vision: add empty `content.vision` if missing;
     *     coerce `targetUsers` string items to `{ persona: string }` objects
     *   • use-case: ensure `id`, `title`, `summary` exist at root;
     *     normalise UC ID to `^UC-[0-9]+$`
     *   • epics: wrap bare data in `{ metadata, content }` if missing
     *   • story: strip unknown metadata fields
     */
    async fixAndSyncToFiles(): Promise<void> {
        acOutput.appendLine('[ArtifactStore] fixAndSyncToFiles: starting schema-aware repair pass');
        const sourceFolder = this.sourceFolder;
        if (!sourceFolder) {
            acOutput.appendLine('[ArtifactStore] fixAndSyncToFiles: no sourceFolder — falling back to plain syncToFiles');
            this._dirty = true; // Force sync even if not otherwise dirty
            await this.syncToFiles();
            return;
        }

        // Mark syncing to suppress file-watcher
        this._syncingUntil = Date.now() + 60_000;

        try {
            const allJsonFiles = await this.findAllJsonFiles(sourceFolder);
            acOutput.appendLine(`[ArtifactStore] fixAndSyncToFiles: found ${allJsonFiles.length} JSON files`);

            let repaired = 0;
            for (const fileUri of allJsonFiles) {
                try {
                    const raw = await vscode.workspace.fs.readFile(fileUri);
                    const data = JSON.parse(Buffer.from(raw).toString('utf-8'));
                    const fileName = fileUri.path.split('/').pop() || '';
                    const artifactType = data.metadata?.artifactType || this.detectArtifactType(data, fileName);

                    if (!artifactType || artifactType === 'unknown') continue;

                    // Validate before repair — skip files that are already valid
                    if (schemaValidator.isInitialized()) {
                        const pre = schemaValidator.validate(artifactType, data);
                        if (pre.valid) continue;
                    }

                    const fixed = this.repairArtifactData(data, artifactType, fileName);
                    if (fixed !== data) {
                        await vscode.workspace.fs.writeFile(
                            fileUri,
                            Buffer.from(JSON.stringify(fixed, null, 2), 'utf-8')
                        );
                        repaired++;
                        acOutput.appendLine(`[ArtifactStore] fixAndSyncToFiles: repaired ${fileName}`);
                    }
                } catch (e) {
                    acOutput.appendLine(`[ArtifactStore] fixAndSyncToFiles: error repairing ${fileUri.fsPath}: ${e}`);
                }
            }

            acOutput.appendLine(`[ArtifactStore] fixAndSyncToFiles: repaired ${repaired}/${allJsonFiles.length} files`);

            // NOTE: We intentionally do NOT call syncToFiles() here.
            // syncToFiles() re-serialises from in-memory state which may still
            // contain the unrepaired data, overwriting our on-disk fixes.
            // The message handler will reload from folder after this method
            // returns, which picks up the repaired files.

        } finally {
            this._syncingUntil = Date.now() + 500;
        }
    }

    /**
     * Apply targeted schema-conformance repairs to an artifact's raw JSON data.
     * Returns a new object if changes were made, or the original object if no
     * repairs were needed.
     */
    private repairArtifactData(
        data: Record<string, any>,
        artifactType: string,
        fileName: string
    ): Record<string, any> {
        // Guard against null/undefined/non-object input (e.g. corrupted JSON files)
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return data;
        }

        // Work on a deep copy so we don't mutate the caller's reference
        const d = JSON.parse(JSON.stringify(data));
        let changed = false;

        // ── 0) Schema-driven automatic repair ──
        // Walk the schema tree and fix type mismatches, missing required fields,
        // extra properties, invalid enums, min/max violations, etc.
        // Runs BEFORE the hardcoded per-type repairs so they can override.
        if (schemaValidator.isInitialized()) {
            const rawSchema = schemaValidator.getRawSchema(artifactType);
            if (rawSchema) {
                const result = repairDataWithSchema(d, rawSchema);
                if (result.changed) {
                    changed = true;
                    for (const r of result.repairs) {
                        acOutput.appendLine(
                            `[ArtifactStore] schema-repair: ${r} in ${fileName}`
                        );
                    }
                }
            }
        }

        // ── 1) Ensure { metadata, content } wrapper for types that require it ──
        const wrappedTypes = new Set([
            'product-brief', 'vision', 'prd', 'architecture', 'epics', 'epic',
            'story', 'research', 'ux-design', 'readiness-report', 'sprint-status',
            'retrospective', 'change-proposal', 'code-review', 'tech-spec',
            'project-overview', 'project-context',
            'test-design', 'test-design-qa', 'test-design-architecture',
            'traceability-matrix', 'test-review', 'nfr-assessment',
            'test-framework', 'ci-pipeline', 'automation-summary', 'atdd-checklist',
            'storytelling', 'problem-solving', 'innovation-strategy', 'design-thinking',
            'risks', 'definition-of-done', 'fit-criteria', 'success-metrics',
        ]);

        // Use-cases have a FLAT schema (no metadata/content wrapper)
        const flatTypes = new Set(['use-case']);

        if (wrappedTypes.has(artifactType) && !d.metadata && !d.content) {
            // File is bare data without wrapper — wrap it, then continue
            // through the remaining repair steps (do NOT early-return).
            const now = new Date().toISOString();
            const contentCopy = { ...d };
            // Clear all keys on d, then set metadata + content
            for (const key of Object.keys(d)) {
                delete d[key];
            }
            d.metadata = {
                schemaVersion: '1.0.0',
                artifactType: artifactType,
                workflowName: 'bmad-studio',
                timestamps: { created: now, lastModified: now },
                status: contentCopy.status || 'draft',
            };
            // Remove status from content since it's in metadata
            delete contentCopy.status;
            d.content = contentCopy;
            changed = true;
        }

        // ── 2) Fix metadata.timestamps ──
        if (d.metadata && typeof d.metadata === 'object') {
            if (!d.metadata.timestamps) {
                const now = new Date().toISOString();
                d.metadata.timestamps = { created: now, lastModified: now };
                changed = true;
            } else if (!d.metadata.timestamps.created) {
                d.metadata.timestamps.created = new Date().toISOString();
                changed = true;
            }

            // Ensure required metadata fields
            if (!d.metadata.schemaVersion) {
                d.metadata.schemaVersion = '1.0.0';
                changed = true;
            }
            if (!d.metadata.artifactType) {
                d.metadata.artifactType = artifactType;
                changed = true;
            }

            // Strip unknown metadata properties (additionalProperties: false)
            const allowedMetadataKeys = new Set([
                'schemaVersion', 'artifactType', 'workflowName', 'workflowVersion',
                'projectName', 'stepsCompleted', 'currentStep', 'inputDocuments',
                'timestamps', 'author', 'status', 'tags', 'customFields',
            ]);
            for (const key of Object.keys(d.metadata)) {
                if (!allowedMetadataKeys.has(key)) {
                    delete d.metadata[key];
                    changed = true;
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: stripped metadata.${key} from ${fileName}`
                    );
                }
            }
        }

        // ── 3) Product-brief / vision specific repairs ──
        if ((artifactType === 'product-brief' || artifactType === 'vision') && d.content) {
            // Ensure content.vision exists (required by schema)
            if (!d.content.vision) {
                d.content.vision = {};
                changed = true;
                acOutput.appendLine(
                    `[ArtifactStore] fixAndSyncToFiles: added empty content.vision to ${fileName}`
                );
            }

            // Move stray content fields into content.vision where they belong
            if (d.content.problemStatement && !d.content.vision.problemStatement) {
                d.content.vision.problemStatement = d.content.problemStatement;
                changed = true;
            }
            if (d.content.valueProposition && !d.content.vision.uniqueValueProposition) {
                d.content.vision.uniqueValueProposition = d.content.valueProposition;
                changed = true;
            }

            // Rename successCriteria to successMetrics (schema uses successMetrics)
            if (d.content.successCriteria && !d.content.successMetrics) {
                d.content.successMetrics = Array.isArray(d.content.successCriteria)
                    ? d.content.successCriteria.map((c: any) =>
                        typeof c === 'string' ? { metric: c, description: c } : c
                    )
                    : d.content.successCriteria;
                changed = true;
            }

            // Ensure content.productName exists (required by schema)
            if (!d.content.productName) {
                d.content.productName = d.metadata?.projectName || '';
                changed = true;
            }

            // Coerce targetUsers strings to { persona, description } objects
            if (Array.isArray(d.content.targetUsers)) {
                const users = d.content.targetUsers;
                let coerced = false;
                for (let i = 0; i < users.length; i++) {
                    if (typeof users[i] === 'string') {
                        users[i] = { persona: users[i], description: '' };
                        coerced = true;
                    }
                }
                if (coerced) {
                    changed = true;
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: coerced targetUsers strings to objects in ${fileName}`
                    );
                }
            }

            // Strip extra root properties (additionalProperties: false at root)
            const allowedRootKeys = new Set(['metadata', 'content']);
            for (const key of Object.keys(d)) {
                if (!allowedRootKeys.has(key)) {
                    delete d[key];
                    changed = true;
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: stripped root.${key} from ${fileName}`
                    );
                }
            }

            // Strip extra content properties (additionalProperties: false on content)
            const allowedContentKeys = new Set([
                'productName', 'tagline', 'version', 'status', 'vision',
                'targetUsers', 'marketContext', 'successMetrics', 'scope',
                'keyFeatures', 'constraints', 'assumptions', 'risks',
                'dependencies', 'timeline', 'stakeholders', 'additionalContext',
            ]);
            for (const key of Object.keys(d.content)) {
                if (!allowedContentKeys.has(key)) {
                    delete d.content[key];
                    changed = true;
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: stripped content.${key} from ${fileName}`
                    );
                }
            }
        }

        // ── 3b) PRD specific repairs (M1) ──
        if (artifactType === 'prd' && d.content) {
            // Ensure required content fields exist
            if (!d.content.productOverview) {
                d.content.productOverview = {};
                changed = true;
                acOutput.appendLine(
                    `[ArtifactStore] fixAndSyncToFiles: added empty content.productOverview to ${fileName}`
                );
            }
            if (!d.content.requirements) {
                d.content.requirements = {};
                changed = true;
                acOutput.appendLine(
                    `[ArtifactStore] fixAndSyncToFiles: added empty content.requirements to ${fileName}`
                );
            }

            // Strip extra root properties (additionalProperties: false at root)
            const allowedRootKeys = new Set(['metadata', 'content']);
            for (const key of Object.keys(d)) {
                if (!allowedRootKeys.has(key)) {
                    delete d[key];
                    changed = true;
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: stripped root.${key} from ${fileName}`
                    );
                }
            }

            // Strip extra content properties (additionalProperties: false on content)
            const allowedContentKeys = new Set([
                'productOverview', 'projectType', 'userPersonas', 'successCriteria',
                'userJourneys', 'domainModel', 'requirements', 'scope',
                'constraints', 'risks', 'timeline', 'appendices', 'approvals',
            ]);
            for (const key of Object.keys(d.content)) {
                if (!allowedContentKeys.has(key)) {
                    delete d.content[key];
                    changed = true;
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: stripped content.${key} from PRD ${fileName}`
                    );
                }
            }
        }

        // ── 3c) Architecture specific repairs (M2) ──
        if (artifactType === 'architecture' && d.content) {
            // Ensure required content fields exist
            if (!d.content.overview) {
                d.content.overview = {};
                changed = true;
                acOutput.appendLine(
                    `[ArtifactStore] fixAndSyncToFiles: added empty content.overview to ${fileName}`
                );
            }
            if (!d.content.decisions) {
                d.content.decisions = [];
                changed = true;
                acOutput.appendLine(
                    `[ArtifactStore] fixAndSyncToFiles: added empty content.decisions to ${fileName}`
                );
            }

            // Strip extra root properties
            const allowedRootKeys = new Set(['metadata', 'content']);
            for (const key of Object.keys(d)) {
                if (!allowedRootKeys.has(key)) {
                    delete d[key];
                    changed = true;
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: stripped root.${key} from ${fileName}`
                    );
                }
            }

            // Strip extra content properties (additionalProperties: false on content)
            const allowedContentKeys = new Set([
                'overview', 'context', 'techStack', 'decisions', 'patterns',
                'systemComponents', 'projectStructure', 'dataFlow', 'security',
                'scalability', 'reliability', 'observability', 'deployment',
                'integrations', 'validation', 'implementationNotes', 'references',
            ]);
            for (const key of Object.keys(d.content)) {
                if (!allowedContentKeys.has(key)) {
                    delete d.content[key];
                    changed = true;
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: stripped content.${key} from architecture ${fileName}`
                    );
                }
            }
        }

        // ── 3d) Test-design / test-strategy / test-cases specific repairs (M3) ──
        if ((artifactType === 'test-design' || artifactType === 'test-design-qa'
            || artifactType === 'test-design-architecture'
            || artifactType === 'test-strategy' || artifactType === 'test-cases'
            || artifactType === 'test-case') && d.content) {
            // All test design variants share the same schema structure
            // Ensure required content fields exist
            if (!d.content.summary) {
                d.content.summary = {};
                changed = true;
                acOutput.appendLine(
                    `[ArtifactStore] fixAndSyncToFiles: added empty content.summary to ${fileName}`
                );
            }
            if (!d.content.coveragePlan) {
                d.content.coveragePlan = {};
                changed = true;
                acOutput.appendLine(
                    `[ArtifactStore] fixAndSyncToFiles: added empty content.coveragePlan to ${fileName}`
                );
            }

            // Strip extra root properties
            const allowedRootKeys = new Set(['metadata', 'content']);
            for (const key of Object.keys(d)) {
                if (!allowedRootKeys.has(key)) {
                    delete d[key];
                    changed = true;
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: stripped root.${key} from ${fileName}`
                    );
                }
            }

            // Strip extra content properties (additionalProperties: false on content)
            const allowedContentKeys = new Set([
                'epicInfo', 'summary', 'notInScope', 'riskAssessment',
                'entryExitCriteria', 'projectTeam', 'coveragePlan', 'testCases',
                'executionOrder', 'testEnvironment', 'resourceEstimates',
                'qualityGateCriteria', 'mitigationPlans', 'assumptionsAndDependencies',
                'defectManagement', 'approval', 'appendices',
            ]);
            for (const key of Object.keys(d.content)) {
                if (!allowedContentKeys.has(key)) {
                    delete d.content[key];
                    changed = true;
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: stripped content.${key} from test artifact ${fileName}`
                    );
                }
            }

            // ── 3e) Coerce invalid enum values in test-design fields ──
            // summary.testLevels[].level must be one of:
            const VALID_SUMMARY_LEVELS = new Set([
                'unit', 'integration', 'component', 'api', 'e2e', 'performance', 'security'
            ]);
            // coveragePlan.p0-p3[].testLevel must be one of:
            const VALID_COVERAGE_LEVELS = new Set([
                'unit', 'integration', 'component', 'api', 'e2e', 'manual'
            ]);
            // coveragePlan.p0-p3[].testType must be one of:
            const VALID_TEST_TYPES = new Set([
                'functional', 'regression', 'smoke', 'sanity', 'exploratory'
            ]);

            // Best-effort mapping from common invalid values to valid ones
            const LEVEL_ALIASES: Record<string, string> = {
                'acceptance': 'e2e',
                'end-to-end': 'e2e',
                'endtoend': 'e2e',
                'system': 'e2e',
                'functional': 'e2e',
                'perf': 'performance',
                'load': 'performance',
                'stress': 'performance',
                'sec': 'security',
                'pen': 'security',
                'penetration': 'security',
                'contract': 'api',
                'ui': 'e2e',
                'uat': 'e2e',
            };

            function coerceEnum(
                value: string | undefined,
                allowedSet: Set<string>,
                aliases: Record<string, string>,
                fallback: string
            ): string | undefined {
                if (!value || typeof value !== 'string') return value;
                const lower = value.toLowerCase().trim();
                if (allowedSet.has(lower)) return lower;
                if (aliases[lower]) return aliases[lower];
                return fallback;
            }

            // Repair summary.testLevels[].level
            if (Array.isArray(d.content.summary?.testLevels)) {
                for (const item of d.content.summary.testLevels) {
                    if (item && typeof item === 'object' && item.level) {
                        const coerced = coerceEnum(item.level, VALID_SUMMARY_LEVELS, LEVEL_ALIASES, 'e2e');
                        if (coerced !== item.level) {
                            acOutput.appendLine(
                                `[ArtifactStore] fixAndSyncToFiles: coerced summary.testLevels[].level ` +
                                `"${item.level}" → "${coerced}" in ${fileName}`
                            );
                            item.level = coerced;
                            changed = true;
                        }
                    }
                }
            }

            // Repair coveragePlan.p0-p3[].testLevel and testType
            if (d.content.coveragePlan && typeof d.content.coveragePlan === 'object') {
                for (const pKey of ['p0', 'p1', 'p2', 'p3']) {
                    const items = d.content.coveragePlan[pKey];
                    if (!Array.isArray(items)) continue;
                    for (const item of items) {
                        if (!item || typeof item !== 'object') continue;
                        if (item.testLevel) {
                            const coerced = coerceEnum(item.testLevel, VALID_COVERAGE_LEVELS, LEVEL_ALIASES, 'e2e');
                            if (coerced !== item.testLevel) {
                                acOutput.appendLine(
                                    `[ArtifactStore] fixAndSyncToFiles: coerced coveragePlan.${pKey}[].testLevel ` +
                                    `"${item.testLevel}" → "${coerced}" in ${fileName}`
                                );
                                item.testLevel = coerced;
                                changed = true;
                            }
                        }
                        if (item.testType) {
                            const coerced = coerceEnum(item.testType, VALID_TEST_TYPES, {
                                'integration': 'functional',
                                'unit': 'functional',
                                'e2e': 'functional',
                                'acceptance': 'functional',
                                'performance': 'functional',
                                'security': 'functional',
                                'negative': 'functional',
                                'positive': 'functional',
                                'boundary': 'functional',
                                'edge-case': 'exploratory',
                            }, 'functional');
                            if (coerced !== item.testType) {
                                acOutput.appendLine(
                                    `[ArtifactStore] fixAndSyncToFiles: coerced coveragePlan.${pKey}[].testType ` +
                                    `"${item.testType}" → "${coerced}" in ${fileName}`
                                );
                                item.testType = coerced;
                                changed = true;
                            }
                        }
                    }
                }
            }
        }

        // ── 3e) Test-review specific enum coercion ──
        if (artifactType === 'test-review' && d.content) {
            // Helper to coerce a string value to a valid enum member
            function coerceReviewEnum(
                value: string | undefined,
                allowedSet: Set<string>,
                aliases: Record<string, string>,
                fallback: string
            ): string | undefined {
                if (!value || typeof value !== 'string') return value;
                const lower = value.toLowerCase().trim();
                if (allowedSet.has(lower)) return lower;
                if (aliases[lower]) return aliases[lower];
                return fallback;
            }

            // criticalIssues[].priority: ["immediate", "before-release", "next-sprint"]
            const VALID_ISSUE_PRIORITY = new Set(['immediate', 'before-release', 'next-sprint']);
            const ISSUE_PRIORITY_ALIASES: Record<string, string> = {
                'critical': 'immediate',
                'blocker': 'immediate',
                'p0': 'immediate',
                'urgent': 'immediate',
                'high': 'before-release',
                'p1': 'before-release',
                'important': 'before-release',
                'medium': 'next-sprint',
                'low': 'next-sprint',
                'p2': 'next-sprint',
                'p3': 'next-sprint',
                'minor': 'next-sprint',
            };

            // criticalIssues[].effort and recommendations[].effort: ["trivial", "small", "medium", "large"]
            const VALID_EFFORT = new Set(['trivial', 'small', 'medium', 'large']);
            const EFFORT_ALIASES: Record<string, string> = {
                'tiny': 'trivial',
                'minimal': 'trivial',
                'low': 'small',
                'minor': 'small',
                'moderate': 'medium',
                'significant': 'large',
                'high': 'large',
                'major': 'large',
                'xl': 'large',
            };

            // recommendations[].priority: ["high", "medium", "low"]
            const VALID_REC_PRIORITY = new Set(['high', 'medium', 'low']);
            const REC_PRIORITY_ALIASES: Record<string, string> = {
                'critical': 'high',
                'immediate': 'high',
                'urgent': 'high',
                'p0': 'high',
                'p1': 'high',
                'important': 'medium',
                'normal': 'medium',
                'p2': 'medium',
                'minor': 'low',
                'p3': 'low',
                'trivial': 'low',
            };

            // recommendations[].category
            const VALID_CATEGORY = new Set(['maintainability', 'performance', 'reliability', 'coverage', 'readability', 'best-practice']);
            const CATEGORY_ALIASES: Record<string, string> = {
                'maintenance': 'maintainability',
                'speed': 'performance',
                'stability': 'reliability',
                'robustness': 'reliability',
                'test-coverage': 'coverage',
                'testing': 'coverage',
                'clarity': 'readability',
                'code-quality': 'readability',
                'bestpractice': 'best-practice',
                'best_practice': 'best-practice',
                'practice': 'best-practice',
                'quality': 'maintainability',
            };

            // reviewInfo.reviewType: ["initial", "follow-up", "regression", "pre-release", "post-incident"]
            const VALID_REVIEW_TYPE = new Set(['initial', 'follow-up', 'regression', 'pre-release', 'post-incident']);
            const REVIEW_TYPE_ALIASES: Record<string, string> = {
                'first': 'initial',
                'new': 'initial',
                'followup': 'follow-up',
                'follow_up': 'follow-up',
                'prerelease': 'pre-release',
                'pre_release': 'pre-release',
                'release': 'pre-release',
                'postincident': 'post-incident',
                'post_incident': 'post-incident',
                'incident': 'post-incident',
            };

            // executiveSummary.recommendation & decision.verdict: ["approve", "approve-with-comments", "request-changes", "block"]
            const VALID_VERDICT = new Set(['approve', 'approve-with-comments', 'request-changes', 'block']);
            const VERDICT_ALIASES: Record<string, string> = {
                'approved': 'approve',
                'pass': 'approve',
                'lgtm': 'approve',
                'approve-with-comment': 'approve-with-comments',
                'approved-with-comments': 'approve-with-comments',
                'conditional': 'approve-with-comments',
                'request-change': 'request-changes',
                'changes-requested': 'request-changes',
                'needs-work': 'request-changes',
                'reject': 'block',
                'rejected': 'block',
                'blocked': 'block',
                'fail': 'block',
            };

            // executiveSummary.riskLevel: ["low", "medium", "high", "critical"]
            const VALID_RISK_LEVEL = new Set(['low', 'medium', 'high', 'critical']);
            const RISK_LEVEL_ALIASES: Record<string, string> = {
                'none': 'low',
                'minimal': 'low',
                'moderate': 'medium',
                'severe': 'critical',
                'blocker': 'critical',
            };

            // Repair criticalIssues[].priority and effort
            if (Array.isArray(d.content.criticalIssues)) {
                for (const item of d.content.criticalIssues) {
                    if (!item || typeof item !== 'object') continue;
                    if (item.priority) {
                        const coerced = coerceReviewEnum(item.priority, VALID_ISSUE_PRIORITY, ISSUE_PRIORITY_ALIASES, 'before-release');
                        if (coerced !== item.priority) {
                            acOutput.appendLine(
                                `[ArtifactStore] fixAndSyncToFiles: coerced criticalIssues[].priority ` +
                                `"${item.priority}" → "${coerced}" in ${fileName}`
                            );
                            item.priority = coerced;
                            changed = true;
                        }
                    }
                    if (item.effort) {
                        const coerced = coerceReviewEnum(item.effort, VALID_EFFORT, EFFORT_ALIASES, 'medium');
                        if (coerced !== item.effort) {
                            acOutput.appendLine(
                                `[ArtifactStore] fixAndSyncToFiles: coerced criticalIssues[].effort ` +
                                `"${item.effort}" → "${coerced}" in ${fileName}`
                            );
                            item.effort = coerced;
                            changed = true;
                        }
                    }
                }
            }

            // Repair recommendations[].priority, effort, and category
            if (Array.isArray(d.content.recommendations)) {
                for (const item of d.content.recommendations) {
                    if (!item || typeof item !== 'object') continue;
                    if (item.priority) {
                        const coerced = coerceReviewEnum(item.priority, VALID_REC_PRIORITY, REC_PRIORITY_ALIASES, 'medium');
                        if (coerced !== item.priority) {
                            acOutput.appendLine(
                                `[ArtifactStore] fixAndSyncToFiles: coerced recommendations[].priority ` +
                                `"${item.priority}" → "${coerced}" in ${fileName}`
                            );
                            item.priority = coerced;
                            changed = true;
                        }
                    }
                    if (item.effort) {
                        const coerced = coerceReviewEnum(item.effort, VALID_EFFORT, EFFORT_ALIASES, 'medium');
                        if (coerced !== item.effort) {
                            acOutput.appendLine(
                                `[ArtifactStore] fixAndSyncToFiles: coerced recommendations[].effort ` +
                                `"${item.effort}" → "${coerced}" in ${fileName}`
                            );
                            item.effort = coerced;
                            changed = true;
                        }
                    }
                    if (item.category) {
                        const coerced = coerceReviewEnum(item.category, VALID_CATEGORY, CATEGORY_ALIASES, 'best-practice');
                        if (coerced !== item.category) {
                            acOutput.appendLine(
                                `[ArtifactStore] fixAndSyncToFiles: coerced recommendations[].category ` +
                                `"${item.category}" → "${coerced}" in ${fileName}`
                            );
                            item.category = coerced;
                            changed = true;
                        }
                    }
                }
            }

            // Repair reviewInfo.reviewType
            if (d.content.reviewInfo?.reviewType) {
                const coerced = coerceReviewEnum(d.content.reviewInfo.reviewType, VALID_REVIEW_TYPE, REVIEW_TYPE_ALIASES, 'initial');
                if (coerced !== d.content.reviewInfo.reviewType) {
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: coerced reviewInfo.reviewType ` +
                        `"${d.content.reviewInfo.reviewType}" → "${coerced}" in ${fileName}`
                    );
                    d.content.reviewInfo.reviewType = coerced;
                    changed = true;
                }
            }

            // Repair executiveSummary.recommendation
            if (d.content.executiveSummary?.recommendation) {
                const coerced = coerceReviewEnum(d.content.executiveSummary.recommendation, VALID_VERDICT, VERDICT_ALIASES, 'approve-with-comments');
                if (coerced !== d.content.executiveSummary.recommendation) {
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: coerced executiveSummary.recommendation ` +
                        `"${d.content.executiveSummary.recommendation}" → "${coerced}" in ${fileName}`
                    );
                    d.content.executiveSummary.recommendation = coerced;
                    changed = true;
                }
            }

            // Repair executiveSummary.riskLevel
            if (d.content.executiveSummary?.riskLevel) {
                const coerced = coerceReviewEnum(d.content.executiveSummary.riskLevel, VALID_RISK_LEVEL, RISK_LEVEL_ALIASES, 'medium');
                if (coerced !== d.content.executiveSummary.riskLevel) {
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: coerced executiveSummary.riskLevel ` +
                        `"${d.content.executiveSummary.riskLevel}" → "${coerced}" in ${fileName}`
                    );
                    d.content.executiveSummary.riskLevel = coerced;
                    changed = true;
                }
            }

            // Repair decision.verdict
            if (d.content.decision?.verdict) {
                const coerced = coerceReviewEnum(d.content.decision.verdict, VALID_VERDICT, VERDICT_ALIASES, 'approve-with-comments');
                if (coerced !== d.content.decision.verdict) {
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: coerced decision.verdict ` +
                        `"${d.content.decision.verdict}" → "${coerced}" in ${fileName}`
                    );
                    d.content.decision.verdict = coerced;
                    changed = true;
                }
            }
        }

        // ── 4) Use-case specific repairs ──
        if (flatTypes.has(artifactType)) {
            // Use-case schema: { id, title, summary, ... } at root — NO wrapper
            // If the file has a metadata/content wrapper, unwrap it
            if (d.metadata && d.content && typeof d.content === 'object') {
                const unwrapped = { ...d.content };
                // Clear all keys on d first to avoid orphan properties
                for (const key of Object.keys(d)) {
                    delete d[key];
                }
                // Re-populate with just the unwrapped content
                Object.assign(d, unwrapped);
                changed = true;
            }

            // Ensure required fields: id, title, summary
            if (!d.id) {
                // Try to derive from filename (e.g. "uc-01.json" → "UC-01")
                const match = fileName.match(/uc[_-]?(\d+)/i);
                if (match) {
                    d.id = `UC-${match[1].padStart(2, '0')}`;
                } else {
                    d.id = `UC-${Date.now() % 10000}`;
                }
                changed = true;
            } else {
                // Normalise ID to match pattern ^UC-[0-9]+$
                // Handles: UC_01, UC01, UC-1-1, UC-01-configure-qa, etc.
                const ucMatch = d.id.match(/^UC[_-]?(\d+)/i);
                if (ucMatch) {
                    const normalised = `UC-${ucMatch[1].padStart(2, '0')}`;
                    if (d.id !== normalised) {
                        d.id = normalised;
                        changed = true;
                    }
                }
            }

            if (!d.title) {
                d.title = d.scenario?.context || d.summary || `Use Case ${d.id}`;
                changed = true;
            }
            if (!d.summary) {
                d.summary = d.title || '';
                changed = true;
            }
        }

        // ── 5) Epics specific repairs ──
        if ((artifactType === 'epics' || artifactType === 'epic') && d.metadata && d.content) {
            // Strip extra root properties
            const allowedRootKeys = new Set(['metadata', 'content']);
            for (const key of Object.keys(d)) {
                if (!allowedRootKeys.has(key)) {
                    delete d[key];
                    changed = true;
                }
            }

            // Ensure content.epics exists (required)
            if (!d.content.epics && Array.isArray(d.content)) {
                // Content is the array itself — wrap it
                d.content = { epics: d.content };
                changed = true;
            } else if (!d.content.epics) {
                // Content is an object but missing the required epics array
                d.content.epics = [];
                changed = true;
                acOutput.appendLine(
                    `[ArtifactStore] fixAndSyncToFiles: added empty content.epics to ${fileName}`
                );
            }

            // Strip extra content properties (additionalProperties: false)
            // Allowed: overview, requirementsInventory, coverageMap, epics, dependencies, summary
            const allowedContentKeys = new Set([
                'overview', 'requirementsInventory', 'coverageMap',
                'epics', 'dependencies', 'summary',
            ]);
            for (const key of Object.keys(d.content)) {
                if (!allowedContentKeys.has(key)) {
                    delete d.content[key];
                    changed = true;
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: stripped content.${key} from ${fileName}`
                    );
                }
            }

            // Fix use-case IDs inside epics
            if (Array.isArray(d.content.epics)) {
                for (const epic of d.content.epics) {
                    if (Array.isArray(epic.useCases)) {
                        for (const uc of epic.useCases) {
                            if (uc.id) {
                                // Handles: UC_01, UC01, UC-1-1, UC-01-configure-qa, etc.
                                const ucMatch = uc.id.match(/^UC[_-]?(\d+)/i);
                                if (ucMatch) {
                                    const normalised = `UC-${ucMatch[1].padStart(2, '0')}`;
                                    if (uc.id !== normalised) {
                                        uc.id = normalised;
                                        changed = true;
                                    }
                                }
                            }
                            // Ensure title and summary on embedded use-cases
                            if (!uc.title && uc.scenario?.context) {
                                uc.title = uc.scenario.context;
                                changed = true;
                            }
                            if (!uc.summary && uc.title) {
                                uc.summary = uc.title;
                                changed = true;
                            }
                        }
                    }
                }
            }
        }

        // ── 6) Story specific repairs ──
        if (artifactType === 'story' && d.metadata && d.content) {
            // Strip extra root properties
            const allowedRootKeys = new Set(['metadata', 'content']);
            for (const key of Object.keys(d)) {
                if (!allowedRootKeys.has(key)) {
                    delete d[key];
                    changed = true;
                }
            }

            // Ensure content.title (required by schema)
            if (!d.content.title) {
                d.content.title = d.content.userStory
                    || d.content.storyId
                    || d.metadata?.artifactType
                    || 'Untitled Story';
                changed = true;
                acOutput.appendLine(
                    `[ArtifactStore] fixAndSyncToFiles: added missing content.title to ${fileName}`
                );
            }
        }

        // ── 7) Generic fallback repair for remaining wrapped types (L1) ──
        // For TEA/BMM/CIS module types that don't have specific repair blocks above,
        // ensure the basic { metadata, content } structure is clean.
        const typesWithSpecificRepairs = new Set([
            'product-brief', 'vision', 'prd', 'architecture',
            'test-design', 'test-design-qa', 'test-design-architecture',
            'test-strategy', 'test-cases', 'test-case',
            'epics', 'epic', 'story',
        ]);
        if (wrappedTypes.has(artifactType) && !typesWithSpecificRepairs.has(artifactType)
            && d.metadata && d.content) {
            // Strip extra root properties (all wrapped types only allow metadata + content)
            const allowedRootKeys = new Set(['metadata', 'content']);
            for (const key of Object.keys(d)) {
                if (!allowedRootKeys.has(key)) {
                    delete d[key];
                    changed = true;
                    acOutput.appendLine(
                        `[ArtifactStore] fixAndSyncToFiles: stripped root.${key} from ${artifactType} ${fileName}`
                    );
                }
            }
        }

        return changed ? d : data;
    }

    async syncToFiles(): Promise<void> {
        console.log('syncToFiles called, sourceFolder:', this.sourceFolder?.fsPath);

        // L4: Skip sync if nothing changed since last write
        if (!this._dirty) {
            console.log('syncToFiles: skipping — no dirty changes');
            return;
        }

        // Mark syncing BEFORE any async writes — generous timeout covers slow disks.
        // The finally block shortens the window once writes are done.
        this._syncingUntil = Date.now() + 60_000;
        this._dirty = false; // Reset early; if sync fails it will be re-dirtied
        
        const errors: string[] = [];

        try {
        const state = this.getState();
        
        // Get base output folder — prefer the folder we loaded from;
        // fall back to the resolver's active output URI.
        let baseUri = this.sourceFolder;
        if (!baseUri) {
            // Lazy import to avoid circular dependency at module level.
            // Wrapped in try/catch because in test environments the require
            // may resolve to a mock that doesn't export getWorkspaceResolver.
            try {
                const { getWorkspaceResolver } = require('../extension');
                const resolver = getWorkspaceResolver();
                baseUri = resolver?.getActiveOutputUri() ?? null;
            } catch {
                // Resolver unavailable (e.g. test environment) — nothing to sync to
            }
        }
        if (!baseUri) return;
        
        // Ensure base folder exists
        try {
            await vscode.workspace.fs.createDirectory(baseUri);
        } catch {
            // Folder might already exist
        }
        
        // Save vision if it exists
        try {
            if (state.vision) {
                await this.saveVisionToFile(state, baseUri);
            } else {
                await this.deleteSourceFile('vision');
            }
        } catch (e) { errors.push(`vision: ${e}`); }

        // Save product brief if it exists
        try {
            if (state.productBrief) {
                await this.saveProductBriefToFile(state, baseUri);
            } else {
                await this.deleteSourceFile('productBrief');
            }
        } catch (e) { errors.push(`productBrief: ${e}`); }

        // Save PRD if it exists
        try {
            if (state.prd) {
                await this.savePRDToFile(state, baseUri);
            } else {
                await this.deleteSourceFile('prd');
            }
        } catch (e) { errors.push(`prd: ${e}`); }

        // Save architecture if it exists
        try {
            if (state.architecture) {
                await this.saveArchitectureToFile(state, baseUri);
            } else {
                await this.deleteSourceFile('architecture');
            }
        } catch (e) { errors.push(`architecture: ${e}`); }
        
        // Save epics if they exist
        try {
            if (state.epics && state.epics.length > 0) {
                await this.saveEpicsToFile(state, baseUri);
            }
        } catch (e) { errors.push(`epics: ${e}`); }

        // Save test cases if they exist
        try {
            if (state.testCases && state.testCases.length > 0) {
                await this.saveTestCasesToFile(state, baseUri);
            } else {
                await this.deleteSourceFile('testCases');
            }
        } catch (e) { errors.push(`testCases: ${e}`); }

        // Save test strategy if it exists
        try {
            if (state.testStrategy) {
                await this.saveTestStrategyToFile(state, baseUri);
            } else {
                await this.deleteSourceFile('testStrategy');
            }
        } catch (e) { errors.push(`testStrategy: ${e}`); }

        // Save test design if it exists
        try {
            if (state.testDesign) {
                await this.saveTestDesignToFile(state, baseUri);
            } else {
                await this.deleteSourceFile('testDesign');
            }
        } catch (e) { errors.push(`testDesign: ${e}`); }

        // ─── TEA module artifacts ───────────────────────────────────────
        try {
            if (state.traceabilityMatrix) {
                await this.saveGenericArtifactToFile('traceabilityMatrix', 'traceability-matrix', state.traceabilityMatrix, state, baseUri);
            } else { await this.deleteSourceFile('traceabilityMatrix'); }
        } catch (e) { errors.push(`traceabilityMatrix: ${e}`); }

        try {
            if (state.testReview) {
                await this.saveGenericArtifactToFile('testReview', 'test-review', state.testReview, state, baseUri);
            } else { await this.deleteSourceFile('testReview'); }
        } catch (e) { errors.push(`testReview: ${e}`); }

        try {
            if (state.nfrAssessment) {
                await this.saveGenericArtifactToFile('nfrAssessment', 'nfr-assessment', state.nfrAssessment, state, baseUri);
            } else { await this.deleteSourceFile('nfrAssessment'); }
        } catch (e) { errors.push(`nfrAssessment: ${e}`); }

        try {
            if (state.testFramework) {
                await this.saveGenericArtifactToFile('testFramework', 'test-framework', state.testFramework, state, baseUri);
            } else { await this.deleteSourceFile('testFramework'); }
        } catch (e) { errors.push(`testFramework: ${e}`); }

        try {
            if (state.ciPipeline) {
                await this.saveGenericArtifactToFile('ciPipeline', 'ci-pipeline', state.ciPipeline, state, baseUri);
            } else { await this.deleteSourceFile('ciPipeline'); }
        } catch (e) { errors.push(`ciPipeline: ${e}`); }

        try {
            if (state.automationSummary) {
                await this.saveGenericArtifactToFile('automationSummary', 'automation-summary', state.automationSummary, state, baseUri);
            } else { await this.deleteSourceFile('automationSummary'); }
        } catch (e) { errors.push(`automationSummary: ${e}`); }

        try {
            if (state.atddChecklist) {
                await this.saveGenericArtifactToFile('atddChecklist', 'atdd-checklist', state.atddChecklist, state, baseUri);
            } else { await this.deleteSourceFile('atddChecklist'); }
        } catch (e) { errors.push(`atddChecklist: ${e}`); }

        // ─── BMM module artifacts ───────────────────────────────────────
        try {
            if (state.research) {
                await this.saveGenericArtifactToFile('research', 'research', state.research, state, baseUri);
            } else { await this.deleteSourceFile('research'); }
        } catch (e) { errors.push(`research: ${e}`); }

        try {
            if (state.uxDesign) {
                await this.saveGenericArtifactToFile('uxDesign', 'ux-design', state.uxDesign, state, baseUri);
            } else { await this.deleteSourceFile('uxDesign'); }
        } catch (e) { errors.push(`uxDesign: ${e}`); }

        try {
            if (state.readinessReport) {
                await this.saveGenericArtifactToFile('readinessReport', 'readiness-report', state.readinessReport, state, baseUri);
            } else { await this.deleteSourceFile('readinessReport'); }
        } catch (e) { errors.push(`readinessReport: ${e}`); }

        try {
            if (state.sprintStatus) {
                await this.saveGenericArtifactToFile('sprintStatus', 'sprint-status', state.sprintStatus, state, baseUri);
            } else { await this.deleteSourceFile('sprintStatus'); }
        } catch (e) { errors.push(`sprintStatus: ${e}`); }

        try {
            if (state.retrospective) {
                await this.saveGenericArtifactToFile('retrospective', 'retrospective', state.retrospective, state, baseUri);
            } else { await this.deleteSourceFile('retrospective'); }
        } catch (e) { errors.push(`retrospective: ${e}`); }

        try {
            if (state.changeProposal) {
                await this.saveGenericArtifactToFile('changeProposal', 'change-proposal', state.changeProposal, state, baseUri);
            } else { await this.deleteSourceFile('changeProposal'); }
        } catch (e) { errors.push(`changeProposal: ${e}`); }

        try {
            if (state.codeReview) {
                await this.saveGenericArtifactToFile('codeReview', 'code-review', state.codeReview, state, baseUri);
            } else { await this.deleteSourceFile('codeReview'); }
        } catch (e) { errors.push(`codeReview: ${e}`); }

        try {
            if (state.risks) {
                await this.saveGenericArtifactToFile('risks', 'risks', state.risks, state, baseUri);
            } else { await this.deleteSourceFile('risks'); }
        } catch (e) { errors.push(`risks: ${e}`); }

        try {
            if (state.definitionOfDone) {
                await this.saveGenericArtifactToFile('definitionOfDone', 'definition-of-done', state.definitionOfDone, state, baseUri);
            } else { await this.deleteSourceFile('definitionOfDone'); }
        } catch (e) { errors.push(`definitionOfDone: ${e}`); }

        try {
            if (state.projectOverview) {
                await this.saveGenericArtifactToFile('projectOverview', 'project-overview', state.projectOverview, state, baseUri);
            } else { await this.deleteSourceFile('projectOverview'); }
        } catch (e) { errors.push(`projectOverview: ${e}`); }

        try {
            if (state.projectContext) {
                await this.saveGenericArtifactToFile('projectContext', 'project-context', state.projectContext, state, baseUri);
            } else { await this.deleteSourceFile('projectContext'); }
        } catch (e) { errors.push(`projectContext: ${e}`); }

        try {
            if (state.techSpec) {
                await this.saveGenericArtifactToFile('techSpec', 'tech-spec', state.techSpec, state, baseUri);
            } else { await this.deleteSourceFile('techSpec'); }
        } catch (e) { errors.push(`techSpec: ${e}`); }

        try {
            if (state.sourceTree) {
                await this.saveGenericArtifactToFile('sourceTree', 'source-tree', state.sourceTree, state, baseUri);
            } else { await this.deleteSourceFile('sourceTree'); }
        } catch (e) { errors.push(`sourceTree: ${e}`); }

        try {
            if (state.testSummary) {
                await this.saveGenericArtifactToFile('testSummary', 'test-summary', state.testSummary, state, baseUri);
            } else { await this.deleteSourceFile('testSummary'); }
        } catch (e) { errors.push(`testSummary: ${e}`); }

        // ─── CIS module artifacts ───────────────────────────────────────
        try {
            if (state.storytelling) {
                await this.saveGenericArtifactToFile('storytelling', 'storytelling', state.storytelling, state, baseUri);
            } else { await this.deleteSourceFile('storytelling'); }
        } catch (e) { errors.push(`storytelling: ${e}`); }

        try {
            if (state.problemSolving) {
                await this.saveGenericArtifactToFile('problemSolving', 'problem-solving', state.problemSolving, state, baseUri);
            } else { await this.deleteSourceFile('problemSolving'); }
        } catch (e) { errors.push(`problemSolving: ${e}`); }

        try {
            if (state.innovationStrategy) {
                await this.saveGenericArtifactToFile('innovationStrategy', 'innovation-strategy', state.innovationStrategy, state, baseUri);
            } else { await this.deleteSourceFile('innovationStrategy'); }
        } catch (e) { errors.push(`innovationStrategy: ${e}`); }

        try {
            if (state.designThinking) {
                await this.saveGenericArtifactToFile('designThinking', 'design-thinking', state.designThinking, state, baseUri);
            } else { await this.deleteSourceFile('designThinking'); }
        } catch (e) { errors.push(`designThinking: ${e}`); }

        if (errors.length > 0) {
            acOutput.appendLine(`[ArtifactStore] syncToFiles completed with ${errors.length} error(s):`);
            errors.forEach(err => acOutput.appendLine(`  - ${err}`));
        }
        
        console.log('syncToFiles completed');
        } finally {
            // All writes done (or failed).  Keep the suppression flag active
            // for a short grace period so the file watcher's debounce window
            // doesn't cause a false external-change notification.
            this._syncingUntil = Date.now() + 500;
        }
    }

    /**
     * Delete a previously-written artifact file from disk when the artifact is removed.
     * Only deletes if we have a recorded source file for the given key.
     */
    private async deleteSourceFile(key: string): Promise<void> {
        if (!this.sourceFiles.has(key)) return;
        const fileUri = this.sourceFiles.get(key)!;
        try {
            await vscode.workspace.fs.delete(fileUri);
            this.sourceFiles.delete(key);
            console.log(`Deleted ${key} file from disk: ${fileUri.fsPath}`);
        } catch (e) {
            // File may already be gone
            this.sourceFiles.delete(key);
            console.log(`Could not delete ${key} file (may already be removed):`, e);
        }
    }
    
    /**
     * Get the configured output format from workspace settings.
     * Returns 'dual' by default if not configured.
     */
    private getOutputFormat(): 'json' | 'markdown' | 'dual' {
        return vscode.workspace.getConfiguration('agentcanvas').get<'json' | 'markdown' | 'dual'>('outputFormat', 'dual');
    }

    /**
     * Write a markdown companion file alongside a JSON artifact file.
     * The .md file is placed in the same directory as the JSON file.
     */
    private async writeMdCompanion(jsonUri: vscode.Uri, mdFilename: string, markdownContent: string): Promise<void> {
        const parentUri = vscode.Uri.joinPath(jsonUri, '..');
        const mdUri = vscode.Uri.joinPath(parentUri, mdFilename);
        await vscode.workspace.fs.writeFile(
            mdUri,
            Buffer.from(markdownContent, 'utf-8')
        );
        console.log('Saved markdown companion:', mdUri.fsPath);
    }

    /**
     * Save vision to JSON file
     */
    private async saveVisionToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {
        let targetUri: vscode.Uri;
        
        if (this.sourceFiles.has('vision')) {
            targetUri = this.sourceFiles.get('vision')!;
            console.log('Writing vision to original source file:', targetUri.fsPath);
        } else {
            targetUri = vscode.Uri.joinPath(baseUri, 'vision.json');
            console.log('Writing vision to default location:', targetUri.fsPath);
        }
        
        const visionJson = {
            metadata: {
                schemaVersion: '1.0.0',
                artifactType: 'vision',
                workflowName: 'bmad-studio',
                projectName: state.projectName,
                timestamps: {
                    created: new Date().toISOString(),
                    lastModified: new Date().toISOString()
                },
                status: state.vision?.status || 'draft'
            },
            content: {
                productName: state.vision?.productName || state.projectName,
                vision: {
                    statement: state.vision?.vision?.statement || state.vision?.valueProposition || '',
                    problemStatement: state.vision?.vision?.problemStatement || state.vision?.problemStatement || '',
                    proposedSolution: state.vision?.vision?.proposedSolution || state.vision?.valueProposition || '',
                },
                targetUsers: (state.vision?.targetUsers || []).map((u: any) =>
                    typeof u === 'string' ? { persona: u, description: '' } : u
                ),
                successMetrics: (state.vision?.successMetrics || state.vision?.successCriteria || []).map((c: any) =>
                    typeof c === 'string' ? { metric: c, description: c } : c
                ),
            }
        };
        
        await vscode.workspace.fs.writeFile(
            targetUri,
            Buffer.from(JSON.stringify(visionJson, null, 2), 'utf-8')
        );
        console.log('Saved vision to:', targetUri.fsPath);
        
        // Track the source file for future saves
        this.sourceFiles.set('vision', targetUri);
    }
    
    /**
     * Save epics to JSON file
     */
    private async saveEpicsToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {
        let targetUri: vscode.Uri;
        
        if (this.sourceFiles.has('epics')) {
            targetUri = this.sourceFiles.get('epics')!;
            console.log('Writing epics to original source file:', targetUri.fsPath);
        } else {
            const planningUri = vscode.Uri.joinPath(baseUri, 'planning-artifacts');
            
            try {
                await vscode.workspace.fs.createDirectory(planningUri);
            } catch {
                // Folder might already exist
            }
            
            targetUri = vscode.Uri.joinPath(planningUri, 'epics.json');
            console.log('Writing epics to default location:', targetUri.fsPath);
        }

        // Build the JSON structure
        const epicsJson = {
            metadata: {
                schemaVersion: '1.0.0',
                artifactType: 'epics',
                workflowName: 'bmad-studio',
                projectName: state.projectName,
                timestamps: {
                    created: new Date().toISOString(),
                    lastModified: new Date().toISOString()
                },
                status: 'draft'
            },
            content: {
                overview: {
                    projectName: state.projectName,
                    totalEpics: state.epics?.length || 0,
                    totalStories: state.epics?.reduce((sum, e) => sum + (e.stories?.length || 0), 0) || 0
                },
                requirementsInventory: state.requirements,
                // Strip runtime-only fields from each epic before writing
                epics: (state.epics || []).map((epic: any) => {
                    const { testStrategy, ...epicFields } = epic;
                    // Also sanitise embedded stories — strip runtime fields
                    // and ensure dependencies shape matches the inline schema
                    // (inline epics.schema uses string[] for dependencies,
                    //  not the rich object form from story.schema.json)
                    if (Array.isArray(epicFields.stories)) {
                        epicFields.stories = epicFields.stories.map((story: any) => {
                            const { id: _sid, status: _sst, ...storyFields } = story;
                            return storyFields;
                        });
                    }
                    return epicFields;
                })
            }
        };

        // Write the JSON file
        await vscode.workspace.fs.writeFile(
            targetUri,
            Buffer.from(JSON.stringify(epicsJson, null, 2), 'utf-8')
        );
        console.log('Saved epics to:', targetUri.fsPath);

        // Write markdown companion if output format includes markdown
        const outputFormat = this.getOutputFormat();
        if (outputFormat === 'markdown' || outputFormat === 'dual') {
            await this.writeMdCompanion(targetUri, 'epics.md', this.generateEpicsMarkdown(state));
        }
        
        // Track the source file for future saves
        this.sourceFiles.set('epics', targetUri);
    }

    /**
     * Save product brief to JSON file
     */
    private async saveProductBriefToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {
        let targetUri: vscode.Uri;
        if (this.sourceFiles.has('productBrief')) {
            targetUri = this.sourceFiles.get('productBrief')!;
        } else {
            const discoveryUri = vscode.Uri.joinPath(baseUri, 'discovery-artifacts');
            try { await vscode.workspace.fs.createDirectory(discoveryUri); } catch { /* exists */ }
            targetUri = vscode.Uri.joinPath(discoveryUri, 'product-brief.json');
        }
        const json = {
            metadata: {
                schemaVersion: '1.0.0',
                artifactType: 'product-brief',
                workflowName: 'bmad-studio',
                projectName: state.projectName,
                timestamps: { created: new Date().toISOString(), lastModified: new Date().toISOString() },
                status: state.productBrief?.status || 'draft'
            },
            content: (() => {
                if (!state.productBrief) return {};
                // Strip id and status — they live in metadata, not content
                const { id, status, ...contentFields } = state.productBrief;
                return contentFields;
            })()
        };
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(JSON.stringify(json, null, 2), 'utf-8'));
        console.log('Saved product-brief to:', targetUri.fsPath);

        // Write markdown companion if output format includes markdown
        const outputFormat = this.getOutputFormat();
        if (outputFormat === 'markdown' || outputFormat === 'dual') {
            await this.writeMdCompanion(targetUri, 'product-brief.md', this.generateProductBriefMarkdown(state));
        }

        this.sourceFiles.set('productBrief', targetUri);
    }

    /**
     * Save PRD to JSON file
     */
    private async savePRDToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {
        let targetUri: vscode.Uri;
        if (this.sourceFiles.has('prd')) {
            targetUri = this.sourceFiles.get('prd')!;
        } else {
            const planningUri = vscode.Uri.joinPath(baseUri, 'planning-artifacts');
            try { await vscode.workspace.fs.createDirectory(planningUri); } catch { /* exists */ }
            targetUri = vscode.Uri.joinPath(planningUri, 'prd.json');
        }
        const json = {
            metadata: {
                schemaVersion: '1.0.0',
                artifactType: 'prd',
                workflowName: 'bmad-studio',
                projectName: state.projectName,
                timestamps: { created: new Date().toISOString(), lastModified: new Date().toISOString() },
                status: state.prd?.status || 'draft'
            },
            content: (() => {
                if (!state.prd) return {};
                // Strip id, status, and UI-only ID-reference arrays — they aren't in the schema content
                const { id, status, functionalRequirementIds, nonFunctionalRequirementIds, technicalRequirementIds, ...contentFields } = state.prd;
                return contentFields;
            })()
        };
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(JSON.stringify(json, null, 2), 'utf-8'));
        console.log('Saved PRD to:', targetUri.fsPath);

        // Write markdown companion if output format includes markdown
        const outputFormat = this.getOutputFormat();
        if (outputFormat === 'markdown' || outputFormat === 'dual') {
            await this.writeMdCompanion(targetUri, 'prd.md', this.generatePRDMarkdown(state));
        }

        this.sourceFiles.set('prd', targetUri);
    }

    /**
     * Save architecture to JSON file
     */
    private async saveArchitectureToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {
        let targetUri: vscode.Uri;
        if (this.sourceFiles.has('architecture')) {
            targetUri = this.sourceFiles.get('architecture')!;
        } else {
            const solutioningUri = vscode.Uri.joinPath(baseUri, 'solutioning-artifacts');
            try { await vscode.workspace.fs.createDirectory(solutioningUri); } catch { /* exists */ }
            targetUri = vscode.Uri.joinPath(solutioningUri, 'architecture.json');
        }
        const json = {
            metadata: {
                schemaVersion: '1.0.0',
                artifactType: 'architecture',
                workflowName: 'bmad-studio',
                projectName: state.projectName,
                timestamps: { created: new Date().toISOString(), lastModified: new Date().toISOString() },
                status: state.architecture?.status || 'draft'
            },
            content: (() => {
                if (!state.architecture) return {};
                // Strip id and status — they live in metadata, not content
                const { id, status, ...contentFields } = state.architecture;
                return contentFields;
            })()
        };
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(JSON.stringify(json, null, 2), 'utf-8'));
        console.log('Saved architecture to:', targetUri.fsPath);

        // Write markdown companion if output format includes markdown
        const outputFormat = this.getOutputFormat();
        if (outputFormat === 'markdown' || outputFormat === 'dual') {
            await this.writeMdCompanion(targetUri, 'architecture.md', this.generateArchitectureMarkdown(state));
        }

        this.sourceFiles.set('architecture', targetUri);
    }

    /**
     * Save test cases to JSON file
     */
    private async saveTestCasesToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {
        let targetUri: vscode.Uri;

        if (this.sourceFiles.has('testCases')) {
            targetUri = this.sourceFiles.get('testCases')!;
        } else {
            const testingUri = vscode.Uri.joinPath(baseUri, 'testing-artifacts');
            try {
                await vscode.workspace.fs.createDirectory(testingUri);
            } catch {
                // Folder might already exist
            }
            targetUri = vscode.Uri.joinPath(testingUri, 'test-cases.json');
        }

        const testCasesJson = {
            metadata: {
                schemaVersion: '1.0.0',
                artifactType: 'test-cases',
                workflowName: 'bmad-studio',
                projectName: state.projectName,
                timestamps: {
                    created: new Date().toISOString(),
                    lastModified: new Date().toISOString()
                },
                status: 'draft'
            },
            content: {
                testCases: (state.testCases || []).map((tc: any) => {
                    const { id, status, ...rest } = tc;
                    return rest;
                })
            }
        };

        await vscode.workspace.fs.writeFile(
            targetUri,
            Buffer.from(JSON.stringify(testCasesJson, null, 2), 'utf-8')
        );
        console.log('Saved test cases to:', targetUri.fsPath);

        // Write markdown companion if output format includes markdown
        const outputFormat = this.getOutputFormat();
        if (outputFormat === 'markdown' || outputFormat === 'dual') {
            await this.writeMdCompanion(targetUri, 'test-cases.md', this.generateTestCasesMarkdown(state));
        }

        this.sourceFiles.set('testCases', targetUri);
    }

    /**
     * Save test strategy to JSON file
     */
    private async saveTestStrategyToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {
        let targetUri: vscode.Uri;

        if (this.sourceFiles.has('testStrategy')) {
            targetUri = this.sourceFiles.get('testStrategy')!;
        } else {
            const testingUri = vscode.Uri.joinPath(baseUri, 'testing-artifacts');
            try {
                await vscode.workspace.fs.createDirectory(testingUri);
            } catch {
                // Folder might already exist
            }
            targetUri = vscode.Uri.joinPath(testingUri, 'test-strategy.json');
        }

        const testStrategyJson = {
            metadata: {
                schemaVersion: '1.0.0',
                artifactType: 'test-strategy',
                workflowName: 'bmad-studio',
                projectName: state.projectName,
                timestamps: {
                    created: new Date().toISOString(),
                    lastModified: new Date().toISOString()
                },
                status: state.testStrategy?.status || 'draft'
            },
            content: (() => {
                if (state.testStrategy) {
                    const { id, status, ...contentFields } = state.testStrategy as any;
                    return contentFields;
                }
                return state.testStrategy;
            })()
        };

        await vscode.workspace.fs.writeFile(
            targetUri,
            Buffer.from(JSON.stringify(testStrategyJson, null, 2), 'utf-8')
        );
        console.log('Saved test strategy to:', targetUri.fsPath);

        // Write markdown companion if output format includes markdown
        const outputFormat = this.getOutputFormat();
        if (outputFormat === 'markdown' || outputFormat === 'dual') {
            await this.writeMdCompanion(targetUri, 'test-strategy.md', this.generateTestStrategyMarkdown(state));
        }

        this.sourceFiles.set('testStrategy', targetUri);
    }

    /**
     * Save test design to JSON file
     */
    private async saveTestDesignToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {
        let targetUri: vscode.Uri;

        if (this.sourceFiles.has('testDesign')) {
            targetUri = this.sourceFiles.get('testDesign')!;
        } else {
            const testingUri = vscode.Uri.joinPath(baseUri, 'testing-artifacts');
            try {
                await vscode.workspace.fs.createDirectory(testingUri);
            } catch {
                // Folder might already exist
            }
            targetUri = vscode.Uri.joinPath(testingUri, 'test-design.json');
        }

        const td = state.testDesign!;
        const testDesignJson = {
            metadata: {
                schemaVersion: '1.0.0',
                artifactType: 'test-design',
                workflowName: 'bmad-studio',
                projectName: state.projectName,
                timestamps: {
                    created: new Date().toISOString(),
                    lastModified: new Date().toISOString()
                },
                status: td.status || 'draft'
            },
            content: {
                epicInfo: td.epicInfo,
                summary: td.summary,
                notInScope: td.notInScope,
                riskAssessment: td.riskAssessment,
                entryExitCriteria: td.entryExitCriteria,
                projectTeam: td.projectTeam,
                coveragePlan: td.coveragePlan,
                testCases: td.testCases,
                executionOrder: td.executionOrder,
                testEnvironment: td.testEnvironment,
                resourceEstimates: td.resourceEstimates,
                qualityGateCriteria: td.qualityGateCriteria,
                mitigationPlans: td.mitigationPlans,
                assumptionsAndDependencies: td.assumptionsAndDependencies,
                defectManagement: td.defectManagement,
                approval: td.approval,
                appendices: td.appendices
            }
        };

        await vscode.workspace.fs.writeFile(
            targetUri,
            Buffer.from(JSON.stringify(testDesignJson, null, 2), 'utf-8')
        );
        console.log('Saved test design to:', targetUri.fsPath);

        // Write markdown companion if output format includes markdown
        const outputFormat = this.getOutputFormat();
        if (outputFormat === 'markdown' || outputFormat === 'dual') {
            await this.writeMdCompanion(targetUri, 'test-design.md', this.generateTestDesignMarkdown(state));
        }

        this.sourceFiles.set('testDesign', targetUri);
    }

    /**
     * Generic save method for the 23 new artifact types.
     *
     * Writes a JSON file with `{ metadata, content }` envelope (matching the
     * schema format) and optionally a markdown companion.  The JSON `content`
     * object contains every field of `artifact` except `id` and `status`
     * (those live in the metadata envelope or on the root).
     *
     * @param storeKey  camelCase key used in `this.artifacts` and `this.sourceFiles`
     * @param fileSlug  kebab-case name used for the file on disk (e.g. 'traceability-matrix')
     * @param artifact  the artifact data object
     * @param state     full BmadArtifacts state (for projectName)
     * @param baseUri   workspace _bmad base URI
     */
    private async saveGenericArtifactToFile(
        storeKey: string,
        fileSlug: string,
        artifact: Record<string, unknown>,
        state: BmadArtifacts,
        baseUri: vscode.Uri
    ): Promise<void> {
        let targetUri: vscode.Uri;

        if (this.sourceFiles.has(storeKey)) {
            targetUri = this.sourceFiles.get(storeKey)!;
        } else {
            // Determine the output folder based on the artifact module
            let folder: string;
            const teaTypes = ['traceabilityMatrix', 'testReview', 'nfrAssessment', 'testFramework', 'ciPipeline', 'automationSummary', 'atddChecklist'];
            const cisTypes = ['storytelling', 'problemSolving', 'innovationStrategy', 'designThinking'];
            if (teaTypes.includes(storeKey)) {
                folder = 'testing-artifacts';
            } else if (cisTypes.includes(storeKey)) {
                folder = 'cis-artifacts';
            } else {
                folder = 'bmm-artifacts';
            }
            const folderUri = vscode.Uri.joinPath(baseUri, folder);
            try {
                await vscode.workspace.fs.createDirectory(folderUri);
            } catch {
                // Folder might already exist
            }
            targetUri = vscode.Uri.joinPath(folderUri, `${fileSlug}.json`);
        }

        // Build the JSON envelope: separate id/status into metadata, rest is content
        const { id, status, ...contentFields } = artifact;
        const jsonEnvelope = {
            metadata: {
                schemaVersion: '1.0.0',
                artifactType: fileSlug,
                workflowName: 'bmad-studio',
                projectName: state.projectName,
                timestamps: {
                    created: new Date().toISOString(),
                    lastModified: new Date().toISOString()
                },
                status: (status as string) || 'draft'
            },
            content: contentFields
        };

        await vscode.workspace.fs.writeFile(
            targetUri,
            Buffer.from(JSON.stringify(jsonEnvelope, null, 2), 'utf-8')
        );
        console.log(`Saved ${fileSlug} to:`, targetUri.fsPath);

        // Write markdown companion if output format includes markdown
        const outputFormat = this.getOutputFormat();
        if (outputFormat === 'markdown' || outputFormat === 'dual') {
            const md = this.generateGenericArtifactMarkdown(fileSlug, artifact, state);
            await this.writeMdCompanion(targetUri, `${fileSlug}.md`, md);
        }

        this.sourceFiles.set(storeKey, targetUri);
    }

    /**
     * Generate a human-readable markdown rendering of a generic artifact.
     *
     * This produces a structured document by walking the artifact's top-level
     * fields and rendering objects/arrays as nested markdown sections.
     */
    private generateGenericArtifactMarkdown(
        fileSlug: string,
        artifact: Record<string, unknown>,
        state: BmadArtifacts
    ): string {
        // Convert kebab-case to Title Case for heading
        const title = fileSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        let md = `# ${state.projectName} - ${title}\n\n`;

        const renderValue = (value: unknown, depth: number): string => {
            if (value === null || value === undefined) return '';
            if (typeof value === 'string') return value;
            if (typeof value === 'number' || typeof value === 'boolean') return String(value);
            if (Array.isArray(value)) {
                return value.map((item, i) => {
                    if (typeof item === 'string') return `- ${item}`;
                    if (typeof item === 'object' && item !== null) {
                        const entries = Object.entries(item as Record<string, unknown>);
                        if (entries.length === 0) return `- (empty)`;
                        // For objects in arrays, render as a bullet with key-value sub-items
                        const firstVal = entries[0][1];
                        const label = typeof firstVal === 'string' ? firstVal : `Item ${i + 1}`;
                        let result = `- **${label}**`;
                        for (const [k, v] of entries.slice(typeof firstVal === 'string' ? 1 : 0)) {
                            if (v === null || v === undefined) continue;
                            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                                result += `\n  - ${formatKey(k)}: ${v}`;
                            } else if (Array.isArray(v)) {
                                result += `\n  - ${formatKey(k)}: ${(v as unknown[]).filter(x => x != null).join(', ')}`;
                            }
                        }
                        return result;
                    }
                    return `- ${String(item)}`;
                }).join('\n');
            }
            if (typeof value === 'object') {
                const entries = Object.entries(value as Record<string, unknown>);
                return entries.map(([k, v]) => {
                    if (v === null || v === undefined) return '';
                    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                        return `- **${formatKey(k)}**: ${v}`;
                    }
                    if (Array.isArray(v)) {
                        return `**${formatKey(k)}**:\n${renderValue(v, depth + 1)}`;
                    }
                    if (typeof v === 'object') {
                        return `**${formatKey(k)}**:\n${renderValue(v, depth + 1)}`;
                    }
                    return '';
                }).filter(Boolean).join('\n');
            }
            return String(value);
        };

        const formatKey = (key: string): string => {
            // camelCase to Title Case
            return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
        };

        // Skip id and status (already in header / metadata)
        for (const [key, value] of Object.entries(artifact)) {
            if (key === 'id' || key === 'status') continue;
            if (value === null || value === undefined) continue;

            const heading = formatKey(key);
            md += `## ${heading}\n\n`;

            if (typeof value === 'string') {
                md += `${value}\n\n`;
            } else {
                md += `${renderValue(value, 0)}\n\n`;
            }
        }

        return md;
    }

    /**
     * Generate markdown version of epics
     */
    private generateEpicsMarkdown(state: BmadArtifacts): string {
        let md = `# ${state.projectName} - Epic Breakdown\n\n`;
        md += `## Overview\n\n`;
        md += `This document provides the complete epic and story breakdown.\n\n`;

        // Requirements inventory
        if (state.requirements) {
            md += `## Requirements Inventory\n\n`;
            md += `### Functional Requirements\n\n`;
            state.requirements.functional.forEach(fr => {
                md += `- **${fr.id}**: ${fr.title} - ${fr.description}\n`;
            });
            md += '\n';
        }

        // Epics
        md += `## Epics\n\n`;
        state.epics?.forEach((epic, index) => {
            md += `### Epic ${index + 1}: ${epic.title}\n\n`;
            md += `**Goal:** ${epic.goal}\n\n`;
            
            if (epic.valueDelivered) {
                md += `**Value Delivered:** ${epic.valueDelivered}\n\n`;
            }

            if (epic.functionalRequirements?.length) {
                md += `**Requirements Covered:** ${epic.functionalRequirements.join(', ')}\n\n`;
            }

            // Use cases (if enhanced)
            if (epic.useCases?.length) {
                md += `#### Use Cases\n\n`;
                epic.useCases.forEach(uc => {
                    md += `**${uc.title}**\n`;
                    md += `${uc.scenario?.context || ''}\n`;
                    md += `- Without: ${uc.scenario?.before || ''}\n`;
                    md += `- With: ${uc.scenario?.after || ''}\n`;
                    md += `- Impact: ${uc.scenario?.impact || ''}\n\n`;
                });
            }

            // Stories
            md += `#### Stories\n\n`;
            epic.stories?.forEach((story, sIndex) => {
                md += `##### Story ${index + 1}.${sIndex + 1}: ${story.title}\n\n`;
                md += `As a ${story.userStory.asA},\n`;
                md += `I want ${story.userStory.iWant},\n`;
                md += `So that ${story.userStory.soThat}.\n\n`;
                
                md += `**Acceptance Criteria:**\n\n`;
                story.acceptanceCriteria.forEach(ac => {
                    if (ac.criterion) {
                        md += `- ${ac.criterion}\n`;
                    } else {
                        md += `- **Given** ${ac.given}\n`;
                        md += `  **When** ${ac.when}\n`;
                        md += `  **Then** ${ac.then}\n`;
                        if (ac.and?.length) {
                            ac.and.forEach(a => md += `  **And** ${a}\n`);
                        }
                    }
                    md += '\n';
                });
            });

            md += '---\n\n';
        });

        return md;
    }

    /**
     * Generate markdown version of product brief
     */
    private generateProductBriefMarkdown(state: BmadArtifacts): string {
        const pb = state.productBrief;
        if (!pb) return '';

        let md = `# ${pb.productName || state.projectName} - Product Brief\n\n`;

        if (pb.tagline) md += `> ${pb.tagline}\n\n`;
        if (pb.version) md += `**Version:** ${pb.version}  \n`;
        md += `**Status:** ${pb.status || 'draft'}\n\n`;

        // Vision
        if (pb.vision) {
            md += `## Vision\n\n`;
            if (pb.vision.statement) md += `${pb.vision.statement}\n\n`;
            if (pb.vision.mission) md += `**Mission:** ${pb.vision.mission}\n\n`;
            if (pb.vision.problemStatement) {
                md += `### Problem Statement\n\n${pb.vision.problemStatement}\n\n`;
            }
            if (pb.vision.problemDetails?.length) {
                md += `### Problem Details\n\n`;
                pb.vision.problemDetails.forEach(pd => {
                    md += `- **${pd.problem}**\n`;
                    if (pd.impact) md += `  - Impact: ${pd.impact}\n`;
                    if (pd.affectedUsers) md += `  - Affected Users: ${pd.affectedUsers}\n`;
                    if (pd.currentSolutions) md += `  - Current Solutions: ${pd.currentSolutions}\n`;
                });
                md += '\n';
            }
            if (pb.vision.proposedSolution) {
                md += `### Proposed Solution\n\n${pb.vision.proposedSolution}\n\n`;
            }
            if (pb.vision.solutionApproach?.length) {
                md += `### Solution Approach\n\n`;
                pb.vision.solutionApproach.forEach(sa => {
                    md += `- **${sa.aspect}**: ${sa.description || ''}\n`;
                    if (sa.rationale) md += `  - Rationale: ${sa.rationale}\n`;
                });
                md += '\n';
            }
            if (pb.vision.uniqueValueProposition) {
                md += `### Unique Value Proposition\n\n${pb.vision.uniqueValueProposition}\n\n`;
            }
            if (pb.vision.differentiators?.length) {
                md += `### Differentiators\n\n`;
                pb.vision.differentiators.forEach(d => {
                    md += `- **${d.differentiator}**`;
                    if (d.competitiveAdvantage) md += ` — ${d.competitiveAdvantage}`;
                    md += '\n';
                });
                md += '\n';
            }
        }

        // Target Users
        if (pb.targetUsers?.length) {
            md += `## Target Users\n\n`;
            pb.targetUsers.forEach(user => {
                md += `### ${user.persona}\n\n`;
                if (user.description) md += `${user.description}\n\n`;
                if (user.demographics) {
                    const demo = user.demographics;
                    const parts = [demo.role, demo.age, demo.industry, demo.experience].filter(Boolean);
                    if (parts.length) md += `**Demographics:** ${parts.join(' | ')}\n\n`;
                }
                if (user.technicalProficiency) {
                    md += `**Technical Proficiency:** ${user.technicalProficiency}\n\n`;
                }
                if (user.goals?.length) {
                    md += `**Goals:**\n`;
                    user.goals.forEach(g => {
                        md += `- ${g.goal}${g.priority ? ` (${g.priority})` : ''}\n`;
                    });
                    md += '\n';
                }
                if (user.needs?.length) {
                    md += `**Needs:**\n`;
                    user.needs.forEach(n => {
                        md += `- ${n.need}${n.importance ? ` [${n.importance}]` : ''}\n`;
                    });
                    md += '\n';
                }
                if (user.painPoints?.length) {
                    md += `**Pain Points:**\n`;
                    user.painPoints.forEach(p => {
                        md += `- ${p.painPoint}${p.severity ? ` [${p.severity}]` : ''}\n`;
                    });
                    md += '\n';
                }
                if (user.behaviors?.length) {
                    md += `**Behaviors:** ${user.behaviors.join(', ')}\n\n`;
                }
                if (user.motivations?.length) {
                    md += `**Motivations:** ${user.motivations.join(', ')}\n\n`;
                }
                if (user.frustrations?.length) {
                    md += `**Frustrations:** ${user.frustrations.join(', ')}\n\n`;
                }
            });
        }

        // Market Context
        if (pb.marketContext) {
            md += `## Market Context\n\n`;
            const mc = pb.marketContext;
            if (mc.overview) md += `${mc.overview}\n\n`;
            if (mc.targetMarket) md += `**Target Market:** ${mc.targetMarket}\n\n`;
            if (mc.marketSize) {
                md += `**Market Size:**\n`;
                if (mc.marketSize.tam) md += `- TAM: ${mc.marketSize.tam}\n`;
                if (mc.marketSize.sam) md += `- SAM: ${mc.marketSize.sam}\n`;
                if (mc.marketSize.som) md += `- SOM: ${mc.marketSize.som}\n`;
                md += '\n';
            }
            if (mc.trends?.length) {
                md += `### Market Trends\n\n`;
                mc.trends.forEach(t => {
                    md += `- **${t.trend}**${t.impact ? ` — ${t.impact}` : ''}\n`;
                });
                md += '\n';
            }
            if (mc.competitiveLandscape) {
                md += `### Competitive Landscape\n\n${mc.competitiveLandscape}\n\n`;
            }
            if (mc.competitors?.length) {
                md += `### Competitors\n\n`;
                mc.competitors.forEach(c => {
                    md += `#### ${c.name}\n\n`;
                    if (c.description) md += `${c.description}\n\n`;
                    if (c.strengths?.length) md += `**Strengths:** ${c.strengths.join(', ')}\n\n`;
                    if (c.weaknesses?.length) md += `**Weaknesses:** ${c.weaknesses.join(', ')}\n\n`;
                });
            }
        }

        // Success Metrics
        if (pb.successMetrics?.length) {
            md += `## Success Metrics\n\n`;
            md += `| Metric | Target | Timeframe | Category |\n|---|---|---|---|\n`;
            pb.successMetrics.forEach(m => {
                md += `| ${m.metric} | ${m.target || '-'} | ${m.timeframe || '-'} | ${m.category || '-'} |\n`;
            });
            md += '\n';
        }

        // Scope
        if (pb.scope) {
            md += `## Scope\n\n`;
            if (pb.scope.overview) md += `${pb.scope.overview}\n\n`;
            if (pb.scope.inScope?.length) {
                md += `### In Scope\n\n`;
                pb.scope.inScope.forEach(s => {
                    md += `- **${s.item}**${s.priority ? ` [${s.priority}]` : ''}${s.rationale ? ` — ${s.rationale}` : ''}\n`;
                });
                md += '\n';
            }
            if (pb.scope.outOfScope?.length) {
                md += `### Out of Scope\n\n`;
                pb.scope.outOfScope.forEach(s => {
                    md += `- ${s.item}${s.reason ? ` — ${s.reason}` : ''}\n`;
                });
                md += '\n';
            }
            if (pb.scope.futureConsiderations?.length) {
                md += `### Future Considerations\n\n`;
                pb.scope.futureConsiderations.forEach(f => {
                    md += `- ${f.item}${f.timeframe ? ` (${f.timeframe})` : ''}\n`;
                });
                md += '\n';
            }
            if (pb.scope.mvpDefinition) {
                md += `### MVP Definition\n\n`;
                if (pb.scope.mvpDefinition.description) md += `${pb.scope.mvpDefinition.description}\n\n`;
                if (pb.scope.mvpDefinition.features?.length) {
                    md += `**MVP Features:**\n`;
                    pb.scope.mvpDefinition.features.forEach(f => md += `- ${f}\n`);
                    md += '\n';
                }
                if (pb.scope.mvpDefinition.successCriteria?.length) {
                    md += `**Success Criteria:**\n`;
                    pb.scope.mvpDefinition.successCriteria.forEach(c => md += `- ${c}\n`);
                    md += '\n';
                }
            }
        }

        // Key Features
        if (pb.keyFeatures?.length) {
            md += `## Key Features\n\n`;
            pb.keyFeatures.forEach(f => {
                md += `### ${f.name}${f.priority ? ` [${f.priority}]` : ''}\n\n`;
                if (f.description) md += `${f.description}\n\n`;
                if (f.userBenefit) md += `**User Benefit:** ${f.userBenefit}\n\n`;
                if (f.complexity) md += `**Complexity:** ${f.complexity}\n\n`;
            });
        }

        // Constraints
        if (pb.constraints?.length) {
            md += `## Constraints\n\n`;
            pb.constraints.forEach(c => {
                md += `- **${c.constraint}**${c.type ? ` [${c.type}]` : ''}\n`;
                if (c.impact) md += `  - Impact: ${c.impact}\n`;
                if (c.mitigation) md += `  - Mitigation: ${c.mitigation}\n`;
            });
            md += '\n';
        }

        // Assumptions
        if (pb.assumptions?.length) {
            md += `## Assumptions\n\n`;
            pb.assumptions.forEach(a => {
                md += `- **${a.assumption}**${a.category ? ` [${a.category}]` : ''}\n`;
                if (a.risk) md += `  - Risk: ${a.risk}\n`;
                if (a.validationMethod) md += `  - Validation: ${a.validationMethod}\n`;
            });
            md += '\n';
        }

        // Risks
        if (pb.risks?.length) {
            md += `## Risks\n\n`;
            md += `| Risk | Category | Probability | Impact | Mitigation |\n|---|---|---|---|---|\n`;
            pb.risks.forEach(r => {
                md += `| ${r.risk} | ${r.category || '-'} | ${r.probability || '-'} | ${r.impact || '-'} | ${r.mitigation || '-'} |\n`;
            });
            md += '\n';
        }

        // Timeline
        if (pb.timeline) {
            md += `## Timeline\n\n`;
            if (pb.timeline.overview) md += `${pb.timeline.overview}\n\n`;
            if (pb.timeline.milestones?.length) {
                md += `### Milestones\n\n`;
                pb.timeline.milestones.forEach(m => {
                    md += `- **${m.milestone}**${m.targetDate ? ` (${m.targetDate})` : ''}\n`;
                    if (m.description) md += `  ${m.description}\n`;
                    if (m.deliverables?.length) md += `  Deliverables: ${m.deliverables.join(', ')}\n`;
                });
                md += '\n';
            }
            if (pb.timeline.phases?.length) {
                md += `### Phases\n\n`;
                pb.timeline.phases.forEach(p => {
                    md += `- **${p.phase}**${p.duration ? ` (${p.duration})` : ''}\n`;
                    if (p.objectives?.length) p.objectives.forEach(o => md += `  - ${o}\n`);
                });
                md += '\n';
            }
        }

        // Stakeholders
        if (pb.stakeholders?.length) {
            md += `## Stakeholders\n\n`;
            md += `| Role | Name | Involvement |\n|---|---|---|\n`;
            pb.stakeholders.forEach(s => {
                md += `| ${s.role} | ${s.name || '-'} | ${s.involvement || '-'} |\n`;
            });
            md += '\n';
        }

        // Additional Context
        if (pb.additionalContext) {
            md += `## Additional Context\n\n`;
            if (pb.additionalContext.background) md += `${pb.additionalContext.background}\n\n`;
            if (pb.additionalContext.openQuestions?.length) {
                md += `### Open Questions\n\n`;
                pb.additionalContext.openQuestions.forEach(q => {
                    md += `- ${q.question}${q.status ? ` [${q.status}]` : ''}\n`;
                });
                md += '\n';
            }
            if (pb.additionalContext.notes?.length) {
                md += `### Notes\n\n`;
                pb.additionalContext.notes.forEach(n => md += `- ${n}\n`);
                md += '\n';
            }
        }

        return md;
    }

    /**
     * Generate markdown version of PRD
     */
    private generatePRDMarkdown(state: BmadArtifacts): string {
        const prd = state.prd;
        if (!prd) return '';

        let md = `# ${prd.productOverview?.productName || state.projectName} - Product Requirements Document\n\n`;
        md += `**Status:** ${prd.status || 'draft'}\n\n`;

        // Product Overview
        if (prd.productOverview) {
            md += `## Product Overview\n\n`;
            const po = prd.productOverview;
            if (po.version) md += `**Version:** ${po.version}\n\n`;
            if (po.purpose) md += `**Purpose:** ${po.purpose}\n\n`;
            if (po.targetAudience) md += `**Target Audience:** ${po.targetAudience}\n\n`;
            if (po.productVision) md += `### Vision\n\n${po.productVision}\n\n`;
            if (po.problemStatement) md += `### Problem Statement\n\n${po.problemStatement}\n\n`;
            if (po.proposedSolution) md += `### Proposed Solution\n\n${po.proposedSolution}\n\n`;
            if (po.valueProposition) md += `### Value Proposition\n\n${po.valueProposition}\n\n`;
            if (po.keyBenefits?.length) {
                md += `### Key Benefits\n\n`;
                po.keyBenefits.forEach(b => md += `- ${b}\n`);
                md += '\n';
            }
        }

        // Project Type
        if (prd.projectType) {
            md += `## Project Type\n\n`;
            const pt = prd.projectType;
            if (pt.type) md += `**Type:** ${pt.type}\n`;
            if (pt.complexity) md += `**Complexity:** ${pt.complexity}\n`;
            if (pt.domainComplexity) md += `**Domain Complexity:** ${pt.domainComplexity}\n`;
            if (pt.technicalComplexity) md += `**Technical Complexity:** ${pt.technicalComplexity}\n`;
            if (pt.integrationComplexity) md += `**Integration Complexity:** ${pt.integrationComplexity}\n`;
            md += '\n';
            if (pt.characteristics?.length) {
                md += `**Characteristics:** ${pt.characteristics.join(', ')}\n\n`;
            }
        }

        // User Personas
        if (prd.userPersonas?.length) {
            md += `## User Personas\n\n`;
            prd.userPersonas.forEach(p => {
                md += `### ${p.name}${p.role ? ` (${p.role})` : ''}\n\n`;
                if (p.description) md += `${p.description}\n\n`;
                if (p.technicalProficiency) md += `**Technical Proficiency:** ${p.technicalProficiency}\n\n`;
                if (p.goals?.length) {
                    md += `**Goals:**\n`;
                    p.goals.forEach(g => md += `- ${g}\n`);
                    md += '\n';
                }
                if (p.painPoints?.length) {
                    md += `**Pain Points:**\n`;
                    p.painPoints.forEach(pp => md += `- ${pp}\n`);
                    md += '\n';
                }
                if (p.primaryTasks?.length) {
                    md += `**Primary Tasks:** ${p.primaryTasks.join(', ')}\n\n`;
                }
            });
        }

        // User Journeys
        if (prd.userJourneys?.length) {
            md += `## User Journeys\n\n`;
            prd.userJourneys.forEach(j => {
                md += `### ${j.name}${j.persona ? ` (${j.persona})` : ''}\n\n`;
                if (j.goal) md += `**Goal:** ${j.goal}\n\n`;
                if (j.preconditions?.length) {
                    md += `**Preconditions:** ${j.preconditions.join(', ')}\n\n`;
                }
                if (j.steps?.length) {
                    md += `**Steps:**\n\n`;
                    j.steps.forEach(s => {
                        md += `${s.step}. ${s.action}\n`;
                        if (s.systemResponse) md += `   → ${s.systemResponse}\n`;
                        if (s.outcome) md += `   ✓ ${s.outcome}\n`;
                    });
                    md += '\n';
                }
                if (j.successCriteria) md += `**Success Criteria:** ${j.successCriteria}\n\n`;
            });
        }

        // Domain Model
        if (prd.domainModel) {
            md += `## Domain Model\n\n`;
            if (prd.domainModel.overview) md += `${prd.domainModel.overview}\n\n`;
            if (prd.domainModel.coreConcepts?.length) {
                md += `### Core Concepts\n\n`;
                prd.domainModel.coreConcepts.forEach(c => {
                    md += `#### ${c.name}\n\n`;
                    if (c.description) md += `${c.description}\n\n`;
                    if (c.attributes?.length) {
                        md += `**Attributes:**\n`;
                        c.attributes.forEach(a => {
                            md += `- \`${a.name}\` (${a.type})${a.required ? ' *required*' : ''}${a.description ? ` — ${a.description}` : ''}\n`;
                        });
                        md += '\n';
                    }
                    if (c.relationships?.length) {
                        md += `**Relationships:**\n`;
                        c.relationships.forEach(r => {
                            md += `- → ${r.target} [${r.type}]${r.cardinality ? ` (${r.cardinality})` : ''}\n`;
                        });
                        md += '\n';
                    }
                    if (c.businessRules?.length) {
                        md += `**Business Rules:**\n`;
                        c.businessRules.forEach(r => md += `- ${r}\n`);
                        md += '\n';
                    }
                });
            }
            if (prd.domainModel.glossary?.length) {
                md += `### Glossary\n\n`;
                md += `| Term | Definition |\n|---|---|\n`;
                prd.domainModel.glossary.forEach(g => {
                    md += `| **${g.term}** | ${g.definition} |\n`;
                });
                md += '\n';
            }
        }

        // Requirements References
        if (prd.functionalRequirementIds?.length) {
            md += `## Functional Requirements\n\n`;
            prd.functionalRequirementIds.forEach(id => md += `- ${id}\n`);
            md += '\n';
        }
        if (prd.nonFunctionalRequirementIds?.length) {
            md += `## Non-Functional Requirements\n\n`;
            prd.nonFunctionalRequirementIds.forEach(id => md += `- ${id}\n`);
            md += '\n';
        }

        // Success Criteria
        if (prd.successCriteria?.length) {
            md += `## Success Criteria\n\n`;
            md += `| Criterion | Category | Target | Timeframe |\n|---|---|---|---|\n`;
            prd.successCriteria.forEach(sc => {
                md += `| ${sc.criterion} | ${sc.category || '-'} | ${sc.target || '-'} | ${sc.timeframe || '-'} |\n`;
            });
            md += '\n';
        }

        // Scope
        if (prd.scope) {
            md += `## Scope\n\n`;
            if (prd.scope.inScope?.length) {
                md += `### In Scope\n\n`;
                prd.scope.inScope.forEach(s => {
                    md += `- **${s.item}**${s.priority ? ` [${s.priority}]` : ''}${s.description ? ` — ${s.description}` : ''}\n`;
                });
                md += '\n';
            }
            if (prd.scope.outOfScope?.length) {
                md += `### Out of Scope\n\n`;
                prd.scope.outOfScope.forEach(s => {
                    md += `- ${s.item}${s.rationale ? ` — ${s.rationale}` : ''}\n`;
                });
                md += '\n';
            }
            if (prd.scope.assumptions?.length) {
                md += `### Assumptions\n\n`;
                prd.scope.assumptions.forEach(a => {
                    md += `- ${a.assumption}${a.validated ? ' ✓' : ''}\n`;
                });
                md += '\n';
            }
            if (prd.scope.dependencies?.length) {
                md += `### Dependencies\n\n`;
                prd.scope.dependencies.forEach(d => {
                    md += `- ${d.dependency}${d.type ? ` [${d.type}]` : ''}${d.status ? ` — ${d.status}` : ''}\n`;
                });
                md += '\n';
            }
        }

        // Constraints
        if (prd.constraints?.length) {
            md += `## Constraints\n\n`;
            md += `| Type | Description | Impact | Flexibility |\n|---|---|---|---|\n`;
            prd.constraints.forEach(c => {
                md += `| ${c.type} | ${c.description} | ${c.impact || '-'} | ${c.flexibility || '-'} |\n`;
            });
            md += '\n';
        }

        // Risks
        if (prd.risks?.length) {
            md += `## Risks\n\n`;
            md += `| Risk | Category | Probability | Impact | Mitigation |\n|---|---|---|---|---|\n`;
            prd.risks.forEach(r => {
                md += `| ${r.risk} | ${r.category || '-'} | ${r.probability || '-'} | ${r.impact || '-'} | ${r.mitigation || '-'} |\n`;
            });
            md += '\n';
        }

        // Timeline
        if (prd.timeline) {
            md += `## Timeline\n\n`;
            if (prd.timeline.overview) md += `${prd.timeline.overview}\n\n`;
            if (prd.timeline.phases?.length) {
                prd.timeline.phases.forEach(p => {
                    md += `### ${p.name}\n\n`;
                    if (p.description) md += `${p.description}\n\n`;
                    if (p.startDate || p.endDate) md += `**Period:** ${p.startDate || '?'} — ${p.endDate || '?'}\n\n`;
                    if (p.deliverables?.length) {
                        md += `**Deliverables:**\n`;
                        p.deliverables.forEach(d => md += `- ${d}\n`);
                        md += '\n';
                    }
                });
            }
        }

        return md;
    }

    /**
     * Generate markdown version of architecture document
     */
    private generateArchitectureMarkdown(state: BmadArtifacts): string {
        const arch = state.architecture;
        if (!arch) return '';

        let md = `# ${arch.overview?.projectName || state.projectName} - Architecture Document\n\n`;
        md += `**Status:** ${arch.status || 'draft'}\n\n`;

        // Overview
        if (arch.overview) {
            md += `## Overview\n\n`;
            if (arch.overview.architectureStyle) md += `**Architecture Style:** ${arch.overview.architectureStyle}\n\n`;
            if (arch.overview.summary) md += `${arch.overview.summary}\n\n`;
            if (arch.overview.vision) md += `**Vision:** ${arch.overview.vision}\n\n`;
            if (arch.overview.principles?.length) {
                md += `### Architecture Principles\n\n`;
                arch.overview.principles.forEach(p => {
                    md += `- **${p.name}**${p.description ? ` — ${p.description}` : ''}\n`;
                    if (p.rationale) md += `  - Rationale: ${p.rationale}\n`;
                });
                md += '\n';
            }
        }

        // Context
        if (arch.context) {
            md += `## Context\n\n`;
            if (arch.context.businessContext) md += `### Business Context\n\n${arch.context.businessContext}\n\n`;
            if (arch.context.technicalContext) md += `### Technical Context\n\n${arch.context.technicalContext}\n\n`;
            if (arch.context.qualityAttributes?.length) {
                md += `### Quality Attributes\n\n`;
                md += `| Attribute | Priority | Target |\n|---|---|---|\n`;
                arch.context.qualityAttributes.forEach(q => {
                    md += `| ${q.attribute} | ${q.priority || '-'} | ${q.target || '-'} |\n`;
                });
                md += '\n';
            }
            if (arch.context.constraints?.length) {
                md += `### Constraints\n\n`;
                arch.context.constraints.forEach(c => {
                    md += `- **${c.constraint}**${c.type ? ` [${c.type}]` : ''}\n`;
                    if (c.rationale) md += `  - Rationale: ${c.rationale}\n`;
                    if (c.impact) md += `  - Impact: ${c.impact}\n`;
                });
                md += '\n';
            }
        }

        // Tech Stack
        if (arch.techStack) {
            md += `## Technology Stack\n\n`;
            const ts = arch.techStack;
            if (ts.frontend) {
                md += `### Frontend\n\n`;
                if (ts.frontend.framework) md += `- **Framework:** ${ts.frontend.framework}\n`;
                if (ts.frontend.language) md += `- **Language:** ${ts.frontend.language}\n`;
                if (ts.frontend.stateManagement) md += `- **State Management:** ${ts.frontend.stateManagement}\n`;
                if (ts.frontend.styling) md += `- **Styling:** ${ts.frontend.styling}\n`;
                if (ts.frontend.testing) md += `- **Testing:** ${ts.frontend.testing}\n`;
                if (ts.frontend.buildTool) md += `- **Build Tool:** ${ts.frontend.buildTool}\n`;
                if (ts.frontend.rationale) md += `\n${ts.frontend.rationale}\n`;
                md += '\n';
            }
            if (ts.backend) {
                md += `### Backend\n\n`;
                if (ts.backend.framework) md += `- **Framework:** ${ts.backend.framework}\n`;
                if (ts.backend.language) md += `- **Language:** ${ts.backend.language}\n`;
                if (ts.backend.runtime) md += `- **Runtime:** ${ts.backend.runtime}\n`;
                if (ts.backend.apiStyle) md += `- **API Style:** ${ts.backend.apiStyle}\n`;
                if (ts.backend.rationale) md += `\n${ts.backend.rationale}\n`;
                md += '\n';
            }
            if (ts.database) {
                md += `### Database\n\n`;
                if (ts.database.primary) md += `- **Primary:** ${ts.database.primary}\n`;
                if (ts.database.secondary) md += `- **Secondary:** ${ts.database.secondary}\n`;
                if (ts.database.caching) md += `- **Caching:** ${ts.database.caching}\n`;
                if (ts.database.orm) md += `- **ORM:** ${ts.database.orm}\n`;
                if (ts.database.schemaStrategy) md += `- **Schema Strategy:** ${ts.database.schemaStrategy}\n`;
                md += '\n';
            }
            if (ts.infrastructure) {
                md += `### Infrastructure\n\n`;
                if (ts.infrastructure.hosting) md += `- **Hosting:** ${ts.infrastructure.hosting}\n`;
                if (ts.infrastructure.containerization) md += `- **Containerization:** ${ts.infrastructure.containerization}\n`;
                if (ts.infrastructure.orchestration) md += `- **Orchestration:** ${ts.infrastructure.orchestration}\n`;
                if (ts.infrastructure.cicd) md += `- **CI/CD:** ${ts.infrastructure.cicd}\n`;
                if (ts.infrastructure.monitoring) md += `- **Monitoring:** ${ts.infrastructure.monitoring}\n`;
                if (ts.infrastructure.logging) md += `- **Logging:** ${ts.infrastructure.logging}\n`;
                md += '\n';
            }
        }

        // Architecture Decisions
        if (arch.decisions?.length) {
            md += `## Architecture Decisions\n\n`;
            arch.decisions.forEach(d => {
                md += `### ADR-${d.id}: ${d.title}\n\n`;
                md += `**Status:** ${d.status}${d.date ? ` | **Date:** ${d.date}` : ''}\n\n`;
                md += `**Context:** ${d.context}\n\n`;
                md += `**Decision:** ${d.decision}\n\n`;
                if (d.rationale) md += `**Rationale:** ${d.rationale}\n\n`;
                if (d.consequences) {
                    if (d.consequences.positive?.length) {
                        md += `**Positive Consequences:**\n`;
                        d.consequences.positive.forEach(c => md += `- ✅ ${c}\n`);
                    }
                    if (d.consequences.negative?.length) {
                        md += `**Negative Consequences:**\n`;
                        d.consequences.negative.forEach(c => md += `- ⚠️ ${c}\n`);
                    }
                    md += '\n';
                }
                if (d.alternatives?.length) {
                    md += `**Alternatives Considered:**\n`;
                    d.alternatives.forEach(a => {
                        md += `- **${a.option}**${a.rejectionReason ? ` — Rejected: ${a.rejectionReason}` : ''}\n`;
                    });
                    md += '\n';
                }
                md += '---\n\n';
            });
        }

        // Patterns
        if (arch.patterns?.length) {
            md += `## Architecture Patterns\n\n`;
            arch.patterns.forEach(p => {
                md += `### ${p.pattern}${p.category ? ` [${p.category}]` : ''}\n\n`;
                if (p.usage) md += `**Usage:** ${p.usage}\n\n`;
                if (p.implementation) md += `**Implementation:** ${p.implementation}\n\n`;
                if (p.rationale) md += `**Rationale:** ${p.rationale}\n\n`;
            });
        }

        // System Components
        if (arch.systemComponents?.length) {
            md += `## System Components\n\n`;
            arch.systemComponents.forEach(c => {
                md += `### ${c.name}${c.type ? ` (${c.type})` : ''}\n\n`;
                if (c.description) md += `${c.description}\n\n`;
                if (c.technology) md += `**Technology:** ${c.technology}\n\n`;
                if (c.responsibilities?.length) {
                    md += `**Responsibilities:**\n`;
                    c.responsibilities.forEach(r => md += `- ${r}\n`);
                    md += '\n';
                }
                if (c.interfaces?.length) {
                    md += `**Interfaces:**\n`;
                    c.interfaces.forEach(i => {
                        md += `- \`${i.name}\`${i.type ? ` [${i.type}]` : ''}${i.description ? ` — ${i.description}` : ''}\n`;
                    });
                    md += '\n';
                }
                if (c.dependencies?.length) {
                    md += `**Dependencies:** ${c.dependencies.join(', ')}\n\n`;
                }
            });
        }

        // Project Structure
        if (arch.projectStructure) {
            md += `## Project Structure\n\n`;
            if (arch.projectStructure.description) md += `${arch.projectStructure.description}\n\n`;
            if (arch.projectStructure.monorepo !== undefined) {
                md += `**Monorepo:** ${arch.projectStructure.monorepo ? 'Yes' : 'No'}\n\n`;
            }
            if (arch.projectStructure.structure?.length) {
                md += `\`\`\`\n`;
                arch.projectStructure.structure.forEach(s => {
                    md += `${s.path}${s.purpose ? `  # ${s.purpose}` : ''}\n`;
                });
                md += `\`\`\`\n\n`;
            }
            if (arch.projectStructure.namingConventions?.length) {
                md += `### Naming Conventions\n\n`;
                md += `| Type | Convention | Example |\n|---|---|---|\n`;
                arch.projectStructure.namingConventions.forEach(n => {
                    md += `| ${n.type} | ${n.convention || '-'} | ${n.example || '-'} |\n`;
                });
                md += '\n';
            }
        }

        // Data Flow
        if (arch.dataFlow) {
            md += `## Data Flow\n\n`;
            if (arch.dataFlow.description) md += `${arch.dataFlow.description}\n\n`;
            if (arch.dataFlow.flows?.length) {
                md += `| Flow | Source | Destination | Protocol |\n|---|---|---|---|\n`;
                arch.dataFlow.flows.forEach(f => {
                    md += `| ${f.name} | ${f.source || '-'} | ${f.destination || '-'} | ${f.protocol || '-'} |\n`;
                });
                md += '\n';
            }
        }

        // Security
        if (arch.security) {
            md += `## Security Architecture\n\n`;
            if (arch.security.overview) md += `${arch.security.overview}\n\n`;
            if (arch.security.authentication) {
                md += `### Authentication\n\n`;
                const a = arch.security.authentication;
                if (a.method) md += `- **Method:** ${a.method}\n`;
                if (a.provider) md += `- **Provider:** ${a.provider}\n`;
                if (a.tokenStrategy) md += `- **Token Strategy:** ${a.tokenStrategy}\n`;
                if (a.description) md += `\n${a.description}\n`;
                md += '\n';
            }
            if (arch.security.authorization) {
                md += `### Authorization\n\n`;
                const a = arch.security.authorization;
                if (a.method) md += `**Method:** ${a.method}\n\n`;
                if (a.roles?.length) {
                    md += `**Roles:**\n`;
                    a.roles.forEach(r => {
                        md += `- **${r.role}**${r.permissions?.length ? `: ${r.permissions.join(', ')}` : ''}\n`;
                    });
                    md += '\n';
                }
            }
            if (arch.security.dataProtection) {
                md += `### Data Protection\n\n`;
                const dp = arch.security.dataProtection;
                if (dp.atRest) md += `- **At Rest:** ${dp.atRest}\n`;
                if (dp.inTransit) md += `- **In Transit:** ${dp.inTransit}\n`;
                if (dp.sensitiveData) md += `- **Sensitive Data:** ${dp.sensitiveData}\n`;
                if (dp.pii) md += `- **PII Handling:** ${dp.pii}\n`;
                md += '\n';
            }
        }

        // Deployment
        if (arch.deployment) {
            md += `## Deployment\n\n`;
            if (arch.deployment.strategy) md += `**Strategy:** ${arch.deployment.strategy}\n\n`;
            if (arch.deployment.environments?.length) {
                md += `### Environments\n\n`;
                md += `| Environment | Purpose |\n|---|---|\n`;
                arch.deployment.environments.forEach(e => {
                    md += `| ${e.name} | ${e.purpose || '-'} |\n`;
                });
                md += '\n';
            }
        }

        // Integrations
        if (arch.integrations?.length) {
            md += `## Integrations\n\n`;
            arch.integrations.forEach(i => {
                md += `### ${i.name}${i.type ? ` (${i.type})` : ''}\n\n`;
                if (i.description) md += `${i.description}\n\n`;
                if (i.protocol) md += `**Protocol:** ${i.protocol}\n`;
                if (i.authentication) md += `**Authentication:** ${i.authentication}\n`;
                if (i.dataFormat) md += `**Data Format:** ${i.dataFormat}\n`;
                if (i.sla) md += `**SLA:** ${i.sla}\n`;
                md += '\n';
            });
        }

        return md;
    }

    /**
     * Generate markdown version of test cases
     */
    private generateTestCasesMarkdown(state: BmadArtifacts): string {
        const testCases = state.testCases;
        if (!testCases?.length) return '';

        let md = `# ${state.projectName} - Test Cases\n\n`;

        // Summary table
        const byType: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        testCases.forEach(tc => {
            byType[tc.type] = (byType[tc.type] || 0) + 1;
            byStatus[tc.status] = (byStatus[tc.status] || 0) + 1;
        });

        md += `## Summary\n\n`;
        md += `**Total Test Cases:** ${testCases.length}\n\n`;
        md += `| Type | Count |\n|---|---|\n`;
        Object.entries(byType).forEach(([t, c]) => md += `| ${t} | ${c} |\n`);
        md += '\n';
        md += `| Status | Count |\n|---|---|\n`;
        Object.entries(byStatus).forEach(([s, c]) => md += `| ${s} | ${c} |\n`);
        md += '\n';

        // Group by type
        const types = ['unit', 'integration', 'e2e', 'acceptance'] as const;
        types.forEach(type => {
            const cases = testCases.filter(tc => tc.type === type);
            if (!cases.length) return;

            md += `## ${type.charAt(0).toUpperCase() + type.slice(1)} Tests\n\n`;
            cases.forEach(tc => {
                md += `### ${tc.id}: ${tc.title}\n\n`;
                if (tc.description) md += `${tc.description}\n\n`;
                md += `**Status:** ${tc.status}`;
                if (tc.priority) md += ` | **Priority:** ${tc.priority}`;
                if (tc.storyId) md += ` | **Story:** ${tc.storyId}`;
                if (tc.epicId) md += ` | **Epic:** ${tc.epicId}`;
                md += '\n\n';

                if (tc.preconditions?.length) {
                    md += `**Preconditions:**\n`;
                    tc.preconditions.forEach(p => md += `- ${p}\n`);
                    md += '\n';
                }

                if (tc.steps?.length) {
                    md += `**Steps:**\n\n`;
                    tc.steps.forEach((step, i) => {
                        if (step.given || step.when || step.then) {
                            // BDD format
                            if (step.given) md += `- **Given** ${step.given}\n`;
                            if (step.when) md += `  **When** ${step.when}\n`;
                            if (step.then) md += `  **Then** ${step.then}\n`;
                            if (step.and?.length) step.and.forEach(a => md += `  **And** ${a}\n`);
                        } else if (step.action) {
                            // Step format
                            md += `${step.step || i + 1}. ${step.action}`;
                            if (step.expectedResult) md += ` → ${step.expectedResult}`;
                            md += '\n';
                        } else if (step.description) {
                            md += `${i + 1}. ${step.description}\n`;
                        }
                    });
                    md += '\n';
                }

                if (tc.expectedResult) md += `**Expected Result:** ${tc.expectedResult}\n\n`;

                if (tc.tags?.length) md += `**Tags:** ${tc.tags.join(', ')}\n\n`;

                md += '---\n\n';
            });
        });

        return md;
    }

    /**
     * Generate markdown version of test strategy
     */
    private generateTestStrategyMarkdown(state: BmadArtifacts): string {
        const ts = state.testStrategy;
        if (!ts) return '';

        let md = `# ${state.projectName} - Test Strategy\n\n`;
        md += `**Status:** ${ts.status || 'draft'}\n\n`;

        if (ts.title) md += `## ${ts.title}\n\n`;
        if (ts.scope) md += `## Scope\n\n${ts.scope}\n\n`;
        if (ts.approach) md += `## Approach\n\n${ts.approach}\n\n`;

        if (ts.testTypes?.length) {
            md += `## Test Types\n\n`;
            ts.testTypes.forEach(t => md += `- ${t}\n`);
            md += '\n';
        }

        if (ts.tooling?.length) {
            md += `## Tooling\n\n`;
            ts.tooling.forEach(t => md += `- ${t}\n`);
            md += '\n';
        }

        if (ts.coverageTargets?.length) {
            md += `## Coverage Targets\n\n`;
            md += `| Area | Target |\n|---|---|\n`;
            ts.coverageTargets.forEach(ct => {
                md += `| ${ct.area} | ${ct.target} |\n`;
            });
            md += '\n';
        }

        if (ts.riskAreas?.length) {
            md += `## Risk Areas\n\n`;
            ts.riskAreas.forEach(r => md += `- ${r}\n`);
            md += '\n';
        }

        return md;
    }

    /**
     * Generate markdown version of test design
     */
    private generateTestDesignMarkdown(state: BmadArtifacts): string {
        const td = state.testDesign;
        if (!td) return '';

        let md = `# ${state.projectName} - Test Design\n\n`;
        md += `**Status:** ${td.status || 'draft'}\n\n`;

        // Epic info
        if (td.epicInfo) {
            const ei = td.epicInfo;
            md += `## Epic Information\n\n`;
            if (ei.epicId) md += `- **Epic ID:** ${ei.epicId}\n`;
            if (ei.epicTitle) md += `- **Title:** ${ei.epicTitle}\n`;
            if (ei.epicGoal) md += `- **Goal:** ${ei.epicGoal}\n`;
            if (ei.prdReference) md += `- **PRD Reference:** ${ei.prdReference}\n`;
            if (ei.architectureReference) md += `- **Architecture Reference:** ${ei.architectureReference}\n`;
            if (ei.storyCount != null) md += `- **Story Count:** ${ei.storyCount}\n`;
            md += '\n';
        }

        // Summary
        if (td.summary) {
            const s = td.summary;
            md += `## Summary\n\n`;
            if (s.scope) md += `**Scope:** ${s.scope}\n\n`;
            if (s.approach) md += `**Approach:** ${s.approach}\n\n`;
            if (s.riskSummary) md += `**Risk Summary:** ${s.riskSummary}\n\n`;
            if (s.coverageSummary) md += `**Coverage Summary:** ${s.coverageSummary}\n\n`;
            if (s.objectives?.length) {
                md += `### Objectives\n\n`;
                s.objectives.forEach(o => md += `- ${o}\n`);
                md += '\n';
            }
            if (s.testLevels?.length) {
                md += `### Test Levels\n\n`;
                md += `| Level | Purpose | Coverage |\n|---|---|---|\n`;
                s.testLevels.forEach(tl => {
                    md += `| ${tl.level || ''} | ${tl.purpose || ''} | ${tl.coverage || ''} |\n`;
                });
                md += '\n';
            }
            if (s.keyDecisions?.length) {
                md += `### Key Decisions\n\n`;
                s.keyDecisions.forEach(d => md += `- ${d}\n`);
                md += '\n';
            }
        }

        // Not in scope
        if (td.notInScope?.length) {
            md += `## Not In Scope\n\n`;
            td.notInScope.forEach(nis => {
                md += `- **${nis.item || 'N/A'}** — ${nis.reason || 'No reason given'}`;
                if (nis.riskAccepted) md += ` (risk accepted)`;
                md += '\n';
            });
            md += '\n';
        }

        // Risk assessment
        if (td.riskAssessment) {
            const ra = td.riskAssessment;
            md += `## Risk Assessment\n\n`;
            if (ra.overview) md += `${ra.overview}\n\n`;
            const renderRisks = (label: string, risks?: any[]) => {
                if (!risks?.length) return;
                md += `### ${label}\n\n`;
                risks.forEach(r => {
                    md += `- **${r.riskId || 'N/A'}** [${r.category || ''}]: ${r.description || ''}\n`;
                    md += `  - Probability: ${r.probability || '?'} | Impact: ${r.impact || '?'} | Score: ${r.score ?? '?'}\n`;
                    if (r.testStrategy) md += `  - Test Strategy: ${r.testStrategy}\n`;
                    if (r.mitigation) md += `  - Mitigation: ${r.mitigation}\n`;
                });
                md += '\n';
            };
            renderRisks('High Priority', ra.highPriority);
            renderRisks('Medium Priority', ra.mediumPriority);
            renderRisks('Low Priority', ra.lowPriority);
        }

        // Entry/Exit criteria
        if (td.entryExitCriteria) {
            const eec = td.entryExitCriteria;
            md += `## Entry & Exit Criteria\n\n`;
            if (eec.entry?.length) {
                md += `### Entry Criteria\n\n`;
                eec.entry.forEach(e => {
                    md += `- ${e.criterion || ''}`;
                    if (e.mandatory) md += ` **(mandatory)**`;
                    if (e.verification) md += ` — Verification: ${e.verification}`;
                    md += '\n';
                });
                md += '\n';
            }
            if (eec.exit?.length) {
                md += `### Exit Criteria\n\n`;
                eec.exit.forEach(e => {
                    md += `- ${e.criterion || ''}`;
                    if (e.mandatory) md += ` **(mandatory)**`;
                    if (e.threshold) md += ` — Threshold: ${e.threshold}`;
                    md += '\n';
                });
                md += '\n';
            }
        }

        // Coverage plan
        if (td.coveragePlan) {
            const cp = td.coveragePlan;
            md += `## Coverage Plan\n\n`;
            if (cp.overview) md += `${cp.overview}\n\n`;
            if (cp.coverageGoals) {
                const cg = cp.coverageGoals;
                md += `### Coverage Goals\n\n`;
                if (cg.codeStatement) md += `- Code Statement: ${cg.codeStatement}\n`;
                if (cg.codeBranch) md += `- Code Branch: ${cg.codeBranch}\n`;
                if (cg.requirementCoverage) md += `- Requirement Coverage: ${cg.requirementCoverage}\n`;
                if (cg.riskCoverage) md += `- Risk Coverage: ${cg.riskCoverage}\n`;
                md += '\n';
            }
            const renderCoverage = (label: string, items?: any[]) => {
                if (!items?.length) return;
                md += `### ${label}\n\n`;
                md += `| ID | Requirement | Level | Type | Approach | Automatable |\n|---|---|---|---|---|---|\n`;
                items.forEach(i => {
                    md += `| ${i.id || ''} | ${i.requirement || ''} | ${i.testLevel || ''} | ${i.testType || ''} | ${i.testApproach || ''} | ${i.automatable ?? ''} |\n`;
                });
                md += '\n';
            };
            renderCoverage('P0 — Critical', cp.p0);
            renderCoverage('P1 — High', cp.p1);
            renderCoverage('P2 — Medium', cp.p2);
            renderCoverage('P3 — Low', cp.p3);
        }

        // Test cases (brief listing)
        if (td.testCases?.length) {
            md += `## Test Cases\n\n`;
            md += `| ID | Title | Priority | Type | Level |\n|---|---|---|---|---|\n`;
            td.testCases.forEach(tc => {
                md += `| ${tc.id || ''} | ${tc.title || ''} | ${tc.priority || ''} | ${tc.type || ''} | ${tc.level || ''} |\n`;
            });
            md += '\n';
        }

        // Execution order
        if (td.executionOrder) {
            const eo = td.executionOrder;
            md += `## Execution Order\n\n`;
            if (eo.overview) md += `${eo.overview}\n\n`;
            if (eo.smoke?.length) {
                md += `### Smoke Tests\n\n`;
                eo.smoke.forEach(s => md += `${s.order ?? '?'}. ${s.testId || ''}: ${s.description || ''}\n`);
                md += '\n';
            }
        }

        // Resource estimates
        if (td.resourceEstimates) {
            const re = td.resourceEstimates;
            md += `## Resource Estimates\n\n`;
            if (re.totalEffort) md += `**Total Effort:** ${re.totalEffort}\n\n`;
            if (re.breakdown?.length) {
                md += `| Activity | Effort | Resources | Duration |\n|---|---|---|---|\n`;
                re.breakdown.forEach(b => {
                    md += `| ${b.activity || ''} | ${b.effort || ''} | ${b.resources ?? ''} | ${b.duration || ''} |\n`;
                });
                md += '\n';
            }
        }

        // Quality gate criteria
        if (td.qualityGateCriteria?.length) {
            md += `## Quality Gate Criteria\n\n`;
            td.qualityGateCriteria.forEach(qg => {
                md += `- **${qg.criterion || ''}** — Threshold: ${qg.threshold || 'N/A'}`;
                if (qg.mandatory) md += ` **(mandatory)**`;
                md += '\n';
            });
            md += '\n';
        }

        return md;
    }

    /**
     * Generate a combined markdown document covering all artifacts in the project.
     * Used by the export command when "markdown" or "all formats" is selected.
     */
    generateAllArtifactsMarkdown(state: BmadArtifacts): string {
        const sections: string[] = [];

        const pbMd = this.generateProductBriefMarkdown(state);
        if (pbMd) sections.push(pbMd);

        const prdMd = this.generatePRDMarkdown(state);
        if (prdMd) sections.push(prdMd);

        const epicsMd = this.generateEpicsMarkdown(state);
        if (epicsMd) sections.push(epicsMd);

        const archMd = this.generateArchitectureMarkdown(state);
        if (archMd) sections.push(archMd);

        const tcMd = this.generateTestCasesMarkdown(state);
        if (tcMd) sections.push(tcMd);

        const tsMd = this.generateTestStrategyMarkdown(state);
        if (tsMd) sections.push(tsMd);

        const tdMd = this.generateTestDesignMarkdown(state);
        if (tdMd) sections.push(tdMd);

        // TEA module artifacts
        const genericArtifacts: { slug: string; data: Record<string, unknown> | undefined }[] = [
            { slug: 'traceability-matrix', data: state.traceabilityMatrix },
            { slug: 'test-review', data: state.testReview },
            { slug: 'nfr-assessment', data: state.nfrAssessment },
            { slug: 'test-framework', data: state.testFramework },
            { slug: 'ci-pipeline', data: state.ciPipeline },
            { slug: 'automation-summary', data: state.automationSummary },
            { slug: 'atdd-checklist', data: state.atddChecklist },
            // BMM module artifacts
            { slug: 'research', data: state.research },
            { slug: 'ux-design', data: state.uxDesign },
            { slug: 'readiness-report', data: state.readinessReport },
            { slug: 'sprint-status', data: state.sprintStatus },
            { slug: 'retrospective', data: state.retrospective },
            { slug: 'change-proposal', data: state.changeProposal },
            { slug: 'code-review', data: state.codeReview },
            { slug: 'risks', data: state.risks },
            { slug: 'definition-of-done', data: state.definitionOfDone },
            { slug: 'project-overview', data: state.projectOverview },
            { slug: 'project-context', data: state.projectContext },
            { slug: 'tech-spec', data: state.techSpec },
            // CIS module artifacts
            { slug: 'storytelling', data: state.storytelling },
            { slug: 'problem-solving', data: state.problemSolving },
            { slug: 'innovation-strategy', data: state.innovationStrategy },
            { slug: 'design-thinking', data: state.designThinking },
        ];

        for (const { slug, data } of genericArtifacts) {
            if (data) {
                const md = this.generateGenericArtifactMarkdown(slug, data, state);
                if (md) sections.push(md);
            }
        }

        if (sections.length === 0) {
            return `# ${state.projectName}\n\nNo artifacts have been created yet.\n`;
        }

        return sections.join('\n\n---\n\n');
    }

    /**
     * Export artifacts in various formats
     */
    async exportArtifacts(format: string, targetUri?: vscode.Uri): Promise<vscode.Uri | null> {
        const state = this.getState();

        switch (format) {
            case 'json': {
                if (!targetUri) return null;
                await vscode.workspace.fs.writeFile(
                    targetUri,
                    Buffer.from(JSON.stringify(state, null, 2), 'utf-8')
                );
                return targetUri;
            }

            case 'markdown': {
                if (!targetUri) return null;
                await vscode.workspace.fs.writeFile(
                    targetUri,
                    Buffer.from(this.generateAllArtifactsMarkdown(state), 'utf-8')
                );
                return targetUri;
            }

            case 'jira csv': {
                if (!targetUri) return null;
                await vscode.workspace.fs.writeFile(
                    targetUri,
                    Buffer.from(this.generateJiraCSV(state), 'utf-8')
                );
                return targetUri;
            }

            case 'pdf': {
                if (!targetUri) return null;
                const pdfBuffer = await this.generatePDF(state);
                await vscode.workspace.fs.writeFile(targetUri, pdfBuffer);
                return targetUri;
            }

            case 'all formats': {
                if (!targetUri) return null;
                // targetUri is a folder; write all three formats into it
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                try {
                    await vscode.workspace.fs.createDirectory(targetUri);
                } catch { /* folder might exist */ }

                const jsonUri = vscode.Uri.joinPath(targetUri, `bmad-export-${timestamp}.json`);
                await vscode.workspace.fs.writeFile(
                    jsonUri,
                    Buffer.from(JSON.stringify(state, null, 2), 'utf-8')
                );
                const mdUri = vscode.Uri.joinPath(targetUri, `bmad-export-${timestamp}.md`);
                await vscode.workspace.fs.writeFile(
                    mdUri,
                    Buffer.from(this.generateAllArtifactsMarkdown(state), 'utf-8')
                );
                const csvUri = vscode.Uri.joinPath(targetUri, `bmad-jira-${timestamp}.csv`);
                await vscode.workspace.fs.writeFile(
                    csvUri,
                    Buffer.from(this.generateJiraCSV(state), 'utf-8')
                );
                const pdfUri = vscode.Uri.joinPath(targetUri, `bmad-export-${timestamp}.pdf`);
                const pdfBuf = await this.generatePDF(state);
                await vscode.workspace.fs.writeFile(pdfUri, pdfBuf);
                return targetUri;
            }
        }

        return null;
    }

    /**
     * Generate JIRA-compatible CSV.
     *
     * Uses RFC 4180 encoding (double-quote escaping) and formula injection
     * protection.  10 user-controlled string fields flow through csvEscape().
     */
    private generateJiraCSV(state: BmadArtifacts): string {
        const headers = ['Issue Type', 'Summary', 'Description', 'Epic Link', 'Story Points', 'Acceptance Criteria'];
        const rows = [headers.join(',')];

        state.epics?.forEach(epic => {
            // Epic row
            rows.push([
                'Epic',
                csvEscape(epic.title),
                csvEscape(epic.goal),
                '',
                '',
                ''
            ].join(','));

            // Story rows
            epic.stories?.forEach(story => {
                const acText = story.acceptanceCriteria.map(ac => 
                    ac.criterion
                        ? ac.criterion
                        : `Given ${ac.given}, When ${ac.when}, Then ${ac.then}`
                ).join('; ');

                rows.push([
                    'Story',
                    csvEscape(story.title),
                    csvEscape(`As a ${story.userStory.asA}, I want ${story.userStory.iWant}, so that ${story.userStory.soThat}`),
                    csvEscape(epic.title),
                    story.storyPoints?.toString() || '',
                    csvEscape(acText)
                ].join(','));
            });
        });

        return rows.join('\n');
    }

    /**
     * Generate a styled PDF document from the project artifacts.
     *
     * Converts the markdown representation into a structured PDF using PDFKit
     * with proper headings, bullet lists, horizontal rules, and styled sections.
     * Uses only built-in PDF fonts (Helvetica family) for portability.
     */
    private async generatePDF(state: BmadArtifacts): Promise<Uint8Array> {
        const markdown = this.generateAllArtifactsMarkdown(state);

        return new Promise<Uint8Array>((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margins: { top: 56, bottom: 56, left: 56, right: 56 },
                    info: {
                        Title: `${state.projectName} — Agile Agent Canvas Export`,
                        Author: 'Agile Agent Canvas',
                        Subject: 'Project Artifacts',
                        Creator: 'Agile Agent Canvas VSCode Extension',
                    },
                    bufferPages: true,
                    autoFirstPage: true,
                });

                // Collect PDF into a buffer
                const chunks: Buffer[] = [];
                doc.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                });
                doc.on('end', () => {
                    const buf = Buffer.concat(chunks);
                    resolve(buf);
                });
                doc.on('error', (err: Error) => {
                    reject(err);
                });

            // ── Color palette ──
            const COLORS = {
                title: '#1a1d23',
                heading1: '#2b2d42',
                heading2: '#3a3d56',
                heading3: '#555770',
                body: '#333340',
                muted: '#6b7280',
                accent: '#3b82f6',
                rule: '#d1d5db',
                bullet: '#6366f1',
                bgSection: '#f8f9fb',
                codeBackground: '#f3f4f6',
                codeBorder: '#e5e7eb',
            };

            const PAGE_WIDTH = doc.page.width - doc.page.margins.left - doc.page.margins.right;

            // ── Helper: check page space and add page if needed ──
            // Returns true if a new page was added.
            const ensureSpace = (needed: number): boolean => {
                const bottom = doc.page.height - doc.page.margins.bottom;
                if (doc.y + needed > bottom) {
                    doc.addPage();
                    return true;
                }
                return false;
            };

            // Track whether we're at the top of a fresh page so we can
            // suppress leading whitespace (moveDown) that would otherwise
            // produce empty space at the top of a new page.
            let atPageTop = true;  // first page starts at top

            // Conditional moveDown that skips if we're at the top of a page
            const smartMoveDown = (lines: number) => {
                if (!atPageTop) {
                    doc.moveDown(lines);
                }
            };

            // ── Helper: draw horizontal rule ──
            const drawRule = () => {
                const added = ensureSpace(16);
                if (added) { atPageTop = true; }
                smartMoveDown(0.4);
                const y = doc.y;
                doc.strokeColor(COLORS.rule).lineWidth(0.5)
                    .moveTo(doc.page.margins.left, y)
                    .lineTo(doc.page.margins.left + PAGE_WIDTH, y)
                    .stroke();
                doc.moveDown(0.6);
                atPageTop = false;
            };

            // ── Cover section ──
            doc.fontSize(28).font('Helvetica-Bold').fillColor(COLORS.title)
                .text(state.projectName, { align: 'left' });
            doc.moveDown(0.3);
            doc.fontSize(12).font('Helvetica').fillColor(COLORS.muted)
                .text(`AgentCanvas Project Export  •  ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'left' });
            doc.moveDown(0.2);
            drawRule();
            doc.moveDown(0.3);
            atPageTop = false;

            // ── Parse markdown line by line ──
            const lines = markdown.split('\n');
            let inCodeBlock = false;
            let codeBlockLines: string[] = [];
            let consecutiveEmptyLines = 0; // track to collapse runs of blank lines

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // ── Code blocks ──
                if (line.startsWith('```')) {
                    consecutiveEmptyLines = 0;
                    if (inCodeBlock) {
                        // End of code block: render collected lines
                        if (ensureSpace(14 * codeBlockLines.length + 16)) { atPageTop = true; }
                        const codeText = codeBlockLines.join('\n');
                        const codeX = doc.page.margins.left;
                        const codeY = doc.y;
                        // Measure text height
                        doc.font('Courier').fontSize(9);
                        const codeHeight = doc.heightOfString(codeText, {
                            width: PAGE_WIDTH - 16,
                        });
                        // Background rect
                        doc.save();
                        doc.roundedRect(codeX, codeY, PAGE_WIDTH, codeHeight + 12, 3)
                            .fill(COLORS.codeBackground);
                        doc.restore();
                        doc.fontSize(9).font('Courier').fillColor(COLORS.body)
                            .text(codeText, codeX + 8, codeY + 6, { width: PAGE_WIDTH - 16 });
                        doc.y = codeY + codeHeight + 16;
                        codeBlockLines = [];
                        inCodeBlock = false;
                        atPageTop = false;
                    } else {
                        inCodeBlock = true;
                        codeBlockLines = [];
                    }
                    continue;
                }

                if (inCodeBlock) {
                    codeBlockLines.push(line);
                    continue;
                }

                // ── Horizontal rules (---) ──
                if (/^---+$/.test(line.trim())) {
                    consecutiveEmptyLines = 0;
                    drawRule();
                    continue;
                }

                // ── Empty lines ──
                // Collapse runs of consecutive empty lines: only allow the
                // first one to add vertical space.  Also skip if we're at
                // the top of a fresh page.
                if (line.trim() === '') {
                    consecutiveEmptyLines++;
                    if (consecutiveEmptyLines <= 1 && !atPageTop) {
                        doc.moveDown(0.3);
                    }
                    continue;
                }

                // Any non-empty line resets the counter
                consecutiveEmptyLines = 0;

                // ── Headings ──
                const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
                if (headingMatch) {
                    const level = headingMatch[1].length;
                    const text = headingMatch[2].replace(/\*\*/g, ''); // strip bold markers

                    if (level === 1) {
                        const added = ensureSpace(40);
                        if (added) { atPageTop = true; }
                        smartMoveDown(0.4);
                        doc.fontSize(22).font('Helvetica-Bold').fillColor(COLORS.heading1)
                            .text(text, { align: 'left' });
                        atPageTop = false;
                        doc.moveDown(0.2);
                        // Accent underline for H1
                        const underY = doc.y;
                        doc.strokeColor(COLORS.accent).lineWidth(2)
                            .moveTo(doc.page.margins.left, underY)
                            .lineTo(doc.page.margins.left + Math.min(PAGE_WIDTH, 200), underY)
                            .stroke();
                        doc.moveDown(0.3);
                    } else if (level === 2) {
                        const added = ensureSpace(32);
                        if (added) { atPageTop = true; }
                        smartMoveDown(0.3);
                        doc.fontSize(16).font('Helvetica-Bold').fillColor(COLORS.heading2)
                            .text(text, { align: 'left' });
                        atPageTop = false;
                        doc.moveDown(0.2);
                    } else if (level === 3) {
                        const added = ensureSpace(26);
                        if (added) { atPageTop = true; }
                        smartMoveDown(0.25);
                        doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORS.heading3)
                            .text(text, { align: 'left' });
                        atPageTop = false;
                        doc.moveDown(0.15);
                    } else {
                        const added = ensureSpace(22);
                        if (added) { atPageTop = true; }
                        smartMoveDown(0.2);
                        doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.heading3)
                            .text(text, { align: 'left' });
                        atPageTop = false;
                        doc.moveDown(0.1);
                    }
                    continue;
                }

                // ── Bullet/numbered lists ──
                const bulletMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
                const numberMatch = !bulletMatch ? line.match(/^(\s*)\d+\.\s+(.+)$/) : null;
                if (bulletMatch || numberMatch) {
                    const match = (bulletMatch || numberMatch)!;
                    const indent = Math.floor(match[1].length / 2);
                    const text = this.stripMarkdownInline(match[2]);
                    const indentPx = 12 + indent * 14;

                    if (ensureSpace(16)) { atPageTop = true; }

                    if (bulletMatch) {
                        // Draw bullet dot
                        const bulletY = doc.y + 5;
                        doc.save();
                        doc.circle(doc.page.margins.left + indentPx - 6, bulletY, 2)
                            .fill(COLORS.bullet);
                        doc.restore();
                    } else {
                        // Keep the number
                        const numText = line.match(/^(\s*)(\d+\.)\s/)?.[2] || '•';
                        doc.fontSize(10).font('Helvetica').fillColor(COLORS.muted)
                            .text(numText, doc.page.margins.left + indentPx - 18, doc.y, { width: 16, align: 'right', continued: false });
                        // Move back up to same line
                        doc.y -= doc.currentLineHeight();
                    }

                    doc.fontSize(10).font('Helvetica').fillColor(COLORS.body)
                        .text(text, doc.page.margins.left + indentPx + 2, doc.y, {
                            width: PAGE_WIDTH - indentPx - 2,
                        });
                    atPageTop = false;
                    continue;
                }

                // ── Bold-prefixed lines (label: value) like **Status:** Ready ──
                const boldLabelMatch = line.match(/^\*\*(.+?)[:]\*\*\s*(.*)$/);
                if (boldLabelMatch) {
                    if (ensureSpace(16)) { atPageTop = true; }
                    const label = boldLabelMatch[1] + ':';
                    const value = this.stripMarkdownInline(boldLabelMatch[2]);
                    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.body)
                        .text(label, { continued: !!value });
                    if (value) {
                        doc.font('Helvetica').fillColor(COLORS.body)
                            .text(' ' + value);
                    } else {
                        doc.text('');
                    }
                    atPageTop = false;
                    continue;
                }

                // ── Table rows (basic: | col | col | col |) ──
                if (line.trim().startsWith('|')) {
                    // Skip separator rows like |---|---|
                    if (/^\|[\s\-:|]+\|$/.test(line.trim())) continue;

                    const cells = line.split('|').filter(c => c.trim() !== '');
                    if (cells.length > 0) {
                        if (ensureSpace(16)) { atPageTop = true; }
                        const cellWidth = PAGE_WIDTH / cells.length;
                        const startY = doc.y;
                        // Detect header row (first table row after any non-table content)
                        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
                        const isHeader = /^\|[\s\-:|]+\|$/.test(nextLine.trim());

                        cells.forEach((cell, ci) => {
                            const cellText = this.stripMarkdownInline(cell.trim());
                            doc.fontSize(9)
                                .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
                                .fillColor(isHeader ? COLORS.heading3 : COLORS.body)
                                .text(cellText, doc.page.margins.left + ci * cellWidth, startY, {
                                    width: cellWidth - 4,
                                    height: 14,
                                    ellipsis: true,
                                });
                        });
                        doc.y = startY + 14;
                        // Light underline
                        doc.strokeColor(COLORS.rule).lineWidth(0.3)
                            .moveTo(doc.page.margins.left, doc.y)
                            .lineTo(doc.page.margins.left + PAGE_WIDTH, doc.y)
                            .stroke();
                        doc.moveDown(0.1);
                        atPageTop = false;
                    }
                    continue;
                }

                // ── Regular paragraph text ──
                if (ensureSpace(14)) { atPageTop = true; }
                const plainText = this.stripMarkdownInline(line);
                doc.fontSize(10).font('Helvetica').fillColor(COLORS.body)
                    .text(plainText, { align: 'left', lineGap: 2 });
                atPageTop = false;
            }

            // ── Footer on each page ──
            const pageCount = doc.bufferedPageRange();
            for (let p = pageCount.start; p < pageCount.start + pageCount.count; p++) {
                doc.switchToPage(p);
                const bottom = doc.page.height - 30;
                doc.fontSize(8).font('Helvetica').fillColor(COLORS.muted)
                    .text(
                        `${state.projectName}  •  Page ${p + 1} of ${pageCount.count}`,
                        doc.page.margins.left,
                        bottom,
                        { width: PAGE_WIDTH, align: 'center' }
                    );
            }

            doc.end();
            } catch (syncErr: unknown) {
                const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
                reject(syncErr);
            }
        });
    }

    /**
     * Strip inline markdown formatting (bold, italic, code, links) to plain text.
     */
    private stripMarkdownInline(text: string): string {
        return text
            .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
            .replace(/\*(.+?)\*/g, '$1')         // italic
            .replace(/__(.+?)__/g, '$1')          // bold alt
            .replace(/_(.+?)_/g, '$1')            // italic alt
            .replace(/`(.+?)`/g, '$1')            // inline code
            .replace(/\[(.+?)\]\(.+?\)/g, '$1')   // links
            .replace(/~~(.+?)~~/g, '$1');          // strikethrough
    }

    /**
     * Load a full state object into the store (used by import "Replace" mode).
     * Expects a BmadArtifacts-shaped object (the same shape as getState() returns
     * or the JSON export format).
     */
    loadFromState(data: Partial<BmadArtifacts>): void {
        if (data.projectName !== undefined) this.artifacts.set('projectName', data.projectName);
        if (data.currentStep !== undefined) this.artifacts.set('currentStep', data.currentStep);
        if (data.vision !== undefined) this.artifacts.set('vision', data.vision);
        if (data.requirements !== undefined) this.artifacts.set('requirements', data.requirements);
        if (data.epics !== undefined) this.artifacts.set('epics', data.epics);
        if (data.aiCursor !== undefined) this.artifacts.set('aiCursor', data.aiCursor);
        if (data.prd !== undefined) this.artifacts.set('prd', data.prd);
        if (data.architecture !== undefined) this.artifacts.set('architecture', data.architecture);
        if (data.productBrief !== undefined) this.artifacts.set('productBrief', data.productBrief);
        if (data.testCases !== undefined) this.artifacts.set('testCases', data.testCases);
        if (data.testStrategy !== undefined) this.artifacts.set('testStrategy', data.testStrategy);
        this.notifyChange();
        acOutput.appendLine(`[ArtifactStore] loadFromState: loaded project "${data.projectName || '(unnamed)'}"`);
    }

    /**
     * Merge imported state into existing state (used by import "Merge" mode).
     * Adds new items without removing existing ones. For arrays (epics, requirements,
     * test cases) items are deduplicated by ID; for singleton artifacts (vision, prd,
     * architecture, productBrief, testStrategy) existing values are preserved.
     */
    mergeFromState(data: Partial<BmadArtifacts>): void {
        // Project name: only overwrite if currently empty
        if (data.projectName && !this.artifacts.get('projectName')) {
            this.artifacts.set('projectName', data.projectName);
        }

        // Singleton artifacts: keep existing, fill empty slots
        if (data.vision && !this.artifacts.get('vision')) {
            this.artifacts.set('vision', data.vision);
        }
        if (data.prd && !this.artifacts.get('prd')) {
            this.artifacts.set('prd', data.prd);
        }
        if (data.architecture && !this.artifacts.get('architecture')) {
            this.artifacts.set('architecture', data.architecture);
        }
        if (data.productBrief && !this.artifacts.get('productBrief')) {
            this.artifacts.set('productBrief', data.productBrief);
        }
        if (data.testStrategy && !this.artifacts.get('testStrategy')) {
            this.artifacts.set('testStrategy', data.testStrategy);
        }

        // Epics: merge by ID (add new epics, merge new stories into existing epics)
        if (data.epics && data.epics.length > 0) {
            const existing: Epic[] = this.artifacts.get('epics') || [];
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
            this.artifacts.set('epics', existing);
        }

        // Requirements: merge by ID
        if (data.requirements) {
            const existing = this.artifacts.get('requirements') || { functional: [], nonFunctional: [], additional: [] };
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
            this.artifacts.set('requirements', existing);
        }

        // Test cases: merge by ID
        if (data.testCases && data.testCases.length > 0) {
            const existing: TestCase[] = this.artifacts.get('testCases') || [];
            const existingIds = new Set(existing.map(tc => tc.id));
            for (const tc of data.testCases) {
                if (!existingIds.has(tc.id)) {
                    existing.push(tc);
                }
            }
            this.artifacts.set('testCases', existing);
        }

        this.notifyChange();
        acOutput.appendLine(`[ArtifactStore] mergeFromState: merged data into current project`);
    }

    /**
     * Dispose resources
     */
    dispose() {
        this._onDidChangeArtifacts.dispose();
    }

    /**
     * Store artifact context for AI refinement
     * Used by chat participant to access artifact being refined
     */
    private refineContext: any = null;

    /** Pending workflow launch — set by launchBmmWorkflow, consumed by chat participant */
    private pendingWorkflowLaunch: { triggerPhrase: string; workflowFilePath: string } | null = null;

    setRefineContext(artifact: any): void {
        this.refineContext = artifact;
    }

    getRefineContext(): any {
        return this.refineContext;
    }

    clearRefineContext(): void {
        this.refineContext = null;
    }

    setPendingWorkflowLaunch(ctx: { triggerPhrase: string; workflowFilePath: string }): void {
        this.pendingWorkflowLaunch = ctx;
    }

    getPendingWorkflowLaunch(): { triggerPhrase: string; workflowFilePath: string } | null {
        return this.pendingWorkflowLaunch;
    }

    clearPendingWorkflowLaunch(): void {
        this.pendingWorkflowLaunch = null;
    }

    /**
     * Find an artifact by ID across all types
     */
    findArtifactById(id: string): { type: string; artifact: any } | null {
        const state = this.getState();
        
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
        
        return null;
    }

    // ============================================
    // ARTIFACT SELECTION (for workflow progress panel)
    // ============================================

    /**
     * Set the currently selected artifact
     * This triggers the workflow progress panel to update
     */
    setSelectedArtifact(type: string, id: string): void {
        const found = this.findArtifactById(id);
        if (found) {
            // Use the authoritative type from findArtifactById; the caller may
            // have guessed incorrectly from an ID prefix.
            this._selectedArtifact = { type: found.type, id, artifact: found.artifact };
            acOutput.appendLine(`[ArtifactStore] Selected artifact: ${found.type} ${id}`);
            this._onDidChangeSelection.fire();
        }
    }

    /**
     * Get the currently selected artifact
     */
    getSelectedArtifact(): { type: string; id: string; artifact: any } | null {
        return this._selectedArtifact;
    }

    /**
     * Clear the selection
     */
    clearSelection(): void {
        this._selectedArtifact = null;
        this._onDidChangeSelection.fire();
    }

    /**
     * Check if an artifact is selected
     */
    hasSelection(): boolean {
        return this._selectedArtifact !== null;
    }
}
