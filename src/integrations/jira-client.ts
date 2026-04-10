import * as https from 'https';
import * as http from 'http';
import { createLogger } from '../utils/logger';

const logger = createLogger('jira-client');

// ─── Configuration ───────────────────────────────────────────────────────────

export interface JiraConfig {
    /** e.g. https://mycompany.atlassian.net  (no trailing slash) */
    baseUrl: string;
    /** Atlassian account email */
    email: string;
    /** Atlassian API token */
    apiToken: string;
    /** Default project key, e.g. "PROJ" */
    projectKey?: string;
}

// ─── Jira wire types (REST API v3 response shapes) ───────────────────────────

interface JiraAdfNode {
    type: string;
    text?: string;
    content?: JiraAdfNode[];
    attrs?: Record<string, any>;
}

interface JiraIssueFields {
    summary: string;
    description?: JiraAdfNode | null;
    status: { name: string };
    priority?: { name: string } | null;
    assignee?: { displayName: string; emailAddress?: string } | null;
    issuetype: { name: string };
    parent?: { key: string; fields?: { summary?: string; issuetype?: { name: string } } } | null;
    labels?: string[];
    created: string;
    updated: string;
    // Story points — Jira stores these in a custom field; common field names:
    story_points?: number;
    customfield_10016?: number;   // most common story points field in Jira Cloud
    customfield_10028?: number;   // some boards use this
    [key: string]: any;
}

interface JiraIssueRaw {
    id: string;
    key: string;
    fields: JiraIssueFields;
}

/** Response shape for the new /rest/api/3/search/jql endpoint (cursor-based pagination) */
interface JiraSearchResponse {
    issues: JiraIssueRaw[];
    /** Cursor token for the next page. Absent/null when this is the last page. */
    nextPageToken?: string | null;
    /** True when there are no more pages. */
    isLast?: boolean;
}

// ─── Normalized output types ─────────────────────────────────────────────────

export interface JiraStory {
    key: string;
    summary: string;
    status: string;
    assignee?: string;
    description?: string;
    storyPoints?: number;
    epicKey?: string;
    priority?: string;
    labels?: string[];
}

export interface JiraEpic {
    key: string;
    summary: string;
    status: string;
    assignee?: string;
    description?: string;
    priority?: string;
    stories: JiraStory[];
}

// ─── Error type ──────────────────────────────────────────────────────────────

