# Changelog

## Unreleased

### Fixed: 4 Critical Kanban Agentic OS Issues (#30–#33)

Four critical issues from the Kanban Agentic OS deep audit have been fixed to make the autonomous loop robust for both chat (in-Copilot) and terminal (headless CLI) execution paths.

#### Issue #30 — `runStepGuarded` now dispatches to the correct execution path

`runStepGuarded` previously always called `executeLaneTransition` (the in-chat streaming API), even when running autonomously without a chat session. This meant terminal-based autonomous runs would try to stream to a non-existent chat session and never produce structured verdicts.

- **Dual-path dispatch** — `runStepGuarded` checks `ctx.model && ctx.stream`. When both are present, it uses the chat path (`executeLaneTransition`). When absent (headless autonomous mode), it uses the terminal path (`terminalExecutor.executeAndAwaitVerdict`), which polls the verdict file on disk.
- **`KanbanOrchestrator` constructor** now accepts a `TerminalExecutor` (3rd parameter). `initializeKanbanOrchestrator` in extension.ts passes the singleton `terminalExecutor`.
- **Chat health checks** — When executing via the chat path, health checks are registered for the session duration so the health monitor can detect stalled LLM responses.

#### Issue #31 — Circuit breaker and budget errors: never retried, early exit

Circuit breaker open and budget exceeded errors were thrown inside the retry work function, classified as `'unknown'` (since no matching pattern existed), and skipped by the retry engine. This wasted backoff delays on conditions that won't self-resolve.

- **Permanent patterns added** — `failure-classifier.ts` now matches `circuit breaker open` and `budget exceeded` as permanent failures.
- **Early exit before retry loop** — `runStepGuarded` checks circuit breaker and budget BEFORE entering `autoRetryEngine.run()`. If either guard fails, it returns `BLOCKED` immediately — no retry delay wasted.
- **Safety re-checks retained** — The same guards inside the retry work function remain for safety during backoff delays.

#### Issue #32 — In-chat agent sessions now have health monitoring

Health monitoring only covered terminal-based agents (`terminal-executor.ts` registers 3 checks per terminal). In-chat (Copilot) agent sessions had zero monitoring — a stalled LLM would hang the autonomous loop indefinitely.

- **`createChatHealthChecks()`** — New function in `terminal-health-checks.ts` returns output-progress and artifact-change checks for in-Copilot sessions. Checks measure elapsed time since session start and transition through healthy → degraded → dead.
- **Registration in chat path** — When `runStepGuarded` takes the chat path, health checks are registered before the LLM call and deregistered in `finally`. The health monitor's 30s poll interval detects stalled sessions.

#### Issue #33 — Terminal reconnection actually finds the terminal

The terminal reconnector was a permanent no-op (`async () => true`), meaning every orphaned terminal session was "reconnected" but the stream was never re-attached — ghost agents in the UI.

- **Real terminal matching** — `setReconnector` now scans `vscode.window.terminals` for a terminal whose name matches the orphaned session (`"AAC: {workflowId} {artifactId}"`). Confirms the process is alive via `terminal.processId`.
- **Health checks registered** — On successful reconnection, terminal health checks are registered with `agentHealthMonitor` so the monitoring loop picks them up.
- **Graceful fallback** — If no matching terminal is found or the process is dead, returns `false` so the recovery flow marks the session as interrupted.

### Feature: Cross-Artifact Systemic Issue Detection (#4)

The harness engine now feeds policy evaluation failures into a cross-artifact pattern detector that surfaces systemic issues as a color-coded, dismissable banner in the Agentic Kanban webview.

