# Agentic-Kanban Message Handler — C4 Level 4 (Code)

**Diagram type:** C4 — Level 4 (Code)
**Component:** Kanban Message Handler
**Source file:** `src/views/agentic-kanban-message-handler.ts`
**Audience:** backend eng + protocol review
**Last updated:** 2026-06-23

---

## Module structure

```
╔══════════════════════════════════════════════════════════════════════════════════════════════╗
║  AGENTIC-KANBAN-MESSAGE-HANDLER  ·  C4 Code Diagram (Level 4)                                 ║
║  Component: Kanban Message Handler                                                            ║
║  Source:   src/views/agentic-kanban-message-handler.ts                                        ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝

   ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
   │  module: agentic-kanban-message-handler.ts                                                  │
   │                                                                                            │
   │  ┌────────────────────────────────────────────────────────────────────────────────────┐     │
   │  │  §1  Types  (export type)                                                          │     │
   │  │                                                                                    │     │
   │  │    type Envelope<T extends MessageKind> = {                                         │     │
   │  │      v: 1;                       // schema version                                 │     │
   │  │      id: string;                 // correlation id                                 │     │
   │  │      ts: number;                 // epoch ms (host clock)                          │     │
   │  │      kind: T;                    // discriminator                                  │     │
   │  │      payload: PayloadFor<T>;                                                    │     │
   │  │    }                                                                               │     │
   │  │                                                                                    │     │
   │  │    type MessageKind =                                                              │     │
   │  │      | 'kanban.card.move'              // host → webview: applied transition        │     │
   │  │      | 'kanban.card.request'           // webview → host: user-driven request      │     │
   │  │      | 'kanban.policy.snapshot'        // host → webview: current policy mirror     │     │
   │  │      | 'kanban.approval.request'       // host → webview: ask user to approve        │     │
   │  │      | 'kanban.approval.respond'       // webview → host: user's decision           │     │
   │  │      | 'kanban.fleet.snapshot'         // host → webview: multi-agent status        │     │
   │  │      | 'kanban.error'                  // either side: recoverable error             │     │
   │  │      | 'kanban.ready'                  // webview → host: client initialised         │     │
   │  │                                                                                    │     │
   │  │    type Verdict = 'allow' | 'deny' | 'require_human'                                │     │
   │  └────────────────────────────────────────────────────────────────────────────────────┘     │
   │                                            ▲                                                │
   │                                            │  zod-validated                                │
   │                                            │                                                │
   │  ┌────────────────────────────────────────────────────────────────────────────────────┐     │
   │  │  §2  Schemas  (export const, zod)                                                  │     │
   │  │                                                                                    │     │
   │  │    CardMovePayload       = z.object({ cardId, from, to, at })                      │     │
   │  │    CardRequestPayload    = z.object({ cardId, action, reason: z.string().optional()})│    │
   │  │    PolicySnapshotPayload = z.object({ level, gates, recentBlocks: z.array(BlockRec) })│   │
   │  │    ApprovalRequestPayload= z.object({ actionId, summary, expiresAt })              │     │
   │  │    ApprovalRespondPayload= z.object({ actionId, decision: z.enum(['allow','deny']) })│    │
   │  │    FleetSnapshotPayload  = z.object({ agents: z.array(AgentStatus) })              │     │
   │  │    ErrorPayload          = z.object({ code, message, recoverable: z.boolean() })   │     │
   │  │    ReadyPayload          = z.object({ clientVersion: z.literal(1) })               │     │
   │  │                                                                                    │     │
   │  │    EnvelopeSchemas = z.discriminatedUnion('kind', [                                │     │
   │  │      CardMove, CardRequest, PolicySnapshot, ApprovalRequest,                       │     │
   │  │      ApprovalRespond, FleetSnapshot, Error, Ready,                                 │     │
   │  │    ])                                                                              │     │
   │  └────────────────────────────────────────────────────────────────────────────────────┘     │
   │                                            ▲                                                │
   │                                            │  constructed by                              │
   │                                            │                                                │
   │  ┌────────────────────────────────────────────────────────────────────────────────────┐     │
   │  │  §3  Handler  (export class KanbanMessageHandler)                                  │     │
   │  │                                                                                    │     │
   │   │    constructor(deps: {                                                            │     │
   │  │      webview:       Webview,              // VS Code webview handle                │     │
   │  │      orchestrator:  KanbanOrchestrator,   // FSM                                  │     │
   │  │      policyEngine:  PolicyEngine,         // verdict source                       │     │
   │  │      blocks:        RecentBlocksTracker,  // dedup store                          │     │
   │  │      logger:        Logger,               // structured logger                    │     │
   │  │    })                                                                              │     │
   │  │                                                                                    │     │
   │  │    onDidReceiveMessage(raw: unknown): void       ◄── main entry (one per session)  │     │
   │  │      1. EnvelopeSchemas.safeParse(raw)                                              │     │
   │  │      2. switch (envelope.kind)                                                     │     │
   │  │         case 'kanban.card.request'     → orchestrator.request(envelope.payload)    │     │
   │  │         case 'kanban.approval.respond' → orchestrator.applyDecision(payload)        │     │
   │  │         case 'kanban.ready'            → this.sendInitialSnapshots()               │     │
   │  │         default                       → this.reply(err, 'kanban.error', {...})     │     │
   │  │                                                                                    │     │
   │  │    send<T>(envelope: Envelope<T>): void        ◄── host → webview                 │     │
   │  │      webview.postMessage(envelope)                                                │     │
   │  │                                                                                    │     │
   │  │    sendInitialSnapshots(): void                                                    │     │
   │  │      this.send({ kind: 'kanban.policy.snapshot', payload: this.snapshot() })       │     │
   │  │      this.send({ kind: 'kanban.fleet.snapshot',   payload: this.fleet()    })       │     │
   │  │                                                                                    │     │
   │  │    private reply<T>(inReplyTo: string, kind: T, payload): void                     │     │
   │  │      enforces correlation id; single error envelope per inbound                    │     │
   │  │                                                                                    │     │
   │  │    dispose(): void       ◄── teardown: removes listener, clears buffers             │     │
   │  └────────────────────────────────────────────────────────────────────────────────────┘     │
   │                                                                                            │
   └──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Dispatch flow (per inbound message)

```
   postMessage(raw)
        │
        ▼
   EnvelopeSchemas.safeParse(raw)
        │
        ├── parse fail  ──►  logger.warn({ id: 'parse-fail' })
        │                       send('kanban.error', { code: 'parse', recoverable: true })
        │
        └── parse ok
             │
             ▼
        switch (envelope.kind)
             │
             ├── 'kanban.card.request'      ──►  orchestrator.request(payload)
             ├── 'kanban.approval.respond'  ──►  orchestrator.applyDecision(payload)
             ├── 'kanban.ready'             ──►  sendInitialSnapshots()
             └── default                    ──►  send('kanban.error', { code: 'unknown_kind' })
