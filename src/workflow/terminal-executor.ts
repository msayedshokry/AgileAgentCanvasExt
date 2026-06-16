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
import { agentHealthMonitor } from './agent-health-monitor';
import { createTerminalHealthChecks } from './terminal-health-checks';
import {
  getSelectedProvider,
  listAvailableProviders,
  CHAT_COMMANDS,
  type ChatProviderId,
} from '../commands/chat-bridge';
import {
  sanitizeId as sanitizeResultId,
  resultFilePath,
  readVerdictFile,
  getOutputFolder,
  type KanbanVerdict,
} from './kanban-verdict';

import { errMsg } from '../utils/error';
import { inferRoleFromWorkflow } from '../harness/role-inference';

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
  /** Issue #21: sessionId used to register per-terminal health checks. */
  healthSessionId?: string;
  /** Issue #21: last update time (ms epoch) for the output-progress health check. */
  lastOutputAt?: number;
}

/** vscode.Terminal has onDidWriteData at runtime but it's not in the type defs. */
interface WritableTerminal extends vscode.Terminal {
  onDidWriteData: (callback: (data: string) => void) => vscode.Disposable;
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
  outputFolder: string,
  skillContent?: string
): string {
  const artifactType = artifact?.type || 'unknown';
  const artifactId = artifact?.id || 'unknown';
  const artifactJson = JSON.stringify(artifact, null, 2);
  const resultPath = resultFilePath(outputFolder, artifactId, workflowId);

  // Inject the actual SKILL definition (entry/exit gates, output schema) so the
  // agent enforces the gates instead of having to discover the file itself.
  const skillSection = skillContent
    ? `## Workflow Definition (authoritative — follow exactly)\n\`\`\`markdown\n${skillContent}\n\`\`\`\n\n`
    : '';

  return `You are executing a BMAD methodology workflow as a headless terminal agent.

## Workflow
- **Workflow ID:** ${workflowId}
- **Artifact Type:** ${artifactType}
- **Artifact ID:** ${artifactId}

${skillSection}## Artifact Context
\`\`\`json
${artifactJson}
\`\`\`

## Instructions
1. Execute the "${workflowId}" BMAD workflow on this artifact, honoring its entry/exit gates.
2. If a "Workflow Definition" section is provided above, it is authoritative — follow its gates and output schema exactly. Otherwise read resources/_aac/ for the workflow steps.
3. Read the artifact store at ${outputFolder} for related artifacts and context.
4. If the artifact metadata contains \`fixRequests\`, address EVERY one before reporting completion.
5. When finished, write your structured verdict JSON (the schema in the Output Format / Workflow Definition) to EXACTLY this path:
   ${resultPath}

## Important — verdict contract
- This is a non-interactive terminal session — complete the workflow fully.
- The result file MUST be valid JSON and MUST include a top-level "verdict" field
  (one of: COMPLETED, APPROVED, NEEDS_FIXES, BLOCKED).
- The orchestrator reads this file to decide whether to advance the card. If the
  file is missing or has no verdict, the card will NOT advance.
- For NEEDS_FIXES, include a "fix_requests" array describing each failing criterion.`;
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
export const sanitizeId = sanitizeResultId;

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
  /** P1 #11: lock-release timeouts keyed by artifactId (cleared on terminal close) */
  private lockTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  /** Default max lock duration for terminal-run workflows (20 minutes) */
  private static readonly LOCK_TIMEOUT_MS = 20 * 60 * 1000;
  /** Issue #35: cap on per-session persisted buffer in terminal-sessions.json.
   *  Live chat/agent output rarely exceeds 100KB; 200KB gives a safety margin
   *  while keeping the meta file small enough for fast reads. */
  private static readonly MAX_PERSISTED_BUFFER = 200 * 1024;

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
    store: any,
    options?: { skillContent?: string }
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

    const prompt = buildTerminalPrompt(workflowId, artifact, outputFolder, options?.skillContent);

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
    let lastOutputAt = Date.now();
    // onDidWriteData is not available in all VS Code versions (added in 1.72,
    // but may not be present in the @types/vscode version or the runtime).
    // Check it exists before trying to subscribe.
    let dataListener: vscode.Disposable = { dispose: () => {} };
    if (typeof (terminal as WritableTerminal).onDidWriteData === 'function') {
      dataListener = (terminal as WritableTerminal).onDidWriteData((data: string) => {
        accumulatedData += data;
        // Issue #21: keep the health-check output-progress timer fresh.
        lastOutputAt = Date.now();

        // P1 #11 heartbeat: every chunk of terminal output refreshes the
        // lock-release timeout so long-running workflows don't have their
        // locks expired prematurely. Without this, any BMAD workflow that
        // legitimately runs > 20 minutes would be force-unlocked even
        // though it's actively producing output.
        this.scheduleLockTimeout(artifactId);

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

    // P1 #11: schedule a lock-release timeout so a forgotten/hung terminal
    // doesn't keep the artifact locked forever. The timeout is cleared when
    // the terminal closes naturally. Uses the same 20-minute window as
    // executeAndAwaitVerdict.
    this.scheduleLockTimeout(artifactId);

    // Issue #21: register per-terminal health checks with AgentHealthMonitor.
    // These run on the monitor's polling loop and emit 'dead' transitions
    // when the terminal process is gone, output has stalled, or the artifact
    // hasn't changed — AutoRecovery listens for those and kills + releases.
    const terminalAdapter = {
      isAlive: () => true, // process liveness is tracked via onDidCloseTerminal
      getLastOutputTime: () => lastOutputAt,
    };
    const artifactAdapter = {
      lastModified: lastOutputAt,
      getLastModifiedTime: () => lastOutputAt,
    };
    for (const check of createTerminalHealthChecks(terminalAdapter, artifactAdapter)) {
      agentHealthMonitor.registerCheck(sessionId, check);
    }
    // Store the health session id on the session so the close-handler
    // can deregister without a side-channel map.
    (session as TerminalSession).healthSessionId = sessionId;
    (session as TerminalSession).lastOutputAt = lastOutputAt;

    // Persist session metadata so the terminal-recovery scanner can find
    // orphaned sessions after a VS Code restart.
    this.persistSessionMetadata();

    logger.info(
      `[TerminalExecutor] Launched terminal "${termName}" (${provider}) for ${artifactId}`
    );

    return sessionId;
  }

  /**
   * Launch a terminal workflow and await its structured verdict.
   *
   * Deletes any stale result file first, launches the CLI agent, then polls for
   * the result file to appear (or the terminal to close). Returns UNKNOWN if no
   * parseable verdict is produced within the timeout — callers MUST treat
   * UNKNOWN as "stop and ask the human", never as success.
   */
  async executeAndAwaitVerdict(
    workflowId: string,
    artifact: any,
    store: any,
    options?: { skillContent?: string; timeoutMs?: number; pollIntervalMs?: number }
  ): Promise<KanbanVerdict> {
    const artifactId = artifact?.id;
    if (!artifactId) {
      return { verdict: 'UNKNOWN', summary: 'No artifact id' };
    }

    const outputFolder = getOutputFolder();
    const resultPath = resultFilePath(outputFolder, artifactId, workflowId);

    // Remove any stale result so we only react to THIS run's output.
    try {
      if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
    } catch {
      // best effort
    }

    const sessionId = await this.executeTerminalWorkflow(workflowId, artifact, store, {
      skillContent: options?.skillContent,
    });
    if (!sessionId) {
      return { verdict: 'UNKNOWN', summary: 'Terminal failed to launch' };
    }

    const timeoutMs = options?.timeoutMs ?? 20 * 60 * 1000; // 20 minutes
    const pollIntervalMs = options?.pollIntervalMs ?? 3000;
    const startedAt = Date.now();

    return await new Promise<KanbanVerdict>((resolve) => {
      const finish = (v: KanbanVerdict) => {
        clearInterval(timer);
        resolve(v);
      };

      const timer = setInterval(() => {
        // 1. Result file present → parse and finish.
        const verdict = readVerdictFile(resultPath);
        if (verdict) {
          finish(verdict);
          return;
        }

        // 2. Terminal closed without producing a file → one last read, else UNKNOWN.
        const stillRunning = this.activeTerminals.has(artifactId);
        if (!stillRunning) {
          const late = readVerdictFile(resultPath);
          finish(late ?? { verdict: 'UNKNOWN', summary: 'Terminal closed without a verdict file' });
          return;
        }

        // 3. Timeout.
        if (Date.now() - startedAt >= timeoutMs) {
          finish({ verdict: 'UNKNOWN', summary: `No verdict within ${Math.round(timeoutMs / 60000)}m` });
        }
      }, pollIntervalMs);
    });
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
   * Force-kill the terminal for an artifact. Used by the auto-recovery
   * flow when a 'dead' health transition is observed. Idempotent — if no
   * terminal is active, this is a no-op.
   */
  async killTerminal(artifactId: string): Promise<void> {
    const session = this.activeTerminals.get(artifactId);
    if (!session) return;
    try {
      session.terminal.dispose();
      logger.info(`[TerminalExecutor] Killed terminal for ${artifactId}`);
    } catch (err) {
      logger.warn(`[TerminalExecutor] Failed to kill terminal for ${artifactId}: ${errMsg(err)}`);
    }
  }

  /**
   * Find AAC-named terminal sessions that are still active. Used by the
   * terminal-recovery module on activation to detect orphans from a
   * previous run.
   */
  findOrphanedSessions(): Array<{ sessionId: string; artifactId: string; pid?: number; name: string; startedAt: number }> {
    return Array.from(this.activeTerminals.values()).map(s => ({
      sessionId: s.sessionId,
      artifactId: s.artifactId,
      // processId is a Thenable<number|undefined> in newer @types/vscode —
      // the recovery flow tolerates a missing pid (treats as 'terminal-lost'),
      // so leaving it undefined here is correct.
      name: s.terminal.name,
      startedAt: Date.parse(s.startedAt),
    }));
  }

  /** Look up the artifact ID for a given session ID (for auto-recovery). */
  getArtifactIdForSession(sessionId: string): string | undefined {
    for (const session of this.activeTerminals.values()) {
      if (session.sessionId === sessionId) return session.artifactId;
    }
    return undefined;
  }

  /** Look up the artifact ID for a given terminal ID (for auto-recovery). */
  getTerminalIdForSession(sessionId: string): string | undefined {
    return this.getArtifactIdForSession(sessionId);
  }

  /**
   * Persist terminal session metadata to disk so orphan detection survives
   * VS Code restarts. Each session entry also carries a truncated
   * `accumulatedData` ("buffer") snapshot capped at MAX_PERSISTED_BUFFER so
   * the autonomy lifecycle can replay the most recent chunks on reconnect
   * (#35). We persist on every workflow start AND on terminal close so the
   * latest output is always recoverable after a crash.
   */
  private persistSessionMetadata(): void {
    try {
      const outputFolder = path.join(
        (vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? process.cwd()),
        vscode.workspace.getConfiguration('agileagentcanvas').get<string>('outputFolder', '.agileagentcanvas-context'),
      );
      const filePath = path.join(outputFolder, 'terminal-sessions.json');
      const sessions = Array.from(this.activeTerminals.values()).map(s => ({
        sessionId: s.sessionId,
        artifactId: s.artifactId,
        name: s.terminal.name,
        startedAt: Date.parse(s.startedAt),
        // Issue #35: truncate to keep terminal-sessions.json bounded. Live
        // output typically runs to <100KB; cap at 200KB as a safety margin.
        buffer: s.accumulatedData.length > TerminalExecutor.MAX_PERSISTED_BUFFER
          ? s.accumulatedData.slice(-TerminalExecutor.MAX_PERSISTED_BUFFER)
          : s.accumulatedData,
      }));
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(sessions, null, 2), 'utf-8');
    } catch {
      // Best effort — terminal recovery already has a fallback path.
    }
  }

  /**
   * Read the persisted output buffer for an artifactId from
   * terminal-sessions.json. Returns the empty string if the artifact isn't
   * persisted (e.g. never started after a fresh install) or the file is
   * corrupt. Used by the autonomy lifecycle's `terminalReconnected`
   * broadcast to provide `bufferedData` when the in-memory accumulator is
   * empty (the common case after a VS Code restart).
   *
   * Issue: #35 — terminalReconnected outbound broadcast.
   */
  getPersistedOutput(artifactId: string): string {
    try {
      const outputFolder = path.join(
        (vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? process.cwd()),
        vscode.workspace.getConfiguration('agileagentcanvas').get<string>('outputFolder', '.agileagentcanvas-context'),
      );
      const filePath = path.join(outputFolder, 'terminal-sessions.json');
      if (!fs.existsSync(filePath)) return '';
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return '';
      const match = parsed.find((entry: any) => entry && entry.artifactId === artifactId);
      return typeof match?.buffer === 'string' ? match.buffer : '';
    } catch {
      // Corrupt file or transient read failure — best effort, return empty.
      return '';
    }
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

        // Update persisted metadata after terminal close.
        this.persistSessionMetadata();

        // P1 #11: clear the lock-release timeout since the terminal
        // closed naturally — no need to force-release.
        this.clearLockTimeout(artifactId);

        // Issue #21: deregister per-terminal health checks so the monitor
        // stops polling a dead session.
        if (session.healthSessionId) {
          try { agentHealthMonitor.deregisterCheck(session.healthSessionId); }
          catch (err) { logger.debug(`[TerminalExecutor] deregisterCheck failed: ${errMsg(err)}`); }
        }

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

  /**
   * P1 #11: schedule a timeout that force-releases the concurrency lock if
   * the terminal hasn't closed within LOCK_TIMEOUT_MS (20 minutes).
   */
  private scheduleLockTimeout(artifactId: string): void {
    this.clearLockTimeout(artifactId);
    const timeout = setTimeout(() => {
      logger.warn(`[TerminalExecutor] Lock timeout reached for ${artifactId} — force-releasing lock`);
      concurrencyQueue.release(artifactId);
      this.lockTimeouts.delete(artifactId);
    }, TerminalExecutor.LOCK_TIMEOUT_MS);
    this.lockTimeouts.set(artifactId, timeout);
  }

  private clearLockTimeout(artifactId: string): void {
    const existing = this.lockTimeouts.get(artifactId);
    if (existing) {
      clearTimeout(existing);
      this.lockTimeouts.delete(artifactId);
    }
  }

  dispose(): void {
    this.activeTerminals.clear();
    for (const t of this.lockTimeouts.values()) { clearTimeout(t); }
    this.lockTimeouts.clear();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const terminalExecutor = new TerminalExecutor();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Infer a display-friendly agent role name from a workflow ID. */
