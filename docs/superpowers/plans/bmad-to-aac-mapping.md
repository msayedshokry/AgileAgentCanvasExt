# BMAD → AAC Residual Footprint Mapping (Phase 2 closing)

> Authoritative decision record for the residual `bmad-*` → `aac-*` migration.
> The doc evolves through Phase 2 (initial close, Doc v1) and a follow-up commit
> (Doc v2) — commit-by-commit diff is captured in **Doc Evolution** at the bottom.
> Generated against current `main` at `5d5e851` (Phase 2 baseline). Phase 2 v2 commit
> lands the 2 add-back catalogue twins and bumps the residual sweep count from 19
> to 21. Phase 2 v3 commit lands the 5 true no-twin catalogue twins (creating
> `resources/_aac/skills/aac-to-json/` and adding 5 entries to `skill-manifest.csv`)
> and bumps the count from 21 to 26. Phase 2 v4 commit lands the legacy semantic-remap
> outlier (`bmad-create-product-brief` → `aac-product-brief`) and bumps the count from
> 26 to 27. Phase 2 v5 commit deletes the 10 redundant `bmad-tea*` / `bmad-testarch-*`
> directories documented as Cat 3 — 9 actively `git rm -r`'d, 1 (`bmad-testarch-teach-me-testing`)
> was already absent pre-commit. Cat 2c is fully resolved at this point — 0 keep-as-stable-identifier IDs
> remain. Cat 3 is fully resolved at this point — 0 deferred duplicate dirs remain on disk.
> Plan Task 2.1's original premise (48 `bmad-*` skill folders under
> `resources/_aac/skills/`) had diverged from reality at the time this work began
> — 0 such folders remain there. This doc records what *is* still present at sweep completion.

## Decision rules

Three rules apply to each residual `bmad-*` entity:

1. **Remap & sweep** — internal agent IDs, class names, test fixtures, and any code/test strings decoupled from external filesystem paths. Safe to rename.
2. **Keep as methodology** — product branding (BMAD = Business Method for AI Development), UI titles ("BMAD Integration"), and the workflow template variable `{bmad-path}` referenced by 166 user-installed workflow templates. Renaming would break installs.
3. **Keep as stable identifier** — workflow/skill IDs that ARE the deployed identity at user IDEs and have **no** `aac-*` twin directory. Renaming would break ID resolution for installed skills.

## Category 1 — In-scope swept references

These references were swept in Phase 2. The Target column shows the
exact post-sweep value as written in source code. The single table that
first tracked them has been **split into three sub-tables** because the
rewrite target depends on what the string semantically represents at
runtime — pairing persona/catalogue renames with test-fixture synthetic
literals in one table obscured the divergence between them and misled
the prior pass into using `mock-workflow-fixture` for *all* rows,
including the JSDoc/comment rows where it actively corrupted
documentation of runtime values.

### 1a. Persona & catalogue-row renames (`aac-*` parallel directory exists)

