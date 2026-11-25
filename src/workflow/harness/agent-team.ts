// ─── Agent team: named agents as card assignees ─────────────────────────────
// A card can be assigned to a named agent ("Dev", "Reviewer") instead of
// whatever harness the board defaults to. The roster and the assignments live
// in `<outputFolder>/agent-team.json` so the team is visible in the repo.
// With no roster, every installed CLI is an agent named after itself, so
// assignment works with zero setup. Parsing and lookups are pure; only
// readAgentTeam/writeAgentTeam touch the disk.

import * as fs from 'fs';
import * as path from 'path';
import { isHarnessChoice } from './harness-resolver';
import { getHarnessAdapter } from './harness-adapters';

export const AGENT_TEAM_FILE = 'agent-team.json';
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_NAME = 40;

export interface TeamAgent {
  readonly id: string;
  readonly name: string;
  /** A harness id from harness-adapters, or 'vscode-lm'. */
  readonly harness: string;
  /** Model id passed to the CLI's model flag; absent uses the CLI's default. */
  readonly model?: string;
  /** One line on what this agent is for; shown to the lead and to other agents. */
  readonly role?: string;
  /** The agent's standing rules, given to it on every run. */
  readonly instructions?: string;
  /** The team's lead (chief of staff): plans epics and hands stories out. At most one. */
  readonly lead?: boolean;
}

export const MAX_ROLE_CHARS = 120;
export const MAX_INSTRUCTIONS_CHARS = 4000;

/** Model ids as CLIs print them: `sonnet`, `gpt-reserve`, `opencode/big-pickle`, `claude-fable-5-1[1m]`. */
const MODEL_PATTERN = /^[A-Za-z0-9][\w.:/@[\]+-]{0,99}$/;

export function isValidModelId(model: string): boolean {
  return MODEL_PATTERN.test(model);
}

export interface AgentTeam {
  readonly agents: readonly TeamAgent[];
  /** artifactId → agent id. */
  readonly assignments: Readonly<Record<string, string>>;
}

export const EMPTY_TEAM: AgentTeam = { agents: [], assignments: {} };

export interface ParsedTeam {
  readonly team: AgentTeam;
  /** One readable problem per invalid entry; valid entries still load. */
  readonly errors: readonly string[];
}

function parseAgent(raw: unknown, index: number, seen: Set<string>): TeamAgent | string {
  const where = `agents[${index}]`;
  if (!raw || typeof raw !== 'object') return `${where}: not an object`;
  const { id, name, harness, model, role, instructions, lead } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return `${where}: "id" must be lowercase letters, digits and dashes`;
  if (seen.has(id)) return `${where}: duplicate id "${id}"`;
  if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME) return `${where}: "name" must be 1-${MAX_NAME} characters`;
  if (typeof harness !== 'string' || harness === 'auto' || !isHarnessChoice(harness)) return `${where}: "harness" must be an installed-agent id such as "claude" or "codex"`;
  if (model !== undefined && model !== '' && (typeof model !== 'string' || !isValidModelId(model))) {
    return `${where}: "model" must be a model id such as "sonnet" or "opencode/big-pickle"`;
  }
  if (role !== undefined && (typeof role !== 'string' || role.length > MAX_ROLE_CHARS)) return `${where}: "role" must be up to ${MAX_ROLE_CHARS} characters`;
  if (instructions !== undefined && (typeof instructions !== 'string' || instructions.length > MAX_INSTRUCTIONS_CHARS)) {
    return `${where}: "instructions" must be up to ${MAX_INSTRUCTIONS_CHARS} characters`;
  }
  if (lead !== undefined && typeof lead !== 'boolean') return `${where}: "lead" must be true or false`;
  seen.add(id);
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    id, name: name.trim(), harness,
    ...(typeof model === 'string' && model ? { model } : {}),
    ...(text(role) ? { role: text(role) } : {}),
    ...(text(instructions) ? { instructions: text(instructions) } : {}),
    ...(lead === true ? { lead: true } : {}),
  };
}

/** The team's lead agent, if one is marked. */
export function leadAgent(team: AgentTeam): TeamAgent | undefined {
  return team.agents.find((a) => a.lead);
}

/** Problems with an agent from the editor, or none when it can be saved. */
export function validateAgent(raw: unknown): { agent: TeamAgent } | { error: string } {
  const parsed = parseAgent(raw, 0, new Set());
  return typeof parsed === 'string' ? { error: parsed.replace(/^agents\[0\]: /, '') } : { agent: parsed };
}

