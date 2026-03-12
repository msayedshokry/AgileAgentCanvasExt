/**
 * BMAD artifact type definitions
 * Extracted from artifact-store.ts for shared use across the extension and webview.
 */

export interface BmadArtifacts {
    projectName: string;
    currentStep: WizardStep;
    vision?: {
        productName?: string;
        problemStatement: string;
        /** Nested vision sub-object from standard BMAD schema (content.vision.*) */
        vision?: {
            statement?: string;
            problemStatement?: string;
            proposedSolution?: string;
        };
        targetUsers: any[];
        valueProposition: string;
        /** Rich success metrics objects from the JSON file */
        successMetrics?: any[];
        /** Flattened success criteria strings for backward compat */
        successCriteria: string[];
        status: 'draft' | 'approved';
    };
    requirements?: {
        functional: FunctionalRequirement[];
        nonFunctional: NonFunctionalRequirement[];
        additional: AdditionalRequirement[];
    };
    epics?: Epic[];
    aiCursor?: AICursor;
    prd?: PRD;
    architecture?: Architecture;
    productBrief?: ProductBrief;
    testCases?: TestCase[];
    testStrategy?: TestStrategy;
    testDesign?: TestDesign;
    // TEA module artifacts
    traceabilityMatrix?: TraceabilityMatrix;
    testReview?: TestReview;
    nfrAssessment?: NfrAssessment;
    testFramework?: TestFramework;
    ciPipeline?: CiPipeline;
    automationSummary?: AutomationSummary;
    atddChecklist?: AtddChecklist;
    // BMM module artifacts
    research?: Research;
    uxDesign?: UxDesign;
    readinessReport?: ReadinessReport;
    sprintStatus?: SprintStatus;
    retrospective?: Retrospective;
    changeProposal?: ChangeProposal;
    codeReview?: CodeReview;
    risks?: Risks;
    definitionOfDone?: DefinitionOfDone;
    projectOverview?: ProjectOverview;
    projectContext?: ProjectContext;
    techSpec?: TechSpec;
    sourceTree?: SourceTree;
    testSummary?: TestSummary;
    // CIS module artifacts
    storytelling?: Storytelling;
    problemSolving?: ProblemSolving;
    innovationStrategy?: InnovationStrategy;
    designThinking?: DesignThinking;
}

export type RequirementStatus = 'draft' | 'approved' | 'implemented' | 'verified' | 'deprecated';

export type VerificationMethod = 'test' | 'inspection' | 'demonstration' | 'analysis';

export interface FunctionalRequirement {
    id: string;
    title: string;
    description: string;
    capabilityArea?: string;
    relatedEpics?: string[];
    relatedStories?: string[];
    priority?: PriorityLevel;
    status?: RequirementStatus;
    type?: string;
    rationale?: string;
    source?: string;
    metrics?: {
        target: string;
        threshold?: string;
        unit?: string;
        measurementMethod?: string;
    };
    verificationMethod?: VerificationMethod;
    verificationNotes?: string;
    acceptanceCriteria?: AcceptanceCriterion[];
    dependencies?: string[];
    implementationNotes?: string;
    notes?: string;
}

export interface NonFunctionalRequirement {
    id: string;
    title: string;
    description: string;
    category: string;
    metrics?: {
        target: string;
        threshold?: string;
        unit?: string;
    };
}

export interface AdditionalRequirement {
    id: string;
    title: string;
    description: string;
    category: string;
}

export type PriorityLevel = 'must-have' | 'should-have' | 'could-have' | 'won\'t-have' | 'P0' | 'P1' | 'P2' | 'P3';

export interface EpicEffortEstimate {
    totalSprints?: number;
    totalDays?: number;
    breakdown?: {
        phase: string;
        effort: string;
    }[];
}

/** Rich object form used by epics.schema.json for upstream/downstream deps */
export interface EpicDependencyRef {
    epicId: string;
    reason?: string;
}

export interface EpicDependencies {
    upstream?: (string | EpicDependencyRef)[];
    downstream?: (string | EpicDependencyRef)[];
    relatedEpics?: string[];
}

export interface Epic {
    id: string;
    title: string;
    goal: string;
    valueDelivered?: string;
    functionalRequirements: string[];
    nonFunctionalRequirements?: string[];
    additionalRequirements?: string[];
    status: 'draft' | 'ready' | 'ready-for-dev' | 'in-progress' | 'in-review' | 'blocked' | 'review' | 'done' | 'complete' | 'backlog';
    stories: Story[];
    priority?: PriorityLevel;
    storyCount?: number;
    dependencies?: string[];
    epicDependencies?: EpicDependencies;
    implementationNotes?: string[];
    acceptanceSummary?: string;
    effortEstimate?: EpicEffortEstimate;
    useCases?: UseCase[];
    testStrategy?: TestStrategy;
    fitCriteria?: FitCriteria;
    successMetrics?: SuccessMetrics;
    risks?: Risk[];
    definitionOfDone?: string[];
    technicalSummary?: TechnicalSummary;
}

export interface StoryTask {
    id: string;
    description: string;
    acReference?: string;
    estimatedHours?: number;
    completed: boolean;
    subtasks?: {
        id: string;
        description: string;
        completed: boolean;
    }[];
}

/** Rich object form used by story.schema.json for blocked-by deps */
export interface StoryBlockedByRef {
    storyId: string;
    title?: string;
    status?: string;
    reason?: string;
}

/** Rich object form used by story.schema.json for blocks deps */
export interface StoryBlocksRef {
    storyId: string;
    title?: string;
}

/** Rich object form used by story.schema.json for external deps */
export interface ExternalDependencyRef {
    dependency: string;
    status?: string;
    owner?: string;
}

export interface StoryDependencies {
    blockedBy?: (string | StoryBlockedByRef)[];
    blocks?: (string | StoryBlocksRef)[];
    relatedStories?: string[];
    externalDependencies?: (string | ExternalDependencyRef)[];
}

export interface StoryDevNotes {
    overview?: string;
    architecturePatterns?: string[];
    componentsToCreate?: (string | { path?: string; type?: string; description?: string })[];
    componentsToModify?: { path?: string; changes?: string }[];
    dataModels?: string[];
    apiEndpoints?: { method?: string; path?: string; description?: string }[];
    testingStrategy?: string | {
        unitTests?: string[];
        integrationTests?: string[];
        e2eTests?: string[];
        testDataNeeded?: string[];
    };
    securityConsiderations?: string | string[];
    performanceConsiderations?: string | string[];
    accessibilityConsiderations?: string[];
    edgeCases?: string[];
    potentialChallenges?: string[];
}

export interface StoryDevAgentRecord {
    agentModel?: string;
    sessionId?: string;
    startedAt?: string;
    completedAt?: string;
    debugLogRefs?: string[];
    completionNotes?: string[];
    filesModified?: (string | {
        path?: string;
        action?: 'created' | 'modified' | 'deleted' | 'renamed';
        description?: string;
        linesChanged?: number;
    })[];
    testsRun?: (string | {
        total?: number;
        passed?: number;
        failed?: number;
        skipped?: number;
    })[];
    issuesEncountered?: (string | {
        issue?: string;
        resolution?: string;
    })[];
}

export interface StoryHistoryEntry {
    timestamp: string;
    fromStatus: string;
    toStatus: string;
    changedBy?: string;
    notes?: string;
}

export interface Story {
    id: string;
    title: string;
    userStory: {
        asA: string;
        iWant: string;
        soThat: string;
    };
    acceptanceCriteria: AcceptanceCriterion[];
    technicalNotes?: string;
    status: 'draft' | 'ready' | 'ready-for-dev' | 'in-progress' | 'in-review' | 'blocked' | 'review' | 'done' | 'complete' | 'backlog';
    storyPoints?: number;
    priority?: PriorityLevel;
    estimatedEffort?: string;
    storyFormat?: 'structured' | 'prose';
    background?: string;
    problemStatement?: string;
    proposedSolution?: string;
    solutionDetails?: string[];
    implementationDetails?: string[];
    definitionOfDone?: string[];
    requirementRefs?: string[];
    uxReferences?: any[];
    references?: any[];
    notes?: string;
    dependencies?: StoryDependencies;
    tasks?: StoryTask[];
    devNotes?: StoryDevNotes;
    devAgentRecord?: StoryDevAgentRecord;
    history?: StoryHistoryEntry[];
    labels?: string[];
    assignee?: string;
    reviewer?: string;
}

