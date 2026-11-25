import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const state = vi.hoisted(() => ({ outputFolder: '' }));
vi.mock('../workflow/kanban-verdict', () => ({ getOutputFolder: () => state.outputFolder }));
vi.mock('../workflow/harness/board-harness', () => ({ isOnPathCached: (bin: string) => bin === 'claude' }));
const leadRef = vi.hoisted(() => ({ current: undefined as undefined | { owns: () => boolean; start: ReturnType<typeof vi.fn> } }));
vi.mock('./lead-coordinator', () => ({ leadCoordinator: () => leadRef.current }));
const discover = vi.hoisted(() => vi.fn());
vi.mock('../workflow/harness/model-discovery', () => ({ discoverModels: discover, supportsModelDiscovery: (id: string) => id === 'claude' }));

import { handleAgentTeamMessage } from './agent-team-messages';

const posted: Array<Record<string, unknown>> = [];
const webview = { postMessage: (m: Record<string, unknown>) => { posted.push(m); return Promise.resolve(true); } };
const send = (message: Record<string, unknown>) => handleAgentTeamMessage(message as never, webview as never);

beforeEach(() => {
  state.outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-team-msg-'));
  posted.length = 0;
});
afterEach(() => { fs.rmSync(state.outputFolder, { recursive: true, force: true }); });

describe('handleAgentTeamMessage', () => {
  it('ignores messages that are not about the agent team', async () => {
    expect(await send({ type: 'kanban:getRunTimeline' })).toBe(false);
  });

  it('offers installed CLIs as agents when no roster is defined', async () => {
    await send({ type: 'kanban:getAgentTeam' });
    expect(posted[0]).toMatchObject({
      type: 'kanban:agentTeam',
      agents: [{ id: 'claude', name: 'Claude Code', harness: 'claude' }],
      assignments: {},
      rosterDefined: false,
    });
  });

  it('assigns and unassigns a card, saving it in the team file', async () => {
    await send({ type: 'kanban:assignAgent', artifactId: 'S-1', agentId: 'claude' });
    expect(posted.at(-1)).toMatchObject({ assignments: { 'S-1': 'claude' } });
    const saved = JSON.parse(fs.readFileSync(path.join(state.outputFolder, 'agent-team.json'), 'utf-8'));
    expect(saved.assignments).toEqual({ 'S-1': 'claude' });

    await send({ type: 'kanban:assignAgent', artifactId: 'S-1', agentId: null });
    expect(posted.at(-1)).toMatchObject({ assignments: {} });
  });
});

describe('agent editor messages', () => {
  it('lists installed CLIs with whether they take and list models', async () => {
    await send({ type: 'kanban:getAgentTeam' });
    expect(posted[0].installed).toEqual([{ id: 'claude', label: 'Claude Code', acceptsModel: true, listsModels: true }]);
  });

  it('creates an agent with an id from its name, then edits it in place', async () => {
    await send({ type: 'kanban:saveAgent', agent: { name: 'Senior Dev', harness: 'claude', model: ' sonnet ' } });
    expect(posted).toContainEqual({ type: 'kanban:agentSaved', id: 'senior-dev' });
    expect(posted.at(-1)).toMatchObject({ rosterDefined: true, agents: [{ id: 'senior-dev', name: 'Senior Dev', harness: 'claude', model: 'sonnet' }] });

    await send({ type: 'kanban:saveAgent', agent: { id: 'senior-dev', name: 'Lead Dev', harness: 'claude' } });
    expect(posted.at(-1)).toMatchObject({ agents: [{ id: 'senior-dev', name: 'Lead Dev', harness: 'claude' }] });
  });

  it('refuses an invalid agent and says why, without writing the file', async () => {
    await send({ type: 'kanban:saveAgent', agent: { name: 'X', harness: 'claude', model: 'bad model' } });
    expect(posted.at(-1)).toEqual({ type: 'kanban:agentError', error: '"model" must be a model id such as "sonnet" or "opencode/big-pickle"' });
    expect(fs.existsSync(path.join(state.outputFolder, 'agent-team.json'))).toBe(false);
  });

  it('deletes an agent and unassigns its cards', async () => {
    await send({ type: 'kanban:saveAgent', agent: { name: 'Dev', harness: 'claude' } });
    await send({ type: 'kanban:assignAgent', artifactId: 'S-1', agentId: 'dev' });
    await send({ type: 'kanban:deleteAgent', id: 'dev' });
    expect(posted.at(-1)).toMatchObject({ assignments: {} });
  });

  it('reports models for a CLI that is not installed instead of running it', async () => {
    await send({ type: 'kanban:listModels', harness: 'codex' });
    expect(posted.at(-1)).toEqual({ type: 'kanban:models', harness: 'codex', models: [], supported: false, error: 'OpenAI Codex CLI is not installed' });
  });

  it('asks an installed CLI for its models', async () => {
    discover.mockResolvedValueOnce({ models: [{ id: 'sonnet', label: 'Sonnet' }], supported: true });
    await send({ type: 'kanban:listModels', harness: 'claude' });
    expect(discover).toHaveBeenCalledWith('claude', 'claude');
    expect(posted.at(-1)).toEqual({ type: 'kanban:models', harness: 'claude', models: [{ id: 'sonnet', label: 'Sonnet' }], supported: true });
  });
});

describe('giving an epic to the lead', () => {
  const store = (status: string) => ({ findArtifactById: (id: string) => ({ type: 'epic', artifact: { id, status } }) });
  const sendWith = (message: Record<string, unknown>, s: ReturnType<typeof store>) =>
    handleAgentTeamMessage(message as never, webview as never, s);

  it('starts the lead on the epic, unless the epic is parked in backlog', async () => {
    const start = vi.fn();
    leadRef.current = { owns: () => true, start };
    await sendWith({ type: 'kanban:assignAgent', artifactId: 'E-1', agentId: 'cos' }, store('in-progress'));
    expect(start).toHaveBeenCalledWith('E-1');
    start.mockClear();
    await sendWith({ type: 'kanban:assignAgent', artifactId: 'E-2', agentId: 'cos' }, store('backlog'));
    expect(start).not.toHaveBeenCalled();
    leadRef.current = undefined;
  });
});
