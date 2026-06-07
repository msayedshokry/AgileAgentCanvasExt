# Agile Agent Canvas

**Visual AI-assisted product development with the BMAD methodology.**

Agile Agent Canvas brings a structured, AI-powered approach to product development directly into VS Code. Design your product vision, break it down into epics and stories, define requirements, plan architecture, and track implementation readiness — all through an interactive visual canvas and AI chat workflows.

---

## Features

### Visual Canvas

A 4-lane workflow canvas that gives you a bird's-eye view of your entire product:

- **Discovery** — Product briefs, vision documents, and PRDs
- **Planning** — Requirements, use cases, and test strategies
- **Solutioning** — Architecture decisions and design specs
- **Implementation** — Epics, stories, and test cases organized by epic rows

Cards are color-coded by artifact type and connected with dependency arrows. Click any card to open a detail panel for inline editing. A minimap in the corner helps you navigate large projects.

Each card has a **Refine with AI** (✦ sparkle) context menu giving instant access to the most relevant workflows for that artifact type — including Code Review, Dev Story, Security Audit, CEO Scope Review, Design Audit, Verification Loop, and more — without opening the full workflow browser.

### AI Chat Participant

We have two native agents available in VS Code Copilot Chat:

1. **`@agileagentcanvas` (Analyst)** — Access 30+ slash commands for comprehensive product development:

| Command | Description |
|---------|-------------|
| `/vision` | Define product vision and problem statement |
| `/requirements` | Extract and organize requirements from PRD |
| `/epics` | Design epic structure organized by user value |
| `/stories` | Break down epics into implementable stories |
| `/enhance` | Add verbose details: use cases, fit criteria, risks |
| `/review` | Review and validate artifact completeness |
| `/refine` | Refine a specific artifact with AI suggestions |
| `/apply` | Apply pending AI refinements to the artifact JSON file |
| `/dev` | Start development workflow for a story, epic, or test case |
| `/sprint` | Sprint planning from epics or check sprint status |
| `/ux` | Create UX design specifications through collaborative exploration |
| `/readiness` | Check implementation readiness of PRD, architecture, epics and stories |
| `/workflows` | Browse all 44 BMAD workflows by module or artifact type |
| `/continue` | Continue to the next step in the current workflow |
| `/status` | Show current workflow session status |
| `/context` | Generate an LLM-optimized project-context.md |
| `/document` | Document a brownfield project for AI context |
| `/review-code` | Adversarial code review finding specific issues |
| `/ci` | Scaffold CI/CD quality pipeline with test execution and quality gates |
| `/quick` | Quick spec + dev flow for small changes |
| `/party` | Multi-agent collaboration mode |
| `/elicit` | Apply advanced elicitation methods to artifacts |
| `/design-thinking` | Guide human-centered design using empathy-driven methodologies |
| `/innovate` | Identify disruption opportunities and architect business model innovation |
| `/solve` | Apply systematic problem-solving methodologies to complex challenges |
| `/story-craft` | Craft compelling narratives using storytelling frameworks |
| `/write-doc` | Write a document following documentation best practices |
| `/mermaid` | Generate Mermaid diagrams |
| `/readme` | Generate or update a README.md from project analysis |
| `/changelog` | Generate changelog or release notes |
| `/api-docs` | Generate API documentation from source code |
| `/convert-to-json` | Convert markdown artifacts to structured JSON format |
| `/jira` | Jira integration — config, epics, stories, sync (see Jira section) |
| `/help` | Smart skill router — describe your task and get matched to the best skills/agents |

> **Tip:** Start with `@agileagentcanvas /help <describe your task>` — the extension reads the live skill catalogue and recommends the best 3–5 options.

2. **`@agileagentcanvas-canvas-integrator` (Morph)** — A dedicated agent for converting BMAD markdown artifacts to schema-compliant JSON for Canvas visualization. Supports bulk/batch processing of files.

### Language Model Tools

Agile Agent Canvas registers tools that AI models can call autonomously during chat conversations:

- **agileagentcanvas_read_file** — Read BMAD framework files, schemas, workflows, and agent definitions
- **agileagentcanvas_list_directory** — Discover available workflows, agents, schemas, and steps
- **agileagentcanvas_update_artifact** — Persist artifact changes directly from AI refinement
- **agileagentcanvas_sync_story_status** — Atomically sync a story's status across all tracker files
- **agileagentcanvas_sync_epic_status** — Atomically sync an epic's status across all tracker files
- **agileagentcanvas_graph_query** — Semantic graph queries against the graphify knowledge graph
- **agileagentcanvas_graph_path** — Find shortest dependency path between two graph nodes
- **agileagentcanvas_graph_community** — Load wiki content for a named community in the graph
- **agileagentcanvas_read_jira** — Read Jira epics/stories autonomously; actions: `test_connection`, `list_epics`, `list_stories`, `list_all`

