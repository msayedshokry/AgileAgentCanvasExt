// ─── Terminal Executor ────────────────────────────────────────────────────────
// Spawns VS Code terminals to execute BMAD workflows via CLI agents (Claude
// Code, Codex, Aider, OpenCode, Pi) when no Copilot Chat session is
// active. Replaces the [E2-STUB] log with actual agentic execution.
//
// Terminals are named "AAC: {workflowId} {artifactId} ({role})" and tracked
// per artifact so the kanban can offer a "Jump to terminal" action.

import { createLogger } from '../utils/logger';
const logger = createLogger('terminal-executor');
import * as vscode from 'vscode';
// Prompts are staged to private files and delivered per harness adapter
// (stdin, pointer argument, or --message-file); see ./harness/.
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { promisify } from 'util';
import { getTraceRecorder } from '../trace/trace-recorder';
import { concurrencyQueue } from './concurrency-queue';
import { agentHealthMonitor } from './agent-health-monitor';
import { createTerminalHealthChecks } from './terminal-health-checks';
import { BOARD_MCP_SERVER, buildHarnessLaunch, type BoardMcpLaunch, type HarnessAdapter, type HarnessId } from './harness/harness-adapters';
import { type HarnessResolution } from './harness/harness-resolver';
import { agentRunBlockReason, resolveBoardHarness, resolveEffectivePosture } from './harness/board-harness';
import { buildCommandLine, detectShellKind, type ShellKind } from './harness/shell-command';
import { promptDir, stagePromptFile, disposePromptFile as disposeStagedPrompt } from './harness/prompt-staging';
import { RunJournal } from './harness/run-journal';
import { checkWatchdog, resolveWatchdogPolicy } from './harness/run-watchdog';
import { buildContextReceipt, summarizeReceipt, type ReceiptItem } from './harness/context-receipt';
import { CardSessionStore, cardSessionKey, planSession, recordAfterRun, type SessionPlan } from './harness/card-session';
import { appendRunHistory, type RunHistoryEntry } from './harness/run-history';
import { assignedAgent, isPerson, personBlockReason, readAgentTeam, type TeamAgent } from './harness/agent-team';
import type { EpicContext } from './harness/epic-context';
import { latestProgressLine, ProgressThrottle } from './harness/progress-line';
import { buildAgentBrief, buildResumeBrief, readAgentNotes } from './harness/agent-brief';
import { listSkills, materializeSkills } from './harness/skill-catalog';
import { readClaudeRunUsage, type RunUsage } from './harness/run-usage';

/** What a running card's agent is doing now; the board shows it on the card. */
export const agentProgress = new vscode.EventEmitter<{ artifactId: string; line: string }>();

/** The board's live channel (views/board-live.ts registers it): board tools during a run. */
export interface BoardLiveHook {
  /** dist/board-mcp.js, the MCP shim a CLI starts. */
  readonly shimPath: string;
  /** The endpoint URL, starting it on first use; undefined when it can't run. */
  endpoint(): Promise<string | undefined>;
  issue(scope: { runId: string; cardId: string; agentId?: string; agentName?: string }): string;
  revoke(token: string, cardId: string): void;
}
let boardLive: BoardLiveHook | undefined;

export function setBoardLive(hook: BoardLiveHook | undefined): void {
  boardLive = hook;
}

/** Finds the context attached to a card's epic (views/board-protocol.ts registers it). */
export type EpicContextResolver = (cardId: string) => { epicId: string; context: EpicContext } | undefined;
let epicContextOf: EpicContextResolver | undefined;

export function setEpicContextResolver(resolver: EpicContextResolver | undefined): void {
  epicContextOf = resolver;
}

/** Every finished run's verdict, with the agent that ran it (see views/board-protocol.ts). */
export interface AgentVerdictEvent {
  readonly artifactId: string;
  readonly workflowId: string;
  readonly verdict: KanbanVerdict;
  readonly agent?: TeamAgent;
}
export const agentVerdicts = new vscode.EventEmitter<AgentVerdictEvent>();

/** Counts for the card's Activity feed: what the agent asked of the board. */
function boardSummary(v: KanbanVerdict): RunHistoryEntry['board'] | undefined {
  const b = v.board;
  const dropped = v.boardDropped ?? [];
  if (!b && !v.lead && dropped.length === 0) return undefined;
  return {
    questions: b?.questions.length ?? 0,
    proposals: (b?.proposals.length ?? 0) + (v.lead?.stories.length ?? 0),
    ...(b?.handoff ? { handoffTo: b.handoff.to } : {}),
    ...(v.lead ? { assigned: v.lead.assign.length } : {}),
    notes: !!b?.notes,
    ...(dropped.length ? { dropped } : {}),
  };
}
import {
  sanitizeId as sanitizeResultId,
  resultFilePath,
  readVerdictFile,
  verdictMatchesRun,
  getOutputFolder,
  type KanbanVerdict,
} from './kanban-verdict';

import { getActivePtyBackend } from './embedded-terminal-provider';

import { errMsg } from '../utils/error';
import { inferRoleFromWorkflow } from '../harness/role-inference';
import { PONYTAIL_HEURISTICS } from '../chat/ponytail-heuristics';
import { budgetEnforcer } from './budget-enforcer';
import { costTracker } from '../chat/cost-tracker';
import { readCliUsage } from './harness/cli-usage';
import { ensureProjectContext, readProjectContext } from './harness/project-context';
import { pathWithoutWindowsApps, shouldRunNodeTestsInProcess, userNodeVersion } from './harness/windows-sandbox';

/** Create project-context.md on first use and return its text (never throws). */
function loadProjectContext(outputFolder: string): string | undefined {
  try {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) ensureProjectContext(root, outputFolder);
    return readProjectContext(outputFolder, root) || undefined;
  } catch (err) {
    logger.debug(`[TerminalExecutor] project context unavailable: ${errMsg(err)}`);
    return undefined;
  }
}

