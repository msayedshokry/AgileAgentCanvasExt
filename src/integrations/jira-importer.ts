import * as vscode from 'vscode';
import { JiraClient, JiraConfig, JiraEpic, JiraStory } from './jira-client';
import { JiraSecrets } from './jira-secrets';
import { Epic, Story, BmadArtifacts, AcceptanceCriterion } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('jira-importer');

// ─── Config reader ────────────────────────────────────────────────────────────

/**
 * Read Jira connection settings.
 *
 * - baseUrl, email, projectKey  → VS Code workspace settings (non-sensitive)
 * - apiToken                    → OS keychain via SecretStorage (never plain-text)
 *
 * One-time migration: if no token is found in secrets but the legacy
 * `agileagentcanvas.jira.apiToken` setting is populated, the value is
 * silently migrated to secrets and cleared from settings.
 *
 * Returns null if any required field (baseUrl, email, apiToken) is missing.
 */
export async function getJiraConfig(): Promise<JiraConfig | null> {
    const cfg = vscode.workspace.getConfiguration('agileagentcanvas.jira');
    const baseUrl = cfg.get<string>('baseUrl', '').trim().replace(/\/$/, '');
    const email = cfg.get<string>('email', '').trim();
    const projectKey = cfg.get<string>('projectKey', '').trim() || undefined;

    if (!baseUrl || !email) {
        return null;
    }

    // Prefer secret storage; fall back to legacy plain-text setting for migration
    let apiToken = await JiraSecrets.getToken();

    if (!apiToken) {
        const legacyToken = cfg.get<string>('apiToken', '').trim();
        if (legacyToken) {
            // Migrate: store in keychain and clear from settings
            await JiraSecrets.setToken(legacyToken);
            await cfg.update('apiToken', undefined, vscode.ConfigurationTarget.Global);
            await cfg.update('apiToken', undefined, vscode.ConfigurationTarget.Workspace);
            apiToken = legacyToken;
            logger.debug('[jira-importer] Migrated API token from settings to SecretStorage');
        }
    }

    if (!apiToken) {
        return null;
    }

    return { baseUrl, email, apiToken, projectKey };
}

/**
 * Returns true if all required Jira settings are configured.
 * Async because it reads the token from SecretStorage.
 */
export async function isJiraConfigured(): Promise<boolean> {
    return (await getJiraConfig()) !== null;
}

// ─── Status mapping ───────────────────────────────────────────────────────────

/**
 * Map a Jira issue status name to a BMAD artifact status.
 */
function mapStatus(jiraStatus: string): Epic['status'] {
    const s = jiraStatus.toLowerCase();
    if (s === 'done' || s === 'closed' || s === 'resolved') { return 'done'; }
    if (s.includes('progress') || s.includes('active') || s.includes('started')) { return 'in-progress'; }
    if (s.includes('review') || s.includes('testing') || s.includes('qa')) { return 'in-review'; }
    if (s.includes('blocked') || s.includes('impediment')) { return 'blocked'; }
    if (s.includes('ready')) { return 'ready'; }
    if (s.includes('backlog') || s.includes('open') || s.includes('new') || s.includes('todo')) { return 'backlog'; }
    return 'draft';
}

// ─── Story summary → user story heuristic ────────────────────────────────────

/**
 * Attempt to parse "As a X, I want Y, so that Z" from a Jira story summary.
 * If the summary doesn't match the pattern, use sensible fallbacks.
 */
function parseUserStory(summary: string): Story['userStory'] {
    // Normalise common separators
    const normalised = summary
        .replace(/,?\s+i\s+want\s+/i, '~~IWANT~~')
        .replace(/,?\s+so\s+that\s+/i, '~~SOTHAT~~')
        .replace(/^as\s+(a|an)\s+/i, '');

    const parts = normalised.split('~~IWANT~~');
    if (parts.length === 2) {
        const [asA, rest] = parts;
        const [iWant, soThat] = rest.split('~~SOTHAT~~');
        if (asA && iWant) {
            return {
                asA: asA.trim(),
                iWant: iWant.trim(),
                soThat: (soThat ?? '').trim() || 'achieve the described functionality'
            };
        }
    }

    // Fallback: use the summary as iWant
    return {
        asA: 'user',
        iWant: summary.trim(),
        soThat: 'achieve the described functionality'
    };
}

