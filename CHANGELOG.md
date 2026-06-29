# Changelog

## 0.5.6

### Fixed: Windows reserved-name files blocked VSIX packaging

`vsce package` failed with *"The extension contains an entry extension/webview-ui/nul which is unsafe for extraction"* — two stray files literally named `nul` (a Windows reserved device name, like `con` / `prn` / `com1`) had regenerated in the source tree from a misdirected shell redirect.

- Files deleted.
- `scripts/prepublish-guard.js` now scans the entire source tree for the full Windows reserved-name set (`nul`, `con`, `prn`, `aux`, `com1`–`com9`, `lpt1`–`lpt9`) and fails the build before `vsce` gets a chance to reject the package. Skips `node_modules`, `.git`, `dist`, `coverage`, `reports`, and `webview-ui/build` to keep the scan fast.

## 0.5.5

### Highlights

The Agentic Kanban can now run cards end-to-end without human intervention. Visual Plan comments actually reach the AI. Context compression is provably accurate via real BPE tokens. 13 new BMAD v6.9.0 skills ship out of the box. Plus 32 WCAG contrast fixes across autonomy surfaces.

### Agentic Kanban: autonomous auto-advance

The Kanban can now drive a story through implement → review → done on its own.

- **`agileagentcanvas.kanban.autoAdvance`** setting (default off) — toggleable from the Kanban toolbar or Settings.
- Cards dropped into **In-Progress** run the loop, re-implementing on review failures up to `maxIterations` (default 3).
- Singleton orchestrator owns the concurrency lock for the entire run; a second drop on the same story is rejected.
- Optimistic-drop rollback — failed transitions return the card to its source column.
- New live progress events (`running` / `completed` / `interrupted` / `failed`) shown as card badges.

### Structured verdict contract

Both headless terminal and in-chat execution paths now produce and consume a structured verdict so the orchestrator can decide whether to auto-advance.

- Verdict shape: `COMPLETED | APPROVED | NEEDS_FIXES | BLOCKED | UNKNOWN`. The verdict file on disk is the single source of truth; missing or unparseable files yield `UNKNOWN` and the orchestrator stops rather than guessing.
- `NEEDS_FIXES` carries a `fix_requests` array attached to artifact metadata before the next iteration.
- Shared verdict helpers (path, sanitization, normalization, file reader) live in one module so terminal and chat paths can't drift.

### Visual Plan fixes

- **Request Changes now bundles comments** — typed comments automatically included as change annotations.
- **Approve & Dispatch nests stories properly** — real Story artifacts under the source epic with proper BMAD fields; free-form plans auto-create an epic.
- **Goal decomposer creates one epic per batch** — shared epic ID, full BMAD schema fields per story.
- **Visual-plan card overflow fixed** — tree-nested plan cards stay inside epic row bands.

### Headroom (context compression)

The in-process compression proxy is now owned by the extension — no manual `npx headroom-ai proxy` step.

- **In-process proxy** — listens on `127.0.0.1:8787`, auto-disposed on deactivation. Coexists with an external proxy if port is taken; status bar distinguishes "extension proxy", "external proxy", and "failed" states.
- **Status bar always visible** — distinct text/tooltip per state (disabled, starting, offline, active with stats). Click-through QuickPick for SharedContext, CCR store, and recent-call drilldowns.
- **Real BPE token counts** (Phase 3.1) — replaces the `len/4` heuristic with `gpt-tokenizer` cl100k_base so the savings percentage matches what the SDK bills.
- **Tool-result summarisation** (Phase 3.2) — array/object tool outputs get truncated before tokenisation, with re-stringify + parse-verify guard for safety.
- **CCR cross-call dedup with LRU** (Phase 3.3) — SHA-256 keyed store, `/v1/retrieve` endpoint for original-content lookup, `/v1/retrieve/stats` for live metrics.
- **Headroom Simulate / Retrieve** LM tools — preview savings before committing; resolve a content hash back to the original text.
- **A2A handoff compression** — intermediate artifacts compressed through SharedContext during agent-to-agent handoffs.