const execAsync = promisify(cp.exec);

// ─── Process liveness ────────────────────────────────────────────────────────

// ponytail: workspace file snapshot — used to synthesize COMPLETED verdicts
// when the agent does the work but never writes the verdict JSON. Excludes
// noise dirs (.git, node_modules, .vscode) AND specific internal-state files
// this extension writes every time any agent runs (concurrency-queue-state,
// terminal-sessions, trace buffers) — without these, the synth false-positives
// on tracker noise every time a pi runs and doesn't write source code.
const FILE_DIFF_EXCLUDES = new Set(['.git', 'node_modules', '.vscode']);
// Also exclude specific files inside `.agileagentcanvas-context/` that the
// extension itself rewrites on every agent run. Done as a prefix match rather
// than a full path so it survives the user renaming `outputFolder`.
const INTERNAL_STATE_PREFIXES = [
  '.agileagentcanvas-context/concurrency-queue-state.json',
  '.agileagentcanvas-context/terminal-sessions.json',
  '.agileagentcanvas-context/traces/',
];
export type WorkspaceSnapshot = Map<string, number>;

export function captureWorkspaceSnapshot(rootDir?: string): WorkspaceSnapshot {
  const cwd = rootDir ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const out: WorkspaceSnapshot = new Map();
  if (!cwd) return out;
  const stack: string[] = [cwd];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (FILE_DIFF_EXCLUDES.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(cwd, abs).replace(/\\/g, '/');
      // Internal-state file inside .agileagentcanvas-context/? Then also skip
      // — but only those specific prefixes, not the whole folder (the user
      // may store their own epics/stories there).
      if (rel.startsWith('.agileagentcanvas-context/') &&
          INTERNAL_STATE_PREFIXES.some(p => rel.startsWith(p))) {
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        try { out.set(rel, fs.statSync(abs).mtimeMs); } catch { /* ENOENT etc */ }
      }
    }
  }
  return out;
}

export function diffWorkspaceSnapshots(before: WorkspaceSnapshot, after: WorkspaceSnapshot): string[] {
  const changed: string[] = [];
  for (const [file, mtime] of after) {
    if (before.get(file) !== mtime) changed.push(file);
  }
  for (const file of before.keys()) {
    if (!after.has(file)) changed.push(file); // deletions count as work
  }
  return changed;
}

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
  provider: HarnessId;
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
  /** Temp file holding a staged long prompt; deleted when the session ends. */
  promptFile?: string;
  /** True when the session runs via node-pty (Option B) instead of a VS Code terminal. */
  isPty?: boolean;
}

/** vscode.Terminal has onDidWriteData at runtime but it's not in the type defs. */
interface WritableTerminal extends vscode.Terminal {
  onDidWriteData: (callback: (data: string) => void) => vscode.Disposable;
}

// ─── Harness resolution ──────────────────────────────────────────────────────
// Which CLI runs a board step is decided by ./harness/harness-resolver.ts
// (explicit setting → chat-provider match → first installed CLI → VS Code LM
// → BLOCKED). There is no silent fallback to a CLI that is not installed.

/** Runs the step through a language model when no CLI harness is available. */
export type LanguageModelRunner = () => Promise<KanbanVerdict>;

export interface HarnessRunOptions {
  skillContent?: string;
  /** Required for the VS Code LM fallback; without it an LM resolution is BLOCKED. */
  lmRunner?: LanguageModelRunner;
  /** Pre-resolved harness (callers that already resolved avoid a second PATH probe). */
  resolution?: HarnessResolution;
  /** Column to return the card to if this run is lost to a reload or crash. */
  revertStatusOnInterrupt?: string;
  /** Working copy the agent runs in (the card's git worktree); defaults to the workspace. */
  cwd?: string;
  /** Always start a new agent conversation (recurring jobs must not grow one session forever). */
  freshSession?: boolean;
  /**
   * Instructions that change every run (the lead's runbook with the current
   * board state). Sent on resumed runs too, where `skillContent` is not.
   */
  turnContext?: string;
}

/** Output folder for a run: inside the card's worktree when it has one, so sandboxed agents may write there. */
export function runOutputFolder(cwd?: string): string {
  const configured = vscode.workspace.getConfiguration('agileagentcanvas').get<string>('outputFolder', '.agileagentcanvas-context') ?? '.agileagentcanvas-context';
  return !cwd || path.isAbsolute(configured) ? getOutputFolder() : path.join(cwd, configured);
}

/** Prefix a pty command line with a change of directory (VS Code terminals take cwd directly). */
function withCwd(cmdLine: string, cwd: string | undefined, kind: ShellKind): string {
  if (!cwd) return cmdLine;
  const dir = cwd.replace(/\\/g, '/');
  if (kind === 'powershell') return `Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'; ${cmdLine}`;
  if (kind === 'cmd') return `cd /d "${dir}" && ${cmdLine}`;
  return `cd '${dir.replace(/'/g, "'\\''")}' && ${cmdLine}`;
}

/** Launch outcome for a single harness run. */
export type HarnessLaunch =
  | { kind: 'cli'; sessionId: string }
  | { kind: 'lm'; verdict: Promise<KanbanVerdict> }
  | { kind: 'blocked'; verdict: KanbanVerdict };

/** Minimal artifact shape the launcher reads; the full artifact is serialised into the prompt. */
export type HarnessArtifact = { id?: string; type?: string } & Record<string, unknown>;

function blocked(summary: string): KanbanVerdict {
  return { verdict: 'BLOCKED', summary };
}

// ─── Prompt building ─────────────────────────────────────────────────────────

/**
 * Build a comprehensive prompt for the terminal CLI agent.
 * Includes BMAD workflow context, artifact data, and instructions to
 * update the artifact store when finished.
 */
