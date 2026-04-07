# Changelog

## 0.4.1

### Single Source of Truth — Status Field Consolidation

- **Removed dual-field status pattern** — Acceptance criteria no longer use both `verified: boolean` and `status: string`; tasks no longer use both `completed: boolean` and `status: string`. The `status` field is now the single source of truth for both. Updated `story.schema.json`, `epics.schema.json`, all TypeScript types, UI components, and workflow instructions (dev-story, code-review, create-story).
- **Transparent migration on load** — `normalizeLegacyArtifact()` runs on every artifact read and write, converting old dual-field format to the new single-field format automatically. Old files are upgraded on next save.

### Single Source of Truth — Index Files Removed

- **stories-index.json and epics-index.json deleted** — These generated manifest files were causing LLM confusion (agents treated them as editable sources of truth and stopped after updating them instead of the actual artifact files). Both files are now fully removed: generation code deleted, schema registrations removed, workflow checklist items removed, tool descriptions updated.
- **Single source of truth for status** — Story status now has exactly one authoritative file: `epics/epic-{N}/stories/{id}.json → content.status + metadata.status`. The `syncStoryStatusAtomic` tool, all workflow checklists, and all documentation now reference only this file.

### CLI Agent Integration — Full Tier Coverage

- **13 New Workflows in Manifest** — Added `security-audit`, `ceo-review`, `eng-review`, `design-audit`, `verification-loop`, `coding-standards`, `e2e-testing`, `eval-harness`, `api-design`, `create-story-checklist`, `story-enhancement`, `epic-enhancement`, and `dev-story-checklist` to `workflow-manifest.csv`. All paths verified on disk.
- **6 Delegation Stubs Converted to Executable** — `enhance`, `elicit`, `document`, `review-code`, `ci`, and `party` now have `STUB_TO_MANIFEST` entries and generate executable wrappers pointing to real workflow files instead of "go to VS Code Chat" delegation text.
- **Artifact-Type Routing Table** — Added `## ARTIFACT-TYPE WORKFLOW ROUTER` section to `help.md` that maps Story, Epic, PRD, Architecture/Tech Spec, UX Design, Code/Implementation, and Test artifact types to their recommended refinement and dev workflows. Embedded directly in the `help` task so CLI agents auto-receive routing guidance on every invocation.
- **Version-Aware Auto-Reinstall** — `autoInstallIfNeeded` now reads `package.json` version and stamps it as `<!-- aac-version: X.Y.Z -->` in every agent skill. On extension update, the version mismatch triggers silent reinstall, ensuring CLI agents always pick up new/changed skills without manual re-installation.

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
- **Stub-to-Manifest Routing** — Added `STUB_TO_MANIFEST` lookup map that routes each stub to its correct BMAD workflow entry file (e.g. `/dev` → `bmm/workflows/4-implementation/dev-story/workflow.yaml`).
- **VS Code-Only Stubs Preserved** — `refine`, `enhance`, and `elicit` remain as delegation stubs since they depend on VS Code extension APIs (artifact loading, schema resolution, apply command) with no CLI equivalent.
- **Self-Contained Wrappers** — Generated stub bodies resolve `{bmad-path}` to the actual installed resource path at write-time, making stubs IDE-agnostic and self-contained.
- **Graceful Fallback** — Executable stubs include a fallback message directing users to run the IDE installer if the workflow file cannot be found.

## 0.3.9

### GSD Workflows Integration

- **5 New Specialized Skills** — Added `Codebase Mapper` (structural discovery), `Assumptions Analyzer` (risk/dependency extraction), `Trade-off Advisor` (5-column decision matrix), `Execution Task Protocol` (strict deviation bucketing and auth gates), and `Test Classification Strategy` (heuristic-based pre-test triage: TDD/E2E/Skip).
- **Workflow Registry** — Registered all 5 new skills in `workflow-executor.ts` under the `4-review` phase with proper target artifact types.
- **Canvas UI Integration** — Surfaced the new GSD-inspired review workflows in the "Refine with AI" context menu for Epic, Story, Architecture, and Test Strategy cards.
- **4 New Elicitation Methods** — Appended `Codebase Discovery (GSD-Style)`, `Trade-off Matrix (GSD 5-Column)`, `Goal-Backward Planning`, and `User Behavioral Profiling` to the advanced elicitation registry.
- **Production-Quality Workflow Structure** — All 5 GSD workflows use the full multi-file YAML format (`workflow.yaml` + `instructions.md` + `checklist.md`) with XML-structured steps, interactive prompts, halt-conditions, and execution-notes — matching existing advanced workflows like `correct-course`.
- **Dynamic SKILL.md Generation** — Registered all 5 GSD workflows in `workflow-manifest.csv` so their SKILL.md files are generated dynamically by the IDE installer.
- **Attribution** — Updated `LICENSE` to include formal attribution for `get-shit-done`, `everything-claude-code`, and `gstack` repositories.

### Agent Honesty Guardrails

- **3-State Task Status** — Replaced binary task completion with `pending` → `implemented` → `verified` progression. Dev agents can only set `"implemented"`; only Code Review can promote to `"verified"`. Updated `status.schema.json` and `story.schema.json` with backward-compatible aliases.
- **Proof of Work Gate** — Dev agents must now paste actual terminal output or HTTP responses into `debugLog` before marking tasks complete. Tasks that cannot be executed are marked `"implemented-not-verified"`.
- **Honesty Clause** — Added explicit prohibition against fake data seeding or success messages without real I/O operations in `dev-story` workflow.
- **Grep Self-Audit** — Agents must search modified files for `TODO`, `FIXME`, `placeholder`, `stub`, `fake`, `simulated` before task completion; any hits block the task.
- **Unbacked Success Ban** — Added coding standard banning `✅`/`"seeded"`/`"complete"` console output without preceding verifiable I/O.
- **Path Resolution Standard** — Enforced `__dirname` / `import.meta.url` for file operations; banned `process.cwd()` and string-relative paths.

### Test Tracking & Status Update Fix

- **Step 8b Merge** — Merged unreachable `step 8b` (test tracking) into `step 8` before the `<goto>` jumps, ensuring test sync logic always executes.
- **TEST SYNC GATE** — Added mandatory gate: if any `*.test.*` or `*.spec.*` files appear in the File List, agents must sync them to `content.testCases[]` and epic's `test-cases.json` before proceeding.
- **Explicit Status Update Protocol** — Replaced vague "one-liner Node.js script" directives with field-by-field update instructions requiring `view_file` verification in both `dev-story` and `code-review` workflows.

### Bug Fixes

- **Dynamic Slug Resolution**: Fixed an issue where `epic.json` story references (e.g. `0.1`) failed to resolve physical story files generated with descriptive slugs (e.g. `0.1-graphql-api.json`). The loader now dynamically maps canonical IDs to slugged files, protecting project integrity when story titles change.

### Artifact Store Refactoring

- **Resilient Artifact Loading** — Refactored internal data discovery to explicitly traverse and load `storyRefs` from `epic.json` files as the authoritative source of truth, eliminating reliance on implicit directory scanning and the fragile `stories-index.json`.
- **Sprint Board Data Integrity** — Replaced fragile exact-string matching in `SprintPlanningView.tsx` with robust prefix-based ID matching (e.g. `1-2`), preventing stories from being incorrectly categorized as "Unscheduled" due to title punctuation or casing differences.
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
- **Workflow Registry** — All 5 new skills registered in `workflow-executor.ts` under `4-review` phase with proper `artifactTypes` targeting.
- **Canvas UI Integration** — New workflows surfaced in the "Refine with AI" context menu: Verification Loop on story/epic/architecture cards, Coding Standards + Eval Harness on story/epic, E2E Testing on story/test-strategy, API Design Review on architecture/epic.
- **2 New Elicitation Methods** — Added `Eval-Driven Discovery` (technical: define evals before implementation) and `Research-First Discovery` (research: explore codebase before coding) to `methods.csv`.

### Observability & Logging Enhancements

- **Unified Output Channel Logging** — Replaced all direct `vscode.OutputChannel` usages with a structured `.debug/.info` logger interface. Routine synchronization and execution steps are now demoted to debug-level, drastically reducing output panel noise during standard use.
- **Intelligent Schema Error Messages** — Refactored the internal schema validator to synthesize human-readable correction suggestions directly from underlying JSON schema failure parameters (surfacing missing properties, valid enums, or expected types instead of opaque schema errors), and to explicitly embed the artifact ID (e.g., `S-1.5`) in the warning text so you know exactly which file failed.

### Performance Optimizations

- **Buttery Smooth Canvas Panning** — Resolved significant lag during canvas interactions on dense projects. `ArtifactCard` and `DependencyArrows` components are now heavily memoized (`React.memo`) with custom deep-equality checks for complex state like expanded categories. React now completely skips re-rendering these hundreds of DOM/SVG nodes during `pan` and `zoom` operations, delivering a flawless 60fps interaction experience regardless of artifact count.

### Workflow Enhancements: Test Case Tracking & Audit

- **Explicit test case extraction rules** — Updated the `dev-story` and `quick-dev` workflow instructions to mandate that newly implemented automated tests (unit/integration) must be extracted into formal JSON test case definitions. These definitions must be appended to the `content.testCases` array of the story JSON and the epic's `test-cases.json` file.
- **Formalized test status terminology** — Clarified in development workflows that when adding new test case definitions, their top-level `status` field must strictly be set to `done` to indicate full design and implementation (preventing invalid use of `passed` for schema status).
- **Code-Review extraction audit** — Added an explicit audit step to the `code-review` workflow prior to updating execution statuses. If a story has implemented tests but the `content.testCases` array is empty, the review agent is now mandated to pause and backfill the JSON extraction before proceeding, closing a loophole where tests were written but not tracked.

