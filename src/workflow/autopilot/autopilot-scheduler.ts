// ─── Autopilot scheduler ─────────────────────────────────────────────────────
// Fires autopilots (see autopilot-config.ts) on their cron schedule while VS
// Code is open — there is no background service, so missed runs are skipped,
// not caught up. Each run goes through the board's normal run path (harness
// resolution, watchdog, failure classification, run history) with the
// runbook as the authoritative workflow definition and a fresh agent session.
//
// Off unless the user turns on `agileagentcanvas.autopilots.enabled` in their
// own settings: a cloned repo's autopilots.json must never start agents.
// Notifies only when a run needs a person; successful runs stay quiet and are
// visible in the run history.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createLogger } from '../../utils/logger';
import { errMsg } from '../../utils/error';
import { getOutputFolder } from '../kanban-verdict';
import { terminalExecutor } from '../terminal-executor';
import { minuteKey, nextRuns } from './cron';
import { claimScheduledRun, pruneClaims } from './autopilot-claim';
import {
  AUTOPILOTS_FILE, AUTOPILOT_TEMPLATE, autopilotArtifact, dueAutopilots, parseAutopilotConfig,
  type AutopilotConfig, type ParsedAutopilot,
} from './autopilot-config';

const logger = createLogger('autopilot');
const TICK_MS = 20_000;
const PRUNE_EVERY_TICKS = 180; // about an hour

function configFile(): string {
  return path.join(getOutputFolder(), AUTOPILOTS_FILE);
}

function isEnabled(): boolean {
  return vscode.workspace.getConfiguration('agileagentcanvas').get<boolean>('autopilots.enabled', false) === true;
}

export function loadAutopilots(): AutopilotConfig {
  let text: string;
  try {
    text = fs.readFileSync(configFile(), 'utf-8');
  } catch {
    return { autopilots: [], errors: [] };
  }
  return parseAutopilotConfig(text);
}

export class AutopilotScheduler implements vscode.Disposable {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly lastFired = new Map<string, string>();
  private readonly running = new Set<string>();
  private reportedErrors = '';
  private reportedClaimError = '';
  private ticks = 0;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(new Date()), TICK_MS);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One scheduler pass; public for tests. */
  tick(now: Date): void {
    if (!isEnabled()) return;
    const { autopilots, errors } = loadAutopilots();
    this.reportConfigErrors(errors);
    if (++this.ticks % PRUNE_EVERY_TICKS === 0) pruneClaims(getOutputFolder(), now.getTime());
    for (const autopilot of dueAutopilots(autopilots, now, this.lastFired)) {
      const minute = minuteKey(now);
      this.lastFired.set(autopilot.id, minute);
      if (this.running.has(autopilot.id)) {
        logger.warn(`[Autopilot] ${autopilot.id}: previous run still going — skipping ${minute}`);
        continue;
      }
      if (!this.claim(autopilot, minute)) continue;
      void this.run(autopilot, 'schedule');
    }
  }

  /** False when another window has the run, or when claiming failed (reported once per distinct error). */
  private claim(autopilot: ParsedAutopilot, minute: string): boolean {
    try {
      return claimScheduledRun(getOutputFolder(), autopilot.id, minute);
    } catch (err) {
      const message = `Autopilot "${autopilot.name}" could not claim its run: ${errMsg(err)}`;
      logger.warn(`[Autopilot] ${message}`);
      if (this.reportedClaimError !== message) {
        this.reportedClaimError = message;
        void vscode.window.showWarningMessage(message);
      }
      return false;
    }
  }

  /** Run one autopilot now; resolves when the run has a verdict. */
  async run(autopilot: ParsedAutopilot, trigger: 'schedule' | 'manual'): Promise<void> {
    if (this.running.has(autopilot.id)) {
      void vscode.window.showInformationMessage(`Autopilot "${autopilot.name}" is already running.`);
      return;
    }
    this.running.add(autopilot.id);
    logger.info(`[Autopilot] ${autopilot.id}: starting (${trigger})`);
    try {
      const verdict = await terminalExecutor.executeAndAwaitVerdict(
        `autopilot-${autopilot.id}`, autopilotArtifact(autopilot), undefined,
        { skillContent: `# Autopilot: ${autopilot.name}\n\n${autopilot.runbook}`, freshSession: true },
      );
      logger.info(`[Autopilot] ${autopilot.id}: ${verdict.verdict}`);
      if (verdict.verdict !== 'COMPLETED' && verdict.verdict !== 'APPROVED') {
        const detail = (verdict.summary ?? '').split('\n')[0].slice(0, 200);
        void vscode.window.showWarningMessage(`Autopilot "${autopilot.name}" needs attention: ${verdict.verdict}${detail ? ` — ${detail}` : ''}`);
      } else if (trigger === 'manual') {
        void vscode.window.showInformationMessage(`Autopilot "${autopilot.name}" finished: ${verdict.verdict}.`);
      }
    } catch (err) {
      logger.warn(`[Autopilot] ${autopilot.id} failed: ${errMsg(err)}`);
      void vscode.window.showWarningMessage(`Autopilot "${autopilot.name}" could not run: ${errMsg(err)}`);
    } finally {
      this.running.delete(autopilot.id);
    }
  }

  private reportConfigErrors(errors: readonly string[]): void {
    const key = errors.join('\n');
    if (key === this.reportedErrors) return;
    this.reportedErrors = key;
    if (errors.length > 0) {
      void vscode.window.showWarningMessage(`${AUTOPILOTS_FILE}: ${errors.length} problem(s) — ${errors[0]}`);
    }
  }
}

async function openConfig(): Promise<void> {
  const file = configFile();
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, AUTOPILOT_TEMPLATE, 'utf-8');
  }
  await vscode.window.showTextDocument(vscode.Uri.file(file));
  if (!isEnabled()) {
    const pick = await vscode.window.showInformationMessage(
      'Autopilots are off. Turn them on in your user settings to let scheduled runs start agents while VS Code is open.',
      'Open setting');
    if (pick) await vscode.commands.executeCommand('workbench.action.openSettings', 'agileagentcanvas.autopilots.enabled');
  }
}

async function runNow(scheduler: AutopilotScheduler): Promise<void> {
  const { autopilots, errors } = loadAutopilots();
  if (autopilots.length === 0) {
    const pick = await vscode.window.showInformationMessage(
      errors[0] ?? `No autopilots defined yet in ${AUTOPILOTS_FILE}.`, 'Open autopilots');
    if (pick) await openConfig();
    return;
  }
  const now = new Date();
  const choice = await vscode.window.showQuickPick(autopilots.map((a) => ({
    label: a.name,
    description: `${a.schedule}${a.enabled ? '' : ' · disabled'}`,
    detail: `Next: ${nextRuns(a.cron, now, 1)[0]?.toLocaleString() ?? 'none within a year'}`,
    autopilot: a,
  })), { placeHolder: 'Run an autopilot now' });
  if (choice) await scheduler.run(choice.autopilot, 'manual');
}

export function registerAutopilots(context: vscode.ExtensionContext): AutopilotScheduler {
  const scheduler = new AutopilotScheduler();
  scheduler.start();
  context.subscriptions.push(
    scheduler,
    vscode.commands.registerCommand('agileagentcanvas.autopilot.open', () => openConfig()),
    vscode.commands.registerCommand('agileagentcanvas.autopilot.runNow', () => runNow(scheduler)),
  );
  return scheduler;
}