export interface AcceptanceCriterion {
    id?: string;
    /** Structured GWT format */
    given?: string;
    when?: string;
    then?: string;
    and?: string[];
    /** Prose format */
    criterion?: string;
}

export interface UseCaseFlowStep {
    step: number;
    action: string;
    actor?: string;
}

export interface UseCaseAlternativeFlow {
    id?: string;
    name?: string;
    branchPoint?: string;
    steps?: string[];
}

export interface UseCaseExceptionFlow {
    id?: string;
    name?: string;
    trigger?: string;
    handling?: string;
}

export interface UseCase {
    id: string;
    title: string;
    summary: string;
    description?: string;
    scenario?: {
        context: string;
        before: string;
        after: string;
        impact: string;
    };
    primaryActor?: string;
    secondaryActors?: string[];
    trigger?: string;
    preconditions?: string[];
    postconditions?: string[];
    mainFlow?: UseCaseFlowStep[];
    alternativeFlows?: UseCaseAlternativeFlow[];
    exceptionFlows?: UseCaseExceptionFlow[];
    businessRules?: string[];
    relatedRequirements?: string[];
    relatedEpic?: string;
    relatedStories?: string[];
    sourceDocument?: string;
    notes?: string;
    actors?: any;
    status?: string;
}

export interface FitCriteria {
    functional: { criterion: string; verified: boolean }[];
    nonFunctional: { criterion: string; verified: boolean }[];
    security: { criterion: string; verified: boolean }[];
}

export interface SuccessMetrics {
    codeQuality: { metric: string; target: string }[];
    operational: { metric: string; target: string }[];
    customerImpact: { metric: string; target: string }[];
    deployment: { metric: string; target: string }[];
}

export interface Risk {
    risk: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
    mitigation: string;
}

export interface TechnicalSummary {
    architecturePattern: string;
    components: { name: string; responsibility: string }[];
    filesChanged: { path: string; action: 'new' | 'modified' }[];
}

export interface AICursor {
    agentName: string;
    agentIcon: string;
    position: {
        artifactType: string;
        artifactId: string;
        field?: string;
    };
    status: 'idle' | 'thinking' | 'typing';
}

export type WizardStep = 'vision' | 'requirements' | 'epics' | 'stories' | 'enhancement' | 'review' | 'prd' | 'architecture' | 'testing';

// =============================================================================
// Test Artifact Types
// =============================================================================

export type TestCaseType = 'unit' | 'integration' | 'e2e' | 'acceptance';
export type TestCaseStatus = 'draft' | 'ready' | 'passed' | 'failed' | 'blocked';

export interface TestStep {
    /** BDD format fields */
    given?: string;
    when?: string;
    then?: string;
    and?: string[];
    description?: string;
    /** Schema format fields (test-design.schema.json) */
    step?: number;
    action?: string;
    expectedResult?: string;
}

export interface TestCase {
    id: string;
    title: string;
    description?: string;
    type: TestCaseType;
    status: TestCaseStatus;
    priority?: PriorityLevel;
    storyId?: string;
    epicId?: string;
    relatedRequirements?: string[];
    steps?: TestStep[];
    expectedResult?: string;
    preconditions?: string[];
    tags?: string[];
}

export interface TestStrategy {
    id: string;
    title: string;
    scope?: string;
    approach?: string;
    testTypes?: TestCaseType[];
    tooling?: string[];
    coverageTargets?: { area: string; target: string }[];
    riskAreas?: string[];
    epicId?: string;
    status: 'draft' | 'approved';
}

// =============================================================================
// Test Design Types (from tea/test-design.schema.json)
// =============================================================================

export interface TestDesignRisk {
    riskId?: string;
    category?: 'functional' | 'performance' | 'security' | 'integration' | 'data' | 'ux' | 'compatibility' | 'technical';
    description?: string;
    probability?: 'low' | 'medium' | 'high';
    impact?: 'low' | 'medium' | 'high';
    score?: number;
    testStrategy?: string;
    mitigation?: string;
    owner?: string;
    timeline?: string;
    relatedRequirements?: string[];
}

export interface TestDesignCoverageItem {
    id?: string;
    requirement?: string;
    requirementId?: string;
    testLevel?: 'unit' | 'integration' | 'component' | 'api' | 'e2e' | 'manual';
    testType?: 'functional' | 'regression' | 'smoke' | 'sanity' | 'exploratory';
    riskLink?: string;
    testApproach?: string;
    testCount?: number;
    automatable?: boolean;
    owner?: string;
    estimatedEffort?: string;
}

export interface TestDesignTestCase {
    id?: string;
    title?: string;
    description?: string;
    priority?: 'P0' | 'P1' | 'P2' | 'P3';
    type?: string;
    level?: string;
    preconditions?: string[];
    steps?: { step?: number; action?: string; expectedResult?: string }[];
    acceptanceCriteria?: AcceptanceCriterion[];
    testData?: string;
    relatedRequirements?: string[];
    relatedRisks?: string[];
}

export interface TestDesign {
    id: string;
    /** Populated from metadata.status or default 'draft' */
    status?: string;
    epicInfo?: {
        epicId?: string;
        epicTitle?: string;
        epicGoal?: string;
        prdReference?: string;
        architectureReference?: string;
        storyCount?: number;
    };
    summary?: {
        scope?: string;
        objectives?: string[];
        riskSummary?: string;
        coverageSummary?: string;
        testLevels?: { level?: string; purpose?: string; coverage?: string }[];
        approach?: string;
        keyDecisions?: string[];
    };
    notInScope?: { item?: string; reason?: string; riskAccepted?: boolean }[];
    riskAssessment?: {
        overview?: string;
        riskMatrix?: { probabilityScale?: string[]; impactScale?: string[] };
        highPriority?: TestDesignRisk[];
        mediumPriority?: TestDesignRisk[];
        lowPriority?: TestDesignRisk[];
    };
    entryExitCriteria?: {
        entry?: { criterion?: string; verification?: string; mandatory?: boolean }[];
        exit?: { criterion?: string; threshold?: string; measurement?: string; mandatory?: boolean }[];
        suspensionCriteria?: string[];
        resumptionCriteria?: string[];
    };
    projectTeam?: { role?: string; name?: string; responsibilities?: string; availability?: string; skills?: string[] }[];
    coveragePlan?: {
        overview?: string;
        coverageGoals?: { codeStatement?: string; codeBranch?: string; requirementCoverage?: string; riskCoverage?: string };
        p0?: TestDesignCoverageItem[];
        p1?: TestDesignCoverageItem[];
        p2?: TestDesignCoverageItem[];
        p3?: TestDesignCoverageItem[];
    };
    testCases?: TestDesignTestCase[];
    executionOrder?: {
        overview?: string;
        smoke?: { testId?: string; description?: string; order?: number }[];
        p0?: string[];
        p1?: string[];
        p2p3?: string[];
        parallelization?: { strategy?: string; maxParallel?: number; constraints?: string[] };
    };
    testEnvironment?: {
        environments?: { name?: string; purpose?: string; configuration?: string; dataRequirements?: string }[];
        testData?: { strategy?: string; sources?: string[]; refreshStrategy?: string };
        tools?: { tool?: string; purpose?: string; version?: string }[];
    };
    resourceEstimates?: {
        totalEffort?: string;
        breakdown?: { activity?: string; effort?: string; resources?: number; duration?: string }[];
        timeline?: { phase?: string; startDate?: string; endDate?: string; deliverables?: string[] }[];
    };
    qualityGateCriteria?: { criterion?: string; threshold?: string; measurement?: string; mandatory?: boolean; waiverProcess?: string }[];
    mitigationPlans?: { riskId?: string; risk?: string; plan?: string; contingency?: string; owner?: string; triggers?: string[] }[];
    assumptionsAndDependencies?: {
        assumptions?: { assumption?: string; risk?: string; validation?: string }[];
        dependencies?: { dependency?: string; type?: string; status?: string; owner?: string }[];
    };
    defectManagement?: {
        process?: string;
        severityDefinitions?: { severity?: string; definition?: string; sla?: string }[];
        escalationPath?: string;
    };
    approval?: {
        approvers?: { name?: string; role?: string; status?: 'pending' | 'approved' | 'rejected'; date?: string; comments?: string }[];
    };
    appendices?: { title?: string; content?: string }[];
}

