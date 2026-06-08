// ─── Terminal Executor ────────────────────────────────────────────────────────
// Spawns VS Code terminals to execute BMAD workflows via CLI agents (Claude
// Code, Codex, Gemini CLI, Aider, OpenCode) when no Copilot Chat session is
// active. Replaces the [E2-STUB] log with actual agentic execution.
//
// Terminals are named "AAC: {workflowId} {artifactId} ({role})" and tracked
// per artifact so the kanban can offer a "Jump to terminal" action.

import { createLogger } from '../utils/logger';
const logger = createLogger('terminal-executor');
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { getTraceRecorder } from '../trace/trace-recorder';
import { concurrencyQueue } from './concurrency-queue';
import {
  getSelectedProvider,
  listAvailableProviders,
  CHAT_COMMANDS,
  type ChatProviderId,
} from '../commands/chat-bridge';

// Project-standard error-to-string
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TerminalSession {
  terminal: vscode.Terminal;
  sessionId: string;
  workflowId: string;
  artifactId: string;
  artifactType: string;
  agentRole: string;
  provider: ChatProviderId;
  startedAt: string;
  /** Accumulated terminal output for webview modal display */
  accumulatedData: string;
  /** Disposable for the onDidWriteData listener */
  dataListener: vscode.Disposable;
}

// ─── Provider resolution ─────────────────────────────────────────────────────

/** CLI-only providers suitable for agentic (non-interactive) execution. */
const AGENTIC_CLI_PROVIDERS: ChatProviderId[] = [
  'claude', 'codex', 'gemini-cli', 'aider', 'opencode',
];

/** Fallback CLI provider when the user's selected provider is panel-only. */
const FALLBACK_AGENTIC_PROVIDER: ChatProviderId = 'claude';

/**
 * Resolve which terminal CLI to use for agentic execution.
 * If the user's selected provider is a CLI, use it. If it's a panel-only
 * provider (copilot, cursor, windsurf, antigravity, omp, terminal), try
 * to find an available CLI on PATH. Falls back to 'claude'.
 */
async function resolveAgenticProvider(): Promise<ChatProviderId> {
  const selected = getSelectedProvider();

  // If the user explicitly chose a CLI provider, use it
  if (AGENTIC_CLI_PROVIDERS.includes(selected)) {
    return selected;
  }

  // Try to find an available CLI on PATH
  try {
    const available = await listAvailableProviders();
    for (const prov of AGENTIC_CLI_PROVIDERS) {
      const entry = available.find(a => a.id === prov);
      if (entry?.available) {
        return prov;
      }
    }
  } catch {
    // Ignore — fall through to fallback
  }

  return FALLBACK_AGENTIC_PROVIDER;
}

// ─── Prompt building ─────────────────────────────────────────────────────────

/**
 * Build a comprehensive prompt for the terminal CLI agent.
 * Includes BMAD workflow context, artifact data, and instructions to
 * update the artifact store when finished.
 */
function buildTerminalPrompt(
  workflowId: string,
  artifact: any,
  outputFolder: string
): string {
  const artifactType = artifact?.type || 'unknown';
  const artifactId = artifact?.id || 'unknown';
  const artifactJson = JSON.stringify(artifact, null, 2);

  return `You are executing a BMAD methodology workflow as a headless terminal agent.

## Workflow
- **Workflow ID:** ${workflowId}
- **Artifact Type:** ${artifactType}
- **Artifact ID:** ${artifactId}

## Artifact Context
\`\`\`json
${artifactJson}
\`\`\`

## Instructions
1. Execute the "${workflowId}" BMAD workflow on this artifact.
2. Read the project's BMAD framework files from resources/_aac/ for workflow steps and agent personas.
3. Read the artifact store at ${outputFolder} for related artifacts and context.
4. When you have completed the workflow, write the updated artifact as JSON.
5. Save the result to: ${outputFolder}/_terminal-output/${sanitizeId(artifactId)}-${sanitizeId(workflowId)}-result.json

## Important
- This is a non-interactive terminal session — complete the workflow fully and save results.
- Output the final updated artifact as valid JSON.
- When finished, save to the specified path above.`;
}

// ─── CLI-specific command building ───────────────────────────────────────────

/**
 * Build the terminal command line for a specific CLI provider.
 * Returns [command, ...args] suitable for terminal.sendText().
 */
function buildCliCommand(provider: ChatProviderId, prompt: string): string[] {
  const cmd = CHAT_COMMANDS[provider];
  if (!cmd?.terminalLaunch) {
    // Fallback — write prompt to temp file and echo instructions
    return ['echo', `No CLI found for ${provider}. See terminal output.`];
  }
  return cmd.terminalLaunch(prompt);
}

