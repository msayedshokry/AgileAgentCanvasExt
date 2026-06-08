// ─── Active Chat Session Store ───────────────────────────────────────────────
// Threads the active chat session's model, stream, and token through to
// the LaneTransitionEngine so kanban drags during a chat session can launch
// real BMAD workflows (instead of just logging a stub message).
//
// Set by the chat participant at the start of handleChat() and cleared when
// the handler returns. Read by agentic-kanban-message-handler.ts when routing
// kanban:statusChanged through the LaneTransitionEngine.

import * as vscode from 'vscode';
import { BmadModel } from './ai-provider';

export interface ActiveChatSession {
  model: BmadModel;
  stream: vscode.ChatResponseStream;
  token: vscode.CancellationToken;
}

let _active: ActiveChatSession | null = null;

export function setActiveChatSession(session: ActiveChatSession | null): void {
  _active = session;
}

export function getActiveChatSession(): ActiveChatSession | null {
  return _active;
}
