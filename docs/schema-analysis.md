# Schema vs Canvas Architecture Analysis

Complete guide: current state (all 42 types + embedded sub-entities), issues, and proposed ideal mapping.

---

## Current State: Full Type Mapping

### Tier 1: Canvas Cards (16 types → rendered by `buildArtifacts()`)

| Card Type | Store Key | Current Source(s) | Issues |
|---|---|---|---|
| `product-brief` | `productBrief` | `product-brief.json` | ✅ Clean |
| `vision` | `vision` | `*vision*.json` | ✅ Clean |
| `prd` | `prd` | `*prd*.json` | ✅ Clean |
| `risk` | `prd.risks[]` + `risks.risks[]` | PRD embedded + standalone `risks.json` | ⚠️ 2 sources |
| `requirement` | `requirements.functional[]` | `requirements.json`, `functional-requirements.json`, PRD, `epics.json` | 🔴 4 sources |
| `nfr` | `requirements.nonFunctional[]` | `requirements.json`, PRD | ⚠️ 2 sources |
| `additional-req` | `requirements.additional[]` | `requirements.json`, PRD | ⚠️ 2 sources |
| `architecture` | `architecture` | `architecture.json` | ✅ Clean |
| `architecture-decision` | `architecture.decisions[]` | Embedded in `architecture.json` | ⚠️ Embedded |
| `system-component` | `architecture.systemComponents[]` | Embedded in `architecture.json` | ⚠️ Embedded |
| `epic` | `epics[]` | Manifest → `epics/epic-*.json` | ✅ Good pattern |
| `story` | `epic.stories[]` | Epic files + `implementation-artifacts/*.json` | 🔴 2 sources |
| `use-case` | `epic.useCases[]` | Embedded in epics | ⚠️ Embedded |
| `task` | `story.tasks[]` | Inline in stories — **no standalone card** | ⚠️ Inline-only |
| `test-strategy` | `testStrategy` | Standalone or `epic.testStrategy` | ⚠️ 2 modes |
| `test-coverage` | Aggregated `testCases[]` | `test-cases.json` — **synthesized, not a file** | ⚠️ Synthesized |

### Tier 2: Store-Only (24 types)

| `artifactType` | Store Key | Module | Proposed Canvas? |
|---|---|---|---|
| `test-design` | `testDesigns[]` | TEA | → Yes |
| `test-design-qa` | `testDesigns[]` | TEA | → Yes |
| `test-design-architecture` | `testDesigns[]` | TEA | → Yes |
| `test-cases` | `testCases[]` | TEA | Already → `test-coverage` |
| `traceability-matrix` | `traceabilityMatrix` | TEA | → Yes |
| `test-review` | `testReviews[]` | TEA | → Yes |
| `nfr-assessment` | `nfrAssessment` | TEA | Store-only |
| `atdd-checklist` | `atddChecklist` | TEA | Store-only |
| `test-framework` | `testFramework` | TEA | Store-only |
| `ci-pipeline` | `ciPipeline` | TEA | → Yes |
| `automation-summary` | `automationSummary` | TEA | Store-only |
| `test-summary` | `testSummary` | TEA | → Yes |
| `research` | `researches[]` | BMM | → Yes |
| `ux-design` | `uxDesigns[]` | BMM | → Yes |
| `readiness-report` | `readinessReports[]` | BMM | → Yes |
| `sprint-status` | `sprintStatuses[]` | BMM | → Yes |
| `retrospective` | `retrospectives[]` | BMM | → Yes |
| `change-proposal` | `changeProposals[]` | BMM | → Yes |
| `code-review` | `codeReviews[]` | BMM | → Yes |
| `risks` | `risks` | BMM | Unify with `risk` |
| `definition-of-done` | `definitionOfDone` | BMM | Store-only |
| `project-overview` | `projectOverview` | BMM | Store-only |
| `project-context` | `projectContext` | BMM | Store-only |
| `tech-spec` | `techSpecs[]` | BMM | → Yes |
| `source-tree` | `sourceTree` | BMM | Store-only |
| `storytelling` | `storytelling` | CIS | Store-only |
| `problem-solving` | `problemSolving` | CIS | Store-only |
| `innovation-strategy` | `innovationStrategy` | CIS | Store-only |
| `design-thinking` | `designThinking` | CIS | Store-only |

### Tier 3: Ghost Types (2 types — label only, no backend)

