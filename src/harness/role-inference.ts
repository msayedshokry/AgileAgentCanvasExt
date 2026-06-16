/**
 * Role inference from workflow IDs.
 *
 * Single source of truth for mapping a BMAD/agentic workflow id (e.g. 'dev-story',
 * 'code-review') to the agent role label that should be advertised in agentic-orchestration
 * surfaces (terminal sessions, webview chat-bridge messages, etc).
 *
 * Historically this function lived in src/workflow/terminal-executor.ts and was
 * imported by both src/workflow/terminal-executor.ts and src/views/agentic-kanban-message-handler.ts.
 * That coupling forced views/ to depend on workflow/. Moving the function here
 * (alongside cross-artifact-detector and policy-engine) puts the role-mapping
 * behind a domain-neutral utility module.
 *
 * Extracted as part of issue #38 cleanup.
 */

export type AgentRole =
    | 'Crafter'
    | 'Reviewer'
    | 'Planner'
    | 'Analyst'
    | 'Strategist'
    | 'Agent';

const WORKFLOW_TO_ROLE: Record<string, AgentRole> = {
    'dev-story': 'Crafter',
    'code-review': 'Reviewer',
    'sprint-planning': 'Planner',
    'story-enhancement': 'Analyst',
    'epic-enhancement': 'Analyst',
    'create-prd': 'Strategist',
};

/**
 * Map a workflow id to the agent role label that should own it.
 * Falls back to 'Agent' when the workflow has no explicit mapping.
 */
export function inferRoleFromWorkflow(workflowId: string): AgentRole {
    return WORKFLOW_TO_ROLE[workflowId] ?? 'Agent';
}
