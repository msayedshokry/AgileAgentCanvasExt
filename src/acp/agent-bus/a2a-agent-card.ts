// ─── A2A Agent Card ──────────────────────────────────────────────────────────
// Generates A2A-standard Agent Cards from AgentRegistration records.
//
// Maps AAC's internal agent representation to the A2A protocol Agent Card
// format (compatible with A2A spec v0.3). Agent Cards enable external A2A
// clients to discover AAC agent capabilities, skills, and RPC endpoints.
//
// The generated card includes:
//   - name, description, version, protocolVersion
//   - url (RPC endpoint for JSON-RPC calls)
//   - skills derived from AgentCapability[]
//   - capabilities (streaming, pushNotifications)
//   - defaultInputModes / defaultOutputModes
//
// Usage:
//   import { generateAgentCard, generateAllAgentCards } from './a2a-agent-card';
//   const card = generateAgentCard(agentRegistry.getAgent('my-agent')!);

import { createLogger } from '../../utils/logger';
const logger = createLogger('a2a-agent-card');

import { agentRegistry } from './agent-registry';
import type { AgentRegistration, AgentCapability } from './types';

// ─── A2A Agent Card Types ────────────────────────────────────────────────────

/** A2A Agent Skill — derived from AgentCapability */
export interface A2AAgentSkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

/** A2A Agent Card — matches A2A protocol spec v0.3 */
export interface A2AAgentCard {
  /** Human-readable name */
  name: string;
  /** Description of the agent's purpose */
  description: string;
  /** A2A protocol version (e.g. "0.3.0") */
  protocolVersion: string;
  /** Agent implementation version */
  version: string;
  /** RPC endpoint URL for JSON-RPC calls */
  url: string;
  /** Skills the agent supports */
  skills: A2AAgentSkill[];
  /** Capability flags */
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
  };
  /** Default input content types */
  defaultInputModes?: string[];
  /** Default output content types */
  defaultOutputModes?: string[];
  /** Optional provider info */
  provider?: {
    name: string;
    url?: string;
  };
  /** Additional interfaces (e.g. event streams) */
  additionalInterfaces?: Array<{
    url: string;
    transport: 'JSONRPC' | 'HTTP' | 'SSE';
  }>;
  /** Link to documentation */
  documentationUrl?: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const CONFIG = {
  /** Default protocol version */
  PROTOCOL_VERSION: '0.3.0',
  /** Default agent version */
  VERSION: '0.2.0',
  /** Default RPC endpoint path (relative to base URL) */
  RPC_PATH: '/api/a2a/rpc',
  /** Default input modes */
  DEFAULT_INPUT_MODES: ['text/plain'],
  /** Default output modes */
  DEFAULT_OUTPUT_MODES: ['text/plain', 'application/json'],
};

// ─── Capability → Skill Mapping ──────────────────────────────────────────────

/**
 * Role-based tags that augment the skill's tag list.
 * These help A2A clients filter agents by role categories.
 */
const ROLE_TAGS: Record<string, string[]> = {
  coordinator: ['coordination', 'orchestration', 'planning'],
  crafter: ['coding', 'implementation', 'development'],
  gate: ['review', 'verification', 'quality'],
  researcher: ['research', 'analysis', 'discovery'],
};

/**
 * Map an AgentCapability to an A2A skill.
 */
function capabilityToSkill(cap: AgentCapability): A2AAgentSkill {
  // Derive tags from capability ID and artifact types
  const tags = [
    ...cap.id.split('-'),
    ...(cap.artifactTypes || []),
  ].filter(t => t.length > 0);

  return {
    id: cap.id,
    name: cap.description.split('.')[0] || cap.id,
    description: cap.description,
    tags: [...new Set(tags)], // deduplicate
    inputModes: CONFIG.DEFAULT_INPUT_MODES,
    outputModes: CONFIG.DEFAULT_OUTPUT_MODES,
    examples: [
      `Execute ${cap.id} workflow`,
      `Process artifacts of type: ${(cap.artifactTypes || ['any']).join(', ')}`,
    ],
  };
}

