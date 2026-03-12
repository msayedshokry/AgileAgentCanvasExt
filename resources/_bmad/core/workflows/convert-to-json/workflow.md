# BMAD Artifact to JSON Conversion Workflow

---
name: bmad-to-json
description: Convert BMAD Markdown artifacts to schema-compliant verbose JSON format
triggers:
  - "bmad-to-json"
  - "bmad-to-json [path]"
  - "bmad-to-json [path] --all"
schema_index: "{bmad-path}/schemas/index.json"
---

## Purpose

This is a **BMAD-specific** workflow to convert existing BMAD Markdown artifacts to their corresponding verbose JSON format using the official BMAD schemas. This is NOT a generic markdown-to-JSON converter.

## Trigger Commands

| Command | Description |
|---------|-------------|
| `bmad-to-json` | Interactive mode - asks which artifacts to convert |
| `bmad-to-json [file.md]` | Convert single file using auto-detected schema |
| `bmad-to-json [folder] --all` | Convert all BMAD artifacts in folder |
| `bmad-to-json [folder] --type=story` | Convert only story artifacts in folder |
| `bmad-to-json [folder] --type=use-case` | Convert only use-case artifacts in folder |

### Examples

```
bmad-to-json .agentcanvas-context/planning-artifacts --all
bmad-to-json .agentcanvas-context/implementation-artifacts/stories --all
bmad-to-json .agentcanvas-context/implementation-artifacts/use-cases/UC-01-configure-qa-policies.md
```

---

## CRITICAL INSTRUCTIONS

**You MUST read and follow these rules exactly. The output must be VERBOSE - capturing ALL content from the source.**

### 🚫 FORBIDDEN Patterns (Do NOT do these):

1. **Counting instead of including:**
   ```json
   "acceptanceCriteriaCount": 7  // ❌ FORBIDDEN
   "storyCount": 5               // ❌ FORBIDDEN
   ```

2. **Combined user story strings:**
   ```json
   "userStory": "As a developer, I want X, So that Y"  // ❌ FORBIDDEN
   ```

3. **Requirement IDs without descriptions:**
   ```json
   "functionalRequirements": ["FR 1.1", "FR 1.2"]  // ❌ FORBIDDEN
   ```

4. **Summarized or truncated content:**
   ```json
   "description": "Parser functionality..."  // ❌ FORBIDDEN (if original was longer)
   ```

### ✅ REQUIRED Patterns (You MUST do these):

1. **Separate user story fields:**
   ```json
   "userStory": {
     "asA": "developer",
     "iWant": "to set up a Vite + React + TypeScript project with proper configuration and folder structure",
     "soThat": "I have a solid foundation for building the BMAD UI application"
   }
   ```

2. **Full acceptance criteria with Given/When/Then:**
   ```json
   "acceptanceCriteria": [
     {
       "id": "AC-1",
       "given": "I am starting a new project",
       "when": "I run the initialization command `npm create vite@latest bmad-ui -- --template react-ts`",
       "then": "the project is created with React 19.2, TypeScript 5.x, and Vite 5.x",
       "and": [
         "the project structure includes `/src/components`, `/src/hooks`, `/src/stores`, `/src/utils`, `/src/types` directories",
         "TypeScript is configured with strict mode enabled in `tsconfig.json`",
         "ESLint is configured with airbnb-typescript rules",
         "Prettier is configured for code formatting",
         "the development server starts successfully with `npm run dev`",
         "the project builds successfully with `npm run build`"
       ]
     }
   ]
   ```

3. **Requirements with FULL descriptions:**
   ```json
   "requirements": {
     "functional": [
       {
         "id": "FR 1.1",
         "title": "Parse BMAD Markdown Files",
         "description": "System reads epic and story markdown files from a specified folder, extracts metadata (ID, title, status, dependencies, assignees), and loads complete content into memory without requiring database",
         "capabilityArea": "File Parsing & Data Ingestion",
         "epicRef": "Epic 1"
       }
     ]
   }
   ```

---

## Conversion Process

### Step 1: Identify Artifact Type and Schema

