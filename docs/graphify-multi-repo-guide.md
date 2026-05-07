# Graphify Multi-Repo Adoption Guide

> **Audience:** Your team on GitHub with multiple repos and cross-repo components
> **Goal:** Maximum automation, minimum manual steps, persistent knowledge graphs across all repos

---

## TL;DR — What You Get

| Benefit | Without Graphify | With Graphify |
|---|---|---|
| **Onboarding** | Read every README, grep through code, ask teammates | Open `GRAPH_REPORT.md` — god nodes, communities, and architecture in 30 seconds |
| **Cross-repo understanding** | "Who owns the auth flow? Which repo?" | `graphify merge-graphs` → one graph, all repos, traced relationships |
| **Code review context** | Reviewer reads diff + guesses impact | Copilot reads the graph → "this change touches a god node connected to 14 other modules" |
| **Token efficiency** | LLM reads raw files every time (expensive, slow) | ~71x fewer tokens per query on large corpora |
| **Architecture drift** | Detected months later in a meeting | Graph rebuilds on every commit — drift is visible immediately |
| **Knowledge preservation** | Lives in people's heads | Persisted in `graph.json`, committed to git, survives employee turnover |

---

## Architecture: How It Fits Your GitHub Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GitHub Organization                          │
│                                                                     │
│  repo-A/                 repo-B/                 repo-C/            │
│  ├── src/                ├── src/                ├── src/            │
│  ├── docs/               ├── docs/               ├── docs/          │
│  ├── graphify-out/       ├── graphify-out/       ├── graphify-out/  │
│  │   ├── graph.json      │   ├── graph.json      │   ├── graph.json│
│  │   ├── graph.html      │   ├── graph.html      │   ├── graph.html│
│  │   ├── GRAPH_REPORT.md │   ├── GRAPH_REPORT.md │   ├── ...       │
│  │   └── cache/          │   └── cache/          │   └── cache/    │
│  ├── .github/            ├── .github/            ├── .github/      │
│  │   └── copilot-        │   └── copilot-        │   └── copilot-  │
│  │       instructions.md │       instructions.md │       instrs.md │
│  └── .graphifyignore     └── .graphifyignore     └── .graphifyign  │
│                                                                     │
│  ┌──────────────────────────────────────────────┐                   │
│  │  Cross-Repo Graph (on demand or in CI)       │                   │
│  │  graphify merge-graphs                       │                   │
│  │    repo-A/graphify-out/graph.json            │                   │
│  │    repo-B/graphify-out/graph.json            │                   │
│  │    repo-C/graphify-out/graph.json            │                   │
│  │    --out cross-repo/graph.json               │                   │
│  └──────────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Per-Repo Setup (One-Time, Per Repo)

### 1.1 Install graphify (team-wide)

Every developer runs this once:

```powershell
# Windows
pip install graphifyy

# macOS / Linux (recommended)
uv tool install graphifyy
# or: pipx install graphifyy
```

### 1.2 Bootstrap each repo

In each repository root:

```bash
# Build the knowledge graph
graphify .

# Install VS Code Copilot Chat integration (makes it always-on)
graphify vscode install
```

This creates:
- `graphify-out/` — graph outputs (commit this)
- `.github/copilot-instructions.md` — graphify section added (Copilot reads it automatically)

### 1.3 Add `.graphifyignore`

Create `.graphifyignore` in each repo root:

```gitignore
# Build outputs
node_modules/
dist/
build/
coverage/
.next/
out/

# Generated / vendored
vendor/
*.generated.*
*.min.js
*.min.css

# Graphify's own outputs (prevent self-reference)
graphify-out/

# Platform instruction files
AGENTS.md
CLAUDE.md
GEMINI.md
.gemini/
.opencode/
```

### 1.4 Configure `.gitignore`

Add to each repo's `.gitignore`:

```gitignore
# Graphify — keep outputs, skip ephemeral files
graphify-out/cache/
graphify-out/manifest.json
graphify-out/cost.json
```

**Do commit:** `graph.json`, `graph.html`, `GRAPH_REPORT.md`, `wiki/` (if generated)

### 1.5 First commit

