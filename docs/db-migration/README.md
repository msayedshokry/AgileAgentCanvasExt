# DB Migration: JSON → SQLite (Relational)

> **Status:** Plan v3 approved — ready for implementation.
> **Last updated:** 2026-03-16

## Overview

Migration of the Agile Agent Canvas extension from JSON file persistence to a **local-first SQLite database** with fully typed columns for all 40 BMAD schemas, auto-generated LLM skill files, and a redesigned 5-lane canvas. No legacy JSON support.

## Documents

| Document | Purpose |
|---|---|
| [revised-plan.md](./revised-plan.md) | **Start here.** Approved plan v3 (DB + LLM skills + canvas) |
| [schema-to-db-mapping.md](./schema-to-db-mapping.md) | Field-level mapping of all 40 schemas → SQL tables |
| [schema-analysis-impact.md](./schema-analysis-impact.md) | Cross-reference: schema analysis findings vs DB plan |
| [implementation-plan.md](./implementation-plan.md) | ~~v2 plan~~ (superseded by revised-plan.md) |
| [architecture-audit.md](./architecture-audit.md) | Senior architect audit — 15 findings, all addressed |

## Architecture (Target)

```
LLM Tools (7) → ArtifactService (business logic) → ArtifactDAL (interface)
                                                      ├── SqliteDal (sql.js WASM)
                                                      └── JsonFileDal (existing, feature flag)
```

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| SQLite engine | `sql.js` (WASM) | Native `better-sqlite3` incompatible with VS Code/Electron |
| Schema enforcement | Typed columns + CHECK | No JSONB content blobs |
| Shared tables FK | Nullable typed FKs | Polymorphic `parent_type` can't enforce referential integrity |
| DDL generation | Programmatic from JSON schemas | Hand-writing ~115 tables is error-prone |
| Business logic | `ArtifactService` layer | Separated from DAL to avoid coupling |
| Migration safety | Feature flag (`json` \| `sqlite`) | Non-breaking, gradual rollout |

## Implementation Phases

1. **Foundation** — DAL interface, ArtifactService, DDL generator
2. **SQLite DAL** — sql.js implementation, generated DDL, initial migration
3. **Backward Compat** — JsonFileDal wrapper, JSON→SQLite import
4. **Wire Up** — ArtifactStore + LLM tools integration
5. **Dependencies** — package.json (sql.js, feature flag setting)

## How to Start

1. Read `implementation-plan.md` fully
2. Start with Phase 1: create `src/state/artifact-dal.ts` (typed interface)
3. Run DDL generator against schemas to produce `db-schema.sql`
4. Build `SqliteDal` against the interface
5. Wire up with feature flag
