// ─── A2A Session Bridge ──────────────────────────────────────────────────────
// Bridges AAC's HandoffSession state machine to the A2A protocol task model.
//
// Enables external A2A clients to discover and monitor AAC handoff sessions
// as A2A tasks. Maps:
//   - HandoffSession.status → A2ATaskState
//   - HandoffSession.traceEntries → A2AMessage history
//   - HandoffSession.context → A2A artifacts
//
// Usage:
//   const bridge = getA2ASessionBridge();
//   const task = bridge.getA2ATask('handoff-abc123');
//   const allTasks = bridge.listA2ATasks();

import { createLogger } from '../../utils/logger';
const logger = createLogger('a2a-session-bridge');

import { handoffNegotiation } from './handoff-negotiation';
import type { HandoffSession, HandoffStatus } from './types';
import type {
  A2ATask,
  A2ATaskState,
  A2AMessage,
  A2AArtifact,
} from './a2a-outbound-client';

// ─── Status Mapping ──────────────────────────────────────────────────────────

/**
 * Map AAC HandoffStatus to A2A TaskState.
 */
export function mapHandoffStatusToA2AState(status: HandoffStatus): A2ATaskState {
  switch (status) {
    case 'pending':
      return 'submitted';
    case 'accepted':
    case 'negotiating':
      return 'working';
    case 'in_progress':
      return 'working';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'declined':
      return 'rejected';
    default:
      return 'submitted';
  }
}

// ─── Message Conversion ──────────────────────────────────────────────────────

/**
 * Convert a HandoffSession's trace entries into A2A message history.
 */
function traceEntriesToMessages(session: HandoffSession): A2AMessage[] {
  const messages: A2AMessage[] = [];

  // Initial request message
  messages.push({
    messageId: `req-${session.id}`,
    role: 'user',
    parts: [{ text: session.request.task }],
    contextId: session.id,
    taskId: session.id,
  });

  // Trace entries as agent messages (with index to prevent ID collisions)
  session.traceEntries.forEach((entry, idx) => {
    const role = entry.type === 'request_sent' ? 'user' : 'agent';
    const detail = entry.detail || entry.type;
    messages.push({
      messageId: `trace-${session.id}-${idx}`,
      role,
      parts: [{ text: `[${entry.type}] ${detail}` }],
      contextId: session.id,
      taskId: session.id,
    });
  });

  // Response message (if available)
  if (session.response) {
    const status = session.response.status;
    const reason = session.response.reason || '';
    messages.push({
      messageId: `resp-${session.id}`,
      role: 'agent',
      parts: [
        {
          text:
            status === 'accepted'
              ? `Handoff accepted. Estimated completion: ${session.response.estimatedCompletion || 'unknown'}`
              : `Handoff declined: ${reason || 'No reason given'}`,
        },
      ],
      contextId: session.id,
      taskId: session.id,
    });
  }

  return messages;
}

/**
 * Convert a HandoffSession's context into A2A artifacts.
 */
function contextToArtifacts(session: HandoffSession): A2AArtifact[] {
  const artifacts: A2AArtifact[] = [];

  if (session.request.artifactId) {
    artifacts.push({
      artifactId: session.request.artifactId,
      name: `Requested Artifact`,
      description: `Artifact type: ${session.request.artifactType || 'unknown'}`,
      parts: [
        {
          text: `Capability requested: ${session.request.requiredCapability}`,
        },
      ],
    });
  }

  if (session.context?.intermediateArtifacts) {
    for (const [key, value] of Object.entries(
      session.context.intermediateArtifacts
    )) {
      artifacts.push({
        artifactId: `${session.id}-${key}`,
        name: key,
        parts: [
          {
            text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
            mediaType:
              typeof value === 'string' ? 'text/plain' : 'application/json',
          },
        ],
      });
    }
  }

  return artifacts;
}

// ─── A2A Session Bridge ──────────────────────────────────────────────────────

