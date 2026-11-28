// The approve path end to end with "Cards start from" set to a branch that is
// not checked out: prepareCardWorkspace → agent edits → finishApprovedCard,
// against a real git repository. By default a fresh temp repo; set
// AAC_REAL_REPO to a project folder to run the same flow on a clone of it.
//   AAC_REAL_REPO="D:/PersonalDev/New Idea" npx vitest run src/workflow/harness/card-isolation.test.ts
// With AAC_REAL_GH=1 as well, pull-request mode runs for real: it pushes a
// throwaway base branch and card branch to that repo's GitHub origin, opens a
// pull request, checks its base, then closes it and deletes both branches.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { execTool } from './git-cli';
import { finishApprovedCard, prepareCardWorkspace } from './card-isolation';

vi.mock('../kanban-verdict', () => ({ getOutputFolder: () => '' }));

const BASE = `aac-base-check-${Date.now().toString(36)}`;
const REAL_GH = process.env.AAC_REAL_GH === '1' && !!process.env.AAC_REAL_REPO;
let tmp = '';
let repo = '';
const settings: Record<string, unknown> = {};

async function sh(args: string[], cwd = repo): Promise<string> {
  const r = await execTool('git', args, cwd);
  if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

async function makeRepo(): Promise<void> {
  const real = process.env.AAC_REAL_REPO;
  if (real) {
    await sh(['clone', '-q', '--no-hardlinks', real, repo], tmp);
    // Push and open PRs against the real repo's GitHub origin, not the local folder.
    if (REAL_GH) await sh(['remote', 'set-url', 'origin', (await execTool('git', ['remote', 'get-url', 'origin'], real)).stdout.trim()]);
  } else {
    fs.mkdirSync(repo);
    await sh(['init', '-q', '-b', 'main']);
    fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
    await sh(['add', '-A']);
    await sh(['-c', 'user.email=t@example.com', '-c', 'user.name=Test', 'commit', '-q', '-m', 'init']);
  }
  for (const [k, v] of [['user.email', 't@example.com'], ['user.name', 'Test'], ['commit.gpgsign', 'false']]) await sh(['config', k, v]);
  await sh(['branch', BASE]);
}

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aac-iso-')));
  repo = path.join(tmp, 'app');
  await makeRepo();
  Object.assign(settings, { 'agents.isolation': 'worktree', 'agents.openPullRequests': false, 'agents.baseBranch': BASE });
  (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: repo } }];
  vi.mocked(vscode.workspace.getConfiguration).mockImplementation(() => ({
    get: (k: string, fallback?: unknown) => (k in settings ? settings[k] : fallback),
    update: async () => undefined, has: () => true,
  }) as never);
}, 120_000);

afterEach(() => {
  (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('approving a card that starts from another branch', { timeout: 120_000 }, () => {
  it('lands the work on that branch and never moves the checkout', async () => {
    const checkedOut = await sh(['rev-parse', '--abbrev-ref', 'HEAD']);
    const headBefore = await sh(['rev-parse', 'HEAD']);
    const statusBefore = await sh(['status', '--porcelain']);

    const wt = await prepareCardWorkspace('S-42');
    expect(wt).toBeDefined();
    if (!wt) return;
    expect(await sh(['merge-base', '--is-ancestor', BASE, 'HEAD'], wt.path)).toBe('');
    fs.writeFileSync(path.join(wt.path, 'agent-work.txt'), 'done by the agent\n');

    const outcome = await finishApprovedCard(wt, 'Story 42');
    expect(outcome.ok, outcome.message).toBe(true);
    expect(outcome.message).toMatch(/^Merged aac\/story-S-42/);

    // The work is on the base branch …
    expect(await sh(['show', `${BASE}:agent-work.txt`])).toBe('done by the agent');
    // … and the user's checkout did not move or change.
    expect(await sh(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe(checkedOut);
    expect(await sh(['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(await sh(['status', '--porcelain'])).toBe(statusBefore);
    expect(fs.existsSync(path.join(repo, 'agent-work.txt'))).toBe(false);
    // Cleaned up: no card worktree, no temp merge worktree, no card branch.
    expect(fs.existsSync(wt.path)).toBe(false);
    expect(await sh(['worktree', 'list', '--porcelain'])).not.toMatch(/\.merge-|story-S-42/);
    expect(await sh(['branch', '--list', 'aac/story-S-42'])).toBe('');
  });

  it('keeps the work on the card branch when the base is checked out in another folder', async () => {
    const wt = await prepareCardWorkspace('S-43');
    if (!wt) throw new Error('no worktree');
    fs.writeFileSync(path.join(wt.path, 'agent-work.txt'), 'x\n');
    await sh(['worktree', 'add', '-q', path.join(tmp, 'elsewhere'), BASE]);

    const outcome = await finishApprovedCard(wt, 'Story 43');
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/checked out in another folder/);
    expect(await sh(['branch', '--list', 'aac/story-S-43'])).toMatch(/story-S-43/);
  });
});

describe.skipIf(!REAL_GH)('pull-request mode against GitHub', { timeout: 300_000 }, () => {
  it('opens the pull request into the chosen branch, then cleans up', async () => {
    settings['agents.openPullRequests'] = true;
    const id = `PRCHECK-${Date.now().toString(36)}`;
    await sh(['push', '-q', 'origin', BASE]);
    let prUrl = '';
    try {
      const wt = await prepareCardWorkspace(id);
      if (!wt) throw new Error('no worktree');
      fs.writeFileSync(path.join(wt.path, 'aac-pr-check.txt'), 'throwaway check, safe to delete\n');
      const outcome = await finishApprovedCard(wt, `[test] base-branch PR check ${id}`);
      expect(outcome.ok, outcome.message).toBe(true);
      prUrl = outcome.ok ? outcome.prUrl ?? '' : '';
      expect(prUrl).toMatch(/github\.com\/.+\/pull\/\d+/);
      const pr = JSON.parse((await execTool('gh', ['pr', 'view', prUrl, '--json', 'baseRefName,headRefName,files'], repo)).stdout);
      expect(pr.baseRefName).toBe(BASE);
      expect(pr.headRefName).toBe(`aac/story-${id}`);
      expect(pr.files.map((f: { path: string }) => f.path)).toEqual(['aac-pr-check.txt']);
    } finally {
      if (prUrl) await execTool('gh', ['pr', 'close', prUrl, '--delete-branch'], repo);
      // One ref per push: deleting a branch gh already removed must not keep the other.
      for (const ref of [BASE, `aac/story-${id}`]) await execTool('git', ['push', '-q', 'origin', '--delete', ref], repo);
      expect((await execTool('git', ['ls-remote', 'origin', BASE, `aac/story-${id}`], repo)).stdout.trim()).toBe('');
    }
  });
});