| If the file is... | Use this schema |
|------------------|-----------------|
| `epics.md` | `schemas/bmm/epics.schema.json` |
| `story-*.md` or individual story | `schemas/bmm/story.schema.json` |
| `UC-*.md` or `use-case*.md` | `schemas/bmm/use-case.schema.json` |
| `PRD.md` or `prd.md` | `schemas/bmm/prd.schema.json` |
| `architecture.md` | `schemas/bmm/architecture.schema.json` |
| `research*.md` | `schemas/bmm/research.schema.json` |
| `product-brief*.md` | `schemas/bmm/product-brief.schema.json` |
| `ux-design*.md` | `schemas/bmm/ux-design.schema.json` |
| `tech-spec*.md` | `schemas/bmm/tech-spec.schema.json` |
| `test-design*.md` | `schemas/tea/test-design.schema.json` |
| `traceability*.md` | `schemas/tea/traceability-matrix.schema.json` |
| `risks*.md` | `schemas/bmm/risks.schema.json` |
| `definition-of-done*.md` or `dod*.md` | `schemas/bmm/definition-of-done.schema.json` |
| `fit-criteria*.md` | `schemas/bmm/fit-criteria.schema.json` |
| `success-metrics*.md` or `metrics*.md` | `schemas/bmm/success-metrics.schema.json` |
| `readiness-report*.md` | `schemas/bmm/readiness-report.schema.json` |
| `project-context*.md` | `schemas/bmm/project-context.schema.json` |
| `project-overview*.md` | `schemas/bmm/project-overview.schema.json` |
| `source-tree*.md` | `schemas/bmm/source-tree.schema.json` |
| `test-review*.md` | `schemas/tea/test-review.schema.json` |
| `nfr-assessment*.md` or `nfr-report*.md` | `schemas/tea/nfr-assessment.schema.json` |
| `atdd-checklist*.md` | `schemas/tea/atdd-checklist.schema.json` |
| `storytelling*.md` | `schemas/cis/storytelling.schema.json` |
| `problem-solving*.md` | `schemas/cis/problem-solving.schema.json` |
| `innovation-strategy*.md` | `schemas/cis/innovation-strategy.schema.json` |
| `design-thinking*.md` | `schemas/cis/design-thinking.schema.json` |

### Step 2: Read the Schema

**Before converting, read the schema file completely** to understand:
- Required fields
- Field types (string, array, object)
- Nested structures
- Field descriptions

### Step 3: Parse the Markdown

Extract ALL content:
- YAML frontmatter
- Every section and subsection
- Every user story
- Every acceptance criterion
- Every requirement with full description
- Every implementation note
- Every list item
- Every table

### Step 4: Build JSON Structure

#### For Epics (epics.md → epics.json):

```json
{
  "$schema": "../../_bmad/schemas/bmm/epics.schema.json",
  "metadata": {
    "schemaVersion": "1.0.0",
    "artifactType": "epics",
    "workflowName": "create-epics-and-stories",
    "projectName": "[Extract from document title or overview]",
    "stepsCompleted": [1, 2, 3, 4],
    "timestamps": {
      "created": "[From frontmatter or file creation time]",
      "lastModified": "[Current ISO timestamp]",
      "completed": "[Current ISO timestamp]"
    },
    "author": "[From config or frontmatter]",
    "status": "completed"
  },
  "content": {
    "title": "[Project Name] Epics",
    "overview": {
      "projectName": "[name]",
      "description": "[FULL overview text from document]",
      "totalEpics": [actual count],
      "totalStories": [actual count]
    },
    "requirements": {
      "functional": [
        // EVERY FR with FULL detail
        {
          "id": "FR 1.1",
          "title": "[exact title]",
          "description": "[COMPLETE description - copy entire text]",
          "capabilityArea": "[extracted from section header]"
        }
        // ... ALL FRs
      ],
      "nonFunctional": [
        // EVERY NFR with FULL detail
        {
          "id": "NFR 1.1",
          "title": "[exact title]",
          "description": "[COMPLETE description]",
          "dimension": "[Performance/Accessibility/Reliability/etc.]"
        }
        // ... ALL NFRs
      ],
      "additional": [
        // EVERY AR with FULL detail
        {
          "id": "AR 1",
          "title": "[exact title]",
          "description": "[COMPLETE description]",
          "category": "[Architecture/Technology/etc.]"
        }
        // ... ALL ARs
      ]
    },
    "requirementsCoverageMap": {
      // Map each requirement to its epic(s)
      "FR 1.1": ["Epic 1"],
      "FR 1.2": ["Epic 1"],
      // ... ALL mappings
    },
    "epics": [
      {
        "epicId": "1",
        "title": "[exact epic title]",
        "goal": "[COMPLETE goal text - User Outcome section]",
        "valueDelivered": "[COMPLETE value text - Value Delivered section]",
        "requirements": {
          "functional": [
            // Reference with detail
            {
              "id": "FR 1.1",
              "title": "[title]"
            }
          ],
          "nonFunctional": [...],
          "additional": [...]
        },
        "implementationNotes": "[COMPLETE implementation notes - all bullet points as text or array]",
        "stories": [
          {
            "storyId": "1.1",
            "title": "[exact story title]",
            "userStory": {
              "asA": "[role - just the role, no 'As a']",
              "iWant": "[capability - full text, no 'I want']",
              "soThat": "[benefit - full text, no 'So that']"
            },
            "acceptanceCriteria": [
              {
                "id": "AC-1",
                "given": "[FULL text after 'Given']",
                "when": "[FULL text after 'When']",
                "then": "[FULL text after 'Then']",
                "and": [
                  "[FULL text of first 'And']",
                  "[FULL text of second 'And']"
                  // ... ALL 'And' clauses
                ]
              }
              // ... ALL acceptance criteria
            ],
            "dependencies": ["1.1", "1.2"],  // or [] if none
            "priority": "P0"  // or "P1", "P2" based on content
          }
          // ... ALL stories in this epic
        ]
      }
      // ... ALL epics
    ]
  }
}
```

