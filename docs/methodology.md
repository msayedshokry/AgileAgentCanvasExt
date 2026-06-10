# BMAD Methodology — Deep Dive

This is the longer-form companion to the README's *"What is BMAD?"* callout. It documents the four phases, the five modules, the workflow registry, the persona catalogue, and walks through an example end-to-end trace so you can see how the pieces fit together in practice.

If you just want to run a quick command, see the [README](../README.md). If you want to understand the *why* behind the structure, read on.

## Why a methodology at all?

LLMs are fluent, but fluent is not the same as consistent. The same prompt, run twice, can produce a product brief that looks nothing like the one your team already approved. A methodology fixes that by giving the AI three things:

- **A shape** — a four-phase model that always goes Discovery → Planning → Solutioning → Implementation, with a defined artefact at each gate.
- **A persona** — every workflow is run by a named agent (analyst, PM, architect, dev, QA) whose tone, vocabulary, and output format are pinned in advance.
- **A checklist** — every workflow has a sequence of steps, validation checkpoints, and an exit criterion (a concrete artefact written to disk), so "done" is unambiguous.

Agile Agent Canvas is the runtime that loads the methodology and gives it a UI. The methodology itself lives in `resources/_aac/` as a versioned bundle; the extension can install the same bundle into Claude Code, Cursor, Antigravity, OpenCode, and other CLI agents, so the same workflow runs the same way everywhere.

## The four phases

### 1. Discovery

**Goal:** figure out *what* you're building and *for whom*. Output is a small set of agreed-upon, validated artefacts that anchor every later decision.

| Typical output | Owner |
|---|---|
| Product brief | Analyst |
| Vision statement | Analyst |
| Market / user research | Analyst, CIS agents |
| Stakeholder map | Analyst |

Common entry points: `/vision`, `/design-thinking`, `/story-craft`.

### 2. Planning

**Goal:** turn the discovery artefacts into a roadmap. Decompose the work into value-driven epics and actionable stories; define what done means.

| Typical output | Owner |
|---|---|
| PRD (functional + non-functional requirements) | Analyst |
| Requirements catalogue | Analyst |
| Epics (grouped by user value) | PM |
| Stories (implementable, with ACs) | PM |
| Definition of done | PM |
| Test strategy | QA, Architect |

Common entry points: `/requirements`, `/epics`, `/stories`, `/sprint`, `/readiness`.

### 3. Solutioning

**Goal:** make the architectural decisions that constrain the implementation phase, before any code is written.

| Typical output | Owner |
|---|---|
| Architecture document | Architect |
| Tech spec | Architect |
| ADR (architecture decision records) | Architect |
| UX design | Analyst |
| Risks and mitigations | PM |

Common entry points: `/ux`, `/create-architecture`, `/tech-spec`, `/risks`.

### 4. Implementation

**Goal:** build, test, and verify. Each story flows through create → dev → review, with quality gates at every transition.

| Typical output | Owner |
|---|---|
| Story JSON with tasks / tests / ACs | Dev |
| Implemented code | Dev |
| Code review report | QA |
| Test cases (unit, integration, E2E) | QA |
| NFR assessment | QA |
| Trace records (tool calls, decisions) | Harness |
| Sprint status YAML | PM |

Common entry points: `/dev`, `/review-code`, `/test-design`, `/atdd`, `/nfr-assess`, `/ci`, `/trace`.

## The five modules

BMAD is shipped as a modular bundle. Each module owns a slice of the methodology:

- **Core** — cross-cutting utilities (workflow execution, step prompts, memory, config). Every other module depends on it.
- **BMB (BMAD Builder)** — meta-tools for *building* BMAD itself. Use it to author new agents, new workflows, and new customisation layers. Includes `bmad-agent-builder` and `bmad-workflow-builder`.
- **BMM (Business Method for Management)** — the product-management layer. This is where the four phases above live. 30 workflows covering discovery, planning, solutioning, and implementation management.
- **TEA (Test Engineering & Architecture)** — testing workflows: ATDD, NFR assessment, test design (architecture + QA views), test review, framework setup, automation, CI, traceability. ~9 workflow families, each with multiple sub-workflows.
- **CIS (Creative Intelligence Suite)** — six agent personas for the discovery and ideation phases: Carson (Brainstorming), Dr. Quinn (Problem Solver), Maya (Design Thinking), Victor (Innovation), Caravaggio (Presentation), Sophia (Storyteller). Each has its own SKILL.md and a `customize.toml` for persona data.

