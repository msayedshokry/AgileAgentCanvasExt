import * as vscode from 'vscode';
import * as path from 'path';
import * as yaml from 'yaml';
import { acOutput } from '../extension';
import { getToolDefinitions } from '../chat/agentcanvas-tools';
import { schemaValidator } from '../state/schema-validator';
import { BmadModel, streamChatResponse, ChatMessage } from '../chat/ai-provider';
import { getPersonaForArtifactType, formatFullAgentForPrompt } from '../chat/agent-personas';
import { orchestrateAntigravityWorkflow, ExecutionHints } from '../antigravity/antigravity-orchestrator';

/**
 * BMAD Workflow Executor
 * 
 * Executes BMAD methodology workflows from markdown/yaml files.
 * Follows the workflow.xml execution engine specification.
 * 
 * Supports 56 BMAD workflows across modules:
 * - Core: 4 workflows (brainstorming, convert-to-json, party-mode, advanced-elicitation)
 * - BMM: 26 workflows (analysis, planning, solutioning, implementation, quick-flow, supporting, utility)
 * - BMB: 12 workflows (agent builder, module builder, workflow builder) — not shown in /workflows display
 * - TEA: 9 workflows (testing architecture)
 * - CIS: 4 workflows (innovation strategy)
 */

export interface WorkflowDefinition {
    id: string;
    name: string;
    description: string;
    module: 'core' | 'bmm' | 'bmb' | 'tea' | 'cis';
    phase?: string;
    category?: string;
    path: string;
    format: 'md' | 'yaml' | 'xml' | 'both';
    /** Artifact types this workflow can operate on */
    artifactTypes?: string[];
    /** Tags for filtering/searching */
    tags?: string[];
}

export interface WorkflowConfig {
    name: string;
    description: string;
    output_format?: 'markdown' | 'json' | 'dual';
    schema_file?: string;
    template_json?: string;
    main_config?: string;
    // Step file references
    editWorkflow?: string;
    validateWorkflow?: string;
    // Variables from frontmatter
    [key: string]: any;
}

export interface WorkflowState {
    currentStep: number;
    stepsCompleted: string[];
    variables: Map<string, string>;
    outputContent: any;
    yoloMode: boolean;
}

/**
 * Workflow Session - tracks multi-step workflow execution across chat turns
 */
export interface WorkflowSession {
    /** Unique session ID */
    id: string;
    /** The workflow being executed */
    workflowId: string;
    workflowPath: string;
    workflowName: string;
    /** Current step file path */
    currentStepPath: string;
    /** Current step number (1-indexed) */
    currentStepNumber: number;
    /** Total steps in workflow (if known) */
    totalSteps?: number;
    /** Steps completed so far */
    stepsCompleted: string[];
    /** Next step file path (parsed from current step frontmatter) */
    nextStepPath?: string;
    /** Artifact being refined */
    artifactType: string;
    artifactId: string;
    artifact: any;
    /** User responses/inputs collected during workflow */
    userInputs: { step: string; input: string }[];
    /** When the session started */
    startedAt: Date;
    /** Last activity timestamp */
    lastActivityAt: Date;
    /** Session status */
    status: 'active' | 'paused' | 'completed' | 'cancelled';
}

export interface WorkflowContext {
    projectRoot: string;
    bmadPath: string;
    configPath: string;
    config: any;
}

/**
 * Complete BMAD Workflow Registry
 * All 56 workflows organized by module and phase
 */
