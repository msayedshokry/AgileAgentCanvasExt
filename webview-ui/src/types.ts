// =============================================================================
// AgileAgentCanvas Webview Types
// Synchronized with artifact-store.ts interfaces
// =============================================================================

// =============================================================================
// Common Types
// =============================================================================

/**
 * Priority levels used across artifacts (from BMAD schemas)
 */
export type PriorityLevel = 'must-have' | 'should-have' | 'could-have' | "won't-have" | 'P0' | 'P1' | 'P2' | 'P3';

/**
 * Requirement status (from BMAD schema)
 */
export type RequirementStatus = 'draft' | 'proposed' | 'approved' | 'implemented' | 'verified' | 'deferred' | 'rejected';

/**
 * Verification method for requirements (from BMAD schema)
 */
export type VerificationMethod = 'test' | 'inspection' | 'demonstration' | 'analysis';

/**
 * Artifact status — superset of all status enums across BMAD schemas.
 *
 * Sources:
 *   metadata.schema.json:  draft, in-progress, review, approved, completed, archived
 *   story.schema.json:     draft, ready, ready-for-dev, in-progress, in-review, blocked, done, complete
 *   epics.schema.json:     draft, ready, in-progress, blocked, review, done, complete, backlog
 *   product-brief:         draft, review, approved, archived
 *   tech-spec:             draft, review, approved, implementing, completed, archived
 *   definition-of-done:    not-started, in-progress, blocked, ready-for-review, done
 */
export type ArtifactStatus =
  | 'draft'
  | 'ready'
  | 'ready-for-dev'
  | 'in-progress'
  | 'in-review'
  | 'review'
  | 'ready-for-review'
  | 'blocked'
  | 'complete'
  | 'completed'
  | 'approved'
  | 'done'
  | 'archived'
  | 'implementing'
  | 'not-started'
  | 'backlog'
  | 'proposed'
  | 'accepted'
  | 'deprecated'
  | 'superseded'
  | 'rejected';

/**
 * All supported artifact types
 */
export type ArtifactType = 'vision' | 'requirement' | 'epic' | 'story' | 'use-case' | 'prd' | 'architecture' | 'architecture-decision' | 'system-component' | 'nfr' | 'additional-req' | 'product-brief' | 'test-case' | 'test-strategy' | 'test-design' | 'task' | 'risk' | 'test-coverage'
  // TEA module
  | 'traceability-matrix' | 'test-review' | 'nfr-assessment' | 'test-framework' | 'ci-pipeline' | 'automation-summary' | 'atdd-checklist' | 'test-design-qa' | 'test-design-architecture' | 'test-cases'
  // BMM module
  | 'research' | 'ux-design' | 'readiness-report' | 'sprint-status' | 'retrospective' | 'change-proposal' | 'code-review' | 'risks' | 'definition-of-done' | 'fit-criteria' | 'success-metrics' | 'project-overview' | 'project-context' | 'tech-spec' | 'test-summary' | 'source-tree'
  // CIS module
  | 'storytelling' | 'problem-solving' | 'innovation-strategy' | 'design-thinking';

/**
 * Test case type
 */
export type TestCaseType = 'unit' | 'integration' | 'e2e' | 'acceptance';

/**
 * Test case status
 */
export type TestCaseStatus = 'draft' | 'ready' | 'passed' | 'failed' | 'blocked';

/**
 * A single test step (supports both BDD Given/When/Then and schema step/action format)
 */
export interface TestStep {
  /** BDD format fields */
  given?: string;
  when?: string;
  then?: string;
  and?: string[];
  description?: string;
  /** Schema format fields */
  step?: number;
  action?: string;
  expectedResult?: string;
}

/**
 * Test case metadata
 */
export interface TestCaseMetadata {
  type?: TestCaseType;
  level?: 'unit' | 'integration' | 'component' | 'api' | 'e2e' | 'performance' | 'security';
  storyId?: string;
  epicId?: string;
  relatedRequirements?: string[];
  relatedRisks?: string[];
  steps?: TestStep[];
  expectedResult?: string;
  preconditions?: string[];
  tags?: string[];
  priority?: PriorityLevel;
  testData?: string;
}

/**
 * Test strategy metadata
 */
export interface TestStrategyMetadata {
  scope?: string;
  approach?: string;
  testTypes?: TestCaseType[];
  tooling?: string[];
  coverageTargets?: { area: string; target: string }[];
  riskAreas?: string[];
}

/**
 * Test design metadata (from tea/test-design.schema.json)
 */
export interface TestDesignMetadata {
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
    approach?: string;
    keyDecisions?: string[];
  };
  riskAssessment?: {
    overview?: string;
    highPriority?: { riskId?: string; description?: string; probability?: string; impact?: string }[];
  };
  coveragePlan?: {
    overview?: string;
    coverageGoals?: { codeStatement?: string; codeBranch?: string; requirementCoverage?: string; riskCoverage?: string };
  };
  qualityGateCriteria?: { criterion?: string; threshold?: string; mandatory?: boolean }[];
}

