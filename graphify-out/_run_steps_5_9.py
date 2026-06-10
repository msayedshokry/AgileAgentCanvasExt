"""Steps 5-9 runner for graphify pipeline. Reads extractions, builds, clusters, labels, exports, saves manifest."""
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
import graphify.manifest as gm

CHUNKS_DIR = Path("graphify-out")

# Load all extractions
extractions = []
for cf in sorted(CHUNKS_DIR.glob(".graphify_chunk_*.json")):
    extractions.append(json.loads(cf.read_text(encoding="utf-8")))
ast_path = CHUNKS_DIR / ".graphify_ast.json"
if ast_path.exists():
    extractions.append(json.loads(ast_path.read_text(encoding="utf-8")))
print(f"[load] {len(extractions)} extractions")

# Build the graph
G = gb.build(extractions, directed=False)
print(f"[build] {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

# Step 5: cluster
communities = gc.cluster(G)
cohesion = gc.score_all(G, communities)
print(f"[cluster] {len(communities)} communities")
top5 = sorted(cohesion.items(), key=lambda kv: -kv[1])[:5]
print(f"[cluster] top-5 cohesion: {top5}")

# Step 5: label communities
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
print(f"[label] {len(community_labels)} labelled")

# Step 4 god-nodes (analysis)
gods = ga.god_nodes(G, top_n=10)
print(f"[analyze] top god nodes: {[g.get('node') for g in gods[:5]]}")

# Step 6: HTML viz + exports (HTML guarded - graph too large for HTML viz)
try:
    ge.generate_html(G, communities, str(CHUNKS_DIR / "graph.html"), community_labels=community_labels)
    print("[export] wrote graph.html")
except Exception as exc:
    print(f"[export] html skipped (graph too large or unsupported): {exc}")

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
    print(f"[export] graphml direct export failed ({exc}); trying sanitized fallback")
    # Sanitize None values in node/edge attrs and write manually
    def _clean(v):
        if v is None:
            return ""
        if isinstance(v, (list, tuple)):
            return ",".join(_clean(x) for x in v)
        if isinstance(v, dict):
            return json.dumps(v, ensure_ascii=False)
        return str(v)
    H = nx.relabel_nodes(G, {n: _clean(n) for n in G.nodes()}, copy=False) if False else G
    for n, attrs in H.nodes(data=True):
        for k, v in list(attrs.items()):
            attrs[k] = _clean(v)
    for u, v, attrs in H.edges(data=True):
        for k, val in list(attrs.items()):
            attrs[k] = _clean(val)
    nx.write_graphml(H, str(CHUNKS_DIR / "graph.graphml"))
    print("[export] wrote graph.graphml (sanitized fallback)")

# Step 9: manifest
files_dict = {}
for cf in sorted(CHUNKS_DIR.glob(".graphify_chunk_*.json")):
    data = json.loads(cf.read_text(encoding="utf-8"))
    src_files = list({n.get("source_file", "") for n in data.get("nodes", []) if n.get("source_file")})
    files_dict[cf.name] = src_files
gm.save_manifest(files_dict, "graphify-out/manifest.json")
print("[manifest] wrote manifest.json")

# Final state
print("\n=== Final state ===")
print(f"Nodes: {G.number_of_nodes()}")
print(f"Edges: {G.number_of_edges()}")
print(f"Communities: {len(communities)}")
for p in ["graph.json", "graph.html", "graph.svg", "graph-communities.json", "graph.graphml", "manifest.json"]:
    fp = CHUNKS_DIR / p
    if fp.exists():
        print(f"  {p}: {fp.stat().st_size:,} bytes")

# Save community labels to a sidecar file
(CHUNKS_DIR / "community-labels.json").write_text(
    json.dumps(community_labels, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
print("  community-labels.json: written")
