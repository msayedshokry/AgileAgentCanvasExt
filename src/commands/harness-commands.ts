// ─── Harness commands ───────────────────────────────────────────────────────
// "Check Agent Harnesses": shows which coding-agent CLIs this machine has,
// which one the board will use and with what permissions, and lets the user
// pick a harness or run a real end-to-end smoke test.

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { HARNESS_ADAPTERS, buildHarnessLaunch, type HarnessAdapter } from '../workflow/harness/harness-adapters';
import {
  agentRunBlockReason,
  clearHarnessPathCache,
  getPermissionPosture,
  initBoardHarness,
  isOnPathCached,
  readBudgetSettings,
  resolveBoardHarness,
  resolveEffectivePosture,
} from '../workflow/harness/board-harness';
import { budgetEnforcer } from '../workflow/budget-enforcer';
import { autoScheduler } from '../workflow/auto-scheduler';
import * as orchestratorModule from '../workflow/kanban-orchestrator';
import { terminalExecutor } from '../workflow/terminal-executor';
import { buildCommandLine, detectShellKind } from '../workflow/harness/shell-command';
import { stagePromptFile, disposePromptFile } from '../workflow/harness/prompt-staging';
import { getOutputFolder, readVerdictFile } from '../workflow/kanban-verdict';
import { readRunHistory, type RunHistoryEntry } from '../workflow/harness/run-history';
import { createLogger } from '../utils/logger';
import { errMsg } from '../utils/error';

const logger = createLogger('harness-commands');
const SMOKE_TIMEOUT_MS = 3 * 60 * 1000;
const SMOKE_POLL_MS = 2000;

export interface HarnessProbe {
  readonly adapter: HarnessAdapter;
  readonly binary?: string;
  readonly version?: string;
}

function probeVersion(binary: string): string | undefined {
  try {
    const res = cp.spawnSync(binary, ['--version'], {
      encoding: 'utf-8', timeout: 10_000, windowsHide: true, shell: process.platform === 'win32',
    });
    const line = `${res.stdout ?? ''}${res.stderr ?? ''}`.split(/\r?\n/).find((l) => l.trim().length > 0);
    return line?.trim().slice(0, 80);
  } catch {
    return undefined;
  }
}

export function probeHarnesses(): HarnessProbe[] {
  clearHarnessPathCache();
  return HARNESS_ADAPTERS.map((adapter) => {
    const binary = adapter.binaries.find((b) => isOnPathCached(b));
    return { adapter, binary, version: binary ? probeVersion(binary) : undefined };
  });
}

type CheckItem = vscode.QuickPickItem & { action?: 'choose' | 'smoke' | 'posture'; probe?: HarnessProbe };

async function checkHarnesses(): Promise<void> {
  const probes = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Checking agent harnesses…' },
    async () => probeHarnesses(),
  );
  const resolution = await resolveBoardHarness();
  const posture = getPermissionPosture();
  const using =
    resolution.kind === 'cli' ? `${resolution.adapter.label} (${resolution.reason})`
    : resolution.kind === 'lm' ? `VS Code language model (${resolution.reason})`
    : 'nothing — board runs are BLOCKED';

  const items: CheckItem[] = [
    { label: `$(info) Board uses: ${using}`, detail: `Permission posture: ${posture}` },
    ...probes.map((p): CheckItem => ({
      label: `${p.binary ? '$(check)' : '$(circle-slash)'} ${p.adapter.label}`,
      description: p.binary ? (p.version ?? p.binary) : 'not installed',
      detail: p.binary ? p.adapter.postureNotes[posture] : p.adapter.installHint,
      probe: p,
      action: p.binary ? 'smoke' : undefined,
    })),
    { label: 'Actions', kind: vscode.QuickPickItemKind.Separator },
    { label: '$(settings-gear) Choose the board harness…', action: 'choose' },
    { label: '$(shield) Change permission posture…', action: 'posture' },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Agent harnesses',
    placeHolder: 'Pick an installed harness to run a smoke test, or an action',
  });
  if (!picked?.action) return;
  if (picked.action === 'choose') return chooseHarness(probes);
  if (picked.action === 'posture') {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'agileagentcanvas.agents.permissionPosture');
    return;
  }
  if (picked.probe) await runSmokeTest(picked.probe);
}

async function chooseHarness(probes: HarnessProbe[]): Promise<void> {
  const options = [
    { label: 'auto', description: 'Chat-provider match, then first installed CLI, then VS Code language model' },
    { label: 'vscode-lm', description: 'Always use the VS Code language model (e.g. GitHub Copilot Chat)' },
    ...probes.map((p) => ({ label: p.adapter.id, description: `${p.adapter.label}${p.binary ? '' : ' (not installed)'}` })),
  ];
  const pick = await vscode.window.showQuickPick(options, { title: 'Board harness' });
  if (!pick) return;
  await vscode.workspace.getConfiguration('agileagentcanvas')
    .update('agents.harness', pick.label, vscode.ConfigurationTarget.Workspace);
  void vscode.window.showInformationMessage(`Board harness set to "${pick.label}".`);
}

