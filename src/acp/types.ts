// ─── ACP Protocol Types ───────────────────────────────────────────────────────
// Agent Coordination Protocol (ACP) — defines the lifecycle types for
// spawning, prompting, executing, streaming, and completing multi-agent sessions.
// Used by AcpSessionManager and AgentTeamOrchestrator.

export type AgentRole = 'coordinator' | 'crafter' | 'gate' | 'researcher';

export interface AcpSessionSpec {
  role: AgentRole;
  /** Reference to an existing BMAD agent persona ID / skillName */
  personaId: string;
  context: {
    task: string;
    artifact?: Readonly<any>;
    inputArtifacts?: string[];
    outputArtifactType?: string;
    constraints?: string[];
    parentSessionId?: string;
    /**
     * Optional workflow ID that originated this session — surfaced by the
     * Agent Sessions sidebar so users can see which BMAD workflow a team
     * run is executing (e.g. `dev-story`, `code-review`).
     */
    workflowId?: string;
  };
  config?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    executionMode?: 'interactive' | 'autonomous' | 'default';
    allowedTools?: string[];
  };
}

export interface AcpSessionEvent {
  sessionId: string;
  type: 'spawned' | 'prompting' | 'executing' | 'streaming' | 'tool_call' | 'completed' | 'failed' | 'cancelled' | 'handoff';
  timestamp: string;
  data?: any;
  metadata?: Record<string, unknown>;
}

export interface AcpSessionResult {
  sessionId: string;
  role: AgentRole;
  status: 'completed' | 'failed' | 'cancelled';
  output: any;
  toolCalls: number;
  startedAt: string;
  completedAt: string;
  events: AcpSessionEvent[];
  error?: string;
}

export interface AcpHandoff {
  fromSessionId: string;
  toSessionId: string;
  context: {
    task: string;
    intermediateArtifacts: Record<string, any>;
    pendingDecisions?: string[];
    evaluationResults?: any;
  };
}
