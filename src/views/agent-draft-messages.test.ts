// "Build with AI" asks the agent the board runs (its agent chip), and falls
// back to VS Code's model when that is the choice or nothing is installed.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const h = vi.hoisted(() => ({ folder: '' }));
vi.mock('../workflow/kanban-verdict', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../workflow/kanban-verdict')>()),
  getOutputFolder: () => h.folder,
}));
vi.mock('../workflow/harness/board-harness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../workflow/harness/board-harness')>()),
  resolveBoardHarness: vi.fn(),
}));
vi.mock('../workflow/harness/cli-ask', () => ({ askCli: vi.fn() }));
vi.mock('../chat/ai-provider', () => ({ selectModel: vi.fn(), streamChatResponse: vi.fn() }));

import { handleAgentTeamMessage } from './agent-team-messages';
import { resolveBoardHarness } from '../workflow/harness/board-harness';
import { askCli } from '../workflow/harness/cli-ask';
import { selectModel, streamChatResponse } from '../chat/ai-provider';
import { getHarnessAdapter } from '../workflow/harness/harness-adapters';

const reply = JSON.stringify({ name: 'A11y Reviewer', role: 'Reviews PRs for accessibility', instructions: 'Never edit code. Comment on the pull request with each problem and how to fix it.' });
const posted: Array<Record<string, unknown>> = [];
const webview = { postMessage: async (m: Record<string, unknown>) => { posted.push(m); return true; } } as unknown as vscode.Webview;
const draft = async () => {
  await handleAgentTeamMessage({ type: 'kanban:draftAgent', request: 'Review PRs for accessibility' }, webview);
  return posted.filter((m) => m.type === 'kanban:agentDraft').at(-1);
};

beforeEach(() => {
  vi.clearAllMocks();
  posted.length = 0;
  h.folder = fs.mkdtempSync(path.join(os.tmpdir(), 'aac-draft-'));
});

describe('Build with AI', () => {
  it('asks the agent selected for the board, and says which one drafted', async () => {
    const adapter = getHarnessAdapter('codex')!;
    vi.mocked(resolveBoardHarness).mockResolvedValue({ kind: 'cli', adapter, binary: 'codex', reason: '' });
    vi.mocked(askCli).mockResolvedValue({ ok: true, text: reply });
    const msg = await draft();
    expect(askCli).toHaveBeenCalledWith(expect.objectContaining({ adapter, binary: 'codex', prompt: expect.stringContaining('Review PRs for accessibility') }));
    expect(selectModel).not.toHaveBeenCalled();
    expect(msg).toMatchObject({ via: 'OpenAI Codex CLI', draft: { name: 'A11y Reviewer' } });
  });

  it("passes on the agent's own error", async () => {
    vi.mocked(resolveBoardHarness).mockResolvedValue({ kind: 'cli', adapter: getHarnessAdapter('claude')!, binary: 'claude', reason: '' });
    vi.mocked(askCli).mockResolvedValue({ ok: false, error: 'Claude Code gave no answer: not signed in' });
    expect(await draft()).toMatchObject({ error: 'Claude Code gave no answer: not signed in' });
  });

  it("uses VS Code's model when the board runs on it", async () => {
    vi.mocked(resolveBoardHarness).mockResolvedValue({ kind: 'lm', reason: '' });
    vi.mocked(selectModel).mockResolvedValue({ id: 'copilot' } as never);
    vi.mocked(streamChatResponse).mockResolvedValue(reply as never);
    expect(await draft()).toMatchObject({ via: 'your AI model', draft: { role: 'Reviews PRs for accessibility' } });
    expect(askCli).not.toHaveBeenCalled();
  });

  it('says how to get an agent when there is none and no model', async () => {
    vi.mocked(resolveBoardHarness).mockResolvedValue({ kind: 'none', message: 'none installed' });
    vi.mocked(selectModel).mockResolvedValue(null as never);
    expect(String((await draft())?.error)).toMatch(/No agent or AI model is available/);
  });
});