| Source                                              | Target                       | Where                                                                              |
|------------------------------------------------------|------------------------------|------------------------------------------------------------------------------------|
| Persona: Mary → Analyst                             | `aac-agent-analyst`          | `src/commands/ide-installer.ts:1238`                                                |
| Persona: John → PM                                   | `aac-agent-pm`               | `src/commands/ide-installer.ts:1239`                                                |
| Persona: Winston → Architect                         | `aac-agent-architect`        | `src/commands/ide-installer.ts:1240`                                                |
| Persona: Amelia → Dev                                | `aac-agent-dev`              | `src/commands/ide-installer.ts:1241`                                                |
| Persona: Sally → UX Designer                         | `aac-agent-ux-designer`      | `src/commands/ide-installer.ts:1244`                                                |
| Persona: Paige → Tech Writer                         | `aac-agent-tech-writer`      | `src/commands/ide-installer.ts:1245` (target confirmed via `team-orchestrator.ts:472`, `team-registry.ts:460,469,595`) |
| Skill tag `bmad-tea-testarch-test-design`           | `aac-tea-test-design`        | `src/commands/ide-installer.ts:1219` (parallel `aac-tea-test-design/` exists)        |
| Skill tag `bmad-document-project`                   | `aac-document-project`       | `src/commands/ide-installer.ts:1224` (parallel `aac-document-project/` exists)        |
| Skill tag `bmad-create-prd`                         | `aac-create-prd`             | `src/commands/ide-installer.ts:1217` (parallel `aac-create-prd/` exists)              |
| Skill tag `bmad-create-epics-and-stories`           | `aac-create-epics-and-stories` | `src/commands/ide-installer.ts:1217` (parallel `aac-create-epics-and-stories/` exists) |
| Skill tag `bmad-create-architecture`               | `aac-create-architecture`      | `src/commands/ide-installer.ts:1220` (parallel `aac-create-architecture/` exists) |
| Skill tag `bmad-create-ux-design`                  | `aac-create-ux-design`          | `src/commands/ide-installer.ts:1221` (parallel `aac-create-ux-design/` exists) |
| Skill tag `bmad-generate-project-context`          | `aac-generate-project-context`  | `src/commands/ide-installer.ts:1220` (parallel `aac-generate-project-context/` exists) |
| Skill tag `bmad-sprint-planning`                   | `aac-sprint-planning`           | `src/commands/ide-installer.ts:1223` (parallel `aac-sprint-planning/` exists) |
| Skill tag `bmad-sprint-status`                     | `aac-sprint-status`             | `src/commands/ide-installer.ts:1223` (parallel `aac-sprint-status/` exists) |
| Skill tag `bmad-retrospective`                     | `aac-retrospective`             | `src/commands/ide-installer.ts:1223` (parallel `aac-retrospective/` exists) |
| Skill tag `bmad-to-json`                           | `aac-to-json`                   | `src/commands/ide-installer.ts:1225` (parallel `aac-to-json/` exists; SKILL.md created in this commit) |
| Skill tag `bmad-create-product-brief`              | `aac-product-brief`             | `src/commands/ide-installer.ts:1217` (parallel `aac-product-brief/` exists; legacy semantic-remap — `aac-` twin drops the `create-` prefix) |

### 1b. Test fixtures (synthetic literal — producer + consumer symmetric)

| Source string                                                      | Target string (synthetic)     | Where                                                                                |
|--------------------------------------------------------------------|-------------------------------|--------------------------------------------------------------------------------------|
| Test fixture `'bmad-create-prd'` (x8 sites)                        | `'mock-workflow-fixture'`     | `src/views/agentic-kanban-message-handler.test.ts:124,129,152,178,194,291,296,321`    |
| Webview test fixture + aria-label `'bmad-create-prd'` (x6 sites)   | `mock-workflow-fixture`        | `webview-ui/src/agentic-kanban/TracePanel.test.tsx:36,153,159,171,173,189`           |

### 1c. JSDoc / comments (real workflow names — runtime-documentation precision)

