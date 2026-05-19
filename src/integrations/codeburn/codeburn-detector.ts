import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { createLogger } from '../../utils/logger';

const logger = createLogger('codeburn-detector');

export type CodeburnCliForm = 'cli' | 'npx' | 'local' | 'unavailable';

export interface CodeburnStatus {
    cliForm: CodeburnCliForm;
    /** Resolved absolute path to the binary when available */
    binPath?: string;
    available: boolean;
    version?: string;
}

// ─── Per-workspace cache ───────────────────────────────────────────────────

const cache = new Map<string, CodeburnStatus>();

function getCacheKey(cwd: string): string {
    return path.normalize(cwd).toLowerCase();
}

function tryReadPackageJson(cwd: string): { hasCodeburn?: boolean; binPath?: string } {
    const pkgPath = path.join(cwd, 'node_modules', 'codeburn', 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            const bin = pkg.bin as string | Record<string, string> | undefined;
            const binPath = typeof bin === 'string'
                ? path.join(cwd, 'node_modules', '.bin', 'codeburn')
                : bin?.codeburn
                    ? path.join(cwd, 'node_modules', '.bin', 'codeburn')
                    : undefined;
            return { hasCodeburn: true, binPath };
        } catch {
            return { hasCodeburn: true };
        }
    }
    return {};
}

/**
 * Spawn a command synchronously and return trimmed stdout on success.
 * Tries multiple resolution strategies for cross-platform reliability.
 */
function spawnSyncTrimmed(arg0: string, args: string[], extraOptions?: cp.SpawnSyncOptions): string | undefined {
    const baseOptions: cp.SpawnSyncOptions = {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
        ...extraOptions
    };

    // 1. Direct spawn (shell: false)
    try {
        const result = cp.spawnSync(arg0, args, { ...baseOptions, shell: false });
        if (result.status === 0 && result.stdout) {
            return (result.stdout as string).trim();
        }
    } catch { /* ignore */ }

    // 2. On Windows, try .cmd / .ps1 / .bat extensions explicitly
    if (process.platform === 'win32') {
        for (const ext of ['.cmd', '.ps1', '.bat']) {
            try {
                const result = cp.spawnSync(arg0 + ext, args, { ...baseOptions, shell: false });
                if (result.status === 0 && result.stdout) {
                    return (result.stdout as string).trim();
                }
            } catch { /* ignore */ }
        }
    }

    // 3. Shell spawn fallback — shell PATH resolution is often more reliable
    try {
        const result = cp.spawnSync(arg0, args, { ...baseOptions, shell: true });
        if (result.status === 0 && result.stdout) {
            return (result.stdout as string).trim();
        }
    } catch { /* ignore */ }

    return undefined;
}

/**
 * Run `where` (Windows) or `which` (Unix) to resolve a command to its absolute path.
 * On Windows, prefers `.cmd` / `.bat` over extension-less bash scripts so that
 * cmd.exe can execute the path directly.
 */
function locateViaShell(command: string): string | undefined {
    const shellCommand = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSyncTrimmed(shellCommand, [command], { shell: true });
    if (!result) { return undefined; }
    const lines = result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { return undefined; }

    // On Windows, `where` may return extension-less bash scripts first.
    // Prefer .cmd / .bat / .exe so cp.spawn with shell:true works reliably.
    if (process.platform === 'win32') {
        const preferred = lines.find(l => /\.(cmd|bat|exe)$/i.test(l)) ?? lines.find(l => fs.existsSync(l));
        return preferred;
    }

    return lines.find(l => fs.existsSync(l));
}

/**
 * Ask npm for its global prefix, then construct likely bin paths.
 */
