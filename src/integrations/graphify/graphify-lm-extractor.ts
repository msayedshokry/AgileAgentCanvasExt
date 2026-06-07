/**
 * Integrated graphify pipeline that uses the VS Code Language Model API
 * (Copilot, Claude, etc.) for semantic extraction instead of requiring
 * a separate API key for the graphify CLI.
 *
 * Pipeline:
 *   1. detect (Python, no LLM)
 *   2. AST structural extraction (Python, no LLM)
 *   3. Semantic extraction (VS Code LM API — uses whatever model is active)
 *   4. Merge AST + semantic results
 *   5. Build graph + cluster + report (Python, no LLM)
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../utils/logger';
import { selectModel, BmadModel } from '../../chat/ai-provider';
import { getGraphifyOutputChannel } from './graphify-runner';

const logger = createLogger('graphify-lm-extractor');

// ─── Types ───────────────────────────────────────────────────────────────────

interface DetectResult {
    total_files: number;
    total_words: number;
    files: Record<string, string[]>;
}

interface ExtractionFragment {
    nodes: Array<{ id: string; label: string; file_type?: string }>;
    edges: Array<{ source: string; target: string; relation: string; confidence?: string }>;
    hyperedges?: any[];
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run the full graphify pipeline using the VS Code LM for semantic extraction.
 * Returns true on success, false on failure.
 */
export async function buildGraphIntegrated(
    workspaceRoot: string,
    token: vscode.CancellationToken,
    onProgress?: (msg: string) => void
): Promise<boolean> {
    const channel = getGraphifyOutputChannel();
    const outDir = path.join(workspaceRoot, 'graphify-out');
    fs.mkdirSync(outDir, { recursive: true });

    const pythonPath = vscode.workspace
        .getConfiguration('agileagentcanvas')
        .get<string>('graphify.pythonPath', 'python');

    const log = (msg: string) => {
        channel.appendLine(msg);
        onProgress?.(msg);
        logger.info(msg);
    };

    // ── Step 1: Detect ───────────────────────────────────────────────────────
    log('[graphify] Step 1/5: Detecting files…');
    const detectResult = await runPython(pythonPath, workspaceRoot, DETECT_SCRIPT(workspaceRoot));
    if (!detectResult.success) {
        channel.appendLine(`[error] detect failed: ${detectResult.stderr}`);
        return false;
    }
    if (token.isCancellationRequested) { return false; }

    const detectJson = safeReadJson<DetectResult>(path.join(outDir, '.graphify_detect.json'));
    if (!detectJson || detectJson.total_files === 0) {
        log('[graphify] No supported files found.');
        return false;
    }
    log(`[graphify] Corpus: ${detectJson.total_files} files, ~${detectJson.total_words} words`);

    // ── Step 2: AST extraction (structural, no LLM) ──────────────────────────
    log('[graphify] Step 2/5: AST structural extraction…');
    const astResult = await runPython(pythonPath, workspaceRoot, AST_EXTRACT_SCRIPT);
    if (!astResult.success) {
        channel.appendLine(`[error] AST extraction failed: ${astResult.stderr}`);
        return false;
    }
    if (token.isCancellationRequested) { return false; }

    const astJson = safeReadJson<ExtractionFragment>(path.join(outDir, '.graphify_ast.json'));
    log(`[graphify] AST: ${astJson?.nodes?.length ?? 0} nodes, ${astJson?.edges?.length ?? 0} edges`);

    // ── Step 3: Semantic extraction (VS Code LM) ─────────────────────────────
    log('[graphify] Step 3/5: Semantic extraction via Language Model…');
    const model = await selectModel();
    if (!model) {
        log('[graphify] No Language Model available — skipping semantic extraction.');
        log('[graphify] (Graph will contain only structural/AST data)');
        // Write AST as the full extraction so build/cluster/report can proceed
        const extractPath = path.join(outDir, '.graphify_extract.json');
        fs.writeFileSync(extractPath, JSON.stringify(astJson ?? { nodes: [], edges: [], hyperedges: [] }, null, 2));
    } else {
        const semanticFragments = await extractSemantic(model, detectJson, workspaceRoot, token, log);
        if (token.isCancellationRequested) { return false; }

        // Merge AST + semantic
        const merged: ExtractionFragment = {
            nodes: [...(astJson?.nodes ?? []), ...semanticFragments.nodes],
            edges: [...(astJson?.edges ?? []), ...semanticFragments.edges],
            hyperedges: [...(astJson?.hyperedges ?? []), ...(semanticFragments.hyperedges ?? [])]
        };
        const extractPath = path.join(outDir, '.graphify_extract.json');
        fs.writeFileSync(extractPath, JSON.stringify(merged, null, 2));
        log(`[graphify] Merged: ${merged.nodes.length} nodes, ${merged.edges.length} edges`);
    }
    if (token.isCancellationRequested) { return false; }

    // ── Step 4: Build graph + cluster ────────────────────────────────────────
    log('[graphify] Step 4/5: Building graph and clustering…');
    const buildResult = await runPython(pythonPath, workspaceRoot, BUILD_CLUSTER_SCRIPT);
    if (!buildResult.success) {
        channel.appendLine(`[error] build/cluster failed: ${buildResult.stderr}`);
        return false;
    }
    if (token.isCancellationRequested) { return false; }

    // ── Step 5: Generate report + visualization ──────────────────────────────
    log('[graphify] Step 5/5: Generating report…');
    const reportResult = await runPython(pythonPath, workspaceRoot, REPORT_SCRIPT);
    if (!reportResult.success) {
        channel.appendLine(`[error] report generation failed: ${reportResult.stderr}`);
        return false;
    }

    log('[graphify] Pipeline complete.');
    return true;
}

