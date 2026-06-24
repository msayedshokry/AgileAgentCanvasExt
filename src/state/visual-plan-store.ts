// ─── Visual Plan Store ────────────────────────────────────────────────────────
// Durable persistence for VisualPlan artifacts under
// <workspace>/<outputFolder>/plans/<id>.plan.json.
//
// Uses vscode.workspace.fs for virtual-workspace compat; no-ops when no
// workspace folder is open. A FileSystemWatcher ingests plan files written by
// EXTERNAL agents (e.g. a Claude Code / OMP terminal agent that the user routed
// a "Plan" action to) so the structured card appears without a reload.
//
// All filesystem paths are built with `path.join` and converted to a Uri via
// `vscode.Uri.file()` (NOT `Uri.from({scheme,path})`), so Windows drive letters
// and backslashes normalize consistently — save / hydrate / watcher / the agent
// prompt all reference the SAME location even on paths with spaces.

import * as vscode from 'vscode';
import * as path from 'path';
import { createLogger } from '../utils/logger';
import { errMsg } from '../utils/error';
import type { VisualPlan, PlanStatus } from '../types/visual-plan';

const logger = createLogger('visual-plan-store');

function getOutputFolderRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  const outputFolderName = vscode.workspace
    .getConfiguration('agileagentcanvas')
    .get<string>('outputFolder', '.agileagentcanvas-context');
  return path.join(folders[0].uri.fsPath, outputFolderName);
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Coerce a parsed JSON object (possibly authored by an external agent, so not
 * guaranteed to match exactly) into a valid VisualPlan. Fills sensible defaults
 * for missing fields so a slightly-off file still renders rather than being
 * dropped. Returns null only when the input isn't an object.
 */
function normalizePlan(raw: unknown, fallbackId: string): VisualPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const nowMs = Date.now();
  const goal = asString(o.goal) ?? '';
  return {
    id: asString(o.id) ?? fallbackId,
    title: asString(o.title) ?? (goal ? goal.slice(0, 80) : 'Untitled plan'),
    goal,
    status: (asString(o.status) ?? 'pending') as PlanStatus,
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : nowMs,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : nowMs,
    sourceArtifactId: asString(o.sourceArtifactId),
    targets: Array.isArray(o.targets) ? (o.targets as string[]) : undefined,
    sections: Array.isArray(o.sections) ? (o.sections as VisualPlan['sections']) : [],
    comments: Array.isArray(o.comments) ? (o.comments as VisualPlan['comments']) : [],
  };
}

export class VisualPlanStore {
  private plans = new Map<string, VisualPlan>();
  private _onDidChange?: vscode.EventEmitter<VisualPlan[]>;

  private get _emitter(): vscode.EventEmitter<VisualPlan[]> {
    if (!this._onDidChange) {
      this._onDidChange = new vscode.EventEmitter<VisualPlan[]>();
    }
    return this._onDidChange;
  }

  /** Exposed as a vscode Event for consumers to subscribe. */
  get onDidChange(): vscode.Event<VisualPlan[]> {
    return this._emitter.event;
  }

  /** Hydrate all plans from disk on construction. */
  constructor() {
    void this.hydrate();
  }

  /** Absolute path to the plans/ directory, or undefined when no workspace. */
  private plansDir(): string | undefined {
    const root = getOutputFolderRoot();
    return root ? path.join(root, 'plans') : undefined;
  }

  private async hydrate(): Promise<void> {
    const dir = this.plansDir();
    if (!dir) {
      logger.debug('No workspace folder open — skipping plan hydration');
      return;
    }
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
      for (const [name] of entries) {
        if (!name.endsWith('.plan.json')) continue;
        try {
          const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(dir, name)));
          const plan = normalizePlan(JSON.parse(raw.toString()), name.replace(/\.plan\.json$/, ''));
          if (plan) this.plans.set(plan.id, plan);
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

  private async ensurePlansDir(): Promise<void> {
    const dir = this.plansDir();
    if (!dir) return;
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
    } catch {
      // Already exists
    }
  }

  async save(plan: VisualPlan): Promise<void> {
    const filePath = this.planFilePath(plan.id);
    if (!filePath) {
      logger.warn('No workspace folder — plan not persisted');
      return;
    }
    await this.ensurePlansDir();
    const buf = Buffer.from(JSON.stringify(plan, null, 2), 'utf-8');
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), buf);
    this.plans.set(plan.id, plan);
    this._emitter.fire(this.list());
    logger.debug(`Saved plan ${plan.id}`);
  }

  get(id: string): VisualPlan | undefined {
    return this.plans.get(id);
  }

  list(): VisualPlan[] {
    return Array.from(this.plans.values());
  }

  /** Absolute path an external agent should write a plan file to. */
  planFilePath(id: string): string | undefined {
    const dir = this.plansDir();
    return dir ? path.join(dir, `${id}.plan.json`) : undefined;
  }

  async delete(id: string): Promise<void> {
    this.plans.delete(id);
    const filePath = this.planFilePath(id);
    if (!filePath) return;
    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
    } catch (err) {
      logger.debug(`Could not delete plan file for ${id}: ${errMsg(err)}`);
    }
    this._emitter.fire(this.list());
  }

  /** Extract the plan id from a `<id>.plan.json` uri. */
  private idFromUri(uri: vscode.Uri): string | undefined {
    const m = uri.path.match(/([^/]+)\.plan\.json$/);
    return m ? m[1] : undefined;
  }

  /** Read one plan file from disk and upsert it into the in-memory map. */
  private async ingestFile(uri: vscode.Uri): Promise<void> {
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(raw).toString('utf-8'));
      const plan = normalizePlan(parsed, this.idFromUri(uri) ?? `plan-${Date.now()}`);
      if (!plan) return;
      this.plans.set(plan.id, plan);
      this._emitter.fire(this.list());
      logger.info(`Ingested plan ${plan.id} from disk`);
    } catch (err) {
      logger.warn(`Failed to ingest plan file ${uri.fsPath}: ${errMsg(err)}`);
    }
  }

  /**
   * Watch the plans/ directory for files written by external agents (the
   * terminal-agent "Plan" path) and ingest them so the card appears live.
   * Returns a disposable; no-ops when no workspace folder is open.
   */
  watchPlansDir(): vscode.Disposable {
    const dir = this.plansDir();
    if (!dir) return { dispose: () => { /* no workspace — nothing to watch */ } };
    const pattern = new vscode.RelativePattern(vscode.Uri.file(dir), '*.plan.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const onWrite = (uri: vscode.Uri) => { void this.ingestFile(uri); };
    watcher.onDidCreate(onWrite);
    watcher.onDidChange(onWrite);
    watcher.onDidDelete((uri) => {
      const id = this.idFromUri(uri);
      if (id && this.plans.delete(id)) this._emitter.fire(this.list());
    });
    logger.info(`Watching plans directory for external plan files: ${dir}`);
    return watcher;
  }

  dispose(): void {
    this._onDidChange?.dispose();
  }
}

export const visualPlanStore = new VisualPlanStore();
