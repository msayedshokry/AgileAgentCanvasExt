// ─── Agent usability messages for the Agentic Kanban ────────────────────────
// Webview ⇄ extension protocol for: agent readiness + picker, fix-it actions
// on stuck cards, prompt preview, and the per-card run timeline with revert.
// Kept out of agentic-kanban-message-handler.ts (already >1k lines).

import * as cp from 'child_process';
import * as vscode from 'vscode';
import type { ArtifactStore } from '../state/artifact-store';
import type { ArtifactChanges } from '../types';
import { HARNESS_ADAPTERS, buildHarnessLaunch, getHarnessAdapter, type HarnessId } from '../workflow/harness/harness-adapters';
import { AUTH_SPECS, aiderConfigHasApiBase, probeReadiness, runProbe, type HarnessReadiness } from '../workflow/harness/harness-readiness';
import {
  clearHarnessPathCache,
  getConfiguredHarness,
  getPermissionPosture,
  isOnPathCached,
  resolveBoardHarness,
} from '../workflow/harness/board-harness';
import { buildCommandLine, detectShellKind } from '../workflow/harness/shell-command';
import { readRunHistory } from '../workflow/harness/run-history';
import { classifyAgentFailure, type AgentFixAction } from '../workflow/harness/agent-failure';
import { buildTerminalPrompt, terminalExecutor } from '../workflow/terminal-executor';
import { getOutputFolder, resultFilePath } from '../workflow/kanban-verdict';
import { laneTransitionEngine } from '../workflow/lane-transitions';
import { kanbanOrchestrator } from '../workflow/kanban-orchestrator';
import { execTool } from '../workflow/harness/git-cli';
import { getCardPullRequest, prFixRequests } from '../workflow/harness/pull-request';
import { createLogger } from '../utils/logger';
import { errMsg } from '../utils/error';
import { dismissNeedsYou, needsYouList } from './needs-you';
import { readAgentNotes } from '../workflow/harness/agent-brief';

const logger = createLogger('agent-ux-messages');
const CONFIG = 'agileagentcanvas';
const DEV_WORKFLOW = 'aac-kanban-dev-executor';
const REVIEW_WORKFLOW = 'aac-kanban-review-guard';

type Post = (message: Record<string, unknown>) => void;

// ── Readiness + picker ───────────────────────────────────────────────────────

export interface AgentStatusMessage {
  type: 'harness:status';
  harnesses: HarnessReadiness[];
  configured: string;
  posture: 'sandboxed' | 'full';
  resolved: { kind: 'cli' | 'lm' | 'none'; id?: string; label: string; reason: string };
  /** The board's agent can't run right now (drives the "not ready" banner). */
  blocker?: string;
}

async function buildAgentStatus(): Promise<AgentStatusMessage> {
  clearHarnessPathCache();
  const [harnesses, resolution] = await Promise.all([
    probeReadiness({
      isOnPath: (b) => isOnPathCached(b),
      run: runProbe,
      env: process.env,
      aiderConfigHasApiBase: () => aiderConfigHasApiBase(),
    }),
    resolveBoardHarness(),
  ]);
  const resolved: AgentStatusMessage['resolved'] =
    resolution.kind === 'cli' ? { kind: 'cli', id: resolution.adapter.id, label: resolution.adapter.label, reason: resolution.reason }
    : resolution.kind === 'lm' ? { kind: 'lm', label: 'VS Code language model', reason: resolution.reason }
    : { kind: 'none', label: 'No agent available', reason: resolution.message };
  let blocker: string | undefined;
  if (resolution.kind === 'none') blocker = resolution.message;
  else if (resolution.kind === 'cli') {
    const r = harnesses.find((h) => h.id === resolution.adapter.id);
    if (r?.auth === 'signed-out') blocker = `${r.label} is not signed in, so board runs will fail.`;
  }
  return { type: 'harness:status', harnesses, configured: getConfiguredHarness(), posture: getPermissionPosture(), resolved, blocker };
}

async function postStatus(post: Post): Promise<void> {
  try {
    post({ ...(await buildAgentStatus()) });
  } catch (err) {
    logger.warn(`Agent status failed: ${errMsg(err)}`);
  }
}

