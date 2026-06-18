import { createLogger } from '../utils/logger';
const logger = createLogger('team-orchestrator');
import * as vscode from 'vscode';
import { AcpSessionSpec, AcpSessionResult, AgentRole } from './types';
import { acpSessionManager } from './session-manager';
import { BmadModel } from '../chat/ai-provider';
import { agentRegistry } from './agent-bus/agent-registry';
import { agentMessageBus } from './agent-bus/message-bus';
import { handoffNegotiation } from './agent-bus/handoff-negotiation';
import { getTraceRecorder } from '../trace/trace-recorder';
import type { AgentCapability } from './agent-bus/types';

import { errMsg } from '../utils/error';

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

const TEAM_REGISTRY: Record<string, AgentTeam> = {
  // ==========================================================================
  // CORE MODULE (4 workflows)
  // ==========================================================================

  'brainstorming': {
    id: 'brainstorming',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'core/workflows/brainstorming/workflow.md',
  },
  'convert-to-json': {
    id: 'convert-to-json',
    members: [
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-analyst', order: 2 },
    ],
    workflow: 'core/workflows/convert-to-json/workflow.md',
  },
  'party-mode': {
    id: 'party-mode',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'core/workflows/party-mode/workflow.md',
  },
  'advanced-elicitation': {
    id: 'advanced-elicitation',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'core/workflows/advanced-elicitation/workflow.xml',
  },

  // ==========================================================================
  // BMM MODULE — Phase 1: Analysis (4 workflows)
  // ==========================================================================

  'create-product-brief': {
    id: 'create-product-brief',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/1-analysis/create-product-brief/workflow.md',
  },
  'domain-research': {
    id: 'domain-research',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-architect', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/1-analysis/research/workflow-domain-research.md',
  },
  'market-research': {
    id: 'market-research',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/1-analysis/research/workflow-market-research.md',
  },
  'technical-research': {
    id: 'technical-research',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-architect', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/1-analysis/research/workflow-technical-research.md',
  },

  // ==========================================================================
  // BMM MODULE — Phase 2: Planning (4 workflows)
  // ==========================================================================

  'create-prd': {
    id: 'create-prd',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/2-plan-workflows/create-prd/workflow-create-prd.md',
  },
  'edit-prd': {
    id: 'edit-prd',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/2-plan-workflows/create-prd/workflow-edit-prd.md',
  },
  'validate-prd': {
    id: 'validate-prd',
    members: [
      { role: 'gate', personaId: 'bmad-agent-architect', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
    ],
    workflow: 'bmm/workflows/2-plan-workflows/create-prd/workflow-validate-prd.md',
  },
  'create-ux-design': {
    id: 'create-ux-design',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-ux-designer', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/2-plan-workflows/create-ux-design/workflow.md',
  },

  // ==========================================================================
  // BMM MODULE — Phase 3: Solutioning (5 workflows)
  // ==========================================================================

  'create-architecture': {
    id: 'create-architecture',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-architect', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/3-solutioning/create-architecture/workflow.md',
  },
  'create-epics-and-stories': {
    id: 'create-epics-and-stories',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/3-solutioning/create-epics-and-stories/workflow.md',
  },
  'epic-enhancement': {
    id: 'epic-enhancement',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/3-solutioning/create-epics-and-stories/steps/step-02a-epic-enhancement.md',
  },
  'story-enhancement': {
    id: 'story-enhancement',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/3-solutioning/create-epics-and-stories/steps/step-03a-story-enhancement.md',
  },
  'check-implementation-readiness': {
    id: 'check-implementation-readiness',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-architect', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/3-solutioning/check-implementation-readiness/workflow.md',
  },

  // ==========================================================================
  // BMM MODULE — Phase 4: Implementation (7 workflows)
  // ==========================================================================

  'sprint-planning': {
    id: 'sprint-planning',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-sm', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/sprint-planning/workflow.yaml',
  },
  'sprint-status': {
    id: 'sprint-status',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-sm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/sprint-status/workflow.yaml',
  },
  'create-story': {
    id: 'create-story',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/create-story/workflow.yaml',
  },
  'dev-story': {
    id: 'dev-story',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-tea', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/dev-story/workflow.yaml',
  },
  'code-review': {
    id: 'code-review',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-dev', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 2 },
      { role: 'crafter', personaId: 'bmad-agent-qa', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/code-review/workflow.yaml',
  },
  'retrospective': {
    id: 'retrospective',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-sm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/retrospective/workflow.yaml',
  },
  'correct-course': {
    id: 'correct-course',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/4-implementation/correct-course/workflow.yaml',
  },

  // ==========================================================================
  // BMM MODULE — Phase 4: Review (14 workflows)
  // ==========================================================================

  'security-audit': {
    id: 'security-audit',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-architect', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-qa', order: 2 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/security-audit/workflow.md',
  },
  'ceo-scope-review': {
    id: 'ceo-scope-review',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 2 },
    ],
    workflow: 'bmm/workflows/4-review/ceo-scope-review/workflow.md',
  },
  'eng-execution-review': {
    id: 'eng-execution-review',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-architect', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'crafter', personaId: 'bmad-agent-qa', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/eng-execution-review/workflow.md',
  },
  'design-dimension-audit': {
    id: 'design-dimension-audit',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-ux-designer', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 2 },
    ],
    workflow: 'bmm/workflows/4-review/design-dimension-audit/workflow.md',
  },
  'verification-loop': {
    id: 'verification-loop',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-dev', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-qa', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-tea', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/verification-loop/workflow.md',
  },
  'coding-standards': {
    id: 'coding-standards',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-architect', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'crafter', personaId: 'bmad-agent-qa', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/coding-standards/workflow.md',
  },
  'e2e-testing': {
    id: 'e2e-testing',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-qa', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/e2e-testing/workflow.md',
  },
  'eval-harness': {
    id: 'eval-harness',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/eval-harness/workflow.md',
  },
  'api-design': {
    id: 'api-design',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-architect', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-dev', order: 2 },
    ],
    workflow: 'bmm/workflows/4-review/api-design/workflow.md',
  },
  'codebase-mapper': {
    id: 'codebase-mapper',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-architect', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/codebase-mapper/workflow.yaml',
  },
  'assumptions-analyzer': {
    id: 'assumptions-analyzer',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-architect', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/assumptions-analyzer/workflow.yaml',
  },
  'tradeoff-advisor': {
    id: 'tradeoff-advisor',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-architect', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/tradeoff-advisor/workflow.yaml',
  },
  'execution-task-protocol': {
    id: 'execution-task-protocol',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-dev', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-qa', order: 2 },
      { role: 'crafter', personaId: 'aac-agent-tea', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/execution-task-protocol/workflow.yaml',
  },
  'test-classification': {
    id: 'test-classification',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'crafter', personaId: 'bmad-agent-analyst', order: 3 },
    ],
    workflow: 'bmm/workflows/4-review/test-classification/workflow.yaml',
  },

  // ==========================================================================
  // BMM MODULE — Quick Flow (2 workflows)
  // ==========================================================================

  'quick-spec': {
    id: 'quick-spec',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-qa', order: 3 },
    ],
    workflow: 'bmm/workflows/bmad-quick-flow/quick-spec/workflow.md',
  },
  'quick-dev': {
    id: 'quick-dev',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-quick-flow-solo-dev', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'aac-agent-tea', order: 3 },
    ],
    workflow: 'bmm/workflows/bmad-quick-flow/quick-dev/workflow.md',
  },

  // ==========================================================================
  // BMM MODULE — QA (1 workflow)
  // ==========================================================================

  'qa-automate': {
    id: 'qa-automate',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-qa', order: 3 },
    ],
    workflow: 'bmm/workflows/qa-generate-e2e-tests/workflow.yaml',
  },

  // ==========================================================================
  // BMM MODULE — Supporting (3 workflows)
  // ==========================================================================

  'create-use-cases': {
    id: 'create-use-cases',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/supporting/create-use-cases/workflow.yaml',
  },
  'create-risks': {
    id: 'create-risks',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmm/workflows/supporting/create-risks/workflow.yaml',
  },
  'create-definition-of-done': {
    id: 'create-definition-of-done',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-qa', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-dev', order: 3 },
    ],
    workflow: 'bmm/workflows/supporting/create-definition-of-done/workflow.yaml',
  },

  // ==========================================================================
  // BMM MODULE — Utility (2 workflows)
  // ==========================================================================

  'document-project': {
    id: 'document-project',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-tech-writer', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-pm', order: 3 },
    ],
    workflow: 'bmm/workflows/document-project/workflow.yaml',
  },
  'generate-project-context': {
    id: 'generate-project-context',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-tech-writer', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-pm', order: 3 },
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
      { role: 'crafter', personaId: 'bmad-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-dev', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/teach-me-testing/workflow.md',
  },
  'test-design': {
    id: 'test-design',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/test-design/workflow.md',
  },
  'test-review': {
    id: 'test-review',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 2 },
      { role: 'crafter', personaId: 'bmad-agent-qa', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/test-review/workflow.md',
  },
  'tea-framework': {
    id: 'tea-framework',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-analyst', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/framework/workflow.md',
  },
  'tea-ci': {
    id: 'tea-ci',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-analyst', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/ci/workflow.md',
  },
  'tea-automate': {
    id: 'tea-automate',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-qa', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/automate/workflow.md',
  },
  'atdd': {
    id: 'atdd',
    members: [
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-analyst', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-dev', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/atdd/workflow.md',
  },
  'trace': {
    id: 'trace',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/trace/workflow.md',
  },
  'nfr-assess': {
    id: 'nfr-assess',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'aac-agent-tea', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'tea/workflows/testarch/nfr-assess/workflow.md',
  },

  // ==========================================================================
  // CIS MODULE — Innovation Strategy (4 workflows)
  // ==========================================================================

  'design-thinking': {
    id: 'design-thinking',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'cis/workflows/design-thinking/workflow.yaml',
  },
  'innovation-strategy': {
    id: 'innovation-strategy',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'cis/workflows/innovation-strategy/workflow.yaml',
  },
  'problem-solving': {
    id: 'problem-solving',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'cis/workflows/problem-solving/workflow.yaml',
  },
  'storytelling': {
    id: 'storytelling',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-tech-writer', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'cis/workflows/storytelling/workflow.yaml',
  },

  // ==========================================================================
  // BMB MODULE — Agent Builder (3 workflows)
  // ==========================================================================

  'create-agent': {
    id: 'create-agent',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmb/workflows/agent/workflow-create-agent.md',
  },
  'edit-agent': {
    id: 'edit-agent',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmb/workflows/agent/workflow-edit-agent.md',
  },
  'validate-agent': {
    id: 'validate-agent',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-architect', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'crafter', personaId: 'bmad-agent-qa', order: 3 },
    ],
    workflow: 'bmb/workflows/agent/workflow-validate-agent.md',
  },

  // ==========================================================================
  // BMB MODULE — Module Builder (4 workflows)
  // ==========================================================================

  'create-module-brief': {
    id: 'create-module-brief',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmb/workflows/module/workflow-create-module-brief.md',
  },
  'create-module': {
    id: 'create-module',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmb/workflows/module/workflow-create-module.md',
  },
  'edit-module': {
    id: 'edit-module',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmb/workflows/module/workflow-edit-module.md',
  },
  'validate-module': {
    id: 'validate-module',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-architect', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'crafter', personaId: 'bmad-agent-qa', order: 3 },
    ],
    workflow: 'bmb/workflows/module/workflow-validate-module.md',
  },

  // ==========================================================================
  // BMB MODULE — Workflow Builder (5 workflows)
  // ==========================================================================

  'create-workflow': {
    id: 'create-workflow',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmb/workflows/workflow/workflow-create-workflow.md',
  },
  'edit-workflow': {
    id: 'edit-workflow',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 1 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 2 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 3 },
    ],
    workflow: 'bmb/workflows/workflow/workflow-edit-workflow.md',
  },
  'validate-workflow': {
    id: 'validate-workflow',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-architect', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'crafter', personaId: 'bmad-agent-qa', order: 3 },
    ],
    workflow: 'bmb/workflows/workflow/workflow-validate-workflow.md',
  },
  'validate-workflow-max': {
    id: 'validate-workflow-max',
    members: [
      { role: 'coordinator', personaId: 'bmad-agent-architect', order: 1 },
      { role: 'gate', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'crafter', personaId: 'bmad-agent-qa', order: 3 },
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 4 },
    ],
    workflow: 'bmb/workflows/workflow/workflow-validate-max-parallel-workflow.md',
  },
  'rework-workflow': {
    id: 'rework-workflow',
    members: [
      { role: 'researcher', personaId: 'bmad-agent-analyst', order: 1 },
      { role: 'coordinator', personaId: 'bmad-agent-pm', order: 2 },
      { role: 'crafter', personaId: 'bmad-agent-dev', order: 3 },
      { role: 'gate', personaId: 'bmad-agent-architect', order: 4 },
    ],
    workflow: 'bmb/workflows/workflow/workflow-rework-workflow.md',
  },
};

