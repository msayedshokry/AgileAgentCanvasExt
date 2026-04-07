export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LoggerOutputSink = (line: string) => void;

let outputSink: LoggerOutputSink | null = null;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40
};

function getConfiguredLogLevel(): LogLevel {
    try {
        // Resolve vscode lazily so Node-based tests can run without VS Code runtime.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const vscode = require('vscode') as typeof import('vscode');
        const configured = vscode.workspace.getConfiguration('agileagentcanvas').get<string>('logLevel', 'info');
        if (configured === 'debug' || configured === 'info' || configured === 'warn' || configured === 'error') {
            return configured;
        }
    } catch {
        // Fallback used in tests or contexts without workspace configuration.
    }
    return 'info';
}

function shouldLog(level: LogLevel): boolean {
    return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[getConfiguredLogLevel()];
}

function formatPrefix(scope: string, level: LogLevel): string {
    return `[${scope}:${level}]`;
}

function stringifyArg(arg: unknown): string {
    if (typeof arg === 'string') {
        return arg;
    }
    if (arg instanceof Error) {
        return arg.stack || arg.message;
    }
    try {
        return JSON.stringify(arg);
    } catch {
        return String(arg);
    }
}

function toSinkLine(scope: string, level: LogLevel, args: unknown[]): string {
    const text = args.map(stringifyArg).join(' ');
    return `${formatPrefix(scope, level)} ${text}`.trim();
}

function emitToSink(scope: string, level: LogLevel, args: unknown[]): void {
    if (!outputSink) {
        return;
    }
    outputSink(toSinkLine(scope, level, args));
}

export function setLoggerOutputSink(sink: LoggerOutputSink | null): void {
    outputSink = sink;
}

export function createLogger(scope: string) {
    return {
        debug: (...args: unknown[]) => {
            if (shouldLog('debug')) {
                console.debug(formatPrefix(scope, 'debug'), ...args);
                emitToSink(scope, 'debug', args);
            }
        },
        info: (...args: unknown[]) => {
            if (shouldLog('info')) {
                emitToSink(scope, 'info', args);
            }
        },
        warn: (...args: unknown[]) => {
            if (shouldLog('warn')) {
                emitToSink(scope, 'warn', args);
            }
        },
        error: (...args: unknown[]) => {
            if (shouldLog('error')) {
                emitToSink(scope, 'error', args);
            }
        }
    };
}
