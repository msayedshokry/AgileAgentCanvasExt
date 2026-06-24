// ─── Visual Plan Store ────────────────────────────────────────────────────────
// Durable persistence for VisualPlan artifacts under
// <workspace>/<outputFolder>/plans/<id>.plan.json.
//
// Uses vscode.workspace.fs for virtual-workspace compat; no-ops when no
// workspace folder is open.

import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { errMsg } from '../utils/error';
import type { VisualPlan } from '../types/visual-plan';

const logger = createLogger('visual-plan-store');

function getOutputFolderRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  const outputFolderName = vscode.workspace
    .getConfiguration('agileagentcanvas')
    .get<string>('outputFolder', '.agileagentcanvas-context');
  return `${folders[0].uri.fsPath}/${outputFolderName}`;
}

export class VisualPlanStore {
  private plans = new Map<string, VisualPlan>();
  private _onDidChange = new vscode.EventEmitter<VisualPlan[]>();
  readonly onDidChange = this._onDidChange.event;

  /** Hydrate all plans from disk on construction. */
  constructor() {
    void this.hydrate();
  }

  private async hydrate(): Promise<void> {
    const root = getOutputFolderRoot();
    if (!root) {
      logger.debug('No workspace folder open — skipping plan hydration');
      return;
    }
    const plansDir = vscode.Uri.from({ scheme: 'file', path: `${root}/plans` });
    try {
      const entries = await vscode.workspace.fs.readDirectory(plansDir);
      for (const [name] of entries) {
        if (!name.endsWith('.plan.json')) continue;
        try {
          const fileUri = vscode.Uri.from({ scheme: 'file', path: `${root}/plans/${name}` });
          const raw = await vscode.workspace.fs.readFile(fileUri);
          const plan: VisualPlan = JSON.parse(raw.toString());
          this.plans.set(plan.id, plan);
        } catch (err) {
          logger.warn(`Failed to read plan file ${name}: ${errMsg(err)}`);
        }
      }
    } catch {
      // plans/ directory doesn't exist yet — first run
      logger.debug('No plans directory found — starting fresh');
    }
    logger.info(`Hydrated ${this.plans.size} plans from disk`);
  }

  private async ensurePlansDir(): Promise<vscode.Uri | undefined> {
    const root = getOutputFolderRoot();
    if (!root) return undefined;
    const plansDir = vscode.Uri.from({ scheme: 'file', path: `${root}/plans` });
    try {
      await vscode.workspace.fs.createDirectory(plansDir);
    } catch {
      // Already exists
    }
    return plansDir;
  }

  async save(plan: VisualPlan): Promise<void> {
    const root = getOutputFolderRoot();
    if (!root) {
      logger.warn('No workspace folder — plan not persisted');
      return;
    }
    await this.ensurePlansDir();
    const fileUri = vscode.Uri.from({ scheme: 'file', path: `${root}/plans/${plan.id}.plan.json` });
    const buf = Buffer.from(JSON.stringify(plan, null, 2), 'utf-8');
    await vscode.workspace.fs.writeFile(fileUri, buf);
    this.plans.set(plan.id, plan);
    this._onDidChange.fire(this.list());
    logger.debug(`Saved plan ${plan.id}`);
  }

  get(id: string): VisualPlan | undefined {
    return this.plans.get(id);
  }

  list(): VisualPlan[] {
    return Array.from(this.plans.values());
  }

  async delete(id: string): Promise<void> {
    this.plans.delete(id);
    const root = getOutputFolderRoot();
    if (!root) return;
    try {
      const fileUri = vscode.Uri.from({ scheme: 'file', path: `${root}/plans/${id}.plan.json` });
      await vscode.workspace.fs.delete(fileUri);
    } catch (err) {
      logger.debug(`Could not delete plan file for ${id}: ${errMsg(err)}`);
    }
    this._onDidChange.fire(this.list());
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

export const visualPlanStore = new VisualPlanStore();