### Step 5: Validate Output

Before saving, verify:

#### For Structured Stories (standard BMAD format):
- [ ] **User stories**: All have `asA`, `iWant`, `soThat` as separate fields
- [ ] **Acceptance criteria**: All have `given`, `when`, `then` with full text

#### For Prose-Style Stories:
- [ ] **Story format**: Set `storyFormat: "prose"`
- [ ] **User stories**: Either parsed into `asA/iWant/soThat` OR use `formatted` field
- [ ] **Acceptance criteria**: Use `criterion` field for bullet-list ACs
- [ ] **Background/Solution**: Captured in `background`, `proposedSolution`, `solutionDetails` fields

#### For Use Cases (UC-*.md):
- [ ] **Frontmatter**: `id`, `title`, `sourceDocument` extracted from YAML
- [ ] **Primary Actor**: Extracted without bullet prefix
- [ ] **Main Flow**: Converted to array of `{step, action}` objects
- [ ] **Pre/Postconditions**: Converted to string arrays

#### For All Artifacts:
- [ ] **Requirements**: All have `id`, `title`, AND complete `description`
- [ ] **No counts**: No `acceptanceCriteriaCount`, `storyCount`, `requirementCount`
- [ ] **No truncation**: All descriptions match source length
- [ ] **Valid JSON**: Parseable without errors

### Step 6: Save Output

Save as `[original_name].json` in the same directory as the source.

Example: `epics.md` → `epics.json`

---

## Quick Reference: Parsing Patterns

### User Story Parsing

**Source:**
```markdown
As a developer,
I want to set up a Vite + React + TypeScript project with proper configuration,
So that I have a solid foundation for building the application.
```

**Extract:**
- `asA`: "developer"
- `iWant`: "to set up a Vite + React + TypeScript project with proper configuration"
- `soThat`: "I have a solid foundation for building the application"

### Acceptance Criteria Parsing

**Source:**
```markdown
**Given** I am starting a new project
**When** I run the initialization command
**Then** the project is created successfully
**And** the structure includes all directories
**And** configuration files are generated
```

**Extract:**
```json
{
  "given": "I am starting a new project",
  "when": "I run the initialization command",
  "then": "the project is created successfully",
  "and": [
    "the structure includes all directories",
    "configuration files are generated"
  ]
}
```

### Requirement Parsing

**Source:**
```markdown
- **FR 1.1: Parse BMAD Markdown Files** - System reads epic and story markdown files from a specified folder, extracts metadata (ID, title, status, dependencies, assignees), and loads complete content into memory without requiring database
```

**Extract:**
```json
{
  "id": "FR 1.1",
  "title": "Parse BMAD Markdown Files",
  "description": "System reads epic and story markdown files from a specified folder, extracts metadata (ID, title, status, dependencies, assignees), and loads complete content into memory without requiring database"
}
```

### Prose-Style Story Parsing

The schema supports two story formats: **structured** (standard BMAD) and **prose** (informal/technical stories).

