import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../utils/logger';
import { runGraphify } from './graphify-runner';
import { GFY } from './graphify-commands';
import { detectGraphify, clearGraphifyCache, resetCliFormCache } from './graphify-detector';
import { buildGraphIntegrated } from './graphify-lm-extractor';

const logger = createLogger('graphify-bootstrap');

// ─── Bootstrap entry point ───────────────────────────────────────────────────

/**
 * Full bootstrap sequence:
 *  1. Install graphify CLI (if missing)
 *  2. Write .graphifyignore (if missing)
 *  3. Build the knowledge graph (staged pipeline)
 *  4. Wire VS Code Copilot Chat instructions
 *
 * Each step is skipped when its precondition is already met.
 * All steps run under a VS Code progress notification.
 */
export async function bootstrapGraphify(workspaceRoot: string, options?: { silent?: boolean }): Promise<void> {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(
            'graphify bootstrap requires a trusted workspace. Please trust this workspace and try again.'
        );
        return;
    }

    // When called manually (not from auto-prompt toast) show a confirmation dialog.
    // When called from the auto-bootstrap toast the user already confirmed — skip the modal.
    if (!options?.silent) {
        const confirmed = await vscode.window.showInformationMessage(
            'Bootstrap graphify? This will:\n' +
            '\u2022 Install the graphify CLI (pip install graphifyy)\n' +
            '\u2022 Build an initial knowledge graph of the codebase\n' +
            '\u2022 Wire the graph into VS Code Copilot Chat\n\n' +
            'The first build sends file contents to your AI provider for semantic extraction.',
            { modal: true },
            'Bootstrap'
        );
        if (confirmed !== 'Bootstrap') { return; }
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Agile Agent Canvas — graphify bootstrap',
            cancellable: true
        },
        async (progress, token) => {
            const step = (msg: string, increment = 20) => {
                progress.report({ message: msg, increment });
                logger.info(msg);
            };

            // Step 1: Install CLI
            const pythonPath = vscode.workspace
                .getConfiguration('agileagentcanvas')
                .get<string>('graphify.pythonPath', 'python');

            const status = detectGraphify(workspaceRoot, pythonPath);

            if (status.cliForm === 'unavailable') {
                step('Installing graphify CLI…', 0);
                const installed = await tryInstallCli(workspaceRoot, pythonPath, token);
                if (!installed) {
                    vscode.window.showErrorMessage(
                        'graphify CLI install failed. Ensure Python 3.10+ is installed and on PATH, then run: pip install graphifyy',
                        'Get Python'
                    ).then(choice => {
                        if (choice === 'Get Python') {
                            vscode.env.openExternal(vscode.Uri.parse('https://www.python.org/downloads/'));
                        }
                    });
                    return;
                }
                resetCliFormCache();
                clearGraphifyCache(workspaceRoot);
                step('graphify CLI installed.', 20);
            } else {
                progress.report({ increment: 20, message: 'graphify CLI already installed.' });
            }

            if (token.isCancellationRequested) { return; }

            // Step 2: Write .graphifyignore
            const ignorePath = path.join(workspaceRoot, '.graphifyignore');
            if (!fs.existsSync(ignorePath)) {
                step('Writing .graphifyignore…', 0);
                const templatePath = path.join(__dirname, '..', '..', '..', 'resources', '_aac', 'graphify', 'graphifyignore.template');
                try {
                    const template = fs.readFileSync(templatePath, 'utf-8');
                    fs.writeFileSync(ignorePath, template, 'utf-8');
                    step('.graphifyignore created.', 20);
                } catch (err: any) {
                    logger.warn('Could not copy .graphifyignore template:', err.message);
                    progress.report({ increment: 20, message: '.graphifyignore skipped.' });
                }
            } else {
                progress.report({ increment: 20, message: '.graphifyignore already exists.' });
            }

            if (token.isCancellationRequested) { return; }

            // Step 3: Build graph (staged pipeline)
            const freshStatus = detectGraphify(workspaceRoot, pythonPath);
            if (!freshStatus.graphPresent) {
                step('Building knowledge graph (this may take a few minutes)…', 0);
                const built = await buildGraph(workspaceRoot, token);
                if (!built) {
                    vscode.window.showErrorMessage(
                        'graphify graph build failed. Check the "Agile Agent Canvas — graphify" output channel for details.'
                    );
                    return;
                }
                clearGraphifyCache(workspaceRoot);
                step('Knowledge graph built.', 30);
            } else {
                progress.report({ increment: 30, message: 'Knowledge graph already present.' });
            }

            if (token.isCancellationRequested) { return; }

            // Step 4: Wire VS Code
            const wiredStatus = detectGraphify(workspaceRoot, pythonPath);
            if (!wiredStatus.wired) {
                step('Wiring graph into VS Code Copilot Chat…', 0);
                await wireVsCode(workspaceRoot, token);
                clearGraphifyCache(workspaceRoot);
                step('VS Code wired.', 10);
            } else {
                progress.report({ increment: 10, message: 'VS Code already wired.' });
            }

            vscode.window.showInformationMessage(
                'graphify bootstrap complete! Open the canvas to see the Codebase lane, or use @agileagentcanvas /graph in chat.'
            );
        }
    );
}