// =============================================================================
// Test Summary (bmm/test-summary.schema.json)
// =============================================================================

export interface TestSummary {
    [key: string]: unknown;
    id: string;
    status?: string;
    summary: {
        scope?: string;
        targetFeatures?: string[];
        testingApproach?: string;
        frameworkUsed?: string;
        totalTestsGenerated?: number;
        totalFilesCreated?: number;
    };
    generatedTests: {
        filePath?: string;
        targetFile?: string;
        testType?: 'unit' | 'integration' | 'component' | 'api' | 'e2e';
        testCount?: number;
        testCases?: {
            name?: string;
            description?: string;
            category?: 'happy-path' | 'edge-case' | 'error-handling' | 'boundary' | 'security';
        }[];
        patternsUsed?: string[];
    }[];
    coverageAnalysis?: {
        priorCoverage?: { statement?: string; branch?: string; function?: string; line?: string };
        targetCoverage?: { statement?: string; branch?: string; function?: string; line?: string };
        gapsIdentified?: { area?: string; description?: string; priority?: 'critical' | 'high' | 'medium' | 'low' }[];
    };
    testPatterns?: { pattern?: string; description?: string; usageCount?: number; examples?: string[] }[];
    recommendations?: { area?: string; recommendation?: string; priority?: 'high' | 'medium' | 'low'; effort?: string }[];
    executionNotes?: {
        runCommand?: string;
        prerequisites?: string[];
        knownIssues?: string[];
    };
}

// =============================================================================
// Source Tree Analysis (bmm/source-tree.schema.json)
// =============================================================================

export interface SourceTree {
    [key: string]: unknown;
    id: string;
    status?: string;
    overview: {
        projectName?: string;
        analysisDate?: string;
        rootPath?: string;
        totalFiles?: number;
        totalDirectories?: number;
        totalSize?: string;
        primaryLanguage?: string;
        summary?: string;
    };
    statistics?: {
        byLanguage?: { language?: string; files?: number; lines?: number; percentage?: number }[];
        byFileType?: { extension?: string; count?: number; percentage?: number }[];
        largestFiles?: { path?: string; size?: string; lines?: number }[];
        deepestPaths?: { path?: string; depth?: number }[];
    };
    multiPartStructure?: { partId?: string; name?: string; path?: string; description?: string; files?: number; directories?: number }[];
    directoryStructure?: {
        path?: string;
        type?: 'directory' | 'file';
        name?: string;
        purpose?: string;
        depth?: number;
        fileCount?: number;
        children?: string[];
        keyFiles?: string[];
        conventions?: string;
    }[];
    criticalDirectories?: {
        path?: string;
        purpose?: string;
        contents?: string;
        fileTypes?: string[];
        entryPoints?: { file?: string; purpose?: string }[];
        keyFiles?: { file?: string; purpose?: string }[];
        integrationNotes?: string;
        dependencies?: string[];
        dependents?: string[];
    }[];
    entryPoints?: { path?: string; type?: string; description?: string; exports?: string[]; usage?: string }[];
    fileOrganizationPatterns?: {
        pattern?: string;
        description?: string;
        locations?: string[];
        examples?: { path?: string; explanation?: string }[];
        rationale?: string;
    }[];
    namingConventions?: { type?: string; convention?: string; pattern?: string; examples?: string[] }[];
    keyFileTypes?: { extension?: string; purpose?: string; count?: number; locations?: string[]; conventions?: string }[];
    assetLocations?: { type?: string; path?: string; description?: string; formats?: string[]; count?: number; usage?: string }[];
    configurationFiles?: {
        path?: string;
        purpose?: string;
        format?: string;
        keySettings?: { setting?: string; description?: string }[];
        environment?: string;
    }[];
    buildArtifacts?: {
        outputDirectory?: string;
        intermediateDirectories?: string[];
        cacheDirectories?: string[];
        gitIgnored?: string[];
    };
    testLocations?: { path?: string; type?: string; pattern?: string; count?: number }[];
    documentationLocations?: { path?: string; type?: string; description?: string }[];
    moduleGraph?: {
        rootModules?: string[];
        dependencies?: { from?: string; to?: string; type?: string }[];
        circularDependencies?: string[][];
    };
    developmentNotes?: { note?: string; category?: string; importance?: 'critical' | 'important' | 'informational' }[];
    recommendations?: { recommendation?: string; rationale?: string; impact?: string }[];
}

// =============================================================================
// TEA Module Types (traceability-matrix, test-review, nfr-assessment,
//                   test-framework, ci-pipeline, automation-summary, atdd-checklist)
// =============================================================================

export interface TraceabilityMatrix {
    [key: string]: unknown;
    id: string;
    status?: string;
    storyInfo?: {
        storyId?: string;
        storyTitle?: string;
        epicId?: string;
        epicTitle?: string;
        evaluator?: string;
        evaluationDate?: string;
        version?: string;
    };
    traceability?: {
        overview?: string;
        coverageSummary?: Record<string, unknown>;
        detailedMapping?: Record<string, unknown>[];
        gapAnalysis?: Record<string, unknown>;
        qualityAssessment?: Record<string, unknown>;
        duplicateCoverage?: Record<string, unknown>[];
        coverageByTestLevel?: Record<string, unknown>;
        recommendations?: { recommendation?: string; priority?: string; effort?: string }[];
    };
    gateDecision?: {
        gateType?: string;
        decisionMode?: string;
        evidenceSummary?: Record<string, unknown>;
        decisionCriteria?: Record<string, unknown>;
        decision?: string;
        rationale?: string;
        residualRisks?: { risk?: string; severity?: string; acceptedBy?: string; mitigation?: string }[];
        waiverDetails?: Record<string, unknown>;
        criticalIssues?: { issue?: string; severity?: string; resolution?: string; status?: string }[];
        recommendations?: { recommendation?: string; priority?: string; owner?: string }[];
        nextSteps?: { step?: string; owner?: string; deadline?: string }[];
    };
    cicdYamlSnippet?: string;
    relatedArtifacts?: { artifact?: string; path?: string; version?: string }[];
    signOff?: { signedBy?: string; date?: string; role?: string; signature?: string; comments?: string };
}

export interface TestReview {
    [key: string]: unknown;
    id: string;
    status?: string;
    reviewInfo?: {
        qualityScore?: number;
        reviewDate?: string;
        scope?: string;
        reviewer?: string;
        reviewType?: string;
        previousScore?: number;
        targetScore?: number;
    };
    executiveSummary?: {
        assessment?: string;
        recommendation?: string;
        strengths?: Record<string, unknown>[];
        weaknesses?: Record<string, unknown>[];
        riskLevel?: string;
    };
    qualityAssessment?: {
        criteria?: Record<string, unknown>[];
        bddFormat?: Record<string, unknown>;
        testIds?: Record<string, unknown>;
        priorityMarkers?: Record<string, unknown>;
        hardWaits?: Record<string, unknown>;
        determinism?: Record<string, unknown>;
        isolation?: Record<string, unknown>;
        fixturePatterns?: Record<string, unknown>;
        assertions?: Record<string, unknown>;
        errorHandling?: Record<string, unknown>;
    };
    qualityScoreBreakdown?: Record<string, unknown>;
    criticalIssues?: { id?: string; issue?: string; location?: string; recommendation?: string; effort?: string; priority?: string }[];
    recommendations?: { id?: string; recommendation?: string; category?: string; priority?: string; effort?: string; impact?: string }[];
    bestPracticesFound?: { practice?: string; location?: string; recommendation?: string }[];
    testFileAnalysis?: Record<string, unknown>[];
    coverageAnalysis?: Record<string, unknown>;
    contextAndIntegration?: Record<string, unknown>;
    knowledgeBaseReferences?: Record<string, unknown>[];
    nextSteps?: { step?: string; owner?: string; timeline?: string; priority?: number }[];
    decision?: {
        verdict?: string;
        conditions?: string[];
        blockers?: string[];
        comments?: string;
        followUpRequired?: boolean;
        followUpDate?: string;
    };
    appendix?: Record<string, unknown>;
}