/** Open a visible terminal running the CLI's sign-in flow. */
export async function startSignIn(id: HarnessId): Promise<void> {
  const adapter = getHarnessAdapter(id);
  const spec = AUTH_SPECS[id];
  if (!adapter) return;
  if (!spec.login) {
    void vscode.window.showInformationMessage(`${adapter.label}: ${spec.loginHint}`);
    return;
  }
  const binary = adapter.binaries.find((b) => isOnPathCached(b)) ?? adapter.binaries[0];
  const terminal = vscode.window.createTerminal({ name: `Sign in: ${adapter.label}` });
  terminal.show();
  await terminal.processId;
  terminal.sendText(buildCommandLine({ args: [binary, ...spec.login] }, detectShellKind(vscode.env.shell, process.platform)), true);
  void vscode.window.showInformationMessage(`${spec.loginHint} Press Refresh on the board when you're done.`);
}

async function pickAgent(): Promise<void> {
  const status = await buildAgentStatus();
  const items = [
    { label: 'auto', description: `Currently: ${status.resolved.label}` },
    { label: 'vscode-lm', description: 'VS Code language model (e.g. GitHub Copilot Chat)' },
    ...status.harnesses.map((h) => ({
      label: h.id,
      description: `${h.label} — ${h.installed ? h.authDetail : 'not installed'}`,
    })),
  ];
  const pick = await vscode.window.showQuickPick(items, { title: 'Which agent should run the board?' });
  if (pick) await vscode.workspace.getConfiguration(CONFIG).update('agents.harness', pick.label, vscode.ConfigurationTarget.Workspace);
}

// ── Fix-it actions ───────────────────────────────────────────────────────────

async function currentHarnessId(): Promise<HarnessId | undefined> {
  const r = await resolveBoardHarness();
  return r.kind === 'cli' ? r.adapter.id : undefined;
}

async function showOutput(artifactId: string): Promise<void> {
  const last = readRunHistory(getOutputFolder(), 50).find((e) => e.artifactId === artifactId);
  const live = terminalExecutor.getTerminalOutput(artifactId);
  const body = [
    `# Last agent run for ${artifactId}`,
    '',
    last ? `**${last.verdict}** · ${last.harness} · ${new Date(last.finishedAt).toLocaleString()}` : '_No recorded run._',
    '',
    '```',
    (last?.summary ?? '').trim() || '(no summary)',
    '```',
    ...(live ? ['', '## Live terminal output', '', '```', live.slice(-8000), '```'] : []),
  ].join('\n');
  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: body });
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function runFixAction(action: AgentFixAction, artifactId: string, store: ArtifactStore, post: Post): Promise<void> {
  const found = store.findArtifactById(artifactId);
  const type = found?.type ?? 'story';
  const status = (found?.artifact as { status?: string } | undefined)?.status ?? 'ready-for-dev';
  switch (action) {
    case 'sign-in': {
      const id = await currentHarnessId();
      if (id) await startSignIn(id);
      else await vscode.commands.executeCommand('agileagentcanvas.checkHarnesses');
      break;
    }
    case 'set-api-key': {
      const id = await currentHarnessId();
      if (id) {
        const keys = AUTH_SPECS[id].envKeys?.join(' or ') ?? 'its API key variable';
        void vscode.window.showInformationMessage(
          `${getHarnessAdapter(id)?.label} reads ${keys} from the environment VS Code was started with. Set it, then restart VS Code.`);
      } else {
        await vscode.commands.executeCommand('agileagentcanvas.setApiKey');
      }
      break;
    }
    case 'switch-agent':
      await pickAgent();
      break;
    case 'install': {
      const id = await currentHarnessId();
      void vscode.window.showInformationMessage(id ? getHarnessAdapter(id)!.installHint : 'Run "Check Agent Harnesses" to see install options.');
      break;
    }
    case 'open-output':
      await showOutput(artifactId);
      break;
    case 'move-back':
      await store.updateArtifact(type, artifactId, { status: 'ready-for-dev' } as ArtifactChanges);
      break;
    case 'retry': {
      const from = status === 'in-progress' || status === 'in-review' || status === 'review' ? 'ready-for-dev' : status;
      if (from !== status) await store.updateArtifact(type, artifactId, { status: from } as ArtifactChanges);
      const result = await laneTransitionEngine.handleTransition(artifactId, from, 'in-progress', type);
      post({ type: 'transitionResult', artifactId, ...result });
      break;
    }
  }
  await postStatus(post);
}

// ── Prompt preview ───────────────────────────────────────────────────────────

