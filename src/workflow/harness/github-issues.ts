// ─── GitHub Issues ⇄ board sync ──────────────────────────────────────────────
// Two-way, explicit sync through the GitHub CLI (`gh`), so it uses the
// user's own GitHub sign-in and never stores a token:
//   import  open issues without a story → new ready-for-dev stories
//   push    story done → close its issue with a comment;
//           story reopened → reopen the issue
//   pull    issue closed on GitHub while its story isn't done → story done
// Decisions are computed by planIssueSync() (pure) so they are tested.

export interface GhIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly state: 'OPEN' | 'CLOSED';
  readonly url: string;
  readonly labels: string[];
}

export interface LinkedStory {
  readonly id: string;
  readonly status: string;
  readonly issueNumber?: number;
}

export type SyncAction =
  | { readonly kind: 'import'; readonly issue: GhIssue }
  | { readonly kind: 'close-issue'; readonly issueNumber: number; readonly storyId: string }
  | { readonly kind: 'reopen-issue'; readonly issueNumber: number; readonly storyId: string }
  | { readonly kind: 'mark-story-done'; readonly storyId: string; readonly issueNumber: number };

const DONE = new Set(['done', 'complete', 'completed']);

/** Parse `gh issue list --json number,title,body,state,url,labels`. */
export function parseIssues(json: string): GhIssue[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((i: Record<string, unknown>) => {
    if (typeof i?.number !== 'number' || typeof i.title !== 'string') return [];
    const labels = Array.isArray(i.labels) ? i.labels.map((l: { name?: unknown }) => String(l?.name ?? '')).filter(Boolean) : [];
    return [{
      number: i.number,
      title: i.title,
      body: typeof i.body === 'string' ? i.body : '',
      state: i.state === 'CLOSED' ? 'CLOSED' : 'OPEN',
      url: typeof i.url === 'string' ? i.url : '',
      labels,
    }];
  });
}

/**
 * What to do to bring board and issues in line. `lastSynced` holds the
 * story status seen at the previous sync, so "moved back from done" can be
 * told apart from "never done".
 */
export function planIssueSync(
  issues: readonly GhIssue[],
  stories: readonly LinkedStory[],
  lastSynced: ReadonlyMap<string, string> = new Map(),
): SyncAction[] {
  const actions: SyncAction[] = [];
  const byIssue = new Map(stories.filter((s) => s.issueNumber !== undefined).map((s) => [s.issueNumber!, s]));
  for (const issue of issues) {
    const story = byIssue.get(issue.number);
    if (!story) {
      if (issue.state === 'OPEN') actions.push({ kind: 'import', issue });
      continue;
    }
    const done = DONE.has(story.status);
    const wasDone = DONE.has(lastSynced.get(story.id) ?? '');
    if (done && issue.state === 'OPEN') actions.push({ kind: 'close-issue', issueNumber: issue.number, storyId: story.id });
    else if (!done && issue.state === 'CLOSED' && wasDone) actions.push({ kind: 'reopen-issue', issueNumber: issue.number, storyId: story.id });
    else if (!done && issue.state === 'CLOSED') actions.push({ kind: 'mark-story-done', storyId: story.id, issueNumber: issue.number });
  }
  return actions;
}
