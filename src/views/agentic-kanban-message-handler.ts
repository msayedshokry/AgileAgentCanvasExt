import { createLogger } from '../utils/logger';
import type { ArtifactChanges } from '../types';
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
import { inferRoleFromWorkflow } from '../harness/role-inference';
import { getPersonaForArtifactType } from '../chat/agent-personas';
import { setKanbanAutoAdvance, isKanbanAutoAdvanceEnabled, getKanbanWipLimits } from '../workflow/kanban-settings';
import { schedulerWebviewControls, MSG_SCHEDULER_STATE } from '../workflow/scheduler-webview-controls';
import { goalDecomposer } from '../workflow/goal-decomposer';
import { budgetEnforcer } from '../workflow/budget-enforcer';
import { circuitBreaker } from '../workflow/circuit-breaker';

import { kanbanOrchestrator } from '../workflow/kanban-orchestrator';

import { errMsg } from '../utils/error';

// P0 #1 fix: Track active webview stream disposables per artifact so repeated
// `kanban:jumpToTerminal` clicks don't stack listeners and duplicate output.
const terminalStreamDisposables = new Map<string, vscode.Disposable>();
function disposeTerminalStream(artifactId: string): void {
  const d = terminalStreamDisposables.get(artifactId);
  if (d) {
    try { d.dispose(); } catch (err) { logger.debug(`[AgenticKanban] stream dispose failed: ${errMsg(err)}`); }
    terminalStreamDisposables.delete(artifactId);
  }
}