```bash
git add graphify-out/ .graphifyignore .github/copilot-instructions.md
git commit -m "chore: add graphify knowledge graph"
```

Every teammate who pulls now has instant access to the architecture map.

---

## Phase 2: Automation (Git Hooks + CI)

### 2.1 Local Git Hooks (Per Developer)

```bash
graphify hook install
```

This installs `post-commit` and `post-checkout` hooks that:
- **post-commit:** Rebuilds the graph after every commit. Code changes use AST only (instant, free, no LLM). Doc/image changes flag a reminder to run `--update`.
- **post-checkout:** Rebuilds on branch switch so the graph matches the branch you're on.

If a rebuild fails, the hook exits non-zero so git surfaces the error.

### 2.2 GitHub Actions CI (Recommended)

For repos where you want the graph always fresh in `main`:

```yaml
# .github/workflows/graphify.yml
name: Update Knowledge Graph

on:
  push:
    branches: [main, develop]
    paths-ignore:
      - 'graphify-out/**'

jobs:
  graphify:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install graphify
        run: pip install graphifyy

      - name: Rebuild graph (code AST — free)
        run: |
          if [ -f graphify-out/graph.json ]; then
            graphify update .
          else
            python -m graphify . --no-viz
          fi

      - name: Commit updated graph
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add graphify-out/
          git diff --cached --quiet || git commit -m "chore(graphify): update knowledge graph [skip ci]"
          git push
```

> **Key:** The `--no-viz` flag skips HTML generation in CI (saves time). The `update` command only re-processes changed files. `[skip ci]` prevents infinite loops.

### 2.3 Semantic Re-Extraction (Periodic or Manual)

AST extraction (code) is free and instant. Semantic extraction (docs, papers, images) costs LLM tokens. Two strategies:

| Strategy | When | How |
|---|---|---|
| **Manual** | After major doc changes | Developer runs `/graphify . --update` locally |
| **Scheduled CI** | Weekly or on release | Add a `workflow_dispatch` or `schedule` trigger to the CI above, replacing `graphify update` with `graphify . --update` |

For most teams, **manual semantic re-extraction + automated AST rebuild** is the sweet spot.

---

## Phase 3: Cross-Repo Graphs

### 3.1 On-Demand Merge

When you need to trace relationships across repos:

```bash
# Clone repos you don't have locally
graphify clone https://github.com/your-org/repo-A
graphify clone https://github.com/your-org/repo-B

# Merge their graphs
graphify merge-graphs \
  ~/.graphify/repos/your-org/repo-A/graphify-out/graph.json \
  ~/.graphify/repos/your-org/repo-B/graphify-out/graph.json \
  ./graphify-out/graph.json \
  --out cross-repo-graph.json
```

Each node is tagged with its source repo, so queries return "this concept lives in repo-A" or "this edge crosses from repo-B to repo-C."

### 3.2 Cross-Repo CI (Advanced)

For organizations that want a persistent cross-repo graph:

```yaml
# In a dedicated "knowledge-graph" repo
name: Cross-Repo Graph

on:
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 6am
  workflow_dispatch:

jobs:
  merge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - run: pip install graphifyy

      - name: Clone and merge
        run: |
          graphify clone https://github.com/your-org/repo-A
          graphify clone https://github.com/your-org/repo-B
          graphify clone https://github.com/your-org/repo-C
          graphify merge-graphs \
            ~/.graphify/repos/your-org/repo-A/graphify-out/graph.json \
            ~/.graphify/repos/your-org/repo-B/graphify-out/graph.json \
            ~/.graphify/repos/your-org/repo-C/graphify-out/graph.json \
            --out graphify-out/graph.json

      - name: Commit
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add graphify-out/
          git diff --cached --quiet || git commit -m "chore: update cross-repo graph"
          git push
```

---

## Phase 4: Team Workflows

### 4.1 Querying the Graph

| Task | Command | Where |
|---|---|---|
| High-level architecture overview | Read `graphify-out/GRAPH_REPORT.md` | Automatic — Copilot reads it before every answer |
| Specific question | `/graphify query "what connects auth to the payment service?"` | VS Code Copilot Chat |
| Trace a path | `graphify path "UserAuth" "PaymentGateway"` | Terminal |
| Explain a concept | `graphify explain "ArtifactStore"` | Terminal |
| Deep dive (wiki) | `/graphify . --wiki` then read `graphify-out/wiki/index.md` | VS Code or terminal |

