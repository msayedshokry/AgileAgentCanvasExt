import type { AgentRole } from '../types';

// ─── Agent Team Registry ─────────────────────────────────────────────────────

export interface AgentTeam {
  id: string;
  members: Array<{
    role: AgentRole;
    personaId: string;
    order: number;
  }>;
  workflow: string;
}

export const TEAM_REGISTRY: Record<string, AgentTeam> = {
  // ==========================================================================
  // CORE MODULE (4 workflows)
  // ==========================================================================

  'brainstorming': {
    id: 'brainstorming',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'core/workflows/brainstorming/workflow.md',
  },
  'convert-to-json': {
    id: 'convert-to-json',
    members: [
      { role: 'crafter', personaId: 'aac-agent-dev', order: 1 },
      { role: 'gate', personaId: 'aac-agent-analyst', order: 2 },
    ],
    workflow: 'core/workflows/convert-to-json/workflow.md',
  },
  'party-mode': {
    id: 'party-mode',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'core/workflows/party-mode/workflow.md',
  },
  'advanced-elicitation': {
    id: 'advanced-elicitation',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'core/workflows/advanced-elicitation/workflow.xml',
  },

  // ==========================================================================
  // BMM MODULE — Phase 1: Analysis (4 workflows)
  // ==========================================================================

  'create-product-brief': {
    id: 'create-product-brief',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/1-analysis/create-product-brief/workflow.md',
  },
  'domain-research': {
    id: 'domain-research',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-architect', order: 2 },
      { role: 'gate', personaId: 'aac-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/1-analysis/research/workflow-domain-research.md',
  },
  'market-research': {
    id: 'market-research',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/1-analysis/research/workflow-market-research.md',
  },
  'technical-research': {
    id: 'technical-research',
    members: [
      { role: 'researcher', personaId: 'aac-agent-architect', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/1-analysis/research/workflow-technical-research.md',
  },

  // ==========================================================================
  // BMM MODULE — Phase 2: Planning (4 workflows)
  // ==========================================================================

  'create-prd': {
    id: 'create-prd',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/2-plan-workflows/create-prd/workflow-create-prd.md',
  },
  'edit-prd': {
    id: 'edit-prd',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/2-plan-workflows/create-prd/workflow-edit-prd.md',
  },
  'validate-prd': {
    id: 'validate-prd',
    members: [
      { role: 'gate', personaId: 'aac-agent-architect', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 2 },
    ],
    workflow: 'bmm/workflows/2-plan-workflows/create-prd/workflow-validate-prd.md',
  },
  'create-ux-design': {
    id: 'create-ux-design',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-ux-designer', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/2-plan-workflows/create-ux-design/workflow.md',
  },

  // ==========================================================================
  // BMM MODULE — Phase 3: Solutioning (5 workflows)
  // ==========================================================================

  'create-architecture': {
    id: 'create-architecture',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-architect', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/3-solutioning/create-architecture/workflow.md',
  },
  'create-epics-and-stories': {
    id: 'create-epics-and-stories',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/3-solutioning/create-epics-and-stories/workflow.md',
  },
  'epic-enhancement': {
    id: 'epic-enhancement',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/3-solutioning/create-epics-and-stories/steps/step-02a-epic-enhancement.md',
  },
  'story-enhancement': {
    id: 'story-enhancement',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/3-solutioning/create-epics-and-stories/steps/step-03a-story-enhancement.md',
  },
  'check-implementation-readiness': {
    id: 'check-implementation-readiness',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-architect', order: 1 },
      { role: 'gate', personaId: 'aac-agent-pm', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/3-solutioning/check-implementation-readiness/workflow.md',
  },

  // ==========================================================================
  // BMM MODULE — Phase 4: Implementation (7 workflows)
  // ==========================================================================

  'sprint-planning': {
    id: 'sprint-planning',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 3 }, // SM → dev (upstream v6.3.0 removal)
    ],
    workflow: 'bmm/workflows/4-implementation/sprint-planning/workflow.yaml',
  },
  'sprint-status': {
    id: 'sprint-status',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-dev', order: 1 }, // SM → dev (upstream v6.3.0 removal)
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/sprint-status/workflow.yaml',
  },
  'create-story': {
    id: 'create-story',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/create-story/workflow.yaml',
  },
  'dev-story': {
    id: 'dev-story',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-tea', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/dev-story/workflow.yaml',
  },
  'code-review': {
    id: 'code-review',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-dev', order: 1 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/code-review/workflow.yaml',
  },
  'retrospective': {
    id: 'retrospective',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-dev', order: 1 }, // SM → dev (upstream v6.3.0 removal)
      { role: 'crafter', personaId: 'aac-agent-pm', order: 2 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/retrospective/workflow.yaml',
  },
  'correct-course': {
    id: 'correct-course',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/correct-course/workflow.yaml',
  },

  // ==========================================================================
  // BMM MODULE — Phase 4: Review (14 workflows)
  // ==========================================================================

  'security-audit': {
    id: 'security-audit',
    members: [
      { role: 'researcher', personaId: 'aac-agent-architect', order: 1 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 2 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/security-audit/workflow.md',
  },
  'ceo-scope-review': {
    id: 'ceo-scope-review',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 2 },
    ],
    workflow: 'bmm/workflows/4-review/ceo-scope-review/workflow.md',
  },
  'eng-execution-review': {
    id: 'eng-execution-review',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-architect', order: 1 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/eng-execution-review/workflow.md',
  },
  'design-dimension-audit': {
    id: 'design-dimension-audit',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-ux-designer', order: 1 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 2 },
    ],
    workflow: 'bmm/workflows/4-review/design-dimension-audit/workflow.md',
  },
  'verification-loop': {
    id: 'verification-loop',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-dev', order: 1 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-tea', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/verification-loop/workflow.md',
  },
  'coding-standards': {
    id: 'coding-standards',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-architect', order: 1 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/coding-standards/workflow.md',
  },
  'e2e-testing': {
    id: 'e2e-testing',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/e2e-testing/workflow.md',
  },
  'eval-harness': {
    id: 'eval-harness',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/eval-harness/workflow.md',
  },
  'api-design': {
    id: 'api-design',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-architect', order: 1 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 2 },
    ],
    workflow: 'bmm/workflows/4-review/api-design/workflow.md',
  },
  'codebase-mapper': {
    id: 'codebase-mapper',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-architect', order: 2 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/codebase-mapper/workflow.yaml',
  },
  'assumptions-analyzer': {
    id: 'assumptions-analyzer',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-architect', order: 2 },
      { role: 'gate', personaId: 'aac-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/assumptions-analyzer/workflow.yaml',
  },
  'tradeoff-advisor': {
    id: 'tradeoff-advisor',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-architect', order: 2 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/tradeoff-advisor/workflow.yaml',
  },
  'execution-task-protocol': {
    id: 'execution-task-protocol',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-dev', order: 1 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-tea', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/execution-task-protocol/workflow.yaml',
  },
  'test-classification': {
    id: 'test-classification',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-analyst', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/test-classification/workflow.yaml',
  },

  // ==========================================================================
  // BMM MODULE — Quick Flow (2 workflows)
  // ==========================================================================

  'quick-spec': {
    id: 'quick-spec',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/aac-quick-flow/quick-spec/workflow.md',
  },
  'quick-dev': {
    id: 'quick-dev',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-dev', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-tea', order: 3 },
    ],
    workflow: 'bmm/workflows/aac-quick-flow/quick-dev/workflow.md',
  },

  // ==========================================================================
  // BMM MODULE — QA (1 workflow)
  // ==========================================================================

  'qa-automate': {
    id: 'qa-automate',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/qa-generate-e2e-tests/workflow.yaml',
  },

  // ==========================================================================
  // BMM MODULE — Supporting (3 workflows)
  // ==========================================================================

  'create-use-cases': {
    id: 'create-use-cases',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/supporting/create-use-cases/workflow.yaml',
  },
  'create-risks': {
    id: 'create-risks',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/supporting/create-risks/workflow.yaml',
  },
  'create-definition-of-done': {
    id: 'create-definition-of-done',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/supporting/create-definition-of-done/workflow.yaml',
  },

  // ==========================================================================
  // BMM MODULE — Utility (2 workflows)
  // ==========================================================================

  'document-project': {
    id: 'document-project',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-tech-writer', order: 2 },
      { role: 'gate', personaId: 'aac-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/document-project/workflow.yaml',
  },
  'generate-project-context': {
    id: 'generate-project-context',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-tech-writer', order: 2 },
      { role: 'gate', personaId: 'aac-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/generate-project-context/workflow.md',
  },

  // ==========================================================================
  // TEA MODULE — Testing Architecture (9 workflows)
  // ==========================================================================

  'teach-me-testing': {
    id: 'teach-me-testing',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/teach-me-testing/workflow.md',
  },
  'test-design': {
    id: 'test-design',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/test-design/workflow.md',
  },
  'test-review': {
    id: 'test-review',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/test-review/workflow.md',
  },
  'tea-framework': {
    id: 'tea-framework',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-analyst', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/framework/workflow.md',
  },
  'tea-ci': {
    id: 'tea-ci',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-analyst', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/ci/workflow.md',
  },
  'tea-automate': {
    id: 'tea-automate',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/automate/workflow.md',
  },
  'atdd': {
    id: 'atdd',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/atdd/workflow.md',
  },
  'trace': {
    id: 'trace',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/trace/workflow.md',
  },
  'nfr-assess': {
    id: 'nfr-assess',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/nfr-assess/workflow.md',
  },

  // ==========================================================================
  // CIS MODULE — Innovation Strategy (4 workflows)
  // ==========================================================================

  'design-thinking': {
    id: 'design-thinking',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'cis/workflows/design-thinking/workflow.yaml',
  },
  'innovation-strategy': {
    id: 'innovation-strategy',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'cis/workflows/innovation-strategy/workflow.yaml',
  },
  'problem-solving': {
    id: 'problem-solving',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'cis/workflows/problem-solving/workflow.yaml',
  },
  'storytelling': {
    id: 'storytelling',
    members: [
      { role: 'researcher', personaId: 'aac-agent-tech-writer', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'cis/workflows/storytelling/workflow.yaml',
  },

  // ==========================================================================
  // BMB MODULE — Agent Builder (3 workflows)
  // ==========================================================================

  'create-agent': {
    id: 'create-agent',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmb/workflows/agent/workflow-create-agent.md',
  },
  'edit-agent': {
    id: 'edit-agent',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmb/workflows/agent/workflow-edit-agent.md',
  },
  'validate-agent': {
    id: 'validate-agent',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-architect', order: 1 },
      { role: 'gate', personaId: 'aac-agent-pm', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'bmb/workflows/agent/workflow-validate-agent.md',
  },

  // ==========================================================================
  // BMB MODULE — Module Builder (4 workflows)
  // ==========================================================================

  'create-module-brief': {
    id: 'create-module-brief',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmb/workflows/module/workflow-create-module-brief.md',
  },
  'create-module': {
    id: 'create-module',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmb/workflows/module/workflow-create-module.md',
  },
  'edit-module': {
    id: 'edit-module',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmb/workflows/module/workflow-edit-module.md',
  },
  'validate-module': {
    id: 'validate-module',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-architect', order: 1 },
      { role: 'gate', personaId: 'aac-agent-pm', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'bmb/workflows/module/workflow-validate-module.md',
  },

  // ==========================================================================
  // BMB MODULE — Workflow Builder (5 workflows)
  // ==========================================================================

  'create-workflow': {
    id: 'create-workflow',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmb/workflows/workflow/workflow-create-workflow.md',
  },
  'edit-workflow': {
    id: 'edit-workflow',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 3 },
    ],
    workflow: 'bmb/workflows/workflow/workflow-edit-workflow.md',
  },
  'validate-workflow': {
    id: 'validate-workflow',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-architect', order: 1 },
      { role: 'gate', personaId: 'aac-agent-pm', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 3 },
    ],
    workflow: 'bmb/workflows/workflow/workflow-validate-workflow.md',
  },
  'validate-workflow-max': {
    id: 'validate-workflow-max',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-architect', order: 1 },
      { role: 'gate', personaId: 'aac-agent-pm', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 3 },
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 4 },
    ],
    workflow: 'bmb/workflows/workflow/workflow-validate-max-parallel-workflow.md',
  },
  'rework-workflow': {
    id: 'rework-workflow',
    members: [
      { role: 'researcher', personaId: 'aac-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-pm', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-dev', order: 3 },
      { role: 'gate', personaId: 'aac-agent-architect', order: 4 },
    ],
    workflow: 'bmb/workflows/workflow/workflow-rework-workflow.md',
  },
};
