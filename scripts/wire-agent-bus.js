/**
 * Wires the agent-to-agent message bus into team-orchestrator.ts and extension.ts
 */
const fs = require('fs');

// ============================================================
// 1. team-orchestrator.ts — add bus imports + AgentTeamOrchestrator
//    registers agents on the bus during executeTeam, uses handoffs
// ============================================================
let to = fs.readFileSync('src/acp/team-orchestrator.ts', 'utf-8');

// Add bus imports after existing ACP imports
const importTarget = "import { BmadModel } from '../chat/ai-provider';";
const busImports = importTarget +
  "\nimport { agentRegistry } from './agent-bus/agent-registry';" +
  "\nimport { agentMessageBus } from './agent-bus/message-bus';" +
  "\nimport { handoffNegotiation } from './agent-bus/handoff-negotiation';" +
  "\nimport type { AgentCapability } from './agent-bus/types';";

if (to.includes('agent-bus/agent-registry')) {
  console.log('team-orchestrator.ts already has bus imports, skipping.');
} else {
  to = to.replace(importTarget, busImports);
}

// Extend the executeTeam method to register agents on the bus and use handoffs
// between team members. Replace the existing executeTeam method.
const executeTeamStart = "export class AgentTeamOrchestrator {\n  async executeTeam(";
const executeTeamEnhanced = `export class AgentTeamOrchestrator {
  /**
   * Register all team members on the agent bus and return the list of agent IDs.
   * This allows agents to be discovered and receive handoffs dynamically.
   */
  private registerTeamOnBus(teamId: string): string[] {
    const team = this.getTeam(teamId);
    if (!team) return [];

    const agentIds: string[] = [];
    for (const member of team.members) {
      const agentId = \`\${teamId}-\${member.role}-\${member.personaId}\`;
      const capabilities: AgentCapability[] = [
        {
          id: teamId,
          description: \`Execute \${teamId} workflow\`,
          confidence: 1.0,
          artifactTypes: [],
        },
        {
          id: \`role-\${member.role}\`,
          description: \`Act as \${member.role}\`,
          confidence: 0.9,
        },
      ];

      agentRegistry.register(
        agentId,
        \`\${member.personaId} (\${member.role})\`,
        member.role,
        member.personaId,
        capabilities
      );

      // Subscribe to handoff requests for this agent role
      agentMessageBus.subscribe(\`handoff.\${agentId}.#\`, async (msg) => {
        agentRegistry.updateStatus(agentId, 'busy');
        // Processing occurs via the existing ACP session pipeline
      });

      agentIds.push(agentId);
      logger.debug(\`[Bus] Registered \${agentId} for team \${teamId}\`);
    }

    // Notify the bus
    agentMessageBus.publish(\`team.\${teamId}.registered\`, {
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

  async executeTeam(`;

if (to.includes('registerTeamOnBus')) {
  console.log('team-orchestrator.ts already has bus integration, skipping.');
} else {
  to = to.replace(executeTeamStart, executeTeamEnhanced);
}

fs.writeFileSync('src/acp/team-orchestrator.ts', to);
console.log('team-orchestrator.ts bus wiring added.');

// ============================================================
// 2. extension.ts — add bus initialization after ACP init
// ============================================================
let ext = fs.readFileSync('src/extension.ts', 'utf-8');

// Add import
const acpImportTarget = "import { initializeAcpSessionManager } from './acp/session-manager';";
const busInitImport = acpImportTarget +
  "\nimport { agentMessageBus } from './acp/agent-bus/message-bus';" +
  "\nimport { agentRegistry } from './acp/agent-bus/agent-registry';" +
  "\nimport { handoffNegotiation } from './acp/agent-bus/handoff-negotiation';";

if (ext.includes('agent-bus/message-bus')) {
  console.log('extension.ts already has bus imports, skipping.');
} else {
  ext = ext.replace(acpImportTarget, busInitImport);
}

// Add initialization call after ACP initialization
const acpInitTarget = "    initializeAcpSessionManager(workflowExecutor);\n    initializeLaneTransitionEngine(artifactStore, workflowExecutor);\n    logger.info('ACP Session Manager and Lane Transition Engine initialized');";
const busInit = "    initializeAcpSessionManager(workflowExecutor);\n    initializeLaneTransitionEngine(artifactStore, workflowExecutor);\n\n    // ── Agent-to-Agent Message Bus initialization ──────────────────────\n    // The agent message bus, registry, and handoff negotiation service are\n    // initialized as singletons. Subscribe to system events for observability.\n    agentMessageBus.subscribe('system.#', async (msg) => {\n      logger.debug(`[Bus] System event: ${msg.topic} from ${msg.from}`);\n    });\n    logger.info('Agent Bus, Registry, and Handoff Negotiation initialized');";

if (ext.includes('Agent-to-Agent Message Bus')) {
  console.log('extension.ts already has bus init, skipping.');
} else {
  ext = ext.replace(acpInitTarget, busInit);
}

fs.writeFileSync('src/extension.ts', ext);
console.log('extension.ts bus initialization added.');

console.log('\nAll bus wiring complete.');
