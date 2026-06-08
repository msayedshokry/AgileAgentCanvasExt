import { createLogger } from '../utils/logger';
const logger = createLogger('agentic-kanban-message-handler');
import * as vscode from 'vscode';
import * as path from 'path';
import { ArtifactStore } from '../state/artifact-store';
import { buildArtifacts } from '../canvas/artifact-transformer';
import { laneTransitionEngine } from '../workflow/lane-transitions';
import { getActiveChatSession } from '../chat/active-session';
import { concurrencyQueue } from '../workflow/concurrency-queue';
import { getWorkflowExecutor } from '../workflow/workflow-executor';
import { getTraceRecorder } from '../trace/trace-recorder';
import { terminalExecutor } from '../workflow/terminal-executor';
import { getPersonaForArtifactType } from '../chat/agent-personas';

// Project-standard error-to-string pattern
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Handle messages from the Agentic Kanban webview.
 *
 * @param webview  Optional webview to post responses back to.
 * @returns `true` if the message was handled, `false` if the caller should handle it.
 */
export async function handleAgenticKanbanMessage(
  message: { type: string; [key: string]: any },
  store: ArtifactStore,
  extensionUri: vscode.Uri,
  webview?: vscode.Webview
): Promise<boolean> {
  switch (message.type) {
    case 'kanban:statusChanged': {
      const { artifactId, fromStatus, toStatus, artifactType } = message;

      try {
        const activeSession = getActiveChatSession();
        const result = await laneTransitionEngine.handleTransition(
          artifactId,
          fromStatus,
          toStatus,
          artifactType || 'unknown',
          activeSession?.model,
          activeSession?.stream,
          activeSession?.token
        );

        if (webview) {
          webview.postMessage({
            type: 'transitionResult',
            artifactId,
            ...result,
          });

          // When terminal execution was launched, push agent state so the
          // webview shows the terminal badge and jump-to-terminal action.
          if (result.status === 'terminal_launched' && result.terminalSessionId) {
            const session = terminalExecutor.getTerminalSession(artifactId);
            webview.postMessage({
              type: 'agentStateUpdated',
              artifactId,
              agentState: {
                status: 'running',
                agentRole: session?.agentRole || 'Agent',
                terminalId: result.terminalSessionId,
              },
            });
          }
        }
      } catch (error) {
        logger.error(`[AgenticKanban] Transition failed: ${artifactId}`, { error });
        if (webview) {
          webview.postMessage({
            type: 'transitionResult',
            artifactId,
            ok: false,
            blockedBy: [errMsg(error)],
          });
        }
      }
      return true;
    }

    case 'agenticKanban:refresh': {
      const artifacts = buildArtifacts(store, vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath);
      if (webview) {
        webview.postMessage({ type: 'updateArtifacts', artifacts });
      }
      return true;
    }

    case 'kanban:viewTrace': {
      const { sessionId } = message;
      vscode.commands.executeCommand('agileagentcanvas.openTraceViewer', sessionId);
      return true;
    }

    case 'openTraceViewer': {
      vscode.commands.executeCommand('agileagentcanvas.openTraceViewer');
      return true;
    }

    case 'kanban:resumeExecution': {
      // workflowId is passed through from the restored agent state in the webview
      const { artifactId: resumeId, workflowId, sessionId: resumeSessionId } = message;

      try {
        const activeSession = getActiveChatSession();
        if (!activeSession?.model || !activeSession?.stream) {
          vscode.window.showWarningMessage(
            'Resume requires an active AI chat session. Open the @agileagentcanvas chat participant first.'
          );
          if (webview) {
            webview.postMessage({
              type: 'agentStateUpdated',
              artifactId: resumeId,
              agentState: { status: 'interrupted', interruptionReason: 'no-session' },
            });
          }
          return true;
        }

        const found = store.findArtifactById(resumeId);
        if (!found) {
          vscode.window.showErrorMessage(`Artifact ${resumeId} not found`);
          return true;
        }

        if (!workflowId) {
          vscode.window.showErrorMessage('No workflow ID provided for resume');
          return true;
        }

        // Launch the workflow directly without re-transitioning — the artifact
        // is already in the correct column. Keep the restored concurrency lock
        // held during execution and release it afterwards.
        const executor = getWorkflowExecutor();
        const agentRole = inferRoleFromWorkflow(workflowId);

        try {
          await executor.executeLaneTransition(
            workflowId,
            found.artifact,
            store,
            activeSession.model,
            activeSession.stream,
            activeSession.token
          );
        } finally {
          // Release the restored lock after execution completes or fails
          concurrencyQueue.release(resumeId);
        }

        if (webview) {
          webview.postMessage({
            type: 'agentStateUpdated',
            artifactId: resumeId,
            agentState: {
              status: 'completed',
              agentRole,
            },
            lockInfo: { locked: false },
          });
        }
      } catch (error) {
        logger.error(`[AgenticKanban] Resume execution failed: ${resumeId}`, { error });
        if (webview) {
          webview.postMessage({
            type: 'transitionResult',
            artifactId: resumeId,
            ok: false,
            blockedBy: [errMsg(error)],
          });
        }
      }
      return true;
    }

    case 'kanban:abandonExecution': {
      const { artifactId: abandonId, sessionId: abandonSessionId } = message;

      try {
        // Release the concurrency lock
        concurrencyQueue.release(abandonId);

        // Write a trace entry so this session is no longer identified as
        // interrupted on the next restart. The entry has type 'decision'
        // with decision 'abandoned' — scanInterruptedSessions recognizes
        // this as a terminal state.
        try {
          if (abandonSessionId) {
            getTraceRecorder().record({
              sessionId: abandonSessionId,
              type: 'decision',
              agent: 'lane-transition',
              data: {
                decision: 'abandoned',
                artifactId: abandonId,
                rationale: 'User abandoned the interrupted execution',
              },
            });
          }
        } catch {
          // Trace recorder may not be initialized (shouldn't happen, but guard)
        }

        if (webview) {
          webview.postMessage({
            type: 'agentStateUpdated',
            artifactId: abandonId,
            agentState: { status: 'idle' },
            lockInfo: { locked: false },
          });
        }

        logger.info(`[AgenticKanban] Abandoned interrupted execution for ${abandonId}`);
      } catch (error) {
        logger.error(`[AgenticKanban] Abandon execution failed: ${abandonId}`, { error });
      }
      return true;
    }

    case 'kanban:undoAbandonExecution': {
      const { artifactId: undoId } = message;
      try {
        // Re-acquire the concurrency lock (use a generic agent name since
        // we can't guarantee the original agent role is available here).
        const requestId = `undo-${undoId}-${Date.now()}`;
        concurrencyQueue.acquire(undoId, 'undo-revert', requestId);

        if (webview) {
          webview.postMessage({
            type: 'agentStateUpdated',
            artifactId: undoId,
            agentState: { status: 'interrupted', interruptionReason: 'user-abort' },
            lockInfo: { locked: true, agentName: 'undo-revert' },
          });
        }

        logger.info(`[AgenticKanban] Undid abandon for ${undoId}`);
      } catch (error) {
        logger.error(`[AgenticKanban] Undo abandon failed for ${undoId}`, { error });
        if (webview) {
          webview.postMessage({
            type: 'transitionResult',
            artifactId: undoId,
            ok: false,
            blockedBy: [errMsg(error)],
          });
        }
      }
      return true;
    }

    case 'kanban:jumpToTerminal': {
      const { artifactId: jumpId } = message;

      // Send accumulated terminal output to the webview for modal display
      const output = terminalExecutor.getTerminalOutput(jumpId);
      if (webview) {
        webview.postMessage({
          type: 'terminalOutput',
          artifactId: jumpId,
          data: output,
        });
      }

      // Attach a streaming callback so the modal shows live output
      const streamDisposable = terminalExecutor.attachWebviewStream(jumpId, (chunk: string) => {
        if (webview) {
          try {
            webview.postMessage({
              type: 'terminalOutputAppend',
              artifactId: jumpId,
              data: chunk,
            });
          } catch {
            streamDisposable.dispose();
          }
        } else {
          streamDisposable.dispose();
        }
      });

      // Always show terminal in VS Code panel as well (backup)
      const found = terminalExecutor.jumpToTerminal(jumpId);
      if (!found) {
        vscode.window.showInformationMessage(
          `No active terminal found for ${jumpId}. The terminal session may have ended.`
        );
      }
      return true;
    }

    case 'kanban:fetchAgentInfo': {
      const { artifactId } = message;
      const found = store.findArtifactById(artifactId);

      // 1) Agent persona — resolve from artifact type
      let persona: { name: string; title: string; icon: string; role: string; communicationStyle: string } | undefined;
      if (found?.type) {
        const bmadPath = path.join(extensionUri.fsPath, 'resources', '_aac');
        const p = getPersonaForArtifactType(bmadPath, found.type);
        if (p) {
          persona = {
            name: p.name,
            title: p.title,
            icon: p.icon,
            role: p.role,
            communicationStyle: p.communicationStyle,
          };
        }
      }

      // 2) Terminal session info (if running in a terminal)
      const session = terminalExecutor.getTerminalSession(artifactId);
      const terminalInfo = session
        ? {
            workflowId: session.workflowId,
            agentRole: session.agentRole,
            provider: session.provider,
            startedAt: session.startedAt,
          }
        : undefined;

      // 3) Trace summary counts: how many decisions, tool calls, errors?
      let traceSummary: { decisions: number; toolCalls: number; errors: number } | undefined;
      try {
        const sid = session?.sessionId;
        if (sid) {
          const entries = await getTraceRecorder().getSessionTrace(sid);
          traceSummary = {
            decisions: entries.filter(e => e.type === 'decision').length,
            toolCalls: entries.filter(e => e.type === 'tool_call').length,
            errors: entries.filter(e => e.type === 'error').length,
          };
        }
      } catch {
        // Trace recorder may not have data for this session
      }

      if (webview) {
        webview.postMessage({
          type: 'agentInfo',
          artifactId,
          persona,
          terminalInfo,
          traceSummary,
        });
      }
      return true;
    }

    default:
      return false;
  }
}

/** Infer a display-friendly agent role name from a workflow ID. */
function inferRoleFromWorkflow(workflowId: string): string {
  const roleMap: Record<string, string> = {
    'dev-story': 'Crafter',
    'code-review': 'Reviewer',
    'sprint-planning': 'Planner',
    'story-enhancement': 'Analyst',
    'epic-enhancement': 'Analyst',
    'create-prd': 'Strategist',
  };
  return roleMap[workflowId] || 'Agent';
}
