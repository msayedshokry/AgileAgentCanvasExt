---
name: aac-architecture-spine
description: 'Lean intent-based architecture. Produces an ARCHITECTURE-SPINE.md as the source of truth, with SPEC.md derived. Use when the user wants a fast architecture pass and the multi-step aac-create-architecture flow is too heavy. Menu code AS.'
---

# Architecture Spine

A lean, intent-based architecture flow. Where `aac-create-architecture` is the multi-step, 8-pass, validation-rich path, the spine is a fast route: one prompt, one spine document, one decision.

The spine is the **source of truth**. `SPEC.md` (when needed) is **derived** from the spine, not authored alongside it. This inverts the usual order and is what makes the spine lean.

## When to Use

- The user says "I need a quick architecture" / "spine" / "lean architecture" / "intent-based" / "AS"
- The user has a clear feature slice and just wants the structural decisions captured
- The user is iterating on an existing spine and wants to update a section
- The user is migrating from a doc-heavy spec to a leaner model

Do NOT use for:

- Greenfield exploration where the architecture IS the discovery — use `aac-create-architecture`
- Brownfield reverse-engineering — use `aac-document-project`
- Test planning — use `aac-tea-test-design`

## The Five Entry Shapes (Intent Routing)

The spine's power is that it does not impose a single starting point. The user declares their intent; the spine routes accordingly.

| Intent | Entry shape | Spine behaviour |
|---|---|---|
| `idea` | A half-formed idea, one paragraph | Generate a full spine from scratch. Heavy lifting on Tech Stack and Data Model. |
| `doc` | A large doc (PRD, RFC, design doc) | Extract the spine shape from the doc; flag the doc's unstated assumptions. |
| `codebase` | An existing codebase | Reverse-engineer the spine. Output the spine AND a `drift.md` listing where the code contradicts the spine. |
| `feature` | A feature slice (story or epic) | Produce a feature-scoped spine — one or two altitudes, not all. |
| `existing` | An existing spine | Update mode. Apply the user's diff. Preserve all sections the diff does not touch. |

Routes are detected from the user's first message. The spine asks for clarification only if the intent is genuinely ambiguous.

## On Activation

1. **Parse arguments** — check for `--intent idea|doc|codebase|feature|existing`, `--headless`.
2. **Load config** from `{project-root}/_bmad/bmm/config.yaml`:
   - `user_name`, `communication_language`, `document_output_language`
   - `planning_artifacts` (output location)
3. **Detect the entry shape** from the user's first message. If ambiguous, ask.
4. **Route to the matching entry shape** below.

### Route: `idea`

- Ask 3-5 questions to nail down: user, problem, why-now, rough shape.
- Generate the spine from the answers.
- Apply the breadth-coverage rubric (every altitude-owned dimension decided/deferred/open).

### Route: `doc`

- Ask the user for the doc path. Load the full doc.
- Extract the structural decisions: tech stack, data model, API surface, integration points.
- Surface unstated assumptions — the doc's silence on a dimension is data, not absence.
- Generate the spine. Note in the spine header which doc was the source.

### Route: `codebase`

- Ask the user for the codebase root path.
- Reverse-engineer: scan for tech stack markers (package.json, go.mod, pyproject.toml, etc.), route patterns, data model markers.
- Generate the spine from observed reality.
- Produce `drift.md` listing places where the code contradicts the spine (or where the spine contradicts the code).

### Route: `feature`

- Ask the user for the feature slice (story ID, epic ID, or free-form description).
- Produce a feature-scoped spine — only the altitudes affected by this slice.
- Reference the existing spine (if any) for the altitudes it does not change.

### Route: `existing`

- Ask the user for the existing spine path and the desired change.
- Apply the change. Preserve all untouched sections verbatim.
- Run the breadth-coverage rubric on the updated spine.

## The Spine Document

`ARCHITECTURE-SPINE.md` is the source of truth. It is intentionally short. The shape:

```markdown
# Architecture Spine

**Project:** {project_name}
**Owner:** {user_name}
**Last updated:** {date}
**Source intent:** {idea|doc|codebase|feature|existing}

## Problem
[1 paragraph. The user. The pain. The why-now.]

## Altitudes
[Each altitude is one decision. Each is decided|deferred|open.]

### A1. Tech stack
{decided|deferred|open} — {decision or note}

### A2. Data model
{decided|deferred|open} — {decision or note}

### A3. API surface
{decided|deferred|open} — {decision or note}

### A4. Integration points
{decided|deferred|open} — {decision or note}

### A5. Security posture
{decided|deferred|open} — {decision or note}

### A6. Observability
{decided|deferred|open} — {decision or note}

### A7. Deployment topology
{decided|deferred|open} — {decision or note}

## Rules
[Each rule is one paragraph. Naming, structure, error handling, communication patterns.]

## Out of scope
[What this spine explicitly does NOT decide. Saves future debates.]

## Breadth coverage
[Rubric: every altitude marked. Open items flagged. Deferred items carry a target.]

## Links
- SPEC: [derived from this spine, when generated]
- Source doc: [if route = doc]
- Drift: [drift.md, if route = codebase]
```

The spine is a thinking tool, not a contract. SPEC.md is generated **from** the spine when the team needs the full, larger doc.

## SPEC.md Derivation

When the user (or `aac-spec`) needs a SPEC, generate it from the spine:

- Tech stack → expands into A1 in SPEC (versions, justification, alternatives rejected)
- Data model → expands into schema section in SPEC
- API surface → expands into endpoint tables in SPEC
- Rules → expand into named pattern sections in SPEC
- Out of scope → preserved verbatim in SPEC

The SPEC is generated, not authored. If the user edits SPEC directly, the spine should be the next edit — the spine is the source of truth.

## Headless Mode

`--headless` runs the spine in non-interactive mode:

1. Read the intent from `{project-root}/spine-input.md` (must declare intent + entry shape).
2. Run the matching route end-to-end.
3. Write the spine to `{project-root}/ARCHITECTURE-SPINE.md`.
4. If `--derive-spec` is also set, generate SPEC.md alongside.

Headless is useful for CI-driven spine generation, overnight batch processing, or for users who want a first-draft spine to react to.

## Success Metrics

- Spine is short (target ≤ 200 lines; the spine that grows past 200 lines has slipped back into SPEC territory)
- Every altitude is marked decided/deferred/open (no unmarked altitudes)
- Open items are not buried; they appear in the breadth-coverage section
- Out of scope is honest (lists what the spine does NOT cover, not just what it does)
- SPEC.md derivation is automatic when requested, not hand-authored

## Failure Modes

- Spine growing into a SPEC (use `aac-create-architecture` or `aac-spec` for that)
- Entry shape not detected (ask, do not guess)
- Drift.md missing on the codebase route (the spine alone is silent on what reality looks like)
- Open items hidden in altitude bodies (they belong in the breadth-coverage section)
- SPEC.md edited without updating the spine (the spine is the source of truth; SPEC is downstream)
