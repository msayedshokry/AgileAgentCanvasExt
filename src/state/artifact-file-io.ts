import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';

const ioLogger = createLogger('artifact-file-io');

/**
 * Typed boundary for legacy migration data.
 *
 * These helpers used to take `any` and return `any` because the artifacts
 * were authored under older schemas with mixed-shape fields.  We still want
 * to accept any JSON-parsed object, but using `Record<string, unknown>`
 * (instead of `any`) keeps named property access (where present) sharply
 * typed and forces consumer code to narrow before using values.
 */
type LegacyRecord = Record<string, unknown>;
type LegacyAc = LegacyRecord & {
    status?: string;
    verified?: undefined;
};
type LegacyTask = LegacyRecord & {
    status?: string;
    completed?: undefined;
};
type LegacyStory = LegacyRecord & {
    status?: string;
    completed?: undefined;
};

interface ResolveTargetUriOptions {
    baseUri: vscode.Uri;
    folderName?: string;
    fileName: string;
}

export async function resolveArtifactTargetUri(options: ResolveTargetUriOptions): Promise<vscode.Uri> {
    const { baseUri, folderName, fileName } = options;

    if (!folderName) {
        return vscode.Uri.joinPath(baseUri, fileName);
    }

    const folderUri = vscode.Uri.joinPath(baseUri, folderName);
    try {
        await vscode.workspace.fs.createDirectory(folderUri);
    } catch {
        // Folder might already exist.
    }

    return vscode.Uri.joinPath(folderUri, fileName);
}

/**
 * Write a JSON file to disk, performing a **payload-authoritative** merge.
 *
 * Strategy:
 *  - The `payload` is always the source of truth for every key it contains.
 *  - Any key present in the existing file on disk but **absent** from `payload`
 *    (a "foreign" / extension key) is preserved so that hand-added fields are
 *    not destroyed.
 *  - Keys that the caller explicitly removed from `payload` will NOT be
 *    resurrected from disk (fixing the "zombie fields" bug).
 *  - For BMAD-envelope files (`metadata` + `content`), a two-level merge is
 *    applied so that nested foreign keys inside `metadata` and `content` are
 *    also preserved while the payload remains authoritative.
 */
export async function writeJsonFile(targetUri: vscode.Uri, payload: Record<string, unknown>): Promise<void> {
    // Normalize legacy dual-field format before writing so old data is cleaned on save
    const normalizedPayload = normalizeLegacyArtifact(payload);
    let finalPayload: Record<string, unknown> = normalizedPayload;
    let existingData: unknown;
    try {
        const existingBytes = await vscode.workspace.fs.readFile(targetUri);
        existingData = JSON.parse(Buffer.from(existingBytes).toString('utf-8'));
    } catch (e) {
        // File doesn't exist or isn't valid JSON — write payload as-is (CR-4: log it)
        ioLogger.debug(`writeJsonFile: could not read/parse ${targetUri.fsPath}, writing fresh: ${e}`);
    }
    if (isRecord(existingData)) finalPayload = mergeOverDisk(existingData, normalizedPayload);
    finalPayload = withCreationTime(finalPayload);
    // Nothing but the save time changed: leave the file alone.
    if (isRecord(existingData) && sameIgnoringSaveTime(existingData, finalPayload)) return;

    finalPayload = withCreatedTimestamp(finalPayload);
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(JSON.stringify(finalPayload, null, 2), 'utf-8'));
}

/** Metadata the writers fill with defaults; the file's own value wins. */
const DISK_OWNED_METADATA = ['schemaVersion', 'artifactType', 'workflowName'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The payload's values over the file's, in the file's key order (new keys
 * last), so a save changes only what changed. Keys the payload leaves out
 * or sets to undefined keep the file's value.
 */
function keepForeign(disk: Record<string, unknown>, payload: Record<string, unknown>): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const key of Object.keys(disk)) {
        merged[key] = payload[key] === undefined ? disk[key] : payload[key];
    }
    for (const [key, value] of Object.entries(payload)) {
        if (value !== undefined && !(key in merged)) merged[key] = value;
    }
    return merged;
}