export class A2ASessionBridge {
  /**
   * Convert a HandoffSession to an A2A Task.
   *
   * @param sessionId - Handoff session ID
   * @returns A2A Task, or undefined if session not found
   */
  getA2ATask(sessionId: string): A2ATask | undefined {
    const session = handoffNegotiation.getSession(sessionId);
    if (!session) {
      return undefined;
    }
    return this.sessionToTask(session);
  }

  /**
   * List all handoff sessions as A2A tasks.
   *
   * @param filter - Optional filter by state
   * @returns Array of A2A tasks
   */
  listA2ATasks(filter?: {
    state?: A2ATaskState;
    artifactId?: string;
    artifactType?: string;
  }): A2ATask[] {
    let sessions = handoffNegotiation.getAllSessions();

    // Filter by state
    if (filter?.state) {
      sessions = sessions.filter(
        s => mapHandoffStatusToA2AState(s.status) === filter.state
      );
    }

    // Filter by artifact
    if (filter?.artifactId) {
      sessions = sessions.filter(
        s => s.request.artifactId === filter.artifactId
      );
    }

    if (filter?.artifactType) {
      sessions = sessions.filter(
        s => s.request.artifactType === filter.artifactType
      );
    }

    // Most recently updated first
    return sessions
      .map(s => this.sessionToTask(s))
      .sort(
        (a, b) =>
          new Date(b.status.timestamp).getTime() -
          new Date(a.status.timestamp).getTime()
      );
  }

  /**
   * List only active (non-terminal) A2A tasks.
   */
  listActiveA2ATasks(): A2ATask[] {
    return this.listA2ATasks().filter(task => {
      const terminal: A2ATaskState[] = [
        'completed',
        'failed',
        'canceled',
        'rejected',
      ];
      return !terminal.includes(task.status.state);
    });
  }

  /**
   * Get the AAC handoff session ID from an A2A task ID.
   * Currently the task ID is the same as the session ID.
   */
  getSessionId(taskId: string): string | undefined {
    const session = handoffNegotiation.getSession(taskId);
    return session?.id;
  }

  /**
   * Get bridge statistics.
   */
  getStats(): {
    totalTasks: number;
    activeTasks: number;
    completedTasks: number;
    failedTasks: number;
    byState: Record<string, number>;
  } {
    const all = this.listA2ATasks();
    const byState: Record<string, number> = {};

    for (const task of all) {
      byState[task.status.state] = (byState[task.status.state] || 0) + 1;
    }

    return {
      totalTasks: all.length,
      activeTasks: this.listActiveA2ATasks().length,
      completedTasks: byState['completed'] || 0,
      failedTasks: (byState['failed'] || 0) + (byState['rejected'] || 0),
      byState,
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /**
   * Convert a single HandoffSession to an A2A Task.
   */
  private sessionToTask(session: HandoffSession): A2ATask {
    const state = mapHandoffStatusToA2AState(session.status);

    return {
      id: session.id,
      contextId: session.id,
      status: {
        state,
        timestamp: session.updatedAt,
      },
      history: traceEntriesToMessages(session),
      artifacts: contextToArtifacts(session),
      metadata: {
        handoffFrom: session.request.fromAgentId,
        handoffTo: session.request.toAgentId,
        requiredCapability: session.request.requiredCapability,
        handoffStatus: session.status,
        priority: session.request.priority,
        deadline: session.request.deadline,
        createdAt: session.createdAt,
        traceEntryCount: session.traceEntries.length,
      },
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _bridge: A2ASessionBridge | null = null;

/**
 * Get the singleton A2A session bridge instance.
 */
export function getA2ASessionBridge(): A2ASessionBridge {
  if (!_bridge) {
    _bridge = new A2ASessionBridge();
  }
  return _bridge;
}

/**
 * Reset the singleton bridge (for testing).
 */
export function resetA2ASessionBridge(): void {
  _bridge = null;
}
