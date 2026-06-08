// ─── Agent Bus Types ─────────────────────────────────────────────────────────
// Dynamic agent-to-agent message bus with capability-based discovery,
// pub/sub messaging, and handoff negotiation.
//
// Complements the existing ACP layer (AcpSessionSpec, AcpSessionResult, AcpHandoff)
// by adding runtime agent discovery, topic routing, and negotiation protocols.

import { AgentRole } from '../types';

// ─── Agent Registry Types ────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'busy' | 'offline' | 'error';

export interface AgentRegistration {
  id: string;
  name: string;
  role: AgentRole;
  personaId: string;
  capabilities: AgentCapability[];
  status: AgentStatus;
  /** ISO timestamp of last heartbeat / activity */
  lastSeen: string;
  /** Optional metadata (e.g. model, temperature, maxTokens) */
  metadata?: Record<string, unknown>;
}

export interface AgentCapability {
  /** Capability identifier, e.g. 'code-review', 'story-enhancement', 'security-audit' */
  id: string;
  /** Human-readable description */
  description: string;
  /** Confidence level 0–1 for this capability */
  confidence: number;
  /** Artifact types this agent can operate on */
  artifactTypes?: string[];
}

// ─── Message Bus Types ───────────────────────────────────────────────────────

export type BusMessagePriority = 'low' | 'normal' | 'high' | 'critical';

export interface BusMessage {
  /** Unique message ID */
  id: string;
  /** Sender agent ID */
  from: string;
  /** Recipient agent ID (undefined for broadcast) */
  to?: string;
  /** Topic string (e.g. 'agent.dev-story.request', 'team.sprint-planning.broadcast') */
  topic: string;
  /** Message payload */
  payload: any;
  /** Correlation ID for request/response patterns */
  correlationId?: string;
  /** Priority level */
  priority: BusMessagePriority;
  /** ISO timestamp */
  timestamp: string;
  /** Time-to-live in milliseconds (message expires after this) */
  ttl?: number;
}

export interface BusSubscription {
  id: string;
  agentId: string;
  /** Topic pattern (supports wildcards: 'agent.*.request', 'team.#') */
  topicPattern: string;
  /** Handler callback */
  handler: (message: BusMessage) => Promise<void>;
  /** ISO timestamp when this subscription expires (undefined = permanent) */
  expiresAt?: string;
}

export interface BusMessageEnvelope {
  message: BusMessage;
  delivered: boolean;
  deliveredAt?: string;
  /** If message was routed via subscription, the subscription IDs */
  matchedSubscriptionIds?: string[];
}

// ─── Handoff Negotiation Types ──────────────────────────────────────────────

export type HandoffStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'negotiating'
  | 'in_progress'
  | 'completed'
  | 'failed';

export interface HandoffRequest {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  task: string;
  artifactId?: string;
  artifactType?: string;
  /** The specific capability being requested */
  requiredCapability: string;
  /** Deadline for the handoff */
  deadline?: string;
  /** Priority of the handoff */
  priority: BusMessagePriority;
  /** ISO timestamp */
  timestamp: string;
}

export interface HandoffResponse {
  requestId: string;
  fromAgentId: string;
  toAgentId: string;
  status: 'accepted' | 'declined';
  /** Reason for declining */
  reason?: string;
  /** If accepted, the estimated completion time */
  estimatedCompletion?: string;
  /** Counter-offer terms (e.g. different deadline, different capability) */
  counterOffer?: {
    capability?: string;
    deadline?: string;
    notes?: string;
  };
  /** ISO timestamp */
  timestamp: string;
}

export interface HandoffSession {
  id: string;
  request: HandoffRequest;
  response?: HandoffResponse;
  /** Context transferred from source to target agent */
  context?: {
    task: string;
    intermediateArtifacts: Record<string, any>;
    pendingDecisions?: string[];
    evaluationResults?: any;
  };
  status: HandoffStatus;
  /** Trace entries recorded during the handoff */
  traceEntries: Array<{
    type: 'request_sent' | 'response_received' | 'context_transferred' | 'completed' | 'failed';
    timestamp: string;
    detail?: string;
  }>;
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
}

// ─── Discovery Query Types ──────────────────────────────────────────────────

export interface DiscoveryQuery {
  /** Required role */
  role?: AgentRole;
  /** Required capability IDs (AND logic — agent must have ALL) */
  requiredCapabilities?: string[];
  /** Optional capability IDs (OR logic — agent with ANY is preferred) */
  preferredCapabilities?: string[];
  /** Filter by artifact type the agent can operate on */
  artifactType?: string;
  /** Only return agents with this status */
  status?: AgentStatus;
  /** Maximum results */
  limit?: number;
  /** Sort results by this field */
  sortBy?: 'confidence' | 'lastSeen' | 'name';
  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
}

// ─── Bus Statistics Types ───────────────────────────────────────────────────

export interface BusStatistics {
  /** Total messages delivered */
  totalMessages: number;
  /** Messages currently pending delivery */
  pendingMessages: number;
  /** Number of registered agents */
  registeredAgents: number;
  /** Number of active subscriptions */
  activeSubscriptions: number;
  /** Number of active handoff sessions */
  activeHandoffs: number;
  /** Messages per topic (top 10) */
  topTopics: Array<{ topic: string; count: number }>;
  /** Timestamp */
  timestamp: string;
}
