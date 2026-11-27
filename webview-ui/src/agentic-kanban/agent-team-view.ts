// Board-side view of the agent team (see src/workflow/harness/agent-team.ts):
// the roster the extension sends, the installed CLIs, and which agent each
// card is assigned to.

export interface TeamAgentView {
  id: string;
  name: string;
  harness: string;
  /** Model passed to the CLI; absent means the CLI's default. */
  model?: string;
  /** One line on what this agent is for. */
  role?: string;
  /** The agent's standing rules, given to it on every run. */
  instructions?: string;
  /** The team's lead (chief of staff). */
  lead?: boolean;
  /** Skill ids given to this agent. */
  skills?: string[];
  /** Runs it may have going at once (default 1). */
  maxConcurrent?: number;
  /** A person on the team: no CLI; their cards never start an agent run. */
  kind?: 'person';
  /** One emoji shown wherever the agent appears. */
  avatar?: string;
}

export interface InstalledCliView {
  id: string;
  label: string;
  /** The board can pass a model to this CLI. */
  acceptsModel: boolean;
  /** The CLI can list its own models. */
  listsModels: boolean;
}

export interface AgentTeamView {
  agents: TeamAgentView[];
  assignments: Record<string, string>;
  /** False when the roster is just the installed CLIs (no agent-team.json roster). */
  rosterDefined: boolean;
  installed: InstalledCliView[];
}

export const EMPTY_TEAM_VIEW: AgentTeamView = { agents: [], assignments: {}, rosterDefined: false, installed: [] };

/** The card's assignee, when it is assigned to an agent that is on the roster. */
export function assigneeFor(team: AgentTeamView, artifactId: string): TeamAgentView | undefined {
  const agentId = team.assignments[artifactId];
  return agentId ? team.agents.find((a) => a.id === agentId) : undefined;
}

const isText = (v: unknown): v is string => typeof v === 'string';

/** Accepts only a well-formed `kanban:agentTeam` payload. */
export function parseTeamMessage(message: { agents?: unknown; assignments?: unknown; rosterDefined?: unknown; installed?: unknown }): AgentTeamView | undefined {
  if (!Array.isArray(message.agents) || !message.assignments || typeof message.assignments !== 'object') return undefined;
  const agents = message.agents
    .filter((a): a is TeamAgentView => !!a && isText(a.id) && isText(a.name) && isText(a.harness))
    .map((a) => ({
      id: a.id, name: a.name, harness: a.harness,
      ...(isText(a.model) && a.model ? { model: a.model } : {}),
      ...(isText(a.role) && a.role ? { role: a.role } : {}),
      ...(isText(a.instructions) && a.instructions ? { instructions: a.instructions } : {}),
      ...(a.lead === true ? { lead: true } : {}),
      ...(Array.isArray(a.skills) ? { skills: a.skills.filter(isText) } : {}),
      ...(typeof a.maxConcurrent === 'number' ? { maxConcurrent: a.maxConcurrent } : {}),
      ...(a.kind === 'person' ? { kind: 'person' as const } : {}),
      ...(isText(a.avatar) && a.avatar ? { avatar: a.avatar } : {}),
    }));
  const installed = (Array.isArray(message.installed) ? message.installed : [])
    .filter((c): c is InstalledCliView => !!c && isText(c.id) && isText(c.label))
    .map((c) => ({ id: c.id, label: c.label, acceptsModel: c.acceptsModel === true, listsModels: c.listsModels === true }));
  return { agents, assignments: message.assignments as Record<string, string>, rosterDefined: message.rosterDefined === true, installed };
}

/** "Claude Code · sonnet", or "· CLI default" when no model is set. */
export function describeAgent(agent: TeamAgentView, installed: readonly InstalledCliView[]): string {
  if (agent.kind === 'person') return 'Person · works their cards by hand';
  const cli = installed.find((c) => c.id === agent.harness);
  return `${cli?.label ?? `${agent.harness} (not installed)`} · ${agent.model ?? 'CLI default'}`;
}
