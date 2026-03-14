# Changelog

## 0.3.0

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

### Schema Updates

- **Epic test strategy in schema** — Added `testStrategy` property (with `id`, `title`, `scope`, `approach`, `testTypes`, `tooling`, `coverageTargets`, `riskAreas`, `epicId`, `status`) to `epics.schema.json`, making epic-level test strategies schema-valid

### Schema Repair Simplification

- **Removed aggressive property stripping** — The `fixAndSyncToFiles` repair engine no longer strips unknown root, metadata, content, or coverage-plan properties from artifacts. This prevents data loss when schemas evolve ahead of the hardcoded allow-lists
- **Removed test-design enum coercion** — Removed forced coercion of `testLevel`, `testType`, review priorities, effort values, verdict, and risk-level enums. Data is now preserved as-is, letting schema validation surface mismatches instead of silently rewriting
- **Removed test-review enum coercion** — Removed the entire test-review repair block (priority/effort/category/reviewType/verdict/riskLevel coercion), simplifying the repair pipeline

### Test Fixes

- **Transitive vscode mock** — Added `artifact-file-io` mock to 7 `proxyquire` calls across step definition files, fixing 323 BDD tests that failed with `Cannot find module 'vscode'` due to the transitive import chain `artifact-store → artifact-file-io → vscode`
- **Epic column position assertions** — Updated 2 stale assertions from `x=2510` to `x=2530` to match the `IMPL_CARD_INSET` offset added in 0.2.1

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