### BMAD v6.9.0 parity (13 new skills)

Catalogue auto-discovers the new skills without further wiring.

- **`aac-forge-idea`** — Socratic idea pressure-testing with optional `--attack` adversarial mode.
- **`aac-architecture-spine`** — Lean intent-based architecture; produces `ARCHITECTURE-SPINE.md` as the source of truth.
- **`aac-party-mode` enhancements** — Four run modes (`auto` / `session` / `subagent` / `agent-team`), custom parties from TOML, persistent party memory.
- **`aac-brainstorming`** — New `brain-selector.html` visual composer (69 techniques); 8 new techniques (HMW, JTBD, Empathy Map, Backcasting, TRIZ, Fishbone, Build on What Works, Scenario Cross); explicit diverge → organize → converge → commit phasing; top-level facilitation mode selector.
- **`aac-create-architecture`** — Breadth-coverage rubric added per altitude.
- **`aac-create-epics-and-stories`** — Recognises AAC-adapted `*ux*/**/DESIGN.md` and `EXPERIENCE.md` spines.
- **Retrospective action items in `sprint-status.yaml`** — `action_items:` array alongside epic-retrospective status, validated by schema and surfaced by `aac-sprint-status`.

### Addy Osmani + Matt Pocock skills parity (11 new skills)

All adopt the addyosmani section anatomy (Overview / When to Use / Process / Rationalizations / Red Flags / Verification). Skill pruning pass also applied to top-5 AAC skills (`aac-create-story`, `aac-create-prd`) — removed stale duplicates and collapsed overlapping rule sections.

- Addy Osmani (7): `aac-doubt-driven-development`, `aac-source-driven-development`, `aac-observability-and-instrumentation`, `aac-deprecation-and-migration`, `aac-context-engineering`, `aac-shipping-and-launch`, `aac-frontend-ui-engineering`.
- Matt Pocock (4): `aac-domain-modeling`, `aac-codebase-design`, `aac-handoff`, `aac-resolving-merge-conflicts`.

### Chat providers

- **`pi` (pi-mono) is now a first-class chat provider** — wired for headless terminal agentic execution with `pi --no-session --mode json --approve -p <prompt>`. Honours the user's own `pi` config for provider/model routing. **Do not enable in untrusted workspaces** — `--approve` auto-trusts project-local agent rules.
- **Provider selector dropdown fixed** — real availability detection, official brand SVGs, OMP standalone CLI detected when extension is missing, Claude CLI invocation corrected, OpenCode added as a first-class provider.

### Canvas fixes

- **Plan button hidden behind minimap** — `.canvas-content` layered above `.minimap` with `pointer-events: none` so cards in the bottom-right corner stay visible; clicks still fall through to the canvas pan handler on empty area.
- **mindmap-toggle consolidated** — duplicate button removed; remaining button uses context-aware icon (`grid` for lanes, `mindmap` for graph views). Status conveyed by icon rather than color-only cue (WCAG 1.4.1).
- **corpus3d mode restored** — keyboard `L` cycle remains 2-mode (`lanes ↔ mindmap`) so the 2-press-reset contract holds; button cycles all three (`lanes → mindmap → corpus3d`).
- **Canvas workflow modal phase assignment** — 13 new `aac-*` skills now route to their natural phase; `extractTriggerPhrase` extended for the addyosmani-style "Use when [conditions]" descriptions.
- **Regression guards** — new tests for canvas z-index layering, plan card overflow, and the artifact-store change listener that rebuilds the canvas on every mutation.

### Accessibility (32 WCAG contrast fixes)

Themed-token × surface contrast audit found 32 sub-3:1 pairs across autonomy surfaces against Dark+ / Light+ / HC-Dark. Fixes shipped:

