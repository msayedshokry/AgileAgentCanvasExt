# Agile Agent Canvas — Architecture

> **Source of truth note.** This document is reconstructed from the actual
> TypeScript source under `src/` (commit `242adbf`), not from prior prose docs.
> Where the running code disagrees with `CLAUDE.md` / `README.md`, the code wins
> and the discrepancy is called out inline (see *Where reality differs from the
> docs* at the end). Every claim below is anchored to a file and, where useful,
> a line number.

---

## 1. What this extension actually is

Agile Agent Canvas (extension id surface `agileagentcanvas`, publisher-facing
name *Agile Agent Canvas*) is a VS Code extension that turns the **BMAD**
("Business Method for AI Development") methodology into an in-IDE product‑
development surface. It is three products fused into one extension host:

1. **A structured artifact system** — epics, stories, PRDs, architectures, test
   designs, etc. are first-class typed JSON objects (`src/types/index.ts` defines
   ~60 artifact interfaces) persisted under a per-project context folder and kept
   schema-valid.
2. **A conversational AI surface** — a VS Code Copilot Chat participant
   (`@agileagentcanvas`) with ~45 slash commands that drive BMAD workflows, plus
   21 Language Model **tools** the model can call.
3. **An autonomous agentic delivery loop** — a visual Kanban canvas whose card
   drags launch real, guard-railed dev→review iterations, either inside Copilot
   Chat or in headless CLI terminals (Claude Code, Antigravity, etc.).

The extension activates on `onStartupFinished` (`package.json` →
`activationEvents`) and has a single entry point, `src/extension.ts`, compiled to
`dist/extension.js` (`package.json` → `main`).

---

## 2. Build & runtime topology

This repository compiles **two independent programs** that ship in one VSIX:

| Program | Source | Toolchain | Output | Runs in |
|---|---|---|---|---|
| Extension host | `src/**/*.ts` | esbuild (`esbuild.mjs`) + `tsc --noEmit` for type-check | `dist/extension.js` | Node (VS Code extension host) |
| Canvas webview UI | `webview-ui/src/**` (React 18 + Vite) | Vite/`tsc` | `webview-ui/build/` | Browser sandbox (webview) |

`npm run compile` = `check-types` (`tsc -p ./ --noEmit`) → `bundle`
(`node esbuild.mjs --production`) → `compile-webview` (`cd webview-ui && npm run
build`). The two halves never share a module; they communicate **only** by
`postMessage` (see §7). The webview build is a separate npm project
(`webview-ui/package.json`) depending on `react`,
`react-dom`, `three`, `3d-force-graph`, `marked`, `html2canvas`, and
`@vscode/webview-ui-toolkit`.

Runtime dependencies of the **extension host** are deliberately thin
(`package.json` → `dependencies`): `ajv` (schema validation), `yaml` /
`@iarna/toml` / `deepmerge` (config + workflow front-matter), `gpt-tokenizer`
(token estimation), `microdiff` (artifact diffing), `simple-git` (autonomous
git), `pdfkit` (exports), and `headroom-ai` (optional context compression).
Tests use **Cucumber BDD** (`features/`) with `c8` coverage; the webview uses
**Vitest**.

---

## 3. Activation & dependency wiring (`src/extension.ts`)

`activate(context)` (`src/extension.ts:94`) is the composition root. It is a long
but linear bootstrap. The order matters and encodes the dependency graph:

1. **Logging sink** wired into the `Agile Agent Canvas` output channel
   (`setLoggerOutputSink`, `extension.ts:95`).
2. **Secrets** — `JiraSecrets.init(context)` binds the Jira API token to VS Code
   `SecretStorage` *before* any Jira call (`extension.ts:100`).
3. **Shared state** — `artifactStore = new ArtifactStore(context)`
   (`extension.ts:108`). This singleton is the spine; almost everything takes it
   as a constructor arg.
4. **Skill catalogue + repo manager** — `initialiseCatalogueService` /
   `initialiseSkillRepoManager` start a watcher that pushes catalogue changes to
   open canvas panels (`extension.ts:111-130`).
5. **LM tool registration** — `sharedToolContext.store = artifactStore` then
   `registerTools(sharedToolContext)` registers all 21 LM tools **once**. Both the
   chat participant and the workflow executor *mutate* `sharedToolContext` fields
   in place rather than re-registering (`extension.ts:132-137`,
   `src/chat/agileagentcanvas-tools.ts:111`).
6. **Chat participant** — guarded behind `vscode.chat?.createChatParticipant`
   (only present when Copilot is installed) so the canvas still works without
   Copilot (`extension.ts:142-149`).
7. **Tree + webview views** — `ArtifactsTreeProvider`, `WizardStepsProvider`,
   `AgenticKanbanViewProvider`, `AgentSessionsViewProvider`
   (`extension.ts:152-177`).
8. **ACP + lane transitions + kanban** — `initializeAcpSessionManager`,
   `initializeLaneTransitionEngine`, `initializeKanbanOrchestrator` are wired with
   the shared store, executor, and terminal executor (`extension.ts:178-182`).
9. **Agent message bus** subscribes to `system.#` for observability
   (`extension.ts:187-190`).
