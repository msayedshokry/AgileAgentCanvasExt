// ─── Developer-hub commands ──────────────────────────────────────────────────
// Project context, engineering metrics, release notes, GitHub Issues sync,
// and the editor CodeLens that links a file to the stories whose agent
// commits changed it.

import * as path from 'path';
import * as vscode from 'vscode';
import type { ArtifactStore } from '../state/artifact-store';
import type { ArtifactChanges } from '../types';
import { ensureProjectContext } from '../workflow/harness/project-context';
import { readRunHistory } from '../workflow/harness/run-history';
import { computeMetrics, renderMetricsMarkdown, renderReleaseNotes, storiesFromCommitSubjects, type DoneStory } from '../workflow/harness/dev-insights';
import { parseIssues, planIssueSync, type LinkedStory, type SyncAction } from '../workflow/harness/github-issues';
import { execTool } from '../workflow/harness/git-cli';
import { getOutputFolder } from '../workflow/kanban-verdict';
import { costTracker } from '../chat/cost-tracker';
import { createLogger } from '../utils/logger';
import { errMsg } from '../utils/error';

const logger = createLogger('dev-hub-commands');
const ISSUE_SYNC_STATE = 'agileagentcanvas.issueSyncStatuses';
const ISSUES_EPIC_TITLE = 'GitHub Issues';

interface StoryLike { id: string; title?: string; status?: string; description?: string; userStory?: unknown; metadata?: Record<string, unknown> }
interface EpicLike { id: string; title?: string; stories?: StoryLike[] }

const root = (): string | undefined => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

async function openMarkdown(content: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content });
  await vscode.window.showTextDocument(doc, { preview: false });
}

function epicsOf(store: ArtifactStore): EpicLike[] {
  const state = store.getState() as { epics?: EpicLike[] };
  return Array.isArray(state.epics) ? state.epics : [];
}

// ── Project context ──────────────────────────────────────────────────────────

async function refreshProjectContext(): Promise<void> {
  const r = root();
  if (!r) return;
  const file = ensureProjectContext(r, getOutputFolder(), true);
  await vscode.window.showTextDocument(vscode.Uri.file(file));
  void vscode.window.showInformationMessage('Project context regenerated. Edit it freely: agents read it before every run.');
}

// ── Metrics + release notes ─────────────────────────────────────────────────

async function showMetrics(): Promise<void> {
  const history = readRunHistory(getOutputFolder(), 500);
  if (history.length === 0) {
    void vscode.window.showInformationMessage('No agent runs recorded yet in this workspace.');
    return;
  }
  const metrics = computeMetrics(history);
  const costs = new Map(metrics.stories.map((s) => [s.artifactId, costTracker.costForArtifact(s.artifactId)] as const).filter(([, c]) => c > 0));
  await openMarkdown(renderMetricsMarkdown(metrics, costs));
}

async function generateReleaseNotes(store: ArtifactStore): Promise<void> {
  const DAY = 24 * 3600 * 1000;
  const pick = await vscode.window.showQuickPick(
    [{ label: 'Last 7 days', ms: 7 * DAY }, { label: 'Last 30 days', ms: 30 * DAY }, { label: 'All completed stories', ms: 0 }],
    { title: 'Release notes for…' },
  );
  if (!pick) return;
  const since = pick.ms ? Date.now() - pick.ms : 0;
  const approvedAt = new Map<string, number>();
  for (const e of readRunHistory(getOutputFolder(), 500)) {
    if (e.verdict === 'APPROVED' && !approvedAt.has(e.artifactId)) approvedAt.set(e.artifactId, e.finishedAt);
  }
  const done: DoneStory[] = [];
  for (const epic of epicsOf(store)) {
    for (const s of epic.stories ?? []) {
      if (!['done', 'complete', 'completed'].includes(String(s.status))) continue;
      const doneAt = approvedAt.get(s.id);
      if (since && (!doneAt || doneAt < since)) continue;
      done.push({ id: s.id, title: s.title ?? s.id, epicTitle: epic.title, description: typeof s.description === 'string' ? s.description : undefined, doneAt });
    }
  }
  await openMarkdown(renderReleaseNotes(done, `Release notes — ${pick.label.toLowerCase()}`));
}

// ── GitHub Issues sync ───────────────────────────────────────────────────────

function describeAction(a: SyncAction): string {
  switch (a.kind) {
    case 'import': return `Import #${a.issue.number} "${a.issue.title}" as a story`;
    case 'close-issue': return `Close #${a.issueNumber} (story ${a.storyId} is done)`;
    case 'reopen-issue': return `Reopen #${a.issueNumber} (story ${a.storyId} was moved back)`;
    case 'mark-story-done': return `Mark ${a.storyId} done (#${a.issueNumber} was closed on GitHub)`;
  }
}