// ─── Update (incremental) ────────────────────────────────────────────────────

export async function updateGraph(workspaceRoot: string): Promise<void> {
    if (!vscode.workspace.isTrusted) { return; }
    const status = detectGraphify(workspaceRoot);
    if (!status.graphPresent) {
        vscode.window.showWarningMessage('No graphify graph found. Run "Bootstrap graphify" first.');
        return;
    }
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'graphify: updating graph…', cancellable: true },
        async (_progress, token) => {
            const result = await runGraphify(GFY.update(), { cwd: workspaceRoot, cancellation: token });
            if (result.success) {
                // Regenerate clustering + report after code graph update (replaces deprecated `index` command)
                await runGraphify(GFY.clusterOnly(), { cwd: workspaceRoot, cancellation: token });
            }
            clearGraphifyCache(workspaceRoot);
            if (result.success) {
                vscode.window.showInformationMessage('graphify graph updated.');
            } else {
                vscode.window.showErrorMessage('graphify update failed. See output channel for details.');
            }
        }
    );
}

// ─── Rebuild ─────────────────────────────────────────────────────────────────

export async function rebuildGraph(workspaceRoot: string): Promise<void> {
    if (!vscode.workspace.isTrusted) { return; }

    const confirmed = await vscode.window.showWarningMessage(
        'Rebuild the graphify knowledge graph from scratch? This will re-extract all files and may use AI provider tokens.',
        { modal: true },
        'Rebuild'
    );
    if (confirmed !== 'Rebuild') { return; }

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'graphify: rebuilding graph…', cancellable: true },
        async (_progress, token) => {
            const built = await buildGraph(workspaceRoot, token);
            clearGraphifyCache(workspaceRoot);
            if (built) {
                vscode.window.showInformationMessage('graphify graph rebuilt.');
            } else {
                vscode.window.showErrorMessage('graphify rebuild failed. See output channel for details.');
            }
        }
    );
}

// ─── Install git hook ────────────────────────────────────────────────────────

export async function installGraphifyHook(workspaceRoot: string): Promise<void> {
    if (!vscode.workspace.isTrusted) { return; }
    const result = await runGraphify(GFY.hookInstall(), { cwd: workspaceRoot });
    if (result.success) {
        vscode.window.showInformationMessage('graphify git hook installed. Graph will auto-rebuild on commit.');
    } else {
        vscode.window.showErrorMessage('graphify hook install failed. See output channel for details.');
    }
}

// ─── Wiki export ─────────────────────────────────────────────────────────────

export async function exportWiki(workspaceRoot: string): Promise<void> {
    if (!vscode.workspace.isTrusted) { return; }
    const status = detectGraphify(workspaceRoot);
    if (!status.graphPresent) {
        vscode.window.showWarningMessage('No graphify graph found. Run "Bootstrap graphify" first.');
        return;
    }
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'graphify: exporting wiki…', cancellable: true },
        async (_progress, token) => {
            const result = await runGraphify(GFY.exportWiki(), { cwd: workspaceRoot, cancellation: token });
            clearGraphifyCache(workspaceRoot);
            if (result.success) {
                vscode.window.showInformationMessage('graphify wiki exported to graphify-out/wiki/.');
            } else {
                vscode.window.showErrorMessage('graphify wiki export failed. See output channel for details.');
            }
        }
    );
}

