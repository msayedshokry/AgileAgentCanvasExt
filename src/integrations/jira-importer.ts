import * as vscode from 'vscode';
import { JiraClient, JiraConfig, JiraEpic, JiraStory } from './jira-client';
import { Epic, Story, BmadArtifacts, AcceptanceCriterion } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('jira-importer');

// ─── Config reader ────────────────────────────────────────────────────────────

/**
 * Read Jira connection settings from VS Code workspace configuration.
 * Returns null if the required fields (baseUrl, email, apiToken) are not set.
 */
export function getJiraConfig(): JiraConfig | null {
    const cfg = vscode.workspace.getConfiguration('agileagentcanvas.jira');
    const baseUrl = cfg.get<string>('baseUrl', '').trim().replace(/\/$/, '');
    const email = cfg.get<string>('email', '').trim();
    const apiToken = cfg.get<string>('apiToken', '').trim();
    const projectKey = cfg.get<string>('projectKey', '').trim() || undefined;

    if (!baseUrl || !email || !apiToken) {
        return null;
    }

    return { baseUrl, email, apiToken, projectKey };
}

/**
 * Returns true if all required Jira settings are configured.
 */
export function isJiraConfigured(): boolean {
    return getJiraConfig() !== null;
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
const JIRA_ID_PREFIX = 'JIRA:';

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

/**
 * Create a JiraClient from VS Code settings.
 * Returns null and optionally shows an error message if not configured.
 */
export function createJiraClientFromSettings(showError = true): JiraClient | null {
    const config = getJiraConfig();
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
