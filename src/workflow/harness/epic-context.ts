// ─── Context attached to an epic ─────────────────────────────────────────────
// (docs/plans/2026-11-26-agent-board-live.md, L9.) An epic can carry the repo
// paths, files and URLs its work depends on, plus a free-text note. Every
// story in the epic inherits it: the brief lists them and tells the agent to
// read what is relevant. Files are listed, not pasted; URLs are references
// and nothing is fetched by the extension. Stored as `metadata.agentContext`
// on the epic (the reducers lift it to `agentContext`). Pure.

export interface EpicContext {
  /** Workspace-relative files or folders. */
  readonly paths: readonly string[];
  /** http(s) references: specs, designs, tickets. */
  readonly urls: readonly string[];
  readonly note?: string;
}

export const MAX_CONTEXT_PATHS = 30;
export const MAX_CONTEXT_URLS = 15;
export const MAX_CONTEXT_NOTE = 2000;
const MAX_ENTRY = 300;

/** Why a path is refused, or undefined when it is a usable workspace-relative path. */
function pathProblem(p: string): string | undefined {
  if (p.length > MAX_ENTRY) return 'is too long';
  if (/^([a-zA-Z]:|[\\/]|~)/.test(p)) return 'must be relative to the workspace';
  if (p.split(/[\\/]/).includes('..')) return 'must stay inside the workspace';
  if ([...p].some((ch) => ch.charCodeAt(0) < 0x20 || ch === '`')) return 'has characters a path cannot have';
  return undefined;
}

function urlProblem(u: string): string | undefined {
  if (u.length > MAX_ENTRY) return 'is too long';
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? undefined : 'must start with http:// or https://';
  } catch {
    return 'is not a URL';
  }
}

const lines = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\r?\n/) : [])
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter(Boolean);

/** Check context from the editor: the cleaned context, or the first problem. */
export function validateEpicContext(raw: unknown): { context: EpicContext } | { error: string } {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const paths = [...new Set(lines(obj.paths).map((p) => p.replace(/\\/g, '/')))];
  const urls = [...new Set(lines(obj.urls))];
  const note = typeof obj.note === 'string' ? obj.note.trim() : '';
  if (paths.length > MAX_CONTEXT_PATHS) return { error: `Up to ${MAX_CONTEXT_PATHS} paths` };
  if (urls.length > MAX_CONTEXT_URLS) return { error: `Up to ${MAX_CONTEXT_URLS} links` };
  if (note.length > MAX_CONTEXT_NOTE) return { error: `The note can be up to ${MAX_CONTEXT_NOTE} characters` };
  for (const p of paths) {
    const problem = pathProblem(p);
    if (problem) return { error: `Path "${p.slice(0, 60)}" ${problem}` };
  }
  for (const u of urls) {
    const problem = urlProblem(u);
    if (problem) return { error: `Link "${u.slice(0, 60)}" ${problem}` };
  }
  return { context: { paths, urls, ...(note ? { note } : {}) } };
}

/** Context stored on an epic, tolerant of junk: invalid entries are dropped, not fatal. */
export function readEpicContext(epic: unknown): EpicContext | undefined {
  const card = epic as { agentContext?: unknown; metadata?: { agentContext?: unknown } } | undefined;
  const raw = card?.agentContext ?? card?.metadata?.agentContext;
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const paths = lines(obj.paths).filter((p) => !pathProblem(p)).slice(0, MAX_CONTEXT_PATHS);
  const urls = lines(obj.urls).filter((u) => !urlProblem(u)).slice(0, MAX_CONTEXT_URLS);
  const note = typeof obj.note === 'string' ? obj.note.trim().slice(0, MAX_CONTEXT_NOTE) : '';
  if (!paths.length && !urls.length && !note) return undefined;
  return { paths, urls, ...(note ? { note } : {}) };
}

/** The brief's "Context for this epic" section; empty when there is none. */
export function epicContextSection(epicId: string, ctx: EpicContext | undefined): string {
  if (!ctx) return '';
  const parts = [`### Context for this epic (${epicId})`, 'The user attached these to the epic this card belongs to. Read what is relevant to this card; you don\'t need to read everything.'];
  if (ctx.paths.length) parts.push(`Files and folders:\n${ctx.paths.map((p) => `- \`${p}\``).join('\n')}`);
  if (ctx.urls.length) parts.push(`References (open them only if your tools can and the card needs it):\n${ctx.urls.map((u) => `- ${u}`).join('\n')}`);
  if (ctx.note) parts.push(`Note from the user:\n${ctx.note}`);
  return `${parts.join('\n')}\n\n`;
}