export const WORKFLOW_REGISTRY: WorkflowDefinition[] = [
    // ============================================
    // CORE MODULE (3 workflows)
    // ============================================
    {
        id: 'brainstorming',
        name: 'Brainstorming',
        description: 'Creative ideation and exploration session',
        module: 'core',
        path: 'core/workflows/brainstorming/workflow.md',
        format: 'md',
        tags: ['ideation', 'creative', 'exploration']
    },
    {
        id: 'convert-to-json',
        name: 'Convert to JSON',
        description: 'Convert markdown artifacts to JSON format',
        module: 'core',
        path: 'core/workflows/convert-to-json/workflow.md',
        format: 'md',
        tags: ['conversion', 'json', 'utility']
    },
    {
        id: 'party-mode',
        name: 'Party Mode',
        description: 'Fun interactive mode for team engagement',
        module: 'core',
        path: 'core/workflows/party-mode/workflow.md',
        format: 'md',
        tags: ['fun', 'team', 'engagement']
    },
    {
        id: 'advanced-elicitation',
        name: 'Advanced Elicitation',
        description: 'Advanced requirements elicitation techniques',
        module: 'core',
        path: 'core/workflows/advanced-elicitation/workflow.xml',
        format: 'xml',
        tags: ['elicitation', 'requirements', 'advanced']
    },

    // ============================================
    // BMM MODULE - Phase 1: Analysis (4 workflows)
    // ============================================
    {
        id: 'create-product-brief',
        name: 'Create Product Brief',
        description: 'Create initial product brief from idea',
        module: 'bmm',
        phase: '1-analysis',
        path: 'bmm/workflows/1-analysis/create-product-brief/workflow.md',
        format: 'md',
        artifactTypes: ['brief', 'idea'],
        tags: ['analysis', 'product', 'brief']
    },
    {
        id: 'domain-research',
        name: 'Domain Research',
        description: 'Research domain knowledge and expertise',
        module: 'bmm',
        phase: '1-analysis',
        category: 'research',
        path: 'bmm/workflows/1-analysis/research/workflow-domain-research.md',
        format: 'md',
        artifactTypes: ['research', 'brief'],
        tags: ['analysis', 'research', 'domain']
    },
    {
        id: 'market-research',
        name: 'Market Research',
        description: 'Research market trends and competitors',
        module: 'bmm',
        phase: '1-analysis',
        category: 'research',
        path: 'bmm/workflows/1-analysis/research/workflow-market-research.md',
        format: 'md',
        artifactTypes: ['research', 'brief'],
        tags: ['analysis', 'research', 'market']
    },
    {
        id: 'technical-research',
        name: 'Technical Research',
        description: 'Research technical feasibility and approaches',
        module: 'bmm',
        phase: '1-analysis',
        category: 'research',
        path: 'bmm/workflows/1-analysis/research/workflow-technical-research.md',
        format: 'md',
        artifactTypes: ['research', 'brief', 'architecture'],
        tags: ['analysis', 'research', 'technical']
    },

    // ============================================
    // BMM MODULE - Phase 2: Planning (4 workflows)
    // ============================================
    {
        id: 'create-prd',
        name: 'Create PRD',
        description: 'Create Product Requirements Document',
        module: 'bmm',
        phase: '2-planning',
        path: 'bmm/workflows/2-plan-workflows/create-prd/workflow-create-prd.md',
        format: 'md',
        artifactTypes: ['prd', 'brief'],
        tags: ['planning', 'prd', 'requirements']
    },
    {
        id: 'edit-prd',
        name: 'Edit PRD',
        description: 'Edit and improve Product Requirements Document',
        module: 'bmm',
        phase: '2-planning',
        path: 'bmm/workflows/2-plan-workflows/create-prd/workflow-edit-prd.md',
        format: 'md',
        artifactTypes: ['prd'],
        tags: ['planning', 'prd', 'edit']
    },
    {
        id: 'validate-prd',
        name: 'Validate PRD',
        description: 'Validate PRD against BMAD standards',
        module: 'bmm',
        phase: '2-planning',
        path: 'bmm/workflows/2-plan-workflows/create-prd/workflow-validate-prd.md',
        format: 'md',
        artifactTypes: ['prd'],
        tags: ['planning', 'prd', 'validation']
    },
    {
        id: 'create-ux-design',
        name: 'Create UX Design',
        description: 'Design user experience and interface',
        module: 'bmm',
        phase: '2-planning',
        path: 'bmm/workflows/2-plan-workflows/create-ux-design/workflow.md',
        format: 'md',
        artifactTypes: ['ux', 'design'],
        tags: ['planning', 'ux', 'design']
    },

    // ============================================
    // BMM MODULE - Phase 3: Solutioning (3 workflows + enhancements)
    // ============================================
    {
        id: 'create-architecture',
        name: 'Create Architecture',
        description: 'Design technical architecture',
        module: 'bmm',
        phase: '3-solutioning',
        path: 'bmm/workflows/3-solutioning/create-architecture/workflow.md',
        format: 'md',
        artifactTypes: ['architecture'],
        tags: ['solutioning', 'architecture', 'technical']
    },
    {
        id: 'create-epics-and-stories',
        name: 'Create Epics and Stories',
        description: 'Break down PRD into epics and user stories',
        module: 'bmm',
        phase: '3-solutioning',
        path: 'bmm/workflows/3-solutioning/create-epics-and-stories/workflow.md',
        format: 'md',
        artifactTypes: ['epic', 'story', 'prd'],
        tags: ['solutioning', 'epics', 'stories']
    },
    {
        id: 'epic-enhancement',
        name: 'Epic Enhancement',
        description: 'Add use cases, risks, DoD, metrics to epics',
        module: 'bmm',
        phase: '3-solutioning',
        category: 'enhancement',
        path: 'bmm/workflows/3-solutioning/create-epics-and-stories/steps/step-02a-epic-enhancement.md',
        format: 'md',
        artifactTypes: ['epic'],
        tags: ['solutioning', 'epic', 'enhancement', 'refinement']
    },
    {
        id: 'story-enhancement',
        name: 'Story Enhancement',
        description: 'Add technical details, tests, edge cases, dependencies, risks, DoD',
        module: 'bmm',
        phase: '3-solutioning',
        category: 'enhancement',
        path: 'bmm/workflows/3-solutioning/create-epics-and-stories/steps/step-03a-story-enhancement.md',
        format: 'md',
        artifactTypes: ['story'],
        tags: ['solutioning', 'story', 'enhancement', 'refinement']
    },
    {
        id: 'check-implementation-readiness',
        name: 'Check Implementation Readiness',
        description: 'Verify artifacts are ready for development',
        module: 'bmm',
        phase: '3-solutioning',
        path: 'bmm/workflows/3-solutioning/check-implementation-readiness/workflow.md',
        format: 'md',
        artifactTypes: ['epic', 'story', 'architecture'],
        tags: ['solutioning', 'readiness', 'validation']
    },

    // ============================================
    // BMM MODULE - Phase 4: Implementation (7 workflows)
    // ============================================
    {
        id: 'sprint-planning',
        name: 'Sprint Planning',
        description: 'Plan sprint with story selection and capacity',
        module: 'bmm',
        phase: '4-implementation',
        path: 'bmm/workflows/4-implementation/sprint-planning/workflow.yaml',
        format: 'yaml',
        artifactTypes: ['sprint', 'story'],
        tags: ['implementation', 'sprint', 'planning']
    },
    {
        id: 'sprint-status',
        name: 'Sprint Status',
        description: 'Track and report sprint progress',
        module: 'bmm',
        phase: '4-implementation',
        path: 'bmm/workflows/4-implementation/sprint-status/workflow.yaml',
        format: 'yaml',
        artifactTypes: ['sprint'],
        tags: ['implementation', 'sprint', 'status']
    },
    {
        id: 'create-story',
        name: 'Create Story',
        description: 'Create detailed implementation-ready story',
        module: 'bmm',
        phase: '4-implementation',
        path: 'bmm/workflows/4-implementation/create-story/workflow.yaml',
        format: 'yaml',
        artifactTypes: ['story'],
        tags: ['implementation', 'story', 'creation']
    },
    {
        id: 'dev-story',
        name: 'Dev Story',
        description: 'Execute story development with guidance',
        module: 'bmm',
        phase: '4-implementation',
        path: 'bmm/workflows/4-implementation/dev-story/workflow.yaml',
        format: 'yaml',
        artifactTypes: ['story'],
        tags: ['implementation', 'story', 'development']
    },
    {
        id: 'code-review',
        name: 'Code Review',
        description: 'Review code changes for quality',
        module: 'bmm',
        phase: '4-implementation',
        path: 'bmm/workflows/4-implementation/code-review/workflow.yaml',
        format: 'yaml',
        artifactTypes: ['code', 'story'],
        tags: ['implementation', 'review', 'quality']
    },
    {
        id: 'retrospective',
        name: 'Retrospective',
        description: 'Sprint retrospective for continuous improvement',
        module: 'bmm',
        phase: '4-implementation',
        path: 'bmm/workflows/4-implementation/retrospective/workflow.yaml',
        format: 'yaml',
        artifactTypes: ['sprint'],
        tags: ['implementation', 'retrospective', 'improvement']
    },
    {
        id: 'correct-course',
        name: 'Correct Course',
        description: 'Adjust project direction based on feedback',
        module: 'bmm',
        phase: '4-implementation',
        path: 'bmm/workflows/4-implementation/correct-course/workflow.yaml',
        format: 'yaml',
        tags: ['implementation', 'correction', 'adjustment']
    },

    // ============================================
    // BMM MODULE - Quick Flow (2 workflows)
    // ============================================
    {
        id: 'quick-spec',
        name: 'Quick Spec',
        description: 'Rapid specification for small features',
        module: 'bmm',
        category: 'quick-flow',
        path: 'bmm/workflows/bmad-quick-flow/quick-spec/workflow.md',
        format: 'md',
        tags: ['quick', 'specification', 'rapid']
    },
    {
        id: 'quick-dev',
        name: 'Quick Dev',
        description: 'Rapid development for small features',
        module: 'bmm',
        category: 'quick-flow',
        path: 'bmm/workflows/bmad-quick-flow/quick-dev/workflow.md',
        format: 'md',
        tags: ['quick', 'development', 'rapid']
    },

    // ============================================
    // BMM MODULE - QA (1 workflow)
    // ============================================
    {
        id: 'qa-automate',
        name: 'QA Generate E2E Tests',
        description: 'Generate end-to-end test cases for quality assurance',
        module: 'bmm',
        category: 'qa',
        path: 'bmm/workflows/qa-generate-e2e-tests/workflow.yaml',
        format: 'yaml',
        tags: ['qa', 'automation', 'testing', 'e2e']
    },

    // ============================================
    // BMM MODULE - Supporting (3 workflows)
    // ============================================
    {
        id: 'create-use-cases',
        name: 'Create Use Cases',
        description: 'Define detailed use cases for features',
        module: 'bmm',
        category: 'supporting',
        path: 'bmm/workflows/supporting/create-use-cases/workflow.yaml',
        format: 'yaml',
        artifactTypes: ['epic', 'usecase'],
        tags: ['supporting', 'use-cases']
    },
    {
        id: 'create-risks',
        name: 'Create Risks',
        description: 'Identify and document project risks',
        module: 'bmm',
        category: 'supporting',
        path: 'bmm/workflows/supporting/create-risks/workflow.yaml',
        format: 'yaml',
        artifactTypes: ['epic', 'risk'],
        tags: ['supporting', 'risks']
    },
    {
        id: 'create-definition-of-done',
        name: 'Create Definition of Done',
        description: 'Define completion criteria',
        module: 'bmm',
        category: 'supporting',
        path: 'bmm/workflows/supporting/create-definition-of-done/workflow.yaml',
        format: 'yaml',
        artifactTypes: ['epic', 'story'],
        tags: ['supporting', 'dod']
    },

    // ============================================
    // BMM MODULE - Utility (2 workflows)
    // ============================================
    {
        id: 'document-project',
        name: 'Document Project',
        description: 'Generate project documentation',
        module: 'bmm',
        category: 'utility',
        path: 'bmm/workflows/document-project/workflow.yaml',
        format: 'yaml',
        tags: ['utility', 'documentation']
    },
    {
        id: 'generate-project-context',
        name: 'Generate Project Context',
        description: 'Create project context summary',
        module: 'bmm',
        category: 'utility',
        path: 'bmm/workflows/generate-project-context/workflow.md',
        format: 'md',
        tags: ['utility', 'context']
    },

    // ============================================
    // TEA MODULE - Testing Architecture (9 workflows)
    // ============================================
    {
        id: 'teach-me-testing',
        name: 'Teach Me Testing',
        description: 'Interactive testing education',
        module: 'tea',
        path: 'tea/workflows/testarch/teach-me-testing/workflow.md',
        format: 'md',
        tags: ['testing', 'education', 'learning']
    },
    {
        id: 'test-design',
        name: 'Test Design',
        description: 'Design test strategy and cases',
        module: 'tea',
        path: 'tea/workflows/testarch/test-design/workflow.md',
        format: 'both',
        artifactTypes: ['story', 'test'],
        tags: ['testing', 'design']
    },
    {
        id: 'test-review',
        name: 'Test Review',
        description: 'Review test coverage and quality',
        module: 'tea',
        path: 'tea/workflows/testarch/test-review/workflow.md',
        format: 'both',
        artifactTypes: ['test'],
        tags: ['testing', 'review']
    },
    {
        id: 'tea-framework',
        name: 'Test Framework',
        description: 'Set up testing framework',
        module: 'tea',
        path: 'tea/workflows/testarch/framework/workflow.md',
        format: 'both',
        tags: ['testing', 'framework', 'setup']
    },
    {
        id: 'tea-ci',
        name: 'CI Integration',
        description: 'Integrate tests with CI/CD',
        module: 'tea',
        path: 'tea/workflows/testarch/ci/workflow.md',
        format: 'both',
        tags: ['testing', 'ci', 'integration']
    },
    {
        id: 'tea-automate',
        name: 'Test Automation',
        description: 'Automate test execution',
        module: 'tea',
        path: 'tea/workflows/testarch/automate/workflow.md',
        format: 'both',
        tags: ['testing', 'automation']
    },
    {
        id: 'atdd',
        name: 'ATDD',
        description: 'Acceptance Test Driven Development',
        module: 'tea',
        path: 'tea/workflows/testarch/atdd/workflow.md',
        format: 'both',
        artifactTypes: ['story'],
        tags: ['testing', 'atdd', 'acceptance']
    },
    {
        id: 'trace',
        name: 'Traceability',
        description: 'Requirements to test traceability',
        module: 'tea',
        path: 'tea/workflows/testarch/trace/workflow.md',
        format: 'both',
        tags: ['testing', 'traceability']
    },
    {
        id: 'nfr-assess',
        name: 'NFR Assessment',
        description: 'Assess non-functional requirements',
        module: 'tea',
        path: 'tea/workflows/testarch/nfr-assess/workflow.md',
        format: 'both',
        artifactTypes: ['requirement', 'architecture'],
        tags: ['testing', 'nfr', 'assessment']
    },

    // ============================================
    // CIS MODULE - Innovation Strategy (4 workflows)
    // ============================================
    {
        id: 'design-thinking',
        name: 'Design Thinking',
        description: 'Apply design thinking methodology',
        module: 'cis',
        path: 'cis/workflows/design-thinking/workflow.yaml',
        format: 'yaml',
        tags: ['innovation', 'design-thinking']
    },
    {
        id: 'innovation-strategy',
        name: 'Innovation Strategy',
        description: 'Develop innovation strategy',
        module: 'cis',
        path: 'cis/workflows/innovation-strategy/workflow.yaml',
        format: 'yaml',
        tags: ['innovation', 'strategy']
    },
    {
        id: 'problem-solving',
        name: 'Problem Solving',
        description: 'Structured problem solving approach',
        module: 'cis',
        path: 'cis/workflows/problem-solving/workflow.yaml',
        format: 'yaml',
        tags: ['innovation', 'problem-solving']
    },
    {
        id: 'storytelling',
        name: 'Storytelling',
        description: 'Craft compelling narratives',
        module: 'cis',
        path: 'cis/workflows/storytelling/workflow.yaml',
        format: 'yaml',
        tags: ['innovation', 'storytelling', 'communication']
    },

    // ============================================
    // BMB MODULE - Agent Builder (3 workflows)
    // ============================================
    {
        id: 'create-agent',
        name: 'Create Agent',
        description: 'Create a new BMAD agent',
        module: 'bmb',
        category: 'agent',
        path: 'bmb/workflows/agent/workflow-create-agent.md',
        format: 'md',
        artifactTypes: ['agent'],
        tags: ['bmb', 'agent', 'create']
    },
    {
        id: 'edit-agent',
        name: 'Edit Agent',
        description: 'Edit and improve an existing agent',
        module: 'bmb',
        category: 'agent',
        path: 'bmb/workflows/agent/workflow-edit-agent.md',
        format: 'md',
        artifactTypes: ['agent'],
        tags: ['bmb', 'agent', 'edit']
    },
    {
        id: 'validate-agent',
        name: 'Validate Agent',
        description: 'Validate agent against BMAD standards',
        module: 'bmb',
        category: 'agent',
        path: 'bmb/workflows/agent/workflow-validate-agent.md',
        format: 'md',
        artifactTypes: ['agent'],
        tags: ['bmb', 'agent', 'validation']
    },

    // ============================================
    // BMB MODULE - Module Builder (4 workflows)
    // ============================================
    {
        id: 'create-module-brief',
        name: 'Create Module Brief',
        description: 'Create brief for a new BMAD module',
        module: 'bmb',
        category: 'module',
        path: 'bmb/workflows/module/workflow-create-module-brief.md',
        format: 'md',
        artifactTypes: ['module'],
        tags: ['bmb', 'module', 'brief']
    },
    {
        id: 'create-module',
        name: 'Create Module',
        description: 'Create a new BMAD module',
        module: 'bmb',
        category: 'module',
        path: 'bmb/workflows/module/workflow-create-module.md',
        format: 'md',
        artifactTypes: ['module'],
        tags: ['bmb', 'module', 'create']
    },
    {
        id: 'edit-module',
        name: 'Edit Module',
        description: 'Edit and improve an existing module',
        module: 'bmb',
        category: 'module',
        path: 'bmb/workflows/module/workflow-edit-module.md',
        format: 'md',
        artifactTypes: ['module'],
        tags: ['bmb', 'module', 'edit']
    },
    {
        id: 'validate-module',
        name: 'Validate Module',
        description: 'Validate module against BMAD standards',
        module: 'bmb',
        category: 'module',
        path: 'bmb/workflows/module/workflow-validate-module.md',
        format: 'md',
        artifactTypes: ['module'],
        tags: ['bmb', 'module', 'validation']
    },

    // ============================================
    // BMB MODULE - Workflow Builder (5 workflows)
    // ============================================
    {
        id: 'create-workflow',
        name: 'Create Workflow',
        description: 'Create a new BMAD workflow',
        module: 'bmb',
        category: 'workflow',
        path: 'bmb/workflows/workflow/workflow-create-workflow.md',
        format: 'md',
        artifactTypes: ['workflow'],
        tags: ['bmb', 'workflow', 'create']
    },
    {
        id: 'edit-workflow',
        name: 'Edit Workflow',
        description: 'Edit and improve an existing workflow',
        module: 'bmb',
        category: 'workflow',
        path: 'bmb/workflows/workflow/workflow-edit-workflow.md',
        format: 'md',
        artifactTypes: ['workflow'],
        tags: ['bmb', 'workflow', 'edit']
    },
    {
        id: 'validate-workflow',
        name: 'Validate Workflow',
        description: 'Validate workflow against BMAD standards',
        module: 'bmb',
        category: 'workflow',
        path: 'bmb/workflows/workflow/workflow-validate-workflow.md',
        format: 'md',
        artifactTypes: ['workflow'],
        tags: ['bmb', 'workflow', 'validation']
    },
    {
        id: 'validate-workflow-max',
        name: 'Validate Workflow (Max Parallel)',
        description: 'Thorough workflow validation with maximum parallelism',
        module: 'bmb',
        category: 'workflow',
        path: 'bmb/workflows/workflow/workflow-validate-max-parallel-workflow.md',
        format: 'md',
        artifactTypes: ['workflow'],
        tags: ['bmb', 'workflow', 'validation', 'thorough']
    },
    {
        id: 'rework-workflow',
        name: 'Rework Workflow',
        description: 'Comprehensive rework of an existing workflow',
        module: 'bmb',
        category: 'workflow',
        path: 'bmb/workflows/workflow/workflow-rework-workflow.md',
        format: 'md',
        artifactTypes: ['workflow'],
        tags: ['bmb', 'workflow', 'rework']
    }
];

/**
 * Parse YAML frontmatter from a markdown file
 */
export function parseFrontmatter(content: string): { frontmatter: any; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (match) {
        try {
            return {
                frontmatter: yaml.parse(match[1]),
                body: match[2].trim()
            };
        } catch (e) {
            acOutput.appendLine(`[WorkflowExecutor] Error parsing frontmatter: ${e}`);
        }
    }
    return { frontmatter: {}, body: content };
}

/**
 * Main Workflow Executor class
 */
export class WorkflowExecutor {
    private context: WorkflowContext;
    private state: WorkflowState;
    private stream: vscode.ChatResponseStream | null = null;
    private token: vscode.CancellationToken | null = null;
    
    /** Active workflow sessions (keyed by session ID) */
    private sessions: Map<string, WorkflowSession> = new Map();
    /** Current active session ID */
    private currentSessionId: string | null = null;