/**
 * Derive tags from an agent's role and capabilities.
 */
function deriveSkillTags(
  registration: AgentRegistration,
  cap: AgentCapability
): string[] {
  const roleTags = ROLE_TAGS[registration.role] || [];
  const capTags = cap.id.split('-');
  const typeTags = cap.artifactTypes || [];
  return [...new Set([...roleTags, ...capTags, ...typeTags])];
}

// ─── Agent Card Generation ───────────────────────────────────────────────────

/**
 * Generate an A2A-standard Agent Card from an AgentRegistration.
 *
 * @param registration - The agent registration to generate a card for
 * @param baseUrl - Optional base URL for RPC endpoint (defaults to localhost)
 * @returns A complete A2A Agent Card
 */
export function generateAgentCard(
  registration: AgentRegistration,
  baseUrl: string = 'http://localhost:0'
): A2AAgentCard {
  const rpcUrl = `${baseUrl.replace(/\/$/, '')}${CONFIG.RPC_PATH}?agentId=${encodeURIComponent(registration.id)}`;

  const skills: A2AAgentSkill[] = registration.capabilities.map(cap => ({
    ...capabilityToSkill(cap),
    tags: deriveSkillTags(registration, cap),
  }));

  const card: A2AAgentCard = {
    name: registration.name,
    description: `${registration.role} agent (${registration.personaId}) with ${registration.capabilities.length} capabilities. Status: ${registration.status}.`,
    protocolVersion: CONFIG.PROTOCOL_VERSION,
    version: CONFIG.VERSION,
    url: rpcUrl,
    skills,
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    defaultInputModes: CONFIG.DEFAULT_INPUT_MODES,
    defaultOutputModes: CONFIG.DEFAULT_OUTPUT_MODES,
    provider: {
      name: 'AgileAgentCanvas',
      url: 'https://github.com/bmad-code-org/agile-agent-canvas',
    },
    additionalInterfaces: [
      {
        url: rpcUrl,
        transport: 'JSONRPC',
      },
    ],
    documentationUrl: `${baseUrl.replace(/\/$/, '')}/a2a/${encodeURIComponent(registration.id)}`,
  };

  logger.debug(
    `[A2A] Generated Agent Card for ${registration.id}: ${skills.length} skills`
  );

  return card;
}

/**
 * Generate Agent Cards for all registered agents.
 *
 * @param baseUrl - Optional base URL for RPC endpoints
 * @returns Map of agent ID → Agent Card
 */
export function generateAllAgentCards(
  baseUrl: string = 'http://localhost:0'
): Map<string, A2AAgentCard> {
  const cards = new Map<string, A2AAgentCard>();
  for (const agent of agentRegistry.getAllAgents()) {
    cards.set(agent.id, generateAgentCard(agent, baseUrl));
  }
  logger.debug(`[A2A] Generated ${cards.size} Agent Cards`);
  return cards;
}

/**
 * Generate a platform-level Agent Card representing the AAC workspace.
 * This is the card that external tools would discover first.
 *
 * @param baseUrl - Base URL for RPC endpoints
 * @returns Platform-level Agent Card
 */