// ─── Semantic extraction via VS Code LM ──────────────────────────────────────

const EXTRACTION_PROMPT = `You are a graphify extraction subagent. Read the files listed below and extract a knowledge graph fragment.
Output ONLY valid JSON (no markdown fences, no explanation): {"nodes": [...], "edges": [...], "hyperedges": []}

Each node: {"id": "unique_id", "label": "Human Name", "file_type": "code|document|paper|image"}
Each edge: {"source": "node_id", "target": "node_id", "relation": "verb_phrase", "confidence": "EXTRACTED|INFERRED|AMBIGUOUS"}
hyperedges: [] unless you find a genuine group relationship (3+ nodes sharing one semantic role)

Focus on: modules, classes, key functions, architectural concepts, data flows, dependencies, and domain entities.
Do NOT extract trivial implementation details (local variables, utility helpers, imports).`;

async function extractSemantic(
    model: BmadModel,
    detect: DetectResult,
    workspaceRoot: string,
    token: vscode.CancellationToken,
    log: (msg: string) => void
): Promise<ExtractionFragment> {
    // Collect all files that benefit from semantic analysis
    const allFiles: string[] = [];
    for (const [_type, files] of Object.entries(detect.files)) {
        allFiles.push(...files);
    }

    if (allFiles.length === 0) {
        return { nodes: [], edges: [], hyperedges: [] };
    }

    // Chunk into groups of ~20 files
    const CHUNK_SIZE = 20;
    const chunks: string[][] = [];
    for (let i = 0; i < allFiles.length; i += CHUNK_SIZE) {
        chunks.push(allFiles.slice(i, i + CHUNK_SIZE));
    }

    log(`[graphify] Semantic: ${allFiles.length} files in ${chunks.length} chunk(s)`);

    const allNodes: ExtractionFragment['nodes'] = [];
    const allEdges: ExtractionFragment['edges'] = [];
    const allHyperedges: any[] = [];

    for (let i = 0; i < chunks.length; i++) {
        if (token.isCancellationRequested) { break; }
        log(`[graphify] Extracting chunk ${i + 1}/${chunks.length}…`);

        const chunk = chunks[i];
        const fileContents = readFileChunk(chunk, workspaceRoot);

        if (!fileContents.trim()) { continue; }

        const fragment = await callLmForExtraction(model, fileContents, token);
        if (fragment) {
            allNodes.push(...(fragment.nodes ?? []));
            allEdges.push(...(fragment.edges ?? []));
            allHyperedges.push(...(fragment.hyperedges ?? []));
        }
    }

    return { nodes: allNodes, edges: allEdges, hyperedges: allHyperedges };
}

function readFileChunk(files: string[], workspaceRoot: string): string {
    const parts: string[] = [];
    let totalChars = 0;
    const MAX_CHARS = 80_000; // stay within typical context limits

    for (const file of files) {
        if (totalChars > MAX_CHARS) { break; }
        const absPath = path.isAbsolute(file) ? file : path.join(workspaceRoot, file);
        try {
            const content = fs.readFileSync(absPath, 'utf-8');
            const trimmed = content.slice(0, 4000); // max 4k per file
            parts.push(`--- FILE: ${file} ---\n${trimmed}\n`);
            totalChars += trimmed.length;
        } catch {
            // skip unreadable files
        }
    }
    return parts.join('\n');
}

async function callLmForExtraction(
    model: BmadModel,
    fileContents: string,
    token: vscode.CancellationToken
): Promise<ExtractionFragment | null> {
    const prompt = `${EXTRACTION_PROMPT}\n\nFiles:\n${fileContents}`;

    try {
        if (model.vscodeLm) {
            // VS Code Language Model API path
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            const response = await model.vscodeLm.sendRequest(messages, {}, token);
            let full = '';
            for await (const chunk of response.text) {
                if (token.isCancellationRequested) { return null; }
                full += chunk;
            }
            return parseJsonResponse(full);
        } else {
            // For other providers, use a simplified single-shot approach
            // (Antigravity, direct API — they're handled elsewhere but we log a warning)
            logger.warn('Semantic extraction requires VS Code LM API; non-LM providers not yet supported for graphify');
            return null;
        }
    } catch (err: any) {
        logger.error('LM extraction error:', err.message);
        return null;
    }
}

