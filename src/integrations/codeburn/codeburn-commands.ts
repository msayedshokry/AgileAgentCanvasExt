/**
 * Central registry of codeburn CLI command arguments.
 *
 * All callers use CB.* rather than hardcoded string arrays.
 * Tested against codeburn 0.8.x.
 */

export const CB = {
    /** Interactive dashboard (default: 7 days) */
    dashboard: (): string[] => [],

    /** Today's usage as JSON */
    today: (): string[] => ['today', '--format', 'json'],

    /** Status compact one-liner as JSON */
    status: (): string[] => ['status', '--format', 'json'],

    /** Full report with optional period, as JSON */
    report: (period?: string): string[] => {
        const args = ['report', '--format', 'json'];
        if (period) { args.push('-p', period); }
        return args;
    },

    /** Export data (today, 7d, 30d) as JSON */
    export: (): string[] => ['export', '-f', 'json'],

    /** Model breakdown (last 30 days) as JSON */
    models: (top?: number, byTask?: boolean, provider?: string): string[] => {
        const args = ['models', '--format', 'json'];
        if (top) { args.push('--top', String(top)); }
        if (byTask) { args.push('--by-task'); }
        if (provider) { args.push('--provider', provider); }
        return args;
    },

    /** Optimize / find waste */
    optimize: (period?: string): string[] => {
        const args = ['optimize'];
        if (period) { args.push('-p', period); }
        return args;
    },

    /** Compare models */
    compare: (): string[] => ['compare'],

    /** Yield analysis as JSON */
    yield: (period?: string): string[] => {
        const args = ['yield', '--format', 'json'];
        if (period) { args.push('-p', period); }
        return args;
    },

    /** Refresh rate for dashboard (seconds) */
    dashboardRefresh: (seconds: number): string[] => ['--refresh', String(seconds)],
} as const;