async function previewPrompt(artifactId: string, store: ArtifactStore): Promise<void> {
  const found = store.findArtifactById(artifactId);
  if (!found) {
    void vscode.window.showWarningMessage(`${artifactId} was not found.`);
    return;
  }
  const status = (found.artifact as { status?: string }).status ?? '';
  const workflowId = status === 'review' || status === 'in-review' ? REVIEW_WORKFLOW : DEV_WORKFLOW;
  const outputFolder = getOutputFolder();
  const prompt = buildTerminalPrompt(workflowId, found.artifact, outputFolder, undefined, '<run id>');
  const resolution = await resolveBoardHarness();
  const posture = getPermissionPosture();
  let commandLine = '(no CLI harness: runs through the VS Code language model)';
  if (resolution.kind === 'cli') {
    const spec = buildHarnessLaunch(resolution.adapter, {
      binary: resolution.binary,
      promptFile: `${outputFolder}/_terminal-output/prompts/${artifactId}-<run id>.md`,
      resultPath: resultFilePath(outputFolder, artifactId, workflowId),
      posture,
    });
    commandLine = buildCommandLine(spec, detectShellKind(vscode.env.shell, process.platform));
  } else if (resolution.kind === 'none') {
    commandLine = `(cannot run: ${resolution.message})`;
  }
  const header = [
    `<!-- Preview only: nothing has been sent. Workflow ${workflowId} · agent ${resolution.kind === 'cli' ? resolution.adapter.label : resolution.kind} · permissions ${posture}.`,
    `     The workflow definition (SKILL) is appended at run time.`,
    `     Command: ${commandLine} -->`,
    '',
  ].join('\n');
  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: header + prompt });
  await vscode.window.showTextDocument(doc, { preview: true });
}

// ── Run timeline + revert ────────────────────────────────────────────────────

interface AgentCommit { sha: string; subject: string; date: string; files?: string[] }

function gitCommitsFor(artifactId: string, cwd: string): Promise<AgentCommit[]> {
  return new Promise((resolve) => {
    cp.execFile('git', ['log', '-n', '50', '--format=%H%x09%s%x09%cI', '--fixed-strings', `--grep=completed ${artifactId}`],
      { cwd, windowsHide: true, timeout: 10_000 }, (err, stdout) => {
        if (err) return resolve([]);
        resolve(stdout.split('\n').filter(Boolean).map((l) => {
          const [sha, subject, date] = l.split('\t');
          return { sha, subject, date };
        }).filter((c) => c.subject.startsWith('agent: ') && c.subject.endsWith(` completed ${artifactId}`)));
      });
  });
}

async function postTimeline(artifactId: string, post: Post, store?: ArtifactStore): Promise<void> {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const runs = readRunHistory(getOutputFolder(), 500).filter((e) => e.artifactId === artifactId).slice(0, 30)
    .map((e) => ({ ...e, failure: e.verdict === 'COMPLETED' || e.verdict === 'APPROVED' ? undefined : classifyAgentFailure(e.summary) }));
  const commits = cwd ? await gitCommitsFor(artifactId, cwd) : [];
  // Story → code: the files each agent commit touched.
  await Promise.all(commits.slice(0, 10).map(async (c) => {
    const r = await execTool('git', ['show', '--name-only', '--format=', c.sha], cwd);
    if (r.code === 0) c.files = r.stdout.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 50);
  }));
  const pr = cwd ? await getCardPullRequest(artifactId, cwd) : undefined;
  // Notes agents and the lead left on the card (board protocol), for the Activity feed.
  const notes = store ? { notes: readAgentNotes(store.findArtifactById(artifactId)?.artifact) } : {};
  post({ type: 'kanban:runTimeline', artifactId, runs, commits, pr, ...notes });
}

async function revertCommit(artifactId: string, sha: string, post: Post): Promise<void> {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!cwd || !/^[0-9a-f]{7,40}$/i.test(sha)) return;
  const ok = await vscode.window.showWarningMessage(
    `Revert the agent commit ${sha.slice(0, 8)} for ${artifactId}? This creates a new commit that undoes its changes.`,
    { modal: true }, 'Revert');
  if (ok !== 'Revert') return;
  await new Promise<void>((resolve) => {
    cp.execFile('git', ['revert', '--no-edit', sha], { cwd, windowsHide: true, timeout: 30_000 }, (err, _out, stderr) => {
      if (err) void vscode.window.showErrorMessage(`git revert failed: ${(stderr || errMsg(err)).trim().slice(0, 300)}`);
      else void vscode.window.showInformationMessage(`Reverted ${sha.slice(0, 8)}.`);
      resolve();
    });
  });
  await postTimeline(artifactId, post);
}