// ─── Jira → BMAD mappers ─────────────────────────────────────────────────────

/** Prefix used to identify artifacts that were originally imported from Jira */
export const JIRA_ID_PREFIX = 'JIRA:';

export function jiraStoryToBmad(js: JiraStory, epicIndex: number, storyIndex: number): Story {
    const id = `${JIRA_ID_PREFIX}${js.key}`;
    return {
        id,
        title: js.summary,
        userStory: parseUserStory(js.summary),
        acceptanceCriteria: [] as AcceptanceCriterion[],
        status: mapStatus(js.status),
        storyPoints: js.storyPoints,
        priority: undefined,
        technicalNotes: js.description,
        assignee: js.assignee,
        labels: js.labels
    };
}

export function jiraEpicToBmad(je: JiraEpic, index: number): Epic {
    const id = `${JIRA_ID_PREFIX}${je.key}`;
    const stories: Story[] = je.stories.map((s, si) => jiraStoryToBmad(s, index, si));

    return {
        id,
        title: je.summary,
        goal: je.description ?? je.summary,
        functionalRequirements: [],
        status: mapStatus(je.status),
        stories,
        storyCount: stories.length
    };
}

// ─── Merge logic ──────────────────────────────────────────────────────────────

/**
 * Merge Jira epics (and their stories) into an existing BmadArtifacts state.
 *
 * Strategy:
 * - Artifacts with a `JIRA:KEY` id that already exist are UPDATED (title, goal, status, stories).
 * - New Jira epics are APPENDED.
 * - Local-only artifacts (no JIRA: prefix) are NEVER removed or modified.
 *
 * Returns the merged state and a summary of changes.
 */
export function mergeJiraIntoArtifacts(
    existing: BmadArtifacts,
    jiraEpics: JiraEpic[]
): { merged: BmadArtifacts; added: number; updated: number } {
    const currentEpics: Epic[] = [...(existing.epics ?? [])];

    // Build lookup map for existing Jira-sourced epics
    const jiraEpicIndex = new Map<string, number>();
    currentEpics.forEach((e, i) => {
        if (e.id.startsWith(JIRA_ID_PREFIX)) {
            jiraEpicIndex.set(e.id, i);
        }
    });

    let added = 0;
    let updated = 0;

    jiraEpics.forEach((je, idx) => {
        const bmadEpic = jiraEpicToBmad(je, idx);
        const existingIdx = jiraEpicIndex.get(bmadEpic.id);

        if (existingIdx !== undefined) {
            // Update — preserve any local-only fields
            currentEpics[existingIdx] = {
                ...currentEpics[existingIdx],
                title: bmadEpic.title,
                goal: bmadEpic.goal,
                status: bmadEpic.status,
                stories: bmadEpic.stories,
                storyCount: bmadEpic.storyCount
            };
            updated++;
        } else {
            currentEpics.push(bmadEpic);
            added++;
        }
    });

    logger.debug(`[jira-importer] merge: ${added} added, ${updated} updated`);
    return {
        merged: { ...existing, epics: currentEpics },
        added,
        updated
    };
}

/**
 * Merge a single Jira epic (with its stories already attached) into the canvas.
 * Same deduplication logic as mergeJiraIntoArtifacts but for one epic.
 */
export function mergeJiraEpicIntoArtifacts(
    existing: BmadArtifacts,
    jiraEpic: JiraEpic
): { merged: BmadArtifacts; action: 'added' | 'updated' } {
    const currentEpics: Epic[] = [...(existing.epics ?? [])];
    const bmadEpic = jiraEpicToBmad(jiraEpic, currentEpics.length);
    const existingIdx = currentEpics.findIndex(e => e.id === bmadEpic.id);

    if (existingIdx >= 0) {
        currentEpics[existingIdx] = {
            ...currentEpics[existingIdx],
            title: bmadEpic.title,
            goal: bmadEpic.goal,
            status: bmadEpic.status,
            stories: bmadEpic.stories,
            storyCount: bmadEpic.storyCount
        };
        return { merged: { ...existing, epics: currentEpics }, action: 'updated' };
    }

    currentEpics.push(bmadEpic);
    return { merged: { ...existing, epics: currentEpics }, action: 'added' };
}