export function generatePlatformAgentCard(
  baseUrl: string = 'http://localhost:0'
): A2AAgentCard {
  const stats = agentRegistry.getStats();
  const rpcUrl = `${baseUrl.replace(/\/$/, '')}${CONFIG.RPC_PATH}`;

  return {
    name: 'AgileAgentCanvas ACP Coordinator',
    description:
      `Multi-agent coordination platform with ${stats.total} agents ` +
      `(${stats.idle} idle, ${stats.busy} busy). ` +
      'Supports BMAD workflows, kanban orchestration, and ACP team execution.',
    protocolVersion: CONFIG.PROTOCOL_VERSION,
    version: CONFIG.VERSION,
    url: rpcUrl,
    skills: [
      {
        id: 'agent-coordination',
        name: 'Agent Coordination',
        description: 'Create, delegate tasks to, and coordinate multiple AI agents',
        tags: ['coordination', 'multi-agent', 'orchestration', 'planning'],
        examples: [
          'Create a new feature implementation',
          'Review code changes for quality',
          'Plan a sprint with capacity estimation',
        ],
        inputModes: CONFIG.DEFAULT_INPUT_MODES,
        outputModes: CONFIG.DEFAULT_OUTPUT_MODES,
      },
      {
        id: 'kanban-orchestration',
        name: 'Kanban Orchestration',
        description: 'Manage work items through a 4-lane kanban with automated transitions',
        tags: ['kanban', 'workflow', 'agile', 'scrum'],
        examples: [
          'Move story to In Progress with dev-executor',
          'Review completed work with review-guard',
        ],
        inputModes: CONFIG.DEFAULT_INPUT_MODES,
        outputModes: CONFIG.DEFAULT_OUTPUT_MODES,
      },
      {
        id: 'aac-workflows',
        name: 'BMAD Workflows',
        description: 'Execute BMAD methodology workflows for product development',
        tags: ['bmad', 'methodology', 'product', 'development'],
        examples: [
          'Create PRD from product brief',
          'Generate epics and stories from architecture',
          'Execute dev-story implementation',
        ],
        inputModes: CONFIG.DEFAULT_INPUT_MODES,
        outputModes: CONFIG.DEFAULT_OUTPUT_MODES,
      },
    ],
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    defaultInputModes: CONFIG.DEFAULT_INPUT_MODES,
    defaultOutputModes: CONFIG.DEFAULT_OUTPUT_MODES,
    provider: {
      name: 'AgileAgentCanvas',
      url: 'https://github.com/bmad-code-org/agile-agent-canvas',
    },
    additionalInterfaces: [
      { url: rpcUrl, transport: 'JSONRPC' },
    ],
    documentationUrl: `${baseUrl.replace(/\/$/, '')}/a2a`,
  };
}

/**
 * Validate an Agent Card has the required fields.
 * Throws if the card is invalid.
 */
export function validateAgentCard(card: unknown, source: string): asserts card is A2AAgentCard {
  if (!card || typeof card !== 'object') {
    throw new Error(`A2A Agent Card validation failed (${source}): must be an object`);
  }
  const c = card as Partial<A2AAgentCard>;
  if (!c.name || typeof c.name !== 'string') {
    throw new Error(`A2A Agent Card validation failed (${source}): missing 'name'`);
  }
  if (!c.version || typeof c.version !== 'string') {
    throw new Error(`A2A Agent Card validation failed (${source}): missing 'version'`);
  }
  if (!c.url || typeof c.url !== 'string') {
    throw new Error(`A2A Agent Card validation failed (${source}): missing 'url' (RPC endpoint)`);
  }
  if (!c.protocolVersion || typeof c.protocolVersion !== 'string') {
    throw new Error(`A2A Agent Card validation failed (${source}): missing 'protocolVersion'`);
  }
  if (c.skills !== undefined && !Array.isArray(c.skills)) {
    throw new Error(`A2A Agent Card validation failed (${source}): 'skills' must be an array`);
  }
}

/**
 * Extract the RPC endpoint URL from an Agent Card.
 */
export function getRpcEndpoint(card: A2AAgentCard): string {
  return card.url;
}

/**
 * Check if an Agent Card supports a specific skill by ID.
 */
export function hasSkill(card: A2AAgentCard, skillId: string): boolean {
  return card.skills?.some(skill => skill.id === skillId) ?? false;
}

/**
 * Get all skill IDs from an Agent Card.
 */
export function getSkillIds(card: A2AAgentCard): string[] {
  return card.skills?.map(skill => skill.id) ?? [];
}
