# Agentic Kanban Subsystem — System Design

**Diagram type:** C4 — Level 2 (Container)
**Scope:** `src/workflow/kanban*` + `webview-ui/src/agentic-kanban/*`
**Branch:** `fix/a11y-autonomy-surfaces-wcag-fails`
**Audience:** Eng review, A11y review (Cluster D-3)
**Last updated:** 2026-06-23

---

## Diagram

```
╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║  AGILE AGENT CANVAS  ·  Agentic Kanban Subsystem  ·  C4 Container Diagram (System Design)                      ║
║  Scope: src/workflow/kanban*  +  webview-ui/src/agentic-kanban/*     Status: Cluster D-3 in-flight              ║
╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════╝


  ┌────────────────────┐                                          ┌──────────────────────────┐
  │  Developer         │                                          │  AI Provider             │
  │  [Person]          │                                          │  [External System]       │
  │                    │                                          │                          │
  │  • Reviews cards   │                                          │  • Anthropic Claude      │
  │  • Approves gates  │       /workflow + /kanban commands        │  • OpenAI GPT            │
  │  • Configures      │ ─────────────────────────────────────►    │  • Google Gemini         │
  │    autonomy level  │                                          │  • Ollama (local)        │
  └─────────┬──────────┘                                          │  • Antigravity           │
            │                                                     └────────────┬─────────────┘
            │                                                                  │
            │                                                                  │
            ▼                                                                  │
  ┌────────────────────┐                                                       │ HTTPS
  │  VS Code + Copilot │                                                       │ (streaming + tools)
  │  Chat              │                                                       │
  │  [IDE Shell]       │                                                       ▼
  └─────────┬──────────┘                                          ┌──────────────────────────┐
            │  invokes chat                                       │  AI Provider Adapter     │
            │  participant                                       │  (in Ext Host)           │
            │                                                     │  src/chat/ai-provider.ts │
            │                                                     └──────────────────────────┘
            │
            │  postMessage (typed contract)
            ▼
  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │                                                                                                             │
  │   AGENTIC KANBAN SUBSYSTEM  ·  [Software System]                                                            │
  │                                                                                                             │
  │   ╔════════════════════════════════════════╗      ╔═══════════════════════════════════════════════════╗    │
  │   ║ VS Code Extension Host                ║      ║ Webview UI                                       ║    │
  │   ║ [Container: Node + TypeScript]        ║      ║ [Container: Browser + React + Vite]              ║    │
  │   ║                                        ║      ║                                                   ║    │
  │   ║  ┌──────────────────────────────────┐  ║      ║  ┌──────────────────────────────────────────┐    ║    │
  │   ║  │ Kanban Orchestrator              │  ║      ║  │ AgenticKanbanApp                         │    ║    │
  │   ║  │ (FSM over card states)           │  ║      ║  │ (root router + reducer)                  │    ║    │
  │   ║  └─────────────────┬────────────────┘  ║      ║  └─────────────────┬────────────────────────┘    ║    │
  │   ║                    │                   ║      ║                    │                              ║    │
  │   ║  ┌─────────────────▼────────────────┐  ║      ║  ┌─────────────────▼────────────────────────┐    ║    │
  │   ║  │ Policy Engine                    │  ║      ║  │ AutonomyBar                               │    ║    │
  │   ║  │ (allow / deny / require human)    │  ║      ║  │ (live autonomy level + gate toggles)      │    ║    │
  │   ║  └─────────────────┬────────────────┘  ║      ║  └─────────────────┬────────────────────────┘    ║    │
  │   ║                    │                   ║      ║                    │                              ║    │
  │   ║  ┌─────────────────▼────────────────┐  ║      ║  ┌─────────────────▼────────────────────────┐    ║    │
  │   ║  │ Auto-Scheduler                   │  ║      ║  │ SafetyPanel                               │    ║    │
  │   ║  │ (tick loop / retry / abort)       │  ║      ║  │ (policy surface — read-only mirror)       │    ║    │
  │   ║  └─────────────────┬────────────────┘  ║      ║  └─────────────────┬────────────────────────┘    ║    │
  │   ║                    │                   ║      ║                    │                              ║    │
  │   ║  ┌─────────────────▼────────────────┐  ║      ║  ┌─────────────────▼────────────────────────┐    ║    │
  │   ║  │ Recent Blocks Tracker            │◄─╬─►  ║◄─╬─►│ ApprovalBanner                            │    ║    │
  │   ║  │ (debounce + dedup of block ops)   │  ║      ║  │ (human-gate interstitials + ARIA live)    │    ║    │
  │   ║  └─────────────────┬────────────────┘  ║      ║  └─────────────────┬────────────────────────┘    ║    │
  │   ║                    │                   ║      ║                    │                              ║    │
  │   ║  ┌─────────────────▼────────────────┐  ║      ║  ┌─────────────────▼────────────────────────┐    ║    │
  │   ║  │ Kanban Message Handler           │  ║      ║  │ FleetDashboard                            │    ║    │
  │   ║  │ (ext↔webview typed bridge)       │  ║      ║  │ (multi-agent telemetry + status grid)     │    ║    │
  │   ║  └─────────────────┬────────────────┘  ║      ║  └─────────────────┬────────────────────────┘    ║    │
  │   ║                    │                   ║      ║                    │                              ║    │
  │   ║  ┌─────────────────▼────────────────┐  ║      ║  ┌─────────────────▼────────────────────────┐    ║    │
  │   ║  │ Kanban Settings                  │  ║      ║  │ Card Renderers                             │    ║    │
  │   ║  │ (persistence adapter + watcher)  │  ║      ║  │ (bmm-renderers / tea-renderers / test-     │    ║    │
  │   ║  └──────────────────────────────────┘  ║      ║  │  renderers — token-driven chrome)          │    ║    │
  │   ║                                        ║      ║  └──────────────────────────────────────────┘    ║    │
  │   ║                                        ║      ║                                                   ║    │
  │   ╚══════════════════════╤═════════════════╝      ╚═══════════════════╤═══════════════════════════╝    │
  │                          │                                              │                                │
  └──────────────────────────┼──────────────────────────────────────────────┼────────────────────────────────┘
                             │                                              │
                             │ R/W JSON  + file watch                       │ postMessage (typed)
                             ▼                                              ▼
              ┌──────────────────────────────┐                ┌──────────────────────────────┐
              │  Kanban State Store          │                │  VS Code Webview Host        │
              │  [File System]               │                │  [VS Code Runtime]           │
              │                              │                │                              │
              │  .agileagentcanvas-context/  │                │  • iframe + strict CSP       │
              │    kanban/*.json             │                │  • message router            │
              │    settings.json             │                │  • theming via CSS vars      │
              │  workspaceStorage/aac/       │                │                              │
              │    kanban-recent-blocks.json │                │  Hosts the React container   │
              └──────────────────────────────┘                └──────────────────────────────┘


  Legend
  ──────
    [Person]             Human actor (interacts via IDE/CLI)
    [Software System]    Top-level system under design
    [Container]          Deployable / runnable unit (separate process or runtime)
    [External System]    Third-party service outside our trust boundary
    [File System]        Local persistence (read + write)
    [VS Code Runtime]    Editor-managed runtime (webview host, message router)
    [IDE Shell]          VS Code itself + Copilot extension

    ───►   Unidirectional flow  (commands, R/W, events)
    ◄──►   Bidirectional        (postMessage bridge, file watcher sync)
    ╬      Type-safe contract  (Zod-validated message envelopes)


  House Style Conventions
  ───────────────────────
    • System boundary      — single-line box, label "AGENTIC KANBAN SUBSYSTEM"
    • Containers           — DOUBLE-line ╔═╗ with [Container: <runtime>] tag
    • Components           — single-line ┌─┐ inside their container
    • External actors      — single-line ┌─┐ with [Person] / [External System] tag
    • Data stores          — single-line ┌─┐ with [File System] tag, below system
    • Arrows               — only on edges (not inside containers)
    • Component order      — top-down by call direction; webview right, host left
```