function parseJsonResponse(raw: string): ExtractionFragment | null {
    // Strip markdown fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    try {
        const parsed = JSON.parse(cleaned);
        return {
            nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
            edges: Array.isArray(parsed.edges) ? parsed.edges : [],
            hyperedges: Array.isArray(parsed.hyperedges) ? parsed.hyperedges : []
        };
    } catch {
        logger.warn('Failed to parse LM extraction response as JSON');
        return null;
    }
}

// ─── Python script templates ─────────────────────────────────────────────────

function DETECT_SCRIPT(inputPath: string): string {
    // Escape backslashes for Python string
    const escaped = inputPath.replace(/\\/g, '\\\\');
    return `
import json, sys
from graphify.detect import detect
from pathlib import Path

result = detect(Path('${escaped}'))
Path('graphify-out/.graphify_detect.json').write_text(json.dumps(result, indent=2))
total = result.get('total_files', 0)
words = result.get('total_words', 0)
print(f'Corpus: {total} files, ~{words} words')
`;
}

const AST_EXTRACT_SCRIPT = `
import json
from graphify.extract import collect_files, extract
from pathlib import Path

detect = json.loads(Path('graphify-out/.graphify_detect.json').read_text())
code_files = []
for f in detect.get('files', {}).get('code', []):
    p = Path(f)
    code_files.extend(collect_files(p) if p.is_dir() else [p])

if code_files:
    result = extract(code_files)
    Path('graphify-out/.graphify_ast.json').write_text(json.dumps(result, indent=2))
    print(f'AST: {len(result["nodes"])} nodes, {len(result["edges"])} edges')
else:
    Path('graphify-out/.graphify_ast.json').write_text(json.dumps({'nodes':[],'edges':[],'input_tokens':0,'output_tokens':0}))
    print('No code files - skipping AST extraction')
`;

const BUILD_CLUSTER_SCRIPT = `
import json
from graphify.build import build_from_json
from graphify.cluster import cluster
from graphify.analyze import god_nodes, surprising_connections
from pathlib import Path
import networkx as nx
from networkx.readwrite import json_graph

extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text())
G = build_from_json(extraction)
communities = cluster(G)
gods = god_nodes(G)
surprises = surprising_connections(G, communities)

graph_data = json_graph.node_link_data(G)
Path('graphify-out/graph.json').write_text(json.dumps(graph_data, indent=2))
Path('graphify-out/.graphify_analysis.json').write_text(json.dumps({
    'communities': {str(k): v for k, v in communities.items()},
    'cohesion': {},
    'god_nodes': gods,
    'surprises': surprises,
}, indent=2))
print(f'Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities')
`;

const REPORT_SCRIPT = `
import json
from graphify.build import build_from_json
from graphify.cluster import cluster
from graphify.analyze import god_nodes, surprising_connections
from graphify.report import generate
from pathlib import Path

extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text())
analysis = json.loads(Path('graphify-out/.graphify_analysis.json').read_text())
detection_result = json.loads(Path('graphify-out/.graphify_detect.json').read_text())

G = build_from_json(extraction)
communities = {int(k): v for k, v in analysis['communities'].items()}
gods = god_nodes(G)
surprises = surprising_connections(G, communities)

token_cost = {'input_tokens': 0, 'output_tokens': 0}
root = str(Path('graphify-out').absolute().parent)

report = generate(G, communities, {}, {}, gods, surprises, detection_result, token_cost, root)
Path('graphify-out/GRAPH_REPORT.md').write_text(report, encoding='utf-8')
print('GRAPH_REPORT.md written')

try:
    from graphify.export import to_html
    to_html(G, communities, 'graphify-out/graph.html')
    print('graph.html written')
except (ValueError, ImportError) as e:
    print(f'Visualization skipped: {e}')
`;

// ─── Python runner helper ────────────────────────────────────────────────────

interface PythonResult {
    success: boolean;
    stdout: string;
    stderr: string;
}

function runPython(pythonPath: string, cwd: string, script: string): Promise<PythonResult> {
    return new Promise((resolve) => {
        const proc = cp.spawn(pythonPath, ['-c', script], {
            cwd,
            shell: false,
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';
        const channel = getGraphifyOutputChannel();

        proc.stdout?.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            stdout += text;
            text.split('\n').forEach(line => {
                if (line.trim()) { channel.appendLine(line); }
            });
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            stderr += text;
            text.split('\n').forEach(line => {
                if (line.trim()) { channel.appendLine(`[stderr] ${line}`); }
            });
        });

        proc.on('error', (err) => {
            resolve({ success: false, stdout, stderr: err.message });
        });

        proc.on('close', (code) => {
            resolve({ success: (code ?? 1) === 0, stdout, stderr });
        });
    });
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function safeReadJson<T>(filePath: string): T | null {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
        return null;
    }
}