export interface NfrAssessment {
    [key: string]: unknown;
    id: string;
    status?: string;
    featureInfo?: {
        featureName?: string;
        storyId?: string;
        epicId?: string;
        version?: string;
        environment?: string;
        overallStatus?: string;
        assessmentDate?: string;
        assessor?: string;
    };
    executiveSummary?: string;
    nfrRequirements?: { id?: string; category?: string; requirement?: string; target?: string; priority?: string; source?: string }[];
    assessments?: {
        performance?: Record<string, unknown>;
        security?: Record<string, unknown>;
        reliability?: Record<string, unknown>;
        maintainability?: Record<string, unknown>;
        accessibility?: Record<string, unknown>;
        custom?: Record<string, unknown>[];
    };
    quickWins?: { id?: string; improvement?: string; category?: string; effort?: string; impact?: string; implementation?: string }[];
    recommendedActions?: { id?: string; action?: string; category?: string; priority?: string; effort?: string; impact?: string }[];
    monitoringHooks?: { id?: string; metric?: string; description?: string; threshold?: string }[];
    failFastMechanisms?: { mechanism?: string; purpose?: string; implementation?: string; status?: string }[];
    evidenceGaps?: { id?: string; gap?: string; category?: string; impact?: string; recommendation?: string }[];
    findingsSummary?: Record<string, unknown>;
    gateYamlSnippet?: string;
    testEvidence?: Record<string, unknown>;
    signOff?: Record<string, unknown>;
}

export interface TestFramework {
    [key: string]: unknown;
    id: string;
    status?: string;
    framework?: {
        name?: string;
        version?: string;
        selectionRationale?: string;
        alternatives?: { name?: string; reason?: string }[];
    };
    configuration?: {
        configFile?: string;
        typescript?: boolean;
        baseUrl?: string;
        testMatch?: string[];
        reporters?: string[];
        parallelization?: { enabled?: boolean; workers?: number; strategy?: string };
        retries?: { count?: number; onFailure?: boolean };
    };
    directoryStructure?: { rootDir?: string; directories?: { path?: string; purpose?: string; contents?: string[] }[] };
    fixtures?: { name?: string; filePath?: string; purpose?: string; scope?: string; dependencies?: string[] }[];
    helpers?: { name?: string; filePath?: string; purpose?: string; functions?: Record<string, unknown>[] }[];
    pageObjects?: { name?: string; filePath?: string; page?: string; elements?: string[]; actions?: string[] }[];
    mocking?: { strategy?: string; libraries?: string[]; mockFiles?: { path?: string; purpose?: string }[] };
    dependencies?: { production?: Record<string, unknown>[]; development?: Record<string, unknown>[] };
    scripts?: { name?: string; command?: string; purpose?: string }[];
    setupInstructions?: { prerequisites?: string[]; installationSteps?: string[]; runCommands?: { command?: string; description?: string }[] };
    bestPractices?: { practice?: string; implementation?: string; reference?: string }[];
}

export interface CiPipeline {
    [key: string]: unknown;
    id: string;
    status?: string;
    platform?: {
        name?: string;
        configFile?: string;
        selectionRationale?: string;
    };
    pipeline?: {
        name?: string;
        triggers?: Record<string, unknown>[];
        concurrency?: { group?: string; cancelInProgress?: boolean };
    };
    jobs?: Record<string, unknown>[];
    testExecution?: {
        testSuites?: { name?: string; command?: string; type?: string; timeout?: number; parallelism?: number }[];
        burnIn?: Record<string, unknown>;
        sharding?: Record<string, unknown>;
    };
    qualityGates?: { name?: string; type?: string; threshold?: string; blocking?: boolean; tool?: string }[];
    artifacts?: { name?: string; path?: string; type?: string; retention?: string; uploadCondition?: string }[];
    notifications?: Record<string, unknown>;
    caching?: Record<string, unknown>;
    secrets?: { name?: string; purpose?: string; required?: boolean }[];
    documentation?: { readme?: string; troubleshooting?: { issue?: string; solution?: string }[]; maintenance?: string };
}

export interface AutomationSummary {
    [key: string]: unknown;
    id: string;
    status?: string;
    summary?: {
        scope?: string;
        mode?: string;
        coverageTarget?: string;
        framework?: string;
        totalTestsCreated?: number;
        totalFilesCreated?: number;
        estimatedCoverageIncrease?: string;
    };
    coverageAnalysis?: {
        baseline?: Record<string, unknown>;
        target?: Record<string, unknown>;
        gaps?: { area?: string; currentCoverage?: string; gapType?: string; priority?: string; addressed?: boolean }[];
        criticalPaths?: { path?: string; description?: string; testsCovering?: string[]; status?: string }[];
    };
    testsCreated?: Record<string, unknown>[];
    fixturesCreated?: { name?: string; filePath?: string; purpose?: string; dataType?: string }[];
    factoriesCreated?: { name?: string; filePath?: string; entityType?: string; variants?: string[] }[];
    bmadIntegration?: Record<string, unknown>;
    automationStrategy?: Record<string, unknown>;
    recommendations?: { area?: string; recommendation?: string; priority?: string; effort?: string; impact?: string }[];
    executionResults?: {
        totalTests?: number;
        passed?: number;
        failed?: number;
        skipped?: number;
        duration?: string;
        failureDetails?: { test?: string; error?: string; resolution?: string }[];
    };
}

export interface AtddChecklist {
    [key: string]: unknown;
    id: string;
    status?: string;
    storyInfo?: {
        epicId?: string;
        storyId?: string;
        storyTitle?: string;
        storyDescription?: string;
        primaryTestLevel?: string;
        businessValue?: string;
        technicalContext?: string;
    };
    storySummary?: Record<string, unknown>;
    acceptanceCriteria?: Record<string, unknown>[];
    failingTestsCreated?: {
        e2e?: Record<string, unknown>[];
        api?: Record<string, unknown>[];
        integration?: Record<string, unknown>[];
        component?: Record<string, unknown>[];
        unit?: Record<string, unknown>[];
    };
    testScenarios?: Record<string, unknown>[];
    dataFactoriesCreated?: Record<string, unknown>[];
    fixturesCreated?: Record<string, unknown>[];
    mockRequirements?: Record<string, unknown>[];
    requiredDataTestIds?: Record<string, unknown>[];
    pageObjects?: Record<string, unknown>[];
    implementationChecklist?: { id?: string; item?: string; category?: string; completed?: boolean; notes?: string }[];
    runningTests?: Record<string, unknown>;
    redGreenRefactorWorkflow?: Record<string, unknown>;
    knowledgeBaseReferences?: Record<string, unknown>[];
    testExecutionEvidence?: Record<string, unknown>;
    completionStatus?: {
        status?: string;
        percentComplete?: number;
        blockers?: string[];
        nextSteps?: string[];
    };
}

// =============================================================================
// BMM Module Types (research, ux-design, readiness-report, sprint-status,
//                   retrospective, change-proposal, code-review, risks,
//                   definition-of-done, project-overview, project-context, tech-spec)
// =============================================================================

