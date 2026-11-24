// ─── Sprint plan commands ────────────────────────────────────────────────────
// generate / status / validate over sprint-status.yaml. Writes are atomic
// (temp file, fsync, rename) and the original bytes are restored if the
// post-write re-read does not match what was intended.

import * as fs from 'fs';
import * as path from 'path';
import { Document, Pair, Scalar, YAMLMap, isMap, parseDocument } from 'yaml';
import {
  HEADER_COMMENT, RANKS, STALE_DAYS_DEFAULT, buildStatus, classifyKey, parseEpics,
} from './sprint-plan-core';
import { StatusSummary, summarizeStatus, validateDoc } from './sprint-plan-report';

/** A failure reported to callers as `{ ok: false, error, ...extra }`. */
export class SprintPlanError extends Error {
  constructor(message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'SprintPlanError';
  }
}

export interface GenerateOptions {
  readonly epicFiles: readonly string[];
  readonly statusFile: string;
  readonly storiesDir: string;
  readonly project: string;
  readonly date: string;
  readonly projectKey?: string;
  readonly trackingSystem?: string;
  readonly storyLocation?: string;
  readonly dryRun?: boolean;
  readonly fresh?: boolean;
  /** `key=status` pairs applied last; the one path allowed to downgrade. */
  readonly set?: readonly string[];
}

const TO_STRING_OPTIONS = { lineWidth: 0, indent: 2, indentSeq: true } as const;

function loadDocument(file: string): Document | undefined {
  if (!fs.existsSync(file)) return undefined;
  const doc = parseDocument(fs.readFileSync(file, 'utf-8'));
  if (doc.errors.length) {
    throw new SprintPlanError(`existing status file is not valid YAML: ${doc.errors[0].message}`, { status_file: file });
  }
  if (doc.contents !== null && !isMap(doc.contents)) {
    throw new SprintPlanError('existing status file is valid YAML but not a mapping', { status_file: file });
  }
  return doc;
}

function storyFilesIn(dir: string): Set<string> {
  try {
    return new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.md')));
  } catch {
    return new Set();
  }
}

function parseSets(pairs: readonly string[], validKeys: ReadonlySet<string>): [string, string][] {
  return pairs.map((pair) => {
    const eq = pair.indexOf('=');
    const key = eq > 0 ? pair.slice(0, eq) : '';
    const status = eq > 0 ? pair.slice(eq + 1) : '';
    if (!key || !status) throw new SprintPlanError(`--set expects key=status, got '${pair}'`);
    if (!validKeys.has(key)) throw new SprintPlanError(`--set key '${key}' is not in the generated plan`, { valid_keys: [...validKeys].sort() });
    const kind = classifyKey(key)?.kind ?? 'story';
    if (!(status in RANKS[kind])) {
      throw new SprintPlanError(`--set status '${status}' is not legal for ${kind} '${key}'`, { legal: Object.keys(RANKS[kind]).sort() });
    }
    return [key, status];
  });
}

function statusMapNode(status: Map<string, string>): YAMLMap {
  const node = new YAMLMap();
  let firstEpic = true;
  for (const [key, value] of status) {
    const keyNode = new Scalar(key);
    if (classifyKey(key)?.kind === 'epic') {
      if (!firstEpic) keyNode.spaceBefore = true;
      firstEpic = false;
    }
    node.items.push(new Pair(keyNode, new Scalar(value)));
  }
  return node;
}

