import { createLogger } from '../../utils/logger';
import { runGraphify } from './graphify-runner';

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
        ['query', question, '--graph', GRAPH_JSON_REL, '--budget', String(budget)],
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
        ['path', nodeA, nodeB, '--graph', GRAPH_JSON_REL],
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
        ['explain', node, '--graph', GRAPH_JSON_REL],
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
