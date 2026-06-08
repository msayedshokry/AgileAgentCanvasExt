const fs = require('fs');
const path = require('path');

// ── 1. Add cleanupOldFiles + optimize searchTraces + fix dispose ──────────────
const tracePath = path.join(__dirname, '..', 'src', 'trace', 'trace-recorder.ts');
let trace = fs.readFileSync(tracePath, 'utf8');

// Add cleanupOldFiles method before getOutputFolder
const cleanupMethod = `  /**
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
      logger.info(\`[TraceRecorder] Cleaned up \${deleted} old trace file(s) (\${retentionDays}d retention)\`);
    }
    return deleted;
  }

  /** Returns the traces output directory (for cleanup / inspection commands). */
  getOutputFolder(): string {
    return this.outputFolder;
  }`;

// Replace getOutputFolder with the version that includes cleanupOldFiles before it
trace = trace.replace(
  '/** Returns the traces output directory (for cleanup / inspection commands). */\n  getOutputFolder(): string {\n    return this.outputFolder;\n  }',
  cleanupMethod
);

// Optimize searchTraces to be more memory-efficient
const oldSearch = `async searchTraces(query: {
    artifactId?: string;
    agent?: string;
    type?: string;
    since?: Date;
    limit?: number;
  }): Promise<TraceEntry[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.outputFolder);
    } catch {
      return [];
    }

    const results: TraceEntry[] = [];

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      try {
        const content = await fs.readFile(path.join(this.outputFolder, file), 'utf-8');
        const entries: TraceEntry[] = content.split('\\n').filter(Boolean).map(line => JSON.parse(line));
        results.push(...entries);
      } catch {
        // Skip corrupt or unreadable files
      }
    }

    return results
      .filter(e => !query.artifactId || e.data?.artifactId === query.artifactId)
      .filter(e => !query.agent || e.agent === query.agent)
      .filter(e => !query.type || e.type === query.type)
      .filter(e => !query.since || new Date(e.timestamp) >= query.since)
      .slice(0, query.limit ?? Infinity);
  }`;

const newSearch = `async searchTraces(query: {
    artifactId?: string;
    agent?: string;
    type?: string;
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
        const lines = content.split('\\n').filter(Boolean);

        for (const line of lines) {
          if (results.length >= maxResults) break;
          try {
            const entry: TraceEntry = JSON.parse(line);
            if (query.artifactId && entry.data?.artifactId !== query.artifactId) continue;
            if (query.agent && entry.agent !== query.agent) continue;
            if (query.type && entry.type !== query.type) continue;
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
  }`;

trace = trace.replace(oldSearch, newSearch);

// Update dispose to clear cleanup timer
trace = trace.replace(
  'dispose(): void {\n    for (const timeout of this.flushTimeouts.values()) {\n      clearTimeout(timeout);\n    }\n    this.flushTimeouts.clear();\n    this.flushAll().catch(err => logger.error(\'Final flush failed\', { error: errMsg(err) }));\n  }',
  'dispose(): void {\n    if (this.cleanupTimer) {\n      clearInterval(this.cleanupTimer);\n      this.cleanupTimer = undefined;\n    }\n    for (const timeout of this.flushTimeouts.values()) {\n      clearTimeout(timeout);\n    }\n    this.flushTimeouts.clear();\n    this.flushAll().catch(err => logger.error(\'Final flush failed\', { error: errMsg(err) }));\n  }'
);

fs.writeFileSync(tracePath, trace, 'utf8');
console.log('trace-recorder.ts updated');

// ── 2. Add total entry cap to harness-feedback.ts ─────────────────────────────
const feedbackPath = path.join(__dirname, '..', 'src', 'harness', 'harness-feedback.ts');
let feedback = fs.readFileSync(feedbackPath, 'utf8');

// Add total entries cap to CONFIG
feedback = feedback.replace(
  '  /** Remove entries that have been resolved (passed) for this many successive checks */',
  '  /** Max total entries across all artifacts before pruning oldest entries */\n  MAX_TOTAL_ENTRIES: 10000,\n  /** Remove entries that have been resolved (passed) for this many successive checks */'
);

// Add pruning after the per-artifact limit enforcement
feedback = feedback.replace(
  "    // Enforce max entries per artifact (keep the most recent)\n    if (existing.entries.length > CONFIG.MAX_ENTRIES_PER_ARTIFACT) {\n      existing.entries.sort((a, b) =>\n        b.lastEvaluated.localeCompare(a.lastEvaluated)\n      );\n      existing.entries = existing.entries.slice(0, CONFIG.MAX_ENTRIES_PER_ARTIFACT);\n    }",
  "    // Enforce max entries per artifact (keep the most recent)\n    if (existing.entries.length > CONFIG.MAX_ENTRIES_PER_ARTIFACT) {\n      existing.entries.sort((a, b) =>\n        b.lastEvaluated.localeCompare(a.lastEvaluated)\n      );\n      existing.entries = existing.entries.slice(0, CONFIG.MAX_ENTRIES_PER_ARTIFACT);\n    }\n\n    // Enforce total entries cap across all artifacts (safety net)\n    let totalEntries = 0;\n    for (const [, fb] of this.feedback) totalEntries += fb.entries.length;\n    if (totalEntries > CONFIG.MAX_TOTAL_ENTRIES) {\n      // Prune oldest entries from the current artifact first\n      existing.entries.sort((a, b) => a.lastEvaluated.localeCompare(b.lastEvaluated));\n      const excess = totalEntries - CONFIG.MAX_TOTAL_ENTRIES;\n      existing.entries = existing.entries.slice(excess);\n    }"
);

fs.writeFileSync(feedbackPath, feedback, 'utf8');
console.log('harness-feedback.ts updated');

console.log('All bloat fixes applied successfully');