| Type | Label | Fix |
|---|---|---|
| `fit-criteria` | Fit Criteria | Remove from `TYPE_LABELS` — epic metadata badge only |
| `success-metrics` | Success Metrics | Remove from `TYPE_LABELS` — epic metadata badge only |

---

## Embedded Sub-Entities (nested inside parent artifacts)

### Epic Sub-Entities

| Sub-Entity | JSON Path | Canvas Rendering | Proposed |
|---|---|---|---|
| **Stories** | `content.stories[]` | → Separate `story` cards | → Standalone files |
| **Use Cases** | `content.useCases[]` | → Separate `use-case` cards | Keep embedded |
| **Risks** | `content.risks[]` | ❌ Not rendered — detail panel only | → `risk` cards or keep metadata |
| **Fit Criteria** | `content.fitCriteria[]` | Badge "FC" on epic card (verbose) | Keep as metadata |
| **Success Metrics** | `content.successMetrics[]` | Badge "SM" on epic card (verbose) | Keep as metadata |
| **Definition of Done** | `content.definitionOfDone` | ❌ Detail panel only | Keep as metadata |
| **Test Strategy** | `content.testStrategy` | → Per-epic `test-strategy` card | Keep (good pattern) |
| **Technical Summary** | `content.technicalSummary` | ❌ Detail panel only | Keep as metadata |
| **Dependencies** | `content.dependencies`, `epicDependencies` | Dependency arrows | Keep embedded |

### Story Sub-Entities

| Sub-Entity | JSON Path | Canvas Rendering | Proposed |
|---|---|---|---|
| **Tasks** | `tasks[]` | Inline rows + badge ("N Tasks ›") | Keep inline |
| **Acceptance Criteria** | `acceptanceCriteria[]` | Badge chip ("N AC") | Keep inline |
| **User Story** | `userStory{asA, iWant, soThat}` | Story card description | Keep inline |
| **Dependencies** | `dependencies.blockedBy[]`, `.blocks[]` | Badges + arrows | Keep inline |
| **Dev Notes** | `devNotes` | ❌ Detail panel only | Keep inline |
| **Dev Agent Record** | `devAgentRecord` | ❌ Detail panel only | Keep inline |
| **Technical Notes** | `technicalNotes` | ❌ Detail panel only | Keep inline |
| **Definition of Done** | `definitionOfDone` | ❌ Detail panel only | Keep inline |

### Architecture Sub-Entities

| Sub-Entity | JSON Path | Canvas Rendering | Proposed |
|---|---|---|---|
| **Decisions (ADRs)** | `decisions[]` | → Separate `architecture-decision` cards | → Standalone files |
| **System Components** | `systemComponents[]` | → Separate `system-component` cards | → Standalone files |
| **Tech Stack** | `techStack` | ❌ Detail panel only | Keep embedded |
| **Security** | `security` | ❌ Detail panel only | Keep embedded |
| **Deployment** | `deployment` | ❌ Detail panel only | Keep embedded |

### PRD Sub-Entities

| Sub-Entity | JSON Path | Canvas Rendering | Proposed |
|---|---|---|---|
| **Risks** | `risks[]` | → Separate `risk` cards | Keep (extracted by transformer) |
| **Requirements** | `requirements.functional[]` etc. | Fallback source for cards | → Remove fallback |
| **User Personas** | `userPersonas` | ❌ Detail panel only | Keep embedded |
| **User Journeys** | `userJourneys` | ❌ Detail panel only | Keep embedded |
| **Domain Model** | `domainModel` | ❌ Detail panel only | Keep embedded |

### Test Design Sub-Entities

| Sub-Entity | JSON Path | Canvas Rendering | Proposed |
|---|---|---|---|
| **Epic Info** | `content.epicInfo` | ❌ Links via `metadata.customFields.parentEpicId` | Keep embedded |
| **Objectives** | `content.summary.objectives[]` | ❌ Detail panel only | Keep embedded |
| **Test Levels** | `content.summary.testLevels[]` | ❌ Detail panel only | Keep embedded |
| **Risk Summary** | `content.summary.riskSummary` | ❌ Detail panel only | Keep embedded |
| **Coverage Plan** | `content.summary.coverageSummary` | ❌ Detail panel only | Keep embedded |

### Test Case Sub-Entities

