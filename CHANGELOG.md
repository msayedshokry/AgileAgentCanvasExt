# Changelog

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
