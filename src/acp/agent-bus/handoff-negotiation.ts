// ─── Handoff Negotiation ─────────────────────────────────────────────────────
// Agent-to-agent handoff negotiation protocol.
//
// Flow:
//   1. Agent A needs a capability it doesn't have → queries AgentRegistry
//   2. Agent A sends a HandoffRequest via the MessageBus (topic: system.handoff.request)
//   3. Agent B receives the request, evaluates capacity/priority
//   4. Agent B sends HandoffResponse (accepted | declined) via MessageBus
//   5. If accepted, Agent A transfers context (task, intermediate artifacts)
//   6. Agent B acknowledges and begins execution
//   7. Both record the handoff in the trace recorder
//
// Timeout: if no response within the deadline, the handoff is automatically cancelled.

import { createLogger } from '../../utils/logger';
const logger = createLogger('handoff-negotiation');

import { agentRegistry } from './agent-registry';
import { agentMessageBus } from './message-bus';
import { getTraceRecorder } from '../../trace/trace-recorder';
import {
  HandoffRequest,
  HandoffResponse,
  HandoffSession,
  HandoffStatus,
  BusMessagePriority,
} from './types';

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  /** Default timeout for handoff responses (30s) */
  DEFAULT_RESPONSE_TIMEOUT: 30_000,
  /** Max concurrent handoff sessions */
  MAX_CONCURRENT_SESSIONS: 20,
  /** Default TTL for handoff messages on the bus */
  MESSAGE_TTL: 60_000,
};

import { errMsg } from '../../utils/error';

// ── SharedContext facade (lazy-loaded, silent-by-default) ──────────────────

interface SharedContextFacade {
    put(key: string, content: string, opts?: { agent?: string }): Promise<{ originalTokens: number; compressedTokens: number; savingsPercent: number }>;
    get(key: string, opts?: { full?: boolean }): string | null;
    stats(): { entries: number; totalOriginalTokens: number; totalCompressedTokens: number; totalTokensSaved: number; savingsPercent: number };
    clear(): void;
}

// ─── Handoff Negotiation Service ────────────────────────────────────────────

export class HandoffNegotiationService {
  private sessions = new Map<string, HandoffSession>();
  private timeouts = new Map<string, NodeJS.Timeout>();
  private busSubscriptions: string[] = [];
  private _shareCtx: SharedContextFacade | null = null;
  private _shareCtxAttempted = false;