10. **Trace recorder** initialized against `<outputFolder>` (`extension.ts:192-199`).
11. **Harness policy engine** loads user policies from
    `.agileagentcanvas-context/policies/` (`extension.ts:201-214`).
12. **40 commands** registered (`extension.ts:217-488`) — project lifecycle,
    artifact CRUD, workflow control, Jira, graphify, codeburn, migrations.
13. **Artifact change listener** re-seeds the autonomy scheduler with the fresh
    story universe on every store change (`extension.ts:491-501`).
14. **Workspace resolver** determines the active project (multi-root aware),
    auto-loads artifacts, **restores interrupted agent sessions from traces**, and
    **starts the autonomy lifecycle** (`extension.ts:504-603`).
15. **File watcher** on `<outputFolder>/**/*.{json,md,yaml,yml}` notifies the
    webview of external edits and detects whole-folder deletion
    (`extension.ts:1082-1156`).
16. **Status bars** for graphify, headroom, codeburn, and chat-provider; optional
    graphify auto-bootstrap and auto-update-on-save watchers
    (`extension.ts:682-779`).

`deactivate()` (`extension.ts:1262`) tears down the autonomy lifecycle, the
Headroom client, A2A polling, the file watcher, and the store — i.e. everything
that holds a timer or socket.

**Singleton pattern.** Many subsystems export a module-level singleton
(`agentMessageBus`, `agentRegistry`, `handoffNegotiation`, `terminalExecutor`,
`concurrencyQueue`, `harnessEngine`, `autonomyLifecycle`, `autoScheduler`,
`getWorkflowExecutor()`). `extension.ts` mostly *configures* and *starts* these
rather than constructing them, which is why the file reads as wiring rather than
allocation.

---

## 4. The layers

The codebase is organized by **feature/domain**, not by technical type. Below,
each `src/` directory is a layer; the dependency arrows generally point *down*
this list (UI → orchestration → state → types).

```
extension.ts ── composition root, command + view registration
│
├── types/         Pure TypeScript contracts for ~60 BMAD artifact types
├── state/         ArtifactStore (in-memory truth) + persistence + validation
├── canvas/        ArtifactTransformer: artifacts → canvas/webview shape
├── views/         Webview providers, tree providers, status bars, msg handlers
│   └── webview-ui/ (separate React app — the visual canvas + agentic kanban)
├── chat/          Copilot Chat participant, AI provider, personas, LM tools
├── workflow/      BMAD workflow engine + the autonomous agentic delivery stack
├── acp/           Agent Communication Protocol: bus, registry, A2A, teams
├── harness/       Policy engine (governance gates over autonomous runs)
├── trace/         Append-only execution trace recorder (crash recovery)
├── integrations/  graphify, codeburn, headroom, Jira
├── learning/ trace/ lib/ utils/  cross-cutting helpers
└── resources/_aac BMAD framework content (skills, schemas, agents, configs)
```

### 4.1 Types layer (`src/types/`)

`src/types/index.ts` (2,114 lines) is the contract surface. It declares the
artifact universe: `Vision`, `FunctionalRequirement`/`NonFunctionalRequirement`,
`Epic`, `Story` (with `StoryTask`, `StoryDependencies`, `StoryDevAgentRecord`,
`StoryHistoryEntry`), `UseCase`, `PRD`, `Architecture`, `TestCase`,
`TestStrategy`, `TestDesign`, `TestSummary`, `TraceabilityMatrix`,
`NfrAssessment`, `CiPipeline`, `Research`, `UxDesign`, `ReadinessReport`,
`SprintStatus`, `Retrospective`, `ChangeProposal`, `CodeReview`,
`DefinitionOfDone`, `SourceTree`, and more. These mirror the JSON Schemas under
`resources/_aac/schemas/{bmm,cis,tea,common}/` — the types are the compile-time
view, the schemas are the runtime-validation view, and they are kept in lockstep
(an LM tool, `agileagentcanvas_types_from_schema`, even generates one from the
other).

### 4.2 State layer (`src/state/`)

The heart of persistence. Files:

- **`artifact-store.ts`** (2,290 lines — the single largest module). `ArtifactStore`
  (`:206`) holds the entire project's artifacts in memory and is the *only*
  writer of truth. Key surface:
  - `loadFromFolder(uri)` (`:2515`) — reads the context folder into memory.
  - `updateArtifact(...)` (`:791`), `deleteArtifact(...)` (`:1711`),
    `findArtifactById(id)` (`:9166`).
  - `syncToFiles()` (`:5556`) — writes in-memory state back to disk.
  - `onDidChangeArtifacts` — an `EventEmitter` that fans out to tree views, the
    wizard, the canvas webview, and the autonomy scheduler.
  - `isSyncing()` (`:501`) — a re-entrancy guard so the file watcher can
    distinguish *self*-writes from *external* edits (this is how the system avoids
    an infinite save→watch→reload loop).
  - `migrateToReferenceArchitecture()` (`:6250`) — one-shot migration that
    extracts inline stories from `epics.json` into standalone story files plus
    refs.
