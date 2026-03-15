# 🔍 Senior Architecture Audit — BMAD SQLite Migration

> Auditor perspective: adversarial, production-readiness focused.
> Scope: `schema-to-db-mapping.md` + `implementation-plan.md` + existing codebase.
> **Status:** All findings addressed in [implementation-plan.md v2](./implementation-plan.md).

---

## Verdict: ~~NOT READY FOR IMPLEMENTATION~~ → **RESOLVED IN V2**

---

## 🔴 CRITICAL (3 Findings — All Fixed)

### C-1. `better-sqlite3` Cannot Run in VS Code Extensions ✅ FIXED

`better-sqlite3` is a native C++ addon compiled against Node.js ABI. VS Code runs Electron with a different ABI → crash on `require()`.

**Resolution:** Switched to `sql.js` (WASM-compiled SQLite). Zero native deps, works in any JS env.

| Criteria | `better-sqlite3` | `sql.js` (chosen) |
|---|---|---|
| Native module | ❌ Electron ABI | ✅ No ABI issues |
| VS Code compat | ❌ Breaks on updates | ✅ Always works |
| Sync API | ✅ | ✅ |
| File persistence | ✅ Built-in | ⚠️ Manual (read/write buffer) |

---

### C-2. ~30-40 Child Table DDLs Missing ✅ FIXED

Many child tables existed only as comments, not actual DDL. ~50 tables referenced but never defined.

**Resolution:** Replaced hand-written DDLs with a **programmatic DDL generator** (`schema-to-ddl.ts`) that reads all 40 JSON schemas and outputs complete SQLite-compatible CREATE TABLE statements. A coverage test verifies 100% field coverage.

---

### C-3. Polymorphic FKs Have No Referential Integrity ✅ FIXED

Shared tables used `parent_type + parent_id` — SQLite cannot enforce FK constraints on polymorphic references.

**Resolution:** Replaced with **nullable typed FKs** (e.g., `code_review_id`, `readiness_report_id`) with a CHECK constraint ensuring exactly one is non-NULL. Enables real `ON DELETE CASCADE`.

---

## 🟠 HIGH (5 Findings — All Fixed)

### H-1. No Schema Evolution / Migration Strategy ✅ FIXED
**Resolution:** Added `schema_versions` table + numbered migration scripts applied at DAL init.

### H-2. DAL Interface Returns `any` ✅ FIXED
**Resolution:** DAL uses `ArtifactTypeMap` generics — `readArtifact<T>(type: T): Promise<ArtifactTypeMap[T]>`.

### H-3. LLM Tool SQL Injection Surface ✅ FIXED
**Resolution:** Per-type **column whitelist** validates filter keys before SQL generation. Values always parameterized.

### H-4. Business Logic Extraction Gap ✅ FIXED
**Resolution:** Added **`ArtifactService`** layer between tools and DAL — holds sync links, derived state, validation.

### H-5. Missing Transactional Boundaries ✅ FIXED
**Resolution:** Added `dal.transaction(async txn => {...})` wrapping multi-table writes atomically.

---

## 🟡 MEDIUM (5 Findings — All Fixed)

### M-1. SQLite Syntax Errors ✅ FIXED
All DDL uses SQLite syntax (no `TEXT[]`, `SERIAL`, `TIMESTAMPTZ`).

### M-2. No WAL Mode ✅ FIXED
`PRAGMA journal_mode=WAL` set at every `init()`.

### M-3. Missing Story Agent Tracking ✅ FIXED
Added `story_dev_agent_records` + `story_history_entries` tables.

### M-4. Metadata Table Bottleneck ⚠️ ACKNOWLEDGED
Index on `metadata(project_id, artifact_type)` added. Denormalization deferred to optimization phase.

### M-5. Export/Import Complexity ⚠️ ACKNOWLEDGED
Documented as implementation complexity. Will need careful handling of `sort_order`, NULL vs missing, and JSON arrays.

---

## 🟢 LOW (2 Findings)

### L-1. No Indexing Strategy ⚠️ DEFERRED
DDL generator will emit CREATE INDEX for FK columns and common query patterns.

### L-2. Custom Fields Dynamic Filtering ⚠️ DEFERRED
`json_extract()` queries acceptable for low-volume custom fields.
