import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../utils/logger';
import { GraphifyCliForm, GraphifyRecommendation, GraphifyStatus } from './graph-types';

const logger = createLogger('graphify-detector');

// Cache per workspace root so we don't shell-out on every command.
const statusCache = new Map<string, GraphifyStatus>();

/**
 * Clear the detection cache (call when graphify-out/ changes on disk).
 */
export function clearGraphifyCache(workspaceRoot?: string): void {
    if (workspaceRoot) {
        statusCache.delete(workspaceRoot);
    } else {
        statusCache.clear();
    }
}

/**
 * Probe which form of the graphify CLI is available.
 * Order: bare `graphify` → `python -m graphify` → unavailable.
 * Result is cached globally (process lifetime).
 */
let _cliFormCache: GraphifyCliForm | undefined;
function detectCliForm(pythonPath: string): GraphifyCliForm {
    if (_cliFormCache !== undefined) { return _cliFormCache; }

    // Use cp.spawnSync with shell:false to avoid command injection via pythonPath config
    const cliProbe = cp.spawnSync('graphify', ['--version'], { stdio: 'ignore', timeout: 5000, shell: false });
    if (cliProbe.status === 0) {
        _cliFormCache = 'cli';
        logger.info('graphify CLI form: bare graphify command');
        return _cliFormCache;
    }

    const modProbe = cp.spawnSync(pythonPath, ['-m', 'graphify', '--version'], { stdio: 'ignore', timeout: 5000, shell: false });
    if (modProbe.status === 0) {
        _cliFormCache = 'module';
        logger.info('graphify CLI form: python -m graphify');
        return _cliFormCache;
    }

    _cliFormCache = 'unavailable';
    logger.info('graphify CLI form: unavailable');
    return _cliFormCache;
}

/** Reset the CLI-form probe cache (useful after install). */
export function resetCliFormCache(): void {
    _cliFormCache = undefined;
}

/**
 * Run full detection for a workspace root and return the cached GraphifyStatus.
 */
export function detectGraphify(workspaceRoot: string, pythonPath = 'python'): GraphifyStatus {
    if (statusCache.has(workspaceRoot)) {
        return statusCache.get(workspaceRoot)!;
    }

    const cliForm = detectCliForm(pythonPath);

    const graphJson = path.join(workspaceRoot, 'graphify-out', 'graph.json');
    const graphReport = path.join(workspaceRoot, 'graphify-out', 'GRAPH_REPORT.md');
    const wikiIndex = path.join(workspaceRoot, 'graphify-out', 'wiki', 'index.md');
    const copilotInstructions = path.join(workspaceRoot, '.github', 'copilot-instructions.md');

    const graphPresent = fs.existsSync(graphJson);
    const reportPresent = fs.existsSync(graphReport);
    const wikiPresent = fs.existsSync(wikiIndex);

    let wired = false;
    try {
        if (fs.existsSync(copilotInstructions)) {
            const content = fs.readFileSync(copilotInstructions, 'utf-8');
            wired = content.includes('graphify');
        }
    } catch {
        // ignore read errors
    }

    // Extract built_at_commit from graph.json if present
    let builtAtCommit: string | undefined;
    if (graphPresent) {
        try {
            const raw = fs.readFileSync(graphJson, 'utf-8');
            const parsed = JSON.parse(raw);
            builtAtCommit = parsed.built_at_commit;
        } catch {
            // ignore parse errors — will surface via graph-loader
        }
    }

    const recommendation = deriveRecommendation(cliForm, graphPresent, wired);

    const status: GraphifyStatus = { cliForm, graphPresent, reportPresent, wikiPresent, wired, builtAtCommit, recommendation };
    statusCache.set(workspaceRoot, status);
    logger.debug('graphify status', JSON.stringify(status));
    return status;
}

function deriveRecommendation(
    cliForm: GraphifyCliForm,
    graphPresent: boolean,
    wired: boolean
): GraphifyRecommendation {
    if (cliForm === 'unavailable') { return 'install'; }
    if (!graphPresent)             { return 'bootstrap'; }
    if (!wired)                    { return 'wire'; }
    return 'ready';
}
