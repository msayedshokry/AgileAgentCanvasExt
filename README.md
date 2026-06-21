# Agile Agent Canvas

**Visual AI-assisted product development with the BMAD methodology.**

> **What is BMAD?** [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) (Business Method for AI Development) is a structured methodology that organises product development into four phases — **Discovery → Planning → Solutioning → Implementation** — and ships 44 guided workflows for each phase, plus a library of agent personas (analyst, PM, architect, dev, QA) that the AI adopts to produce consistent, role-appropriate output. Agile Agent Canvas is the VS Code implementation of BMAD: it gives the methodology a visual home, an in-IDE chat participant, and an optional knowledge-graph context layer so every AI suggestion is grounded in your actual code. For a deeper walkthrough of the four phases, the five modules, the workflow registry, and the persona catalogue, see [docs/methodology.md](docs/methodology.md).

Bring structured, AI-powered product development into VS Code. Design a product vision, break it down into epics and stories, define requirements, plan architecture, and track implementation readiness — through an interactive visual canvas and an AI chat participant grounded in the BMAD-METHOD framework.

## What you get

- **Visual 4-lane canvas** — Discovery → Planning → Solutioning → Implementation. Cards are colour-coded by artifact type and connected with dependency arrows. Click any card to edit it inline. A minimap helps you navigate large projects.
- **AI chat participant** — `@agileagentcanvas` in Copilot Chat with 35+ slash commands for product development, plus 26 LM tools the AI can call autonomously.
- **Workflow system** — 10 built-in BMAD workflows with defined steps, validation checkpoints, and artefacts that populate the canvas automatically.
- **Knowledge graph** — optional [graphify](https://github.com/safishamsi/graphify) integration that builds a semantic dependency graph of your codebase and feeds it into AI context.
- **Jira Cloud sync** — fetch epics and stories from Jira, with a field-level conflict picker before any overwrite.
- **Skill catalogue** — 86 built-in skills and agents, extendable with your own folder or any git repo.

## The three pillars

### 1. Canvas

The canvas is a full-screen editor tab. Each phase has its own swimlane; each artifact is a card you can drag, rename, refine, and link. Three view modes are available:

- **Lanes** — the default 4-phase layout.
- **Mindmap** — tree view that groups related artifacts.
- **3D Corpus** — a force-directed 3D graph that reveals cross-phase connections (press `L` to cycle).

Every card has a **Refine with AI** menu giving instant access to the most relevant workflow for that artifact type — Code Review, Dev Story, Security Audit, Sprint Planning, and more.

### 2. Chat

Open Copilot Chat and talk to `@agileagentcanvas`. The recommended entry point is:

```
@agileagentcanvas /help I need to break this epic into stories
```

The `/help` command reads the live skill catalogue and returns the best 3–5 matches for your task. From there, common commands include `/vision`, `/requirements`, `/epics`, `/stories`, `/sprint`, `/dev`, `/review-code`, `/jira`, and `/graph`. Run `@agileagentcanvas /workflows` for the full list.

The AI has access to 26 LM tools, so it can read artefacts, write them back, query the knowledge graph, sync Jira, and call other agents — all without you copying anything between windows.

### 3. Graph (optional)

Run **Agile Agent Canvas: Bootstrap graphify** once to install the graphify CLI and build an initial knowledge graph of your codebase. Once built, the AI can answer questions like "what depends on `ArtifactStore`?" and "how does the kanban flow work?" with citations from your actual code.

The graph is updated incrementally on file change (debounced 5 s, code-only, no LLM re-extraction) and surfaces a `GRAPH_REPORT.md` and an interactive `GraphifyModal` for browsing communities and god nodes.

## Getting started

1. **Install** Agile Agent Canvas from the Extensions marketplace.
2. **Open the sidebar** by clicking the Agile Agent Canvas icon in the activity bar.
3. **Create a new project** via the **New Project** command, or load demo data with **Load Demo Data** to see a populated canvas.
4. **Open the canvas** via the sidebar header icon or the **Open Visual Canvas** command.
5. **Start chatting** with `@agileagentcanvas /vision` to define your product vision, then work through `/requirements`, `/epics`, `/stories`, `/readiness`, `/dev`.

### Recommended workflow

```
/vision       →  Define what you're building and why
/requirements →  Extract functional and non-functional requirements
/epics        →  Structure work into value-driven epics
/stories      →  Break epics into implementable stories
/readiness    →  Validate everything is ready for development
/dev          →  Start building with full context
```

## AI provider configuration

Set `agileagentcanvas.aiProvider` in VS Code settings:

| Provider | Setup |
|----------|-------|
| **auto** (default) | Detects the best available provider automatically |
| **copilot** | GitHub Copilot via VS Code Language Model API |
| **openai** | `agileagentcanvas.apiKey`; default `gpt-4o` |
| **anthropic** | `agileagentcanvas.apiKey`; default `claude-sonnet-4-5` |
| **gemini** | `agileagentcanvas.apiKey`; default `gemini-2.0-flash` |
| **ollama** | `agileagentcanvas.baseUrl` (e.g. `http://localhost:11434`); default `llama3` |
| **antigravity** | Google Antigravity chat panel |
| **omp** | Oh My Pi harness — writes to `.omp/inbox.md` or invokes the OMP extension |

## Common settings

| Setting | Default | What it does |
|---------|---------|--------------|
| `agileagentcanvas.outputFolder` | `.agileagentcanvas-context` | Where artefacts are written |
| `agileagentcanvas.userCataloguePath` | — | Path to your personal skills/agents folder |
| `agileagentcanvas.aiProvider` | `auto` | AI provider (see table above) |
| `agileagentcanvas.defaultTemperature` | `0.2` | Sampling temperature (0–2); lower = more deterministic JSON |
| `agileagentcanvas.headroom.enabled` | `true` | Transparent chat-message compression (token savings) |
| `agileagentcanvas.trace.enabled` | `true` | Execution trace logging for debugging |
| `agileagentcanvas.graphify.pythonPath` | `python` | Override if Python is not on PATH |

The full list of 30+ settings lives in VS Code Settings under **Extensions → Agile Agent Canvas**.

## Most-used commands

A short list of the highest-traffic commands. Run any from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- **Open Visual Canvas** — open the canvas in an editor tab
- **New Project** / **Load Existing Project** / **Switch Project**
- **Install Framework to IDE** — install BMAD skills into VS Code Copilot, Claude Code, Cursor, Antigravity, or OpenCode
- **Fetch from Jira** / **Set Jira API Token** / **Clear Jira API Token**
- **Bootstrap graphify** / **Update graphify Graph** / **Open graphify Status**
- **Open Skill Catalogue** — manage built-in and user-added skills and agents
- **Clean Up Old Trace Files** — scrub stale `.test-traces-*` dirs and other scratch

## Canvas keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Arrow keys | Pan canvas |
| `+` / `-` | Zoom in / out |
| `0` | Reset zoom and pan |
| `F` | Toggle focus mode |
| `M` | Toggle minimap |
| `T` | Toggle type/status filter bar |
| `L` | Cycle layout (Lanes → Mindmap → 3D Corpus) |
| `/` | Open canvas search |
| `Esc` | Close panel / deselect |

## Requirements

- VS Code 1.93 or later
- For AI features: GitHub Copilot extension, or an API key for OpenAI / Anthropic / Gemini, or a local Ollama instance
- For the knowledge graph: Python 3.10+ with `pip install graphifyy` (the extension can offer to install it automatically)

## Acknowledgments

Agile Agent Canvas is built on the [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) framework by BMad Code, LLC (MIT License).

Knowledge graph features are powered by [graphify](https://github.com/safishamsi/graphify) by Safi Shamsi (MIT License) — an external tool invoked by the extension, not bundled.

> The `BMAD` mentions in this file's tagline, headline (`What is BMAD?`), body intro, workflow count, `## Most-used commands` (`Install Framework to IDE`), and `## Acknowledgments` are upstream BMAD-METHOD framework attribution, not skill or workflow identifiers — kept for upstream attribution per the carve-out policy.
>
> The upstream github link in the headline and Acknowledgments is preserved. The upstream `44 guided workflows for each phase` reference at lines 5-6 describes the upstream framework's full 44-workflow-per-phase catalog design intent; this extension's curated subset is the `10 built-in` workflows on line 13. Live skill/persona paths live under `.github/aac-*.md` per Phase 2.

## Feedback and issues

Open an issue on the project repository. If you find a real-world pattern the catalogue doesn't cover, the **Suggest New Tool** command lets the LLM propose a tool spec.