/**
 * Test coverage card metadata — consolidated view of all test cases linked to a story or epic.
 * Replaces the per-TC chip/mini-card/semantic-zoom system with a single summary card.
 */
export interface TestCoverageMetadata {
  storyId?: string;
  epicId?: string;
  /** All individual test cases bundled into this coverage card */
  testCases: {
    id: string;
    title: string;
    status: ArtifactStatus;
    type?: TestCaseType;
    description?: string;
    steps?: TestStep[];
    expectedResult?: string;
    preconditions?: string[];
    priority?: PriorityLevel;
    tags?: string[];
    relatedRequirements?: string[];
  }[];
  /** Summary counts */
  totalCount: number;
  passCount: number;
  failCount: number;
  draftCount: number;
}

// =============================================================================
// Story Types
// =============================================================================

/**
 * Acceptance criterion — supports both structured (Given/When/Then) and prose formats.
 *
 * Schema `oneOf`:
 *   - Structured: requires `given`, `when`, `then`
 *   - Prose: requires `criterion`
 *
 * All fields are optional here because either format is valid at the type level;
 * runtime code should check `criterion` first (prose) then fall back to GWT.
 */
export interface AcceptanceCriterion {
  id?: string;
  /** Structured format fields */
  given?: string;
  when?: string;
  then?: string;
  and?: string[];
  /** Prose format field */
  criterion?: string;
  /** Verification status — single source of truth, replaces old verified boolean */
  status?: 'draft' | 'implemented' | 'verified' | 'failed';
}

/**
 * Story task structure (from BMAD schema)
 */
export interface StoryTask {
  id: string;
  description: string;
  acReference?: string;
  estimatedHours?: number;
  status?: string;
  subtasks?: {
    id: string;
    description: string;
    status?: string;
  }[];
}

/**
 * Story dependencies structure (from BMAD schema)
 */
export interface StoryDependencies {
  blockedBy?: Array<string | { storyId: string; title?: string; status?: string; reason?: string }>;
  blocks?: Array<string | { storyId: string; title?: string }>;
  relatedStories?: string[];
  externalDependencies?: string[];
}

/**
 * Developer notes for story implementation (from BMAD schema)
 */
export interface StoryDevNotes {
  overview?: string;
  architecturePatterns?: string[];
  dataModels?: string[];
  securityConsiderations?: string[];
  performanceConsiderations?: string[];
  accessibilityConsiderations?: string[];
  edgeCases?: string[];
  potentialChallenges?: string[];
  componentsToCreate?: { path: string; type?: string; description?: string }[];
  componentsToModify?: { path: string; changes?: string }[];
  apiEndpoints?: { method: string; path: string; description?: string }[];
  testingStrategy?: {
    unitTests?: string[];
    integrationTests?: string[];
    e2eTests?: string[];
    testDataNeeded?: string[];
  };
}

/**
 * Dev agent record for tracking AI implementation (from BMAD schema)
 */
export interface StoryDevAgentRecord {
  agentModel?: string;
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
  debugLogRefs?: string[];
  completionNotes?: string[];
  filesModified?: { path: string; action?: 'created' | 'modified' | 'deleted' | 'renamed'; description?: string; linesChanged?: number }[];
  testsRun?: { total?: number; passed?: number; failed?: number; skipped?: number };
  issuesEncountered?: { issue: string; resolution?: string }[];
}

/**
 * Story status history entry (from BMAD schema)
 */
export interface StoryHistoryEntry {
  timestamp: string;
  fromStatus: string;
  toStatus: string;
  changedBy?: string;
  notes?: string;
}

/**
 * User story format
 */
export interface UserStory {
  asA: string;
  iWant: string;
  soThat: string;
}

/**
 * Story metadata
 */
export interface StoryMetadata {
  userStory?: UserStory;
  acceptanceCriteria?: AcceptanceCriterion[];
  technicalNotes?: string;
  storyPoints?: number;
  priority?: PriorityLevel;
  estimatedEffort?: string;
  storyFormat?: 'structured' | 'prose';
  background?: string;
  problemStatement?: string;
  proposedSolution?: string;
  dependencies?: StoryDependencies;
  tasks?: StoryTask[];
  devNotes?: StoryDevNotes;
  devAgentRecord?: StoryDevAgentRecord;
  history?: StoryHistoryEntry[];
  labels?: string[];
  assignee?: string;
  reviewer?: string;
  definitionOfDone?: string[];
  implementationDetails?: string[];
  requirementRefs?: string[];
  uxReferences?: { type: string; reference: string; description?: string }[];
  references?: { source: string; section?: string; relevance?: string; quote?: string }[];
  /** ID of the parent epic — injected by artifact-transformer */
  epicId?: string;
  /** Title of the parent epic — injected by artifact-transformer for display on the card */
  epicTitle?: string;
  /** Linked test cases — injected by artifact-transformer for inline summary */
  testCases?: {
    id: string;
    title: string;
    status: ArtifactStatus;
    type?: TestCaseType;
    description?: string;
    steps?: TestStep[];
    expectedResult?: string;
    preconditions?: string[];
    priority?: PriorityLevel;
    tags?: string[];
    relatedRequirements?: string[];
  }[];
}
// =============================================================================
// Epic Types
// =============================================================================