A sixth optional module, **graphify**, is not a BMAD module — it's the external knowledge-graph tool that feeds codebase context into BMAD workflows.

## Workflow registry (74 workflows)

The current bundle ships 74 workflows. The top-level registry lives in `resources/_aac/_config/skill-manifest.csv`; the runtime registry is exposed via the **Workflows** button on the canvas and the `/workflows` chat command. A representative subset, by phase:

| Phase | Workflow | Purpose |
|---|---|---|
| Discovery | `create-product-brief` | One-page product brief from a seed idea |
| Discovery | `create-vision` | Vision statement and problem framing |
| Discovery | `brainstorm` (CIS) | Carson-style structured brainstorming |
| Planning | `create-prd` | Full PRD with functional and non-functional requirements |
| Planning | `create-requirements` | Standalone requirements catalogue |
| Planning | `create-epics` | Value-driven epic decomposition |
| Planning | `create-stories` | Epic → story breakdown with ACs |
| Planning | `create-sprint-status` | Sprint planning with goal-based grouping |
| Planning | `create-readiness-report` | Validates PRD / architecture / epics / stories are ready for dev |
| Solutioning | `create-architecture` | Full architecture document with ADRs |
| Solutioning | `create-tech-spec` | Targeted tech spec for an epic |
| Solutioning | `create-ux-design` | UX specifications through collaborative exploration |
| Implementation | `dev-story` | Implements a story end-to-end with status propagation |
| Implementation | `code-review` | Adversarial code review with multiple finding categories |
| Implementation | `create-test-cases` | Generate test cases from a story |
| Implementation | `atdd` | Acceptance-test-driven development checklist |
| Implementation | `nfr-assess` | Non-functional requirements assessment |
| Implementation | `ci` | Scaffold CI/CD pipeline with quality gates |
| Implementation | `trace` | Traceability matrix across requirements → tests |
| Cross-cutting | `correct-course` | Mid-flight change management |
| Cross-cutting | `retrospective` | Sprint retrospective |
| Cross-cutting | `verification-loop` | 6-phase quality gate (build, types, lint, tests, security, diff) |

Workflows that produce structured artefacts emit a `SAVE JSON ARTIFACT` block in their final step, telling the LLM exactly which tool call to make and which schema file to reference.

## Persona catalogue (24 agents)

Every workflow is run by a named agent. The agent's `SKILL.md` defines its tone, vocabulary, persona data, and the tools it prefers. Users can override any persona with a `customize.toml` at the user, team, or project level — the runtime merges them in that order.

Built-in personas, grouped by role:

| Role | Persona | Used by |
|---|---|---|
| **Analyst** | `analyst` (default) | Vision, product brief, requirements |
| **PM** | `pm` | Epics, stories, sprint, readiness |
| **Architect** | `architect` | Architecture, tech spec, ADRs |
| **Dev** | `dev` | dev-story, code generation |
| **QA** | `qa` | test-design, code-review, nfr-assess |
| **Tech Writer** | `tech-writer` | write-doc, mermaid, readme, changelog, api-docs |
| **CIS — Brainstorming** | `carson` | Brainstorming workflow |
| **CIS — Problem Solving** | `dr-quinn` | Problem-solving workflow |
| **CIS — Design Thinking** | `maya` | Design-thinking workflow |
| **CIS — Innovation** | `victor` | Innovation workflow |
| **CIS — Presentation** | `caravaggio` | Presentation workflow |
| **CIS — Storyteller** | `sophia` | Storytelling workflow |
| **BMB — Agent Builder** | `bmad-agent-builder` | Authoring new agents |
| **BMB — Workflow Builder** | `bmad-workflow-builder` | Authoring new workflows |
| **Integrator** | `canvas-integrator` (Morph) | BMAD markdown → JSON conversion for the canvas |
| **Master** | `bmad-master` | Cross-workflow routing and help |

