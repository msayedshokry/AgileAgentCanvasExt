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
import { setActivePtyBackend } from '../workflow/embedded-terminal-provider';
import { inferRoleFromWorkflow } from '../harness/role-inference';
import { getPersonaForArtifactType } from '../chat/agent-personas';
import { setKanbanAutoAdvance, isKanbanAutoAdvanceEnabled, getKanbanWipLimits } from '../workflow/kanban-settings';
import { schedulerWebviewControls, MSG_SCHEDULER_STATE } from '../workflow/scheduler-webview-controls';
import { goalDecomposer } from '../workflow/goal-decomposer';
import { visualPlanService } from '../workflow/visual-plan-service';
import { isVisualPlanEnabled, VISUAL_PLAN_DISABLED_MESSAGE } from '../utils/visual-plan-config';
import { budgetEnforcer } from '../workflow/budget-enforcer';
import { circuitBreaker } from '../workflow/circuit-breaker';

import { kanbanOrchestrator } from '../workflow/kanban-orchestrator';

import { isTerminalInbound } from './terminal-protocol';
import { TerminalSessionRouter } from './terminal-session-router';
import type { TerminalBackend } from '../workflow/terminal-backend';
import { VsCodeTerminalBackend } from '../workflow/vscode-terminal-backend';
import { NodePtyTerminalBackend } from '../workflow/node-pty-terminal-backend';

// ── Terminal-close → terminal:exit bridge ────────────────────────────────────
// The terminalExecutor already handles internal cleanup when a VS Code terminal
// closes, but the webview Terminals view needs to display [session ended]. This
// listener watches every closed terminal, parses the AAC naming convention
// ("AAC: {workflowId} {artifactId}"), and posts terminal:exit for the matching
// sessionId (= artifactId) so AgentTerminal tiles show the end-of-session marker.
//
// Lazy-registered (not at module load) so test mocks that don't include
// vscode.window.onDidCloseTerminal don't crash the Cucumber suite.
let terminalCloseListener: vscode.Disposable | undefined;
function ensureTerminalCloseListener(): void {
  if (terminalCloseListener) return;
  if (typeof vscode.window.onDidCloseTerminal !== 'function') return;
  terminalCloseListener = vscode.window.onDidCloseTerminal((closed) => {
    const router = terminalRouter;
    if (!router) return;
    const name = closed.name;
    const match = name.match(/^AAC:\s+\S+\s+(\S+)/);
    if (match) {
      const artifactId = match[1];
      router.emitExit(artifactId);
    }
  });
}

import { errMsg } from '../utils/error';

// Audit gap #20/#42: producer imports the canonical TraceBreakdown shape
// and the shared `UNTAGGED_BUCKET` constant directly from the production-side
// types module (`src/types/trace-breakdown.ts`) rather than a `test/`
// helper, so producer and consumer share a single source of truth — drift
// in the wire shape surfaces as a compile error here and in both
// producer/consumer tests.
import type { TraceBreakdownRow, TraceBreakdownMessage } from '../types/trace-breakdown';
import { UNTAGGED_BUCKET } from '../types/trace-breakdown';

// ─── Terminal router (backend-agnostic, bridges protocol → TerminalBackend) ───
// Re-created when the webview changes so `postMessage` always targets the
// active panel (not a stale, closed one from a previous view lifecycle).
let terminalRouter: TerminalSessionRouter | undefined;
let lastWebview: vscode.Webview | undefined;
function getTerminalRouter(webview: vscode.Webview): TerminalSessionRouter {
  ensureTerminalCloseListener();
  if (webview !== lastWebview || !terminalRouter) {
    terminalRouter?.dispose();
    const useEmbedded = vscode.workspace
      .getConfiguration('agileagentcanvas.agenticKanban')
      .get<boolean>('embeddedTerminal', false);
    // Only create the pty backend when the setting is on (avoids wasted
    // binary loads of node-pty when the user stays on Option A).
    const ptyBackend = useEmbedded ? new NodePtyTerminalBackend() : undefined;
    const backend: TerminalBackend = ptyBackend?.supportsInput
      ? ptyBackend
      : new VsCodeTerminalBackend(terminalExecutor);
    terminalRouter = new TerminalSessionRouter(
      backend,
      (m) => webview.postMessage(m),
    );
    // Notify the webview of current backend capabilities
    webview.postMessage({
      type: 'terminal:capabilities',
      supportsInput: backend.supportsInput,
    });
    // Wire the pty backend into the terminal executor so agents spawned
    // via executeTerminalWorkflow run in embedded pty shells instead of
    // VS Code terminals. When the setting is off or node-pty failed to
    // load, ptyBackend is undefined and the executor falls back to Option A.
    if (ptyBackend?.supportsInput) {
      setActivePtyBackend(ptyBackend);
      // When the pty shell exits, clean up executor tracking AND post
      // terminal:exit to the webview so AgentTerminal tiles show the
      // [session ended] marker.
      ptyBackend.onSessionExit = (sessionId, artifactId, exitCode) => {
        terminalExecutor.onPtySessionExit(artifactId, exitCode);
        terminalRouter?.emitExit(artifactId);
      };
    } else {
      setActivePtyBackend(undefined);
    }
    lastWebview = webview;
  }
  return terminalRouter;
}

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

