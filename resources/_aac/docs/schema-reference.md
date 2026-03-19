# BMAD Schema Reference

This document provides detailed reference for all schemas in the BMAD dual-output system.

## Schema Organization

Schemas are organized by module:

| Module | Path | Purpose |
|--------|------|---------|
| **common** | `schemas/common/` | Shared structures used across modules |
| **bmm** | `schemas/bmm/` | Business & Method Module artifacts |
| **tea** | `schemas/tea/` | Test Engineering & Architecture artifacts |
| **cis** | `schemas/cis/` | Creative & Innovation Strategies artifacts |

## Common Schemas

### metadata.schema.json

**Purpose:** Standard metadata for all BMAD artifacts. Referenced by all other schemas.

**Required Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | string | Semver format (e.g., "1.0.0") |
| `artifactType` | string | Type identifier (e.g., "story", "prd") |
| `timestamps` | object | Contains `created`, `lastModified`, `completed` |

**Optional Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `workflowName` | string | Workflow that generated this artifact |
| `workflowVersion` | string | Version of the workflow |
| `projectName` | string | Project name |
| `stepsCompleted` | array | List of completed workflow steps |
| `currentStep` | string | Current step if incomplete |
| `inputDocuments` | array | Source documents used |
| `author` | string | Creator/modifier |
| `status` | enum | draft, in-progress, review, approved, completed, archived |
| `tags` | array | Categorization tags |
| `customFields` | object | Extension point for custom metadata |

**Example:**
```json
{
  "schemaVersion": "1.0.0",
  "artifactType": "story",
  "workflowName": "create-story",
  "projectName": "Widget App",
  "timestamps": {
    "created": "2026-02-16T10:00:00Z",
    "lastModified": "2026-02-16T12:30:00Z"
  },
  "stepsCompleted": ["init", "context", "design"],
  "author": "Jane Doe",
  "status": "completed"
}
```

### user-story.schema.json

**Purpose:** Standard user story format (As a/I want/So that).

**Required Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `asA` | string | The user role/persona |
| `iWant` | string | The desired capability |
| `soThat` | string | The business value/outcome |

### acceptance-criteria.schema.json

**Purpose:** Gherkin-style acceptance criteria (Given/When/Then).

**Required Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `given` | string | Precondition/context |
| `when` | string | Action/trigger |
| `then` | string | Expected outcome |

**Optional Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `and` | array | Additional conditions |

### requirement.schema.json

**Purpose:** Functional and non-functional requirements.

**Required Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique requirement ID |
| `description` | string | Requirement description |
| `type` | enum | functional, non-functional |

**Optional Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `priority` | enum | must-have, should-have, could-have, wont-have |
| `status` | enum | draft, approved, implemented, verified |
| `source` | string | Where requirement came from |
| `rationale` | string | Why this requirement exists |

---

## BMM Schemas (Business & Method Module)

### prd.schema.json

**Purpose:** Product Requirements Document

**Content Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `productName` | string | Yes | Product name |
| `version` | string | Yes | PRD version |
| `overview` | object | Yes | Problem, solution, target users |
| `goals` | array | Yes | Business and product goals |
| `userPersonas` | array | Yes | Target user definitions |
| `requirements` | object | Yes | Functional and non-functional requirements |
| `constraints` | array | No | Technical/business constraints |
| `assumptions` | array | No | Planning assumptions |
| `outOfScope` | array | No | Explicitly excluded features |
| `successMetrics` | array | No | How success is measured |
| `timeline` | object | No | Phases and milestones |

### epics.schema.json

**Purpose:** Epic definitions with user stories

**Content Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `epics` | array | Yes | List of epic objects |

**Epic Object:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Epic ID (e.g., "EPIC-001") |
| `title` | string | Yes | Epic title |
| `description` | string | Yes | Epic description |
| `businessValue` | string | Yes | Why this epic matters |
| `stories` | array | Yes | User stories in this epic |
| `acceptanceCriteria` | array | No | Epic-level acceptance criteria |
| `dependencies` | array | No | Dependencies on other epics |

### story.schema.json

**Purpose:** Individual user story with acceptance criteria

**Content Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `storyId` | string | Yes | Story ID (e.g., "STORY-001") |
| `epicId` | string | No | Parent epic ID |
| `title` | string | Yes | Story title |
| `userStory` | object | Yes | As-a/I-want/So-that |
| `acceptanceCriteria` | array | Yes | Given/When/Then criteria |
| `technicalNotes` | string | No | Implementation guidance |
| `estimatedEffort` | string | No | Story points or time estimate |
| `priority` | enum | No | must-have, should-have, etc. |

### architecture.schema.json

**Purpose:** Architecture decisions and system design

**Content Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `systemOverview` | string | Yes | High-level system description |
| `architectureStyle` | string | Yes | Monolith, microservices, etc. |
| `components` | array | Yes | System components |
| `dataModel` | object | No | Data entities and relationships |
| `integrations` | array | No | External system integrations |
| `securityModel` | object | No | Authentication, authorization |
| `deploymentModel` | object | No | Infrastructure, environments |
| `decisions` | array | No | Architecture Decision Records |

### research.schema.json