export interface Research {
    [key: string]: unknown;
    id: string;
    status?: string;
    researchType?: string;
    topic?: string;
    scope?: { description?: string; inScope?: string[]; outOfScope?: string[]; timeframe?: string };
    goals?: { goal?: string; rationale?: string; successCriteria?: string }[];
    questions?: { question?: string; priority?: string; answered?: boolean; answer?: string }[];
    methodology?: Record<string, unknown>;
    findings?: { id?: string; category?: string; finding?: string; details?: string; evidence?: Record<string, unknown>[]; confidence?: string; implications?: Record<string, unknown>[]; actionItems?: string[] }[];
    competitiveAnalysis?: Record<string, unknown>[];
    marketAnalysis?: Record<string, unknown>;
    trends?: { trend?: string; category?: string; relevance?: string; timeframe?: string; impact?: string }[];
    technicalFindings?: { topic?: string; finding?: string; details?: string; feasibility?: string; risks?: string[]; recommendations?: string[] }[];
    userResearch?: Record<string, unknown>;
    recommendations?: { id?: string; recommendation?: string; category?: string; priority?: string; rationale?: string; effort?: string; impact?: string }[];
    risks?: { risk?: string; category?: string; probability?: string; impact?: string; mitigation?: string }[];
    synthesis?: { summary?: string; keyInsights?: string[]; strategicImplications?: string[]; openQuestions?: string[]; futureResearch?: string[] };
    references?: { id?: string; title?: string; type?: string; url?: string; author?: string; notes?: string }[];
    appendices?: { title?: string; type?: string; content?: string }[];
}

export interface UxDesign {
    [key: string]: unknown;
    id: string;
    status?: string;
    overview?: { productName?: string; version?: string; designPhilosophy?: string; targetExperience?: string; designPrinciples?: Record<string, unknown>[]; designGoals?: Record<string, unknown>[] };
    coreExperience?: { primaryValue?: string; keyInteractions?: Record<string, unknown>[]; emotionalGoals?: Record<string, unknown>[]; userFlowSummary?: string };
    designInspiration?: Record<string, unknown>[];
    designSystem?: {
        overview?: string;
        colorPalette?: Record<string, unknown>;
        typography?: Record<string, unknown>;
        spacing?: Record<string, unknown>;
        borders?: Record<string, unknown>;
        shadows?: Record<string, unknown>[];
        iconography?: Record<string, unknown>;
        animation?: Record<string, unknown>;
    };
    userJourneys?: Record<string, unknown>[];
    wireframes?: Record<string, unknown>[];
    componentStrategy?: Record<string, unknown>;
    pageLayouts?: Record<string, unknown>[];
    uxPatterns?: { pattern?: string; category?: string; usage?: string; implementation?: string; rationale?: string }[];
    responsive?: Record<string, unknown>;
    accessibility?: Record<string, unknown>;
    interactions?: Record<string, unknown>[];
    errorStates?: { errorType?: string; message?: string; display?: string; recovery?: string }[];
    emptyStates?: { context?: string; message?: string; illustration?: string; action?: string }[];
    loadingStates?: { context?: string; type?: string; description?: string }[];
    implementationNotes?: string[];
    references?: { title?: string; type?: string; url?: string; description?: string }[];
}

export interface ReadinessReport {
    [key: string]: unknown;
    id: string;
    status?: string;
    summary?: {
        projectName?: string;
        assessmentDate?: string;
        assessedBy?: string;
        overallStatus?: string;
        overallScore?: number;
        recommendation?: string;
        keyFindings?: string[];
        criticalActions?: string[];
    };
    assessment?: {
        prdAnalysis?: Record<string, unknown>;
        epicCoverage?: Record<string, unknown>;
        uxAlignment?: Record<string, unknown>;
        architectureReadiness?: Record<string, unknown>;
        epicQuality?: Record<string, unknown>;
        testReadiness?: Record<string, unknown>;
    };
    blockers?: { id?: string; blocker?: string; category?: string; impact?: string; severity?: string; resolution?: string; owner?: string; status?: string }[];
    risks?: { id?: string; risk?: string; category?: string; probability?: string; impact?: string; riskScore?: number; mitigation?: string; owner?: string }[];
    recommendations?: { id?: string; recommendation?: string; category?: string; priority?: string; effort?: string; impact?: string; owner?: string }[];
    dependencyAnalysis?: Record<string, unknown>;
    resourceAssessment?: Record<string, unknown>;
    nextSteps?: { step?: number; action?: string; owner?: string; deadline?: string }[];
    appendices?: { title?: string; type?: string; content?: string }[];
}

export interface SprintStatus {
    [key: string]: unknown;
    id: string;
    status?: string;
    generated?: string;
    project?: string;
    projectKey?: string;
    trackingSystem?: string;
    storyLocation?: string;
    summary?: {
        totalEpics?: number;
        completedEpics?: number;
        inProgressEpics?: number;
        totalStories?: number;
        completedStories?: number;
        inProgressStories?: number;
        backlogStories?: number;
    };
    epics?: Record<string, unknown>[];
    developmentStatus?: Record<string, unknown>;
    statusDefinitions?: Record<string, unknown>;
}

export interface Retrospective {
    [key: string]: unknown;
    id: string;
    status?: string;
    epicReference?: {
        epicId?: string;
        title?: string;
        goal?: string;
        totalStories?: number;
        startDate?: string;
        completionDate?: string;
        durationDays?: number;
    };
    summary?: {
        overallSuccess?: string;
        keyAchievements?: string[];
        mainChallenges?: string[];
        velocityAnalysis?: Record<string, unknown>;
    };
    whatWentWell?: { item?: string; impact?: string; recommendation?: string }[];
    whatDidNotGoWell?: { item?: string; impact?: string; rootCause?: string; recommendation?: string }[];
    lessonsLearned?: { id?: string; lesson?: string; category?: string; actionable?: boolean; appliesTo?: string[] }[];
    storyAnalysis?: { storyId?: string; storyTitle?: string; outcome?: string; notes?: string; timeSpent?: string; blockers?: string[] }[];
    technicalDebt?: { debtIntroduced?: Record<string, unknown>[]; debtAddressed?: Record<string, unknown>[] };
    impactOnFutureWork?: Record<string, unknown>;
    teamFeedback?: { processImprovements?: string[]; toolingImprovements?: string[]; communicationImprovements?: string[] };
    actionItems?: { id?: string; action?: string; owner?: string; dueDate?: string; priority?: string; status?: string }[];
    metricsSnapshot?: Record<string, unknown>;
}

export interface ChangeProposal {
    [key: string]: unknown;
    id: string;
    status?: string;
    changeRequest?: {
        id?: string;
        title?: string;
        description?: string;
        requestedBy?: string;
        requestDate?: string;
        changeType?: string;
        urgency?: string;
        source?: string;
    };
    impactAnalysis?: {
        overallImpact?: string;
        affectedEpics?: Record<string, unknown>[];
        affectedStories?: Record<string, unknown>[];
        architectureImpact?: Record<string, unknown>;
        timelineImpact?: Record<string, unknown>;
        resourceImpact?: Record<string, unknown>;
        riskAssessment?: Record<string, unknown>[];
    };
    proposal?: {
        recommendation?: string;
        rationale?: string;
        options?: Record<string, unknown>[];
        implementationPlan?: Record<string, unknown>;
        rollbackPlan?: string;
    };
    approval?: {
        status?: string;
        approvedBy?: string;
        approvalDate?: string;
        approvalNotes?: string;
        conditions?: string[];
    };
    implementation?: {
        status?: string;
        startedAt?: string;
        completedAt?: string;
        implementedBy?: string;
        notes?: string;
    };
}

export interface CodeReview {
    [key: string]: unknown;
    id: string;
    status?: string;
    storyReference?: {
        storyId?: string;
        storyKey?: string;
        storyTitle?: string;
        storyFilePath?: string;
        epicId?: string;
    };
    reviewSummary?: {
        overallVerdict?: string;
        totalFindings?: number;
        criticalCount?: number;
        majorCount?: number;
        minorCount?: number;
        suggestionsCount?: number;
        autoFixableCount?: number;
        reviewDuration?: string;
    };
    findings?: { id?: string; severity?: string; category?: string; description?: string; location?: Record<string, unknown>; recommendation?: string; suggestedFix?: string; autoFixable?: boolean }[];
    acceptanceCriteriaVerification?: { acId?: string; acDescription?: string; status?: string; notes?: string }[];
    testCoverageAnalysis?: Record<string, unknown>;
    securityAnalysis?: Record<string, unknown>;
    architectureCompliance?: Record<string, unknown>;
    nextSteps?: { action?: string; priority?: string; relatedFindingIds?: string[] }[];
    reviewerNotes?: string;
}

