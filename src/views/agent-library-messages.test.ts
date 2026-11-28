// "My agents" end to end through the board's messages, with real files: save
// an agent in one project, open another project, add it there.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

// getOutputFolder loads vscode lazily (outside the test shim): follow the open project instead.
const current = vi.hoisted(() => ({ folder: '' }));
vi.mock('../workflow/kanban-verdict', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../workflow/kanban-verdict')>()),
  getOutputFolder: () => current.folder,
}));

import { handleAgentTeamMessage } from './agent-team-messages';

let root = '';
const env = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
const posted: Array<Record<string, unknown>> = [];
const webview = { postMessage: async (m: Record<string, unknown>) => { posted.push(m); return true; } } as unknown as vscode.Webview;

const openProject = (name: string) => {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, '.agileagentcanvas-context'), { recursive: true });
  (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: dir } }];
  current.folder = path.join(dir, '.agileagentcanvas-context');
  return dir;
};
const teamFile = (dir: string) => path.join(dir, '.agileagentcanvas-context', 'agent-team.json');
const send = (message: Record<string, unknown>) => handleAgentTeamMessage(message as { type: string }, webview);
const last = (type: string) => posted.filter((m) => m.type === type).at(-1);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'my-agents-'));
  // The library lives in the home folder: point home at the temp root.
  process.env.USERPROFILE = path.join(root, 'home');
  process.env.HOME = path.join(root, 'home');
  posted.length = 0;
  vi.mocked(vscode.workspace.getConfiguration).mockImplementation(() => ({
    get: (_k: string, fallback?: unknown) => fallback, update: async () => undefined, has: () => true,
  }) as never);
});

afterEach(() => {
  process.env.USERPROFILE = env.USERPROFILE;
  process.env.HOME = env.HOME;
  (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('My agents across projects', () => {
  it('saves an agent from one project and adds it to another', async () => {
    const a = openProject('project-a');
    fs.writeFileSync(teamFile(a), JSON.stringify({
      agents: [{ id: 'reviewer', name: 'Reviewer', harness: 'claude', role: 'Reviews PRs', avatar: '🦉', instructions: 'Never edit code.' }],
    }));
    await send({ type: 'kanban:saveToLibrary', id: 'reviewer' });
    const libraryPath = path.join(root, 'home', '.agileagentcanvas', 'agents.json');
    expect(fs.existsSync(libraryPath)).toBe(true);
    expect((last('kanban:agentLibrary')?.agents as Array<{ id: string }>).map((x) => x.id)).toEqual(['reviewer']);

    const b = openProject('project-b');
    await send({ type: 'kanban:getAgentLibrary' });
    expect((last('kanban:agentLibrary')?.agents as Array<{ id: string }>).map((x) => x.id)).toEqual(['reviewer']);
    await send({ type: 'kanban:addFromLibrary', id: 'reviewer' });

    const teamB = JSON.parse(fs.readFileSync(teamFile(b), 'utf-8')) as { agents: Array<{ id: string; instructions?: string; avatar?: string }> };
    const added = teamB.agents.find((x) => x.id === 'reviewer');
    expect(added?.instructions).toBe('Never edit code.');
    expect(added?.avatar).toBe('🦉');
    // Project A is untouched by adding to B.
    expect(JSON.parse(fs.readFileSync(teamFile(a), 'utf-8')).agents).toHaveLength(1);
  });

  it('removes a saved agent from the library without touching projects that use it', async () => {
    const a = openProject('project-a');
    fs.writeFileSync(teamFile(a), JSON.stringify({ agents: [{ id: 'dev', name: 'Dev', harness: 'claude' }] }));
    await send({ type: 'kanban:saveToLibrary', id: 'dev' });
    await send({ type: 'kanban:addFromLibrary', id: 'dev' });
    await send({ type: 'kanban:removeFromLibrary', id: 'dev' });
    expect(last('kanban:agentLibrary')?.agents).toEqual([]);
    expect(JSON.parse(fs.readFileSync(teamFile(a), 'utf-8')).agents.some((x: { id: string }) => x.id === 'dev')).toBe(true);
  });
});
