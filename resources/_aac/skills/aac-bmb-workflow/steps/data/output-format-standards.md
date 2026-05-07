# Output Format Standards

## Golden Rule

**Every step MUST output to a document BEFORE loading the next step.**

Two patterns:
1. **Direct-to-Final:** Steps append to final document
2. **Plan-then-Build:** Steps append to plan → build step consumes plan

## Output Format

All structured artifacts use **JSON-only output** — structured JSON is the primary data format. The extension renders a human-readable canvas view automatically from the JSON.

### Output Format Modes

```yaml
output_format: json      # JSON only — use for all structured artifacts (DEFAULT)
output_format: markdown  # Markdown only — use for narrative/documentation workflows only
```

> **Note:** `output_format: dual` is deprecated and must not be used in new workflows.

### JSON Structure

All JSON artifacts follow this structure:

```json
{
  "$schema": "../schemas/{module}/{artifact}.schema.json",
  "metadata": {
    "workflowName": "string",
    "artifactType": "string", 
    "version": "1.0.0",
    "createdAt": "ISO-8601 datetime",
    "updatedAt": "ISO-8601 datetime",
    "status": "draft|in_progress|review|approved|archived",
    "stepsCompleted": ["step-01-init", "step-02-gather"],
    "author": "string",
    "projectName": "string"
  },
  "content": {
    // Artifact-specific content per schema
  }
}
```

### JSON Schema Locations

Schemas are stored centrally and referenced:
```
_bmad/schemas/
├── common/           # Shared definitions
│   ├── metadata.schema.json
│   ├── user-story.schema.json
│   ├── acceptance-criteria.schema.json
│   └── requirement.schema.json
├── bmm/              # BMM module schemas
├── tea/              # TEA module schemas
└── cis/              # CIS module schemas
```

### JSON Template Files

JSON templates use `.template.json` extension:
```
workflow/templates/
├── artifact.template.json    # JSON template with placeholders
└── artifact.template.md      # Markdown template (existing)
```

### JSON Template Syntax

```json
{
  "$schema": "{{schema_path}}",
  "metadata": {
    "workflowName": "{{workflow_name}}",
    "projectName": "{{project_name}}",
    "createdAt": "{{timestamp}}",
    "status": "draft"
  },
  "content": {
    "title": "{{title}}",
    "sections": []
  }
}
```

## Menu C Option Sequence

When user selects **C (Continue)**:
1. **Append/Write** to document (plan or final)
2. **Update frontmatter** (append this step to `stepsCompleted`)
3. **THEN** load next step

```markdown
- IF C: Save content to {outputFile}, update frontmatter, then load, read entire file, then execute {nextStepFile}
```

## Output Patterns

### Pattern 1: Plan-then-Build

```
Step 1 (init)     → Creates plan.md from template
Step 2 (gather)   → Appends requirements to plan.md
Step 3 (design)   → Appends design decisions to plan.md
Step 4 (review)   → Appends review/approval to plan.md
Step 5 (build)    → READS plan.md, CREATES final artifacts
```

**Plan frontmatter:**
```yaml
workflowName: [name]
creationDate: [date]
stepsCompleted: ['step-01-init', 'step-02-gather']
status: PLANNING_COMPLETE
```

### Pattern 2: Direct-to-Final

```
Step 1 (init)     → Creates final-doc.md from minimal template
Step 2 (section)  → Appends Section 1
Step 3 (section)  → Appends Section 2
Step 4 (section)  → Appends Section 3
Step 5 (polish)   → Optimizes entire document
```

## Four Template Types

### 1. Free-Form (RECOMMENDED)
- Minimal template, progressive append, final polish

```yaml
---
stepsCompleted: []
lastStep: ''
date: ''
user_name: ''
---

# {{document_title}}

[Content appended progressively by workflow steps]
```

### 2. Structured
- Single template with placeholders, clear sections

```markdown
# {{title}}

## {{section_1}}
[Content to be filled]

## {{section_2}}
[Content to be filled]
```

### 3. Semi-Structured
- Core required sections + optional additions

### 4. Strict
- Multiple templates, exact field definitions
- Use for: compliance, legal, regulated

## Template Syntax

```markdown
{{variable}}    # Handlebars style (preferred)
[variable]      # Bracket style (also supported)
```

Keep templates lean - structure only, not content.

## Step-to-Output Mapping

Steps should be in ORDER of document appearance:

```
Step 1: Init (creates doc)
Step 2: → ## Section 1
Step 3: → ## Section 2
Step 4: → ## Section 3
Step 5: → ## Section 4
Step 6: Polish (optimizes entire doc)
```

**Critical:** Use ## Level 2 headers for main sections - allows document splitting if needed.

## Final Polish Step

For free-form workflows, include a polish step that:
1. Loads entire document
2. Reviews for flow and coherence
3. Reduces duplication
4. Ensures proper ## Level 2 headers
5. Improves transitions
6. Keeps general order but optimizes readability

## Output File Patterns

```yaml
# JSON output (default for structured artifacts)
outputFile: '{output_folder}/document-{project_name}.json'

# Time-stamped
outputFile: '{output_folder}/document-{project_name}-{timestamp}.json'

# User-specific
outputFile: '{output_folder}/document-{user_name}-{project_name}.json'

# Markdown only (for narrative/documentation workflows)
outputFile: '{output_folder}/document-{project_name}.md'
```

## JSON-Specific Patterns

### Progressive JSON Building

For Plan-then-Build workflows with JSON:

```
Step 1 (init)     → Creates plan.json with metadata.status = "draft"
Step 2 (gather)   → Appends to content.requirements array
Step 3 (design)   → Appends to content.design object
Step 4 (review)   → Updates metadata.status = "in-review"
Step 5 (build)    → READS plan.json, CREATES final artifacts
```

### JSON Array Appending

Steps that add items use array append pattern:
```json
{
  "content": {
    "features": [
      // Step 2 adds items here
    ],
    "requirements": [
      // Step 3 adds items here  
    ]
  }
}
```

### JSON Status Transitions

```
draft → in_progress → review → approved → archived
```

Update `metadata.status` and `metadata.updatedAt` on each transition.

### Canvas Rendering

The extension renders a human-readable canvas view automatically from the JSON artifact. You do not need to generate a Markdown companion file.

### Schema Validation

All JSON output MUST validate against its schema:
```yaml
# In workflow.yaml
schemaFile: 'schemas/bmm/product-brief.schema.json'
validateOutput: true
```