### Workflow System

44 built-in workflows organized by module guide you through structured product development processes. Workflows have defined steps, validation checkpoints, and produce artifacts that populate your canvas automatically. Track progress in the dedicated **Workflow Progress** sidebar view.

### Skill Catalogue Manager

Agile Agent Canvas ships with 86 built-in skills and agents. You can extend, override, or trim this catalogue without touching the extension itself.

**User catalogue folder** — Set `agileagentcanvas.userCataloguePath` to any folder on your machine. Each subfolder that contains a `SKILL.md` file is picked up as a skill or agent. The extension watches the folder live — add, edit, or remove files and the canvas reloads automatically.

**Catalogue Modal** — Click the catalogue icon (⊞) on the canvas toolbar to open the catalogue manager:
- **All / Agents / Skills / User-Added tabs** — browse, search, and filter the full catalogue
- **Enable / Disable toggle** — per-skill toggle; disabled skills are hidden from AI routing and `/help`
- **Create New Skill** — scaffolds a `SKILL.md` + `customize.toml` template inside your user catalogue folder
- **Open Folder** — reveals the skill folder in VS Code Explorer for editing
- **Delete** — removes a user-added skill (with confirmation dialog)

**Git Skill Repos** — The **Skill Repos** tab lets you pull skills from any public or private git repository:
1. Paste the repo URL (`https://`, `git@`, or `ssh://`) and click **Add Repo**
2. The extension clones the repo (shallow, `--depth 1`) and imports every subfolder that has a `SKILL.md`
3. **Sync** pulls the latest changes and reconciles added/removed skills
4. **Remove** uninstalls all skills from that repo and deletes the local clone

Each repo-sourced skill shows a 📦 badge in the catalogue with its repo slug.

**Override built-ins** — A user skill whose folder name matches a built-in skill takes precedence. All other built-ins remain available.

### Knowledge Graph — graphify Integration

