# Agile Agent Canvas

**Visual AI-assisted product development inside VS Code.**

A VS Code extension that turns product development into a structured, AI-assisted workflow. Design a product vision, break it down into epics and stories, define requirements, plan architecture, and track implementation readiness — through an interactive visual canvas, an in-IDE AI chat participant, and an optional codebase knowledge graph.

The extension is methodology-agnostic at its core: it ships with the [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) bundle (44 workflows, 5 modules, persona catalogue) and can install the same bundle into Claude Code, Cursor, Antigravity, OpenCode, and Copilot so the same workflow runs the same way everywhere. For the full methodology walkthrough, see [docs/methodology.md](docs/methodology.md).

---

## What you get

- **Visual 4-lane canvas** — Discovery → Planning → Solutioning → Implementation. Cards are colour-coded by artifact type and connected with dependency arrows. Three view modes: Lanes, Mindmap, 3D Corpus.
- **In-IDE AI chat** — `@agileagentcanvas` in Copilot Chat with 34 slash commands and 21 LM tools the AI can call autonomously.
- **Curated workflows** — 10 built-in workflows with defined steps, validation checkpoints, and artifacts that populate the canvas automatically.
- **Optional knowledge graph** — [graphify](https://github.com/safishamsi/graphify) integration builds a semantic dependency graph of your codebase and feeds it into AI context.
- **Agentic Kanban board** — a live execution board where agents pick up stories, run workflows, and move cards across Backlog → Ready → In-Progress → Review → Done.
- **Visual Plan approval gate** — AI-generated plan documents reviewed before any code is written; approve to dispatch into real story artifacts.
- **Jira Cloud sync** — fetch epics and stories from Jira, with a field-level conflict picker before any overwrite.
- **Framework installer** — push the same skill/agent catalogue into VS Code Copilot, Claude Code, Cursor, Antigravity, or OpenCode.

---

## Quickstart

1. Install **Agile Agent Canvas** from the Extensions marketplace.
2. Click the Agile Agent Canvas icon in the activity bar to open the sidebar.
3. Run **New Project** from the Command Palette, or **Load Demo Data** to see a populated canvas.
4. Open the canvas from the sidebar header or **Open Visual Canvas**.
5. In Copilot Chat, start with:

   ```
   @agileagentcanvas /help I need to break this epic into stories
   ```

   `/help` reads the live skill catalogue and recommends the best matches for your task.

### Recommended workflow

```
/vision       →  Define what you're building and why
/requirements →  Extract functional and non-functional requirements
/epics        →  Structure work into value-driven epics
/stories      →  Break epics into implementable stories
/readiness    →  Validate everything is ready for development
/dev          →  Start building with full context
```

---

## Core capabilities

### Canvas

The canvas is a full-screen editor tab with three view modes:

- **Lanes** (default) — 4-phase horizontal swimlanes.
- **Mindmap** — tree view grouping related artifacts.
- **3D Corpus** — force-directed 3D graph revealing cross-phase connections (press `L` to cycle).

Every card has a **Refine with AI** menu with the most relevant workflow for that artifact type: Code Review, Dev Story, Security Audit, Sprint Planning, and more.

### Chat

The chat participant routes commands to a registered persona (analyst, PM, architect, dev, QA, …) and has access to 21 LM tools, so it can read and write artifacts, query the knowledge graph, sync Jira, and call other agents — without you copying anything between windows.

Run `@agileagentcanvas /workflows` for the full command list.

### Knowledge graph (optional)

Run **Bootstrap graphify** once to install the graphify CLI and build an initial knowledge graph of your codebase. Once built, the AI can answer questions like *"what depends on `ArtifactStore`?"* with citations from your actual code.

The graph updates incrementally on file change (debounced 5 s, code-only, no LLM re-extraction) and surfaces a `GRAPH_REPORT.md` plus an interactive Graph browser for communities and god nodes.

### Agentic Kanban

A sidebar execution board that turns canvas artifacts into a live, drag-and-drop workflow. Cards move through five columns:

| Column | Purpose |
|---|---|
| **Backlog** | New stories and epics land here |
| **Ready-for-Dev** | Approved, waiting for an agent to pick up |
| **In-Progress** | Actively being worked on (agent running) |
| **Review** | Completed work awaiting review |
| **Done** | Finished and verified |

Cards show live **agent badges** (running/completed/failed), **dependency badges** (blocked-by counts), and **priority indicators**. Auto-advance mode drives cards through the implement → review → done loop automatically; an approval banner pauses execution when a required policy gate is hit. A toggleable terminal grid shows live agent output in real time.

### Visual Plan

Visual Plan is an AI-generated, structured plan document you review **before** any code is written. Plans surface in the canvas DetailPanel, the Kanban board, or a pop-out window, and contain up to nine section kinds:

| Section | Content |
|---|---|
| **Overview** | Summary with risk badge and grounded file references |
| **File Map** | Affected files grouped by change type with per-file notes |
| **Diagram** | Mermaid source or auto-laid-out SVG node/edge diagram |
| **Wireframe** | UI region breakdown with element types |
| **API Spec** | HTTP methods, paths, request bodies, and response codes |
| **Schema Map** | Data entities with fields, types, constraints, and relationships |
| **Annotated Code** | Code blocks with per-line annotations and syntax highlighting |
| **Open Questions** | Questions the AI identified as needing human input |
| **Tasks** | Checkbox-selectable task list grouped by priority (P0/P1/P2) |

Plan lifecycle: `Generate → Review → Revise → Approved → Dispatched`. Approve & Dispatch converts selected tasks into real Story artifacts nested under their parent epic, sets status to `ready-for-dev`, and registers them with the AutoScheduler.

---

## AI providers

Set `agileagentcanvas.aiProvider` in VS Code settings:

| Provider | Setup |
|---|---|
| **auto** (default) | Detects the best available provider automatically |
| **copilot** | GitHub Copilot via VS Code Language Model API |
| **openai** | `agileagentcanvas.apiKey`; default `gpt-4o` |
| **anthropic** | `agileagentcanvas.apiKey`; default `claude-sonnet-4-5` |
| **gemini** | `agileagentcanvas.apiKey`; default `gemini-2.0-flash` |
| **ollama** | `agileagentcanvas.baseUrl` (e.g. `http://localhost:11434`); default `llama3` |
| **antigravity** | Google Antigravity chat panel |
| **omp** | Oh My Pi harness — writes to `.omp/inbox.md` or invokes the OMP extension |

Chat-provider routing is independent and configurable via `agileagentcanvas.chatProvider` (auto, copilot, claude, cursor, windsurf, antigravity, omp, codex, aider, opencode, pi, terminal).

---

## Common settings

| Setting | Default | Purpose |
|---|---|---|
| `agileagentcanvas.outputFolder` | `.agileagentcanvas-context` | Where artifacts are written |
| `agileagentcanvas.aiProvider` | `auto` | AI provider (see table above) |
| `agileagentcanvas.chatProvider` | `auto` | Chat surface for canvas actions |
| `agileagentcanvas.defaultTemperature` | `0.2` | Sampling temperature (0–2); lower = more deterministic JSON |
| `agileagentcanvas.headroom.enabled` | `true` | Transparent chat-message compression |
| `agileagentcanvas.autoSync` | `true` | Auto-save canvas changes to disk |
| `agileagentcanvas.graphify.pythonPath` | `python` | Override if Python is not on PATH |

The full list of 30+ settings lives in VS Code Settings under **Extensions → Agile Agent Canvas**.

---

## Most-used commands

Run any from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- **Open Visual Canvas** — open the canvas in an editor tab
- **New Project** / **Load Existing Project** / **Switch Project**
- **Install Framework to IDE** — install the skill/agent bundle into VS Code Copilot, Claude Code, Cursor, Antigravity, or OpenCode
- **Fetch from Jira** / **Set Jira API Token** / **Clear Jira API Token**
- **Bootstrap graphify** / **Update graphify Graph** / **Open graphify Status**
- **Generate Visual Plan** / **Open Visual Plan**
- **Clean Up Old Trace Files** — scrub stale `.test-traces-*` dirs and other scratch

---

## Canvas keyboard shortcuts

| Shortcut | Action |
|---|---|
| Arrow keys | Pan canvas |
| `+` / `-` | Zoom in / out |
| `0` | Reset zoom and pan |
| `F` | Toggle focus mode |
| `M` | Toggle minimap |
| `T` | Toggle type/status filter bar |
| `L` | Cycle layout (Lanes → Mindmap → 3D Corpus) |
| `/` | Open canvas search |
| `Esc` | Close panel / deselect |

---

## Requirements

- VS Code 1.93 or later
- For AI features: GitHub Copilot extension, or an API key for OpenAI / Anthropic / Gemini, or a local Ollama instance
- For the knowledge graph: Python 3.10+ with `pip install graphifyy` (the extension can offer to install it automatically)

---

## Open-source credits

This extension is built on, integrates with, or is inspired by the following open-source projects. All are used under their respective licenses (MIT unless noted).

### Frameworks and methodology

| Project | Used for | License |
|---|---|---|
| [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | Shipped workflow bundle, agent personas, and schemas | MIT |
| [graphify](https://github.com/safishamsi/graphify) | Codebase knowledge graph (external CLI, not bundled) | MIT |

### Runtime libraries (extension host)

| Library | Used for | License |
|---|---|---|
| [ajv](https://github.com/ajv-validator/ajv) | JSON Schema validation for artifact data | MIT |
| [yaml](https://github.com/eemeli/yaml) | YAML parsing for BMAD artifact files | ISC |
| [@iarna/toml](https://github.com/iarna/iarna-toml) | TOML parsing for settings and config files | TOML |
| [gpt-tokenizer](https://github.com/niieani/gpt-tokenizer) | Token counting for context budget tracking | Apache-2.0 |
| [headroom-ai](https://github.com/team-headroom/headroom) | Transparent chat-message compression | Apache-2.0 |
| [pdfkit](https://github.com/foliojs/pdfkit) | PDF export of artifacts and reports | MIT |
| [simple-git](https://github.com/steveukx/git-js) | Git operations for change detection | MIT |
| [deepmerge](https://github.com/TehShrike/deepmerge) / [microdiff](https://github.com/AsyncBanana/microdiff) | JSON merge and diff for artifact sync | MIT |

### Runtime libraries (webview UI)

| Library | Used for | License |
|---|---|---|
| [React](https://react.dev) | UI framework | MIT |
| [Three.js](https://threejs.org) | WebGL rendering for the 3D Corpus view | MIT |
| [3d-force-graph](https://github.com/vasturiano/3d-force-graph) | Force-directed 3D graph component | MIT |
| [@xterm/xterm](https://xtermjs.org) | Embedded terminal for live agent output | MIT |
| [mermaid](https://mermaid.js.org) | Diagram rendering in Visual Plan | MIT |
| [marked](https://marked.js.org) | Markdown rendering for artifact text | MIT |
| [html2canvas](https://html2canvas.hertzen.com) | Canvas snapshot for PNG export | MIT |
| [@vscode/webview-ui-toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit) | VS Code-native webview components | MIT |

### Inspiration

Workflow and agent patterns in this extension were informed by the following projects. No source code is copied; conceptual patterns only.

- [get-shit-done](https://github.com/gsd-build/get-shit-done) — MIT
- [everything-claude-code](https://github.com/affaan-m/everything-claude-code) — MIT
- [gstack](https://github.com/dzt/gstack) — MIT

---

## Feedback and issues

Open an issue on the [project repository](https://github.com/msayedshokry/AgileAgentCanvasExt/issues). If you find a real-world pattern the catalogue doesn't cover, the **Suggest New Tool** command lets the LLM propose a tool spec.