    constructor() {
        this.context = {
            projectRoot: '',
            bmadPath: '',
            configPath: '',
            config: {}
        };
        this.state = {
            currentStep: 0,
            stepsCompleted: [],
            variables: new Map(),
            outputContent: {},
            yoloMode: false
        };
    }

    // ============================================
    // SESSION MANAGEMENT
    // ============================================

    /**
     * Create a new workflow session for multi-step execution
     */
    createSession(
        workflowPath: string, 
        workflowName: string,
        artifactType: string,
        artifactId: string,
        artifact: any
    ): WorkflowSession {
        const sessionId = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Parse workflow path to determine initial step
        const session: WorkflowSession = {
            id: sessionId,
            workflowId: this.extractWorkflowId(workflowPath),
            workflowPath,
            workflowName,
            currentStepPath: workflowPath, // Start with workflow file itself
            currentStepNumber: 0, // 0 = workflow entry, 1+ = steps
            stepsCompleted: [],
            artifactType,
            artifactId,
            artifact,
            userInputs: [],
            startedAt: new Date(),
            lastActivityAt: new Date(),
            status: 'active'
        };

        this.sessions.set(sessionId, session);
        this.currentSessionId = sessionId;
        
        acOutput.appendLine(`[WorkflowExecutor] Created session ${sessionId} for workflow: ${workflowName}`);
        
        return session;
    }

    /**
     * Get the current active session
     */
    getCurrentSession(): WorkflowSession | null {
        if (!this.currentSessionId) return null;
        return this.sessions.get(this.currentSessionId) || null;
    }

    /**
     * Get a session by ID
     */
    getSession(sessionId: string): WorkflowSession | null {
        return this.sessions.get(sessionId) || null;
    }

    /**
     * Update the current session with user input and progress
     */
    updateSession(
        userInput: string,
        nextStepPath?: string,
        completed: boolean = false
    ): WorkflowSession | null {
        const session = this.getCurrentSession();
        if (!session) return null;

        session.lastActivityAt = new Date();
        
        if (userInput) {
            session.userInputs.push({
                step: session.currentStepPath,
                input: userInput
            });
        }

        if (completed) {
            session.stepsCompleted.push(session.currentStepPath);
        }

        if (nextStepPath) {
            session.currentStepPath = nextStepPath;
            session.currentStepNumber++;
            session.nextStepPath = undefined; // Will be parsed from next step
        }

        return session;
    }

    /**
     * Complete the current session
     */
    completeSession(): void {
        const session = this.getCurrentSession();
        if (session) {
            session.status = 'completed';
            session.lastActivityAt = new Date();
            acOutput.appendLine(`[WorkflowExecutor] Session ${session.id} completed`);
        }
        this.currentSessionId = null;
    }

    /**
     * Cancel the current session
     */
    cancelSession(): void {
        const session = this.getCurrentSession();
        if (session) {
            session.status = 'cancelled';
            session.lastActivityAt = new Date();
            acOutput.appendLine(`[WorkflowExecutor] Session ${session.id} cancelled`);
        }
        this.currentSessionId = null;
    }

    /**
     * Set a specific session as the current active session
     */
    setCurrentSession(sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        if (session && session.status === 'active') {
            this.currentSessionId = sessionId;
            return true;
        }
        return false;
    }

    /**
     * Extract workflow ID from path
     */
    private extractWorkflowId(workflowPath: string): string {
        // Extract ID from path like ".../create-epics-and-stories/workflow.md"
        const parts = workflowPath.replace(/\\/g, '/').split('/');
        const workflowIndex = parts.findIndex(p => p === 'workflow.md' || p === 'workflow.yaml');
        if (workflowIndex > 0) {
            return parts[workflowIndex - 1];
        }
        // For step files, get parent folder name
        const stepsIndex = parts.findIndex(p => p === 'steps');
        if (stepsIndex > 0) {
            return parts[stepsIndex - 1];
        }
        return parts[parts.length - 1].replace(/\.(md|yaml)$/, '');
    }

    /**
     * Parse step file to extract next step path from frontmatter
     */
    async parseStepNavigation(stepContent: string): Promise<{ nextStep?: string; thisStep?: string }> {
        const result: { nextStep?: string; thisStep?: string } = {};
        
        // Extract frontmatter
        const frontmatterMatch = stepContent.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) return result;

        const frontmatter = frontmatterMatch[1];
        
        // Parse nextStepFile
        const nextStepMatch = frontmatter.match(/nextStepFile:\s*['"]?([^'"\n]+)['"]?/);
        if (nextStepMatch) {
            result.nextStep = nextStepMatch[1].trim();
        }

        // Parse thisStepFile
        const thisStepMatch = frontmatter.match(/thisStepFile:\s*['"]?([^'"\n]+)['"]?/);
        if (thisStepMatch) {
            result.thisStep = thisStepMatch[1].trim();
        }

