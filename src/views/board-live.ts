// ─── Board tools during a run: the handlers ──────────────────────────────────
// (docs/plans/2026-11-26-agent-board-live.md, L1–L3.) What each board tool
// does. Notes, proposals and handoffs go through the same sanitizer and
// applier as the verdict's "board" object (views/board-protocol.ts), so the
// two channels behave the same. board_ask waits for the user's answer;
// board_check_messages hands over messages the user sent this card.

import * as vscode from 'vscode';
import type { ArtifactStore } from '../state/artifact-store';
import { BoardLiveServer, type RunScope, type ToolResult } from '../workflow/board-live/board-server';
import { ASK_WAIT_MS, LiveQuestions } from '../workflow/board-live/live-questions';
import { sanitizeBoardActions } from '../workflow/harness/board-actions';
import { LIVE_WORKFLOW } from '../workflow/harness/board-effects';
import { readAgentNotes } from '../workflow/harness/agent-brief';
import type { AgentTeam } from '../workflow/harness/agent-team';
import type { AgentVerdictEvent } from '../workflow/terminal-executor';
import { setBoardLive } from '../workflow/terminal-executor';
import { createLogger } from '../utils/logger';
import { errMsg } from '../utils/error';

const logger = createLogger('board-live');
const MAX_CARD_JSON = 20_000;

export const liveQuestions = new LiveQuestions();

export interface BoardLiveDeps {
  readonly store: Pick<ArtifactStore, 'findArtifactById' | 'getEpics'>;
  readonly readTeam: () => AgentTeam;
  readonly apply: (evt: AgentVerdictEvent) => Promise<void>;
  readonly notifyQuestion: (cardId: string, reason: string, questions: readonly string[]) => void;
  readonly dismiss: (cardId: string) => void;
  readonly takeMessages: (cardId: string) => string[];
  readonly questions: LiveQuestions;
  readonly askWaitMs?: number;
  /** Project memory (workflow/harness/project-memory.ts); absent when there is no output folder. */
  readonly memory?: {
    recall(query: string): string[];
    remember(cardId: string, author: string, text: string): void;
  };
}

function epicIdOf(store: BoardLiveDeps['store'], cardId: string): string | undefined {
  for (const e of store.getEpics()) {
    if (e.id === cardId || (e.stories ?? []).some((s) => s.id === cardId)) return e.id;
  }
  return undefined;
}