/**
 * Merge a single Jira story into the canvas.
 *
 * If `parentEpicKey` is provided and a matching JIRA-sourced epic already
 * exists in the canvas, the story is added/updated inside that epic.
 * Otherwise the story is placed inside a synthetic "Imported Stories" epic
 * (id: "JIRA:__imported__") so it always has a home on the canvas.
 */
export function mergeJiraStoryIntoArtifacts(
    existing: BmadArtifacts,
    jiraStory: JiraStory,
    parentEpicKey?: string
): { merged: BmadArtifacts; action: 'added' | 'updated'; epicTitle: string } {
    const currentEpics: Epic[] = [...(existing.epics ?? [])];
    const bmadStory = jiraStoryToBmad(jiraStory, 0, 0);

    // Try to find the parent epic in the canvas
    const parentId = parentEpicKey ? `${JIRA_ID_PREFIX}${parentEpicKey}` : undefined;
    let targetIdx = parentId
        ? currentEpics.findIndex(e => e.id === parentId)
        : -1;

    // If no parent epic found, use/create the "Imported Stories" catch-all epic
    if (targetIdx < 0) {
        const catchAllId = `${JIRA_ID_PREFIX}__imported__`;
        targetIdx = currentEpics.findIndex(e => e.id === catchAllId);
        if (targetIdx < 0) {
            currentEpics.push({
                id: catchAllId,
                title: 'Imported Stories (Jira)',
                goal: 'Stories imported individually from Jira without a parent epic on the canvas.',
                functionalRequirements: [],
                status: 'in-progress',
                stories: [],
                storyCount: 0
            } as Epic);
            targetIdx = currentEpics.length - 1;
        }
    }

    const targetEpic = { ...currentEpics[targetIdx] };
    const existingStoryIdx = (targetEpic.stories ?? []).findIndex(s => s.id === bmadStory.id);
    const stories = [...(targetEpic.stories ?? [])];
    let action: 'added' | 'updated';

    if (existingStoryIdx >= 0) {
        stories[existingStoryIdx] = { ...stories[existingStoryIdx], ...bmadStory };
        action = 'updated';
    } else {
        stories.push(bmadStory);
        action = 'added';
    }

    currentEpics[targetIdx] = { ...targetEpic, stories, storyCount: stories.length };
    return {
        merged: { ...existing, epics: currentEpics },
        action,
        epicTitle: currentEpics[targetIdx].title
    };
}

// ─── Markdown formatter ───────────────────────────────────────────────────────

/**
 * Format a list of JiraEpics as readable Markdown for display in the chat panel.
 */
export function formatEpicsAsMarkdown(epics: JiraEpic[]): string {
    if (epics.length === 0) {
        return '_No epics found for this project._';
    }

    const lines: string[] = [];
    lines.push(`## Jira Epics (${epics.length})\n`);
    lines.push('| Key | Summary | Status | Assignee | Stories |');
    lines.push('|-----|---------|--------|----------|---------|');

    for (const epic of epics) {
        const key = epic.key === '(unlinked)' ? '—' : `\`${epic.key}\``;
        const summary = epic.summary.replace(/\|/g, '\\|');
        const status = epic.status;
        const assignee = epic.assignee ?? '—';
        const storyCount = epic.stories.length;
        lines.push(`| ${key} | ${summary} | ${status} | ${assignee} | ${storyCount} |`);
    }

    // Expand stories under each epic
    for (const epic of epics) {
        if (epic.stories.length === 0) { continue; }

        lines.push('');
        const epicLabel = epic.key === '(unlinked)' ? 'Stories without an epic' : `### ${epic.key} — ${epic.summary}`;
        lines.push(epicLabel);
        lines.push('');
        lines.push('| Key | Summary | Status | Points | Assignee |');
        lines.push('|-----|---------|--------|--------|----------|');

        for (const story of epic.stories) {
            const sKey = `\`${story.key}\``;
            const sSummary = story.summary.replace(/\|/g, '\\|');
            const sStatus = story.status;
            const sPoints = story.storyPoints !== undefined ? String(story.storyPoints) : '—';
            const sAssignee = story.assignee ?? '—';
            lines.push(`| ${sKey} | ${sSummary} | ${sStatus} | ${sPoints} | ${sAssignee} |`);
        }
    }

    return lines.join('\n');
}

