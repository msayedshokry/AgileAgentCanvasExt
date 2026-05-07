import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../utils/logger';
import { GraphCommunity, GraphJson } from './graph-types';

const logger = createLogger('graph-loader');

interface LoaderCache {
    mtime: number;
    graph: GraphJson;
    communities: GraphCommunity[];
    report: string;
}

const _cache = new Map<string, LoaderCache>();

function graphJsonPath(workspaceRoot: string) {
    return path.join(workspaceRoot, 'graphify-out', 'graph.json');
}

function graphReportPath(workspaceRoot: string) {
    return path.join(workspaceRoot, 'graphify-out', 'GRAPH_REPORT.md');
}

// ─── Graph JSON loader ───────────────────────────────────────────────────────

/**
 * Load and parse graph.json, with mtime-based caching.
 * Returns null if the file does not exist.
 */
export function loadGraph(workspaceRoot: string): GraphJson | null {
    const jsonPath = graphJsonPath(workspaceRoot);
    if (!fs.existsSync(jsonPath)) { return null; }

    try {
        const stat = fs.statSync(jsonPath);
        const mtime = stat.mtimeMs;
        const cached = _cache.get(workspaceRoot);
        if (cached && cached.mtime === mtime) {
            return cached.graph;
        }

        const raw = fs.readFileSync(jsonPath, 'utf-8');
        const graph: GraphJson = JSON.parse(raw);
        const communities = extractCommunities(graph);

        _cache.set(workspaceRoot, { mtime, graph, communities, report: '' });
        logger.info(`Loaded graph.json (${graph.nodes?.length ?? 0} nodes, ${graph.edges?.length ?? 0} edges)`);
        return graph;
    } catch (err: any) {
        logger.error('Failed to load graph.json:', err.message);
        return null;
    }
}

// ─── Community extraction ────────────────────────────────────────────────────

/**
 * Extract CodeCommunity objects from graph.json.
 * Returns an empty array if the graph has no community data.
 */
export function loadCommunities(workspaceRoot: string): GraphCommunity[] {
    const cached = _cache.get(workspaceRoot);
    if (cached) { return cached.communities; }

    // loadGraph will parse, extract communities, and populate the cache
    const graph = loadGraph(workspaceRoot);
    if (!graph) { return []; }
    // Return from cache — loadGraph already ran extractCommunities and stored it
    return _cache.get(workspaceRoot)?.communities ?? [];
}

function extractCommunities(graph: GraphJson): GraphCommunity[] {
    if (!graph.communities) { return []; }

    const communities: GraphCommunity[] = [];

    // Build a map: raw community id (e.g. "3") → files from nodes
    const communityFiles = new Map<string, Set<string>>();
    for (const node of graph.nodes ?? []) {
        if (node.community === undefined || !node.file) { continue; }
        const key = String(node.community);  // "3" to match Object.entries keys
        if (!communityFiles.has(key)) { communityFiles.set(key, new Set()); }
        communityFiles.get(key)!.add(node.file);
    }

    for (const [commId, meta] of Object.entries(graph.communities)) {
        const nodeIds: string[] = meta.nodes ?? [];
        const files = communityFiles.get(commId) ?? new Set<string>(); // commId is raw key ("3")

        // God nodes = nodes in this community with the highest degree
        const godNodes = findGodNodes(graph, nodeIds, 5);

        // Neighbours = other communities connected to this one
        const neighbors = findNeighborCommunities(graph, commId, nodeIds);

        communities.push({
            kind: 'code-community',
            id: `comm-${commId}`,   // canonical form: "comm-3"
            label: meta.label ?? commId,
            godNodes,
            files: [...files].sort(),
            size: nodeIds.length,
            neighbors
        });
    }

    return communities;
}

function findGodNodes(graph: GraphJson, nodeIds: string[], topN: number): string[] {
    const nodeSet = new Set(nodeIds);
    const degree = new Map<string, number>();

    for (const edge of graph.edges ?? []) {
        if (nodeSet.has(edge.source)) {
            degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
        }
        if (nodeSet.has(edge.target)) {
            degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
        }
    }

    return [...degree.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([id]) => {
            const node = graph.nodes?.find(n => n.id === id);
            return node?.label ?? id;
        });
}

function findNeighborCommunities(graph: GraphJson, commId: string, nodeIds: string[]): string[] {
    const nodeSet = new Set(nodeIds);
    const neighbors = new Set<string>();

    const nodeToComm = new Map<string, string>();
    if (graph.communities) {
        for (const [cid, meta] of Object.entries(graph.communities)) {
            for (const nid of meta.nodes ?? []) {
                nodeToComm.set(nid, cid);
            }
        }
    }

    for (const edge of graph.edges ?? []) {
        if (nodeSet.has(edge.source)) {
            const targetComm = nodeToComm.get(edge.target);
            if (targetComm && targetComm !== commId) { neighbors.add(targetComm); }
        }
        if (nodeSet.has(edge.target)) {
            const sourceComm = nodeToComm.get(edge.source);
            if (sourceComm && sourceComm !== commId) { neighbors.add(sourceComm); }
        }
    }

    return [...neighbors];
}

// ─── Report reader ───────────────────────────────────────────────────────────

/**
 * Read GRAPH_REPORT.md as a string.  Cached per workspace root.
 * Returns null if the file does not exist.
 */
export function loadReport(workspaceRoot: string): string | null {
    const reportPath = graphReportPath(workspaceRoot);
    if (!fs.existsSync(reportPath)) { return null; }

    try {
        return fs.readFileSync(reportPath, 'utf-8');
    } catch (err: any) {
        logger.error('Failed to read GRAPH_REPORT.md:', err.message);
        return null;
    }
}

/** Invalidate the loader cache when graphify-out changes. */
export function invalidateLoaderCache(workspaceRoot: string): void {
    _cache.delete(workspaceRoot);
}
