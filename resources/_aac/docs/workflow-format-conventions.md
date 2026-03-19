# Workflow Format Conventions

This document describes the file format conventions used throughout the BMAD workflow system. Understanding these conventions helps when creating new workflows or extending existing ones.

## Workflow File Formats

BMAD workflows use two primary file formats, each with specific use cases:

### YAML Format (`.yaml`)

**Used for:** Simple, configuration-focused workflows

```yaml
# example-workflow/workflow.yaml
name: workflow-name
description: "What this workflow does"
author: "BMad"

config_source: "{bmad-path}/bmm/config.yaml"
output_folder: "{config_source}:output_folder"

instructions: "{installed_path}/instructions.md"
template: "{installed_path}/template.md"

output_format: dual
schema: "{bmad-path}/schemas/bmm/artifact.schema.json"
```

**Characteristics:**
- Clean, declarative syntax
- Good for listing variables and configuration
- Used by implementation/operational workflows
- Examples: `sprint-planning`, `code-review`, `retrospective`, `dev-story`

### Markdown Format (`.md`)

**Used for:** Complex, multi-step workflows with embedded instructions

```markdown
---
name: create-artifact
description: Create an artifact through structured facilitation
main_config: '{bmad-path}/bmm/config.yaml'
nextStep: './steps-c/step-01-init.md'
output_format: dual
schema_file: "{bmad-path}/schemas/bmm/artifact.schema.json"
---

# Artifact Create Workflow

**Goal:** Create comprehensive artifacts through structured workflow facilitation.

## WORKFLOW ARCHITECTURE
...
```

**Characteristics:**
- Combines configuration (frontmatter) with instructions (body)
- Supports rich formatting for complex instructions
- Used by planning/analysis workflows with multiple steps
- Examples: `create-prd`, `create-architecture`, `create-epics-and-stories`

## Step File Architecture

Complex workflows use a step-file architecture with specific directory conventions:

### Directory Structure

```
workflow-name/
├── workflow-create-{name}.md    # Create mode entry
├── workflow-edit-{name}.md      # Edit mode entry
├── workflow-validate-{name}.md  # Validate mode entry
├── steps-c/                     # Create mode steps
│   ├── step-01-init.md
│   ├── step-02-section.md
│   └── step-03-finalize.md
├── steps-e/                     # Edit mode steps
│   └── step-01-edit.md
├── steps-v/                     # Validate mode steps
│   └── step-01-validate.md
├── templates/                   # Output templates
│   ├── artifact-template.md
│   └── artifact-template.json
└── data/                        # Reference data
    └── checklist.md
```

### Step Naming Convention

| Prefix | Mode | Purpose |
|--------|------|---------|
| `steps-c/` | Create | Steps for creating new artifacts |
| `steps-e/` | Edit | Steps for editing existing artifacts |
| `steps-v/` | Validate | Steps for validating artifacts |

### Step File Format

```markdown
# Step N: Step Title

## Overview
Brief description of what this step accomplishes.

## Instructions

1. First instruction
2. Second instruction
3. Third instruction

## Menu

- [A] Option A - Description
- [B] Option B - Description
- [C] Continue to next step

## Next Step
Read fully and follow: `{nextStep}` (steps-c/step-02-section.md)
```

## Instruction File Formats

Instructions can be written in two formats:

### XML Format (`.xml`)

**Used for:** Structured, machine-parseable instructions

```xml
<instructions>
  <overview>
    <goal>What this workflow achieves</goal>
    <output>What artifact is produced</output>
  </overview>
  
  <steps>
    <step id="1">
      <title>Step Title</title>
      <action>What to do</action>
    </step>
  </steps>
</instructions>
```

**Characteristics:**
- Strict structure, easy to parse
- Good for complex decision trees
- Used by some implementation workflows
- Example: `dev-story/instructions.xml`

### Markdown Format (`.md`)

**Used for:** Human-readable, flexible instructions

```markdown
# Instructions

## Overview
What this workflow achieves.

## Steps

### Step 1: Title
What to do in this step.

### Step 2: Title
...
```

**Characteristics:**
- Easy to read and write
- Supports rich formatting
- More flexible structure
- Most common format

## Template Conventions

### Markdown Templates

```markdown
---
title: "Artifact Title"
project: "{project_name}"
version: "1.0"
date: "{date}"
status: "draft"
output_format: dual
schema: "bmm/artifact.schema.json"
---

# Artifact Title

## Section 1
Content here...

## Section 2
Content here...
```

### JSON Templates

```json
{
  "metadata": {
    "title": "{title}",
    "project": "{project_name}",
    "version": "1.0",
    "createdAt": "{date}",
    "status": "draft"
  },
  "content": {
    "section1": {
      "field1": "",
      "field2": ""
    }
  }
}
```

## Variable Reference Syntax

Variables can reference configuration values:

| Syntax | Description | Example |
|--------|-------------|---------|
| `{variable}` | Simple variable | `{project_name}` |
| `{config_source}:key` | Config file value | `{config_source}:output_folder` |
| `{installed_path}/file` | Relative to workflow | `{installed_path}/instructions.md` |
| `{project-root}/path` | Relative to project | `{bmad-path}/schemas/` |

## Checklist Files

Checklists use a consistent Markdown format:

```markdown
# Workflow Checklist

## Required Items
- [ ] Item 1 description
- [ ] Item 2 description

## Optional Items
- [ ] Item 3 description

## Quality Gates
- [ ] Gate 1: Description
- [ ] Gate 2: Description
```

## Best Practices

### When to Use YAML
- Simple workflows with linear execution
- Configuration-heavy workflows
- Operational/implementation workflows
- When instructions are in a separate file

### When to Use Markdown
- Complex workflows with multiple paths
- Workflows requiring rich inline documentation
- Planning/analysis workflows with step files
- When workflow file IS the instruction

### General Guidelines

1. **Consistency**: Within a module, prefer one format
2. **Simplicity**: Use YAML for simple, Markdown for complex
3. **Documentation**: Include inline comments/descriptions
4. **Validation**: Always specify `output_format` and `schema`
5. **Templates**: Provide both MD and JSON templates for dual output

## Module Conventions

| Module | Primary Format | Step Architecture |
|--------|---------------|-------------------|
| BMM Analysis | Markdown | Yes (steps-c/e/v) |
| BMM Planning | Markdown | Yes (steps-c/e/v) |
| BMM Solutioning | Markdown | Yes (steps-c/e/v) |
| BMM Implementation | YAML | No (single instruction file) |
| BMM Supporting | YAML | No (single instruction file) |
| TEA | YAML | No (single instruction file) |
| CIS | Markdown | Varies |

## Migration Notes

If converting between formats:

1. **YAML to Markdown**: Move config to frontmatter, add body content
2. **Markdown to YAML**: Extract frontmatter to YAML, move body to `instructions.md`
3. **XML to Markdown**: Convert tags to headers, preserve structure
4. **Markdown to XML**: Add structure tags, may lose some formatting
