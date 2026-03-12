# Dual Output: Generate JSON from Markdown Artifact

## Purpose

This task converts a completed Markdown artifact to its corresponding JSON format using the artifact's schema. This ensures structured, machine-readable output alongside the human-readable Markdown.

## CRITICAL: Verbose Output Requirements

**You MUST capture ALL details from the source Markdown. Do NOT summarize, truncate, or count items.**

### User Stories - Use Separated Fields

❌ **WRONG** (combined string):
```json
"userStory": "As a developer, I want to parse files, So that I can extract data."
```

✅ **CORRECT** (separated fields):
```json
"userStory": {
  "asA": "developer",
  "iWant": "to parse files",
  "soThat": "I can extract data"
}
```

### Acceptance Criteria - Full Given/When/Then Text

❌ **WRONG** (just a count):
```json
"acceptanceCriteriaCount": 7
```

✅ **CORRECT** (full detail):
```json
"acceptanceCriteria": [
  {
    "id": "AC-1",
    "given": "I have a list of discovered markdown files",
    "when": "I trigger the parsing process",
    "then": "each markdown file is read and its raw content is extracted",
    "and": [
      "the parser handles files with UTF-8 encoding correctly",
      "the parser separates frontmatter from markdown body content"
    ]
  }
]
```

### Requirements - Full Text, Not Just IDs

❌ **WRONG** (ID only):
```json
"functionalRequirements": ["FR 1.1", "FR 1.2"]
```

✅ **CORRECT** (full detail):
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

## Execution Instructions

### Step 1: Identify Schema

Based on the artifact type, locate the corresponding schema:

| Artifact Type | Schema Path |
|--------------|-------------|
| epics | `{bmad-path}/schemas/bmm/epics.schema.json` |
| story | `{bmad-path}/schemas/bmm/story.schema.json` |
| prd | `{bmad-path}/schemas/bmm/prd.schema.json` |
| architecture | `{bmad-path}/schemas/bmm/architecture.schema.json` |
| research | `{bmad-path}/schemas/bmm/research.schema.json` |
| product-brief | `{bmad-path}/schemas/bmm/product-brief.schema.json` |
| ux-design | `{bmad-path}/schemas/bmm/ux-design.schema.json` |
| tech-spec | `{bmad-path}/schemas/bmm/tech-spec.schema.json` |
| test-design | `{bmad-path}/schemas/tea/test-design.schema.json` |
| traceability-matrix | `{bmad-path}/schemas/tea/traceability-matrix.schema.json` |

### Step 2: Read the Schema

**CRITICAL:** Read the schema file completely before conversion. The schema defines:
- Required fields (must be populated)
- Field types and structures
- Description text that explains what each field should contain
- Nested object structures (like `userStory.asA`, `userStory.iWant`, `userStory.soThat`)

### Step 3: Parse Source Markdown

Extract all content from the Markdown file:
- YAML frontmatter → `metadata` object
- All sections, subsections, and content
- User stories in "As a.../I want.../So that..." format
- Acceptance criteria in Given/When/Then format
- Requirements with full descriptions
- All lists, tables, and structured content

### Step 4: Map to JSON Structure

Transform Markdown content to JSON following schema structure:

#### Metadata Mapping
```json
"metadata": {
  "schemaVersion": "1.0.0",
  "artifactType": "<from schema>",
  "workflowName": "<workflow that created this>",
  "projectName": "<from frontmatter or content>",
  "stepsCompleted": [<from frontmatter>],
  "timestamps": {
    "created": "<original creation time>",
    "lastModified": "<now>",
    "completed": "<if workflow complete>"
  },
  "author": "<from config>",
  "status": "<from frontmatter or 'completed'>"
}
```

#### Content Mapping Rules

1. **Parse User Stories**:
   - Find "As a [role]" → `userStory.asA`
   - Find "I want [capability]" → `userStory.iWant`
   - Find "So that [benefit]" → `userStory.soThat`

2. **Parse Acceptance Criteria**:
   - Find "Given [precondition]" → `given`
   - Find "When [action]" → `when`
   - Find "Then [outcome]" → `then`
   - Find "And [additional]" → `and[]` array
   - Find "But [exception]" → `but[]` array

3. **Parse Requirements**:
   - Extract ID (e.g., "FR 1.1", "NFR 2.1", "AR 3")
   - Extract full title
   - Extract complete description text
   - Map to epic references

4. **Preserve All Content**:
   - Implementation notes → `implementationNotes` or `technicalNotes`
   - Dependencies → `dependencies` array with full detail
   - All bullet points → arrays with complete text

### Step 5: Write JSON Output

Save the JSON file alongside the Markdown file:
- `epics.md` → `epics.json`
- `story-1.1.md` → `story-1.1.json`
- `prd.md` → `prd.json`

Include the `$schema` reference at the top:
```json
{
  "$schema": "../../../schemas/bmm/epics.schema.json",
  "metadata": { ... },
  "content": { ... }
}
```

### Step 6: Validate Output

Verify the JSON output:
- [ ] All required fields from schema are populated
- [ ] User stories have separated `asA`/`iWant`/`soThat` fields
- [ ] Acceptance criteria have full `given`/`when`/`then` text
- [ ] Requirements have complete descriptions (not just IDs)
- [ ] No data was summarized or truncated
- [ ] JSON is valid and parseable

---

## Example: Epics Conversion

### Source Markdown (epics.md):
```markdown
### Story 1.1: Initialize Project

As a developer,
I want to set up a Vite + React + TypeScript project with proper configuration,
So that I have a solid foundation for building the application.

**Acceptance Criteria:**

**Given** I am starting a new project
**When** I run the initialization command
**Then** the project is created with React 19.2, TypeScript 5.x
**And** the project structure includes required directories
**And** TypeScript is configured with strict mode
```

### Target JSON:
```json
{
  "storyId": "1.1",
  "title": "Initialize Project",
  "userStory": {
    "asA": "developer",
    "iWant": "to set up a Vite + React + TypeScript project with proper configuration",
    "soThat": "I have a solid foundation for building the application"
  },
  "acceptanceCriteria": [
    {
      "id": "AC-1",
      "given": "I am starting a new project",
      "when": "I run the initialization command",
      "then": "the project is created with React 19.2, TypeScript 5.x",
      "and": [
        "the project structure includes required directories",
        "TypeScript is configured with strict mode"
      ]
    }
  ]
}
```

---

## Invocation

This task can be called:

1. **At end of workflow**: Add to final step of any workflow with `output_format: dual`
2. **Standalone**: Call directly with `artifact_path` parameter
3. **Batch**: Process multiple artifacts in a folder

**Parameters:**
- `artifact_path`: Path to the Markdown file to convert
- `schema_path`: (Optional) Override schema path
- `output_path`: (Optional) Override JSON output path
