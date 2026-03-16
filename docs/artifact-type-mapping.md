# Artifact Type → Canvas Card Mapping

How each JSON file in `.agileagentcanvas-context` flows through the extension to become a canvas card.

## Pipeline

```
JSON file → detectArtifactType() → loadFromFolder switch/case → ArtifactStore map → buildArtifacts() → ArtifactCard
```

---

## Complete Type Registry (42 types)

Every type recognized by `ArtifactCard.tsx` `TYPE_LABELS`, grouped by rendering tier.

### Tier 1: Canvas Cards (rendered by `buildArtifacts()`)

#### Discovery Phase (Column 1)

| Card Type | Store Key | Source | Issues |
|---|---|---|---|
| `product-brief` | `productBrief` | `product-brief.json` | ✅ Clean |
| `vision` | `vision` | `*vision*.json` | ✅ Clean |

#### Planning Phase (Column 2 — 4-per-row grid)

| Card Type | Store Key | Source | Issues |
|---|---|---|---|
| `prd` | `prd` | `*prd*.json` | ✅ Clean |
| `risk` | `prd.risks[]` + `risks.risks[]` | PRD embedded + standalone BMM `risks.json` | ⚠️ 2 sources |
| `requirement` | `requirements.functional[]` | `requirements.json`, `functional-requirements.json`, PRD, `epics.json` | 🔴 4 sources |
| `nfr` | `requirements.nonFunctional[]` | `requirements.json`, PRD | ⚠️ 2 sources |
| `additional-req` | `requirements.additional[]` | `requirements.json`, PRD | ⚠️ 2 sources |

#### Solutioning Phase (Column 3 — 4-per-row grid)

| Card Type | Store Key | Source | Issues |
|---|---|---|---|
| `architecture` | `architecture` | `architecture.json` | ✅ Clean |
| `architecture-decision` | `architecture.decisions[]` | Embedded in `architecture.json` | ⚠️ Embedded |
| `system-component` | `architecture.systemComponents[]` | Embedded in `architecture.json` | ⚠️ Embedded |

#### Implementation Phase (Column 4+ — epic row bands)

| Card Type | Store Key | Source | Issues |
|---|---|---|---|
| `epic` | `epics[]` | Manifest → `epics/epic-*.json` | ✅ Good pattern |
| `story` | `epic.stories[]` | Epic files + `implementation-artifacts/*.json` | 🔴 2 sources |
| `use-case` | `epic.useCases[]` | Embedded in epics | ⚠️ Embedded |
| `task` | `story.tasks[]` | Inline in stories — **no standalone card** | ⚠️ Inline-only |
| `test-strategy` | `testStrategy` | Standalone or `epic.testStrategy` | ⚠️ 2 modes |
| `test-coverage` | Aggregated `testCases[]` | `test-cases.json` — **synthesized, not a file type** | ⚠️ Synthesized |

---

### Embedded Sub-Entities (live inside parent artifacts)

These are data structures nested inside Tier 1 artifacts. They are **not** standalone file types but affect how parent cards render.

#### Epic Sub-Entities

| Sub-Entity | Nested In | JSON Path | Canvas Rendering | Proposed |
|---|---|---|---|---|
| **Stories** | `epic-*.json` | `content.stories[]` | Separate `story` cards | → Standalone files |
| **Use Cases** | `epic-*.json` | `content.useCases[]` | Separate `use-case` cards | Keep embedded (low volume) |
| **Risks** | `epic-*.json` | `content.risks[]` | ❌ **Not rendered** — metadata only (detail panel) | → `risk` cards or keep metadata-only |
| **Fit Criteria** | `epic-*.json` | `content.fitCriteria[]` | ❌ Badge "FC" on epic card (verbose mode) | Keep as metadata |
| **Success Metrics** | `epic-*.json` | `content.successMetrics[]` | ❌ Badge "SM" on epic card (verbose mode) | Keep as metadata |
| **Definition of Done** | `epic-*.json` | `content.definitionOfDone` | ❌ Metadata only (detail panel) | Keep as metadata |
| **Test Strategy** | `epic-*.json` | `content.testStrategy` | Per-epic `test-strategy` card | Keep (good pattern) |
| **Technical Summary** | `epic-*.json` | `content.technicalSummary` | ❌ Metadata only | Keep as metadata |
| **Dependencies** | `epic-*.json` | `content.dependencies`, `epicDependencies` | Dependency arrows between epics | Keep embedded |

#### Story Sub-Entities

