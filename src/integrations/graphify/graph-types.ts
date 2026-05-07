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
    wired: boolean;
    builtAtCommit?: string;
    recommendation: GraphifyRecommendation;
}