function getNpmGlobalPrefix(): string | undefined {
    const prefix = spawnSyncTrimmed(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['config', 'get', 'prefix']);
    if (!prefix) { return undefined; }
    // npm may return the path with quotes or trailing newline already trimmed
    const cleaned = prefix.replace(/^["']|["']$/g, '').trim();
    if (cleaned && fs.existsSync(cleaned)) {
        return cleaned;
    }
    return undefined;
}

/**
 * Resolve the absolute path to a globally-installed codeburn binary.
 * Tries: shell locator, npm prefix + known paths, common fallback paths.
 */
function resolveGlobalCodeburnPath(): string | undefined {
    // 1. Ask the shell where it is
    const shellPath = locateViaShell('codeburn');
    if (shellPath) { return shellPath; }

    // 2. Resolve via npm prefix
    const prefix = getNpmGlobalPrefix();
    if (prefix) {
        const candidates: string[] = [];
        if (process.platform === 'win32') {
            // On Windows, npm global bin is usually the prefix directory itself
            candidates.push(
                path.join(prefix, 'codeburn.cmd'),
                path.join(prefix, 'codeburn.ps1'),
                path.join(prefix, 'codeburn.bat'),
                path.join(prefix, 'node_modules', '.bin', 'codeburn.cmd'),
                path.join(prefix, 'node_modules', '.bin', 'codeburn.ps1')
            );
        } else {
            candidates.push(
                path.join(prefix, 'bin', 'codeburn'),
                path.join(prefix, 'lib', 'node_modules', '.bin', 'codeburn')
            );
        }
        for (const c of candidates) {
            if (fs.existsSync(c)) {
                return c;
            }
        }
    }

    // 3. Common fallback paths (best-effort)
    const fallbackPaths: string[] = [];
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA;
        const programFiles = process.env.ProgramFiles;
        const localAppData = process.env.LOCALAPPDATA;
        if (appData) {
            fallbackPaths.push(path.join(appData, 'npm', 'codeburn.cmd'));
        }
        if (localAppData) {
            fallbackPaths.push(path.join(localAppData, 'npm', 'codeburn.cmd'));
        }
        if (programFiles) {
            fallbackPaths.push(path.join(programFiles, 'nodejs', 'codeburn.cmd'));
        }
    } else {
        fallbackPaths.push(
            '/usr/local/bin/codeburn',
            '/usr/bin/codeburn',
            path.join(process.env.HOME ?? '', '.local', 'bin', 'codeburn'),
            path.join(process.env.HOME ?? '', '.npm-global', 'bin', 'codeburn')
        );
    }
    for (const c of fallbackPaths) {
        if (fs.existsSync(c)) {
            return c;
        }
    }

    return undefined;
}

/**
 * Detect how codeburn can be invoked in this workspace.
 * Cached per workspace root for the session.
 */
export function detectCodeburn(cwd: string): CodeburnStatus {
    const key = getCacheKey(cwd);
    const cached = cache.get(key);
    if (cached) { return cached; }

    // 0. User-configured custom path (highest priority)
    const customPath = vscode.workspace
        .getConfiguration('agileagentcanvas')
        .get<string>('codeburn.path', '');
    if (customPath && fs.existsSync(customPath) && fs.statSync(customPath).isFile()) {
        const version = spawnSyncTrimmed(customPath, ['--version']);
        const status: CodeburnStatus = { cliForm: 'cli', available: true, binPath: customPath, version: version ?? 'unknown' };
        cache.set(key, status);
        return status;
    }

    // 1. Global CLI — resolve actual path for reliable spawning on Windows
    const globalBinPath = resolveGlobalCodeburnPath();
    if (globalBinPath) {
        const version = spawnSyncTrimmed(globalBinPath, ['--version']);
        if (version) {
            const status: CodeburnStatus = { cliForm: 'cli', available: true, binPath: globalBinPath, version };
            cache.set(key, status);
            return status;
        }
    }

    // 2. Local node_modules install
    const local = tryReadPackageJson(cwd);
    const localBinPath = local.binPath ?? path.join(cwd, 'node_modules', '.bin', 'codeburn');
    if (local.hasCodeburn && fs.existsSync(localBinPath)) {
        const version = spawnSyncTrimmed(localBinPath, ['--version']) ?? spawnSyncTrimmed('node', [localBinPath, '--version']);
        const status: CodeburnStatus = { cliForm: 'local', binPath: localBinPath, available: true, version: version ?? 'unknown' };
        cache.set(key, status);
        return status;
    }

    // 3. npx fallback (slower — spawnSync to verify; use longer timeout because
    //    a cold npx download can take 10-30 seconds)
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const npxVersion = spawnSyncTrimmed(npxCmd, ['--yes', 'codeburn', '--version'], { timeout: 30_000 });
    if (npxVersion) {
        const status: CodeburnStatus = { cliForm: 'npx', available: true, version: npxVersion };
        cache.set(key, status);
        return status;
    }

    const status: CodeburnStatus = { cliForm: 'unavailable', available: false };
    cache.set(key, status);
    return status;
}

export function clearCodeburnCache(cwd: string): void {
    cache.delete(getCacheKey(cwd));
}

export function resetCodeburnCache(): void {
    cache.clear();
}
