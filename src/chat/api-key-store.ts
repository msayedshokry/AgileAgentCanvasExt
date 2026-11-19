// ─── AI API key storage ──────────────────────────────────────────────────────
// The direct-API key lives in VS Code SecretStorage (OS keychain), not in
// settings.json, where it would be stored in clear text and synced. A key
// found in settings is migrated once and removed from settings.

import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { errMsg } from '../utils/error';

const logger = createLogger('api-key-store');
const SECRET_KEY = 'agileagentcanvas.apiKey';
const SETTING = 'apiKey';

let secrets: vscode.SecretStorage | undefined;
let cached = '';

/** The API key for direct providers (empty string when none is set). */
export function getApiKey(): string {
  if (cached) return cached;
  // Before initialisation (or in hosts without SecretStorage) fall back to settings.
  return vscode.workspace.getConfiguration('agileagentcanvas').get<string>(SETTING, '') ?? '';
}

async function clearSettingEverywhere(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('agileagentcanvas');
  const inspected = cfg.inspect<string>(SETTING);
  const targets: Array<[unknown, vscode.ConfigurationTarget]> = [
    [inspected?.globalValue, vscode.ConfigurationTarget.Global],
    [inspected?.workspaceValue, vscode.ConfigurationTarget.Workspace],
    [inspected?.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder],
  ];
  for (const [value, target] of targets) {
    if (value) await cfg.update(SETTING, undefined, target);
  }
}

/** Load the key from SecretStorage, migrating a settings value on first run. */
export async function initApiKeyStore(context: vscode.ExtensionContext): Promise<void> {
  secrets = context.secrets;
  try {
    cached = (await secrets.get(SECRET_KEY)) ?? '';
    const fromSettings = vscode.workspace.getConfiguration('agileagentcanvas').get<string>(SETTING, '') ?? '';
    if (fromSettings) {
      if (!cached) {
        await secrets.store(SECRET_KEY, fromSettings);
        cached = fromSettings;
      }
      await clearSettingEverywhere();
      logger.info('Moved agileagentcanvas.apiKey from settings into secure storage');
    }
  } catch (err) {
    logger.warn(`Secure API-key storage unavailable, using settings: ${errMsg(err)}`);
  }
  context.subscriptions.push(
    secrets.onDidChange(async (e) => {
      if (e.key === SECRET_KEY) cached = (await secrets?.get(SECRET_KEY)) ?? '';
    }),
    vscode.commands.registerCommand('agileagentcanvas.setApiKey', async () => {
      const value = await vscode.window.showInputBox({
        title: 'AI provider API key',
        prompt: 'Stored in your OS keychain via VS Code SecretStorage. Leave empty to remove the key.',
        password: true,
        ignoreFocusOut: true,
      });
      if (value === undefined) return;
      if (value.trim()) {
        await secrets?.store(SECRET_KEY, value.trim());
        cached = value.trim();
        void vscode.window.showInformationMessage('API key saved to secure storage.');
      } else {
        await secrets?.delete(SECRET_KEY);
        cached = '';
        void vscode.window.showInformationMessage('API key removed.');
      }
    }),
  );
}
