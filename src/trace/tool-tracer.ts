import * as vscode from 'vscode';
import { getTraceRecorder } from './trace-recorder';

import { errMsg } from '../utils/error';

/**
 * Wraps a VS Code LanguageModelTool with tracing.
 * Every invocation is recorded to the trace recorder (JSONL) regardless of outcome.
 *
 * Use in chat-participant.ts or agileagentcanvas-tools.ts to wrap registered LM tools
 * before passing them to vscode.lm.registerTool().
 *
 * `workflowName` (optional, audit follow-up to gap #20/#42) is captured on
 * every emitted trace entry so trace consumers can group invocations by the
 * workflow that triggered them. Callers running outside any workflow (e.g.
 * bare Copilot chat) pass `undefined`; the field stays absent rather than
 * being set to `'chat'` so downstream filters can still distinguish
 * workflow-scoped entries from conversational ones.
 */
export function wrapToolWithTracing(
  tool: vscode.LanguageModelTool<any>,
  sessionId: string,
  agentName: string,
  toolName: string,
  workflowName?: string
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
          workflowName,
          data: { toolName, toolInput: inputs, toolResult: result },
          durationMs: Date.now() - startTime,
        });
        return result;
      } catch (err) {
        getTraceRecorder().record({
          sessionId,
          type: 'error',
          agent: agentName,
          workflowName,
          data: { toolName, toolInput: inputs, error: errMsg(err) },
          durationMs: Date.now() - startTime,
        });
        throw err;
      }
    },
  };
}
