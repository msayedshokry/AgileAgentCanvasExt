---
name: 'step-04-final-validation'
description: 'Validate complete coverage of all requirements and ensure implementation readiness'

# Path Definitions
workflow_path: '{bmad-path}/bmm/workflows/3-solutioning/create-epics-and-stories'

# File References
thisStepFile: './step-04-final-validation.md'
workflowFile: '{workflow_path}/workflow.md'
outputFile: '{planning_artifacts}/epics.md'
jsonOutputFile: '{planning_artifacts}/epics.json'

# Schema Reference (for dual output)
schemaFile: '{bmad-path}/schemas/bmm/epics.schema.json'

# Task References
advancedElicitationTask: '{bmad-path}/core/workflows/advanced-elicitation/workflow.xml'
partyModeWorkflow: '{bmad-path}/core/workflows/party-mode/workflow.md'
dualOutputTask: '{bmad-path}/core/tasks/dual-output-json.md'

# Template References
epicsTemplate: '{workflow_path}/templates/epics-template.md'
---

# Step 4: Final Validation

## STEP GOAL:

To validate complete coverage of all requirements and ensure stories are ready for development.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 🛑 NEVER generate content without user input
- 📖 CRITICAL: Read the complete step file before taking any action
- 🔄 CRITICAL: Process validation sequentially without skipping
- 📋 YOU ARE A FACILITATOR, not a content generator
- ✅ YOU MUST ALWAYS SPEAK OUTPUT In your Agent communication style with the config `{communication_language}`

### Role Reinforcement:

- ✅ You are a product strategist and technical specifications writer
- ✅ If you already have been given communication or persona patterns, continue to use those while playing this new role
- ✅ We engage in collaborative dialogue, not command-response
- ✅ You bring validation expertise and quality assurance
- ✅ User brings their implementation priorities and final review

### Step-Specific Rules:

- 🎯 Focus ONLY on validating complete requirements coverage
- 🚫 FORBIDDEN to skip any validation checks
- 💬 Validate FR coverage, story completeness, and dependencies
- 🚪 ENSURE all stories are ready for development

## EXECUTION PROTOCOLS:

- 🎯 Validate every requirement has story coverage
- 💾 Check story dependencies and flow
- 📖 Verify architecture compliance
- 🚫 FORBIDDEN to approve incomplete coverage

## CONTEXT BOUNDARIES:

- Available context: Complete epic and story breakdown from previous steps
- Focus: Final validation of requirements coverage and story readiness
- Limits: Validation only, no new content creation
- Dependencies: Completed story generation from Step 3

## VALIDATION PROCESS:

### 1. FR Coverage Validation

Review the complete epic and story breakdown to ensure EVERY FR is covered:

**CRITICAL CHECK:**

- Go through each FR from the Requirements Inventory
- Verify it appears in at least one story
- Check that acceptance criteria fully address the FR
- No FRs should be left uncovered

### 2. Architecture Implementation Validation

**Check for Starter Template Setup:**

- Does Architecture document specify a starter template?
- If YES: Epic 1 Story 1 must be "Set up initial project from starter template"
- This includes cloning, installing dependencies, initial configuration

**Database/Entity Creation Validation:**

- Are database tables/entities created ONLY when needed by stories?
- ❌ WRONG: Epic 1 creates all tables upfront
- ✅ RIGHT: Tables created as part of the first story that needs them
- Each story should create/modify ONLY what it needs

### 3. Story Quality Validation

**Each story must:**

- Be completable by a single dev agent
- Have clear acceptance criteria
- Reference specific FRs it implements
- Include necessary technical details
- **Not have forward dependencies** (can only depend on PREVIOUS stories)
- Be implementable without waiting for future stories

### 4. Epic Structure Validation

**Check that:**

- Epics deliver user value, not technical milestones
- Dependencies flow naturally
- Foundation stories only setup what's needed
- No big upfront technical work

### 5. Dependency Validation (CRITICAL)

**Epic Independence Check:**

- Does each epic deliver COMPLETE functionality for its domain?
- Can Epic 2 function without Epic 3 being implemented?
- Can Epic 3 function standalone using Epic 1 & 2 outputs?
- ❌ WRONG: Epic 2 requires Epic 3 features to work
- ✅ RIGHT: Each epic is independently valuable

**Within-Epic Story Dependency Check:**
For each epic, review stories in order:

- Can Story N.1 be completed without Stories N.2, N.3, etc.?
- Can Story N.2 be completed using only Story N.1 output?
- Can Story N.3 be completed using only Stories N.1 & N.2 outputs?
- ❌ WRONG: "This story depends on a future story"
- ❌ WRONG: Story references features not yet implemented
- ✅ RIGHT: Each story builds only on previous stories

### 6. Complete and Save

If all validations pass:

- Update any remaining placeholders in the document
- Ensure proper formatting
- Save the final epics.md

### 7. Generate Dual Output (JSON)

**This workflow uses dual output format.** After saving the Markdown, generate the JSON version.

**Read the schema file:** `{schemaFile}`

**CRITICAL CONVERSION RULES - Do NOT summarize or truncate:**

#### User Stories - MUST use separated fields:

❌ **WRONG:**
```json
"userStory": "As a developer, I want to parse files, So that I can extract data."
```

✅ **CORRECT:**
```json
"userStory": {
  "asA": "developer",
  "iWant": "to parse files",
  "soThat": "I can extract data"
}
```

#### Acceptance Criteria - MUST include full Given/When/Then text:

❌ **WRONG:**
```json
"acceptanceCriteriaCount": 7
```

✅ **CORRECT:**
```json
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
```

#### Requirements - MUST include full descriptions:

❌ **WRONG:**
```json
"functionalRequirements": ["FR 1.1", "FR 1.2"]
```

✅ **CORRECT:**
```json
"requirements": {
  "functional": [
    {
      "id": "FR 1.1",
      "title": "Parse BMAD Markdown Files",
      "description": "System reads epic and story markdown files from a specified folder, extracts metadata (ID, title, status, dependencies, assignees), and loads complete content into memory without requiring database",
      "capabilityArea": "File Parsing & Data Ingestion"
    }
  ]
}
```

**JSON Structure for epics.json:**

```json
{
  "$schema": "../../_bmad/schemas/bmm/epics.schema.json",
  "metadata": {
    "schemaVersion": "1.0.0",
    "artifactType": "epics",
    "workflowName": "create-epics-and-stories",
    "projectName": "<from document>",
    "stepsCompleted": [1, 2, 3, 4],
    "timestamps": {
      "created": "<original>",
      "lastModified": "<now>",
      "completed": "<now>"
    },
    "author": "<user_name>",
    "status": "completed"
  },
  "content": {
    "title": "<Project Name> Epics",
    "overview": {
      "projectName": "<name>",
      "description": "<from overview section>",
      "totalEpics": <count>,
      "totalStories": <count>
    },
    "requirements": {
      "functional": [
        {
          "id": "FR 1.1",
          "title": "...",
          "description": "FULL description text - do NOT truncate",
          "capabilityArea": "..."
        }
      ],
      "nonFunctional": [...],
      "additional": [...]
    },
    "epics": [
      {
        "epicId": "1",
        "title": "...",
        "goal": "COMPLETE goal text",
        "valueDelivered": "COMPLETE value text",
        "requirements": {
          "functional": [...with full detail...],
          "nonFunctional": [...],
          "additional": [...]
        },
        "implementationNotes": "COMPLETE notes",
        "stories": [
          {
            "storyId": "1.1",
            "title": "...",
            "userStory": {
              "asA": "...",
              "iWant": "...",
              "soThat": "..."
            },
            "acceptanceCriteria": [
              {
                "id": "AC-1",
                "given": "FULL given text",
                "when": "FULL when text",
                "then": "FULL then text",
                "and": ["FULL and text 1", "FULL and text 2"]
              }
            ],
            "dependencies": [...],
            "priority": "P0"
          }
        ]
      }
    ]
  }
}
```

**Save to:** `{jsonOutputFile}`

**Validation Checklist:**
- [ ] All user stories have `asA`, `iWant`, `soThat` as separate fields
- [ ] All acceptance criteria have full `given`, `when`, `then` text
- [ ] All requirements have complete `description` text
- [ ] No counts instead of actual content
- [ ] JSON is valid and parseable

**Present Final Menu:**
**All validations complete!** [C] Complete Workflow

When C is selected, the workflow is complete and the epics.md is ready for development.

Epics and Stories complete. Read fully and follow: `{bmad-path}/core/tasks/help.md`

Upon Completion of task output: offer to answer any questions about the Epics and Stories.
