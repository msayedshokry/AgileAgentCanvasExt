/**
 * Weekly waste report — surfaces tool usage stats and anti-pattern detections.
 *
 * Generates a markdown report written to:
 * `.agileagentcanvas-context/waste-reports/YYYY-Www.md`
 *
 * Also emits a structured event to the Codeburn panel when available.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { toolTelemetry } from '../chat/tool-telemetry';
import { detectAntiPatterns } from './anti-pattern-detector';
import { createLogger } from '../utils/logger';

const logger = createLogger('waste-report');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the ISO week number for a given date (ISO 8601: YYYY-Www). */
function getISOWeek(date: Date): string {
    // ISO 8601: Week 1 is the week containing the first Thursday (equivalently, Jan 4)
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;  // Mon=1, Sun=7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);  // Move to Thursday of this week
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** Returns the workspace-relative output path for waste reports. */
function getOutputPath(): string {
    const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return wsFolder
        ? path.join(wsFolder, '.agileagentcanvas-context')
        : path.join(process.env.TEMP ?? '/tmp', 'aac-context').replace(/\\/g, '/');
}

// ─── Report generation ────────────────────────────────────────────────────────

export async function generateWeeklyWasteReport(): Promise<string> {
    const stats = toolTelemetry.getStats(7 * 24 * 60 * 60 * 1000);

    // Build per-tool lines sorted by call count descending
    const perToolLines = Object.entries(stats.byTool)
        .sort(([, a], [, b]) => b.count - a.count)
        .map(([tool, s]) => {
            const errorPct = s.count > 0 ? ((s.errors / s.count) * 100).toFixed(1) : '0.0';
            return `- \`${tool}\`: ${s.count} calls, ${errorPct}% errors, ${s.avgLatencyMs.toFixed(0)}ms avg`;
        });

    const report = [
        '# Weekly Tool Usage Report',
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
        '## Tool Call Summary',
        `- Total calls: ${stats.totalCalls}`,
        `- Unique tools used: ${Object.keys(stats.byTool).length}`,
        '',
        '## Per-Tool Stats',
        perToolLines.length > 0 ? perToolLines.join('\n') : '- (no data yet)',
        '',
        '## Anti-Pattern Detection',
        // Anti-patterns require chat history — in the current architecture they are
        // injected by the caller; here we note that detection is available.
        '- Run `detectAntiPatterns(chatHistory)` to scan for wasteful patterns.',
        '',
        '## Recommendations',
        '- Tools with 0 calls: consider removing.',
        '- Tools with >20% errors: investigate input validation.',
        '- High-frequency tools with long latency: consider caching.',
    ].join('\n');

    // Write to waste-reports/
    const weekStr = getISOWeek(new Date());
    const outputPath = getOutputPath();
    const reportDir = path.join(outputPath, 'waste-reports');
    const reportPath = path.join(reportDir, `${weekStr}.md`);

    try {
        await fs.promises.mkdir(reportDir, { recursive: true });
        await fs.promises.writeFile(reportPath, report);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.debug(`[waste-report] Failed to write report to ${reportPath}: ${msg}`);
    }

    return report;
}

// Singleton reporter instance for convenience
export const wasteReporter = { generateWeeklyWasteReport };
