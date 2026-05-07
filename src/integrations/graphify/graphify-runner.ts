import * as cp from 'child_process';
import * as vscode from 'vscode';
import { createLogger } from '../../utils/logger';
import { GraphifyCliForm } from './graph-types';
import { detectGraphify } from './graphify-detector';

const logger = createLogger('graphify-runner');

export interface GraphifyResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
}

export interface GraphifyRunOptions {
    cwd: string;
    onLine?: (line: string) => void;
    cancellation?: vscode.CancellationToken;
    timeoutMs?: number;
}

// ─── Shared output channel ───────────────────────────────────────────────────

let _outputChannel: vscode.OutputChannel | undefined;

export function getGraphifyOutputChannel(): vscode.OutputChannel {
    if (!_outputChannel) {
        _outputChannel = vscode.window.createOutputChannel('Agile Agent Canvas — graphify');
    }
    return _outputChannel;
}

// ─── CLI invocation ──────────────────────────────────────────────────────────

/**
 * Build the argv array for a graphify invocation.
 * Resolves to `['graphify', ...args]` or `[python, '-m', 'graphify', ...args]`
 * depending on the detected CLI form.
 */
export function buildArgv(cliForm: GraphifyCliForm, args: string[], pythonPath: string): string[] {
    if (cliForm === 'unavailable') { return []; }
    if (cliForm === 'cli') {
        return ['graphify', ...args];
    }
    return [pythonPath, '-m', 'graphify', ...args];
}

/**
 * Run a graphify command and stream output to the shared output channel.
 * Resolves when the process exits.  Rejects only on spawn errors.
 */
export async function runGraphify(
    args: string[],
    opts: GraphifyRunOptions
): Promise<GraphifyResult> {
    const pythonPath = vscode.workspace
        .getConfiguration('agileagentcanvas')
        .get<string>('graphify.pythonPath', 'python');

    // Detect CLI form at runtime (cached by graphify-detector)
    const status = detectGraphify(opts.cwd, pythonPath);

    if (status.cliForm === 'unavailable') {
        return { success: false, stdout: '', stderr: 'graphify is not installed.', exitCode: 1 };
    }

    const argv = buildArgv(status.cliForm, args, pythonPath);
    const channel = getGraphifyOutputChannel();
    channel.appendLine(`\n> ${argv.join(' ')}`);
    channel.show(true);

    return new Promise<GraphifyResult>((resolve) => {
        const proc = cp.spawn(argv[0], argv.slice(1), {
            cwd: opts.cwd,
            shell: false,
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        const onCancelled = opts.cancellation?.onCancellationRequested(() => {
            proc.kill();
        });

        const timeout = opts.timeoutMs
            ? setTimeout(() => proc.kill(), opts.timeoutMs)
            : undefined;

        proc.stdout?.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            stdout += text;
            text.split('\n').forEach(line => {
                if (line.trim()) {
                    channel.appendLine(line);
                    opts.onLine?.(line);
                }
            });
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            stderr += text;
            text.split('\n').forEach(line => {
                if (line.trim()) {
                    channel.appendLine(`[stderr] ${line}`);
                }
            });
        });

        proc.on('error', (err) => {
            logger.error('graphify spawn error:', err.message);
            channel.appendLine(`[error] ${err.message}`);
            if (timeout) { clearTimeout(timeout); }
            onCancelled?.dispose();
            resolve({ success: false, stdout, stderr: err.message, exitCode: -1 });
        });

        proc.on('close', (code) => {
            if (timeout) { clearTimeout(timeout); }
            onCancelled?.dispose();
            const exitCode = code ?? -1;
            const success = exitCode === 0;
            logger.debug(`graphify exited with code ${exitCode}`);
            resolve({ success, stdout, stderr, exitCode });
        });
    });
}
