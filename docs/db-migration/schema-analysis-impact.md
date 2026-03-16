# DB Migration Impact Analysis

Cross-referencing the [8 schema analysis findings](file:///d:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/docs/schema-analysis.md) against the [db-migration docs](file:///d:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/docs/db-migration/README.md).

---

## Impact Summary

| Schema Finding | DB Migration Impact | Affected Doc | Severity |
|---|---|---|---|
| 1. Requirements 4 sources | 🟢 **Already handled** — single `requirements` table | None | ✅ |
| 2. Stories 2 sources | 🔴 **Design change needed** — story table FK model | schema-to-db-mapping | High |
| 3. Redundant index files | 🟢 **No impact** — indexes aren't in DB scope | None | ✅ |
| 4. 24 types invisible | 🟡 **ArtifactService needs transformer** | implementation-plan | Medium |
| 5. Embedded sub-artifacts | 🔴 **Design change needed** — ADR/component tables | schema-to-db-mapping | High |
| 6. No status rollup | 🟡 **ArtifactService logic needed** | implementation-plan | Medium |
| 7. Ghost types | 🟡 **DDL generator consideration** | schema-to-db-mapping | Low |
| 8. Confusing type pairs | 🟡 **LLM tool whitelist update** | implementation-plan | Medium |

---

## Detailed Findings

### Finding 1: Requirements — ✅ Already Solved by DB

The DB migration's shared `requirements` table with typed FKs **eliminates the 4-source problem by design**. All requirements (functional, NFR, additional) go into one table with `parent_artifact` FK. The LLM writes to one canonical table — no priority chain needed.

**No changes required.**

---

### Finding 2: Stories — 🔴 Needs Schema Change

**Current DB design (schema-to-db-mapping line 412):**
```sql
stories.epic_id REFERENCES epics(id) ON DELETE CASCADE
```

This is correct — stories have their own table with FK to epic. **But the current design still expects stories to be loaded from epic JSON files** (the current JSON loader embeds stories inside epic files).

**What needs to change:**
- The `JsonFileDal` (`json-file-dal.ts`) must load stories from **standalone files** in `stories/` folder, not from inside `epic-*.json` → `content.stories[]`
- The `importFromJson()` migration function must extract inline stories and create separate story rows
- The `exportToJson()` function must write stories as standalone files, not embed them back into epics

**Update in:** `schema-to-db-mapping.md` — add a note that stories are **always standalone rows**, never embedded. `implementation-plan.md` — Phase 3 (backward compat) must handle the inline→standalone extraction.

---

### Finding 3: Redundant Index Files — ✅ No Impact

`epics-index.json` and `stories-index.json` have no DB equivalent. The DB IS the index. No changes needed.

---

### Finding 4: 24 Types Invisible on Canvas — 🟡 ArtifactService Gap

The `ArtifactService` layer routes changes to canvas via `emitChangeEvent()`. But the **current canvas transformer** ignores 24 of the 42 types.

**What needs to change:**
- When the DB migration ships, the `ArtifactService` should emit canvas-ready artifacts for Tier 2 types
- The implementation plan's Phase 4 "Wire Up" section should include: _"Extend `buildArtifacts()` to render Tier 2 types as canvas cards"_
- The LLM tool `read_artifact` / `query_artifacts` already supports all types — good. But `write_artifact` for a `test-design` won't show on canvas until the transformer is updated

**Update in:** `implementation-plan.md` — Phase 4 needs a sub-item for canvas transformer updates.

---

### Finding 5: Embedded Sub-Artifacts — 🔴 Needs Design Validation

The DB migration already has separate tables for:
- `architecture_decisions` (line 338) — ✅ separate table with FK to `architectures`
- `architecture_system_components` (line 363) — ✅ separate table with FK
- `story_tasks` (line 449) — ✅ separate table with FK to stories
- `use_cases` (line 464) — ✅ separate table with FK to epics

**This means the DB design already treats embedded sub-artifacts as standalone rows.** The issue is that the **JSON file format** still embeds them, so:

**What needs to change:**
- The `JsonFileDal` import must explode `architecture.json → decisions[]` into separate `architecture_decisions` rows
- The `JsonFileDal` export must reassemble them back (or write as standalone files if the JSON schema evolves)
- The `exportToJson()` strategy needs a decision: **reassemble into monolithic files** (backward compat) or **write standalone files** (forward-looking)?

**Update in:** `schema-to-db-mapping.md` — add a "JSON ↔ DB Serialization" section clarifying the embed/explode strategy. `implementation-plan.md` — Phase 3 needs explicit embed/explode logic.

---

### Finding 6: Status Rollup — 🟡 ArtifactService Logic

The DB makes rollup trivial:
```sql
SELECT 
  e.id,
  e.title,
  COUNT(*) AS total_stories,
  SUM(CASE WHEN s.status = 'done' THEN 1 ELSE 0 END) AS done_stories,
  CASE 
    WHEN COUNT(*) = SUM(CASE WHEN s.status = 'done' THEN 1 ELSE 0 END) THEN 'done'
    WHEN SUM(CASE WHEN s.status = 'in-progress' THEN 1 ELSE 0 END) > 0 THEN 'in-progress'
    ELSE e.status
  END AS computed_status
FROM epics e
LEFT JOIN stories s ON s.epic_id = e.id
GROUP BY e.id;
```

**What needs to change:**
- `ArtifactService.readArtifact('epic', id)` should compute `status` from children, not return the stored static value
- Or: a DB view `epic_with_status` that auto-computes

**Update in:** `implementation-plan.md` — add to `ArtifactService` spec: computed status rollup for epics (from stories), PRD (from requirements), architecture (from decisions).

---

### Finding 7: Ghost Types — 🟡 DDL Generator Consideration

`fit-criteria` and `success-metrics` **already have DDL** in the schema-to-db-mapping (lines 1076-1131). They have `fit_criteria` and `success_metrics` tables plus child tables.

**But:** they're ghost types in the canvas extension — no loader, no transformer. The DB tables exist but nothing populates them from the current JSON files.

**What needs to change:**
- The DDL is fine — keep the tables
- The `JsonFileDal` needs load handlers for `fit-criteria.json` and `success-metrics.json` if they ever get standalone files
- Or: they can be populated when loading epic metadata (since `fitCriteria` and `successMetrics` are epic sub-entities)
- The `ArtifactTypeMap` should include these types even if rarely used

**Update in:** `schema-to-db-mapping.md` — add a note that these tables are populated from epic metadata, not standalone files. `implementation-plan.md` — `ArtifactTypeMap` should map them.

---

### Finding 8: Confusing Type Pairs — 🟡 LLM Tool Layer

The `risk` vs `risks` confusion is already resolved in the DB: there's a single `risks_register` table. All risk items go there.

**But** the LLM tool layer needs to understand:
- `write_artifact('risk', ...)` → insert into `risks_register`
- `write_artifact('risks', ...)` → also insert into `risks_register` (alias)
- `test-case` and `test-cases` → both map to `test_cases` table

**What needs to change:**
- The `COLUMN_WHITELIST` in the implementation plan (line 300) should include aliases
- The `ArtifactTypeMap` should map aliases to canonical types:
  ```typescript
  // Aliases
  'risks': Risk[],      // same as 'risk' but returns collection
  'test-cases': TestCase[], // same as 'test-case'
  ```

**Update in:** `implementation-plan.md` — Section 7 (LLM Tool Security) should document type aliases.

---

## Changes Required by Document

### `schema-to-db-mapping.md`
1. **Add "JSON ↔ DB Serialization Strategy"** section — how embedded sub-artifacts (ADRs, components, stories, tasks) are exploded on import and reassembled on export
2. **Note on stories** — always standalone DB rows, never embedded in epic rows
3. **Note on ghost types** — `fit_criteria` and `success_metrics` tables populated from epic metadata, not standalone files

### `implementation-plan.md`
1. **Phase 3 (Backward Compat)** — add embed/explode logic for embedded sub-artifacts (stories from epics, ADRs from architecture)
2. **Phase 4 (Wire Up)** — add canvas transformer updates for Tier 2 types
3. **ArtifactService spec** — add computed status rollup logic
4. **Section 7 (LLM Tool Security)** — document type aliases (`risks`→`risk`, `test-cases`→`test-case`)

### `architecture-audit.md`
- No changes needed — all findings remain valid.

### `README.md`
- No changes needed — overview structure is accurate.