/** The verdict-file contract every run prompt opens with. */
function verdictContract(resultPath: string, runId?: string): string {
  return `## ⛔ Required first action — verdict contract

You are running as a non-interactive headless agent. Before you do ANY other work in this session, you MUST understand and follow this contract:

- When you finish (success or failure), write a verdict JSON to EXACTLY this file path:
  \`\`\`
  ${resultPath}
  \`\`\`
- The file MUST contain valid JSON with a top-level \`"verdict"\` field, one of:
  \`COMPLETED\` · \`APPROVED\` · \`NEEDS_FIXES\` · \`BLOCKED\`
- For \`NEEDS_FIXES\`, include a top-level \`"fix_requests"\` array describing each failing criterion.
${runId ? `- Include \`"run_id": "${runId}"\` in the JSON so the orchestrator can match it to this run.\n` : ''}- If the file does NOT exist or has no \`"verdict"\` field, the card stays stuck in \`in-progress\` forever. The orchestrator will NOT advance without it.
- This file write is MANDATORY — do not skip it even if the rest of the work succeeded.

If parent directory \`_terminal-output/\` does not exist, create it first.

`;
}

/**
 * Prompt for a run that resumes the card's previous agent conversation (see
 * harness/card-session.ts). The workflow definition, project context and
 * engineering guidance are already in that conversation — and in the CLI's
 * prompt cache — so this turn carries only what changed: a new verdict
 * contract for this run and the card as it is now, including any fix
 * requests from review.
 */
export function buildResumePrompt(
  workflowId: string,
  artifact: { readonly id?: unknown } | undefined,
  outputFolder: string,
  runId?: string,
  brief?: string,
  turnContext?: string,
): string {
  const artifactId = typeof artifact?.id === 'string' && artifact.id ? artifact.id : 'unknown';
  const resultPath = resultFilePath(outputFolder, artifactId, workflowId);
  return `${verdictContract(resultPath, runId)}${brief ? `${brief.trimEnd()}

` : ''}---

# Continue: ${workflowId} on ${artifactId}

This continues your earlier session on this card. The workflow definition, project context and engineering principles you were given then still apply — do not re-read them unless you need to. The verdict file path and run id above are NEW for this run; the earlier ones are void.

${turnContext ? `## This run
${turnContext}

` : ''}## The card now
\`\`\`json
${JSON.stringify(artifact, null, 2)}
\`\`\`

## Instructions
1. Check what changed since your last turn: review comments, \`fixRequests\` in the card metadata, and the current state of the files you touched.
2. Address EVERY fix request before reporting completion.
3. Write your verdict JSON to the path in the ⛔ section above.
`;
}