| Sub-Entity | JSON Path | Canvas Rendering | Proposed |
|---|---|---|---|
| **Individual TCs** | `content.testCases[]` | Aggregated → `test-coverage` cards | Keep aggregated |
| **Steps** | `testCases[].steps[]` | ❌ Detail panel only | Keep embedded |
| **Expected Result** | `testCases[].expectedResult` | ❌ Detail panel only | Keep embedded |

---

## Issues (8 total)

### Issue 1: Requirements — 4 Sources (🔴 High)
`requirements.json` → `functional-requirements.json` → PRD → `epics.json` inventory

**Fix:** Single `requirements.json`. Deprecate fallbacks.

### Issue 2: Stories — 2 Sources (🔴 High)
Inline in `epic.stories[]` + standalone `implementation-artifacts/*.json`. Merged via dedup.

**Fix:** Stories always standalone. Epics reference by ID.

### Issue 3: Redundant Index Files (⚠️ Medium)
`epics-index.json` and `stories-index.json` skipped by loader. Zero runtime value.

**Fix:** Delete or auto-generate.

### Issue 4: 24 Types Invisible on Canvas (⚠️ Medium)
Key types invisible: test-design, sprint-status, readiness-report, code-review, tech-spec.

**Fix:** Promote ~12 types to canvas cards in new lanes.

### Issue 5: Embedded Sub-Artifacts Force Full Rewrites (⚠️ Medium)
16 ADRs embedded in `architecture.json`. Updating one requires rewriting 800+ lines.

**Fix:** Standalone ADR/component files, referenced by ID.

### Issue 6: No Status Rollup (⚠️ Medium)
Epic shows `draft` even when all stories are `complete`.

**Fix:** Computed `buildArtifacts()` rollup: allDone → `complete`, anyInProgress → `in-progress`.

### Issue 7: Ghost Types (🟡 Low)
`fit-criteria` and `success-metrics` — labels with no backend.

**Fix:** Remove from `TYPE_LABELS` or add handlers.

### Issue 8: Confusing Type Pairs (🟡 Low)
`risk`/`risks`, `test-case`/`test-cases`, `test-coverage` (synthesized), `task` (inline-only).

**Fix:** Unify `risk`/`risks`. Document canonical types.

---

## Proposed Target Architecture

### File Structure

```
.agileagentcanvas-context/
├── discovery/
│   ├── product-brief.json              → product-brief card
│   ├── vision.json                     → vision card
│   ├── research-*.json                 → NEW: research cards
│   └── ux-design-*.json               → NEW: ux-design cards
│
├── planning/
│   ├── prd.json                        → prd card
│   ├── requirements.json               → SINGLE source → FR/NFR/Add. Req cards
│   ├── risks.json                      → UNIFIED → individual risk cards
│   └── epics.json                      → manifest (refs epics/ and stories/)
│
├── solutioning/
│   ├── architecture.json               → overview only (refs decisions/components)
│   ├── decisions/adr-*.json            → STANDALONE decision cards
│   ├── components/*.json               → STANDALONE component cards
│   ├── tech-spec-*.json                → NEW: tech-spec cards
│   └── functional-requirements.json    → domain detail (feeds requirements.json)
│
├── implementation/
│   ├── epics/epic-*.json               → epic cards (metadata + story ID refs only)
│   ├── stories/*.json                  → STANDALONE story cards (source of truth)
│   ├── sprint-status-*.json            → NEW: sprint-status cards
│   ├── change-proposal-*.json          → NEW: change-proposal cards
│   └── retrospective-*.json            → NEW: retrospective cards
│
├── test/
│   ├── test-cases.json                 → test-coverage cards (aggregated)
│   ├── test-design-*.json              → NEW: test-design cards
│   ├── test-review-*.json              → NEW: test-review cards
│   ├── readiness-report-*.json         → NEW: readiness cards
│   ├── test-summary.json               → NEW: test-summary card
│   └── ci-pipeline.json                → NEW: ci-pipeline card
│
└── [DELETED]
    ├── epics-index.json
    └── stories-index.json
```

### Proposed Canvas Lanes