function mergeOverDisk(existing: Record<string, unknown>, payload: Record<string, unknown>): Record<string, unknown> {
    const merged = keepForeign(existing, payload);
    if (isRecord(payload.metadata) && isRecord(existing.metadata)) {
        const meta = keepForeign(existing.metadata, payload.metadata);
        for (const key of DISK_OWNED_METADATA) {
            if (existing.metadata[key] !== undefined) meta[key] = existing.metadata[key];
        }
        const diskTimes = isRecord(existing.metadata.timestamps) ? existing.metadata.timestamps : {};
        if (diskTimes.created) {
            meta.timestamps = { ...(isRecord(meta.timestamps) ? meta.timestamps : {}), created: diskTimes.created };
        }
        merged.metadata = meta;
    }
    if (isRecord(payload.content) && isRecord(existing.content)) {
        merged.content = keepForeign(existing.content, payload.content);
    }
    return merged;
}

/** Schemas require `timestamps.created`; a file that never had one gets its first save time. */
function withCreationTime(doc: Record<string, unknown>): Record<string, unknown> {
    if (!isRecord(doc.metadata) || !isRecord(doc.metadata.timestamps) || doc.metadata.timestamps.created) return doc;
    const times = doc.metadata.timestamps;
    const created = typeof times.lastModified === 'string' ? times.lastModified : new Date().toISOString();
    return { ...doc, metadata: { ...doc.metadata, timestamps: { created, ...times } } };
}

/** JSON with object keys sorted, so key order alone never counts as a change. */
function canonicalJson(value: unknown): string {
    return JSON.stringify(value, (_key, v: unknown) => (isRecord(v)
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
        : v));
}

function withoutSaveTime(doc: Record<string, unknown>): string {
    if (!isRecord(doc.metadata) || !isRecord(doc.metadata.timestamps)) return canonicalJson(doc);
    const { lastModified: _l, ...times } = doc.metadata.timestamps;
    return canonicalJson({ ...doc, metadata: { ...doc.metadata, timestamps: times } });
}

/** True when the two documents differ at most in `metadata.timestamps.lastModified` and key order. */
export function sameIgnoringSaveTime(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    return withoutSaveTime(a) === withoutSaveTime(b);
}

/** True when the JSON file at `uri` already has this `content` (for files stamped with a generation time). */
export async function sameContentOnDisk(uri: vscode.Uri, content: unknown): Promise<boolean> {
    try {
        const existing = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8'));
        return canonicalJson(existing?.content) === canonicalJson(content);
    } catch {
        return false;
    }
}

/** Write text to a file unless it already holds exactly that text. */
export async function writeTextIfChanged(uri: vscode.Uri, text: string): Promise<boolean> {
    try {
        const existing = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
        if (existing === text) return false;
    } catch {
        // Not there yet — write it.
    }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf-8'));
    return true;
}

/**
 * A story file's content. The schema requires `content.epicId`; the file sits
 * in its epic's folder, so that epic wins over a missing or blank value (Fix
 * Schemas scaffolds missing required strings as '').
 */
export function storyContentForEpic<T extends object>(story: T, epicId: string): T & { epicId: string } {
    return { ...story, epicId };
}

/**
 * The metadata schema requires `timestamps.created`. Callers only set
 * `lastModified` and rely on the merge above to keep `created` from disk, so a
 * brand-new file (or one written before this fix) would otherwise lack it.
 */
export function withCreatedTimestamp(payload: Record<string, unknown>): Record<string, unknown> {
    const metadata = payload.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return payload;
    const meta = metadata as Record<string, unknown>;
    const rawTimestamps = meta.timestamps;
    const timestamps = rawTimestamps && typeof rawTimestamps === 'object' && !Array.isArray(rawTimestamps)
        ? rawTimestamps as Record<string, unknown>
        : {};
    if (typeof timestamps.created === 'string' && timestamps.created) return payload;
    const created = typeof timestamps.lastModified === 'string' && timestamps.lastModified
        ? timestamps.lastModified
        : new Date().toISOString();
    return { ...payload, metadata: { ...meta, timestamps: { ...timestamps, created } } };
}

/**
 * Normalize a legacy artifact that may contain dual-field completion patterns
 * (boolean + status fields that must stay in sync) to the new single-field format.
 *
 * Migration rules:
 * - AC: `verified` boolean → drop; `status` is the single source of truth
 * - Task: `completed` boolean → drop; `status` is the single source of truth
 * - Orphaned booleans (without corresponding status): infer status from boolean
 *
 * This runs on every read so that:
 *   (a) In-memory state is always clean regardless of source file age
 *   (b) Old files are transparently upgraded on next write
 */
