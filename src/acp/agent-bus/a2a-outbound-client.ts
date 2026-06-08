// ─── A2A Outbound Client ─────────────────────────────────────────────────────
// Client for calling remote A2A agents via JSON-RPC 2.0 over HTTP.
//
// Enables kanban transitions and other AAC components to delegate work to
// remote A2A-compatible agents by:
//   1. Fetching the Agent Card from a well-known URL
//   2. Sending SendMessage requests via JSON-RPC 2.0
//   3. Polling GetTask until completion (or timeout)
//
// Follows A2A protocol spec v0.3 for JSON-RPC communication.
//
// Usage:
//   const client = getA2AOutboundClient();
//   const task = await client.sendMessageAndWait(
//     'https://remote-agent.example.com/agent-card.json',
//     'Implement user authentication'
//   );

import { createLogger } from '../../utils/logger';
const logger = createLogger('a2a-outbound-client');

import {
  getRpcEndpoint,
  validateAgentCard,
  type A2AAgentCard,
} from './a2a-agent-card';

// ─── JSON-RPC 2.0 Types ─────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// ─── A2A Outbound Types ──────────────────────────────────────────────────────

export type A2ATaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'rejected'
  | 'auth-required';

export interface A2AMessagePart {
  text?: string;
  data?: unknown;
  mediaType?: string;
}

export interface A2AMessage {
  messageId: string;
  role: 'user' | 'agent';
  parts: A2AMessagePart[];
  contextId?: string;
  taskId?: string;
}

export interface A2AArtifact {
  artifactId: string;
  name: string;
  description?: string;
  parts: A2AMessagePart[];
}

export interface A2ATask {
  id: string;
  contextId: string;
  status: {
    state: A2ATaskState;
    timestamp: string;
    message?: A2AMessage;
  };
  history: A2AMessage[];
  artifacts?: A2AArtifact[];
  metadata?: Record<string, unknown>;
}

export interface SendMessageParams {
  message: {
    messageId?: string;
    role: 'user' | 'agent';
    parts: A2AMessagePart[];
    contextId?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface GetTaskParams {
  id: string;
}

// ─── Error Types ─────────────────────────────────────────────────────────────

export class A2AOutboundError extends Error {
  constructor(
    message: string,
    public code?: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'A2AOutboundError';
  }
}

export class A2ANetworkError extends A2AOutboundError {
  constructor(
    message: string,
    public cause?: Error
  ) {
    super(message, -32003);
    this.name = 'A2ANetworkError';
  }
}

export class A2ATimeoutError extends A2AOutboundError {
  constructor(
    message: string,
    public elapsedMs: number
  ) {
    super(message, -32002);
    this.name = 'A2ATimeoutError';
  }
}

export class A2AInvalidCardError extends A2AOutboundError {
  constructor(
    message: string,
    public cardUrl: string
  ) {
    super(message, -32004);
    this.name = 'A2AInvalidCardError';
  }
}

// ─── Configuration ───────────────────────────────────────────────────────────

export interface A2AOutboundClientOptions {
  /** Timeout for network requests in ms (default: 30000) */
  timeout?: number;
  /** Polling interval for waitForCompletion in ms (default: 1000) */
  pollInterval?: number;
  /** Maximum wait time for task completion in ms (default: 300000) */
  maxWaitTime?: number;
  /** Maximum retry attempts for network requests (default: 3) */
  maxRetries?: number;
  /** Delay between retry attempts in ms (default: 1000) */
  retryDelay?: number;
  /** Static HTTP headers to attach to requests */
  requestHeaders?: Record<string, string>;
}

const DEFAULT_OPTIONS: Required<A2AOutboundClientOptions> = {
  timeout: 30_000,
  pollInterval: 1_000,
  maxWaitTime: 300_000,
  maxRetries: 3,
  retryDelay: 1_000,
  requestHeaders: {},
};

/** Terminal states — polling stops when reached */
const TERMINAL_STATES = new Set<A2ATaskState>([
  'completed', 'failed', 'canceled', 'rejected', 'auth-required',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── A2A Outbound Client ─────────────────────────────────────────────────────

export class A2AOutboundClient {
  private options: Required<A2AOutboundClientOptions>;

  constructor(options?: A2AOutboundClientOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // ── Agent Card Fetching ─────────────────────────────────────────────────

  /**
   * Fetch and validate an Agent Card from a URL.
   *
   * @param url - URL to fetch the Agent Card from
   * @returns Validated Agent Card
   * @throws {A2ANetworkError} If network request fails
   * @throws {A2AInvalidCardError} If card is invalid
   */
  async fetchAgentCard(url: string): Promise<A2AAgentCard> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            ...this.options.requestHeaders,
          },
        });

        if (!response.ok) {
          throw new A2ANetworkError(
            `HTTP ${response.status}: ${response.statusText} while fetching Agent Card from ${url}`
          );
        }

        const card = await response.json() as A2AAgentCard;
        validateAgentCard(card, url);
        logger.debug(`[A2A] Fetched valid Agent Card from ${url}: ${card.name}`);
        return card;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Don't retry invalid cards
        if (lastError instanceof A2AInvalidCardError) {
          throw lastError;
        }
        // Wait before retrying (except last attempt)
        if (attempt < this.options.maxRetries - 1) {
          logger.debug(
            `[A2A] Retrying Agent Card fetch (attempt ${attempt + 1}/${this.options.maxRetries})`
          );
          await sleep(this.options.retryDelay);
        }
      }
    }

