import * as vscode from 'vscode';

import { BMAD_RESOURCE_DIR } from './constants';
import { openChat } from '../commands/chat-bridge';
import { createLogger } from '../utils/logger';
import { SprintStatusSync } from './sprint-status-sync';
import { ArtifactFileWriter } from './artifact-file-writer';
import { ArtifactMigrator } from './artifact-migrator';
import { addEpic, addStory, addRequirement, createEpic, createStory, createRequirement, createOrUpdateVision, createUseCase, createProductBrief, createPRD, createArchitecture, createTestCase, createTestStrategy } from './artifact-factory';
import { backupArtifactFiles, pruneOldBackups } from './artifact-backup';
import { findAllJsonFiles, detectArtifactType, loadUiState, loadEpicStoryRefs, removeStoryLinksFromRequirements, syncRequirementLinks, checkForInlineStories, reconcileDerivedState } from './artifact-load-helpers';
import { findArtifactById, mergeFromState } from './artifact-merge';
import { ArtifactRepairer } from './artifact-repair';
import { exportArtifacts } from './artifact-exporter';
import { mapSchemaEpicToInternal, mergeEpicDuplicate, extractStoryId, mapSchemaStoryToInternal, mapStatus, mapSchemaRequirement, mapSchemaNonFunctionalRequirement, mapSchemaAdditionalRequirement } from './schema-mappers';
import { repairArtifactData } from './schema-artifact-mapper';
import { writeMarkdownCompanion, normalizeLegacyArtifact } from './artifact-file-io';
import { schemaValidator } from './schema-validator';
import { harnessEngine } from '../harness/policy-engine';
import {
    BmadArtifacts,
    BmadMetadata,
    BmadArtifactChange,
    BmadArtifactTypeMap,
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
    TargetUser,
    SuccessMetric,
    StoryUxReference,
    StoryReference,
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
    PrdTechnicalRequirement,
    PrdApproval,
    PrdAppendix,
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
} from '../types';    // Re-export all types so existing imports of these from artifact-store still work
export {
    BmadArtifacts,
    BmadMetadata,
    BmadArtifactChange,
    BmadArtifactTypeMap,
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
    TargetUser,
    SuccessMetric,
    StoryUxReference,
    StoryReference,
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
    PrdTechnicalRequirement,
    PrdApproval,
    PrdAppendix,
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

const storeLogger = createLogger('artifact-store');
const logDebug = (...args: unknown[]) => storeLogger.debug(...args);



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
    
    // Harness governance failures event (Epic 4)
    private _onHarnessFailures = new vscode.EventEmitter<any[]>();
    readonly onHarnessFailures = this._onHarnessFailures.event;

    
    // Track source files for writing back
    private sourceFolder: vscode.Uri | null = null;
    private sourceFiles: Map<string, vscode.Uri> = new Map();
    /**
     * Canonical key for a per-id entry stored in {@link sourceFiles}.
     *
     * Format: `${prefix}:${id}`. Producers (sync functions, see
     * {@link syncArrayArtifacts}) `set` per-id files with this helper;
     * consumers (`{@link getArtifactFileUri}`, `{@link readArtifactFile}`)
     * use the same shape for the strict per-id lookup branch + the
     * prefix-iter fallback. Centralizing the format ensures a future
     * per-id type added by a plugin cannot drift the key shape (for
     * example, by using `|` or `.` separators) and silently miss the
     * downstream lookup.
     */
    private static perIdKey(prefix: string, id: string): string {
        return `${prefix}:${id}`;
    }

    
    // Track selected artifact for context-aware workflow progress
    private _selectedArtifact: { type: string; id: string; artifact: any } | null = null;

    // Self-write suppression: tracks when syncToFiles is in flight (or recently completed)
    // so the file watcher can skip notifications caused by our own writes.
    private _syncingUntil = 0;

    // Dirty flag: set to true whenever in-memory state changes and needs syncing.
    // syncToFiles() checks this and skips if nothing changed (L4).
    private _dirty = false;

    // Migration nudge: shown at most once per session to avoid nagging.
    private _migrationPromptShown = false;

    // Simple async lock: prevents concurrent fixSchemas / syncToFiles calls from
    // interleaving writes and reads.  Callers should check `isFixInProgress()`
    // before starting a fix, or await the promise stored here.
    private _fixInProgress: Promise<void> | null = null;
    private sprintSync: SprintStatusSync;
    private fileWriter: ArtifactFileWriter;
    private migrator: ArtifactMigrator;
    private repairer: ArtifactRepairer;



    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.artifacts = new Map();

        // Initialize default state
        this.initializeDefaultState();
        this.sprintSync = new SprintStatusSync(() => this.sourceFolder, () => this.artifacts, () => this.sourceFiles, () => this.getOutputFormat(), (ms: number) => { this._syncingUntil = ms; }, () => this.getOutputChannel(), () => this.notifyChange());
        this.fileWriter = new ArtifactFileWriter(
      this.sourceFiles,
      () => this.sourceFolder,
      () => this.getOutputFormat(),
      {
        reloadState: (folderUri: vscode.Uri) => this.loadFromFolder(folderUri),
        syncFiles: () => this.syncToFiles(),
      },
    );
        this.migrator = new ArtifactMigrator(
            () => this.sourceFolder,
            () => this.sourceFiles,
            () => this.getOutputChannel(),
            () => this.getOutputFormat(),
            (folderUri: vscode.Uri) => this.loadFromFolder(folderUri),
            () => this.syncToFiles(),
        );
        this.repairer = new ArtifactRepairer(
            () => this.sourceFolder,
            (ms: number) => { this._syncingUntil = ms; },
            () => this.markDirty(),
            () => this.getOutputFormat(),
            () => this.syncToFiles(),
            (folderUri: vscode.Uri) => this.findAllJsonFiles(folderUri),
            (data: any, fileName: string) => this.detectArtifactType(data, fileName),
        );
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
    /**
     * Harness post-flight checks + derived state reconciliation + notification.
     * Runs advisory post-flight policies on all in-memory artifacts, then
     * reconciles derived state and fires change events.
     */
    private async _harmonizeAndNotify(): Promise<void> {
        const harnessEnabled = vscode.workspace.getConfiguration('agileagentcanvas').get('harness.enabled', true);
        if (harnessEnabled) {
            for (const [, docs] of this.artifacts) {
                if (!Array.isArray(docs)) continue;
                for (const doc of docs) {
                    try {
                        const postResults = await harnessEngine.evaluate(
                            { artifactType: doc.type || 'unknown', artifactId: doc.id, artifact: doc },
                            'post-flight'
                        );
                        const advisory = postResults.filter(r => !r.passed);
                        if (advisory.length > 0) this._onHarnessFailures.fire(advisory);
                        // evaluate() already calls harnessFeedback.recordEvaluation() internally
                    } catch { /* individual eval failures are non-blocking */ }
                }
            }
        }
        this.reconcileDerivedState();
        this.notifyChange();
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
        reconcileDerivedState(this.artifacts);
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
     * Get the source folder where artifacts were loaded from (.agileagentcanvas-context folder)
     */
    getSourceFolder(): vscode.Uri | null {
        return this.sourceFolder;
    }

    /**
     * Get the project root (parent of output folder).
     * BMAD resources are bundled inside the extension (resources/_aac), not in the workspace.
     */
    getProjectRoot(): string | null {
        if (!this.sourceFolder) return null;
        
        // sourceFolder is typically the output folder (e.g. .agileagentcanvas-context)
        // Project root is the parent directory
        const sourcePath = this.sourceFolder.fsPath;
        const outputFolder = vscode.workspace.getConfiguration('agileagentcanvas').get('outputFolder', '.agileagentcanvas-context') as string;
        // Escape special regex characters in the folder name
        const escaped = outputFolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parentPath = sourcePath.replace(new RegExp(`[/\\\\]${escaped}.*$`), '');
        return parentPath !== sourcePath ? parentPath : null;
    }

    /**
     * Get the on-disk URI for a given artifact store key (e.g. 'vision', 'prd',
     * 'epics', 'risks', 'testDesign', etc.).
     *
     * Lookup contract (two distinct modes):
     *   - With explicit `artifactId`: case (a) is tried; if it misses,
      lookup is **strict** and returns `null`. We do not silently substitute
      a prefix-iter match — passing an id means the caller asked for a
      specific file and a miss is a miss.
     *   - Without `artifactId`: case (a) is tried; on miss, falls back to
      prefix-iter for `${storeKey}:` entries and returns the first match.
      This is best-effort and intended for callers that work from `artType`
      alone (e.g. the post-save schema validation path in
      workflow-executor.ts) where no specific id is available.
     *
     * Cases:
     *   (a) Direct `sourceFiles.get(storeKey)` — singletons like 'vision',
      'prd', 'epics' which map to a single aggregated file.
     *   (b) `sourceFiles.get(ArtifactStore.perIdKey(storeKey, artifactId))` — per-id files
      for array types like `readinessReport:RR-1` where each entry is a
      separate file.
     *
     * Returns null if no file has been loaded/written.
     */
    getArtifactFileUri(storeKey: string, artifactId?: string): vscode.Uri | null {
        const direct = this.sourceFiles.get(storeKey);
        if (direct) return direct;
        if (artifactId !== undefined) {
            // Explicit id: require an exact `${storeKey}:${artifactId}` match.
            // Don't fall back to prefix-iter, which would return arbitrary data.
            return this.sourceFiles.get(ArtifactStore.perIdKey(storeKey, artifactId)) ?? null;
        }
        // No id supplied: fall back to first prefix-iter match.
        // Useful for the post-save schema validation path in workflow-executor.ts,
        // which works from artType alone and has no artifactId available.
        const prefix = `${storeKey}:`;
        for (const [k, v] of this.sourceFiles) {
            if (k.startsWith(prefix)) return v;
        }
        return null;
    }

    /**
     * Read the full on-disk JSON for a given artifact store key.
     * See `getArtifactFileUri` for the resolution order.
     * Returns the parsed object (typically `{ metadata, content }` envelope)
     * or null if the file doesn't exist or can't be read.
     */
    async readArtifactFile(storeKey: string, artifactId?: string): Promise<any | null> {
        const fileUri = this.getArtifactFileUri(storeKey, artifactId);
        if (!fileUri) return null;
        try {
            const raw = await vscode.workspace.fs.readFile(fileUri);
            const parsed = JSON.parse(Buffer.from(raw).toString('utf-8'));
            return normalizeLegacyArtifact(parsed);
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
            `Project "${projectName}" created! Use @agileagentcanvas in chat to define vision and requirements.`,
            'Open Chat'
        ).then(selection => {
            if (selection === 'Open Chat') {
                openChat();
            }
        });
    }

    /**
     * Get the current state.
     *
     * NOTE: The camelCase store keys below (`productBrief`, `testCases`,
     * `definitionOfDone`, etc.) are the legacy internal store keys used by
     * `this.artifacts.get/set()`.  New code receiving an artifactType string
     * from the LM tool boundary should use the canonical kebab-case forms from
     * `BmadArtifactTypeMap` (e.g. `'product-brief'`, `'test-case'`).
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
            testDesigns: this.artifacts.get('testDesigns'),
            // TEA module artifacts
            traceabilityMatrix: this.artifacts.get('traceabilityMatrix'),
            testReviews: this.artifacts.get('testReviews'),
            nfrAssessment: this.artifacts.get('nfrAssessment'),
            testFramework: this.artifacts.get('testFramework'),
            ciPipeline: this.artifacts.get('ciPipeline'),
            automationSummary: this.artifacts.get('automationSummary'),
            atddChecklist: this.artifacts.get('atddChecklist'),
            // BMM module artifacts
            researches: this.artifacts.get('researches'),
            uxDesigns: this.artifacts.get('uxDesigns'),
            readinessReports: this.artifacts.get('readinessReports'),
            sprintStatuses: this.artifacts.get('sprintStatuses'),
            retrospectives: this.artifacts.get('retrospectives'),
            changeProposals: this.artifacts.get('changeProposals'),
            codeReviews: this.artifacts.get('codeReviews'),
            risks: this.artifacts.get('risks'),
            definitionOfDone: this.artifacts.get('definitionOfDone'),
            projectOverview: this.artifacts.get('projectOverview'),
            projectContext: this.artifacts.get('projectContext'),
            techSpecs: this.artifacts.get('techSpecs'),
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
     * Recalculates Epic status based on its stories.
     * If an epic is 'done' or 'completed' but has active stories, it downgrades to 'in-progress'.
     * @returns boolean indicating if status changed
     */
    private recalculateEpicStatus(epic: Epic): boolean {
        if (!epic || !epic.stories || epic.stories.length === 0) return false;
        
        const hasActiveStories = epic.stories.some(s => !['done', 'completed', 'archived', 'cancelled'].includes(s.status?.toLowerCase() || ''));
        if (hasActiveStories && ['done', 'completed'].includes(epic.status?.toLowerCase() || '')) {
            epic.status = 'in-progress';
            logDebug(`Epic ${epic.id} status downgraded to in-progress due to active stories.`);
            return true;
        }
        return false;
    }

    /**
     * Update a specific artifact.
     *
     * Runtime signature is intentionally `Partial<any>` because the body
     * does key-by-key string access across ~30 artifact-type switch arms
     * (`changes.stories`, `Object.assign(epic, changes.metadata)`,
     * spread of `changes` into a target object, ...). Per-case body
     * narrowing would require restructuring every case branch.
     *
     * The TYPED CONTRACT is documented separately and exported as
     * `BmadArtifactChange` from `types/index.ts`. Callers that want
     * compile-time safety use the per-type shape:
     *
     *     `Partial<BmadArtifactTypeMap[T]> & { metadata?: BmadMetadata }`
     *
     * All 18 internal callers are now typed via `BmadArtifactChange`
     * / `Partial<BmadArtifactTypeMap[T]> & { metadata?: BmadMetadata }`
     * shapes (chat-participant.ts x11, webview-message-handler.ts,
     * agentic-kanban-message-handler.ts, kanban-orchestrator.ts x2,
     * autonomy-lifecycle.ts, project-commands.ts x2). The body's
     * `Partial<any>` remains only to absorb the structural spread form
     * of the LM tool wire at runtime.
     *
     * Schema validation upstream at the LM tool boundary is the
     * enforcement layer for typed shapes; the in-memory store accepts
     * arbitrary keys and treats anything schema-valid as legitimate.
     */
    async updateArtifact(
        artifactType: string,
        artifactId: string,
        changes: Partial<any>
    ): Promise<void> {
        logDebug('updateArtifact called:', artifactType, artifactId, changes);
        // ── Harness pre-flight checks (Epic 4) ──────────────────────────────
        const harnessEnabled = vscode.workspace.getConfiguration('agileagentcanvas').get('harness.enabled', true);
        if (harnessEnabled) {
            // Evaluate against the MERGED candidate (existing artifact + incoming
            // changes), NOT the bare delta. Evaluating the delta alone makes
            // required-field policies see real fields as "missing" — so a
            // status-only update (e.g. a Kanban drag sending `{ status }`) would
            // trigger auto-fix and overwrite the real title/userStory/AC with
            // generic placeholders. That was a silent data-loss bug.
            const existingArtifact = this.findArtifactById(artifactId)?.artifact ?? {};
            const { metadata: _changesMeta, ...changeTopFields } = changes ?? {};
            const candidate = {
                ...existingArtifact,
                ...(changes?.metadata && typeof changes.metadata === 'object' ? changes.metadata : {}),
                ...changeTopFields,
            };

            const preResults = await harnessEngine.evaluate(
                { artifactType, artifactId, artifact: candidate },
                'pre-flight'
            );
            const blocking = preResults.filter(r => !r.passed && r.severity === 'blocking');
            if (blocking.length > 0) {
                this._onHarnessFailures.fire(blocking);
                throw new Error(`Blocked by policies: ${blocking.map(b => b.policyId).join(', ')}`);
            }
            // Apply auto-fixes, but ONLY for fields genuinely absent from the
            // merged candidate. Never clobber values the existing artifact or
            // the incoming changes already provide.
            const lastFix = [...preResults].reverse().find(r => r.fixedArtifact !== undefined);
            if (lastFix?.fixedArtifact) {
                const isEmpty = (v: any) =>
                    v === undefined || v === null || v === '' ||
                    (Array.isArray(v) && v.length === 0);
                for (const [key, value] of Object.entries(lastFix.fixedArtifact)) {
                    if (isEmpty(                    (candidate as Record<string, unknown>)[key])) {
                        changes[key] = value;
                    }
                }
            }
        }
        
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
                    logDebug('Updated epic:', updatedEpic.id, updatedEpic.title);

                    // Status changed — in-memory + JSON file are authoritative; no YAML sync needed
                    
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

            case 'story': {
                // Find story across all epics by story ID
                const allEpics = this.artifacts.get('epics') || [];
                let storyFound = false;
                let oldStoryStatus: string | undefined;
                
                for (const epic of allEpics) {
                    const storyIndex = epic.stories?.findIndex((s: Story) => s.id === artifactId);
                    if (storyIndex !== undefined && storyIndex >= 0) {
                        // Merge changes: accept fields at top level or inside metadata.
                        // Schema validator has already checked field names/types.
                        const oldStory = epic.stories[storyIndex];
                        oldStoryStatus = oldStory.status;
                        const updatedStory = { ...oldStory };

                        // Apply metadata-wrapped fields first
                        if (changes.metadata && typeof changes.metadata === 'object') {
                            Object.assign(updatedStory, changes.metadata);
                        }

                        // Apply top-level fields — spread all (skip metadata, already handled)
                        const { metadata: _meta, ...topFields } = changes;
                        Object.assign(updatedStory, topFields);

                        // NEW LOGIC: Calculate dynamic status based on tasks
                        const doneStatuses = ['done', 'verified'];
                        const hasOpenTasks = updatedStory.tasks?.some((t: any) => !doneStatuses.includes(t.status));
                        if (hasOpenTasks && ['done', 'completed'].includes(updatedStory.status?.toLowerCase() || '')) {
                            updatedStory.status = 'in-progress';
                            logDebug(`Story ${updatedStory.id} status downgraded to in-progress due to open tasks.`);
                        }

                        epic.stories[storyIndex] = updatedStory;
                        storyFound = true;
                        logDebug('Updated story:', updatedStory.id, updatedStory.title);
                        break;
                    }
                }
                
                if (storyFound) {
                    this.artifacts.set('epics', [...allEpics]);

                    // Reverse sync status to YAML if status actually changed
                    let finalStoryStatus: string | undefined;
                    let parentEpicForSync: Epic | undefined;
                    for (const epic of allEpics) {
                        const st = epic.stories?.find((s: Story) => s.id === artifactId);
                        if (st) {
                            finalStoryStatus = st.status;
                            parentEpicForSync = epic;
                            break;
                        }
                    }
                    // Status changed — story JSON file is authoritative; no YAML sync needed
                } else {
                    // ── Create new standalone story ──────────────────────────
                    // Story not found in any epic → create it as a new standalone
                    // story file and add it to the matching epic's stories[].
                    const acOutput = this.getOutputChannel();

                    // Build the new story from changes
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
                        ...changes
                    };

                    // Determine parent epicId — from changes, or derive from ID pattern
                    // e.g. S-1.3 → EPIC-1, S1.3 → EPIC-1, 1.3 → EPIC-1
                    let epicId = changes.epicId;
                    if (!epicId) {
                        const idMatch = artifactId.match(/^S?-?(\d+)[.\-]/i);
                        if (idMatch) {
                            epicId = `EPIC-${parseInt(idMatch[1], 10)}`;
                        }
                    }

                    // Route to the matching epic
                    let parentEpic: Epic | undefined;
                    if (epicId) {
                        // Normalize epicId for matching (EPIC-1, 1, EPIC 1 → EPIC-1)
                        const normalizedTarget = epicId.replace(/^EPIC[\s-]*/i, '');
                        parentEpic = allEpics.find((e: Epic) => {
                            const normalizedEpicId = (e.id || '').replace(/^EPIC[\s-]*/i, '');
                            return normalizedEpicId === normalizedTarget;
                        });
                    }

                    if (parentEpic) {
                        if (!parentEpic.stories) { parentEpic.stories = []; }
                        parentEpic.stories.push(newStory);
                        this.artifacts.set('epics', [...allEpics]);
                        storeLogger.debug(`[ArtifactStore] Created new story ${artifactId} in epic ${parentEpic.id}`);
                    } else {
                        // No matching epic — still add to in-memory epics if any exist
                        if (allEpics.length > 0) {
                            storeLogger.debug(`[ArtifactStore] WARNING: No epic found for epicId "${epicId}" — story ${artifactId} created but not linked to any epic`);
                        }
                    }

                    // Write standalone story file to output folder
                    if (this.sourceFolder) {
                        try {
                            const storyFileContent = {
                                metadata: {
                                    schemaVersion: '1.0.0',
                                    artifactType: 'story',
                                    timestamps: {
                                        created: new Date().toISOString(),
                                        lastModified: new Date().toISOString()
                                    },
                                    status: newStory.status || 'draft'
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
                                    requirementRefs: newStory.requirementRefs
                                }
                            };

                            // Generate safe filename: {id}-{slug}.json
                            const epicNum = (epicId || '').replace(/\D/g, '') || '0';
                            const safeTitle = (newStory.title || artifactId)
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, '-')
                                .replace(/^-|-$/g, '')
                                .substring(0, 60);
                            const fileName = `${epicNum}-${safeTitle}.json`;

                            // Epic-scoped directory: epics/epic-{N}/stories/
                            const storiesDir = vscode.Uri.joinPath(
                                ArtifactFileWriter.epicScopedDir(this.sourceFolder, epicId || '0'),
                                'stories'
                            );
                            try { await vscode.workspace.fs.createDirectory(storiesDir); } catch { /* exists */ }

                            const fileUri = vscode.Uri.joinPath(storiesDir, fileName);
                            const storyOutputFormat = this.getOutputFormat();

                            // Write JSON if output format includes JSON
                            if (storyOutputFormat === 'json' || storyOutputFormat === 'dual') {
                                await vscode.workspace.fs.writeFile(
                                    fileUri,
                                    Buffer.from(JSON.stringify(storyFileContent, null, 2), 'utf-8')
                                );
                            }

                            // Write markdown companion if output format includes markdown
                            if (storyOutputFormat === 'markdown' || storyOutputFormat === 'dual') {
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

                            storeLogger.debug(`[ArtifactStore] Wrote standalone story file: ${fileName}`);
                        } catch (err: any) {
                            storeLogger.debug(`[ArtifactStore] Failed to write standalone story file: ${err?.message ?? err}`);
                        }
                    }
                }

                // NEW LOGIC: Recalculate Epic status based on all updated stories
                let epicsChanged = false;
                for (const epic of allEpics) {
                    if (this.recalculateEpicStatus(epic)) {
                        epicsChanged = true;
                    }
                }
                if (epicsChanged) {
                    this.artifacts.set('epics', [...allEpics]);
                }

                break;
            }

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
                    logDebug('Updated requirement:', updatedReq.id, updatedReq.title);
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
                    logDebug('Updated test case:', updated.id, updated.title);
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
                        logDebug('Updated use case:', updatedUC.id, updatedUC.title);
                        break;
                    }
                }
                if (ucFound) {
                    this.artifacts.set('epics', [...ucAllEpics]);
                }
                break;
            }

            case 'test-design': {
                const testDesigns: any[] = this.artifacts.get('testDesigns') || [];
                const tdIndex = testDesigns.findIndex(td => td.id === artifactId);
                const currentTD: any = tdIndex >= 0 ? testDesigns[tdIndex] : {};
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
                if (tdIndex >= 0) {
                    testDesigns[tdIndex] = updatedTD;
                } else {
                    testDesigns.push(updatedTD);
                }
                this.artifacts.set('testDesigns', testDesigns);
                logDebug('Updated test design:', updatedTD.id);
                // coveragePlan→TC extraction and riskAssessment→epic.risks
                // attachment are handled by reconcileDerivedState() which runs
                // after the switch block — no inline extraction needed here.
                break;
            }

            // =================================================================
            // TEA module artifact types
            // NOTE: The camelCase store key literals used below
            // (e.g. 'traceabilityMatrix', 'testFramework', 'ciPipeline')
            // are legacy internal keys.  New callers should use the canonical
            // kebab-case forms from BmadArtifactTypeMap when passing an
            // artifactType string to updateArtifact / deleteArtifact.
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
                logDebug('Updated traceability matrix:', upd.id);
                break;
            }

            case 'test-review': {
                const arr: any[] = this.artifacts.get('testReviews') || [];
                const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
                const cur = idx >= 0 ? arr[idx] : {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'test-review-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['reviewInfo', 'executiveSummary', 'qualityAssessment', 'qualityScoreBreakdown', 'criticalIssues', 'recommendations', 'bestPracticesFound', 'testFileAnalysis', 'coverageAnalysis', 'contextAndIntegration', 'knowledgeBaseReferences', 'nextSteps', 'decision', 'appendix']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                if (idx >= 0) arr[idx] = upd; else arr.push(upd);
                this.artifacts.set('testReviews', arr);
                logDebug('Updated test review:', upd.id);
                break;
            }

            case 'nfr-assessment':
            case 'nfr': { // @deprecated alias for 'nfr-assessment'
                const cur: any = this.artifacts.get('nfrAssessment') || {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'nfr-assessment-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['featureInfo', 'executiveSummary', 'nfrRequirements', 'assessments', 'quickWins', 'recommendedActions', 'monitoringHooks', 'failFastMechanisms', 'evidenceGaps', 'findingsSummary', 'gateYamlSnippet', 'testEvidence', 'signOff']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                this.artifacts.set('nfrAssessment', upd);
                logDebug('Updated NFR assessment:', upd.id);
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
                logDebug('Updated test framework:', upd.id);
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
                logDebug('Updated CI pipeline:', upd.id);
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
                logDebug('Updated automation summary:', upd.id);
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
                logDebug('Updated ATDD checklist:', upd.id);
                break;
            }

            // =================================================================
            // BMM module artifact types
            // NOTE: The camelCase store key literals used below
            // (e.g. 'uxDesigns', 'changeProposals', 'definitionOfDone')
            // are legacy internal keys.  See getState() JSDoc for guidance.
            // =================================================================

            case 'research': {
                const arr: any[] = this.artifacts.get('researches') || [];
                const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
                const cur = idx >= 0 ? arr[idx] : {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'research-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['researchType', 'topic', 'scope', 'goals', 'questions', 'methodology', 'findings', 'competitiveAnalysis', 'marketAnalysis', 'trends', 'technicalFindings', 'userResearch', 'recommendations', 'risks', 'synthesis', 'references', 'appendices']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                if (idx >= 0) arr[idx] = upd; else arr.push(upd);
                this.artifacts.set('researches', arr);
                logDebug('Updated research:', upd.id);
                break;
            }

            case 'ux-design': {
                const arr: any[] = this.artifacts.get('uxDesigns') || [];
                const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
                const cur = idx >= 0 ? arr[idx] : {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'ux-design-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['overview', 'coreExperience', 'designInspiration', 'designSystem', 'userJourneys', 'wireframes', 'componentStrategy', 'pageLayouts', 'uxPatterns', 'responsive', 'accessibility', 'interactions', 'errorStates', 'emptyStates', 'loadingStates', 'implementationNotes', 'references']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                if (idx >= 0) arr[idx] = upd; else arr.push(upd);
                this.artifacts.set('uxDesigns', arr);
                logDebug('Updated UX design:', upd.id);
                break;
            }

            case 'readiness-report':
            case 'readiness': { // @deprecated alias for 'readiness-report' (plural array)
                const arr: any[] = this.artifacts.get('readinessReports') || [];
                const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
                const cur: any = idx >= 0 ? arr[idx] : {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'readiness-report-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['summary', 'assessment', 'blockers', 'risks', 'recommendations', 'dependencyAnalysis', 'resourceAssessment', 'nextSteps', 'appendices']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                if (idx >= 0) arr[idx] = upd; else arr.push(upd);
                this.artifacts.set('readinessReports', arr);
                logDebug('Updated readiness report:', upd.id);
                break;
            }

            case 'sprint-status':
            case 'sprint': { // @deprecated alias for 'sprint-status' (plural array)
                const arr: any[] = this.artifacts.get('sprintStatuses') || [];
                const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
                const cur: any = idx >= 0 ? arr[idx] : {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'sprint-status-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['generated', 'project', 'projectKey', 'trackingSystem', 'storyLocation', 'summary', 'epics', 'developmentStatus', 'statusDefinitions']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                if (idx >= 0) arr[idx] = upd; else arr.push(upd);
                this.artifacts.set('sprintStatuses', arr);
                logDebug('Updated sprint status:', upd.id);
                break;
            }

            case 'retrospective': {
                const arr: any[] = this.artifacts.get('retrospectives') || [];
                const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
                const cur = idx >= 0 ? arr[idx] : {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'retrospective-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['epicReference', 'summary', 'whatWentWell', 'whatDidNotGoWell', 'lessonsLearned', 'storyAnalysis', 'technicalDebt', 'impactOnFutureWork', 'teamFeedback', 'actionItems', 'metricsSnapshot']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                if (idx >= 0) arr[idx] = upd; else arr.push(upd);
                this.artifacts.set('retrospectives', arr);
                logDebug('Updated retrospective:', upd.id);
                break;
            }

            case 'change-proposal': {
                const arr: any[] = this.artifacts.get('changeProposals') || [];
                const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
                const cur = idx >= 0 ? arr[idx] : {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'change-proposal-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['changeRequest', 'impactAnalysis', 'proposal', 'approval', 'implementation']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                if (idx >= 0) arr[idx] = upd; else arr.push(upd);
                this.artifacts.set('changeProposals', arr);
                logDebug('Updated change proposal:', upd.id);
                break;
            }

            case 'code-review': {
                const arr: any[] = this.artifacts.get('codeReviews') || [];
                const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
                const cur = idx >= 0 ? arr[idx] : {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'code-review-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['storyReference', 'reviewSummary', 'findings', 'acceptanceCriteriaVerification', 'testCoverageAnalysis', 'securityAnalysis', 'architectureCompliance', 'nextSteps', 'reviewerNotes']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                if (idx >= 0) arr[idx] = upd; else arr.push(upd);
                this.artifacts.set('codeReviews', arr);
                logDebug('Updated code review:', upd.id);
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
                logDebug('Updated risks:', upd.id);
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
                logDebug('Updated definition of done:', upd.id);
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
                logDebug('Updated project overview:', upd.id);
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
                logDebug('Updated project context:', upd.id);
                break;
            }

            case 'tech-spec': {
                const arr: any[] = this.artifacts.get('techSpecs') || [];
                const idx = arr.findIndex((a: any) => a.id === artifactId || a.metadata?.id === artifactId);
                const cur = idx >= 0 ? arr[idx] : {};
                const upd = { ...cur };
                if (!upd.id) upd.id = artifactId || 'tech-spec-1';
                if (changes.status) upd.status = changes.status;
                if (changes.metadata?.status) upd.status = changes.metadata.status;
                for (const f of ['title', 'slug', 'version', 'overview', 'context', 'techStack', 'dataModel', 'apiChanges', 'filesToModify', 'filesToCreate', 'codePatterns', 'testPatterns', 'implementationPlan', 'testingStrategy', 'risks', 'rollbackPlan', 'additionalContext', 'reviewers']) {
                    if (changes[f] !== undefined) upd[f] = changes[f];
                }
                if (idx >= 0) arr[idx] = upd; else arr.push(upd);
                this.artifacts.set('techSpecs', arr);
                logDebug('Updated tech spec:', upd.id);
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
                logDebug('Updated storytelling:', upd.id);
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
                logDebug('Updated problem solving:', upd.id);
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
                logDebug('Updated innovation strategy:', upd.id);
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
                logDebug('Updated design thinking:', upd.id);
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
                logDebug('Updated source tree:', upd.id);
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
                logDebug('Updated test summary:', upd.id);
                break;
            }
                
            default:
                console.warn(`[ArtifactStore] Unknown artifact type "${artifactType}" — changes were ignored. Known types: vision, product-brief, prd, architecture, epic, story, requirement, requirements, aiCursor, test-case, test-strategy, test-design, use-case, traceability-matrix, test-review, nfr-assessment, test-framework, ci-pipeline, automation-summary, atdd-checklist, research, ux-design, readiness-report, sprint-status, retrospective, change-proposal, code-review, risks, definition-of-done, project-overview, project-context, tech-spec, source-tree, test-summary, storytelling, problem-solving, innovation-strategy, design-thinking`);
        }

        this.reconcileDerivedState();
        this.notifyChange();

        // Auto-sync if enabled
        const autoSync = vscode.workspace.getConfiguration('agileagentcanvas').get('autoSync', true);
        if (autoSync) {
            await this.syncToFiles();
        }
    }

    /**
     * Delete an artifact by type/id.
     * For epics, also removes associated stories and use cases.
     */
    async deleteArtifact(artifactType: string, artifactId: string): Promise<void> {
        logDebug('deleteArtifact called:', artifactType, artifactId);

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
                    
                    // Clean up the entire epic folder from disk to prevent shadow cards on reload
                    // Must be awaited to prevent race with syncToFiles re-creating files (CR-3)
                    if (this.sourceFolder) {
                        const epicDir = ArtifactFileWriter.epicScopedDir(this.sourceFolder, artifactId);
                        try {
                            await vscode.workspace.fs.delete(epicDir, { recursive: true, useTrash: true });
                            logDebug(`Deleted epic folder: ${epicDir.fsPath}`);
                        } catch (err) {
                            logDebug(`Failed to delete epic folder ${epicDir.fsPath}:`, err);
                        }
                    }
                }
                break;
            }

            case 'story': {
                const epics = this.artifacts.get('epics') || [];
                let changed = false;
                let deletedStoryId: string | null = null;
                let deletedFromEpicId: string | null = null;
                epics.forEach((epic: Epic) => {
                    if (epic.stories?.some((s: Story) => s.id === artifactId)) {
                        epic.stories = epic.stories.filter((s: Story) => s.id !== artifactId);
                        deletedStoryId = artifactId;
                        deletedFromEpicId = epic.id;
                        changed = true;
                    }
                });
                if (changed) {
                    this.artifacts.set('epics', [...epics]);
                }
                if (deletedStoryId) {
                    this.removeStoryLinksFromRequirements([deletedStoryId]);
                }
                // Clean up standalone story file from disk using exactly tracked source URI
                // Must be awaited to prevent race with syncToFiles re-creating the file (CR-3)
                const storySourceKey = `story:${artifactId}`;
                if (this.sourceFiles.has(storySourceKey)) {
                    const storyFileUri = this.sourceFiles.get(storySourceKey)!;
                    try {
                        await vscode.workspace.fs.delete(storyFileUri, { useTrash: true });
                        logDebug(`Deleted exact story file: ${storyFileUri.fsPath}`);
                    } catch (err) {
                        logDebug('Failed to delete story file:', err);
                    }
                    this.sourceFiles.delete(storySourceKey);
                } else if (deletedStoryId && deletedFromEpicId && this.sourceFolder) {
                    // Fallback to deriving the path if sourceFiles mapping was lost
                    const epicDir = ArtifactFileWriter.epicScopedDir(this.sourceFolder, deletedFromEpicId);
                    const storiesDir = vscode.Uri.joinPath(epicDir, 'stories');
                    const storyFileName = `${String(deletedStoryId).replace(/[^a-zA-Z0-9.-]/g, '-')}.json`;
                    const storyFileUri = vscode.Uri.joinPath(storiesDir, storyFileName);
                    try {
                        await vscode.workspace.fs.delete(storyFileUri, { useTrash: true });
                        logDebug(`Deleted derived story file: ${storyFileUri.fsPath}`);
                    } catch {
                        /* file may not exist — ignore */
                    }
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

            case 'test-design': {
                const testDesigns = this.artifacts.get('testDesigns') || [];
                const tdIndex = testDesigns.findIndex((td: any) => td.id === artifactId);
                if (tdIndex >= 0) {
                    testDesigns.splice(tdIndex, 1);
                    this.artifacts.set('testDesigns', testDesigns);
                }
                break;
            }

            // TEA module artifacts
            case 'traceability-matrix':
                this.artifacts.set('traceabilityMatrix', undefined);
                break;
            case 'test-review': {
                const arr = this.artifacts.get('testReviews') || [];
                this.artifacts.set('testReviews', arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId));
                break;
            }
            case 'nfr-assessment':
            case 'nfr':  // @deprecated alias for 'nfr-assessment'
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
            case 'research': {
                const arr = this.artifacts.get('researches') || [];
                this.artifacts.set('researches', arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId));
                break;
            }
            case 'ux-design': {
                const arr = this.artifacts.get('uxDesigns') || [];
                this.artifacts.set('uxDesigns', arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId));
                break;
            }
            case 'readiness-report':
            case 'readiness': { // @deprecated alias for 'readiness-report'
                const arr = this.artifacts.get('readinessReports') || [];
                this.artifacts.set('readinessReports', arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId));
                break;
            }
            case 'sprint-status':
            case 'sprint': { // @deprecated alias for 'sprint-status'
                const arr = this.artifacts.get('sprintStatuses') || [];
                this.artifacts.set('sprintStatuses', arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId));
                break;
            }
            case 'retrospective': {
                const arr = this.artifacts.get('retrospectives') || [];
                this.artifacts.set('retrospectives', arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId));
                break;
            }
            case 'change-proposal': {
                const arr = this.artifacts.get('changeProposals') || [];
                this.artifacts.set('changeProposals', arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId));
                break;
            }
            case 'code-review': {
                const arr = this.artifacts.get('codeReviews') || [];
                this.artifacts.set('codeReviews', arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId));
                break;
            }
            case 'project-overview':
                this.artifacts.set('projectOverview', undefined);
                break;
            case 'project-context':
                this.artifacts.set('projectContext', undefined);
                break;
            case 'tech-spec': {
                const arr = this.artifacts.get('techSpecs') || [];
                this.artifacts.set('techSpecs', arr.filter((a: any) => a.id !== artifactId && a.metadata?.id !== artifactId));
                break;
            }
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
                logDebug('Unknown artifact type:', artifactType);
        }

        this.notifyChange();

        const autoSync = vscode.workspace.getConfiguration('agileagentcanvas').get('autoSync', true);
        if (autoSync) {
            await this.syncToFiles();
        }
    }

    private removeStoryLinksFromRequirements(storyIds: string[]): void {
        removeStoryLinksFromRequirements(storyIds, this.artifacts);
    }

    private syncRequirementLinks(
        epicId: string,
        oldReqIds: string[],
        newReqIds: string[],
        reqType: 'functional' | 'nonFunctional'
    ): void {
        syncRequirementLinks(epicId, oldReqIds, newReqIds, reqType, this.artifacts);
    }

    addEpic(epic: Epic): void {
        addEpic(this.artifacts, epic);
        this.notifyChange();
    }

    addStory(epicId: string, story: Story): void {
        addStory(this.artifacts, epicId, story);
        this.notifyChange();
    }

    addRequirement(requirement: FunctionalRequirement): void {
        addRequirement(this.artifacts, () => this.notifyChange(), requirement);
    }

    createEpic(): Epic {
        return createEpic(this.artifacts, () => this.notifyChange());
    }

    createStory(epicId?: string): Story {
        return createStory(this.artifacts, () => this.notifyChange(), epicId);
    }

    createRequirement(): FunctionalRequirement {
        return createRequirement(this.artifacts, () => this.notifyChange());
    }

    createOrUpdateVision(): void {
        createOrUpdateVision(this.artifacts, () => this.notifyChange());
    }

    createUseCase(epicId?: string): UseCase {
        return createUseCase(this.artifacts, () => this.notifyChange(), epicId);
    }

    createProductBrief(): ProductBrief {
        return createProductBrief(this.artifacts, () => this.notifyChange());
    }

    createPRD(): PRD {
        return createPRD(this.artifacts, () => this.notifyChange());
    }

    createArchitecture(): Architecture {
        return createArchitecture(this.artifacts, () => this.notifyChange());
    }

    createTestCase(storyId?: string, directEpicId?: string): TestCase {
        return createTestCase(this.artifacts, () => this.notifyChange(), storyId, directEpicId);
    }

    createTestStrategy(epicId?: string): TestStrategy {
        return createTestStrategy(this.artifacts, () => this.notifyChange(), epicId);
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
     * Load artifacts from .agileagentcanvas-context folder
     * Recursively searches ALL subfolders for JSON files
     * Handles various artifact types: epics, stories, use-cases, requirements
     */
    async loadFromFolder(folderUri: vscode.Uri): Promise<void> {
        storeLogger.debug(`[ArtifactStore] loadFromFolder called with: ${folderUri.fsPath}`);
        
        // Clear ALL in-memory state before re-reading from disk.
        // Without this, collection arrays (testDesigns, testReviews, etc.)
        // accumulate duplicates on every reload, and artifacts from deleted
        // files persist indefinitely.
        this.artifacts.clear();

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
            const requirements: BmadArtifacts['requirements'] = {
                functional: [],
                nonFunctional: [],
                additional: []
            };
            // Track which requirement categories were loaded from standalone
            // files so PRD extraction can defer (standalone > PRD priority).
            const standaloneReqsLoaded = { functional: false, nonFunctional: false, additional: false };

            // Recursively find ALL JSON files in the folder and subfolders
            const allJsonFiles = await this.findAllJsonFiles(folderUri);
            storeLogger.debug(`[ArtifactStore] Found ${allJsonFiles.length} JSON files total`);

            // Lazily initialise the schema validator for load-time checks.
            if (!schemaValidator.isInitialized()) {
                try {
                    const bmadPath = vscode.Uri.joinPath(
                        vscode.Uri.file(
                            require('path').join(
                                (vscode.extensions.getExtension('msayedshokry.agileagentcanvas')?.extensionUri ??
                                 vscode.Uri.file(__dirname + '/../..')).fsPath,
                                'resources', BMAD_RESOURCE_DIR
                            )
                        )
                    ).fsPath;
                    schemaValidator.init(bmadPath);
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
                    // Compute a relative path from the source folder so logs
                    // can distinguish files with the same basename across dirs
                    // (e.g. "epics/epic-3/test-cases.json" vs "epics/epic-5/test-cases.json").
                    const folderBase = folderUri.path.replace(/\/$/, '');
                    const fileName = fileUri.path.startsWith(folderBase)
                        ? fileUri.path.slice(folderBase.length + 1)   // relative path
                        : fileUri.path.split('/').pop() || '';         // fallback to basename
                    
                    storeLogger.debug(`[ArtifactStore] Processing: ${fileName}`);

                    // Detect artifact type from metadata or content structure
                    const artifactType = data.metadata?.artifactType || this.detectArtifactType(data, fileName);

                    // ── Load-time schema validation (warn-only) ──
                    // Validate the raw JSON against the full schema before the
                    // store flattens it.  Issues are collected and logged at the
                    // end of loading so the user can fix the source files.
                    //
                    // Skip schema validation for the epics manifest file: the
                    // manifest stores lightweight refs ({ id, title, status, file })
                    // rather than full epic objects, so it cannot satisfy the
                    // epics.schema.json requirement for `stories` arrays in each
                    // epic.  Individual epic files use artifactType:'epic' which
                    // intentionally has no schema mapping.
                    const epicsContent = data.content?.epics;
                    const isEpicsManifest = artifactType === 'epics' &&
                        Array.isArray(epicsContent) &&
                        (epicsContent.length === 0 ||          // empty manifest
                         epicsContent.every(
                             (e: any) => typeof e === 'string' || (e.file && typeof e.file === 'string' && !e.stories)
                         ));

                    if (schemaValidator.isInitialized() && artifactType && !isEpicsManifest) {
                        const result = schemaValidator.validate(artifactType, data, fileName);
                        if (!result.valid) {
                            loadValidationIssues.push({
                                file: fileName,
                                type: artifactType,
                                errors: result.errors,
                            });
                        }
                    }

                    switch (artifactType) {
                        case 'epics': {
                            // Epics manifest or monolithic epics file
                            this.sourceFiles.set('epics', fileUri);
                            const epicsArray = data.content?.epics || data.epics || [data.content || data];

                            // Determine if this is a manifest with refs or a monolithic file with inline epics
                            const isManifest = epicsArray.length > 0 && epicsArray.every(
                                (e: any) => typeof e === 'string' || (e.file && typeof e.file === 'string' && !e.stories)
                            );

                            if (isManifest) {
                                // ── New format: manifest with refs ──────────────────
                                // Resolve the directory containing the manifest
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
                                            await this.loadEpicStoryRefs(epic, epicData, epicFileUri);
                                            storeLogger.debug(`[ArtifactStore] Loaded epic from ref: ${epic.id} - ${epic.title} (${epic.stories.length} stories)`);
                                            const existingIndex = allEpics.findIndex(e => e.id === epic.id);
                                            if (existingIndex >= 0) {
                                                mergeEpicDuplicate(allEpics[existingIndex], epic);
                                            } else {
                                                allEpics.push(epic);
                                            }
                                            this.sourceFiles.set(ArtifactStore.perIdKey('epic', epic.id), epicFileUri);
                                        }
                                    } catch (refErr: any) {
                                        storeLogger.debug(`[ArtifactStore] Failed to load epic ref '${refPath}': ${refErr?.message ?? refErr}`);
                                    }
                                }
                            } else {
                                // ── Old format: monolithic file with inline epic objects ──
                                for (const epicData of epicsArray) {
                                    const epic = mapSchemaEpicToInternal(epicData);
                                    if (epic) {
                                        await this.loadEpicStoryRefs(epic, epicData, fileUri);
                                        storeLogger.debug(`[ArtifactStore] Loaded epic: ${epic.id} - ${epic.title} (${epic.stories.length} stories)`);
                                        const existingIndex = allEpics.findIndex(e => e.id === epic.id);
                                        if (existingIndex >= 0) {
                                            mergeEpicDuplicate(allEpics[existingIndex], epic);
                                        } else {
                                            allEpics.push(epic);
                                        }
                                    }
                                }
                            }
                            
                            // Extract project name
                            if (!projectName) {
                                projectName = data.metadata?.projectName || 
                                             data.content?.overview?.projectName || '';
                            }
                            
                            // Extract requirements inventory from epics.json
                            // NOTE: This is a FALLBACK source. PRD is the authoritative source
                            // for requirements. epics.json requirementsInventory is read for
                            // backward compat but NOT written back on save.
                            const reqInventory = data.content?.requirementsInventory;
                            if (reqInventory) {
                                if (reqInventory.functional?.length) {
                                    requirements.functional.push(
                                        ...reqInventory.functional.map((fr: any) => mapSchemaRequirement(fr))
                                    );
                                }
                                if (reqInventory.nonFunctional?.length) {
                                    requirements.nonFunctional.push(
                                        ...reqInventory.nonFunctional.map((nfr: any) => mapSchemaNonFunctionalRequirement(nfr))
                                    );
                                }
                                if (reqInventory.additional?.length) {
                                    requirements.additional.push(
                                        ...reqInventory.additional.map((ar: any) => mapSchemaAdditionalRequirement(ar))
                                    );
                                }
                            }
                            break;
                        }

                        case 'epic': {
                            // Standalone single-epic file — merge metadata-level fields
                            // (dependencies, status, priority, labels, etc.) into content
                            const epicData = {
                                ...(data.metadata || {}),
                                ...(data.content || data),
                            };
                            const epic = mapSchemaEpicToInternal(epicData);
                            if (epic) {
                                await this.loadEpicStoryRefs(epic, epicData, fileUri);
                                storeLogger.debug(`[ArtifactStore] Loaded standalone epic: ${epic.id} - ${epic.title} (${epic.stories.length} stories)`);
                                const existingIndex = allEpics.findIndex(e => e.id === epic.id);
                                if (existingIndex >= 0) {
                                    mergeEpicDuplicate(allEpics[existingIndex], epic);
                                } else {
                                    allEpics.push(epic);
                                }
                                this.sourceFiles.set(ArtifactStore.perIdKey('epic', epic.id), fileUri);
                            }
                            break;
                        }
                            
                        case 'story':
                            // Standalone story file — merge metadata-level fields
                            // (dependencies, status, priority, requirementRefs, testCases)
                            // into content so they reach the mapper
                            const storyData = {
                                ...(data.metadata || {}),
                                ...(data.content || data),
                            };
                            const story = mapSchemaStoryToInternal(storyData);
                            if (story) {
                                storeLogger.debug(`[ArtifactStore] Loaded standalone story: ${story.title}`);
                                standaloneStories.push(story);
                                this.sourceFiles.set(ArtifactStore.perIdKey('story', story.id), fileUri);
                            }
                            break;
                            
                        case 'use-case':
                        case 'usecase': {
                            // Use case file — link to its parent epic via epicId field or ID prefix UC-N-*
                            storeLogger.debug(`[ArtifactStore] Found use-case: ${fileName}`);
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
                                            storeLogger.debug(`[ArtifactStore] Updated placeholder use-case ${uc.id} in epic ${parentEpicId}`);
                                        }
                                    } else {
                                        parentEpic.useCases.push(uc);
                                        storeLogger.debug(`[ArtifactStore] Linked use-case ${uc.id} to epic ${parentEpicId}`);
                                    }
                                } else {
                                    pendingUseCases.push({ uc, parentEpicId });
                                    storeLogger.debug(`[ArtifactStore] Parent epic ${parentEpicId} not found for use-case ${uc.id}, queued for linking`);
                                }
                            } else {
                                pendingUseCases.push({ uc, parentEpicId: null });
                                storeLogger.debug(`[ArtifactStore] No parent epic found for use-case ${uc.id}, queued for linking`);
                            }
                            break;
                        }

                        case 'use-cases': {
                            // Per-epic use cases collection file (epics/epic-N/use-cases.json)
                            storeLogger.debug(`[ArtifactStore] Found use-cases collection: ${fileName}`);
                            const ucArr = (data.content?.useCases || []).map((ucRaw: any) => {
                                const ucId = ucRaw.id || fileName.replace(/\.json$/, '');
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
                                    notes: ucRaw.notes
                                };
                            });
                            // Derive parent epic from metadata or directory path
                            const ucRelPath = fileUri.path.replace(folderUri.path, '');
                            const ucDirMatch = ucRelPath.match(/epics[\/\\]epic-(\d+)/);
                            const ucEpicId = normalizeEpicId(
                                data.metadata?.epicId ||
                                (ucDirMatch ? ucDirMatch[1] : null)
                            );
                            if (ucEpicId && ucArr.length) {
                                const epicsArr: any[] = this.artifacts.get('epics') || allEpics;
                                const parentEpic = epicsArr.find((e: any) => normalizeEpicId(e.id) === ucEpicId) ||
                                                   allEpics.find((e: any) => normalizeEpicId(e.id) === ucEpicId);
                                if (parentEpic) {
                                    if (!parentEpic.useCases) { parentEpic.useCases = []; }
                                    for (const uc of ucArr) {
                                        const existing = parentEpic.useCases.find((u: any) => u.id === uc.id);
                                        if (!existing) {
                                            parentEpic.useCases.push(uc);
                                        }
                                    }
                                    storeLogger.debug(`[ArtifactStore] Linked ${ucArr.length} use-cases to epic ${ucEpicId}`);
                                } else {
                                    // Queue for deferred linking
                                    for (const uc of ucArr) {
                                        pendingUseCases.push({ uc, parentEpicId: ucEpicId });
                                    }
                                    storeLogger.debug(`[ArtifactStore] Parent epic ${ucEpicId} not yet loaded, queued ${ucArr.length} use-cases`);
                                }
                            }
                            break;
                        }

                        case 'epic-test-strategy':
                        case 'test-strategy': {
                            // Per-epic test strategy file (NOT the global test-summary)
                            if (data.metadata?.artifactType === 'test-summary') {
                                // Global test summary — fall through to default handler
                                break;
                            }
                            const tsRelPath = fileUri.path.replace(folderUri.path, '');
                            const tsDirMatch = tsRelPath.match(/epics[\/\\]epic-(\d+)/);
                            const tsEpicId = normalizeEpicId(
                                data.metadata?.epicId ||
                                data.content?.epicId ||
                                (tsDirMatch ? tsDirMatch[1] : null)
                            );
                            if (tsEpicId) {
                                storeLogger.debug(`[ArtifactStore] Found epic test-strategy: ${fileName}`);
                                const epicsArr: any[] = this.artifacts.get('epics') || allEpics;
                                const parentEpic = epicsArr.find((e: any) => normalizeEpicId(e.id) === tsEpicId) ||
                                                   allEpics.find((e: any) => normalizeEpicId(e.id) === tsEpicId);
                                if (parentEpic) {
                                    parentEpic.testStrategy = data.content;
                                    storeLogger.debug(`[ArtifactStore] Linked test-strategy to epic ${tsEpicId}`);
                                } else {
                                    storeLogger.debug(`[ArtifactStore] Parent epic ${tsEpicId} not yet loaded for test-strategy, skipped`);
                                }
                            } else {
                                // Global test strategy
                                this.sourceFiles.set('testStrategy', fileUri);
                                const tsData = data.content || data;
                                this.artifacts.set('testStrategy', tsData);
                                storeLogger.debug(`[ArtifactStore] Loaded global test strategy: ${tsData.title || '(unnamed)'}`);
                            }
                            break;
                        }
                            
                        case 'requirements':
                            // Standalone requirements file — authoritative source
                            this.sourceFiles.set('requirements', fileUri);
                            const reqs = data.content || data;
                            if (reqs.functional) {
                                requirements.functional.push(
                                    ...reqs.functional.map((fr: any) => mapSchemaRequirement(fr))
                                );
                                standaloneReqsLoaded.functional = true;
                            }
                            if (reqs.nonFunctional) {
                                requirements.nonFunctional.push(
                                    ...reqs.nonFunctional.map((nfr: any) => mapSchemaNonFunctionalRequirement(nfr))
                                );
                                standaloneReqsLoaded.nonFunctional = true;
                            }
                            if (reqs.additional) {
                                requirements.additional.push(
                                    ...reqs.additional.map((ar: any) => mapSchemaAdditionalRequirement(ar))
                                );
                                standaloneReqsLoaded.additional = true;
                            }
                            storeLogger.debug(`[ArtifactStore] Loaded standalone requirements: ${reqs.functional?.length || 0} FR, ${reqs.nonFunctional?.length || 0} NFR, ${reqs.additional?.length || 0} additional`);
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
                                        const mapped = mapSchemaRequirement({
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
                                storeLogger.debug(`[ArtifactStore] Loaded ${frCount} functional requirements from ${Object.keys(domains).length} domains in ${fileName}`);
                            }
                            // Also check for top-level functional/nonFunctional/additional arrays
                            if (frContent.functional) {
                                requirements.functional.push(
                                    ...frContent.functional.map((fr: any) => mapSchemaRequirement(fr))
                                );
                            }
                            if (frContent.nonFunctional) {
                                requirements.nonFunctional.push(
                                    ...frContent.nonFunctional.map((nfr: any) => mapSchemaNonFunctionalRequirement(nfr))
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
                            storeLogger.debug(`[ArtifactStore] Loaded vision: ${vision.productName}`);
                            
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
                            storeLogger.debug(`[ArtifactStore] Loaded product-brief: ${pbData.productName || '(unnamed)'}`);
                            break;
                        }

                        case 'prd': {
                            this.sourceFiles.set('prd', fileUri);
                            const prdData = data.content || data;
                            this.artifacts.set('prd', prdData);
                            if (!projectName) projectName = prdData.productOverview?.productName || data.metadata?.projectName || '';
                            storeLogger.debug(`[ArtifactStore] Loaded PRD: ${prdData.productOverview?.productName || '(unnamed)'}`);

                            // ── Extract PRD requirements into the requirements map ──
                            // PRD is the seed source for NFR and additional requirements.
                            // Standalone requirements.json (if exists) takes priority per
                            // category — skip PRD extraction for categories already loaded.
                            // Functional requirements are ALWAYS skipped here because
                            // functional-requirements.json (domain-based) already covers them.
                            const prdReqs = prdData.requirements;
                            if (prdReqs) {
                                if (!standaloneReqsLoaded.nonFunctional
                                    && Array.isArray(prdReqs.nonFunctional) && prdReqs.nonFunctional.length > 0) {
                                    requirements.nonFunctional.push(
                                        ...prdReqs.nonFunctional.map((nfr: any) => mapSchemaNonFunctionalRequirement(nfr))
                                    );
                                    storeLogger.debug(`[ArtifactStore] Extracted ${prdReqs.nonFunctional.length} non-functional requirements from PRD`);
                                } else if (standaloneReqsLoaded.nonFunctional) {
                                    storeLogger.debug(`[ArtifactStore] Skipped PRD NFR extraction (standalone requirements.json takes priority)`);
                                }
                                if (!standaloneReqsLoaded.additional
                                    && Array.isArray(prdReqs.additional) && prdReqs.additional.length > 0) {
                                    requirements.additional.push(
                                        ...prdReqs.additional.map((ar: any) => mapSchemaAdditionalRequirement(ar))
                                    );
                                    storeLogger.debug(`[ArtifactStore] Extracted ${prdReqs.additional.length} additional requirements from PRD`);
                                } else if (standaloneReqsLoaded.additional) {
                                    storeLogger.debug(`[ArtifactStore] Skipped PRD additional extraction (standalone requirements.json takes priority)`);
                                }
                            }
                            break;
                        }

                        case 'architecture': {
                            this.sourceFiles.set('architecture', fileUri);
                            const archData = data.content || data;
                            this.artifacts.set('architecture', archData);
                            storeLogger.debug(`[ArtifactStore] Loaded architecture: ${archData.overview?.projectName || '(unnamed)'}`);
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
                                if (!tc) return;
                                if (!tc.id) {
                                    tc.id = `TC-${merged.length + 1}`;
                                }
                                if (!merged.find((e: any) => e.id === tc.id)) {
                                    merged.push(tc);
                                }
                            });
                            this.artifacts.set('testCases', merged);
                            storeLogger.debug(`[ArtifactStore] Loaded ${tcArray.length} test case(s) from ${fileName}`);
                            break;
                        }

                        case 'test-design':
                        case 'test-design-qa':
                        case 'test-design-architecture': {
                            const tdContent = data.content || data;
                            const tdId = tdContent.id || `test-design-${fileName}`;
                            this.sourceFiles.set(ArtifactStore.perIdKey('testDesign', tdId), fileUri);
                            const existingTDs = this.artifacts.get('testDesigns') || [];
                            existingTDs.push(tdContent);
                            this.artifacts.set('testDesigns', existingTDs);
                            storeLogger.debug(`[ArtifactStore] Loaded test-design ${tdId} from ${fileName}`);
                            break;
                        }



                        // ─── TEA module artifacts ───────────────────────────────────
                        case 'traceability-matrix': {
                            this.sourceFiles.set('traceabilityMatrix', fileUri);
                            const tmData = data.content || data;
                            this.artifacts.set('traceabilityMatrix', tmData);
                            storeLogger.debug(`[ArtifactStore] Loaded traceability matrix`);
                            break;
                        }

                        case 'test-review': {
                            const trData = data.content || data;
                            const trId = data.metadata?.id || trData.id || `test-review-${fileName}`;
                            this.sourceFiles.set(ArtifactStore.perIdKey('testReview', trId), fileUri);
                            const existing = this.artifacts.get('testReviews') || [];
                            existing.push(trData);
                            this.artifacts.set('testReviews', existing);
                            storeLogger.debug(`[ArtifactStore] Loaded test review ${trId} from ${fileName}`);
                            break;
                        }

                        case 'nfr-assessment': {
                            this.sourceFiles.set('nfrAssessment', fileUri);
                            const nfrData = data.content || data;
                            this.artifacts.set('nfrAssessment', nfrData);
                            storeLogger.debug(`[ArtifactStore] Loaded NFR assessment`);
                            break;
                        }

                        case 'atdd-checklist': {
                            this.sourceFiles.set('atddChecklist', fileUri);
                            const atddData = data.content || data;
                            this.artifacts.set('atddChecklist', atddData);
                            storeLogger.debug(`[ArtifactStore] Loaded ATDD checklist`);
                            break;
                        }

                        case 'test-framework': {
                            this.sourceFiles.set('testFramework', fileUri);
                            const tfData = data.content || data;
                            this.artifacts.set('testFramework', tfData);
                            storeLogger.debug(`[ArtifactStore] Loaded test framework`);
                            break;
                        }

                        case 'ci-pipeline': {
                            this.sourceFiles.set('ciPipeline', fileUri);
                            const ciData = data.content || data;
                            this.artifacts.set('ciPipeline', ciData);
                            storeLogger.debug(`[ArtifactStore] Loaded CI pipeline`);
                            break;
                        }

                        case 'automation-summary': {
                            this.sourceFiles.set('automationSummary', fileUri);
                            const asData = data.content || data;
                            this.artifacts.set('automationSummary', asData);
                            storeLogger.debug(`[ArtifactStore] Loaded automation summary`);
                            break;
                        }

                        // ─── BMM module artifacts ───────────────────────────────────
                        case 'research': {
                            const resData = data.content || data;
                            const resId = data.metadata?.id || resData.id || `research-${fileName}`;
                            this.sourceFiles.set(ArtifactStore.perIdKey('research', resId), fileUri);
                            const existing = this.artifacts.get('researches') || [];
                            existing.push(resData);
                            this.artifacts.set('researches', existing);
                            storeLogger.debug(`[ArtifactStore] Loaded research ${resId} from ${fileName}`);
                            break;
                        }

                        case 'ux-design': {
                            const uxData = data.content || data;
                            const uxId = data.metadata?.id || uxData.id || `ux-design-${fileName}`;
                            this.sourceFiles.set(ArtifactStore.perIdKey('uxDesign', uxId), fileUri);
                            const existing = this.artifacts.get('uxDesigns') || [];
                            existing.push(uxData);
                            this.artifacts.set('uxDesigns', existing);
                            storeLogger.debug(`[ArtifactStore] Loaded UX design ${uxId} from ${fileName}`);
                            break;
                        }

                        case 'readiness-report': {
                            const rrData = data.content || data;
                            const rrId = data.metadata?.id || rrData.id || `readiness-report-${fileName}`;
                            this.sourceFiles.set(ArtifactStore.perIdKey('readinessReport', rrId), fileUri);
                            const existing = this.artifacts.get('readinessReports') || [];
                            existing.push(rrData);
                            this.artifacts.set('readinessReports', existing);
                            storeLogger.debug(`[ArtifactStore] Loaded readiness report ${rrId} from ${fileName}`);
                            break;
                        }

                        case 'sprint-status': {
                            const ssData = data.content || data;
                            const ssId = data.metadata?.id || ssData.id || `sprint-status-${fileName}`;
                            this.sourceFiles.set(ArtifactStore.perIdKey('sprintStatus', ssId), fileUri);
                            const existing = this.artifacts.get('sprintStatuses') || [];
                            existing.push(ssData);
                            this.artifacts.set('sprintStatuses', existing);
                            storeLogger.debug(`[ArtifactStore] Loaded sprint status ${ssId} from ${fileName}`);
                            break;
                        }

                        case 'retrospective': {
                            const retroData = data.content || data;
                            const retroId = data.metadata?.id || retroData.id || `retrospective-${fileName}`;
                            this.sourceFiles.set(ArtifactStore.perIdKey('retrospective', retroId), fileUri);
                            const existing = this.artifacts.get('retrospectives') || [];
                            existing.push(retroData);
                            this.artifacts.set('retrospectives', existing);
                            storeLogger.debug(`[ArtifactStore] Loaded retrospective ${retroId} from ${fileName}`);
                            break;
                        }

                        case 'change-proposal': {
                            const cpData = data.content || data;
                            const cpId = data.metadata?.id || cpData.id || `change-proposal-${fileName}`;
                            this.sourceFiles.set(ArtifactStore.perIdKey('changeProposal', cpId), fileUri);
                            const existing = this.artifacts.get('changeProposals') || [];
                            existing.push(cpData);
                            this.artifacts.set('changeProposals', existing);
                            storeLogger.debug(`[ArtifactStore] Loaded change proposal ${cpId} from ${fileName}`);
                            break;
                        }

                        case 'code-review': {
                            const crData = data.content || data;
                            const crId = data.metadata?.id || crData.id || `code-review-${fileName}`;
                            this.sourceFiles.set(ArtifactStore.perIdKey('codeReview', crId), fileUri);
                            const existing = this.artifacts.get('codeReviews') || [];
                            existing.push(crData);
                            this.artifacts.set('codeReviews', existing);
                            storeLogger.debug(`[ArtifactStore] Loaded code review ${crId} from ${fileName}`);
                            break;
                        }

                        case 'project-overview': {
                            this.sourceFiles.set('projectOverview', fileUri);
                            const poData = data.content || data;
                            this.artifacts.set('projectOverview', poData);
                            storeLogger.debug(`[ArtifactStore] Loaded project overview`);
                            break;
                        }

                        case 'project-context': {
                            this.sourceFiles.set('projectContext', fileUri);
                            const pcData = data.content || data;
                            this.artifacts.set('projectContext', pcData);
                            storeLogger.debug(`[ArtifactStore] Loaded project context`);
                            break;
                        }

                        case 'tech-spec': {
                            const tspcData = data.content || data;
                            const tspcId = data.metadata?.id || tspcData.id || `tech-spec-${fileName}`;
                            this.sourceFiles.set(ArtifactStore.perIdKey('techSpec', tspcId), fileUri);
                            const existing = this.artifacts.get('techSpecs') || [];
                            existing.push(tspcData);
                            this.artifacts.set('techSpecs', existing);
                            storeLogger.debug(`[ArtifactStore] Loaded tech spec ${tspcId} from ${fileName}`);
                            break;
                        }

                        case 'source-tree': {
                            this.sourceFiles.set('sourceTree', fileUri);
                            const stData = data.content || data;
                            this.artifacts.set('sourceTree', stData);
                            storeLogger.debug(`[ArtifactStore] Loaded source tree`);
                            break;
                        }

                        case 'test-summary': {
                            this.sourceFiles.set('testSummary', fileUri);
                            const tsmData = data.content || data;
                            this.artifacts.set('testSummary', tsmData);
                            storeLogger.debug(`[ArtifactStore] Loaded test summary`);
                            break;
                        }

                        case 'risks': {
                            this.sourceFiles.set('risks', fileUri);
                            const risksData = data.content || data;
                            this.artifacts.set('risks', risksData);
                            storeLogger.debug(`[ArtifactStore] Loaded risks`);
                            break;
                        }

                        case 'definition-of-done': {
                            this.sourceFiles.set('definitionOfDone', fileUri);
                            const dodData = data.content || data;
                            this.artifacts.set('definitionOfDone', dodData);
                            storeLogger.debug(`[ArtifactStore] Loaded definition of done`);
                            break;
                        }

                        // ─── CIS module artifacts ───────────────────────────────────
                        case 'storytelling': {
                            this.sourceFiles.set('storytelling', fileUri);
                            const storyData = data.content || data;
                            this.artifacts.set('storytelling', storyData);
                            storeLogger.debug(`[ArtifactStore] Loaded storytelling`);
                            break;
                        }

                        case 'problem-solving': {
                            this.sourceFiles.set('problemSolving', fileUri);
                            const psData = data.content || data;
                            this.artifacts.set('problemSolving', psData);
                            storeLogger.debug(`[ArtifactStore] Loaded problem solving`);
                            break;
                        }

                        case 'innovation-strategy': {
                            this.sourceFiles.set('innovationStrategy', fileUri);
                            const isData = data.content || data;
                            this.artifacts.set('innovationStrategy', isData);
                            storeLogger.debug(`[ArtifactStore] Loaded innovation strategy`);
                            break;
                        }

                        case 'design-thinking': {
                            this.sourceFiles.set('designThinking', fileUri);
                            const dtData = data.content || data;
                            this.artifacts.set('designThinking', dtData);
                            storeLogger.debug(`[ArtifactStore] Loaded design thinking`);
                            break;
                        }

                        default:
                            // Try to detect content structure
                            if (data.content?.epics || data.epics) {
                                // Has epics array - treat as epics file
                                const epics = data.content?.epics || data.epics;
                                for (const epicData of epics) {
                                    const epic = mapSchemaEpicToInternal(epicData);
                                    if (epic) {
                                        const existingIndex = allEpics.findIndex(e => e.id === epic.id);
                                        if (existingIndex >= 0) {
                                            mergeEpicDuplicate(allEpics[existingIndex], epic);
                                        } else {
                                            allEpics.push(epic);
                                        }
                                    }
                                }
                            } else if (data.content?.userStory || data.userStory) {
                                // Has userStory - treat as story
                                // Merge metadata-level fields into content so dependencies etc. are preserved
                                const storyMerged = {
                                    ...(data.metadata || {}),
                                    ...(data.content || data),
                                };
                                const story = mapSchemaStoryToInternal(storyMerged);
                                if (story) {
                                    standaloneStories.push(story);
                                    this.sourceFiles.set(ArtifactStore.perIdKey('story', story.id), fileUri);
                                }
                            }
                            break;
                    }
                } catch (e) {
                    storeLogger.debug(`[ArtifactStore] Could not parse ${fileUri.fsPath}: ${e}`);
                }
            }

            // Route standalone stories to their correct epic by epicId
            if (standaloneStories.length > 0) {
                // Build a set of all existing story IDs across all epics for dedup
                const allExistingIds = new Set<string>();
                const allExistingTitles = new Set<string>();
                for (const epic of allEpics) {
                    for (const s of epic.stories) {
                        allExistingIds.add(s.id);
                        allExistingTitles.add(s.title.toLowerCase().trim());
                    }
                }

                const orphanStories: Story[] = [];
                let routedCount = 0;
                let mergedCount = 0;
                let skippedCount = 0;

                for (const story of standaloneStories) {
                    // Skip if already present (by ID or title)
                    if (allExistingIds.has(story.id) || allExistingTitles.has(story.title.toLowerCase().trim())) {
                        // Merge enrichment fields into existing inline story
                        const sourceEpicId = story._sourceEpicId;
                        let existingStory: Story | undefined;
                        for (const epic of allEpics) {
                            existingStory = epic.stories.find((s: Story) =>
                                s.id === story.id || s.title.toLowerCase().trim() === story.title.toLowerCase().trim()
                            );
                            if (existingStory) break;
                        }
                        if (existingStory) {
                            // Standalone wins for richer fields (tasks, devNotes, devAgentRecord)
                            if (story.tasks && (!existingStory.tasks || existingStory.tasks.length === 0)) {
                                existingStory.tasks = story.tasks;
                            }
                            if (story.devNotes && !existingStory.devNotes) {
                                existingStory.devNotes = story.devNotes;
                            }
                            if (story.devAgentRecord && !existingStory.devAgentRecord) {
                                existingStory.devAgentRecord = story.devAgentRecord;
                            }
                            if (story.technicalNotes && !existingStory.technicalNotes) {
                                existingStory.technicalNotes = story.technicalNotes;
                            }
                            // Preserve standalone status if it's more advanced
                            const statusOrder = ['draft', 'ready', 'ready-for-dev', 'in-progress', 'in-review', 'review', 'done', 'complete'];
                            const existingIdx = statusOrder.indexOf(existingStory.status || 'draft');
                            const standaloneIdx = statusOrder.indexOf(story.status || 'draft');
                            if (standaloneIdx > existingIdx) {
                                existingStory.status = story.status;
                            }
                            mergedCount++;
                        } else {
                            skippedCount++;
                        }
                        continue;
                    }

                    // Route to correct epic using _sourceEpicId
                    const sourceEpicId = story._sourceEpicId;
                    if (sourceEpicId) {
                        const normalizedSourceId = normalizeEpicId(sourceEpicId);
                        const parentEpic = allEpics.find((e: any) =>
                            normalizeEpicId(e.id) === normalizedSourceId
                        );
                        if (parentEpic) {
                            parentEpic.stories.push(story);
                            allExistingIds.add(story.id);
                            allExistingTitles.add(story.title.toLowerCase().trim());
                            routedCount++;
                            continue;
                        }
                    }

                    // No epicId or no matching epic — collect as orphans
                    orphanStories.push(story);
                }

                // Handle orphan stories (no epicId or unmatched epicId)
                if (orphanStories.length > 0) {
                    if (allEpics.length === 0) {
                        // No epics at all — create a container so stories are visible
                        allEpics.push({
                            id: 'EPIC-DEFAULT',
                            title: 'Imported Stories',
                            goal: 'Stories imported from standalone files',
                            functionalRequirements: [],
                            status: 'draft',
                            stories: orphanStories
                        });
                        storeLogger.debug(`[ArtifactStore] Created default epic for ${orphanStories.length} orphan stories`);
                    } else {
                        // DO NOT dump into first epic — log a warning instead.
                        // Users should add epicId to standalone story files.
                        storeLogger.debug(`[ArtifactStore] WARNING: ${orphanStories.length} standalone stories have no matching epicId and were NOT added to any epic. Add epicId to these story files or run "Migrate to Reference Architecture".`);
                        for (const orphan of orphanStories) {
                            storeLogger.debug(`[ArtifactStore]   Orphan: ${orphan.id} — "${orphan.title}"`);
                        }
                    }
                }

                storeLogger.debug(`[ArtifactStore] Standalone stories: ${routedCount} routed by epicId, ${mergedCount} merged, ${skippedCount} skipped, ${orphanStories.length} orphaned`);
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
                        storeLogger.debug(`[ArtifactStore] No parent epic found for use-case ${uc.id}, skipping link`);
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
                                storeLogger.debug(`[ArtifactStore] Updated placeholder use-case ${uc.id} in epic ${resolvedEpicId}`);
                            }
                        } else {
                            parentEpic.useCases.push(uc);
                            storeLogger.debug(`[ArtifactStore] Linked use-case ${uc.id} to epic ${resolvedEpicId}`);
                            linkedCount += 1;
                        }
                    } else {
                        storeLogger.debug(`[ArtifactStore] Parent epic ${resolvedEpicId} not found for use-case ${uc.id}`);
                        unresolvedCount += 1;
                        unresolvedUseCases.push(uc);
                    }
                });
                storeLogger.debug(`[ArtifactStore] Use-case linking summary: ${linkedCount} linked, ${unresolvedCount} unresolved`);
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
                storeLogger.debug(`[ArtifactStore] Created Unlinked Use Cases epic with ${unresolvedUseCases.length} use-cases`);
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
                // Sort epics by numeric ID before storing.
                // fs.readdir / vscode.workspace.fs.readDirectory returns entries
                // in alphabetical order (epic-1, epic-10, epic-11, …, epic-2),
                // which produces incorrect index-based numbering downstream.
                allEpics.sort((a, b) => {
                    const na = parseInt(a.id, 10);
                    const nb = parseInt(b.id, 10);
                    if (!isNaN(na) && !isNaN(nb)) return na - nb;
                    return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
                });
                this.artifacts.set('epics', allEpics);

                // ─── Migration auto-detection ────────────────────────────
                // 1. Migrate any legacy implementation/ directory to single-source story files.
                //    Runs once per project load; fire-and-forget, does not block load path.
                void this.migrator.migrateImplementationFolder(folderUri);

                // 2. Check if epics.json still has inline story objects (pre-migration).
                // Show a one-time nudge per session.
                if (!this._migrationPromptShown) {
                    this.checkForInlineStories(folderUri);
                }

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

                // ── Auto-migrate: write standalone requirements.json if absent ──
                // If no standalone requirements file exists on disk but we have
                // requirements in memory (from PRD, requirementsInventory, or
                // functional-requirements.json), write a standalone file so data
                // survives after syncToFiles strips requirementsInventory.
                if (!this.sourceFiles.has('requirements')
                    && (requirements.functional.length || requirements.nonFunctional.length || requirements.additional.length)) {
                    try {
                        let reqDir = folderUri;
                        for (const subdir of ['solutioning', 'planning']) {
                            const candidate = vscode.Uri.joinPath(folderUri, subdir);
                            try { await vscode.workspace.fs.stat(candidate); reqDir = candidate; break; }
                            catch { /* dir doesn't exist, try next */ }
                        }
                        const reqFileUri = vscode.Uri.joinPath(reqDir, 'requirements.json');
                        const reqContent = {
                            metadata: {
                                schema: 'requirements',
                                generatedAt: new Date().toISOString(),
                                description: 'Auto-migrated requirements from PRD/requirementsInventory'
                            },
                            content: {
                                functional: requirements.functional,
                                nonFunctional: requirements.nonFunctional,
                                additional: requirements.additional
                            }
                        };
                        const reqOutputFormat = this.getOutputFormat();
                        if (reqOutputFormat === 'json' || reqOutputFormat === 'dual') {
                            const reqBytes = Buffer.from(JSON.stringify(reqContent, null, 2), 'utf-8');
                            await vscode.workspace.fs.writeFile(reqFileUri, reqBytes);
                        }
                        if (reqOutputFormat === 'markdown' || reqOutputFormat === 'dual') {
                            let reqMd = `# Requirements\n\n`;
                            if (requirements.functional.length) {
                                reqMd += `## Functional Requirements (${requirements.functional.length})\n\n`;
                                for (const r of requirements.functional) {
                                    reqMd += `- **${r.id}**: ${r.title || r.description || ''}\n`;
                                }
                                reqMd += '\n';
                            }
                            if (requirements.nonFunctional.length) {
                                reqMd += `## Non-Functional Requirements (${requirements.nonFunctional.length})\n\n`;
                                for (const r of requirements.nonFunctional) {
                                    reqMd += `- **${r.id}**: ${r.title || r.description || ''}\n`;
                                }
                                reqMd += '\n';
                            }
                            if (requirements.additional.length) {
                                reqMd += `## Additional Requirements (${requirements.additional.length})\n\n`;
                                for (const r of requirements.additional) {
                                    reqMd += `- **${r.id}**: ${r.title || r.description || ''}\n`;
                                }
                                reqMd += '\n';
                            }
                            await writeMarkdownCompanion(reqFileUri, 'requirements.md', reqMd);
                        }
                        this.sourceFiles.set('requirements', reqFileUri);
                        storeLogger.debug(`[ArtifactStore] Auto-migrated requirements to standalone requirements.json (${requirements.functional.length} FR, ${requirements.nonFunctional.length} NFR, ${requirements.additional.length} additional)`);
                    } catch (e) {
                        storeLogger.debug(`[ArtifactStore] WARNING: Failed to auto-migrate requirements: ${e}`);
                    }
                }
                this.artifacts.set('currentStep', 'review');
                
                const totalStories = allEpics.reduce((sum, e) => sum + (e.stories?.length || 0), 0);
                const tcCount = (this.artifacts.get('testCases') || []).length;
                storeLogger.debug(`[ArtifactStore] SUCCESS: Loaded ${allEpics.length} epics, ${totalStories} stories, ${requirements.functional.length} FRs, ${tcCount} test cases`);

                // ── Log load-time schema validation summary ──
                // Always update the stored issues so stale data from a
                // previous load is cleared (e.g. after "Fix Schemas").
                this.artifacts.set('_loadValidationIssues', loadValidationIssues);

                if (loadValidationIssues.length > 0) {
                    storeLogger.debug(
                        `[ArtifactStore] SCHEMA WARNINGS: ${loadValidationIssues.length} file(s) have schema issues:`
                    );
                    for (const issue of loadValidationIssues) {
                        storeLogger.debug(
                            `  ${issue.file} (${issue.type}): ${issue.errors.join('; ')}`
                        );
                    }
                    storeLogger.debug(
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
                            `Open the AgileAgentCanvas canvas and click "Fix Schemas" to auto-repair.`,
                            'Open Canvas'
                        ).then(choice => {
                            if (choice === 'Open Canvas') {
                                vscode.commands.executeCommand('agileagentcanvas.openCanvas');
                            }
                        });
                    }
                }


                // Rebuild all cross-artifact derived state (coveragePlan→TCs,
                // riskAssessment→epic.risks) from whatever is now in memory.
                // This runs AFTER artifacts.set('epics', allEpics) so epics
                // are available for storyId resolution and risk attachment.

                await this._harmonizeAndNotify();
            } else {
                storeLogger.debug('[ArtifactStore] WARNING: No artifacts found in folder');
            }

        } catch (error) {
            storeLogger.debug(`[ArtifactStore] ERROR loading BMAD artifacts: ${error}`);
        }
    }

    async backupArtifactFiles(): Promise<vscode.Uri | null> {
        if (!this.sourceFolder) return null;
        return backupArtifactFiles(this.sourceFolder);
    }

    async pruneOldBackups(keepCount = 5): Promise<void> {
        if (!this.sourceFolder) return;
        return pruneOldBackups(this.sourceFolder, keepCount);
    }
    // =========================================================================
    // Sprint-Status YAML → JSON sync pipeline (delegated to SprintStatusSync)
    // =========================================================================

    private async findSprintStatusYaml(folderUri: vscode.Uri): Promise<vscode.Uri | undefined> {
        return this.sprintSync.findSprintStatusYaml(folderUri);
    }

    private async parseSprintStatusYamlFile(fileUri: vscode.Uri): Promise<Record<string, string>> {
        return this.sprintSync.parseSprintStatusYamlFile(fileUri);
    }

    private mapYamlStatusToInternal(rawStatus: string): string | undefined {
        return this.sprintSync.mapYamlStatusToInternal(rawStatus);
    }

    private mapInternalStatusToYaml(status: string): string {
        return this.sprintSync.mapInternalStatusToYaml(status);
    }

    async syncStatusToYaml(
        type: 'epic' | 'story',
        epicId: string,
        storyId: string | undefined,
        newStatus: string,
    ): Promise<void> {
        return this.sprintSync.syncStatusToYaml(type, epicId, storyId, newStatus);
    }

    private detectSprintStatusMismatches(
        statusMap: Record<string, string>
    ): { key: string; type: 'epic' | 'story'; epicId: string; storyId?: string; currentStatus: string; newStatus: string }[] {
        return this.sprintSync.detectSprintStatusMismatches(statusMap);
    }

    private async patchEpicStatusOnDisk(
        epicId: string, newStatus: string, skipYamlSync: boolean = false,
    ): Promise<boolean> {
        return this.sprintSync.patchEpicStatusOnDisk(epicId, newStatus, skipYamlSync);
    }

    private async patchStoryStatusOnDisk(
        epicId: string, storyId: string, newStatus: string, skipYamlSync: boolean = false,
    ): Promise<boolean> {
        return this.sprintSync.patchStoryStatusOnDisk(epicId, storyId, newStatus, skipYamlSync);
    }

    // =========================================================================
    // Atomic Status Sync (LLM tool backing)
    // =========================================================================

    async syncStoryStatusAtomic(
        storyId: string,
        epicId: string,
        newStatus: string
    ): Promise<{ success: boolean; updatedFiles: string[] }> {
        return this.sprintSync.syncStoryStatusAtomic(storyId, epicId, newStatus);
    }


    async syncEpicStatusAtomic(
        epicId: string,
        newStatus: string
    ): Promise<{ success: boolean; updatedFiles: string[] }> {
        return this.sprintSync.syncEpicStatusAtomic(epicId, newStatus);
    }


    private async findAllJsonFiles(
        folderUri: vscode.Uri,
        depth = 0,
        visited: Set<string> = new Set(),
        maxDepth = 10
    ): Promise<vscode.Uri[]> {
        return findAllJsonFiles(folderUri, depth, visited, maxDepth);
    }

    private detectArtifactType(data: any, fileName: string): string {
        return detectArtifactType(data, fileName);
    }

    private async loadUiState(folderUri: vscode.Uri): Promise<void> {
        await loadUiState(folderUri, this.artifacts);
    }

    private async loadEpicStoryRefs(epic: Epic, epicData: any, epicFileUri: vscode.Uri): Promise<void> {
        await loadEpicStoryRefs(epic, epicData, epicFileUri, () => this.getOutputChannel());
    }





    /**
     * Map status string to valid status enum
     */
    /**
     * Map a raw status string to a canonical status value.
     *
     * Valid canonical statuses (superset across stories, epics, and metadata):
     *   draft, ready, ready-for-dev, in-progress, in-review, review,
     *   ready-for-review, blocked, complete, completed, done,
     *   approved, archived, implementing, not-started, backlog
     *
     * Legacy aliases are mapped to their canonical equivalents:
     *   in_progress → in-progress, approved → ready (for stories/epics),
     *   complete/completed → done, etc.
     */



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
        return this.repairer.fixAndSyncToFiles();
    }

    async syncToFiles(): Promise<void> {
        logDebug('syncToFiles called, sourceFolder:', this.sourceFolder?.fsPath);

        // L4: Skip sync if nothing changed since last write
        if (!this._dirty) {
            logDebug('syncToFiles: skipping — no dirty changes');
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
                await this.fileWriter.saveVisionToFile(state, baseUri);
            } else {
                await this.fileWriter.deleteSourceFile('vision');
            }
        } catch (e) { errors.push(`vision: ${e}`); }

        // Save product brief if it exists
        try {
            if (state.productBrief) {
                await this.fileWriter.saveProductBriefToFile(state, baseUri);
            } else {
                await this.fileWriter.deleteSourceFile('productBrief');
            }
        } catch (e) { errors.push(`productBrief: ${e}`); }

        // Save PRD if it exists
        try {
            if (state.prd) {
                await this.fileWriter.savePRDToFile(state, baseUri);
            } else {
                await this.fileWriter.deleteSourceFile('prd');
            }
        } catch (e) { errors.push(`prd: ${e}`); }

        // Save architecture if it exists
        try {
            if (state.architecture) {
                await this.fileWriter.saveArchitectureToFile(state, baseUri);
            } else {
                await this.fileWriter.deleteSourceFile('architecture');
            }
        } catch (e) { errors.push(`architecture: ${e}`); }
        
        // Save epics if they exist
        try {
            if (state.epics && state.epics.length > 0) {
                await this.fileWriter.saveStoriesToFile(state, baseUri);
                await this.fileWriter.saveEpicsToFile(state, baseUri);
            }
        } catch (e) { errors.push(`epics: ${e}`); }

        // Save test cases if they exist
        try {
            if (state.testCases && state.testCases.length > 0) {
                await this.fileWriter.saveTestCasesToFile(state, baseUri);
            } else {
                await this.fileWriter.deleteSourceFile('testCases');
            }
        } catch (e) { errors.push(`testCases: ${e}`); }

        // Save test strategy if it exists
        try {
            if (state.testStrategy) {
                await this.fileWriter.saveTestStrategyToFile(state, baseUri);
            } else {
                await this.fileWriter.deleteSourceFile('testStrategy');
            }
        } catch (e) { errors.push(`testStrategy: ${e}`); }

        // Save test designs if they exist
        try {
            if (state.testDesigns && state.testDesigns.length > 0) {
                // Determine active test design IDs
                const activeIds = new Set(state.testDesigns.map((td: any) => td.id));
                // Delete old ones
                for (const [key, _] of this.sourceFiles.entries()) {
                    if (key.startsWith('testDesign:')) {
                        const id = key.substring(11);
                        if (!activeIds.has(id)) {
                            await this.fileWriter.deleteSourceFile(key);
                        }
                    }
                }
                for (const td of state.testDesigns) {
                    await this.fileWriter.saveTestDesignToFile(td, state, baseUri);
                }
            } else {
                for (const [key, _] of this.sourceFiles.entries()) {
                    if (key.startsWith('testDesign:')) {
                        await this.fileWriter.deleteSourceFile(key);
                    }
                }
            }
        } catch (e) { errors.push(`testDesigns: ${e}`); }

        // ─── TEA module artifacts ───────────────────────────────────────
        try {
            if (state.traceabilityMatrix) {
                await this.fileWriter.saveGenericArtifactToFile('traceabilityMatrix', 'traceability-matrix', state.traceabilityMatrix, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('traceabilityMatrix'); }
        } catch (e) { errors.push(`traceabilityMatrix: ${e}`); }

        const syncArrayArtifacts = async (stateArray: any[] | undefined, baseKey: string, fileSlugBase: string) => {
            if (stateArray && stateArray.length > 0) {
                const activeIds = new Set(stateArray.map(a => String(a.id || a.metadata?.id || 'default')));
                for (const [key, _] of this.sourceFiles.entries()) {
                    if (key.startsWith(`${baseKey}:`)) {
                        const id = String(key.substring(baseKey.length + 1));
                        if (!activeIds.has(id)) {
                            await this.fileWriter.deleteSourceFile(key);
                        }
                    }
                }
                for (const item of stateArray) {
                    const id = String(item.id || item.metadata?.id || 'default');
                    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '-');
                    await this.fileWriter.saveGenericArtifactToFile(`${baseKey}:${id}`, `${fileSlugBase}-${safeId}`, item, state, baseUri);
                }
            } else {
                for (const [key, _] of this.sourceFiles.entries()) {
                    if (key.startsWith(`${baseKey}:`)) {
                        await this.fileWriter.deleteSourceFile(key);
                    }
                }
            }
        };

        try { await syncArrayArtifacts(state.testReviews, 'testReview', 'test-review'); } catch (e) { errors.push(`testReviews: ${e}`); }

        try {
            if (state.nfrAssessment) {
                await this.fileWriter.saveGenericArtifactToFile('nfrAssessment', 'nfr-assessment', state.nfrAssessment, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('nfrAssessment'); }
        } catch (e) { errors.push(`nfrAssessment: ${e}`); }

        try {
            if (state.testFramework) {
                await this.fileWriter.saveGenericArtifactToFile('testFramework', 'test-framework', state.testFramework, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('testFramework'); }
        } catch (e) { errors.push(`testFramework: ${e}`); }

        try {
            if (state.ciPipeline) {
                await this.fileWriter.saveGenericArtifactToFile('ciPipeline', 'ci-pipeline', state.ciPipeline, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('ciPipeline'); }
        } catch (e) { errors.push(`ciPipeline: ${e}`); }

        try {
            if (state.automationSummary) {
                await this.fileWriter.saveGenericArtifactToFile('automationSummary', 'automation-summary', state.automationSummary, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('automationSummary'); }
        } catch (e) { errors.push(`automationSummary: ${e}`); }

        try {
            if (state.atddChecklist) {
                await this.fileWriter.saveGenericArtifactToFile('atddChecklist', 'atdd-checklist', state.atddChecklist, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('atddChecklist'); }
        } catch (e) { errors.push(`atddChecklist: ${e}`); }

        // ─── BMM module artifacts ───────────────────────────────────────
        try { await syncArrayArtifacts(state.researches, 'research', 'research'); } catch (e) { errors.push(`researches: ${e}`); }

        try { await syncArrayArtifacts(state.uxDesigns, 'uxDesign', 'ux-design'); } catch (e) { errors.push(`uxDesigns: ${e}`); }

        try { await syncArrayArtifacts(state.readinessReports, 'readinessReport', 'readiness-report'); } catch (e) { errors.push(`readinessReports: ${e}`); }

        try { await syncArrayArtifacts(state.sprintStatuses, 'sprintStatus', 'sprint-status'); } catch (e) { errors.push(`sprintStatuses: ${e}`); }

        try { await syncArrayArtifacts(state.retrospectives, 'retrospective', 'retrospective'); } catch (e) { errors.push(`retrospectives: ${e}`); }

        try { await syncArrayArtifacts(state.changeProposals, 'changeProposal', 'change-proposal'); } catch (e) { errors.push(`changeProposals: ${e}`); }

        try { await syncArrayArtifacts(state.codeReviews, 'codeReview', 'code-review'); } catch (e) { errors.push(`codeReviews: ${e}`); }

        try {
            if (state.risks) {
                await this.fileWriter.saveGenericArtifactToFile('risks', 'risks', state.risks, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('risks'); }
        } catch (e) { errors.push(`risks: ${e}`); }

        try {
            if (state.definitionOfDone) {
                await this.fileWriter.saveGenericArtifactToFile('definitionOfDone', 'definition-of-done', state.definitionOfDone, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('definitionOfDone'); }
        } catch (e) { errors.push(`definitionOfDone: ${e}`); }

        try {
            if (state.projectOverview) {
                await this.fileWriter.saveGenericArtifactToFile('projectOverview', 'project-overview', state.projectOverview, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('projectOverview'); }
        } catch (e) { errors.push(`projectOverview: ${e}`); }

        try {
            if (state.projectContext) {
                await this.fileWriter.saveGenericArtifactToFile('projectContext', 'project-context', state.projectContext, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('projectContext'); }
        } catch (e) { errors.push(`projectContext: ${e}`); }

        try { await syncArrayArtifacts(state.techSpecs, 'techSpec', 'tech-spec'); } catch (e) { errors.push(`techSpecs: ${e}`); }

        try {
            if (state.sourceTree) {
                await this.fileWriter.saveGenericArtifactToFile('sourceTree', 'source-tree', state.sourceTree, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('sourceTree'); }
        } catch (e) { errors.push(`sourceTree: ${e}`); }

        try {
            if (state.testSummary) {
                await this.fileWriter.saveGenericArtifactToFile('testSummary', 'test-summary', state.testSummary, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('testSummary'); }
        } catch (e) { errors.push(`testSummary: ${e}`); }

        // ─── CIS module artifacts ───────────────────────────────────────
        try {
            if (state.storytelling) {
                await this.fileWriter.saveGenericArtifactToFile('storytelling', 'storytelling', state.storytelling, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('storytelling'); }
        } catch (e) { errors.push(`storytelling: ${e}`); }

        try {
            if (state.problemSolving) {
                await this.fileWriter.saveGenericArtifactToFile('problemSolving', 'problem-solving', state.problemSolving, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('problemSolving'); }
        } catch (e) { errors.push(`problemSolving: ${e}`); }

        try {
            if (state.innovationStrategy) {
                await this.fileWriter.saveGenericArtifactToFile('innovationStrategy', 'innovation-strategy', state.innovationStrategy, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('innovationStrategy'); }
        } catch (e) { errors.push(`innovationStrategy: ${e}`); }

        try {
            if (state.designThinking) {
                await this.fileWriter.saveGenericArtifactToFile('designThinking', 'design-thinking', state.designThinking, state, baseUri);
            } else { await this.fileWriter.deleteSourceFile('designThinking'); }
        } catch (e) { errors.push(`designThinking: ${e}`); }

        if (errors.length > 0) {
            storeLogger.debug(`[ArtifactStore] syncToFiles completed with ${errors.length} error(s):`);
            errors.forEach(err => storeLogger.debug(`  - ${err}`));
        }
        
        // ─── Persist requirements to standalone file ──────────────────────
        // syncToFiles does NOT write requirementsInventory back to epics.json
        // (PRD is the authoritative source for NFR/additional). To prevent
        // data loss after save+reload, persist the in-memory requirements
        // to a standalone requirements.json in the solutioning/ dir.
        // On reload, the `case 'requirements'` handler picks this file up.
        try {
            const reqs = state.requirements;
            if (reqs && (reqs.functional?.length || reqs.nonFunctional?.length || reqs.additional?.length)) {
                // Always write to solutioning/
                const reqDir = vscode.Uri.joinPath(baseUri, 'solutioning');
                try { await vscode.workspace.fs.createDirectory(reqDir); } catch { /* exists */ }
                const reqFileUri = vscode.Uri.joinPath(reqDir, 'requirements.json');
                const reqContent = {
                    metadata: {
                        schema: 'requirements',
                        generatedAt: new Date().toISOString(),
                        description: 'Standalone requirements file auto-generated by syncToFiles'
                    },
                    content: {
                        functional: reqs.functional || [],
                        nonFunctional: reqs.nonFunctional || [],
                        additional: reqs.additional || []
                    }
                };
                const reqSyncFormat = this.getOutputFormat();
                if (reqSyncFormat === 'json' || reqSyncFormat === 'dual') {
                    const reqBytes = Buffer.from(JSON.stringify(reqContent, null, 2), 'utf-8');
                    await vscode.workspace.fs.writeFile(reqFileUri, reqBytes);
                }
                if (reqSyncFormat === 'markdown' || reqSyncFormat === 'dual') {
                    let reqMd = `# Requirements\n\n`;
                    const fr = reqs.functional || [];
                    const nfr = reqs.nonFunctional || [];
                    const add = reqs.additional || [];
                    if (fr.length) {
                        reqMd += `## Functional Requirements (${fr.length})\n\n`;
                        for (const r of fr) { reqMd += `- **${r.id}**: ${r.title || r.description || ''}\n`; }
                        reqMd += '\n';
                    }
                    if (nfr.length) {
                        reqMd += `## Non-Functional Requirements (${nfr.length})\n\n`;
                        for (const r of nfr) { reqMd += `- **${r.id}**: ${r.title || r.description || ''}\n`; }
                        reqMd += '\n';
                    }
                    if (add.length) {
                        reqMd += `## Additional Requirements (${add.length})\n\n`;
                        for (const r of add) { reqMd += `- **${r.id}**: ${r.title || r.description || ''}\n`; }
                        reqMd += '\n';
                    }
                    await writeMarkdownCompanion(reqFileUri, 'requirements.md', reqMd);
                }
                storeLogger.debug(`[ArtifactStore] syncToFiles: wrote requirements.json (${reqs.functional?.length || 0} FR, ${reqs.nonFunctional?.length || 0} NFR, ${reqs.additional?.length || 0} additional)`);
            }
        } catch (e) { errors.push(`requirements: ${e}`); }

        // ─── Generate README.md — LLM orientation guide ──────────────────
        try {
            const readmeLines = [
                `# ${state.projectName || 'Project'} — Agile Agent Canvas Artifacts`,
                '',
                '> **This file is auto-generated.** It helps LLMs and developers navigate the artifact structure.',
                '',
                '## File Structure',
                '',
                '```',
                'epics/',
                '  epic-{id}/',
                '    epic.json                  ← Epic metadata + storyRefs (lightweight references)',
                '    stories/',
                '      {id}.json                ← Full story content (AC, tasks, test cases)',
                '    tests/',
                '      test-cases.json          ← Test cases scoped to this epic',
                '      test-design-{id}.json    ← Test design scoped to this epic',
                'epics.json                     ← Manifest (metadata + refs to epic files)',
                '```',
                '',
                '## Quick Reference for LLMs',
                '',
                '| To find...               | Read this file                           |',
                '|--------------------------|-------------------------------------------|',
                '| List of all epics        | `epics.json` or `epics/epic-{id}/epic.json` |',
                '| Full epic details        | `epics/epic-{id}/epic.json`               |',
                '| List of all stories      | Iterate `epics/*/stories/*.json`          |',
                '| Full story details       | `epics/epic-{id}/stories/{id}.json`       |',
                '| Epic test cases          | `epics/epic-{id}/tests/test-cases.json`   |',
                '',
                '## Key Conventions',
                '',
                '- **Epic IDs** use numeric format: `1`, `2`, `15`',
                '- **Story IDs** use dot notation: `1.1`, `15.3`',
                '- **epics.json** is a manifest with `file` refs, NOT full epic content',
                '- To update an epic, edit its standalone file, not the manifest',
                '',
            ];
            const readmeUri = vscode.Uri.joinPath(baseUri, 'README.md');
            await vscode.workspace.fs.writeFile(
                readmeUri,
                Buffer.from(readmeLines.join('\n'), 'utf-8')
            );
        } catch (e) { errors.push(`readme: ${e}`); }

        logDebug('syncToFiles completed');
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
    
    /**
     * Artifact writes are always JSON.
     * Markdown companions are no longer auto-generated during LLM artifact writes
     * to prevent JSON↔MD bouncing. MD export is still available via the export command.
     */
    private getOutputFormat(): 'json' | 'markdown' | 'dual' {
        return 'json';
    }

    
    /**
     * Save epics to JSON file
     */
    // ═══════════════════════════════════════════════════════════════════════
    // Migration detection + execution
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Migrate legacy `implementation/` directory files to the canonical single-source
     * location at `epics/epic-{N}/stories/{id}.json`.
     *
     * Steps:
     * 1. Check if `{sourceFolder}/implementation/` exists.
     * 2. Iterate over all .json files found inside it.
     * 3. For each file, extract the story `id` and `epicId` from its content.
     * 4. Determine the canonical target path: epics/epic-{N}/stories/{id}.json
     * 5. If the canonical file does NOT already exist, write the content there.
     * 6. Rename `implementation/` → `.deprecated_implementation/` so it is naturally
     *    excluded from recursive scans (dot-folders are skipped) while preserving data.
     *
     * Runs fire-and-forget — does not block the load path.
     */

    private async checkForInlineStories(folderUri: vscode.Uri): Promise<void> {
        if (this._migrationPromptShown) return;
        const shown = await checkForInlineStories(folderUri, this.sourceFiles);
        if (shown) this._migrationPromptShown = true;
    }

    /**
     * Migrate from inline stories in epics.json to standalone story files.
     * 
     * Steps:
     * 1. Backup epics.json → epics.json.pre-migration.bak
     * 2. For each inline story: write to epics/epic-{N}/stories/{epicId}-{storyId}.json
     * 3. Replace inline story objects with string refs in epics.json
     * 4. Remove requirementsInventory from epics.json (PRD is authoritative)
     * 5. Reload from disk to verify
     * 
     * Returns a summary of what was migrated.
     */
    async migrateToReferenceArchitecture(): Promise<{ success: boolean; summary: string }> {
        return this.migrator.migrateToReferenceArchitecture();
    }


    async restorePreMigrationBackup(): Promise<{ success: boolean; summary: string }> {
        return this.migrator.restorePreMigrationBackup();
    }


    private getOutputChannel(): vscode.OutputChannel {
        // Use the shared output channel from the extension, which allows for testing mocks
        
        return (globalThis as unknown as { __acOutputChannel?: any }).__acOutputChannel || vscode.window.createOutputChannel('Agile Agent Canvas');
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
     * @param baseUri   workspace base URI
     */

    /**
     * Generate a human-readable markdown rendering of a generic artifact.
     *
     * This produces a structured document by walking the artifact's top-level
     * fields and rendering objects/arrays as nested markdown sections.
     */










    /**
     * Generate a combined markdown document covering all artifacts in the project.
     * Used by the export command when "markdown" or "all formats" is selected.
     */

    async exportArtifacts(format: string, targetUri?: vscode.Uri): Promise<vscode.Uri | null> {
        return exportArtifacts(this.getState(), format, targetUri);
    }


    /**
     * Generate JIRA-compatible CSV.
     *
     * Uses RFC 4180 encoding (double-quote escaping) and formula injection
     * protection.  10 user-controlled string fields flow through csvEscape().
     */

    /**
     * Generate a styled PDF document from the project artifacts.
     *
     * Converts the markdown representation into a structured PDF using PDFKit
     * with proper headings, bullet lists, horizontal rules, and styled sections.
     * Uses only built-in PDF fonts (Helvetica family) for portability.
     */

    /**
     * Strip inline markdown formatting (bold, italic, code, links) to plain text.
     */

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
        storeLogger.debug(`[ArtifactStore] loadFromState: loaded project "${data.projectName || '(unnamed)'}"`);
    }

    /**
     * Merge imported state into existing state (used by import "Merge" mode).
     * Adds new items without removing existing ones. For arrays (epics, requirements,
     * test cases) items are deduplicated by ID; for singleton artifacts (vision, prd,
     * architecture, productBrief, testStrategy) existing values are preserved.
     */
    mergeFromState(data: Partial<BmadArtifacts>): void {
        mergeFromState(this.artifacts, () => this.notifyChange(), data);
    }

    /**
     * Dispose resources
     */
    dispose() {
        this._onDidChangeArtifacts.dispose();
        this._onHarnessFailures.dispose();
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
        return findArtifactById(this.getState(), id);
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
            storeLogger.debug(`[ArtifactStore] Selected artifact: ${found.type} ${id}`);
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