export function normalizeLegacyArtifact(artifact: Record<string, unknown>): Record<string, unknown> {
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
        return artifact;
    }

    const result = deepClone(artifact) as Record<string, unknown>;

    // Normalize BMAD envelope
    if (result.content && typeof result.content === 'object') {
        (result as Record<string, unknown>).content = normalizeContent((result as Record<string, unknown>).content as Record<string, unknown>);
    }

    return result;
}

function normalizeContent(content: Record<string, unknown>): Record<string, unknown> {
    if (!content || typeof content !== 'object') {
        return content;
    }

    const result = { ...content };

    // Normalize acceptance criteria (story schema)
    if (Array.isArray(result.acceptanceCriteria)) {
        (result as Record<string, unknown>).acceptanceCriteria = result.acceptanceCriteria.map((ac: Record<string, unknown>) => normalizeAc(ac));
    }

    // Normalize tasks (story schema)
    if (Array.isArray(result.tasks)) {
        (result as Record<string, unknown>).tasks = result.tasks.map((task: Record<string, unknown>) => normalizeTask(task));
    }

    // Normalize inline stories (epics schema — epics[].stories[] or top-level stories[])
    if (Array.isArray(result.stories)) {
        (result as Record<string, unknown>).stories = (result.stories as unknown[]).map((s) => normalizeInlineStory(s as Record<string, unknown>));
    }
    if (Array.isArray(result.epics)) {
        (result as Record<string, unknown>).epics = result.epics.map((epic: Record<string, unknown>) => {              if (Array.isArray(epic.stories)) {
                return { ...epic, stories: (epic.stories as unknown[]).map((s: unknown) => normalizeInlineStory(s as Record<string, unknown>)) };
            }
            return epic;
        });
    }

    return result;
}

function normalizeAc(ac: LegacyAc): LegacyAc {
    // If only boolean exists (orphaned), infer status
    if ('verified' in ac && !('status' in ac)) {
        const verified = ac.verified as boolean | undefined;
        return { ...ac, status: verified ? 'verified' : 'draft', verified: undefined };
    }

    // Both fields present — drop verified, preserve status
    if ('verified' in ac) {
        const { verified: _v, ...rest } = ac;
        return rest as LegacyAc;
    }

    return ac;
}

function normalizeTask(task: LegacyTask): LegacyTask {
    // If only completed exists (orphaned), infer status
    if ('completed' in task && !('status' in task)) {
        const completed = task.completed as boolean | undefined;
        return { ...task, status: completed ? 'implemented' : 'pending', completed: undefined };
    }

    // Both fields present — drop completed, preserve status
    if ('completed' in task) {
        const { completed: _c, ...rest } = task;
        return rest as LegacyTask;
    }

    // Normalize subtasks recursively
    if (Array.isArray(task.subtasks)) {
        return {
            ...task,
            subtasks: (task.subtasks as unknown[]).map((st) =>
                normalizeSubtask(st as LegacyRecord as LegacyTask)
            ),
        };
    }

    return task;
}

function normalizeSubtask(subtask: LegacyTask): LegacyTask {
    // Subtasks have no status field in the schema, so we add one
    // based on the completed boolean for consistency
    if ('completed' in subtask) {
        const { completed, ...rest } = subtask;
        const done = typeof completed === 'boolean' && completed;
        return { ...rest, status: done ? 'done' : 'pending', completed: undefined };
    }

    return subtask;
}

/**
 * Normalize an inline story object (found within epics.json content.epics[].stories[]
 * or content.stories[]). These have a dual-field completed+status pattern.
 */
function normalizeInlineStory(story: LegacyStory): LegacyStory {
    // Both fields present — drop completed, preserve status
    if ('completed' in story && 'status' in story) {
        const { completed: _c, ...rest } = story;
        return rest as LegacyStory;
    }

    // Orphaned completed (no status) — infer status then drop completed
    if ('completed' in story) {
        const { completed, ...rest } = story;
        const done = typeof completed === 'boolean' && completed;
        return { ...rest, status: done ? 'done' : 'draft', completed: undefined };
    }

    return story;
}

function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

export async function writeMarkdownCompanion(jsonUri: vscode.Uri, mdFilename: string, markdownContent: string): Promise<vscode.Uri> {
    const parentUri = vscode.Uri.joinPath(jsonUri, '..');
    const mdUri = vscode.Uri.joinPath(parentUri, mdFilename);
    await writeTextIfChanged(mdUri, markdownContent);
    return mdUri;
}
