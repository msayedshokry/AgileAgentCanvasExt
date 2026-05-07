# Frontmatter Standards

**Purpose:** Variables, paths, and frontmatter rules for workflow steps.

---

## Golden Rules

1. **Only variables USED in the step** may be in frontmatter
2. **All file references MUST use `{variable}` format** - no hardcoded paths
3. **Paths within workflow folder MUST be relative** - NO `workflow_path` variable allowed

---

## Standard Variables

| Variable | Example |
|----------|---------|
| `{project-root}` | `/Users/user/dev/BMAD-METHOD` <!-- validate-file-refs:ignore --> |
| `{project_name}` | `my-project` |
| `{output_folder}` | `/Users/user/dev/BMAD-METHOD/output` <!-- validate-file-refs:ignore --> |
| `{user_name}` | `Brian` |
| `{communication_language}` | `english` |
| `{document_output_language}` | `english` |

---

## Module-Specific Variables

Workflows in a MODULE can access additional variables from its `module.yaml`.

**Example:**
```yaml
bmb_creations_output_folder: '{bmad-path}/bmb-creations'
```

**Standalone workflows:** Only have access to standard variables.

---

## Frontmatter Structure

### Required Fields
```yaml
---
name: 'step-[N]-[name]'
description: '[what this step does]'
---
```

### File References - ONLY variables used in this step
```yaml
---
# Step to step (SAME folder) - use ./filename.md
nextStepFile: './step-02-vision.md'

# Step to template (PARENT folder) - use ../filename.md
productBriefTemplate: '../product-brief.template.md'

# Step to data (SUBFOLDER) - use ./data/filename.md
someData: './data/config.csv'

# Output files - use variable
outputFile: '{planning_artifacts}/product-brief-{{project_name}}-{{date}}.md'

# External references - use {project-root}
advancedElicitationTask: '{bmad-path}/core/workflows/advanced-elicitation/workflow.xml'
---
```

---

## Critical Rule: Unused Variables Forbidden

**Detection Rule:** For EVERY variable in frontmatter, search the step body for `{variableName}`. If not found, it's a violation.

### ❌ VIOLATION
```yaml
---
outputFile: '{output_folder}/output.md'
thisStepFile: './step-01-init.md'      # ❌ NEVER USED
workflowFile: './workflow.md'           # ❌ NEVER USED
---
```

### ✅ CORRECT
```yaml
---
outputFile: '{output_folder}/output.md'
nextStepFile: './step-02-foo.md'
---
```

---

## Path Rules

| Type | Format | Example |
|------|--------|---------|
| Step to Step (same folder) | `./filename.md` | `./step-02-vision.md` |
| Step to Template (parent) | `../filename.md` | `../template.md` |
| Step to Subfolder | `./subfolder/file.md` | `./data/config.csv` |
| External References | `{project-root}/...` | `{bmad-path}/core/workflows/...` |
| Output Files | `{folder_variable}/...` | `{planning_artifacts}/output.md` |

---

## ❌ FORBIDDEN Patterns

| Pattern | Why |
|---------|-----|
| `workflow_path: '{project-root}/...'` | Use relative paths |
| `thisStepFile: './step-XX.md'` | Remove unless referenced <!-- validate-file-refs:ignore --> |
| `workflowFile: './workflow.md'` | Remove unless referenced <!-- validate-file-refs:ignore --> |
| `{workflow_path}/templates/...` | Use `../template.md` |
| `{workflow_path}/data/...` | Use `./data/file.md` |

---

## Variable Naming

Use `snake_case` with descriptive prefixes:

| Suffix | Usage | Example |
|--------|-------|---------|
| `*_File` | File references | `outputFile`, `nextStepFile` |
| `*_Task` | Task references | `advancedElicitationTask` |
| `*_Workflow` | Workflow references | `partyModeWorkflow` |
| `*_Template` | Templates | `productBriefTemplate` |
| `*_Data` | Data files | `dietaryData` |

---

## Defining New Variables

Steps can define NEW variables for future steps.

**Step 01 defines:**
```yaml
---
targetWorkflowPath: '{bmb_creations_output_folder}/workflows/{workflow_name}'
---
```

