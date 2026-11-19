// ─── Pull request status for a card ─────────────────────────────────────────
// When agents.openPullRequests is on, an approved card ends as a PR on its
// aac/story-<id> branch. This reads that PR's state, CI checks and review
// feedback with the GitHub CLI, and turns review feedback into fix requests
// so "Address review comments" can send the card back to the agent.

import { execTool } from './git-cli';
import { branchFor } from './card-worktree';

export interface PrCheck { name: string; state: 'pass' | 'fail' | 'pending' }

export interface CardPullRequest {
  readonly url: string;
  readonly number: number;
  readonly state: string;             // OPEN | MERGED | CLOSED
  readonly reviewDecision: string;    // APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | ''
  readonly checks: PrCheck[];
  /** Review comments and change requests, newest last. */
  readonly feedback: Array<{ author: string; body: string }>;
}

type Gh = (args: readonly string[], cwd: string) => Promise<{ stdout: string; code: number }>;
const defaultGh: Gh = (args, cwd) => execTool('gh', args, cwd);

function checkState(c: Record<string, unknown>): PrCheck['state'] {
  const conclusion = String(c.conclusion ?? c.state ?? '').toUpperCase();
  if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(conclusion)) return 'pass';
  if (['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(conclusion)) return 'fail';
  return 'pending';
}

interface GhAuthor { login?: string }
interface GhNote { author?: GhAuthor; body?: unknown; state?: string }
interface GhPrView {
  url?: string;
  number?: number;
  state?: string;
  reviewDecision?: string;
  statusCheckRollup?: Array<Record<string, unknown>>;
  comments?: GhNote[];
  reviews?: GhNote[];
}

const note = (n: GhNote) => ({ author: String(n.author?.login ?? 'reviewer'), body: String(n.body).trim() });
const hasBody = (n: GhNote) => typeof n.body === 'string' && n.body.trim().length > 0;

/** Parse `gh pr view --json url,number,state,reviewDecision,statusCheckRollup,comments,reviews`. */
export function parsePullRequest(json: string): CardPullRequest | undefined {
  let raw: GhPrView;
  try {
    raw = JSON.parse(json) as GhPrView;
  } catch {
    return undefined;
  }
  if (!raw?.url) return undefined;
  const checks: PrCheck[] = (Array.isArray(raw.statusCheckRollup) ? raw.statusCheckRollup : []).map((c) => ({
    name: String(c.name ?? c.context ?? 'check'),
    state: checkState(c),
  }));
  const fromReviews = (Array.isArray(raw.reviews) ? raw.reviews : []).filter((r) => hasBody(r) && r.state !== 'APPROVED').map(note);
  const fromComments = (Array.isArray(raw.comments) ? raw.comments : []).filter(hasBody).map(note);
  return {
    url: String(raw.url),
    number: Number(raw.number) || 0,
    state: String(raw.state ?? ''),
    reviewDecision: String(raw.reviewDecision ?? ''),
    checks,
    feedback: [...fromReviews, ...fromComments],
  };
}

export async function getCardPullRequest(artifactId: string, cwd: string, gh: Gh = defaultGh): Promise<CardPullRequest | undefined> {
  const r = await gh(['pr', 'view', branchFor(artifactId), '--json', 'url,number,state,reviewDecision,statusCheckRollup,comments,reviews'], cwd);
  return r.code === 0 ? parsePullRequest(r.stdout) : undefined;
}

/** Review feedback + failing checks as fix requests for the next implement run. */
export function prFixRequests(pr: CardPullRequest): Array<{ failing_criterion: string; reproduction?: string }> {
  const fixes = pr.feedback.slice(-20).map((f) => ({ failing_criterion: `Review comment from @${f.author}`, reproduction: f.body.slice(0, 2000) }));
  for (const c of pr.checks.filter((x) => x.state === 'fail')) {
    fixes.push({ failing_criterion: `CI check failing: ${c.name}`, reproduction: `See ${pr.url}/checks` });
  }
  return fixes;
}