- **Renderer-tag family** — tokenized to `var(--vscode-charts-*, #UniversalFallbackHex)`; per-theme contrast floors locked by regression test.
- **Pulse halos** — `inbox-pulse` and `safety-pulse` tokenized; `fleet-health-pulse` switched from opacity flicker to scale-only heartbeat so contrast stays at 1.0.
- **Terminal tile dot status colors** — switched from hardcoded GitHub-Dark hexes to theme-aware tokens.
- **Approve & Dispatch banner** — parent wrap bg tokenized to `var(--vscode-editorWarning-background, ...)`.
- **Cluster D-3 / D-4 / D-5** — shared nested-paren regex bug patched in both audit-script and test resolver; canonical alpha-blend branch mirrored; TOKS-rgba-blend helper factored.
- 9 new tests across 3 themes lock the fix surfaces against future regression.

### Ponytail minimalist heuristics in every prompt

A "necessity first, then stdlib, then native, then existing deps, then one-liner, then implementation" hierarchy is now baked into every system prompt — chat replies, workflow execution, multi-agent handoffs, terminal agents, antigravity orchestrator, goal decomposer. NOT-lazy-about exceptions (input validation, error handling, security, accessibility, calibration, explicit user requests) remain non-negotiable.

### `/ponytail-review` slash command

Audits an artifact (`/ponytail-review EPIC-3`) or whole project for reinvented stdlib, unneeded dependencies, speculative abstractions, complexity bloat. Findings carry severity + a concrete simpler alternative; full review persists as a code-review artifact.

### Phase 2 refactors

- **BMAD → AAC close-out** — six catalogue rows added; documentation examples updated to real framework paths or explicit `mock-workflow-fixture` literals. Residual footprint mapping finalized.
- **Phase 18 — `pickChanges` helper centralised** — single shared `reducer-helpers.ts` module; 26 named `*_FIELDS` consts lifted to module level across cis/tea/bmm/l1 for grep-discoverability.
- **`useEvent` migration** — entire webview UI converted from `useCallback`/inline arrows to `useEvent` for stable handler identity. 3 useRef stale-closure workarounds deleted. No user-visible behavior change.

### Bug fixes

- Harness pre-flight now evaluates the **merged candidate** instead of the bare delta — auto-fix no longer overwrites real artifact fields with generic placeholders.
- Lane transitions with only `terminalWorkflowId` (e.g. review → done) no longer silently dropped.
- Trace recorder step definitions use the OS temp dir instead of polluting the project root.
- Vision type boundary cleaned up — `id` / `title` / `status` exposed at the top level; structural cast removed; zero `as any` casts in production source.
- Lane-transition test aligned with the dropped dev-story confirm modal.
- 6 pre-existing mindmap-toggle test failures fixed by switching `layoutMode` from derived `const` to local `useState`.
- Lane-transition concurrency: 4 critical issues from the Kanban Agentic OS deep audit fixed — correct chat vs terminal dispatch path, circuit-breaker/budget errors never retried, in-chat session health monitoring, terminal reconnection actually matching by terminal name.

### Test infrastructure

- Cucumber `vscode-shim` listed FIRST in default and ci profiles (its `Module._load` hook installs before step files import `vscode`).
- New `wip` profile runs the 19 `@wip`-tagged scenarios with `transpile-only` for fast iteration.
- Regression guards added for: canvas z-index layering, plan card overflow, artifact-store change listener, dev-story confirm-modal skip contract, a11y contrast matrix per theme, renderers.css shape, lane-transition concurrency.

### New feature: Cross-Artifact Systemic Issue Detection

The harness engine feeds policy evaluation failures into a cross-artifact pattern detector. When the same policy fails on ≥3 artifacts, a color-coded banner appears in the Agentic Kanban with expandable pattern details and a dismiss action.

### Feature: Headroom quick-pick

Click the active Headroom bar to surface a transient QuickPick with SharedContext (A2A handoffs), CCR store, and Recent Compress Calls drilldowns. Settings stays reachable from the quick-pick.

---

## 0.5.4

### Highlights

Transparent context compression ships out of the box. Full BMAD v6.8.0 module update across core + BMM, BMB, TEA, and CIS.