export interface Risks {
    [key: string]: unknown;
    id: string;
    status?: string;
    risks?: { id?: string; risk?: string; category?: string; probability?: string; impact?: string; riskScore?: string; impactDescription?: string; mitigation?: string; contingencyPlan?: string; triggers?: string[]; owner?: string; status?: string; residualRisk?: string }[];
    assumptions?: { id?: string; assumption?: string; ifFalse?: string; validationMethod?: string; validated?: boolean }[];
    dependencies?: { id?: string; dependency?: string; type?: string; risk?: string; mitigation?: string }[];
    riskMatrix?: { critical?: string[]; high?: string[]; medium?: string[]; low?: string[] };
    summary?: { totalRisks?: number; criticalCount?: number; highCount?: number; mediumCount?: number; lowCount?: number; mitigatedCount?: number; openCount?: number; overallRiskLevel?: string };
}

export interface DefinitionOfDone {
    [key: string]: unknown;
    id: string;
    status?: string;
    items?: { id?: string; item?: string; category?: string; required?: boolean; completed?: boolean; completedBy?: string; completedAt?: string; evidence?: string; notes?: string }[];
    qualityGates?: { id?: string; gate?: string; criteria?: string[]; passed?: boolean; passedAt?: string; approver?: string }[];
    acceptanceSummary?: { totalCriteria?: number; passedCriteria?: number; failedCriteria?: number; blockedCriteria?: number; passPercentage?: string };
    templates?: { epic?: string[]; story?: string[]; feature?: string[] };
    summary?: { totalItems?: number; completedItems?: number; requiredItems?: number; requiredCompleted?: number; completionPercentage?: string; allRequiredComplete?: boolean; status?: string };
}

export interface ProjectOverview {
    [key: string]: unknown;
    id: string;
    status?: string;
    projectInfo?: {
        name?: string;
        description?: string;
        type?: string;
        architecturePattern?: string;
        version?: string;
        repository?: string;
        license?: string;
    };
    executiveSummary?: string;
    projectClassification?: Record<string, unknown>;
    multiPartStructure?: Record<string, unknown>[];
    techStackSummary?: Record<string, unknown>;
    keyFeatures?: { feature?: string; status?: string; location?: string }[];
    architectureHighlights?: { highlight?: string; category?: string; details?: string }[];
    codebaseAnalysis?: Record<string, unknown>;
    development?: Record<string, unknown>;
    repositoryStructure?: { path?: string; purpose?: string; contents?: string; importance?: string }[];
    entryPoints?: { path?: string; type?: string; description?: string }[];
    dataFlows?: { name?: string; description?: string; components?: string[] }[];
    integrations?: { name?: string; type?: string; description?: string; status?: string }[];
    knownIssues?: { issue?: string; severity?: string; location?: string; workaround?: string }[];
    recommendations?: { recommendation?: string; priority?: string; effort?: string; impact?: string }[];
    documentationMap?: { title?: string; path?: string; description?: string; status?: string }[];
    additionalNotes?: string[];
}

export interface ProjectContext {
    [key: string]: unknown;
    id: string;
    status?: string;
    projectInfo?: {
        name?: string;
        description?: string;
        type?: string;
        version?: string;
        repository?: string;
        documentation?: string;
    };
    overview?: { summary?: string; architecture?: string; keyFeatures?: string[]; currentState?: string };
    techStack?: Record<string, unknown>;
    implementationRules?: { id?: string; rule?: string; rationale?: string; category?: string; severity?: string }[];
    patterns?: Record<string, unknown>;
    forbiddenPatterns?: { pattern?: string; reason?: string; alternative?: string; detection?: string; severity?: string }[];
    keyFiles?: { path?: string; purpose?: string; importance?: string; notes?: string; keyElements?: string[] }[];
    entryPoints?: { path?: string; type?: string; description?: string }[];
    developmentWorkflow?: Record<string, unknown>;
    errorHandling?: Record<string, unknown>;
    stateManagement?: Record<string, unknown>;
    apiInteraction?: Record<string, unknown>;
    securityConsiderations?: { consideration?: string; implementation?: string; validation?: string }[];
    performanceConsiderations?: { consideration?: string; implementation?: string; measurement?: string }[];
    knownIssues?: { issue?: string; workaround?: string; status?: string }[];
    additionalNotes?: string[];
}

export interface TechSpec {
    [key: string]: unknown;
    id: string;
    status?: string;
    title?: string;
    slug?: string;
    version?: string;
    overview?: {
        summary?: string;
        problemStatement?: string;
        background?: string;
        proposedSolution?: string;
        goals?: { goal?: string; rationale?: string }[];
        nonGoals?: string[];
        scope?: Record<string, unknown>;
        relatedDocuments?: { title?: string; path?: string; relevance?: string }[];
    };
    context?: {
        overview?: string;
        existingArchitecture?: string;
        codebasePatterns?: Record<string, unknown>[];
        filesToReference?: Record<string, unknown>[];
        technicalDecisions?: Record<string, unknown>[];
        constraints?: Record<string, unknown>[];
    };
    techStack?: { technology?: string; version?: string; purpose?: string; documentation?: string }[];
    dataModel?: Record<string, unknown>;
    apiChanges?: Record<string, unknown>;
    filesToModify?: { path?: string; changes?: string; reason?: string }[];
    filesToCreate?: { path?: string; purpose?: string; contents?: string }[];
    codePatterns?: { pattern?: string; example?: string; rationale?: string }[];
    testPatterns?: { pattern?: string; example?: string; coverage?: string }[];
    implementationPlan?: {
        overview?: string;
        phases?: Record<string, unknown>[];
        tasks?: Record<string, unknown>[];
        acceptanceCriteria?: Record<string, unknown>[];
        milestones?: Record<string, unknown>[];
    };
    testingStrategy?: Record<string, unknown>;
    risks?: { risk?: string; probability?: string; impact?: string; mitigation?: string }[];
    rollbackPlan?: { triggers?: string[]; steps?: string[]; dataRecovery?: string };
    additionalContext?: Record<string, unknown>;
    reviewers?: { name?: string; role?: string; status?: string }[];
}

// =============================================================================
// CIS Module Types (storytelling, problem-solving, innovation-strategy, design-thinking)
// =============================================================================

export interface Storytelling {
    [key: string]: unknown;
    id: string;
    status?: string;
    storyType?: string;
    frameworkName?: string;
    storyTitle?: string;
    purpose?: string;
    targetAudience?: Record<string, unknown>;
    strategicContext?: Record<string, unknown>;
    frameworkApplication?: Record<string, unknown>;
    structure?: {
        openingHook?: Record<string, unknown>;
        setup?: Record<string, unknown>;
        coreNarrative?: string;
        storyBeats?: Record<string, unknown>[];
        emotionalArc?: Record<string, unknown>;
        conflict?: Record<string, unknown>;
        resolution?: Record<string, unknown>;
    };
    completeStory?: string;
    elements?: Record<string, unknown>;
    variations?: Record<string, unknown>;
    visualElements?: Record<string, unknown>;
    usageGuidelines?: Record<string, unknown>;
    testing?: Record<string, unknown>;
    nextSteps?: Record<string, unknown>;
}

export interface ProblemSolving {
    [key: string]: unknown;
    id: string;
    status?: string;
    problemTitle?: string;
    problemCategory?: string;
    sessionInfo?: Record<string, unknown>;
    problemDefinition?: {
        initialStatement?: string;
        refinedStatement?: string;
        context?: string;
        stakeholders?: Record<string, unknown>[];
        impact?: Record<string, unknown>;
        urgency?: string;
        successCriteria?: { criterion?: string; metric?: string; target?: string; priority?: string }[];
    };
    diagnosis?: Record<string, unknown>;
    analysis?: Record<string, unknown>;
    solutionGeneration?: Record<string, unknown>;
    solutionEvaluation?: Record<string, unknown>;
    recommendedSolution?: {
        solutionId?: string;
        title?: string;
        description?: string;
        rationale?: string;
        rootCausesAddressed?: Record<string, unknown>[];
        expectedOutcomes?: Record<string, unknown>[];
        tradeoffs?: string[];
    };
    implementationPlan?: Record<string, unknown>;
    monitoring?: Record<string, unknown>;
    lessonsLearned?: Record<string, unknown>;
}