    throw new A2ANetworkError(
      `Failed to fetch Agent Card from ${url} after ${this.options.maxRetries} attempts`,
      lastError
    );
  }

  // ── SendMessage ─────────────────────────────────────────────────────────

  /**
   * Send a message to a remote A2A agent.
   *
   * @param agentCardUrl - URL of the Agent Card or RPC endpoint
   * @param message - Text message or structured message part
   * @param metadata - Optional metadata
   * @returns Created A2A task
   */
  async sendMessage(
    agentCardUrl: string,
    message: string | A2AMessagePart,
    metadata?: Record<string, unknown>
  ): Promise<A2ATask> {
    const rpcEndpoint = await this.resolveRpcEndpoint(agentCardUrl);
    const parts: A2AMessagePart[] =
      typeof message === 'string' ? [{ text: message }] : [message];

    const params: SendMessageParams = {
      message: {
        messageId: generateId(),
        role: 'user',
        parts,
      },
      metadata,
    };

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: generateId(),
      method: 'SendMessage',
      params,
    };

    logger.info(`[A2A] Sending message to ${rpcEndpoint}`);
    const response = await this.sendJsonRpcRequest(rpcEndpoint, request);
    const result = response.result as { task: any };
    return this.normalizeTask(result?.task);
  }

  // ── GetTask ─────────────────────────────────────────────────────────────

  /**
   * Get the current status of a remote A2A task.
   *
   * @param agentCardUrl - URL of the Agent Card or RPC endpoint
   * @param taskId - Task ID to query
   * @returns Current task state
   */
  async getTask(agentCardUrl: string, taskId: string): Promise<A2ATask> {
    const rpcEndpoint = await this.resolveRpcEndpoint(agentCardUrl);

    const params: GetTaskParams = { id: taskId };
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: generateId(),
      method: 'GetTask',
      params,
    };

    const response = await this.sendJsonRpcRequest(rpcEndpoint, request);
    const result = response.result as { task: any };
    return this.normalizeTask(result?.task);
  }

  // ── Wait for Completion ─────────────────────────────────────────────────

  /**
   * Poll GetTask until the task reaches a terminal state.
   *
   * @param agentCardUrl - URL of the Agent Card or RPC endpoint
   * @param taskId - Task ID to wait for
   * @returns Completed/failed task
   * @throws {A2ATimeoutError} If maxWaitTime is exceeded
   */
  async waitForCompletion(
    agentCardUrl: string,
    taskId: string
  ): Promise<A2ATask> {
    const rpcEndpoint = await this.resolveRpcEndpoint(agentCardUrl);
    const startTime = Date.now();

    logger.info(`[A2A] Waiting for task ${taskId} to complete...`);

    while (Date.now() - startTime < this.options.maxWaitTime) {
      const task = await this.getTask(rpcEndpoint, taskId);

      if (TERMINAL_STATES.has(task.status.state)) {
        const elapsed = Date.now() - startTime;
        logger.info(
          `[A2A] Task ${taskId} reached terminal state: ${task.status.state} (${elapsed}ms)`
        );
        return task;
      }

      await sleep(this.options.pollInterval);
    }

    const elapsed = Date.now() - startTime;
    throw new A2ATimeoutError(
      `Task ${taskId} did not complete within ${elapsed}ms`,
      elapsed
    );
  }

  // ── Send and Wait (convenience) ─────────────────────────────────────────

  /**
   * Send a message and wait for task completion in one call.
   *
   * @param agentCardUrl - URL of the Agent Card or RPC endpoint
   * @param message - Text message or structured message part
   * @param metadata - Optional metadata
   * @returns Completed task
   */
  async sendMessageAndWait(
    agentCardUrl: string,
    message: string | A2AMessagePart,
    metadata?: Record<string, unknown>
  ): Promise<A2ATask> {
    const rpcEndpoint = await this.resolveRpcEndpoint(agentCardUrl);
    const task = await this.sendMessage(rpcEndpoint, message, metadata);
    return this.waitForCompletion(rpcEndpoint, task.id);
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /**
   * Resolve an Agent Card URL or RPC endpoint URL to the actual RPC endpoint.
   */
  private async resolveRpcEndpoint(url: string): Promise<string> {
    // If URL looks like an Agent Card endpoint, fetch it first
    if (
      url.endsWith('.json') ||
      url.endsWith('/agent-card') ||
      url.endsWith('/card') ||
      url.includes('/.well-known/')
    ) {
      const card = await this.fetchAgentCard(url);
      return getRpcEndpoint(card);
    }
    // Otherwise assume it's already the RPC endpoint
    return url;
  }

  /**
   * Send a JSON-RPC 2.0 request with retry logic.
   */
  private async sendJsonRpcRequest(
    endpoint: string,
    request: JsonRpcRequest
  ): Promise<{ result: unknown }> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.options.requestHeaders,
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          throw new A2ANetworkError(
            `HTTP ${response.status}: ${response.statusText}`
          );
        }

        const jsonRpcResponse = (await response.json()) as JsonRpcResponse;

        // Check for JSON-RPC error
        if (jsonRpcResponse.error) {
          throw new A2ANetworkError(
            `JSON-RPC error ${jsonRpcResponse.error.code}: ${jsonRpcResponse.error.message}`,
            new Error(jsonRpcResponse.error.message)
          );
        }

        return { result: jsonRpcResponse.result };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Don't retry invalid cards or timeouts
        if (
          lastError instanceof A2AInvalidCardError ||
          lastError instanceof A2ATimeoutError
        ) {
          throw lastError;
        }
        if (attempt < this.options.maxRetries - 1) {
          logger.debug(
            `[A2A] Retrying JSON-RPC request (attempt ${attempt + 1}/${this.options.maxRetries})`
          );
          await sleep(this.options.retryDelay);
        }
      }
    }

    throw new A2ANetworkError(
      `Failed to send JSON-RPC request after ${this.options.maxRetries} attempts`,
      lastError
    );
  }

  /**
   * Fetch with timeout support using AbortSignal.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Normalize a remote task response to the local A2ATask format.
   */
  private normalizeTask(remoteTask: any): A2ATask {
    if (!remoteTask) {
      throw new A2ANetworkError('Remote task response was empty or undefined');
    }

    return {
      id: remoteTask.id || 'unknown',
      contextId: remoteTask.contextId || remoteTask.id || 'unknown',
      status: {
        state: (remoteTask.status?.state || 'submitted') as A2ATaskState,
        timestamp:
          remoteTask.status?.timestamp || new Date().toISOString(),
        message: remoteTask.status?.message
          ? {
              messageId: remoteTask.status.message.messageId || generateId(),
              role: (remoteTask.status.message.role as 'user' | 'agent') || 'agent',
              parts: (remoteTask.status.message.parts || []).map(
                (p: any) => ({
                  text: p.text,
                  data: p.data,
                  mediaType: p.mediaType,
                })
              ),
            }
          : undefined,
      },
      history: (remoteTask.history || []).map((msg: any) => ({
        messageId: msg.messageId || generateId(),
        role: (msg.role as 'user' | 'agent') || 'user',
        parts: (msg.parts || []).map((p: any) => ({
          text: p.text,
          data: p.data,
          mediaType: p.mediaType,
        })),
        contextId: msg.contextId,
        taskId: msg.taskId,
      })),
      artifacts: (remoteTask.artifacts || []).map((art: any) => ({
        artifactId: art.artifactId || generateId(),
        name: art.name || 'Untitled',
        description: art.description,
        parts: (art.parts || []).map((p: any) => ({
          text: p.text,
          data: p.data,
          mediaType: p.mediaType,
        })),
      })),
      metadata: remoteTask.metadata,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _defaultClient: A2AOutboundClient | null = null;

/**
 * Get a singleton A2A outbound client instance.
 */
export function getA2AOutboundClient(
  options?: A2AOutboundClientOptions
): A2AOutboundClient {
  if (options) {
    return new A2AOutboundClient(options);
  }
  if (!_defaultClient) {
    _defaultClient = new A2AOutboundClient();
  }
  return _defaultClient;
}

/**
 * Reset the singleton client (for testing).
 */
export function resetA2AOutboundClient(): void {
  _defaultClient = null;
}