/**
 * Effort estimate breakdown for epics
 */
export interface EpicEffortEstimate {
  totalSprints?: number;
  totalDays?: number;
  breakdown?: {
    phase: string;
    effort: string;
  }[];
}

/**
 * Epic dependencies structure
 */
export interface EpicDependencies {
  upstream?: Array<string | { epicId: string; reason?: string }>;
  downstream?: Array<string | { epicId: string; reason?: string }>;
  relatedEpics?: string[];
}

/**
 * Use case structure
 */
export interface UseCase {
  id: string;
  title: string;
  summary: string;
  scenario: {
    context: string;
    before: string;
    after: string;
    impact: string;
  };
}

/**
 * Risk structure
 */
export interface Risk {
  risk: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  mitigation: string;
}

/**
 * Fit criteria structure
 */
export interface FitCriteria {
  functional: { criterion: string; verified: boolean }[];
  nonFunctional: { criterion: string; verified: boolean }[];
  security: { criterion: string; verified: boolean }[];
}

/**
 * Success metrics structure
 */
export interface SuccessMetrics {
  codeQuality: { metric: string; target: string }[];
  operational: { metric: string; target: string }[];
  customerImpact: { metric: string; target: string }[];
  deployment: { metric: string; target: string }[];
}

/**
 * Technical summary structure
 */
export interface TechnicalSummary {
  architecturePattern: string;
  components: { name: string; responsibility: string }[];
  filesChanged: { path: string; action: 'new' | 'modified' }[];
}

/**
 * Epic metadata
 */
export interface EpicMetadata {
  description?: string;
  goal?: string;
  valueDelivered?: string;
  functionalRequirements?: string[];
  nonFunctionalRequirements?: string[];
  additionalRequirements?: string[];
  priority?: PriorityLevel;
  storyCount?: number;
  dependencies?: string[];
  epicDependencies?: EpicDependencies;
  implementationNotes?: string[];
  acceptanceSummary?: string;
  effortEstimate?: EpicEffortEstimate;
  useCases?: UseCase[];
  fitCriteria?: FitCriteria;
  successMetrics?: SuccessMetrics;
  risks?: Risk[];
  definitionOfDone?: string[];
  technicalSummary?: TechnicalSummary;
  /** Roll-up: sum of storyPoints across all child stories */
  totalStoryPoints?: number;
  /** Roll-up: number of stories with status done/complete */
  doneStoryCount?: number;
  /** Roll-up: total number of child stories */
  totalStoryCount?: number;
  /** Sub-group layout geometry for label rendering in Canvas */
  subGroups?: {
    stories?: { x: number; y: number; width: number };
    useCases?: { x: number; y: number; width: number };
    testing?: { x: number; y: number; width: number };
    risks?: { x: number; y: number; width: number };
  };
}

// =============================================================================
// Requirement Types
// =============================================================================

/**
 * Requirement metrics
 */
export interface RequirementMetrics {
  target: string;
  threshold?: string;
  unit?: string;
  measurementMethod?: string;
}

/**
 * Functional Requirement metadata (from BMAD requirement.schema.json)
 */
export interface RequirementMetadata {
  type?: 'functional' | 'non-functional' | 'additional' | 'business' | 'technical' | 'constraint';
  title?: string;
  capabilityArea?: string;
  category?: string; // For NFRs
  rationale?: string;
  source?: string;
  relatedEpics?: string[];
  architectureDecisions?: string[];
  relatedStories?: string[];
  priority?: PriorityLevel;
  status?: RequirementStatus;
  metrics?: RequirementMetrics;
  verificationMethod?: VerificationMethod;
  verificationNotes?: string;
  acceptanceCriteria?: AcceptanceCriterion[];
  dependencies?: string[];
  implementationNotes?: string;
  notes?: string;
  lastUpdated?: string;
}

// =============================================================================
// Vision Types
// =============================================================================

/**
 * Vision metadata
 */
export interface VisionMetadata {
  productName?: string;
  problemStatement?: string;
  targetUsers?: string[];
  valueProposition?: string;
  successCriteria?: string[];
}

// =============================================================================
// Use Case Types
// =============================================================================

/**
 * Use case main flow step (from BMAD schema)
 */
export interface UseCaseFlowStep {
  step: number;
  action: string;
  actor?: string;
}

/**
 * Use case alternative flow (from BMAD schema)
 */
export interface UseCaseAlternativeFlow {
  id?: string;
  name?: string;
  branchPoint?: string;
  steps?: string[];
}

/**
 * Use case exception flow (from BMAD schema)
 */
export interface UseCaseExceptionFlow {
  id?: string;
  name?: string;
  trigger?: string;
  handling?: string;
}

/**
 * Use case metadata (from BMAD use-case.schema.json)
 */
