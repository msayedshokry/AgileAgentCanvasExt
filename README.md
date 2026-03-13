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

### AI Chat Participant

Type `@agileagentcanvas` in VS Code chat to access 30+ slash commands powered by AI:

| Command | Description |
|---------|-------------|
| `/vision` | Define product vision and problem statement |
| `/requirements` | Extract and organize requirements from PRD |
| `/epics` | Design epic structure organized by user value |
| `/stories` | Break down epics into implementable stories |
| `/enhance` | Add verbose details: use cases, fit criteria, risks |
| `/review` | Review and validate artifact completeness |
| `/refine` | Refine a specific artifact with AI suggestions |
| `/dev` | Start development workflow for a story, epic, or test case |
| `/sprint` | Sprint planning from epics or check sprint status |
| `/readiness` | Check implementation readiness of PRD, architecture, epics and stories |
| `/workflows` | Browse all 44 BMAD workflows by module or artifact type |
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
| `/ux` | Create UX design specifications through collaborative exploration |
| `/write-doc` | Write a document following documentation best practices |
| `/mermaid` | Generate Mermaid diagrams |
| `/readme` | Generate or update a README.md from project analysis |
| `/changelog` | Generate changelog or release notes |
| `/api-docs` | Generate API documentation from source code |

### Language Model Tools

Agile Agent Canvas registers tools that AI models can call autonomously during chat conversations:

- **agileagentcanvas_read_file** — Read BMAD framework files, schemas, workflows, and agent definitions
- **agileagentcanvas_list_directory** — Discover available workflows, agents, schemas, and steps
- **agileagentcanvas_update_artifact** — Persist artifact changes directly from AI refinement

### Workflow System

44 built-in workflows organized by module guide you through structured product development processes. Workflows have defined steps, validation checkpoints, and produce artifacts that populate your canvas automatically. Track progress in the dedicated **Workflow Progress** sidebar view.

### Export and Import

- **Export** artifacts as Markdown, JSON, JIRA CSV, or all formats at once
- **Import** from a JSON file with Replace or Merge strategies
- Overwrite protection warns you before replacing existing artifacts

### Sidebar and Canvas

- **Visual Canvas** — Opens in an editor tab via `Agile Agent Canvas: Open Visual Canvas` or the sidebar header icon
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

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `agileagentcanvas.outputFolder` | `.agileagentcanvas-context` | Folder for BMAD output artifacts |
| `agileagentcanvas.outputFormat` | `dual` | Output format: `json`, `markdown`, or `dual` (both) |
| `agileagentcanvas.autoSync` | `true` | Automatically sync visual changes to files |
| `agileagentcanvas.showAICursor` | `true` | Show AI cursor position in canvas |
| `agileagentcanvas.defaultAgent` | `analyst` | Default BMAD agent (`analyst`, `pm`, `architect`) |
| `agileagentcanvas.aiProvider` | `auto` | AI provider selection (see table above) |
| `agileagentcanvas.apiKey` | — | API key for OpenAI, Anthropic, or Gemini |
| `agileagentcanvas.modelId` | — | Override the default model for your provider |
| `agileagentcanvas.baseUrl` | — | Base URL for Ollama or custom OpenAI-compatible endpoints |

---

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type "Agile Agent Canvas" to see all available commands:

- **Agile Agent Canvas: Open Visual Canvas** — Open the full canvas in an editor tab
- **Agile Agent Canvas: New Project** — Create a new project
- **Agile Agent Canvas: Load Existing Project** — Load artifacts from an existing output folder
- **Agile Agent Canvas: Export Artifacts** — Export to Markdown, JSON, or JIRA CSV
- **Agile Agent Canvas: Import Artifacts** — Import artifacts from a JSON file
- **Agile Agent Canvas: Sync to .agileagentcanvas-context** — Manually sync canvas state to files
- **Agile Agent Canvas: Load Demo Data** — Populate canvas with sample artifacts
- **Agile Agent Canvas: Switch Project** — Switch between multiple projects in your workspace
- **Agile Agent Canvas: Install Framework to IDE** — Install the BMAD framework files

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

---

## Acknowledgments

Agile Agent Canvas is built on the [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) framework by BMad Code, LLC (MIT License).

---

## Feedback and Issues

Found a bug or have a feature request? Open an issue on the project repository.