- **Headroom context compression** — auto-detects the Headroom proxy, lazy-loads the SDK on first chat call, transparently compresses all LLM-bound messages. Tracks cumulative savings. `agileagentcanvas.headroom.enabled` opt-out setting. Status bar shows savings % alongside cost when active.
- **BMAD v6.8.0** — 4 new V6 skills (`bmad-spec`, `bmad-investigate`, `bmad-prd`, `bmad-ux`); BMB 0.1.6 → 1.1.0 (agent-builder, workflow-builder); TEA 1.3.1 → 1.19.0 (all 9 workflows); CIS 0.1.8 → 0.1.9 (6 new agent personas — Carson, Dr. Quinn, Maya, Victor, Caravaggio, Sophia).

---

## 0.5.3

### Highlights

Custom ESLint rule, agent-to-agent message bus, the first Agentic Kanban view, multi-agent team execution (ACP), harness governance loop, and the trace recorder.

- **`no-bare-assert` ESLint rule** — every `assert.strictEqual` / `assert.ok` / `assert.deepStrictEqual` in step definitions must include a descriptive message. ~98 bare assertions fixed across 12 files.
- **Agent-to-Agent Message Bus** (`src/acp/agent-bus/`) — dynamic peer-to-agent discovery with capability-based routing, pub/sub with wildcard topics, priority queuing, handoff negotiation.
- **Agentic Kanban View** — webview-registered kanban with shared `KanbanCard` / `KanbanColumn` components; lane transition engine; session restoration.
- **Multi-Agent Team Execution (ACP)** — `AcpSession`, `AgentTeamOrchestrator` with TEAM_REGISTRY (dev-story, refactor, generate-code, review-code teams). `agileagentcanvas.agentTeam.enabled` feature gate.
- **Harness Governance Loop** — synchronous policy engine (trace-anomaly, feedback-accumulation); severity escalation advisory → warning → blocking; active failures injected into agent prompts; pre-flight blocks on blocking failures.
- **Trace Recorder** — per-session JSONL logging (tool calls, LLM responses, decisions, errors, handoffs); `agileagentcanvas.trace.enabled` + `trace.retentionDays` settings.
- **YOLO mode** — `agileagentcanvas.yoloMode` setting for skipping interactive checkpoints.
- **VSIX build pipeline** — `npm run compile` runs type-check + esbuild + webview UI sequentially; verified VSIX at 3.87 MB.

---

## 0.5.2

- **Fixed: NUL filename packaging error** — two files literally named `NUL` (Windows reserved device names) deleted; VSIX publishes cleanly.

---

## 0.5.1

### Highlights

3D Corpus view with custom shapes per artifact type, real provider detection in the dropdown, mindmap redesign, 3D corpus search & filter.

- **3D Corpus view** — force-directed 3D graph with per-type shapes (Sphere / Cone / Box / Cylinder / Torus / Tetrahedron / Dodecahedron / Octahedron); phase color coding; auto-rotation; click-to-select; animated edge particles.
- **Provider Selector dropdown fixed** — real availability detection across copilot / claude / cursor / windsurf / antigravity / omp / opencode / codex / aider; official brand SVGs; OMP standalone CLI detected; Claude invocation corrected.
- **Mindmap redesign** — larger cards, depth-based group boxes, stronger phase nodes, depth-graded tree lines with arrowheads.
- **3D Corpus Search & Filter** — real-time filter; matched nodes stay bright, non-matched dim; auto-frame on single match; "N found" badge.
- **Tree-shaken THREE import** — webview bundle 2,179 kB → 1,570 kB (~28% reduction).
- **Card overlays removed** — artifact names now via native tooltip; eliminates per-frame DOM updates.

---

## 0.5.0

### Highlights

JSON↔Markdown bouncing eliminated (root-cause fix for LLM sync loops). Provider-level structured outputs. 10 new built-in tools (16 → 26). Tool catalog & telemetry.

