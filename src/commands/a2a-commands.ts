// ─── A2A Commands ────────────────────────────────────────────────────────────
// VS Code commands for A2A (Agent-to-Agent) protocol integration.
//
//   agileagentcanvas.a2a.exportAgentCard   — Write the platform Agent Card
//                                            and per-agent cards to the output
//                                            folder for external A2A discovery.

import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
const logger = createLogger('a2a-commands');

import {
  generatePlatformAgentCard,
  generateAllAgentCards,
  type A2AAgentCard,
} from '../acp/agent-bus/a2a-agent-card';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the output folder URI from workspace configuration.
 * Falls back to `.agileagentcanvas-context` in the first workspace root.
 */
function resolveOutputFolder(): vscode.Uri | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }

  const root = workspaceFolders[0].uri;
  const folderName = vscode.workspace
    .getConfiguration('agileagentcanvas')
    .get<string>('outputFolder', '.agileagentcanvas-context');

  return vscode.Uri.joinPath(root, folderName);
}

/**
 * Build the A2A base URL from extension configuration or workspace metadata.
 * Users can set `agileagentcanvas.a2a.baseUrl` to their actual server URL.
 * Falls back to a localhost placeholder.
 */
function resolveBaseUrl(): string {
  const cfg = vscode.workspace.getConfiguration('agileagentcanvas.a2a');
  return cfg.get<string>('baseUrl', 'http://localhost:0');
}

/**
 * Serialize an Agent Card to formatted JSON.
 */
function serializeCard(card: A2AAgentCard): string {
  return JSON.stringify(card, null, 2);
}

// ─── Commands ────────────────────────────────────────────────────────────────

/**
 * Register all A2A commands on the extension context.
 */
export function registerA2ACommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'agileagentcanvas.a2a.exportAgentCard',
      () => handleExportAgentCard()
    )
  );

  logger.info('A2A commands registered');
}

// ─── Command Handlers ────────────────────────────────────────────────────────

/**
 * Export the platform Agent Card and per-agent cards to the output folder.
 *
 * Writes:
 *   {outputFolder}/agent-card.json    — platform-level card
 *   {outputFolder}/a2a/agents.json    — all agent cards as a JSON array
 *   {outputFolder}/a2a/{agentId}.json — per-agent cards
 *
 * Shows a VS Code notification with the file paths and a button to open them.
 */
async function handleExportAgentCard(): Promise<void> {
  const outputFolder = resolveOutputFolder();
  if (!outputFolder) {
    vscode.window.showWarningMessage(
      'A2A: No workspace folder open. Open a project first.'
    );
    return;
  }

  // Ensure the output folder exists on disk
  try {
    await vscode.workspace.fs.createDirectory(outputFolder);
  } catch {
    // Folder may already exist — fine
  }

  const baseUrl = resolveBaseUrl();
  const filesWritten: string[] = [];

  try {
    // ── 1. Platform-level Agent Card ─────────────────────────────────────
    const platformCard = generatePlatformAgentCard(baseUrl);
    const cardUri = vscode.Uri.joinPath(outputFolder, 'agent-card.json');
    await vscode.workspace.fs.writeFile(
      cardUri,
      Buffer.from(serializeCard(platformCard), 'utf-8')
    );
    filesWritten.push('agent-card.json');
    logger.info(
      `[A2A] Exported platform Agent Card to ${cardUri.fsPath}`
    );

    // ── 2. Per-agent cards in a2a/ subdirectory ──────────────────────────
    const a2aDir = vscode.Uri.joinPath(outputFolder, 'a2a');
    try {
      await vscode.workspace.fs.createDirectory(a2aDir);
    } catch {
      // Directory may already exist
    }

    const allCards = generateAllAgentCards(baseUrl);
    let agentCount = 0;

    for (const [agentId, card] of allCards) {
      const agentUri = vscode.Uri.joinPath(a2aDir, `${agentId}.json`);
      await vscode.workspace.fs.writeFile(
        agentUri,
        Buffer.from(serializeCard(card), 'utf-8')
      );
      agentCount++;
      logger.debug(
        `[A2A] Exported Agent Card for ${agentId} to ${agentUri.fsPath}`
      );
    }

    // ── 3. Aggregate agents.json ─────────────────────────────────────────
    const allCardsArray = Array.from(allCards.values());
    const agentsUri = vscode.Uri.joinPath(a2aDir, 'agents.json');
    await vscode.workspace.fs.writeFile(
      agentsUri,
      Buffer.from(JSON.stringify(allCardsArray, null, 2), 'utf-8')
    );
    filesWritten.push(`a2a/agents.json (${agentCount} agents)`);

    // ── 4. Show success notification ─────────────────────────────────────
    const folderPath = outputFolder.fsPath;
    const message =
      `A2A Agent Cards exported to ${folderPath}:\n` +
      `  • agent-card.json (platform)\n` +
      `  • a2a/agents.json (${agentCount} agents)\n` +
      `  • a2a/{agentId}.json (${agentCount} per-agent files)`;

    const openAction = 'Open Folder';
    const revealAction = 'Reveal Card';

    vscode.window
      .showInformationMessage(message, openAction, revealAction)
      .then((choice) => {
        if (choice === openAction) {
          vscode.commands.executeCommand(
            'revealFileInOS',
            cardUri
          );
        } else if (choice === revealAction) {
          vscode.window.showTextDocument(cardUri);
        }
      });

    logger.info(
      `[A2A] Exported ${agentCount + 1} Agent Card(s) to ${folderPath}`
    );

    // ── 5. Log baseUrl hint if it's the default placeholder ──────────────
    if (baseUrl === 'http://localhost:0') {
      logger.info(
        '[A2A] baseUrl is the default placeholder. Set ' +
        '"agileagentcanvas.a2a.baseUrl" in VS Code settings to your actual ' +
        'server URL for external A2A clients to reach this agent.'
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[A2A] Failed to export Agent Cards: ${msg}`);
    vscode.window.showErrorMessage(`A2A: Failed to export Agent Cards: ${msg}`);
  }
}
