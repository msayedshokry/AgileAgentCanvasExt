# Code Review Workflow

**Source:** `resources/_aac/bmm/workflows/4-implementation/code-review/`  
**Trigger phrase:** "run code review" or "review this code"  
**Output format:** JSON (schema: `bmm/code-review.schema.json`)

---

## Purpose

An adversarial code review that validates story file claims against actual implementation.  
It is designed to find problems — not rubber-stamp work. A minimum of 3–10 specific issues must be found in every review.

---

## Inputs

| Input | Source | Load strategy |
|---|---|---|
| Story file | `{{story_path}}` provided by user, or prompted | Full |
| Architecture spec | `planning_artifacts/*architecture*.md` | Full |
| UX design spec | `planning_artifacts/*ux*.md` | Full (only for UI reviews) |
| Epics | `planning_artifacts/*epic*.md` or sharded `epic-{{epic_num}}.md` | Selective (only the relevant epic) |
| Project context / coding standards | `**/project-context.md` | Full |
| Sprint status | `implementation_artifacts/sprint-status.yaml` | Full (if it exists) |

---

## Steps

### Step 1 — Load story and discover changes

1. Read the complete story JSON file from `epics/epic-{N}/stories/{id}.json`.
2. Parse: Story description, Acceptance Criteria, Tasks/Subtasks, Dev Agent Record → File List, Change Log.
3. Run `git status --porcelain`, `git diff --name-only`, and `git diff --cached --name-only` to find all actually changed files.
4. Cross-reference the story's File List against git reality:
   - Files in git but **not** in story File List → MEDIUM finding
   - Files in story File List but **no** git changes → HIGH finding (false claims)
   - Uncommitted changes not documented → MEDIUM finding

> Prior review sessions are **not** treated as a validated baseline. Every task and AC marked "verified" must be re-proven from code.

---

### Step 2 — Build the attack plan

Build a 4-axis review plan from the story:

1. **AC Validation** — verify each Acceptance Criterion is actually implemented
2. **Task Audit** — verify each task marked `[x]` is genuinely done
3. **Code Quality** — security, performance, maintainability
4. **Test Quality** — real assertions vs. placeholder tests

---

### Step 3 — Execute adversarial review

#### Git vs Story discrepancies
| Discrepancy | Severity |
|---|---|
| File changed but not in story File List | MEDIUM |
| Story lists file but no git changes | HIGH |
| Uncommitted changes not documented | MEDIUM |

#### Acceptance Criteria validation
For each AC: search the implementation files for evidence.  
- MISSING or PARTIAL → **HIGH severity finding**

#### Task completion audit
For each task marked `[x]`: search files for evidence.  
- Marked done but not implemented → **CRITICAL finding**

#### Stub / placeholder audit
Search all reviewed files for: `TODO`, `FIXME`, `time.Sleep`, `hardcoded`, `simulated`, `fake`, `placeholder`, `stub`.
- If the owning task is marked `[x]` / `status: verified` → **CRITICAL**
- If no story task covers it → **HIGH** (undocumented debt)
- `"Deferred to Story X.Y"` does **not** make a task done; it must be marked deferred/pending.

#### Round-trip persistence audit
For every DB write (`INSERT`, `UPDATE`, `saveXxxToDB`, or equivalent):
- Verify a corresponding read-back exists in the startup/load path.
- Verify every written column is also read back.
- Missing read-back → **HIGH finding**

#### Response truthfulness check
For each handler that returns status/health/connectivity data:
- Response values must come from real I/O (network call, DB query, file check).
- Hardcoded success values (e.g. `{"ok": true}`) with no observable I/O → **HIGH**
- Real I/O result assigned then discarded (`_`) → **HIGH**

#### Code quality (per file)
| Dimension | What to look for |
|---|---|
| Security | Injection risks, missing input validation, auth gaps |
| Performance | N+1 queries, inefficient loops, missing caching |
| Error handling | Missing try/catch, poor error messages |
| Code quality | Overly complex functions, magic numbers, poor naming |
| Test quality | Real assertions vs. empty/placeholder tests |

> If fewer than 3 issues are found, keep looking — edge cases, null handling, architecture violations, documentation gaps, integration issues, dependency problems.

---

### Step 4 — Present findings and fix

Findings are categorised:

| Category | Severity | Examples |
|---|---|---|
| 🔴 CRITICAL / HIGH | Must fix | Task `[x]` but not done, AC missing, false file claims, security vulnerabilities |
| 🟡 MEDIUM | Should fix | Undocumented changed files, performance issues, poor test coverage |
| 🟢 LOW | Nice to fix | Code style, documentation gaps, commit message quality |

The reviewer is then offered three options:
1. **Fix automatically** — update code and tests, update File List in story
2. **Create action items** — append `- [ ] [AI-Review][Severity] Description [file:line]` to story Tasks
3. **Deep dive** — detailed explanation of a specific issue

After all fixes, a **re-scan** is mandatory for the same stub keywords (`TODO`, `FIXME`, etc.) across every file touched during the review. Fixes that introduce new stubs must either be implemented properly or have their parent task marked `status: deferred`.

---

### Step 5 — Schema validation (mandatory)

Validate the JSON structures by explicit file inspection:
- `epics/epic-{N}/epic.json`
- `epics/epic-{N}/tests/test-cases.json`
- `epics/epic-{N}/stories/{id}.json`

---

### Step 6 — Update story status and sync sprint tracking

#### Outcome: all HIGH/MEDIUM issues fixed AND all ACs implemented
- Set story `content.status` and `metadata.status` → `"done"`
- Required fields must exist before status change:
  - `content.fileList: { created, modified, deleted }`
  - `content.changeLog: [{ date, summary }]`
  - `content.devAgentRecord: { implementationNotes[], completionNotes[], debugLog[] }`
- Set all tasks → `status: "verified"`
- Set each AC → `status: "verified"` or `"failed"`
- Set each test case → `status: "passed"` or `"failed"`

#### Outcome: HIGH/MEDIUM issues remain OR ACs incomplete
- Set story `content.status` and `metadata.status` → `"in-progress"`

#### Sprint tracking sync (if `sprint-status.yaml` exists)
- Locate the `development_status` key matching the story key.
- Update it to match the new story status.
- Preserve all comments and YAML structure.

---

## Exclusions

The following folders are **never** reviewed:

- `resources/_aac/` and `_bmad/`
- `.agileagentcanvas-context/`
- `.cursor/`, `.windsurf/`, `.claude/`

---

## Canonical file location

Story data lives at exactly one path:

```
epics/epic-{N}/stories/{id}.json
```

Never write to a legacy `implementation/` directory — that path is deprecated.

---

## Definition of Done attestation (required before closing)

Before notifying the user that the review is complete, confirm:

- [ ] Test cases migrated exactly to `epics/epic-{N}/tests/test-cases.json`
- [ ] Story JSON updated with `devAgentRecord`, `fileList`, and `changeLog`
