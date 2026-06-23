# Webview UI (Agentic Kanban focus) — C4 Level 3 (Component)

**Diagram type:** C4 — Level 3 (Component)
**Container:** Webview UI (Browser + React + Vite)
**Scope:** `webview-ui/src/agentic-kanban/*` + `webview-ui/src/components/renderers/*`
**Audience:** webview eng + a11y review
**Last updated:** 2026-06-23

---

## Diagram

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║  WEBVIEW UI  ·  AGENTIC KANBAN  ·  C4 Component Diagram (Level 3)                              ║
║  Container: Webview UI (Browser + React + Vite)                                              ║
║  Scope: webview-ui/src/agentic-kanban/* + components/renderers/*                              ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝

   ╔══════════════════════════════════════════════════════════════════════════════════════════╗
   ║  Webview UI  ·  [Container: Browser + React + Vite]                                       ║
   ║                                                                                          ║
   ║   ┌────────────────────────────────────────────┐                                         ║
   ║   │  AgenticKanbanApp  (root)                  │  ← router + reducer root                ║
   ║   │  src/agentic-kanban/AgenticKanbanApp.tsx   │     owns autonomy state mirror         ║
   ║   └────────────┬───────────────────────────────┘                                         ║
   ║                │                                                                         ║
   ║   ┌────────────▼─────────────────┐                                                      ║
   ║   │  Top Bar (a11y live region)  │  ← "n of m cards" announce region                  ║
   ║   │  - view toggle (Board/Table) │     aria-live="polite"                              ║
   ║   │  - count + filter chip       │                                                      ║
   ║   └────────────┬─────────────────┘                                                      ║
   ║                │                                                                         ║
   ║   ┌────────────▼─────────────────┐    ┌─────────────────────────────────┐               ║
   ║   │  AutonomyBar                 │    │  Main Board                     │               ║
   ║   │  src/agentic-kanban/         │    │  - 4 lanes (Backlog,            │               ║
   ║   │  AutonomyBar.tsx             │    │    In-Progress, Review, Done)   │               ║
   ║   │  - level selector            │    │  - virtualized list             │               ║
   ║   │  - gate toggles              │    │  - keyboard reorder             │               ║
   ║   │  - aria-live="polite"        │    └────────────┬────────────────────┘               ║
   ║   └────────────┬─────────────────┘                 │                                    ║
   ║                │                                   │                                    ║
   ║   ┌────────────▼─────────────────┐                  │                                    ║
   ║   │  SafetyPanel                 │                  │                                    ║
   ║   │  src/agentic-kanban/         │                  │                                    ║
   ║   │  SafetyPanel.tsx             │                  │                                    ║
   ║   │  - read-only policy mirror   │                  │                                    ║
   ║   │  - recent decisions history  │                  │                                    ║
   ║   │  - aria-live="polite"        │                  │                                    ║
   ║   └────────────┬─────────────────┘                  │                                    ║
   ║                │                                   │                                    ║
   ║   ┌────────────▼─────────────────┐    ┌────────────▼────────────────────┐               ║
   ║   │  ApprovalBanner              │    │  LaneColumn (per status)        │               ║
   ║   │  src/agentic-kanban/         │    │  - drop target                 │               ║
   ║   │  ApprovalBanner.tsx          │    │  - card list (KanbanCard)      │               ║
   ║   │  - interstitial modal        │    │  - keyboard sortable           │               ║
   ║   │  - focus trap + restore      │    │  - aria-label="<status> lane"  │               ║
   ║   │  - approve / deny CTAs       │    └────────────┬────────────────────┘               ║
   ║   │  - aria-live="assertive"     │                 │                                    ║
   ║   └─────────────────────────────┘    ┌────────────▼────────────────────┐               ║
   ║                                       │  KanbanCard                     │               ║
   ║   ┌─────────────────────────────┐    │  - type tag                     │               ║
   ║   │  FleetDashboard             │    │  - status dot (running pulse)   │               ║
   ║   │  src/agentic-kanban/        │    │  - block affordance             │               ║
   ║   │  FleetDashboard.tsx         │    │  - role="article"               │               ║
   ║   │  - multi-agent status grid  │    │  - aria-label synthesised       │               ║
   ║   │  - telemetry chart          │    └────────────┬────────────────────┘               ║
   ║   │  - aria-live="assertive"    │                 │                                    ║
   ║   └─────────────────────────────┘    ┌────────────▼────────────────────┐               ║
   ║                                       │  Card Renderers                 │               ║
   ║                                       │  webview-ui/src/components/     │               ║
   ║                                       │  renderers/                     │               ║
   ║                                       │  - bmm-renderers.tsx            │               ║
   ║                                       │  - tea-renderers.tsx            │               ║
   ║                                       │  - test-renderers.tsx           │               ║
   ║                                       │  (all token-driven chrome)      │               ║
   ║                                       └─────────────────────────────────┘               ║
   ║                                                                                          ║
   ║   ┌────────────────────────────────────────────────────────────────────────────────┐     ║
   ║   │  Message Handler (client side)                                                 │     ║
   ║   │  webview-ui/src/agentic-kanban/.../message-handler.client.ts                   │     ║
   ║   │                                                                                │     ║
   ║   │    onHostMessage(raw)                                                          │     ║
   ║   │      EnvelopeSchemas.safeParse(raw)  ── parse fail ──► console.error + skip     │     ║
   ║   │      switch (envelope.kind)                                                    │     ║
   ║   │        case 'kanban.policy.snapshot'  → store.dispatch(setPolicy(...))          │     ║
   ║   │        case 'kanban.card.move'        → store.dispatch(applyCardMove(...))      │     ║
   ║   │        case 'kanban.fleet.snapshot'   → store.dispatch(setFleet(...))           │     ║
   ║   │        case 'kanban.approval.request' → store.dispatch(showApproval(...))       │     ║
   ║   │                                                                                │     ║
   ║   │    sendToHost<T>(envelope)                                                      │     ║
   ║   │      vscode.postMessage(envelope)                                              │     ║
   ║   └────────────────────────────────────────────────────────────────────────────────┘     ║
   ║                                                                                          ║
   ╚══════════════════════════════════════════════════════════════════════════════════════════╝
                                                        │
                                                        │ vscode.postMessage (typed)
                                                        ▼
                                              [VS Code Webview Host]


  Legend
  ──────
    Components          Single-line ┌─┐; React component
    A11y affordances    aria-live region / role / label / focus management — noted in the box
    Arrow direction     Reads top-down by user-attention path; host→webview is the source of truth

  House Style (L3 inside a UI container)
  ───────────────────────────────────────
    • Components drawn top-down by visual placement on screen, not call order
    • A11y role / live region noted in every interactive component
    • All chrome tokenised (no hard-coded colors) — Cluster D-3 requirement
    • Pulse animations are transform-only (no opacity flicker) — WCAG 2.3.3
```

---

## Component contracts

| Component | Public props | Emits | A11y posture |
|---|---|---|---|
| `AgenticKanbanApp` | `{ initialSnapshot: PolicySnapshot }` | — (root) | `role="application"`, single tab stop into board |
| `AutonomyBar` | `{ level, gates, onChange }` | `onChange({ level, gates })` | `aria-live="polite"` on level change |
| `SafetyPanel` | `{ policy }` | — (read-only) | `aria-live="polite"` on policy snapshot |
| `ApprovalBanner` | `{ request, onRespond }` | `onRespond(decision)` | focus trap, restore on close, `aria-live="assertive"` |
| `FleetDashboard` | `{ snapshot }` | — (read-only) | `aria-live="assertive"` on agent status change |
| `KanbanCard` | `{ card, onAction }` | `onAction(action)` | `role="article"`, `aria-label` synthesised |
| `LaneColumn` | `{ status, cards, onDrop }` | `onDrop(cardId, fromStatus)` | `aria-label="<status> lane"`, sortable via keyboard |
| Card Renderers | `{ card }` | — | Inherit KanbanCard a11y; no extra focusables |
| Message Handler (client) | `{ store }` | `store.dispatch(...)` | Logs parse failures to console (no UI noise) |