/** Lowercase slug for a new agent's id, unique within the roster. */
export function agentIdFor(name: string, taken: ReadonlySet<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'agent';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * The roster once the user starts editing it. With no file, cards may be
 * assigned to installed CLIs by id; those become real agents so the
 * assignments survive the first save.
 */
function materializeRoster(team: AgentTeam): TeamAgent[] {
  if (team.agents.length > 0) return [...team.agents];
  const used = new Set(Object.values(team.assignments));
  return [...used].flatMap((id) => {
    const adapter = getHarnessAdapter(id);
    return adapter ? [{ id: adapter.id, name: adapter.label, harness: adapter.id }] : [];
  });
}

/** Add an agent, or replace the one with the same id. Making it lead removes the lead from the others. */
export function withAgent(team: AgentTeam, agent: TeamAgent): AgentTeam {
  const roster = materializeRoster(team).map((a) => {
    if (!agent.lead || !a.lead || a.id === agent.id) return a;
    const { lead: _moved, ...member } = a;
    return member;
  });
  const at = roster.findIndex((a) => a.id === agent.id);
  return { ...team, agents: at >= 0 ? roster.map((a, i) => (i === at ? agent : a)) : [...roster, agent] };
}

/** Remove an agent and unassign its cards (they go back to the board default). */
export function withoutAgent(team: AgentTeam, agentId: string): AgentTeam {
  const assignments = Object.fromEntries(Object.entries(team.assignments).filter(([, id]) => id !== agentId));
  return { agents: materializeRoster(team).filter((a) => a.id !== agentId), assignments };
}

export function parseAgentTeam(text: string): ParsedTeam {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { team: EMPTY_TEAM, errors: [`${AGENT_TEAM_FILE} is not valid JSON: ${(err as Error).message}`] };
  }
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const seen = new Set<string>();
  const agents: TeamAgent[] = [];
  (Array.isArray(obj.agents) ? obj.agents : []).forEach((raw, i) => {
    const parsed = parseAgent(raw, i, seen);
    if (typeof parsed === 'string') errors.push(parsed);
    else if (parsed.lead && agents.some((a) => a.lead)) {
      // One lead per team: the first one keeps it.
      errors.push(`agents[${i}]: only one agent can be the lead; "${parsed.id}" is kept as a member`);
      const { lead: _dropped, ...member } = parsed;
      agents.push(member);
    } else agents.push(parsed);
  });
  const assignments: Record<string, string> = {};
  const rawAssignments = obj.assignments && typeof obj.assignments === 'object' ? obj.assignments as Record<string, unknown> : {};
  for (const [artifactId, agentId] of Object.entries(rawAssignments)) {
    if (typeof agentId === 'string' && ID_PATTERN.test(agentId)) assignments[artifactId] = agentId;
  }
  return { team: { agents, assignments }, errors };
}

/** The agents a card can be assigned to: the roster, or one per installed CLI. */
export function effectiveRoster(team: AgentTeam, installed: ReadonlyArray<{ id: string; label: string }>): TeamAgent[] {
  if (team.agents.length > 0) return [...team.agents];
  return installed.map((h) => ({ id: h.id, name: h.label, harness: h.id }));
}

/** The agent a card is assigned to, when that agent still exists. */
export function assignedAgent(team: AgentTeam, artifactId: string): TeamAgent | undefined {
  const agentId = team.assignments[artifactId];
  if (!agentId) return undefined;
  const named = team.agents.find((a) => a.id === agentId);
  if (named) return named;
  // Implicit agent: an installed CLI assigned by its own id.
  const adapter = team.agents.length === 0 ? getHarnessAdapter(agentId) : undefined;
  return adapter ? { id: adapter.id, name: adapter.label, harness: adapter.id } : undefined;
}

/** A copy of the team with the card (un)assigned; `agentId` null clears it. */
export function withAssignment(team: AgentTeam, artifactId: string, agentId: string | null): AgentTeam {
  const { [artifactId]: _previous, ...rest } = team.assignments;
  return { ...team, assignments: agentId ? { ...rest, [artifactId]: agentId } : rest };
}

export function readAgentTeam(outputFolder: string): ParsedTeam {
  try {
    return parseAgentTeam(fs.readFileSync(path.join(outputFolder, AGENT_TEAM_FILE), 'utf-8'));
  } catch {
    return { team: EMPTY_TEAM, errors: [] }; // no file yet: no roster, no assignments
  }
}

export function writeAgentTeam(outputFolder: string, team: AgentTeam): void {
  fs.mkdirSync(outputFolder, { recursive: true });
  fs.writeFileSync(path.join(outputFolder, AGENT_TEAM_FILE), `${JSON.stringify(team, null, 2)}\n`, 'utf-8');
}

export const AGENT_TEAM_TEMPLATE = `${JSON.stringify({
  agents: [
    { id: 'dev', name: 'Dev', harness: 'claude', model: 'sonnet' },
    { id: 'reviewer', name: 'Reviewer', harness: 'codex' },
  ],
  assignments: {},
}, null, 2)}\n`;
