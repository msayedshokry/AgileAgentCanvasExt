import * as vscode from 'vscode';
import * as cp from 'child_process';
import { createLogger } from '../../utils/logger';
import { detectCodeburn, clearCodeburnCache } from './codeburn-detector';

const logger = createLogger('codeburn-bootstrap');

/**
 * Bootstrap codeburn installation.
 *
 * Tries global npm install first, then falls back to local workspace install.
 * Requires user confirmation unless silent=true.
 *
 * @param workspaceRoot  The workspace root (used for local fallback)
 * @param options        { silent: true } skips the confirmation modal
 * @returns              true if codeburn is available after bootstrap
 */
export async function bootstrapCodeburn(
    workspaceRoot: string,
    options?: { silent?: boolean }
): Promise<boolean> {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(
            'Codeburn bootstrap requires a trusted workspace. Please trust this workspace and try again.'
        );
        return false;
    }

    // Already installed?
    const pre = detectCodeburn(workspaceRoot);
    if (pre.available) {
        vscode.window.showInformationMessage(
            `Codeburn is already installed (${pre.cliForm}).`
        );
        return true;
    }

    // Confirm with user (unless silent)
    if (!options?.silent) {
        const confirmed = await vscode.window.showInformationMessage(
            'Codeburn is not installed. Bootstrap now?\n\n' +
            'This will run:\n' +
            '  npm install -g codeburn\n\n' +
            'Requires Node.js and npm to be on your PATH.',
            { modal: true },
            'Bootstrap'
        );
        if (confirmed !== 'Bootstrap') { return false; }
    }

    let lastStderr = '';
    const installed = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Agile Agent Canvas — Installing Codeburn',
            cancellable: true
        },
        async (_progress, token) => {
            const { ok, stderr } = await tryInstallCodeburn(workspaceRoot, token);
            lastStderr = stderr;
            return ok;
        }
    );

    clearCodeburnCache(workspaceRoot);

    if (installed) {
        const post = detectCodeburn(workspaceRoot);
        if (post.available) {
            vscode.window.showInformationMessage(
                `Codeburn installed successfully (${post.cliForm}).`
            );
            return true;
        }
    }

    const hint = lastStderr
        ? `\n\nDetails: ${lastStderr.slice(0, 400)}${lastStderr.length > 400 ? '…' : ''}`
        : '';
    vscode.window.showErrorMessage(
        'Codeburn installation failed. Ensure Node.js and npm are installed, then run manually:\n' +
        '  npm install -g codeburn' + hint,
        'Open Codeburn README'
    ).then(choice => {
        if (choice === 'Open Codeburn README') {
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/getagentseal/codeburn#install'));
        }
    });
    return false;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

async function tryInstallCodeburn(workspaceRoot: string, token: vscode.CancellationToken): Promise<{ ok: boolean; stderr: string }> {
    const methods: Array<{ name: string; argv: string[]; cwd: string }> = [
        { name: 'npm global', argv: ['npm', 'install', '-g', 'codeburn'], cwd: process.cwd() },
        { name: 'npm local', argv: ['npm', 'install', 'codeburn'], cwd: workspaceRoot },
    ];

    let lastStderr = '';
    for (const method of methods) {
        if (token.isCancellationRequested) { return { ok: false, stderr: 'Cancelled by user.' }; }
        logger.info(`Trying to install codeburn via ${method.name}…`);
        const { success, stderr } = await runShell(method.argv, method.cwd, token);
        lastStderr = stderr;
        if (success) {
            logger.info(`Codeburn installed via ${method.name}.`);
            return { ok: true, stderr: '' };
        }
        logger.warn(`Install via ${method.name} failed — trying next method.\n${stderr}`);
    }
    return { ok: false, stderr: lastStderr };
}

function runShell(argv: string[], cwd: string, token: vscode.CancellationToken): Promise<{ success: boolean; stderr: string }> {
    return new Promise(resolve => {
        // On Windows, bare 'npm' won't resolve to 'npm.cmd' with shell: false.
        // Use shell: true so the system shell handles PATH resolution.
        const useShell = process.platform === 'win32';
        const proc = cp.spawn(argv[0], argv.slice(1), { cwd, shell: useShell, windowsHide: true });
        const onCancel = token.onCancellationRequested(() => {
            proc.kill('SIGTERM');
            setTimeout(() => { if (!proc.killed) { proc.kill('SIGKILL'); } }, 2000);
        });

        let stderr = '';
        proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        proc.on('close', code => {
            onCancel.dispose();
            const success = code === 0;
            if (!success) { logger.warn('Install stderr:', stderr); }
            resolve({ success, stderr });
        });

        proc.on('error', (err) => {
            onCancel.dispose();
            resolve({ success: false, stderr: err.message });
        });
    });
}