// ─── Shell detection ─────────────────────────────────────────────────────────

/** Check if the user's default shell is PowerShell (Windows). */
export function isPowerShell(): boolean {
  const shell = vscode.env.shell?.toLowerCase() || '';
  return shell.includes('powershell') || shell.includes('pwsh');
}

// ─── Filename sanitization ───────────────────────────────────────────────────

/**
 * Replace characters that are unsafe in filenames with hyphens.
 * Preserves alphanumeric, hyphen, underscore, and dot — everything else
 * becomes a hyphen. Consecutive hyphens are collapsed to one.
 */
export function sanitizeId(id: string): string {
  return id
    .replace(/[^A-Za-z0-9._\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Shell quoting ───────────────────────────────────────────────────────────

export function shellQuote(s: string): string {
  if (s === '') return "''";
  if (/^[A-Za-z0-9_\-./:=]+$/.test(s)) return s;
  // PowerShell uses double quotes for paths with spaces, not single quotes
  if (isPowerShell()) {
    return '"' + s.replace(/["$`]/g, '`$&') + '"';
  }
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// ─── TerminalExecutor ────────────────────────────────────────────────────────

export class TerminalExecutor implements vscode.Disposable {
  private activeTerminals = new Map<string, TerminalSession>();
  private disposables: vscode.Disposable[] = [];
  /** Webview streaming callbacks keyed by artifactId */
  private webviewStreams = new Map<string, (data: string) => void>();

  constructor() {
    // Listen for terminal close events to clean up tracking
    this.disposables.push(
      vscode.window.onDidCloseTerminal((closed) => {
        this.onDidCloseTerminal(closed);
      })
    );
  }

  /**
   * Launch a terminal-based workflow execution for an artifact.
   * Returns the trace session ID for observability.
   */
  async executeTerminalWorkflow(
    workflowId: string,
    artifact: any,
    store: any
  ): Promise<string | undefined> {
    const artifactId = artifact?.id;
    if (!artifactId) {
      logger.warn('[TerminalExecutor] Cannot execute — no artifact ID');
      return undefined;
    }

    const provider = await resolveAgenticProvider();
    const agentRole = inferRoleFromWorkflow(workflowId);
    const sessionId = `term-${workflowId}-${artifactId}-${Date.now()}`;

    // Generate trace entry for the terminal execution
    try {
      getTraceRecorder().record({
        sessionId,
        type: 'decision',
        agent: `terminal-${provider}`,
        data: {
          decision: `started ${workflowId} via terminal (${provider})`,
          artifactId,
          artifactType: artifact?.type || 'unknown',
          rationale: `Terminal-based agentic execution using ${provider}`,
        },
      });
    } catch {
      // Trace recorder may not be initialized
    }

    // Build prompt and write to temp file for long prompts
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const outputFolder = workspaceFolders?.[0]
      ? path.join(
          workspaceFolders[0].uri.fsPath,
          vscode.workspace
            .getConfiguration('agileagentcanvas')
            .get<string>('outputFolder', '.agileagentcanvas-context')
        )
      : '.agileagentcanvas-context';

    const prompt = buildTerminalPrompt(workflowId, artifact, outputFolder);

    // Create the terminal with a descriptive name
    const termName = `AAC: ${workflowId} ${artifactId}`;
    const termOptions: vscode.TerminalOptions = {
      name: termName,
      message: `${agentRole} executing ${workflowId} on ${artifactId}`,
      location: vscode.TerminalLocation.Panel,
    };

    const terminal = vscode.window.createTerminal(termOptions);

    // Start accumulating terminal output for webview modal display
    let accumulatedData = '';
    // onDidWriteData is not available in all VS Code versions (added in 1.72,
    // but may not be present in the @types/vscode version or the runtime).
    // Check it exists before trying to subscribe.
    let dataListener: vscode.Disposable = { dispose: () => {} };
    if (typeof (terminal as any).onDidWriteData === 'function') {
      dataListener = (terminal as any).onDidWriteData((data: string) => {
        accumulatedData += data;

        // Stream new data to any attached webview callback
        const cb = this.webviewStreams.get(artifactId);
        if (cb) {
          try {
            cb(data);
          } catch {
            // Webview may have been disposed
            this.webviewStreams.delete(artifactId);
          }
        }
      });
    } else {
      logger.debug('[TerminalExecutor] onDidWriteData not available — terminal output streaming disabled');
    }

    terminal.show(true);

    // Send the command to the terminal
    try {
      if (prompt.length > 8192) {
        // Long prompt — write to temp file and have CLI read it
        const tmpDir = os.tmpdir();
        const promptFile = path.join(
          tmpDir,
          `aac-agentic-${sanitizeId(artifactId)}-${Date.now()}.md`
        );
        fs.mkdirSync(path.dirname(promptFile), { recursive: true });
        fs.writeFileSync(promptFile, prompt, 'utf-8');

        const args = buildCliCommand(provider, prompt);
        const cmd = args[0];
        const rest = args.slice(1).filter((a) => a !== prompt);

        const cliArgs = rest.length > 0 ? ` ${rest.map(a => shellQuote(a)).join(' ')}` : '';
        const quotedFile = shellQuote(promptFile);

        const terminalLine = isPowerShell()
          // PowerShell: Get-Content pipes file content as stdin to the command
          ? `Get-Content ${quotedFile} | & ${cmd}${cliArgs}`
          // bash/zsh/cmd.exe: stdin redirect
          : `${cmd}${cliArgs} < ${quotedFile}`;
        terminal.sendText(terminalLine, true);
      } else {
        const args = buildCliCommand(provider, prompt);
        const cmdLine = args.map((a) => shellQuote(a)).join(' ');
        terminal.sendText(cmdLine, true);
      }
    } catch (err) {
      logger.error(
        `[TerminalExecutor] Failed to send command: ${errMsg(err)}`
      );
      terminal.sendText(
        `echo "Error launching ${provider}: ${errMsg(err)}"`,
        true
      );
    }

    // Track the session
    const session: TerminalSession = {
      terminal,
      sessionId,
      workflowId,
      artifactId,
      artifactType: artifact?.type || 'unknown',
      agentRole,
      provider,
      startedAt: new Date().toISOString(),
      accumulatedData,
      dataListener,
    };
    this.activeTerminals.set(artifactId, session);

    logger.info(
      `[TerminalExecutor] Launched terminal "${termName}" (${provider}) for ${artifactId}`
    );

    return sessionId;
  }

  /**
   * Bring the terminal for a given artifact to the foreground.
   * Returns true if a terminal was found and focused.
   */
  jumpToTerminal(artifactId: string): boolean {
    const session = this.activeTerminals.get(artifactId);
    if (!session) {
      return false;
    }

    try {
      session.terminal.show(true);
      return true;
    } catch {
      // Terminal may have been disposed externally
      this.activeTerminals.delete(artifactId);
      return false;
    }
  }

  /**
   * Get the terminal session for an artifact, if one is active.
   */
  getTerminalSession(artifactId: string): TerminalSession | undefined {
    return this.activeTerminals.get(artifactId);
  }

  /**
   * Get the accumulated terminal output for an artifact.
   * Returns empty string if no session is active.
   */
  getTerminalOutput(artifactId: string): string {
    return this.activeTerminals.get(artifactId)?.accumulatedData ?? '';
  }

  /**
   * Attach a webview streaming callback for a terminal session.
   * The callback receives each chunk of terminal output as it arrives.
   * Returns a disposable to detach the stream.
   */
  attachWebviewStream(artifactId: string, callback: (data: string) => void): vscode.Disposable {
    this.webviewStreams.set(artifactId, callback);
    return {
      dispose: () => {
        if (this.webviewStreams.get(artifactId) === callback) {
          this.webviewStreams.delete(artifactId);
        }
      },
    };
  }

  /**
   * Clean up tracking when a terminal is closed.
   */
  private onDidCloseTerminal(closed: vscode.Terminal): void {
    for (const [artifactId, session] of this.activeTerminals.entries()) {
      if (session.terminal === closed) {
        logger.debug(
          `[TerminalExecutor] Terminal closed for ${artifactId} — cleaning up tracking`
        );
        this.activeTerminals.delete(artifactId);

        // Release the concurrency lock so the artifact can be moved again
        concurrencyQueue.release(artifactId);

        // Record completion trace
        try {
          getTraceRecorder().record({
            sessionId: session.sessionId,
            type: 'decision',
            agent: `terminal-${session.provider}`,
            data: {
              decision: `completed ${session.workflowId} (terminal closed)`,
              artifactId,
              artifactType: session.artifactType,
            },
          });
        } catch {
          // Trace recorder may not be initialized
        }
        break;
      }
    }
  }

  dispose(): void {
    this.activeTerminals.clear();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const terminalExecutor = new TerminalExecutor();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Infer a display-friendly agent role name from a workflow ID. */
function inferRoleFromWorkflow(workflowId: string): string {
  const roleMap: Record<string, string> = {
    'dev-story': 'Crafter',
    'code-review': 'Reviewer',
    'sprint-planning': 'Planner',
    'story-enhancement': 'Analyst',
    'epic-enhancement': 'Analyst',
    'create-prd': 'Strategist',
  };
  return roleMap[workflowId] || 'Agent';
}
