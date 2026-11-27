// ─── Your agent library ──────────────────────────────────────────────────────
// Agents belong to a project (<outputFolder>/agent-team.json, versioned with
// the repo). The library is yours: agents you saved, kept in your home folder
// so any project can add them. Adding copies the agent into the project's
// team; the project file stays the source of truth for that repo.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { agentIdFor, materializeRoster, parseAgentTeam, type AgentTeam, type TeamAgent } from './agent-team';
import { unusedAvatar } from './agent-avatars';

export function libraryFile(home = os.homedir()): string {
  return path.join(home, '.agileagentcanvas', 'agents.json');
}

/** Saved agents; a missing or unreadable file is an empty library. */
export function readLibrary(file = libraryFile()): TeamAgent[] {
  try {
    return [...(parseAgentTeam(fs.readFileSync(file, 'utf-8')).team.agents ?? [])];
  } catch {
    return [];
  }
}

export function writeLibrary(file: string, agents: readonly TeamAgent[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ agents }, null, 2)}\n`, 'utf-8');
}

/** Save an agent; saving one with the same id again updates it. */
export function saveToLibrary(library: readonly TeamAgent[], agent: TeamAgent): TeamAgent[] {
  const at = library.findIndex((a) => a.id === agent.id);
  return at >= 0 ? library.map((a, i) => (i === at ? agent : a)) : [...library, agent];
}

export function removeFromLibrary(library: readonly TeamAgent[], id: string): TeamAgent[] {
  return library.filter((a) => a.id !== id);
}

/**
 * Copy a saved agent into a project's team. A different agent already using
 * its id makes it take a new one; the project's lead stays the lead; an avatar
 * another member has is swapped for an unused one.
 */
export function addFromLibrary(team: AgentTeam, saved: TeamAgent): AgentTeam {
  const roster = materializeRoster(team);
  const taken = new Set(roster.map((a) => a.id));
  const id = taken.has(saved.id) ? agentIdFor(saved.name, taken) : saved.id;
  const hasLead = roster.some((a) => a.lead);
  const avatars = roster.map((a) => a.avatar);
  const { lead: _lead, ...rest } = saved;
  const agent: TeamAgent = {
    ...rest,
    id,
    ...(saved.lead && !hasLead ? { lead: true } : {}),
    ...(saved.avatar && avatars.includes(saved.avatar) ? { avatar: unusedAvatar(avatars) } : {}),
  };
  return { ...team, agents: [...roster, agent] };
}
