# BMAD Dual-Output System

## Overview

The BMAD Dual-Output System produces workflow artifacts in two synchronized formats:

1. **JSON (Primary)** - Machine-readable, schema-validated structured data
2. **Markdown (Secondary)** - Human-readable documentation with YAML frontmatter

This approach provides the best of both worlds: structured data for programmatic access and tooling, plus readable documents for human review and collaboration.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Workflow Execution                        │
│                    (AI Agent via workflow.xml)                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     JSON Template Loading                        │
│            template.json + variable substitution                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Schema Validation                           │
│               (JSON Schema draft-07 validation)                  │
└────────────────┬─────────────────────────────┬──────────────────┘
                 │                             │
                 ▼                             ▼
┌────────────────────────────┐   ┌────────────────────────────────┐
│      artifact.json         │   │      artifact.md               │
│   (Primary structured      │   │   (Human-readable view         │
│    data output)            │   │    via json_to_markdown.py)    │
└────────────────────────────┘   └────────────────────────────────┘
```

## Quick Start

### 1. Enable Dual Output in a Workflow

Add these lines to your `workflow.yaml` or `workflow.md` frontmatter:

```yaml
output_format: dual
schema_file: "{bmad-path}/schemas/bmm/your-artifact.schema.json"
template_json: "{installed_path}/templates/template.json"
```

### 2. Create the JSON Template

Create a template file with the `$schema` reference and placeholder values:

```json
{
  "$schema": "../../../schemas/bmm/your-artifact.schema.json",
  "metadata": {
    "schemaVersion": "1.0.0",
    "artifactType": "your-artifact-type",
    "workflowName": "{{workflow_name}}",
    "projectName": "{{project_name}}",
    "timestamps": {
      "created": "{{timestamp}}",
      "lastModified": "{{timestamp}}"
    },
    "author": "{{user_name}}",
    "status": "draft"
  },
  "content": {
    // Your artifact-specific content fields
  }
}
```

### 3. Create the Schema

Create a JSON Schema file defining the artifact structure:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://bmad.dev/schemas/bmm/your-artifact.schema.json",
  "title": "Your Artifact Schema",
  "type": "object",
  "required": ["metadata", "content"],
  "properties": {
    "metadata": {
      "$ref": "../common/metadata.schema.json"
    },
    "content": {
      "type": "object",
      "required": ["field1", "field2"],
      "properties": {
        // Define your content structure
      }
    }
  }
}
```

## Configuration Reference

### Workflow Configuration Keys

| Key | Description | Example |
|-----|-------------|---------|
| `output_format` | Output mode: `dual`, `json`, or `markdown` | `dual` |
| `schema_file` | Path to JSON Schema for validation | `{bmad-path}/schemas/bmm/prd.schema.json` |
| `template_json` | Path to JSON template file | `{installed_path}/templates/template.json` |

### Template Variables

Templates support variable substitution using `{{variable_name}}` syntax:

| Variable | Source | Description |
|----------|--------|-------------|
| `{{workflow_name}}` | workflow.yaml `name` | Name of the current workflow |
| `{{project_name}}` | User input or config | Project name |
| `{{user_name}}` | config.yaml | Current user's name |
| `{{timestamp}}` | System | ISO 8601 timestamp |
| `{{date}}` | System | Current date (YYYY-MM-DD) |

## File Locations

### Schema Registry

All schemas are stored in `_bmad/schemas/`:

```
schemas/
├── index.json              # Schema registry/index
├── common/                 # Shared schemas (metadata, user-story, etc.)
│   ├── metadata.schema.json
│   ├── user-story.schema.json
│   ├── acceptance-criteria.schema.json
│   └── requirement.schema.json
├── bmm/                    # Business & Method Module schemas
│   ├── prd.schema.json
│   ├── epics.schema.json
│   ├── story.schema.json
│   ├── architecture.schema.json
│   ├── research.schema.json
│   └── ...
├── tea/                    # Test Engineering & Architecture schemas
│   ├── test-design.schema.json
│   ├── traceability-matrix.schema.json
│   └── ...
└── cis/                    # Creative & Innovation Strategies schemas
    ├── design-thinking.schema.json
    ├── problem-solving.schema.json
    └── ...
```

### Templates

Templates are stored within each workflow folder:

```
bmm/workflows/1-analysis/research/
├── workflow.md
├── templates/
│   └── research-template.json   # JSON template for this workflow
└── steps/
    └── ...
```

## Output Format

### JSON Output Structure

All JSON artifacts follow this structure:

```json
{
  "$schema": "path/to/schema.json",
  "metadata": {
    "schemaVersion": "1.0.0",
    "artifactType": "artifact-type",
    "workflowName": "workflow-name",
    "projectName": "Project Name",
    "timestamps": {
      "created": "2026-02-16T10:00:00Z",
      "lastModified": "2026-02-16T12:30:00Z",
      "completed": "2026-02-16T12:30:00Z"
    },
    "stepsCompleted": ["step-01", "step-02"],
    "author": "User Name",
    "status": "completed"
  },
  "content": {
    // Artifact-specific content
  }
}
```

### Markdown Output Structure

The generated Markdown follows this structure:

```markdown
---
schemaVersion: 1.0.0
artifactType: artifact-type
workflowName: workflow-name
projectName: Project Name
status: completed
author: User Name
timestamps:
  created: "2026-02-16T10:00:00Z"
  lastModified: "2026-02-16T12:30:00Z"
---

# Artifact Type: Project Name

## Section 1

Content from JSON rendered as readable text...

## Section 2

- List items
- More items

---
*Generated: 2026-02-16 12:30:00*
```

## Validation

### Static Validation

Run the validation script to check all schemas, templates, and workflows:

```bash
cd _bmad/scripts
python validate_schemas.py
```

This validates:
- All 27 JSON Schema files (syntax and structure)
- All 21 JSON template files (syntax and schema compliance)
- All 18 workflow configurations (dual-output settings)

### Runtime Validation

During workflow execution, the AI agent validates:
1. Template loads correctly
2. Variable substitution produces valid JSON
3. Output conforms to referenced schema
4. Markdown generation succeeds

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `validate_schemas.py` | Static validation of schemas, templates, workflows |
| `test_workflow_runtime.py` | Simulates workflow execution and dual-output |
| `json_to_markdown.py` | JSON to Markdown renderer module |
| `fix_template_metadata.py` | Batch utility to fix metadata format |

## Best Practices

### Schema Design

1. **Use `$ref` for common structures** - Reference `common/metadata.schema.json` instead of duplicating
2. **Mark required fields** - Use `"required": [...]` to enforce mandatory data
3. **Add descriptions** - Document each field with `"description"`
4. **Use enums for controlled vocabularies** - e.g., `"enum": ["low", "medium", "high"]`
5. **Set `additionalProperties: false`** - Prevent unexpected fields

### Template Design

1. **Match schema structure exactly** - Templates must conform to their schemas
2. **Use consistent variable names** - Follow established conventions
3. **Include all required fields** - Even if with placeholder values
4. **Set correct `$schema` path** - Use relative paths from template location

### Workflow Configuration

1. **Always set `output_format: dual`** - For full dual-output support
2. **Use path variables** - `{project-root}`, `{installed_path}` for portability
3. **Reference correct schema** - Match artifact type to schema

## Converting Existing Artifacts

If you have existing Markdown artifacts that were created before dual-output was enabled, you can convert them to JSON using the `bmad-to-json` workflow.

### Quick Conversion

```bash
# Convert a single file
bmad-to-json path/to/artifact.md

# Convert all artifacts in a folder
bmad-to-json .agileagentcanvas-context/planning --all

# Interactive mode
bmad-to-json
```

### What Gets Converted

The workflow automatically detects artifact type from filename patterns:

- `epics.md` -> Epic definitions
- `story-*.md` -> User stories (structured or prose format)
- `UC-*.md` -> Use cases
- `PRD.md` -> Product Requirements Document
- `architecture.md` -> Architecture decisions
- And more...

### Full Documentation

See [Converting BMAD Artifacts to JSON](bmad-to-json.md) for:

- Complete list of supported artifacts
- Story format support (structured vs prose)
- Use case conversion
- Chunked conversion for large files
- Troubleshooting guide

## Workflows with Dual Output

The following workflows are configured for automatic dual output:

### BMM Module
- `create-product-brief` - Product vision documents
- `domain-research`, `market-research`, `technical-research` - Research artifacts
- `create-prd` - Product Requirements Documents
- `create-ux-design` - UX specifications
- `create-architecture` - Architecture decisions
- `create-epics-and-stories` - Epics and stories
- `create-story` - Individual stories
- `quick-spec` - Technical specifications
- `generate-project-context` - AI agent context
- `check-implementation-readiness` - Readiness reports
- `document-project` - Project overview and source tree

### TEA Module
- `test-design` - Test strategy documents
- `test-review` - Test quality reviews
- `trace` - Traceability matrices
- `nfr-assess` - NFR assessments
- `atdd` - ATDD checklists

### CIS Module
- `storytelling` - Crafted narratives
- `problem-solving` - Problem solving sessions
- `innovation-strategy` - Innovation strategies
- `design-thinking` - Design thinking sessions
