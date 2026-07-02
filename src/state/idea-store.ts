/**
 * IdeaStore — lightweight free-form scratchpad persisted to the project folder.
 *
 * Intentionally separate from `ArtifactStore`: ideas skip BMAD schema
 * validation, reducer plumbing, and canvas positioning. They live as a
 * thin list and are exposed to the webview via a dedicated drawer.
 *
 * Files-on-disk layout:
 *   <outputFolder>/ideas/<id>.md
 *   Each file has YAML frontmatter (id, title, color, createdAt, updatedAt,
 *   archivedAt?) followed by the body markdown.
 *
 * ponytail: single file = single source of truth. Avoids the BMAD artifact
 *   round-trip (schema validate → reducer → file IO) for notes that don't
 *   need any of it. Add schema validation later only if a need appears.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';

const logger = createLogger('idea-store');

export type IdeaColor = 'yellow' | 'blue' | 'green' | 'pink' | 'gray';

export interface Idea {
  id: string;
  title: string;
  body: string;
  color: IdeaColor;
  createdAt: string;   // ISO
  updatedAt: string;   // ISO
  archivedAt?: string; // ISO when archived; absent means active.
}

export type IdeaDraft = Pick<Idea, 'title' | 'body' | 'color'>;

/**
 * Minimal YAML frontmatter serializer — we only emit/read scalar string
 * fields (no nested arrays/objects), so a hand-rolled loop is shorter and
 * dependency-free vs pulling in `js-yaml`. Dates stay as ISO strings.
 */
function ideaToMarkdown(idea: Idea): string {
  const fields: Array<[string, string | undefined]> = [
    ['id',         idea.id],
    ['title',      idea.title],
    ['color',      idea.color],
    ['createdAt',  idea.createdAt],
    ['updatedAt',  idea.updatedAt],
    ['archivedAt', idea.archivedAt],
  ];
  const fm = fields
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: "${String(v).replace(/"/g, '\\"')}"`)
    .join('\n');
  return `---\n${fm}\n---\n\n${idea.body ?? ''}\n`;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  // ponytail: regex-only parse — frontmatter shape is fixed (string fields
  // we wrote ourselves), so a structured YAML lib would be heavier than
  // the value we get from it. If the shape ever grows, swap in js-yaml.
  const m = raw.match(/^---\n([\s\S]*?)\n---\n*([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw.trim() };
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z]+):\s*"(.*)"\s*$/);
    if (kv) meta[kv[1]] = kv[2].replace(/\\"/g, '"');
  }
  return { meta, body: m[2].trim() };
}

function idFromMeta(meta: Record<string, string>, fallback: string): string {
  return meta.id || fallback;
}

function colorOr(meta: Record<string, string>, fallback: IdeaColor): IdeaColor {
  const c = meta.color as IdeaColor;
  return (c === 'yellow' || c === 'blue' || c === 'green' || c === 'pink' || c === 'gray') ? c : fallback;
}

export class IdeaStore {
  /**
   * Fires whenever an idea is created/updated/archived/deleted.
   * The canvas-view-provider listens and pushes a fresh list to the webview.
   */
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  private folderUri: vscode.Uri | undefined;
  private memCache: Map<string, Idea> = new Map();
  private loaded = false;

  /** Update the active project folder and reload ideas from disk. */
  async setFolder(folderUri: vscode.Uri | undefined): Promise<void> {
    this.folderUri = folderUri;
    this.loaded = false;
    this.memCache.clear();
    if (folderUri) {
      await this.loadFromDisk();
    } else {
      this._onDidChange.fire();
    }
  }

  /**
   * True when a project folder is active and ideas will persist to disk.
   * Used by the webview to block capture and surface a clear warning.
   */
  hasFolder(): boolean {
    return !!this.folderUri;
  }

  /** All active (non-archived) ideas, newest first. */
  list(): Idea[] {
    return Array.from(this.memCache.values())
      .filter(i => !i.archivedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Archived ideas, newest first. */
  listArchived(): Idea[] {
    return Array.from(this.memCache.values())
      .filter(i => !!i.archivedAt)
      .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''));
  }

  get(id: string): Idea | undefined {
    return this.memCache.get(id);
  }

