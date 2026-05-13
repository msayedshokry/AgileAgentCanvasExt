import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../utils/logger';
import { runGraphify } from './graphify-runner';
import { GFY } from './graphify-commands';
import { loadGraph, loadCommunities } from './graph-loader';

const logger = createLogger('graph-query');

const GRAPH_JSON_REL = 'graphify-out/graph.json';
const DEFAULT_BUDGET = 1500;

export interface GraphQueryResult {
    success: boolean;
    text: string;
}

/**
 * Run a natural-language query against the graph.
 * Wraps: python -m graphify query "<question>" --graph graphify-out/graph.json --budget N
 */
export async function graphQuery(
    workspaceRoot: string,
    question: string,
    budget = DEFAULT_BUDGET
): Promise<GraphQueryResult> {
    if (!question.trim()) {
        return { success: false, text: 'No question provided.' };
    }

    logger.debug(`graph-query: "${question}"`);

    const result = await runGraphify(
        GFY.query(question, GRAPH_JSON_REL, budget),
        { cwd: workspaceRoot, timeoutMs: 60_000 }
    );

    if (!result.success) {
        return {
            success: false,
            text: result.stderr || 'graphify query failed. Run "Bootstrap graphify" if no graph exists.'
        };
    }

    return { success: true, text: result.stdout.trim() };
}

/**
 * Find the shortest path between two graph nodes.
 * Wraps: python -m graphify path "<a>" "<b>" --graph graphify-out/graph.json
 */
export async function graphPath(
    workspaceRoot: string,
    nodeA: string,
    nodeB: string
): Promise<GraphQueryResult> {
    if (!nodeA.trim() || !nodeB.trim()) {
        return { success: false, text: 'Two node names are required.' };
    }

    logger.debug(`graph-path: "${nodeA}" → "${nodeB}"`);

    const result = await runGraphify(
        GFY.path(nodeA, nodeB, GRAPH_JSON_REL),
        { cwd: workspaceRoot, timeoutMs: 60_000 }
    );

    if (!result.success) {
        return {
            success: false,
            text: result.stderr || 'graphify path failed.'
        };
    }

    return { success: true, text: result.stdout.trim() };
}

/**
 * Explain a single graph node in plain language.
 * Wraps: python -m graphify explain "<node>"
 */
export async function graphExplain(
    workspaceRoot: string,
    node: string
): Promise<GraphQueryResult> {
    if (!node.trim()) {
        return { success: false, text: 'No node name provided.' };
    }

    logger.debug(`graph-explain: "${node}"`);

    const result = await runGraphify(
        GFY.explain(node, GRAPH_JSON_REL),
        { cwd: workspaceRoot, timeoutMs: 60_000 }
    );

    if (!result.success) {
        return {
            success: false,
            text: result.stderr || 'graphify explain failed.'
        };
    }

    return { success: true, text: result.stdout.trim() };
}

// ─── Community wiki loader ────────────────────────────────────────────────────

/**
 * Load the wiki page for a specific code community.
 * Normalises the community label to a filename and tries an exact + fuzzy match.
 * Falls back to synthesising a summary from graph data if no wiki exists.
 */
export async function loadCommunityWiki(
    workspaceRoot: string,
    communityLabel: string
): Promise<string | null> {
    const wikiDir = path.join(workspaceRoot, 'graphify-out', 'wiki');

    const normalise = (s: string) =>
        s.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');

    const target = normalise(communityLabel);

    if (fs.existsSync(wikiDir)) {
        // 1. Exact filename match
        const exactPath = path.join(wikiDir, `${target}.md`);
        if (fs.existsSync(exactPath)) {
            try { return fs.readFileSync(exactPath, 'utf-8'); } catch { /* fall through */ }
        }

        // 2. Fuzzy match: find best file in wiki dir
        try {
            const files = fs.readdirSync(wikiDir).filter(f => f.endsWith('.md') && f !== 'index.md');
            const bestMatch = files.find(f => {
                const base = normalise(f.replace(/\.md$/, ''));
                return base.includes(target) || target.includes(base);
            });
            if (bestMatch) {
                return fs.readFileSync(path.join(wikiDir, bestMatch), 'utf-8');
            }
        } catch { /* ignore */ }
    }

    // 3. Fallback: synthesise from graph data (no wiki generated yet)
    const graph = loadGraph(workspaceRoot);
    if (!graph) { return null; }

    const communities = loadCommunities(workspaceRoot);
    const comm = communities.find(
        c => normalise(c.label) === target ||
             c.label.toLowerCase().includes(communityLabel.toLowerCase())
    );
    if (!comm) { return null; }

    const lines = [
        `# Community: ${comm.label}`,
        ``,
        `**Size**: ${comm.size} nodes  |  **Files**: ${comm.files.length}`,
        `**Key nodes**: ${comm.godNodes.join(', ')}`,
        `**Neighbor communities**: ${comm.neighbors.join(', ') || 'none'}`,
        ``,
        `## Files`,
        ...comm.files.slice(0, 30).map(f => `- ${f}`),
        ...(comm.files.length > 30 ? [`- … and ${comm.files.length - 30} more`] : []),
        ``,
        `_Wiki not yet generated. Run \`graphify export wiki\` for richer community pages._`,
    ];
    return lines.join('\n');
}
