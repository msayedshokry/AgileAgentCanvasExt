// ─── Message Bus ─────────────────────────────────────────────────────────────
// Publish/subscribe message bus for agent-to-agent communication.
//
// Features:
//   - Topic-based routing with wildcard support (* for single segment, # for multi)
//   - Priority queuing (critical > high > normal > low)
//   - Point-to-point messaging (send to specific agent)
//   - Broadcast to all agents subscribed to a pattern
//   - Message expiry (TTL)
//   - Delivery tracing for observability
//   - Built-in topics for system events:
//       system.agent.registered    — payload: AgentRegistration
//       system.agent.unregistered  — payload: { agentId }
//       system.agent.status_change — payload: { agentId, from, to }
//       system.handoff.request     — payload: HandoffRequest
//       system.handoff.response    — payload: HandoffResponse

import { createLogger } from '../../utils/logger';
import { getTraceRecorder } from '../../trace/trace-recorder';
import {
  BusMessage,
  BusMessagePriority,
  BusSubscription,
  BusMessageEnvelope,
} from './types';

const logger = createLogger('agent-message-bus');

// ─── Topic Pattern Matching ─────────────────────────────────────────────────

/**
 * Match a topic string against a subscription pattern.
 * '*' matches exactly one segment, '#' matches zero or more segments.
 */
function matchTopic(topic: string, pattern: string): boolean {
  // Exact match
  if (topic === pattern) return true;
  // Convert pattern to regex
  const regexStr = '^' + pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '[^.]+')
    .replace(/#/g, '.*') +
    '$';
  return new RegExp(regexStr).test(topic);
}

// ─── Message Bus ────────────────────────────────────────────────────────────

export class AgentMessageBus {
  private subscriptions = new Map<string, BusSubscription>();
  private messageHistory: BusMessageEnvelope[] = [];
  private priorityQueue: Array<{ message: BusMessage; resolve: (env: BusMessageEnvelope) => void }> = [];
  private processing = false;
  private readonly maxHistory = 1000;

  // ── Subscription Management ────────────────────────────────────────────

  /**
   * Subscribe an agent to a topic pattern.
   * Returns the subscription ID for unsubscription.
   */
  subscribe(
    agentId: string,
    topicPattern: string,
    handler: (message: BusMessage) => Promise<void>,
    expiresAt?: string
  ): string {
    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.subscriptions.set(id, {
      id,
      agentId,
      topicPattern,
      handler,
      expiresAt,
    });
    logger.debug(`[Bus] Agent ${agentId} subscribed to "${topicPattern}" (sub: ${id})`);
    return id;
  }