- **JSON↔Markdown bouncing fixed** — artifact writes are JSON-only; stale `.md` companions auto-renamed to `.md.bak` on upgrade; LLM persona override forbids reading `.md` as source of truth.
- **Provider-level structured outputs** — `response_format: json_object` (OpenAI), tool-use schema (Anthropic), `responseSchema` (Gemini), `format` parameter (Ollama), `JsonObject` (VS Code LM). Configurable `agileagentcanvas.defaultTemperature` (default 0.2).
- **Robust fence stripping & validation** — new `json-extract.ts` handles fenced/bare JSON; validation retry loop with escalating feedback.
- **10 new built-in tools** — `agileagentcanvas_repair_json`, `agileagentcanvas_frontmatter_extract`, `agileagentcanvas_yaml_to_json`, `agileagentcanvas_json_diff`, `agileagentcanvas_json_merge`, `agileagentcanvas_write_file`, `agileagentcanvas_sync_story_status`, `agileagentcanvas_sync_epic_status`, `agileagentcanvas_graph_community`, `agileagentcanvas_artifact_query`, `agileagentcanvas_workflow_resolve_vars`, `agileagentcanvas_types_from_schema`, `agileagentcanvas_schema_from_json`, `agileagentcanvas_codebase_search`.
- **Tool catalog & telemetry** — `docs/tool-catalog.md` (authoritative reference for all 26 tools); few-shot examples injected into every system prompt; `toolTelemetry` singleton with JSONL persistence; `/suggest-tool` command; weekly waste report.

See [docs/changelog/0.5.0.md](docs/changelog/0.5.0.md) for the full detail.

---

## 0.4.4

- **graphify backend auto-detect & remediation** — when `agileagentcanvas.graphify.backend` is set to a non-empty value, a modal explains the routing before any work begins. "Clear setting & use VS Code LM" option for users without an external API key.

---

## 0.4.3

### Highlights

Skill Catalogue Manager and git-sourced skill repos — the extension is now genuinely extensible from a user folder or any git URL.

- **User-managed skill folder** (`agileagentcanvas.userCataloguePath`) — subfolders with `SKILL.md` treated as skills/agents; live FileSystemWatcher reload; user skills override built-ins by folder name.
- **Skill Catalogue Modal** — 5 tabs (All / Agents / Skills / User-Added / Skill Repos); create from template; delete with confirmation; open folder in Explorer.
- **Git Skill Repos** — paste any git URL; cloned with `--depth 1` into a managed `_repos/` subfolder; per-skill `.repo-source` sidecar records provenance; Sync runs `git pull` and re-discovers.
- **`/help` smart skill routing** — natural-language prompt → top 3–5 catalogue matches with one-sentence explanation. CLI-compatible markdown output. Keyword fallback if the LLM response can't be parsed.

---

## 0.4.2

### Highlights

Codeburn integration for AI cost/token observability. Graphify Index architecture corpus & modal.

- **Codeburn** — integration module under `src/integrations/codeburn/` with status bar visibility, command palette actions, `/codeburn` chat command (with `/cost` and `/tokens` aliases), and the `agileagentcanvas_codeburn_report` LM tool. Cross-platform detection (CLI / local `node_modules/.bin` / `npx` fallback).
- **Graphify Index** — `graphify index .` CLI stage generates `ARCH_INDEX.md` + `ARCH_INDEX.json` (community summaries, god-node detection, cross-community edges, token-budget metadata). `GraphifyModal` webview component with Pipeline Tracker / Arch Corpus / Recommended Actions sections.
- **`agileagentcanvas_graph_community` LM tool** — AI can query community-specific wiki content.
- **graphify integration docs** — updated with per-repo and cross-repo CI YAML templates and a Tiered Context for Coding Agents section.

---

## 0.4.1

### Highlights

Jira Cloud read integration with conflict picker. Single source of truth for status fields. CLI agent integration with full tier coverage.

