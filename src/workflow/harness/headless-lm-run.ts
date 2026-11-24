// ─── Headless language-model run ────────────────────────────────────────────
// Runs a board step through the VS Code LM API (Copilot Chat or any other
// registered model, or the configured direct API provider) when no CLI
// harness is installed. Reuses WorkflowExecutor.executeLaneTransition, the
// same tool-calling loop the @agileagentcanvas chat participant uses, with a
// response stream that records output instead of rendering it in a chat view.

import * as vscode from 'vscode';
import { selectModel, type BmadModel } from '../../chat/ai-provider';
import type { KanbanVerdict } from '../kanban-verdict';
import { createLogger } from '../../utils/logger';
import { errMsg } from '../../utils/error';

const logger = createLogger('headless-lm-run');

/** The subset of WorkflowExecutor this module needs (keeps tests light). */
export interface LaneTransitionRunner {
  executeLaneTransition(
    workflowId: string,
    artifact: unknown,
    store: unknown,
    model?: BmadModel,
    stream?: vscode.ChatResponseStream,
    token?: vscode.CancellationToken,
    sessionId?: string,
  ): Promise<KanbanVerdict>;
}

export interface HeadlessStream {
  readonly stream: vscode.ChatResponseStream;
  output(): string;
}

/**
 * A ChatResponseStream that captures markdown/progress text. Every method the
 * executor may call is a safe no-op or recorder, so nothing renders and
 * nothing throws.
 */
export function createHeadlessStream(onChunk?: (text: string) => void): HeadlessStream {
  let buffer = '';
  const record = (text: string) => {
    buffer += text;
    onChunk?.(text);
  };
  const toText = (value: unknown): string =>
    typeof value === 'string' ? value : (value as { value?: string })?.value ?? '';
  const stream = {
    markdown: (value: unknown) => record(toText(value)),
    progress: (value: string) => record(`\n> ${value}\n`),
    anchor: () => undefined,
    button: () => undefined,
    filetree: () => undefined,
    reference: () => undefined,
    push: (part: unknown) => record(toText((part as { value?: unknown })?.value)),
    warning: (value: unknown) => record(`\n⚠ ${toText(value)}\n`),
  } as unknown as vscode.ChatResponseStream;
  return { stream, output: () => buffer };
}

export interface HeadlessLmRunOptions {
  readonly signal?: AbortSignal;
  readonly sessionId?: string;
  readonly onChunk?: (text: string) => void;
}

/** Run one workflow step through a language model and return its verdict. */
export async function runViaLanguageModel(
  runner: LaneTransitionRunner,
  workflowId: string,
  artifact: unknown,
  store: unknown,
  options: HeadlessLmRunOptions = {},
): Promise<KanbanVerdict> {
  const model = await selectModel();
  if (!model) {
    return { verdict: 'BLOCKED', summary: 'No language model available for a headless run.' };
  }
  const cts = new vscode.CancellationTokenSource();
  const onAbort = () => cts.cancel();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const { stream } = createHeadlessStream(options.onChunk);
  try {
    logger.info(`[headless-lm] ${workflowId} via ${model.label}`);
    return await runner.executeLaneTransition(
      workflowId, artifact, store, model, stream, cts.token, options.sessionId,
    );
  } catch (err) {
    if (options.signal?.aborted) return { verdict: 'UNKNOWN', summary: 'Run aborted' };
    logger.warn(`[headless-lm] ${workflowId} failed: ${errMsg(err)}`);
    return { verdict: 'BLOCKED', summary: `Language-model run failed: ${errMsg(err)}` };
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    cts.dispose();
  }
}
