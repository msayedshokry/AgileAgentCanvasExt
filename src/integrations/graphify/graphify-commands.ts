/**
 * Central registry of graphify CLI command arguments.
 *
 * When the graphify API changes between versions, update only this file.
 * All callers use GFY.* rather than hardcoded string arrays.
 *
 * Tested against graphify 0.7.16.
 */

const DOT = '.';

export const GFY = {
    /**
     * Full pipeline: detect + extract + cluster + report. (graphify 0.7.16+)
     * Replaces the old multi-step: detect → extract → build → report → index.
     */
    extract: (backend?: string): string[] =>
        backend ? ['extract', DOT, '--backend', backend] : ['extract', DOT],

    /** Incremental re-extraction of changed files without LLM. */
    update: (): string[] => ['update', DOT],

    /**
     * Rerun clustering + regenerate report on an existing graph.json.
     * Replaces the old `index` command removed in graphify 0.7.16.
     */
    clusterOnly: (): string[] => ['cluster-only', DOT],

    /** Check if semantic re-extraction is pending (cron-safe, fast). Exits 1 = stale. */
    checkUpdate: (): string[] => ['check-update', DOT],

    /** Install git post-commit/post-checkout hooks. */
    hookInstall: (): string[] => ['hook', 'install'],

    /** Wire graphify into VS Code Copilot Chat (skill + copilot-instructions). */
    vscodeInstall: (): string[] => ['vscode', 'install'],

    /**
     * Export community wiki pages.
     * @deprecated Removed in graphify 0.7.16; wiki is now generated automatically by `extract`.
     * Kept for graceful degradation — callers should handle failure silently.
     */
    exportWiki: (): string[] => ['export', 'wiki'],

    /** BFS/DFS semantic graph query. */
    query: (question: string, graphJson: string, budget: number): string[] =>
        ['query', question, '--graph', graphJson, '--budget', String(budget)],

    /** Shortest dependency path between two graph nodes. */
    path: (nodeA: string, nodeB: string, graphJson: string): string[] =>
        ['path', nodeA, nodeB, '--graph', graphJson],

    /** Plain-language explanation of a node and its neighbors. */
    explain: (node: string, graphJson: string): string[] =>
        ['explain', node, '--graph', graphJson],
} as const;