/**
 * Format a list of JiraStories as readable Markdown for display in the chat panel.
 */
export function formatStoriesAsMarkdown(stories: JiraStory[], epicKey?: string): string {
    if (stories.length === 0) {
        const context = epicKey ? ` for epic \`${epicKey}\`` : '';
        return `_No stories found${context}._`;
    }

    const title = epicKey
        ? `## Stories for Epic \`${epicKey}\` (${stories.length})`
        : `## Jira Stories (${stories.length})`;

    const lines: string[] = [title, ''];
    lines.push('| Key | Summary | Status | Points | Assignee |');
    lines.push('|-----|---------|--------|--------|----------|');

    for (const story of stories) {
        const key = `\`${story.key}\``;
        const summary = story.summary.replace(/\|/g, '\\|');
        const status = story.status;
        const points = story.storyPoints !== undefined ? String(story.storyPoints) : '—';
        const assignee = story.assignee ?? '—';
        lines.push(`| ${key} | ${summary} | ${status} | ${points} | ${assignee} |`);
    }

    return lines.join('\n');
}

// ─── Conflict diff types ───────────────────────────────────────────────────────

/**
 * A single field conflict between Jira and the canvas.
 * Only `title` and `description` / `goal` are diffed — all other fields
 * (status, storyPoints, assignee) always take the Jira value silently.
 */
export type ConflictField = 'title' | 'description';

export interface FieldConflict {
    field: ConflictField;
    jiraValue: string;
    canvasValue: string;
}

export interface StoryConflict {
    key: string;                // e.g. PROJ-7
    canvasId: string;           // id in canvas (JIRA:PROJ-7)
    isNew: boolean;             // true → story not yet on canvas, no conflict
    conflicts: FieldConflict[];
    /** Full Jira story — used when applying the resolved merge */
    jiraStory: JiraStory;
}

export interface EpicConflict {
    key: string;                // e.g. PROJ-3
    canvasId: string;           // id in canvas (JIRA:PROJ-3)
    isNew: boolean;
    conflicts: FieldConflict[];
    storyConflicts: StoryConflict[];
    /** Full Jira epic — used when applying the resolved merge */
    jiraEpic: JiraEpic;
}