- **Jira Cloud** — fetch epics/stories, dedicated modal with 5 tabs (Fetch Epics / Stories / Issue / Sync to Canvas / Connection), field-level conflict picker before any overwrite, `/jira` chat command with 4 subcommands, `agileagentcanvas_read_jira` LM tool, secure token storage in OS keychain, `/rest/api/3/search/jql` cursor-based pagination.
- **Status field consolidation** — single `status` field replaces dual `verified`/`status` and `completed`/`status` patterns; transparent migration on load.
- **Index files removed** — `stories-index.json` and `epics-index.json` deleted (LLMs were treating them as authoritative sources of truth).
- **CLI agent integration** — 13 new workflows in manifest (security-audit, ceo-review, eng-review, design-audit, verification-loop, coding-standards, e2e-testing, eval-harness, api-design, create-story-checklist, story-enhancement, epic-enhancement, dev-story-checklist); 6 delegation stubs converted to executable; artifact-type routing table in help.md; version-aware auto-reinstall.

---

## 0.4.0

### Highlights

Artifact persistence & sync fixes (payload-authoritative merge, race conditions, orphan cleanup). Claude Code workflow wrappers become executable instead of delegation stubs.

- **`writeJsonFile` payload-authoritative merge** — only `_`-prefixed extension keys preserved during re-serialization; deleted standard fields properly removed from disk.
- **Race conditions fixed** — `deleteArtifact` awaits all underlying `fs.delete` ops; `saveStoriesToFile` actively prunes orphaned JSON files.
- **Timestamp churn eliminated** — `lastModified` no longer overwrites `created`.
- **Claude Code workflow wrappers** — `/dev`, `/sprint`, `/review` etc. now load and follow the actual BMAD workflow files directly instead of saying "go to VS Code Chat". `STUB_TO_MANIFEST` lookup map routes each stub to its entry file; `refine` / `enhance` / `elicit` remain as delegation stubs (depend on VS Code extension APIs).

---

## 0.3.9

### Highlights

5 GSD-inspired skills, agent honesty guardrails, single story file architecture for implementation status.

- **5 GSD skills** — Codebase Mapper, Assumptions Analyzer, Trade-off Advisor, Execution Task Protocol, Test Classification Strategy. 4 new elicitation methods.
- **Agent honesty guardrails** — 3-state task progression (`pending` → `implemented` → `verified`); proof-of-work gate (debugLog required); explicit prohibition on fake data seeding; grep self-audit for TODO/FIXME/stub before completion.
- **Single story file architecture** — `epics/epic-{N}/stories/{id}.json` is the single source of truth for status; migration from `stories/{id}.json` + `implementation/{id}.json` automatic on load.
- **Code-review post-fix integrity re-scan gate** — mandatory re-scan for TODO/FIXME/stub after applying fixes; cannot proceed to status update with hits.
- **Dependency graph sync fidelity** — canvas dependency arrows render from epic.json → `content.stories[].dependencies`; bidirectional sync in `create-story` and `dev-story`.

---

## 0.3.8

- **Canvas export rewritten** — single offscreen capture pass driven by React state coordinates replaces the slow DOM-tiling strategy. Large exports complete in seconds; auto-crops unused empty space.

---

## 0.3.7

### Highlights

Gstack elicitation workflows, ECC-inspired skills, test case tracking, and major artifact store refactor.

- **Gstack workflows** — Security Audit (STRIDE, OWASP), Execution Lock Review, CEO Scope Review, Design Dimension Audit, Six Forcing Questions (Garry Tan).
- **5 ECC-inspired review skills** — Verification Loop, Coding Standards, E2E Testing, Eval Harness, API Design Review.
- **Test case tracking & audit** — explicit test-case extraction rules in dev-story and quick-dev; formalized `status: "done"`; code-review extraction audit closes the test-implemented-but-not-tracked loophole.
- **Artifact store refactor** — automated workflow status cascading (task open → story in-progress → epic in-progress); story JSON files as the absolute single source of truth; bidirectional status sync with sprint-status.yaml removed; `status` stripped from epic `storyRefs`.
- **Canvas UX** — Refinement menu consolidated; "Code Review", "Dev Story", "Sprint Planning" now in the Sparkle menu for Story and Epic cards.

---

## 0.3.6

### Highlights