export class JiraClientError extends Error {
    constructor(
        message: string,
        public readonly statusCode?: number
    ) {
        super(message);
        this.name = 'JiraClientError';
    }
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class JiraClient {
    private readonly config: JiraConfig;

    constructor(config: JiraConfig) {
        this.config = config;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private authHeader(): string {
        const credentials = `${this.config.email}:${this.config.apiToken}`;
        return 'Basic ' + Buffer.from(credentials).toString('base64');
    }

    /**
     * Make a GET request to the Jira REST API v3.
     * `apiPath` should start with `/rest/api/3/...`
     * `params` are URL query parameters.
     */
    private request<T>(apiPath: string, params: Record<string, string | number> = {}): Promise<T> {
        return new Promise((resolve, reject) => {
            const url = new URL(this.config.baseUrl + apiPath);
            for (const [k, v] of Object.entries(params)) {
                url.searchParams.set(k, String(v));
            }

            const isHttps = url.protocol === 'https:';
            const options: https.RequestOptions = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'GET',
                headers: {
                    'Authorization': this.authHeader(),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            };

            const transport = isHttps ? https : http;
            const req = transport.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    const statusCode = res.statusCode ?? 0;
                    logger.debug(`[JiraClient] ${options.method} ${url.pathname} → ${statusCode}`);

                    if (statusCode === 401) {
                        reject(new JiraClientError(
                            'Jira authentication failed. Your API token may be invalid or expired (tokens expire after 1 year). ' +
                            'Generate a new one at https://id.atlassian.com/manage-profile/security/api-tokens',
                            401
                        ));
                        return;
                    }
                    if (statusCode === 403) {
                        reject(new JiraClientError(
                            'Access denied. Your Jira account does not have permission to view this resource. ' +
                            'Check that your email and project key are correct.',
                            403
                        ));
                        return;
                    }
                    if (statusCode === 404) {
                        reject(new JiraClientError(
                            `Resource not found (404). Check that your Jira Base URL and project key are correct. Path: ${url.pathname}`,
                            404
                        ));
                        return;
                    }
                    if (statusCode === 429) {
                        reject(new JiraClientError(
                            'Jira API rate limit reached (429). Please wait a moment and try again.',
                            429
                        ));
                        return;
                    }
                    if (statusCode === 410) {
                        reject(new JiraClientError(
                            'Jira API endpoint removed (410). The old /search endpoint was deprecated. ' +
                            'Please update the extension to the latest version.',
                            410
                        ));
                        return;
                    }
                    if (statusCode < 200 || statusCode >= 300) {
                        reject(new JiraClientError(
                            `Jira API returned HTTP ${statusCode}. Response: ${body.slice(0, 200)}`,
                            statusCode
                        ));
                        return;
                    }

                    try {
                        resolve(JSON.parse(body) as T);
                    } catch {
                        reject(new JiraClientError(`Failed to parse Jira API response as JSON: ${body.slice(0, 200)}`));
                    }
                });
            });

            req.on('error', (err) => {
                reject(new JiraClientError(
                    `Network error connecting to Jira (${this.config.baseUrl}): ${err.message}. ` +
                    'Check that your Base URL is correct and you have internet access.'
                ));
            });

            req.setTimeout(15000, () => {
                req.destroy();
                reject(new JiraClientError('Request to Jira timed out after 15 seconds.'));
            });

            req.end();
        });
    }

    /**
     * Paginate through all results of a JQL search using the new
     * /rest/api/3/search/jql endpoint (cursor-based pagination).
     *
     * The old /rest/api/3/search endpoint was removed (HTTP 410) in 2025.
     * The new endpoint uses nextPageToken / isLast instead of startAt / total.
     */
    private async searchAll(jql: string, fields: string): Promise<JiraIssueRaw[]> {
        const PAGE_SIZE = 100;
        const all: JiraIssueRaw[] = [];
        let nextPageToken: string | null = null;

        while (true) {
            const params: Record<string, string | number> = {
                jql,
                fields,
                maxResults: PAGE_SIZE
            };
            if (nextPageToken) {
                params['nextPageToken'] = nextPageToken;
            }

            const page = await this.request<JiraSearchResponse>('/rest/api/3/search/jql', params);

            all.push(...page.issues);

            // Stop when explicitly told this is the last page, or no token for next page,
            // or we got an empty page (safety guard)
            if (page.isLast || !page.nextPageToken || page.issues.length === 0) {
                break;
            }
            nextPageToken = page.nextPageToken;
        }

        logger.debug(`[JiraClient] searchAll returned ${all.length} issues for JQL: ${jql}`);
        return all;
    }

    // ── ADF (Atlassian Document Format) → plain text ──────────────────────────

    /**
     * Recursively extract plain text from an Atlassian Document Format node.
     * ADF is the rich-text JSON format Jira Cloud uses for descriptions.
     */
    private extractPlainText(node: JiraAdfNode | null | undefined): string {
        if (!node) { return ''; }
        if (node.type === 'text' && node.text) { return node.text; }
        if (!node.content) { return ''; }
        return node.content.map(child => this.extractPlainText(child)).join('');
    }

    // ── Story points helper ───────────────────────────────────────────────────

    private getStoryPoints(fields: JiraIssueFields): number | undefined {
        // Try the most common story points custom fields in order
        const val = fields.customfield_10016 ?? fields.customfield_10028 ?? fields.story_points;
        if (val !== null && val !== undefined && typeof val === 'number') {
            return val;
        }
        return undefined;
    }

    // ── Normalizers ───────────────────────────────────────────────────────────

    private normalizeEpic(raw: JiraIssueRaw): JiraEpic {
        const f = raw.fields;
        return {
            key: raw.key,
            summary: f.summary,
            status: f.status?.name ?? 'Unknown',
            assignee: f.assignee?.displayName,
            description: this.extractPlainText(f.description) || undefined,
            priority: f.priority?.name,
            stories: []
        };
    }

    private normalizeStory(raw: JiraIssueRaw): JiraStory {
        const f = raw.fields;
        return {
            key: raw.key,
            summary: f.summary,
            status: f.status?.name ?? 'Unknown',
            assignee: f.assignee?.displayName,
            description: this.extractPlainText(f.description) || undefined,
            storyPoints: this.getStoryPoints(f),
            epicKey: f.parent?.key,
            priority: f.priority?.name,
            labels: f.labels?.length ? f.labels : undefined
        };
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Test the connection and credentials.
     * Returns the authenticated user's display name and email on success.
     */
    async testConnection(): Promise<{ displayName: string; email: string }> {
        const me = await this.request<{ displayName: string; emailAddress: string }>('/rest/api/3/myself');
        logger.debug(`[JiraClient] testConnection OK — ${me.displayName}`);
        return { displayName: me.displayName, email: me.emailAddress };
    }

    /**
     * Fetch all epics for a Jira project (without stories).
     */
    async fetchEpics(projectKey: string): Promise<JiraEpic[]> {
        const jql = `project = "${projectKey}" AND issuetype = Epic ORDER BY created DESC`;
        const fields = 'summary,status,assignee,priority,description,labels,created,updated';
        const raws = await this.searchAll(jql, fields);
        return raws.map(r => this.normalizeEpic(r));
    }

    /**
     * Fetch all stories belonging to a specific epic.
     * Tries the modern `parent` field first (next-gen / company-managed with hierarchy),
     * then falls back to classic `"Epic Link"` for older board configurations.
     */
    async fetchStoriesForEpic(epicKey: string, projectKey: string): Promise<JiraStory[]> {
        const fields = 'summary,status,assignee,priority,description,labels,parent,customfield_10016,customfield_10028,created,updated';

        // Modern: parent = EPIC-KEY
        const modernJql = `project = "${projectKey}" AND issuetype = Story AND parent = "${epicKey}" ORDER BY created ASC`;
        try {
            const raws = await this.searchAll(modernJql, fields);
            if (raws.length > 0) {
                logger.debug(`[JiraClient] fetchStoriesForEpic (modern) found ${raws.length} for ${epicKey}`);
                return raws.map(r => this.normalizeStory(r));
            }
        } catch (err) {
            logger.debug(`[JiraClient] fetchStoriesForEpic modern query failed, trying classic: ${err}`);
        }

        // Classic fallback: "Epic Link" = EPIC-KEY
        const classicJql = `project = "${projectKey}" AND issuetype = Story AND "Epic Link" = "${epicKey}" ORDER BY created ASC`;
        const raws = await this.searchAll(classicJql, fields);
        logger.debug(`[JiraClient] fetchStoriesForEpic (classic) found ${raws.length} for ${epicKey}`);
        return raws.map(r => this.normalizeStory(r));
    }

    /**
     * Fetch all stories in a project (all epics combined).
     */
    async fetchAllStoriesInProject(projectKey: string): Promise<JiraStory[]> {
        const jql = `project = "${projectKey}" AND issuetype = Story ORDER BY created ASC`;
        const fields = 'summary,status,assignee,priority,description,labels,parent,customfield_10016,customfield_10028,created,updated';
        const raws = await this.searchAll(jql, fields);
        return raws.map(r => this.normalizeStory(r));
    }

    /**
     * Fetch all epics for a project, then attach their child stories.
     * This is the primary method for a full import.
     */
    async fetchEpicsWithStories(projectKey: string): Promise<JiraEpic[]> {
        logger.debug(`[JiraClient] fetchEpicsWithStories for project ${projectKey}`);

        const [epics, allStories] = await Promise.all([
            this.fetchEpics(projectKey),
            this.fetchAllStoriesInProject(projectKey)
        ]);

        // Build a map for O(1) lookup
        const epicMap = new Map<string, JiraEpic>(epics.map(e => [e.key, e]));

        for (const story of allStories) {
            if (story.epicKey && epicMap.has(story.epicKey)) {
                epicMap.get(story.epicKey)!.stories.push(story);
            }
        }

        // Stories without an epic link are attached to a synthetic "Unlinked" epic
        const unlinked = allStories.filter(s => !s.epicKey || !epicMap.has(s.epicKey));
        if (unlinked.length > 0) {
            const unlinkedEpic: JiraEpic = {
                key: '(unlinked)',
                summary: 'Stories without an epic',
                status: 'n/a',
                stories: unlinked
            };
            epics.push(unlinkedEpic);
        }

        logger.debug(`[JiraClient] fetchEpicsWithStories: ${epics.length} epics, ${allStories.length} stories`);
        return epics;
    }

    /**
     * Return the config with the API token masked, safe for display.
     */
    getMaskedConfig(): Omit<JiraConfig, 'apiToken'> & { apiToken: string } {
        return {
            ...this.config,
            apiToken: this.config.apiToken ? '••••••••••••••••' : '(not set)'
        };
    }
}