export interface UseCaseMetadata {
  summary?: string;
  primaryActor?: string;
  secondaryActors?: string[];
  preconditions?: string[];
  postconditions?: string[];
  trigger?: string;
  scenario?: {
    context: string;
    before: string;
    after: string;
    impact: string;
  };
  mainFlow?: UseCaseFlowStep[];
  alternativeFlows?: UseCaseAlternativeFlow[];
  exceptionFlows?: UseCaseExceptionFlow[];
  businessRules?: string[];
  relatedRequirements?: string[];
  relatedEpic?: string;
  relatedStories?: string[];
  sourceDocument?: string;
  notes?: string;
  priority?: PriorityLevel;
}

// =============================================================================
// PRD Types (Product Requirements Document)
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

export interface PRDMetadata {
  productOverview?: {
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
    glossary?: { term: string; definition: string; synonyms?: string[]; relatedTerms?: string[] }[];
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

export interface ArchitectureMetadata {
  overview?: {
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
  decisions?: ArchitectureDecision[];
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
  references?: { title: string; type?: string; location?: string; description?: string }[];
}

// =============================================================================
// Product Brief Types
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

export interface ProductBriefMetadata {
  productName?: string;
  tagline?: string;
  version?: string;
  vision?: {
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

// =============================================================================
// Main Artifact Interface
// =============================================================================

// =============================================================================
// TEA Module Metadata Types
// =============================================================================

export interface TraceabilityMatrixMetadata {
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
    coverageSummary?: {
      p0?: { total?: number; covered?: number; percentage?: number; status?: string };
      p1?: { total?: number; covered?: number; percentage?: number; status?: string };
      p2?: { total?: number; covered?: number; percentage?: number; status?: string };
      p3?: { total?: number; covered?: number; percentage?: number; status?: string };
      overall?: { total?: number; covered?: number; percentage?: number };
    };
    detailedMapping?: { criterionId?: string; criterion?: string; requirementId?: string; priority?: string; tests?: any[]; coverage?: string; coverageNotes?: string }[];
    gapAnalysis?: { summary?: string; critical?: any[]; high?: any[]; medium?: any[]; low?: any[] };
  };
  gateDecision?: {
    decision?: string;
    rationale?: string;
    conditions?: string[];
    requiredActions?: { action?: string; owner?: string; deadline?: string; priority?: string }[];
    riskAcceptance?: string;
  };
}

export interface TestReviewMetadata {
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
    strengths?: { strength?: string; examples?: string[]; impact?: string }[];
    weaknesses?: { weakness?: string; examples?: string[]; impact?: string; remediation?: string }[];
    riskLevel?: string;
  };
  qualityAssessment?: {
    criteria?: { criterion?: string; score?: number; weight?: number; findings?: string; evidence?: any[]; recommendations?: string[] }[];
    bddFormat?: { score?: number; notes?: string; examples?: any[] };
    testIds?: { score?: number; notes?: string };
  };
  qualityScoreBreakdown?: {
    categories?: { category?: string; score?: number; weight?: number; details?: string }[];
    totalScore?: number;
    maxScore?: number;
    passThreshold?: number;
    passed?: boolean;
  };
}

export interface NfrAssessmentMetadata {
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
    performance?: { status?: string; summary?: string; responseTime?: any; throughput?: any; resourceUsage?: any };
    security?: { status?: string; summary?: string; findings?: any[] };
    reliability?: { status?: string; summary?: string; availability?: any; errorHandling?: any };
    scalability?: { status?: string; summary?: string };
    maintainability?: { status?: string; summary?: string };
    usability?: { status?: string; summary?: string };
    accessibility?: { status?: string; summary?: string };
    compliance?: { status?: string; summary?: string };
  };
  quickWins?: { description?: string; category?: string; effort?: string; impact?: string; priority?: string }[];
  recommendations?: { recommendation?: string; category?: string; priority?: string; effort?: string; impact?: string }[];
}

export interface TestFrameworkMetadata {
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
  directoryStructure?: {
    rootDir?: string;
    directories?: { path?: string; purpose?: string; contents?: string[] }[];
  };
  fixtures?: { name?: string; filePath?: string; purpose?: string; scope?: string; dependencies?: string[] }[];
  helpers?: { name?: string; filePath?: string; purpose?: string; functions?: { name?: string; description?: string; signature?: string }[] }[];
  pageObjects?: { name?: string; filePath?: string; page?: string; elements?: string[]; actions?: string[] }[];
  mocking?: { strategy?: string; libraries?: string[]; mockFiles?: { path?: string; purpose?: string }[] };
  dependencies?: { production?: { name?: string; version?: string; purpose?: string }[]; dev?: { name?: string; version?: string; purpose?: string }[] };
}

export interface CiPipelineMetadata {
  platform?: { name?: string; configFile?: string; selectionRationale?: string };
  pipeline?: { name?: string; triggers?: string[]; concurrency?: any };
  jobs?: { id?: string; name?: string; description?: string; runsOn?: string; dependsOn?: string[]; steps?: { name?: string; uses?: string; run?: string; with?: any; env?: any }[]; timeout?: number; condition?: string; environment?: string; services?: any }[];
  testExecution?: any;
  qualityGates?: { name?: string; type?: string; threshold?: any; blocking?: boolean; tool?: string }[];
  artifacts?: { name?: string; path?: string; retention?: string }[];
}

export interface AutomationSummaryMetadata {
  summary?: { scope?: string; mode?: string; coverageTarget?: string; framework?: string; totalTestsCreated?: number; totalFilesCreated?: number };
  coverageAnalysis?: { baseline?: any; target?: any; gaps?: { area?: string; description?: string; priority?: string }[]; criticalPaths?: { path?: string; covered?: boolean; testType?: string }[] };
  testsCreated?: { filePath?: string; testType?: string; targetFeature?: string; testCount?: number; tests?: { name?: string; description?: string; type?: string; status?: string }[] }[];
  fixturesCreated?: { filePath?: string; purpose?: string; dataEntities?: string[] }[];
  factoriesCreated?: { filePath?: string; purpose?: string; entityType?: string }[];
  bmadIntegration?: any;
}

export interface AtddChecklistMetadata {
  storyInfo?: { epicId?: string; storyId?: string; storyTitle?: string; storyDescription?: string; primaryTestLevel?: string; businessValue?: string; technicalContext?: string };
  storySummary?: string;
  acceptanceCriteria?: { id?: string; description?: string; testApproach?: string; testLevel?: string; automationStatus?: string; notes?: string }[];
  failingTestsCreated?: { e2e?: string[]; api?: string[]; integration?: string[]; component?: string[]; unit?: string[] };
  testScenarios?: { id?: string; name?: string; type?: string; description?: string; steps?: string[]; expectedResult?: string }[];
  dataFactoriesCreated?: { filePath?: string; purpose?: string; entityType?: string }[];
  fixturesCreated?: { filePath?: string; purpose?: string }[];
  completionStatus?: { totalCriteria?: number; coveredCriteria?: number; coveragePercentage?: string; allPassing?: boolean; readyForDevelopment?: boolean };
}

// =============================================================================
// BMM Module Metadata Types
// =============================================================================

export interface ResearchMetadata {
  researchType?: string;
  topic?: string;
  scope?: { description?: string; inScope?: string[]; outOfScope?: string[]; timeframe?: string };
  goals?: string[];
  questions?: string[];
  methodology?: string;
  findings?: { id?: string; category?: string; finding?: string; details?: string; evidence?: string[]; confidence?: string; implications?: string[]; actionItems?: string[] }[];
  recommendations?: { id?: string; recommendation?: string; priority?: string; effort?: string; impact?: string; rationale?: string }[];
}

export interface UxDesignMetadata {
  overview?: { productName?: string; version?: string; designPhilosophy?: string; targetExperience?: string; designPrinciples?: string[]; designGoals?: string[] };
  coreExperience?: { primaryValue?: string; keyInteractions?: string[]; emotionalGoals?: string[]; userFlowSummary?: string };
  designSystem?: { overview?: string; colorPalette?: any; typography?: any; spacing?: any; components?: any };
  wireframes?: { id?: string; name?: string; page?: string; description?: string; layout?: string; elements?: any[]; notes?: string }[];
  userFlows?: { id?: string; name?: string; description?: string; steps?: any[]; notes?: string }[];
}

export interface ReadinessReportMetadata {
  summary?: { projectName?: string; assessmentDate?: string; assessedBy?: string; overallStatus?: string; overallScore?: number; recommendation?: string; keyFindings?: string[]; criticalActions?: string[] };
  assessment?: { prdAnalysis?: any; epicCoverage?: any; uxAlignment?: any; architectureReview?: any; testReadiness?: any; riskAssessment?: any };
  blockers?: { id?: string; description?: string; severity?: string; owner?: string; eta?: string; impact?: string }[];
  risks?: { id?: string; risk?: string; probability?: string; impact?: string; mitigation?: string; status?: string }[];
  recommendations?: { id?: string; recommendation?: string; priority?: string; category?: string; effort?: string }[];
}

export interface SprintStatusMetadata {
  generated?: string;
  project?: string;
  projectKey?: string;
  trackingSystem?: string;
  storyLocation?: string;
  summary?: { totalEpics?: number; completedEpics?: number; inProgressEpics?: number; totalStories?: number; completedStories?: number; inProgressStories?: number; backlogStories?: number };
  epics?: { epicId?: string; title?: string; status?: string; stories?: { storyKey?: string; storyId?: string; title?: string; status?: string; filePath?: string; assignee?: string; startedAt?: string; completedAt?: string }[]; retrospective?: { status?: string; filePath?: string; completedAt?: string } }[];
  developmentStatus?: Record<string, string>;
  statusDefinitions?: { epicStatuses?: Record<string, string>; storyStatuses?: Record<string, string> };
}

export interface RetrospectiveMetadata {
  epicReference?: { epicId?: string; title?: string; goal?: string; totalStories?: number; startDate?: string; completionDate?: string; durationDays?: number };
  summary?: { overallSuccess?: string; keyAchievements?: string[]; mainChallenges?: string[]; velocityAnalysis?: { estimatedEffort?: string; actualEffort?: string; variance?: string; varianceReason?: string } };
  whatWentWell?: { item?: string; impact?: string; recommendation?: string }[];
  whatDidNotGoWell?: { item?: string; impact?: string; rootCause?: string; recommendation?: string }[];
  lessonsLearned?: { id?: string; lesson: string; category?: string; actionable?: boolean; appliesTo?: string[] }[];
  storyAnalysis?: { storyId?: string; storyTitle?: string; outcome?: string; notes?: string; timeSpent?: string; blockers?: string[] }[];
  technicalDebt?: { debtIntroduced?: { description?: string; reason?: string; remediationPlan?: string; severity?: string }[]; debtAddressed?: { description?: string; resolution?: string }[] };
  impactOnFutureWork?: { nextEpicImpacts?: { epicId?: string; impact?: string; recommendation?: string }[]; architectureChanges?: { decision?: string; rationale?: string; documentationUpdate?: string }[]; newDiscoveries?: { discovery?: string; implication?: string; action?: string }[]; suggestedBacklogChanges?: { targetItem?: string; description?: string; rationale?: string; changeType?: string }[] };
  teamFeedback?: { processImprovements?: string[]; toolingImprovements?: string[]; communicationImprovements?: string[] };
  actionItems?: { id?: string; action: string; owner?: string; dueDate?: string; priority?: string; status?: string }[];
  metricsSnapshot?: { codeMetrics?: { linesAdded?: number; linesRemoved?: number; filesChanged?: number; testCoverage?: number }; qualityMetrics?: { bugsFound?: number; bugsFixed?: number; reviewIterations?: number } };
}

export interface ChangeProposalMetadata {
  changeRequest?: { id?: string; title?: string; description?: string; requestedBy?: string; requestDate?: string; changeType?: string; urgency?: string; source?: string };
  impactAnalysis?: { overallImpact?: string; affectedEpics?: string[]; affectedStories?: string[]; architectureImpact?: string; timelineImpact?: string; resourceImpact?: string; riskAssessment?: { risk?: string; probability?: string; impact?: string; mitigation?: string }[] };
  proposal?: { recommendation?: string; rationale?: string; options?: { id?: string; name?: string; description?: string; pros?: string[]; cons?: string[]; effort?: string; risk?: string }[]; implementationPlan?: any };
  approval?: { status?: string; approvedBy?: string; approvedDate?: string; conditions?: string[]; notes?: string };
}

export interface CodeReviewMetadata {
  storyReference?: { storyId?: string; storyKey?: string; storyTitle?: string; storyFilePath?: string; epicId?: string };
  reviewSummary?: { overallVerdict?: string; totalFindings?: number; criticalCount?: number; majorCount?: number; minorCount?: number; suggestionsCount?: number; autoFixableCount?: number; reviewDuration?: string };
  findings?: { id?: string; severity?: string; category?: string; description?: string; location?: { filePath?: string; lineNumber?: number; lineRange?: { start?: number; end?: number }; functionName?: string; componentName?: string }; codeSnippet?: string; recommendation?: string; suggestedFix?: string; autoFixable?: boolean; autoFixApplied?: boolean; references?: { title?: string; url?: string }[] }[];
  acceptanceCriteriaVerification?: { acId?: string; acDescription?: string; status?: string; notes?: string; evidenceLocations?: string[] }[];
  testCoverageAnalysis?: { coveragePercentage?: number; uncoveredAreas?: string[]; missingTestTypes?: string[]; testQualityNotes?: string };
  securityAnalysis?: { vulnerabilitiesFound?: number; securityChecksPerformed?: string[]; recommendations?: string[] };
  architectureCompliance?: { compliant?: boolean; violations?: { rule?: string; violation?: string; location?: string }[]; notes?: string };
  nextSteps?: { action?: string; priority?: string; relatedFindingIds?: string[] }[];
  reviewerNotes?: string;
}

export interface RisksMetadata {
  risks?: { id?: string; risk?: string; category?: string; probability?: string; impact?: string; riskScore?: string; mitigation?: string; mitigationStrategies?: string[]; contingencyPlan?: string; triggers?: string[]; owner?: string; status?: string; residualRisk?: string }[];
  assumptions?: { id?: string; assumption?: string; ifFalse?: string; validationMethod?: string; validated?: boolean }[];
  dependencies?: { id?: string; dependency?: string; type?: string; risk?: string; mitigation?: string }[];
  riskMatrix?: { critical?: string[]; high?: string[]; medium?: string[]; low?: string[] };
  summary?: { totalRisks?: number; criticalCount?: number; highCount?: number; mediumCount?: number; lowCount?: number; mitigatedCount?: number; openCount?: number; overallRiskLevel?: string };
}

export interface DefinitionOfDoneMetadata {
  items?: { id?: string; item: string; category?: string; required?: boolean; completed?: boolean; completedBy?: string; completedAt?: string; evidence?: string; notes?: string }[];
  qualityGates?: { id?: string; gate?: string; criteria?: string[]; passed?: boolean; passedAt?: string; approver?: string }[];
  acceptanceSummary?: { totalCriteria?: number; passedCriteria?: number; failedCriteria?: number; blockedCriteria?: number; passPercentage?: string };
  templates?: { epic?: string[]; story?: string[]; feature?: string[] };
  summary?: { totalItems?: number; completedItems?: number; requiredItems?: number; requiredCompleted?: number; completionPercentage?: string; allRequiredComplete?: boolean; status?: string };
}

export interface FitCriteriaMetadata {
  functional?: { id?: string; criterion: string; verified?: boolean; verificationMethod?: string; relatedRequirement?: string; notes?: string }[];
  nonFunctional?: { id?: string; category?: string; criterion: string; metric?: { measure?: string; target?: string; threshold?: string; unit?: string }; verified?: boolean; verificationMethod?: string; relatedRequirement?: string; notes?: string }[];
  security?: { id?: string; category?: string; criterion: string; complianceStandard?: string; verified?: boolean; verificationMethod?: string; relatedRequirement?: string; notes?: string }[];
  summary?: { totalFunctional?: number; totalNonFunctional?: number; totalSecurity?: number; totalCriteria?: number; verifiedCount?: number; verificationPercentage?: string };
}

export interface SuccessMetricsMetadata {
  codeQuality?: { id?: string; metric: string; target?: string; measurement?: string; baseline?: string; achieved?: boolean; notes?: string }[];
  operational?: { id?: string; metric: string; target?: string; measurement?: string; baseline?: string; achieved?: boolean; actualValue?: string; notes?: string }[];
  customerImpact?: { id?: string; metric: string; target?: string; measurement?: string; baseline?: string; achieved?: boolean; notes?: string }[];
  deployment?: { id?: string; metric: string; target?: string; achieved?: boolean; notes?: string }[];
  business?: { id?: string; metric: string; target?: string; measurement?: string; achieved?: boolean; actualValue?: string; notes?: string }[];
  summary?: { totalMetrics?: number; achievedCount?: number; achievementPercentage?: string; overallStatus?: string };
}

export interface ProjectOverviewMetadata {
  projectInfo?: { name?: string; description?: string; type?: string; architecturePattern?: string; version?: string; repository?: string };
  executiveSummary?: string;
  projectClassification?: any;
  multiPartStructure?: any[];
  techStackSummary?: { overview?: string; frontend?: string[]; backend?: string[]; database?: string[]; infrastructure?: string[]; testing?: string[]; devTools?: string[] };
  keyFeatures?: { feature?: string; status?: string; location?: string }[];
  architectureHighlights?: string[];
}

export interface ProjectContextMetadata {
  projectInfo?: { name?: string; description?: string; type?: string; version?: string; repository?: string; documentation?: string };
  overview?: { summary?: string; architecture?: string; keyFeatures?: string[]; currentState?: string };
  techStack?: { overview?: string; languages?: string[]; frameworks?: string[]; libraries?: string[]; tools?: string[]; infrastructure?: string[] };
  implementationRules?: { id?: string; rule?: string; rationale?: string; category?: string; severity?: string; examples?: string; exceptions?: string; enforcedBy?: string }[];
  patterns?: any;
}

export interface TechSpecMetadata {
  title?: string;
  slug?: string;
  version?: string;
  status?: string;
  overview?: { summary?: string; problemStatement?: string; background?: string; proposedSolution?: string; goals?: string[]; nonGoals?: string[]; scope?: string; relatedDocuments?: { title?: string; url?: string }[] };
  context?: { overview?: string; existingArchitecture?: string; codebasePatterns?: string[]; filesToReference?: string[]; technicalDecisions?: string[]; constraints?: string[] };
  implementationPlan?: any;
}

// =============================================================================
// CIS Module Metadata Types
// =============================================================================

export interface StorytellingMetadata {
  storyType?: string;
  frameworkName?: string;
  storyTitle?: string;
  purpose?: string;
  targetAudience?: string;
  strategicContext?: string;
  frameworkApplication?: string;
  structure?: { openingHook?: { text?: string; technique?: string; emotionalTrigger?: string }; setup?: { text?: string; worldBuilding?: string; stakesEstablished?: string }; coreNarrative?: string; storyBeats?: { beat?: string; purpose?: string; emotionalArc?: string }[]; climax?: string; resolution?: string; closingMessage?: string };
  variations?: any;
  performanceMetrics?: any;
}

export interface ProblemSolvingMetadata {
  problemTitle?: string;
  problemCategory?: string;
  sessionInfo?: any;
  problemDefinition?: { initialStatement?: string; refinedStatement?: string; context?: string; stakeholders?: string[]; impact?: string; urgency?: string; successCriteria?: string[] };
  diagnosis?: { problemBoundaries?: string; dataCollection?: string; rootCauseAnalysis?: string };
  recommendedSolution?: { title?: string; description?: string; approach?: string; steps?: string[]; resources?: string[]; timeline?: string; risks?: string[]; expectedOutcome?: string };
  alternativeSolutions?: { title?: string; description?: string; pros?: string[]; cons?: string[]; feasibility?: string }[];
}

export interface InnovationStrategyMetadata {
  companyName?: string;
  strategicFocus?: string;
  sessionInfo?: any;
  strategicContext?: { currentSituation?: string; strategicChallenge?: string; visionStatement?: string; strategicObjectives?: string[]; keyQuestions?: string[] };
  marketAnalysis?: { marketLandscape?: string; competitiveDynamics?: string; marketOpportunities?: { opportunity?: string; potential?: string; timeframe?: string }[] };
  recommendedStrategy?: { name?: string; description?: string; rationale?: string; keyInitiatives?: string[]; timeline?: string; investmentRequired?: string; expectedReturn?: string; risks?: string[] };
}

export interface DesignThinkingMetadata {
  projectName?: string;
  sessionInfo?: any;
  designChallenge?: string;
  empathize?: { researchMethods?: string[]; userProfiles?: { name?: string; role?: string; goals?: string[]; painPoints?: string[]; behaviors?: string[] }[]; userInsights?: string[]; keyObservations?: string[]; empathyMap?: any };
  define?: { problemStatement?: string; pointOfView?: string; hmwQuestions?: string[]; userNeeds?: string[]; insights?: string[] };
  ideate?: { brainstormingApproach?: string; ideas?: { id?: string; name?: string; description?: string; feasibility?: string; impact?: string }[]; themes?: string[]; selectedIdeas?: string[] };
  prototype?: any;
  test?: any;
}

/**
 * Union type for all metadata types
 */
export type ArtifactMetadata = 
  | StoryMetadata 
  | EpicMetadata 
  | RequirementMetadata 
  | VisionMetadata 
  | UseCaseMetadata
  | PRDMetadata
  | ArchitectureMetadata
  | ProductBriefMetadata
  | TestCaseMetadata
  | TestStrategyMetadata
  | TestDesignMetadata
  | TestCoverageMetadata
  // TEA module
  | TraceabilityMatrixMetadata
  | TestReviewMetadata
  | NfrAssessmentMetadata
  | TestFrameworkMetadata
  | CiPipelineMetadata
  | AutomationSummaryMetadata
  | AtddChecklistMetadata
  // BMM module
  | ResearchMetadata
  | UxDesignMetadata
  | ReadinessReportMetadata
  | SprintStatusMetadata
  | RetrospectiveMetadata
  | ChangeProposalMetadata
  | CodeReviewMetadata
  | RisksMetadata
  | DefinitionOfDoneMetadata
  | FitCriteriaMetadata
  | SuccessMetricsMetadata
  | ProjectOverviewMetadata
  | ProjectContextMetadata
  | TechSpecMetadata
  // CIS module
  | StorytellingMetadata
  | ProblemSolvingMetadata
  | InnovationStrategyMetadata
  | DesignThinkingMetadata
  | Record<string, unknown>;

/**
 * Main Artifact interface used throughout the canvas
 */
export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  description: string;
  status: ArtifactStatus;
  position: { x: number; y: number };
  size: { width: number; height: number };
  dependencies: string[];
  metadata: ArtifactMetadata;
  childCount?: number;
  childBreakdown?: { label: string; count: number; types: string[] }[];
  parentId?: string;
  rowY?: number;
  rowHeight?: number;
}

// =============================================================================
// Canvas State Types
// =============================================================================

export interface AICursorState {
  x: number;
  y: number;
  targetId: string | null;
  action: 'editing' | 'reviewing' | 'suggesting' | 'idle';
  label?: string;
}

export interface CanvasState {
  zoom: number;
  pan: { x: number; y: number };
}

// =============================================================================
// Helper Constants
// =============================================================================

// =============================================================================
// Elicitation Types
// =============================================================================

/**
 * A BMM workflow discovered from the extension's bundled resources/_aac workflows
 */
export interface BmmWorkflow {
  /** Unique workflow id derived from folder path, e.g. "1-analysis/create-product-brief" */
  id: string;
  /** Human-readable name, e.g. "create-product-brief" */
  name: string;
  /** Full description text from the workflow file's description field */
  description: string;
  /**
   * Short trigger phrase extracted from description (the part after "Use when the user says")
   * Used as the pre-filled chat query.
   */
  triggerPhrase: string;
  /** Phase label used for grouping in the picker UI */
  phase: string;
  /** The phase sort order (lower = earlier) */
  phaseOrder: number;
  /** Absolute path to the workflow file — used by the extension to invoke executeWithTools */
  workflowFilePath: string;
}

/**
 * A single elicitation method from methods.csv
 */
export interface ElicitationMethod {
  num: string;
  category: string;
  method_name: string;
  description: string;
  output_pattern: string;
}

export const PRIORITY_OPTIONS: PriorityLevel[] = ['P0', 'P1', 'P2', 'P3', 'must-have', 'should-have', 'could-have', "won't-have"];

export const REQUIREMENT_STATUS_OPTIONS: RequirementStatus[] = ['draft', 'proposed', 'approved', 'implemented', 'verified', 'deferred', 'rejected'];

export const VERIFICATION_METHOD_OPTIONS: VerificationMethod[] = ['test', 'inspection', 'demonstration', 'analysis'];

export const ARTIFACT_STATUS_OPTIONS: ArtifactStatus[] = [
  'draft', 'ready', 'ready-for-dev', 'backlog', 'not-started',
  'in-progress', 'implementing', 'blocked',
  'in-review', 'review', 'ready-for-review',
  'complete', 'completed', 'approved', 'done', 'archived',
];
