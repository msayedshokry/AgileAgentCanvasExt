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
// `os` import dropped: temp-file+stdin branch was removed (claude `-p`,
// codex `exec`, gemini `-p`, opencode `run` all require the prompt as a
// positional arg value and do NOT read it from stdin). The rationale for
// dropping the long-prompt stdin-redirect path is documented at the
// `terminal.sendText` call site in `executeTerminalWorkflow`.
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { promisify } from 'util';
import { getTraceRecorder } from '../trace/trace-recorder';
import { concurrencyQueue } from './concurrency-queue';
import { agentHealthMonitor } from './agent-health-monitor';
import { createTerminalHealthChecks } from './terminal-health-checks';
import {
  getSelectedProvider,
  listAvailableProviders,
  CHAT_COMMANDS,
  shellQuote,
  isPowerShell,
  type ChatProviderId,
} from '../commands/chat-bridge';
import {
  sanitizeId as sanitizeResultId,
  resultFilePath,
  readVerdictFile,
  getOutputFolder,
  type KanbanVerdict,
} from './kanban-verdict';

import { getActivePtyBackend } from './embedded-terminal-provider';

import { errMsg } from '../utils/error';
import { inferRoleFromWorkflow } from '../harness/role-inference';
import { PONYTAIL_HEURISTICS } from '../chat/ponytail-heuristics';
import { budgetEnforcer } from './budget-enforcer';

const execAsync = promisify(cp.exec);

// ─── Process liveness ────────────────────────────────────────────────────────

/**
 * Check whether a process with the given PID is still alive.
 * Uses `tasklist` on Windows, `/proc/<pid>/stat` on Linux/Mac.
 * Never throws — returns false on any error.
 *
 * Issue: #15 — Replace hardcoded isAlive() with actual process liveness check.
 */
export async function checkProcessAlive(pid: number): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /NH`, {
        timeout: 3000,
        windowsHide: true,
      });
      // If the process exists, stdout contains a line like:
      //   Code.exe  12345  Console  1  1,234,567 K
      // If not, stdout contains: "INFO: No tasks are running..."
      return stdout.includes(`${pid}`);
    }
    // Linux / macOS — try /proc first (Linux), fall back to kill(pid, 0)
    // (signal 0 = existence check, works on macOS and Linux).
    try {
      await fs.promises.access(`/proc/${pid}/stat`, fs.constants.R_OK);
      return true;
    } catch {
      // /proc not available (macOS) — fall through to kill(0) check
    }
    // Signal 0 is a null signal that checks if the caller has permission
    // to signal the process. On the same user account it returns true iff
    // the process exists; ESRCH (no such process) throws.
    return process.kill(pid, 0);
  } catch {
    return false;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TerminalSession {
  /** VS Code terminal instance; undefined for pty (embedded) sessions. */
  terminal?: vscode.Terminal;
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
  /** Gap #23: prompt length in characters for terminal cost estimation. */
  promptLength?: number;
  /** True when the session runs via node-pty (Option B) instead of a VS Code terminal. */
  isPty?: boolean;
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
export function buildTerminalPrompt(
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
- For NEEDS_FIXES, include a "fix_requests" array describing each failing criterion.

---

## Minimalist Engineering Principles (apply before adding code)

Before writing or modifying code in this terminal session, work through this mandatory hierarchy in order. Skip a step once an earlier step rules it out. Every step must leave a brief justification in your reasoning:

1. Necessity — Does it need to exist at all? YAGNI is the default.
2. Standard Library — Can the language or platform standard library do it already?
3. Native Platform — Can the host platform (VS Code, Node, the OS) do it natively?
4. Existing Dependencies — Can a dependency already in package.json or requirements.txt do it?
5. Simplicity (one-liner) — Can this be a single line of obvious code?
6. Implementation — Only now write it. Prefer the most boring correct form.

Not lazy about: input validation at trust boundaries; error handling that surfaces real failures; security and accessibility fundamentals; calibration required by real hardware; anything explicitly requested by the user.

Verification: any non-trivial logic must leave behind a runnable check (a small test file or an assert-based demo — no heavy framework needed). Trivial one-liners need no test. Mark intentional simplifications with the // ponytail: comment convention so reviewers can spot ponytail-driven decisions at review time.

For reference, here is the authoritative Ponytail hierarchy block (verbatim):

${PONYTAIL_HEURISTICS}
`;
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

// ─── Shell detection + quoting ───────────────────────────────────────────────
// Both `isPowerShell()` and `shellQuote()` are imported from chat-bridge.ts
// (the canonical home). terminal-executor used to carry its own PowerShell-
// aware copies; they duplicated the logic without adding value, so they
// were collapsed to a single import in chat-bridge.ts. The import block
// at the top of this file brings them into the local scope.