```

## Outbound flow (host → webview)

```
   orchestrator.onDidTransition   ──►  this.send({ kind: 'kanban.card.move',      payload })
   policyEngine.onDidChange       ──►  this.send({ kind: 'kanban.policy.snapshot', payload })
   approval.requestNeeded(action) ──►  this.send({ kind: 'kanban.approval.request', payload })
   fleet.snapshot()               ──►  this.send({ kind: 'kanban.fleet.snapshot',  payload })
   catch (e) in any of the above  ──►  this.send({ kind: 'kanban.error',           payload })
```

## House Style (Code-level)

```
   Module structure    : §1 Types → §2 Schemas → §3 Handler (pure-first, top-down)
   Schemas             : zod, one per MessageKind, joined by z.discriminatedUnion('kind', [...])
   Envelope            : versioned (v: 1) + correlation id + host-clock timestamp
   Errors              : never throw across the bridge — always reply with Envelope<ErrorPayload>
   Single error edge   : one safeParse boundary at onDidReceiveMessage; downstream is total
   Coroutines          : handler is sync; async work lives in orchestrator / policy engine
   Tests               : one test per MessageKind in src/views/agentic-kanban-message-handler.test.ts
```

## Test coverage map

| MessageKind | Test (in `*.test.ts`) |
|---|---|
| `kanban.card.request` | `request: orchestrator receives payload` |
| `kanban.approval.respond` | `applyDecision: forwards to orchestrator` |
| `kanban.policy.snapshot` (outbound) | `send: posts to webview with envelope shape` |
| `kanban.approval.request` (outbound) | `send: includes actionId and expiresAt` |
| `kanban.error` (parse fail) | `parse-fail: emits recoverable error envelope` |
| `kanban.error` (unknown kind) | `unknown-kind: emits unknown_kind error envelope` |
| `kanban.ready` (inbound) | `ready: triggers sendInitialSnapshots` |
| `dispose()` | `tear-down: removes listener, clears buffers` |