- **`artifact-file-io.ts`** — low-level file read/write primitives used by the store.
- **`schema-validator.ts`** (1,000 lines) — `SchemaValidator` (`:131`) compiles the
  BMAD JSON Schemas with `ajv` and validates artifacts on load and on write.
  Load-time issues are collected and surfaced to the webview as `schemaIssues`.
- **`schema-repair-engine.ts`** (596 lines) — automated repair of malformed
  artifact JSON (backs the `agileagentcanvas_repair_json` LM tool).
- **`catalogue-service.ts`** + **`skill-repo-manager.ts`** — manage the skill/agent
  catalogue (built-in `resources/_aac/skills` plus user-configured
  `userCataloguePath` / `skillRepos`), with a file watcher that hot-reloads.
- **`workspace-resolver.ts`** (548 lines) — `WorkspaceResolver` (`:48`) owns the
  notion of the *active project* in a multi-root or multi-context workspace:
  scans folders for `.agileagentcanvas-context`, persists the choice in
  `workspaceState`, shows a picker when ambiguous, and fires
  `onDidChangeActiveProject`. This is what lets a single window juggle several
  BMAD projects.

**Store collaborators** (extracted during the architecture-hardening
sweep, Phase 4) — `ArtifactStore` delegates to four cohesive method groups
rather than carrying them inline; the **public surface is preserved**
and the moved private bodies are thin one-line delegations:

- `SprintStatusSync` — YAML sprint-status round-trip + epic/story on-disk patches.
- `ArtifactFileWriter` — per-shape `save*ToFile` writers (vision / stories / epics / product-brief / PRD / architecture / test-cases) + `deleteSourceFile` + `getOutputFormat`. Invoked by `ArtifactStore.syncToFiles()` (`:5556`), which stays on the store as the dispatch fan-out point.
- `SchemaArtifactMapper` — schema→internal mappers for Epic / Story / Requirement buckets.
- `ArtifactMigrator` — backup, prune, implementation-folder migration. **`migrateToReferenceArchitecture` and `restorePreMigrationBackup` stay as public methods on `ArtifactStore`** (called directly by `extension.ts:454,468`); `ArtifactMigrator` holds the implementation.

Type hygiene on the store post-extraction: **33 `any`** (down from ~189 pre-sweep).

**Output format.** The store can emit `markdown`, `json`, or `dual`
(`agileagentcanvas.outputFormat`). A migration in `extension.ts:1182`
(`cleanupStaleMarkdownFiles`) renames stale `.md` companions to `.md.bak` so the
LLM never treats a derived markdown view as an authoritative source — JSON is
canonical.

### 4.3 Canvas transform layer (`src/canvas/`)

`artifact-transformer.ts` (1,418 lines) is a pure projection: `buildArtifacts(store,
workspaceRoot)` (`:14`) flattens the typed in-memory artifacts into the
denormalized shape the React canvas expects (cards with `id`, `type`, `title`,
`status`, `priority`, lane, dependency edges). `sendArtifactsToPanel(panel, store)`
(`:1390`) is the push side — called on `ready` and on every `onDidChangeArtifacts`.
This layer is the **anti-corruption boundary** between the rich domain model and
the view model.

### 4.4 Views layer (`src/views/`) and the webview UI (`webview-ui/`)

Two kinds of view live here:

- **Tree views** (native VS Code): `ArtifactsTreeProvider` (the Artifacts
  explorer), `WizardStepsProvider` (Workflow Progress).
- **Webview views/panels** (React): `CanvasViewProvider`,
  `AgenticKanbanViewProvider`, `AgentSessionsViewProvider`. The main canvas opens
  as an editor **panel** (`openCanvasPanel`, `extension.ts:782`) with
  `retainContextWhenHidden` and a strict CSP; the agentic kanban and agent
  sessions render as **sidebar webview views**.

Message handling is centralized:

- **`webview-message-handler.ts`** (1,109 lines) — `handleCommonWebviewMessage`
  (`:109`) handles the shared message vocabulary (updateArtifact, deleteArtifact,
  refineWithAI, breakDown, enhanceWithAI, elicitWithMethod, startDevelopment,
  launchWorkflow, …) and `handleCatalogueWebviewMessage` (`:929`) handles
  catalogue traffic. Both the main panel and per-artifact detail tabs route
  through these, so behavior is identical across surfaces.
- **`agentic-kanban-message-handler.ts`** (775 lines) — handles the
  agentic-kanban-specific protocol (drag-to-execute, pause/resume/abandon,
  terminal jump, dependency badges).

**Status bars** are their own small modules: `graphify-status-bar.ts`,
`codeburn-status-bar.ts`, `headroom-status-bar.ts`, `chat-provider-status-bar.ts`
— each exposes `create…` and `refresh…` functions and reflects integration
availability/state.

**The React app** (`webview-ui/src`, ~68 TS/TSX files) renders three modes driven
by `window.__AC_MODE__` (`detail` vs panel) and message traffic: the **canvas**
(`components/`), the **agentic kanban** (`agentic-kanban/`, `components/kanban/`),
and a **3D corpus view** (`Corpus3DView`, lazily loading the `3d-force-graph` UMD
bundle injected via `window.__AC_3D_GRAPH_URL__`, `extension.ts:1010-1013`). It
renders artifact bodies with `marked` and exports images with `html2canvas`.