/** Resolved choices sent back from the webview */
export interface ConflictResolution {
    /** Map of canvasId → { field → 'jira' | 'canvas' } */
    choices: Record<string, Record<ConflictField, 'jira' | 'canvas'>>;
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

function diffField(
    field: ConflictField,
    jiraVal: string | undefined,
    canvasVal: string | undefined
): FieldConflict | null {
    const jv = (jiraVal ?? '').trim();
    const cv = (canvasVal ?? '').trim();
    if (!cv || jv === cv) { return null; } // no canvas value or identical → no conflict
    return { field, jiraValue: jv, canvasValue: cv };
}

function diffStory(jiraStory: JiraStory, canvasStory: Story | undefined): StoryConflict {
    const canvasId = `${JIRA_ID_PREFIX}${jiraStory.key}`;
    if (!canvasStory) {
        return { key: jiraStory.key, canvasId, isNew: true, conflicts: [], jiraStory };
    }
    const conflicts: FieldConflict[] = [];
    const titleConflict = diffField('title', jiraStory.summary, canvasStory.title);
    if (titleConflict) { conflicts.push(titleConflict); }
    const descConflict = diffField('description', jiraStory.description, canvasStory.technicalNotes);
    if (descConflict) { conflicts.push(descConflict); }
    return { key: jiraStory.key, canvasId, isNew: false, conflicts, jiraStory };
}

/**
 * Diff a list of Jira epics against the current canvas state.
 * Returns one EpicConflict per epic (new ones have isNew=true and no conflicts).
 */
export function diffJiraEpics(jiraEpics: JiraEpic[], existing: BmadArtifacts): EpicConflict[] {
    const canvasEpicMap = new Map<string, Epic>(
        (existing.epics ?? []).map(e => [e.id, e])
    );

    return jiraEpics.map(je => {
        const canvasId = `${JIRA_ID_PREFIX}${je.key}`;
        const canvasEpic = canvasEpicMap.get(canvasId);

        if (!canvasEpic) {
            // Brand new epic — no conflicts, but diff its stories anyway
            const storyConflicts = je.stories.map(s => diffStory(s, undefined));
            return { key: je.key, canvasId, isNew: true, conflicts: [], storyConflicts, jiraEpic: je };
        }

        const conflicts: FieldConflict[] = [];
        const titleConflict = diffField('title', je.summary, canvasEpic.title);
        if (titleConflict) { conflicts.push(titleConflict); }
        const descConflict = diffField('description', je.description, canvasEpic.goal);
        if (descConflict) { conflicts.push(descConflict); }

        // Build a map of canvas stories for quick lookup
        const canvasStoryMap = new Map<string, Story>(
            (canvasEpic.stories ?? []).map(s => [s.id, s])
        );
        const storyConflicts = je.stories.map(s =>
            diffStory(s, canvasStoryMap.get(`${JIRA_ID_PREFIX}${s.key}`))
        );

        return { key: je.key, canvasId, isNew: false, conflicts, storyConflicts, jiraEpic: je };
    });
}

/**
 * Apply user conflict resolutions and return the merged BmadArtifacts.
 *
 * For each epic/story the user had choices on: use their selected value.
 * Fields not in the picker (status, storyPoints, assignee) always take Jira value.
 * New artifacts (isNew=true) are always added as-is from Jira.
 */
export function applyConflictResolutions(
    existing: BmadArtifacts,
    epicConflicts: EpicConflict[],
    resolution: ConflictResolution
): BmadArtifacts {
    const currentEpics: Epic[] = [...(existing.epics ?? [])];
    const choices = resolution.choices;

    for (const ec of epicConflicts) {
        const epicChoices = choices[ec.canvasId] ?? {};
        const bmadEpic = jiraEpicToBmad(ec.jiraEpic, currentEpics.length);

        // Apply epic-level field choices
        const title = epicChoices['title'] === 'canvas'
            ? (currentEpics.find(e => e.id === ec.canvasId)?.title ?? bmadEpic.title)
            : bmadEpic.title;
        const goal = epicChoices['description'] === 'canvas'
            ? (currentEpics.find(e => e.id === ec.canvasId)?.goal ?? bmadEpic.goal)
            : bmadEpic.goal;

        // Resolve story-level choices
        const resolvedStories: Story[] = ec.jiraEpic.stories.map((js, si) => {
            const storyId = `${JIRA_ID_PREFIX}${js.key}`;
            const storyChoices = choices[storyId] ?? {};
            const bmadStory = jiraStoryToBmad(js, 0, si);

            const canvasEpic = currentEpics.find(e => e.id === ec.canvasId);
            const canvasStory = (canvasEpic?.stories ?? []).find(s => s.id === storyId);

            return {
                ...bmadStory,
                title: storyChoices['title'] === 'canvas' && canvasStory
                    ? canvasStory.title
                    : bmadStory.title,
                technicalNotes: storyChoices['description'] === 'canvas' && canvasStory
                    ? canvasStory.technicalNotes
                    : bmadStory.technicalNotes,
            };
        });

        const existingIdx = currentEpics.findIndex(e => e.id === ec.canvasId);
        const mergedEpic: Epic = {
            ...(existingIdx >= 0 ? currentEpics[existingIdx] : {}),
            ...bmadEpic,
            title,
            goal,
            stories: resolvedStories,
            storyCount: resolvedStories.length
        };

        if (existingIdx >= 0) {
            currentEpics[existingIdx] = mergedEpic;
        } else {
            currentEpics.push(mergedEpic);
        }
    }

    return { ...existing, epics: currentEpics };
}

/**
 * Create a JiraClient from VS Code settings.
 * Returns null and optionally shows an error message if not configured.
 */
export async function createJiraClientFromSettings(showError = true): Promise<JiraClient | null> {
    const config = await getJiraConfig();
    if (!config) {
        if (showError) {
            vscode.window.showErrorMessage(
                'Jira is not configured. Please set agileagentcanvas.jira.baseUrl, email, and apiToken in VS Code Settings.',
                'Open Settings'
            ).then(choice => {
                if (choice === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'agileagentcanvas.jira');
                }
            });
        }
        return null;
    }
    return new JiraClient(config);
}