Single canonical story file. Epic JSON slim-down with lightweight storyRefs. Code-review post-fix integrity re-scan gate.

- **Single story file** — `epics/epic-{N}/stories/{id}.json` is the canonical path; old `implementation/` directories auto-migrated on load.
- **Epic JSON slim-down** — `storyRefs[]` replaces full Story[] embedding; full story data remains in standalone files.
- **Atomic status sync tools** — `agileagentcanvas_sync_story_status` / `agileagentcanvas_sync_epic_status` for atomic multi-file updates.
- **Code-review post-fix integrity re-scan gate** — mandatory re-scan before status update closes the stub-introduced-by-fix loophole.

---

## 0.3.5

### Highlights

Acceptance Criteria as a distinct third category with verified/status lifecycle. Tabbed story detail layout. Status mapping fix.

- **Acceptance Criteria lifecycle** — distinct category on story cards (`📋 N/Total` chip with progress bar); `verified` + `status` fields extended in schema and types; three workflows (`create-story` / `dev-story` / `code-review`) updated to maintain AC lifecycle.
- **Tabbed story detail layout** — Tasks / Tests / ACs tabs replace vertical list; dynamic tabs (only those with content).
- **Status mapping fix** — `mapStatus()` now passes through all 22 valid `ArtifactStatus` values instead of collapsing to 4; Kanban column normalization into 5 existing columns.
- **Dependency graph sync fidelity** — canvas dependency arrows use precise story IDs from epic.json `content.stories[].dependencies`; bidirectional sync in `create-story` / `dev-story`.
- **Code-review enhancements** — ground-up baseline mandate (no prior review is validated baseline), TODO/stub audit, round-trip persistence audit, response-truthfulness check, AC verification before `done`.

---

## 0.3.3

- **Visible Artifact IDs** on canvas cards.
- **Schema relaxation** — `additionalProperties: true`; `devNotes.dataModels` accepts strings or structured objects; epic items accept lightweight ref entries alongside full epics.
- **Test execution tracking** — `test_execution_status` from sprint-status.yaml maps onto story test cases.

---

## 0.3.2

### Highlights

Standalone epic files. 17 schema validation warnings → 0. Use case and test strategy preservation on reload.

- **Standalone epic files** — each epic saved to `planning-artifacts/epics/epic-{id}.json`; `epics.json` becomes a lightweight manifest. Backward-compatible loading; auto-split on save.
- **Schema ID convention audit** — 12 schemas updated with explicit ID format guidance for LLM-generated IDs.
- **Artifact array migration** — refactored schemas and `ArtifactStore` to support arrays of `codeReview`, `techSpec`, `testReview`, `retrospective`, `changeProposal`, `uxDesign`, `readinessReport`, `sprintStatus`.
- **Bug fixes** — use case / test strategy preservation on duplicate-epic merge; 17 schema validation warnings → 0; test design rendering and overwriting; auto-reload data loss prevention; test case ID auto-generation; epic/story ID normalization; epic swimlane height accumulation.

---

## 0.3.1

### Highlights

IDE installer overhaul with workflow stub provisioning.

- **Workflow stub provisioning** — `.agent/workflows/` with 29 workflow stubs for Antigravity / Windsurf / Rovo Dev so slash commands work without the VS Code chat participant API.
- **Schema reference file** — `.agent/schemas-location.md` points the LLM at the extension's bundled schema directory.
- **Fixed `legacyDirs` regression** — `.agent/workflows` no longer deleted on auto-install.
- **Schema relaxation** — 94 enums relaxed to open `string` with description across 33 schema files.

---

## 0.3.0

### Highlights

Story children layout refactor. Acceptance Criteria lifecycle schema groundwork.

- **Compact story cards** — task and test-coverage cards no longer stacked; stories show inline `childBreakdown` badges ("3 Tasks ▸", "5 Tests ▸") and compact summary chips with progress bars.
- **AC lifecycle schema** — `verified` + `status` fields added to AcceptanceCriterion type (initially defaulted; behavior locked in 0.3.5).