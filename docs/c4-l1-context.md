# Agile Agent Canvas Extension — C4 Level 1 (Context)

**Diagram type:** C4 — Level 1 (Context / System Landscape)
**Scope:** the whole extension and its ecosystem
**Audience:** all stakeholders
**Last updated:** 2026-06-23

---

## Diagram

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║  AGILE AGENT CANVAS EXTENSION  ·  C4 Context Diagram (Level 1)                                ║
║  Scope: the whole extension and its ecosystem       Audience: all stakeholders               ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝


   ┌──────────────────────┐                                          ┌──────────────────────────┐
   │  Product Developer   │                                          │  AI Provider             │
   │  [Person]            │                                          │  [External System]       │
   │                      │                                          │                          │
   │  • Writes stories    │  Copilot Chat + VS Code commands         │  • Anthropic Claude      │
   │  • Runs workflows    │ ──────────────────────────────────►      │  • OpenAI GPT            │
   │  • Reviews kanban    │                                          │  • Google Gemini         │
   │  • Approves gates    │                                          │  • Ollama (local)        │
   │  • Configures policy │                                          │  • Antigravity           │
   └──────────┬───────────┘                                          └─────────────┬────────────┘
              │                                                                   │
              │ uses                                                              │ tool calls
              ▼                                                                   │ + streaming
   ╔══════════════════════════════════════════════════════════════════════════════▼══════════╗
   ║                                                                                          ║
   ║   AGILE AGENT CANVAS  ·  [Software System]                                               ║
   ║                                                                                          ║
   ║   VS Code extension implementing BMAD methodology.                                        ║
   ║   AI-powered product development with 4-lane canvas +                                    ║
   ║   Agentic Kanban autonomy surfaces.                                                      ║
   ║                                                                                          ║
   ║   Internal scope:                                                                        ║
   ║   • Chat participant (@agileagentcanvas)                                                 ║
   ║   • Workflow executor (44+ BMAD workflows)                                               ║
   ║   • Artifact store (typed, schema-validated)                                              ║
   ║   • Canvas webview (4-lane) + Agentic Kanban autonomy                                    ║
   ║   • Jira / graphify / Antigravity adapters                                               ║
   ║                                                                                          ║
   ╚══════╤══════════════════╤═══════════════════╤═══════════════════╤═════════════════════════╝
          │                  │                   │                   │
          │ REST + OAuth     │ pip + JSON        │ LSP / LM API      │ subprocess / socket
          │                  │                   │                   │
          ▼                  ▼                   ▼                   ▼
   ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │  Jira Cloud  │  │  graphify    │  │  GitHub Copilot  │  │  Antigravity     │
   │  [External]  │  │  [External]  │  │  [VS Code Ext]   │  │  [External]      │
   │              │  │              │  │                  │  │                  │
   │  • Epics     │  │  • KG build  │  │  • LM API        │  │  • Alt IDE       │
   │  • Two-way   │  │  • Semantic  │  │  • Tool registry │  │  • Orchestrator  │
   │    sync      │  │    search    │  │  • Model select  │  │  • Shared LM     │
   └──────────────┘  └──────────────┘  └──────────────────┘  └──────────────────┘


  Legend
  ──────
    [Person]             Human actor who uses the system
    [Software System]    The system under design (the only such box at L1)
    [External System]    Third-party system outside our trust boundary
    [VS Code Ext]        First-party extension we depend on at the IDE level

    ───►   Unidirectional flow  (commands, R/W, events)
    ◄──►   Bidirectional        (sync, RPC)


  House Style (L1)
  ────────────────
    • One system boundary box (the extension)
    • External actors (people) on the left
    • External systems on the right
    • Other external dependencies on the bottom
    • No internal structure shown (that's L2's job)
```

---

## Relationship table

| From | To | Protocol | Purpose |
|---|---|---|---|
| Developer | Extension | VS Code commands, Copilot Chat | Drives workflows, reviews cards, approves gates |
| Extension | AI Provider | HTTPS (streaming) | Tool calls, model completion, embeddings |
| Extension | Jira Cloud | REST + OAuth 2.0 | Issue sync, two-way link |
| Extension | graphify | pip install + subprocess | Build + query semantic knowledge graph |
| Extension | GitHub Copilot | LSP / LM API (VS Code-provided) | Model selection, tool registry, chat host |
| Extension | Antigravity | subprocess / local socket | Alt IDE orchestrator with shared LM |