---

## Design Notes

**Why two containers?** The Extension Host (Node, privileged, full FS access) and the Webview UI (React, sandboxed iframe) are deliberately isolated. They cannot share state directly — every interaction crosses the typed postMessage bridge via `agentic-kanban-message-handler.ts`.

**Why is `Policy Engine` upstream of `Auto-Scheduler`?** Every scheduled action must be re-evaluated against current autonomy level + gates. The scheduler is a tick loop, not a decision-maker; the policy engine is the only writer of "what may run next."

**Why mirror `Policy Engine` into `SafetyPanel`?** The webview cannot read the extension's in-memory state directly. `SafetyPanel` is a read-only projection of the policy snapshot the host publishes — it is the a11y-facing answer to "what is the agent allowed to do right now."

**Where does `Recent Blocks Tracker` sit?** It lives in the host (durable, debounced, dedup'd writes to `kanban-recent-blocks.json`) and is mirrored into `ApprovalBanner` so the user sees an immediate "you just blocked N actions" affordance without waiting for the next state push.

**A11y posture (Cluster D-3 in-flight):**
- All autonomy surfaces (`AutonomyBar`, `SafetyPanel`, `ApprovalBanner`, `FleetDashboard`) must announce state changes via `aria-live`.
- Card chrome is tokenised — no hard-coded colors, so high-contrast and reduced-motion variants fall out of the same CSS layer.
- Pulse animations on running cards are `transform`-only (no opacity flicker) to remain WCAG 2.3.3 compliant.