        return result;
    }

    /**
     * Detect if AI response indicates waiting for user input (menu selection)
     */
    detectUserPrompt(aiResponse: string): { waitingForInput: boolean; menuOptions?: string[]; continueOption?: boolean } {
        const result: { waitingForInput: boolean; menuOptions?: string[]; continueOption?: boolean } = {
            waitingForInput: false
        };

        // Detect menu patterns like "[C] Continue" or "C - Continue"
        const menuPatterns = [
            /\[([A-Z])\]\s*[-–—]?\s*([^\n]+)/g,      // [C] Continue
            /\(([A-Z])\)\s*[-–—]?\s*([^\n]+)/g,      // (C) Continue  
            /^([A-Z])\s*[-–—:]\s*([^\n]+)/gm,        // C - Continue
            /\*\*\[([A-Z0-9]+)\]\*\*\s*([^\n]+)/g,   // **[C]** Continue
        ];

        const options: string[] = [];
        for (const pattern of menuPatterns) {
            let match;
            while ((match = pattern.exec(aiResponse)) !== null) {
                options.push(`[${match[1]}] ${match[2].trim()}`);
                if (match[1].toUpperCase() === 'C' && match[2].toLowerCase().includes('continue')) {
                    result.continueOption = true;
                }
            }
        }

        if (options.length > 0) {
            result.waitingForInput = true;
            result.menuOptions = [...new Set(options)]; // Dedupe
        }

        // Also detect explicit prompts for user input
        const inputPrompts = [
            /please\s+(select|choose|enter|provide|input)/i,
            /waiting\s+for\s+(your\s+)?(input|selection|response)/i,
            /what\s+would\s+you\s+like\s+to/i,
            /select\s+an?\s+option/i,
            /enter\s+your\s+(choice|selection)/i,
        ];

        for (const pattern of inputPrompts) {
            if (pattern.test(aiResponse)) {
                result.waitingForInput = true;
                break;
            }
        }

        return result;
    }

    /**
     * Build prompt for continuing a workflow session with the next step
     */
    async buildContinuePrompt(userInput: string): Promise<string | null> {
        const session = this.getCurrentSession();
        if (!session) {
            return null;
        }

        // If continuing to next step
        if (userInput.toUpperCase() === 'C' || userInput.toLowerCase() === 'continue') {
            if (!session.nextStepPath) {
                return null; // No next step defined
            }

            // Resolve the next step path relative to current step
            const nextStepFullPath = this.resolveStepPath(session.currentStepPath, session.nextStepPath);
            
            // Load the next step content
            const stepContent = await this.loadStepContent(nextStepFullPath);
            if (!stepContent) {
                return `Error: Could not load next step file: ${nextStepFullPath}`;
            }

            // Update session
            this.updateSession(userInput, nextStepFullPath, true);

            // Parse navigation for future reference
            const nav = await this.parseStepNavigation(stepContent);
            if (nav.nextStep) {
                session.nextStepPath = nav.nextStep;
            }

            return this.buildStepPrompt(stepContent, session);
        }

        // Otherwise, user is providing input to current step
        this.updateSession(userInput);

        return `User input for current workflow step:\n\n${userInput}\n\nContinue executing the current step with this input.`;
    }

    /**
     * Build a prompt from step content with session context
     */
    private buildStepPrompt(stepContent: string, session: WorkflowSession): string {
        const vars = this.state.variables;
        
        return `You are continuing a BMAD methodology workflow.

## Workflow: ${session.workflowName}
**Session ID:** ${session.id}
**Step:** ${session.currentStepNumber}

## Configuration
- Project: ${vars.get('project_name') || 'Unknown'}
- User: ${vars.get('user_name') || 'User'}
- Language: ${vars.get('communication_language') || 'English'}

## Current Artifact
Type: ${session.artifactType}
ID: ${session.artifactId}
${JSON.stringify(session.artifact, null, 2)}

## Previous User Inputs in This Session
${session.userInputs.map(i => `- Step ${i.step}: ${i.input}`).join('\n') || 'None yet'}

## Step Instructions

${stepContent}

## Important
1. Follow the step instructions completely
2. Present any menus exactly as shown in the step file
3. Wait for user input when a menu is presented
4. When user selects [C] Continue, indicate you are ready for the next step
5. Output refinements in JSON format when generating changes
`;
    }

    /**
     * Resolve a relative step path to full path
     */
    private resolveStepPath(currentPath: string, relativePath: string): string {
        // Handle relative paths like './step-02-design-epics.md'
        if (relativePath.startsWith('./')) {
            const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/'));
            return `${currentDir}/${relativePath.substring(2)}`;
        }
        // Handle absolute paths with {project-root} or {workflow_path} variables
        return this.resolveVariable(relativePath);
    }

    /**
     * Load step content from file
     */
    private async loadStepContent(stepPath: string): Promise<string | null> {
        try {
            const uri = vscode.Uri.file(stepPath);
            const content = await vscode.workspace.fs.readFile(uri);
            return Buffer.from(content).toString('utf-8');
        } catch (e) {
            acOutput.appendLine(`[WorkflowExecutor] Error loading step: ${stepPath} - ${e}`);
            return null;
        }
    }

    /**
     * Initialize the executor with workspace context.
     *
     * The bundled `resources/_bmad` inside the extension is the **single source
     * of truth** for schemas, agents, workflows, and configs.  The `extensionPath`
     * parameter is required for the executor to locate these bundled resources.
     * Workspace-level `_bmad` / `_bmad_new` folders are never probed.
     *
     * @param projectRoot Optional project root path (from artifact store).
     * @param extensionPath Extension installation path (for bundled resources).
     */
    async initialize(projectRoot?: string, extensionPath?: string): Promise<boolean> {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        // Resolve projectRoot — prefer parameter, then resolver, then workspaceFolders[0]
        if (projectRoot) {
            this.context.projectRoot = projectRoot;
            acOutput.appendLine(`[WorkflowExecutor] Using provided project root: ${projectRoot}`);
        } else {
            // Try the resolver first for multi-root awareness
            let resolved = false;
            try {
                const { getWorkspaceResolver } = require('../extension');
                const resolver = getWorkspaceResolver();
                const wsFolder = resolver?.getActiveWorkspaceFolder();
                if (wsFolder) {
                    this.context.projectRoot = wsFolder.uri.fsPath;
                    acOutput.appendLine(`[WorkflowExecutor] Using resolver workspace root: ${this.context.projectRoot}`);
                    resolved = true;
                }
            } catch {
                // Extension not available (unit tests) — fall through
            }
            if (!resolved && workspaceFolders) {
                this.context.projectRoot = workspaceFolders[0].uri.fsPath;
                acOutput.appendLine(`[WorkflowExecutor] Fallback to workspace root: ${this.context.projectRoot}`);
            }
        }

        // ── Primary path: always use the bundled _bmad from the extension ──
        if (extensionPath) {
            const bundled = path.join(extensionPath, 'resources', '_bmad');
            const bundledUri = vscode.Uri.file(bundled);
            acOutput.appendLine(`[WorkflowExecutor] Probing bundled: ${bundled}`);
            try {
                await vscode.workspace.fs.stat(bundledUri);
                this.context.bmadPath = bundled;
                acOutput.appendLine(`[WorkflowExecutor] Using bundled BMAD: ${bundled}`);
                await this._loadConfig();
                this.initializeVariables();
                return true;
            } catch {
                acOutput.appendLine(`[WorkflowExecutor] Bundled resources not found at: ${bundled}`);
            }
        }

        acOutput.appendLine('[WorkflowExecutor] No bundled BMAD resources found — ensure the extension is installed correctly');
        return false;
    }

    /** Load config.yaml from the resolved bmadPath */
    private async _loadConfig(): Promise<void> {
        const configPath = vscode.Uri.file(path.join(this.context.bmadPath, 'bmm', 'config.yaml'));
        try {
            const configContent = await vscode.workspace.fs.readFile(configPath);
            this.context.config = yaml.parse(configContent.toString());
            this.context.configPath = configPath.fsPath;
            acOutput.appendLine(`[WorkflowExecutor] Loaded config: ${configPath.fsPath}`);
        } catch (e) {
            acOutput.appendLine(`[WorkflowExecutor] config.yaml not found, using defaults: ${e}`);
        }
    }

    /**
     * Initialize variables from config and system
     */
    private initializeVariables(): void {
        const vars = this.state.variables;
        
        // System variables
        vars.set('project-root', this.context.projectRoot);
        vars.set('bmad-path', this.context.bmadPath);
        vars.set('installed_path', this.context.bmadPath);
        vars.set('date', new Date().toISOString());
        
        // Config variables
        if (this.context.config) {
            const config = this.context.config;
            vars.set('project_name', config.project_name || 'Unknown Project');
            vars.set('user_name', config.user_name || 'User');
            vars.set('communication_language', config.communication_language || 'English');
            vars.set('document_output_language', config.document_output_language || 'English');
            // Ensure output paths are always absolute. Config values may be bare relative names
            // (e.g. ".agentcanvas-context") or contain {project-root} prefixes. Either way, resolve to absolute.
            const rawOutput = config.output_folder || '{project-root}/.agentcanvas-context';
            const rawPlanning = config.planning_artifacts || '{project-root}/.agentcanvas-context/planning-artifacts';
            const rawImpl = config.implementation_artifacts || '{project-root}/.agentcanvas-context/implementation-artifacts';
            
            const resolveToAbsolute = (val: string): string => {
                const resolved = this.resolveVariable(val);
                // If still relative after variable resolution, prepend project root
                if (!path.isAbsolute(resolved)) {
                    return path.join(this.context.projectRoot, resolved);
                }
                return resolved;
            };
            
            vars.set('output_folder', resolveToAbsolute(rawOutput));
            vars.set('planning_artifacts', resolveToAbsolute(rawPlanning));
            vars.set('implementation_artifacts', resolveToAbsolute(rawImpl));
        }
        
        acOutput.appendLine(`[WorkflowExecutor] Variables initialized: ${vars.size} variables`);
    }

    /**
     * Resolve variable references like {project-root} in a string
     */
    resolveVariable(input: string): string {
        let result = input;
        
        // Replace {variable} patterns
        const pattern = /\{([^}]+)\}/g;
        let match;
        while ((match = pattern.exec(input)) !== null) {
            const varName = match[1];
            const value = this.state.variables.get(varName);
            if (value) {
                result = result.replace(match[0], value);
            }
        }
        
        return result;
    }

    /**
     * Load a workflow file and parse its configuration
     */
    async loadWorkflow(workflowPath: string): Promise<WorkflowConfig | null> {
        try {
            const resolvedPath = this.resolveVariable(workflowPath);
            const uri = vscode.Uri.file(resolvedPath);
            const content = await vscode.workspace.fs.readFile(uri);
            const contentStr = content.toString();
            
            // Check if it's YAML or MD
            if (resolvedPath.endsWith('.yaml') || resolvedPath.endsWith('.yml')) {
                const parsed = yaml.parse(contentStr);
                acOutput.appendLine(`[WorkflowExecutor] Loaded YAML workflow: ${parsed.name || resolvedPath}`);
                return {
                    ...parsed,
                    _path: resolvedPath
                };
            } else {
                const { frontmatter, body } = parseFrontmatter(contentStr);
                acOutput.appendLine(`[WorkflowExecutor] Loaded MD workflow: ${frontmatter.name || resolvedPath}`);
                return {
                    ...frontmatter,
                    _body: body,
                    _path: resolvedPath
                };
            }
        } catch (e) {
            acOutput.appendLine(`[WorkflowExecutor] Error loading workflow: ${e}`);
            return null;
        }
    }

    /**
     * Load a step file
     */
    async loadStep(stepPath: string): Promise<{ frontmatter: any; body: string } | null> {
        try {
            const resolvedPath = this.resolveVariable(stepPath);
            const uri = vscode.Uri.file(resolvedPath);
            const content = await vscode.workspace.fs.readFile(uri);
            const parsed = parseFrontmatter(content.toString());
            
            acOutput.appendLine(`[WorkflowExecutor] Loaded step: ${parsed.frontmatter.name || resolvedPath}`);
            return parsed;
        } catch (e) {
            acOutput.appendLine(`[WorkflowExecutor] Error loading step: ${e}`);
            return null;
        }
    }

    /**
     * Get all workflows from registry
     */
    getAllWorkflows(): WorkflowDefinition[] {
        return WORKFLOW_REGISTRY;
    }

    /**
     * Get workflows by module
     */
    getWorkflowsByModule(module: 'core' | 'bmm' | 'bmb' | 'tea' | 'cis'): WorkflowDefinition[] {
        return WORKFLOW_REGISTRY.filter(w => w.module === module);
    }

    /**
     * Get workflows by tag
     */
    getWorkflowsByTag(tag: string): WorkflowDefinition[] {
        return WORKFLOW_REGISTRY.filter(w => w.tags?.includes(tag));
    }

    /**
     * Get workflows applicable to an artifact type
     */
    getWorkflowsForArtifact(artifactType: string): WorkflowDefinition[] {
        return WORKFLOW_REGISTRY.filter(w => w.artifactTypes?.includes(artifactType));
    }

    /**
     * Get available refinement workflows based on artifact type
     * Returns a CURATED list of the most relevant workflows for refinement
     * (not all workflows that could theoretically apply)
     */
    getAvailableWorkflows(artifactType: string): { path: string; name: string; description: string }[] {
        const bmadPath = this.context.bmadPath;
        
        // Return curated refinement workflows based on artifact type
        switch (artifactType) {
            case 'vision':
            case 'prd':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/2-plan-workflows/create-prd/workflow-validate-prd.md`,
                        name: 'Validate PRD',
                        description: 'Validate against BMAD standards'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/2-plan-workflows/create-prd/workflow-edit-prd.md`,
                        name: 'Edit PRD',
                        description: 'Edit and improve PRD'
                    }
                ];

            case 'requirement':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/2-plan-workflows/create-prd/workflow-validate-prd.md`,
                        name: 'Validate Requirement',
                        description: 'Validate quality and completeness of this requirement'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/2-plan-workflows/create-prd/workflow-edit-prd.md`,
                        name: 'Refine Requirement',
                        description: 'Improve clarity, detail and measurability'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/check-implementation-readiness/workflow.md`,
                        name: 'Check Implementation Readiness',
                        description: 'Validate how this requirement maps to epics and stories'
                    }
                ];
            
            case 'epic':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/create-epics-and-stories/steps/step-02a-epic-enhancement.md`,
                        name: 'Epic Enhancement',
                        description: 'Add use cases, risks, DoD, metrics'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/check-implementation-readiness/workflow.md`,
                        name: 'Check Implementation Readiness',
                        description: 'Verify epic is ready for development'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/supporting/create-use-cases/workflow.yaml`,
                        name: 'Create Use Cases',
                        description: 'Define detailed use cases for this epic'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/supporting/create-risks/workflow.yaml`,
                        name: 'Create Risks',
                        description: 'Identify and document risks'
                    }
                ];
            
            case 'story':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/create-epics-and-stories/steps/step-03a-story-enhancement.md`,
                        name: 'Story Enhancement',
                        description: 'Add technical details, tests, edge cases, dependencies, risks, DoD'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/4-implementation/create-story/checklist.md`,
                        name: 'Story Quality Review',
                        description: 'Validate story context for dev agent'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/4-implementation/dev-story/checklist.md`,
                        name: 'Dev Story Checklist',
                        description: 'Verify story is implementation-ready'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-design/workflow.md`,
                        name: 'Test Design',
                        description: 'Design test strategy and cases for this story'
                    }
                ];
            
            case 'architecture':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/create-architecture/workflow.md`,
                        name: 'Refine Architecture',
                        description: 'Review and improve architecture design'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/nfr-assess/workflow.md`,
                        name: 'NFR Assessment',
                        description: 'Assess non-functional requirements'
                    }
                ];

            case 'product-brief':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/1-analysis/create-product-brief/workflow.md`,
                        name: 'Refine Product Brief',
                        description: 'Improve product brief clarity and completeness'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/1-analysis/create-product-brief/workflow.md`,
                        name: 'Validate Product Brief',
                        description: 'Validate against BMAD standards'
                    }
                ];

            case 'use-case':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/supporting/create-use-cases/instructions.md`,
                        name: 'Refine Use Case',
                        description: 'Improve use case detail, actors, and flow'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/create-epics-and-stories/steps/step-02a-epic-enhancement.md`,
                        name: 'Enhance Parent Epic',
                        description: 'Enhance the parent epic this use case belongs to'
                    }
                ];

            case 'test-case':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-design/workflow.md`,
                        name: 'Test Design',
                        description: 'Design or refine test steps and expected results'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-review/workflow.md`,
                        name: 'Test Review',
                        description: 'Review test case quality and completeness'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/atdd/workflow.md`,
                        name: 'Generate BDD Steps',
                        description: 'Generate Gherkin Given/When/Then steps'
                    }
                ];

            case 'test-strategy':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-design/workflow.md`,
                        name: 'Test Design',
                        description: 'Develop overall test strategy and coverage plan'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-review/workflow.md`,
                        name: 'Test Review',
                        description: 'Review and validate test strategy'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/nfr-assess/workflow.md`,
                        name: 'NFR Assessment',
                        description: 'Assess non-functional testing requirements'
                    }
                ];

            case 'test-design':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-design/workflow.md`,
                        name: 'Test Design',
                        description: 'Refine or extend test design coverage plan'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-review/workflow.md`,
                        name: 'Test Review',
                        description: 'Review test design quality and completeness'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/atdd/workflow.md`,
                        name: 'Generate BDD Steps',
                        description: 'Generate Gherkin Given/When/Then steps'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/trace/workflow.md`,
                        name: 'Traceability Matrix',
                        description: 'Generate traceability between tests and requirements'
                    }
                ];

            case 'risk':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/supporting/create-risks/workflow.yaml`,
                        name: 'Refine Risk',
                        description: 'Improve risk detail, mitigation, and assessment'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/check-implementation-readiness/workflow.md`,
                        name: 'Check Implementation Readiness',
                        description: 'Validate risk mitigation readiness'
                    }
                ];

            case 'nfr':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/nfr-assess/workflow.md`,
                        name: 'NFR Assessment',
                        description: 'Deep-dive assessment of non-functional requirements'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/2-plan-workflows/create-prd/workflow-edit-prd.md`,
                        name: 'Refine Requirement',
                        description: 'Improve NFR clarity and measurability'
                    }
                ];

            case 'additional-req':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/2-plan-workflows/create-prd/workflow-validate-prd.md`,
                        name: 'Validate Requirement',
                        description: 'Validate quality and completeness'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/2-plan-workflows/create-prd/workflow-edit-prd.md`,
                        name: 'Refine Requirement',
                        description: 'Improve clarity, detail and measurability'
                    }
                ];

            case 'architecture-decision':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/create-architecture/workflow.md`,
                        name: 'Refine Architecture',
                        description: 'Review and improve this architecture decision'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/nfr-assess/workflow.md`,
                        name: 'NFR Assessment',
                        description: 'Assess non-functional impact of this decision'
                    }
                ];

            case 'system-component':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/create-architecture/workflow.md`,
                        name: 'Refine Architecture',
                        description: 'Review and improve component design'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/nfr-assess/workflow.md`,
                        name: 'NFR Assessment',
                        description: 'Assess non-functional requirements for this component'
                    }
                ];

            case 'task':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/create-epics-and-stories/steps/step-03a-story-enhancement.md`,
                        name: 'Story Enhancement',
                        description: 'Add technical details, edge cases, dependencies'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/4-implementation/dev-story/checklist.md`,
                        name: 'Dev Story Checklist',
                        description: 'Verify task is implementation-ready'
                    }
                ];

            // ── TC Redesign: consolidated test-coverage card ──
            case 'test-coverage':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-design/workflow.md`,
                        name: 'Test Design',
                        description: 'Refine or extend test coverage plan'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-review/workflow.md`,
                        name: 'Test Review',
                        description: 'Review test coverage quality and completeness'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/atdd/workflow.md`,
                        name: 'Generate BDD Steps',
                        description: 'Generate Gherkin Given/When/Then steps'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/trace/workflow.md`,
                        name: 'Traceability Matrix',
                        description: 'Generate traceability between tests and requirements'
                    }
                ];

            // ── Plural aliases ──
            case 'test-cases':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-design/workflow.md`,
                        name: 'Test Design',
                        description: 'Design or refine test steps and expected results'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-review/workflow.md`,
                        name: 'Test Review',
                        description: 'Review test case quality and completeness'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/atdd/workflow.md`,
                        name: 'Generate BDD Steps',
                        description: 'Generate Gherkin Given/When/Then steps'
                    }
                ];

            case 'risks':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/supporting/create-risks/workflow.yaml`,
                        name: 'Refine Risk',
                        description: 'Improve risk detail, mitigation, and assessment'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/check-implementation-readiness/workflow.md`,
                        name: 'Check Implementation Readiness',
                        description: 'Validate risk mitigation readiness'
                    }
                ];

            // ── TEA output artifacts ──
            case 'test-design-qa':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-design/workflow.md`,
                        name: 'Test Design',
                        description: 'Refine QA-focused test design'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-review/workflow.md`,
                        name: 'Test Review',
                        description: 'Review QA test design quality'
                    }
                ];

            case 'test-design-architecture':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-design/workflow.md`,
                        name: 'Test Design',
                        description: 'Refine architecture testability assessment'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/create-architecture/workflow.md`,
                        name: 'Refine Architecture',
                        description: 'Review architecture from testability perspective'
                    }
                ];

            case 'test-review':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-design/workflow.md`,
                        name: 'Test Design',
                        description: 'Iterate on test design based on review findings'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/trace/workflow.md`,
                        name: 'Traceability Matrix',
                        description: 'Generate traceability between tests and requirements'
                    }
                ];

            case 'traceability-matrix':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/trace/workflow.md`,
                        name: 'Traceability Matrix',
                        description: 'Update and extend requirement-test traceability'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-review/workflow.md`,
                        name: 'Test Review',
                        description: 'Review traceability coverage gaps'
                    }
                ];

            case 'nfr-assessment':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/nfr-assess/workflow.md`,
                        name: 'NFR Assessment',
                        description: 'Deep-dive reassessment of non-functional requirements'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/create-architecture/workflow.md`,
                        name: 'Refine Architecture',
                        description: 'Improve architecture based on NFR findings'
                    }
                ];

            case 'test-framework':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/framework/workflow.md`,
                        name: 'Test Framework',
                        description: 'Refine test framework setup and configuration'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-design/workflow.md`,
                        name: 'Test Design',
                        description: 'Design tests using the framework'
                    }
                ];

            case 'ci-pipeline':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/ci/workflow.md`,
                        name: 'CI Pipeline',
                        description: 'Refine CI/CD pipeline configuration'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/automate/workflow.md`,
                        name: 'Test Automation',
                        description: 'Automate tests in the CI pipeline'
                    }
                ];

            case 'automation-summary':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/automate/workflow.md`,
                        name: 'Test Automation',
                        description: 'Extend or refine test automation coverage'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/ci/workflow.md`,
                        name: 'CI Pipeline',
                        description: 'Integrate automation into CI pipeline'
                    }
                ];

            case 'atdd-checklist':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/atdd/workflow.md`,
                        name: 'Generate BDD Steps',
                        description: 'Refine ATDD/BDD acceptance criteria'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-design/workflow.md`,
                        name: 'Test Design',
                        description: 'Design tests from acceptance criteria'
                    }
                ];

            // ── BMM primary artifacts ──
            case 'research':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/1-analysis/research/workflow-domain-research.md`,
                        name: 'Domain Research',
                        description: 'Research domain-specific knowledge and best practices'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/1-analysis/research/workflow-market-research.md`,
                        name: 'Market Research',
                        description: 'Analyze market landscape and competitive positioning'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/1-analysis/research/workflow-technical-research.md`,
                        name: 'Technical Research',
                        description: 'Research technical feasibility and implementation options'
                    }
                ];

            case 'ux-design':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/2-plan-workflows/create-ux-design/workflow.md`,
                        name: 'Refine UX Design',
                        description: 'Improve UX design, flows, and interaction patterns'
                    }
                ];

            case 'tech-spec':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/create-architecture/workflow.md`,
                        name: 'Refine Architecture',
                        description: 'Review and improve technical specification'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/nfr-assess/workflow.md`,
                        name: 'NFR Assessment',
                        description: 'Assess non-functional requirements for the spec'
                    }
                ];

            case 'definition-of-done':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/supporting/create-definition-of-done/workflow.yaml`,
                        name: 'Definition of Done',
                        description: 'Refine and validate definition of done criteria'
                    }
                ];

            // ── BMM output artifacts ──
            case 'readiness-report':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/check-implementation-readiness/workflow.md`,
                        name: 'Check Implementation Readiness',
                        description: 'Re-evaluate implementation readiness'
                    }
                ];

            case 'sprint-status':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/4-implementation/sprint-status/workflow.yaml`,
                        name: 'Sprint Status',
                        description: 'Update and refine sprint status report'
                    }
                ];

            case 'retrospective':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/4-implementation/retrospective/workflow.yaml`,
                        name: 'Retrospective',
                        description: 'Facilitate or refine sprint retrospective'
                    }
                ];

            case 'change-proposal':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/4-implementation/correct-course/workflow.yaml`,
                        name: 'Course Correction',
                        description: 'Refine change proposal and impact analysis'
                    }
                ];

            case 'code-review':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/4-implementation/code-review/workflow.yaml`,
                        name: 'Code Review',
                        description: 'Review code changes for quality and standards'
                    }
                ];

            case 'test-summary':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-review/workflow.md`,
                        name: 'Test Review',
                        description: 'Review test summary completeness'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-design/workflow.md`,
                        name: 'Test Design',
                        description: 'Design additional tests based on summary gaps'
                    }
                ];

            case 'project-overview':
            case 'project-context':
                return [
                    {
                        path: `${bmadPath}/core/workflows/brainstorming/workflow.md`,
                        name: 'Brainstorming',
                        description: 'Explore and refine project context'
                    }
                ];

            // ── CIS module artifacts ──
            case 'storytelling':
                return [
                    {
                        path: `${bmadPath}/cis/workflows/storytelling/workflow.yaml`,
                        name: 'Storytelling',
                        description: 'Refine narrative structure and storytelling approach'
                    }
                ];

            case 'problem-solving':
                return [
                    {
                        path: `${bmadPath}/cis/workflows/problem-solving/workflow.yaml`,
                        name: 'Problem Solving',
                        description: 'Apply structured problem-solving methodology'
                    }
                ];

            case 'innovation-strategy':
                return [
                    {
                        path: `${bmadPath}/cis/workflows/innovation-strategy/workflow.yaml`,
                        name: 'Innovation Strategy',
                        description: 'Refine innovation strategy and opportunity analysis'
                    }
                ];

            case 'design-thinking':
                return [
                    {
                        path: `${bmadPath}/cis/workflows/design-thinking/workflow.yaml`,
                        name: 'Design Thinking',
                        description: 'Iterate on design thinking process and outputs'
                    }
                ];

            default:
                // For unknown types, return general-purpose workflows
                return [
                    {
                        path: `${bmadPath}/core/workflows/brainstorming/workflow.md`,
                        name: 'Brainstorming',
                        description: 'Creative ideation and exploration'
                    }
                ];
        }
    }

    /**
     * Get development-specific workflows for an artifact type.
     * These are implementation-phase workflows (dev, checklist, code review, test design).
     */
    getDevWorkflows(artifactType: string): { path: string; name: string; description: string }[] {
        const bmadPath = this.context.bmadPath;

        switch (artifactType) {
            case 'story':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/4-implementation/dev-story/workflow.yaml`,
                        name: 'Dev Story',
                        description: 'Execute story development with AI guidance'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/4-implementation/dev-story/checklist.md`,
                        name: 'Dev Story Checklist',
                        description: 'Verify story is implementation-ready'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/4-implementation/code-review/workflow.yaml`,
                        name: 'Code Review',
                        description: 'Review code changes for quality'
                    }
                ];

            case 'epic':
                return [
                    {
                        path: `${bmadPath}/bmm/workflows/3-solutioning/check-implementation-readiness/workflow.md`,
                        name: 'Check Implementation Readiness',
                        description: 'Verify epic is ready for development'
                    },
                    {
                        path: `${bmadPath}/bmm/workflows/4-implementation/sprint-planning/workflow.yaml`,
                        name: 'Sprint Planning',
                        description: 'Plan sprint with story selection and capacity'
                    }
                ];

            case 'test-case':
                return [
                    {
                        path: `${bmadPath}/tea/workflows/testarch/test-design/workflow.md`,
                        name: 'Test Design',
                        description: 'Design or refine test steps and expected results'
                    },
                    {
                        path: `${bmadPath}/tea/workflows/testarch/atdd/workflow.md`,
                        name: 'Generate BDD Steps',
                        description: 'Generate Gherkin Given/When/Then steps'
                    }
                ];

            default:
                return [];
        }
    }

    /**
     * Get all available workflows organized by category for display
     */
    getAllAvailableWorkflowsMenu(): string {
        const bmadPath = this.context.bmadPath;
        let menu = '## All BMAD Workflows\n\n';

        // Group by module
        const modules = ['core', 'bmm', 'bmb', 'tea', 'cis'] as const;
        
        for (const module of modules) {
            const workflows = this.getWorkflowsByModule(module);
            if (workflows.length === 0) continue;

            menu += `### ${module.toUpperCase()} Module (${workflows.length} workflows)\n\n`;
            
            // Group by phase/category within module
            const byPhase = new Map<string, WorkflowDefinition[]>();
            for (const w of workflows) {
                const key = w.phase || w.category || 'general';
                if (!byPhase.has(key)) byPhase.set(key, []);
                byPhase.get(key)!.push(w);
            }

            for (const [phase, phaseWorkflows] of byPhase) {
                if (phase !== 'general') {
                    menu += `**${phase}:**\n`;
                }
                for (const w of phaseWorkflows) {
                    menu += `- **${w.name}** - ${w.description}\n`;
                }
                menu += '\n';
            }
        }

        return menu;
    }

    /**
     * Build a prompt that instructs Copilot to follow a BMAD workflow
     */
    async buildWorkflowPrompt(workflowPath: string, artifactContext: any): Promise<string> {
        const workflow = await this.loadWorkflow(workflowPath);
        if (!workflow) {
            return 'Error: Could not load workflow file.';
        }

        // Load the step file if referenced
        let stepContent = '';
        if (workflow.editWorkflow) {
            const step = await this.loadStep(this.resolveVariable(workflow.editWorkflow));
            if (step) {
                stepContent = step.body;
            }
        } else if (workflow.validateWorkflow) {
            const step = await this.loadStep(this.resolveVariable(workflow.validateWorkflow));
            if (step) {
                stepContent = step.body;
            }
        } else if (workflow._body) {
            stepContent = workflow._body;
        }

        // Build the prompt
        const vars = this.state.variables;

        // Load JSON schema for this artifact type and append to prompt so LLM output conforms.
        // Uses the shared schemaValidator (same as executeWithTools / executeWithDirectApi)
        // so that $ref references are resolved inline and the LLM sees a self-contained schema.
        const artifactType: string = artifactContext?.type || '';
        const bmadPath = this.context.bmadPath;
        if (bmadPath && !schemaValidator.isInitialized()) {
            try {
                schemaValidator.init(bmadPath, acOutput);
            } catch (err: any) {
                acOutput.appendLine(
                    `[buildWorkflowPrompt] Schema validator init failed: ${err?.message ?? err}`
                );
            }
        }

        const schemaContent = artifactType
            ? schemaValidator.getSchemaContent(artifactType)
            : undefined;
        const schemaSection = schemaContent
            ? `\n## JSON Schema Constraint\nYour output MUST conform to this BMAD JSON schema:\n\`\`\`json\n${schemaContent}\n\`\`\`\n`
            : '';

        const prompt = `You are executing a BMAD methodology workflow.

## Workflow: ${workflow.name}
**Description:** ${workflow.description}

## Configuration
- Project: ${vars.get('project_name')}
- User: ${vars.get('user_name')}
- Language: ${vars.get('communication_language')}

## Current Artifact
${JSON.stringify(artifactContext, null, 2)}

## Workflow Instructions

${stepContent}
${schemaSection}
## Important
1. Follow the workflow instructions step by step
2. Ask clarifying questions when needed
3. Provide your output in JSON format when generating refinements, conforming to the schema above if provided
4. After completing refinements, the user can use \`@agentcanvas /apply\` to save changes

## CRITICAL — BMAD Grounding Rule
- BMAD installation path: \`${this.context.bmadPath || 'unknown'}\`
- Never invent workflow steps, agent personas, or schema fields — only reference actual artefacts that exist under the BMAD installation path above
- When suggesting follow-on workflows, cite the exact file path from \`${this.context.bmadPath || 'unknown'}/bmm/workflows/\`
- All JSON output **must** conform to the schemas found in \`${this.context.bmadPath || 'unknown'}/schemas/\` — do not add or remove fields arbitrarily

Begin executing the workflow now.`;

        return prompt;
    }

    /**
     * Execute a workflow in chat context
     */
    async executeInChat(
        workflowPath: string,
        artifactContext: any,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<void> {
        this.stream = stream;
        this.token = token;

        // Initialize if not already done
        if (!this.context.projectRoot) {
            const initialized = await this.initialize();
            if (!initialized) {
                stream.markdown('Error: Could not initialize BMAD workflow executor. No workspace or _bmad folder found.\n');
                return;
            }
        }

        const prompt = await this.buildWorkflowPrompt(workflowPath, artifactContext);
        
        // Show workflow info
        stream.markdown(`## BMAD Workflow Execution\n\n`);
        stream.markdown(`Loading workflow from: \`${workflowPath}\`\n\n`);
        
        // The prompt will be sent to the language model by the caller
        stream.markdown('---\n\n');
        stream.markdown(prompt);
    }

    /**
     * Execute a BMAD task using the native tool-calling loop.
     *
     * The LLM receives:
     *   - A system prompt grounding it in the _bmad folder with full variable mappings
     *     and pre-injected config values (user_name, language, output_folder)
     *   - The specific workflow file path to start from (no master-agent detour)
     *   - The current artifact as context
     *   - The user's task instruction
     *   - Three tools: agentcanvas_read_file, agentcanvas_list_directory, agentcanvas_update_artifact
     *
     * The loop continues until the LLM stops calling tools (i.e. it is done).
     * Text chunks are streamed to the chat response as they arrive.
     *
     * @param model         The resolved vscode.LanguageModelChat instance
     * @param task          The user's instruction (e.g. "enhance this epic")
     * @param artifact      The artifact object to work on (or null for creation tasks)
     * @param stream        The chat response stream to write to
     * @param token         Cancellation token
     * @param store         The ArtifactStore — passed to agentcanvas_update_artifact via tool context
     * @param workflowPath  Optional absolute path to the specific workflow file to start from.
     *                      When omitted the LLM must discover the correct workflow itself.
     */
    async executeWithTools(
        model: BmadModel,
        task: string,
        artifact: any,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
        store: any,
        workflowPath?: string
    ): Promise<void> {
        // ── For direct-API / Antigravity providers: use a simple single-shot prompt
        // instead of the VS Code LM agentic tool-calling loop (which requires vscode.LanguageModelChat).
        if (!model.vscodeLm) {
            await this.executeWithDirectApi(model, task, artifact, stream, token, workflowPath);
            return;
        }

        // ── VS Code LM agentic loop (Copilot / Continue / any vscode.lm provider) ──
        const bmadPath = this.context.bmadPath;
        const projectRoot = this.context.projectRoot;

        // Resolve the output folder: use config value if available, else workspace/.agentcanvas-context
        // Config may contain an absolute path with {project-root}, or a bare relative name like ".agentcanvas-context".
        // In either case we must produce an absolute path for the LLM.
        const configOutputFolder: string = this.context.config?.output_folder ?? '';
        const outputFolder = configOutputFolder
            ? (configOutputFolder.includes('{project-root}')
                ? configOutputFolder.replace('{project-root}', projectRoot)
                : path.join(projectRoot, configOutputFolder))
            : path.join(projectRoot, '.agentcanvas-context');

        // ── Variable substitution table ──────────────────────────────────────
        // Any {project-root} references in workflow files must be resolved to the
        // actual project root.  The bundled BMAD resources live at bmadPath, which
        // is inside the extension's resources/ folder (NOT in the workspace).
        // {bmad-path} is the canonical variable for referencing the BMAD resources.
        const varTable = `| Template variable | Resolved path |
|---|---|
| \`{project-root}\` | \`${projectRoot}\` |
| \`{bmad-path}\` | \`${bmadPath}\` |
| \`{output-folder}\` | \`${outputFolder}\` |`;

        // ── Load workflow config for output_format awareness ─────────────────
        // The VS Code setting `bmad.outputFormat` takes precedence over the
        // workflow file's frontmatter `output_format` — the user's explicit
        // toolbar selection is the canonical source of truth.
        const userOutputFormat = vscode.workspace.getConfiguration('agentcanvas')
            .get<'json' | 'markdown' | 'dual'>('outputFormat', 'dual');
        let workflowOutputFormat: string = userOutputFormat;
        if (workflowPath) {
            const workflowConfig = await this.loadWorkflow(workflowPath);
            // Only use workflow's format as fallback when user hasn't changed from default
            if (workflowConfig?.output_format && !userOutputFormat) {
                workflowOutputFormat = workflowConfig.output_format;
            }
        }

        // ── Workflow entry point ─────────────────────────────────────────────
        const workflowSection = workflowPath
            ? `## Workflow Entry Point
Start by reading this specific workflow file:
  \`${workflowPath}\`

Then follow its step references exactly as written (substituting variables using the table above).`
            : `## Workflow Discovery
Use \`agentcanvas_list_directory\` on \`${bmadPath}\` to explore the framework structure and locate
the correct workflow file for this task, then follow its steps.`;

        // ── Load the appropriate agent persona from disk ────────────────────
        // Include the full agent file (activation, persona, menu, rules) so
        // the AI embodies the complete persona and interaction patterns.
        // The workflow entry point below will direct the AI to a specific
        // workflow, overriding the agent's top-level menu activation.
        const artifactType = artifact?.type || '';
        const persona = getPersonaForArtifactType(bmadPath, artifactType);
        const personaSection = persona
            ? formatFullAgentForPrompt(persona)
            : `## Your Persona\nYou are a BMAD methodology AI analyst.`;

        // ── Load the artifact schema for strict enforcement ────────────────
        // Ensure the schema validator is initialized so we can load raw schema
        // content for injection into the prompt.
        if (bmadPath && !schemaValidator.isInitialized()) {
            try {
                schemaValidator.init(bmadPath, acOutput);
            } catch (err: any) {
                acOutput.appendLine(
                    `[executeWithTools] Schema validator init failed: ${err?.message ?? err}`
                );
            }
        }

        const schemaContent = artifactType
            ? schemaValidator.getSchemaContent(artifactType)
            : undefined;

        const schemaSection = schemaContent
            ? `## Artifact Schema — STRICT
The artifact type \`${artifactType}\` MUST conform to the following JSON schema.
Your \`changes\` object in \`agentcanvas_update_artifact\` calls must use ONLY the field names,
types, and structures defined here.  Any fields not in this schema will be REJECTED.

\`\`\`json
${schemaContent}
\`\`\`

**Important schema rules:**
- The \`changes\` object should contain fields from the \`content\` section of the schema (flattened — do NOT wrap in a \`content\` key)
- Use exact field names as defined (camelCase, not snake_case or other variants)
- Respect \`enum\` values exactly — do not use synonyms or alternatives
- Arrays must contain objects with the exact properties defined in the schema
- Metadata fields can be included at the top level of \`changes\` as well`
            : `## Schema Compliance
Before calling \`agentcanvas_update_artifact\`, read the artifact's schema file from:
  \`${bmadPath}/schemas/\`
Use \`agentcanvas_list_directory\` and \`agentcanvas_read_file\` to find and read the correct schema.
Your changes MUST conform exactly to the schema — non-conforming fields will be REJECTED.`;

        // ── System prompt ────────────────────────────────────────────────────
        // When we have the full agent file (via formatFullAgentForPrompt), it
        // already contains the persona preamble, activation instructions, and
        // identity.  We place it at the top and add VS Code-specific context
        // below.  When there's no agent file, use a minimal intro.
        const agentIntro = persona
            ? '' // Full agent content already includes the preamble
            : `You are a BMAD methodology AI analyst executing a task inside VS Code.\nAlways respond in English.\n`;

        const systemPrompt = `${agentIntro}${personaSection}

## VS Code Workflow Execution Context
You are executing a specific workflow task inside the AgentCanvas VS Code extension.
Skip your activation menu — the user has already selected a specific workflow via a slash command.
Go directly to the workflow entry point below.

**CRITICAL — Interactive Collaboration Rules:**
- Follow the workflow files exactly, including ALL checkpoint/pause instructions.
- When a workflow step says to present options (e.g. [a] Advanced Elicitation, [c] Continue, [p] Party-Mode, [y] YOLO),
  you MUST present those options to the user and STOP. Do NOT auto-continue.
- When a workflow says "STOP and WAIT for user input", you MUST stop and wait.
- Each template-output section should be discussed with the user before proceeding.
- The user will respond with their choice in the next message. The conversation history carries context forward.
- Only proceed autonomously if the user explicitly chose YOLO mode.
- This is a collaborative conversation, not an autonomous batch process.

## User Context
- **Communication language:** English
- **Output folder:** \`${outputFolder}\`

## BMAD Framework Location
The complete BMAD framework is at: \`${bmadPath}\`

## Path Variable Substitution
Workflow files may contain template variables.  Resolve them using this table before
calling any tool:

${varTable}

## Your Tools
- **agentcanvas_read_file(path)** — read any file under \`${bmadPath}\` (use resolved absolute paths)
- **agentcanvas_list_directory(path)** — list any directory under \`${bmadPath}\`
- **agentcanvas_update_artifact(type, id, changes)** — persist changes to a BMAD artifact in the project
- **agentcanvas_write_file(path, content)** — write a file to the output folder or workspace. This respects the output format setting: when "dual", writing .md also generates .json and vice versa. **ALWAYS use this tool instead of VS Code's built-in file editing** for any file under \`${outputFolder}\` or the implementation-artifacts directory.

${schemaSection}

${workflowOutputFormat ? `## Output Format: ${workflowOutputFormat}
The user has selected \`output_format: ${workflowOutputFormat}\`.
${workflowOutputFormat === 'dual' || workflowOutputFormat === 'json'
    ? `### Saving the Artifact

When you have produced the artifact content (or a complete section of it), call \`agentcanvas_update_artifact\` to persist it as structured JSON.
Writing Markdown text in the chat is NOT sufficient — the extension needs the structured JSON
to persist the artifact to disk in both JSON and Markdown formats.

**To save, call:**
\`\`\`
agentcanvas_update_artifact({
  type: "<artifact-type>",
  id: "<artifact-id>",
  changes: { /* content fields from the schema above */ }
})
\`\`\`

The \`changes\` object must contain the artifact content fields (from the schema above), flattened
(not wrapped in a \`content\` key). Every required field in the schema MUST be present.

**IMPORTANT:** If the workflow includes checkpoints or pause instructions (e.g. "present options and STOP"),
honor those FIRST — pause and wait for the user's choice. Save the artifact only AFTER the user has
confirmed they are satisfied with the content, or when the workflow explicitly says to save.
Do NOT skip checkpoints just to save.`
    : `Output should be in Markdown format.`}

### Writing Implementation Files
When a workflow instructs you to write files to the implementation-artifacts directory (or any directory
under \`${outputFolder}\`), use the \`agentcanvas_write_file\` tool — **never use VS Code's built-in
file editing** for these files. The \`agentcanvas_write_file\` tool automatically respects the user's
output format setting and will generate both .json and .md files when the format is "dual".
` : ''}
${workflowSection}

## Current Artifact
${artifact ? JSON.stringify(artifact, null, 2) : '(none — this is a new artifact creation task)'}

## Task
${task}

## Rules
- Always use absolute paths when calling tools — substitute all \`{project-root}\` variables first
- Never invent schema fields, workflow steps, or agent personas — read them from the files
- Follow the workflow steps in order; read each step file before acting on it
- When you have finished producing the artifact and are ready to save, call \`agentcanvas_update_artifact\`
- When writing files to any directory under the output folder, use \`agentcanvas_write_file\` — NEVER use VS Code's built-in file editing for .agentcanvas-context files
- Your \`changes\` object MUST strictly follow the artifact schema — non-conforming updates will be rejected
${workflowOutputFormat === 'dual' || workflowOutputFormat === 'json'
    ? `- When all content is finalized and the user has confirmed (or you are in YOLO mode), call \`agentcanvas_update_artifact\` with structured JSON content.
- Do NOT skip workflow checkpoints or pause instructions just to save. Save only when content is ready.`
    : ''}