| Sub-Entity | Nested In | JSON Path | Canvas Rendering | Proposed |
|---|---|---|---|---|
| **Tasks** | story objects | `tasks[]` | Inline rows + badge ("N Tasks ›") on story card | Keep inline |
| **Acceptance Criteria** | story objects | `acceptanceCriteria[]` | Badge chip ("N AC") on story card | Keep inline |
| **User Story** | story objects | `userStory{asA, iWant, soThat}` | Story card description | Keep inline |
| **Dependencies** | story objects | `dependencies.blockedBy[]`, `dependencies.blocks[]` | Dependency badges + arrows | Keep inline |
| **Dev Notes** | story objects | `devNotes` | ❌ Detail panel only | Keep inline |
| **Dev Agent Record** | story objects | `devAgentRecord` | ❌ Detail panel only | Keep inline |
| **Technical Notes** | story objects | `technicalNotes` | ❌ Detail panel only | Keep inline |
| **Definition of Done** | story objects | `definitionOfDone` | ❌ Detail panel only | Keep inline |

#### Architecture Sub-Entities

| Sub-Entity | Nested In | JSON Path | Canvas Rendering | Proposed |
|---|---|---|---|---|
| **Decisions (ADRs)** | `architecture.json` | `decisions[]` | Separate `architecture-decision` cards | → Standalone files |
| **System Components** | `architecture.json` | `systemComponents[]` | Separate `system-component` cards | → Standalone files |
| **Tech Stack** | `architecture.json` | `techStack` | ❌ Metadata only | Keep embedded |
| **Security** | `architecture.json` | `security` | ❌ Metadata only | Keep embedded |
| **Deployment** | `architecture.json` | `deployment` | ❌ Metadata only | Keep embedded |

#### PRD Sub-Entities

| Sub-Entity | Nested In | JSON Path | Canvas Rendering | Proposed |
|---|---|---|---|---|
| **Risks** | `prd.json` | `risks[]` | Separate `risk` cards | Keep (extracted by transformer) |
| **Requirements** | `prd.json` | `requirements.functional[]`, `.nonFunctional[]`, `.additional[]` | Fallback source for `requirement`/`nfr`/`additional-req` cards | → Remove fallback, single source |
| **User Personas** | `prd.json` | `userPersonas` | ❌ Metadata only | Keep embedded |
| **User Journeys** | `prd.json` | `userJourneys` | ❌ Metadata only | Keep embedded |
| **Domain Model** | `prd.json` | `domainModel` | ❌ Metadata only | Keep embedded |

#### Test Design Sub-Entities

| Sub-Entity | Nested In | JSON Path | Canvas Rendering | Proposed |
|---|---|---|---|---|
| **Epic Info** | `test-design-*.json` | `content.epicInfo` | ❌ Not shown (parent epic via `metadata.customFields.parentEpicId`) | Keep embedded |
| **Summary** | `test-design-*.json` | `content.summary.objectives[]` | ❌ Detail panel only | Keep embedded |
| **Test Levels** | `test-design-*.json` | `content.summary.testLevels[]` | ❌ Detail panel only | Keep embedded |
| **Risk Summary** | `test-design-*.json` | `content.summary.riskSummary` | ❌ Detail panel only | Keep embedded |
| **Coverage Plan** | `test-design-*.json` | `content.summary.coverageSummary` | ❌ Detail panel only | Keep embedded |
| **Test Approach** | `test-design-*.json` | `content.testApproach` | ❌ Detail panel only | Keep embedded |
| **Entry/Exit Criteria** | `test-design-*.json` | `content.entryExitCriteria` | ❌ Detail panel only | Keep embedded |
| **Quality Gate Criteria** | `test-design-*.json` | `content.qualityGateCriteria` | ❌ Detail panel only | Keep embedded |

#### Test Case Sub-Entities

| Sub-Entity | Nested In | JSON Path | Canvas Rendering | Proposed |
|---|---|---|---|---|
| **Individual TCs** | `test-cases.json` | `content.testCases[]` | Aggregated into `test-coverage` cards (pass/fail/draft counts) | Keep aggregated |
| **Steps** | per test case | `testCases[].steps[]` | ❌ Detail panel only | Keep embedded |
| **Expected Result** | per test case | `testCases[].expectedResult` | ❌ Detail panel only | Keep embedded |
| **Preconditions** | per test case | `testCases[].preconditions` | ❌ Detail panel only | Keep embedded |

---

### Tier 2: Store-Only (loaded, no canvas card)

