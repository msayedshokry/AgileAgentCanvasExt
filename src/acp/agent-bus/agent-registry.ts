// ─── Agent Registry ──────────────────────────────────────────────────────────
// Dynamic agent registry that enables runtime discovery of agents by
// capability, role, or status.  Replaces static TEAM_REGISTRY lookups
// with a queryable, heartbeat-aware registry.
//
// Agents register themselves on activation and update their status as
// they become busy/idle.  The registry supports capability-based
// discovery so agents can find the right peer for a handoff at runtime.

import { createLogger } from '../../utils/logger';
import {
  AgentRegistration,
  AgentCapability,
  AgentStatus,
  DiscoveryQuery,
} from './types';

const logger = createLogger('agent-registry');

// ─── Singleton Registry ─────────────────────────────────────────────────────

export class AgentRegistry {
  private agents = new Map<string, AgentRegistration>();
  private heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private readonly heartbeatInterval = 30_000; // 30s default TTL

  // ── Registration ───────────────────────────────────────────────────────

  /**
   * Register an agent with its capabilities.
   * If the agent already exists, updates its registration.
   */
  register(
    id: string,
    name: string,
    role: AgentRegistration['role'],
    personaId: string,
    capabilities: AgentCapability[],
    metadata?: Record<string, unknown>
  ): void {
    const existing = this.agents.get(id);
    this.agents.set(id, {
      id,
      name,
      role,
      personaId,
      capabilities,
      status: 'idle',
      lastSeen: new Date().toISOString(),
      metadata: { ...(existing?.metadata || {}), ...metadata },
    });

    this.startHeartbeat(id);
    logger.info(`Agent registered: ${name} (${id}) — ${capabilities.length} capabilities`);
  }

  /**
   * Unregister an agent (e.g. on deactivation or shutdown).
   */
  unregister(id: string): void {
    this.agents.delete(id);
    this.stopHeartbeat(id);
    logger.info(`Agent unregistered: ${id}`);
  }

  /**
   * Update the status of a registered agent.
   * Returns false if the agent is not registered.
   */
  updateStatus(id: string, status: AgentStatus): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.status = status;
    agent.lastSeen = new Date().toISOString();
    return true;
  }

  /**
   * Update capabilities for an existing agent.
   */
  updateCapabilities(id: string, capabilities: AgentCapability[]): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.capabilities = capabilities;
    agent.lastSeen = new Date().toISOString();
    return true;
  }

  /**
   * Record a heartbeat for an agent (updates lastSeen).
   */
  heartbeat(id: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.lastSeen = new Date().toISOString();
    return true;
  }

  // ── Discovery ──────────────────────────────────────────────────────────

  /**
   * Find agents matching a discovery query.
   * Combines role filter + required capabilities (AND) + preferred capabilities (OR sorting).
   */
  discover(query: DiscoveryQuery): AgentRegistration[] {
    let results = Array.from(this.agents.values());

    // Filter by role
    if (query.role) {
      results = results.filter(a => a.role === query.role);
    }

    // Filter by status
    if (query.status) {
      results = results.filter(a => a.status === query.status);
    }

    // Filter by artifact type
    if (query.artifactType) {
      results = results.filter(a =>
        a.capabilities.some(c =>
          c.artifactTypes?.includes(query.artifactType!)
        )
      );
    }

    // Filter by required capabilities (AND — all must be present)
    if (query.requiredCapabilities?.length) {
      results = results.filter(a =>
        query.requiredCapabilities!.every(reqCap =>
          a.capabilities.some(c => c.id === reqCap)
        )
      );
    }

    // Score for preferred capabilities (OR — any match boosts score)
    if (query.preferredCapabilities?.length) {
      results = results.map(a => ({
        ...a,
        _score: a.capabilities.filter(c =>
          query.preferredCapabilities!.includes(c.id)
        ).length,
      })).sort((a: any, b: any) => b._score - a._score);
    }

    // Sort by requested field
    if (query.sortBy) {
      results.sort((a, b) => {
        let cmp = 0;
        switch (query.sortBy) {
          case 'confidence':
            cmp = this.maxConfidence(b) - this.maxConfidence(a);
            break;
          case 'lastSeen':
            cmp = b.lastSeen.localeCompare(a.lastSeen);
            break;
          case 'name':
            cmp = a.name.localeCompare(b.name);
            break;
        }
        return query.sortDirection === 'asc' ? -cmp : cmp;
      });
    }

    // Apply limit
    if (query.limit && results.length > query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Find the best agent for a given capability.
   * Prefers idle agents, then by confidence, then by lastSeen.
   */
  findOptimalAgent(capabilityId: string, artifactType?: string): AgentRegistration | null {
    const candidates = this.discover({
      requiredCapabilities: [capabilityId],
      artifactType,
      status: 'idle',
      sortBy: 'confidence',
      sortDirection: 'desc',
      limit: 1,
    });

    if (candidates.length > 0) return candidates[0];

    // Fallback: include busy agents (they might accept a handoff)
    const busyCandidates = this.discover({
      requiredCapabilities: [capabilityId],
      artifactType,
      sortBy: 'confidence',
      sortDirection: 'desc',
      limit: 1,
    });

    return busyCandidates[0] || null;
  }

  /**
   * Get a specific agent by ID.
   */
  getAgent(id: string): AgentRegistration | undefined {
    return this.agents.get(id);
  }

  /**
   * Get all registered agents.
   */
  getAllAgents(): AgentRegistration[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by role.
   */
  getAgentsByRole(role: AgentRegistration['role']): AgentRegistration[] {
    return this.discover({ role });
  }

  /**
   * Get agents that are currently idle (available for handoffs).
   */
  getIdleAgents(): AgentRegistration[] {
    return this.discover({ status: 'idle' });
  }

  /**
   * Prune agents that haven't sent a heartbeat within the TTL.
   * Returns the IDs of pruned agents.
   */
  pruneStaleAgents(): string[] {
    const now = Date.now();
    const stale: string[] = [];
    for (const [id, agent] of this.agents) {
      const lastSeen = new Date(agent.lastSeen).getTime();
      if (now - lastSeen > this.heartbeatInterval * 3) {
        stale.push(id);
        this.unregister(id);
      }
    }
    if (stale.length > 0) {
      logger.info(`Pruned ${stale.length} stale agent(s): ${stale.join(', ')}`);
    }
    return stale;
  }

  /**
   * Get registry statistics.
   */
  getStats(): { total: number; idle: number; busy: number; offline: number; error: number } {
    const all = this.getAllAgents();
    return {
      total: all.length,
      idle: all.filter(a => a.status === 'idle').length,
      busy: all.filter(a => a.status === 'busy').length,
      offline: all.filter(a => a.status === 'offline').length,
      error: all.filter(a => a.status === 'error').length,
    };
  }

  /** Reset the registry (for testing). */
  reset(): void {
    for (const id of this.agents.keys()) {
      this.stopHeartbeat(id);
    }
    this.agents.clear();
    logger.info('Agent registry reset');
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  private maxConfidence(agent: AgentRegistration): number {
    return Math.max(...agent.capabilities.map(c => c.confidence), 0);
  }

  private startHeartbeat(id: string): void {
    this.stopHeartbeat(id);
    const timer = setInterval(() => {
      const agent = this.agents.get(id);
      if (agent) {
        agent.lastSeen = new Date().toISOString();
      }
    }, this.heartbeatInterval);
    this.heartbeatTimers.set(id, timer);
  }

  private stopHeartbeat(id: string): void {
    const timer = this.heartbeatTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(id);
    }
  }
}

// Singleton
export const agentRegistry = new AgentRegistry();
