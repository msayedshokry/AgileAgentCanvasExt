import * as vscode from 'vscode';

/**
 * Thin wrapper around VS Code SecretStorage for the Jira API token.
 *
 * Credentials stored here go into the OS keychain (macOS Keychain,
 * Windows Credential Manager, Linux libsecret) — never plain-text on disk.
 *
 * Usage:
 *   1. Call `JiraSecrets.init(context)` once in `activate()`.
 *   2. Call `JiraSecrets.getToken()` anywhere to retrieve the stored token.
 *   3. Call `JiraSecrets.setToken(token)` to persist a new token.
 *   4. Call `JiraSecrets.clearToken()` to delete the stored token.
 */

const SECRET_KEY = 'agileagentcanvas.jira.apiToken';

export class JiraSecrets {
    private static _secrets: vscode.SecretStorage | null = null;

    /** Must be called once from `activate(context)`. */
    static init(context: vscode.ExtensionContext): void {
        JiraSecrets._secrets = context.secrets;
    }

    static get isInitialized(): boolean {
        return JiraSecrets._secrets !== null;
    }

    /** Retrieve the stored Jira API token, or undefined if not set. */
    static async getToken(): Promise<string | undefined> {
        if (!JiraSecrets._secrets) { return undefined; }
        return JiraSecrets._secrets.get(SECRET_KEY);
    }

    /** Persist a Jira API token securely in the OS keychain. */
    static async setToken(token: string): Promise<void> {
        if (!JiraSecrets._secrets) {
            throw new Error('JiraSecrets not initialized — call JiraSecrets.init(context) in activate()');
        }
        await JiraSecrets._secrets.store(SECRET_KEY, token);
    }

    /** Remove the stored token. */
    static async clearToken(): Promise<void> {
        if (!JiraSecrets._secrets) { return; }
        await JiraSecrets._secrets.delete(SECRET_KEY);
    }
}