| `artifactType` | Store Key | Module | Proposed Canvas? |
|---|---|---|---|
| `test-design` | `testDesigns[]` | TEA | → Yes (linked to story/epic) |
| `test-design-qa` | `testDesigns[]` | TEA | → Yes |
| `test-design-architecture` | `testDesigns[]` | TEA | → Yes |
| `test-cases` | `testCases[]` | TEA | Already → `test-coverage` |
| `traceability-matrix` | `traceabilityMatrix` | TEA | → Yes (quality lane) |
| `test-review` | `testReviews[]` | TEA | → Yes (quality lane) |
| `nfr-assessment` | `nfrAssessment` | TEA | Keep store-only |
| `atdd-checklist` | `atddChecklist` | TEA | Keep store-only |
| `test-framework` | `testFramework` | TEA | Keep store-only |
| `ci-pipeline` | `ciPipeline` | TEA | → Yes (devops lane) |
| `automation-summary` | `automationSummary` | TEA | Keep store-only |
| `test-summary` | `testSummary` | TEA | → Yes (quality lane) |
| `research` | `researches[]` | BMM | → Yes (discovery lane) |
| `ux-design` | `uxDesigns[]` | BMM | → Yes (discovery lane) |
| `readiness-report` | `readinessReports[]` | BMM | → Yes (quality lane) |
| `sprint-status` | `sprintStatuses[]` | BMM | → Yes (execution lane) |
| `retrospective` | `retrospectives[]` | BMM | → Yes (execution lane) |
| `change-proposal` | `changeProposals[]` | BMM | → Yes (execution lane) |
| `code-review` | `codeReviews[]` | BMM | → Yes (quality lane) |
| `risks` | `risks` | BMM | Unify with `risk` |
| `definition-of-done` | `definitionOfDone` | BMM | Keep store-only |
| `project-overview` | `projectOverview` | BMM | Keep store-only |
| `project-context` | `projectContext` | BMM | Keep store-only |
| `tech-spec` | `techSpecs[]` | BMM | → Yes (solutioning lane) |
| `source-tree` | `sourceTree` | BMM | Keep store-only |
| `storytelling` | `storytelling` | CIS | Keep store-only |
| `problem-solving` | `problemSolving` | CIS | Keep store-only |
| `innovation-strategy` | `innovationStrategy` | CIS | Keep store-only |
| `design-thinking` | `designThinking` | CIS | Keep store-only |

### Tier 3: Ghost Types (label only, no backend)

| Type | Label | Fix |
|---|---|---|
| `fit-criteria` | Fit Criteria | Remove from `TYPE_LABELS` — lives as epic metadata badge |
| `success-metrics` | Success Metrics | Remove from `TYPE_LABELS` — lives as epic metadata badge |

---

## Confusing Type Pairs

| Pair | Distinction | LLM Risk |
|---|---|---|
| `risk` vs `risks` | `risk` = individual card (extracted). `risks` = standalone collection file | High |
| `test-case` vs `test-cases` | Plural alias — same store key | Low |
| `test-coverage` | **Synthesized** by transformer — not a file type | Medium |
| `task` | **Inline-only** — no standalone file/card | Medium |

---

## Data Source Overlap

| Store Key | Sources (priority order) | Fix |
|---|---|---|
| `requirements.functional[]` | `requirements.json` → `functional-requirements.json` → PRD → `epics.json` | → Single source |
| `requirements.nonFunctional[]` | `requirements.json` → PRD | → Single source |
| `requirements.additional[]` | `requirements.json` → PRD | → Single source |
| `epics[].stories[]` | Epic inline stories → `implementation-artifacts/*.json` standalone | → Standalone only |
| `testCases[]` | Multiple `test-cases.json` files (deduplicated by ID) | ✅ OK |

---

## BMAD Metadata Format

```json
{
  "metadata": {
    "schemaVersion": "1.0.0",
    "artifactType": "<type from tables above>",
    "workflowName": "agileagentcanvas",
    "projectName": "<project>",
    "timestamps": { "created": "<ISO>", "lastModified": "<ISO>" },
    "status": "draft"
  },
  "content": { }
}
```

> [!IMPORTANT]
> `detectArtifactType()` prioritizes `metadata.artifactType`. Always include it.

## Code References

| File | Purpose |
|---|---|
| `src/state/artifact-store.ts` — `detectArtifactType()` | Type detection |
| `src/state/artifact-store.ts` — `loadFromFolder()` | File loading |
| `src/state/artifact-store.ts` — `mapSchemaEpicToInternal()` | Epic sub-entity mapping |
| `src/state/artifact-store.ts` — `mapSchemaStoryToInternal()` | Story sub-entity mapping |
| `src/canvas/artifact-transformer.ts` — `buildArtifacts()` | Store → canvas cards |
| `webview-ui/src/components/ArtifactCard.tsx` — `TYPE_LABELS` | 42-type label map |