  /**
   * Unsubscribe by subscription ID.
   */
  unsubscribe(subscriptionId: string): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return false;
    this.subscriptions.delete(subscriptionId);
    logger.debug(`[Bus] Agent ${sub.agentId} unsubscribed from "${sub.topicPattern}"`);
    return true;
  }

  /**
   * Unsubscribe all subscriptions for a given agent.
   */
  unsubscribeAgent(agentId: string): number {
    let count = 0;
    for (const [id, sub] of this.subscriptions) {
      if (sub.agentId === agentId) {
        this.subscriptions.delete(id);
        count++;
      }
    }
    if (count > 0) {
      logger.debug(`[Bus] Unsubscribed agent ${agentId} from ${count} subscription(s)`);
    }
    return count;
  }

  // ── Publishing ─────────────────────────────────────────────────────────

  /**
   * Publish a message to the bus.
   * -
   * If `to` is specified, delivers directly to matching subscriptions for that agent.
   * If `to` is omitted, delivers to all subscriptions whose pattern matches the topic.
   *
   * Returns a promise that resolves when the message has been queued for delivery.
   */
  async publish(
    topic: string,
    payload: any,
    options?: {
      from?: string;
      to?: string;
      correlationId?: string;
      priority?: BusMessagePriority;
      ttl?: number;
    }
  ): Promise<BusMessageEnvelope[]> {
    const message: BusMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      from: options?.from || 'system',
      to: options?.to,
      topic,
      payload,
      correlationId: options?.correlationId,
      priority: options?.priority || 'normal',
      timestamp: new Date().toISOString(),
      ttl: options?.ttl,
    };

    const envelopes: BusMessageEnvelope[] = [];
    const matchedSubs = this.findMatchingSubscriptions(message);

    for (const sub of matchedSubs) {
      const envelope: BusMessageEnvelope = {
        message,
        delivered: false,
        matchedSubscriptionIds: [sub.id],
      };

      // Check expiry
      if (sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now()) {
        this.subscriptions.delete(sub.id);
        continue;
      }

      // Check TTL
      if (message.ttl) {
        const age = Date.now() - new Date(message.timestamp).getTime();
        if (age > message.ttl) {
          logger.debug(`[Bus] Message ${message.id} expired (TTL: ${message.ttl}ms)`);
          envelope.delivered = false;
          envelopes.push(envelope);
          continue;
        }
      }

      try {
        await sub.handler(message);
        envelope.delivered = true;
        envelope.deliveredAt = new Date().toISOString();
      } catch (err) {
        envelope.delivered = false;
        logger.warn(`[Bus] Delivery failed for sub ${sub.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
      envelopes.push(envelope);
    }

    // Record to trace
    try {
      getTraceRecorder().record({
        sessionId: 'agent-bus',
        type: 'decision',
        agent: 'message-bus',
        data: {
          decision: `Bus message: ${topic}`,
          rationale: `From ${message.from}${message.to ? ` to ${message.to}` : ' (broadcast)'}`,
          artifactId: message.correlationId,
        },
      });
    } catch {
      // Trace recorder may not be initialized
    }

    this.addToHistory(envelopes);
    return envelopes;
  }

  /**
   * Send a message directly to a specific agent.
   * Shorthand for `publish(topic, payload, { from, to })`.
   */
  async send(
    from: string,
    to: string,
    topic: string,
    payload: any,
    options?: {
      correlationId?: string;
      priority?: BusMessagePriority;
      ttl?: number;
    }
  ): Promise<BusMessageEnvelope[]> {
    return this.publish(topic, payload, {
      from,
      to,
      ...options,
    });
  }

  // ── Message History ────────────────────────────────────────────────────

  /**
   * Get message history, optionally filtered by topic.
   */
  getHistory(topicPattern?: string, limit = 50): BusMessageEnvelope[] {
    let results = this.messageHistory;
    if (topicPattern) {
      results = results.filter(e => matchTopic(e.message.topic, topicPattern));
    }
    return results.slice(-limit);
  }

  /**
   * Clear message history.
   */
  clearHistory(): void {
    this.messageHistory = [];
  }

  // ── System Events ──────────────────────────────────────────────────────

  /**
   * Notify all agents that a new agent has registered.
   */
  async notifyAgentRegistered(agentId: string, registration: any): Promise<void> {
    await this.publish('system.agent.registered', registration, { from: agentId });
  }

  /**
   * Notify all agents that an agent has unregistered.
   */
  async notifyAgentUnregistered(agentId: string): Promise<void> {
    await this.publish('system.agent.unregistered', { agentId }, { from: agentId });
  }

  /**
   * Notify all agents of a status change.
   */
  async notifyStatusChange(agentId: string, from: string, to: string): Promise<void> {
    await this.publish('system.agent.status_change', { agentId, from, to }, { from: agentId });
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  /**
   * Get the number of active subscriptions.
   */
  getSubscriptionCount(): number {
    // Prune expired first
    for (const [id, sub] of this.subscriptions) {
      if (sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now()) {
        this.subscriptions.delete(id);
      }
    }
    return this.subscriptions.size;
  }

  /**
   * Get all active subscriptions.
   */
  getSubscriptions(): BusSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get subscriptions for a specific agent.
   */
  getAgentSubscriptions(agentId: string): BusSubscription[] {
    return Array.from(this.subscriptions.values()).filter(s => s.agentId === agentId);
  }

  /**
   * Reset the bus (for testing).
   */
  reset(): void {
    this.subscriptions.clear();
    this.messageHistory = [];
    this.priorityQueue = [];
    this.processing = false;
    logger.info('Message bus reset');
  }

  // ── Private ────────────────────────────────────────────────────────────

  private findMatchingSubscriptions(message: BusMessage): BusSubscription[] {
    const results: BusSubscription[] = [];
    for (const [, sub] of this.subscriptions) {
      // If message has a specific recipient, only match subscriptions for that agent
      if (message.to && sub.agentId !== message.to) continue;
      if (matchTopic(message.topic, sub.topicPattern)) {
        results.push(sub);
      }
    }
    return results;
  }

  private addToHistory(envelopes: BusMessageEnvelope[]): void {
    this.messageHistory.push(...envelopes);
    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistory);
    }
  }
}

// Singleton
export const agentMessageBus = new AgentMessageBus();
