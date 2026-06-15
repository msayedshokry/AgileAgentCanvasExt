import * as vscode from 'vscode';
import { getTraceRecorder } from './trace-recorder';

import { errMsg } from '../utils/error';

/**
 * Wraps a VS Code LanguageModelTool with tracing.
 * Every invocation is recorded to the trace recorder (JSONL) regardless of outcome.
 *
 * Use in chat-participant.ts or agileagentcanvas-tools.ts to wrap registered LM tools
 * before passing them to vscode.lm.registerTool().
 */
export function wrapToolWithTracing(
  tool: vscode.LanguageModelTool<any>,
  sessionId: string,
  agentName: string,
  toolName: string
): vscode.LanguageModelTool<any> {
  return {
    ...tool,
    invoke: async (inputs: any, token: vscode.CancellationToken) => {
      const startTime = Date.now();
      try {
        const result = await tool.invoke(inputs, token);
        getTraceRecorder().record({
          sessionId,
          type: 'tool_call',
          agent: agentName,
          data: { toolName, toolInput: inputs, toolResult: result },
          durationMs: Date.now() - startTime,
        });
        return result;
      } catch (err) {
        getTraceRecorder().record({
          sessionId,
          type: 'error',
          agent: agentName,
          data: { toolName, toolInput: inputs, error: errMsg(err) },
          durationMs: Date.now() - startTime,
        });
        throw err;
      }
    },
  };
}