### 4.5 Chat layer (`src/chat/`)

The conversational surface and the AI plumbing.

- **`chat-participant.ts`** (5,252 lines) — `AgileAgentCanvasChatParticipant`
  (`:42`). `handleChat` (`:66`) is the VS Code chat entry point. It threads the
  active session (`setActiveChatSession`) so a Kanban drag *during* a chat session
  can reuse the live model/stream, then dispatches: if `request.command` is set it
  routes through a `handlers` map of ~45 slash commands (`:103-147`:
  `/vision`, `/requirements`, `/epics`, `/stories`, `/dev`, `/review`, `/sprint`,
  `/ux`, `/party`, `/document`, `/elicit`, `/context`, `/jira`, `/graph*`,
  `/codeburn`, `/help`, …); otherwise `handleConversation` runs a tool-enabled
  free chat. `handleConversation` also intercepts a **pending workflow launch**
  posted from the canvas's WorkflowLauncher and feeds the actual workflow file +
  schema + tools to the model (`:175-198`).
- **`ai-provider.ts`** (981 lines) — the provider abstraction.
  `ProviderType = 'auto' | 'copilot' | 'openai' | 'anthropic' | 'gemini' |
  'ollama' | 'antigravity' | 'omp'` (`:21`). `selectModel()` resolves the
  configured/available model into a `BmadModel`. `streamChatResponse(...)`
  (`:250`) is the single choke point for *all* model traffic:
  1. **Headroom compression** — `compressMessages` transparently shrinks the
     prompt before the call; silently no-ops when Headroom is absent (`:264-269`).
  2. A `switch (model.provider)` dispatches to per-provider streamers
     (`streamVsCodeLm`, `streamOpenAI`, `streamAnthropic`, `streamGemini`,
     `streamOllama`, `sendToAntigravity`, `sendToOmp`) (`:275-322`). Antigravity
     and OMP delegate to a *separate host process* and therefore report no token
     usage.
  3. **Cost tracking** — prefers API-reported token usage, falls back to a
     `gpt-tokenizer` estimate, and records to `costTracker` keyed by
     `workflow:<name>` when available, tagging entries `api` vs `estimate`
     (`:330-372`). This is what feeds the budget gauge and `cost-tracking.jsonl`.

> **Methodology Carve-out:** The `Bmad*` mentions in this subsystem and in the internal types refer to the upstream BMAD-METHOD methodology to mirror and preserve schema-faithfulness. Specifically, this covers the 6 exported identifiers: `BmadModel` (`src/chat/ai-provider.ts`), and `BmadArtifacts`, `BmadArtifact`, `BmadArtifactChange`, `BmadArtifactTypeMap`, `BmadMetadata` (all in `src/types/index.ts`). These are not skill or workflow identifiers (live skill/persona paths live under `.github/aac-*.md` per Phase 2). The same framework designation applies to the subordinate path and configuration-key namespaces (`bmadPath`, `BmadPath`, `bmadResourcePath`, and `bmad-*` config keys).

- **`agileagentcanvas-tools.ts`** (2,221 lines) — registers the 21 Language Model
  tools (`registerTools`, `:238`) the model can call mid-chat: file I/O scoped to
  the project (`agileagentcanvas_read_file`, `_write_file`, `_list_directory`,
  `_codebase_search`), artifact mutation (`_update_artifact`, `_artifact_query`,
  `_sync_story_status`, `_sync_epic_status`), graph queries (`_graph_query`,
  `_graph_path`, `_graph_community`), Jira (`_read_jira`), cost (`_codeburn_report`),
  and a JSON/YAML/schema toolbox (`_repair_json`, `_yaml_to_json`,
  `_frontmatter_extract`, `_json_diff`, `_json_merge`, `_types_from_schema`,
  `_schema_from_json`, `_workflow_resolve_vars`). `sharedToolContext` (`:111`) is
  the mutable bag of `{store, bmadPath, outputPath}` shared with the executor.
- **`agent-personas.ts`** — loads BMAD agent persona markdown (analyst, pm,
  architect, dev, ux-designer, tech-writer, tea, plus the CIS agents) from the
  skills directory and formats them into system prompts
  (`formatFullAgentForPrompt`, `formatAgentRoster`). The `/party` command uses the
  whole roster at once.
- **`ponytail-heuristics.ts`** — minimalist code-review heuristics injected into
  dev/review prompt paths (the `/ponytail-review` command and terminal-agent
  prompts).

### 4.6 Workflow engine (`src/workflow/workflow-executor.ts`)

`WorkflowExecutor` (`:1202`, accessed via the `getWorkflowExecutor()` singleton at
`:3898`) runs BMAD workflows step-by-step. Core concepts:

- **`WorkflowDefinition`** (`:44`) — `{id, name, module: 'core'|'bmm'|'bmb'|'tea'|
  'cis', path, format: 'md'|'yaml'|'xml'|'both', artifactTypes, tags}`.
- **`WORKFLOW_REGISTRY`** (`:134`) — a *fallback* static list. At runtime the
  executor builds the real registry dynamically by scanning the skills directory
  (`buildWorkflowRegistry()`), so the catalogue reflects whatever skills are
  installed, not a hardcoded set. There are **39 `workflow.md`/`workflow.yaml`
  files** under `resources/_aac` today.
