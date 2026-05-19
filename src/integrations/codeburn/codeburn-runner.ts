import * as cp from 'child_process';
import * as vscode from 'vscode';
import { createLogger } from '../../utils/logger';
import { CodeburnCliForm, detectCodeburn } from './codeburn-detector';

const logger = createLogger('codeburn-runner');

export interface CodeburnResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    /** Parsed JSON when --format json was used and parsing succeeded */
    json?: unknown;
}

export interface CodeburnRunOptions {
    cwd: string;
    onLine?: (line: string) => void;
    cancellation?: vscode.CancellationToken;
    timeoutMs?: number;
    /** Whether to show the output channel and preserve focus. Default true. */
    showChannel?: boolean;
}

// ─── Shared output channel ─────────────────────────────────────────────────

let _outputChannel: vscode.OutputChannel | undefined;

export function getCodeburnOutputChannel(): vscode.OutputChannel {
    if (!_outputChannel) {
        _outputChannel = vscode.window.createOutputChannel('Agile Agent Canvas — Codeburn');
    }
    return _outputChannel;
}

// ─── Build argv ────────────────────────────────────────────────────────────

export function buildArgv(cliForm: CodeburnCliForm, binPath: string | undefined, args: string[]): string[] {
    if (cliForm === 'unavailable') { return []; }
    if (cliForm === 'cli') {
        // Use resolved absolute path when available (critical on Windows where
        // bare 'codeburn' won't resolve to 'codeburn.cmd' with shell: false)
        return [binPath ?? 'codeburn', ...args];
    }
    if (cliForm === 'local' && binPath) {
        return [binPath, ...args];
    }
    if (cliForm === 'local') {
        return [process.platform === 'win32' ? 'npx.cmd' : 'npx', 'codeburn', ...args];
    }
    return [process.platform === 'win32' ? 'npx.cmd' : 'npx', '--yes', 'codeburn', ...args];
}

// ─── Run codeburn ──────────────────────────────────────────────────────────

export async function runCodeburn(
    args: string[],
    opts: CodeburnRunOptions
): Promise<CodeburnResult> {
    const status = detectCodeburn(opts.cwd);

    if (!status.available) {
        return {
            success: false,
            stdout: '',
            stderr: 'codeburn is not installed. Install globally: npm install -g codeburn',
            exitCode: 1
        };
    }

    const argv = buildArgv(status.cliForm, status.binPath, args);
    const channel = getCodeburnOutputChannel();
    channel.appendLine(`\n> ${argv.join(' ')}`);
    if (opts.showChannel !== false) {
        channel.show(true);
    }

    return new Promise<CodeburnResult>((resolve) => {
        // On Windows, .cmd/.bat files and bare command names require a shell
        // to execute correctly. Using shell: true lets cmd.exe handle PATH
        // resolution and batch file invocation.
        const useShell = process.platform === 'win32';
        const proc = cp.spawn(argv[0], argv.slice(1), {
            cwd: opts.cwd,
            shell: useShell,
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        const onCancelled = opts.cancellation?.onCancellationRequested(() => {
            proc.kill('SIGTERM');
            setTimeout(() => {
                if (!proc.killed) { proc.kill('SIGKILL'); }
            }, 2000);
        });

        const timeout = opts.timeoutMs
            ? setTimeout(() => {
                proc.kill('SIGTERM');
                setTimeout(() => {
                    if (!proc.killed) { proc.kill('SIGKILL'); }
                }, 2000);
            }, opts.timeoutMs)
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
            logger.error('codeburn spawn error:', err.message);
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

            let json: unknown | undefined;
            if (success && args.includes('--format') && args.includes('json')) {
                try {
                    json = JSON.parse(stdout);
                } catch {
                    logger.debug('codeburn JSON parse failed');
                }
            }

            logger.debug(`codeburn exited with code ${exitCode}`);
            resolve({ success, stdout, stderr, exitCode, json });
        });
    });
}