// ─── Filename sanitization ───────────────────────────────────────────────────

/**
 * Replace characters that are unsafe in filenames with hyphens.
 * Preserves alphanumeric, hyphen, underscore, and dot — everything else
 * becomes a hyphen. Consecutive hyphens are collapsed to one.
 */
export const sanitizeId = sanitizeResultId;

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

    // ── Gap #48: pre-flight CLI-availability check ─────────────────────────
    // resolveAgenticProvider() falls back to 'claude' even when no CLI is
    // on PATH. Without this check, the terminal launches and immediately
    // fails with "command not found" → closes → executeAndAwaitVerdict
    // returns UNKNOWN after the 3s poll interval. The user sees a
    // misleading toast: "Terminal closed without a verdict file."
    //
    // We now verify that the resolved CLI binary is actually available
    // (listAvailableProviders does a `which`/`where` PATH scan) and
    // return undefined immediately if not — the caller surfaces a clear
    // BLOCKED verdict with actionable instructions.
    try {
      const available = await listAvailableProviders();
      const entry = available.find(a => a.id === provider);
      if (entry && !entry.available) {
        logger.warn(
          `[TerminalExecutor] ${provider} not found on PATH — cannot launch terminal`,
        );
        return undefined;
      }
    } catch {
      // PATH scan itself failed — proceed optimistically (the terminal
      // will surface the error if the binary really is missing).
    }

    const agentRole = inferRoleFromWorkflow(workflowId);
    const sessionId = `term-${workflowId}-${artifactId}-${Date.now()}`;

    // Generate trace entry for the terminal execution
    const executionMode = getActivePtyBackend() ? 'pty' : 'vscode-terminal';
    try {
      getTraceRecorder().record({
        sessionId,
        type: 'decision',
        agent: `terminal-${provider}`,
        data: {
          decision: `started ${workflowId} via ${executionMode} (${provider})`,
          artifactId,
          artifactType: artifact?.type || 'unknown',
          rationale: `Terminal-based agentic execution using ${provider} (mode: ${executionMode})`,
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

    const termName = `AAC: ${workflowId} ${artifactId}`;
    const args = buildCliCommand(provider, prompt);
    const cmdLine = args.map((a) => shellQuote(a)).join(' ');

    // ── Branch: embedded pty vs VS Code terminal ────────────────────────────
    const ptyBackend = getActivePtyBackend();

    if (ptyBackend) {
      // ── Option B: embedded pty (bidirectional, no VS Code terminal) ──
      logger.info(`[TerminalExecutor] Launching pty session for ${artifactId} (${provider})`);

      let accumulatedData = '';
      let lastOutputAt = Date.now();

      // Spawn the pty shell process keyed by artifactId so onSessionExit
      // can look up the session directly.
      ptyBackend.spawnSession(artifactId);

      // Attach a stream listener for output accumulation + webview streaming
      const ptyDisposable = ptyBackend.attach(artifactId, (chunk: string) => {
        accumulatedData += chunk;
        lastOutputAt = Date.now();
        this.scheduleLockTimeout(artifactId);

        const cb = this.webviewStreams.get(artifactId);
        if (cb) {
          try { cb(chunk); } catch { this.webviewStreams.delete(artifactId); }
        }
      });

      // Write the CLI command to the shell via pty
      try {
        ptyBackend.write(artifactId, cmdLine + '\n');
      } catch (err) {
        logger.error(`[TerminalExecutor] Failed to write command to pty: ${errMsg(err)}`);
      }

      const session: TerminalSession = {
        terminal: undefined,
        sessionId,
        workflowId,
        artifactId,
        artifactType: artifact?.type || 'unknown',
        agentRole,
        provider,
        startedAt: new Date().toISOString(),
        accumulatedData,
        dataListener: ptyDisposable,
        promptLength: prompt.length,
        isPty: true,
      };
      this.activeTerminals.set(artifactId, session);

      // P1 #11: schedule lock-release timeout
      this.scheduleLockTimeout(artifactId);

      // Issue #21: register output-stall health checks. No PID is available
      // for pty sessions, so the liveness check always returns true (the
      // onSessionExit callback handles explicit termination).
      const terminalAdapter = {
        isAlive: () => true,
        getLastOutputTime: () => lastOutputAt,
      };
      const artifactAdapter = {
        lastModified: lastOutputAt,
        getLastModifiedTime: () => lastOutputAt,
      };
      for (const check of createTerminalHealthChecks(terminalAdapter, artifactAdapter)) {
        agentHealthMonitor.registerCheck(sessionId, check);
      }
      session.healthSessionId = sessionId;
      session.lastOutputAt = lastOutputAt;

      this.persistSessionMetadata();

      logger.info(
        `[TerminalExecutor] Launched pty session "${termName}" (${provider}) for ${artifactId}`,
      );

      return sessionId;
    }

    // ── Option A: VS Code terminal (existing path) ─────────────────────────
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

    // ── RACE GUARD (fixes kanban-agentic launch on Windows/PowerShell) ─────
    // Await the terminal's processId BEFORE sendText. On PowerShell (the
    // user's default shell on Windows), there is a measurable warm-up gap
    // between `createTerminal()` returning and stdin being attached to
    // the new shell subprocess. Synchronously calling terminal.sendText
    // (with the constructed cmdLine) after createTerminal results in the
    // typed text sitting at the prompt — without a CR/LF PowerShell
    // accepts as "submit" — and the CLI agent never starts. The kanban
    // HUD prints "Launching: …" but the artifact does not advance.
    //
    // Awaiting `processId` is the documented VS Code gate: it resolves
    // once the shell subprocess has been spawned. We capture `pid` in the
    // same await so the health monitor's process-liveness check (Issue
    // #15) sees the correct value from launch — not `undefined` for the
    // first tick after send. Wrapped in try/catch defensively (processId
    // is a Thenable that resolves with `number | undefined`; this does
    // not reject in normal operation, but isolating it keeps any
    // unexpected shell-host failure from masking the sendText fallback
    // path below).
    let pid: number | undefined;
    try {
      pid = await terminal.processId;
    } catch (err) {
      logger.warn(`[TerminalExecutor] processId await failed: ${errMsg(err)}`);
    }

    // Send the command to the terminal.
    //
    // Headless CLIs (claude -p, codex exec, gemini -p, opencode run) all
    // REQUIRE the prompt as a positional arg value — they do NOT read it
    // from stdin. The previous long-prompt branch wrote the prompt to a
    // temp file and fed it via `< file` (bash) / `Get-Content | & cmd`
    // (PowerShell), which only worked because the old `terminalLaunch`
    // returned plain `[claude, q]` — Claude at that point still accepted
    // `claude < /tmp/prompt.md` as "run a fresh interactive session with
    // whatever comes from stdin". With the new headless invocations
    // (`claude -p`, `codex exec`, …) stdin piped to `-p` would be ignored
    // because `-p` has no positional value, leaving the CLI to fail with
    // a usage error. The fix: always include `q` in args via shellQuote.
    //
    // Trade-off: prompts > ~32 KB may exceed Windows cmd.exe ARG_MAX. The
    // BMAD workflow prompts generated by `buildTerminalPrompt` are bounded
    // by the artifact JSON + skill content (typically 5–15 KB); well under
    // the limit. Revisit only if we start shipping flows with ≥32 KB
    // prompts — at that point we can plumb a separate `terminalLaunchLong`
    // hook per provider instead of dropping-in the stdin path inline.
    try {
      terminal.sendText(cmdLine, true);
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
      promptLength: prompt.length,
    };
    this.activeTerminals.set(artifactId, session);

    // Issue #15: pid was captured above (BEFORE sendText, so the health
    // monitor's process-liveness check sees the correct value from
    // launch time). If processId is still unavailable (older VS Code
    // builds), fall back to the legacy always-alive behavior.

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
      isAlive: pid !== undefined
        ? () => checkProcessAlive(pid)
        : () => true, // fallback: can't determine PID, assume alive
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
      // Gap #48: distinguish "no CLI on PATH" from other launch failures.
      // When the pre-flight check caught a missing binary, the message
      // tells the user exactly what to install instead of the generic
      // "Terminal failed to launch".
      const provider = await resolveAgenticProvider();
      try {
        const available = await listAvailableProviders();
        const entry = available.find(a => a.id === provider);
        if (entry && !entry.available) {
          return {
            verdict: 'BLOCKED',
            summary: `No headless CLI available on PATH. Install ${provider === 'claude' ? 'Claude Code (docs.claude.com)' : provider === 'codex' ? 'OpenAI Codex CLI (developers.openai.com/codex)' : provider === 'gemini-cli' ? 'Gemini CLI (github.com/google-gemini/gemini-cli)' : provider === 'aider' ? 'Aider (aider.chat)' : provider === 'opencode' ? 'OpenCode (opencode.ai)' : provider} or configure another in VS Code settings → agileagentcanvas.chatProvider.`,
          };
        }
      } catch {
        // PATH scan itself failed — use the generic message.
      }
      return { verdict: 'UNKNOWN', summary: 'Terminal failed to launch' };
    }

    // Gap #23: capture the prompt length now while the session is
    // guaranteed to still be alive. The session may be cleaned up by
    // onDidCloseTerminal before the verdict poll resolves (the common
    // path: CLI writes verdict file, then the terminal closes, then
    // the next poll tick finds the file). We stash the prompt length
    // so cost can still be estimated even when the session is gone.
    const capturedPromptLength = this.activeTerminals.get(artifactId)?.promptLength ?? 0;

    const timeoutMs = options?.timeoutMs ?? 20 * 60 * 1000; // 20 minutes
    const pollIntervalMs = options?.pollIntervalMs ?? 3000;
    const startedAt = Date.now();

    return await new Promise<KanbanVerdict>((resolve) => {
      const finish = (v: KanbanVerdict) => {
        clearInterval(timer);
        // Gap #23: record terminal CLI costs so the budget gauge reflects
        // Claude Code / Codex / Gemini / Aider / OpenCode spend. Uses the
        // captured prompt length (safe even if the session was cleaned up).
        this.recordTerminalCost(artifactId, sessionId, v, capturedPromptLength);
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
    // Pity sessions have no VS Code terminal to focus — the webview grid
    // is the only "terminal" UI. Still return true so callers know the
    // session is alive.
    if (session.isPty) {
      return true;
    }

    try {
      session.terminal!.show(true);
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
      if (session.isPty) {
        await getActivePtyBackend()?.kill(artifactId);
      } else if (session.terminal) {
        session.terminal.dispose();
      }
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
      name: s.terminal?.name ?? `pty:${s.artifactId}`,
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
        name: s.terminal?.name ?? (s.isPty ? `pty:${s.artifactId}` : `AAC: ${s.workflowId} ${s.artifactId}`),
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
  /**
   * Called by the message handler when a pty session exits (node-pty
   * onExit callback). Mirrors the cleanup that onDidCloseTerminal does
   * for VS Code terminals: clears tracking, lock timeout, health checks,
   * and the concurrency lock.
   */
  onPtySessionExit(artifactId: string, _exitCode?: number): void {
    const session = this.activeTerminals.get(artifactId);
    if (!session?.isPty) return;

    logger.debug(
      `[TerminalExecutor] Pty session exited for ${artifactId} — cleaning up tracking`,
    );
    this.activeTerminals.delete(artifactId);

    this.persistSessionMetadata();
    this.clearLockTimeout(artifactId);

    if (session.healthSessionId) {
      try { agentHealthMonitor.deregisterCheck(session.healthSessionId); }
      catch (err) { logger.debug(`[TerminalExecutor] deregisterCheck failed: ${errMsg(err)}`); }
    }

    concurrencyQueue.release(artifactId);

    try {
      getTraceRecorder().record({
        sessionId: session.sessionId,
        type: 'decision',
        agent: `terminal-${session.provider}`,
        data: {
          decision: `completed ${session.workflowId} (pty exited)`,
          artifactId,
          artifactType: session.artifactType,
        },
      });
    } catch {
      // Trace recorder may not be initialized
    }
  }

  /** Skip pty sessions — they don't have VS Code terminals to close. */
  private onDidCloseTerminal(closed: vscode.Terminal): void {
    for (const [artifactId, session] of this.activeTerminals.entries()) {
      if (session.isPty) continue; // pty sessions cleaned up via onPtySessionExit
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

  /**
   * Gap #23: estimate and record the cost of a terminal CLI execution.
   * Uses the same chars/4 heuristic as `estimateTokens()` in cost-tracker
   * for consistency with chat-based cost tracking. Input tokens are
   * estimated from the captured prompt length (safe from session-cleanup
   * races); output tokens from the accumulated terminal output (best-effort
   * — may be 0 if the session was already cleaned up).
   */
  private recordTerminalCost(
    artifactId: string,
    sessionId: string,
    verdict: KanbanVerdict,
    capturedPromptLength: number,
  ): void {
    // Only record meaningful spend — skip UNKNOWN/launch-failure verdicts
    if (!verdict || verdict.verdict === 'UNKNOWN') return;
    try {
      // Best-effort: lookup session for accumulated output (may be cleaned up).
      // The captured prompt length is always available — the session was alive
      // when we captured it right after executeTerminalWorkflow returned.
      const session = this.activeTerminals.get(artifactId);
      const outputLen = session?.accumulatedData?.length ?? 0;
      const inputTokens = Math.ceil(capturedPromptLength / 4);
      const outputTokens = Math.ceil(outputLen / 4);
      // Always record at minimum the input cost — the prompt was sent regardless
      // of whether the terminal output is still available.
      if (inputTokens <= 0 && outputTokens <= 0) return;
      const model = `terminal-${session?.provider ?? 'unknown'}`;
      budgetEnforcer.recordSpend(artifactId, sessionId, model, inputTokens, outputTokens);
      logger.debug(
        `[TerminalExecutor] Recorded terminal cost for ${artifactId}: ${inputTokens}+${outputTokens} tokens (${model})`,
      );
    } catch (err) {
      // Best effort — don't fail the verdict for cost tracking errors
      logger.debug(`[TerminalExecutor] Failed to record terminal cost: ${errMsg(err)}`);
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
