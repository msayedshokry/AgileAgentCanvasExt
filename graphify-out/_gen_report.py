"""Step 5-9 + GRAPH_REPORT.md runner. Loads graph, clusters, labels, exports, generates report."""
import json
import warnings
warnings.filterwarnings("ignore")
from pathlib import Path
from collections import Counter

import networkx as nx
import graphify.build as gb
import graphify.cluster as gc
import graphify.analyze as ga
import graphify.export as ge
import graphify.report as gr
import graphify.manifest as gm

CHUNKS_DIR = Path("graphify-out")

# Load
extractions = []
for cf in sorted(CHUNKS_DIR.glob(".graphify_chunk_*.json")):
    extractions.append(json.loads(cf.read_text(encoding="utf-8")))
ast_path = CHUNKS_DIR / ".graphify_ast.json"
if ast_path.exists():
    extractions.append(json.loads(ast_path.read_text(encoding="utf-8")))
print(f"[load] {len(extractions)} extractions")

# Build
G = gb.build(extractions, directed=False)
print(f"[build] {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

# Cluster
communities = gc.cluster(G)
cohesion = gc.score_all(G, communities)
print(f"[cluster] {len(communities)} communities")

# Label
community_labels = {}
for cid, nodes in communities.items():
    files = [G.nodes[n].get("source_file", "") for n in nodes if G.nodes[n].get("source_file")]
    if files:
        top_file = Counter(files).most_common(1)[0][0]
        norm = top_file.replace("\\", "/")
        parts = [p for p in norm.split("/") if p]
        if len(parts) >= 2:
            label = parts[-2] + "/" + parts[-1]
        else:
            label = parts[-1]
        for ext in (".md", ".ts", ".tsx", ".py", ".js", ".json"):
            if label.endswith(ext):
                label = label[: -len(ext)]
                break
        community_labels[cid] = label
    else:
        community_labels[cid] = f"community-{cid}"
print(f"[label] {len(community_labels)} communities labelled")

# Load labels from sidecar if present (avoid re-label drift)
labels_file = CHUNKS_DIR / "community-labels.json"
if labels_file.exists():
    saved = json.loads(labels_file.read_text(encoding="utf-8"))
    # saved keys are strings, communities keys are ints
    for cid in communities:
        if str(cid) in saved:
            community_labels[cid] = saved[str(cid)]

# Analyze
gods = ga.god_nodes(G, top_n=10)
surprises = ga.surprising_connections(G, communities, top_n=5)
questions = ga.suggest_questions(G, communities, community_labels, top_n=7)
print(f"[analyze] {len(gods)} god nodes, {len(surprises)} surprises, {len(questions)} questions")

# Exports (HTML guarded, GraphML sanitized fallback, SVG best-effort)
try:
    ge.generate_html(G, communities, str(CHUNKS_DIR / "graph.html"), community_labels=community_labels)
    print("[export] wrote graph.html")
except Exception as exc:
    print(f"[export] html skipped: {exc}")

try:
    ge.to_svg(G, communities, str(CHUNKS_DIR / "graph.svg"), community_labels=community_labels)
    print("[export] wrote graph.svg")
except Exception as exc:
    print(f"[export] svg skipped: {exc}")

try:
    ge.to_json(G, communities, str(CHUNKS_DIR / "graph-communities.json"))
    print("[export] wrote graph-communities.json")
except Exception as exc:
    print(f"[export] json skipped: {exc}")

try:
    ge.to_graphml(G, communities, str(CHUNKS_DIR / "graph.graphml"))
    print("[export] wrote graph.graphml")
except Exception as exc:
    print(f"[export] graphml direct failed ({exc}); sanitized fallback")
    def _clean(v):
        if v is None:
            return ""
        if isinstance(v, (list, tuple)):
            return ",".join(_clean(x) for x in v)
        if isinstance(v, dict):
            return json.dumps(v, ensure_ascii=False)
        return str(v)
    for n, attrs in G.nodes(data=True):
        for k, v in list(attrs.items()):
            attrs[k] = _clean(v)
    for u, v, attrs in G.edges(data=True):
        for k, val in list(attrs.items()):
            attrs[k] = _clean(val)
    nx.write_graphml(G, str(CHUNKS_DIR / "graph.graphml"))
    print("[export] wrote graph.graphml (sanitized fallback)")

# Manifest
files_dict = {}
for cf in sorted(CHUNKS_DIR.glob(".graphify_chunk_*.json")):
    data = json.loads(cf.read_text(encoding="utf-8"))
    src_files = list({n.get("source_file", "") for n in data.get("nodes", []) if n.get("source_file")})
    files_dict[cf.name] = src_files
gm.save_manifest(files_dict, "graphify-out/manifest.json")
print("[manifest] wrote manifest.json")

# Save labels sidecar
(CHUNKS_DIR / "community-labels.json").write_text(
    json.dumps({str(k): v for k, v in community_labels.items()}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

# Generate report — build a real detection_result from chunk corpus
all_source_files = set()
for data in extractions:
    for n in data.get("nodes", []):
        sf = n.get("source_file")
        if sf:
            all_source_files.add(sf)
# Rough word count from chunk text payloads (best-effort)
total_words = 0
for data in extractions:
    for n in data.get("nodes", []):
        for k in ("summary", "description", "name", "label"):
            v = n.get(k)
            if isinstance(v, str):
                total_words += len(v.split())
detection_result = {
    "total_files": len(all_source_files),
    "total_words": total_words,
    "warning": None,
}
token_cost = {"note": "token cost not tracked per-chunk in basher-LLM run"}
try:
    report_md = gr.generate(
        G,
        communities,
        cohesion,
        community_labels,
        gods,
        surprises,
        detection_result,
        token_cost,
        root=str(CHUNKS_DIR.parent),
        suggested_questions=questions,
    )
    (CHUNKS_DIR / "GRAPH_REPORT.md").write_text(report_md, encoding="utf-8")
    print(f"[report] wrote GRAPH_REPORT.md ({(CHUNKS_DIR / 'GRAPH_REPORT.md').stat().st_size:,} bytes)")
except Exception as exc:
    import traceback
    print(f"[report] generate failed: {exc}")
    traceback.print_exc()

# Final inventory
print("\n=== Final inventory ===")
for p in ["graph.json", "graph.html", "graph.svg", "graph-communities.json",
          "graph.graphml", "manifest.json", "GRAPH_REPORT.md", "community-labels.json"]:
    fp = CHUNKS_DIR / p
    if fp.exists():
        print(f"  {p}: {fp.stat().st_size:,} bytes")
    else:
        print(f"  {p}: MISSING")