**Prose-style source example:**
```markdown
# Story: Centralize policy HTTP retry/backoff in CloudConnector

## Background / Problem

Today BarcoCore calls `policy()` over DBus and the CloudConnector forwards this to the Agent-API. HTTP-level semantics (202 "calculation in progress", 4xx vs 5xx, network errors, backoff) are only partially handled.

## User Story

As a Core/Agent developer,
I want CloudConnector to fully own HTTP retry/backoff for policy retrieval,
so that BarcoCore can use policies reliably without implementing its own retry logic.

## High-Level Solution

- Maintain a per-asset cached "last known policy" (JSON + timestamp).
- Implement internal HTTP classification for `Client::policy(assetId)`
- Add a simple DBus API for policy operations

## Acceptance Criteria

- CloudConnector caches per-asset policies and classifies HTTP responses.
- All HTTP retry/backoff behavior is implemented inside CloudConnector.
- New DBus methods are available and introspectable.
```

**Extract to JSON:**
```json
{
  "content": {
    "title": "Centralize policy HTTP retry/backoff in CloudConnector",
    "storyFormat": "prose",
    "background": "Today BarcoCore calls `policy()` over DBus and the CloudConnector forwards this to the Agent-API. HTTP-level semantics (202 \"calculation in progress\", 4xx vs 5xx, network errors, backoff) are only partially handled.",
    "userStory": {
      "asA": "Core/Agent developer",
      "iWant": "CloudConnector to fully own HTTP retry/backoff for policy retrieval",
      "soThat": "BarcoCore can use policies reliably without implementing its own retry logic"
    },
    "proposedSolution": "Maintain a per-asset cached \"last known policy\" (JSON + timestamp). Implement internal HTTP classification for `Client::policy(assetId)`. Add a simple DBus API for policy operations.",
    "solutionDetails": [
      "Maintain a per-asset cached \"last known policy\" (JSON + timestamp)",
      "Implement internal HTTP classification for `Client::policy(assetId)`",
      "Add a simple DBus API for policy operations"
    ],
    "acceptanceCriteria": [
      {
        "id": "AC-1",
        "criterion": "CloudConnector caches per-asset policies and classifies HTTP responses."
      },
      {
        "id": "AC-2",
        "criterion": "All HTTP retry/backoff behavior is implemented inside CloudConnector."
      },
      {
        "id": "AC-3",
        "criterion": "New DBus methods are available and introspectable."
      }
    ]
  }
}
```

**Key rules for prose-style stories:**
- Set `storyFormat: "prose"` to indicate the format
- Use `background` for "Background", "Problem", or "Context" sections
- Use `proposedSolution` for "Solution" or "High-Level Solution" sections
- Use `solutionDetails` array for bullet-point solution items
- For acceptance criteria without Given/When/Then, use `criterion` field instead
- If user story IS in As-a/I-want/So-that format, still parse into separate fields
- If user story is pure prose, use `userStory.formatted` field

### Use Case Parsing (UC-*.md)

**Source:**
```markdown
---
id: UC-01
title: Configure QA Policies per Site/Modality
sourceDocument: agent/technicalfile/design_inputs/Requirements-Use.html
---

## Summary

Configure QA and calibration policies per institution, site, modality, and use.

## Primary Actor

- QA/Medical Physicist (QAtech)

## Preconditions

- Workstation and attached displays are registered.
- QAtech has rights to define or modify QA policies.

## Main Flow

1. QAtech selects institution/site and modality.
2. QAtech chooses applicable standards.
3. QAtech defines calibration and QA tasks.

## Postconditions

- Displays are governed by a documented QA policy.
```

**Extract to JSON:**
```json
{
  "id": "UC-01",
  "title": "Configure QA Policies per Site/Modality",
  "sourceDocument": "agent/technicalfile/design_inputs/Requirements-Use.html",
  "summary": "Configure QA and calibration policies per institution, site, modality, and use.",
  "primaryActor": "QA/Medical Physicist (QAtech)",
  "preconditions": [
    "Workstation and attached displays are registered.",
    "QAtech has rights to define or modify QA policies."
  ],
  "mainFlow": [
    { "step": 1, "action": "QAtech selects institution/site and modality." },
    { "step": 2, "action": "QAtech chooses applicable standards." },
    { "step": 3, "action": "QAtech defines calibration and QA tasks." }
  ],
  "postconditions": [
    "Displays are governed by a documented QA policy."
  ]
}
```