- Always respond in English`;

        const messages: vscode.LanguageModelChatMessage[] = [
            vscode.LanguageModelChatMessage.User(systemPrompt)
        ];

        const tools = getToolDefinitions();
        const MAX_ROUNDS = 20; // guard against runaway loops
        let rounds = 0;
        let artifactSaved = false; // Track whether agentcanvas_update_artifact was called
        let validationRetryCount = 0; // Track post-save schema validation retries
        let lastRoundText = ''; // Track last round's text for checkpoint detection

        stream.markdown(`*Running BMAD workflow${workflowPath ? ` — \`${path.basename(path.dirname(workflowPath))}\`` : ''}...*\n\n`);

        while (rounds < MAX_ROUNDS && !token.isCancellationRequested) {
            rounds++;
            acOutput.appendLine(`[executeWithTools] Round ${rounds}`);

            let response: vscode.LanguageModelChatResponse;
            try {
                response = await model.vscodeLm!.sendRequest(messages, { tools }, token);
            } catch (err: any) {
                stream.markdown(`\n\n**Error calling model:** ${err?.message ?? err}\n`);
                return;
            }

            // Collect this round's text and tool calls
            let roundText = '';
            const toolCalls: vscode.LanguageModelToolCallPart[] = [];

            for await (const part of response.stream) {
                if (token.isCancellationRequested) { return; }

                if (part instanceof vscode.LanguageModelTextPart) {
                    roundText += part.value;
                    stream.markdown(part.value);
                } else if (part instanceof vscode.LanguageModelToolCallPart) {
                    toolCalls.push(part);
                }
            }

            // Append assistant turn (text + tool calls) to message history
            const assistantParts: (vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart)[] = [];
            if (roundText) {
                assistantParts.push(new vscode.LanguageModelTextPart(roundText));
            }
            for (const tc of toolCalls) {
                assistantParts.push(tc);
            }
            if (assistantParts.length > 0) {
                messages.push(vscode.LanguageModelChatMessage.Assistant(assistantParts));
            }

            // If no tool calls, the LLM is done
            if (toolCalls.length === 0) {
                lastRoundText = roundText;
                acOutput.appendLine(`[executeWithTools] LLM finished after ${rounds} round(s)`);
                break;
            }

            // Invoke each tool and collect results
            const toolResultParts: vscode.LanguageModelToolResultPart[] = [];
            for (const tc of toolCalls) {
                acOutput.appendLine(`[executeWithTools] Tool call: ${tc.name}(${JSON.stringify(tc.input)})`);

                let result: vscode.LanguageModelToolResult;
                try {
                    result = await vscode.lm.invokeTool(tc.name, { input: tc.input, toolInvocationToken: undefined }, token);
                } catch (err: any) {
                    const errText = `Tool "${tc.name}" failed: ${err?.message ?? err}`;
                    acOutput.appendLine(`[executeWithTools] ${errText}`);
                    result = new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(errText)
                    ]);
                }

                // ── Post-save schema validation + retry feedback ────────
                // When agentcanvas_update_artifact succeeds, run strict validation
                // on the full artifact envelope (metadata + content) to
                // catch structural issues the lenient pre-save check misses.
                // Validation warnings are appended to the tool result so the
                // LLM naturally sees them and can self-correct.
                if (tc.name === 'agentcanvas_update_artifact') {
                    // Check if the tool call actually saved (vs. was rejected by pre-save validation)
                    const resultText = result.content
                        .filter((p): p is vscode.LanguageModelTextPart => p instanceof vscode.LanguageModelTextPart)
                        .map(p => p.value)
                        .join('');

                    if (resultText.includes('updated successfully')) {
                        artifactSaved = true;

                        // Run strict full-artifact validation
                        const input = tc.input as { type?: string; changes?: Record<string, any> };
                        const artType = input.type || '';
                        const changes = input.changes || {};

                        if (schemaValidator.isInitialized() && artType) {
                            // Map artifact type → store key for reading the on-disk file.
                            // Types whose data is embedded inside a parent file (story,
                            // use-case) have no standalone file to read; fall back to
                            // constructing an envelope from the LLM's changes.
                            const TYPE_TO_STORE_KEY: Record<string, string> = {
                                'vision': 'vision',
                                'product-brief': 'productBrief',
                                'prd': 'prd',
                                'architecture': 'architecture',
                                'test-design': 'testDesign',
                                'test-strategy': 'testStrategy',
                                'risks': 'risks',
                                'definition-of-done': 'definitionOfDone',
                                'project-overview': 'projectOverview',
                                'project-context': 'projectContext',
                                'tech-spec': 'techSpec',
                                'source-tree': 'sourceTree',
                                'test-summary': 'testSummary',
                                'research': 'research',
                                'ux-design': 'uxDesign',
                                'readiness-report': 'readinessReport',
                                'sprint-status': 'sprintStatus',
                                'retrospective': 'retrospective',
                                'change-proposal': 'changeProposal',
                                'code-review': 'codeReview',
                                'storytelling': 'storytelling',
                                'problem-solving': 'problemSolving',
                                'innovation-strategy': 'innovationStrategy',
                                'design-thinking': 'designThinking',
                                'traceability-matrix': 'traceabilityMatrix',
                                'test-review': 'testReview',
                                'nfr-assessment': 'nfrAssessment',
                                'test-framework': 'testFramework',
                                'ci-pipeline': 'ciPipeline',
                                'automation-summary': 'automationSummary',
                                'atdd-checklist': 'atddChecklist',
                            };

                            // Try to read the actual merged file from disk (preferred).
                            // The store has already merged changes + written the file by
                            // the time we get here (updateArtifact → syncToFiles).
                            let envelope: any = null;
                            let validationType = artType;
                            let usedDiskFile = false;
                            const storeKey = TYPE_TO_STORE_KEY[artType];

                            if (storeKey && typeof store?.readArtifactFile === 'function') {
                                try {
                                    const diskData = await store.readArtifactFile(storeKey);
                                    if (diskData && typeof diskData === 'object') {
                                        envelope = diskData;
                                        usedDiskFile = true;
                                        acOutput.appendLine(
                                            `[executeWithTools] Read on-disk artifact for ${artType} (key: ${storeKey}) — validating merged state`
                                        );
                                    }
                                } catch (readErr: any) {
                                    acOutput.appendLine(
                                        `[executeWithTools] Failed to read on-disk artifact for ${artType}: ${readErr?.message ?? readErr}`
                                    );
                                }
                            }

                            // For 'epic' type: read the full epics file and validate against 'epics' schema
                            if (!envelope && artType === 'epic' && typeof store?.readArtifactFile === 'function') {
                                try {
                                    const diskData = await store.readArtifactFile('epics');
                                    if (diskData && typeof diskData === 'object') {
                                        envelope = diskData;
                                        validationType = 'epics';
                                        usedDiskFile = true;
                                        acOutput.appendLine(
                                            `[executeWithTools] Read on-disk epics file for epic update — validating merged state`
                                        );
                                    }
                                } catch { /* fall through to synthetic envelope */ }
                            }

                            // Fallback: construct a synthetic envelope from the changes.
                            // Used for embedded types (story, use-case, test-case) or
                            // when on-disk read fails.
                            if (!envelope) {
                                const { status, id: _id, ...contentFields } = changes;
                                envelope = {
                                    metadata: {
                                        schemaVersion: '1.0.0',
                                        artifactType: artType,
                                        workflowName: 'agentcanvas',
                                        timestamps: {
                                            created: new Date().toISOString(),
                                            lastModified: new Date().toISOString()
                                        },
                                        status: (status as string) || 'draft'
                                    },
                                    content: contentFields
                                };
                                acOutput.appendLine(
                                    `[executeWithTools] Using synthetic envelope for ${artType} validation (no on-disk file available)`
                                );
                            }

                            const strictResult = schemaValidator.validate(validationType, envelope);
                            if (!strictResult.valid) {
                                // When validating the actual on-disk file, all errors
                                // are genuine.  When using the synthetic envelope
                                // (partial changes only), filter out "required" errors
                                // since the LLM may be doing a partial update.
                                const actionableErrors = usedDiskFile
                                    ? strictResult.errors
                                    : strictResult.errors.filter(
                                        e => !/\brequired\b/i.test(e)
                                    );

                                if (actionableErrors.length > 0) {
                                    validationRetryCount++;
                                    const MAX_VALIDATION_RETRIES = 3;

                                    if (validationRetryCount <= MAX_VALIDATION_RETRIES) {
                                        const warningMsg =
                                            `\n\nWARNING: The artifact was saved, but strict schema validation found issues ` +
                                            `(attempt ${validationRetryCount}/${MAX_VALIDATION_RETRIES}):\n` +
                                            actionableErrors.map(e => `  - ${e}`).join('\n') +
                                            `\n\nPlease call agentcanvas_update_artifact again with corrected content to fix these issues. ` +
                                            `Ensure ALL required fields are present and match the schema exactly.`;

                                        acOutput.appendLine(
                                            `[executeWithTools] Post-save validation failed for ${artType} ` +
                                            `(retry ${validationRetryCount}/${MAX_VALIDATION_RETRIES}): ` +
                                            actionableErrors.join('; ')
                                        );

                                        // Append warnings to the tool result content
                                        result = new vscode.LanguageModelToolResult([
                                            ...result.content,
                                            new vscode.LanguageModelTextPart(warningMsg)
                                        ]);
                                    } else {
                                        acOutput.appendLine(
                                            `[executeWithTools] Post-save validation failed for ${artType} ` +
                                            `but max retries (${MAX_VALIDATION_RETRIES}) exceeded — accepting as-is`
                                        );
                                    }
                                } else {
                                    // Only had "required" errors — likely a partial update, skip retry
                                    acOutput.appendLine(
                                        `[executeWithTools] Post-save validation for ${artType}: ` +
                                        `${strictResult.errors.length} error(s) were all "required" — skipping (likely partial update)`
                                    );
                                }
                            } else {
                                acOutput.appendLine(
                                    `[executeWithTools] Post-save strict validation PASSED for ${artType}`
                                );
                            }
                        }
                    }
                }

                toolResultParts.push(new vscode.LanguageModelToolResultPart(tc.callId, result.content));
            }

            // Feed tool results back as a User message
            messages.push(vscode.LanguageModelChatMessage.User(toolResultParts));

            // ── Checkpoint detection: stop the loop if the LLM is waiting for user input ──
            // The LLM may emit menu options (e.g. [A] Advanced, [C] Continue) or explicit
            // "waiting for input" text alongside tool calls.  If so, we've already executed
            // the tool calls (they may be reads preparing context for the menu) but we must
            // now break so the user can respond.  The /continue command resumes the workflow.
            if (roundText) {
                const checkpoint = this.detectUserPrompt(roundText);
                if (checkpoint.waitingForInput) {
                    lastRoundText = roundText;
                    acOutput.appendLine(
                        `[executeWithTools] Checkpoint detected in round ${rounds} — pausing for user input. ` +
                        `Menu options: ${checkpoint.menuOptions?.join(', ') || '(explicit prompt)'}`
                    );
                    break;
                }
            }
        }

        // ── Fallback enforcement: nudge the LLM if it didn't save the artifact ──
        // If the output format requires JSON and the LLM finished without calling
        // agentcanvas_update_artifact, inject a follow-up message and do one more round.
        // BUT: if the LLM stopped at a checkpoint (presenting options / waiting for input),
        // do NOT nudge — the pause is intentional interactive behavior.
        const checkpointIndicators = /\[a\]|\[c\]|\[p\]|\[y\]|YOLO|waiting for.*(input|response|choice|selection)|select.*(option|number|choice)|choose.*(one|option|above)|what would you like/i;
        const looksLikeCheckpoint = checkpointIndicators.test(lastRoundText);

        if (!artifactSaved
            && (workflowOutputFormat === 'dual' || workflowOutputFormat === 'json')
            && rounds < MAX_ROUNDS
            && !token.isCancellationRequested
            && !looksLikeCheckpoint
        ) {
            acOutput.appendLine('[executeWithTools] LLM finished without calling agentcanvas_update_artifact — sending nudge');
            stream.markdown('\n\n---\n*Artifact not saved yet — requesting JSON save...*\n\n');

            messages.push(vscode.LanguageModelChatMessage.User(
                `IMPORTANT: You finished your response without calling \`agentcanvas_update_artifact\`. ` +
                `The output_format is "${workflowOutputFormat}" which REQUIRES saving the artifact as structured JSON. ` +
                `Please call \`agentcanvas_update_artifact\` now with the complete artifact content from your response above. ` +
                `Extract the structured data and pass it as the \`changes\` object. This is mandatory.`
            ));

            // Nudge loop — give the model up to 3 rounds to save (handles
            // validation rejections that need correction, same as the main loop).
            const MAX_NUDGE_ROUNDS = 3;
            let nudgeRound = 0;

            try {
                while (nudgeRound < MAX_NUDGE_ROUNDS && !artifactSaved && !token.isCancellationRequested) {
                    nudgeRound++;
                    acOutput.appendLine(`[executeWithTools] Nudge round ${nudgeRound}/${MAX_NUDGE_ROUNDS}`);

                    const nudgeResponse = await model.vscodeLm!.sendRequest(messages, { tools }, token);

                    let nudgeRoundText = '';
                    const nudgeToolCalls: vscode.LanguageModelToolCallPart[] = [];

                    for await (const part of nudgeResponse.stream) {
                        if (token.isCancellationRequested) break;
                        if (part instanceof vscode.LanguageModelTextPart) {
                            nudgeRoundText += part.value;
                            stream.markdown(part.value);
                        } else if (part instanceof vscode.LanguageModelToolCallPart) {
                            nudgeToolCalls.push(part);
                        }
                    }

                    // Append assistant turn
                    const nudgeAssistantParts: (vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart)[] = [];
                    if (nudgeRoundText) {
                        nudgeAssistantParts.push(new vscode.LanguageModelTextPart(nudgeRoundText));
                    }
                    for (const tc of nudgeToolCalls) {
                        nudgeAssistantParts.push(tc);
                    }
                    if (nudgeAssistantParts.length > 0) {
                        messages.push(vscode.LanguageModelChatMessage.Assistant(nudgeAssistantParts));
                    }

                    // If no tool calls, the model is done (nothing more to try)
                    if (nudgeToolCalls.length === 0) break;

                    // Invoke each tool and collect results
                    const nudgeToolResults: vscode.LanguageModelToolResultPart[] = [];
                    for (const tc of nudgeToolCalls) {
                        acOutput.appendLine(`[executeWithTools] Nudge tool call: ${tc.name}(${JSON.stringify(tc.input)})`);
                        let result: vscode.LanguageModelToolResult;
                        try {
                            result = await vscode.lm.invokeTool(tc.name, { input: tc.input, toolInvocationToken: undefined }, token);
                        } catch (err: any) {
                            result = new vscode.LanguageModelToolResult([
                                new vscode.LanguageModelTextPart(`Tool "${tc.name}" failed: ${err?.message ?? err}`)
                            ]);
                        }

                        if (tc.name === 'agentcanvas_update_artifact') {
                            const nudgeText = result.content
                                .filter((p): p is vscode.LanguageModelTextPart => p instanceof vscode.LanguageModelTextPart)
                                .map(p => p.value)
                                .join('');
                            if (nudgeText.includes('updated successfully')) {
                                artifactSaved = true;
                                acOutput.appendLine('[executeWithTools] Artifact saved via nudge');
                            } else {
                                acOutput.appendLine(`[executeWithTools] Nudge agentcanvas_update_artifact did not save: ${nudgeText.substring(0, 100)}`);
                            }
                        }

                        nudgeToolResults.push(new vscode.LanguageModelToolResultPart(tc.callId, result.content));
                    }

                    // Feed tool results back for next nudge round
                    messages.push(vscode.LanguageModelChatMessage.User(nudgeToolResults));
                }
            } catch (err: any) {
                acOutput.appendLine(`[executeWithTools] Nudge loop failed: ${err?.message ?? err}`);
            }

            if (!artifactSaved) {
                stream.markdown('\n\n> **Note:** The artifact could not be saved automatically. ' +
                    'Please ask the assistant to save the artifact by saying "save as JSON" or "call agentcanvas_update_artifact".\n');
            }
        }

        if (!artifactSaved && looksLikeCheckpoint) {
            acOutput.appendLine('[executeWithTools] LLM paused at checkpoint — skipping save nudge (interactive pause is expected)');
        }

        if (rounds >= MAX_ROUNDS) {
            stream.markdown('\n\n*Maximum tool-call rounds reached. Workflow halted.*\n');
        }
    }

    /**
     * Fallback execution path for direct-API providers (OpenAI, Anthropic, Gemini, Ollama, Antigravity).
     * Uses a single-shot prompt containing the workflow instructions inline, since these providers
     * don't support the VS Code LM agentic tool-calling loop.
     */
    private async executeWithDirectApi(
        model: BmadModel,
        task: string,
        artifact: any,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
        workflowPath?: string
    ): Promise<void> {
        const bmadPath = this.context.bmadPath;
        const projectRoot = this.context.projectRoot;

        // Try to read the workflow file content to inline it
        let workflowContent = '';
        // VS Code setting takes precedence over workflow frontmatter
        const directUserFormat = vscode.workspace.getConfiguration('agentcanvas')
            .get<'json' | 'markdown' | 'dual'>('outputFormat', 'dual');
        let directOutputFormat: string = directUserFormat;
        let wfConfig: any = null;
        if (workflowPath) {
            try {
                const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(workflowPath));
                workflowContent = Buffer.from(raw).toString('utf-8');
            } catch {
                workflowContent = `(workflow file not found: ${workflowPath})`;
            }
            // Load the workflow config for output_format and execution_hints
            wfConfig = await this.loadWorkflow(workflowPath);
            if (wfConfig?.output_format && !directUserFormat) {
                directOutputFormat = wfConfig.output_format;
            }
        }

        // ── AntiGravity: use the full orchestrator instead of streaming ───
        // The orchestrator writes a guide file and sends a pointer prompt to
        // Gemini Agent, which can read files natively. This replaces the
        // fire-and-forget approach.
        if (model.provider === 'antigravity') {
            const configOutputFolder: string = this.context.config?.output_folder ?? '';
            const agOutputFolder = configOutputFolder
                ? (configOutputFolder.includes('{project-root}')
                    ? configOutputFolder.replace('{project-root}', projectRoot)
                    : path.join(projectRoot, configOutputFolder))
                : path.join(projectRoot, '.agentcanvas-context');

            // Extract execution_hints from the loaded workflow config (if available)
            let executionHints: ExecutionHints | undefined;
            if (wfConfig?.execution_hints) {
                executionHints = {
                    interactive: wfConfig.execution_hints.interactive,
                    autonomous: wfConfig.execution_hints.autonomous,
                    iterative: wfConfig.execution_hints.iterative,
                };
                acOutput.appendLine(
                    `[executeWithDirectApi] execution_hints from workflow: ` +
                    `interactive=${executionHints.interactive}, autonomous=${executionHints.autonomous}`
                );
            }

            stream.markdown(
                `*Preparing AntiGravity workflow${workflowPath ? ` — \`${path.basename(path.dirname(workflowPath))}\`` : ''}...*\n\n`
            );

            const success = await orchestrateAntigravityWorkflow(
                {
                    bmadPath,
                    projectRoot,
                    outputFolder: agOutputFolder,
                    task,
                    artifact,
                    workflowPath,
                    workflowContent: workflowContent || undefined,
                    outputFormat: directOutputFormat as 'json' | 'markdown' | 'dual',
                    executionHints,
                },
                stream
            );

            if (!success) {
                stream.markdown(
                    '\n**Fallback:** Could not use the AntiGravity Agent Panel. ' +
                    'Please check that you are running inside Firebase Studio.\n'
                );
            }
            return;
        }

        // ── Load the artifact schema for inline enforcement ────────────────
        const artifactType = artifact?.type || '';
        if (bmadPath && !schemaValidator.isInitialized()) {
            try {
                schemaValidator.init(bmadPath, acOutput);
            } catch (err: any) {
                acOutput.appendLine(
                    `[executeWithDirectApi] Schema validator init failed: ${err?.message ?? err}`
                );
            }
        }

        const directSchemaContent = artifactType
            ? schemaValidator.getSchemaContent(artifactType)
            : undefined;

        const directSchemaSection = directSchemaContent
            ? `## Artifact Schema — STRICT
The artifact type \`${artifactType}\` MUST conform to the following JSON schema.
Your output MUST use ONLY the field names, types, and structures defined here.

\`\`\`json
${directSchemaContent}
\`\`\`

**Important:** Use exact field names (camelCase), respect enum values, and match array/object structures exactly.\n\n`
            : '';

        const directOutputFormatSection = directOutputFormat
            ? `## Output Format: ${directOutputFormat}
The user has selected \`output_format: ${directOutputFormat}\`.
${directOutputFormat === 'dual' || directOutputFormat === 'json'
    ? `### Saving the Artifact as JSON

Produce the complete artifact as a JSON object with \`metadata\` and \`content\` top-level keys.
The JSON is the primary deliverable — a Markdown companion will be generated automatically.

**Your response should contain a complete, valid JSON code block** with the full artifact content.
Wrap the JSON in a \`\`\`json code fence so it can be parsed.

**IMPORTANT:** If the workflow includes checkpoints or pause instructions, honor those FIRST.
Only produce the final JSON output after the user has confirmed they are satisfied, or when
the workflow explicitly says to produce the output. Do NOT skip checkpoints just to produce JSON.`
    : `Output should be in Markdown format.`}

