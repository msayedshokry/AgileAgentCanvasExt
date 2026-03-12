---
title: "Use Cases"
project: "{project_name}"
version: "1.0"
date: "{date}"
status: "draft"
output_format: dual
schema: "bmm/use-case.schema.json"
---

# Use Cases

## Overview

This document defines detailed use cases for {project_name}, describing real-world scenarios that show system behavior through user interactions.

**Scope:** [Define scope of use cases covered]

**Related Documents:**
- PRD: [link]
- Architecture: [link]
- UX Design: [link]

---

## Use Case: UC-01 - [Title]

**ID:** UC-01
**Title:** [Clear, action-oriented title]
**Summary:** [Brief description of what this use case demonstrates]

### Actors
- **Primary Actor:** [Who initiates this]
- **Secondary Actors:** [Other participants, if any]

### Trigger
[Event or action that initiates this use case]

### Preconditions
- [ ] [Condition that must be true before starting]
- [ ] [Another precondition]

### Main Flow

| Step | Actor | Action |
|------|-------|--------|
| 1 | [Actor] | [Does something] |
| 2 | System | [Responds/validates] |
| 3 | [Actor] | [Continues] |
| 4 | System | [Processes] |
| 5 | [Actor] | [Confirms/completes] |

### Alternative Flows

#### ALT-1: [Alternative Name]
- **Branch Point:** Step [X]
- **Condition:** [When this applies]
- **Steps:**
  1. [Alternative step]
  2. [Continues...]
- **Rejoins:** Step [Y] or ends

### Exception Flows

#### EXC-1: [Exception Name]
- **Trigger:** [Error condition]
- **Handling:** [How system responds]
- **Recovery:** [How user can recover]

### Postconditions
- [ ] [What must be true after successful completion]
- [ ] [System state changes]

### Before/After Scenario

| Aspect | Description |
|--------|-------------|
| **Context** | [The business situation] |
| **Before** | [What happens WITHOUT this feature - the pain] |
| **After** | [What happens WITH this feature - the benefit] |
| **Impact** | [Measurable improvement] |

### Related Artifacts
- **Requirements:** [REQ-XX, REQ-YY]
- **Epic:** [EPIC-XX]
- **Stories:** [STORY-XX, STORY-YY]

---

## Use Case: UC-02 - [Title]

[Repeat structure for additional use cases]

---

## Summary

| UC ID | Title | Primary Actor | Priority |
|-------|-------|---------------|----------|
| UC-01 | [Title] | [Actor] | [High/Medium/Low] |
| UC-02 | [Title] | [Actor] | [Priority] |

## Appendix

### Actor Definitions

| Actor | Description | Permissions |
|-------|-------------|-------------|
| [Actor 1] | [Description] | [What they can do] |
| [Actor 2] | [Description] | [What they can do] |

### Business Rules Referenced

| Rule ID | Rule | Applies To |
|---------|------|------------|
| BR-01 | [Rule description] | UC-01, UC-03 |