**Key rules for use case parsing:**
- Extract YAML frontmatter fields (`id`, `title`, `sourceDocument`) directly
- `primaryActor`: Extract text after "Primary Actor" header (strip bullet if present)
- `preconditions`: Convert to array of strings
- `mainFlow`: Convert numbered list to array of objects with `step` and `action`
- `postconditions`: Convert to array of strings
- If present, also extract `alternativeFlows`, `exceptionFlows`, `businessRules`

---

## Chunking for Large Files

**IMPORTANT:** If the source file is large (>500 lines, >5 epics, or >20 stories), you MUST use chunked conversion to avoid hitting response length limits.

### When to Chunk

| Indicator | Threshold | Action |
|-----------|-----------|--------|
| File lines | >500 lines | Chunk by epic |
| Epic count | >5 epics | 2-3 epics per chunk |
| Story count | >20 stories | Chunk by epic |
| Requirements | >50 total | Split requirements + epics |

### Chunking Process

#### Step A: Create JSON Shell First

Generate the JSON structure with metadata, overview, and requirements inventory first (without epics):

```json
{
  "$schema": "../../_bmad/schemas/bmm/epics.schema.json",
  "metadata": { ... },
  "content": {
    "overview": { ... },
    "requirementsInventory": { ... },
    "coverageMap": { ... },
    "epics": []  // Empty - will be populated in chunks
  }
}
```

Save as `epics.json` (or use temp file `epics-partial.json`).

#### Step B: Convert Epics in Batches

For each batch of 2-3 epics:

1. Read the current `epics.json`
2. Parse the next 2-3 epics from the source markdown
3. Convert to verbose JSON format (full userStory, acceptanceCriteria, etc.)
4. Append to the `epics` array
5. Save updated file

**Prompts for chunked conversion:**
```
Convert Epic 1, 2, and 3 from epics.md and add to epics.json
```
```
Continue converting Epics 4, 5, and 6 from epics.md
```
```
Finish converting Epics 7, 8, and 9 from epics.md
```

#### Step C: Validate Complete File

After all chunks are added:
```
Validate epics.json is complete and matches the schema
```

### Automatic Chunking Detection

When you receive a conversion request, first assess the file size:

1. **Count epics** - Look for `### Epic N:` or `## Epic N:` patterns
2. **Count stories** - Look for `### Story N.N:` patterns
3. **Estimate size** - If totals exceed thresholds, inform the user:

**Example response:**
```
I've analyzed epics.md:
- 9 epics with 55 stories total
- ~1700 lines of content
- This exceeds the single-response limit

I'll convert this in 4 chunks:
1. Requirements inventory + coverage map
2. Epics 1-3 (with 19 stories)
3. Epics 4-6 (with 17 stories)
4. Epics 7-9 (with 19 stories)

Starting with chunk 1...
```

### Chunk Size Guidelines

| Content Type | Max per Chunk |
|-------------|---------------|
| Requirements (FR/NFR/AR) | All in first chunk |
| Epics | 2-3 per chunk |
| Stories | ~15-20 per chunk |
| Acceptance Criteria | No limit (part of story) |

### Resuming Failed Conversions

If a conversion fails mid-chunk:
```
Resume epics.json conversion from Epic 5
```

The workflow will:
1. Read current `epics.json` to see what's completed
2. Find where conversion stopped
3. Continue from that point

---

## Invocation Examples

**Interactive mode:**
```
bmad-to-json
```

**Single file:**
```
bmad-to-json epics.md
bmad-to-json .agentcanvas-context/implementation-artifacts/use-cases/UC-01-configure-qa-policies.md
```

**Batch conversion (all BMAD artifacts in folder):**
```
bmad-to-json .agentcanvas-context/planning-artifacts --all
bmad-to-json .agentcanvas-context/implementation-artifacts --all
```

**Filtered by type:**
```
bmad-to-json .agentcanvas-context/implementation-artifacts --type=story
bmad-to-json .agentcanvas-context/implementation-artifacts --type=use-case
```

**Chunked mode for large files:**
```
bmad-to-json epics.md --chunked
bmad-to-json epics.md --chunk=1-3
```

**Resume interrupted conversion:**
```
bmad-to-json epics.md --resume
```

**With explicit schema (override auto-detection):**
```
bmad-to-json custom-artifact.md --schema=_bmad/schemas/bmm/story.schema.json
```
