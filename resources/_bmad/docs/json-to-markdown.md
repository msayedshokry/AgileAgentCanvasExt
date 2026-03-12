# JSON to Markdown Rendering

The `json_to_markdown.py` module converts JSON artifacts to human-readable Markdown. This document explains how the rendering works and how to customize it.

## How It Works

The renderer transforms JSON artifacts following these rules:

```
JSON Artifact                     Markdown Output
─────────────────────────────────────────────────────
metadata object          →        YAML frontmatter (---)
content object           →        Document body with headings
arrays of strings        →        Bullet lists
arrays of objects        →        Card-style sections
nested objects           →        Nested headings
camelCase/snake_case     →        Title Case headings
```

## Usage

### As a Python Module

```python
from json_to_markdown import render_artifact

# Load your JSON artifact
with open('artifact.json', 'r') as f:
    data = json.load(f)

# Convert to Markdown
markdown = render_artifact(data)

# Write to file
with open('artifact.md', 'w') as f:
    f.write(markdown)
```

### Command Line

```bash
python json_to_markdown.py artifact.json > artifact.md
```

## Rendering Rules

### 1. Metadata → YAML Frontmatter

The `metadata` object is rendered as YAML frontmatter:

**JSON:**
```json
{
  "metadata": {
    "schemaVersion": "1.0.0",
    "artifactType": "research",
    "projectName": "Widget App",
    "timestamps": {
      "created": "2026-02-16T10:00:00Z",
      "lastModified": "2026-02-16T12:00:00Z"
    },
    "status": "completed"
  }
}
```

**Markdown:**
```yaml
---
schemaVersion: 1.0.0
artifactType: research
projectName: Widget App
timestamps:
  created: "2026-02-16T10:00:00Z"
  lastModified: "2026-02-16T12:00:00Z"
status: completed
---
```

### 2. Heading Capitalization

Field names are converted from camelCase/snake_case to Title Case:

| JSON Key | Markdown Heading |
|----------|------------------|
| `researchType` | Research Type |
| `user_name` | User Name |
| `projectInfo` | Project Info |
| `nfrAssessment` | Nfr Assessment |

### 3. String Values → Paragraphs

Simple string values become paragraphs:

**JSON:**
```json
{
  "content": {
    "synthesis": "The market shows strong growth potential."
  }
}
```

**Markdown:**
```markdown
## Synthesis

The market shows strong growth potential.
```

### 4. String Arrays → Bullet Lists

Arrays of strings become bullet lists:

**JSON:**
```json
{
  "content": {
    "sources": ["Industry reports", "Expert interviews", "User surveys"]
  }
}
```

**Markdown:**
```markdown
## Sources

- Industry reports
- Expert interviews
- User surveys
```

### 5. Object Arrays → Card-Style Sections

Arrays of objects are rendered as numbered cards:

**JSON:**
```json
{
  "content": {
    "findings": [
      {
        "category": "Market Size",
        "finding": "Market valued at $2.3B",
        "confidence": "high",
        "implications": ["Large opportunity", "Room for growth"]
      },
      {
        "category": "Competition",
        "finding": "5 major players dominate",
        "confidence": "medium"
      }
    ]
  }
}
```

**Markdown:**
```markdown
## Findings

### 1. Market valued at $2.3B

**Category:** Market Size
**Confidence:** high
**Implications:**
  - Large opportunity
  - Room for growth

### 2. 5 major players dominate

**Category:** Competition
**Confidence:** medium
```

**Card Title Selection:** The renderer looks for these fields to use as the card title (in order):
1. `title`
2. `name`
3. `finding`
4. `recommendation`
5. `criterion`
6. `category`
7. `id`

### 6. Nested Objects → Nested Headings

Nested objects create nested heading levels:

**JSON:**
```json
{
  "content": {
    "methodology": {
      "approach": "Mixed methods",
      "sources": ["Reports", "Interviews"],
      "webResearchEnabled": true
    }
  }
}
```

**Markdown:**
```markdown
## Methodology

### Approach

Mixed methods

### Sources

- Reports
- Interviews

### Web Research Enabled

Yes
```

### 7. Boolean Values → Yes/No

Boolean values are converted to human-readable text:

| JSON | Markdown |
|------|----------|
| `true` | Yes |
| `false` | No |

### 8. Document Title

The document title is generated from metadata:

**With project name:**
```markdown
# Research: Widget App
```

**Without project name:**
```markdown
# Research
```

### 9. Footer

A footer is automatically added with the generation timestamp:

```markdown
---
*Generated: 2026-02-16 12:30:00*
```

## Customization

### Modifying Key Order in Frontmatter

Edit the `key_order` list in `render_frontmatter()`:

```python
key_order = [
    "schemaVersion", "artifactType", "workflowName", "projectName",
    "status", "author", "timestamps", "stepsCompleted", "currentStep",
    "inputDocuments", "tags"
]
```

### Adding Custom Title Fields

Edit the `title_fields` list in `render_object_as_card()`:

```python
title_fields = ["title", "name", "finding", "recommendation", 
                "criterion", "category", "id"]
```

### Changing Heading Levels

The renderer starts at level 2 (`##`) for content sections. Modify `level` parameter in `render_object()`:

```python
lines.extend(render_object(content, level=1))  # Start at # (level 1)
```

## Example: Full Transformation

### Input JSON

```json
{
  "metadata": {
    "schemaVersion": "1.0.0",
    "artifactType": "research",
    "workflowName": "research",
    "projectName": "Widget App",
    "timestamps": {
      "created": "2026-02-16T10:00:00Z",
      "lastModified": "2026-02-16T12:30:00Z"
    },
    "stepsCompleted": ["init", "research", "synthesis"],
    "author": "Jane Doe",
    "status": "completed"
  },
  "content": {
    "researchType": "market",
    "topic": "Mobile Widget Market",
    "methodology": {
      "approach": "Mixed methods",
      "sources": ["Industry reports", "Expert interviews"],
      "webResearchEnabled": true
    },
    "findings": [
      {
        "category": "Market Size",
        "finding": "Market valued at $2.3B in 2025",
        "confidence": "high",
        "implications": ["Large opportunity", "Growing fast"]
      }
    ],
    "recommendations": [
      {
        "recommendation": "Target enterprise first",
        "priority": "high",
        "rationale": "Higher margins"
      }
    ],
    "synthesis": "Strong market opportunity with room for new entrants."
  }
}
```

### Output Markdown

```markdown
---
schemaVersion: 1.0.0
artifactType: research
workflowName: research
projectName: Widget App
status: completed
author: Jane Doe
timestamps:
  created: "2026-02-16T10:00:00Z"
  lastModified: "2026-02-16T12:30:00Z"
stepsCompleted:
  - init
  - research
  - synthesis
---

# Research: Widget App

## Research Type

market

## Topic

Mobile Widget Market

## Methodology

### Approach

Mixed methods

### Sources

- Industry reports
- Expert interviews

### Web Research Enabled

Yes

## Findings

### 1. Market valued at $2.3B in 2025

**Category:** Market Size
**Confidence:** high
**Implications:**
  - Large opportunity
  - Growing fast

## Recommendations

### 1. Target enterprise first

**Priority:** high
**Rationale:** Higher margins

## Synthesis

Strong market opportunity with room for new entrants.

---
*Generated: 2026-02-16 12:30:00*
```

## Integration with Workflow Execution

During workflow execution, the AI agent:

1. **Loads JSON template** with variable placeholders
2. **Substitutes variables** with actual values
3. **Validates against schema** using JSON Schema validation
4. **Saves JSON output** as the primary artifact
5. **Calls `render_artifact()`** to generate Markdown
6. **Saves Markdown output** as the human-readable view

Both files are saved to the workflow output folder:
- `artifact-name.json` - Primary structured data
- `artifact-name.md` - Human-readable view

## Troubleshooting

### Issue: YAML frontmatter not rendering correctly

**Cause:** Special characters in values need quoting.

**Fix:** The renderer automatically quotes strings with special characters:
```python
if any(c in value for c in [':', '#', '{', '}', '[', ']', ...]):
    return f'"{value}"'
```

### Issue: Arrays rendering on single line

**Cause:** Empty arrays render as `[]`.

**Expected:** Empty arrays are skipped in output.

### Issue: Nested objects too deeply nested

**Cause:** Heading levels max out at `######` (level 6).

**Expected:** Deep nesting flattens at level 6.

### Issue: Card titles not showing

**Cause:** Object doesn't have any of the expected title fields.

**Expected:** Falls back to "Item N" format.