To use a specific persona, switch via the **Settings → AI Provider → Default Agent** dropdown, or override per-session with the chat command's persona argument.

## An example trace: from seed idea to first story

Below is a realistic walkthrough of the recommended path. Each line shows the user action, the active persona, and what lands on disk.

1. **User:** `@agileagentcanvas /vision`
   - **Persona:** Analyst
   - **Workflow:** `create-vision`
   - **Output:** `vision.json` (or YAML) in `.agileagentcanvas-context/`. Contains problem statement, target users, success metrics, non-goals.

2. **User:** `@agileagentcanvas /requirements`
   - **Persona:** Analyst
   - **Workflow:** `create-requirements`
   - **Output:** `requirements.json`. Each requirement has an ID, description, type (functional / non-functional / constraint), priority, and acceptance hints. Cross-references the vision.

3. **User:** `@agileagentcanvas /epics`
   - **Persona:** PM
   - **Workflow:** `create-epics`
   - **Output:** `epics.json` plus per-epic `epic-{N}.json` files. Each epic has a goal, owner, story-point estimate, dependency map, and a slim list of `storyRefs` (the full story payload lives in `epics/epic-{N}/stories/{id}.json`).

4. **User:** `@agileagentcanvas /stories` (one epic at a time)
   - **Persona:** PM
   - **Workflow:** `create-stories`
   - **Output:** per-story JSON with `tasks`, `testCases`, `acceptanceCriteria`. Each AC has `verified: false, status: "draft"` initially. Stories are linked back to their parent epic.

5. **User:** `@agileagentcanvas /readiness`
   - **Persona:** PM (running the `create-readiness-report` workflow)
   - **Output:** a readiness report flagging any gaps (missing ACs, ambiguous requirements, untestable stories). Iterates with the user until the report is clean.

6. **User:** `@agileagentcanvas /dev STORY-1-1`
   - **Persona:** Dev
   - **Workflow:** `dev-story`
   - **Output:** the LLM reads the story JSON, plans the implementation (verifying every file path against the actual codebase), writes the code, runs the tests, updates the story JSON (`content.fileList`, `content.changeLog`, `content.devAgentRecord`, `status: "done"`), then transitions the story to `in-review` via `agileagentcanvas_sync_story_status`. The harness validates the update and accumulates feedback for the next dev cycle.

7. **User:** `@agileagentcanvas /review-code STORY-1-1`
   - **Persona:** QA
   - **Workflow:** `code-review`
   - **Output:** a code review report. If it finds issues, the story returns to `in-progress` with an updated `devAgentRecord`. If clean, the story transitions to `done` and the `sprint-status.yaml` is reverse-synced.

At every step, the harness policy engine runs pre-flight and post-flight checks: pre-flight blocks invalid artefact mutations, post-flight warns on advisory issues (placeholders, budget overruns, repeated errors). The trace recorder logs every tool call to JSONL for post-hoc debugging.

## How the four pieces fit together

```
            ┌──────────────┐
            │   Persona    │  (analyst / pm / architect / dev / qa)
            └──────┬───────┘
                   │ activates
            ┌──────▼───────┐
            │  Workflow    │  (44+ registered)
            └──────┬───────┘
                   │ produces
            ┌──────▼───────┐
            │  Artefact    │  (vision / prd / epic / story / test)
            └──────┬───────┘
                   │ written via
            ┌──────▼───────┐
            │ Artifact     │  (JSON, schema-validated, on disk)
            │   Store      │
            └──────┬───────┘
                   │ powers
            ┌──────▼───────┐
            │   Canvas     │  (visual 4-lane view)
            └──────────────┘
```

A persona runs a workflow, the workflow emits an artefact, the artefact is written to disk via the artifact store, and the canvas reflects the new state. Every transition is recorded; every artefact is schema-validated; every workflow step has an exit criterion.

## Where to go next

- [README](../README.md) — quick start, the three pillars, getting-started path
- [CHANGELOG](../CHANGELOG.md) — release history in the new tone
- [changelog-style-guide](changelog-style-guide.md) — how to write a changelog entry that survives the lint
- [tool-catalog](tool-catalog.md) — the 26 LM tools the AI can call autonomously
- BMAD upstream — [github.com/bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)