/** Run one board tool for a run's card. Never throws. */
export async function runBoardTool(deps: BoardLiveDeps, scope: RunScope, tool: string, args: Record<string, unknown>): Promise<ToolResult> {
  const team = deps.readTeam();
  const agent = team.agents.find((a) => a.id === scope.agentId);
  const who = agent?.name ?? scope.agentName ?? 'The agent';
  const viaBoard = async (board: unknown) => {
    const { value, dropped } = sanitizeBoardActions(board);
    await deps.apply({ artifactId: scope.cardId, workflowId: LIVE_WORKFLOW, agent, verdict: { verdict: 'COMPLETED', board: value, ...(dropped.length ? { boardDropped: [...dropped] } : {}) } });
    return dropped;
  };
  try {
    switch (tool) {
      case 'board_get_card': {
        const card = deps.store.findArtifactById(scope.cardId);
        if (!card) return { ok: false, text: `Card ${scope.cardId} is not on the board any more.` };
        const json = JSON.stringify(card.artifact, null, 2);
        return { ok: true, text: json.length > MAX_CARD_JSON ? `${json.slice(0, MAX_CARD_JSON)}\n… (truncated)` : json };
      }
      case 'board_list_epic': {
        const epicId = epicIdOf(deps.store, scope.cardId);
        const epic = deps.store.getEpics().find((e) => e.id === epicId);
        if (!epic) return { ok: true, text: 'This card is not in an epic.' };
        const rows = (epic.stories ?? []).map((s) => `- ${s.id} | ${s.title} | ${String(s.status ?? 'backlog')} | ${team.assignments[s.id] ?? 'unassigned'}`);
        return { ok: true, text: `Epic ${epic.id}: ${epic.title ?? ''}\n${rows.join('\n') || '(no stories)'}` };
      }
      case 'board_note': {
        await viaBoard({ notes: args.text });
        return { ok: true, text: 'Noted on the card.' };
      }
      case 'board_propose': {
        const dropped = await viaBoard({ proposals: args.proposals });
        return { ok: true, text: `Proposed for the user to approve.${dropped.length ? ` Ignored: ${dropped.join('; ')}.` : ''}` };
      }
      case 'board_handoff': {
        const before = readAgentNotes(deps.store.findArtifactById(scope.cardId)?.artifact).length;
        await viaBoard({ handoff: { to: args.to, note: args.note } });
        const notes = readAgentNotes(deps.store.findArtifactById(scope.cardId)?.artifact);
        const last = notes.length > before ? notes[notes.length - 1] : undefined;
        return last?.author === 'Board'
          ? { ok: false, text: last.text }
          : { ok: true, text: `The card goes to ${String(args.to)} next.` };
      }
      case 'board_recall': {
        if (!deps.memory) return { ok: false, text: 'Project memory is not available in this workspace.' };
        const hits = deps.memory.recall(String(args.query));
        return { ok: true, text: hits.length ? hits.join('\n') : 'Nothing in project memory matches that.' };
      }
      case 'board_remember': {
        if (!deps.memory) return { ok: false, text: 'Project memory is not available in this workspace.' };
        deps.memory.remember(scope.cardId, who, String(args.text));
        return { ok: true, text: 'Saved to project memory. Later agents on this board will see it.' };
      }
      case 'board_check_messages': {
        const messages = deps.takeMessages(scope.cardId);
        return { ok: true, text: messages.length ? messages.map((m, i) => `${i + 1}. ${m}`).join('\n') : 'No new messages.' };
      }
      case 'board_ask': {
        const questions = (args.questions as string[]).map((q) => q.trim()).filter(Boolean);
        deps.notifyQuestion(scope.cardId, `${who} asks ${questions.length === 1 ? 'a question' : `${questions.length} questions`} and is waiting`, questions);
        const answer = await deps.questions.ask(scope.cardId, deps.askWaitMs ?? ASK_WAIT_MS);
        if (answer === undefined) {
          return { ok: false, text: 'No answer yet. End your run with verdict BLOCKED and put your question in "board": {"questions": [...]}; the user\'s answer will come back to you.' };
        }
        deps.dismiss(scope.cardId);
        deps.questions.noteAnswered(scope.cardId, questions);
        return { ok: true, text: `The user answered:\n${answer}` };
      }
      default:
        return { ok: false, text: `Unknown tool: ${tool}` };
    }
  } catch (err) {
    logger.warn(`[BoardLive] ${tool} on ${scope.cardId} failed: ${errMsg(err)}`);
    return { ok: false, text: `The board could not do that (${errMsg(err)}). Put it in the "board" object of your verdict instead.` };
  }
}

/** Start serving board tools to runs on first use; the executor asks for it. */
export function registerBoardLive(context: vscode.ExtensionContext, deps: Omit<BoardLiveDeps, 'questions'>, onActivity: (cardId: string) => void): void {
  const fullDeps: BoardLiveDeps = { ...deps, questions: liveQuestions };
  const server = new BoardLiveServer(async (scope, tool, args) => {
    onActivity(scope.cardId);
    // board_ask can wait minutes: keep the run's watchdog from treating it as silence.
    const keepAlive = tool === 'board_ask' ? setInterval(() => onActivity(scope.cardId), 60_000) : undefined;
    try {
      return await runBoardTool(fullDeps, scope, tool, args);
    } finally {
      if (keepAlive) clearInterval(keepAlive);
    }
  });
  let starting: Promise<string | undefined> | undefined;
  setBoardLive({
    shimPath: vscode.Uri.joinPath(context.extensionUri, 'dist', 'board-mcp.js').fsPath,
    endpoint: () => {
      starting ??= server.start().catch((err) => {
        logger.warn(`[BoardLive] Board tools are off for this session: ${errMsg(err)}`);
        return undefined;
      });
      return starting;
    },
    issue: (scope) => server.issue(scope),
    revoke: (token, cardId) => { server.revoke(token); liveQuestions.cancel(cardId); },
  });
  context.subscriptions.push({ dispose: () => { setBoardLive(undefined); void server.stop(); } });
}
