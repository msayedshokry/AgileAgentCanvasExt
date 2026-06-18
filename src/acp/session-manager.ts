import { createLogger } from '../utils/logger';
const logger = createLogger('acp-session-manager');
import * as vscode from 'vscode';
import { getPersonaForArtifactType, formatFullAgentForPrompt, AgentPersona } from '../chat/agent-personas';
import { WorkflowExecutor } from '../workflow/workflow-executor';
import { BmadModel } from '../chat/ai-provider';
import { AcpSessionSpec, AcpSessionEvent, AcpSessionResult } from './types';

import { errMsg } from '../utils/error';

// ─── AcpSession ──────────────────────────────────────────────────────────────

export class AcpSession implements vscode.Disposable {
  public readonly id: string;
  public readonly createdAt: Date;
  public persona?: AgentPersona;
  private _status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' = 'pending';
  private _events: AcpSessionEvent[] = [];

  constructor(public readonly spec: AcpSessionSpec) {
    this.id = `acp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.createdAt = new Date();
  }

  get status() { return this._status; }
  get events() { return [...this._events]; }

  addEvent(event: AcpSessionEvent): void {
    this._events.push(event);
  }

  setStatus(status: typeof this._status): void {
    this._status = status;
  }

  dispose(): void {
    if (this._status === 'running') {
      this._status = 'cancelled';
    }
  }
}

// ─── AcpSessionManager ───────────────────────────────────────────────────────

/**
 * Manages ACP session lifecycles.
 * Requires a WorkflowExecutor instance for executeWithTools() — ACP
 * delegates actual LLM execution to the existing BMAD workflow engine.
 */
export class AcpSessionManager implements vscode.Disposable {
  private sessions = new Map<string, AcpSession>();
  private eventStreams = new Map<string, vscode.EventEmitter<AcpSessionEvent>>();
  private disposables: vscode.Disposable[] = [];

  constructor(private executor: WorkflowExecutor) {}

  async spawn(spec: AcpSessionSpec, bmadPath: string): Promise<AcpSession> {
    const session = new AcpSession(spec);
    this.sessions.set(session.id, session);

    const emitter = new vscode.EventEmitter<AcpSessionEvent>();
    this.eventStreams.set(session.id, emitter);
    this.disposables.push(emitter);

    this.emit(session.id, {
      sessionId: session.id,
      type: 'spawned',
      timestamp: new Date().toISOString(),
    });

    // Load persona using the existing agent-personas module
    const persona = getPersonaForArtifactType(bmadPath, spec.personaId);
    session.persona = persona ?? undefined;

    logger.info('Session spawned', { sessionId: session.id, role: spec.role, personaId: spec.personaId });
    return session;
  }

  async execute(
    sessionId: string,
    model: BmadModel,
    store: any, // ArtifactStore — passed through to executeWithTools
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<AcpSessionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const startTime = Date.now();
    session.setStatus('running');

    this.emit(sessionId, {
      sessionId,
      type: 'prompting',
      timestamp: new Date().toISOString(),
    });

    const cancellationListener = token?.onCancellationRequested(() => {
      session.setStatus('cancelled');
      this.emit(sessionId, {
        sessionId,
        type: 'cancelled',
        timestamp: new Date().toISOString(),
      });
    });

    try {
      const prompt = this.buildAcpPrompt(session);

      this.emit(sessionId, {
        sessionId,
        type: 'executing',
        timestamp: new Date().toISOString(),
      });

      // Delegate to the existing WorkflowExecutor tool-calling loop
      const result = await this.executor.executeWithTools(
        model,
        prompt,
        session.spec.context.artifact,
        stream,
        token,
        store,
        undefined // no specific workflow file — ACP builds its own prompt
      );

      if (session.status === 'cancelled') {
        return this.buildResult(session, 'cancelled', null, startTime);
      }

      session.setStatus('completed');
      this.emit(sessionId, {
        sessionId,
        type: 'completed',
        timestamp: new Date().toISOString(),
        data: result,
      });

      return this.buildResult(session, 'completed', result, startTime, (result as unknown as Record<string, unknown>)?.toolCalls as number ?? 0);
    } catch (error) {
      if (session.status === 'cancelled') {
        return this.buildResult(session, 'cancelled', null, startTime);
      }

      session.setStatus('failed');
      const errorMessage = errMsg(error);
      logger.error('Session execution failed', { sessionId, error: errorMessage });

      this.emit(sessionId, {
        sessionId,
        type: 'failed',
        timestamp: new Date().toISOString(),
        data: { error: errorMessage },
      });

      return this.buildResult(session, 'failed', null, startTime, 0, errorMessage);
    } finally {
      cancellationListener?.dispose();
    }
  }

  onEvent(sessionId: string, handler: (event: AcpSessionEvent) => void): vscode.Disposable {
    const emitter = this.eventStreams.get(sessionId);
    if (!emitter) return { dispose: () => {} };
    return emitter.event(handler);
  }

  getSession(sessionId: string): AcpSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Return all currently-tracked ACP sessions. Used by the Agent Sessions
   * sidebar view to enumerate live multi-agent team sessions. Returns a
   * shallow copy so callers can't mutate the internal map.
   */
  listSessions(): AcpSession[] {
    return Array.from(this.sessions.values());
  }

  private emit(sessionId: string, event: AcpSessionEvent): void {
    const session = this.sessions.get(sessionId);
    session?.addEvent(event);
    this.eventStreams.get(sessionId)?.fire(event);
  }

  private buildAcpPrompt(session: AcpSession): string {
    const persona = session.persona;
    const spec = session.spec;
    const parts: string[] = [];

    if (persona) {
      parts.push(formatFullAgentForPrompt(persona, { toolsAvailable: true }));
    }

    parts.push(`# Task\n${spec.context.task}`);

    if (spec.context.constraints?.length) {
      parts.push(`# Constraints\n${spec.context.constraints.map(c => `- ${c}`).join('\n')}`);
    }

    return parts.join('\n\n');
  }

  private buildResult(
    session: AcpSession,
    status: 'completed' | 'failed' | 'cancelled',
    output: any,
    startTime: number,
    toolCalls = 0,
    error?: string
  ): AcpSessionResult {
    return {
      sessionId: session.id,
      role: session.spec.role,
      status,
      output,
      toolCalls,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      events: session.events,
      error,
    };
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.disposables.forEach(d => d.dispose());
    this.sessions.clear();
    this.eventStreams.clear();
  }
}

// Singleton — initialized in extension.ts after WorkflowExecutor is created.
// Before initialization, callers receive a clear error.
export let acpSessionManager: AcpSessionManager;

export function initializeAcpSessionManager(executor: WorkflowExecutor): void {
  acpSessionManager = new AcpSessionManager(executor);
}