export function buildTerminalPrompt(
  workflowId: string,
  artifact: any,
  outputFolder: string,
  skillContent?: string,
  runId?: string,
  projectContext?: string,
  brief?: string,
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
  // Project commands + convention files (project-context.md), so the agent
  // uses the repo's own test/build commands instead of guessing.
  const contextSection = projectContext
    ? `## Project Context (from the team — follow it)\n${projectContext}\n\n`
    : '';

  // ponytail: the verdict contract is the FIRST instruction the model sees,
  // not the last. Agents were treating the BMAD workflow narrative as the
  // task and the file-write as busy-work, leaving the verdict JSON on disk
  // as missing/UNKNOWN. Putting the contract at the top surfaces it before
  // the model overloads on the workflow narrative below.
  return `${verdictContract(resultPath, runId)}${brief ? `${brief.trimEnd()}

` : ''}---

# BMAD Workflow Run

You are executing a BMAD methodology workflow as a headless terminal agent.

## Workflow
- **Workflow ID:** ${workflowId}
- **Artifact Type:** ${artifactType}
- **Artifact ID:** ${artifactId}

${skillSection}${contextSection}## Artifact Context
\`\`\`json
${artifactJson}
\`\`\`

## Instructions
1. Execute the "${workflowId}" BMAD workflow on this artifact, honoring its entry/exit gates.
2. If a "Workflow Definition" section is provided above, it is authoritative — follow its gates and output schema exactly. Otherwise read resources/_aac/ for the workflow steps.
3. Read the artifact store at ${outputFolder} for related artifacts and context.
4. If the artifact metadata contains \`fixRequests\`, address EVERY one before reporting completion.
5. After the workflow completes (success or failure), write your structured verdict JSON to the path in the ⛔ section at the top of this prompt.

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

// ─── Output tail ─────────────────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex -- matches ANSI escape sequences by design
const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(\u0007|\u001b\\)/g;
const TAIL_LINES = 8;
const TAIL_CHARS = 800;

/** Last few meaningful lines of terminal output, ANSI codes removed. */
export function outputTail(text: string | undefined): string {
  if (!text) return '';
  const lines = text.slice(-20_000).replace(ANSI_PATTERN, '').split(/\r?\n/)
    .map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
  const tail = lines.slice(-TAIL_LINES).join('\n');
  return tail.length > TAIL_CHARS ? '…' + tail.slice(-TAIL_CHARS) : tail;
}

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
  /** Tail of each finished session's output, so a missing verdict can say why. */
  private lastOutput = new Map<string, string>();
  /** Live time of each running session's latest output, read by the run watchdog. */
  private lastOutputTimes = new Map<string, number>();
  private readonly progress = new ProgressThrottle();
  /** Runs with board tools: their token and credential files, released when the run ends. */
  private readonly boardRuns = new Map<string, { token: string; cardId: string; files: string[] }>();
  /** Agent conversation each run started or resumed, keyed by run id (see harness/card-session.ts). */
  private sessionPlans = new Map<string, SessionPlan>();
  /** What context each run was given, keyed by run id (see harness/context-receipt.ts). */
  private receipts = new Map<string, ReceiptItem[]>();
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

  /** Resolve which harness runs the next board step (see harness-resolver.ts). */
  resolveHarness(harnessOverride?: string): Promise<HarnessResolution> {
    return resolveBoardHarness(harnessOverride);
  }

  /** Tell the board what the agent is doing now (throttled; see harness/progress-line.ts). */
  private reportProgress(artifactId: string, output: string): void {
    const line = this.progress.offer(artifactId, latestProgressLine(output), Date.now());
    if (line) agentProgress.fire({ artifactId, line });
  }

  /** The agent brief for this run (harness/agent-brief.ts); the short form when resuming. */
  private briefFor(
    artifact: HarnessArtifact, agent: TeamAgent | undefined, cliLabel: string, model: string | undefined,
    resumed: boolean, outputFolder: string, workspaceDir: string | undefined, liveTools = false,
  ): string {
    let roster: readonly TeamAgent[] = [];
    try { roster = readAgentTeam(getOutputFolder()).team.agents; } catch { /* no output folder yet */ }
    let epicContext: ReturnType<EpicContextResolver>;
    try { epicContext = artifact?.id ? epicContextOf?.(String(artifact.id)) : undefined; } catch (err) {
      logger.warn(`[TerminalExecutor] Could not read the epic context for ${String(artifact?.id)}: ${errMsg(err)}`);
    }
    const input = { agent, cliLabel, model, roster, notes: readAgentNotes(artifact), skills: this.skillsFor(agent, outputFolder, workspaceDir), liveTools, epicContext };
    return resumed ? buildResumeBrief(input) : buildAgentBrief(input);
  }

  /** Copy the agent's skills into the run's output folder so even a sandboxed agent can read them. */
  private skillsFor(agent: TeamAgent | undefined, outputFolder: string, workspaceDir: string | undefined) {
    if (!agent?.skills?.length || !workspaceDir) return undefined;
    try {
      const { skills, missing } = materializeSkills(agent.skills, listSkills(workspaceDir), path.join(outputFolder, '_terminal-output', 'skills'), workspaceDir);
      if (missing.length) logger.warn(`[TerminalExecutor] ${agent.name}: skills not found: ${missing.join(', ')}`);
      return skills.map(({ id, name, description, path: p }) => ({ id, name, description, path: p }));
    } catch (err) {
      logger.warn(`[TerminalExecutor] Could not prepare ${agent.name}'s skills: ${errMsg(err)}`);
      return undefined;
    }
  }

  /** Board tool calls count as activity, so the watchdog doesn't stop an agent waiting on the user. */
  noteActivity(artifactId: string): void {
    if (this.lastOutputTimes.has(artifactId)) this.lastOutputTimes.set(artifactId, Date.now());
  }

  /**
   * Board tools for this run (Claude Code, Codex): a token scoped to the card,
   * a private credentials file the shim reads, and Claude's MCP config file.
   * Undefined when the endpoint can't run; the verdict's "board" object still works.
   */
  private async prepareBoardLive(
    adapter: HarnessAdapter, runId: string, artifactId: string, agent: TeamAgent | undefined, outputFolder: string,
  ): Promise<BoardMcpLaunch | undefined> {
    if (!adapter.boardTools || !boardLive) return undefined;
    const url = await boardLive.endpoint();
    if (!url) return undefined;
    const token = boardLive.issue({ runId, cardId: artifactId, agentId: agent?.id, agentName: agent?.name });
    const base = path.join(promptDir(outputFolder), `${sanitizeResultId(artifactId)}-${sanitizeResultId(runId)}`);
    const credentials = `${base}.board.json`;
    const configFile = `${base}.mcp.json`;
    const launch: BoardMcpLaunch = {
      command: process.execPath,
      args: [boardLive.shimPath, '--credentials', credentials],
      env: { ELECTRON_RUN_AS_NODE: '1' },
      configFile,
    };
    try {
      fs.mkdirSync(promptDir(outputFolder), { recursive: true });
      fs.writeFileSync(credentials, JSON.stringify({ url, token }), { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
      fs.writeFileSync(configFile, JSON.stringify({ mcpServers: { [BOARD_MCP_SERVER]: { command: launch.command, args: launch.args, env: launch.env } } }), { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
    } catch (err) {
      boardLive.revoke(token, artifactId);
      logger.warn(`[TerminalExecutor] Board tools off for ${artifactId}: ${errMsg(err)}`);
      return undefined;
    }
    this.boardRuns.set(runId, { token, cardId: artifactId, files: [credentials, configFile] });
    return launch;
  }

  /** End a run's board access: revoke its token and delete its credentials. */
  private releaseBoardLive(runId: string): void {
    const run = this.boardRuns.get(runId);
    if (!run) return;
    this.boardRuns.delete(runId);
    boardLive?.revoke(run.token, run.cardId);
    for (const file of run.files) disposeStagedPrompt(file, (e) => logger.warn(`[TerminalExecutor] board file cleanup failed: ${errMsg(e)}`));
  }

  /** The named agent a card is assigned to, if any (see harness/agent-team.ts). */
  private assigneeOf(artifactId: string): TeamAgent | undefined {
    try {
      return assignedAgent(readAgentTeam(getOutputFolder()).team, artifactId);
    } catch {
      return undefined; // no output folder yet: nothing is assigned
    }
  }

  /**
   * Single-shot launch used by manual lane drags. Returns the session id of
   * the CLI run, an `lm-…` id when the step runs through a language model,
   * or undefined when no harness can run it (the user is told why).
   */
  async executeTerminalWorkflow(
    workflowId: string,
    artifact: HarnessArtifact,
    store: unknown,
    options?: HarnessRunOptions,
  ): Promise<string | undefined> {
    const launch = await this.launchHarness(workflowId, artifact, store, options);
    switch (launch.kind) {
      case 'cli':
        return launch.sessionId;
      case 'lm':
        return `lm-${workflowId}-${artifact?.id}-${Date.now()}`;
      default:
        void vscode.window.showWarningMessage(`Agile Agent Canvas: ${launch.verdict.summary}`);
        return undefined;
    }
  }

  /**
   * Resolve a harness and start the run. CLI runs return their session id
   * (the verdict arrives via the result file); LM runs return the verdict
   * promise; when nothing can run, a BLOCKED verdict says what to install.
   */
  async launchHarness(
    workflowId: string,
    artifact: HarnessArtifact,
    store: unknown,
    options?: HarnessRunOptions,
  ): Promise<HarnessLaunch> {
    const artifactId = artifact?.id;
    if (!artifactId) {
      logger.warn('[TerminalExecutor] Cannot execute — no artifact ID');
      return { kind: 'blocked', verdict: blocked('Artifact has no id') };
    }

    const trustBlock = agentRunBlockReason();
    if (trustBlock) return { kind: 'blocked', verdict: blocked(trustBlock) };

    const assignee = this.assigneeOf(artifactId);
    if (isPerson(assignee)) return { kind: 'blocked', verdict: blocked(personBlockReason(assignee!.name)) };
    const resolution = options?.resolution ?? await this.resolveHarness(assignee?.harness);
    if (assignee) logger.info(`[TerminalExecutor] ${artifactId} is assigned to ${assignee.name} (${assignee.harness})`);
    this.lastOutput.delete(artifactId);
    this.lastOutputTimes.delete(artifactId);
    this.progress.forget(artifactId);
    if (resolution.kind === 'none') {
      logger.warn(`[TerminalExecutor] No harness for ${artifactId}: ${resolution.message}`);
      return { kind: 'blocked', verdict: blocked(resolution.message) };
    }
    if (resolution.kind === 'lm') {
      if (!options?.lmRunner) {
        return { kind: 'blocked', verdict: blocked('No CLI harness installed and this action cannot use the VS Code language model.') };
      }
      logger.info(`[TerminalExecutor] ${artifactId} → VS Code language model (${resolution.reason})`);
      return { kind: 'lm', verdict: options.lmRunner() };
    }

    const { adapter, binary } = resolution;
    const posture = await resolveEffectivePosture();
    // Only probed when it can matter (sandboxed on Windows); cached after the first run.
    const nodeVersion = process.platform === 'win32' && posture === 'sandboxed' ? await userNodeVersion() : undefined;
    // Codex's Windows sandbox cannot launch Store app aliases (e.g. its pick of shell, pwsh.exe).
    const terminalEnv = adapter.id === 'codex' && process.platform === 'win32' && posture === 'sandboxed'
      ? pathWithoutWindowsApps(process.env)
      : undefined;
    const provider: HarnessId = adapter.id;
    const agentRole = inferRoleFromWorkflow(workflowId);
    const sessionId = `term-${workflowId}-${artifactId}-${Date.now()}`;
    const outputFolder = runOutputFolder(options?.cwd);
    const resultPath = resultFilePath(outputFolder, artifactId, workflowId);

    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const sessionPlan = options?.freshSession ? undefined : this.planCardSession(adapter, artifactId, workflowId, options?.cwd ?? workspaceDir);
    // A resumed conversation already holds the full brief; send only the new turn.
    const resumed = sessionPlan?.resume === true;
    const projectContext = resumed ? undefined : loadProjectContext(outputFolder);
    const board = await this.prepareBoardLive(adapter, sessionId, artifactId, assignee, outputFolder);
    const brief = this.briefFor(artifact, assignee, adapter.label, assignee?.harness === adapter.id ? assignee.model : undefined, resumed, outputFolder, options?.cwd ?? workspaceDir, !!board);
    const prompt = resumed
      ? buildResumePrompt(workflowId, artifact, outputFolder, sessionId, brief, options?.turnContext)
      : buildTerminalPrompt(workflowId, artifact, outputFolder, options?.skillContent, sessionId, projectContext, brief);
    this.recordReceipt(sessionId, artifactId, {
      harness: provider, prompt, resumed, workflowId,
      skillContent: options?.skillContent,
      projectContext,
      artifactJson: JSON.stringify(artifact ?? {}),
      readFile: (rel) => {
        const dir = options?.cwd ?? workspaceDir;
        try { return dir ? fs.readFileSync(path.join(dir, rel), 'utf-8') : undefined; } catch { return undefined; }
      },
    });
    let promptFile: string;
    try {
      fs.mkdirSync(path.dirname(resultPath), { recursive: true });
      promptFile = stagePromptFile(outputFolder, artifactId, sessionId, prompt);
    } catch (err) {
      this.receipts.delete(sessionId);
      return { kind: 'blocked', verdict: blocked(`Could not stage the prompt file: ${errMsg(err)}`) };
    }

    const ptyBackend = getActivePtyBackend();
    // The embedded pty spawns powershell.exe on Windows and bash elsewhere
    // (node-pty-terminal-backend.ts); VS Code terminals use the user's default shell.
    const shellKind: ShellKind = ptyBackend
      ? detectShellKind(undefined, process.platform)
      : detectShellKind(vscode.env.shell, process.platform);
    let cmdLine: string;
    try {
      if (sessionPlan) this.sessionPlans.set(sessionId, sessionPlan);
      const session = sessionPlan ? { id: sessionPlan.sessionId, resume: sessionPlan.resume } : undefined;
      // The assignee's model applies only when its CLI is the one running this step.
      const model = assignee?.harness === adapter.id ? assignee.model : undefined;
      const inProcessNodeTests = shouldRunNodeTestsInProcess(process.platform, posture, nodeVersion);
      const spec = buildHarnessLaunch(adapter, { binary, promptFile, resultPath, posture, workspaceDir, session, model, inProcessNodeTests, ...(board ? { board } : {}) });
      cmdLine = buildCommandLine(spec, shellKind);
    } catch (err) {
      disposeStagedPrompt(promptFile);
      this.releaseBoardLive(sessionId);
      this.sessionPlans.delete(sessionId);
      this.receipts.delete(sessionId);
      return { kind: 'blocked', verdict: blocked(errMsg(err)) };
    }

    const executionMode = ptyBackend ? 'pty' : 'vscode-terminal';
    try {
      getTraceRecorder().record({
        sessionId,
        type: 'decision',
        agent: `terminal-${provider}`,
        data: {
          decision: `started ${workflowId} via ${executionMode} (${provider}, ${posture})`,
          artifactId,
          artifactType: artifact?.type || 'unknown',
          rationale: `Harness ${adapter.label} chosen: ${resolution.reason}; shell ${shellKind}`,
        },
      });
    } catch {
      // Trace recorder may not be initialized
    }

    const termName = `AAC: ${workflowId} ${artifactId}`;

    // ── Branch: embedded pty vs VS Code terminal ────────────────────────────

    if (ptyBackend) {
      // ── Option B: embedded pty (bidirectional, no VS Code terminal) ──
      logger.info(`[TerminalExecutor] Launching pty session for ${artifactId} (${provider})`);

      let accumulatedData = '';
      let lastOutputAt = Date.now();

      // Spawn the pty shell process keyed by artifactId so onSessionExit
      // can look up the session directly.
      ptyBackend.spawnSession(artifactId, undefined, undefined, undefined, terminalEnv);

      // Attach a stream listener for output accumulation + webview streaming
      const ptyDisposable = ptyBackend.attach(artifactId, (chunk: string) => {
        accumulatedData += chunk;
        lastOutputAt = Date.now();
        this.lastOutputTimes.set(artifactId, lastOutputAt);
        this.reportProgress(artifactId, accumulatedData);
        this.scheduleLockTimeout(artifactId);

        const cb = this.webviewStreams.get(artifactId);
        if (cb) {
          try { cb(chunk); } catch { this.webviewStreams.delete(artifactId); }
        }
      });

      // Write the CLI command to the shell via pty
      try {
        ptyBackend.write(artifactId, withCwd(cmdLine, options?.cwd, shellKind) + '\n');
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
        promptFile,
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

      this.journalRun({ sessionId, artifactId, artifactType: artifact?.type || 'unknown', workflowId, harness: provider, terminalName: termName, resultPath, revertTo: options?.revertStatusOnInterrupt });
      return { kind: 'cli', sessionId };
    }

    // ── Option A: VS Code terminal (existing path) ─────────────────────────
    const termOptions: vscode.TerminalOptions = {
      name: termName,
      message: `${agentRole} executing ${workflowId} on ${artifactId}`,
      location: vscode.TerminalLocation.Panel,
      ...(options?.cwd ? { cwd: options.cwd } : {}),
      ...(terminalEnv ? { env: terminalEnv } : {}),
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
        this.lastOutputTimes.set(artifactId, lastOutputAt);
        this.reportProgress(artifactId, accumulatedData);

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

    // Send the command line. The prompt never travels on it: it is staged to
    // a private file and piped to stdin or referenced by path (harness/
    // harness-adapters.ts), so ConPTY paste limits and PS 5.1 argv mangling
    // cannot corrupt it.
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
      promptFile,
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

    this.journalRun({ sessionId, artifactId, artifactType: artifact?.type || 'unknown', workflowId, harness: provider, terminalName: termName, resultPath, revertTo: options?.revertStatusOnInterrupt });
    return { kind: 'cli', sessionId };
  }

  /** Append to the user-visible run history (Show Agent Run History). Never throws. */
  private recordReceipt(runId: string, artifactId: string, input: Parameters<typeof buildContextReceipt>[0]): void {
    try {
      const receipt = buildContextReceipt(input);
      this.receipts.set(runId, receipt);
      logger.info(`[TerminalExecutor] ${artifactId} context: ${summarizeReceipt(receipt)}`);
    } catch (err) {
      logger.warn(`[TerminalExecutor] Could not build the context receipt: ${errMsg(err)}`);
    }
  }

  /** Start or resume this card's agent conversation, when the CLI and settings allow it. */
  private planCardSession(adapter: HarnessAdapter, artifactId: string, workflowId: string, cwd: string | undefined): SessionPlan | undefined {
    const enabled = vscode.workspace.getConfiguration('agileagentcanvas').get<boolean>('agents.resumeSessions', true);
    if (!adapter.sessionResume || !enabled || !cwd) return undefined;
    try {
      const key = cardSessionKey(artifactId, workflowId, adapter.id);
      const plan = planSession(key, CardSessionStore.inFolder(getOutputFolder()).get(key), cwd);
      logger.info(`[TerminalExecutor] ${artifactId}: ${plan.resume ? 'resuming' : 'starting'} agent session ${plan.sessionId}`);
      return plan;
    } catch (err) {
      logger.warn(`[TerminalExecutor] Could not plan a card session: ${errMsg(err)}`);
      return undefined;
    }
  }

  /** Keep the run's session for the next run on the card, or mark it unsafe to resume. */
  private recordCardSession(runId: string, verdict: KanbanVerdict): void {
    const plan = this.sessionPlans.get(runId);
    if (!plan) return;
    this.sessionPlans.delete(runId);
    try {
      CardSessionStore.inFolder(getOutputFolder()).set(plan.key, recordAfterRun(plan, verdict.verdict, verdict.summary, Date.now()));
    } catch (err) {
      logger.warn(`[TerminalExecutor] Could not record the card session: ${errMsg(err)}`);
    }
  }

  private recordHistory(entry: RunHistoryEntry): void {
    try {
      appendRunHistory(getOutputFolder(), entry);
    } catch (err) {
      logger.warn(`[TerminalExecutor] Could not record run history: ${errMsg(err)}`);
    }
  }

  /** Record the run so a reload mid-run can be resolved (see harness/run-recovery.ts). */
  private journalRun(r: { sessionId: string; artifactId: string; artifactType: string; workflowId: string; harness: string; terminalName: string; resultPath: string; revertTo?: string }): void {
    try {
      RunJournal.inFolder(getOutputFolder()).add({
        runId: r.sessionId, artifactId: r.artifactId, artifactType: r.artifactType, workflowId: r.workflowId,
        harness: r.harness, terminalName: r.terminalName, resultPath: r.resultPath, startedAt: Date.now(),
        ...(r.revertTo ? { revertTo: r.revertTo } : {}),
      });
    } catch (err) {
      logger.warn(`[TerminalExecutor] Could not journal run ${r.sessionId}: ${errMsg(err)}`);
    }
  }

  private unjournalRun(runId: string): void {
    try {
      RunJournal.inFolder(getOutputFolder()).remove(runId);
    } catch (err) {
      logger.warn(`[TerminalExecutor] Could not clear journaled run ${runId}: ${errMsg(err)}`);
    }
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
    options?: HarnessRunOptions & { timeoutMs?: number; pollIntervalMs?: number; signal?: AbortSignal }
  ): Promise<KanbanVerdict> {
    const artifactId = artifact?.id;
    if (!artifactId) {
      return { verdict: 'UNKNOWN', summary: 'No artifact id' };
    }

    const outputFolder = runOutputFolder(options?.cwd);
    const resultPath = resultFilePath(outputFolder, artifactId, workflowId);

    // Remove any stale result so we only react to THIS run's output.
    try {
      if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
    } catch {
      // best effort
    }

    // ponytail: capture workspace files BEFORE the terminal launches so the
    // verdict-poll loop can synthesize a verdict from a real file diff if the
    // agent does the work but never writes the verdict JSON. Ground truth —
    // independent of model cooperation with the verdict-write contract.
    const baselineSnapshot = captureWorkspaceSnapshot(options?.cwd);

    const launch = await this.launchHarness(workflowId, artifact, store, {
      skillContent: options?.skillContent,
      lmRunner: options?.lmRunner,
      resolution: options?.resolution,
      revertStatusOnInterrupt: options?.revertStatusOnInterrupt,
      cwd: options?.cwd,
      freshSession: options?.freshSession,
    });
    const startedAtMs = Date.now();
    const history = (runId: string, harness: string, v: KanbanVerdict, usage?: RunUsage) => {
      const context = this.receipts.get(runId);
      this.receipts.delete(runId);
      const assignee = this.assigneeOf(artifactId);
      const agent = assignee?.name;
      const model = assignee?.harness === harness ? assignee.model : undefined;
      const board = boardSummary(v);
      this.recordHistory({
        runId, artifactId, workflowId, harness, verdict: v.verdict, summary: v.summary, startedAt: startedAtMs, finishedAt: Date.now(),
        ...(agent ? { agent } : {}), ...(model ? { model } : {}), ...(usage ? { usage } : {}),
        ...(board ? { board } : {}), ...(context ? { context } : {}),
      });
      // The board protocol applier (views/board-protocol.ts) acts on what the agent asked for.
      agentVerdicts.fire({ artifactId, workflowId, verdict: v, agent: assignee });
    };
    if (launch.kind === 'blocked') {
      history(`blocked-${startedAtMs}`, 'none', launch.verdict);
      return launch.verdict;
    }
    if (launch.kind === 'lm') {
      const v = await launch.verdict;
      history(`lm-${workflowId}-${artifactId}-${startedAtMs}`, 'vscode-lm', v);
      return v;
    }
    const sessionId = launch.sessionId;
    const harnessId = this.activeTerminals.get(artifactId)?.provider ?? 'unknown';
    if (options?.signal?.aborted) {
      await this.killTerminal(artifactId);
      return { verdict: 'UNKNOWN', summary: 'Run aborted' };
    }

    // Gap #23: capture the prompt length now while the session is
    // guaranteed to still be alive. The session may be cleaned up by
    // onDidCloseTerminal before the verdict poll resolves (the common
    // path: CLI writes verdict file, then the terminal closes, then
    // the next poll tick finds the file). We stash the prompt length
    // so cost can still be estimated even when the session is gone.
    const capturedPromptLength = this.activeTerminals.get(artifactId)?.promptLength ?? 0;

    // Judge the run on silence, not wall-clock time: an agent that keeps
    // producing output keeps running up to the ceiling. An explicit
    // `timeoutMs` from the caller is honoured as the ceiling.
    const agentSettings = vscode.workspace.getConfiguration('agileagentcanvas');
    const watchdog = resolveWatchdogPolicy(
      { idleMinutes: agentSettings.get('agents.idleTimeoutMinutes'), maxRunMinutes: agentSettings.get('agents.maxRunMinutes') },
      options?.timeoutMs,
    );
    const pollIntervalMs = options?.pollIntervalMs ?? 3000;
    const startedAt = Date.now();

    return await new Promise<KanbanVerdict>((resolve) => {
      let done = false;
      const finish = (v: KanbanVerdict) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        this.unjournalRun(sessionId);
        this.releaseBoardLive(sessionId);
        options?.signal?.removeEventListener('abort', onAbort);
        // Gap #23: record terminal CLI costs so the budget gauge reflects
        // CLI spend. Uses the captured prompt length (safe even if the
        // session was cleaned up).
        this.recordTerminalCost(artifactId, sessionId, v, capturedPromptLength, harnessId, startedAtMs);
        // Tokens from the CLI's own transcript (Claude Code; see harness/run-usage.ts).
        const plan = this.sessionPlans.get(sessionId);
        const usage = plan && harnessId === 'claude' ? readClaudeRunUsage(plan.cwd, plan.sessionId, startedAtMs) : undefined;
        this.recordCardSession(sessionId, v);
        history(sessionId, harnessId, v, usage);
        resolve(v);
      };
      // Abort (Stop / Stop All Agents): kill the agent first so it cannot
      // keep writing, then report — nothing downstream commits or advances.
      const onAbort = () => {
        void this.killTerminal(artifactId).finally(() => finish({ verdict: 'UNKNOWN', summary: 'Run aborted' }));
      };
      options?.signal?.addEventListener('abort', onAbort, { once: true });

      /** A verdict from THIS run; a different run_id means a stale/zombie writer. */
      const readOwnVerdict = (): KanbanVerdict | undefined => {
        const v = readVerdictFile(resultPath);
        if (!v) return undefined;
        if (!verdictMatchesRun(v, sessionId)) {
          logger.warn(`[TerminalExecutor] ${artifactId}: ignoring verdict from run ${v.runId} (expected ${sessionId})`);
          return undefined;
        }
        return v;
      };

      const timer = setInterval(() => {
        const stillRunning = this.activeTerminals.has(artifactId);
        // 1. Result file present → parse and finish. A file without a valid
        //    verdict (e.g. "{}" written early) is only final once the agent exits.
        const verdict = readOwnVerdict();
        if (verdict && (verdict.verdict !== 'UNKNOWN' || !stillRunning)) {
          finish(verdict);
          return;
        }

        // 2. Terminal closed without producing a verdict.
        if (!stillRunning) {
          finish(this.verdictWithoutFile(artifactId, workflowId, baselineSnapshot));
          return;
        }

        // 3. Watchdog: stop a silent or over-long agent before giving up so
        //    it cannot keep writing after the lock is released and a retry starts.
        const decision = checkWatchdog(Date.now(), {
          startedAt,
          lastOutputAt: this.lastOutputTimes.get(artifactId) ?? startedAt,
        }, watchdog);
        if (decision.kind === 'stop') {
          logger.warn(`[TerminalExecutor] ${artifactId}: watchdog (${decision.reason}) — ${decision.summary}`);
          clearInterval(timer);
          void this.killTerminal(artifactId).finally(() => finish({ verdict: 'UNKNOWN', summary: decision.summary }));
        }
      }, pollIntervalMs);
    });
  }

  /**
   * The agent exited without a verdict file. By default that is UNKNOWN (the
   * orchestrator stops and asks the human). Inferring COMPLETED from changed
   * files is opt-in: concurrent agents or the user editing files make it
   * unreliable.
   */
  private verdictWithoutFile(artifactId: string, workflowId: string, baseline: WorkspaceSnapshot): KanbanVerdict {
    let changed: string[] = [];
    try {
      changed = diffWorkspaceSnapshots(baseline, captureWorkspaceSnapshot());
    } catch (err) {
      logger.warn(`[TerminalExecutor] ${artifactId} snapshot diff failed: ${errMsg(err)}`);
    }
    const synthesize = vscode.workspace
      .getConfiguration('agileagentcanvas')
      .get<boolean>('agents.synthesizeVerdictFromChanges', false);
    if (synthesize && changed.length > 0) {
      const summary =
        `Synthesized COMPLETED: agent modified ${changed.length} file(s) without writing a verdict. ` +
        `Examples: ${changed.slice(0, 3).join(', ')}.`;
      logger.warn(`[TerminalExecutor] ${artifactId} (${workflowId}) ${summary}`);
      return { verdict: 'COMPLETED', summary, raw: { synthesized: true, changedFiles: changed.slice(0, 50) } };
    }
    const base = changed.length > 0
      ? `Agent exited without writing a verdict file after changing ${changed.length} file(s) (e.g. ${changed.slice(0, 3).join(', ')}). Review the changes and move the card manually.`
      : 'Agent exited without writing a verdict file.';
    // The CLI's own last words usually name the cause (expired sign-in,
    // missing API key, unsupported model) — surface them instead of guessing.
    const tail = this.lastOutput.get(artifactId);
    return { verdict: 'UNKNOWN', summary: tail ? `${base} Last output:\n${tail}` : base };
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

  /** Kill every running agent terminal (Stop All Agents). Returns how many were killed. */
  async killAllTerminals(): Promise<number> {
    const ids = Array.from(this.activeTerminals.keys());
    await Promise.all(ids.map((id) => this.killTerminal(id)));
    return ids.length;
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
    this.lastOutput.set(artifactId, outputTail(session.accumulatedData));
    this.lastOutputTimes.delete(artifactId);
    this.unjournalRun(session.sessionId);
    this.releaseBoardLive(session.sessionId);
    disposeStagedPrompt(session.promptFile, (e) => logger.warn(`[TerminalExecutor] prompt cleanup failed: ${errMsg(e)}`));

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
        this.lastOutput.set(artifactId, outputTail(session.accumulatedData));
        this.lastOutputTimes.delete(artifactId);
        this.unjournalRun(session.sessionId);
        this.releaseBoardLive(session.sessionId);
        disposeStagedPrompt(session.promptFile, (e) => logger.warn(`[TerminalExecutor] prompt cleanup failed: ${errMsg(e)}`));

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
      logger.warn(`[TerminalExecutor] Lock timeout reached for ${artifactId} — stopping agent and releasing lock`);
      void this.killTerminal(artifactId);
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
    harnessId?: string,
    startedAtMs?: number,
  ): void {
    if (!verdict) return;
    // Measured usage first: Claude Code and Codex log exact token counts locally.
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    if (harnessId && cwd && startedAtMs) {
      const usage = readCliUsage(harnessId, cwd, startedAtMs);
      if (usage) {
        try {
          costTracker.record(sessionId, usage.model, {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheReadTokens: usage.cacheReadTokens,
            cacheCreationTokens: usage.cacheCreationTokens,
          }, artifactId, 'api');
          logger.debug(`[TerminalExecutor] Recorded measured ${harnessId} usage for ${artifactId}: ${usage.inputTokens}+${usage.outputTokens} tokens`);
          return;
        } catch (err) {
          logger.debug(`[TerminalExecutor] Failed to record measured usage: ${errMsg(err)}`);
        }
      }
    }
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

/** 
 * Re-export shell quoting helpers so Cucumber step definitions can access them
 * via the proxyquire-loaded module. These were originally local copies within
 * terminal-executor.ts; after collapsing them into chat-bridge.ts as the
 * canonical home, the tests broke because proxyquire.noCallThru() doesn't
 * follow imports — it only sees what the module directly exports.
 */
export { isPowerShell, shellQuote } from '../commands/chat-bridge';

/** Infer a display-friendly agent role name from a workflow ID. */
