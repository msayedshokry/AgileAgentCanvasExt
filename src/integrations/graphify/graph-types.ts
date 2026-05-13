// ─── graphify types ──────────────────────────────────────────────────────────
// Shared type definitions for the graphify knowledge-graph integration.
// These mirror the shape of graphify-out/graph.json and GRAPH_REPORT.md.

export interface GraphNode {
    id: string;
    label: string;
    type?: string;          // 'code' | 'concept' | 'rationale' | 'doc' | ...
    community?: number;
    file?: string;
    line?: number;
    docstring?: string;
    confidence?: number;    // 0.0–1.0 for INFERRED nodes
}

export interface GraphEdge {
    source: string;
    target: string;
    relation: string;       // e.g. 'calls', 'imports', 'semantically_similar_to'
    type: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';
    confidence?: number;    // 0.0–1.0; always 1.0 for EXTRACTED
}

export interface GraphCommunity {
    kind: 'code-community';
    id: string;             // 'comm-3'
    label: string;          // 'Auth & Session'
    godNodes: string[];
    files: string[];
    size: number;
    neighbors: string[];
    summary?: string;
}

export interface GraphJson {
    nodes: GraphNode[];
    edges: GraphEdge[];
    communities?: Record<string, { label?: string; nodes: string[] }>;
    built_at_commit?: string;
    metadata?: {
        generatedAt?: string;
        fileCount?: number;
        nodeCount?: number;
        edgeCount?: number;
    };
}

// ─── Architecture Index types ─────────────────────────────────────────────────
// Mirrors the output of `graphify index .` → graphify-out/ARCH_INDEX.json

export interface ArchCommunity {
    id: number;
    label: string;
    directories: string[];
    fileCount: number;
    nodeCount: number;
    godNodes: string[];
    neighbors: number[];
    summary: string;
}

export interface ArchGodNode {
    id: string;
    label: string;
    degree: number;
    community: number | null;
}

export interface ArchCrossEdge {
    from: number;
    to: number;
    edgeCount: number;
    topRelations: string[];
}

export interface ArchIndex {
    repo: string;
    generatedAt: string;
    stats: {
        files: number;
        nodes: number;
        edges: number;
        communities: number;
    };
    communities: ArchCommunity[];
    globalGodNodes: ArchGodNode[];
    crossCommunityEdges: ArchCrossEdge[];
    navigation: {
        fullReport: string;
        wiki: string;
        graph: string;
    };
}

export type GraphifyCliForm = 'cli' | 'module' | 'unavailable';

export type GraphifyRecommendation =
    | 'none'
    | 'install'    // graphify not installed
    | 'bootstrap'  // installed but no graph yet
    | 'update'     // graph exists but stale
    | 'wire'       // graph exists but not wired into copilot-instructions
    | 'ready';     // fully operational

export interface GraphifyStatus {
    cliForm: GraphifyCliForm;
    graphPresent: boolean;
    reportPresent: boolean;
    wikiPresent: boolean;
    archIndexPresent: boolean;
    /** Absolute path to an HTML report file in graphify-out/ (e.g. report.html, index.html) if one exists. */
    htmlReportPath?: string;
    wired: boolean;
    builtAtCommit?: string;
    recommendation: GraphifyRecommendation;
}