  constructor() {
    // Subscribe to handoff response events
    this.busSubscriptions.push(
      agentMessageBus.subscribe('handoff-negotiation', 'system.handoff.request', async (msg) => {
        const request = msg.payload as HandoffRequest;
        if (request.toAgentId) {
          // Only the targeted agent needs to process this
          const agent = agentRegistry.getAgent(request.toAgentId);
          if (!agent) return;
          // Auto-accept if idle, otherwise queue for manual decision
          const response = agent.status === 'idle'
            ? this.buildAcceptResponse(request)
            : this.buildDeclineResponse(request, 'Agent is currently busy');
          await this.respondToHandoff(response);
        }
      })
    );

    this.busSubscriptions.push(
      agentMessageBus.subscribe('handoff-negotiation', 'system.handoff.response', async (msg) => {
        const response = msg.payload as HandoffResponse;
        await this.handleResponse(response);
      })
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Initiate a handoff from one agent to another.
   * Returns the handoff session so the caller can await the result.
   */
  async requestHandoff(
    fromAgentId: string,
    toAgentId: string,
    task: string,
    requiredCapability: string,
    options?: {
      artifactId?: string;
      artifactType?: string;
      deadline?: string;
      priority?: BusMessagePriority;
      context?: HandoffSession['context'];
    }
  ): Promise<HandoffSession> {
    const id = `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const request: HandoffRequest = {
      id,
      fromAgentId,
      toAgentId,
      task,
      artifactId: options?.artifactId,
      artifactType: options?.artifactType,
      requiredCapability,
      deadline: options?.deadline,
      priority: options?.priority || 'normal',
      timestamp: new Date().toISOString(),
    };

    const session: HandoffSession = {
      id,
      request,
      context: options?.context || {
        task,
        intermediateArtifacts: {},
      },
      status: 'pending',
      traceEntries: [{
        type: 'request_sent',
        timestamp: new Date().toISOString(),
        detail: `Handoff requested: ${fromAgentId} → ${toAgentId} for capability "${requiredCapability}"`,
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.sessions.set(id, session);
    this.enforceSessionLimit();

    // Set timeout for response
    const timeoutMs = CONFIG.DEFAULT_RESPONSE_TIMEOUT;
    this.timeouts.set(id, setTimeout(() => {
      this.handleTimeout(id);
    }, timeoutMs));

    // Publish the request to the bus
    await agentMessageBus.publish('system.handoff.request', request, {
      from: fromAgentId,
      to: toAgentId,
      priority: request.priority,
      ttl: CONFIG.MESSAGE_TTL,
    });

    // Record in trace
    try {
      getTraceRecorder().record({
        sessionId: id,
        type: 'handoff',
        agent: fromAgentId,
        data: {
          handoffFrom: fromAgentId,
          handoffTo: toAgentId,
          decision: `Handoff request for "${requiredCapability}"`,
          rationale: task.substring(0, 200),
        },
      });
    } catch { /* trace recorder may not be initialized */ }

    logger.info(
      `Handoff requested: ${fromAgentId} → ${toAgentId} (${requiredCapability}), session: ${id}`
    );

    return session;
  }

  /**
   * Respond to a handoff request (accept or decline).
   */
  async respondToHandoff(response: HandoffResponse): Promise<void> {
    await agentMessageBus.publish('system.handoff.response', response, {
      from: response.toAgentId,
      to: response.fromAgentId,
      priority: response.status === 'accepted' ? 'high' : 'normal',
      ttl: CONFIG.MESSAGE_TTL,
    });
  }

  /**
   * Transfer context from the source agent to the target agent.
   * Called after a handoff is accepted.
   *
   * When Headroom is available, the context is compressed via SharedContext
   * before transfer to reduce token overhead for the receiving agent.
   */
  async transferContext(
    sessionId: string,
    context: HandoffSession['context']
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`[Handoff] Context transfer failed: session ${sessionId} not found`);
      return false;
    }

    // ── SharedContext compression ────────────────────────────────────────
    // Lazy-initialise SharedContext on first transfer attempt.
    let shareCtxKey: string | undefined;
    if (!this._shareCtxAttempted) {
      this._shareCtxAttempted = true;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { SharedContext } = require('headroom-ai');
        this._shareCtx = new SharedContext({ ttl: 300_000, maxEntries: 50 });
        logger.debug('[Handoff] SharedContext initialised for inter-agent compression');
      } catch {
        logger.debug('[Handoff] headroom-ai not available — SharedContext disabled');
      }
    }

    if (this._shareCtx && context) {
      try {
        const serialised = JSON.stringify(context);
        const entry = await this._shareCtx.put(sessionId, serialised);
        shareCtxKey = sessionId;
        logger.debug(
          `[Handoff] SharedContext compressed: ${entry.originalTokens} → ${entry.compressedTokens} tokens ` +
          `(${entry.savingsPercent}% saved)`
        );
      } catch (err: any) {
        logger.debug(`[Handoff] SharedContext compression failed: ${err?.message ?? err}`);
      }
    }

    // Store either the SharedContext key or the full context
    session.context = shareCtxKey
      ? { task: context?.task ?? '', intermediateArtifacts: { _shareCtxKey: shareCtxKey }, _compressedViaSharedContext: true }
      : context;
    session.status = 'in_progress';
    session.updatedAt = new Date().toISOString();
    session.traceEntries.push({
      type: 'context_transferred',
      timestamp: new Date().toISOString(),
      detail: shareCtxKey
        ? `Context compressed via SharedContext (key: ${shareCtxKey})`
        : `Context transferred: ${Object.keys(context?.intermediateArtifacts || {}).length} artifacts`,
    });

    // Notify via bus — pass only the key if compressed
    const busPayload = shareCtxKey
      ? { _shareCtxKey: shareCtxKey, task: context?.task }
      : context;
    await agentMessageBus.publish(
      `handoff.${sessionId}.context_transferred`,
      busPayload,
      { from: session.request.fromAgentId, to: session.request.toAgentId, priority: 'high' }
    );

    // Clear the response timeout since we're in progress now
    this.clearTimeout(sessionId);

    logger.info(`[Handoff] Context transferred for session ${sessionId}${shareCtxKey ? ' (compressed via SharedContext)' : ''}`);
    return true;
  }

  /**
   * Decompress handoff context from SharedContext if it was compressed.
   * Call this on the receiving agent side before processing the handoff.
   */
  getDecompressedContext(sessionId: string): HandoffSession['context'] | null {
    if (!this._shareCtx) { return null; }
    try {
      const serialised = this._shareCtx.get(sessionId, { full: true });
      if (!serialised) { return null; }
      return JSON.parse(serialised);
    } catch (err: any) {
      logger.debug(`[Handoff] SharedContext decompress failed: ${err?.message ?? err}`);
      return null;
    }
  }

  /** Get SharedContext compression statistics. */
  getSharedContextStats(): Record<string, any> | null {
    if (!this._shareCtx) { return null; }
    try {
      return this._shareCtx.stats();
    } catch {
      return null;
    }
  }

  /**
   * Mark a handoff session as completed.
   */
  async completeHandoff(
    sessionId: string,
    result?: any
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'completed';
    session.updatedAt = new Date().toISOString();
    session.traceEntries.push({
      type: 'completed',
      timestamp: new Date().toISOString(),
      detail: result ? 'Handoff completed with result' : 'Handoff completed',
    });

    await agentMessageBus.publish(
      `handoff.${sessionId}.completed`,
      { result, sessionId },
      { from: session.request.toAgentId, to: session.request.fromAgentId }
    );

    try {
      getTraceRecorder().record({
        sessionId,
        type: 'handoff',
        agent: session.request.toAgentId,
        data: {
          handoffFrom: session.request.fromAgentId,
          handoffTo: session.request.toAgentId,
          decision: 'Handoff completed',
        },
      });
    } catch { /* trace recorder may not be initialized */ }

    this.clearTimeout(sessionId);
    logger.info(`[Handoff] Session ${sessionId} completed`);
  }

  /**
   * Mark a handoff session as failed.
   */
  async failHandoff(sessionId: string, error: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'failed';
    session.updatedAt = new Date().toISOString();
    session.traceEntries.push({
      type: 'failed',
      timestamp: new Date().toISOString(),
      detail: error,
    });

    await agentMessageBus.publish(
      `handoff.${sessionId}.failed`,
      { error, sessionId },
      { from: session.request.toAgentId, to: session.request.fromAgentId }
    );
    this.clearTimeout(sessionId);
    logger.warn(`[Handoff] Session ${sessionId} failed: ${error}`);
  }

  /**
   * Get a handoff session by ID.
   */
  getSession(sessionId: string): HandoffSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active handoff sessions.
   */
  getActiveSessions(): HandoffSession[] {
    return Array.from(this.sessions.values()).filter(
      s => s.status === 'pending' || s.status === 'in_progress' || s.status === 'negotiating'
    );
  }

  /**
   * Get all completed/failed handoff sessions.
   */
  getCompletedSessions(): HandoffSession[] {
    return Array.from(this.sessions.values()).filter(
      s => s.status === 'completed' || s.status === 'failed'
    );
  }

  /**
   * Get all handoff sessions.
   */
  getAllSessions(): HandoffSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Prime the SharedContext instance for testing.
   *
   * Injects a mock SharedContext facade so tests can bypass the lazy
   * `require('headroom-ai')` call, which is unreliable in vitest fork-pool
   * mode. Call this before the first `transferContext()` in a test.
   *
   * @internal
   */
  _primeShareCtxForTest(facade: SharedContextFacade): void {
    this._shareCtx = facade;
    this._shareCtxAttempted = true;
  }

  /**
   * Reset the negotiation service (for testing).
   */
  reset(): void {
    for (const id of this.timeouts.keys()) {
      this.clearTimeout(id);
    }
    for (const subId of this.busSubscriptions) {
      agentMessageBus.unsubscribe(subId);
    }
    if (this._shareCtx) {
      try { this._shareCtx.clear(); } catch { /* ignore */ }
      this._shareCtx = null;
    }
    this._shareCtxAttempted = false;
    this.sessions.clear();
    this.timeouts.clear();
    this.busSubscriptions = [];
    logger.info('Handoff negotiation service reset');
  }

  // ── Private ───────────────────────────────────────────────────────────

  private buildAcceptResponse(request: HandoffRequest): HandoffResponse {
    return {
      requestId: request.id,
      fromAgentId: request.toAgentId,
      toAgentId: request.fromAgentId,
      status: 'accepted',
      estimatedCompletion: new Date(Date.now() + 300_000).toISOString(), // 5 min default
      timestamp: new Date().toISOString(),
    };
  }

  private buildDeclineResponse(request: HandoffRequest, reason: string): HandoffResponse {
    return {
      requestId: request.id,
      fromAgentId: request.toAgentId,
      toAgentId: request.fromAgentId,
      status: 'declined',
      reason,
      timestamp: new Date().toISOString(),
    };
  }

  private async handleResponse(response: HandoffResponse): Promise<void> {
    const session = this.sessions.get(response.requestId);
    if (!session) return;

    this.clearTimeout(response.requestId);

    if (response.status === 'accepted') {
      session.status = 'accepted';
      session.response = response;
      session.traceEntries.push({
        type: 'response_received',
        timestamp: new Date().toISOString(),
        detail: `Handoff accepted${response.estimatedCompletion ? `, estimated completion: ${response.estimatedCompletion}` : ''}`,
      });
      logger.info(`[Handoff] Session ${response.requestId} accepted`);
    } else {
      session.status = 'failed';
      session.response = response;
      session.traceEntries.push({
        type: 'failed',
        timestamp: new Date().toISOString(),
        detail: `Handoff declined: ${response.reason || 'No reason given'}`,
      });
      logger.info(`[Handoff] Session ${response.requestId} declined: ${response.reason || 'No reason'}`);
    }

    session.updatedAt = new Date().toISOString();
  }

  private handleTimeout(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.status === 'pending' || session.status === 'negotiating') {
      session.status = 'failed';
      session.traceEntries.push({
        type: 'failed',
        timestamp: new Date().toISOString(),
        detail: 'Handoff timed out — no response received within deadline',
      });
      session.updatedAt = new Date().toISOString();
      logger.warn(`[Handoff] Session ${sessionId} timed out`);
    }

    this.timeouts.delete(sessionId);
  }

  private clearTimeout(sessionId: string): void {
    const timeout = this.timeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(sessionId);
    }
  }

  private enforceSessionLimit(): void {
    const active = this.getActiveSessions().length;
    if (active > CONFIG.MAX_CONCURRENT_SESSIONS) {
      // Remove the oldest pending session
      const oldest = this.getActiveSessions()
        .filter(s => s.status === 'pending')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (oldest) {
        this.sessions.delete(oldest.id);
        this.clearTimeout(oldest.id);
        logger.warn(`[Handoff] Evicted oldest session ${oldest.id} (max concurrent reached)`);
      }
    }
  }
}

// Singleton
export const handoffNegotiation = new HandoffNegotiationService();
