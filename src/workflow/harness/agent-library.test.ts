import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { addFromLibrary, readLibrary, removeFromLibrary, saveToLibrary, writeLibrary } from './agent-library';
import type { AgentTeam, TeamAgent } from './agent-team';

const reviewer: TeamAgent = { id: 'reviewer', name: 'Reviewer', harness: 'claude', role: 'Reviews PRs', avatar: '🦉', skills: ['aac-code-review'] };
const lead: TeamAgent = { id: 'cos', name: 'Chief of Staff', harness: 'claude', lead: true, avatar: '🦁' };

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
const tmpFile = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-')); dirs.push(d); return path.join(d, 'nested', 'agents.json'); };

describe('agent library file', () => {
  it('starts empty, and keeps what you save across reads', () => {
    const file = tmpFile();
    expect(readLibrary(file)).toEqual([]);
    writeLibrary(file, saveToLibrary([], reviewer));
    expect(readLibrary(file)).toEqual([reviewer]);
  });

  it('updates an agent saved again instead of keeping two', () => {
    const updated = { ...reviewer, role: 'Reviews frontend PRs' };
    expect(saveToLibrary([reviewer, lead], updated)).toEqual([updated, lead]);
  });

  it('removes an agent', () => {
    expect(removeFromLibrary([reviewer, lead], 'reviewer')).toEqual([lead]);
  });
});

describe('addFromLibrary', () => {
  const team = (agents: TeamAgent[]): AgentTeam => ({ agents, assignments: {} });

  it('adds the agent to the project team as saved', () => {
    expect(addFromLibrary(team([]), reviewer).agents).toEqual([reviewer]);
  });

  it('gives it a new id when the project already has a different agent with that id', () => {
    const other: TeamAgent = { id: 'reviewer', name: 'Old Reviewer', harness: 'codex' };
    const added = addFromLibrary(team([other]), reviewer).agents;
    expect(added.map((a) => a.id)).toEqual(['reviewer', 'reviewer-2']);
  });

  it('keeps the project lead: a saved lead joins as a regular agent', () => {
    const projectLead: TeamAgent = { id: 'boss', name: 'Boss', harness: 'claude', lead: true };
    const added = addFromLibrary(team([projectLead]), lead).agents;
    expect(added.find((a) => a.id === 'boss')?.lead).toBe(true);
    expect(added.find((a) => a.id === 'cos')?.lead).toBeUndefined();
  });

  it('swaps an avatar another member already has for an unused one', () => {
    const fox: TeamAgent = { id: 'dev', name: 'Dev', harness: 'claude', avatar: '🦉' };
    const added = addFromLibrary(team([fox]), reviewer).agents.find((a) => a.id === 'reviewer')!;
    expect(added.avatar).not.toBe('🦉');
  });
});
