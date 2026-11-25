// ─── Agent team messages for the Agentic Kanban ─────────────────────────────
// Webview ⇄ extension protocol for named agents: send the roster, the
// installed CLIs and their models, create/edit/delete agents, assign cards,
// open the team file. The rules live in workflow/harness/agent-team.ts and
// workflow/harness/model-discovery.ts.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { HARNESS_ADAPTERS, getHarnessAdapter } from '../workflow/harness/harness-adapters';
import { isOnPathCached } from '../workflow/harness/board-harness';
import {
  AGENT_TEAM_FILE, AGENT_TEAM_TEMPLATE, agentIdFor, effectiveRoster, readAgentTeam, validateAgent, withAgent, withAssignment,
  withoutAgent, writeAgentTeam,
} from '../workflow/harness/agent-team';
import { discoverModels, supportsModelDiscovery } from '../workflow/harness/model-discovery';
import { getOutputFolder } from '../workflow/kanban-verdict';
import { leadCoordinator } from './lead-coordinator';
import { createLogger } from '../utils/logger';
import { errMsg } from '../utils/error';

const logger = createLogger('agent-team-messages');
const HANDLED = new Set([
  'kanban:getAgentTeam', 'kanban:assignAgent', 'kanban:editAgentTeam', 'kanban:listModels', 'kanban:saveAgent', 'kanban:deleteAgent',
]);

type Post = (message: Record<string, unknown>) => void;
type CardLookup = { findArtifactById(id: string): { type: string; artifact: unknown } | null };

interface InstalledCli {
  id: string;
  label: string;
  binary: string;
  /** The adapter passes a model flag for this CLI. */
  acceptsModel: boolean;
  /** The CLI can list its own models. */
  listsModels: boolean;
}

function installedClis(): InstalledCli[] {
  return HARNESS_ADAPTERS.flatMap((a) => {
    const binary = a.binaries.find((b) => isOnPathCached(b));
    return binary
      ? [{ id: a.id, label: a.label, binary, acceptsModel: a.acceptsModel === true, listsModels: supportsModelDiscovery(a.id) }]
      : [];
  });
}

function postTeam(post: Post): void {
  const { team, errors } = readAgentTeam(getOutputFolder());
  const installed = installedClis();
  post({
    type: 'kanban:agentTeam',
    agents: effectiveRoster(team, installed),
    assignments: team.assignments,
    rosterDefined: team.agents.length > 0,
    installed: installed.map(({ binary: _binary, ...cli }) => cli),
    errors,
  });
}

/** Giving an epic to the lead starts the lead on it, unless the epic is parked in backlog or done. */
function startLeadIfGiven(cardId: string, store?: CardLookup): void {
  const coordinator = leadCoordinator();
  const card = store?.findArtifactById(cardId);
  if (!coordinator || !card || !coordinator.owns({ id: cardId, type: card.type })) return;
  const status = String((card.artifact as { status?: unknown }).status ?? '');
  if (status !== 'backlog' && status !== 'done') void coordinator.start(cardId);
}

async function openTeamFile(): Promise<void> {
  const file = path.join(getOutputFolder(), AGENT_TEAM_FILE);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, AGENT_TEAM_TEMPLATE, 'utf-8');
  }
  await vscode.window.showTextDocument(vscode.Uri.file(file));
}

async function postModels(harness: string, post: Post): Promise<void> {
  const cli = installedClis().find((c) => c.id === harness);
  if (!cli) {
    post({ type: 'kanban:models', harness, models: [], supported: false, error: `${getHarnessAdapter(harness)?.label ?? harness} is not installed` });
    return;
  }
  post({ type: 'kanban:models', harness, ...(await discoverModels(cli.id, cli.binary)) });
}

function saveAgent(raw: unknown, post: Post): void {
  const folder = getOutputFolder();
  const { team } = readAgentTeam(folder);
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  // A new agent gets an id from its name; an edited one keeps its id (and so its cards).
  const id = typeof input.id === 'string' && input.id
    ? input.id
    : agentIdFor(String(input.name ?? ''), new Set(team.agents.map((a) => a.id)));
  const result = validateAgent({ ...input, id, model: typeof input.model === 'string' ? input.model.trim() : input.model });
  if ('error' in result) {
    post({ type: 'kanban:agentError', error: result.error });
    return;
  }
  writeAgentTeam(folder, withAgent(team, result.agent));
  post({ type: 'kanban:agentSaved', id: result.agent.id });
  postTeam(post);
}

/** Returns true when the message was one of ours. */
export async function handleAgentTeamMessage(
  message: { type: string; [key: string]: unknown },
  webview?: vscode.Webview,
  store?: CardLookup,
): Promise<boolean> {
  if (!HANDLED.has(message.type)) return false;
  const post: Post = (m) => { void webview?.postMessage(m); };
  try {
    switch (message.type) {
      case 'kanban:getAgentTeam':
        postTeam(post);
        break;
      case 'kanban:assignAgent': {
        if (typeof message.artifactId !== 'string') break;
        const agentId = typeof message.agentId === 'string' && message.agentId ? message.agentId : null;
        const folder = getOutputFolder();
        writeAgentTeam(folder, withAssignment(readAgentTeam(folder).team, message.artifactId, agentId));
        postTeam(post);
        startLeadIfGiven(message.artifactId, store);
        break;
      }
      case 'kanban:listModels':
        if (typeof message.harness === 'string') await postModels(message.harness, post);
        break;
      case 'kanban:saveAgent':
        saveAgent(message.agent, post);
        break;
      case 'kanban:deleteAgent': {
        if (typeof message.id !== 'string') break;
        const folder = getOutputFolder();
        writeAgentTeam(folder, withoutAgent(readAgentTeam(folder).team, message.id));
        postTeam(post);
        break;
      }
      case 'kanban:editAgentTeam':
        await openTeamFile();
        break;
    }
  } catch (err) {
    logger.warn(`${message.type} failed: ${errMsg(err)}`);
    void vscode.window.showErrorMessage(`Agile Agent Canvas: ${errMsg(err)}`);
  }
  return true;
}
