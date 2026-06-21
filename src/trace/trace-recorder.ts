import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createLogger } from '../utils/logger';
const logger = createLogger('trace-recorder');

import { errMsg } from '../utils/error';

export interface TraceEntry {
  sessionId: string;
  timestamp: string;
  type: 'tool_call' | 'llm_response' | 'artifact_change' | 'decision' | 'error' | 'handoff';
  agent: string;
  /**
   * Optional human-readable workflow name (e.g. `aac-create-prd`,
   * `aac-dev-story`, `chat`) that the entry was emitted under. Lets trace consumers answer
   * "what workflow was running when this happened?" the same way the
   * cost-tracker already answers "what workflow was the LLM spending for?".
   * Populated by:
   *   - `WorkflowExecutor.executeWithTools()` from `workflowPath`
   *     (`path.basename(path.dirname(workflowPath))` → `aac-*` skill dir name)
   *   - `ChatParticipant.handleCommand()` for ad-hoc /command-triggered workflows
   *   - `wrapToolWithDynamicTracing` reads it from `sharedToolContext`
   * Top-level (not inside `data`) so downstream indexers can group-by-workflow
   * without JSON-path digging, mirroring the pattern already established by
   * `InterruptedSession.workflowId`.
   */
  workflowName?: string;
  data: {
    toolName?: string;
    toolInput?: any;
    toolResult?: any;
    llmPrompt?: string;
    llmResponse?: string;
    artifactId?: string;
    artifactType?: string;
    changeSummary?: string;
    decision?: string;
    rationale?: string;
    error?: string;
    handoffFrom?: string;
    handoffTo?: string;
    contextSummary?: string;
  };
  durationMs?: number;
}

/** Represents a workflow session that was interrupted by extension restart. */
export interface InterruptedSession {
  sessionId: string;
  artifactId: string;
  artifactType: string;
  workflowId: string;
  startedAt: string;
  agentRole: string;
}

export class TraceRecorder implements vscode.Disposable {
  private buffers = new Map<string, TraceEntry[]>();
  private flushTimeouts = new Map<string, NodeJS.Timeout>();
  private outputFolder: string;
  private cleanupTimer: NodeJS.Timeout | undefined;
  private totalBufferedEntries = 0;

  // Safety limits to prevent unbounded memory growth
  private static readonly MAX_ENTRIES_PER_SESSION = 2000;
  private static readonly MAX_TOTAL_BUFFERED = 10000;
  private static readonly CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