// ─── AgentTeamOrchestrator ───────────────────────────────────────────────────

export class AgentTeamOrchestrator {
  /**
   * Register all team members on the agent bus and return the list of agent IDs.
   * This allows agents to be discovered and receive handoffs dynamically.
   */
  private registerTeamOnBus(teamId: string): string[] {
    const team = this.getTeam(teamId);
    if (!team) return [];

    const agentIds: string[] = [];
    for (const member of team.members) {
      const agentId = `${teamId}-${member.role}-${member.personaId}`;
      const capabilities: AgentCapability[] = [
        {
          id: teamId,
          description: `Execute ${teamId} workflow`,
          confidence: 1.0,
          artifactTypes: [],
        },
        {
          id: `role-${member.role}`,
          description: `Act as ${member.role}`,
          confidence: 0.9,
        },
      ];

      agentRegistry.register(
        agentId,
        `${member.personaId} (${member.role})`,
        member.role,
        member.personaId,
        capabilities
      );

      // Subscribe to handoff requests for this agent role
      agentMessageBus.subscribe(agentId, `handoff.${agentId}.#`, async (msg) => {
        agentRegistry.updateStatus(agentId, 'busy');
        // Processing occurs via the existing ACP session pipeline
      });

      agentIds.push(agentId);
      logger.debug(`[Bus] Registered ${agentId} for team ${teamId}`);
    }

    // Notify the bus
    agentMessageBus.publish(`team.${teamId}.registered`, {
      teamId,
      agentIds,
      memberCount: team.members.length,
    }).catch(() => {});

    return agentIds;
  }