// ─── Staleness check ─────────────────────────────────────────────────────────

export async function checkGraphStaleness(workspaceRoot: string): Promise<boolean> {
    const needsUpdate = path.join(workspaceRoot, 'graphify-out', 'needs_update');
    if (fs.existsSync(needsUpdate)) { return true; }

    const result = await runGraphify(GFY.checkUpdate(), { cwd: workspaceRoot, timeoutMs: 10_000 });
    // check-update exits 0 = up-to-date, 1 = stale
    return result.exitCode === 1;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function tryInstallCli(
    cwd: string,
    pythonPath: string,
    token: vscode.CancellationToken
): Promise<boolean> {
    // Try uv first, then pipx, then pip
    const methods = [
        ['uv', 'tool', 'install', 'graphifyy'],
        ['pipx', 'install', 'graphifyy'],
        [pythonPath, '-m', 'pip', 'install', '--user', 'graphifyy']
    ];

    for (const argv of methods) {
        if (token.isCancellationRequested) { return false; }
        // For install we shell out directly since it's not a graphify subcommand
        const { success } = await runShell(argv, cwd, token);
        if (success) { return true; }
        logger.warn(`Install via ${argv[0]} failed — trying next method`);
    }
    return false;
}

async function runShell(
    argv: string[],
    cwd: string,
    token: vscode.CancellationToken
): Promise<{ success: boolean }> {
    const cp = await import('child_process');
    return new Promise(resolve => {
        const proc = cp.spawn(argv[0], argv.slice(1), { cwd, shell: false, windowsHide: true });
        const onCancel = token.onCancellationRequested(() => proc.kill());
        proc.on('close', code => {
            onCancel.dispose();
            resolve({ success: (code ?? 1) === 0 });
        });
        proc.on('error', () => {
            onCancel.dispose();
            resolve({ success: false });
        });
    });
}

async function buildGraph(workspaceRoot: string, token: vscode.CancellationToken): Promise<boolean> {
    const backend = vscode.workspace
        .getConfiguration('agileagentcanvas')
        .get<string>('graphify.backend', '');

    // If a specific backend is configured, the user likely has an API key set — use the CLI directly.
    // Otherwise, use the integrated pipeline that routes through the VS Code Language Model API.
    if (backend) {
        const stages: string[][] = [
            GFY.extract(backend),
        ];
        for (const args of stages) {
            if (token.isCancellationRequested) { return false; }
            const result = await runGraphify(args, { cwd: workspaceRoot, cancellation: token, timeoutMs: 300_000 });
            if (!result.success) {
                logger.error(`graphify ${args[0]} failed:`, result.stderr);
                return false;
            }
        }
        return true;
    }

    // Integrated pipeline: Python for non-LLM steps, VS Code LM for semantic extraction
    return buildGraphIntegrated(workspaceRoot, token, (msg) => {
        logger.debug(msg);
    });
}

async function wireVsCode(workspaceRoot: string, token: vscode.CancellationToken): Promise<void> {
    // Try `python -m graphify vscode install` first
    const result = await runGraphify(GFY.vscodeInstall(), { cwd: workspaceRoot, cancellation: token });
    if (!result.success) {
        // Fallback: append a minimal graphify block to copilot-instructions ourselves
        appendCopilotInstructionsBlock(workspaceRoot);
    }
}

function appendCopilotInstructionsBlock(workspaceRoot: string): void {
    const instructionsPath = path.join(workspaceRoot, '.github', 'copilot-instructions.md');
    const block = `

## graphify

Architecture Index: \`graphify-out/ARCH_INDEX.md\` — always read this first for codebase orientation.
For deep context on a community: read \`graphify-out/wiki/{community-label}.md\`
For symbol tracing: use \`/graph-query\` in Copilot Chat.
Full report: \`graphify-out/GRAPH_REPORT.md\`
`;
    try {
        const dir = path.dirname(instructionsPath);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        const existing = fs.existsSync(instructionsPath)
            ? fs.readFileSync(instructionsPath, 'utf-8')
            : '';
        if (!existing.includes('graphify')) {
            fs.writeFileSync(instructionsPath, existing + block, 'utf-8');
            logger.info('Appended graphify block to copilot-instructions.md');
        }
    } catch (err: any) {
        logger.warn('Could not update copilot-instructions.md:', err.message);
    }
}
