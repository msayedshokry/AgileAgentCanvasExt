# Agile Agent Canvas Extension — C4 Level 2 (Container)

**Diagram type:** C4 — Level 2 (Container)
**Scope:** the whole extension
**Audience:** eng + architecture
**Companion diagram:** `.claude/diagrams/c4-l1-context.md` (Level 1)
**Last updated:** 2026-06-23

---

## Diagram

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║  AGILE AGENT CANVAS EXTENSION  ·  C4 Container Diagram (Level 2)                              ║
║  Scope: the whole extension                Audience: eng + architecture                      ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝

   ┌──────────────────────┐                                          ┌──────────────────────────┐
   │  Product Developer   │                                          │  AI Provider             │
   │  [Person]            │                                          │  [External System]       │
   └──────────┬───────────┘                                          └─────────────┬────────────┘
              │                                                                   │
              ▼                                                                   │
   ┌──────────────────────┐                                                        │
   │  VS Code IDE         │   /workflow, /epics, /vision, /kanban.*                │
   │  + Copilot Chat      │ ──────────────────────────────────────────────────────►│
   │  [IDE Shell]         │                                                        │
   └──────────┬───────────┘                                                        │
              │ loads                                                              │
              ▼                                                                    ▼
   ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
   │                                                                                              │
   │   AGILE AGENT CANVAS EXTENSION  ·  [Software System]                                         │
   │                                                                                              │
   │   ╔════════════════════════════════════╗      ╔════════════════════════════════════════╗    │
   │   ║ VS Code Extension Host            ║      ║ Webview UI                            ║    │
   │   ║ [Container: Node + TypeScript]    ║      ║ [Container: Browser + React + Vite]   ║    │
   │   ║                                    ║      ║                                        ║    │
   │   ║  ┌──────────────────────────────┐  ║      ║  ┌──────────────────────────────────┐  ║    │
   │   ║  │ Chat Participant              │  ║      ║  │ Canvas (4-lane Workflow)         │  ║    │
   │   ║  │ @agileagentcanvas             │  ║      ║  │ + Sidebar Tree Views             │  ║    │
   │   ║  └─────────────┬────────────────┘  ║      ║  └──────────────────────────────────┘  ║    │
   │   ║                │                   ║      ║                                        ║    │
   │   ║  ┌─────────────▼────────────────┐  ║      ║  ┌──────────────────────────────────┐  ║    │
   │   ║  │ Workflow Executor             │  ║      ║  │ Agentic Kanban Surfaces           │  ║    │
   │   ║  │ (loads BMAD markdown/yaml)    │  ║      ║  │ (AutonomyBar, SafetyPanel,        │  ║    │
   │   ║  └─────────────┬────────────────┘  ║      ║  │  ApprovalBanner, FleetDashboard)  │  ║    │
   │   ║                │                   ║      ║  └──────────────────────────────────┘  ║    │
   │   ║                │                   ║      ║                                        ║    │
   │   ║  ┌─────────────▼────────────────┐  ║      ║  ┌──────────────────────────────────┐  ║    │
   │   ║  │ Artifact Store                 │◄─╬─►  ║◄─╬─►│ Webview Message Handler           │  ║    │
   │   ║  │ (typed, schema-validated)      │  ║      ║  │ (typed postMessage bridge)         │  ║    │
   │   ║  └─────────────┬────────────────┘  ║      ║  └──────────────────────────────────┘  ║    │
   │   ║                │                   ║      ║                                        ║    │
   │   ║  ┌─────────────▼────────────────┐  ║      ╚════════════════════╤═══════════════════╝    │
   │   ║  │ AI Provider                   │  ║                           │                      │
   │   ║  │ (Claude / GPT / Ollama / ...)  │  ║                           │ postMessage          │
   │   ║  └─────────────┬────────────────┘  ║                           │                      │
   │   ║                │                   ║                           │                      │
   │   ║  ┌─────────────▼────────────────┐  ║                           │                      │
   │   ║  │ Jira Client                   │  ║                           │                      │
   │   ║  │ (REST + OAuth)                │  ║                           │                      │
   │   ║  └─────────────┬────────────────┘  ║                           │                      │
   │   ║                │                   ║                           │                      │
   │   ║  ┌─────────────▼────────────────┐  ║                           │                      │
   │   ║  │ graphify Runner               │  ║                           │                      │
   │   ║  │ (subprocess + JSON parse)     │  ║                           │                      │
   │   ║  └──────────────────────────────┘  ║                           │                      │
   │   ║                                    ║                           │                      │
   │   ╚════════════════════╤═══════════════╝                           │                      │
   │                        │                                          │                      │
   └────────────────────────┼──────────────────────────────────────────┼──────────────────────┘
                            │                                          │
                            │ R/W JSON + file watch                    │
                            ▼                                          ▼
              ┌──────────────────────────────┐                ┌────────────────────────┐
              │  Artifact + Kanban Store     │                │  VS Code Webview Host  │
              │  [File System]               │                │  [VS Code Runtime]     │
              │  .agileagentcanvas-context/  │                │  iframe + CSP +       │
              │   epics/  stories/  prds/    │                │  message router        │
              │   kanban/*.json              │                │  theming via CSS vars  │
              └──────────────────────────────┘                └────────────────────────┘

              ┌──────────────────────────────┐                ┌────────────────────────┐
              │  BMAD Resources (read-only)  │                │  graphify output       │
              │  [File System]               │                │  [File System]         │
              │  resources/_aac/             │                │  graphify-out/         │
              │   workflows/  agents/         │                │   GRAPH_REPORT.md      │
              │   schemas/                   │                │   graph.json           │
              └──────────────────────────────┘                └────────────────────────┘


  Legend
  ──────
    [Software System]    The whole extension (Level 1 boundary, repeated for context)
    [Container]          Deployable / runnable unit
    [IDE Shell]          VS Code + Copilot (the host environment)
    [VS Code Runtime]    Editor-managed runtime (webview host, message router)
    [File System]        Local persistence (read-only or R/W tagged inline)

    ───►   Unidirectional flow  (commands, R/W, events)
    ◄──►   Bidirectional        (postMessage bridge, file watcher sync)
    ╬      Type-safe contract  (Zod-validated message envelopes)


  House Style (L2)
  ────────────────
    • One system boundary box (the extension)
    • Containers inside use DOUBLE-line ╔═╗
    • Components inside containers use single-line ┌─┐
    • Data stores sit OUTSIDE the system boundary, below
    • External systems sit OUTSIDE, top or right
    • Edges only cross the system boundary, not between components
    • The Webview UI container is always on the right
```

---

## Container responsibilities

| Container | Runtime | Responsibility | Key source dir |
|---|---|---|---|
| VS Code Extension Host | Node 20 + TypeScript | Privileged code: chat, workflows, artifact store, external API clients, agentic kanban backend | `src/` |
| Webview UI | Browser iframe (Chromium) + React 18 + Vite | Sandboxed UI: canvas, sidebar, agentic kanban autonomy surfaces | `webview-ui/src/` |
| VS Code Webview Host | Editor-managed | iframe + CSP + message router; the only thing that bridges the two containers | (built into VS Code) |
| Artifact + Kanban Store | Local FS | Source of truth for artifacts, kanban state, autonomy settings | `.agileagentcanvas-context/`, `workspaceStorage/aac/` |
| BMAD Resources | Local FS (read-only) | Shipped framework files: workflows, agents, schemas | `resources/_aac/` |
| graphify output | Local FS | Knowledge graph + report read by Copilot context | `graphify-out/` |

## Cross-container protocol

All host↔webview communication crosses `Webview Message Handler` in the host. Every message is a versioned `Envelope<T>` discriminated by `kind` and validated with Zod. There is no shared in-memory state and no FS path is shared without going through the artifact store.