/** Launch the harness for real with a tiny task and wait for its verdict file. */
async function runSmokeTest(probe: HarnessProbe): Promise<void> {
  if (!probe.binary) return;
  const trustBlock = agentRunBlockReason();
  if (trustBlock) {
    void vscode.window.showWarningMessage(trustBlock);
    return;
  }
  const outputFolder = getOutputFolder();
  const runId = `smoke-${Date.now()}`;
  const resultPath = path.join(outputFolder, '_terminal-output', `${probe.adapter.id}-${runId}-result.json`);
  const prompt =
    `This is a connectivity smoke test from Agile Agent Canvas. Do not change any other file.\n` +
    `Write exactly this JSON to the file ${resultPath.replace(/\\/g, '/')} and then stop:\n` +
    `{"verdict":"COMPLETED","summary":"smoke test"}\n`;

  let promptFile: string | undefined;
  try {
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    promptFile = stagePromptFile(outputFolder, probe.adapter.id, runId, prompt);
    const spec = buildHarnessLaunch(probe.adapter, {
      binary: probe.binary, promptFile, resultPath, posture: await resolveEffectivePosture(),
    });
    const terminal = vscode.window.createTerminal({ name: `AAC smoke: ${probe.adapter.label}` });
    terminal.show(true);
    await terminal.processId;
    terminal.sendText(buildCommandLine(spec, detectShellKind(vscode.env.shell, process.platform)), true);

    const verdict = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Smoke testing ${probe.adapter.label}…`, cancellable: true },
      async (_progress, token) => {
        const started = Date.now();
        while (!token.isCancellationRequested && Date.now() - started < SMOKE_TIMEOUT_MS) {
          const v = readVerdictFile(resultPath);
          if (v) return v;
          await new Promise((r) => setTimeout(r, SMOKE_POLL_MS));
        }
        return undefined;
      },
    );
    if (verdict?.verdict === 'COMPLETED') {
      void vscode.window.showInformationMessage(`${probe.adapter.label} works with the board: it wrote its verdict file.`);
    } else {
      void vscode.window.showWarningMessage(
        `${probe.adapter.label} did not write a verdict within ${SMOKE_TIMEOUT_MS / 60000} minutes. ` +
        `Check the "AAC smoke" terminal (sign-in, model config, or a permission prompt).`,
      );
    }
  } catch (err) {
    logger.warn(`[harness] smoke test failed: ${errMsg(err)}`);
    void vscode.window.showErrorMessage(`Smoke test could not start: ${errMsg(err)}`);
  } finally {
    disposePromptFile(promptFile);
    try { fs.rmSync(resultPath, { force: true }); } catch { /* best effort */ }
  }
}

/**
 * Stop every running agent: abort autonomous loops, kill agent terminals and
 * pause the scheduler so nothing new starts until the user resumes it.
 */
export async function stopAllAgents(): Promise<{ aborted: number; killed: number }> {
  autoScheduler.pause();
  const aborted = orchestratorModule.kanbanOrchestrator?.abortAll() ?? 0;
  const killed = await terminalExecutor.killAllTerminals();
  logger.info(`[harness] Stop All Agents: aborted ${aborted} run(s), killed ${killed} terminal(s)`);
  return { aborted, killed };
}

const VERDICT_ICON: Record<string, string> = {
  COMPLETED: '$(pass)', APPROVED: '$(pass-filled)', NEEDS_FIXES: '$(tools)', BLOCKED: '$(error)', UNKNOWN: '$(question)',
};

function describeRun(e: RunHistoryEntry): string {
  const secs = Math.max(0, Math.round((e.finishedAt - e.startedAt) / 1000));
  return [
    `# ${e.artifactId} · ${e.workflowId}`,
    '',
    `| | |`,
    `|---|---|`,
    `| Verdict | **${e.verdict}** |`,
    `| Harness | ${e.harness} |`,
    `| Started | ${new Date(e.startedAt).toLocaleString()} |`,
    `| Duration | ${secs}s |`,
    `| Run id | \`${e.runId}\` |`,
    '',
    '## Summary',
    '',
    '```',
    e.summary ?? '(none)',
    '```',
  ].join('\n');
}

/** Recent board runs, newest first; picking one opens its details. */
async function showRunHistory(): Promise<void> {
  const entries = readRunHistory(getOutputFolder(), 200);
  if (entries.length === 0) {
    void vscode.window.showInformationMessage('No agent runs recorded yet in this workspace.');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    entries.map((e) => ({
      label: `${VERDICT_ICON[e.verdict] ?? '$(circle)'} ${e.artifactId} · ${e.workflowId}`,
      description: `${e.verdict} · ${e.harness} · ${new Date(e.finishedAt).toLocaleString()}`,
      detail: e.summary?.split('\n')[0],
      entry: e,
    })),
    { title: 'Agent run history', matchOnDescription: true, matchOnDetail: true },
  );
  if (!pick) return;
  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: describeRun(pick.entry) });
  await vscode.window.showTextDocument(doc, { preview: true });
}

function applyBudgetSettings(): void {
  budgetEnforcer.setConfig(readBudgetSettings());
}

export function registerHarnessCommands(context: vscode.ExtensionContext): void {
  initBoardHarness(context);
  applyBudgetSettings();
  context.subscriptions.push(
    vscode.commands.registerCommand('agileagentcanvas.checkHarnesses', () => checkHarnesses()),
    vscode.commands.registerCommand('agileagentcanvas.showRunHistory', () => showRunHistory()),
    vscode.commands.registerCommand('agileagentcanvas.stopAllAgents', async () => {
      const { aborted, killed } = await stopAllAgents();
      void vscode.window.showInformationMessage(
        `Stopped all agents: ${aborted} autonomous run(s) aborted, ${killed} terminal(s) closed. The scheduler is paused.`,
      );
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('agileagentcanvas.budget')) applyBudgetSettings();
    }),
  );
}