Agile Agent Canvas integrates with [graphify](https://github.com/safishamsi/graphify) (`pip install graphifyy`) to build a semantic knowledge graph of your codebase and feed it directly into AI context.

**Setup (one-time):**
```
Agile Agent Canvas: Bootstrap graphify
```
This installs the graphify CLI if missing, builds an initial graph, and wires it into Copilot Chat instructions automatically.

**What you get:**
- `graphify-out/graph.json` — full semantic dependency graph (nodes, edges, communities)
- `graphify-out/GRAPH_REPORT.md` — human-readable highlights: god nodes, surprising connections, suggested questions
- `graphify-out/ARCH_INDEX.md` / `ARCH_INDEX.json` — architecture corpus with community summaries, god-node rankings, and cross-community edge stats
- `graphify-out/wiki/` — per-community markdown wiki pages (optional, run via **Update** or **Rebuild**)

**GraphifyModal** — click the `$(graph)` status bar item or the Graphify toolbar button on the canvas to open the interactive modal:
- **Pipeline Tracker** — visual stage indicators (detect → extract → build → report → wiki → index)
- **Arch Corpus** — community browser with directory chips, god-node list, and cross-community edge table
- **Recommended Actions** — context-aware buttons to bootstrap, index, update, wire, or rebuild

**Chat commands:**
```
@agileagentcanvas /graphify bootstrap   # install + build + wire
@agileagentcanvas /graphify update      # re-extract changed files
@agileagentcanvas /graphify query <text>
@agileagentcanvas /graphify path <from> <to>
```

**LM tools** (AI calls these autonomously):
- `agileagentcanvas_graph_query` — semantic graph queries (relationships, callers, dependencies)
- `agileagentcanvas_graph_path` — shortest dependency path between two nodes
- `agileagentcanvas_graph_community` — load wiki content for a specific community

> graphify is an external tool (MIT License, © Safi Shamsi). Code is extracted locally via tree-sitter with no API calls. Only docs/PDFs/images use your AI provider's API.

### Jira Cloud Integration

Agile Agent Canvas connects to Jira Cloud to fetch and sync epics and stories directly onto your canvas.

**Setup:** Configure under `agileagentcanvas.jira.*` in VS Code settings, then run **Agile Agent Canvas: Set Jira API Token** to store your token securely in the OS keychain (macOS Keychain / Windows Credential Manager / Linux libsecret).

**Jira modal** — click the Jira button on the canvas toolbar to open a five-tab modal:
- **Fetch Epics** — list all epics in your project
- **Fetch Stories** — list stories for a specific epic or entire project
- **Fetch Issue** — fetch any epic or story by key (e.g. `PROJ-42`); child stories of epics are included automatically
- **Sync to Canvas** — merge all Jira epics & stories into canvas artifacts; local-only artifacts are never removed; field-level conflict picker before any overwrite
- **Connection** — test credentials and show masked configuration

**Chat commands:**
```
@agileagentcanvas /jira config              # test connection
@agileagentcanvas /jira epics [projectKey]
@agileagentcanvas /jira stories [epicKey]
@agileagentcanvas /jira sync [projectKey]
```

**Jira settings** (`agileagentcanvas.jira.*`):

| Setting | Description |
|---------|-------------|
| `jira.baseUrl` | Your Jira Cloud URL (e.g. `https://yourorg.atlassian.net`) |
| `jira.email` | Atlassian account email |
| `jira.projectKey` | Default project key (e.g. `PROJ`) |

> **Security:** API tokens are stored in the OS keychain, never in `settings.json`. Run **Agile Agent Canvas: Set Jira API Token** to store your token and **Agile Agent Canvas: Clear Jira API Token** to remove it.

### Export and Import

- **Export** artifacts as Markdown (live preview available), JSON, JIRA CSV, or all formats at once
- **Export canvas as PDF or PNG** — captured as a single crisp offscreen pass; large canvases export in seconds
- **Import** from a JSON file with Replace or Merge strategies
- Overwrite protection warns you before replacing existing artifacts

### Sidebar and Canvas

- **Visual Canvas** — Opens in an editor tab via `Agile Agent Canvas: Open Visual Canvas` or the sidebar header icon
- **Sprint Kanban Board** — Dedicated full-screen sprint board reflecting your `sprint-status.yaml`
- **Artifacts** — Sidebar tree view of all project artifacts organized by type
- **Workflow Progress** — Sidebar tree view showing current workflow steps and completion status

---

## Getting Started

1. **Install** Agile Agent Canvas from the Extensions marketplace
2. **Open the sidebar** by clicking the Agile Agent Canvas icon in the activity bar
3. **Create a new project** using the `Agile Agent Canvas: New Project` command, or load demo data with `Agile Agent Canvas: Load Demo Data`
4. **Open the canvas** via the sidebar header icon or run `Agile Agent Canvas: Open Visual Canvas` from the command palette
5. **Start chatting** with `@agileagentcanvas /vision` to define your product vision, then work through requirements, epics, and stories

### Recommended Workflow

```
@agileagentcanvas /vision       -> Define what you're building and why
@agileagentcanvas /requirements -> Extract functional and non-functional requirements
@agileagentcanvas /epics        -> Structure work into value-driven epics
@agileagentcanvas /stories      -> Break epics into implementable stories
@agileagentcanvas /readiness    -> Validate everything is ready for development
@agileagentcanvas /dev          -> Start building with full context
```

---

## AI Provider Configuration

Agile Agent Canvas supports multiple AI providers. Set `agileagentcanvas.aiProvider` in settings:

| Provider | Setup |
|----------|-------|
| **auto** (default) | Automatically detects the best available provider |
| **copilot** | Uses GitHub Copilot via VS Code Language Model API |
| **openai** | Requires `agileagentcanvas.apiKey`; default model: `gpt-4o` |
| **anthropic** | Requires `agileagentcanvas.apiKey`; default model: `claude-sonnet-4-5` |
| **gemini** | Requires `agileagentcanvas.apiKey`; default model: `gemini-2.0-flash` |
| **ollama** | Requires `agileagentcanvas.baseUrl` (e.g. `http://localhost:11434`); default model: `llama3` |
| **antigravity** | Injects prompts into the Antigravity chat panel via native command |
| **omp** | Oh My Pi (OMP) harness — writes prompts to `.omp/inbox.md` or invokes `omp.sendPrompt` if the OMP VS Code extension is installed |

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `agileagentcanvas.outputFolder` | `.agileagentcanvas-context` | Folder for BMAD output artifacts |
| `agileagentcanvas.userCataloguePath` | — | Path to your personal skills/agents folder. Each subfolder with a `SKILL.md` is loaded as a skill. Merged with built-ins at runtime; user skills win on name conflict. |
| `agileagentcanvas.skillRepos` | `[]` | List of git repos to clone and scan for skills (`[{"url": "...", "name": "..."}]`). Managed via the Skill Catalogue modal. |
| `agileagentcanvas.autoSync` | `true` | Automatically sync visual changes to files |
| `agileagentcanvas.showAICursor` | `true` | Show AI cursor position in canvas |
| `agileagentcanvas.defaultAgent` | `analyst` | Default BMAD agent (`analyst`, `pm`, `architect`) |
| `agileagentcanvas.aiProvider` | `auto` | AI provider selection (see table above) |
| `agileagentcanvas.apiKey` | — | API key for OpenAI, Anthropic, or Gemini |
| `agileagentcanvas.modelId` | — | Override the default model for your provider |
| `agileagentcanvas.baseUrl` | — | Base URL for Ollama or custom OpenAI-compatible endpoints |
| `agileagentcanvas.logLevel` | `info` | Controls extension logging verbosity (`debug`/`info`/`warn`/`error`) |
| `agileagentcanvas.graphify.pythonPath` | `python` | Python executable used to run graphify (override if using a venv or `python3`) |
| `agileagentcanvas.graphify.autoBootstrapOnNewProject` | `false` | Prompt to bootstrap graphify automatically when a new trusted project is opened |
| `agileagentcanvas.jira.baseUrl` | — | Jira Cloud base URL (e.g. `https://yourorg.atlassian.net`) |
| `agileagentcanvas.jira.email` | — | Atlassian account email for Jira API authentication |
| `agileagentcanvas.jira.projectKey` | — | Default Jira project key used by `/jira` commands |

---

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type "Agile Agent Canvas" to see all available commands:

- **Agile Agent Canvas: Open Visual Canvas** — Open the full canvas in an editor tab
- **Agile Agent Canvas: New Project** — Create a new project
- **Agile Agent Canvas: Load Existing Project** — Load artifacts from an existing output folder
- **Agile Agent Canvas: Switch Project** — Switch between multiple projects or create a new folder
- **Agile Agent Canvas: Export Artifacts** — Export to Markdown, JSON, or JIRA CSV
- **Agile Agent Canvas: Import Artifacts** — Import artifacts from a JSON file
- **Agile Agent Canvas: Sync to .agileagentcanvas-context** — Manually sync canvas state to files
- **Agile Agent Canvas: Migrate to Reference Architecture** — Migrate inline epics/stories to individual files
- **Agile Agent Canvas: Restore Pre-Migration Backup** — Revert `epics.json` after migration
- **Agile Agent Canvas: Ask Agent (Help)** — Ask the AI what to do next based on your current state
- **Agile Agent Canvas: Load Demo Data** — Populate canvas with sample artifacts
- **Agile Agent Canvas: Install Framework to IDE** — Install the BMAD framework files to your IDE (supports VS Code Copilot, Claude Code, Cursor, Antigravity, OpenCode)
- **Agile Agent Canvas: Fetch from Jira** — Test connection, fetch epics/stories, or sync Jira data to canvas via a step-by-step picker
- **Agile Agent Canvas: Set Jira API Token** — Securely store your Jira API token in the OS keychain (never saved to settings.json)
- **Agile Agent Canvas: Clear Jira API Token** — Remove the stored Jira API token from the OS keychain
- **Agile Agent Canvas: Bootstrap graphify** — Install graphify CLI, build initial knowledge graph, and wire into Copilot Chat
- **Agile Agent Canvas: Update graphify Graph** — Re-extract changed files and rebuild the graph
- **Agile Agent Canvas: Rebuild graphify Graph** — Full cold rebuild of the knowledge graph
- **Agile Agent Canvas: Open graphify Status** — Open the GraphifyModal showing pipeline status and architecture corpus
- **Agile Agent Canvas: Run graphify Index** — Generate `ARCH_INDEX.md` and `ARCH_INDEX.json` architecture corpus files
- **Agile Agent Canvas: Open Skill Catalogue** — Open the Skill Catalogue modal to manage built-in and user-defined skills and agents (also accessible via the catalogue toolbar button)

---

## Canvas Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Arrow keys | Pan canvas up / down / left / right |
| `+` / `-` | Zoom in / out |
| `0` | Reset zoom and pan to default |
| `F` | Toggle focus mode (with a card selected) |
| `M` | Toggle minimap |
| `T` | Toggle type/status filter bar |
| `L` | Toggle layout between lanes and mind map |
| `/` | Open canvas search |
| `Esc` | Close panel / exit focus mode / deselect |

---

## Requirements

- VS Code 1.93 or later
- For AI features: GitHub Copilot extension, or an API key for OpenAI/Anthropic/Gemini, or a local Ollama instance
- For knowledge graph features: Python 3.10+ with `pip install graphifyy` (optional; the extension will offer to install it automatically)

---

## Acknowledgments

Agile Agent Canvas is built on the [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) framework by BMad Code, LLC (MIT License).

Knowledge graph features are powered by [graphify](https://github.com/safishamsi/graphify) by Safi Shamsi (MIT License). graphify is an external tool invoked by the extension and is not bundled. Install separately with `pip install graphifyy`.

---

## Feedback and Issues

Found a bug or have a feature request? Open an issue on the project repository.