`
            : '';

        // ── Load the agent persona for inline prompt enrichment ──────────
        const directPersona = getPersonaForArtifactType(bmadPath, artifactType);
        const directPersonaSection = directPersona
            ? formatFullAgentForPrompt(directPersona)
            : '';

        const systemPrompt = `${directPersonaSection || 'You are a BMAD methodology AI analyst. Execute the following task following BMAD quality standards.'}
Always respond in English.

## VS Code Workflow Execution Context
You are executing a specific workflow task inside the AgentCanvas VS Code extension.
Skip your activation menu — the user has already selected a specific workflow via a slash command.
Go directly to the workflow instructions below.

**CRITICAL — Interactive Collaboration Rules:**
- Follow the workflow instructions exactly, including ALL checkpoint/pause instructions.
- When a workflow step says to present options or checkpoints, present them and STOP.
- When a workflow says "STOP and WAIT for user input", stop and wait.
- Each section should be discussed with the user before proceeding.
- This is a collaborative conversation, not an autonomous batch process.

## BMAD Framework
The BMAD framework is located at: \`${bmadPath}\`
Project root: \`${projectRoot}\`

${workflowContent ? `## Workflow Instructions\n${workflowContent}\n\n` : ''}${directSchemaSection}${directOutputFormatSection}## Current Artifact
${artifact ? JSON.stringify(artifact, null, 2) : '(none — this is a new artifact creation task)'}

