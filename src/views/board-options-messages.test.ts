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
const globalSettings = new Map<string, unknown>();
const posted: Array<Record<string, unknown>> = [];
const webview = { postMessage: async (m: Record<string, unknown>) => { posted.push(m); return true; } } as unknown as vscode.Webview;
let repo = '';

const send = (message: Record<string, unknown>) =>
  handleAgentUxMessage(message as { type: string }, {} as never, webview);
const lastStatus = () => posted.filter((m) => m.type === 'harness:status').at(-1);

beforeEach(() => {
  settings.clear();
  globalSettings.clear();
  posted.length = 0;
  const config = {
    get: (key: string, fallback?: unknown) => (settings.has(key) ? settings.get(key) : fallback),
    update: async (key: string, value: unknown, target?: number) => {
      const into = target === vscode.ConfigurationTarget.Global ? globalSettings : settings;
      if (value === undefined) into.delete(key); else into.set(key, value);
    },
    inspect: (key: string) => ({ workspaceValue: settings.get(key), globalValue: globalSettings.get(key) }),
    has: () => true,
  };
  vi.mocked(vscode.workspace.getConfiguration).mockImplementation(() => config as never);
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'board-opts-'));
  const git = (...args: string[]) => cp.execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '-b', 'feature-x');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init');
  git('branch', 'develop');
  (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: repo } }];
});

afterEach(() => {
  (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('board option messages', () => {
  it('reports the defaults and the checked-out branch', async () => {
    await send({ type: 'harness:getStatus' });
    expect(lastStatus()).toMatchObject({ isolation: 'worktree', delivery: 'merge', posture: 'sandboxed', branch: 'feature-x', isGit: true });
    expect(lastStatus()?.branches).toEqual(expect.arrayContaining(['feature-x', 'develop']));
    expect(typeof lastStatus()?.hasGh).toBe('boolean');
  });

  it('knows a folder that is not a git repository', async () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'board-plain-'));
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: plain } }];
    // Stop git looking above the folder (a temp folder can sit inside a repository).
    const ceiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = path.dirname(plain);
    try {
      await send({ type: 'harness:getStatus' });
      expect(lastStatus()).toMatchObject({ isGit: false, branches: [] });
      expect(lastStatus()?.branch).toBeUndefined();
    } finally {
      if (ceiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = ceiling;
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });

  it('starts cards from the chosen branch, and only accepts branches that exist', async () => {
    await send({ type: 'harness:setBaseBranch', branch: 'develop' });
    expect(settings.get('agents.baseBranch')).toBe('develop');
    expect(lastStatus()).toMatchObject({ baseBranch: 'develop' });
    await send({ type: 'harness:setBaseBranch', branch: 'no-such; rm -rf' });
    expect(settings.get('agents.baseBranch')).toBe('develop');
    await send({ type: 'harness:setBaseBranch', branch: '' });
    expect(settings.has('agents.baseBranch')).toBe(false);
  });

  it('offers branches only on origin, and picking one makes a local copy that tracks it', async () => {
    // A clone of this repo whose origin has a branch the clone has never checked out.
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'board-clone-'));
    cp.execFileSync('git', ['branch', 'release/2.0'], { cwd: repo, stdio: 'ignore' });
    cp.execFileSync('git', ['clone', '-q', repo, clone], { stdio: 'ignore' });
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: clone } }];
    try {
      await send({ type: 'harness:getStatus' });
      expect(lastStatus()?.remoteBranches).toEqual(expect.arrayContaining(['release/2.0', 'develop']));
      expect(lastStatus()?.remoteBranches).not.toContain('feature-x'); // already local
      await send({ type: 'harness:setBaseBranch', branch: 'release/2.0' });
      expect(settings.get('agents.baseBranch')).toBe('release/2.0');
      const upstream = cp.execFileSync('git', ['rev-parse', '--abbrev-ref', 'release/2.0@{upstream}'], { cwd: clone }).toString().trim();
      expect(upstream).toBe('origin/release/2.0');
      expect(lastStatus()?.branches).toContain('release/2.0');
      expect(lastStatus()?.remoteBranches).not.toContain('release/2.0');
    } finally {
      fs.rmSync(clone, { recursive: true, force: true });
    }
  });

  it('saves where cards run, delivery and agent as your defaults, but not permissions', async () => {
    await send({ type: 'harness:setIsolation', isolation: 'none' });
    await send({ type: 'harness:setDelivery', delivery: 'pr' });
    await send({ type: 'harness:setPosture', posture: 'full' });
    await send({ type: 'harness:saveDefaults' });
    expect(globalSettings.get('agents.isolation')).toBe('none');
    expect(globalSettings.get('agents.openPullRequests')).toBe(true);
    expect(globalSettings.has('agents.permissionPosture')).toBe(false);
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
