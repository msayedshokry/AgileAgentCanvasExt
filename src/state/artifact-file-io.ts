import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';

const ioLogger = createLogger('artifact-file-io');

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
                if ((existingMeta.timestamps as any)?.created) {
                    (finalPayload.metadata as any).timestamps = {
                        ...((finalPayload.metadata as any).timestamps || {}),
                        created: (existingMeta.timestamps as any).created,
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
        (result as any).content = normalizeContent((result as any).content);
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
        (result as any).acceptanceCriteria = result.acceptanceCriteria.map((ac: any) => normalizeAc(ac));
    }

    // Normalize tasks (story schema)
    if (Array.isArray(result.tasks)) {
        (result as any).tasks = result.tasks.map((task: any) => normalizeTask(task));
    }

    // Normalize inline stories (epics schema — epics[].stories[] or top-level stories[])
    if (Array.isArray(result.stories)) {
        (result as any).stories = result.stories.map((s: any) => normalizeInlineStory(s));
    }
    if (Array.isArray(result.epics)) {
        (result as any).epics = result.epics.map((epic: any) => {
            if (Array.isArray(epic.stories)) {
                return { ...epic, stories: epic.stories.map((s: any) => normalizeInlineStory(s)) };
            }
            return epic;
        });
    }

    return result;
}

function normalizeAc(ac: any): any {
    if (!ac || typeof ac !== 'object') {
        return ac;
    }

    // If only boolean exists (orphaned), infer status
    if ('verified' in ac && !('status' in ac)) {
        return { ...ac, status: ac.verified ? 'verified' : 'draft', verified: undefined };
    }

    // Both fields present — drop verified, preserve status
    if ('verified' in ac) {
        const { verified: _v, ...rest } = ac;
        return rest;
    }

    return ac;
}

function normalizeTask(task: any): any {
    if (!task || typeof task !== 'object') {
        return task;
    }

    // If only completed exists (orphaned), infer status
    if ('completed' in task && !('status' in task)) {
        return { ...task, status: task.completed ? 'implemented' : 'pending', completed: undefined };
    }

    // Both fields present — drop completed, preserve status
    if ('completed' in task) {
        const { completed: _c, ...rest } = task;
        return rest;
    }

    // Normalize subtasks recursively
    if (Array.isArray(task.subtasks)) {
        return { ...task, subtasks: task.subtasks.map((st: any) => normalizeSubtask(st)) };
    }

    return task;
}

function normalizeSubtask(subtask: any): any {
    if (!subtask || typeof subtask !== 'object') {
        return subtask;
    }

    // Subtasks have no status field in the schema, so we add one
    // based on the completed boolean for consistency
    if ('completed' in subtask) {
        const { completed, ...rest } = subtask;
        return { ...rest, status: completed ? 'done' : 'pending', completed: undefined };
    }

    return subtask;
}

/**
 * Normalize an inline story object (found within epics.json content.epics[].stories[]
 * or content.stories[]). These have a dual-field completed+status pattern.
 */
function normalizeInlineStory(story: any): any {
    if (!story || typeof story !== 'object') {
        return story;
    }

    // Both fields present — drop completed, preserve status
    if ('completed' in story && 'status' in story) {
        const { completed: _c, ...rest } = story;
        return rest;
    }

    // Orphaned completed (no status) — infer status then drop completed
    if ('completed' in story) {
        const { completed, ...rest } = story;
        return { ...rest, status: completed ? 'done' : 'draft', completed: undefined };
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