## Task
${task}

## Rules
- Follow the workflow steps above if provided
- Produce high-quality, specific, measurable outputs
- Output artifacts in the JSON format defined by BMAD schemas
- Never invent schema fields; follow BMAD conventions strictly
- Your artifact output MUST conform exactly to the schema — use only defined field names, types, and enum values
${directOutputFormat === 'dual' || directOutputFormat === 'json'
    ? `- When content is finalized and the user has confirmed (or you are in YOLO mode), include a complete JSON code block (fenced with \`\`\`json) containing the full artifact.
- Do NOT skip workflow checkpoints or pause instructions just to produce JSON output. Save only when content is ready.`
    : ''}
- Always respond in English`;

        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt }
        ];

        stream.markdown(`*Running BMAD workflow${workflowPath ? ` — \`${path.basename(path.dirname(workflowPath))}\`` : ''}...*\n\n`);

        await streamChatResponse(model, messages, stream, token);
    }

    /**
     * Get the workflow selection menu for a given artifact type
     */
    getWorkflowMenu(artifactType: string): string {
        const workflows = this.getAvailableWorkflows(artifactType);
        
        if (workflows.length === 0) {
            return `No BMAD workflows available for ${artifactType} refinement.`;
        }

        let menu = `## BMAD Workflow Selection\n\n`;
        menu += `Select a workflow for **${artifactType}** refinement:\n\n`;
        
        workflows.forEach((w, i) => {
            menu += `**[${i + 1}] ${w.name}**\n`;
            menu += `${w.description}\n\n`;
        });

        menu += `\nReply with a number to start the workflow, or describe what you want to refine.\n`;
        
        return menu;
    }

    /**
     * Get the BMAD path
     */
    getBmadPath(): string {
        return this.context.bmadPath;
    }

    /**
     * Get project root
     */
    getProjectRoot(): string {
        return this.context.projectRoot;
    }
}

// Singleton instance
let executorInstance: WorkflowExecutor | null = null;

export function getWorkflowExecutor(): WorkflowExecutor {
    if (!executorInstance) {
        executorInstance = new WorkflowExecutor();
    }
    return executorInstance;
}