### Artifact Store Refactoring

- **Automated Workflow Status Cascading** — Enforced workflow integrity by automatically cascading active states upward. Modifying a nested task to an open state downgrades its parent Story to `in-progress`, and creating or modifying an active Story automatically downgrades its parent Epic to `in-progress`.
- **Story status source of truth consolidation** — Refactored the internal data loading and synchronization logic across the extension to treat the individual story JSON files as the absolute single source of truth for story lifecycle statuses. Reconciled caching and derived projections (like parent epic `storyRefs` and `sprint-status.yaml`) to prevent status overlap and redundancy.
- **Removed bidirectional status sync** — Deleted legacy logic that allowed manual edits to `sprint-status.yaml` to overwrite story JSON files. `sprint-status.yaml` is now strictly a read-only projection, and any mismatched manual edits are safely overwritten on the next sync without triggering UI warning toasts.
- **Stripped status from epic storyRefs** — Cleaned up `epic.json` serialization to only save `id`, `title`, and `file` in `storyRefs`. Removed the `status` field entirely to enforce standalone `story.json` files as the only system of record.

### Canvas UX Improvements

- **Refinement Menu Consolidation** — The "Code Review", "Dev Story", and "Sprint Planning" workflows have been added to the "Refine with AI" (Sparkle Icon) menu for Story and Epic cards. These implementation-phase options were previously explicitly segregated to the "Start Dev" button, but are now consolidated into the main refinement picker so all AI actions are accessible from a single dropdown.

### Bug Fixes

- **Sprint Planning view showing stale data** — Opening the Sprint Plan Kanban board could show an outdated version of `sprint-status.yaml` (visible via the `generated` timestamp), requiring repeated close/reopen cycles before the correct latest data appeared. Root cause: `vscode.workspace.fs.readFile()` was returning cached file content when the YAML file had been recently modified externally (e.g. by a sprint-planning workflow). Switched to Node's native `fs.promises.readFile()` in `webview-message-handler.ts` to bypass VS Code's file system caching layer and always read fresh content from disk

## 0.3.6

### Epic JSON Slim-Down — Lightweight storyRefs

Removed full story object duplication from `epic.json`. Each `epic.json` now writes only lightweight `storyRefs` (id, title, status, storyPoints, priority, file path) instead of embedding the entire story payload. Full story data remains the single source of truth in `epics/epic-{N}/stories/{id}.json`.

**Changes:**

- **`artifact-store.ts` — `saveEpicsToFile()`** — Replaced full `Story[]` embedding with slim `storyRefs[]` array. Removed dead dep-normalization and `_sourceEpicId` cleanup code
- **`artifact-store.ts` — `migrateToReferenceArchitecture()`** — Added a final `syncToFiles()` execution phase to ensure all loaded standalone `epic.json` files are automatically reformatted and stripped of their duplicate inline stories on disk
- **`artifact-store.ts` — `epic.json` `_llmHint`** — Added metadata hint telling LLMs where full story data lives and not to embed story objects
- **`artifact-store.ts` — `deleteArtifact()` story case** — Now deletes the standalone story file from disk when a story is removed
- **`artifact-store.ts` — auto-generated `README.md`** — Updated text to describe `epic.json` as containing lightweight refs
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
- **`artifact-store.ts` — `migrateImplementationFolder()`** — Added automatic migration that runs on project load: detects legacy `implementation/` directories, copies their `.json` files to the canonical `epics/epic-{N}/stories/{id}.json` path (if not already present), and renames the folder to `.deprecated_implementation/` so it is naturally excluded from future recursive scans while preserving all data
- **`artifact-store.ts` — Story file naming** — Simplified from slug-based (`{epicId}-{storyNum}-{slug}.json`) to immutable ID-based (`{id}.json`, e.g. `S-1.2.json`) in `migrateToReferenceArchitecture()`. ID-based names are predictable, stable when titles change, and directly derivable by AI agents from the sprint-status key pattern
- **`artifact-store.ts` — `_llmHint`** — Updated the `epics-index.json` LLM hint from the old slug pattern to the new `{id}.json` pattern so all AI path discovery is consistent

**Backward compatibility:** Existing projects with `implementation/` directories are automatically migrated on next project load. No manual steps required.

### Workflow Robustness & Status Propagation

- **Atomic Status Sync Tools** — Introduced `agileagentcanvas_sync_story_status` and `agileagentcanvas_sync_epic_status` to allow LLM agents to atomically synchronize statuses across multiple tracker files (`story JSON`, `epic.json`, `stories-index.json`, `sprint-status.yaml`) in a single, robust tool call.
- **Status Propagation File Maps** — Added explicit `CRITICAL` file maps to `code-review`, `dev-story`, and `create-story` workflow instructions to guarantee agents are aware of all required files when updating a status.
- **Explicit Test Case Resolution** — Replaced vague test case update instructions with a concrete lookup algorithm in implementation workflows (checking `content.testCases` inline, then searching `test-cases.json` by `storyId`), ensuring tests are reliably discovered and synced.

## 0.3.5

### Tabbed Layout for Story Details

- **Tabbed Interface** — The expanded story card view now uses a tabbed layout to organize Tasks, Tests, and Acceptance Criteria (ACs), replacing the previous long vertical list of sections. This significantly reduces vertical scroll and improves readability.
- **Dynamic Tabs** — Tabs only appear for categories that have content. If a story only has Tasks and Tests, only those two tabs are shown. The first available tab is selected by default when a card is expanded.
- **Fixed Elicitation Modal Tests** — Resolved a failing unit test suite (`App.test.tsx`) that was still targeting the old `.elicit-modal` class instead of the new unified `.wfl-modal` class after the recent Elicitation Modal redesign.

### Code-Review Workflow — Adversarial Review Enhancements

Four new instruction blocks added to `code-review/instructions.xml` to close classes of bugs that prior review sessions reliably missed:

- **Ground-up baseline mandate** — A `CRITICAL` block at the top of Step 1 prohibits treating any prior review session as a validated baseline. Every task marked `[x]` and every AC marked `verified:true` must be re-proven from code in each new review run
- **TODO / stub audit** — Step 3 now requires a full keyword scan of all reviewed files (`TODO`, `FIXME`, `time.Sleep`, `hardcoded`, `simulated`, `fake`, `placeholder`, `stub`). A hit on a completed (`[x]`) task → **CRITICAL** finding; a hit with no story task at all → **HIGH** finding (undocumented debt). Clarifies that `"Deferred to Story X.Y"` in `devAgentRecord` does not make a task done
- **Round-trip persistence audit** — Step 3 now requires verifying that every DB write (`INSERT`, `UPDATE`, `saveXxxToDB`, etc.) has a corresponding read-back in the startup/load path and that every column written is also loaded back; any missing read-back → **HIGH** finding
- **Response-truthfulness check** — Step 3 now requires that every handler returning status/health/connectivity data derives its values from real I/O (network call, DB query, file check), not literals or constants. Hardcoded success values (`"ok": true`, fixed latency numbers) with no observable I/O → **HIGH**; values derived from real operations but silently discarded (`_`) → **HIGH**
- **AC verification on `done` transition** — Step 5 now sets `verified: true / status: "verified"` (or `false / "failed"`) on every `acceptanceCriteria` item in both story JSON copies before allowing a `done` transition; added to Status Propagation Checklist

### Dependency Graph Sync — Canvas Arrow Fidelity

Canvas dependency arrows are rendered from `epic.json → content.stories[].dependencies`, not from standalone `stories/*.json` files. Two workflows updated to keep these embedded objects accurate:

- **`create-story` Step 6** — After updating `storyRefs`, two new `<action>` blocks bidirectionally sync the dependency fields in affected `epic.json` files:
  - For `blockedBy` entries: load the upstream dependency's epic, ensure its embedded story object's `blocks[]` contains the new story's ID
  - For `blocks` entries: load the downstream story's epic, ensure its embedded story object's `blockedBy[]` contains `{ storyId, title, reason }` and replaces any generic placeholders (e.g. `"Epic N (upstream)"`) with the precise story ID
- **`dev-story` Step 9** — Sixth bullet added to the Status Propagation Checklist: `epic.json` (all affected epics) embedded story's `dependencies.blockedBy[].storyId` and `blocks[]` must use precise story IDs (e.g. `"2.10"`), NOT generic placeholders

### Acceptance Criteria Lifecycle Sync — All Three Workflows

`acceptanceCriteria` verified/status fields are now explicitly updated at every stage of the story lifecycle:

- **`create-story`** — New top-level `CRITICAL` block defines the AC structure contract: ACs must live in `content.acceptanceCriteria[]`, use either structured (`given/when/then`) or prose (`criterion`) format but never both, must never appear inside `tasks[]` or `testCases[]`, and must be initialized with `verified: false, status: "draft"`. Explains the canvas `📋 N/Total` chip lifecycle
- **`dev-story` Step 8** — After marking a task complete, the JSON update action now includes step 3: for each `acceptanceCriteria` item whose requirement is satisfied by the current task, set `verified: true AND status: "verified"` (unrelated ACs are left unchanged). Added as fifth checklist item in Status Propagation Checklist
- **`dev-story` Step 5** — Evidence-Based Planning mandate: before writing any file path, API reference, or design decision into the implementation plan, the agent must read the actual file or source in the codebase to confirm it exists. Assumptions, guesses, and memory-based references are prohibited

### Bug Fixes