**Step 02 uses:**
```yaml
---
targetWorkflowPath: '{bmb_creations_output_folder}/workflows/{workflow_name}'
workflowPlanFile: '{targetWorkflowPath}/plan.md'
---
```

---

## Continuable Workflow Frontmatter

```yaml
---
stepsCompleted: ['step-01-init', 'step-02-gather', 'step-03-design']
lastStep: 'step-03-design'
lastContinued: '2025-01-02'
date: '2025-01-01'
---
```

**Step tracking:** Each step appends its NAME to `stepsCompleted`.

---

## Validation Checklist

For EVERY step frontmatter, verify:

- [ ] `name` present, kebab-case format
- [ ] `description` present
- [ ] Extract ALL variable names from frontmatter
- [ ] For EACH variable, search body: is `{variableName}` present?
- [ ] If variable NOT in body → ❌ VIOLATION, remove from frontmatter
- [ ] All step-to-step paths use `./filename.md` format
- [ ] All parent-folder paths use `../filename.md` format
- [ ] All subfolder paths use `./subfolder/filename.md` format
- [ ] NO `{workflow_path}` variable exists
- [ ] External paths use `{project-root}` variable
- [ ] Module variables only used if workflow belongs to that module

---

## JSON Metadata Structure

For JSON artifacts, frontmatter is replaced by a top-level `metadata` object.

### Metadata Object Schema

```json
{
  "metadata": {
    "workflowName": "create-product-brief",
    "artifactType": "product-brief",
    "version": "1.0.0",
    "createdAt": "2025-02-16T10:30:00Z",
    "updatedAt": "2025-02-16T14:45:00Z",
    "status": "in_progress",
    "stepsCompleted": ["step-01-init", "step-02-vision"],
    "currentStep": "step-03-features",
    "author": "Brian",
    "projectName": "my-project",
    "tags": ["mvp", "web-app"]
  }
}
```

### Required Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `workflowName` | string | Workflow that created this artifact |
| `artifactType` | string | Type identifier (matches schema name) |
| `version` | string | Semantic version of the artifact |
| `createdAt` | string | ISO-8601 creation timestamp |
| `updatedAt` | string | ISO-8601 last update timestamp |
| `status` | enum | `draft`, `in_progress`, `review`, `approved`, `archived` |
| `projectName` | string | Project identifier |

### Optional Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `stepsCompleted` | array | List of completed step names |
| `currentStep` | string | Currently active step |
| `author` | string | Creator name |
| `tags` | array | Classification tags |
| `dependencies` | array | Related artifact references |
| `approvedBy` | string | Approver name (when status=approved) |
| `approvedAt` | string | ISO-8601 approval timestamp |

### Status Transitions

```
draft → in_progress → review → approved → archived
  ↑                      │
  └──────────────────────┘  (revisions)
```

### Mapping YAML Frontmatter to JSON Metadata

| YAML Frontmatter | JSON Metadata |
|------------------|---------------|
| `stepsCompleted: []` | `metadata.stepsCompleted: []` |
| `lastStep: ''` | `metadata.currentStep: ''` |
| `date: ''` | `metadata.createdAt: ''` |
| `user_name: ''` | `metadata.author: ''` |
| `status: PLANNING` | `metadata.status: 'in_progress'` |

### Dual Output Metadata Sync

When outputting both JSON and Markdown:

1. **JSON is authoritative** - all metadata lives in JSON `metadata` object
2. **Markdown mirrors JSON** - generate YAML frontmatter from JSON metadata
3. **Updates go to JSON first** - then regenerate Markdown

```yaml
# Generated Markdown frontmatter (from JSON)
---
workflowName: create-product-brief
status: in_progress
stepsCompleted:
  - step-01-init
  - step-02-vision
updatedAt: '2025-02-16T14:45:00Z'
---
```

### Step Updates to Metadata

Each workflow step MUST update metadata:

```json
// Before step execution
{
  "metadata": {
    "status": "in_progress",
    "stepsCompleted": ["step-01-init"],
    "currentStep": "step-02-vision"
  }
}

// After step completion
{
  "metadata": {
    "status": "in_progress",
    "stepsCompleted": ["step-01-init", "step-02-vision"],
    "currentStep": "step-03-features",
    "updatedAt": "2025-02-16T15:00:00Z"
  }
}
```
