# Converting BMAD Artifacts to JSON

This guide explains how to convert existing BMAD Markdown artifacts to schema-compliant JSON format using the `bmad-to-json` workflow.

## Quick Start

### Convert a Single File

```
bmad-to-json path/to/your-artifact.md
```

### Convert All Artifacts in a Folder

```
bmad-to-json .agentcanvas-context/planning-artifacts --all
```

### Interactive Mode

```
bmad-to-json
```

This will prompt you to select which artifacts to convert.

---

## When to Use This Workflow

Use `bmad-to-json` when you have:

1. **Legacy BMAD artifacts** - Markdown files created before dual-output was enabled
2. **Imported documents** - Use cases or requirements imported from external systems
3. **Manual artifacts** - Files created by hand without using BMAD workflows
4. **Prose-style stories** - Technical stories with bullet-list acceptance criteria

**Note:** New workflows with `output_format: dual` automatically produce both formats. You only need this conversion for existing Markdown-only artifacts.

---

## Supported Artifacts

### BMM (Business & Method Module)

| File Pattern | Schema | Description |
|--------------|--------|-------------|
| `epics.md` | `epics.schema.json` | Epic definitions with stories |
| `story-*.md` | `story.schema.json` | Individual user stories |
| `UC-*.md`, `use-case*.md` | `use-case.schema.json` | Use case documentation |
| `PRD.md`, `prd.md` | `prd.schema.json` | Product Requirements Document |
| `architecture.md` | `architecture.schema.json` | Architecture decisions |
| `research*.md` | `research.schema.json` | Research findings |
| `product-brief*.md` | `product-brief.schema.json` | Product vision |
| `ux-design*.md` | `ux-design.schema.json` | UX specifications |
| `tech-spec*.md` | `tech-spec.schema.json` | Technical specifications |
| `readiness-report*.md` | `readiness-report.schema.json` | Implementation readiness |
| `project-context*.md` | `project-context.schema.json` | AI agent context |
| `project-overview*.md` | `project-overview.schema.json` | Project overview |
| `source-tree*.md` | `source-tree.schema.json` | Source code structure |

### TEA (Test Engineering & Architecture)

| File Pattern | Schema | Description |
|--------------|--------|-------------|
| `test-design*.md` | `test-design.schema.json` | Test strategy |
| `test-review*.md` | `test-review.schema.json` | Test quality review |
| `traceability*.md` | `traceability-matrix.schema.json` | Requirements traceability |
| `nfr-assessment*.md` | `nfr-assessment.schema.json` | NFR assessment |
| `atdd-checklist*.md` | `atdd-checklist.schema.json` | ATDD checklist |

### CIS (Creative & Innovation Strategies)

| File Pattern | Schema | Description |
|--------------|--------|-------------|
| `storytelling*.md` | `storytelling.schema.json` | Crafted narratives |
| `problem-solving*.md` | `problem-solving.schema.json` | Problem solving sessions |
| `innovation-strategy*.md` | `innovation-strategy.schema.json` | Innovation strategy |
| `design-thinking*.md` | `design-thinking.schema.json` | Design thinking sessions |

### Supporting Schemas

These schemas don't have dedicated workflows but can be used for manually-created artifacts:

| File Pattern | Schema | Description |
|--------------|--------|-------------|
| `risks*.md` | `risks.schema.json` | Risk assessments |
| `definition-of-done*.md` | `definition-of-done.schema.json` | DoD checklists |
| `fit-criteria*.md` | `fit-criteria.schema.json` | Testable fit criteria |
| `success-metrics*.md` | `success-metrics.schema.json` | Success metrics |

---

## Command Reference

### Basic Commands

| Command | Description |
|---------|-------------|
| `bmad-to-json` | Interactive mode - select artifacts to convert |
| `bmad-to-json [file.md]` | Convert single file |
| `bmad-to-json [folder] --all` | Convert all BMAD artifacts in folder |

### Filtering Options

| Option | Description |
|--------|-------------|
| `--type=story` | Convert only story artifacts |
| `--type=use-case` | Convert only use case artifacts |
| `--type=epic` | Convert only epic artifacts |
| `--schema=path/to/schema.json` | Use specific schema (override auto-detection) |

### Large File Options

| Option | Description |
|--------|-------------|
| `--chunked` | Enable chunked conversion for large files |
| `--chunk=1-3` | Convert specific epics (e.g., epics 1, 2, 3) |
| `--resume` | Resume interrupted conversion |

---

## Examples

### Convert Planning Artifacts

```
bmad-to-json .agentcanvas-context/planning-artifacts --all
```

Converts:
- `PRD.md` -> `PRD.json`
- `architecture.md` -> `architecture.json`
- `research-*.md` -> `research-*.json`

### Convert Stories Only

```
bmad-to-json .agentcanvas-context/implementation-artifacts/stories --type=story
```

### Convert Use Cases

```
bmad-to-json .agentcanvas-context/implementation-artifacts/use-cases --type=use-case
```

Or convert a single use case:

```
bmad-to-json .agentcanvas-context/implementation-artifacts/use-cases/UC-01-configure-qa-policies.md
```

### Convert Large Epics File (Chunked)

For files with 5+ epics or 500+ lines:

```
bmad-to-json epics.md --chunked
```

The workflow will:
1. Create JSON structure with metadata and requirements
2. Convert epics in batches of 2-3
3. Validate the complete file

### Resume Failed Conversion

If conversion is interrupted:

```
bmad-to-json epics.md --resume
```

---

## Story Format Support

The conversion workflow supports two story formats:

### 1. Structured Format (Standard BMAD)

Stories with explicit As-a/I-want/So-that and Given/When/Then:

```markdown
## User Story

As a developer,
I want to set up a Vite + React project,
So that I have a solid foundation.

## Acceptance Criteria

### AC-1
**Given** I am starting a new project
**When** I run the initialization command
**Then** the project is created successfully
**And** the structure includes all directories
```

Converts to:

```json
{
  "userStory": {
    "asA": "developer",
    "iWant": "to set up a Vite + React project",
    "soThat": "I have a solid foundation"
  },
  "acceptanceCriteria": [{
    "id": "AC-1",
    "given": "I am starting a new project",
    "when": "I run the initialization command",
    "then": "the project is created successfully",
    "and": ["the structure includes all directories"]
  }]
}
```

### 2. Prose Format (Technical/Informal)

Stories with background sections and bullet-list acceptance criteria:

```markdown
# Story: Centralize HTTP retry logic

## Background / Problem

Today the system handles HTTP errors inconsistently...

## User Story

As a Core developer,
I want centralized HTTP retry/backoff,
so that clients don't need their own retry logic.

## High-Level Solution

- Cache responses per-asset
- Implement HTTP response classification
- Add retry with exponential backoff

## Acceptance Criteria

- HTTP responses are properly classified (2xx, 4xx, 5xx)
- Retry logic uses exponential backoff
- Cache invalidation works correctly
```

Converts to:

```json
{
  "storyFormat": "prose",
  "background": "Today the system handles HTTP errors inconsistently...",
  "userStory": {
    "asA": "Core developer",
    "iWant": "centralized HTTP retry/backoff",
    "soThat": "clients don't need their own retry logic"
  },
  "proposedSolution": "Cache responses per-asset. Implement HTTP response classification. Add retry with exponential backoff.",
  "solutionDetails": [
    "Cache responses per-asset",
    "Implement HTTP response classification",
    "Add retry with exponential backoff"
  ],
  "acceptanceCriteria": [
    { "id": "AC-1", "criterion": "HTTP responses are properly classified (2xx, 4xx, 5xx)" },
    { "id": "AC-2", "criterion": "Retry logic uses exponential backoff" },
    { "id": "AC-3", "criterion": "Cache invalidation works correctly" }
  ]
}
```

---

## Use Case Conversion

Use cases follow a specific format with frontmatter:

### Input (UC-01.md)

```markdown
---
id: UC-01
title: Configure QA Policies
sourceDocument: requirements/use-cases.html
---

## Summary

Configure QA policies per institution and modality.

## Primary Actor

- QA/Medical Physicist

## Preconditions

- Workstation is registered
- User has admin rights

## Main Flow

1. User selects institution
2. User chooses standards
3. User defines QA tasks

## Postconditions

- Policies are saved and active
```

### Output (UC-01.json)

```json
{
  "id": "UC-01",
  "title": "Configure QA Policies",
  "sourceDocument": "requirements/use-cases.html",
  "summary": "Configure QA policies per institution and modality.",
  "primaryActor": "QA/Medical Physicist",
  "preconditions": [
    "Workstation is registered",
    "User has admin rights"
  ],
  "mainFlow": [
    { "step": 1, "action": "User selects institution" },
    { "step": 2, "action": "User chooses standards" },
    { "step": 3, "action": "User defines QA tasks" }
  ],
  "postconditions": [
    "Policies are saved and active"
  ]
}
```

---

## Validation

After conversion, the workflow validates:

- **Schema compliance** - JSON matches the referenced schema
- **Completeness** - All content from Markdown is captured
- **No summarization** - Full descriptions, not counts or summaries
- **Proper structure** - User stories have separate fields, not combined strings

### Common Validation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `userStory is string` | Combined "As a X, I want Y" | Split into `asA`, `iWant`, `soThat` |
| `acceptanceCriteriaCount` | Counted instead of listing | Include full AC objects |
| `description truncated` | Content was summarized | Copy full original text |
| `missing required field` | Schema field not populated | Extract from Markdown |

---

## Output Location

Converted JSON files are saved alongside their source files:

```
.agentcanvas-context/
├── planning-artifacts/
│   ├── PRD.md
│   ├── PRD.json          <- New
│   ├── architecture.md
│   └── architecture.json <- New
└── implementation-artifacts/
    ├── epics.md
    ├── epics.json        <- New
    └── stories/
        ├── story-1.1.md
        └── story-1.1.json <- New
```

---

## Troubleshooting

### "Schema not found for file"

The file pattern doesn't match any known artifact type. Use `--schema` to specify:

```
bmad-to-json custom-artifact.md --schema=_bmad/schemas/bmm/story.schema.json
```

### "File too large for single response"

Use chunked mode:

```
bmad-to-json large-epics.md --chunked
```

### "Conversion incomplete"

Resume from where it stopped:

```
bmad-to-json epics.md --resume
```

### "Invalid JSON output"

Check for:
- Unescaped quotes in content
- Missing commas between array items
- Truncated content from large files

---

## See Also

- [Dual-Output System](dual-output-system.md) - How dual output works in workflows
- [Schema Reference](schema-reference.md) - Detailed schema documentation
- [Story Schema](../schemas/bmm/story.schema.json) - Story JSON schema with prose support
- [Use Case Schema](../schemas/bmm/use-case.schema.json) - Use case JSON schema