// =============================================================================
// Trace Breakdown (Audit follow-up to gap #20/#42)
// =============================================================================
//
// Mirror of `TraceBreakdownMessage` / `TraceBreakdownRow` in
// webview-ui/src/types.ts. Defined locally here (not imported) because the
// extension and webview-ui are separate TS projects with independent
// tsconfigs — the wire format is the structural identity, and any drift
// will be caught by the consumer's structural check on receipt.

/**
 * Compute the trace breakdown for the most recent Kanban autonomous-loop
 * run window.
 *
 * A "run" is a `(started X, completed X | abandoned | error)` pair detected
 * from `lane-transition` agent decisions — same heuristic as
 * `TraceRecorder.scanInterruptedSessions` so what the panel shows matches
 * what the extension considers an active-or-just-finished run. Includes
 * `flushAll()` before searching because `searchTraces` only reads from
 * disk; without a flush the panel would lag up to 2s behind active tool
 * calls during the run window.
 *
 * Exported as a testing seam so unit tests in
 * `agentic-kanban-message-handler.test.ts` can drive it directly with
 * mocked `TraceRecorder` dependencies. Production code calls it through
 * the `case 'getTraceBreakdown':` IPC handler below.
 */
export async function computeTraceBreakdownForMostRecentRun(): Promise<TraceBreakdownMessage> {
  const trace = getTraceRecorder();

  // Force in-flight buffered entries to disk so the search is current.
  // Cheap (writes a buffered blob) and necessary — searchTraces does not
  // consult the in-memory buffer.
  await trace.flushAll();

  // Pull decisions emitted by the lane-transition agent. Same sentinel
  // shape used by `TraceRecorder.scanInterruptedSessions`
  // (src/trace/trace-recorder.ts:373-379): `data.decision` starts with
  // `started ` for run-start and `completed ` (or `abandoned`, or `type:
  // 'error'` for a transition error) for run-end.
  const decisions = await trace.searchTraces({
    agent: 'lane-transition',
    type: 'decision',
    limit: 1000,
  });
  decisions.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  // Walk chronologically: (started X) → next terminal-style entry closes
  // the run. Most recent pair wins; an un-terminated `started` becomes a
  // still-running run with `endedAt: null` and `isRunning: true`.
  let startInfo: { time: string; workflow: string } | null = null;
  let lastWindow: { startedAt: string; endedAt: string | null; workflow: string; isRunning: boolean } | null = null;
  for (const d of decisions) {
    const decision: string = d.data?.decision ?? '';
    if (decision.startsWith('started ')) {
      startInfo = { time: d.timestamp, workflow: decision.slice('started '.length) };
      continue;
    }
    const isTerminalMark =
      decision.startsWith('completed ') || decision === 'abandoned' || d.type === 'error';
    if (startInfo && isTerminalMark) {
      lastWindow = {
        startedAt: startInfo.time,
        endedAt: d.timestamp,
        workflow: startInfo.workflow,
        isRunning: false,
      };
      startInfo = null;
    }
  }
  if (startInfo) {
    // No matching terminal marker → run is still in progress.
    lastWindow = {
      startedAt: startInfo.time,
      endedAt: null,
      workflow: startInfo.workflow,
      isRunning: true,
    };
  }

  if (!lastWindow) {
    return {
      type: 'traceBreakdownResponse',
      workflowName: '',
      startedAt: '',
      endedAt: null,
      isRunning: false,
      totalEntries: 0,
      totalToolCalls: 0,
      totalErrors: 0,
      perWorkflow: [],
    };
  }

  // Pull every entry in the window. Use a generous limit and trim by
  // terminal time so we don't include post-run noise.
  const allInWindow = await trace.searchTraces({
    since: new Date(lastWindow.startedAt),
    limit: 5000,
  });
  const endMs = lastWindow.endedAt ? Date.parse(lastWindow.endedAt) : Date.now();
  const filtered = allInWindow.filter(e => Date.parse(e.timestamp) <= endMs);

  // Group by `entry.workflowName` (top-level field). Pre-audit entries                // show under `UNTAGGED_BUCKET` — same convention as the underlying helper
  // semantics: no workflow name → not part of a named workflow.
  const buckets = new Map<string, { toolCalls: number; errors: number; tools: Set<string>; total: number }>();
  for (const e of filtered) {                const key = e.workflowName ?? UNTAGGED_BUCKET;
    const bucket = buckets.get(key) ?? {
      toolCalls: 0,
      errors: 0,
      tools: new Set<string>(),
      total: 0,
    };
    if (e.type === 'tool_call') bucket.toolCalls += 1;
    if (e.type === 'error') bucket.errors += 1;
    const toolName = e.data?.toolName;
    if (typeof toolName === 'string') bucket.tools.add(toolName);
    bucket.total += 1;
    buckets.set(key, bucket);
  }
  const perWorkflow: TraceBreakdownRow[] = Array.from(buckets.entries())
    .map(([workflow, b]) => ({
      workflow,
      toolCallCount: b.toolCalls,
      errorCount: b.errors,
      distinctTools: Array.from(b.tools).sort(),
      totalEntries: b.total,
    }))
    .sort((a, b) => b.toolCallCount - a.toolCallCount);

  return {
    type: 'traceBreakdownResponse',
    workflowName: lastWindow.workflow,
    startedAt: lastWindow.startedAt,
    endedAt: lastWindow.endedAt,
    isRunning: lastWindow.isRunning,
    totalEntries: filtered.length,
    totalToolCalls: filtered.filter(e => e.type === 'tool_call').length,
    totalErrors: filtered.filter(e => e.type === 'error').length,
    perWorkflow,
  };
}
export async function handleAgenticKanbanMessage(
  message: { type: string; [key: string]: any },
  store: ArtifactStore,
  extensionUri: vscode.Uri,
  webview?: vscode.Webview
): Promise<boolean> {
  // ── Terminal protocol routing (backend-agnostic) ─────────────────────────
  if (isTerminalInbound(message)) {
    if (webview) {
      getTerminalRouter(webview).handle(message);
    }
    return true;
  }

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
      const artifacts = buildArtifacts(store, vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath, visualPlanService.list());
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
        }        // Write a trace entry so this session is no longer identified as
        // interrupted on the next restart. The entry has type 'decision'
        // with decision 'abandoned' — scanInterruptedSessions recognizes
        // this as a terminal state.
        //
        // TODO(audit-gap-#20-#42): tag this entry's top-level `workflowName`
        // so it lands in the workflow's bucket instead of `(untagged)` in the
        // Trace Breakdown. Today `workflowId` is NOT in scope here — only
        // `abandonId` (artifactId) and `abandonSessionId`. Two follow-up
        // paths to consider:
        //   (a) query the recorder for the session's most recent
        //       `started X` decision to recover workflowId (would require
        //       converting this try/catch to async — currently `record()`
        //       is fire-and-forget within the synchronous IPC branch);
        //   (b) plumb `workflowId` through the `kanban:abandonExecution`
        //       IPC payload from the webview (state already exists there
        //       in the restored checkpoint).
        // The breakdown walk still resolves the workflow from the prior
        // `started X` decision's `data.decision` text, so the panel's
        // workflow-name header remains correct — this is cosmetic drift,
        // not a functional bug.
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

    // P1 #5: approval checkpoint response — resolve the orchestrator's
    // pending Promise so the paused autonomous loop continues or aborts.
    case 'kanban:approvalResponse': {
      const { artifactId: approvalId, approved } = message;
      if (kanbanOrchestrator && approvalId) {
        const found = kanbanOrchestrator.resolveApproval(approvalId, !!approved);
        if (found) {
          logger.info(`[AgenticKanban] Approval ${approved ? 'granted' : 'denied'} for ${approvalId}`);
        }
      }
      return true;
    }

    // P1 #4: agent take-over — acknowledge the webview's take-over request
    // and push the latest terminal:capabilities so the UI knows whether
    // interactive input is available for this session.
    case 'kanban:takeOverAgent': {
      const { artifactId: takeoverId } = message;
      if (webview) {
        // Re-push capabilities so the webview knows if input works
        webview.postMessage({
          type: 'terminal:capabilities',
          supportsInput: terminalRouter?.supportsInput ?? false,
        });
        // Jump to the terminal in the VS Code panel as fallback
        terminalExecutor.jumpToTerminal(takeoverId);
        logger.info(`[AgenticKanban] Take-over requested for ${takeoverId}`);
      }
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
          const artifacts = buildArtifacts(store, vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath, visualPlanService.list());
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

    /**
     * Audit follow-up to gap #20/#42 — return a per-workflow aggregation of
     * tool-call entries from the most recent Kanban autonomous-loop run
     * window, so the webview can render a "Trace" panel that answers
     * "what workflows ran during the kanban loop, and how many tool calls
     * did each one make?".
     */
    case 'getTraceBreakdown': {
      if (webview) {
        try {
          const breakdown = await computeTraceBreakdownForMostRecentRun();
          webview.postMessage(breakdown);
        } catch (error) {
          logger.warn(`[AgenticKanban] computeTraceBreakdownForMostRecentRun failed: ${errMsg(error)}`);
          // Surface an empty breakdown rather than failing the IPC — the
          // panel renders its own empty-state hint when perWorkflow is [].
          webview.postMessage({
            type: 'traceBreakdownResponse',
            workflowName: '',
            startedAt: '',
            endedAt: null,
            isRunning: false,
            totalEntries: 0,
            totalToolCalls: 0,
            totalErrors: 0,
            perWorkflow: [],
          });
        }
      }
      return true;
    }

    // ── Visual Plan IPC ────────────────────────────────────────────────────

    case 'visualPlan:generate': {
      // Check if the Visual Plan feature is enabled
      if (!isVisualPlanEnabled()) {
        if (webview) {
          webview.postMessage({
            type: 'visualPlan:error',
            error: VISUAL_PLAN_DISABLED_MESSAGE,
          });
        }
        return true;
      }
      try {
        const id = await visualPlanService.generate({
          goal: message.goal ?? message.text ?? '',
          sourceArtifactId: message.sourceArtifactId,
          context: message.context,
        });
        if (webview) {
          webview.postMessage({ type: 'visualPlan:generating', planId: id, goal: message.goal });
        }
      } catch (error) {
        logger.warn(`[AgenticKanban] visualPlan:generate failed: ${errMsg(error)}`);
        if (webview) {
          webview.postMessage({ type: 'visualPlan:error', error: errMsg(error) });
        }
      }
      return true;
    }

    case 'visualPlan:list': {
      if (webview) {
        const plans = visualPlanService.list();
        webview.postMessage({ type: 'visualPlan:list:result', plans });
      }
      return true;
    }

    case 'visualPlan:fetch': {
      if (webview) {
        const plan = visualPlanService.get(message.planId);
        if (plan) {
          webview.postMessage({ type: 'visualPlan:ready', plan });
        } else {
          webview.postMessage({ type: 'visualPlan:error', error: `Plan not found: ${message.planId}` });
        }
      }
      return true;
    }

    case 'visualPlan:comment': {
      try {
        await visualPlanService.addComment(
          message.planId,
          message.comment?.sectionId ?? '',
          message.comment?.body ?? ''
        );
        // Refresh the plan so the webview shows the new comment
        if (webview) {
          const plan = visualPlanService.get(message.planId);
          if (plan) {
            webview.postMessage({ type: 'visualPlan:ready', plan });
          }
        }
      } catch (error) {
        logger.warn(`[AgenticKanban] visualPlan:comment failed: ${errMsg(error)}`);
        if (webview) {
          webview.postMessage({ type: 'visualPlan:error', error: errMsg(error) });
        }
      }
      return true;
    }

    case 'visualPlan:approve': {
      try {
        const dispatchedIds = await visualPlanService.approve(message.planId, message.taskIds ?? []);
        if (webview) {
          // Refresh board so ghost cards become solid
          const artifacts = buildArtifacts(store, vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath, visualPlanService.list());
          webview.postMessage({ type: 'updateArtifacts', artifacts });
          webview.postMessage({ type: 'visualPlan:dispatched', planId: message.planId, dispatchedIds });
        }
      } catch (error) {
        logger.warn(`[AgenticKanban] visualPlan:approve failed: ${errMsg(error)}`);
        if (webview) {
          webview.postMessage({ type: 'visualPlan:error', error: errMsg(error) });
        }
      }
      return true;
    }

    case 'visualPlan:requestChanges': {
      try {
        const plan = await visualPlanService.requestChanges(message.planId, message.comments ?? []);
        if (webview) {
          webview.postMessage({ type: 'visualPlan:ready', plan });
        }
      } catch (error) {
        logger.warn(`[AgenticKanban] visualPlan:requestChanges failed: ${errMsg(error)}`);
        if (webview) {
          webview.postMessage({ type: 'visualPlan:error', error: errMsg(error) });
        }
      }
      return true;
    }

    default:
      return false;
  }
}
