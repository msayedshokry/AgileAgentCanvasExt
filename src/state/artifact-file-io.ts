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
    try {
        const existingBytes = await vscode.workspace.fs.readFile(targetUri);
        const existingData = JSON.parse(Buffer.from(existingBytes).toString('utf-8'));

        // Payload-authoritative merge: preserve only foreign keys from disk
        if (existingData && typeof existingData === 'object' && !Array.isArray(existingData)) {
            const foreignKeys: Record<string, unknown> = {};
            for (const key of Object.keys(existingData)) {
                if (!(key in normalizedPayload)) {
                    foreignKeys[key] = existingData[key];
                }
            }
            finalPayload = { ...foreignKeys, ...normalizedPayload };

            // Deep-merge BMAD envelope layers so nested foreign keys survive
            if (normalizedPayload.metadata && existingData.metadata && typeof existingData.metadata === 'object') {
                const payloadMeta = normalizedPayload.metadata as Record<string, unknown>;
                const existingMeta = existingData.metadata as Record<string, unknown>;
                const foreignMeta: Record<string, unknown> = {};
                for (const k of Object.keys(existingMeta)) {
                    if (!(k in payloadMeta)) foreignMeta[k] = existingMeta[k];
                }
                finalPayload.metadata = { ...foreignMeta, ...payloadMeta };

                // Always preserve original creation timestamp
                if ((existingMeta.timestamps as Record<string, unknown>)?.created) {
                    (finalPayload.metadata as Record<string, unknown>).timestamps = {
                        ...((finalPayload.metadata as Record<string, unknown>).timestamps || {}),
                        created: (existingMeta.timestamps as Record<string, unknown>).created,
                    };
                }
            }
            if (normalizedPayload.content && existingData.content && typeof existingData.content === 'object') {
                const payloadContent = normalizedPayload.content as Record<string, unknown>;
                const existingContent = existingData.content as Record<string, unknown>;
                const foreignContent: Record<string, unknown> = {};
                for (const k of Object.keys(existingContent)) {
                    if (!(k in payloadContent)) foreignContent[k] = existingContent[k];
                }
                finalPayload.content = { ...foreignContent, ...payloadContent };
            }
        }
    } catch (e) {
        // File doesn't exist or isn't valid JSON — write payload as-is (CR-4: log it)
        ioLogger.debug(`writeJsonFile: could not read/parse ${targetUri.fsPath}, writing fresh: ${e}`);
    }

    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(JSON.stringify(finalPayload, null, 2), 'utf-8'));
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
    await vscode.workspace.fs.writeFile(mdUri, Buffer.from(markdownContent, 'utf-8'));
    return mdUri;
}
