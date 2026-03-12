---
name: 'step-dual-output'
description: 'Generate JSON output from completed Markdown artifact using schema-driven verbose conversion'

# This step can be inserted at the end of any workflow that has output_format: dual
# It reads the workflow configuration to find schema_file and template_json

# File References (resolved from parent workflow)
schemaFile: '{schema_file}'
templateFile: '{template_json}'
markdownOutput: '{outputFile}'
jsonOutput: '{outputFile.replace(".md", ".json")}'

# Task Reference
dualOutputTask: '{bmad-path}/core/tasks/dual-output-json.md'
---

# Step: Generate Dual Output (JSON)

## STEP GOAL:

Convert the completed Markdown artifact to verbose JSON format using the schema definition.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 📖 CRITICAL: Read the schema file completely before conversion
- 🔄 CRITICAL: Capture ALL content - do NOT summarize or truncate
- 📋 Follow schema structure exactly for field names and nesting
- ✅ Validate JSON output against schema requirements

### Verbose Output Rules:

- 🚫 **FORBIDDEN**: Counting items instead of including them (e.g., `"acceptanceCriteriaCount": 7`)
- 🚫 **FORBIDDEN**: Combining user story fields into single string
- 🚫 **FORBIDDEN**: Omitting requirement descriptions
- 🚫 **FORBIDDEN**: Summarizing or paraphrasing source content
- ✅ **REQUIRED**: Separate `asA`, `iWant`, `soThat` fields for user stories
- ✅ **REQUIRED**: Full `given`, `when`, `then`, `and` arrays for acceptance criteria
- ✅ **REQUIRED**: Complete requirement text with descriptions

---

## EXECUTION SEQUENCE:

### 1. Load Schema Definition

Read the schema file specified in the workflow configuration:

```
Schema: {schemaFile}
```

**Extract from schema:**
- Required fields in `metadata` and `content`
- Field types (string, array, object, etc.)
- Nested structures (e.g., `userStory.asA`, `acceptanceCriteria[].given`)
- Field descriptions explaining expected content

### 2. Read Source Markdown

Load the completed Markdown artifact:

```
Source: {markdownOutput}
```

**Identify content to extract:**
- YAML frontmatter (metadata)
- Section headers and content
- User stories (As a.../I want.../So that...)
- Acceptance criteria (Given/When/Then)
- Requirements lists with descriptions
- Implementation notes
- All structured content

### 3. Transform to JSON Structure

#### 3.1 Build Metadata Object

```json
{
  "metadata": {
    "schemaVersion": "1.0.0",
    "artifactType": "<from schema $id>",
    "workflowName": "<from workflow.md frontmatter>",
    "projectName": "<from source frontmatter or content>",
    "stepsCompleted": ["step-01", "step-02", "step-03", "step-04", "step-dual-output"],
    "timestamps": {
      "created": "<original timestamp>",
      "lastModified": "<current ISO timestamp>",
      "completed": "<current ISO timestamp>"
    },
    "author": "<from config.yaml user_name>",
    "status": "completed"
  }
}
```

#### 3.2 Build Content Object

**User Story Extraction:**

Source text:
```
As a developer,
I want to set up a project with proper configuration,
So that I have a solid foundation.
```

Target JSON:
```json
"userStory": {
  "asA": "developer",
  "iWant": "to set up a project with proper configuration",
  "soThat": "I have a solid foundation"
}
```

**Acceptance Criteria Extraction:**

Source text:
```
**Given** I am starting a new project
**When** I run the initialization command
**Then** the project is created successfully
**And** the structure includes all directories
**And** configuration is applied
```

Target JSON:
```json
"acceptanceCriteria": [
  {
    "id": "AC-1",
    "given": "I am starting a new project",
    "when": "I run the initialization command",
    "then": "the project is created successfully",
    "and": [
      "the structure includes all directories",
      "configuration is applied"
    ]
  }
]
```

**Requirement Extraction:**

Source text:
```
- **FR 1.1: Parse BMAD Markdown Files** - System reads epic and story markdown files from a specified folder, extracts metadata...
```

Target JSON:
```json
{
  "id": "FR 1.1",
  "title": "Parse BMAD Markdown Files",
  "description": "System reads epic and story markdown files from a specified folder, extracts metadata...",
  "capabilityArea": "File Parsing & Data Ingestion"
}
```

### 4. Write JSON Output

Save to: `{jsonOutput}`

**Structure:**
```json
{
  "$schema": "<relative path to schema>",
  "metadata": { ... },
  "content": { ... }
}
```

### 5. Validate Output

**Checklist:**

- [ ] JSON is syntactically valid (parseable)
- [ ] All required schema fields are present
- [ ] `userStory` has separated `asA`/`iWant`/`soThat` fields
- [ ] `acceptanceCriteria` array has full `given`/`when`/`then` for each AC
- [ ] Requirements have `id`, `title`, AND `description`
- [ ] No content was summarized or truncated
- [ ] No placeholder values remain (except empty arrays `[]`)

### 6. Report Completion

**Display to user:**

```
✅ Dual Output Complete

Markdown: {markdownOutput}
JSON: {jsonOutput}

JSON contains:
- {X} epics with full detail
- {Y} stories with separated user story fields
- {Z} acceptance criteria with complete Given/When/Then
- {N} requirements with full descriptions

Schema validation: ✅ Passed
```

---

## FIELD MAPPING REFERENCE

### Common Patterns

| Markdown Pattern | JSON Field | Notes |
|-----------------|------------|-------|
| `As a [role]` | `userStory.asA` | Just the role, no "As a" |
| `I want [capability]` | `userStory.iWant` | Just the capability, no "I want" |
| `So that [benefit]` | `userStory.soThat` | Just the benefit, no "So that" |
| `**Given** [text]` | `acceptanceCriteria[].given` | Full text after Given |
| `**When** [text]` | `acceptanceCriteria[].when` | Full text after When |
| `**Then** [text]` | `acceptanceCriteria[].then` | Full text after Then |
| `**And** [text]` | `acceptanceCriteria[].and[]` | Array of all And clauses |
| `**FR X.X: Title** - Description` | `requirements.functional[]` | Parse ID, title, description |
| `**NFR X.X: Title** - Description` | `requirements.nonFunctional[]` | Include dimension field |

### Epic-Specific Fields

| Markdown Section | JSON Path |
|-----------------|-----------|
| Epic title | `epics[].title` |
| Epic goal | `epics[].goal` |
| Value Delivered | `epics[].valueDelivered` |
| FR Covered | `epics[].requirements.functional[]` |
| NFR Covered | `epics[].requirements.nonFunctional[]` |
| Implementation Notes | `epics[].implementationNotes` |
| Stories | `epics[].stories[]` |

---

## ERROR HANDLING

If conversion encounters issues:

1. **Missing required field**: Add with empty value, note in validation
2. **Ambiguous user story format**: Include `formatted` field with original text
3. **Complex AC structure**: Preserve as much structure as possible
4. **Parse errors**: Log warning, continue with partial data

---

## COMPLETION

When JSON output is written and validated:

**Present to user:**

"Dual output generation complete. Both Markdown and JSON artifacts are now available."

**Options:**
- [V] View JSON output
- [D] Download both files
- [C] Continue to next workflow step