function atomicWrite(file: string, payload: string, mode?: number): void {
  const target = fs.existsSync(file) ? fs.realpathSync(file) : path.resolve(file);
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.sprint-status-${process.pid}-${Date.now()}.tmp`);
  try {
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, payload, null, 'utf-8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (mode !== undefined) fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, target);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/** Parse epics, merge with any existing status file and write (or dry-run) the result. */
export function generate(opts: GenerateOptions): Record<string, unknown> {
  const sources = opts.epicFiles.map((p) => {
    try {
      return { path: p, text: fs.readFileSync(p, 'utf-8') };
    } catch (err) {
      throw new SprintPlanError(`cannot read epic file ${p}: ${(err as Error).message}`);
    }
  });
  const { entries, warnings } = parseEpics(sources);
  if (!entries.length) throw new SprintPlanError('no epics or stories parsed from the given epic files', { epic_files: opts.epicFiles });

  const existing = loadDocument(opts.statusFile);
  const existingJs = (existing?.toJS() ?? {}) as Record<string, unknown>;
  const existingStatus = (opts.fresh ? {} : existingJs.development_status ?? {}) as Record<string, unknown>;
  const { status, report } = buildStatus(entries, existingStatus, storyFilesIn(opts.storiesDir), warnings);
  const explicit = parseSets(opts.set ?? [], new Set(status.keys()));
  for (const [key, value] of explicit) status.set(key, value);

  const meta = (field: string, arg: string | undefined, fallback: string): string =>
    arg ?? (existingJs[field] ? String(existingJs[field]) : fallback);
  const generated = existingJs.generated ? String(existingJs.generated) : opts.date;

  // Round-trip the existing document so unknown keys and comments survive;
  // --fresh starts a new document but still carries action_items (retro history).
  const doc = existing && !opts.fresh ? existing : new Document({});
  if (doc !== existing) doc.commentBefore = HEADER_COMMENT.trimEnd().split('\n').map((l) => (l ? ` ${l}` : '')).join('\n');
  doc.set('generated', generated);
  doc.set('last_updated', opts.date);
  doc.set('project', opts.project);
  doc.set('project_key', meta('project_key', opts.projectKey, 'NOKEY'));
  doc.set('tracking_system', meta('tracking_system', opts.trackingSystem, 'file-system'));
  doc.set('story_location', meta('story_location', opts.storyLocation, opts.storiesDir));
  doc.set('development_status', statusMapNode(status));
  if (!doc.has('action_items') && existing?.has('action_items')) {
    const items = doc.createNode(existingJs.action_items);
    const keyNode = new Scalar('action_items');
    keyNode.spaceBefore = true;
    keyNode.commentBefore = ' Action items committed during retrospectives (section created by the retrospective workflow)';
    (doc.contents as YAMLMap).items.push(new Pair(keyNode, items));
  }

  const counts: Record<string, number> = {};
  for (const value of status.values()) counts[value] = (counts[value] ?? 0) + 1;
  const result: Record<string, unknown> = {
    ok: true, action: 'generate', status_file: opts.statusFile, dry_run: !!opts.dryRun, fresh: !!opts.fresh,
    epics: entries.filter((e) => e.kind === 'epic').length,
    stories: entries.filter((e) => e.kind === 'story').length,
    counts, generated, last_updated: opts.date, warnings,
    new_entries: report.newEntries, preserved: report.preserved, changed: report.changed,
    upgraded_from_disk: report.upgradedFromDisk, dropped_orphans: report.droppedOrphans,
    legacy_mapped: report.legacyMapped, illegal: report.illegal, in_sync: report.inSync,
    explicit_set: explicit.map(([k, s]) => `${k}=${s}`),
  };
  if (opts.dryRun) return result;

  writeVerified(opts.statusFile, doc, status, generated, opts);
  return result;
}

function writeVerified(file: string, doc: Document, status: Map<string, string>, generated: string, opts: GenerateOptions): void {
  const original = fs.existsSync(file) ? fs.readFileSync(file) : undefined;
  const mode = original ? fs.statSync(file).mode & 0o777 : undefined;
  try {
    atomicWrite(file, doc.toString(TO_STRING_OPTIONS), mode);
    const reread = (parseDocument(fs.readFileSync(file, 'utf-8')).toJS() ?? {}) as Record<string, unknown>;
    const dev = (reread.development_status ?? {}) as Record<string, unknown>;
    const want = Object.fromEntries(status);
    if (JSON.stringify(dev) !== JSON.stringify(want)) throw new Error('development_status mismatch after write');
    for (const [field, value] of [['generated', generated], ['last_updated', opts.date], ['project', opts.project]] as const) {
      if (String(reread[field]) !== value) throw new Error(`${field} mismatch after write`);
    }
  } catch (err) {
    let restored = true;
    try {
      if (original) atomicWrite(file, original.toString('utf-8'), mode);
      else fs.rmSync(file, { force: true });
    } catch {
      restored = false;
    }
    throw new SprintPlanError(`write or validation failed, original ${restored ? 'restored' : 'NOT restored'}: ${(err as Error).message}`, { restored });
  }
}

/** Summarize an existing status file. No writes. */
export function status(statusFile: string, date?: string, staleDays = STALE_DAYS_DEFAULT): Record<string, unknown> & StatusSummary {
  const doc = loadDocument(statusFile);
  if (!doc) throw new SprintPlanError('status file does not exist — run sprint planning to generate it', { status_file: statusFile });
  const data = (doc.toJS() ?? {}) as Record<string, unknown>;
  const dev = data.development_status;
  if (!dev || typeof dev !== 'object' || Object.keys(dev).length === 0) {
    throw new SprintPlanError('development_status missing or empty — re-run sprint planning', { status_file: statusFile });
  }
  return {
    ok: true, action: 'status', status_file: statusFile,
    project: data.project ?? null, project_key: data.project_key ?? null, tracking_system: data.tracking_system ?? null,
    generated: data.generated ?? null, last_updated: data.last_updated ?? null,
    ...summarizeStatus(data, date, staleDays),
  };
}

/** Report structural validity. Never throws for an invalid file. */
export function validate(statusFile: string): Record<string, unknown> {
  const base = { ok: true, action: 'validate', status_file: statusFile };
  if (!fs.existsSync(statusFile)) return { ...base, valid: false, problems: ['status file does not exist'], legacy_mapped: [] };
  const doc = parseDocument(fs.readFileSync(statusFile, 'utf-8'));
  if (doc.errors.length) return { ...base, valid: false, problems: [`not valid YAML: ${doc.errors[0].message}`], legacy_mapped: [] };
  const { problems, legacy_mapped } = validateDoc(doc.toJS());
  return { ...base, valid: problems.length === 0, problems, legacy_mapped };
}