**Purpose:** Market, user, and technical research findings

**Content Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `researchType` | enum | Yes | market, user, technical, competitive |
| `topic` | string | Yes | Research topic |
| `methodology` | object | No | Research approach and sources |
| `findings` | array | Yes | Research findings |
| `recommendations` | array | No | Action recommendations |
| `synthesis` | string | No | Summary/conclusion |

**Finding Object:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `category` | string | Yes | Finding category |
| `finding` | string | Yes | The finding itself |
| `evidence` | string | No | Supporting evidence |
| `confidence` | enum | No | high, medium, low |
| `implications` | array | No | Business implications |

---

## TEA Schemas (Test Engineering & Architecture)

### test-design.schema.json

**Purpose:** Test design and strategy document

**Content Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scope` | object | Yes | What is being tested |
| `approach` | string | Yes | Testing approach/strategy |
| `testLevels` | array | Yes | Unit, integration, e2e, etc. |
| `testTypes` | array | Yes | Functional, performance, etc. |
| `coverage` | object | No | Coverage targets and criteria |
| `risks` | array | No | Testing risks |
| `tools` | array | No | Test tools and frameworks |
| `environments` | array | No | Test environments |

### traceability-matrix.schema.json

**Purpose:** Requirements-to-tests traceability

**Content Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `requirements` | array | Yes | Requirements being traced |
| `traces` | array | Yes | Requirement-to-test mappings |
| `coverage` | object | No | Coverage statistics |
| `gaps` | array | No | Untested requirements |

### nfr-assessment.schema.json

**Purpose:** Non-functional requirements assessment

**Content Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assessmentScope` | string | Yes | What is being assessed |
| `categories` | array | Yes | NFR categories assessed |
| `findings` | array | Yes | Assessment findings |
| `scores` | object | No | Category scores |
| `recommendations` | array | No | Improvement recommendations |

---

## CIS Schemas (Creative & Innovation Strategies)

### design-thinking.schema.json

**Purpose:** Design thinking session artifact

**Content Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | string | Yes | The design challenge |
| `empathize` | object | Yes | User research findings |
| `define` | object | Yes | Problem definition |
| `ideate` | array | Yes | Generated ideas |
| `prototype` | object | No | Prototype details |
| `test` | object | No | Testing results |

### problem-solving.schema.json

**Purpose:** Problem solving session artifact

**Content Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `problem` | string | Yes | Problem statement |
| `framework` | string | Yes | Framework used (5 Whys, etc.) |
| `analysis` | object | Yes | Problem analysis |
| `solutions` | array | Yes | Proposed solutions |
| `decision` | object | No | Selected solution |
| `actionPlan` | array | No | Implementation steps |

### storytelling.schema.json

**Purpose:** Crafted narrative using story frameworks

**Content Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Story title |
| `framework` | string | Yes | Framework (Hero's Journey, etc.) |
| `audience` | string | Yes | Target audience |
| `narrative` | object | Yes | Story structure and content |
| `keyMessages` | array | No | Core messages |

---

## Schema Validation Rules

### Required vs Optional

- **Required fields** must be present and non-null
- **Optional fields** can be omitted entirely
- Empty strings `""` and empty arrays `[]` are generally NOT valid for required fields

### Type Validation

| JSON Schema Type | Valid Values |
|------------------|--------------|
| `string` | Any text, optionally with `pattern` regex |
| `integer` | Whole numbers only |
| `number` | Any numeric value |
| `boolean` | `true` or `false` |
| `array` | List of items matching `items` schema |
| `object` | Key-value pairs matching `properties` |
| `null` | Explicit null value |

### Enum Validation

Fields with `enum` constraint only accept specified values:

```json
{
  "priority": {
    "type": "string",
    "enum": ["must-have", "should-have", "could-have", "wont-have"]
  }
}
```

### Pattern Validation

String fields may have `pattern` constraints:

```json
{
  "schemaVersion": {
    "type": "string",
    "pattern": "^\\d+\\.\\d+\\.\\d+$"  // Matches "1.0.0"
  }
}
```

### Additional Properties

Most schemas set `additionalProperties: false` to prevent unexpected fields:

```json
{
  "type": "object",
  "properties": { ... },
  "additionalProperties": false  // Only defined properties allowed
}
```

## Creating New Schemas

1. **Start from a template:**
   ```json
   {
     "$schema": "http://json-schema.org/draft-07/schema#",
     "$id": "https://bmad.dev/schemas/module/new-artifact.schema.json",
     "title": "New Artifact Schema",
     "description": "Description of the artifact",
     "type": "object",
     "required": ["metadata", "content"],
     "properties": {
       "metadata": {
         "$ref": "../common/metadata.schema.json"
       },
       "content": {
         "type": "object",
         "required": ["requiredField1"],
         "properties": {
           // Define content structure
         }
       }
     }
   }
   ```

2. **Register in index.json:**
   ```json
   "module": {
     "new-artifact": {
       "path": "module/new-artifact.schema.json",
       "description": "New artifact description",
       "workflow": "module/workflows/workflow-name"
     }
   }
   ```

3. **Run validation:**
   ```bash
   python scripts/validate_schemas.py
   ```