export interface InnovationStrategy {
    [key: string]: unknown;
    id: string;
    status?: string;
    companyName?: string;
    strategicFocus?: string;
    sessionInfo?: Record<string, unknown>;
    strategicContext?: {
        currentSituation?: string;
        strategicChallenge?: string;
        visionStatement?: string;
        strategicObjectives?: { objective?: string; timeframe?: string; metrics?: string }[];
        keyQuestions?: string[];
    };
    marketAnalysis?: Record<string, unknown>;
    businessModelAnalysis?: Record<string, unknown>;
    disruptionOpportunities?: Record<string, unknown>;
    innovationOpportunities?: Record<string, unknown>;
    strategicOptions?: Record<string, unknown>[];
    recommendedStrategy?: {
        strategicOptionId?: string;
        direction?: string;
        strategicThesis?: string;
        keyHypotheses?: Record<string, unknown>[];
        criticalSuccessFactors?: Record<string, unknown>[];
        strategicPriorities?: Record<string, unknown>[];
        competitiveMoat?: string;
    };
    executionRoadmap?: Record<string, unknown>;
    successMetrics?: Record<string, unknown>;
    risks?: Record<string, unknown>;
    governanceAndReview?: Record<string, unknown>;
    appendix?: Record<string, unknown>;
}

export interface DesignThinking {
    [key: string]: unknown;
    id: string;
    status?: string;
    projectName?: string;
    sessionInfo?: Record<string, unknown>;
    designChallenge?: string;
    empathize?: {
        researchMethods?: Record<string, unknown>[];
        userProfiles?: Record<string, unknown>[];
        userInsights?: { insight?: string; source?: string; evidence?: string; significance?: string }[];
        keyObservations?: Record<string, unknown>[];
        empathyMap?: Record<string, unknown>;
        journeyMap?: Record<string, unknown>;
    };
    define?: {
        synthesisProcess?: string;
        povStatement?: string;
        povVariations?: string[];
        howMightWeQuestions?: { question?: string; rationale?: string; priority?: string }[];
        problemInsights?: Record<string, unknown>[];
        designPrinciples?: { principle?: string; rationale?: string }[];
        constraints?: Record<string, unknown>[];
    };
    ideate?: {
        selectedMethods?: Record<string, unknown>[];
        generatedIdeas?: Record<string, unknown>[];
        ideaClustering?: Record<string, unknown>[];
        topConcepts?: Record<string, unknown>[];
        selectionCriteria?: string[];
    };
    prototype?: Record<string, unknown>;
    test?: Record<string, unknown>;
    nextSteps?: Record<string, unknown>;
}

// =============================================================================
// PRD (Product Requirements Document) Types
// =============================================================================

export interface PrdUserPersona {
    id?: string;
    name: string;
    role?: string;
    description?: string;
    goals?: string[];
    painPoints?: string[];
    behaviors?: string[];
    technicalProficiency?: 'novice' | 'intermediate' | 'advanced' | 'expert';
    frequency?: string;
    primaryTasks?: string[];
}

export interface UserJourneyStep {
    step: number;
    action: string;
    systemResponse?: string;
    outcome?: string;
    alternativeFlows?: string[];
    errorHandling?: string;
}

export interface PrdUserJourney {
    id?: string;
    name: string;
    persona?: string;
    goal?: string;
    preconditions?: string[];
    steps: UserJourneyStep[];
    successCriteria?: string;
    postconditions?: string[];
    notes?: string;
}

export interface DomainConcept {
    name: string;
    description?: string;
    attributes?: {
        name: string;
        type: string;
        description?: string;
        required?: boolean;
    }[];
    relationships?: {
        target: string;
        type: string;
        cardinality?: string;
        description?: string;
    }[];
    businessRules?: string[];
}

export interface PrdSuccessCriterion {
    id?: string;
    criterion: string;
    category?: 'business' | 'technical' | 'user-experience' | 'operational';
    metric?: string;
    target?: string;
    baseline?: string;
    measurement?: string;
    timeframe?: string;
}

export interface PrdConstraint {
    id?: string;
    type: 'technical' | 'business' | 'regulatory' | 'resource' | 'time' | 'budget';
    description: string;
    impact?: string;
    mitigation?: string;
    flexibility?: 'fixed' | 'negotiable' | 'flexible';
}

export interface PrdRisk {
    id?: string;
    risk: string;
    category?: 'technical' | 'business' | 'schedule' | 'resource' | 'external';
    probability?: 'low' | 'medium' | 'high' | 'very-high';
    impact?: 'low' | 'medium' | 'high' | 'critical';
    riskScore?: string;
    mitigation?: string;
    contingency?: string;
    owner?: string;
    status?: 'identified' | 'analyzing' | 'mitigating' | 'accepted' | 'closed';
    triggers?: string[];
}

export interface PRD {
    id: string;
    status: 'draft' | 'review' | 'approved' | 'archived';
    productOverview: {
        productName: string;
        version?: string;
        purpose?: string;
        targetAudience?: string;
        productVision?: string;
        problemStatement?: string;
        proposedSolution?: string;
        valueProposition?: string;
        keyBenefits?: string[];
    };
    projectType?: {
        type?: 'web-app' | 'mobile-app' | 'api-service' | 'desktop-app' | 'library' | 'platform' | 'cli-tool' | 'hybrid' | 'other';
        complexity?: 'low' | 'medium' | 'high' | 'very-high';
        domainComplexity?: string;
        technicalComplexity?: string;
        integrationComplexity?: string;
        characteristics?: string[];
    };
    userPersonas?: PrdUserPersona[];
    userJourneys?: PrdUserJourney[];
    successCriteria?: PrdSuccessCriterion[];
    domainModel?: {
        overview?: string;
        coreConcepts?: DomainConcept[];
        glossary?: {
            term: string;
            definition: string;
            synonyms?: string[];
            relatedTerms?: string[];
        }[];
    };
    functionalRequirementIds?: string[];
    nonFunctionalRequirementIds?: string[];
    technicalRequirementIds?: string[];
    requirements?: {
        functional?: any[];
        nonFunctional?: any[];
        technical?: any[];
    };
    scope?: {
        inScope?: { item: string; description?: string; priority?: string }[];
        outOfScope?: { item: string; rationale?: string; futureConsideration?: boolean }[];
        assumptions?: { assumption: string; impact?: string; validated?: boolean }[];
        dependencies?: { dependency: string; type?: string; owner?: string; status?: string }[];
    };
    constraints?: PrdConstraint[];
    risks?: PrdRisk[];
    timeline?: {
        overview?: string;
        phases?: {
            name: string;
            description?: string;
            startDate?: string;
            endDate?: string;
            milestones?: { name: string; date?: string; deliverables?: string[] }[];
            deliverables?: string[];
        }[];
    };
    approvals?: any[];
    appendices?: any[];
}

// =============================================================================
// Architecture Types
// =============================================================================

export interface ArchitectureDecision {
    id: string;
    title: string;
    status: 'proposed' | 'accepted' | 'deprecated' | 'superseded' | 'draft' | 'rejected';
    date?: string;
    deciders?: string[];
    context: string;
    decision: string;
    rationale?: string;
    consequences?: {
        positive?: string[];
        negative?: string[];
        neutral?: string[];
    };
    alternatives?: {
        option: string;
        description?: string;
        pros?: string[];
        cons?: string[];
        rejectionReason?: string;
    }[];
    relatedDecisions?: string[];
    supersedes?: string;
    supersededBy?: string;
    implementationNotes?: string[];
}

export interface ArchitecturePattern {
    pattern: string;
    category?: string;
    usage?: string;
    implementation?: string;
    rationale?: string;
    examples?: { name: string; location?: string; description?: string }[];
}

