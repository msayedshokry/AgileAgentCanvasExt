import * as vscode from 'vscode';
import { detectCodeburn, runCodeburn, CB, clearCodeburnCache, bootstrapCodeburn, buildArgv } from '../integrations/codeburn';
import { createLogger } from '../utils/logger';

const logger = createLogger('codeburn-commands');

function pick<T>(obj: unknown, path: string, fallback: T): T {
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return fallback;
        cur = (cur as Record<string, unknown>)[p];
    }
    return (cur as T | undefined) ?? fallback;
}

interface CodeburnMenuItem extends vscode.QuickPickItem {
    value: 'dashboard' | 'report' | 'models' | 'optimize' | 'compare' | 'export' | 'refresh';
}

/**
 * Command palette handler for Codeburn read operations.
 * Registered as: agileagentcanvas.codeburn.menu, .dashboard, .report, .models, .optimize, .compare, .export
 */
export class CodeburnCommands {
    private outputChannel: vscode.OutputChannel | undefined;

    /** Tracks active Codeburn TUIs to prevent terminal leaks */
    private static activeTerminals = new Map<string, vscode.Terminal>();

    /** Set up global terminal-close listener once to prevent leaks */
    private static _terminalListenerSetup = false;

    private static ensureTerminalListener(): void {
        if (CodeburnCommands._terminalListenerSetup) { return; }
        CodeburnCommands._terminalListenerSetup = true;
        vscode.window.onDidCloseTerminal((closed) => {
            for (const [key, term] of CodeburnCommands.activeTerminals.entries()) {
                if (term === closed) {
                    CodeburnCommands.activeTerminals.delete(key);
                    break;
                }
            }
        });
    }