/** Send PR review feedback + failing checks back to the implement agent. */
async function addressReview(artifactId: string, store: ArtifactStore, post: Post): Promise<void> {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const pr = cwd ? await getCardPullRequest(artifactId, cwd) : undefined;
  if (!pr) {
    void vscode.window.showWarningMessage(`No pull request found for ${artifactId} (needs GitHub CLI and a PR on its branch).`);
    return;
  }
  const fixes = prFixRequests(pr);
  if (fixes.length === 0) {
    void vscode.window.showInformationMessage(`${pr.url} has no review comments or failing checks to address.`);
    return;
  }
  const found = store.findArtifactById(artifactId);
  if (!found) return;
  await store.updateArtifact(found.type, artifactId, { metadata: { fixRequests: fixes }, status: 'ready-for-dev' } as ArtifactChanges);
  void vscode.window.showInformationMessage(`Sending ${fixes.length} review item(s) from ${pr.url} back to the agent.`);
  const fresh = store.findArtifactById(artifactId)?.artifact ?? found.artifact;
  void kanbanOrchestrator.runAutonomous(fresh, {}).then(() => postTimeline(artifactId, post, store));
}

// ── Router ───────────────────────────────────────────────────────────────────

const HANDLED = new Set([
  'harness:getStatus', 'harness:select', 'harness:setPosture', 'harness:signIn', 'harness:install', 'harness:smoke', 'harness:pick',
  'kanban:fixAction', 'kanban:previewPrompt', 'kanban:getRunTimeline', 'kanban:revertRun', 'kanban:showOutput', 'kanban:addressReview',
  'kanban:getInbox', 'kanban:dismissInbox',
]);

/** Returns true when the message was one of ours. */
export async function handleAgentUxMessage(
  message: { type: string; [key: string]: unknown },
  store: ArtifactStore,
  webview?: vscode.Webview,
): Promise<boolean> {
  if (!HANDLED.has(message.type)) return false;
  const post: Post = (m) => { void webview?.postMessage(m); };
  const harnessId = typeof message.id === 'string' && getHarnessAdapter(message.id) ? (message.id as HarnessId) : undefined;
  const artifactId = typeof message.artifactId === 'string' ? message.artifactId : undefined;
  try {
    switch (message.type) {
      case 'harness:getStatus':
        await postStatus(post);
        break;
      case 'harness:select': {
        const value = String(message.id ?? 'auto');
        const allowed = ['auto', 'vscode-lm', ...HARNESS_ADAPTERS.map((a) => a.id)];
        if (allowed.includes(value)) {
          await vscode.workspace.getConfiguration(CONFIG).update('agents.harness', value, vscode.ConfigurationTarget.Workspace);
        }
        await postStatus(post);
        break;
      }
      case 'harness:setPosture': {
        const posture = message.posture === 'full' ? 'full' : 'sandboxed';
        await vscode.workspace.getConfiguration(CONFIG).update('agents.permissionPosture', posture, vscode.ConfigurationTarget.Workspace);
        await postStatus(post);
        break;
      }
      case 'harness:signIn':
        if (harnessId) await startSignIn(harnessId);
        break;
      case 'harness:install':
        if (harnessId) void vscode.window.showInformationMessage(getHarnessAdapter(harnessId)!.installHint);
        break;
      case 'harness:smoke':
      case 'harness:pick':
        await vscode.commands.executeCommand('agileagentcanvas.checkHarnesses');
        await postStatus(post);
        break;
      case 'kanban:fixAction':
        if (artifactId && typeof message.action === 'string') {
          await runFixAction(message.action as AgentFixAction, artifactId, store, post);
        }
        break;
      case 'kanban:showOutput':
        if (artifactId) await showOutput(artifactId);
        break;
      case 'kanban:previewPrompt':
        if (artifactId) await previewPrompt(artifactId, store);
        break;
      case 'kanban:getRunTimeline':
        if (artifactId) await postTimeline(artifactId, post, store);
        break;
      case 'kanban:addressReview':
        if (artifactId) await addressReview(artifactId, store, post);
        break;
      case 'kanban:revertRun':
        if (artifactId && typeof message.sha === 'string') await revertCommit(artifactId, message.sha, post);
        break;
      case 'kanban:getInbox':
        post({ type: 'kanban:inbox', items: needsYouList() });
        break;
      case 'kanban:dismissInbox':
        // The tracker re-broadcasts the new list to every board.
        if (artifactId) dismissNeedsYou(artifactId);
        break;
    }
  } catch (err) {
    logger.warn(`${message.type} failed: ${errMsg(err)}`);
    void vscode.window.showErrorMessage(`Agile Agent Canvas: ${errMsg(err)}`);
  }
  return true;
}
