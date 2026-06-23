# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agile Agent Canvas is a VS Code extension that brings structured, AI-powered product development into the IDE using the BMAD (Business Method for AI Development) methodology. It provides a visual canvas with a 4-lane workflow system and an AI chat participant (`@agileagentcanvas`) for conversational interactions.

## Build & Test Commands

```bash
# Compile (type-check + bundle + webview)
npm run compile

# Type-check only
npm run check-types

# Bundle extension (no type-check)
npm run bundle          # production
npm run bundle:dev      # development

# Build webview UI separately
npm run compile-webview

# Watch mode for development
npm run watch

# Lint
npm run lint

# Run all tests (Cucumber BDD)
npm run test

# Run tests with coverage
npm run test:coverage
npm run test:coverage:gate   # coverage gate (blocks on threshold)
npm run test:coverage:ci      # CI mode with lcov output

# Run specific test file
npx cucumber-js features/workflow-executor.feature

# Run with tags (e.g. @wip)
npx cucumber-js --tags @wip
```

> **First-time setup:** This repo uses `.npmrc` with `ignore-scripts=true` to lock
> source-binary provenance. After `git clone` + `npm install`, run:
> `npm run bootstrap:hooks` to set up pre-commit githooks.
> See `.npmrc` and `CHANGELOG.md#unreleased` for rationale.

## Architecture

### Core Layers

```
extension.ts          # Entry point, registers all components
├── chat/             # AI chat participant, agent personas, tools, AI provider
├── commands/         # VS Code command handlers (artifacts, project, workflow, Jira)
├── state/            # ArtifactStore (in-memory + file sync), schema validation, catalogue
├── workflow/         # WorkflowExecutor - runs BMAD workflows from markdown/yaml
├── views/            # Canvas webview, sidebar tree views, webview message handler
├── canvas/           # ArtifactTransformer - converts BMAD artifacts to canvas format
├── integrations/     # Jira client, graphify integration
├── antigravity/      # Antigravity IDE orchestrator
└── types/            # Shared TypeScript interfaces for all BMAD artifact types
```

### Artifact System

Artifacts are stored in `.agileagentcanvas-context/` (configurable via `agileagentcanvas.outputFolder`). The `ArtifactStore` class holds the in-memory state and syncs changes to files. Schema validation ensures artifact JSON conforms to BMAD schemas.

**Key types** (`src/types/index.ts`): `Epic`, `Story`, `FunctionalRequirement`, `PRD`, `Architecture`, `ProductBrief`, `TestCase`, and many more.

### Workflow Executor

The `WorkflowExecutor` (`src/workflow/workflow-executor.ts`) loads BMAD workflow definitions from `resources/_aac/` and executes them step-by-step. Workflows are markdown/yaml files with frontmatter specifying steps, validation checkpoints, and AI prompts. The executor uses the AI provider to generate content at each step.

### BMAD Resources

Built-in BMAD framework files live in `resources/_aac/`:
- `workflows/` — 44+ workflow definitions (`.md` with YAML frontmatter)
- `agents/` — Agent persona definitions
- `schemas/` — JSON schemas for artifact validation

### Chat System

`AgileAgentCanvasChatParticipant` (`src/chat/chat-participant.ts`) implements the VS Code Copilot Chat participant. Commands like `/vision`, `/epics`, `/stories`, `/dev`, `/workflows`, etc. route to workflow execution. The chat system uses `AgentPersonas` to load BMAD agent definitions and `agileagentcanvas-tools.ts` to register LM tools the AI can call.

### graphify Integration

graphify (`pip install graphifyy`) is an optional external tool that builds a semantic knowledge graph of the codebase. The extension integrates it via:
- `src/integrations/graphify/` — bootstrap, update, query, and run graphify
- Output: `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`

### Webview (Canvas UI)

The visual canvas is a webview (`src/views/canvas-view-provider.ts`). Communication between the webview and extension uses `postMessage` via `webview-message-handler.ts`. The webview is built in `webview-ui/` as a separate npm project.

## AI Provider Configuration

Supports: `auto` (default), `copilot`, `openai`, `anthropic`, `gemini`, `ollama`, `antigravity`. Set via `agileagentcanvas.aiProvider` in VS Code settings.

## Key Files

| File | Purpose |
|------|---------|
| `extension.ts` | Extension entry point, registers all commands and views |
| `src/state/artifact-store.ts` | Central artifact state management |
| `src/workflow/workflow-executor.ts` | BMAD workflow execution engine |
| `src/chat/chat-participant.ts` | VS Code Copilot Chat participant |
| `src/chat/ai-provider.ts` | AI model communication (streaming, etc.) |
| `src/integrations/jira-client.ts` | Jira Cloud API client |
| `src/integrations/graphify/graphify-runner.ts` | graphify CLI orchestration |
| `resources/_aac/` | BMAD framework files (workflows, agents, schemas) |

## Copilot Instructions

This workspace uses BMAD methodology. The `.github/copilot-instructions.md` is automatically injected into Copilot Chat sessions. Before answering architecture or codebase questions, read `graphify-out/GRAPH_REPORT.md` if it exists. Use `/graphify` in Copilot Chat to build or update the knowledge graph.