export interface SystemComponent {
    id?: string;
    name: string;
    type?: string;
    description?: string;
    responsibilities?: string[];
    interfaces?: { name: string; type?: string; description?: string }[];
    dependencies?: string[];
    technology?: string;
}

export interface TechStack {
    frontend?: {
        framework?: string;
        language?: string;
        stateManagement?: string;
        styling?: string;
        testing?: string;
        buildTool?: string;
        rationale?: string;
        additionalLibraries?: { name: string; version?: string; purpose?: string }[];
    };
    backend?: {
        framework?: string;
        language?: string;
        runtime?: string;
        apiStyle?: string;
        rationale?: string;
        additionalLibraries?: { name: string; version?: string; purpose?: string }[];
    };
    database?: {
        primary?: string;
        secondary?: string;
        caching?: string;
        orm?: string;
        rationale?: string;
        schemaStrategy?: string;
    };
    infrastructure?: {
        hosting?: string;
        containerization?: string;
        orchestration?: string;
        cicd?: string;
        monitoring?: string;
        logging?: string;
        rationale?: string;
    };
    devTools?: {
        ide?: string;
        linting?: string;
        formatting?: string;
        versionControl?: string;
        packageManager?: string;
    };
}

export interface SecurityArchitecture {
    overview?: string;
    authentication?: {
        method?: string;
        description?: string;
        provider?: string;
        tokenStrategy?: string;
        sessionManagement?: string;
    };
    authorization?: {
        method?: string;
        description?: string;
        roles?: { role: string; permissions?: string[] }[];
    };
    dataProtection?: {
        atRest?: string;
        inTransit?: string;
        sensitiveData?: string;
        pii?: string;
    };
    securityPatterns?: { pattern: string; description?: string; implementation?: string }[];
    threats?: { threat: string; category?: string; mitigation?: string; status?: string }[];
    compliance?: { standard: string; requirements?: string[]; implementation?: string }[];
}

export interface Architecture {
    id: string;
    status: 'draft' | 'review' | 'approved' | 'archived';
    overview: {
        projectName: string;
        architectureStyle?: string;
        summary?: string;
        vision?: string;
        principles?: { name: string; description?: string; rationale?: string }[];
    };
    context?: {
        businessContext?: string;
        technicalContext?: string;
        assumptions?: { assumption: string; impact?: string; validatedBy?: string }[];
        constraints?: { constraint: string; type?: string; rationale?: string; impact?: string }[];
        qualityAttributes?: { attribute: string; priority?: string; description?: string; target?: string; measurementMethod?: string }[];
        stakeholders?: { role: string; concerns?: string[] }[];
    };
    techStack?: TechStack;
    decisions: ArchitectureDecision[];
    patterns?: ArchitecturePattern[];
    systemComponents?: SystemComponent[];
    projectStructure?: {
        monorepo?: boolean;
        description?: string;
        structure?: { path: string; purpose?: string; contents?: string; conventions?: string }[];
        namingConventions?: { type: string; convention?: string; example?: string; rationale?: string }[];
        moduleOrganization?: string;
    };
    dataFlow?: {
        description?: string;
        flows?: { id?: string; name: string; description?: string; source?: string; destination?: string; dataType?: string; protocol?: string }[];
        diagrams?: { name: string; type?: string; description?: string; reference?: string }[];
    };
    security?: SecurityArchitecture;
    scalability?: {
        strategy?: string;
        horizontalScaling?: { approach?: string; triggers?: string[]; limitations?: string[] };
        verticalScaling?: { approach?: string; limits?: string };
        bottlenecks?: { area: string; description?: string; severity?: string }[];
        mitigations?: { bottleneck: string; mitigation?: string; implementation?: string }[];
    };
    deployment?: {
        strategy?: string;
        environments?: { name: string; purpose?: string; configuration?: string }[];
        pipeline?: { stages?: { name: string; purpose?: string; tools?: string[] }[]; triggers?: string[] };
        rollback?: { strategy?: string; procedure?: string };
    };
    integrations?: {
        name: string;
        type?: string;
        description?: string;
        protocol?: string;
        authentication?: string;
        dataFormat?: string;
        errorHandling?: string;
        sla?: string;
    }[];
    implementationNotes?: string[];
    reliability?: {
        strategy?: string;
        sla?: string;
        failover?: string;
        backups?: string;
    };
    observability?: {
        monitoring?: string;
        logging?: string;
        alerting?: string;
    };
    validation?: {
        approach?: string;
        criteria?: string[];
    };
    references?: { title: string; url?: string; description?: string }[];
}

// =============================================================================
// ProductBrief Types
// =============================================================================

export interface ProductBriefTargetUser {
    persona: string;
    description?: string;
    demographics?: {
        age?: string;
        role?: string;
        industry?: string;
        experience?: string;
    };
    goals?: { goal: string; priority?: string }[];
    needs?: { need: string; importance?: 'critical' | 'high' | 'medium' | 'low' }[];
    painPoints?: { painPoint: string; severity?: 'critical' | 'high' | 'medium' | 'low'; frequency?: string }[];
    behaviors?: string[];
    motivations?: string[];
    frustrations?: string[];
    technicalProficiency?: 'novice' | 'intermediate' | 'advanced' | 'expert';
}

export interface ProductBriefFeature {
    id?: string;
    name: string;
    description?: string;
    userBenefit?: string;
    priority?: PriorityLevel;
    complexity?: 'low' | 'medium' | 'high';
    dependencies?: string[];
}

export interface ProductBrief {
    id: string;
    productName: string;
    tagline?: string;
    version?: string;
    status: 'draft' | 'review' | 'approved' | 'archived';
    vision: {
        statement: string;
        mission?: string;
        problemStatement?: string;
        problemDetails?: { problem: string; impact?: string; affectedUsers?: string; currentSolutions?: string }[];
        proposedSolution?: string;
        solutionApproach?: { aspect: string; description?: string; rationale?: string }[];
        uniqueValueProposition?: string;
        differentiators?: { differentiator: string; competitiveAdvantage?: string }[];
    };
    targetUsers?: ProductBriefTargetUser[];
    marketContext?: {
        overview?: string;
        targetMarket?: string;
        marketSize?: { tam?: string; sam?: string; som?: string };
        trends?: { trend: string; impact?: string }[];
        competitiveLandscape?: string;
        competitors?: { name: string; description?: string; strengths?: string[]; weaknesses?: string[] }[];
    };
    successMetrics?: {
        metric: string;
        description?: string;
        target?: string;
        baseline?: string;
        timeframe?: string;
        rationale?: string;
        measurementMethod?: string;
        category?: 'business' | 'user' | 'technical' | 'operational';
    }[];
    scope?: {
        overview?: string;
        inScope?: { item: string; priority?: 'must-have' | 'should-have' | 'could-have'; rationale?: string }[];
        outOfScope?: { item: string; reason?: string }[];
        futureConsiderations?: { item: string; timeframe?: string; dependencies?: string }[];
        mvpDefinition?: { description?: string; features?: string[]; successCriteria?: string[] };
    };
    keyFeatures?: ProductBriefFeature[];
    constraints?: { constraint: string; type?: string; impact?: string; mitigation?: string }[];
    assumptions?: { assumption: string; category?: string; risk?: string; validationMethod?: string }[];
    risks?: { risk: string; category?: string; probability?: string; impact?: string; mitigation?: string; contingency?: string; owner?: string }[];
    dependencies?: { dependency: string; type?: string; status?: string; risk?: string }[];
    timeline?: {
        overview?: string;
        milestones?: { milestone: string; targetDate?: string; description?: string; deliverables?: string[] }[];
        phases?: { phase: string; duration?: string; objectives?: string[] }[];
    };
    stakeholders?: { role: string; name?: string; responsibilities?: string[]; involvement?: 'sponsor' | 'decision-maker' | 'contributor' | 'informed' }[];
    additionalContext?: {
        background?: string;
        notes?: string[];
        openQuestions?: { question: string; status?: string; owner?: string }[];
        references?: { title: string; location?: string; description?: string }[];
    };
}