- **`WorkflowSession`** (`:86`) — tracks a multi-step run across chat turns:
  current step file, step number, completed steps, parsed `nextStepPath`,
  collected `userInputs`, and `status: active|paused|completed|cancelled`. This is
  what `/continue` and `/status` operate on.
- Workflows are markdown/YAML with front-matter (parsed via `workflow/frontmatter.ts`)
  declaring steps, validation checkpoints, output schema, and prompts. The executor
  resolves template variables, calls the AI provider at each step, validates output
  against the artifact schema, and writes results through the store.

The executor exposes both an in-chat path (`executeLaneTransition`) and is the
engine the autonomous stack drives headlessly.

### 4.7 The autonomous agentic delivery stack (`src/workflow/`)

This is the system's most distinctive layer — a guard-railed control loop that
takes a story card and drives it to "done" with minimal human input. The pieces:

- **`lane-transitions.ts`** — `LaneTransitionEngine` (`:107`). `TRANSITION_RULES`
  (`:48`) declares which lane moves are legal and which workflow each move
  launches. `handleTransition(...)` (`:117`) is invoked when a card is dragged
  between Kanban lanes. It honors `yoloMode` and `kanbanSkipConfirm`
  (`:512-521`). This is the bridge from a UI drag to a real workflow.
- **`kanban-orchestrator.ts`** — `KanbanOrchestrator` (`:115`). `runAutonomous`
  (`:199`) is **the core loop**. For a story it:
  1. Acquires a **concurrency lock** so only one agent works a card
     (`concurrencyQueue.tryAcquire`, `:209`).
  2. Pre-flight checks the **circuit breaker** and **budget enforcer** and creates
     an `AbortController` so the run can be cancelled (`:217-232`).
  3. Optionally creates a git branch via `autonomousGit.maybeBranch` (`:236`).
  4. Loops up to `kanban.maxIterations` times: **DEV** step → require `COMPLETED`
     verdict → git commit → **REVIEW** step → branch on verdict:
     `APPROVED` ⇒ status `done`, optional auto-PR, return; `NEEDS_FIXES` ⇒ attach
     fix requests and loop; `BLOCKED`/unknown ⇒ stop (`:238-308`).
  5. On exception, records the failure with the circuit breaker and releases the
     lock in `finally` (`:309-322`).
  - `runStepGuarded` (`:337`) picks the execution path: **chat path** (in-Copilot,
    when `ctx.model && ctx.stream`) wraps the stream for progress and registers
    health checks; **terminal path** (headless) calls
    `terminalExecutor.executeAndAwaitVerdict`. Every attempt is wrapped in
    `autoRetryEngine.run` with re-checked circuit/budget guards (`:360-368`).
- **`terminal-executor.ts`** (896 lines) — `TerminalExecutor` (`:273`,
  singleton `terminalExecutor`). Runs a workflow as a **headless CLI agent** in a
  VS Code integrated terminal. `buildTerminalPrompt` (`:159`) assembles the agent
  prompt; `executeAndAwaitVerdict` (`:523`) launches the configured agentic CLI
  (Claude Code / Antigravity / opencode — `AGENTIC_CLI_PROVIDERS`), streams output
  to the webview (`attachWebviewStream`), parses a structured verdict, persists
  session metadata for crash recovery (`persistSessionMetadata`), records cost,
  and handles orphaned/closed terminals. `agenticKanban.terminalProvider` selects
  the CLI.
- **`autonomy-lifecycle.ts`** — `AutonomyLifecycle` (`:98`, singleton). The
  supervisor that `extension.ts` `configure()`s and `start()`s once artifacts
  load (`:117`, `:123`). It wires the goal decomposer, scheduler, dependency
  badges, harness findings persistence, and broadcasts state to the canvas. `stop()`
  (`:425`) is called from `deactivate()`.
- **Supporting guardrail/scheduling modules**:
  - `concurrency-queue.ts` (+ `-persistence`) — one-writer-per-artifact locks,
    survive reload, recoverable via the `releaseLocks` command.
  - `circuit-breaker.ts` — opens after repeated failures of a workflow type.
  - `budget-enforcer.ts` — token/cost caps per artifact and sprint
    (`harness.sprintCapacity`).
  - `auto-retry-engine.ts` + `failure-classifier.ts` — exponential backoff for
    transient failures, no retry for permanent ones.
  - `auto-scheduler.ts` / `scheduler-state-persistence.ts` /
    `scheduler-webview-controls.ts` — picks the next ready story by priority and
    drives autonomous starts; re-seeded on every store change (`extension.ts:491`).
  - `goal-decomposer.ts`, `dependency-graph.ts`, `dependency-auto-resume.ts`,
    `kanban-dep-visualizer.ts` — dependency-aware sequencing (a story blocked by
    another resumes when its blocker completes).
  - `agent-health-monitor.ts`, `terminal-health-checks.ts`, `terminal-recovery.ts`,
    `auto-recovery.ts` — liveness checks and recovery for stalled agents.
  - `autonomous-git.ts` — branch/commit/PR automation via `simple-git`.
  - `kanban-verdict.ts` — the `KanbanVerdict` contract (`COMPLETED` / `APPROVED` /
    `NEEDS_FIXES` / `BLOCKED` / `UNKNOWN`) shared across the loop.

