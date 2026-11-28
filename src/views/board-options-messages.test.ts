// The board's option chips must change what runs do, not only what they show:
// each message writes the setting the run code reads, and the status sent back
// reports it. Uses a real git repository for the branch.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

vi.mock('../workflow/harness/harness-readiness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../workflow/harness/harness-readiness')>()),
  probeReadiness: vi.fn(async () => []),
}));
vi.mock('../workflow/harness/board-harness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../workflow/harness/board-harness')>()),
  clearHarnessPathCache: vi.fn(),
  resolveBoardHarness: vi.fn(async () => ({ kind: 'none', message: 'none installed' })),
}));

import { handleAgentUxMessage } from './agent-ux-messages';
import { getPermissionPosture } from '../workflow/harness/board-harness';
import { prepareCardWorkspace } from '../workflow/harness/card-isolation';

const settings = new Map<string, unknown>();
const posted: Array<Record<string, unknown>> = [];
const webview = { postMessage: async (m: Record<string, unknown>) => { posted.push(m); return true; } } as unknown as vscode.Webview;
let repo = '';

const send = (message: Record<string, unknown>) =>
  handleAgentUxMessage(message as { type: string }, {} as never, webview);
const lastStatus = () => posted.filter((m) => m.type === 'harness:status').at(-1);

beforeEach(() => {
  settings.clear();
  posted.length = 0;
  const config = {
    get: (key: string, fallback?: unknown) => (settings.has(key) ? settings.get(key) : fallback),
    update: async (key: string, value: unknown) => { settings.set(key, value); },
    has: () => true,
  };
  vi.mocked(vscode.workspace.getConfiguration).mockImplementation(() => config as never);
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'board-opts-'));
  const git = (...args: string[]) => cp.execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '-b', 'feature-x');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init');
  (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: repo } }];
});

afterEach(() => {
  (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('board option messages', () => {
  it('reports the defaults and the checked-out branch', async () => {
    await send({ type: 'harness:getStatus' });
    expect(lastStatus()).toMatchObject({ isolation: 'worktree', delivery: 'merge', posture: 'sandboxed', branch: 'feature-x' });
  });

  it('"This checkout" makes cards run in the workspace instead of a worktree', async () => {
    await send({ type: 'harness:setIsolation', isolation: 'none' });
    expect(settings.get('agents.isolation')).toBe('none');
    expect(lastStatus()).toMatchObject({ isolation: 'none' });
    expect(await prepareCardWorkspace('1.1')).toBeUndefined();
  });

  it('"Own branch" gives a card its own worktree on its own branch', async () => {
    await send({ type: 'harness:setIsolation', isolation: 'worktree' });
    const wt = await prepareCardWorkspace('1.1');
    expect(wt?.branch).toBeTruthy();
    expect(wt && fs.existsSync(wt.path)).toBe(true);
    if (wt) cp.execFileSync('git', ['worktree', 'remove', '--force', wt.path], { cwd: repo, stdio: 'ignore' });
  });

  it('"Pull request" turns on opening pull requests on approval, "Merge" turns it off', async () => {
    await send({ type: 'harness:setDelivery', delivery: 'pr' });
    expect(settings.get('agents.openPullRequests')).toBe(true);
    expect(lastStatus()).toMatchObject({ delivery: 'pr' });
    await send({ type: 'harness:setDelivery', delivery: 'merge' });
    expect(settings.get('agents.openPullRequests')).toBe(false);
  });

  it('"Full access" is the posture runs read', async () => {
    await send({ type: 'harness:setPosture', posture: 'full' });
    expect(getPermissionPosture()).toBe('full');
  });

  it('ignores unknown values and keeps the safe choice', async () => {
    await send({ type: 'harness:setIsolation', isolation: 'rm -rf' });
    expect(settings.get('agents.isolation')).toBe('worktree');
  });
});
