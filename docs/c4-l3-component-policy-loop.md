# Policy Loop (Backend) — C4 Level 3 (Component)

**Diagram type:** C4 — Level 3 (Component)
**Container:** VS Code Extension Host (Node + TypeScript)
**Scope:** `src/workflow/auto-scheduler.ts`, `src/harness/policy-engine.ts`, `src/workflow/kanban-orchestrator.ts`, `src/views/recent-blocks-tracker.ts`, `src/workflow/kanban-settings.ts`
**Audience:** backend eng + safety review
**Last updated:** 2026-06-23

---

## Diagram

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║  POLICY LOOP  ·  C4 Component Diagram (Level 3)                                                ║
║  Container: VS Code Extension Host (Node + TypeScript)                                         ║
║  Scope: src/workflow/auto-scheduler.ts, src/harness/policy-engine.ts,                          ║
║         src/workflow/kanban-orchestrator.ts, src/views/recent-blocks-tracker.ts,               ║
║         src/workflow/kanban-settings.ts                                                         ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝

   ╔══════════════════════════════════════════════════════════════════════════════════════════╗
   ║  VS Code Extension Host  ·  [Container: Node + TypeScript]                                  ║
   ║                                                                                          ║
   ║   ┌──────────────────────────────────────────────────────────────────┐                  ║
   ║   │  Kanban Orchestrator  (kanban-orchestrator.ts)                  │  ← FSM root       ║
   ║   │                                                                  │                  ║
   ║   │  public API:                                                     │                  ║
   ║   │    tick(cardId)                  → CardTransition                │                  ║
   ║   │    enqueue(action)               → PendingAction                │                  ║
   ║   │    decide(card, ctx)             → Decision                     │                  ║
   ║   │    applyDecision(actionId, v)    → void                         │                  ║
   ║   │    onDidTransition(cb)           → Disposable                  │                  ║
   ║   │                                                                  │                  ║
   ║   │  state: Set<CardId>, Map<CardId, CardState>                     │                  ║
   ║   └────────┬──────────────────────────────────┬──────────────────────┘                  ║
   ║            │ asks for permission              │ records outcome                          ║
   ║            ▼                                  │                                          ║
   ║   ┌─────────────────────────────────┐        │                                          ║
   ║   │  Policy Engine                  │        │                                          ║
   ║   │  (harness/policy-engine.ts)     │        │                                          ║
   ║   │                                 │        │                                          ║
   ║   │  decide(ctx) → Verdict {        │        │                                          ║
   ║   │    allow | deny | require_human  │        │                                          ║
   ║   │  }                              │        │                                          ║
   ║   │                                 │        │                                          ║
   ║   │  Pure function over:            │        │                                          ║
   ║   │    - AutonomyLevel              │        │                                          ║
   ║   │    - ActionKind                 │        │                                          ║
   ║   │    - ResourceClass              │        │                                          ║
   ║   │    - RecentBlocks (last N)      │        │                                          ║
   ║   │    - UserPreferences            │        │                                          ║
   ║   │                                 │        │                                          ║
   ║   │  No I/O. No time. Total.        │        │                                          ║
   ║   └────────┬────────────────────────┘        │                                          ║
   ║            │                                 │                                          ║
   ║            │ on `deny`                       │                                          ║
   ║            ▼                                 │                                          ║
   ║   ┌─────────────────────────────────┐        │                                          ║
   ║   │  Recent Blocks Tracker          │        │                                          ║
   ║   │  (views/recent-blocks-tracker.ts)│       │                                          ║
   ║   │                                 │        │                                          ║
   ║   │  public API:                    │        │                                          ║
   ║   │    record(action, verdict, ts)  │        │                                          ║
   ║   │    recent(n) → BlockRecord[]    │        │                                          ║
   ║   │    clear()                      │        │                                          ║
   ║   │                                 │        │                                          ║
   ║   │  On-disk:                       │        │                                          ║
   ║   │    workspaceStorage/aac/         │        │                                          ║
   ║   │      kanban-recent-blocks.json  │        │                                          ║
   ║   │  - debounced write (250ms)      │        │                                          ║
   ║   │  - dedup by action hash         │        │                                          ║
   ║   │  - capped at last 200 entries   │        │                                          ║
   ║   └─────────────────────────────────┘        │                                          ║
   ║                                                │                                          ║
   ║   ┌─────────────────────────────────┐        │                                          ║
   ║   │  Auto-Scheduler                 │◄───────┘                                          ║
   ║   │  (workflow/auto-scheduler.ts)   │  triggers next tick on decision                  ║
   ║   │                                 │                                                  ║
   ║   │  public API:                    │                                                  ║
   ║   │    start(intervalMs, onTick)    │                                                  ║
   ║   │    stop()                       │                                                  ║
   ║   │    onError(cb)                  │                                                  ║
   ║   │                                 │                                                  ║
   ║   │  internal:                      │                                                  ║
   ║   │    setInterval with backoff     │                                                  ║
   ║   │    jitter ±10% to avoid herds   │                                                  ║
   ║   │    disposes on shutdown         │                                                  ║
   ║   └────────┬────────────────────────┘                                                  ║
   ║            │                                                                            ║
   ║            │ reads                                                                     ║
   ║            ▼                                                                            ║
   ║   ┌─────────────────────────────────┐                                                  ║
   ║   │  Kanban Settings                │                                                  ║
   ║   │  (workflow/kanban-settings.ts)  │                                                  ║
   ║   │                                 │                                                  ║
   ║   │  public API:                    │                                                  ║
   ║   │    getAutonomyLevel()           │                                                  ║
   ║   │    setAutonomyLevel(level)      │                                                  ║
   ║   │    getGates() → GateConfig      │                                                  ║
   ║   │    setGates(cfg)                │                                                  ║
   ║   │    onDidChange(cb) → Disposable │                                                  ║
   ║   │                                 │                                                  ║
   ║   │  On-disk:                       │                                                  ║
   ║   │    .agileagentcanvas-context/   │                                                  ║
   ║   │      kanban/settings.json       │                                                  ║
   ║   │  - file watch + in-memory cache │                                                  ║
   ║   │  - emits onDidChange on edit    │                                                  ║
   ║   └─────────────────────────────────┘                                                  ║
   ║                                                                                          ║
   ╚══════════════════════════════════════════════════════════════════════════════════════════╝


   Loop sequence (one tick)
   ────────────────────────

       ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
       │  Tick    │ ──►│  Decide  │ ──►│  Execute │ ──►│  Record  │ ──┐
       │  (sched) │    │  (policy)│    │  (action)│    │  (blocks)│   │
       └──────────┘    └──────────┘    └──────────┘    └──────────┘   │
            ▲                                                            │
            └────────────────────────────────────────────────────────────┘
                                       next tick
                                              │
                                              │ on `deny`
                                              ▼
                                       ┌──────────────┐
                                       │ SafetyPanel  │ (webview mirror)
                                       │ + Approval   │
                                       └──────────────┘
```

---

## Component contracts

| Component | Pure? | Async? | I/O surface |
|---|---|---|---|
| `Kanban Orchestrator` | No (FSM with side-effects on apply) | Sync | `onDidTransition` events |
| `Policy Engine` | **Yes** (no I/O, no time) | Sync | None — takes context, returns verdict |
| `Recent Blocks Tracker` | No (debounced writes) | Async (debounce) | `workspaceStorage/aac/kanban-recent-blocks.json` |
| `Auto-Scheduler` | No (timer) | Async (interval) | None — emits `onTick` events |
| `Kanban Settings` | No (file watch) | Async (file watch) | `.agileagentcanvas-context/kanban/settings.json` |

## Invariants

- **Policy Engine is total.** For every input context, `decide` returns a `Verdict`. No throws cross the boundary.
- **Orchestrator is the only writer of card state.** All transitions go through `applyDecision`.
- **Recent Blocks Tracker is append-only with dedup.** Re-recording the same action hash within 5s is a no-op.
- **Auto-Scheduler never holds a tick while a previous one is running.** Overlapping ticks are dropped, not queued.
- **Kanban Settings writes are coalesced.** Rapid `setAutonomyLevel` calls collapse to the last value.