  async create(draft: IdeaDraft): Promise<Idea> {
    const now = new Date().toISOString();
    const idea: Idea = {
      id: `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: draft.title.trim() || 'Untitled idea',
      body: draft.body,
      color: draft.color,
      createdAt: now,
      updatedAt: now,
    };
    this.memCache.set(idea.id, idea);
    await this.writeToDisk(idea);
    this._onDidChange.fire();
    return idea;
  }

  async update(id: string, patch: Partial<Pick<Idea, 'title' | 'body' | 'color'>>): Promise<Idea | undefined> {
    const existing = this.memCache.get(id);
    if (!existing) return undefined;
    const updated: Idea = {
      ...existing,
      title: patch.title ?? existing.title,
      body:  patch.body  ?? existing.body,
      color: patch.color ?? existing.color,
      updatedAt: new Date().toISOString(),
    };
    this.memCache.set(id, updated);
    await this.writeToDisk(updated);
    this._onDidChange.fire();
    return updated;
  }

  async archive(id: string): Promise<void> {
    const existing = this.memCache.get(id);
    if (!existing || existing.archivedAt) return;
    this.memCache.set(id, { ...existing, archivedAt: new Date().toISOString() });
    await this.writeToDisk(this.memCache.get(id)!);
    this._onDidChange.fire();
  }

  async restore(id: string): Promise<void> {
    const existing = this.memCache.get(id);
    if (!existing || !existing.archivedAt) return;
    // Drop the archivedAt field explicitly to un-archive the idea on disk.
    const { archivedAt: archivedAtDrop, ...rest } = existing;
    void archivedAtDrop;
    this.memCache.set(id, { ...rest, updatedAt: new Date().toISOString() });
    await this.writeToDisk(this.memCache.get(id)!);
    this._onDidChange.fire();
  }

  async delete(id: string): Promise<void> {
    if (!this.memCache.has(id)) return;
    this.memCache.delete(id);
    if (this.folderUri) {
      const file = path.join(this.folderUri.fsPath, 'ideas', `${id}.md`);
      try { await fs.promises.unlink(file); }
      catch (err) { logger.debug(`[IdeaStore] delete failed for ${id}: ${err}`); }
    }
    this._onDidChange.fire();
  }

  // ── File IO ─────────────────────────────────────────────────────────────

  private ideasDir(): string | undefined {
    if (!this.folderUri) return undefined;
    return path.join(this.folderUri.fsPath, 'ideas');
  }

  /** Load all ideas from <folder>/ideas/*.md into the in-memory cache. */
  async loadFromDisk(): Promise<void> {
    if (this.loaded) return;
    const dirPath = this.ideasDir();
    if (!dirPath) { this.loaded = true; return; }
    let entries: string[] = [];
    try {
      entries = await fs.promises.readdir(dirPath);
    } catch {
      // Ideas folder doesn't exist yet — fine, will be created on first save.
      this.loaded = true;
      this._onDidChange.fire();
      return;
    }
    this.memCache.clear();
    for (const name of entries) {
      if (!name.endsWith('.md')) continue;
      const filePath = path.join(dirPath, name);
      try {
        const raw = await fs.promises.readFile(filePath, 'utf-8');
        const { meta, body } = parseFrontmatter(raw);
        const id = idFromMeta(meta, name.replace(/\.md$/, ''));
        const idea: Idea = {
          id,
          title: meta.title || 'Untitled idea',
          color: colorOr(meta, 'yellow'),
          createdAt: meta.createdAt || new Date().toISOString(),
          updatedAt: meta.updatedAt || new Date().toISOString(),
          archivedAt: meta.archivedAt,
          body,
        };
        this.memCache.set(id, idea);
      } catch (err) {
        logger.debug(`[IdeaStore] failed reading ${filePath}: ${err}`);
      }
    }
    this.loaded = true;
    this._onDidChange.fire();
  }

  private async writeToDisk(idea: Idea): Promise<void> {
    const dirPath = this.ideasDir();
    if (!dirPath) return;
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
    } catch { /* exists */ }
    const filePath = path.join(dirPath, `${idea.id}.md`);
    await fs.promises.writeFile(filePath, ideaToMarkdown(idea), 'utf-8');
  }
}