  /**
   * Deregister team members from the bus after execution completes.
   */
  private deregisterTeamFromBus(agentIds: string[]): void {
    for (const agentId of agentIds) {
      agentRegistry.updateStatus(agentId, 'offline');
      agentRegistry.unregister(agentId);
      agentMessageBus.unsubscribeAgent(agentId);
    }
  }

  /**
   * Get a team by ID from the registry.
   */
  private getTeam(teamId: string): typeof TEAM_REGISTRY[string] | undefined {
    // Import all TEAM_REGISTRY keys at the top of this file via the const
    return TEAM_REGISTRY[teamId];
  }

  async executeTeam(
    teamId: string,
    task: string,
    artifact: any,
    model: BmadModel,
    store: any,
    bmadPath: string,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<AcpSessionResult[]> {
    const team = TEAM_REGISTRY[teamId];
    if (!team) throw new Error(`Team "${teamId}" not found`);

    // Create a team-level trace session for observability
    const teamTraceSessionId = `team-${teamId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const teamStartTime = Date.now();

    // Register team agents on the message bus for dynamic discovery
    const busAgentIds = this.registerTeamOnBus(teamId);

    let cancelled = false;
    const cancellationListener = token?.onCancellationRequested(() => {
      cancelled = true;
    });

    const results: AcpSessionResult[] = [];
    let currentArtifact = artifact;
    let previousSessionId: string | undefined;

    // Record team execution started
    try {
      getTraceRecorder().record({
        sessionId: teamTraceSessionId,
        type: 'decision',
        agent: 'team-orchestrator',
        data: {
          decision: `Team execution started: ${teamId}`,
          rationale: `Task: ${task.substring(0, 200)}`,
          artifactId: artifact?.id,
          artifactType: artifact?.type,
          changeSummary: `Team has ${team.members.length} member(s): ${team.members.map(m => m.role).join(', ')}`,
        },
      });
    } catch { /* trace recorder may not be initialized */ }

    try {
      for (const member of team.members.sort((a, b) => a.order - b.order)) {
        if (cancelled) {
          logger.info('Team execution cancelled', { teamId, stoppedAt: member.role });
          break;
        }

        stream?.markdown(`\n\n**🤖 ${member.role}** is working...\n\n`);

        const roleTask = this.buildRoleTask(member.role, task, currentArtifact, results);

        const spec: AcpSessionSpec = {
          role: member.role,
          personaId: member.personaId,
          context: {
            task: roleTask,
            artifact: currentArtifact,
            parentSessionId: previousSessionId,
            // Surface the originating BMAD workflow on the spec so the
            // Agent Sessions sidebar (AgentSessionsViewProvider) can show
            // which workflow a team run belongs to. Without this the row
            // falls back to role-only identification.
            workflowId: teamId,
          },
          config: { executionMode: 'autonomous' },
        };

        const session = await acpSessionManager.spawn(spec, bmadPath);
        const agentStartTime = Date.now();

        // Record agent session started trace
        try {
          getTraceRecorder().record({
            sessionId: teamTraceSessionId,
            type: 'decision',
            agent: 'team-orchestrator',
            data: {
              decision: `Agent started: ${member.role}`,
              rationale: `Persona: ${member.personaId}, acp-session: ${session.id}`,
              artifactId: artifact?.id,
              artifactType: artifact?.type,
              changeSummary: `Session ID: ${session.id}`,
            },
          });
        } catch { /* trace recorder may not be initialized */ }

        const result = await acpSessionManager.execute(session.id, model, store, stream, token);
        const agentDurationMs = Date.now() - agentStartTime;

        currentArtifact = result.output || currentArtifact;
        previousSessionId = session.id;
        results.push(result);

        if (result.status === 'completed') {
          // Record agent completed trace — includes tool call count and duration
          try {
            getTraceRecorder().record({
              sessionId: teamTraceSessionId,
              type: 'decision',
              agent: 'team-orchestrator',
              data: {
                decision: `Agent completed: ${member.role}`,
                rationale: `${result.toolCalls} tool call(s) in ${agentDurationMs}ms`,
                artifactId: artifact?.id,
                artifactType: artifact?.type,
                changeSummary: `Tool calls: ${result.toolCalls}`,
              },
              durationMs: agentDurationMs,
            });
          } catch { /* trace recorder may not be initialized */ }

          stream?.markdown(`\n\n✅ **${member.role}** completed (${result.toolCalls} tool calls, ${agentDurationMs}ms)\n\n`);
        } else {
          // Record agent failed trace with error details
          try {
            getTraceRecorder().record({
              sessionId: teamTraceSessionId,
              type: 'error',
              agent: 'team-orchestrator',
              data: {
                decision: `Agent failed: ${member.role}`,
                error: result.error ?? 'unknown error',
                artifactId: artifact?.id,
                artifactType: artifact?.type,
                contextSummary: `Tool calls before failure: ${result.toolCalls}`,
              },
              durationMs: agentDurationMs,
            });
          } catch { /* trace recorder may not be initialized */ }

          stream?.markdown(`\n\n❌ **${member.role}** failed: ${result.error ?? 'unknown error'}\n\n`);
          break;
        }
      }

      // Record team execution completed trace with aggregate stats
      const totalDurationMs = Date.now() - teamStartTime;
      const totalToolCalls = results.reduce((sum, r) => sum + r.toolCalls, 0);
      const completedCount = results.filter(r => r.status === 'completed').length;
      const failedCount = results.filter(r => r.status === 'failed').length;

      try {
        getTraceRecorder().record({
          sessionId: teamTraceSessionId,
          type: 'decision',
          agent: 'team-orchestrator',
          data: {
            decision: `Team execution completed: ${teamId}`,
            rationale: `${completedCount} completed, ${failedCount} failed, ${totalToolCalls} tool calls in ${totalDurationMs}ms`,
            artifactId: artifact?.id,
            artifactType: artifact?.type,
            changeSummary: `Roles: ${results.map(r => r.role).join(', ')}`,
          },
          durationMs: totalDurationMs,
        });
      } catch { /* trace recorder may not be initialized */ }

      return results;
    } catch (error) {
      // Record team execution failed trace
      try {
        getTraceRecorder().record({
          sessionId: teamTraceSessionId,
          type: 'error',
          agent: 'team-orchestrator',
          data: {
            decision: `Team execution failed: ${teamId}`,
            error: errMsg(error),
            artifactId: artifact?.id,
            artifactType: artifact?.type,
            contextSummary: `${results.length} member(s) completed before failure`,
          },
          durationMs: Date.now() - teamStartTime,
        });
      } catch { /* trace recorder may not be initialized */ }

      logger.error('Team execution error', { teamId, error: errMsg(error) });
      throw error;
    } finally {
      // Deregister team agents from the bus
      this.deregisterTeamFromBus(busAgentIds);
      cancellationListener?.dispose();
    }
  }

  private buildRoleTask(
    role: AgentRole,
    originalTask: string,
    artifact: any,
    previousResults: AcpSessionResult[]
  ): string {
    switch (role) {
      case 'coordinator':
        return `Decompose this task into actionable steps and plan the implementation:\n\n${originalTask}`;
      case 'crafter':
        return `Implement the following task using the artifact and previous context:\n\nTask: ${originalTask}\n\nArtifact context: ${JSON.stringify(artifact, null, 2)}`;
      case 'gate':
        return `Verify the output from previous steps meets quality standards. Review the following:\n\nTask: ${originalTask}\n\nPrevious outputs: ${JSON.stringify(previousResults.map(r => ({ role: r.role, output: r.output, status: r.status })))}`;
      case 'researcher':
        return `Research and gather information relevant to:\n\n${originalTask}`;
      default:
        return originalTask;
    }
  }
}