- **HarnessEngine EventEmitter** — emits `findings` after each failed policy evaluation; AutonomyLifecycle subscribes, accumulates (capped at 200), feeds into `CrossArtifactHarnessDetector.correlate()`, and broadcasts `systemicIssue` to the webview when the same policy fails on >=3 artifacts
- **Deduplication** — fingerprint-based dedup prevents re-broadcasting the same set of patterns on every subsequent harness evaluation
- **Webview banner** — new `SystemicIssue`/`SystemicPattern` types in AutonomyBar, color-coded by max severity (blue->yellow->orange->red+pulse), expandable pattern details (policy, artifact count, sample message), dismiss (X) button, accessible (role=alert, aria-expanded)
- **6 previously-unwired modules now wired** — auto-retry-engine (#18), autonomous-git (#17), failure-classifier (#14), cost-tracker (#5), concurrency-queue-persistence (#6), cross-artifact-detector (#4)
- **BDD coverage** — 4 new scenarios across extension.feature and autonomy-webview.feature: autonomy module wiring verification, harness findings -> systemicIssue broadcast, dedup suppression, and banner render + dismiss

### Fixed: Regression test for the canvas auto-refresh wiring

A silent break in the artifact-store change listener registered during extension activation (the one that rebuilds the canvas view from the store on every mutation) would have been invisible to the existing test suite — no scenario exercised that listener. Two new BDD scenarios now prove the listener stays alive, fires for both update and delete write paths, and forwards the same store instance the extension registered the listener on.

- **Update path** — Mutating an artifact on the live store fires the listener and calls the canvas rebuild pipeline exactly once with the correct store instance.
- **Sequence of different write paths** — A single scenario chains an update followed by a delete, asserting the listener fires for both write shapes (not just for repeated identical mutations).
- **No user-visible change** — Pure test-infrastructure hardening. All 803 extension scenarios still pass; the new tests are additive.

### Fixed: Vision type boundary — structural cast removed

A structural cast workaround was hiding a type-modeling gap: the BMAD `Vision` interface didn't expose `id`, `title`, or `status` at the top level, so every consumer that needed the shape the Canvas already uses to render the artifact had to bridge through a local view type and an `as` cast. Adding those fields to `Vision` itself removed the indirection and the cast, and closes the door on the same pattern reappearing on other artifact types.

- **Vision now matches every other artifact's shape** — `Vision` exposes the same `id`, `title`, `status` triple every other BMAD artifact already provides top-level. Old documents continue to load unchanged (the new fields are optional, so legacy entries render the same empty-state placeholder as before). Queries read the typed Vision shape directly; the local view-type alias and structural cast are gone.
- **Zero `as any` casts in production source** — A final cast audit across the source tree (test files and mock fixtures excluded) returned no hits.

### Fixed: Lane-transition test aligned with dev-story confirm-modal drop

A previous change dropped the dev-story confirm modal — drag-to-in-progress launches the dev-story workflow directly, with no Run/Skip prompt — but the lane-transitions Cucumber scenario still expected the old `confirmWithUser: true`. CI was failing on the stale expectation until the test was aligned with production, and a guard scenario was added so future contributors can't accidentally re-enable the modal.

- **Test now matches production** — The `Story ready-for-dev → in-progress` scenario asserts `confirmWithUser: false`, matching the direct-launch behavior the rest of the app already relies on.
- **Regression guard added** — A new scenario locks the contract: every rule with workflow `dev-story` must skip the user-confirm prompt AND explicitly set the confirm attribute to `false`. Catches attempts to re-enable the modal (flipping the flag, dropping it to `undefined`, or introducing a duplicate rule under the same workflow id).
- **No user-visible behavior change** — Test-infrastructure hardening only. All 810 lane-transitions scenarios pass; typecheck clean.

### Feature: Ponytail minimalist heuristics in every AI prompt

A minimalist engineering hierarchy — necessity first, then standard library, then native platform, then existing dependencies, then one-liner simplicity, and only then implementation — is now baked into every system prompt sent to the AI.

- Chat conversation: every reply defaults to asking whether the work is necessary before writing code. The default persona and the workflow-continue preamble both carry the heuristic block.
- Workflow execution: every slash command (44+ BMAD workflows) inherits the same discipline via direct injection into both the Copilot and direct-API code paths.
- Multi-agent handoffs: coordinator → crafter → gate agent chains across all 44 registered teams now carry the same YAGNI-anchored prompt contract.
- Explicit NOT-lazy-about exceptions (input validation, error handling, security, accessibility, calibration, and explicit user requests) remain non-negotiable.
- A comment convention marks intentional simplifications with a known ceiling and the upgrade path so future readers know when a shortcut is intentional.
- New unit tests verify the constant exports correctly.

### Feature: /ponytail-review audit command

A new slash command audits an existing artifact or codebase for reinvented stdlib, unneeded dependencies, speculative abstractions, complexity bloat, and unnecessary boilerplate. Each finding carries a severity and a concrete simpler alternative, and the full review is persisted as a code-review artifact.

- Optional artifact target: `/ponytail-review EPIC-3` audits a single artifact by ID; bare `/ponytail-review` audits the entire project (epics + stories) for over-reach.
- Residual instructions after the artifact ID are forwarded as user instructions rather than silently dropped.
- Routes through the same adversarial review workflow as `/review-code`.


### Feature: Ponytail extends to terminal, antigravity, and goal-decomposer

The hierarchy now extends to three more prompt paths.

- **Terminal agents** — full hierarchy + "apply before adding code" callout alongside the verdict contract; skill + artifact fallbacks also receive it.
- **Antigravity orchestrator** — A mode-not-interactive guard inside buildGuideContent injects autonomous + default; interactive untouched.
- **Goal decomposer** — 12-token carve-out ("If the goal fits in a single story, return one") preserves the narrow JSON-shape prompt.
- **Regression guards** — 36 vitest assertions lock both.

### Feature: Headroom — dry-run simulation, retrieval, and inter-agent observability

### Feature: Headroom status bar — always visible with descriptive state text

### Feature: Headroom — in-process proxy (zero-effort setup, auto-manages port 8787)

The extension now owns the Headroom proxy lifecycle so users never need to run `npx headroom-ai proxy` manually. The proxy speaks the wire-protocol subset the headroom-ai SDK actually consumes (health, compress, retrieve, telemetry).

- **In-process Node http server** — Listens on `127.0.0.1:8787` (the SDK’s default baseUrl) on activate. Wire-protocol endpoints: GET /health, GET /v1/health, GET /v1/telemetry, GET /v1/retrieve/stats, POST /v1/compress, POST /v1/retrieve. Auto-disposed on extension deactivate (with closeAllConnections drain so in-flight SDK calls don’t crash during shutdown).
- **EADDRINUSE coexists with the real engine** — If port 8787 is already taken (a separate headroom-ai proxy process is running), the extension steps aside and uses the external proxy. Status bar surfaces this distinctly so users know which one is answering.
- **Naïve MVP compression** — /v1/compress returns snake_case wire-format responses and applies dedupe (adjacent identical messages) + content truncation (capped at 4000 chars) + rough token estimation (len/4). Real engine-quality compression still requires the standalone engine.
- **Malformed-body safety** — Bad JSON in POST bodies returns 400 { error: { type: invalid_request } } instead of a generic 500, so the SDK can disambiguate client input errors from server faults.
- **notifyHeadroomProxyStarting() now real** — Sets the proxy state to starting and refreshes the status bar. The bar subscribes to every proxy-state transition so refreshes are event-driven, never polling.
- **New $(rocket) Headroom: starting… state** — Shown while the proxy boots (under a second in practice), suppresses the previous 'proxy offline' flicker on cold start.
- **Revised offline copy** — Differentiates fallback (external proxy already running on 8787), failed (other listen error — check the output channel), and idle (extension will auto-spawn on activation). No more 'run npx headroom-ai proxy' advice — the extension owns this.
- **New LM-tool contracts untouched** — Existing agileagentcanvas_headroom_simulate and agileagentcanvas_headroom_retrieve LM tools keep working; the proxy’s wire-protocol endpoints back them transparently.

11 new vitest assertions across in-process-proxy.test.ts (lifecycle, endpoints, listen-error handling, managed-stats snapshot immutability) + 4 new status-bar describe blocks (starting, fallback, failed, subscription-driven refresh).

The status bar is now permanently visible so users always know Headroomʹs state, even before the proxy is ready. Each state has distinct text, tooltip, and click action.

- **Disabled** —  Headroom: disabled with tooltip pointing at Headroom settings; click opens workbench.action.openSettings filtered to agileagentcanvas.headroom.
- **SDK missing** —  Headroom with tooltip explaining the bundled headroom-ai package wasnʹt detected.
- **Proxy offline** —  Headroom: proxy offline with tooltip pointing at the proxy start command and port (Phase 2 will auto-spawn the in-process proxy — currently a manual step).
- **Proxy running, no calls** —  Headroom with tooltip noting "No compression calls yet — savings appear after the first LLM call."
- **Active with stats** —  XX% with detailed tooltip including tokens saved (locale-formatted), compression ratio, call count, and full SharedContext (A2A handoff) + CCR store metrics when available.
- **Refresh contract** — refreshHeadroomStatusBar() immediately re-renders; periodic re-check every 60s for state changes.

Budget-aware compression: agents can preview savings before committing, retrieve compressed content by hash, and see handoff compression statistics on the status bar.

- **Headroom Simulate** — New LM tool that estimates token savings, transforms, and waste signals for a message set without performing the real compression. Useful for cost forecasting before long sessions.
- **Headroom Retrieve** — New LM tool that resolves a content hash from a previous compression back into the original text, avoiding redundant re-compression when the AI re-asks about cached content.
- **A2A handoff compression** — When one agent hands off work to another via the agent bus, intermediate artifacts are compressed through SharedContext before transmission. Receiving agents decompress on demand, dropping per-handoff token overhead substantially (savings scale with the configured compression tier).
- **Status bar observability** — The Headroom status bar tooltip now surfaces inter-agent SharedContext stats (compressed entries, tokens saved, savings %) alongside the CCR store metrics (entries, retrieval rate). Sections appear silently only when the corresponding data is available, so the bar stays quiet when nothing is happening.
### Feature: Headroom — click-to-hover quick-pick on the active bar

Click the active Headroom bar (`$(rocket) XX%` or the `$(rocket) Headroom` zero-calls label) to surface a transient QuickPick with SharedContext, CCR store, and Recent Compress Calls drilldowns. Settings stays reachable from the quick-pick’s terminal row.

- **Active-bar click routed to `agileagentcanvas.headroom.showDetails`** — `headroom-status-bar.ts` switches `_item.command` to the new command for the two active states (`running + zero calls`, `running with stats`). All four non-active branches (disabled / starting / offline fallback / offline failed) keep their existing `workbench.action.openSettings` action so the lifecycle-aware help text remains the obvious next step on first launch.
- **HEADROOM_SHOW_DETAILS_COMMAND constant** — exported from `headroom-status-bar.ts` as a module-level const so the test file can pin both ends (status-bar `command` + registered command id) without a typo regression.
- **Top-level QuickPick layout** — `headroom-quick-pick.ts` builds 5 stable rows: Compressor summary (`$(rocket) Headroom Compression — XX% saved`) → SharedContext (A2A handoffs; switches id from `sharedContextHeader` to the real `sharedContext` based on `entries > 0`) → CCR store (`$(database) CCR store`) → Recent compress calls (`$(history) Recent compress calls`) → Open Headroom settings (`$(settings-gear) Open Headroom settings`). Wrapped in a `vscode.window.showQuickPick` titled `Headroom Compression`.
- **SharedContext drilldown** — Read-only summary when entries > 0; falls back to an information message (`SharedContext has no entries yet…`) otherwise.
- **CCR store drilldown** — Fetches `getCCRStats()` and renders key/value rows; falls back to the info-message surface (`CCR store stats unavailable…`) on SDK rejection so a stale or older headroom-ai doesn’t crash the click flow.
- **Recent Compress Calls drilldown** — Renders the ring buffer (capped at 20 entries, newest first) with per-call breakdown (`$(compress) ago · % saved · tokens saved`, message-count delta, transforms applied, compression ratio). Selecting a row opens the full `RecentCompressCall` JSON in a Beside-column virtual text document with a 5 s status-bar message summarizing the selection. Drilldown errors are caught and logged through the `headroom-quick-pick` logger (reaches the Agile Agent Canvas output channel, not dev-tools only).
- **`RecentCompressCall` ring buffer** — `in-process-proxy.ts` exposes `getRecentCalls()` returning a `ReadonlyArray<Readonly<RecentCompressCall>>` snapshot (defensive `.slice()` copy), FIFO-evicted at `RECENT_CALL_CAP = 20`. `_pushRecentCallForTest(entry)` test-only accessor sidesteps Node’s TIME_WAIT port-release race so cap-and-shape invariants can be asserted without binding port 8787.
- **`agileagentcanvas.headroom.showDetails` command registered** — `extension.ts` registers the command via `vscode.commands.registerCommand` and pushes the disposable to `context.subscriptions` for clean teardown.

21 new vitest assertions across three test files: `src/views/headroom-quick-pick.test.ts` (NEW, 11 tests: top-level layout, drilldown routing per id, SharedContext header-variant switching, CCR live-stats picker + error fallback, Recent-calls empty-state info-message path, cancel-on-top); 6 new `src/views/headroom-status-bar.test.ts` describe blocks (active-bar click routing per non-active branch + show-details command constant pinning); 4 new `src/integrations/headroom/in-process-proxy.test.ts` ring-buffer describe blocks (empty default, snapshot immutability, cap=20 invariant with oldest/newest survivor locked, entry shape).

### Feature: Headroom — real BPE token counts via gpt-tokenizer (Phase 3.1)

The in-process proxy's token-estimator no longer uses the uniform `ceil(content.length / 4)` heuristic — it now uses `countTokens(text)` from `gpt-tokenizer` (cl100k_base BPE, the same encoding family GPT-4 uses) for string content, and `countTokens(part.text)` per text-part for multi-part OpenAI content. Non-text parts (image_url, etc.) contribute 0 because the bar's "saved tokens" metric is a textual estimate by design — image bytes aren't billable as text.

- **Wire format unchanged** — `tokens_before` / `tokens_after` / `tokens_saved` keys continue to round-trip the existing `deepCamelCase` pass through the headroom-ai SDK. No breaking change for `/v1/compress` callers.
- **Bar percentages now correct** — code-heavy prompts were over-counted by the heuristic (ASCII operators/punctuation split aggressively under BPE, ~2.5 chars per token for JS/CSS) and CJK Han characters were under-counted (each is typically 1 token, not 0.25). The mismatch could skew the status-bar savings percentage by several points for these prompt shapes. BPE aligns to whatever the downstream SDK actually bills.
- **Only the heuristic changed** — adjacent-message dedupe (step 1), 4000-char content cap (step 2), and the snake_case wire response are all unchanged. Phase 3.2 (tool-result summarization) and 3.3 (CCR cross-call dedup) are the next incremental slices, each independently shippable.
- **New vitest assertion** — single test in `src/integrations/headroom/in-process-proxy.test.ts` (`endpoint surface` describe block) locks the count to whatever `gpt-tokenizer.countTokens(fixture)` returns at test-time AND asserts it is NOT the legacy `ceil(fixture.length / 4)` heuristic value. Fixture: `'hello world test message'` (23 chars; BPE encodes 4 tokens while heuristic returns 6; the 4 ≠ 6 delta is what makes the regression guard meaningful).
- **Bundle compat** — `git-tokenizer` v3.4.0 is dual-published ESM+CJS. esbuild for `platform: 'node'` CJS output bundles the CJS build cleanly. `npm run bundle` verified end-to-end.
- **Comment / helper cleanups** — `TOKEN_CHARS_PER_TOKEN` constant removed (dead after the swap); `_estimateMessageTokens` now carries a JSDoc explaining the rationale for the swap and the multi-part/empty-string edge cases; the file-header algorithm section back-references `docs/phase-3-compression-design.md` for the rest of the rollout plan.

Existing 803-extension Cucumber scenarios, 119 vitest assertions, and the 19-test in-process-proxy suite continue to pass.

### Feature: Headroom — tool-result summarisation with re-stringify + parse-verify guard (Phase 3.2)

The in-process proxy now actively summarises role:'tool' / role:'function' JSON content before tokenising, recovering meaningful savings on the longest messages (tool outputs dominate LM prompt bytes for code-heavy sessions).

- **Role detection** — A new `_isToolish(msg)` helper returns true for `role:'tool'`, `role:'function'`, or `role:'user'` whose content is a multi-part array containing any part with `type` starting with `'tool_result'`. Strict role-based detection (rather than `type`-only) avoids accidentally compressing arbitrary model prose.
- **`_summariseToolResult(content)` — three branches**:
  - **Array root** — strict `JSON.parse` succeeds and the root is an array: keep first 2 + last 1 items, splice in a `"...[${N - 3} items truncated]..."` placeholder string between them.
  - **Object root** — strict `JSON.parse` succeeds and the root is an object: walk top-level keys, truncate any string value > 500 chars to a 500-char prefix + `…[truncated N chars]…` suffix marker. Per the design the walk is top-level only — deep recursion is not in scope for engine-grade compression delivered by an upstream binary.
  - **Non-JSON / scalar** — leave the original untouched (LM-bound prose must not be broken).
- **Re-stringify + parse-verify guard** — after every successful summarise, the helper calls `JSON.parse(reStringified)` to confirm the round-trip is valid. If it throws (NaN/Infinity, unicode surrogates, or any other strict-JSON incompatibility), the helper returns `null` and the caller leaves the original content unchanged. Failure mode is "uncompressed original", strictly safer than a malformed payload reaching the LM.
- **Multi-part `role:'user'` content** — the integration in `_naiveCompress` walks every part of an array content; for any `{type:'tool_result', ...}` part whose inner `content` is a summarisable string, the inner string is summarised independently. `tool_use_id` and non-tool parts (text, image_url) pass through untouched.
- **Transform label discipline** — `_headroomSummarised` is stamped only when content was actually reduced; the new `'compress_tool_call'` transform only appears in `transforms_applied` when at least one message was shrunk. Identity transforms still report `'identity'`. Ordering: `'dedupe'` → `'compress_tool_call'` → `'truncate'` (or `'identity'` if none fired).
- **`_estimateMessageTokens` extended** — multi-part content with `type:'tool_result'` parts now counts `countTokens(part.content)` for each such part (otherwise the summarise-vs-after BPE delta reads as zero and the bar hides real savings). Text-bearing parts continue to count their `text` field; image-bearing parts remain at 0 because they're not billable as text. JSDoc updated to document the new branch.

Tests — 5 new endpoint-surface assertions in `src/integrations/headroom/in-process-proxy.test.ts`: 1000-item array root summarisation with re-parse; non-JSON prose untouched; object-mode walk key truncation with re-parse; parse-failure revert (fail-open safety); multi-part `role:'user'` tool_result inner array summarised end-to-end with `tool_use_id` preserved and real BPE savings asserted. Total in-process-proxy suite: 19 → 24 tests; full Headroom vitest suite: 120 → 125 / 0; `npm run bundle` verified.

Wire format unchanged — `tokens_before` / `tokens_after` / `transforms_applied` / `compressed` continue to round-trip the SDK's `deepCamelCase` pass. Existing 803-extension Cucumber scenarios unchanged.

### Headroom — CCR cross-call dedup with LRU

### Headroom — CCR cross-call dedup with LRU (Phase 3.3)

Closes the Phase 3 compression rollout (Φ-rate → real BPE → summarise).

- New `in-process-proxy.ts` CCR (Cross-Call Remember) store: module-level
  `Map<hash, CcrEntry>` with LRU semantics (native `Map` insertion order,
  evict-oldest on overflow at `CCR_CAP = 1000`). Hashes are SHA-256 over
  `(role + NUL + canonical(content))`, truncated to 64 bits. Canonical form
  sorts plain-object keys alphabetically while preserving array element
  order — so `[{a, b}, {c}]` and `[{c}, {b, a}]` correctly hash the same
  only when their structural keys align. Phase 4 will revisit hash length.
- New `/v1/retrieve` route returns `{hash, content (preview), similarity,
  cached, tokenCount}` — the SDK can fetch the first 200 chars of any
  original input by hash instead of re-running the full compress pipeline.
  Cache-miss shape echoes `{hash, content:null, similarity:0, cached:false}`.
- New `/v1/retrieve/stats` route surfaces live `{entries, capacity,
  totalOriginalTokens, totalCompressedTokens, totalTokensSaved, hitRate,
  savingsPercent}`. `hitRate` and `savingsPercent` are placeholders until
  Phase 4 wires the hit-vs-miss counter (deferred — see TODO in source).
- `_naiveCompress` now upserts each input message into the CCR store BEFORE
  running dedupe / summarise / truncate, then emits `ccr_hashes` on the
  wire response. Hashes reflect raw-input signatures, so a caller can later
  resolve the most-recent compress call's pre-transform content via
  `/v1/retrieve`.
- `_upsertCcrEntry` is true LRU — on hit, the entry is `delete`/`set` so it
  bumps to the tail of insertion order before re-reading the cap. No
  `Array.sort` per call.
- `/v1/compress` dispose hooks (`server.close()` on listen-error, `_ccr.clear()`
  on dispose) so an extension reload doesn't carry stale hashes from the
  prior workspace into the next session.
- New test surface (12 endpoint tests + 7 CCR-store tests = 19 total for 3.3):
  stable-on-replay hashing, content change → new hash, role scope
  (same content, different roles hash differently), `/v1/retrieve` cache
  hit/miss shapes, `/v1/retrieve/stats` shape, CCR cap at 1001 inserts
  evicts oldest, listen-error handler closes the underlying server so
  subsequent `startInProcessProxy()` calls survive synthetic error events.
- New test utility `_clearCcrForTest()` mirrors `_clearRecentCallsForTest()`
  for test isolation; vitest `beforeEach` clears both before each suite.

All phases green: tsc clean, vitest 132/132 in 1.36s, production bundle clean.


---

## 0.5.5

### Feature: Autonomous Auto-Advance for Agentic Kanban

A new `agileagentcanvas.kanban.autoAdvance` setting (default off) turns the Agentic Kanban into a fully autonomous lane: dropping a story into **In-Progress** runs the implement → review → done loop on its own, re-implementing on review failures until the review-guard approves or the iteration cap is hit. When off, the card stops after its single workflow and the user moves it manually — same as before. Toggleable from the Agentic Kanban toolbar or via the new setting under **Settings → Agentic Execution**.

- Implemented as a singleton orchestrator initialized at extension activation that owns the concurrency lock for the entire run. A second drop on the same story is rejected, not queued, and an in-progress run is never duplicated.
- Emits live progress events (`running` → `completed` / `interrupted` / `failed`) per artifact; the Agentic Kanban view forwards them to the webview so cards show running / completed badges during a long run.
- New settings: `agileagentcanvas.kanban.autoAdvance` (boolean, default `false`) and `agileagentcanvas.kanban.maxIterations` (number, default `3`, min `1`) — caps the implement → review cycles before stopping without approval.
- Optimistic-drop rollback: cards remember their pre-drop column, so a failed transition rolls the card back instead of leaving it visually desynced from the store.
- 14 new BDD scenarios (two new feature files) cover the happy path, `NEEDS_FIXES` loop, `BLOCKED` / `UNKNOWN` stop, iteration cap, concurrency-lock rejection, and the verdict-file data-integrity contract.

### Feature: Structured Verdict Contract for Lane Agents

Both execution paths (headless terminal CLI and in-chat Copilot) now produce and consume a structured verdict so the orchestrator can decide whether to auto-advance the card. The verdict file on disk is the single source of truth — `UNKNOWN` is returned when the file is missing or unparseable, and the orchestrator stops rather than advancing on uncertainty.

- Verdict shape: `{ verdict: 'COMPLETED' | 'APPROVED' | 'NEEDS_FIXES' | 'BLOCKED' | 'UNKNOWN', fixRequests?, summary? }`. `NEEDS_FIXES` carries a `fix_requests` array describing each failing criterion, which the orchestrator attaches to the artifact metadata before the next iteration so the next dev run sees and addresses every failing item.
- Terminal path: a new helper clears any stale result file, launches the CLI agent, then polls the result file (default every 3 s, 20 min timeout) or detects terminal close to read the final verdict.
- In-chat path: the chat-side workflow execution now returns a verdict (was `void`). The prompt explicitly tells the agent to write its verdict JSON to the canonical result-file path via the file-write tool.
- Skill content injection: both paths inject the authoritative SKILL.md (entry/exit gates, output schema) into the agent prompt, so the agent enforces the gates instead of having to discover the file. Terminal prompts gain a verdict-contract block naming the verdict field, the `fix_requests` array, and the result-file path.
- Shared helpers (verdict file path, id sanitization, normalization, file reader) live in a single module so the terminal and chat paths can't drift.

### Fixed: Harness pre-flight silently overwrote real artifact fields

Harness pre-flight policies were evaluated against the **incoming delta** rather than the **merged candidate** (existing artifact + incoming changes). For required-field policies this made real fields appear "missing" — a status-only update like `{ status: 'in-progress' }` from a Kanban drag would trip the policy, and the auto-fix would then OVERWRITE the real title, user story, and acceptance criteria with generic placeholders. Silent data loss on every drag.

- Pre-flight now evaluates the merged candidate (`{ ...existing, ...changes, ...changes?.metadata }`), not the bare delta.
- Auto-fix is applied field-by-field, ONLY where the merged candidate's field is genuinely empty (`undefined` / `null` / `''` / empty array). Existing values are never clobbered.
- Pure internal hardening — no setting or behavior change for users.

### Fixed: Lane transitions with only `terminalWorkflowId` were silently dropped

Some lane rules (e.g. review → done) defined only `terminalWorkflowId` — they had no interactive `workflowId` because the agent runs headlessly. The engine assumed every rule with a workflow had `workflowId`, so those rules were silently skipped: the card would move columns but never run the agent.

- Both gating checks now OR in `terminalWorkflowId`, and the local workflow path resolves the chat and terminal workflow ids independently so the same rule is reachable through either path.
- Terminal-execution log lines now use the resolved id, which may be a `terminalWorkflowId`.

### Fixed: Trace recorder test folders polluted the project root

Trace recorder step definitions created their output folders under a path that landed in the project root and tripped the `pretest` scratch-cleanup hook on every CI run.

- Both step definitions now use the OS temp directory for the recorder's output folder. The `pretest` cleanup is unchanged; the folders it was cleaning are no longer created.

### Fixed: Test infrastructure

- The Cucumber `vscode-shim` is now listed FIRST in both the default and ci profiles, so its global `Module._load` hook is installed before any step file imports `vscode`.
- New `wip` profile: `cucumber-js --profile wip` runs the 19 `@wip`-tagged product-gap scenarios with `transpile-only` for fast iteration. The default profile continues to skip `@wip`.

### Refactored: Webview handlers migrated to useEvent for stable identity

The entire webview UI now uses `useEvent` (the same pattern introduced in the Agentic Kanban view) instead of `useCallback` or inline arrow handlers. `useEvent` gives every handler a stable identity across renders — no more per-render listener re-attachment and no more stale-closure workarounds.

- **App.tsx (40+ handlers)** — All `useCallback(fn, [deps])` blocks converted to `useEvent(fn)` (deps arrays deleted). The 150-line `handleMessage` was hoisted from inside `useEffect(..., [])` to a top-level `useEvent`; 5 missed JSX inline arrows (ElicitationPicker close, DetailPanel onEditModeChange, the 3 schema-fix toast buttons) caught by the reviewer and converted in a second pass
- **3 useRef workarounds deleted** — `detailPanelDirtyRef`, `detailPanelOpenRef`, and `schemaFixingRef` plus their sync `useEffect` lines. They existed solely to defeat the stale closures that `useCallback` deps arrays created; with `useEvent` the closure always reads the latest value, so they are now dead code. `schemaToastTimerRef` kept (genuine timer management, not a stale-closure workaround)
- **6 component files updated + 1 reverted** — `ArtifactCard` (7 handlers), `Canvas` (9), `DetailPanel` (9), `CatalogueModal` (7), `ProviderSelector` (1), and `JiraModal` (1) had their multi-line and parameterised JSX inline arrows hoisted to named `useEvent` consts. `GraphifyModal` was touched but reverted to its original state when review caught a scope bug (a useEvent was added in the outer component but called from a nested sub-component where it was not in scope); no net changes
- **Net effect** — `App.tsx` and the 6 updated child components now pass stable function references to `Toolbar`, `Canvas`, `DetailPanel`, `SprintPlanningView`, and the other modals, eliminating the re-render / re-attach churn that `useCallback`'s deps arrays caused. Child components no longer see new function identities whenever `artifacts`, `detailPanelOpen`, `detailPanelDirty`, `selectedId`, etc. change
- **Internal change** — no user-visible behavior change. All ~74 new useEvent handlers across App.tsx and the 6 component files preserve the original logic verbatim. Typecheck ✅, 7/7 useEvent unit tests ✅, code review ✅


## 0.5.4

### Headroom — Transparent Context Compression

Headroom automatically compresses chat messages before they reach the AI provider, saving tokens with zero user configuration.

- Auto-detects the Headroom proxy (`npx headroom-ai proxy`), lazy-loads the SDK on first chat call, and transparently compresses all LLM-bound messages. Tracks cumulative stats (tokens saved, compression ratio). Silently no-ops when Headroom isn't installed or the proxy isn't running.
- **Injected into AI provider pipeline** — streamChatResponse() in ai-provider.ts compresses messages before the provider dispatch. Best-effort — never blocks the real AI call.
- **Proactive detection on startup** — detectHeadroom() runs on extension activate so the status bar reflects availability immediately, not just after the first chat.
- **Status bar integration** — Codeburn status bar now shows ^XX% savings percentage alongside cost (`$X.XX`) when Headroom is active and has compressed at least one call.
- **Opt-out setting** — New `agileagentcanvas.headroom.enabled` setting (boolean, default `true`) under **Settings → Headroom**. Disabling skips compression entirely with zero overhead (no lazy-load, no health check). Changes take effect immediately.
- **Dependency** — Added `headroom-ai` ^0.22.4.

### BMAD v6.8.0 Full Module Update

All four BMAD modules updated with upstream resources — core+BMM, BMB, TEA, and CIS.

- **Core + BMM (6.0.3 → 6.8.0)** — 4 new V6 skills (`bmad-spec`, `bmad-investigate`, `bmad-prd`, `bmad-ux`), WORKFLOW_REGISTRY 56→60 workflows, BMM 26→30. Wired into getAvailableWorkflows() for prd, story, ux-design, and product-brief. Legacy path mappings for all new V6 skills.
- **BMB (0.1.6 → 1.1.0)** — Imported `bmad-agent-builder` (33 files) and `bmad-workflow-builder` (31 files). WORKFLOW_REGISTRY +2 quality-scan entries. Wired into getAvailableWorkflows() for 'agent' and 'workflow' types. Added module.yaml, module-help.csv, and LEGACY path mappings.
- **TEA (1.3.1 → 1.19.0)** — Updated agent `bmad-tea` and all 9 workflow directories. Replaced all 9 `aac-tea-*` SKILL.md files with adapted upstream content.
- **CIS (0.1.8 → 0.1.9)** — 6 new agent personas registered under AAC naming convention (aac-cis-agent-*): Carson (Brainstorming), Dr. Quinn (Problem Solver), Maya (Design Thinking), Victor (Innovation), Caravaggio (Presentation), Sophia (Storyteller). Each has SKILL.md + customize.toml with persona data from upstream.
- **Artifact agent routing** — 6 new `ArtifactAgentKey` entries, `ARTIFACT_TYPE_TO_AGENT` mapping, and LEGACY_PATH_MAP updates for CIS agents. loadAllAgentPersonas() detects aac-cis-agent prefix for CIS module classification.
- **Methodology dirs merged** — 4 `bmad-cis-*` methodology directories merged into existing `aac-cis-*` equivalents; stale `bmad-cis` references cleaned from all 3 CSVs.


## 0.5.3

### Added: Custom ESLint Rule — `no-bare-assert`

New custom ESLint rule (eslint-rules/no-bare-assert.js) enforces that every `assert.strictEqual`, `assert.ok`, and `assert.deepStrictEqual` call in step definitions includes a descriptive message argument showing expected vs actual values.

- **~98 bare assertions fixed** across 12 step definition files
- **Improved error messages** on existing assertion steps — `Then('the webview should have received a {string} message')` now lists actual received message types on failure
- **Rule config** integrated into .eslintrc.json and `npm run lint` script
- **0 ambiguous + 0 undefined steps** — 644/729 pass, 85 failures (unchanged from baseline)

### Fixed: Truncated File in agentic-kanban.steps.ts

The last `Then('vscode.postMessage should have been called with type {string} and sessionId {string}', ...)` block was missing its closing `});`, causing the test runner to fail to compile. This was a pre-existing truncation surfaced during testing.

### Agent-to-Agent Message Bus — Dynamic Discovery & Handoff Negotiation

New `src/acp/agent-bus/` module adds a peer-to-peer message bus for agents to dynamically discover each other and negotiate handoffs during team execution.

- **Agent Registry** — Dynamic register/unregister with capability-based discover(). findOptimalAgent() prefers idle agents. Heartbeat tracking with automatic stale-pruning.
- **Message Bus** — Pub/sub with wildcard topic patterns (`*` single-segment, `#` multi-segment). Supports priority queuing, TTL expiry, correlation IDs, direct send(), delivery tracing, and system event topics.
- **Handoff Negotiation** — requestHandoff() with 30s timeout and auto-accept for idle agents. respondToHandoff(), transferContext(), completeHandoff()/failHandoff(). Max 20 concurrent sessions.
- **Wired into team execution** — executeTeam() registers agents on the bus, deregisters in `finally`. Bus initialized in extension.ts.

### Agentic Kanban View — Workflow Orchestration UI

A new Kanban-style view for agentic workflow orchestration, toggleable from the canvas.

- **`AgenticKanbanViewProvider`** — New webview registered as `agileagentcanvas.agenticKanban`.
- **Kanban toggle FAB** — Canvas toolbar toggles between standard Canvas and Agentic Kanban modes.
- **Shared kanban components** — SprintPlanningView.tsx refactored to use modular `KanbanCard`/`KanbanColumn`.
- **Lane Transition Engine** — New src/workflow/lane-transitions.ts bridges Kanban actions to BMAD workflows.
- **Session restoration** — Extension activation restores interrupted ACP sessions from trace logs.
- **Settings** — `agileagentcanvas.agenticKanban.enabled` and `agileagentcanvas.agenticKanban.terminalProvider`.

### Multi-Agent Team Execution (ACP)

Full Agent Coordination Protocol for multi-agent teams with coordinator/crafter/gate roles.

- **ACP Types** — `AcpSessionSpec`, `AcpSessionEvent`, `AcpSessionResult`, `AcpHandoff`, `AgentRole`.
- **Session Manager** — `AcpSession` with lifecycle events and tool call/duration tracking.
- **Team Orchestrator** — `AgentTeamOrchestrator` with TEAM_REGISTRY (dev-story, refactor, generate-code, review-code teams).
- **`agileagentcanvas.agentTeam.enabled` setting** — Feature gate (default `false`).

### Team Trace Recording — Per-Agent Observability

Execution tracing added to executeTeam() for full agent lifecycle observability.

- **Lifecycle events** — team started, agent started (role/session ID), agent completed (tool calls/duration), agent failed (error details), team completed/failed (aggregate stats).
- **All trace calls wrapped in try/catch** — recording failures never block execution.

### Harness Governance Loop — Continuous Policy Enforcement

Self-correcting quality system validating artifacts pre/post-flight and accumulating feedback across sessions.

- **Policy Engine** — Synchronous evaluate() with pre-flight, post-flight, and continuous policies:
  - **trace-anomaly** — Detects repeated errors (>=3), stuck tool-call loops (>=4), frequent status changes (>=4)
  - **feedback-accumulation** — Surfaces cumulative policy findings
- **Harness Feedback Service** — Severity escalation: advisory -> warning -> blocking (6+). Active failures injected into agent prompts. (src/harness/harness-feedback.ts)
- **Pre-flight validation** — ArtifactStore.updateArtifact() blocks on blocking failures.
- **Settings** — `agileagentcanvas.harness.enabled` and `agileagentcanvas.harness.sprintCapacity`.

### Execution Trace Recorder

Per-session trace logging for observability and debugging.

- Records tool calls, LLM responses, decisions, errors, handoffs to JSONL files.
- Auto-wraps LM tools with tracing.
- **Settings** — `agileagentcanvas.trace.enabled` (default `true`) and `agileagentcanvas.trace.retentionDays` (default `30`).

### YOLO (Autonomous) Mode

- **`agileagentcanvas.yoloMode` setting** — When enabled (default `false`), AI may skip interactive checkpoints.

### VSIX Build Pipeline

- **`npm run compile`** — Runs type-check, esbuild bundle, webview UI build sequentially.
- **`vsce package`** — Verified VSIX generation at 3.87 MB (936 files).


## 0.5.2

### Fixed: NUL Filename Packaging Error

Two files literally named `NUL` (Windows reserved device names) in the project root and `webview-ui/` caused VSIX publishing to fail with "The extension contains an entry extension/NUL which is unsafe for extraction". Deleted both files; verified clean VSIX with zero NUL entries (924 total entries). Both paths were already in `.gitignore`.

## 0.5.1


> This release is large — see [docs/changelog/0.5.1.md](docs/changelog/0.5.1.md) for the full detail.

### 3D Corpus Search & Filter

Search box (top-left) filters the 3D corpus landscape in real-time. Matching nodes stay bright; non-matching nodes dim to near-invisible (`#3c3c3c`). Edges between matched nodes stay colored; all others fade to near-transparent. When exactly one node matches, the camera auto-frames on it. Match count badge ("N found" / "No matches") appears below the search box. The × button resets the search.

### Fixed: Provider Selector Dropdown

The "Select Provider" button was not showing installed providers and its styling didn't match the rest of the canvas header.

- **Button placement** — Moved the provider selector button next to the Workflows button with matching pill-style FAB appearance (`provider-selector` now uses `position: absolute; top: 12px; right: 138px; border-radius: 999px;` and slides left when the detail panel opens)
- **Real availability detection** — listAvailableProviders() in src/commands/chat-bridge.ts now actually probes the host for installed CLIs (claude, `codex`, `gemini`, `aider`, `opencode`) via `where`/`which`. Previously, several terminal-only providers were hardcoded as `available: true` even when not installed, while panel-only providers like `omp` showed as unavailable even if the standalone CLI was on PATH. Providers are now marked `available` only when the panel command is registered OR the CLI binary is on PATH
- **OMP availability** — The `omp` provider now detects the standalone `omp` CLI when the OMP VS Code extension is not installed. Dispatch order was changed so panel providers (claude, omp) prefer the panel path when the extension is registered, and fall back to the CLI only when the panel is missing
- **OpenCode support** — Added `opencode` as a first-class chat provider with `terminalLaunch: (q) => ['opencode', q]`, listed in `CHAT_PROVIDER_IDS` and in the `agileagentcanvas.chatProvider` enum
- **Official brand icons** — Replaced mixed emoji/unicode icons with official brand SVGs:
  - Copilot, Claude, Cursor, Windsurf, Gemini — simple-icons brand marks
  - OMP — official omp.sh/favicon.svg
  - Antigravity — official Google Antigravity mark
  - OpenCode — official `opencode.ai/favicon.svg`
  - Codex — OpenAI knot mark
  - Aider — derived green monogram
  - Auto/Terminal — generic SVG marks
- **Claude invocation fix** — Removed the unsupported `--print` flag from the Claude terminal-launch command. The webview now runs `claude "<prompt>"` (TUI with pre-filled prompt) instead of `claude --print "<prompt>"`, matching what the Anthropic CLI actually supports on this host
- **Message protocol fix** — Aligned the webview request/response types with the backend (`getChatProviders` ↔ `chatProviders`). Previously the webview sent `listChatProviders` and listened for `availableChatProviders`, which the backend never matched, leaving the dropdown permanently empty with "No providers installed on this host"

### Mindmap View Redesign

Major UX overhaul of the mindmap layout — card sizing, group-box styling, tree lines, and phase node visibility all improved.

- **Larger cards & spacing** — `NODE_W=200`, `NODE_H=60`, `H_GAP=80`, `V_GAP=32` in mindmap-layout.ts for better readability and click targets
- **Depth-based group boxes** — Replaced 8-color cycling palette (`group-color-0` through `group-color-7`) with 4 depth-level subtle backgrounds (`group-depth-0` through `group-depth-3`). Solid borders instead of dashed for a cleaner visual hierarchy. Deeper groups get progressively subtler tints so the tree structure reads naturally
- **Stronger phase nodes** — Phase/section nodes (e.g. "Discovery", "Planning") now render with a solid purple border, background fill, subtle glow shadow, and larger label text, making them clearly distinct from artifact cards
- **Improved tree lines** — Parent→child tree lines now use depth-based opacity and stroke-width (thicker/more opaque for shallow depths, thinner/subtler for deeper levels) with tiny arrowhead markers for direction clarity

### 3D Corpus View (Force-Directed Artifact Graph)

A third canvas layout mode that visualizes BMAD artifacts as an interactive 3D force-directed graph — revealing cross-phase connections hidden by the hierarchical lanes and mindmap views.

- New component using 3d-force-graph (Three.js-based). Renders artifacts as nodes connected by parentId hierarchy edges and `dependencies` cross-ref edges
- **Phase color coding** — Nodes colored by BMAD phase: purple (Discovery), blue (Planning), orange (Solutioning), green (Implementation)
- **Auto-rotation** — Gentle camera orbit on idle; stops automatically on any user interaction (drag, zoom)
- **Click-to-select** — Clicking a node selects that artifact and opens the detail panel, maintaining cross-view consistency
- **Animated edge particles** — Dependency edges render with directional particles showing flow direction
- **Phase legend overlay** — Color legend in the top-right corner identifies phase colors
- **Third layout mode** — Press `L` to cycle: Lanes → Mindmap → 3D Corpus → Lanes. Toggle button in zoom controls shows the next mode in the cycle
- **Dependencies** — Added `3d-force-graph` to webview-ui/package.json

### 3D Corpus Lens — Custom Shapes & Cleanup

Refined the 3D Corpus view — replaced uniform spheres with distinct geometric shapes per artifact type and stripped the card overlay system for a cleaner, more performant experience.

- **Custom shapes per artifact type** — createNodeMesh() maps each BMAD type to a distinct Three.js geometry:
  - Vision / Product Brief → **Sphere** (rounded, foundational)
  - Epic → **Cone** (top-down perspective)
  - PRD / Requirement / NFR / Additional Req → **Box** (structured specification)
  - Story → **Cylinder** (implementation pillar)
  - Architecture → **Torus** (connected, networked)
  - Architecture Decision → **Tetrahedron** (sharp, decisive)
  - System Component → **Dodecahedron** (complex, multi-faceted)
  - Risk → **Octahedron** (sharp edges)
  - Unknown types → Sphere fallback
- **Shape sizing** — Node size scales by `val` for importance weighting alongside count-based sizing, making high-priority artifacts visually prominent
- **Mesh selection highlight** — Clicking a node turns it white by updating the mesh material color directly (via `__threeObj`), replacing the broken nodeColor() approach that only affects default sphere rendering
- **Tree-shaken THREE import** — Replaced `import * as THREE` with specific named imports (`Mesh`, `SphereGeometry`, `BoxGeometry`, etc.), cutting the webview bundle from 2,179 kB to 1,570 kB (~28% reduction)
- **Card overlays removed** — Stripped the `createCards`/`updateCardPositions` overlay system that rendered text labels above each node. Removed `overlayRef`, `cardsRef`, `frameRef`, RAF update loop, idle detection, hover effects, and the expensive `backdrop-filter: blur(4px)` that forced GPU compositing for 199 elements. Artifact names now accessible via native 3d-force-graph tooltip (`nodeLabel('name')`)
- **No per-frame DOM updates** — With cards removed, no requestAnimationFrame loop runs during auto-rotation, eliminating all layout thrashing and DOM writes when no user interaction is occurring
- **Animated link particles** — Restored directional particle animation on graph edges. Each link renders 2 slowly-flowing semi-transparent particles (`linkDirectionalParticles(2)`, speed `0.005`, width `2`, color `rgba(255,255,255,0.3)`) that show dependency flow direction alongside the existing arrow markers
- **Phase-plane overlay** — 4 small sprite labels positioned at Z depths 60/20/-20/-60, one per BMAD phase (Discovery/Planning/Solutioning/Implementation). Sprites auto-scale to always face the camera so they never look stretched or dominate the viewport. Canvas texture 256×48 with 22px bold phase-name label at 70% opacity. Labels removed from Three.js scene on component cleanup to prevent memory leaks
- **Phase sprites removed** — Following user feedback that floating phase-name text in 3D space was confusing and not obviously connected to nodes. Phase orientation is now conveyed purely through node colors and the 2D legend overlay
- **All artifacts visible by default** — 3D corpus view now shows every artifact immediately with no epic collapse/expand. Clicking a node selects it (no more expand/collapse toggle)
- **Short floating labels** — Every node has a small canvas-texture `Sprite` floating 2 units above its 3D shape, displaying the first 18 characters of the artifact title in phase color at 90% opacity. Labels auto-orient to face the camera as you orbit. Group (`shape mesh + label sprite`) is used so the label and shape move together in the force simulation
- **Radiating link colors** — Each edge blends its source-phase color into its target-phase color (midpoint hex). A Discovery→Planning link is purple→blue at ~33% opacity. All links are much quieter: particles reduced to 1 (down from 2), slower speed, thinner width, shorter arrow. Particle itself is tinted with the target phase color to reinforce direction
- **3D node click opens detail panel** — Clicking any node in the 3D corpus view now fires `onOpenDetail`, opening the artifact detail panel alongside the existing selection highlight — Restored directional particle animation on graph edges. Each link renders 2 slowly-flowing semi-transparent particles (`linkDirectionalParticles(2)`, speed `0.005`, width `2`, color `rgba(255,255,255,0.3)`) that show dependency flow direction alongside the existing arrow markers


## 0.5.0


**This release is large — **

### Fixed: JSON↔Markdown Bouncing Eliminated

A root-cause fix prevents the LLM from reading stale Markdown companions as authoritative sources and writing back to them, which caused an infinite JSON→MD→JSON sync loop.

- **Artifact writes are JSON-only** — ArtifactStore.getOutputFormat() now hardcodes `'json'` for all LLM-initiated artifact persistence. Markdown companions are no longer auto-generated during syncToFiles().
- **Stale MD migration** — On first activation after upgrade, the extension walks `.agileagentcanvas-context/**/*.md` and renames them to `.md.bak` so the LLM never reads them as canonical. A `globalState` flag (`staleMarkdownMigrationV1`) ensures this runs once only.
- **Cleanup command** — New command `agileagentcanvas.cleanupStaleMarkdown` lets users manually trigger the rename.
- **LLM persona override** — formatFullAgentForPrompt() appends a write-contract when `toolsAvailable: true`: *"NEVER call `agileagentcanvas_write_file` on `.md` or `.yaml` files inside `.agileagentcanvas-context/`"* and *"NEVER read `.md` files inside `.agileagentcanvas-context/` as a source of truth"*.
- **LLM-facing output format hints hardcoded to JSON** — chat-participant.ts, workflow-executor.ts, and antigravity-orchestrator.ts no longer read the user's `outputFormat` setting when constructing LLM system prompts. The LLM is always told to produce JSON.
- **Tool schema updated** — `agileagentcanvas_write_file` description now says *"artifact writes default to JSON"* instead of referencing the user's `outputFormat` setting.
- **Agent personas aligned** — Framework file resources/_aac/skills/aac-bmb-workflow/steps/data/output-format-standards.md already explicitly deprecated `dual` and stated *"You do not need to generate a Markdown companion file"*. The extension's persona footer is now consistent with this.

### Telemetry: MD Write Detection

- **`agileagentcanvas_write_file_md` telemetry event** — Emitted to `toolTelemetry` whenever the `write_file` tool writes a `.md` file into the output folder. Expected count after this fix: 0. Surfaces in the weekly waste report if non-zero.

### Provider-Level Structured Outputs

### Provider-Level Structured Outputs (0.5.0)

Five layers of defence against LLM JSON drift are now active in every chat completion. Set `agileagentcanvas.defaultTemperature` (default `0.2`, range `0–2`) to tune determinism globally.

- **OpenAI `response_format: json_object`** — `streamOpenAI` now sends `response_format: { type: 'json_object' }` and auto-injects a JSON hint into the system message so the request is never rejected for missing "JSON" in the prompt.
- **Anthropic tool-use schema** — `streamAnthropic` accepts an opt-in `StreamOptions { forceStructuredOutput, activeArtifactType }` and registers an `emit_artifact` tool with `tool_choice: { type: 'tool' }` when forced. Default is plain-text streaming.
- **Gemini `responseSchema`** — `streamGemini` wraps the request in `generationConfig: { responseMimeType: 'application/json', responseSchema, temperature, maxOutputTokens: 8192 }`.
- **Ollama `format` parameter** — `streamOllama` now sends `format: <schema>` and `options: { temperature }` so local models also produce schema-constrained JSON.
- **VS Code LM `responseFormat: JsonObject`** — `streamVsCodeLm` requests `LanguageModelChatResponseFormat.JsonObject` when forced. Falls back gracefully on older Copilot models that reject the parameter.
- **Configurable temperature** — `agileagentcanvas.defaultTemperature` setting (default `0.2`, clamped to `0–2`) is read by getDefaultTemperature() and applied across all four HTTP providers.

### Robust Fence Stripping & Validation

- New src/lib/json-extract.ts (108 lines). Handles fenced code blocks (` ```json {...} ``` `, ` ``` {...} ``` `, bare `{...}`), strips leading/trailing prose, returns a typed `ExtractResult` (never throws). Internal type-guard rejects "valid JSON but not an object" cases.
- **Inline regex replaced** — 3 call sites in chat-participant.ts (refinements at L1443, `/convert-to-json` at L3714, suggestions at L5048) now use `extractJson` with `Array.isArray` runtime guards. No more silent parse failures; users see a `⚠️ Could not parse response as JSON` message + raw text.
- **Validation retry loop** — executeWithDirectApi in workflow-executor.ts now retries up to 3 times. On each failure the actual parse/validation error is injected into the next attempt's system prompt as a ## Correction Required block (escalating feedback, not generic "try again"). Final attempt streams a clear failure message.
- **Format footer in agent personas** — `formatFullAgentForPrompt(persona, context?)` appends a 5-line `## Output Format (CRITICAL)` block. The optional `context.artifactType` is referenced in the footer for schema-aware guidance. All 6 existing call sites are backward compatible (parameter is optional).

### New Built-In Tools (16 → 26)

Phase 1 quick wins exposed 4 previously hidden tools; Phase 6 added 5 more high-leverage tools. All appear in the VS Code LM tool picker.

- **`agileagentcanvas_repair_json`** — Repairs malformed JSON against any BMAD schema. Auto-fills missing required fields, coerces type mismatches, fuzzy-matches invalid enums (e.g. `'urgent'` → `'P0'`), clamps numeric ranges, picks the best `oneOf` branch, strips disallowed properties. Resolves `$ref` pointers inline. Returns `{ ok, changed, data, repairs, repairCount }`.
- **`agileagentcanvas_frontmatter_extract`** — Parses YAML frontmatter from any `.md` file. Backed by dynamic `import('yaml')` to keep bundle size minimal.
- **`agileagentcanvas_yaml_to_json`** — Converts any YAML string to a JSON object. Same `yaml` package, same dynamic import.
- **`agileagentcanvas_json_diff`** — Structured diff between two JSON objects with `patch | unified | summary` output formats. Backed by `microdiff@^1.5.0`.
- **`agileagentcanvas_json_merge`** — Deep-merge two JSON objects with 4 strategies: `deep`, `shallow`, `right-authoritative`, `array-replace`. Backed by `deepmerge@^4.3.1`.
- **`agileagentcanvas_write_file`** — Write a file (BMAD artifact or generic) with auto-handling of `.md`/`.json` dual format. Replaces shell-based file creation in every LLM workflow.
- **`agileagentcanvas_sync_story_status`** — Atomically update a story's status across all tracker files in one call. **`epicId` is now a required input** (fixes a 100% failure rate bug).
- **`agileagentcanvas_sync_epic_status`** — Atomically update an epic's status across all tracker files.
- **`agileagentcanvas_graph_community`** — Get the wiki summary for a code community (e.g. `'authentication'`, `'payments'`) from the graphify knowledge graph.
- **`agileagentcanvas_artifact_query`** (Phase 6) — Query the artifact store with filter criteria (`type`, `status`, `epicId`, `priority`). Returns `{ id, type, title, status }` — not full content. Refuses empty filters to prevent accidental dump.
- **`agileagentcanvas_workflow_resolve_vars`** (Phase 6) — Resolve `{{variable}}` and `{{var.subfield}}` placeholders in BMAD workflow templates. Missing variables left as `{{var}}` (not replaced with empty).
- **`agileagentcanvas_types_from_schema`** (Phase 6) — Generate TypeScript interface declarations from a JSON schema. Handles primitives, arrays, enums (string literal unions), nested objects, and `required` array.
- **`agileagentcanvas_schema_from_json`** (Phase 6) — Infer a JSON schema from 1–10 sample JSON objects. Required = present in ALL samples. Returns a valid JSON Schema object.
- **`agileagentcanvas_codebase_search`** (Phase 6) — Search the workspace for symbol definitions, references, or text matches. Three kinds: `definition`, `reference`, `text`. Backed by `vscode.workspace.findFiles` (no shell injection).

### Tool Catalog & Discovery

- docs/tool-catalog.md (NEW, 1987 words) — Authoritative reference for all 26 tools. Each entry has **Purpose**, **When to use**, **When NOT to use**, and a concrete **Example** with realistic BMAD paths. Quick reference table at the top.
- **System prompt injection** — `buildBmadMethodologyContext` now prepends an "Available Tools (CRITICAL — read first)" block naming all 26 tools + reference to the catalog.
- **Few-shot examples** — New src/chat/tool-examples.ts exports 5 worked examples for the highest-traffic tools: `repair_json`, `frontmatter_extract`, `json_diff`, `sync_story_status`, `update_artifact`. Always injected into the system prompt via `Object.entries(TOOL_FEW_SHOT)`.

### Telemetry & Learning Loop

- **toolTelemetry singleton** — New src/chat/tool-telemetry.ts with record(), getStats(), and the `trackToolCall(name, fn)` wrapper. All 21 tools wrapped. In-memory ring buffer (1000 entries max).
- **JSONL persistence** — setPersistenceDir() + persistToDisk() survive extension reloads (writes to `.agileagentcanvas-context/tool-calls-{date}.jsonl`).
- **Debounced Codeburn emit** — Per-call `executeCommand` IPC is debounced to a 5-second flush window. Errors logged at debug level (no longer silently swallowed).
- **Anti-pattern detector** — New src/learning/anti-pattern-detector.ts (93 lines) with 5 patterns: `shell_for_json`, `inline_yaml_parser`, `read_modify_write_loop`, `inline_schema_gen`, `manual_diff`. Uses `matchAll` for accurate frequency counting.
- **/suggest-tool command** — New src/commands/suggest-tool.ts (120 lines). LLM proposes a complete tool spec, the command validates the name (/^[a-zA-Z0-9_-]+$/ to prevent path traversal), and writes to `.agileagentcanvas-context/proposed-tools/`. Registered as `agileagentcanvas.suggestTool` in the command palette.
- **Skill promoter** — New src/learning/skill-promoter.ts (85 lines). Telemetry-backed: scans real tool call history and proposes skills that have been called > 5 times in the last 7 days. No longer a stub.
- **Weekly waste report** — New src/learning/waste-report.ts (89 lines). Output: .agileagentcanvas-context/waste-reports/YYYY-Www.md (ISO 8601 week notation). Correctly handles year boundaries. Includes anti-pattern detection from the detector module.

### Internal Wiring

- **StreamOptions interface** — New exported interface on streamChatResponse. The 2 artifact-emission call sites (workflow-executor.ts:3310 and chat-participant.ts:3708) pass { forceStructuredOutput: true, activeArtifactType: <type> }. The 5 conversational call sites use the default (plain text).
- **Schema cache** — `loadArtifactSchemaForContext(artifactType?)` caches loaded schemas per type to avoid re-reading the file on every request. Returns `{}` on any failure and logs a warning so degraded mode is visible.
- **`trackToolCall` signature** — Changed to `trackToolCall<T>(name, fn: () => T | Promise<T>)` to eliminate the previous `async` outer + `async` inner double-wrap. Accepts both sync and async handlers.

See [docs/changelog/0.5.0.md](docs/changelog/0.5.0.md) for the full detail.

## 0.4.4

### graphify Backend Auto-Detect & Remediation

- **Bootstrap & Rebuild guard** — if `agileagentcanvas.graphify.backend` is set to a non-empty value, a modal now appears before any work begins explaining that this setting routes extraction through the graphify CLI (which requires its own provider API key). Users can:
  - **Clear setting & use VS Code LM** — removes the setting at both Global and Workspace scopes and falls through to the integrated, key-free VS Code Language Model pipeline.
  - **Keep backend setting & continue** — proceeds with the CLI path as configured.
  - **Dismiss** — cancels the operation with no changes.
- Fixes the common issue where users were prompted for an API key during graphify bootstrap despite having a VS Code Copilot subscription.

## 0.4.3

### Skill Catalogue Manager

- **User-managed skill folder** — A new global setting agileagentcanvas.userCataloguePath lets you point the extension at any folder on your machine. Each subfolder containing a SKILL.md file is treated as a skill or agent. The extension watches this folder with vscode.FileSystemWatcher and reloads automatically whenever skills are added, edited, or removed.
- **Merged catalogue** — Skills from the user catalogue are merged with the 86 built-in skills at runtime. User skills always win: a user-defined skill with the same folder name as a built-in overrides it. All other built-in skills remain available.
- **Enable/disable per skill** — Any skill (built-in or user-added) can be individually toggled on or off. Disabled skills are excluded from AI routing and the `/help` command. State is persisted in VS Code global storage (not settings.json).
- **Skill Catalogue Modal** — A new 🗂️ button on the canvas toolbar opens a full-screen catalogue management modal with five tabs:
  - **All** — all skills + agents with search; toggle, open folder, or delete from here
  - **Agents** — filter to agent-type entries only
  - **Skills** — filter to task-skill entries only
  - **User-Added** — shows only skills sourced from your user catalogue folder; Open Folder and Delete actions are available here
  - **Skill Repos** — manage git-sourced skill repos (see below)
- **Create skill from template** — A "Create New Skill" form in the modal scaffolds a new SKILL.md + `customize.toml` inside your user catalogue folder instantly.
- **Delete user skill** — Permanently removes a skill folder from your user catalogue. A confirmation dialog is shown before any destructive action.
- **Open skill folder** — Reveals the skill's folder in the VS Code Explorer for quick editing.
- **Live canvas sync** — When the catalogue changes (file system or repo sync), all open canvas panels receive a `catalogueChanged` message and refresh their data automatically.

### Git Skill Repository Support

- **Add a skill repo by URL** — Paste any git repository URL (`https://`, `git@`, or `ssh://`) in the **Skill Repos** tab and the extension clones it with `git clone --depth 1` into a managed `_repos/` subfolder inside your user catalogue path. Any subfolder in the cloned repo that contains a SKILL.md is automatically imported as a user skill.
- **`.repo-source` sidecar file** — Each skill imported from a git repo carries a `.repo-source` file recording the repo slug, so the catalogue UI can show which repo a skill came from (📦 badge).
- **Sync** — The **Sync** button on each repo card runs `git pull` and re-discovers skills: new skill folders are added, removed folders are cleaned up, and changed SKILL.md files are updated. A real-time progress indicator shows the current clone/pull status.
- **Remove repo** — Removes all skills sourced from that repo, deletes the cloned folder, and clears the repo from the tracked list. A confirmation dialog is shown first.
- **`agileagentcanvas.skillRepos`** — New global setting (array of `{url, name?}`) persists the list of tracked skill repos across sessions.
- **`simple-git`** — Added as a runtime dependency; wraps the system `git` binary for clone/pull operations.

### `/help` Smart Skill Routing

- **New `/help` command** — `@agileagentcanvas /help` is now the recommended first stop. With no arguments it shows a quick-start table of skill categories. With a natural-language prompt (e.g. `@agileagentcanvas /help I need to write test cases`) it uses the active LLM to read the live catalogue manifest and return the top 3–5 best-matching skills with a one-sentence explanation for each.
- **CLI-compatible output** — Results are streamed as a numbered markdown list that renders correctly in VS Code Copilot Chat, opencode, claude-code, and any other markdown-aware terminal.
- **Keyword fallback** — If the LLM response cannot be parsed as JSON, the command falls back to a fast keyword-match against skill names and descriptions.
- **Respects enabled/disabled state** — Only skills that are currently enabled in the catalogue are considered for routing.

## 0.4.2

### Codeburn Integration — AI Cost and Token Observability

- **Codeburn CLI integration module** — Added a full integration surface under `src/integrations/codeburn/` with detector, runner, command registry, and bootstrap installer support.
- **Status bar visibility** — New Codeburn status bar item shows today's spend and token/session counts when available, with install/error/ready states and click-through menu actions.
- **Command palette actions** — Added Codeburn commands for install, dashboard, report, model breakdown, optimize, compare, export JSON, and menu launcher.
- **Chat participant support** — Added `/codeburn` command plus `/cost` and `/tokens` aliases for quick AI spend and model usage summaries.
- **Language model tool** — Added `agileagentcanvas_codeburn_report` tool for cost/token summary and per-model breakdown retrieval in chat workflows.
- **Settings added** — Introduced `agileagentcanvas.codeburn.enabled` and `agileagentcanvas.codeburn.path` for feature gating and custom executable resolution.
- **Cross-platform detection and fallback** — Codeburn invocation supports direct CLI, local `node_modules/.bin`, and `npx` fallback paths for Windows/macOS/Linux environments.

### Graphify Index — Architecture Corpus & Modal

- **graphify index . CLI command** — New Python pipeline stage generates ARCH_INDEX.md (human-readable) and ARCH_INDEX.json (machine-readable) from the NetworkX dependency graph. Outputs community summaries, god-node detection, cross-community edge lists, and token-budget metadata. Uses `datetime.now(timezone.utc)` for Python 3.12+ compatibility.
- **GraphifyModal component** — New full-screen React modal (webview-ui/src/components/GraphifyModal.tsx) with three sections:
  - **Pipeline Tracker** — Visual stage indicators (detect → extract → build → report → wiki → index) reflecting actual pipeline completion status, including `wikiPresent` detection.
  - **Arch Corpus** — Stats bar (nodes/edges/communities/god-nodes), expandable community rows with directory chips, and cross-community edge list.
  - **Recommended Actions** — Context-aware action buttons (bootstrap, index, update, wiki, wire, rebuild) dispatched as `graphifyAction` messages.
- **Graphify status bar rework** — Status bar item states (wire/ready/default) now open the GraphifyModal via `agileagentcanvas.graphify.openStatus` instead of the old report view.
- **Toolbar integration** — New Graphify button on the canvas toolbar opens the modal directly.
- **`requestGraphifyStatus` message handler** — Webview can request current graphify pipeline status + arch index data; handler responds with `graphifyStatus` message including parsed ARCH_INDEX.json content.
- **`graphifyAction` message handler** — Dispatches bootstrap/index/update/wiki/wire/rebuild actions from the modal to the Python CLI runner with appropriate arguments.
- **`loadCommunityWiki` function** — src/integrations/graphify/graph-query.ts loads wiki content for a community label using exact/fuzzy file matching with graph-data fallback.
- **`agileagentcanvas_graph_community` LM tool** — AI can query community-specific wiki content via natural language (e.g. "tell me about the auth community"). Registered as tool #10 in chat tools.
- **Two new commands** — `agileagentcanvas.graphify.index` (runs index pipeline) and `agileagentcanvas.graphify.openStatus` (opens modal on all active panels).
- **Webview types** — Added `GraphifyStatusWebview`, `ArchIndexWebview`, `ArchCommunityWebview`, `ArchGodNodeWebview`, `ArchCrossEdgeWebview` interfaces.
- **CSS namespace** — Full `gfy-` prefixed stylesheet for modal overlay, pipeline stages, stats bar, community rows, god-node/dir chips, cross-edge list, and action buttons.
- **JSON Schema** — resources/_aac/graphify/schema/arch-index.schema.json (draft-07) validates the generated arch index structure.
- **CI documentation** — Updated docs/graphify-multi-repo-guide.md with `graphify index .` in per-repo and cross-repo CI YAML templates, "Tiered Context for Coding Agents" section with token budget table, and "What to commit" guidance.

### BMAD v6.6.0 Resource Migration

- **Skills-based architecture** — Migrated all BMAD resources from the legacy v6.0.3 XML-in-markdown module layout (`bmm/`, `bmb/`, `cis/`, tea/, core/) to the v6.6.0 flat skills/{skill-name}/SKILL.md + optional customize.toml structure. 86 skill directories now live under resources/_aac/skills/.
- **Skill manifest** — New `resources/_aac/_config/skill-manifest.csv` (columns: `name,type,description,module`) replaces the three legacy CSV manifests (`agent-manifest.csv`, `workflow-manifest.csv`, `task-manifest.csv`).
- **Agent persona parser rewrite** — src/chat/agent-personas.ts now reads SKILL.md files directly (extracts persona name, role description, and instructions from markdown headings) instead of parsing XML frontmatter blocks.
- **Workflow discovery** — artifact-commands.ts scans `skills/` for workflow-type entries from `skill-manifest.csv` instead of walking `bmm/workflows/` and `core/workflows/`.
- **Workflow executor adaptation** — LEGACY_WORKFLOW_PATH_TO_SKILL map in workflow-executor.ts translates all legacy registry paths to their skills/{name}/SKILL.md equivalents at runtime.
- **Chat participant paths** — All 25+ workflow path references in chat-participant.ts updated to skills/{name}/SKILL.md.
- **IDE installer rewrite** — STUB_TO_MANIFEST (22 entries), loadArtifacts(), and all *SkillContent() functions rewritten for the new layout. External IDE agents (Claude, Cursor, Antigravity, OpenCode) now receive full SKILL.md content directly instead of stub-based "LOAD" instructions.
- _loadConfig() in workflow-executor.ts updated from bmm/config.yaml to _memory/config.yaml.
- **Tech-writer agent paths** — Both `write-doc` and `mermaid-diagram` commands now reference skills/bmad-agent-tech-writer/SKILL.md.
- **Legacy fallback retained** — loadLegacyBmmWorkflows() scanner remains for backward compatibility but is inert (guarded by `fs.existsSync`; old directories removed).
- **TOML parser** — Added `@iarna/toml` ^2.2.5 for reading `customize.toml` files.

### Jira API Token — Secure Storage

- **Token moved to OS keychain** — The Jira API token is no longer stored in plain-text VS Code settings (settings.json). It is now persisted securely via `vscode.SecretStorage`, which uses the OS keychain on every platform: macOS Keychain, Windows Credential Manager, Linux libsecret.
- **Two new commands**:
  - **Agile Agent Canvas: Set Jira API Token** — Opens a password input box (characters masked); stores the token directly into the OS keychain. No file is written.
  - **Agile Agent Canvas: Clear Jira API Token** — Prompts for confirmation, then removes the stored token from the OS keychain.
- **Automatic one-time migration** — On first use after upgrading, if a token is still present in the legacy `agileagentcanvas.jira.apiToken` setting it is migrated silently to the keychain and the setting is cleared. No manual action needed.
- **Deprecated setting** — `agileagentcanvas.jira.apiToken` is marked deprecated with an in-Settings warning and will be removed in a future release. Use the **Set Jira API Token** command instead.
- **Not-configured guidance updated** — All error messages, the `/jira config` chat command, and the Jira modal now instruct users to run the **Set Jira API Token** command rather than pasting a token into Settings.

## 0.4.1

### Jira Cloud Read Integration

- **Fetch epics & stories from Jira** — New `agileagentcanvas.fetchFromJira` command (command palette) lets you test your connection, fetch epics, fetch stories (by epic or entire project), and sync Jira data into your canvas artifacts.
- **Jira modal UI** — Dedicated **Jira** button on the canvas (same pill style as the Workflows button) opens a modal with five tabs:
  - **Fetch Epics** — lists all epics in a project
  - **Fetch Stories** — lists stories for a specific epic key or an entire project
  - **Fetch Issue** — fetch any single epic or story by its issue key (e.g. `PROJ-42`); if the issue is an Epic its child stories are included automatically; a **Sync to Canvas** button appears after a successful fetch to import that single issue
  - **Sync to Canvas** — merges all Jira epics & stories into canvas artifacts; local-only artifacts are never removed; conflicts are surfaced for review before writing
  - **Connection** — tests credentials and shows masked configuration
- **Conflict picker** — Before any sync that would overwrite existing canvas data, a field-level conflict picker is shown:
  - Only **Title/Summary** and **Description/Goal** are presented as choices — the user picks Jira or Canvas value for each conflicting field
  - **Status, story points, and assignee** always take the Jira value silently
  - Conflicts are shown grouped by epic, with child story conflicts nested inside each epic block
  - New artifacts (not yet on the canvas) are always added automatically — no prompt needed
  - If there are zero conflicts, the sync applies and persists immediately without any interruption
  - **Apply & Save** commits the resolved merge and persists to disk via syncToFiles(); Cancel dismisses without touching the canvas
- **Sync persists to disk** — All sync operations (full project sync, single issue sync) now call store.syncToFiles() after merging, so Jira data is written to the project folder immediately and survives VS Code reloads.
- **Single-issue sync** — The Fetch Issue tab allows syncing a single epic (with all its child stories) or a single story to the canvas, placing orphan stories into a synthetic "Imported Stories (Jira)" epic when no parent epic exists on the canvas yet.
- **`/jira` chat command** — `@agileagentcanvas /jira` with four subcommands:
  - `/jira config` — shows connection status and tests credentials
  - `/jira epics [projectKey]` — streams a markdown table of all epics
  - `/jira stories [epicKey|projectKey]` — lists stories for an epic or a whole project
  - `/jira sync [projectKey]` — fetches all epics + stories and merges them into your canvas (local-only artifacts are never removed)
- **`agileagentcanvas_read_jira` LM tool** — AI can autonomously call this tool when you ask about your Jira board in natural language (e.g. "show me my Jira epics"). Actions: `test_connection`, `list_epics`, `list_stories`, `list_all`.
- **Jira settings** — Four new VS Code settings under `agileagentcanvas.jira.*`: `baseUrl`, `email`, `apiToken`, `projectKey`. Search "Jira" in Settings to configure.
- **Zero new dependencies** — Uses Node's built-in `https` module; no npm packages added.
- **Classic & next-gen project support** — Story→Epic linking tries the modern `parent` field first, then falls back to the legacy `"Epic Link"` field for older board configurations.
- **Token expiry awareness** — API tokens now expire yearly (Atlassian policy since Dec 2024). A 401 response surfaces a targeted error with a direct link to generate a replacement token.
- **API endpoint updated** — Migrated from the removed `/rest/api/3/search` (HTTP 410) to `/rest/api/3/search/jql` with cursor-based pagination (`nextPageToken` / `isLast`).
- **Jira icon** — Both the canvas FAB button and toolbar button now use the official Jira logo mark (two diagonal arrow-head shapes at 45°) rendered as a theme-aware `currentColor` SVG.

### Bug Fixes

- **Schema validation false positive on epics manifest** — The epics.json manifest file (which stores lightweight refs, not full epic objects) was triggering a [schema-validator:warn] Validation failed for "epics" warning on every project load because the full epics.schema.json requires stories arrays inside each epic. Manifest files are now detected and excluded from strict schema validation.

### OpenCode Full Integration

- **Agents directory** — OpenCode IDE target now writes agileagentcanvas.md and agileagentcanvas-canvas-integrator.md into `.opencode/agents/` with proper `mode: all` / `mode: subagent` frontmatter (per OpenCode agent spec). Replaces the Copilot-style `tools: [...]` frontmatter that would have been ignored by OpenCode.
- **Slash commands** — OpenCode target now sets `workflowsDir: '.opencode/commands'`, installing all workflow stubs (`/dev`, `/requirements`, `/epics`, `/sprint`, `/vision`, `/ux`, `/quick`, `/review-code`, `/context`, `/party`, etc.) as native OpenCode slash commands.
- **Skills unchanged** — BMAD agent personas (analyst, dev, pm, architect, etc.) continue to install as SKILL.md packages into `.opencode/skills/` where OpenCode's native `skill` tool discovers them on demand.
- **`agentFormat` field** — Added `agentFormat: 'copilot' | 'opencode'` to `IdeTarget` so agent file content is generated correctly per platform. `writeExtensionAgentFile` and `writeIntegratorAgentFile` now branch on this field.
- **Updated IDE target description** — OpenCode target description now reflects all three install locations: `.opencode/skills/ + .opencode/agents/ + .opencode/commands/`.

### Single Source of Truth — Status Field Consolidation

- **Removed dual-field status pattern** — Acceptance criteria no longer use both `verified: boolean` and `status: string`; tasks no longer use both `completed: boolean` and `status: string`. The status field is now the single source of truth for both. Updated story.schema.json, epics.schema.json, all TypeScript types, UI components, and workflow instructions (dev-story, code-review, create-story).
- **Transparent migration on load** — normalizeLegacyArtifact() runs on every artifact read and write, converting old dual-field format to the new single-field format automatically. Old files are upgraded on next save.

### Single Source of Truth — Index Files Removed

- These generated manifest files were causing LLM confusion (agents treated them as editable sources of truth and stopped after updating them instead of the actual artifact files). Both files are now fully removed: generation code deleted, schema registrations removed, workflow checklist items removed, tool descriptions updated.
- **Single source of truth for status** — Story status now has exactly one authoritative file: `epics/epic-{N}/stories/{id}.json → content.status + metadata.status`. The `syncStoryStatusAtomic` tool, all workflow checklists, and all documentation now reference only this file.

### CLI Agent Integration — Full Tier Coverage

- **13 New Workflows in Manifest** — Added `security-audit`, `ceo-review`, `eng-review`, `design-audit`, `verification-loop`, `coding-standards`, `e2e-testing`, `eval-harness`, `api-design`, `create-story-checklist`, `story-enhancement`, `epic-enhancement`, and `dev-story-checklist` to `workflow-manifest.csv`. All paths verified on disk.
- **6 Delegation Stubs Converted to Executable** — `enhance`, `elicit`, `document`, `review-code`, `ci`, and `party` now have `STUB_TO_MANIFEST` entries and generate executable wrappers pointing to real workflow files instead of "go to VS Code Chat" delegation text.
- **Artifact-Type Routing Table** — Added ## ARTIFACT-TYPE WORKFLOW ROUTER section to help.md that maps Story, Epic, PRD, Architecture/Tech Spec, UX Design, Code/Implementation, and Test artifact types to their recommended refinement and dev workflows. Embedded directly in the help task so CLI agents auto-receive routing guidance on every invocation.
- **Version-Aware Auto-Reinstall** — autoInstallIfNeeded now reads package.json version and stamps it as <!-- aac-version: X.Y.Z --> in every agent skill. On extension update, the version mismatch triggers silent reinstall, ensuring CLI agents always pick up new/changed skills without manual re-installation.

## 0.4.0

### Artifact Persistence & Sync Fixes

- **Payload-Authoritative Merge (Zombie Fields Fixed)** — `writeJsonFile` now preserves only non-standard extension keys (`_` prefix) during re-serialization, ensuring that deleted standard fields in memory are properly removed from disk.
- **Race Conditions in Synchronizer** — `deleteArtifact` now `await`s all underlying `fs.delete` operations. Prevents the sync engine from accidentally resurrecting files that were midway through deletion.
- **Orphan File Cleanup** — `saveStoriesToFile` now actively prunes `.json` files stored in epic directories that are no longer part of the in-memory sprint state.
- **Timestamp Churn Elimination** — Stopped `lastModified` sync loops from overwriting original `created` values. The JSON merge logic now perfectly preserves existing file creation timestamps.
- **JSON Error Observability** — Replaced silent JSON parsing failure swallows in `readJsonFile` & `writeJsonFile` with dedicated `ioLogger` tracking for easier file corruption debugging.
- **Redundant I/O Reduction** — Hoisted directory creation loops out of individual story saves in `saveStoriesToFile`, caching directory readiness per epic.

### Claude Code Workflow Wrappers

- **Executable CLI Workflow Stubs** — Replaced delegation-only slash-command stubs (e.g. `/dev`, `/sprint`, `/review`) with executable wrappers that instruct the CLI agent to load and follow the actual BMAD workflow definitions directly from the installed resource directory. When installed to Claude Code or other CLI IDEs, these stubs no longer say "go to VS Code Chat" — they now point the agent to the real workflow YAML files.
- **Stub-to-Manifest Routing** — Added `STUB_TO_MANIFEST` lookup map that routes each stub to its correct BMAD workflow entry file (e.g. `/dev` → bmm/workflows/4-implementation/dev-story/workflow.yaml).
- **VS Code-Only Stubs Preserved** — `refine`, `enhance`, and `elicit` remain as delegation stubs since they depend on VS Code extension APIs (artifact loading, schema resolution, apply command) with no CLI equivalent.
- **Self-Contained Wrappers** — Generated stub bodies resolve `{bmad-path}` to the actual installed resource path at write-time, making stubs IDE-agnostic and self-contained.
- **Graceful Fallback** — Executable stubs include a fallback message directing users to run the IDE installer if the workflow file cannot be found.

## 0.3.9

### GSD Workflows Integration

- **5 New Specialized Skills** — Added `Codebase Mapper` (structural discovery), `Assumptions Analyzer` (risk/dependency extraction), `Trade-off Advisor` (5-column decision matrix), `Execution Task Protocol` (strict deviation bucketing and auth gates), and `Test Classification Strategy` (heuristic-based pre-test triage: TDD/E2E/Skip).
- **Workflow Registry** — Registered all 5 new skills in workflow-executor.ts under the `4-review` phase with proper target artifact types.
- **Canvas UI Integration** — Surfaced the new GSD-inspired review workflows in the "Refine with AI" context menu for Epic, Story, Architecture, and Test Strategy cards.
- **4 New Elicitation Methods** — Appended `Codebase Discovery (GSD-Style)`, `Trade-off Matrix (GSD 5-Column)`, `Goal-Backward Planning`, and `User Behavioral Profiling` to the advanced elicitation registry.
- **Production-Quality Workflow Structure** — All 5 GSD workflows use the full multi-file YAML format (workflow.yaml + instructions.md + checklist.md) with XML-structured steps, interactive prompts, halt-conditions, and execution-notes — matching existing advanced workflows like `correct-course`.
- Registered all 5 GSD workflows in `workflow-manifest.csv` so their SKILL.md files are generated dynamically by the IDE installer.
- **Attribution** — Updated `LICENSE` to include formal attribution for `get-shit-done`, `everything-claude-code`, and `gstack` repositories.

### Agent Honesty Guardrails

- **3-State Task Status** — Replaced binary task completion with `pending` → `implemented` → `verified` progression. Dev agents can only set `"implemented"`; only Code Review can promote to "verified". Updated status.schema.json and story.schema.json with backward-compatible aliases.
- **Proof of Work Gate** — Dev agents must now paste actual terminal output or HTTP responses into `debugLog` before marking tasks complete. Tasks that cannot be executed are marked `"implemented-not-verified"`.
- **Honesty Clause** — Added explicit prohibition against fake data seeding or success messages without real I/O operations in `dev-story` workflow.
- **Grep Self-Audit** — Agents must search modified files for `TODO`, `FIXME`, `placeholder`, `stub`, `fake`, `simulated` before task completion; any hits block the task.
- **Unbacked Success Ban** — Added coding standard banning `✅`/`"seeded"`/`"complete"` console output without preceding verifiable I/O.
- **Path Resolution Standard** — Enforced `__dirname` / `import.meta.url` for file operations; banned process.cwd() and string-relative paths.

### Test Tracking & Status Update Fix

- **Step 8b Merge** — Merged unreachable `step 8b` (test tracking) into `step 8` before the `<goto>` jumps, ensuring test sync logic always executes.
- **TEST SYNC GATE** — Added mandatory gate: if any `*.test.*` or `*.spec.*` files appear in the File List, agents must sync them to `content.testCases[]` and epic's test-cases.json before proceeding.
- **Explicit Status Update Protocol** — Replaced vague "one-liner Node.js script" directives with field-by-field update instructions requiring `view_file` verification in both `dev-story` and `code-review` workflows.

### Bug Fixes (0.3.9)

- **Dynamic Slug Resolution**: Fixed an issue where epic.json story references (e.g. `0.1`) failed to resolve physical story files generated with descriptive slugs (e.g. 0.1-graphql-api.json). The loader now dynamically maps canonical IDs to slugged files, protecting project integrity when story titles change.

### Artifact Store Refactoring

- **Resilient Artifact Loading** — Refactored internal data discovery to explicitly traverse and load storyRefs from epic.json files as the authoritative source of truth, eliminating reliance on implicit directory scanning and the fragile stories-index.json.
- **Sprint Board Data Integrity** — Replaced fragile exact-string matching in SprintPlanningView.tsx with robust prefix-based ID matching (e.g. `1-2`), preventing stories from being incorrectly categorized as "Unscheduled" due to title punctuation or casing differences.
- **Broken Reference Observability** — Missing story files explicitly referenced by epics now render as "Broken Reference" placeholder cards on the sprint board instead of silently disappearing, preventing invisible data loss.

## 0.3.8

### Performance Optimizations

- **Instantaneous Canvas Exporting** — Completely rewrote the Canvas to PDF/PNG export engine to eliminate absolute browser lock-ups and IDE crashes during large exports. Replaced the extremely slow DOM-tiling strategy with a single, perfectly-bounded offscreen capture pass driven directly by React state coordinates. Large exports that previously spun indefinitely now complete in seconds and automatically crop out all unused empty space.

## 0.3.7

### Gstack Elicitation Workflows Integration

- **Security & Execution Audits** — Added "Security Audit" (STRIDE, OWASP) and "Execution Lock Review" (Eng Manager Mode) workflows for rigorous architectural and implementation compliance checks.
- **Product & Design Validation** — Added "CEO Scope Review" (extreme MVP reduction, ambition checks) and "Design Dimension Audit" (0-10 visual hierarchy ratings) to elevate product rigour.
- **Six Forcing Questions** — Integrated Garry Tan's Office Hours forcing questions method into the brainstorming workflow registry.
- **Context Menu Integration** — The four new review workflows are directly accessible via the "Refine with AI" (Sparkle Icon) menu for PRD, Architecture, UX Design, and Product Brief artifact cards.

### ECC-Inspired Skills & Workflows Integration

- **5 New Review Skills** — Added `Verification Loop` (6-phase quality gate: Build, Types, Lint, Tests, Security, Diff Review), `Coding Standards` (naming, immutability, error handling), `E2E Testing` (Playwright POM, fixtures, CI integration, flaky-test strategies), `Eval Harness` (Eval-Driven Development with pass@k metrics), and `API Design Review` (REST conventions, status codes, pagination, error envelopes).
- **Workflow Registry** — All 5 new skills registered in workflow-executor.ts under `4-review` phase with proper `artifactTypes` targeting.
- **Canvas UI Integration** — New workflows surfaced in the "Refine with AI" context menu: Verification Loop on story/epic/architecture cards, Coding Standards + Eval Harness on story/epic, E2E Testing on story/test-strategy, API Design Review on architecture/epic.
- **2 New Elicitation Methods** — Added `Eval-Driven Discovery` (technical: define evals before implementation) and `Research-First Discovery` (research: explore codebase before coding) to `methods.csv`.

### Observability & Logging Enhancements

- **Unified Output Channel Logging** — Replaced all direct `vscode.OutputChannel` usages with a structured `.debug/.info` logger interface. Routine synchronization and execution steps are now demoted to debug-level, drastically reducing output panel noise during standard use.
- **Intelligent Schema Error Messages** — Refactored the internal schema validator to synthesize human-readable correction suggestions directly from underlying JSON schema failure parameters (surfacing missing properties, valid enums, or expected types instead of opaque schema errors), and to explicitly embed the artifact ID (e.g., `S-1.5`) in the warning text so you know exactly which file failed.

### Performance Optimizations (0.3.7)

- **Buttery Smooth Canvas Panning** — Resolved significant lag during canvas interactions on dense projects. `ArtifactCard` and `DependencyArrows` components are now heavily memoized (`React.memo`) with custom deep-equality checks for complex state like expanded categories. React now completely skips re-rendering these hundreds of DOM/SVG nodes during `pan` and `zoom` operations, delivering a flawless 60fps interaction experience regardless of artifact count.

### Workflow Enhancements: Test Case Tracking & Audit

- **Explicit test case extraction rules** — Updated the `dev-story` and `quick-dev` workflow instructions to mandate that newly implemented automated tests (unit/integration) must be extracted into formal JSON test case definitions. These definitions must be appended to the `content.testCases` array of the story JSON and the epic's test-cases.json file.
- **Formalized test status terminology** — Clarified in development workflows that when adding new test case definitions, their top-level `status` field must strictly be set to `done` to indicate full design and implementation (preventing invalid use of `passed` for schema status).
- **Code-Review extraction audit** — Added an explicit audit step to the `code-review` workflow prior to updating execution statuses. If a story has implemented tests but the `content.testCases` array is empty, the review agent is now mandated to pause and backfill the JSON extraction before proceeding, closing a loophole where tests were written but not tracked.

### Artifact Store Refactoring (0.3.7)

- **Automated Workflow Status Cascading** — Enforced workflow integrity by automatically cascading active states upward. Modifying a nested task to an open state downgrades its parent Story to `in-progress`, and creating or modifying an active Story automatically downgrades its parent Epic to `in-progress`.
- **Story status source of truth consolidation** — Refactored the internal data loading and synchronization logic across the extension to treat the individual story JSON files as the absolute single source of truth for story lifecycle statuses. Reconciled caching and derived projections (like parent epic `storyRefs` and sprint-status.yaml) to prevent status overlap and redundancy.
- **Removed bidirectional status sync** — Deleted legacy logic that allowed manual edits to sprint-status.yaml to overwrite story JSON files. sprint-status.yaml is now strictly a read-only projection, and any mismatched manual edits are safely overwritten on the next sync without triggering UI warning toasts.
- **Stripped status from epic storyRefs** — Cleaned up epic.json serialization to only save `id`, `title`, and `file` in `storyRefs`. Removed the `status` field entirely to enforce standalone story.json files as the only system of record.

### Canvas UX Improvements

- **Refinement Menu Consolidation** — The "Code Review", "Dev Story", and "Sprint Planning" workflows have been added to the "Refine with AI" (Sparkle Icon) menu for Story and Epic cards. These implementation-phase options were previously explicitly segregated to the "Start Dev" button, but are now consolidated into the main refinement picker so all AI actions are accessible from a single dropdown.

### Bug Fixes (0.3.7)

- **Sprint Planning view showing stale data** — Opening the Sprint Plan Kanban board could show an outdated version of sprint-status.yaml (visible via the generated timestamp), requiring repeated close/reopen cycles before the correct latest data appeared. Root cause: vscode.workspace.fs.readFile() was returning cached file content when the YAML file had been recently modified externally (e.g. by a sprint-planning workflow). Switched to Node's native fs.promises.readFile() in webview-message-handler.ts to bypass VS Code's file system caching layer and always read fresh content from disk

## 0.3.6

### Epic JSON Slim-Down — Lightweight storyRefs

Removed full story object duplication from epic.json. Each epic.json now writes only lightweight `storyRefs` (id, title, status, storyPoints, priority, file path) instead of embedding the entire story payload. Full story data remains the single source of truth in `epics/epic-{N}/stories/{id}.json`.

**Changes:**

- Replaced full `Story[]` embedding with slim `storyRefs[]` array. Removed dead dep-normalization and `_sourceEpicId` cleanup code
- Added a final syncToFiles() execution phase to ensure all loaded standalone epic.json files are automatically reformatted and stripped of their duplicate inline stories on disk
- Added metadata hint telling LLMs where full story data lives and not to embed story objects
- Now deletes the standalone story file from disk when a story is removed
- Updated text to describe epic.json as containing lightweight refs
- **`create-story/instructions.xml`** — Dependency sync now targets standalone story files instead of embedded epic.json objects
- **`dev-story/instructions.xml`** — Status Propagation Checklist updated: dep sync references standalone story files

### Code-Review Workflow — Post-Fix Integrity Re-Scan Gate

- **Mandatory re-scan before Step 5** — After applying ALL fixes (any of the three fix-choice paths), the agent must now re-scan every file it modified or created during the review session for the keywords `TODO`, `FIXME`, `time.Sleep`, `hardcoded`, `simulated`, `fake`, `placeholder`, `stub`. For each hit, the agent must either implement it properly or explicitly mark the parent task as `status="deferred"`. The agent may not proceed to Step 5 (status update) until this re-scan returns zero hits. This closes a loophole where fix-pass code itself introduced new stubs that went undetected.

### Single Story File Architecture — Single Source of Truth

Migrated from a dual-file story system (`stories/{id}.json` + `implementation/{id}.json`) to a single canonical location at `epics/epic-{N}/stories/{id}.json`.

**Root cause:** All three implementation workflows (`dev-story`, `create-story`, `code-review`) contained `CRITICAL` blocks mandating that story data be written to two locations simultaneously, creating sync bugs and LLM confusion.

**Changes:**

- **`dev-story/instructions.xml`** — Removed dual-file sync critical block; updated status-write action and Status Propagation Checklist to reference the single canonical path `epics/epic-{N}/stories/{id}.json`
- **`create-story/instructions.xml`** — Removed dual-file critical block; removed two separate dual-write save instructions (Step 5 and Step 6); workflow now writes to one location only using `agileagentcanvas_write_file`
- **`code-review/instructions.xml`** — Removed dual-file critical block; updated all story JSON update actions and Status Propagation Checklist to target the single canonical file
- Added automatic migration that runs on project load: detects legacy `implementation/` directories, copies their `.json` files to the canonical `epics/epic-{N}/stories/{id}.json` path (if not already present), and renames the folder to `.deprecated_implementation/` so it is naturally excluded from future recursive scans while preserving all data
- Simplified from slug-based (`{epicId}-{storyNum}-{slug}.json`) to immutable ID-based ({id}.json, e.g. S-1.2.json) in migrateToReferenceArchitecture(). ID-based names are predictable, stable when titles change, and directly derivable by AI agents from the sprint-status key pattern
- Updated the epics-index.json LLM hint from the old slug pattern to the new `{id}.json` pattern so all AI path discovery is consistent

**Backward compatibility:** Existing projects with `implementation/` directories are automatically migrated on next project load. No manual steps required.

### Workflow Robustness & Status Propagation

- **Atomic Status Sync Tools** — Introduced `agileagentcanvas_sync_story_status` and agileagentcanvas_sync_epic_status to allow LLM agents to atomically synchronize statuses across multiple tracker files (story JSON, epic.json, stories-index.json, sprint-status.yaml) in a single, robust tool call.
- **Status Propagation File Maps** — Added explicit `CRITICAL` file maps to `code-review`, `dev-story`, and `create-story` workflow instructions to guarantee agents are aware of all required files when updating a status.
- **Explicit Test Case Resolution** — Replaced vague test case update instructions with a concrete lookup algorithm in implementation workflows (checking content.testCases inline, then searching test-cases.json by storyId), ensuring tests are reliably discovered and synced.

## 0.3.5


**This release is large — - **LLM status awareness** — Sprint-planning and sprint-status workflow instructions now document all valid statuses with Kanban column mappings, ensuring LLMs use correct status values. Story schema description updated with column mapping reference**

### Tabbed Layout for Story Details

- **Tabbed Interface** — The expanded story card view now uses a tabbed layout to organize Tasks, Tests, and Acceptance Criteria (ACs), replacing the previous long vertical list of sections. This significantly reduces vertical scroll and improves readability.
- **Dynamic Tabs** — Tabs only appear for categories that have content. If a story only has Tasks and Tests, only those two tabs are shown. The first available tab is selected by default when a card is expanded.
- **Fixed Elicitation Modal Tests** — Resolved a failing unit test suite (App.test.tsx) that was still targeting the old `.elicit-modal` class instead of the new unified `.wfl-modal` class after the recent Elicitation Modal redesign.

### Code-Review Workflow — Adversarial Review Enhancements

Four new instruction blocks added to `code-review/instructions.xml` to close classes of bugs that prior review sessions reliably missed:

- **Ground-up baseline mandate** — A `CRITICAL` block at the top of Step 1 prohibits treating any prior review session as a validated baseline. Every task marked `[x]` and every AC marked `verified:true` must be re-proven from code in each new review run
- **TODO / stub audit** — Step 3 now requires a full keyword scan of all reviewed files (`TODO`, `FIXME`, `time.Sleep`, `hardcoded`, `simulated`, `fake`, `placeholder`, `stub`). A hit on a completed (`[x]`) task → **CRITICAL** finding; a hit with no story task at all → **HIGH** finding (undocumented debt). Clarifies that `"Deferred to Story X.Y"` in `devAgentRecord` does not make a task done
- **Round-trip persistence audit** — Step 3 now requires verifying that every DB write (`INSERT`, `UPDATE`, `saveXxxToDB`, etc.) has a corresponding read-back in the startup/load path and that every column written is also loaded back; any missing read-back → **HIGH** finding
- **Response-truthfulness check** — Step 3 now requires that every handler returning status/health/connectivity data derives its values from real I/O (network call, DB query, file check), not literals or constants. Hardcoded success values (`"ok": true`, fixed latency numbers) with no observable I/O → **HIGH**; values derived from real operations but silently discarded (`_`) → **HIGH**
- **AC verification on `done` transition** — Step 5 now sets `verified: true / status: "verified"` (or `false / "failed"`) on every `acceptanceCriteria` item in both story JSON copies before allowing a `done` transition; added to Status Propagation Checklist

### Dependency Graph Sync — Canvas Arrow Fidelity

Canvas dependency arrows are rendered from epic.json → content.stories[].dependencies, not from standalone `stories/*.json` files. Two workflows updated to keep these embedded objects accurate:

- **`create-story` Step 6** — After updating `storyRefs`, two new `<action>` blocks bidirectionally sync the dependency fields in affected epic.json files:
  - For `blockedBy` entries: load the upstream dependency's epic, ensure its embedded story object's `blocks[]` contains the new story's ID
  - For `blocks` entries: load the downstream story's epic, ensure its embedded story object's `blockedBy[]` contains `{ storyId, title, reason }` and replaces any generic placeholders (e.g. `"Epic N (upstream)"`) with the precise story ID
- **dev-story Step 9** — Sixth bullet added to the Status Propagation Checklist: epic.json (all affected epics) embedded story's dependencies.blockedBy[].storyId and `blocks[]` must use precise story IDs (e.g. `"2.10"`), NOT generic placeholders

### Acceptance Criteria Lifecycle Sync — All Three Workflows

`acceptanceCriteria` verified/status fields are now explicitly updated at every stage of the story lifecycle:

- **`create-story`** — New top-level `CRITICAL` block defines the AC structure contract: ACs must live in `content.acceptanceCriteria[]`, use either structured (`given/when/then`) or prose (`criterion`) format but never both, must never appear inside `tasks[]` or `testCases[]`, and must be initialized with `verified: false, status: "draft"`. Explains the canvas `📋 N/Total` chip lifecycle
- **`dev-story` Step 8** — After marking a task complete, the JSON update action now includes step 3: for each `acceptanceCriteria` item whose requirement is satisfied by the current task, set `verified: true AND status: "verified"` (unrelated ACs are left unchanged). Added as fifth checklist item in Status Propagation Checklist
- **`dev-story` Step 5** — Evidence-Based Planning mandate: before writing any file path, API reference, or design decision into the implementation plan, the agent must read the actual file or source in the codebase to confirm it exists. Assumptions, guesses, and memory-based references are prohibited

### Bug Fixes (0.3.5)

- **Detail Panel save no longer pollutes metadata** — handleSave in DetailPanel.tsx was spreading all of editedData (including the top-level title, `description`, and `status` fields) into the `metadata` object on every save. This caused those fields to be duplicated inside `metadata` on disk, scrambling the on-disk JSON schema. Fixed by destructuring the three top-level keys out of `editedData` before merging into `metadata`, ensuring only content-specific fields are written there. A targeted regression test was added to DetailPanel.test.tsx to permanently guard this contract
- **Acceptance Criteria Verification Backend Parser** — The backend JSON parser (mapSchemaStoryToInternal in artifact-store.ts) was accidentally stripping the newly added verified and `status` fields during the object mapping process, causing stories that were correctly updated by agents to still show 0/N verified ACs on the Canvas UI. The parser now correctly propagates these fields to the Canvas state.

### Dev-Story Workflow — Evidence-Based Planning Mandate

- **No assumptions in implementation plans** — Step 5 of `dev-story/instructions.xml` now has a `CRITICAL` block requiring that every file path, API reference, or design decision written into the implementation plan must be verified by reading the actual codebase first. Memory-based references and unverified assumptions are explicitly prohibited; every claim must have a corresponding file read as its evidence

### Acceptance Criteria — Separate Canvas Category

Acceptance Criteria (ACs) are now a **distinct third category** on story cards, separate from Tasks and Tests.

- **`📋 N/Total` AC chip** — Story cards display a `📋 0/3` chip alongside `✓ Tasks` and `🧪 Tests` in the inline summary row, with a micro progress bar that fills green when all ACs are verified
- **AC expanded section** — Expanding a story card shows a dedicated `📋 ACs (N)` section with per-criterion rows: `✅` (verified), `❌` (failed), `⬜` (draft/pending)
- **verified + status fields on AcceptanceCriterion** — Schema, extension types (src/types/index.ts), and webview types (webview-ui/src/types.ts) extended with verified: boolean and status: 'draft' | 'verified' | 'failed'
- **Fully backward-compatible** — Existing story JSON files without the new fields render gracefully: `undefined` fields default to `⬜` / `'draft'` — no migration required
- **LLM instruction lifecycle** — Three workflows updated:
  - `create-story`: initializes every AC with `verified: false, status: "draft"`; must never place ACs inside `tasks[]` or `testCases[]`
  - `dev-story`: after each task, sets `verified: true, status: "verified"` on satisfied ACs in both story JSON copies; added to Status Propagation Checklist
  - `code-review`: sets `verified`/`status` on every AC item before marking a story `done`; added to Status Propagation Checklist
- **Height calculation fix** — Removed a double-counting bug where stories with only ACs triggered +72px of extra card height (ACs share the existing inline summary row — no separate row needed)
- **Type safety** — AcceptanceCriterion type now imported into ArtifactCard.tsx and artifact-transformer.ts; all `any` casts removed

### Status Mapping Fix

- **Rich statuses preserved on canvas cards** — mapStatus() in artifact-store.ts previously collapsed all statuses to just 4 values (draft/`ready`/`in-progress`/`done`), silently mapping valid statuses like `in-review`, `blocked`, `backlog`, and `approved` to `draft`. Now passes through all 22 valid `ArtifactStatus` values and handles legacy underscore aliases (`in_progress` → `in-progress`)
- **Sprint YAML status mapping expanded** — reconcileDerivedState() now maps all valid statuses from sprint-status.yaml onto stories/epics instead of only 4 values
- **Kanban column normalization (no new columns)** — normalizeStatus() in SprintPlanningView.tsx maps all rich statuses into the 5 existing Kanban columns: Backlog (draft/`not-started`/`proposed`), Ready for Dev (`ready`/`approved`/`accepted`), In Progress (`implementing`/`blocked`), Review (`in-review`/`ready-for-review`), Done (`complete`/`completed`/`archived`)
See [docs/changelog/0.3.5.md](docs/changelog/0.3.5.md) for the full detail.

## 0.3.3

### UI Improvements

- **Visible Artifact IDs on Canvas** — Artifact IDs are now permanently visible directly within the header line of all standard and compact artifact cards on the Canvas, giving users an immediate visual anchor for specific items without needing to open the detail panel.

### Schema Relaxation

- Extension-generated fields like `_llmHint` were causing false validation warnings; `additionalProperties` changed from `false` to `true`
- `devNotes.dataModels` now accepts both strings and structured objects (`{name, description, fields}`) since LLMs generate rich data model descriptions
- Epic items in the `epics` array now accept lightweight ref entries (`{id, title, status, file}`) alongside full inline epics via `oneOf`
- **Standalone epic schema mapping removed** — 'epic' → 'epics.schema.json' mapping removed from schema-validator.ts since standalone `epic-*.json` files have `content.{id,title,...}` structure incompatible with the collection schema

### Bug Fixes (0.3.3)

- Moved filename exclusion before content-structure checks in `detectArtifactType` so `data.epics` no longer triggers false detection
- **Epic merge data loss** — mergeEpicDuplicate() now preserves `useCases`, `testStrategy`, `fitCriteria`, `successMetrics`, `risks`, `definitionOfDone`, and `technicalSummary` (previously only `stories` were merged)
- **Canvas task completion status** — Added reconcileSprintStatusToEpics() so development_status keys configured in sprint-status.yaml update Epics and Stories on the canvas retroactively. A done status strictly checks off all internal Story Tasks.
- **Test execution tracking** — Extended the artifact store parser to read test_execution_status from sprint-status.yaml. ready, `passed`, `failed`, and `blocked` states instantly reflect mapped test cases within Test Coverage cards on the Canvas.
- **Epic story progress bar** — Replaced plain text agile-badges for epic summaries with a rich progress bar chip that visually fills as child stories are moved to `done`.
- **Inline test case progress bar** — Replicated the visual green-fill chip component from tasks to the inline tests summary in ArtifactCard.tsx.

## 0.3.2

### Documentation

- **Canvas integration contract in test design skill** — Added AgileAgentCanvas Integration section to the bmad-tea-testarch-test-design SKILL.md explaining Path A (test-cases.json with storyId) for direct story card badges vs Path B (test-design `coveragePlan` with `<storyNum>-` ID prefix) for planning-level artifacts. Prevents LLMs from generating test design files when the user wants individual test case badges on story cards
- **CoveragePlan requirement field quality** — Added explicit guidance across SKILL.md, schema, JSON template (example item), and step-05 requiring the `requirement` field to contain a human-readable description (e.g. `"AC-1.2.1: POST full valid tree payload"`) instead of bare AC keys. The canvas uses this field as the test case title on story cards
- Replaced hardcoded `agileagentcanvas-0.2.1` path with `{bmad-path}` template variable so workflow loading works across versions
- **storyId/epicId format standardization** — Standardized storyId examples to numeric format ("1.3") matching epics.json convention; relaxed epicId schema to accept both numeric and EPIC- prefixed formats since the code normalizes both

### Bug Fixes (0.3.2)

- **Use case and test strategy loss on reload** — When duplicate epics were detected (manifest + directory scan), only stories were merged — `useCases`, `testStrategy`, `fitCriteria`, `successMetrics`, `risks`, `definitionOfDone`, and `technicalSummary` were silently dropped from whichever copy loaded second. Extracted a shared mergeEpicDuplicate() method that deduplicates stories by ID/title and adopts the richer verbose fields (longer arrays win) across all 4 inline merge locations
- **Schema validation warnings for standalone epic files (17 → 0)** — Four fixes: (1) moved epics-index.json exclusion before content-structure checks in detectArtifactType so data.epics no longer triggers false 'epics' detection, (2) removed the invalid 'epic' → 'epics.schema.json' mapping since standalone epic files have content.{id,title,stories,...} structure incompatible with the content.epics[] collection schema, (3) updated epics.schema.json to accept manifest ref entries (`{id, title, status, file}`) alongside full inline epics via oneOf, (4) allowed additional properties in metadata.schema.json for extension-generated fields like _llmHint
- **Test Design rendering and overwriting** — Fixed an issue where multiple `test-design` files were overwriting each other in memory due to a singleton state property, replacing it with an array to support multiple test designs per project
- **Auto-reload data loss prevention** — When files are changed externally, the extension now only notifies the canvas (showing a "Reload" badge) instead of forcing an immediate state reload that overwrote unsaved user edits in the Detail Panel
- **Test cases missing from story cards** — Test cases without an `id` field were silently dropped during reconciliation; they now get an auto-generated `TC-{N}` identifier
- **Test case data loss on save** — `id` and `status` fields were being stripped from test case objects during serialization, causing manually added test cases to lose their identity after save
- **Epic ID mismatch in test design** — Test design artifacts using prefixed epic IDs (e.g. EPIC-15) failed to match against epics.json entries using numeric IDs (15); added normalizeEpicId() helper for case-insensitive, prefix-agnostic matching
- **Story ID mismatch in test cases** — Story IDs with `S-` prefix (e.g. `S-15.1`) were not matched against stories using bare numeric IDs (`15.1`); added normalizeStoryId() helper for flexible matching
- **Epic swimlane height accumulation** — Fixed bug where expanding multiple stories in the same horizontal row caused the epic swimlane to grow excessively tall by incorrectly summing their expansion heights instead of using the maximum height

### Artifact Array Migration

- **Migrated standalone singletons to arrays** — Refactored schemas and `ArtifactStore` to support arrays of `codeReview`, `techSpec`, `testReview`, `retrospective`, `changeProposal`, `uxDesign`, `readinessReport`, and `sprintStatus` instead of overwriting singletons
- **Fixed testing suite childBreakdown bug** — Corrected `artifact-transformer` to appropriately use `b.types.includes` when mapping tasks and testcases to childBreakdown items in story components

### Standalone Epic Files

- **Epic file extraction** — Each epic is now saved to its own file under planning-artifacts/epics/epic-{id}.json, and epics.json becomes a lightweight manifest with metadata + refs (id, `title`, `status`, `file`). Reduces monolithic file size from 5,000+ lines to ~300-500 per epic, improving LLM token efficiency and git diffs
- **Backward compatible loading** — Projects with monolithic inline epics.json (old format) continue to load normally; epics are auto-split to standalone files on the next save
- Generated alongside stories-index.json on every sync, providing a compact index of all epics for LLM consumption
- **LLM file structure guidance** — Three layers of orientation for LLMs: self-documenting `_llmHint` in manifest metadata, File Structure Reference in workflow stubs (`/epics`, `/stories`), and auto-generated README.md in the output folder with a complete file layout map and quick-reference table

### Schema ID Convention Audit

- **12 schemas updated with ID format guidance** — Added explicit descriptions with canonical format examples to `epicId`, `storyId`, `testId`, `riskId`, and other ID fields across `test-design`, `epics`, `story`, `traceability-matrix`, `code-review`, `retrospective`, `atdd-checklist`, `nfr-assessment`, `change-proposal`, `readiness-report`, `test-design-qa`, and `test-design-architecture` schemas. This guides LLMs to generate consistent numeric-format IDs (e.g. `'15'` for epics, `'15.1'` for stories) instead of ad-hoc formats

## 0.3.1

### IDE Installer Overhaul

- **Workflow stub provisioning** — "Install Framework to IDE" and auto-install now create .agent/workflows/ with 29 workflow stubs (refine.md, enhance.md, dev.md, sprint.md, etc.) so Antigravity and other IDEs can discover all `@agileagentcanvas` slash commands without needing the VS Code chat participant API
- **Schema reference file** — Installs .agent/schemas-location.md pointing the LLM to the extension's bundled schema directory, so it can read and validate against BMAD schemas without duplicating 41 schema files into every workspace
- **Fixed legacyDirs regression** — Removed `.agent/workflows` from Antigravity's `legacyDirs` cleanup list (also `.windsurf/workflows` for Windsurf, `.rovodev/workflows` for Rovo Dev). The installer was incorrectly treating the workflows directory as legacy and deleting it on every auto-install, breaking all slash-command workflows

### Schema Relaxation (0.3.1)

- **94 enums relaxed across 33 schema files** — Category, type, and classification enums (e.g. `category`, `type`, `testType`, `scanType`, `channel`, `changeType`) converted from strict `enum` to open `string` with `description` listing recommended values. This prevents schema validation failures when LLMs generate domain-appropriate values not in the hardcoded list. Status, priority, severity, and workflow-state enums remain strict

### Bug Fixes (0.3.1)

- **Swimlane height adaptation** — Story card base height now accounts for inline task/test progress chips and expandable rows, preventing overflow into adjacent epic swimlane bands
- **Folder display in toolbar** — Active folder name correctly displays in the canvas toolbar; folder selection button works reliably across single and multi-root workspaces

## 0.3.0


**This release is large — - **`fitCriteria.security` enum repair** — Invalid security `category` and `verificationMethod` values in epic fit criteria are remapped to valid schema enum values via comprehensive lookup tables**

### Story Children Layout Refactor

- **Compact story cards** — Task and test-coverage cards are no longer stacked vertically below stories; stories now show inline `childBreakdown` badges ("3 Tasks ▸", "5 Tests ▸") and compact summary chips with progress bars, dramatically reducing epic row height
- **Inline task/test progress chips** — Story cards display a `✓ 2/3` task completion chip (with micro progress bar) and a `🧪 4/5` test coverage chip, turning green when all pass and red when tests fail
- **Expandable task/test rows** — Clicking the summary chips or badges expands individual task rows (with checkbox, description, effort hours) and test rows (with status icon, title) inline within the story card. Expanded content overflows the card boundary with a slide-in animation
- **Switch/browse button always visible** — Fixed stale test that expected the folder switch button to hide when only one project was detected; the button is now always visible as it doubles as a folder browser

### Artifact Reference Architecture

- **Single source of truth for stories** — Stories now use `id` (replacing `storyId`) and require `epicId` in the schema. Standalone story files are routed to their correct parent epic by `epicId` instead of being dumped into the first epic
- **Requirements deduplication** — `requirementsInventory` is no longer written back to epics.json on save; PRD is the authoritative source. Epics.json requirements are loaded as a backward-compatible fallback only
- **Test strategy priority** — Standalone test-strategy.json is the authoritative source; inline `testStrategy` per epic is treated as a fallback for projects without a standalone file
- **Migrate to Reference Architecture command** — New command (Ctrl+Shift+P → "Migrate to Reference Architecture") extracts inline stories from epics.json to individual files in implementation-artifacts/, replaces them with string refs, and removes `requirementsInventory`. Creates a backup before migration
- **Restore Pre-Migration Backup command** — Reverts epics.json to the pre-migration backup with one click
- **Story dependency normalization** — Flat `string[]` dependencies are normalized to `{blockedBy: [...]}` on load and reverse-normalized on save for backward compatibility
- **Story status and ID preservation** — `id` and `status` fields are no longer stripped from stories during save
- **Orphan story safety** — Standalone stories without a matching `epicId` are now logged as warnings instead of being silently added to an unrelated epic
- **Stories index manifest** — stories-index.json is auto-generated on every save, listing all stories with `id`, `title`, `epicId`, and `status` for quick lookup by tools and workflows
- **BMAD workflow alignment** — Updated epics-template.json (removed requirementsInventory, added epicId to story template), create-story/template.json (storyId → id), and step-03 instructions with Story Identity Rules for the reference architecture
- **Migration auto-detection** — On load, if epics.json contains inline stories, shows a one-time notification with a "Migrate Now" button to extract them to standalone files

### Story Generation Fixes

- **`updateArtifact` creates standalone story files** — When the LLM calls `agileagentcanvas_update_artifact(type='story', ...)` for a story that doesn't already exist, it now creates a standalone story file in `implementation-artifacts/` and routes it to the parent epic via `epicId` derivation — previously, new story creation silently failed
- **BMAD workflow alignment** — Updated 5 workflow step files (`step-03-create-stories`, step-03a-story-enhancement, step-04-final-validation, convert-to-json/workflow, dual-output-json) to remove conflicting "append to epics.md" instructions and replace with agileagentcanvas_update_artifact calls, id (not storyId), and epicId
- **Tool description improvements** — `agileagentcanvas_update_artifact` description now explicitly states that stories are standalone files, must include `epicId`, and use `id` (not `storyId`)

### Requirements Data Persistence

- **PRD requirement extraction** — Non-functional and additional requirements from the PRD are now extracted into the requirements map during loading. Previously the PRD was stored raw but its requirements were never extracted, causing NFR and additional requirements to be invisible when no standalone requirements file existed
- syncToFiles now writes a standalone requirements.json to the solutioning-artifacts (or planning-artifacts) directory, preserving all requirements across save-reload cycles. Previously requirementsInventory was stripped from epics.json on save without a replacement, causing NFR and additional requirements to vanish after the first save
- **Auto-migration** — On first load, if no standalone requirements.json exists on disk but requirements are found in memory (from PRD, requirementsInventory, or functional-requirements.json), a standalone requirements.json is automatically written to ensure data survives across save cycles
- **Load priority** — Standalone requirements.json now takes priority over PRD for each requirement category. When standalone exists, PRD extraction is skipped for that category to prevent duplication
- **Requirements schema** — New requirements.schema.json defines the bulk file format with `functional`, `nonFunctional`, and `additional` arrays
- **PRD schema updated** — Added missing `additional` requirements array to prd.schema.json
- **Workflow update** — step-10-nonfunctional.md now documents that PRD requirements are auto-extracted to standalone files on first canvas load

### Folder Selection Discoverability

- **Always-visible folder button** — The folder button in the canvas toolbar is now always visible, not just when 2+ projects are detected. Clicking it opens a picker to switch between detected projects, browse for any folder, or create a new custom-named project folder
- **"Create New Folder..." option** — The switch-project picker now offers a "Create New Folder..." option that prompts for a folder name, creates it in the workspace, and switches to it — so users can start fresh in a custom folder without editing settings
- **Empty state browse button** — The canvas empty state now shows a "Browse / New Folder" button alongside "Create Sample Project", giving new users an obvious path to load from or create a project in a custom folder
- **Help modal guidance** — Getting Started section updated with clear instructions for folder selection: toolbar button, settings option, and Load Existing Project command
- **Improved setting description** — `agileagentcanvas.outputFolder` setting now explains that it controls the default subfolder name and that the toolbar folder button offers an alternative
- **Sidebar switch link** — Added "Switch / Browse Project Folder" link to the sidebar welcome view
- **Active folder label in toolbar** — The toolbar folder button now displays the name of the currently active project folder (e.g. `.agileagentcanvas-context`), so users always know which folder is loaded. The label truncates gracefully for long names and updates dynamically when switching folders

### Bug Fixes (0.3.0)

- **Epic Definition of Done display** — The DoD section in the Epic detail panel was not rendering because artifact-store.ts was flattening the rich DoD object (`{items, qualityGates, acceptanceSummary}`) into a plain string array; now passes the full object through to the renderer

### Side Panel Improvements

- **Architecture tree** — Architecture documents now appear in the artifacts side panel with expandable sub-items: Overview, Decisions (ADRs), System Components, Patterns, Integrations, Tech Stack, and Security
- **Risks tree** — Standalone risks now show in the side panel as an expandable section with individual risk items displaying severity icons and category/probability/impact metadata
- **Requirements drill-down** — Functional, Non-Functional, and Additional requirement categories are now expandable to show individual requirement items with priority icons and IDs

### Data Persistence

- **Test strategy on epics** — `testStrategy` is now preserved when saving epics to JSON; previously the field was stripped during serialization via destructuring
- **Architecture decisions on requirements** — `architectureDecisions` field is now included in requirement serialization, ensuring architecture-linked requirements round-trip correctly

### Schema Repair

- **Send to Chat on fix failure** — Schema issues that auto-repair cannot resolve now show a "Send to Chat" button alongside "Dismiss". Clicking it opens the AI chat with the affected file(s), schema type(s), and validation error details so the agent can read and fix them directly
- The generated stories index manifest is no longer misidentified as a `story` artifact during type detection, eliminating false schema warnings
- **Inline story required fields repair** — Inline story objects in epics that lack `id`, `title`, `userStory`, or `acceptanceCriteria` now get auto-filled; stories with only `storyId` are converted to string refs
- **`uxReferences` object-to-string repair** — Inline story `uxReferences` that contain objects (rather than the schema-required `string[]`) are now flattened to descriptive strings
See [docs/changelog/0.3.0.md](docs/changelog/0.3.0.md) for the full detail.

## 0.2.1

### Canvas Layout Refinements

- **Swimlane spacing** — Added visible gaps between Planning, Solutioning, and Implementation lane backgrounds; lanes no longer visually touch each other
- **Epic swimlane band margins** — Epic and testing row bands within the Implementation lane now have horizontal (10px) and vertical (6px) insets with rounded borders, giving cards breathing room inside bands
- **Cards contained within epic bands** — All Implementation lane cards shifted inward by 20px (`IMPL_CARD_INSET`) so cards no longer overlap the epic band border
- **Mindmap view spacing** — Increased vertical gap between sibling nodes (16→28px) and horizontal gap between depth levels (60→70px) for better readability and group-box clearance
- **Epic risk cards removed** — Risks are now shown only under PRD in the Planning lane; epic-level risk card creation removed entirely to eliminate apparent duplication (epic metadata still carries risk data for the detail panel)
- **Lane height adaptation** — Swimlane heights now filter cards by x-position bounds, preventing Implementation-lane cards from inflating Planning lane height

### Schema Validation Fixes

- **Epic risks schema** — risks field in the epics schema now accepts both the full risks.schema.json object wrapper and a bare array of risk items via oneOf, matching real-world project data
- **Metadata stepsCompleted** — `stepsCompleted` items in the common metadata schema now accept both strings and objects (`oneOf`), accommodating workflows that store step objects instead of plain step IDs
- **Date-time format repair** — The schema repair engine now auto-coerces non-ISO-8601 date strings to proper `date-time` format (e.g. `"March 1 2026"` → `"2026-03-01T00:00:00.000Z"`)
- **Smart array→object wrapping** — When the schema expects an object but data is a bare array, the repair engine now wraps the array into the first array-typed property of the expected object instead of discarding data

### Canvas Regression Fix

- **Requirements parent corrected** — When a PRD exists, requirements, NFRs, and additional-reqs now have `parentId: prd-1` instead of `vision-1`; Vision only owns these children when no PRD is present. This fixes badge toggles on Vision affecting requirements that visually belong to the Planning lane alongside PRD
- **Vision badges scoped to owned children** — Vision's `childBreakdown` no longer claims requirement/NFR/additional-req counts when a PRD exists, preventing duplicate badge counts across two parent cards
- **Epic risk cards no longer scramble Planning grid** — Client-side grid reflow now filters children by semantic parent (PRD/Vision for Planning, Architecture for Solutioning) instead of just by card type, so epic-level risks are no longer pulled into the Planning lane
- **Stable grid reflow positioning** — Grid reflow start Y is now computed from the parent card's bottom edge rather than from the first visible child, preventing vertical drift when top-row children are hidden by category toggles
- **Consistent 20px lane margins** — Solutioning and Implementation lane backgrounds now start 20px before the first card column, matching Discovery and Planning lanes

### Quality Engineering

- **Coverage gates enforced** — Added global c8 thresholds (`lines`/statements 50%, branches 55%, functions 60%) and a module-level gate script (check-coverage-thresholds.js) for src/state, src/chat, and src/workflow
- **CI/test script hardening** — Added `test:coverage:gate` and updated `test:coverage:ci` to execute module threshold checks after coverage generation

### Logging

- **Structured logger sink support** — Logger now supports an output sink so `info`/`warn`/`error` can be routed to the Agile Agent Canvas Output channel while keeping debug logs console-oriented
- **Configurable verbosity** — Added `agileagentcanvas.logLevel` setting with `debug|info|warn|error` levels
- **Debug-noise reduction** — Replaced high-volume direct logging in core modules with scoped logger usage (`artifact-store`, `chat-bridge`, `extension`, `artifact-transformer`)

### Refactoring

- **Chat command dispatch simplification** — Replaced large command switch in `chat-participant` with map-based command routing to reduce branching complexity
- **Workflow parser extraction** — Moved YAML frontmatter parsing into a dedicated utility module and re-exported for compatibility
- **Artifact persistence decomposition (slice 1)** — Added `artifact-file-io` helpers (`resolveArtifactTargetUri`, `writeJsonFile`, `writeMarkdownCompanion`) and migrated save paths to use them
- **Test artifact JSON write consistency** — Migrated remaining test artifact save methods (`test-cases`, `test-strategy`, `test-design`) to `writeJsonFile`

## 0.2.0

### Canvas Layout Overhaul

- **4-per-row grid layout** — Planning and Solutioning swimlanes now stack child cards in a 4-column grid (240px wide) instead of a single vertical column, making much better use of horizontal space
- **Card height optimization** — Removed forced `minHeight` from all card rendering modes (phase-node, compact, full); cards now shrink to fit their actual content with no wasted empty space
- **Categorized child breakdown badges** — Parent cards (Vision, PRD, Architecture, Epic) now show per-category badges (e.g. `3 Risks`, `4 Requirements`, `1 NFR`) instead of a single opaque child count number; badges are clickable to expand/collapse children and visually indicate expanded/collapsed state
- **Widened Planning and Solutioning lanes** — Both lanes expanded from 320px to 1060px to accommodate the grid layout; Implementation lane repositioned accordingly

### Per-Category Badge Toggle

- **Independent category toggles** — Clicking a badge on a parent card (e.g. `3 Risks` on PRD) toggles visibility of only that category's children; other categories remain unaffected. Each badge displays an inline chevron indicating expanded/collapsed state
- **Per-category state management** — New `expandedCategories` state (`Map<string, Set<string>>`) tracks which badge labels are expanded per parent; `expandedIds` is derived automatically (parent is "expanded" if any of its categories are active)
- **Lane expand/collapse syncs categories** — Clicking a swimlane's expand/collapse all button also updates per-category state for every parent in that lane
- **All categories expanded on project load** — When a project is loaded, every parent's categories start expanded (matching previous behavior)
- **Removed old expand/collapse chevron** — The single expand/collapse button in the card header has been replaced by per-badge toggles

### Epic Children Reorder

- **Stories placed last in epic rows** — Within Implementation epic horizontal swimlanes, child subgroups are now ordered: Use-Cases → Risks → Test Strategy → Epic-Only Tests → Stories (with their tasks/test-coverage stacked below). Previously stories appeared first, which was unintuitive since they depend on the other artifacts
- **Badge order matches layout** — Epic card breakdown badges reordered to match the new subgroup layout: UCs → Risks → Test Strategy → Tests → Stories → Tasks

### Lane Top Margin Fix

- **Consistent top margin for all swimlanes** — Discovery, Planning, and Solutioning lanes now have proper top margin (~32px) between the lane header background and the first card, matching the visual spacing that the Implementation lane naturally gets from its epic row padding. Introduced `LANE_CARD_TOP = 100` constant replacing the hardcoded `yOffsets` initial value of `70`

### Dynamic Swimlane Height

- **Client-side grid reflow** — When per-category toggles hide mid-grid children, remaining visible children are recompacted into a gap-free 4-column grid layout (matching the server-side GridPlacer logic), eliminating empty spaces left by hidden cards
- **Automatic lane height adaptation** — Planning and Solutioning swimlane heights now shrink dynamically when categories are collapsed, since the grid reflow moves visible children upward to fill gaps; lane heights are computed from the reflowed positions

### Refactoring (0.2.0)

- **Eliminated duplicate layout engine** — Replaced the 500-line stateToArtifacts() in canvas-view-provider.ts with a 3-line wrapper delegating to the canonical buildArtifacts() in artifact-transformer.ts, removing a significant source of drift between the editor panel and sidebar views

### Tests

- **Updated BDD feature tests** — All X-position assertions updated for new lane positions; overlap checks updated for 2D grid layout; test-case consolidation into test-coverage reflected; requirement dependency changed from `dependencies` to `parentId`
- **Updated unit tests** — ArtifactCard expand/collapse tests updated for per-badge toggle behavior; Canvas tests updated with `expandedCategories` and `onToggleCategoryExpand` props; App tests updated to use badge click instead of `.expand-btn`

## 0.1.0

Initial release as **Agile Agent Canvas** (previously "BMAD Studio").

### Features (0.1.0)

- **Visual Canvas** — 4-lane workflow canvas (Discovery, Planning, Solutioning, Implementation) with color-coded artifact cards, dependency arrows, minimap, and inline detail editing
- **AI Chat Participant** — `@agileagentcanvas` in VS Code chat with 30+ slash commands for vision, requirements, epics, stories, design thinking, code review, and more
- **Language Model Tools** — `agileagentcanvas_read_file`, `agileagentcanvas_list_directory`, `agileagentcanvas_update_artifact` for autonomous AI interactions
- **44 Built-in Workflows** — Structured product development processes with steps, validation checkpoints, and automatic artifact population
- **Multi-Provider AI** — Supports GitHub Copilot, OpenAI, Anthropic, Gemini, Ollama, and Antigravity
- **Export/Import** — Export to Markdown, JSON, JIRA CSV; import from JSON with Replace or Merge strategies
- **Sidebar Views** — Canvas, Artifacts tree, and Workflow Progress views in the activity bar
- **BMAD-METHOD Framework** — Bundled methodology content for agents, workflows, schemas, and checklists