async function syncGitHubIssues(context: vscode.ExtensionContext, store: ArtifactStore): Promise<void> {
  const cwd = root();
  if (!cwd) return;
  if ((await execTool('gh', ['--version'])).code !== 0) {
    void vscode.window.showWarningMessage('GitHub Issues sync uses the GitHub CLI (gh). Install it and run `gh auth login`.');
    return;
  }
  const list = await execTool('gh', ['issue', 'list', '--state', 'all', '--limit', '200', '--json', 'number,title,body,state,url,labels'], cwd);
  if (list.code !== 0) {
    void vscode.window.showErrorMessage(`gh issue list failed: ${(list.stderr || list.stdout).trim().slice(0, 300)}`);
    return;
  }
  const issues = parseIssues(list.stdout);
  const stories: LinkedStory[] = epicsOf(store).flatMap((e) => (e.stories ?? []).map((s) => ({
    id: s.id,
    status: String(s.status ?? ''),
    issueNumber: typeof s.metadata?.githubIssue === 'number' ? s.metadata.githubIssue : undefined,
  })));
  const last = new Map(Object.entries(context.workspaceState.get<Record<string, string>>(ISSUE_SYNC_STATE, {})));
  const actions = planIssueSync(issues, stories, last);
  if (actions.length === 0) {
    void vscode.window.showInformationMessage('Board and GitHub Issues are already in sync.');
  } else {
    const preview = actions.slice(0, 12).map((a) => `• ${describeAction(a)}`).join('\n') + (actions.length > 12 ? `\n…and ${actions.length - 12} more` : '');
    const ok = await vscode.window.showWarningMessage(
      `Apply ${actions.length} change(s) between the board and GitHub Issues?`,
      { modal: true, detail: preview }, 'Apply');
    if (ok !== 'Apply') return;
    await applyIssueActions(actions, store, cwd);
  }
  // Remember current statuses for next time (detects "moved back from done").
  const snapshot: Record<string, string> = {};
  for (const e of epicsOf(store)) for (const s of e.stories ?? []) snapshot[s.id] = String(s.status ?? '');
  await context.workspaceState.update(ISSUE_SYNC_STATE, snapshot);
}

async function applyIssueActions(actions: SyncAction[], store: ArtifactStore, cwd: string): Promise<void> {
  let failed = 0;
  let epicId = epicsOf(store).find((e) => e.title === ISSUES_EPIC_TITLE)?.id;
  for (const a of actions) {
    try {
      if (a.kind === 'import') {
        if (!epicId) {
          const epic = store.createEpic();
          await store.updateArtifact('epic', epic.id, { title: ISSUES_EPIC_TITLE, goal: 'Work imported from GitHub Issues' } as ArtifactChanges);
          epicId = epic.id;
        }
        const story = store.createStory(epicId);
        await store.updateArtifact('story', story.id, {
          title: a.issue.title,
          notes: `${a.issue.body}\n\nGitHub: ${a.issue.url}`.trim(),
          status: 'ready-for-dev',
          metadata: { githubIssue: a.issue.number, githubUrl: a.issue.url },
        } as ArtifactChanges);
      } else if (a.kind === 'close-issue') {
        const r = await execTool('gh', ['issue', 'close', String(a.issueNumber), '--comment', `Completed on the Agile Agent Canvas board (${a.storyId}).`], cwd);
        if (r.code !== 0) throw new Error(r.stderr);
      } else if (a.kind === 'reopen-issue') {
        const r = await execTool('gh', ['issue', 'reopen', String(a.issueNumber)], cwd);
        if (r.code !== 0) throw new Error(r.stderr);
      } else {
        await store.updateArtifact('story', a.storyId, { status: 'done' } as ArtifactChanges);
      }
    } catch (err) {
      failed++;
      logger.warn(`Issue sync step failed (${describeAction(a)}): ${errMsg(err)}`);
    }
  }
  void vscode.window.showInformationMessage(
    failed ? `Issue sync finished with ${failed} failed step(s); see the output log.` : `Issue sync applied ${actions.length} change(s).`);
}

// ── Story CodeLens ───────────────────────────────────────────────────────────

class StoryCodeLensProvider implements vscode.CodeLensProvider {
  private cache = new Map<string, { at: number; stories: string[] }>();
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  refresh(): void {
    this.cache.clear();
    this.changed.fire();
  }

  async provideCodeLenses(doc: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const cwd = root();
    if (!cwd || doc.uri.scheme !== 'file' || !doc.uri.fsPath.startsWith(cwd)) return [];
    if (!vscode.workspace.getConfiguration('agileagentcanvas').get<boolean>('agents.storyCodeLens', true)) return [];
    const key = doc.uri.fsPath;
    let entry = this.cache.get(key);
    if (!entry || Date.now() - entry.at > 60_000) {
      const r = await execTool('git', ['log', '-n', '50', '--format=%s', '--', path.relative(cwd, key)], cwd, 10_000);
      entry = { at: Date.now(), stories: r.code === 0 ? storiesFromCommitSubjects(r.stdout.split('\n')) : [] };
      this.cache.set(key, entry);
    }
    if (entry.stories.length === 0) return [];
    const range = new vscode.Range(0, 0, 0, 0);
    return entry.stories.slice(0, 3).map((id) => new vscode.CodeLens(range, {
      title: `$(project) Changed by agent for ${id}`,
      tooltip: 'Open this story on the Agentic Kanban',
      command: 'agileagentcanvas.openStoryOnBoard',
      arguments: [id],
    }));
  }
}

export function registerDevHubCommands(
  context: vscode.ExtensionContext,
  store: ArtifactStore,
  focusCard: (artifactId: string) => void,
): void {
  const lens = new StoryCodeLensProvider();
  context.subscriptions.push(
    vscode.commands.registerCommand('agileagentcanvas.refreshProjectContext', () => refreshProjectContext()),
    vscode.commands.registerCommand('agileagentcanvas.showEngineeringMetrics', () => showMetrics()),
    vscode.commands.registerCommand('agileagentcanvas.generateReleaseNotes', () => generateReleaseNotes(store)),
    vscode.commands.registerCommand('agileagentcanvas.syncGitHubIssues', () => syncGitHubIssues(context, store)),
    vscode.commands.registerCommand('agileagentcanvas.openStoryOnBoard', async (id: string) => {
      await vscode.commands.executeCommand('agileagentcanvas.agenticKanban.focus');
      focusCard(id);
    }),
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, lens),
    vscode.workspace.onDidSaveTextDocument(() => lens.refresh()),
  );
}