```
┌─────────────┬──────────────┬───────────────┬────────────────────┬─────────────┐
│  Discovery  │   Planning   │  Solutioning  │   Implementation   │   Quality   │
├─────────────┼──────────────┼───────────────┼────────────────────┼─────────────┤
│ Product     │ PRD          │ Architecture  │ Epic 1             │ Test Design │
│ Brief       │   Risks      │   ADR-001     │   Story 1.1        │ Test Review │
│             │   Risks      │   ADR-002     │   Story 1.2        │ Readiness   │
│ Vision      │   Reqs       │   Component   │   Use Cases        │ Report      │
│             │   NFRs       │   Component   │   Test Strategy    │             │
│ Research    │   Add. Reqs  │   Tech Spec   │   Test Coverage    │ Sprint      │
│ UX Design   │              │               │ Epic 2             │ Status      │
│             │              │               │   ...              │ CI Pipeline │
└─────────────┴──────────────┴───────────────┴────────────────────┴─────────────┘
```

### Type-by-Type Proposed Changes

| Type | Current | Proposed | Change |
|---|---|---|---|
| `product-brief` | 1 file → 1 card | Same | None |
| `vision` | 1 file → 1 card | Same | None |
| `research` | Store-only | → Canvas (Discovery) | Add transformer |
| `ux-design` | Store-only | → Canvas (Discovery) | Add transformer |
| `prd` | 1 file → 1 card | Same | None |
| `risk` / `risks` | 2 types, 2 sources | → Single `risks.json` → individual cards | Unify types |
| `requirement` | 4 sources | → Single `requirements.json` | Remove fallbacks |
| `nfr` | 2 sources | → Single `requirements.json` | Remove fallback |
| `additional-req` | 2 sources | → Single `requirements.json` | Remove fallback |
| `architecture` | Monolithic | → Overview only (refs sub-files) | Extract subs |
| `architecture-decision` | Embedded | → Standalone `decisions/adr-*.json` | New pattern |
| `system-component` | Embedded | → Standalone `components/*.json` | New pattern |
| `tech-spec` | Store-only | → Canvas (Solutioning) | Add transformer |
| `epic` | Manifest + files | Same | None |
| `story` | 2 sources (inline + standalone) | → **Always standalone** | Remove embedding |
| `use-case` | Embedded in epics | Keep | None |
| `task` | Inline in stories | Keep | None |
| `sprint-status` | Store-only | → Canvas (Execution) | Add transformer |
| `change-proposal` | Store-only | → Canvas (Execution) | Add transformer |
| `retrospective` | Store-only | → Canvas (Execution) | Add transformer |
| `test-strategy` | 1 file or embedded | Same | None |
| `test-coverage` | Synthesized | Same | None |
| `test-design` | Store-only | → Canvas (Quality) | Add transformer |
| `test-review` | Store-only | → Canvas (Quality) | Add transformer |
| `readiness-report` | Store-only | → Canvas (Quality) | Add transformer |
| `test-summary` | Store-only | → Canvas (Quality) | Add transformer |
| `ci-pipeline` | Store-only | → Canvas (DevOps) | Add transformer |
| `fit-criteria` | Ghost | → Remove from TYPE_LABELS | Cleanup |
| `success-metrics` | Ghost | → Remove from TYPE_LABELS | Cleanup |

### Status Rollup Rules

| Parent | Children | Computed Status |
|---|---|---|
| `epic` | stories | All done → `complete`, any in-progress → `in-progress`, else stored |
| `prd` | requirements + risks | All approved → `approved`, else `draft` |
| `architecture` | decisions + components | All accepted → `approved`, else `draft` |
| `test-coverage` | test-cases | All passed → `complete`, any failed → `blocked`, else `draft` |

---

## Priority Roadmap

| # | Change | Impact | Effort | Breaking? |
|---|---|---|---|---|
| 1 | Status rollup (epic ← stories) | 🟢 Progress visibility | Small | No |
| 2 | Delete/auto-gen index files | 🟡 Token savings | Tiny | No |
| 3 | L2 canvas cards (~12 types) | 🟢 Progress visibility | Medium | No |
| 4 | Fix ghost types | 🟡 Consistency | Small | No |
| 5 | Document canonical types for LLM | 🟡 Prevents confusion | Small | No |
| 6 | Single requirements source | 🟡 Prevents mismatches | Medium | ⚠️ Yes |
| 7 | Standalone stories | 🟡 Token savings | Large | ⚠️ Yes |
| 8 | Standalone ADRs/components | 🟡 Token savings | Medium | ⚠️ Yes |

> [!IMPORTANT]
> Items 1–5 are **non-breaking** — improve canvas without changing file format.
> Items 6–8 are **schema migrations** — require updating context directories and BMAD workflows.