/** Dispose every active terminal stream listener. Called when the view is torn down. */
export function disposeAllTerminalStreams(): void {
  for (const [artifactId] of terminalStreamDisposables) {
    disposeTerminalStream(artifactId);
  }
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
        // P1 #12: push fresh chat session state on every card drag so the
        // Resume button stays in sync when the user opens/closes a chat
        // without otherwise triggering a message.
        if (webview) {
          const hasSession = !!(activeSession?.model && activeSession?.stream);
          webview.postMessage({
            type: 'chatSessionState',
            active: hasSession,
            model: hasSession ? activeSession?.model?.label : undefined,
          });
        }

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

    case 'kanban:setAutoAdvance': {
      await setKanbanAutoAdvance(!!message.enabled);
      if (webview) {
        webview.postMessage({
          type: 'autoAdvanceState',
          enabled: isKanbanAutoAdvanceEnabled(),
        });
      }
      return true;
    }

    case 'kanban:getAutoAdvance': {
      if (webview) {
        webview.postMessage({
          type: 'autoAdvanceState',
          enabled: isKanbanAutoAdvanceEnabled(),
        });
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
        // P1 #12: if the handler was invoked without a webview (e.g., CLI/test),
        // proceed with the VSCode notification fallback path.
        const activeSession = getActiveChatSession();
        const hasActiveSession = !!(activeSession?.model && activeSession?.stream);
        if (!hasActiveSession) {
          if (webview) {
            webview.postMessage({
              type: 'chatSessionState',
              active: false,
            });
            webview.postMessage({
              type: 'transitionResult',
              artifactId: resumeId,
              ok: false,
              blockedBy: ['Resume requires an active @agileagentcanvas chat session'],
            });
            webview.postMessage({
              type: 'agentStateUpdated',
              artifactId: resumeId,
              agentState: { status: 'interrupted', interruptionReason: 'no-session' },
            });
          } else {
            vscode.window.showWarningMessage(
              'Resume requires an active AI chat session. Open the @agileagentcanvas chat participant first.'
            );
          }
          return true;
        }

        // Inform webview that a chat session IS active (so the Resume
        // button is enabled and the tooltip shows the model name).
        if (webview) {
          webview.postMessage({
            type: 'chatSessionState',
            active: true,
            model: activeSession?.model?.label,
          });
        }

        const found = store.findArtifactById(resumeId);
        if (!found) {
          vscode.window.showErrorMessage(`Artifact ${resumeId} not found`);
          return true;
        }

        if (!workflowId) {
          // P1 #10: post a transitionResult so the webview drops the card
          // out of pendingTransitions and shows a toast — the error
          // notification alone leaves the card stuck in 'queued' forever.
          // `showErrorMessage` is a fallback for the rare case the handler
          // is invoked without a webview (e.g. direct CLI/test invocation).
          webview?.postMessage({
            type: 'transitionResult',
            artifactId: resumeId,
            ok: false,
            blockedBy: ['No workflow ID provided for resume'],
          });
          webview?.postMessage({
            type: 'agentStateUpdated',
            artifactId: resumeId,
            agentState: { status: 'failed' },
            lockInfo: { locked: false },
          });
          if (!webview) {
            vscode.window.showErrorMessage('No workflow ID provided for resume');
          }
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
        }    } catch (error) {
      logger.error(`[AgenticKanban] Resume execution failed: ${resumeId}`, { error });
      if (webview) {
        // P0 #2 fix: clear the lock indicator on resume failure so the card
        // doesn't keep showing "Locked by …" after a failed resume.
        webview.postMessage({
          type: 'agentStateUpdated',
          artifactId: resumeId,
          agentState: { status: 'failed' },
          lockInfo: { locked: false },
        });
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
        // #26: Signal the orchestrator to abort any running autonomous loop
        // BEFORE releasing the lock. If abort() returns true, the orchestrator's
        // finally block will handle lock release. If false, no active run exists
        // so we release the lock directly (interrupted session).
        const wasRunning = kanbanOrchestrator?.abort(abandonId) ?? false;
        if (!wasRunning) {
          concurrencyQueue.release(abandonId);
        }

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
      const { artifactId: undoId, sessionId: undoSessionId } = message;
      try {
        // Reviewer feedback: acquire the lock FIRST. If acquire throws, we
        // bail out without having touched the trace file. Re-acquire the
        // concurrency lock (use a generic agent name since we can't
        // guarantee the original agent role is available here).
        const requestId = `undo-${undoId}-${Date.now()}`;
        concurrencyQueue.acquire(undoId, 'undo-revert', requestId);

        // P0 #3 fix: actually undo the abandon by removing the
        // `decision: 'abandoned'` trace entry, so scanInterruptedSessions
        // will surface this artifact as interrupted again on the next
        // restart (instead of silently keeping the lock gone).
        if (undoSessionId) {
          try {
            await getTraceRecorder().removeDecision(undoSessionId, 'abandoned');
          } catch (traceErr) {
            logger.warn(`[AgenticKanban] Could not remove abandoned trace entry: ${errMsg(traceErr)}`);
          }
        }

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

    case 'kanban:closeTerminal': {
      // Bug fix #2: webview closed the terminal modal — dispose the stream
      // listener so IPC doesn't keep spamming a hidden webview.
      const { artifactId: closeId } = message;
      disposeTerminalStream(closeId);
      return true;
    }

    case 'kanban:jumpToTerminal': {
      const { artifactId: jumpId } = message;

      // P0 #1 fix: dispose any prior stream listener for this artifact so
      // repeated clicks don't stack listeners and duplicate output.
      disposeTerminalStream(jumpId);

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
            disposeTerminalStream(jumpId);
          }
        } else {
          disposeTerminalStream(jumpId);
        }
      });
      terminalStreamDisposables.set(jumpId, streamDisposable);

      // Always show terminal in VS Code panel as well (backup)
      const found = terminalExecutor.jumpToTerminal(jumpId);
      if (!found) {
        vscode.window.showInformationMessage(
          `No active terminal found for ${jumpId}. The terminal session may have ended.`
        );
      }
      return true;
    }

    case 'kanban:updateArtifactTitle': {
      const { artifactId, title } = message;
      try {
        const found = store.findArtifactById(artifactId);
        if (!found) {
          logger.warn(`[AgenticKanban] updateArtifactTitle: ${artifactId} not found`);
          return true;
        }
        // Typed: for an epic we accept a Partial<Epic>-shaped title patch.
        await store.updateArtifact(found.type, artifactId, { title } as Partial<import('../types').Epic> & { metadata?: import('../types').BmadMetadata });
        logger.info(`[AgenticKanban] Updated title for ${artifactId} to "${title}"`);
        // Push updated artifacts to webview so the title persists visually
        if (webview) {
          const artifacts = buildArtifacts(store, vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath);
          webview.postMessage({ type: 'updateArtifacts', artifacts });
        }
      } catch (error) {
        logger.error(`[AgenticKanban] updateArtifactTitle failed: ${artifactId}`, { error });
      }
      return true;
    }

    case 'kanban:getWipLimits': {
      if (webview) {
        webview.postMessage({
          type: 'kanban:wipLimits',
          limits: getKanbanWipLimits(),
        });
      }
      return true;
    }

    case 'setSchedulerState': {
      schedulerWebviewControls.handleSetState(message.state ?? {});
      // Echo current state back so the webview can re-render immediately
      if (webview) {
        webview.postMessage({ type: MSG_SCHEDULER_STATE, ...schedulerWebviewControls.buildStateMessage() });
      }
      return true;
    }

    case 'getSchedulerState': {
      if (webview) {
        webview.postMessage({ type: MSG_SCHEDULER_STATE, ...schedulerWebviewControls.buildStateMessage() });
      }
      return true;
    }

    case 'getBudgetStatus': {
      if (webview) {
        webview.postMessage({ type: 'budgetStatus', ...budgetEnforcer.getStatus(message.artifactId) });
      }
      return true;
    }

    case 'getCircuitStatus': {
      if (webview) {
        const workflowId = (message.workflowId as string) ?? '';
        webview.postMessage({ type: 'circuitStatus', workflowId, status: circuitBreaker.getStatus(workflowId) ?? null });
      }
      return true;
    }

    case 'submitGoal': {
      try {
        const id = await goalDecomposer.submit(message.text ?? '');
        if (webview) {
          webview.postMessage({ type: 'goalSubmitted', goalId: id, text: message.text });
        }
      } catch (error) {
        if (webview) {
          webview.postMessage({ type: 'goalSubmitError', error: errMsg(error) });
        }
      }
      return true;
    }

    case 'approveGoalStories': {
      try {
        await goalDecomposer.approveStories(message.goalId, message.storyIds);
      } catch (error) {
        logger.warn(`[AgenticKanban] approveGoalStories failed: ${errMsg(error)}`);
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