| Source                                                                       | Target (real workflow names)                              | Where                                                                          |
|-------------------------------------------------------------------------------|------------------------------------------------------------|---------------------------------------------------------------------------------|
| JSDoc on `TraceEntry.workflowName` interface field                            | `` `aac-create-prd`, `aac-dev-story`, `chat` ``            | `src/trace/trace-recorder.ts:18-26`                                             |
| JSDoc on `searchTraces` `workflowName` parameter                              | `` `aac-create-prd`, `aac-dev-story` ``                    | `src/trace/trace-recorder.ts:225-235`                                           |
| Inline code comment in `searchTraces` body                                    | `` `aac-create-prd` `` (×2 mentions)                       | `src/trace/trace-recorder.ts:259-265`                                           |
| JSDoc on `TraceBreakdownRow.workflow`                                          | `` `aac-create-prd`, `aac-dev-story` ``                    | `src/types/trace-breakdown.ts:36`                                                |
| JSDoc on `SharedToolContext.currentWorkflowName`                              | `` `aac-create-prd`, `aac-dev-story`, `help` ``            | `src/chat/agileagentcanvas-tools.ts:95-103`                                      |
| Comment in `WorkflowExecutor.executeWithTools`                                | `` `aac-create-prd`, `aac-dev-story` ``                    | `src/workflow/workflow-executor.ts:2740-2744` (audit gap #20/#42 trace tag)     |

**Three distinct conventions apply** to the deliberately-similar-looking strings used in this codebase:

- **Test fixtures** (`src/views/agentic-kanban-message-handler.test.ts`, `webview-ui/src/agentic-kanban/TracePanel.test.tsx`) use the synthetic literal `'mock-workflow-fixture'` because both producer (test writes the field) and consumer (test asserts equality) sides use the *same* arbitrary string. The trace-tag wire-contract test compares for equality within a self-contained system — no production code reads the literal. The `mock-` prefix is intentionally a clear-fake signal so future readers see at a glance that the reference is an example value, not a deployed skill binding.

- **JSDoc / runtime-documentation examples** (`TraceEntry.workflowName`, `TraceBreakdownRow.workflow`, `SharedToolContext.currentWorkflowName`, `WorkflowExecutor.executeWithTools` comment) use **real** workflow names (`aac-create-prd`, `aac-dev-story`) because the fields they describe hold *real* runtime workflow IDs at execution time. Using a synthetic literal here would have actively corrupted the documentation — readers would assume the field stores a string starting with `mock-`, when in reality the `WorkflowExecutor.extractWorkflowId()` produces `aac-*` skill-dir basenames.

- **`[legacy → aac-*]` marker convention** is applied to the keep-as-stable-identifier catalogue row in `generateHelpSkillContent()` to disambiguate the in-scope `aac-create-*` renames from the unchanged `bmad-create-product-brief` legacy ID (its aac-* twin is `aac-product-brief`, a semantic remap not a 1:1 string swap, deferred to follow-up). End-users browsing the installed help skill see the inline marker and know the legacy ID predates the rename but is still functional.

For actual catalogue renames (`aac-create-prd` and `aac-create-epics-and-stories`), the targets exist as twin directories in `resources/_aac/skills/`. Future `installToIde` runs will emit the new IDs to user IDE config files; existing users with `bmad-create-prd`/`bmad-create-epics-and-stories` IDs need a manual re-install of the framework.

## Category 2 — Explicitly kept (do NOT touch)

### 2a. Workflow template variable `{bmad-path}` (166 hits)

The `{bmad-path}` string is the canonical template variable key used by BMAD-methodology workflow templates to resolve the resources root. 166 markdown/yaml files under `resources/_aac/skills/aac-*/.../*.md` reference it. Renaming the variable key would break workflow template execution at every user IDE installation.

- Source of value: `src/workflow/workflow-executor.ts:1643` (`vars.set('bmad-path', this.context.bmadPath)`)
- Pipeline emission: `src/commands/ide-installer.ts:269-1154` (`agentSkillContent`, `workflowSkillContent`, `taskSkillContent`, `executableWorkflowBody`, `buildCatalogueTable` all emit `<variable-resolution>` blocks containing `{bmad-path}`)
- Receiving workflow templates: 166 files under `resources/_aac/skills/aac-*/.../*.md` (sample: `aac-bmb-agent/.../*.md`, `aac-bmb-module/.../*.md`, `aac-bmb-workflow/.../*.md`, `aac-cis-*/.../*.md`, `aac-tea-*/.../*.md`, `aac-agent-canvas-integrator/steps/*.md`)

### 2b. Methodology copy in chat-participant.ts (20 hits)

Persona greeting strings like `You are Mary, a Business Analyst from the BMAD methodology team` are product branding. Per the plan's terminological carve-out: "do **not** touch strings that refer to the *methodology* ("BMAD methodology", "BMAD artifacts", "BMAD framework") — those are product copy and stay."

- `src/chat/chat-participant.ts:1855,1899,1948,2086,3430,3439,3448` — Persona greeting strings (BMAD methodology team)
- `src/chat/chat-participant.ts:2242,2249,2295,2330,2331,2363,2440,2582,2621,4025,4064,4102,4147,4279` — Persona-name references in workflow entry prompts

### 2c. Deployed skill/workflow IDs without `aac-*` twin (no rename)

These IDs ARE the deployed identity at user IDEs. NO parallel `aac-create-*` skill directory exists on the filesystem. Renaming would break ID resolution for installed skills.

| ID                                       | Where read from                                   |
|------------------------------------------|---------------------------------------------------|
| (no remaining keep-as-stable-identifier IDs — Cat 2c fully resolved in Phase 2 v4) | — | — |

Resolved across THREE follow-up commits (Phase 2 v2, v3, v4). The 2 IDs that previously had twin directories (`bmad-create-architecture`, `bmad-create-ux-design`) were **swept to Cat 1a in Phase 2 v2** — both `aac-create-architecture/` and `aac-create-ux-design/` exist on disk under `resources/_aac/skills/` and resolve cleanly. The 5 remaining **true no-twins** (`bmad-generate-project-context`, `bmad-sprint-planning`, `bmad-sprint-status`, `bmad-retrospective`, `bmad-to-json`) were **swept to Cat 1a in Phase 2 v3** — all 5 `aac-*` skill directories now exist under `resources/_aac/skills/` (4 pre-existing + `aac-to-json/` created in this commit) and their `skill-manifest.csv` entries added. The legacy semantic-remap outlier (`bmad-create-product-brief` → `aac-product-brief`) was **swept to Cat 1a in Phase 2 v4** — `aac-product-brief/` already existed on disk under `resources/_aac/skills/` and the slash-command stub `vision` was already wired to `skills/aac-product-brief/SKILL.md` since Phase 2 baseline, requiring only the catalogue text update plus a manifest row (the `aac-` prefix drops the `create-` to match the established aac-* ID convention). **Cat 2c is fully resolved** — 0 keep-as-stable-identifier IDs remain at sweep completion.

Replacement of a true-no-twin entry requires first creating the corresponding `aac-create-*` skill directory tree in `resources/_aac/skills/` and ensuring all manifest references are updated.

### 2d. UI section "BMAD Integration"

- `webview-ui/src/components/renderers/tea-renderers.tsx:728` — `<CollapsibleSection title="BMAD Integration" sectionId="as-bmad-integration" />` — methodology UI title; methodology copy per the plan's carve-out.

## Category 3 — Resolved (deleted in Phase 2 v5)

The 10 redundant `bmad-tea*` / `bmad-testarch-*` directories under `resources/_aac/tea/` were deleted in Phase 2 v5. Each had a parallel `aac-*` twin already deployed as the live runtime path, so deletion was safe with zero impact on installed-skill resolution. 9 dirs actively removed via `git rm -r`; 1 (`bmad-testarch-teach-me-testing`) was already absent pre-v5 and is a no-op deletion (its `aac-tea-teach-me-testing/` twin has been the live runtime path since the v6.6.0 skill-migration baseline). `git log -- resources/_aac/tea/workflows/testarch/bmad-testarch-teach-me-testing/` returns empty — the dir was never tracked in committed history, so its absence is structural (not a missed cleanup). The deletion diff of the v5 commit is the canonical audit record — once it lands at HEAD, `git show HEAD --stat -- resources/_aac/tea/agents/ resources/_aac/tea/workflows/testarch/` lists every deleted path. (Today the deletions are staged but uncommitted, so that command returns empty against current HEAD.) Cat 3 has no further work — this section is a resolution marker, not an action list.

## Phase 2 close-out status

| Plan Task | Original premise                                              | Actual state (post this commit)                |
|-----------|---------------------------------------------------------------|-------------------------------------------------|
| **2.1** Mapping table        | 48 `bmad-*` skill folders to enumerate  | 0 such folders in baseline; residual footprint = 27 in-scope refs swept (19 from initial Phase 2 + 2 catalogue twins in v2 + 5 true no-twins in v3 + 1 legacy semantic-remap in v4); the 10 Cat 3 deferred dirs documented in the v1 doc were deleted in Phase 2 v5 (9 active `git rm -r` + 1 already absent pre-commit). Both in-scope sweeps and filesystem cleanup are now fully captured. |
| **2.2** Remap personas in `agent-personas.ts`          | ~33 `ARTIFACT_TYPE_TO_AGENT` rows             | Already complete in the baseline (commit prior to `5d5e851`); the map uses `aac-*` exclusively.  |
| **2.3** Remap `team-orchestrator.ts` + `a2a-agent-card.ts`         | ~50 hardcoded `bmad-agent-*` personaIds       | Already complete in baseline; the regression guard `src/acp/team-orchestrator.test.ts:8` confirms zero hits.  |
| **2.4** Sweep residual refs                      | Search-and-rename any `bmad-` in `src/`         | 27 in-scope refs swept (Category 1 table — 19 from initial Phase 2 + 2 catalogue twins in v2 + 5 true no-twins in v3 + 1 legacy semantic-remap in v4). 166 template-var refs + 20+ methodology strings still kept by design per Decision Rule 2 (Cat 2a `{bmad-path}` template variable, Cat 2b BMAD methodology copy in chat-participant.ts, Cat 2d UI 'BMAD Integration' title). Cat 2c fully resolved — 0 keep-as-stable-identifier IDs remain. |
| **2.5** Delete folders                          | `git rm -r resources/_aac/skills/bmad-*`       | Already deleted in baseline (0 dirs present under `resources/_aac/skills/`). The 10 redundant `resources/_aac/tea/agents/bmad-tea/` + `resources/_aac/tea/workflows/testarch/bmad-testarch-*` duplicates (documented as Category 3) were deleted in Phase 2 v5 — 9 actively removed via `git rm -r`; 1 (`bmad-testarch-teach-me-testing`) was never tracked in git history, so its absence is structural (see Cat 3 note). **Cat 3 is fully resolved.** |

## Rollout notes for release manager

The 6 persona-row sweeps in `src/commands/ide-installer.ts` mean that **future `installToIde` runs will emit `aac-agent-{analyst,pm,architect,dev,ux-designer,tech-writer}` IDs** to user IDE config files. Existing users with `bmad-agent-*` ID references in their installed IDE config will need a manual re-install of the framework to pick up the renamed IDs.

The 12 skill-tag sweeps (`bmad-tea-testarch-test-design` → `aac-tea-test-design`, `bmad-document-project` → `aac-document-project`, `bmad-create-prd` → `aac-create-prd`, `bmad-create-epics-and-stories` → `aac-create-epics-and-stories`, `bmad-create-architecture` → `aac-create-architecture`, `bmad-create-ux-design` → `aac-create-ux-design`, `bmad-generate-project-context` → `aac-generate-project-context`, `bmad-sprint-planning` → `aac-sprint-planning`, `bmad-sprint-status` → `aac-sprint-status`, `bmad-retrospective` → `aac-retrospective`, `bmad-to-json` → `aac-to-json`, `bmad-create-product-brief` → `aac-product-brief`) affect the **installation catalogue table** in installed IDE files. All 12 targets have parallel `aac-*` skill directories, so the renames resolve cleanly. The 5 added in v3 and the 1 added in v4 also have manifest CSV entries so the catalogue auto-router surfaces them by name.

Recommend: include a release-notes bullet under "Breaking changes for existing users" announcing both the persona-ID rename and the catalogue-table skill-tag renames, pointing users at the `/installToIde` command.

## Doc Evolution

This doc evolves through five phase milestones. Future sweeps that touch `bmad-create-*` IDs should append a row.

| Phase             | Commits shipped       | Scope of doc change                                                                                                | In-scope swept count                     |
|-------------------|-----------------------|--------------------------------------------------------------------------------------------------------------------|------------------------------------------|
| **Phase 2 v1**    | docs-only + atomic sweep (initial Phase 2) | 3 decision rules introduced; mapping table created with all residual refs enumerated; Cat 1 split into 1a/1b/1c sub-tables; JSDoc cells corrected to real workflow names; Cat 2c enumerated 8 IDs with 2 marked "twin discovered but deferred". | **19**                               |
| **Phase 2 v2**    | follow-up sweep commit (this doc)          | Cat 1a +2 catalogue-twin sweep rows (`bmad-create-architecture` → `aac-create-architecture`, `bmad-create-ux-design` → `aac-create-ux-design`); Cat 2c reduced 8→6 IDs with `[legacy]` bracket marker on `bmad-create-product-brief`; conventions narrative heading bumped Two→Three; provenance paragraph refreshed; this Doc Evolution section added. | **21** (19 + 2 add-back catalogue twins) |
| **Phase 2 v3**    | true-no-twins sweep (this commit)          | Cat 1a +5 catalogue-twin sweep rows (`bmad-generate-project-context` → `aac-generate-project-context`, `bmad-sprint-planning` → `aac-sprint-planning`, `bmad-sprint-status` → `aac-sprint-status`, `bmad-retrospective` → `aac-retrospective`, `bmad-to-json` → `aac-to-json`); created the previously-missing `resources/_aac/skills/aac-to-json/SKILL.md`; added 5 manifest CSV rows under `bmm` module so the help-skill catalogue auto-router surfaces them; Cat 2c reduced 6→1 IDs (only the legacy `bmad-create-product-brief` outlier remains); Rollout notes skill-tag tally bumped 6→11. | **26** (21 + 5 true no-twins) |
| **Phase 2 v4**    | legacy semantic-remap sweep (this commit)  | Cat 1a +1 catalogue-twin sweep row (`bmad-create-product-brief` → `aac-product-brief`; `aac-` prefix drops the `create-` to match the established aac-* ID convention — runtime path `/skills/aac-product-brief/SKILL.md` is wired via `STUB_TO_MANIFEST.vision` since baseline); added 1 manifest CSV row under `bmm` module; Cat 2c reduced 1→0 IDs (fully resolved); Rollout notes skill-tag tally bumped 11→12. | **27** (26 + 1 legacy semantic-remap) |
| **Phase 2 v5**    | Cat 3 filesystem cleanup (this commit)     | 9 redundant `bmad-tea` / `bmad-testarch-*` directories under `resources/_aac/tea/` deleted via `git rm -r`; 1 (`bmad-testarch-teach-me-testing`) was already absent pre-commit (and was never tracked in git history — see Cat 3 note). Each deleted dir had a parallel `aac-*` twin at the live runtime path — zero installable / catalogue / manifest refs affected. Cat 3 fully resolved. Cat 1 / Cat 2 unchanged from v4. | **27** (v5 is filesystem-only) |

**Count footnote.** "*In-scope swept count*" tallies distinct source locations touched (1 row in Cat 1a may aggregate multiple sites — e.g. Cat 1b's 2 rows cover 14 fixture sites — but row count and ref count are tracked separately). Future readers reconciling this number against Cat 1's 12+2+6=20 visible rows should understand the +1 delta is the engineered distinction: row count tracks mapping-table granularity, ref count tracks source-site impact. Future sweeps should preserve the same distinction or update both at once.

This doc is the canonical record at HEAD; future sweeps that touch `bmad-create-*` IDs should append a row above.