- **Detail Panel save no longer pollutes `metadata`** — `handleSave` in `DetailPanel.tsx` was spreading all of `editedData` (including the top-level `title`, `description`, and `status` fields) into the `metadata` object on every save. This caused those fields to be duplicated inside `metadata` on disk, scrambling the on-disk JSON schema. Fixed by destructuring the three top-level keys out of `editedData` before merging into `metadata`, ensuring only content-specific fields are written there. A targeted regression test was added to `DetailPanel.test.tsx` to permanently guard this contract
- **Acceptance Criteria Verification Backend Parser** — The backend JSON parser (`mapSchemaStoryToInternal` in `artifact-store.ts`) was accidentally stripping the newly added `verified` and `status` fields during the object mapping process, causing stories that were correctly updated by agents to still show 0/N verified ACs on the Canvas UI. The parser now correctly propagates these fields to the Canvas state.

### Dev-Story Workflow — Evidence-Based Planning Mandate

- **No assumptions in implementation plans** — Step 5 of `dev-story/instructions.xml` now has a `CRITICAL` block requiring that every file path, API reference, or design decision written into the implementation plan must be verified by reading the actual codebase first. Memory-based references and unverified assumptions are explicitly prohibited; every claim must have a corresponding file read as its evidence

### Acceptance Criteria — Separate Canvas Category

Acceptance Criteria (ACs) are now a **distinct third category** on story cards, separate from Tasks and Tests.

- **`📋 N/Total` AC chip** — Story cards display a `📋 0/3` chip alongside `✓ Tasks` and `🧪 Tests` in the inline summary row, with a micro progress bar that fills green when all ACs are verified
- **AC expanded section** — Expanding a story card shows a dedicated `📋 ACs (N)` section with per-criterion rows: `✅` (verified), `❌` (failed), `⬜` (draft/pending)
- **`verified` + `status` fields on `AcceptanceCriterion`** — Schema, extension types (`src/types/index.ts`), and webview types (`webview-ui/src/types.ts`) extended with `verified: boolean` and `status: 'draft' | 'verified' | 'failed'`
- **Fully backward-compatible** — Existing story JSON files without the new fields render gracefully: `undefined` fields default to `⬜` / `'draft'` — no migration required
- **LLM instruction lifecycle** — Three workflows updated:
  - `create-story`: initializes every AC with `verified: false, status: "draft"`; must never place ACs inside `tasks[]` or `testCases[]`
  - `dev-story`: after each task, sets `verified: true, status: "verified"` on satisfied ACs in both story JSON copies; added to Status Propagation Checklist
  - `code-review`: sets `verified`/`status` on every AC item before marking a story `done`; added to Status Propagation Checklist
- **Height calculation fix** — Removed a double-counting bug where stories with only ACs triggered +72px of extra card height (ACs share the existing inline summary row — no separate row needed)
- **Type safety** — `AcceptanceCriterion` type now imported into `ArtifactCard.tsx` and `artifact-transformer.ts`; all `any` casts removed

### Status Mapping Fix

- **Rich statuses preserved on canvas cards** — `mapStatus()` in `artifact-store.ts` previously collapsed all statuses to just 4 values (`draft`/`ready`/`in-progress`/`done`), silently mapping valid statuses like `in-review`, `blocked`, `backlog`, and `approved` to `draft`. Now passes through all 22 valid `ArtifactStatus` values and handles legacy underscore aliases (`in_progress` → `in-progress`)
- **Sprint YAML status mapping expanded** — `reconcileDerivedState()` now maps all valid statuses from `sprint-status.yaml` onto stories/epics instead of only 4 values
- **Kanban column normalization (no new columns)** — `normalizeStatus()` in `SprintPlanningView.tsx` maps all rich statuses into the 5 existing Kanban columns: Backlog (`draft`/`not-started`/`proposed`), Ready for Dev (`ready`/`approved`/`accepted`), In Progress (`implementing`/`blocked`), Review (`in-review`/`ready-for-review`), Done (`complete`/`completed`/`archived`)
- **LLM status awareness** — Sprint-planning and sprint-status workflow instructions now document all valid statuses with Kanban column mappings, ensuring LLMs use correct status values. Story schema description updated with column mapping reference

### Dev-Story Workflow Hardening

Six instruction enhancements added to `dev-story/instructions.xml` to prevent canvas data-sync issues discovered during real sprint execution:

- **Two-field task completion contract** — Step 8 now explicitly requires setting BOTH `completed: true` AND `status: "done"` on every task/subtask; missing either field causes the canvas to show tasks as incomplete
- **Dual story file sync** — Top-level critical block establishes that `stories/{id}.json` and `implementation/{id}.json` MUST stay in sync for status, completion, metadata, and all task fields
- **Dev agent record schema** — Specifies that `implementationNotes`, `completionNotes`, and `debugLog` must all be `string[]` arrays (not strings), preventing serialization errors
- **Step 8b: Test tracking artifacts** — New step after task completion creates/updates `tests/test-cases.json` and `tests/test-design.json` with ID collision avoidance rules (distinct prefixes for test cases vs test design entries)
- **Required JSON fields before in-review** — Step 9 now lists mandatory fields (`content.fileList`, `content.changeLog`, `content.devAgentRecord`, `content.completed`) that must be populated before transitioning to `in-review`
- **Status propagation checklist** — Replaces vague "update status" with a concrete 5-item checklist: both story files, `stories-index.json`, `epic.json` storyRefs, and all task/subtask completion flags

### Code-Review Workflow Hardening

Same six enhancements ported to `code-review/instructions.xml`, the terminal `done` transition workflow — highest risk for canvas data-sync:

- **Dual file sync** — Top-level critical block; Step 5 now updates both `stories/` and `implementation/` copies when setting `done` or reverting to `in-progress`
- **Required fields gate** — Verifies `fileList`, `changeLog`, `devAgentRecord`, and `content.completed` are populated before allowing `done` transition
- **Two-field task completion** — Subtasks now require `completed: true` AND `status: "done"` (previously only `completed`)
- **Dev agent record schema** — All three fields specified as `string[]` arrays
- **Stories-index update** — Step 5 now explicitly updates `stories-index.json` entry status alongside story/epic JSON
- **Status propagation checklist** — Same 5-item checklist ensuring all data locations are synchronized

### Create-Story Workflow Hardening

Two enhancements for `create-story/instructions.xml`, the initial `backlog → ready-for-dev` transition:

- **Dual file write** — Step 5 now writes the new story to both `stories/` and `implementation/` locations
- **JSON status propagation** — Step 6 now propagates `ready-for-dev` status to both story JSON files (`content.status` + `metadata.status`), parent epic `storyRefs[].status`, and `stories-index.json`

### Dependency Lines Filter

- **Lines section in filter bar** — The existing filter bar (`T`) now includes a **Lines** section with 4 colour-swatch toggle buttons: **Structural** (blue — architecture/epic/requirement cross-links), **Peer** (yellow — story ↔ story), **Other** (neutral — remaining cross-refs), and **Tree** (dashed — mindmap parent→child). Each button dims its swatch when inactive. "Clear all" resets line filters alongside type/status filters
- **`DependencyArrows` category filtering** — `arrowStyle()` now returns a `category` field (`structural` / `peer` / `default`). Both dependency-arrow and tree-line render loops skip arrows whose category is in the new `hiddenLineCategories` prop
- **8 new unit tests** — `DependencyArrows.test.tsx` covers undefined/empty filter, per-category hiding (structural, peer, default, tree), and independent category filtering

### Elicitation Picker Modal Redesign