### 4.8 ACP — Agent Communication Protocol (`src/acp/`)

The substrate for multiple agents to coordinate, including across processes (A2A,
"agent-to-agent").

- **`agent-bus/message-bus.ts`** — `AgentMessageBus` (`:49`, singleton
  `agentMessageBus`): topic-based pub/sub with wildcard matching (`system.#`),
  `publish`/`send`/`subscribe`, and bounded history (`getHistory`). The nervous
  system for intra-extension agent events.
- **`agent-bus/agent-registry.ts`** — `AgentRegistry`: who is online, their status,
  and capabilities (advertised as A2A "agent cards").
- **`agent-bus/handoff-negotiation.ts`** — `handoffNegotiation`: negotiates passing
  a task from one agent to another (with timeouts/cleanup).
- **`agent-bus/a2a-agent-card.ts`, `a2a-outbound-client.ts`, `a2a-session-bridge.ts`**
  — implement the A2A wire format: advertise an agent card, call out to remote
  agents, and bridge a remote A2A session into a local lane transition. The lane
  engine polls A2A sessions and `deactivate()` cancels that polling
  (`extension.ts:1271`).
- **`session-manager.ts`** — `initializeAcpSessionManager(executor)`: ACP session
  lifecycle bound to the workflow executor.
- **`team-orchestrator.ts`** (1,024 lines) + **`team-orchestrator/team-registry.ts`**
  — `AgentTeamOrchestrator` (`:742`). `executeTeam(...)` (`:815`) registers a
  *team* of personas on the bus, builds per-role tasks (`buildRoleTask`, `:1005`),
  runs them, and deregisters. Gated by `agentTeam.enabled`. This backs the
  multi-agent `/party`-style collaboration at a structural level.

### 4.9 Harness — governance (`src/harness/policy-engine.ts`)

`HarnessEngine extends EventEmitter` (`:77`, singleton `harnessEngine`, `:483`) is
a policy gate over autonomous execution. `HarnessPolicy` (`:34`) objects are
evaluated by `evaluate(...)` (`:84`) and `evaluateContinuous(...)` (`:448`)
against an `EvaluationContext`, producing an `EvaluationResult` and emitting
`HarnessFindingsEvent`s. Built-in policies auto-register at module load; user
policies are loaded from `.agileagentcanvas-context/policies/` at activation
(`extension.ts:204`). Toggled by `harness.enabled`. This is the "is this run
allowed to proceed / continue" governance layer that sits alongside the circuit
breaker and budget enforcer.

### 4.10 Trace recorder (`src/trace/trace-recorder.ts`)

`TraceRecorder implements vscode.Disposable` (`:58`, singletons via
`initializeTraceRecorder`/`getTraceRecorder`, `:431`/`:439`). An append-only,
buffered, auto-flushing log of execution decisions per session, written under the
output folder. Bounded (`MAX_ENTRIES_PER_SESSION = 2000`,
`MAX_TOTAL_BUFFERED = 10000`) with a 30-minute cleanup timer and
`trace.retentionDays`. Critically, `scanInterruptedSessions()` (`:341`) is what
lets activation **restore agent state after a crash/reload**: `extension.ts`'s
`restoreInterruptedSessions` (`:1211`) reads it, re-acquires concurrency locks,
and repaints the Kanban with `interrupted` agents so the user can resume or
abandon. Toggled by `trace.enabled`.

### 4.11 Integrations (`src/integrations/`)

Each integration is *optional* and *detected*, degrading silently when its
external tool is absent.

- **graphify** (`graphify/`) — semantic knowledge graph of the codebase. `index.ts`
  re-exports a detector, a CLI runner (`graphify-runner.ts`), bootstrap, a graph
  loader, and a query API (`graph-query.ts`, backing `/graph-query` and the
  `_graph_query`/`_graph_path`/`_graph_community` LM tools). It reads
  `graphify-out/graph.json` + `GRAPH_REPORT.md`. Commands: bootstrap, update,
  rebuild, openReport, installHook, index (now `cluster-only`). Optional
  auto-bootstrap and auto-update-on-save watchers live in `extension.ts:708-779`.
  `graphify.pythonPath` / `graphify.backend` configure the CLI.
- **codeburn** (`codeburn/`) — AI coding cost/token telemetry across providers
  (Claude, Copilot, Antigravity, opencode). Detector + runner + commands +
  dashboard, surfaced via the `/codeburn`, `/cost`, `/tokens` chat commands and a
  status bar. `codeburn.enabled` / `codeburn.path`.
- **headroom** (`headroom/`) — transparent LLM **context compression** via the
  `headroom-ai` package and a local proxy. `headroom-compressor.ts` auto-detects
  the proxy on activation and `compressMessages` is called inside
  `streamChatResponse` (§4.5). Silent no-op when absent — the import is even kept
  lazy so a missing dependency never breaks load. `headroom.enabled` /
  `headroom.compressionLevel`.
