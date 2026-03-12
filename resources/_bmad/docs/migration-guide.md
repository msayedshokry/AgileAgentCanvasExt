# Migration Guide: _bmad to _bmad_new

This guide explains how to migrate workflows and artifacts from the original `_bmad` folder to the new dual-output `_bmad_new` system.

## Overview of Changes

| Aspect | Old (`_bmad`) | New (`_bmad_new`) |
|--------|---------------|-------------------|
| **Output Format** | Markdown only | Dual (JSON + Markdown) |
| **Validation** | Manual/checklist | JSON Schema automated |
| **Metadata** | YAML frontmatter | JSON `metadata` object |
| **Data Structure** | Unstructured text | Structured JSON |
| **Templates** | Markdown templates | JSON templates |

## Migration Steps

### Step 1: Understand the New Structure

The new system organizes artifacts differently:

```
_bmad_new/
├── schemas/              # NEW: Central schema definitions
│   ├── index.json        # Schema registry
│   ├── common/           # Shared schemas
│   ├── bmm/              # BMM module schemas
│   ├── tea/              # TEA module schemas
│   └── cis/              # CIS module schemas
├── scripts/              # NEW: Validation and utility scripts
├── docs/                 # NEW: Documentation
├── bmm/                  # Same structure, updated configs
│   └── workflows/
├── tea/
│   └── workflows/
└── cis/
    └── workflows/
```

### Step 2: Migrate Workflow Configuration

**Old workflow.yaml:**
```yaml
name: "research"
version: "1.0.0"
output_file: "research-report.md"
```

**New workflow.yaml:**
```yaml
name: "research"
version: "1.0.0"

# NEW: Dual output configuration
output_format: dual
schema_file: "{bmad-path}/schemas/bmm/research.schema.json"
template_json: "{installed_path}/templates/research-template.json"
```

### Step 3: Create JSON Template

Convert your existing Markdown template to a JSON template.

**Old template.md:**
```markdown
---
type: research
project: {{project_name}}
created: {{date}}
---

# Research Report

## Topic
{{topic}}

## Findings
- Finding 1
- Finding 2

## Recommendations
{{recommendations}}
```

**New template.json:**
```json
{
  "$schema": "../../../schemas/bmm/research.schema.json",
  "metadata": {
    "schemaVersion": "1.0.0",
    "artifactType": "research",
    "workflowName": "research",
    "projectName": "{{project_name}}",
    "timestamps": {
      "created": "{{timestamp}}",
      "lastModified": "{{timestamp}}"
    },
    "author": "{{user_name}}",
    "status": "draft"
  },
  "content": {
    "researchType": "market",
    "topic": "{{topic}}",
    "findings": [],
    "recommendations": [],
    "synthesis": ""
  }
}
```

### Step 4: Metadata Format Changes

The metadata format has changed significantly:

| Old (YAML frontmatter) | New (JSON metadata) |
|------------------------|---------------------|
| `version: 1.0.0` | `schemaVersion: "1.0.0"` |
| `createdAt: 2026-02-16` | `timestamps: { created: "2026-02-16T10:00:00Z" }` |
| `updatedAt: 2026-02-16` | `timestamps: { lastModified: "2026-02-16T12:00:00Z" }` |
| `type: research` | `artifactType: "research"` |
| Flat structure | Nested `metadata` object |

**Key Changes:**
1. `version` → `schemaVersion` (to distinguish from workflow version)
2. `createdAt`/`updatedAt` → `timestamps.created`/`timestamps.lastModified`
3. All metadata fields are now inside a `metadata` object
4. Strict validation - no extra fields allowed (`additionalProperties: false`)

### Step 5: Create or Use Existing Schema

Check if a schema already exists in `schemas/`:

```bash
# List all available schemas
ls _bmad/schemas/bmm/
ls _bmad/schemas/tea/
ls _bmad/schemas/cis/
```

If you need a new schema:

1. Create the schema file based on the template in schema-reference.md
2. Register it in `schemas/index.json`
3. Run validation: `python scripts/validate_schemas.py`

### Step 6: Update Workflow Steps (Optional)

If your workflow steps reference output format:

**Old step instruction:**
```markdown
## Output
Write the findings to `research-report.md` in Markdown format.
```

**New step instruction:**
```markdown
## Output
Generate the research artifact using the template. The system will:
1. Populate the JSON template with your findings
2. Validate against the schema
3. Generate both JSON and Markdown outputs
```

## Migrating Existing Artifacts

### Converting Existing Markdown to JSON

For existing artifacts you want to migrate:

1. **Extract frontmatter** → Convert to `metadata` object
2. **Structure content** → Map sections to `content` object fields
3. **Validate** → Run against schema

**Example conversion:**

**Existing research-report.md:**
```markdown
---
type: research
project: Widget App
created: 2026-01-15
author: Jane Doe
---

# Market Research

## Topic
Mobile Widget Market Analysis

## Findings

### Market Size
The market is valued at $2.3B.

### Growth
Growing at 15% CAGR.

## Recommendations
- Focus on enterprise segment
- Prioritize mobile-first
```

**Converted research-report.json:**
```json
{
  "$schema": "../../../schemas/bmm/research.schema.json",
  "metadata": {
    "schemaVersion": "1.0.0",
    "artifactType": "research",
    "workflowName": "research",
    "projectName": "Widget App",
    "timestamps": {
      "created": "2026-01-15T00:00:00Z",
      "lastModified": "2026-02-16T10:00:00Z"
    },
    "author": "Jane Doe",
    "status": "completed"
  },
  "content": {
    "researchType": "market",
    "topic": "Mobile Widget Market Analysis",
    "findings": [
      {
        "category": "Market Size",
        "finding": "The market is valued at $2.3B",
        "confidence": "high"
      },
      {
        "category": "Growth",
        "finding": "Growing at 15% CAGR",
        "confidence": "high"
      }
    ],
    "recommendations": [
      {
        "recommendation": "Focus on enterprise segment",
        "priority": "high"
      },
      {
        "recommendation": "Prioritize mobile-first",
        "priority": "medium"
      }
    ]
  }
}
```

## Validation Checklist

After migration, run these checks:

```bash
cd _bmad/scripts

# 1. Validate all schemas, templates, and workflows
python validate_schemas.py

# 2. Test workflow execution (optional)
python test_workflow_runtime.py
```

### Common Validation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `schemaVersion is required` | Using old `version` field | Rename to `schemaVersion` |
| `timestamps.created is required` | Using old `createdAt` format | Use nested timestamps object |
| `additionalProperties not allowed` | Extra fields in metadata | Remove or move to `customFields` |
| `$schema path not found` | Wrong relative path in template | Fix path relative to template location |

## Coexistence Strategy

During migration, both systems can coexist:

1. **Keep `_bmad` unchanged** - Original workflows continue to work
2. **Migrate incrementally** - Move workflows one at a time to `_bmad_new`
3. **Test thoroughly** - Validate each migrated workflow before production use
4. **Switch over** - Once all workflows are migrated, update project config to use `_bmad_new`

## FAQ

### Do I need to migrate everything at once?

No. The two systems can coexist. Migrate workflows incrementally.

### Will my existing Markdown artifacts still work?

Yes, in `_bmad`. The new system generates new artifacts in dual format.

### Can I generate only JSON or only Markdown?

Yes. Set `output_format: json` or `output_format: markdown` in workflow.yaml.

### How do I add custom fields?

Use the `customFields` object in metadata:
```json
{
  "metadata": {
    "customFields": {
      "myCustomField": "value"
    }
  }
}
```

### Where should I report issues?

Run validation first:
```bash
python scripts/validate_schemas.py
```

If validation passes but you still have issues, check the workflow execution logs.
