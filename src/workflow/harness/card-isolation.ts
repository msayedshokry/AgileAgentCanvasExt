// ─── Card isolation, verification and finishing (VS Code side) ──────────────
// Glue between the orchestrator and the pure git/verify modules:
//   prepare  → a git worktree + branch per card (agents.isolation = worktree)
//   verify   → the project's test command after each implement step
//   finish   → on approval, merge the branch back, or push it and open a PR
// Every step degrades to the old in-place behaviour when git or settings say so.

import * as vscode from 'vscode';
import * as path from 'path';
import { execTool } from './git-cli';
import { isGitRepo, mergeWorktree, prepareWorktree, removeWorktree, type CardWorktree, type Git } from './card-worktree';
import { runVerifyCommand, type VerifyResult } from './verify-gate';
import { verifyCommandFromContext } from './project-context';
import { getOutputFolder } from '../kanban-verdict';
import { createLogger } from '../../utils/logger';
import { errMsg } from '../../utils/error';

const logger = createLogger('card-isolation');
const git: Git = (args, cwd) => execTool('git', args, cwd);

function cfg(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('agileagentcanvas');
}

export function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** A worktree for the card, or undefined to run in the workspace itself. */
export async function prepareCardWorkspace(artifactId: string): Promise<CardWorktree | undefined> {
  let root: string | undefined;
  try {
    root = workspaceRoot();
    if (!root || cfg().get<string>('agents.isolation', 'worktree') !== 'worktree') return undefined;
    if (!(await isGitRepo(git, root))) return undefined;
    const outputFolderName = cfg().get<string>('outputFolder', '.agileagentcanvas-context') ?? '.agileagentcanvas-context';
    const wt = await prepareWorktree(git, root, artifactId, path.isAbsolute(outputFolderName) ? '.agileagentcanvas-context' : outputFolderName);
    logger.info(`[isolation] ${artifactId} runs in ${wt.path} on ${wt.branch}`);
    return wt;
  } catch (err) {
    logger.warn(`[isolation] worktree unavailable for ${artifactId}, running in the workspace: ${errMsg(err)}`);
    return undefined;
  }
}

/** Run the project's verify command in `cwd`; undefined when disabled or no command is known. */
export async function verifyCard(cwd: string, signal?: AbortSignal): Promise<VerifyResult | undefined> {
  let command: string | undefined;
  let minutes = 15;
  try {
    // Only for a real workspace: never guess a command for an empty window.
    if (!workspaceRoot() || !cfg().get<boolean>('agents.verifyAfterImplement', true)) return undefined;
    command = (cfg().get<string>('agents.verifyCommand', '') ?? '').trim() || verifyCommandFromContext(getOutputFolder());
    minutes = Math.max(1, Number(cfg().get<number>('agents.verifyTimeoutMinutes', 15)) || 15);
  } catch (err) {
    logger.warn(`[verify] settings unavailable, skipping: ${errMsg(err)}`);
    return undefined;
  }
  if (!command) return undefined;
  logger.info(`[verify] ${command} in ${cwd}`);
  return runVerifyCommand(command, cwd, minutes * 60_000, signal);
}

export type FinishOutcome =
  | { readonly ok: true; readonly message: string; readonly prUrl?: string }
  | { readonly ok: false; readonly message: string };

/** Approved: open a PR (agents.openPullRequests) or merge the card branch into the current branch. */
export async function finishApprovedCard(wt: CardWorktree, title: string): Promise<FinishOutcome> {
  const root = workspaceRoot();
  if (!root) return { ok: false, message: 'No workspace folder' };
  const message = `agent: ${title} (${wt.artifactId})`;
  if (cfg().get<boolean>('agents.openPullRequests', false)) {
    await git(['add', '-A'], wt.path);
    await git(['commit', '-m', message], wt.path);
    if ((await execTool('gh', ['--version'])).code !== 0) {
      return { ok: false, message: `Branch ${wt.branch} is ready, but GitHub CLI (gh) is not installed to open the pull request.` };
    }
    const push = await git(['push', '-u', 'origin', wt.branch], root);
    if (push.code !== 0) return { ok: false, message: `Could not push ${wt.branch}: ${(push.stderr || push.stdout).trim().slice(0, 300)}` };
    const pr = await execTool('gh', ['pr', 'create', '--head', wt.branch, '--title', title, '--body', `Implemented and reviewed by Agile Agent Canvas agents for ${wt.artifactId}.`], root);
    let prUrl = pr.stdout.trim().split('\n').pop() ?? '';
    if (pr.code !== 0) {
      // A re-run after review feedback updates the existing PR (the push did that).
      if (!/already exists/i.test(pr.stderr + pr.stdout)) {
        return { ok: false, message: `Pushed ${wt.branch}, but gh pr create failed: ${(pr.stderr || pr.stdout).trim().slice(0, 300)}` };
      }
      prUrl = (await execTool('gh', ['pr', 'view', wt.branch, '--json', 'url', '--jq', '.url'], root)).stdout.trim();
    }
    await removeWorktree(git, root, wt, false);
    return { ok: true, message: `Opened ${prUrl}`, prUrl };
  }
  const outcome = await mergeWorktree(git, root, wt, message);
  if (outcome.kind === 'conflict') {
    return { ok: false, message: `Merging ${wt.branch} conflicts with your current branch. The agent's work is kept on that branch and in ${wt.path}; merge it by hand.` };
  }
  await removeWorktree(git, root, wt, true);
  return { ok: true, message: outcome.kind === 'merged' ? `Merged ${wt.branch} (${outcome.sha.slice(0, 8)})` : 'No changes to merge' };
}