- **Jira** (`jira-client.ts`, `jira-importer.ts`, `jira-secrets.ts`) — `JiraClient`
  (`:100`) talks to Jira Cloud REST; `jira-importer.ts` maps Jira epics/stories
  into BMAD artifacts and back (`mergeJiraIntoArtifacts`); `JiraSecrets` stores
  the API token in OS keychain via `SecretStorage`. Backs the `/jira` command,
  the `_read_jira` tool, and the `fetchFromJira` command.

### 4.12 BMAD framework content (`resources/_aac/`)

Not code — the *content* the engine executes. Structure:

- `skills/` — ~92 skill folders, all under the unified **`aac-*` family**
  (was ~140 = 48 `bmad-*` + 92 `aac-*` pre-Phase-2; the `bmad-*` skill /
  persona identifier prefix was migrated during the architecture-hardening
  sweep;  methodology terminology stays per the plan's carve-out). The single `bmad-`
  token intentionally retained is the upstream npm bundle name in
  `webview-ui/package.json#name` (renaming it would break the `webview-ui/`
  consumer chain; it is npm metadata, not a skill or persona identifier).
  Each skill
  contains `workflow.md`/`workflow.yaml` (the steps), `steps/`, `agents/`
  (sub-agent persona markdown), and knowledge. The workflow registry is built
  by scanning these. Verify zero `bmad-*` folders with
  `ls resources/_aac/skills/ | grep -c '^bmad-'` → 0.
- `schemas/{bmm,cis,tea,common}/` — ~40 JSON Schemas that `SchemaValidator`
  enforces (e.g. `bmm/story.schema.json`, `bmm/epics.schema.json`,
  `bmm/architecture.schema.json`, `tea/test-cases.schema.json`).
- `tea/`, `bmb/`, `cis/`, `_config/`, `_memory/`, `graphify/` — module assets,
  agent definitions, and default configuration.

---

## 5. Key end-to-end data flows

### 5.1 Chat command → artifact (e.g. `/epics`)

```
User: @agileagentcanvas /epics ...
 → chat-participant.handleChat (:66) → handleCommand (:96) → handleEpicsCommand
 → ai-provider.selectModel + streamChatResponse (:250)
     → Headroom compress → provider switch → stream tokens to ChatResponseStream
     → costTracker.record
 → JSON parsed (lib/json-extract) → SchemaValidator validates
 → ArtifactStore.updateArtifact → onDidChangeArtifacts fires
 → ArtifactsTreeProvider / WizardStepsProvider refresh
 → sendArtifactsToPanel pushes new canvas view-model to webview
 → ArtifactStore.syncToFiles writes <outputFolder>/epics.json
```

### 5.2 Canvas Kanban drag → autonomous dev loop

```
Webview drag (lane A→B)
 → postMessage → agentic-kanban-message-handler
 → LaneTransitionEngine.handleTransition (:117)  [checks TRANSITION_RULES, yolo/skip-confirm]
 → KanbanOrchestrator.runAutonomous (:199)
     acquire lock → circuit/budget pre-flight → autonomousGit.maybeBranch
     loop:
       DEV  step  (runStepGuarded → chat path OR terminalExecutor.executeAndAwaitVerdict)
            → COMPLETED? → git commit
       REVIEW step
            → APPROVED   → status=done → maybePR → exit
            → NEEDS_FIXES→ attach fixes → loop
            → BLOCKED    → stop
 → TraceRecorder logs each decision; AgenticKanban webview shows live agent state
```

If the host is reloaded mid-run, `TraceRecorder.scanInterruptedSessions` +
`restoreInterruptedSessions` (`extension.ts:1211`) re-paint the interrupted agents
and re-lock their artifacts on next activation.

### 5.3 Persistence & the self-write guard

```
ArtifactStore.syncToFiles  → writes JSON  → FileSystemWatcher fires
 → extension.ts notifyExternalChange checks store.isSyncing()
     isSyncing? → suppress (it was us)
     else       → postMessage externalArtifactsChanged → webview shows "reload" badge
```

### 5.4 Multi-project switching

`WorkspaceResolver.onDidChangeActiveProject` (`extension.ts:606`) → store
`clearProject()` then `loadFromFolder(newProject)`, re-point the file watcher
(`resetFileWatcher`), update `hasProject` context key (controls Kanban view
visibility), and tell the webview the detected-project count.

---

## 6. Cross-cutting concerns

- **Configuration** — 40 `agileagentcanvas.*` settings (`package.json` →
  `contributes.configuration`) covering provider/model/keys, output folder/format,
  Jira, graphify, codeburn, headroom, agentic kanban (terminal provider, WIP
  limits, max iterations, auto-advance), trace, harness (sprint capacity),
  `yoloMode`, and catalogue paths. Changes are observed live via
  `onDidChangeConfiguration` (catalogue watcher restart, codeburn cache
  invalidation, status-bar refreshes — `extension.ts:116`, `:666`).
- **Logging** — `utils/logger.ts` `createLogger(scope)`; output sinks into the
  `Agile Agent Canvas` channel; level via `logLevel`.
- **Secrets** — only Jira token, in OS keychain (`SecretStorage`), never in
  settings JSON despite a legacy `jira.apiToken` config key existing.
- **Security posture** — webviews use a strict `default-src 'none'` CSP with
  `cspSource`-scoped script/style (`extension.ts:1015`, `:1060`); the canvas only
  loads from `webview-ui/build`; graphify's HTML report is opened in the external
  browser precisely because it needs `fetch()` of local files a webview can't serve
  (`extension.ts:376-380`).
- **Resilience** — concurrency locks, circuit breaker, budget caps, retry engine,
  health monitors, trace-based crash recovery, and orphaned-terminal detection all
  compose so an autonomous run fails safe rather than runs away.
- **Graceful degradation** — Copilot chat, graphify, codeburn, headroom, and Jira
  are each optional; the extension activates and the canvas works without any of
  them.

---

## 7. Extension ⇄ Webview contract

There is no shared code across the boundary — only messages. Extension → webview
examples: `revealArtifact`, `elicitationMethods`, `bmmWorkflows`, `outputFormat`,
`schemaIssues`, `externalArtifactsChanged`, `detectedProjectCount`,
`catalogueChanged`, `showGraphifyModal`, `openAskModal`, plus the artifact payload
from `sendArtifactsToPanel`. Webview → extension examples: `ready`, `addArtifact`,
`selectArtifact`, `reloadArtifacts`, `loadSampleProject`, `openDetailTab`,
`switchProject`, plus the common/catalogue/kanban vocabularies routed through the
three handlers. The panel HTML is generated in `getCanvasWebviewContent`
(`extension.ts:1047`) and per-artifact detail tabs in `getDetailTabHtml` (`:1001`).

---

## 8. Testing & quality

- **BDD** — `npm test` runs Cucumber against `features/*.feature` with step
  definitions in `features/step_definitions/`. Coverage via `c8`
  (`test:coverage:gate` enforces thresholds in `check-coverage-thresholds.js`).
- **Webview** — Vitest (`webview-ui` `npm test`).
- **Lint** — ESLint over `src` and `features` with custom rules in `eslint-rules/`.
- **Type-check** — `tsc --noEmit` is part of `compile`, so a type error fails the
  build independently of the esbuild bundle.

---

## 9. Mental model (one paragraph)

`ArtifactStore` is the single in-memory source of truth, projected to disk as
schema-validated JSON and to the React canvas as a denormalized view-model. The
**chat participant** and the **workflow executor** mutate that store through the
**AI provider**, which is the one place every model call is compressed, dispatched
to one of seven backends, and cost-accounted. The **autonomous stack** turns a
Kanban drag into a guard-railed dev→review loop — locked, budgeted, circuit-broken,
retried, health-checked, traced, and git-automated — that runs either inside
Copilot or in a headless CLI terminal. The **ACP layer** lets several such agents
coordinate, even across processes (A2A). Everything optional (graphify, codeburn,
headroom, Jira, Copilot itself) is detected and degrades to a silent no-op. The
BMAD *content* (skills + schemas under `resources/_aac/`) is data the engine
executes, not code — which is why new workflows appear by adding skill folders, not
by editing TypeScript.

---

## 10. Where reality differs from the docs

> **Purpose.** Each item below is a *checkable reality check*: a precise claim
> about how the running code or on-disk layout diverges from `CLAUDE.md` /
> `README.md`, anchored to a specific source (a setting, a code path, or a
> directory tree) so a maintainer can verify or rewrite it. New items must point
> at a specific source — no unsourced claim. Stale items must be deleted, not
> softened.

1. **"4-lane workflow."** `CLAUDE.md` describes a fixed 4-lane canvas. The code's
   lane logic is rule-driven (`TRANSITION_RULES` in `lane-transitions.ts:48`)
   and the Kanban supports configurable WIP limits and auto-advance
   (`kanban.wipLimits`, `kanban.autoAdvance`, `kanban.maxIterations`); lanes are
   a convention of those rules, not a hardcoded four. Verify with
   `grep -nE 'TRANSITION_RULES' src/workflow/lane-transitions.ts`.
2. **Provider list is broader than documented.** `CLAUDE.md` lists `auto, copilot,
   openai, anthropic, gemini, ollama, antigravity`. The code's `ProviderType` also
   includes **`omp`** (`ai-provider.ts:21`). Verify with
   `grep -nE "ProviderType\s*=" src/chat/ai-provider.ts`.
3. **There is a large agentic/autonomy subsystem not mentioned in the overview.**
   `acp/`, `harness/`, `trace/`, and the **core** autonomy modules of
   `workflow/` — kanban-orchestrator, lane-transitions, auto-scheduler,
   terminal-executor, circuit-breaker, budget-enforcer, autonomous-git —
   implement an autonomous multi-agent delivery loop that the high-level docs
   don't describe. It is arguably the project's center of gravity. Verify with
   `ls -1 src | grep -E '^(acp|harness|trace)$'` and
   `ls src/workflow/ | grep -cE '^(kanban-orchestrator|lane-transitions|auto-scheduler|terminal-executor|circuit-breaker|budget-enforcer|autonomous-git)\.ts$'`.
4. **graphify `index` command** was renamed upstream — the code maps the old
   `index` command to `cluster-only` (`extension.ts:402`). Verify with
   `grep -n 'cluster-only' src/extension.ts`.