    private getOutputChannel(): vscode.OutputChannel {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('Agile Agent Canvas — Codeburn');
        }
        return this.outputChannel;
    }

    private print(message: string): void {
        const ch = this.getOutputChannel();
        ch.appendLine(message);
        ch.show(true);
    }

    private printSection(title: string): void {
        this.print('');
        this.print(`${'─'.repeat(60)}`);
        this.print(`  ${title}`);
        this.print(`${'─'.repeat(60)}`);
    }

    private getRoot(): string {
        return vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? '';
    }

    /**
     * Ensure codeburn is available. If missing, offers to bootstrap it.
     * @returns true if available (or was just installed), false otherwise
     */
    async ensureAvailable(): Promise<boolean> {
        const root = this.getRoot();
        if (!root) {
            vscode.window.showWarningMessage('No workspace open.');
            return false;
        }
        const status = detectCodeburn(root);
        if (!status.available) {
            const choice = await vscode.window.showWarningMessage(
                'codeburn is not installed. Install it now?',
                { modal: true },
                'Install Codeburn',
                'Open README'
            );
            if (choice === 'Install Codeburn') {
                // silent=true skips the redundant second modal inside bootstrapCodeburn
                const ok = await bootstrapCodeburn(root, { silent: true });
                return ok;
            }
            if (choice === 'Open README') {
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/getagentseal/codeburn#install'));
            }
            return false;
        }
        return true;
    }

    // ── Actions ─────────────────────────────────────────────────────────────

    /** Show a quick-pick menu for Codeburn actions */
    async handleMenu(): Promise<void> {
        const root = this.getRoot();
        if (!root) {
            vscode.window.showWarningMessage('No workspace open.');
            return;
        }

        const status = detectCodeburn(root);
        if (!status.available) {
            const choice = await vscode.window.showQuickPick(
                [
                    { label: '$(cloud-download) Install Codeburn', description: 'npm install -g codeburn', picked: true },
                    { label: '$(book) Open README', description: 'GitHub installation guide' },
                    { label: '$(refresh) Refresh Detection', description: 'Re-check after manual install' }
                ],
                { placeHolder: 'Codeburn is not installed. Choose an action:' }
            );
            if (!choice) { return; }
            if (choice.label.includes('Install')) {
                await bootstrapCodeburn(root);
            } else if (choice.label.includes('README')) {
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/getagentseal/codeburn#install'));
            } else if (choice.label.includes('Refresh')) {
                clearCodeburnCache(root);
                const st = detectCodeburn(root);
                vscode.window.showInformationMessage(
                    st.available ? `codeburn detected (${st.cliForm})` : 'codeburn still not found.'
                );
            }
            return;
        }

        const items: CodeburnMenuItem[] = [
            {
                label: '$(dashboard) Open Dashboard',
                description: 'Interactive TUI (7 days)',
                detail: 'Launch codeburn in an integrated terminal',
                value: 'dashboard'
            },
            {
                label: '$(report) Cost Report',
                description: 'Today, 7 days, 30 days',
                detail: 'Show formatted cost report in output panel',
                value: 'report'
            },
            {
                label: '$(database) Model Breakdown',
                description: 'Per-model token + cost table',
                detail: 'Top models by cost with token counts',
                value: 'models'
            },
            {
                label: '$(debug-start) Optimize',
                description: 'Find waste and get fixes',
                detail: 'Run codeburn optimize',
                value: 'optimize'
            },
            {
                label: '$(git-compare) Compare',
                description: 'Side-by-side model comparison (TUI)',
                detail: 'Launch codeburn compare in integrated terminal',
                value: 'compare'
            },
            {
                label: '$(export) Export JSON',
                description: 'Full data export',
                detail: 'Export today, 7d, 30d as JSON to output panel',
                value: 'export'
            },
            {
                label: '$(sync) Refresh Detection',
                description: 'Re-detect codeburn installation',
                detail: 'Useful after installing codeburn while VS Code is open',
                value: 'refresh'
            }
        ];

        const pick = await vscode.window.showQuickPick(items, {
            placeHolder: 'Choose a Codeburn action',
            matchOnDescription: true
        });
        if (!pick) { return; }

        switch (pick.value) {
            case 'dashboard': await this.openDashboard(); break;
            case 'report': await this.showReport(); break;
            case 'models': await this.showModels(); break;
            case 'optimize': await this.runOptimize(); break;
            case 'compare': await this.openCompare(); break;
            case 'export': await this.exportJson(); break;
            case 'refresh': {
                clearCodeburnCache(this.getRoot());
                const st = detectCodeburn(this.getRoot());
                vscode.window.showInformationMessage(
                    st.available ? `codeburn detected (${st.cliForm})` : 'codeburn still not found.'
                );
                break;
            }
        }
    }

    /** Open the interactive TUI dashboard in an integrated terminal */
    async openDashboard(): Promise<void> {
        if (!(await this.ensureAvailable())) { return; }
        await this.openTui('Dashboard', []);
    }

    /** Show a formatted cost report in the output channel */
    async showReport(): Promise<void> {
        if (!(await this.ensureAvailable())) { return; }
        const root = this.getRoot();

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Running codeburn report…', cancellable: false },
            async () => {
                const [today, week, month] = await Promise.all([
                    runCodeburn(CB.status(), { cwd: root }),
                    runCodeburn(CB.report('7days'), { cwd: root }),
                    runCodeburn(CB.report('30days'), { cwd: root })
                ]);

                this.printSection('Codeburn Cost Report');

                if (today.success && today.json) {
                    const j = today.json as Record<string, unknown>;
                    this.print(`Today:    $${pick(j, 'cost.total', 0)}  |  ${pick(j, 'tokens.total', 0)} tokens  |  ${pick(j, 'sessions', 0)} sessions`);
                } else {
                    this.print('Today:    (no data)');
                }

                if (week.success && week.json) {
                    const j = week.json as Record<string, unknown>;
                    this.print(`7 Days:   $${pick(j, 'cost.total', 0)}  |  ${pick(j, 'tokens.total', 0)} tokens  |  ${pick(j, 'sessions', 0)} sessions`);
                } else {
                    this.print('7 Days:   (no data)');
                }

                if (month.success && month.json) {
                    const j = month.json as Record<string, unknown>;
                    this.print(`30 Days:  $${pick(j, 'cost.total', 0)}  |  ${pick(j, 'tokens.total', 0)} tokens  |  ${pick(j, 'sessions', 0)} sessions`);
                } else {
                    this.print('30 Days:  (no data)');
                }

                vscode.window.showInformationMessage('Codeburn report ready. See "Agile Agent Canvas — Codeburn" output panel.');
            }
        );
    }

    /** Show per-model token + cost breakdown, optionally filtered by provider */
    async showModels(provider?: string): Promise<void> {
        if (!(await this.ensureAvailable())) { return; }
        const root = this.getRoot();

        const title = provider
            ? `Model Breakdown — ${provider} (Top 10)`
            : 'Model Breakdown (Top 10)';

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Running codeburn models${provider ? ` — ${provider}` : ''}…`, cancellable: false },
            async () => {
                const result = await runCodeburn(CB.models(10, false, provider), { cwd: root });
                this.printSection(title);

                if (!result.success || !result.json) {
                    this.print('Failed to fetch model breakdown.');
                    return;
                }

                const rows = Array.isArray(result.json) ? result.json : ((result.json as Record<string, unknown>).models ?? []) as unknown[];
                if (rows.length === 0) {
                    this.print('No model data found.');
                    return;
                }

                // Header
                this.print(`  ${'Model'.padEnd(24)} ${'Provider'.padEnd(12)} ${'Tokens'.padStart(12)} ${'Cost'.padStart(10)}`);
                this.print(`  ${'─'.repeat(62)}`);

                for (const row of rows.slice(0, 10)) {
                    const model = String(row.model ?? row.name ?? 'unknown').padEnd(24);
                    const prov = String(row.provider ?? '-').padEnd(12);
                    const tokens = String(row.tokens ?? row.totalTokens ?? 0).padStart(12);
                    const cost = `$${String(row.cost ?? row.totalCost ?? 0)}`.padStart(10);
                    this.print(`  ${model} ${prov} ${tokens} ${cost}`);
                }

                vscode.window.showInformationMessage('Model breakdown ready. See Codeburn output panel.');
            }
        );
    }

    /** Open the Compare TUI in an integrated terminal */
    async openCompare(): Promise<void> {
        if (!(await this.ensureAvailable())) { return; }
        await this.openTui('Compare', ['compare']);
    }

    /** Run optimize and show results */
    async runOptimize(): Promise<void> {
        if (!(await this.ensureAvailable())) { return; }
        await this.openTui('Optimize', ['optimize']);
    }

    /** Export JSON to output panel */
    async exportJson(): Promise<void> {
        if (!(await this.ensureAvailable())) { return; }
        const root = this.getRoot();

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Exporting Codeburn data…', cancellable: false },
            async () => {
                const result = await runCodeburn(CB.export(), { cwd: root });
                this.printSection('Codeburn Export');
                if (result.success) {
                    this.print(result.stdout);
                } else {
                    this.print(`Export failed: ${result.stderr}`);
                }
            }
        );
    }

    // ── Terminal management ─────────────────────────────────────────────────

    /**
     * Open a Codeburn TUI command in an integrated terminal.
     * Reuses an existing terminal for the same command to prevent leaks.
     */
    private async openTui(name: string, args: string[]): Promise<void> {
        const root = this.getRoot();

        const existing = CodeburnCommands.activeTerminals.get(name);
        if (existing && !existing.exitStatus) {
            existing.show();
            return;
        }

        const status = detectCodeburn(root);
        const argv = buildArgv(status.cliForm, status.binPath, args);

        const term = vscode.window.createTerminal({
            name: `Codeburn ${name}`,
            cwd: root
        });
        // Quote argv[0] if it contains spaces (common on Windows with user names)
        const cmd = argv[0].includes(' ') ? `"${argv[0]}"` : argv[0];
        term.sendText([cmd, ...argv.slice(1)].join(' '));
        term.show();

        CodeburnCommands.ensureTerminalListener();
        CodeburnCommands.activeTerminals.set(name, term);
    }

    // ── Chat-facing helpers ─────────────────────────────────────────────────

    /** Return a markdown summary for the chat participant */
    async getChatSummary(period?: string, cancellation?: vscode.CancellationToken): Promise<string> {
        try {
            const root = this.getRoot();
            if (!root) { return 'No workspace open.'; }

            const status = detectCodeburn(root);
            if (!status.available) {
                return (
                    '**Codeburn is not installed.**\n\n' +
                    'Install it globally to track AI coding costs:\n' +
                    '```bash\nnpm install -g codeburn\n```\n' +
                    '[Codeburn on GitHub](https://github.com/getagentseal/codeburn)'
                );
            }

            const args = period ? CB.report(period) : CB.status();
            const result = await runCodeburn(args, { cwd: root, timeoutMs: 15000, cancellation });

            if (!result.success) {
                return `**Codeburn error:** ${result.stderr}`;
            }

            if (result.json) {
                const j = result.json as Record<string, unknown>;
                const cost = pick(j, 'cost.total', pick(j, 'today.cost', pick(j, 'cost', 0)));
                const tokens = pick(j, 'tokens.total', pick(j, 'today.tokens', pick(j, 'tokens', 0)));
                const sessions = pick(j, 'sessions', pick(j, 'today.sessions', 0));
                const provider = pick(j, 'provider', 'mixed');

                return (
                    `## 💰 Codeburn Cost Summary${period ? ` (${period})` : ''}\n\n` +
                    `| Metric | Value |\n|---|---|\n` +
                    `| **Cost** | $${cost} |\n` +
                    `| **Tokens** | ${tokens.toLocaleString()} |\n` +
                    `| **Sessions** | ${sessions} |\n` +
                    `| **Provider** | ${provider} |\n\n` +
                    `Run \`/codeburn report\` for detailed breakdown or \`/codeburn models\` for per-model stats.`
                );
            }

            // Truncation guard for non-JSON stdout
            if (result.stdout.length > 2000) {
                return (
                    `## 💰 Codeburn${period ? ` (${period})` : ''}\n\n` +
                    'Output too large. Run `/codeburn export` to see full data.'
                );
            }

            return (
                `## 💰 Codeburn${period ? ` (${period})` : ''}\n\n` +
                '```\n' + result.stdout.slice(0, 1200) + '\n```'
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error('[CodeburnCommands] getChatSummary failed:', msg);
            return `**Codeburn error:** ${msg}`;
        }
    }

    /** Return a markdown model table for the chat participant, optionally filtered by provider */
    async getChatModels(provider?: string, cancellation?: vscode.CancellationToken): Promise<string> {
        try {
            const root = this.getRoot();
            if (!root) { return 'No workspace open.'; }

            const status = detectCodeburn(root);
            if (!status.available) {
                return 'Codeburn is not installed. Run `npm install -g codeburn` to track AI coding costs.';
            }

            const result = await runCodeburn(CB.models(10, false, provider), { cwd: root, timeoutMs: 15000, cancellation });
            if (!result.success || !result.json) {
                return `**Codeburn error:** ${result.stderr || 'No data'}`;
            }

            const rows = Array.isArray(result.json) ? result.json : ((result.json as Record<string, unknown>).models ?? []) as unknown[];
            if (rows.length === 0) { return `No model usage data found${provider ? ` for ${provider}` : ''}.`; }

            const heading = provider
                ? `## 🤖 Model Breakdown — ${provider}`
                : '## 🤖 Model Breakdown';
            let md = `${heading}\n\n`;
            md += '| Model | Provider | Tokens | Cost |\n|---|---|---|---:|\n';
            for (const row of rows.slice(0, 10)) {
                const model = row.model ?? row.name ?? 'unknown';
                const prov = row.provider ?? '-';
                const tokens = row.tokens ?? row.totalTokens ?? 0;
                const cost = row.cost ?? row.totalCost ?? 0;
                md += `| ${model} | ${prov} | ${tokens.toLocaleString()} | $${cost} |\n`;
            }
            md += '\n*Top models by total cost in the last 30 days.*';
            return md;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error('[CodeburnCommands] getChatModels failed:', msg);
            return `**Codeburn error:** ${msg}`;
        }
    }

    /** Return a side-by-side comparison of Claude Code, Copilot, Antigravity, and OpenCode */
    async getChatProviderComparison(): Promise<string> {
        try {
            const root = this.getRoot();
            if (!root) { return 'No workspace open.'; }

            const status = detectCodeburn(root);
            if (!status.available) {
                return 'Codeburn is not installed. Run `npm install -g codeburn` to track AI coding costs.';
            }

            const providers = ['claude', 'copilot', 'antigravity', 'opencode'];
            const results: Array<{ name: string; cost: number; tokens: number; calls: number }> = [];

            const settled = await Promise.all(
                providers.map(p =>
                    runCodeburn(CB.models(1, false, p), { cwd: root, timeoutMs: 10000 })
                        .then(res => ({ p, res }))
                        .catch(err => {
                            logger.warn(`[CodeburnCommands] compare fetch for ${p} failed:`, err);
                            return { p, res: { success: false, json: undefined } as { success: boolean; json?: unknown } };
                        })
                )
            );

            for (const { p, res } of settled) {
                if (res.success && res.json && Array.isArray(res.json) && res.json.length > 0) {
                    const agg = (res.json as Array<{ cost?: number; totalCost?: number; tokens?: number; totalTokens?: number; calls?: number }>).reduce(
                        (acc, row) => ({
                            cost: acc.cost + Number(row.cost ?? row.totalCost ?? 0),
                            tokens: acc.tokens + Number(row.tokens ?? row.totalTokens ?? 0),
                            calls: acc.calls + Number(row.calls ?? 0)
                        }),
                        { cost: 0, tokens: 0, calls: 0 } as { cost: number; tokens: number; calls: number }
                    );
                    results.push({ name: p, ...agg });
                } else {
                    results.push({ name: p, cost: 0, tokens: 0, calls: 0 });
                }
            }

            let md = '## 💰 Claude Code vs Copilot vs Antigravity vs OpenCode\n\n';
            md += '| Tool | Cost | Tokens | Calls |\n|---|---|---|---:|\n';
            for (const r of results) {
                md += `| **${r.name.charAt(0).toUpperCase() + r.name.slice(1)}** | $${r.cost} | ${r.tokens.toLocaleString()} | ${r.calls} |\n`;
            }
            md += '\n*Aggregated across all models per provider (last 30 days).*';
            return md;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error('[CodeburnCommands] getChatProviderComparison failed:', msg);
            return `**Codeburn error:** ${msg}`;
        }
    }
}
