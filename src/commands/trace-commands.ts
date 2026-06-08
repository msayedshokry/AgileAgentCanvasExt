import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { getTraceRecorder, TraceEntry } from '../trace/trace-recorder';
import { createLogger } from '../utils/logger';

const logger = createLogger('trace-commands');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * List recent trace sessions by scanning *.jsonl files in the traces directory.
 * Extracts session IDs from filenames (session-{sessionId}.jsonl) rather than
 * reading all trace entries, which is faster and immune to corrupt lines.
 */
async function getRecentSessions(): Promise<Array<{ label: string; sessionId: string }>> {
  const dir = getTraceRecorder().getOutputFolder();

  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const sessionIds = files
    .filter(f => f.startsWith('session-') && f.endsWith('.jsonl'))
    .map(f => f.slice('session-'.length, -'.jsonl'.length))
    .slice(0, 20);

  return sessionIds.map(id => ({
    label: id,
    sessionId: id,
  }));
}

/**
 * Build an HTML trace viewer page for a given session.
 * Renders a timeline of TraceEntry events with search/filter controls.
 */
async function buildTraceHtml(sessionId: string): Promise<string> {
  const entries = await getTraceRecorder().getSessionTrace(sessionId);

  const rows = entries.map((e, i) => {
    const dataStr = JSON.stringify(e.data, null, 2);
    const icon = e.type === 'error' ? '❌' : e.type === 'tool_call' ? '🔧' : e.type === 'decision' ? '🧠' : '📋';
    return `<tr class="trace-row trace-row--${e.type}">
      <td>${i + 1}</td>
      <td>${new Date(e.timestamp).toLocaleTimeString()}</td>
      <td>${icon} ${e.type}</td>
      <td>${e.agent}</td>
      <td><pre>${escapeHtml(dataStr.slice(0, 500))}${dataStr.length > 500 ? '…' : ''}</pre></td>
      <td>${e.durationMs != null ? `${e.durationMs}ms` : ''}</td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Trace: ${sessionId}</title>
<style>
  body { font-family: var(--vscode-font-family, monospace); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  th { background: var(--vscode-editor-lineHighlightBackground); }
  pre { margin: 0; font-size: 12px; white-space: pre-wrap; max-width: 400px; }
  .trace-row--error { background: rgba(255,0,0,0.07); }
  .trace-row--tool_call { background: rgba(0,120,255,0.05); }
</style></head><body>
<h2>🔍 Trace: ${sessionId}</h2>
<p>${entries.length} entries</p>
<table><thead><tr><th>#</th><th>Time</th><th>Type</th><th>Agent</th><th>Data</th><th>Duration</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Command Registration ─────────────────────────────────────────────────────

export function registerTraceCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    // ── openTraceViewer — view session trace or pick from recent list ──
    vscode.commands.registerCommand('agileagentcanvas.openTraceViewer', async (sessionId?: string) => {
      if (sessionId) {
        const panel = vscode.window.createWebviewPanel(
          'agileagentcanvas.traceViewer',
          `Trace: ${sessionId}`,
          vscode.ViewColumn.Beside,
          { enableScripts: true }
        );
        panel.webview.html = await buildTraceHtml(sessionId);
        return;
      }

      const sessions = await getRecentSessions();
      if (sessions.length === 0) {
        vscode.window.showInformationMessage('No trace sessions found. Execute a workflow to generate traces.');
        return;
      }

      const pick = await vscode.window.showQuickPick(sessions, {
        placeHolder: 'Select a session to view its trace',
      });
      if (!pick) return;

      const panel = vscode.window.createWebviewPanel(
        'agileagentcanvas.traceViewer',
        `Trace: ${pick.label}`,
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );
      panel.webview.html = await buildTraceHtml(pick.sessionId);
    }),

    // ── clearOldTraces — delete traces older than retentionDays ──
    vscode.commands.registerCommand('agileagentcanvas.clearOldTraces', async () => {
      const days = vscode.workspace.getConfiguration('agileagentcanvas').get('trace.retentionDays', 30);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const entries = await getTraceRecorder().searchTraces({ limit: 10000 });
      const oldSessions = new Set(
        entries
          .filter(e => new Date(e.timestamp).getTime() < cutoff)
          .map(e => e.sessionId)
      );

      if (oldSessions.size === 0) {
        vscode.window.showInformationMessage(`No traces older than ${days} days to clear.`);
        return;
      }

      // Use the recorder's output folder to find and delete old session files
      const tracesDir = getTraceRecorder().getOutputFolder();
      let deletedCount = 0;
      for (const sid of oldSessions) {
        try {
          const filePath = path.join(tracesDir, `session-${sid}.jsonl`);
          await fs.unlink(filePath);
          deletedCount++;
          logger.info(`Deleted old trace file: ${filePath}`);
        } catch {
          // File may already be gone
        }
      }

      vscode.window.showInformationMessage(
        `Cleared ${deletedCount} trace session(s) older than ${days} days.`
      );
    }),

    // ── cleanupTraces — run on-disk cleanupOldFiles (uses file mtime, not in-memory entries) ──
    vscode.commands.registerCommand('agileagentcanvas.cleanupTraces', async () => {
      const deleted = await getTraceRecorder().cleanupOldFiles();
      if (deleted > 0) {
        vscode.window.showInformationMessage(`Cleaned up ${deleted} old trace file(s).`);
      } else {
        vscode.window.showInformationMessage('No old trace files to clean up.');
      }
    })
  );
}