  constructor(outputFolder: string) {
    this.outputFolder = path.join(outputFolder, 'traces');
    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldFiles().catch(err =>
        logger.warn(`[TraceRecorder] Cleanup failed: ${errMsg(err)}`)
      );
    }, TraceRecorder.CLEANUP_INTERVAL_MS);
  }

  record(entry: Omit<TraceEntry, 'timestamp'>): void {
    const fullEntry: TraceEntry = { ...entry, timestamp: new Date().toISOString() };

    // Enforce per-session buffer limit — drop oldest entry if exceeded
    let sessionBuffer = this.buffers.get(entry.sessionId);
    if (!sessionBuffer) {
      sessionBuffer = [];
      this.buffers.set(entry.sessionId, sessionBuffer);
    }

    if (sessionBuffer.length >= TraceRecorder.MAX_ENTRIES_PER_SESSION) {
      const dropped = sessionBuffer.shift();
      if (dropped) this.totalBufferedEntries--;
    }

    // Enforce total buffer limit — flush the largest session if exceeded
    if (this.totalBufferedEntries >= TraceRecorder.MAX_TOTAL_BUFFERED) {
      // Find the session with the most buffered entries and flush it
      let largestSession = entry.sessionId;
      let largestSize = sessionBuffer.length;
      for (const [sid, buf] of this.buffers) {
        if (buf.length > largestSize) {
          largestSize = buf.length;
          largestSession = sid;
        }
      }
      this.flush(largestSession);
      // If the flushed session was the current one, the buffer was removed
      // from the map. Re-acquire (or re-create) a fresh reference.
      if (largestSession === entry.sessionId) {
        sessionBuffer = [];
        this.buffers.set(entry.sessionId, sessionBuffer);
      }
    }

    sessionBuffer.push(fullEntry);
    this.totalBufferedEntries++;
    this.scheduleFlush(entry.sessionId);
  }

  private scheduleFlush(sessionId: string): void {
    if (this.flushTimeouts.has(sessionId)) return;
    const timeout = setTimeout(() => this.flush(sessionId), 2000);
    this.flushTimeouts.set(sessionId, timeout);
  }

  /**
   * Flush a session's buffered entries to disk immediately.
   *
   * Public so tests and tools that need read-after-write semantics can force
   * the buffer to disk without waiting for the 2-second debounce timer.
   * Production code does not need to call this — `record()` schedules its
   * own flush.
   */
  public async flush(sessionId: string): Promise<void> {
    this.flushTimeouts.delete(sessionId);
    const entries = this.buffers.get(sessionId);
    if (!entries || entries.length === 0) return;

    this.buffers.delete(sessionId);
    this.totalBufferedEntries -= entries.length;

    try {
      await fs.mkdir(this.outputFolder, { recursive: true });
      const filePath = path.join(this.outputFolder, `session-${sessionId}.jsonl`);
      const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
      await fs.appendFile(filePath, lines, 'utf-8');
    } catch (err) {
      logger.error('Failed to flush trace', { sessionId, error: errMsg(err) });
    }
  }

  async getSessionTrace(sessionId: string): Promise<TraceEntry[]> {
    const filePath = path.join(this.outputFolder, `session-${sessionId}.jsonl`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const results: TraceEntry[] = [];
      for (const line of content.split('\n').filter(Boolean)) {
        try {
          results.push(JSON.parse(line));
        } catch {
          // Skip corrupt lines — the caller still gets all valid entries
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  /**
   * Rewrite a session's trace file with all entries whose `data.decision`
   * matches `decisionValue` removed. Used by Undo-Abandon to restore the
   * session to a state where scanInterruptedSessions will resurface it.
   * Returns the number of entries removed. No-op if the file does not exist.
   * Uses an atomic temp-file + rename so a process kill mid-write cannot
   * corrupt the trace.
   */
  async removeDecision(sessionId: string, decisionValue: string): Promise<number> {
    const filePath = path.join(this.outputFolder, `session-${sessionId}.jsonl`);
    let existing: TraceEntry[];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      existing = content
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as TraceEntry);
    } catch {
      return 0;
    }
    const filtered = existing.filter(e => e.data?.decision !== decisionValue);
    const removed = existing.length - filtered.length;
    if (removed === 0) return 0;

    try {
      if (filtered.length === 0) {
        // Nothing left → unlink so scanInterruptedSessions treats this the
        // same as "no trace file" (mirrors the pre-undo state).
        await fs.unlink(filePath);
      } else {
        const tmpPath = `${filePath}.tmp`;
        const lines = filtered.map(e => JSON.stringify(e)).join('\n') + '\n';
        await fs.writeFile(tmpPath, lines, 'utf-8');
        await fs.rename(tmpPath, filePath);
      }
      logger.info(`[TraceRecorder] Removed ${removed} decision(s) matching '${decisionValue}' from session ${sessionId}`);
    } catch (err) {
      logger.error(`[TraceRecorder] Failed to rewrite trace file for ${sessionId}`, { error: errMsg(err) });
    }
    return removed;
  }

  async searchTraces(query: {
    artifactId?: string;
    agent?: string;
    type?: string;
    /**
     * Optional workflow name filter (audit follow-up to gap #20/#42).
     * Matches against the top-level `workflowName` field that chat-side and
     * workflow-executor entries now tag themselves with (e.g.
     * `aac-create-prd`, `aac-dev-story`). Use this to scope a trace view to one workflow's
     * invocations — answers "what tools fired while workflow X was running?"
     * without paging through every entry. Comparison is strict string equality
     * (no regex) to keep the filter cheap and deterministic.
     */
    workflowName?: string;
    since?: Date;
    limit?: number;
  }): Promise<TraceEntry[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.outputFolder);
    } catch {
      return [];
    }

    const maxResults = query.limit ?? 500; // hard cap to prevent memory blowout
    const sinceTime = query.since?.getTime();
    const results: TraceEntry[] = [];

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      if (results.length >= maxResults) break;

      try {
        const filePath = path.join(this.outputFolder, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter(Boolean);

        for (const line of lines) {
          if (results.length >= maxResults) break;
          try {
            const entry: TraceEntry = JSON.parse(line);
            if (query.artifactId && entry.data?.artifactId !== query.artifactId) continue;
            if (query.agent && entry.agent !== query.agent) continue;
            if (query.type && entry.type !== query.type) continue;
            // Audit follow-up to gap #20/#42: filter by top-level workflowName
            // (e.g. `aac-create-prd`). String-equality only — cheap and
            // deterministic. Older entries from before this audit (no
            // `workflowName` field) are correctly excluded when the filter is
            // set, because `undefined !== 'aac-create-prd'` evaluates to true
            // → skip. This matches the semantics callers expect: "entries
            // with no workflow attribution do not belong to a named workflow".
            if (query.workflowName && entry.workflowName !== query.workflowName) continue;
            if (sinceTime && new Date(entry.timestamp).getTime() < sinceTime) continue;
            results.push(entry);
          } catch {
            // Skip corrupt lines
          }
        }
      } catch {
        // Skip corrupt or unreadable files
      }
    }

    return results;
  }

    /**
   * Delete trace files older than the configured retention period.
   * Respects the agileagentcanvas.trace.retentionDays setting (default 30).
   */
  async cleanupOldFiles(): Promise<number> {
    try {
      await fs.mkdir(this.outputFolder, { recursive: true });
    } catch {
      return 0;
    }

    let files: string[];
    try {
      files = await fs.readdir(this.outputFolder);
    } catch {
      return 0;
    }

    const config = vscode.workspace.getConfiguration('agileagentcanvas');
    const retentionDays = config.get('trace.retentionDays', 30);
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let deleted = 0;

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      try {
        const filePath = path.join(this.outputFolder, file);
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs < cutoffMs) {
          await fs.unlink(filePath);
          deleted++;
        }
      } catch {
        // Skip files that can't be read or deleted
      }
    }

    if (deleted > 0) {
      logger.info(`[TraceRecorder] Cleaned up ${deleted} old trace file(s) (${retentionDays}d retention)`);
    }
    return deleted;
  }

  /** Returns the traces output directory (for cleanup / inspection commands). */
  getOutputFolder(): string {
    return this.outputFolder;
  }

  async flushAll(): Promise<void> {
    const sessionIds = Array.from(this.buffers.keys());
    await Promise.all(sessionIds.map(id => this.flush(id)));
  }

  /**
   * Scan all trace files for interrupted sessions — sessions that have a
   * "started" decision entry from the lane-transition agent but no
   * corresponding "completed" decision or "error" entry.
   *
   * Used on extension activation to restore agent state after a restart.
   */
  async scanInterruptedSessions(): Promise<InterruptedSession[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.outputFolder);
    } catch {
      return [];
    }

    const interrupted: InterruptedSession[] = [];

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;

      try {
        const content = await fs.readFile(path.join(this.outputFolder, file), 'utf-8');
        const entries: TraceEntry[] = content
          .split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line));

        // Only process lane-transition sessions
        const laneEntries = entries.filter(e => e.agent === 'lane-transition');
        if (laneEntries.length === 0) continue;

        // Extract session ID from filename: session-{sessionId}.jsonl
        const sessionId = file.replace(/^session-/, '').replace(/\.jsonl$/, '');

        const started = laneEntries.find(
          e => e.type === 'decision' && e.data?.decision?.startsWith('started ')
        );
        const terminal = laneEntries.find(
          e => e.type === 'decision' && (e.data?.decision?.startsWith('completed ') || e.data?.decision === 'abandoned')
        );
        const errored = laneEntries.find(e => e.type === 'error');

        if (started && !terminal && !errored) {
          // Parse session ID to extract workflowId and artifactId
          // Format: lane-{workflowId}-{artifactId}-{timestamp}
          const parts = sessionId.split('-');
          // The first two parts are "lane" and the workflowId (may contain hyphens),
          // the last part is the timestamp, and everything in between is the artifact ID.
          // Safer approach: use the started entry's data
          interrupted.push({
            sessionId,
            artifactId: started.data?.artifactId || '',
            artifactType: started.data?.artifactType || 'unknown',
            workflowId: started.data?.decision?.replace(/^started\s+/, '') || '',
            startedAt: started.timestamp,
            agentRole: this.inferAgentRole(started.data?.decision || ''),
          });
        }
      } catch {
        // Skip corrupt or unreadable files
      }
    }

    return interrupted;
  }

  /** Infer the agent role from the workflow name for display purposes. */
  private inferAgentRole(decision: string): string {
    const workflowId = decision.replace(/^started\s+/, '');
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

  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    for (const timeout of this.flushTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.flushTimeouts.clear();
    this.flushAll().catch(err => logger.error('Final flush failed', { error: errMsg(err) }));
  }
}

// Singleton — initialized in extension.ts after the output folder is known.
// Before initialization, throwing gives a clear error rather than silent no-ops.
let _instance: TraceRecorder | undefined;

export function initializeTraceRecorder(outputFolder: string): TraceRecorder {
  if (_instance) {
    _instance.dispose();
  }
  _instance = new TraceRecorder(outputFolder);
  return _instance;
}

export function getTraceRecorder(): TraceRecorder {
  if (!_instance) {
    throw new Error(
      'TraceRecorder not initialized. Call initializeTraceRecorder(outputFolder) during extension activation.'
    );
  }
  return _instance;
}