- **Unified modal design** — Elicitation Picker now reuses the Workflow Launcher's `wfl-*` CSS classes, giving both modals identical styling (tab shape, color palette, card layout, shadows). Removed ~300 lines of duplicate `elicit-*` CSS
- **Category grouping** — Methods are now grouped by category with uppercase group headers when the "All" tab is active (matching the Workflow Launcher's phase grouping pattern). Selecting a specific category tab hides the group headers
- **3 new unit tests** — Category grouping: group headers render in "All" view, hide when a specific category is selected, and methods are wrapped in phase-group containers

### Bidirectional Dependency Highlighting

- **Peer-level highlight symmetry** — Selecting a card now highlights **both** what it depends on (upstream) and what depends on it (downstream). Previously only upstream dependencies were highlighted. Fixed by making `a.dependencies` and `blockedBy` cross-refs bidirectional in the `connectedIds` computation

### Sprint Tab Bar Scroll Navigation

- **Scroll arrows on tab overflow** — When the sprint modal has more tabs than can fit, left/right chevron `‹ ›` arrow buttons appear at the edges for smooth 200px step scrolling. Arrows auto-hide when the scroll position reaches the respective edge
- **Edge fade gradients** — Subtle fade-to-background gradients appear on the overflowing edge(s), visually hinting that more tabs exist beyond the visible area
- **ResizeObserver + scroll tracking** — Overflow state is re-evaluated on every scroll event and container resize, ensuring arrows appear/disappear correctly even after window resizing

### Sprint Planning — Goal-Based Sprint Grouping

- **`sprints:` section added to `sprint-status.yaml`** — New optional top-level map groups stories into named, goal-driven sprints (e.g. `mvp`, `beta`). Each sprint has a required `goal` string, optional `start_date`/`end_date`, and a `stories` list of keys from `development_status`. Stories not listed in any sprint appear as "Unscheduled"
- **Sprint tab bar in the Kanban view** — The Sprint Plan panel now shows a tab bar at the top of the board when a `sprints:` section exists. Clicking a tab filters all status columns to only that sprint's stories. An "Unscheduled" tab auto-appears for any unassigned items. Falls back gracefully to the previous flat view (all-stories board) with an amber notice when no `sprints:` section is present
- **Sprint goal bar** — The active sprint's goal is displayed in a tinted strip below the tab bar, with optional date range if provided
- **`sprint-status.schema.json` extended** — Added `sprints` map definition with validated sprint object shape (`goal` required, `stories` required, dates optional)
- **`sprint-status-template.yaml` updated** — Template now includes example `sprints:` section with comments explaining the goal-based grouping concept
- **`sprint-planning/instructions.md` extended** — Added step 3.5 for sprint assignment using a 3-phase approach: (A) status-aware (skip `done` items, anchor `in-progress` to first sprint, `ready-for-dev` to nearest sprint); (B) dependency-aware (story B cannot precede its blocker A, epic dependency chains respected, circular dependency detection); (C) goal-based grouping by natural project milestones. LLM presents the proposed grouping for user confirmation before writing the file
- **Sprint assignment validation** — Step 5 now verifies every key in a sprint's `stories` list exists in `development_status` and counts sprints in the summary output

### Epic/Story Status Consistency Checks

- **`sprint-status/instructions.md` — risk detection** — Added two new consistency rules to step 2: (1) any story with status `in-progress`, `review`, or `ready-for-dev` whose parent epic is `backlog` triggers a 🔴 **CONSISTENCY ERROR** with an auto-fix offer that promotes the epic to `in-progress`; (2) a story `done` with an epic still `backlog` triggers an ⚠️ **CONSISTENCY WARNING** suggesting epic promotion
- **Validate mode (`sprint-status`) — consistency checks** — Step 30 (validate mode) now builds a consistency-error and consistency-warning list from the status file and reports them as validation failures/warnings
- **Kanban board visual indicators** — Cards with consistency errors show a **red left border** and a `⚠ Epic not started` badge (with tooltip showing the mismatch). Cards with consistency warnings show an **amber left border** and a `↑ Promote epic` badge

### Sprint Status File Discovery Fix

- **Robust `sprint-status.yaml` discovery** — `webview-message-handler.ts` now uses `vscode.workspace.findFiles('**/sprint-status.yaml')` instead of a fixed list of candidate paths, finding the file regardless of which subdirectory the sprint-planning workflow writes it to (e.g. `implementation-artifacts/`, `implementation/`, project root)

### Sprint-Status YAML → JSON Sync

- **Sprint statuses persisted to JSON on load** — When a project containing `sprint-status.yaml` is loaded, the extension parses the `development_status` section and compares each entry against the corresponding epic/story JSON files. If mismatches are detected, an in-canvas toast notification (matching the extension's schema-issues style) lists the changes with **Apply** / **Dismiss** buttons; on Apply, statuses are surgically patched into the JSON files on disk, making them permanent across sessions
- **Dedicated surgical patch methods** — Two targeted methods (`patchEpicStatusOnDisk`, `patchStoryStatusOnDisk`) read the specific JSON file from disk, update only `metadata.status` and `content.status`, validate the artifact ID matches the expected target, and write back. No other fields are touched, preventing file corruption
- **Standalone + inline story handling** — Story status is patched in both the standalone story file (`epics/epic-{N}/stories/{slug}.json`) and the inline copy within `epic.json` when both exist, preventing status divergence between the two locations
- **File watcher includes YAML** — `setupFileWatcher` glob extended from `*.{json,md}` to `*.{json,md,yaml,yml}` so external changes to `sprint-status.yaml` trigger the canvas reload badge
- **Reverse sync: JSON → YAML** — When a status changes in JSON (via canvas detail panel, LLM tool call, or surgical patch), the corresponding `development_status` entry in `sprint-status.yaml` is updated in-place. Only the status value is modified; the `sprints:` section (goals, dates, story groupings) is never touched. During YAML→JSON apply, reverse sync is skipped to prevent circular writes
- **Mismatch detection order fix** — `applySprintStatusesToFiles()` now runs before `reconcileDerivedState()` so in-memory statuses still reflect JSON files when mismatches are compared, fixing a bug where mismatches were invisible

### Sprint Planning Kanban Board

- **Sprint Plan button in canvas toolbar** — New kanban-style icon button opens a full-screen sprint board (Linear/Jira style) reading the project's `sprint-status.yaml`. Stories are arranged in 6 columns: **Backlog → Ready for Dev → In Progress → Review → Done → Retrospective**. Each card shows the item key and its epic tag (inferred from `.N-M-*` ID pattern). Column headers use color-coded accents with item count badges
- **Empty state with workflow CTA** — If no `sprint-status.yaml` is found (checked in project root, `implementation/`, and `_implementation/`), the panel shows a "No sprint plan found" message with a **Run Sprint Planning** button that directly launches the sprint-planning workflow
- **No new dependencies** — YAML parsed inline; backend handler reads the file via `vscode.workspace.fs` using the existing `store.getSourceFolder()` pattern

### Sprint Planning Workflow Fixes

- **Epic files unified to `.json`** — `epics_location`, `epics_pattern`, and all glob patterns in `sprint-planning/workflow.yaml` changed from `.md` to `.json`
- **Story detection corrected** — `instructions.md` updated to check for `.json` story files (not `.md`) when determining `ready-for-dev` status
- **`output_format` corrected to `yaml`** — Sprint planning's declared output format was `json` but the actual output is YAML; corrected the declaration
- **Legacy status normalization** — Added rules to normalize `drafted` → `ready-for-dev` and `contexted` → `in-progress` when loading existing status files
- **`create-story` epic references** — Updated `epics_file` variable and input patterns in `create-story/workflow.yaml` from `.md` to `.json`
- **`sprint-status.schema.json` rewritten** — Schema now accurately validates the flat `development_status` map structure instead of the incorrect nested `metadata/content/epics[]` layout
- **Stale date placeholder** — `sprint-status-template.yaml` hardcoded date replaced with an ISO format placeholder

### JSON-Only Output Enforcement

Enforced `json` as the exclusive output format for all structured artifact workflows, removing the legacy `dual` (JSON + Markdown) mode that caused LLM confusion.

- **`output_format` unified to `json`** — All TEA testarch workflow aliases (`atdd`, `nfr-assess`, `test-design`, `test-review`, `trace`) and their corresponding YAML definitions (`framework`, `automate`, `ci`) changed from `output_format: dual` to `json`. BMM supporting workflow templates (`create-use-cases`, `create-risks`, `create-definition-of-done`) updated to match
- **Stale dual-output comments removed** — Removed `# dual = JSON + Markdown` inline comments from all workflow YAML files (`dev-story`, `framework`, `automate`, `ci`, `create-use-cases`, `create-risks`, `create-definition-of-done`) that survived as misleading documentation after the format change
- **`output-format-standards.md` rewritten** — Standards document updated to reflect the new single-format contract: `json` is the default for all structured workflows, `markdown` is reserved for narrative-only workflows, `dual` removed as a valid option
- **`step-dual-output.md` deleted** — Obsolete core step file that instructed LLMs to produce both Markdown and JSON in sequence removed from `resources/_aac/core/steps/`
- **`docs/` folder removed** — Deleted 8 obsolete reference documents (`dual-output-system.md`, `bmad-to-json.md`, `json-to-markdown.md`, `migration-guide.md`, `schema-reference.md`, `special-features.md`, `workflow-format-conventions.md`, `README.md`) that described the old dual-output architecture. These were not referenced by any live workflow and only added confusion
- **TEA test-design step-05 corrected** — `step-05-generate-output.md` had an embedded dual-output instruction block telling the LLM to generate Markdown first then JSON. Replaced with a JSON-only instruction consistent with the workflow executor's actual behavior

### Explicit JSON Save Instructions in Final Steps

Added explicit `agileagentcanvas_update_artifact` call instructions directly into the final step of every multi-step workflow that produces a structured JSON artifact. Previously, JSON saving relied entirely on the executor's nudge mechanism (up to 3 retry prompts). Now the LLM receives a `SAVE JSON ARTIFACT` block in the step file itself, including the exact schema file path for reference.

Affected workflows (13 final step files updated):

- **BMM:** `create-architecture`, `create-product-brief`, `create-prd`, `create-ux-design`, `generate-project-context`, `check-implementation-readiness`
- **TEA:** `atdd`, `automate`, `ci`, `framework`, `nfr-assess`, `test-review`, `trace`

Each instruction block includes: the `agileagentcanvas_update_artifact` call with correct `type` and `id`, the schema path (`{bmad-path}/schemas/...`) with a hint to use `agileagentcanvas_read_file` if field names need verification, a reminder not to wrap content in a `content` key, and a retry instruction on schema mismatch.

### Card Export to Markdown

- **Fields | Preview toggle in Detail Panel** — The detail panel header now has a two-button toggle to switch between the default **Fields** editing view and a live **Preview** view that renders the artifact as a formatted Markdown document. The toggle resets to Fields automatically when switching to a different artifact
- **Export MD button in action bar** — A **↓ Export MD** button appears in the detail panel's footer action bar (alongside Edit, Refine, Elicit, Delete). Clicking it converts the current artifact to Markdown and opens a Save dialog defaulting to `exports/md/` in the workspace root — separate from source JSON to avoid LLM confusion
- **Programmatic conversion — no LLM cost** — Conversion uses a dedicated TypeScript module (`artifact-md-exporter.ts`) shared between the live preview and file export path. The full Markdown is produced instantly with no AI call
- **All artifact types supported** — Dedicated renderers for `story`, `epic`, `requirement`, `use-case`, `architecture`, `prd`, and `product-brief`; other types fall back to a generic key-value renderer

### Markdown Renderer Fixes

- **Product Brief no longer renders as XML** — `ProductBriefMetadata`'s deeply nested object fields (`vision`, `targetUsers`, `marketContext`, `scope`, `timeline`, `stakeholders`, `additionalContext`, etc.) were previously JSON-stringified by the generic fallback. All sections are now properly expanded: Vision (statement, mission, problem statement, UVP, differentiators), Target Users (demographics, goals, needs, pain points), Market Context (market size table, trends, competitors table), Scope (in/out of scope, MVP definition), Success Metrics, Constraints, Assumptions, Risks, Dependencies, Timeline (milestones table, phases), Stakeholders, and Additional Context
- **Epic — 9 missing fields restored** — The epic renderer now includes: `valueDelivered`, `acceptanceSummary`, `functionalRequirements`, `nonFunctionalRequirements`, `additionalRequirements`, `technicalSummary` (overview, patterns, tech stack), `effortEstimate` (story points, sprints, confidence), `dependencies`, `epicDependencies`, `implementationNotes`, and story roll-up counts (`totalStoryPoints`, `totalStoryCount`, `doneStoryCount`)

### Features

- **Labels rendered on artifact cards** — Artifacts with a `labels` metadata field (e.g. stories) now display each label as a compact purple pill badge directly on the canvas card surface below the description, giving at-a-glance visibility without opening the detail panel

### Bug Fixes

- **Removed distracting selection notifications** — Selecting a card on the canvas or an entry from the sidebar artifact panel no longer fires a `showInformationMessage` toast for every click, eliminating notification noise that interrupted workflow
- **Story dependency arrows restored** — Dependency lines between story cards were invisible because standalone story files store dependencies in `metadata` but the loader only passed `content` to the mapper, silently discarding all dependency data. A 4-layer fix merges metadata into content at load time, adds a robust `extractStoryId` parser, preserves the structured `{blockedBy, blocks, relatedStories}` format through save/load round-trips, and updates the schema + template to guide LLMs toward the correct format
- **Epic swimlane height accounts for labels** — Story cards with labels overflowed their epic row band because the server-side height estimator didn't account for the labels row. Now estimates label row count (flex-wrap at ~2 per row) and adds proportional height to the pre-computed card size
- **Story detail panel crash on implementation stories (React #31)** — Opening the detail panel for stories loaded from `implementation/*.json` files crashed with "Objects are not valid as a React child" because `devNotes.dataModels` contained objects (`{name, schema, note}`) instead of strings. Three-layer fix: (1) `renderStoryDetails` now handles both string and object formats in all devNotes arrays (`dataModels`, `architecturePatterns`, `securityConsiderations`, etc.), (2) `mapSchemaStoryToInternal` normalizes object items in string-only arrays to strings at load time, (3) story schema updated with explicit LLM-facing `"MUST be plain strings, NOT objects"` descriptions to prevent generation of invalid structures
- **False schema warnings for stories 4.9 and 9.3** — `acceptanceCriteria` items with Given/When/Then format triggered "should match exactly one schema in oneOf" false positives in the extension's AJV runtime. Changed `oneOf` to `anyOf` for AC item validation in `story.schema.json` — semantically equivalent for this use case (AC items never match both branches) but more tolerant of validator edge cases

### Namespace Separation from BMAD-METHOD

- **Epic test cards grouped into single row** — Test Strategy and Test Coverage cards within each epic lane are now rendered side-by-side in a unified "Testing" row instead of stacking vertically in separate rows, reducing epic row height and improving visual grouping of test-related artifacts

- **Extension skills no longer collide with official BMAD agents** — All extension-generated skill directory names changed from `bmad-` prefix to `agileagentcanvas-` prefix (e.g. `bmad-agent-bmm-analyst` → `agileagentcanvas-agent-analyst`). Installing the extension alongside `npx bmad-method install` no longer causes official BMAD agents to disappear from VS Code Copilot Chat
- **Resource directory renamed** — Bundled resources directory renamed from `resources/_bmad/` to `resources/_aac/` with a centralized `BMAD_RESOURCE_DIR` constant in `src/state/constants.ts`, making future renames a one-liner
- **CSV manifest paths updated** — All 141 path entries across 4 CSV manifests (`agent-manifest`, `workflow-manifest`, `task-manifest`, `bmad-help`) updated from `_bmad/` to `_aac/`
- **Module sub-prefix removed** — Dropped `bmm`, `tea`, `cis`, `bmb` sub-prefixes from skill directory names for cleaner naming (e.g. `bmad-bmm-create-story` → `agileagentcanvas-create-story`)
- **Cleanup scoped to extension files only** — `cleanupExtensionSkills()` (renamed from `cleanupBmadSkills()`) now only removes `agileagentcanvas-` prefixed directories; official `bmad-*` skill directories are never touched
- **Stopped cleaning official BMAD files** — Extension no longer deletes `.github/agents/`, `.github/prompts/`, or `<!-- BMAD:START/END -->` markers from `copilot-instructions.md`. All `legacyDirs` arrays emptied across all 20 IDE targets
- **Fallback skills directory renamed** — Generic fallback from `.bmad/skills` to `.agileagentcanvas/skills`
- **Auto-install marker updated** — Changed from `bmad-agent-bmad-master` to `agileagentcanvas-agent-master`

### Schema Improvements

- **Shared status enum schema** — New `common/status.schema.json` defines 5 canonical status types (`artifactStatus`, `storyStatus`, `epicStatus`, `testCaseStatus`, `taskStatus`) with `x-aliases` for backward compatibility. Other schemas can `$ref` to this single source of truth instead of maintaining duplicate enum lists
- **Epics index schema** — New `bmm/epics-index.schema.json` validates the `epics-index.json` manifest file, referencing the shared epic status enum
- **Test-case status enum expanded** — Added `done` to `testCaseStatus` enum in `status.schema.json` so data using `done` passes strict validation without relying on alias resolution
- **Metadata status enum expanded** — Added `refined`, `backlog`, `deferred` to `metadata.schema.json` status enum for story lifecycle status support
- **Test-design risk fields accept numbers** — `probability` and `impact` in `test-design.schema.json` now accept both string (`low/medium/high`) and integer (1-5) formats
- **Strict validation normalizes aliases** — Added `normalizeAliasesDeep()` to `SchemaValidator.validate()` so `x-aliases` are applied during full-scan validation, not only during partial `validateChanges()` calls
- **Stories index schema** — New `bmm/stories-index.schema.json` validates the `stories-index.json` manifest file with enforced dot-notation story IDs
- **Test cases schema** — New `tea/test-cases.schema.json` validates `test-cases.json` files in both monolithic and per-epic decomposed formats, with proper test case structure and shared test-case status enum
- **Architecture principles hardened** — Added `minProperties: 1` and `required: ["name"]` to architecture principle items, preventing empty objects from passing validation

### Validator Improvements

- **x-aliases normalization** — New `normalizeAliases()` method reads `x-aliases` from schema properties and rewrites alias values to their canonical form before validation (e.g. `"complete"` → `"done"`), making validation tolerant of vocabulary variations
- **storyId deprecation warning** — When `storyId` is used instead of `id` in artifact changes, the validator logs a deprecation warning and auto-migrates the value to `id`
- **New schema mappings** — Registered `epics-index`, `stories-index`, `test-cases`, and `test-case` (alias) in the validator's artifact-type-to-schema map

### Native Agent File

- **`agileagentcanvas.agent.md` installed to `.github/agents/`** — IDEs that support native agent files (GitHub Copilot) now discover a single `agileagentcanvas` agent entry alongside the `@agileagentcanvas` chat participant. The file includes a YAML frontmatter with `description` and `tools` fields and activation instructions for the LLM. Does not conflict with official BMAD agent files since it uses the `agileagentcanvas` prefix

### Canvas Integrator Agent (Morph)

- **New "Canvas Integrator" agent** — A dedicated agent persona ("Morph") that converts BMAD markdown artifacts to schema-compliant JSON for Agile Agent Canvas visualization. Supports single-file conversion, batch conversion of all artifacts in a folder, subfolder filtering, and type-based filtering (e.g. `--type=story`). Source folder is configurable at runtime — defaults to the configured output folder but can be pointed at `_bmad-output` or any custom path. Includes a "Scan & Report" mode that lists all convertible artifacts and their conversion status without modifying files
- **`agileagentcanvas-canvas-integrator.agent.md` installed to `.github/agents/`** — A second native agent file is now installed alongside the main `agileagentcanvas.agent.md`, giving Copilot Chat users direct access to Morph's conversion capabilities via `@agileagentcanvas-canvas-integrator`
- **Added to agent manifest** — Registered as `canvas-integrator` in the `core` module of `agent-manifest.csv`, making it discoverable through the BMad Master's agent listing and the extension's agent picker

### Antigravity Alignment

- **Removed `workflowsDir` from Antigravity IDE target** — The official BMAD-METHOD installer (`_config-driven.js`) treats `.agent/workflows` as a `legacy_target` (cleaned up before each reinstall), not an active directory. Our installer was creating `.agent/workflows/` on every auto-install, only for the official installer to delete it. Removed `workflowsDir: '.agent/workflows'` from the Antigravity target configuration to align with the official BMAD architecture

### OutputFormat Consistency

The `agileagentcanvas.outputFormat` setting (`json`, `markdown`, `dual`) was not consistently respected across all file-writing operations. The `agileagentcanvas_write_file` LLM tool correctly handled all three modes, but the internal `save*ToFile` methods always wrote JSON regardless of the setting and inconsistently generated Markdown companions.

- **JSON writes gated by outputFormat** — All `save*ToFile` methods (`saveVisionToFile`, `saveProductBriefToFile`, `savePRDToFile`, `saveArchitectureToFile`, `saveTestCasesToFile`, `saveTestStrategyToFile`, `saveTestDesignToFile`, `saveGenericArtifactToFile`, `saveEpicsToFile`) now wrap JSON writes in a format check. When set to `markdown`-only, JSON files are no longer written
- **Vision Markdown companion** — `saveVisionToFile` now generates a Markdown companion file via a new `generateVisionMarkdown()` method when outputFormat is `dual` or `markdown`. Previously it was the only save method that never generated Markdown
- **Per-epic Markdown companions** — `saveEpicsToFile` now generates per-epic `.md` companion files (e.g. `epic-1.md` alongside `epic-1.json`) via a new `generateSingleEpicMarkdown()` method. The epics manifest file also gets a Markdown companion
- **Vision included in combined Markdown** — `generateAllArtifactsMarkdown()` now includes the vision artifact in its output
- **Standalone story files respect outputFormat** — Story files written to `implementation-artifacts/` now check the format setting before writing JSON and generate Markdown companions in `dual`/`markdown` mode
- **Auto-migrated `requirements.json` respects outputFormat** — Both auto-migration sites (`loadFromFolder` and `syncToFiles`) now check the format setting and generate Markdown companions when appropriate
- **`/convert-to-json` respects outputFormat** — The `/convert-to-json` chat command now generates a Markdown companion for `epics.json` when outputFormat is `dual`
- **Migration writes respect outputFormat** — Story extraction and `epics.json` updates during `migrateToReferenceArchitecture` now check the format setting
- **Index files gated by format** — `stories-index.json` and `epics-index.json` are only written when the format includes JSON (`json` or `dual`); `README.md` is always written regardless of format
- **Schema repair respects outputFormat** — `fixAndSyncToFiles` now checks the format setting before writing repaired JSON files

### File I/O Migration to Epic-Scoped Layout

- **Epic-scoped directory structure** — All write operations now create files in `epics/epic-{N}/` instead of flat `planning-artifacts/` and `implementation-artifacts/` directories. New layout: `epics/epic-{N}/epic.json`, `epics/epic-{N}/stories/{id}-{slug}.json`, `epics/epic-{N}/tests/test-cases.json`
- **`epicScopedDir()` path helper** — New private method in `ArtifactStore` that constructs consistent epic-scoped directory paths across all save methods
- **Per-epic test case files** — `saveTestCasesToFile` now groups test cases by `epicId` and writes separate `test-cases.json` files into each epic's `tests/` directory. Orphan test cases without an epicId fall back to `testing-artifacts/`
- **Epic-scoped test design** — `saveTestDesignToFile` writes to `epics/epic-{N}/tests/` when `epicInfo.epicId` is present
- **LLM tool descriptions updated** — `agileagentcanvas_update_artifact` tool description now references `epics/epic-{N}/stories/` instead of `implementation-artifacts/`
- **Workflow executor defaults updated** — Default planning/implementation paths and LLM system prompts reference the new `epics/` directory
- **Project detection includes `epics/`** — `checkForMarkdownFiles` and `/convert-to-json` now scan the `epics/` directory for markdown files
- **IDE installer docs updated** — Workflow stubs for `/epics` and `/stories` reference the new epic-scoped structure
- **Auto-generated README updated** — The `syncToFiles` README template now shows the new directory tree and file paths
- **Backward compatible** — Existing projects continue to work; files already tracked via `sourceFiles` map write to their original locations
- **Legacy write paths removed** — Removed all `sourceFiles.has()` backward-compat fallbacks from every save method and `resolveArtifactTargetUri`. All writes now go exclusively to the new canonical paths regardless of where files were originally loaded from
- **Directory names cleaned** — Renamed all project-level directories: `planning-artifacts/`→`planning/`, `discovery-artifacts/`→`discovery/`, `solutioning-artifacts/`→`solutioning/`, `testing-artifacts/`→`testing/`, `bmm-artifacts/`→`bmm/`, `cis-artifacts/`→`cis/`

### Bug Fixes

- **Canvas showing stale data after reload** — `loadFromFolder()` never cleared the in-memory `artifacts` Map before re-reading from disk. Collection arrays (`testDesigns`, `testReviews`, `researches`, `testCases`, etc.) accumulated duplicates on every reload, and artifacts from deleted files persisted indefinitely. Added `this.artifacts.clear()` at the top of `loadFromFolder()` so every reload starts from a clean slate
- **Sidebar clicking Epic 2 highlights Epic 10 on canvas** — Epics loaded from `epics/` directories arrived in alphabetical order (`epic-1, epic-10, epic-11, …, epic-2`), but the sidebar tree labeled them by array index (`Epic ${index+1}`). This made `epic-10` appear as "Epic 2". Fixed by (1) sorting `allEpics` numerically by ID before storing, and (2) using canonical `epic.id` / `story.id` / `uc.id` in tree labels instead of array index
- **Sample project writing to wrong folder** — `loadSampleProject()` used the resolver's auto-detected output URI, which could point to a legacy `_bmad-output` folder from an existing BMAD-METHOD install. Now explicitly computes the output folder from the configured/default name and calls `switchProject()` if the resolver was pointing elsewhere
- **Legacy folder modal dialog** — When only a legacy `_bmad-output` folder is detected at startup, the extension now shows a modal warning dialog with three actionable choices: switch to the default `.agileagentcanvas-context`, enter a custom folder name, or keep using the legacy folder. Previously, only a passive informational message with a "Dismiss" button was shown. Existing files in `_bmad-output` are never moved or deleted
- **Transitive vscode mock in tests** — Extracted `BMAD_RESOURCE_DIR` and `DEFAULT_OUTPUT_FOLDER` to a new `src/state/constants.ts` file with zero runtime imports, fixing 447 BDD test failures caused by transitive `import * as vscode from 'vscode'` via `workspace-resolver.ts` when modules were loaded through `proxyquire`

### UI String Updates

- **User-facing labels** — Changed "BMAD skills" to "Agile Agent Canvas skills" in IDE target descriptions, progress notifications, and quick-pick placeholders
- **LLM prompt paths** — Updated hardcoded `_bmad/` resource paths in LLM system prompts to `_aac/`

## 0.3.3

### UI Improvements

- **Visible Artifact IDs on Canvas** — Artifact IDs are now permanently visible directly within the header line of all standard and compact artifact cards on the Canvas, giving users an immediate visual anchor for specific items without needing to open the detail panel.

### Schema Relaxation

- **`metadata.schema.json` allows additional properties** — Extension-generated fields like `_llmHint` were causing false validation warnings; `additionalProperties` changed from `false` to `true`
- **`story.schema.json` `dataModels` accepts objects** — `devNotes.dataModels` now accepts both strings and structured objects (`{name, description, fields}`) since LLMs generate rich data model descriptions
- **`epics.schema.json` accepts manifest refs** — Epic items in the `epics` array now accept lightweight ref entries (`{id, title, status, file}`) alongside full inline epics via `oneOf`
- **Standalone epic schema mapping removed** — `'epic' → 'epics.schema.json'` mapping removed from `schema-validator.ts` since standalone `epic-*.json` files have `content.{id,title,...}` structure incompatible with the collection schema

### Bug Fixes

- **`epics-index.json` misidentified as `'epics'` artifact** — Moved filename exclusion before content-structure checks in `detectArtifactType` so `data.epics` no longer triggers false detection
- **Epic merge data loss** — `mergeEpicDuplicate()` now preserves `useCases`, `testStrategy`, `fitCriteria`, `successMetrics`, `risks`, `definitionOfDone`, and `technicalSummary` (previously only `stories` were merged)
- **Canvas task completion status** — Added `reconcileSprintStatusToEpics()` so `development_status` keys configured in `sprint-status.yaml` update Epics and Stories on the canvas retroactively. A `done` status strictly checks off all internal Story Tasks.
- **Test execution tracking** — Extended the artifact store parser to read `test_execution_status` from `sprint-status.yaml`. `ready`, `passed`, `failed`, and `blocked` states instantly reflect mapped test cases within Test Coverage cards on the Canvas.
- **Epic story progress bar** — Replaced plain text agile-badges for epic summaries with a rich progress bar chip that visually fills as child stories are moved to `done`.
- **Inline test case progress bar** — Replicated the visual green-fill chip component from tasks to the inline tests summary in `ArtifactCard.tsx`.

## 0.3.2

### Documentation

- **Canvas integration contract in test design skill** — Added `AgileAgentCanvas Integration` section to the `bmad-tea-testarch-test-design` SKILL.md explaining Path A (`test-cases.json` with `storyId`) for direct story card badges vs Path B (test-design `coveragePlan` with `<storyNum>-` ID prefix) for planning-level artifacts. Prevents LLMs from generating test design files when the user wants individual test case badges on story cards
- **CoveragePlan requirement field quality** — Added explicit guidance across SKILL.md, schema, JSON template (example item), and step-05 requiring the `requirement` field to contain a human-readable description (e.g. `"AC-1.2.1: POST full valid tree payload"`) instead of bare AC keys. The canvas uses this field as the test case title on story cards
- **Stale extension path in SKILL.md** — Replaced hardcoded `agileagentcanvas-0.2.1` path with `{bmad-path}` template variable so workflow loading works across versions
- **storyId/epicId format standardization** — Standardized `storyId` examples to numeric format (`"1.3"`) matching `epics.json` convention; relaxed `epicId` schema to accept both numeric and `EPIC-` prefixed formats since the code normalizes both

### Bug Fixes

- **Use case and test strategy loss on reload** — When duplicate epics were detected (manifest + directory scan), only stories were merged — `useCases`, `testStrategy`, `fitCriteria`, `successMetrics`, `risks`, `definitionOfDone`, and `technicalSummary` were silently dropped from whichever copy loaded second. Extracted a shared `mergeEpicDuplicate()` method that deduplicates stories by ID/title and adopts the richer verbose fields (longer arrays win) across all 4 inline merge locations
- **Schema validation warnings for standalone epic files (17 → 0)** — Four fixes: (1) moved `epics-index.json` exclusion before content-structure checks in `detectArtifactType` so `data.epics` no longer triggers false `'epics'` detection, (2) removed the invalid `'epic' → 'epics.schema.json'` mapping since standalone epic files have `content.{id,title,stories,...}` structure incompatible with the `content.epics[]` collection schema, (3) updated `epics.schema.json` to accept manifest ref entries (`{id, title, status, file}`) alongside full inline epics via `oneOf`, (4) allowed additional properties in `metadata.schema.json` for extension-generated fields like `_llmHint`
- **Test Design rendering and overwriting** — Fixed an issue where multiple `test-design` files were overwriting each other in memory due to a singleton state property, replacing it with an array to support multiple test designs per project
- **Auto-reload data loss prevention** — When files are changed externally, the extension now only notifies the canvas (showing a "Reload" badge) instead of forcing an immediate state reload that overwrote unsaved user edits in the Detail Panel
- **Test cases missing from story cards** — Test cases without an `id` field were silently dropped during reconciliation; they now get an auto-generated `TC-{N}` identifier
- **Test case data loss on save** — `id` and `status` fields were being stripped from test case objects during serialization, causing manually added test cases to lose their identity after save
- **Epic ID mismatch in test design** — Test design artifacts using prefixed epic IDs (e.g. `EPIC-15`) failed to match against `epics.json` entries using numeric IDs (`15`); added `normalizeEpicId()` helper for case-insensitive, prefix-agnostic matching
- **Story ID mismatch in test cases** — Story IDs with `S-` prefix (e.g. `S-15.1`) were not matched against stories using bare numeric IDs (`15.1`); added `normalizeStoryId()` helper for flexible matching
- **Epic swimlane height accumulation** — Fixed bug where expanding multiple stories in the same horizontal row caused the epic swimlane to grow excessively tall by incorrectly summing their expansion heights instead of using the maximum height

### Artifact Array Migration

- **Migrated standalone singletons to arrays** — Refactored schemas and `ArtifactStore` to support arrays of `codeReview`, `techSpec`, `testReview`, `retrospective`, `changeProposal`, `uxDesign`, `readinessReport`, and `sprintStatus` instead of overwriting singletons
- **Fixed testing suite childBreakdown bug** — Corrected `artifact-transformer` to appropriately use `b.types.includes` when mapping tasks and testcases to childBreakdown items in story components

### Standalone Epic Files

- **Epic file extraction** — Each epic is now saved to its own file under `planning-artifacts/epics/epic-{id}.json`, and `epics.json` becomes a lightweight manifest with metadata + refs (`id`, `title`, `status`, `file`). Reduces monolithic file size from 5,000+ lines to ~300-500 per epic, improving LLM token efficiency and git diffs
- **Backward compatible loading** — Projects with monolithic inline `epics.json` (old format) continue to load normally; epics are auto-split to standalone files on the next save
- **`epics-index.json` manifest** — Generated alongside `stories-index.json` on every sync, providing a compact index of all epics for LLM consumption
- **LLM file structure guidance** — Three layers of orientation for LLMs: self-documenting `_llmHint` in manifest metadata, File Structure Reference in workflow stubs (`/epics`, `/stories`), and auto-generated `README.md` in the output folder with a complete file layout map and quick-reference table

### Schema ID Convention Audit

- **12 schemas updated with ID format guidance** — Added explicit descriptions with canonical format examples to `epicId`, `storyId`, `testId`, `riskId`, and other ID fields across `test-design`, `epics`, `story`, `traceability-matrix`, `code-review`, `retrospective`, `atdd-checklist`, `nfr-assessment`, `change-proposal`, `readiness-report`, `test-design-qa`, and `test-design-architecture` schemas. This guides LLMs to generate consistent numeric-format IDs (e.g. `'15'` for epics, `'15.1'` for stories) instead of ad-hoc formats

## 0.3.1

### IDE Installer Overhaul

- **Workflow stub provisioning** — "Install Framework to IDE" and auto-install now create `.agent/workflows/` with 29 workflow stubs (`refine.md`, `enhance.md`, `dev.md`, `sprint.md`, etc.) so Antigravity and other IDEs can discover all `@agileagentcanvas` slash commands without needing the VS Code chat participant API
- **Schema reference file** — Installs `.agent/schemas-location.md` pointing the LLM to the extension's bundled schema directory, so it can read and validate against BMAD schemas without duplicating 41 schema files into every workspace
- **Fixed legacyDirs regression** — Removed `.agent/workflows` from Antigravity's `legacyDirs` cleanup list (also `.windsurf/workflows` for Windsurf, `.rovodev/workflows` for Rovo Dev). The installer was incorrectly treating the workflows directory as legacy and deleting it on every auto-install, breaking all slash-command workflows

### Schema Relaxation

- **94 enums relaxed across 33 schema files** — Category, type, and classification enums (e.g. `category`, `type`, `testType`, `scanType`, `channel`, `changeType`) converted from strict `enum` to open `string` with `description` listing recommended values. This prevents schema validation failures when LLMs generate domain-appropriate values not in the hardcoded list. Status, priority, severity, and workflow-state enums remain strict

### Bug Fixes

- **Swimlane height adaptation** — Story card base height now accounts for inline task/test progress chips and expandable rows, preventing overflow into adjacent epic swimlane bands
- **Folder display in toolbar** — Active folder name correctly displays in the canvas toolbar; folder selection button works reliably across single and multi-root workspaces

## 0.3.0

### Story Children Layout Refactor

- **Compact story cards** — Task and test-coverage cards are no longer stacked vertically below stories; stories now show inline `childBreakdown` badges ("3 Tasks ▸", "5 Tests ▸") and compact summary chips with progress bars, dramatically reducing epic row height
- **Inline task/test progress chips** — Story cards display a `✓ 2/3` task completion chip (with micro progress bar) and a `🧪 4/5` test coverage chip, turning green when all pass and red when tests fail
- **Expandable task/test rows** — Clicking the summary chips or badges expands individual task rows (with checkbox, description, effort hours) and test rows (with status icon, title) inline within the story card. Expanded content overflows the card boundary with a slide-in animation
- **Switch/browse button always visible** — Fixed stale test that expected the folder switch button to hide when only one project was detected; the button is now always visible as it doubles as a folder browser

### Artifact Reference Architecture

- **Single source of truth for stories** — Stories now use `id` (replacing `storyId`) and require `epicId` in the schema. Standalone story files are routed to their correct parent epic by `epicId` instead of being dumped into the first epic
- **Requirements deduplication** — `requirementsInventory` is no longer written back to `epics.json` on save; PRD is the authoritative source. Epics.json requirements are loaded as a backward-compatible fallback only
- **Test strategy priority** — Standalone `test-strategy.json` is the authoritative source; inline `testStrategy` per epic is treated as a fallback for projects without a standalone file
- **Migrate to Reference Architecture command** — New command (`Ctrl+Shift+P` → "Migrate to Reference Architecture") extracts inline stories from `epics.json` to individual files in `implementation-artifacts/`, replaces them with string refs, and removes `requirementsInventory`. Creates a backup before migration
- **Restore Pre-Migration Backup command** — Reverts `epics.json` to the pre-migration backup with one click
- **Story dependency normalization** — Flat `string[]` dependencies are normalized to `{blockedBy: [...]}` on load and reverse-normalized on save for backward compatibility
- **Story status and ID preservation** — `id` and `status` fields are no longer stripped from stories during save
- **Orphan story safety** — Standalone stories without a matching `epicId` are now logged as warnings instead of being silently added to an unrelated epic
- **Stories index manifest** — `stories-index.json` is auto-generated on every save, listing all stories with `id`, `title`, `epicId`, and `status` for quick lookup by tools and workflows
- **BMAD workflow alignment** — Updated `epics-template.json` (removed `requirementsInventory`, added `epicId` to story template), `create-story/template.json` (`storyId` → `id`), and step-03 instructions with Story Identity Rules for the reference architecture
- **Migration auto-detection** — On load, if epics.json contains inline stories, shows a one-time notification with a "Migrate Now" button to extract them to standalone files

### Story Generation Fixes

- **`updateArtifact` creates standalone story files** — When the LLM calls `agileagentcanvas_update_artifact(type='story', ...)` for a story that doesn't already exist, it now creates a standalone story file in `implementation-artifacts/` and routes it to the parent epic via `epicId` derivation — previously, new story creation silently failed
- **BMAD workflow alignment** — Updated 5 workflow step files (`step-03-create-stories`, `step-03a-story-enhancement`, `step-04-final-validation`, `convert-to-json/workflow`, `dual-output-json`) to remove conflicting "append to epics.md" instructions and replace with `agileagentcanvas_update_artifact` calls, `id` (not `storyId`), and `epicId`
- **Tool description improvements** — `agileagentcanvas_update_artifact` description now explicitly states that stories are standalone files, must include `epicId`, and use `id` (not `storyId`)

### Requirements Data Persistence

- **PRD requirement extraction** — Non-functional and additional requirements from the PRD are now extracted into the requirements map during loading. Previously the PRD was stored raw but its requirements were never extracted, causing NFR and additional requirements to be invisible when no standalone requirements file existed
- **Standalone requirements.json** — `syncToFiles` now writes a standalone `requirements.json` to the solutioning-artifacts (or planning-artifacts) directory, preserving all requirements across save-reload cycles. Previously `requirementsInventory` was stripped from `epics.json` on save without a replacement, causing NFR and additional requirements to vanish after the first save
- **Auto-migration** — On first load, if no standalone `requirements.json` exists on disk but requirements are found in memory (from PRD, `requirementsInventory`, or `functional-requirements.json`), a standalone `requirements.json` is automatically written to ensure data survives across save cycles
- **Load priority** — Standalone `requirements.json` now takes priority over PRD for each requirement category. When standalone exists, PRD extraction is skipped for that category to prevent duplication
- **Requirements schema** — New `requirements.schema.json` defines the bulk file format with `functional`, `nonFunctional`, and `additional` arrays
- **PRD schema updated** — Added missing `additional` requirements array to `prd.schema.json`
- **Workflow update** — `step-10-nonfunctional.md` now documents that PRD requirements are auto-extracted to standalone files on first canvas load

### Folder Selection Discoverability

- **Always-visible folder button** — The folder button in the canvas toolbar is now always visible, not just when 2+ projects are detected. Clicking it opens a picker to switch between detected projects, browse for any folder, or create a new custom-named project folder
- **"Create New Folder..." option** — The switch-project picker now offers a "Create New Folder..." option that prompts for a folder name, creates it in the workspace, and switches to it — so users can start fresh in a custom folder without editing settings
- **Empty state browse button** — The canvas empty state now shows a "Browse / New Folder" button alongside "Create Sample Project", giving new users an obvious path to load from or create a project in a custom folder
- **Help modal guidance** — Getting Started section updated with clear instructions for folder selection: toolbar button, settings option, and Load Existing Project command
- **Improved setting description** — `agileagentcanvas.outputFolder` setting now explains that it controls the default subfolder name and that the toolbar folder button offers an alternative
- **Sidebar switch link** — Added "Switch / Browse Project Folder" link to the sidebar welcome view
- **Active folder label in toolbar** — The toolbar folder button now displays the name of the currently active project folder (e.g. `.agileagentcanvas-context`), so users always know which folder is loaded. The label truncates gracefully for long names and updates dynamically when switching folders

### Bug Fixes

- **Epic Definition of Done display** — The DoD section in the Epic detail panel was not rendering because `artifact-store.ts` was flattening the rich DoD object (`{items, qualityGates, acceptanceSummary}`) into a plain string array; now passes the full object through to the renderer

### Side Panel Improvements

- **Architecture tree** — Architecture documents now appear in the artifacts side panel with expandable sub-items: Overview, Decisions (ADRs), System Components, Patterns, Integrations, Tech Stack, and Security
- **Risks tree** — Standalone risks now show in the side panel as an expandable section with individual risk items displaying severity icons and category/probability/impact metadata
- **Requirements drill-down** — Functional, Non-Functional, and Additional requirement categories are now expandable to show individual requirement items with priority icons and IDs

### Data Persistence

- **Test strategy on epics** — `testStrategy` is now preserved when saving epics to JSON; previously the field was stripped during serialization via destructuring
- **Architecture decisions on requirements** — `architectureDecisions` field is now included in requirement serialization, ensuring architecture-linked requirements round-trip correctly

### Schema Repair

- **Send to Chat on fix failure** — Schema issues that auto-repair cannot resolve now show a "Send to Chat" button alongside "Dismiss". Clicking it opens the AI chat with the affected file(s), schema type(s), and validation error details so the agent can read and fix them directly
- **`stories-index.json` excluded from validation** — The generated stories index manifest is no longer misidentified as a `story` artifact during type detection, eliminating false schema warnings
- **Inline story required fields repair** — Inline story objects in epics that lack `id`, `title`, `userStory`, or `acceptanceCriteria` now get auto-filled; stories with only `storyId` are converted to string refs
- **`uxReferences` object-to-string repair** — Inline story `uxReferences` that contain objects (rather than the schema-required `string[]`) are now flattened to descriptive strings
- **`fitCriteria.security` enum repair** — Invalid security `category` and `verificationMethod` values in epic fit criteria are remapped to valid schema enum values via comprehensive lookup tables

### Schema Updates

- **Epic test strategy in schema** — Added `testStrategy` property (with `id`, `title`, `scope`, `approach`, `testTypes`, `tooling`, `coverageTargets`, `riskAreas`, `epicId`, `status`) to `epics.schema.json`, making epic-level test strategies schema-valid
- **Story dependencies accept arrays** — `dependencies` in `story.schema.json` now accepts both a simple `string[]` and the rich object form (`{blockedBy, blocks, relatedStories, externalDependencies}`) via `oneOf`, matching real-world project data
- **Epic stories accept string refs** — `stories` items in `epics.schema.json` now accept both string IDs (reference architecture) and full inline story objects via `oneOf`
- **Metadata status enum expanded** — `metadata.schema.json` status enum now includes story-specific values (`ready-for-dev`, `ready`, `in-review`, `blocked`, `done`, `complete`) so story files pass validation without coercion

### Migration Improvements

- **Proper metadata on extracted stories** — Migration now writes `schemaVersion`, `artifactType`, `timestamps`, and `status` in metadata for extracted story files, matching `metadata.schema.json` requirements
- **Migration modal truncation** — Migration summary modal now shows at most 10 extraction entries with a "... and N more" count, preventing uncloseable modals on large projects
- **Fix schemas: storyId → id repair** — The "Fix schemas" repair now copies `storyId` to `id` (and removes the deprecated field) instead of scaffolding an empty string
- **Fix schemas: epicId derivation** — The "Fix schemas" repair now derives `epicId` from the filename prefix (e.g. `1-2-foo.json` → epicId `"1"`) when missing

### Schema Repair Simplification

- **Removed aggressive property stripping** — The `fixAndSyncToFiles` repair engine no longer strips unknown root, metadata, content, or coverage-plan properties from artifacts. This prevents data loss when schemas evolve ahead of the hardcoded allow-lists
- **Removed test-design enum coercion** — Removed forced coercion of `testLevel`, `testType`, review priorities, effort values, verdict, and risk-level enums. Data is now preserved as-is, letting schema validation surface mismatches instead of silently rewriting
- **Removed test-review enum coercion** — Removed the entire test-review repair block (priority/effort/category/reviewType/verdict/riskLevel coercion), simplifying the repair pipeline

### Test Fixes

- **Transitive vscode mock** — Added `artifact-file-io` mock to 7 `proxyquire` calls across step definition files, fixing 323 BDD tests that failed with `Cannot find module 'vscode'` due to the transitive import chain `artifact-store → artifact-file-io → vscode`
- **Epic column position assertions** — Updated 2 stale assertions from `x=2510` to `x=2530` to match the `IMPL_CARD_INSET` offset added in 0.2.1

### Documentation

- **DB migration planning** — Added `docs/db-migration/` with complete design documents for migrating from JSON file persistence to a local-first SQLite database: implementation plan (sql.js WASM, typed DAL, ArtifactService layer, 5-phase rollout), architecture audit (15 findings, all resolved), and full schema-to-DB mapping (40 schemas → ~115 tables)

### Housekeeping

- **`.agent/` added to `.gitignore`** — BMAD skill files generated at runtime by the IDE installer are now excluded from source control

## 0.2.1

### Canvas Layout Refinements

- **Swimlane spacing** — Added visible gaps between Planning, Solutioning, and Implementation lane backgrounds; lanes no longer visually touch each other
- **Epic swimlane band margins** — Epic and testing row bands within the Implementation lane now have horizontal (10px) and vertical (6px) insets with rounded borders, giving cards breathing room inside bands
- **Cards contained within epic bands** — All Implementation lane cards shifted inward by 20px (`IMPL_CARD_INSET`) so cards no longer overlap the epic band border
- **Mindmap view spacing** — Increased vertical gap between sibling nodes (16→28px) and horizontal gap between depth levels (60→70px) for better readability and group-box clearance
- **Epic risk cards removed** — Risks are now shown only under PRD in the Planning lane; epic-level risk card creation removed entirely to eliminate apparent duplication (epic metadata still carries risk data for the detail panel)
- **Lane height adaptation** — Swimlane heights now filter cards by x-position bounds, preventing Implementation-lane cards from inflating Planning lane height

### Schema Validation Fixes

- **Epic risks schema** — `risks` field in the epics schema now accepts both the full `risks.schema.json` object wrapper and a bare array of risk items via `oneOf`, matching real-world project data
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

- **Coverage gates enforced** — Added global c8 thresholds (`lines`/`statements` 50%, `branches` 55%, `functions` 60%) and a module-level gate script (`check-coverage-thresholds.js`) for `src/state`, `src/chat`, and `src/workflow`
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

### Refactoring

- **Eliminated duplicate layout engine** — Replaced the 500-line `stateToArtifacts()` in `canvas-view-provider.ts` with a 3-line wrapper delegating to the canonical `buildArtifacts()` in `artifact-transformer.ts`, removing a significant source of drift between the editor panel and sidebar views

### Tests

- **Updated BDD feature tests** — All X-position assertions updated for new lane positions; overlap checks updated for 2D grid layout; test-case consolidation into test-coverage reflected; requirement dependency changed from `dependencies` to `parentId`
- **Updated unit tests** — ArtifactCard expand/collapse tests updated for per-badge toggle behavior; Canvas tests updated with `expandedCategories` and `onToggleCategoryExpand` props; App tests updated to use badge click instead of `.expand-btn`

## 0.1.0

Initial release as **Agile Agent Canvas** (previously "BMAD Studio").

### Features

- **Visual Canvas** — 4-lane workflow canvas (Discovery, Planning, Solutioning, Implementation) with color-coded artifact cards, dependency arrows, minimap, and inline detail editing
- **AI Chat Participant** — `@agileagentcanvas` in VS Code chat with 30+ slash commands for vision, requirements, epics, stories, design thinking, code review, and more
- **Language Model Tools** — `agileagentcanvas_read_file`, `agileagentcanvas_list_directory`, `agileagentcanvas_update_artifact` for autonomous AI interactions
- **44 Built-in Workflows** — Structured product development processes with steps, validation checkpoints, and automatic artifact population
- **Multi-Provider AI** — Supports GitHub Copilot, OpenAI, Anthropic, Gemini, Ollama, and Antigravity
- **Export/Import** — Export to Markdown, JSON, JIRA CSV; import from JSON with Replace or Merge strategies
- **Sidebar Views** — Canvas, Artifacts tree, and Workflow Progress views in the activity bar
- **BMAD-METHOD Framework** — Bundled methodology content for agents, workflows, schemas, and checklists