### 4.2 PR Review Workflow

When reviewing a PR, Copilot already reads `GRAPH_REPORT.md` (always-on). Ask it:

> "Given the knowledge graph, what is the blast radius of this PR? Which god nodes or communities does it touch?"

The graph surfaces:
- **God nodes** (highest-degree concepts) — changes here ripple everywhere
- **Community boundaries** — does this PR cross community lines? That's where bugs hide
- **Surprising connections** — non-obvious dependencies the author might not know about

### 4.3 Onboarding New Developers

New team member joins → they clone the repo → `GRAPH_REPORT.md` is already there:

1. Open `graphify-out/graph.html` in a browser — interactive graph with search, click nodes, filter by community
2. Read `GRAPH_REPORT.md` — god nodes tell you what matters, communities tell you the module boundaries
3. Ask Copilot Chat anything — it navigates via the graph instead of grepping raw files

**No 2-week ramp-up reading READMEs.** The graph is the README.

### 4.4 Architecture Decision Records

When the graph reveals surprising connections or god nodes that are too central:

> "The graph shows `ArtifactStore` is a god node with 47 connections. Should we decompose it?"

Use this to drive ADR creation — the graph provides evidence, not opinions.

---

## What To Commit vs Ignore (Summary)

| Path | Git Status | Reason |
|---|---|---|
| `graphify-out/graph.json` | **Commit** | Persistent graph — teammates query it immediately |
| `graphify-out/graph.html` | **Commit** | Interactive visualization |
| `graphify-out/GRAPH_REPORT.md` | **Commit** | Always-on Copilot context |
| `graphify-out/wiki/` | **Commit** | Deep-dive articles per community |
| `graphify-out/cache/` | **Ignore** | SHA256 hashes — local optimization only |
| `graphify-out/manifest.json` | **Ignore** | mtime-based — invalid after clone |
| `graphify-out/cost.json` | **Ignore** | Local token tracking |
| `.graphifyignore` | **Commit** | Shared exclude rules |

---

## Cost Estimate

| Operation | LLM Tokens | Frequency | Cost |
|---|---|---|---|
| Code-only rebuild (AST) | **0** — pure tree-sitter | Every commit | Free |
| Semantic extraction (docs/images) | ~1K–5K tokens per file | On doc changes | Varies by provider |
| Incremental update (`--update`) | Only changed files | Manual or weekly CI | Minimal |
| Querying via `GRAPH_REPORT.md` | 0 (file is already local) | Every Copilot interaction | Free |
| Cross-repo merge | **0** — pure graph merge | On demand or weekly | Free |

The first full run is the most expensive. After that, SHA256 caching means re-runs only process changed files.

---

## Repo-Specific Configuration Recommendations

| Repo Type | Recommended Flags | Why |
|---|---|---|
| Large monorepo (>200 files) | `--update` after initial build | Avoid full re-extraction |
| API service (code-heavy) | Default (AST handles most of it) | Docs are secondary |
| Documentation repo | `--mode deep` | Aggressive inference for concept links |
| Shared component library | `--wiki` | Teammates need navigable docs |
| Microservices (many small repos) | Cross-repo merge in CI | Individual graphs are small; value is in connections |

---

## Quick-Start Checklist

- [ ] `pip install graphifyy` (every developer, once)
- [ ] `graphify vscode install` (every developer, once)
- [ ] Per-repo: run `/graphify .` to build initial graph
- [ ] Per-repo: add `.graphifyignore`
- [ ] Per-repo: update `.gitignore` (exclude `cache/`, `manifest.json`, `cost.json`)
- [ ] Per-repo: commit `graphify-out/` + `.graphifyignore`
- [ ] Per-repo: `graphify hook install` for auto-rebuild on commit
- [ ] Optional: add `.github/workflows/graphify.yml` for CI rebuild on `main`
- [ ] Optional: set up cross-repo merge (dedicated repo or scheduled CI)
- [ ] Optional: `--wiki` for repos where deep navigation matters
