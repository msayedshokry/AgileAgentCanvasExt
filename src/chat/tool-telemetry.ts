import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';

const logger = createLogger('tool-telemetry');

export interface ToolCall {
    tool: string;
    status: 'ok' | 'error';
    latencyMs: number;
    timestamp: string;
    errorMessage?: string;
}

export class ToolTelemetry {
    private calls: ToolCall[] = [];
    private maxBuffer = 1000;
    private persistenceDir: string | null = null;
    private codeburnBuffer: ToolCall[] = [];
    private codeburnFlushTimer: NodeJS.Timeout | null = null;

    setPersistenceDir(dir: string) {
        this.persistenceDir = dir;
    }

    private async persistToDisk(call: ToolCall) {
        if (!this.persistenceDir) return;
        try {
            const fs = await import('fs');
            const path = await import('path');
            await fs.promises.mkdir(this.persistenceDir, { recursive: true });
            const date = call.timestamp.slice(0, 10); // YYYY-MM-DD
            const filePath = path.join(this.persistenceDir, `tool-calls-${date}.jsonl`);
            await fs.promises.appendFile(filePath, JSON.stringify(call) + '\n', 'utf-8');
        } catch (err) {
            logger.debug(`[tool-telemetry] Failed to persist: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private queueCodeburn(call: ToolCall) {
        this.codeburnBuffer.push(call);
        if (this.codeburnFlushTimer) return;
        this.codeburnFlushTimer = setTimeout(() => this.flushCodeburn(), 5000);
    }

    private flushCodeburn() {
        this.codeburnFlushTimer = null;
        const buffer = this.codeburnBuffer;
        this.codeburnBuffer = [];
        for (const call of buffer) {
            this.emitToCodeburn(call);
        }
    }

    record(call: ToolCall) {
        this.calls.push(call);
        if (this.calls.length > this.maxBuffer) {
            this.calls.shift();
        }
        this.persistToDisk(call);
        this.queueCodeburn(call);
    }

    getStats(periodMs = 7 * 24 * 60 * 60 * 1000) {
        const cutoff = Date.now() - periodMs;
        const recent = this.calls.filter(c => new Date(c.timestamp).getTime() > cutoff);
        const byTool: Record<string, { count: number; errors: number; avgLatencyMs: number }> = {};
        for (const call of recent) {
            if (!byTool[call.tool]) {
                byTool[call.tool] = { count: 0, errors: 0, avgLatencyMs: 0 };
            }
            byTool[call.tool].count++;
            if (call.status === 'error') {
                byTool[call.tool].errors++;
            }
            byTool[call.tool].avgLatencyMs =
                (byTool[call.tool].avgLatencyMs * (byTool[call.tool].count - 1) + call.latencyMs) /
                byTool[call.tool].count;
        }
        return { totalCalls: recent.length, byTool };
    }

    private emitToCodeburn(call: ToolCall) {
        const config = vscode.workspace.getConfiguration('agileagentcanvas');
        if (config.get<boolean>('codeburn.enabled')) {
            Promise.resolve(
                vscode.commands.executeCommand('agileagentcanvas.codeburn.recordEvent', {
                    type: 'tool-call',
                    ...call,
                })
            ).catch((err: unknown) => logger.debug(`[tool-telemetry] Codeburn emit failed: ${err instanceof Error ? err.message : String(err)}`));
        }
    }
}

export const toolTelemetry = new ToolTelemetry();

export async function trackToolCall<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    const start = Date.now();
    try {
        const result = await fn();
        toolTelemetry.record({
            tool: name,
            status: 'ok',
            latencyMs: Date.now() - start,
            timestamp: new Date().toISOString(),
        });
        return result;
    } catch (e: unknown) {
        toolTelemetry.record({
            tool: name,
            status: 'error',
            latencyMs: Date.now() - start,
            timestamp: new Date().toISOString(),
            errorMessage: e instanceof Error ? e.message : String(e),
        });
        throw e;
    }
}
