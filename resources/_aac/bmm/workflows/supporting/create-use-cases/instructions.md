# Use Case Creation Instructions

## Purpose

Create detailed use cases that describe real-world scenarios showing system behavior. Use cases bridge the gap between abstract requirements and concrete user interactions, making requirements tangible and testable.

## When to Use This Workflow

- After PRD is complete but before epics/stories
- When stakeholders need concrete examples of system behavior
- To validate requirements with business users
- When deriving acceptance criteria for stories
- To document complex user journeys

## Input Artifacts

Review these artifacts to inform use case creation:

1. **PRD** (required) - Extract functional requirements and user needs
2. **Architecture** (if available) - Understand system capabilities
3. **UX Design** (if available) - Understand user flows and interactions
4. **Existing Use Cases** (if any) - Ensure consistency and avoid duplication

## Use Case Structure

Each use case follows this structure:

### Required Elements
- **ID**: Format `UC-XX` (e.g., UC-01, UC-02)
- **Title**: Clear, action-oriented title
- **Summary**: Brief description of what the use case demonstrates
- **Primary Actor**: Who initiates the use case
- **Main Flow**: Numbered steps of the happy path

### Recommended Elements
- **Preconditions**: What must be true before starting
- **Trigger**: Event that initiates the use case
- **Postconditions**: What must be true after completion
- **Alternative Flows**: Variations on the main path
- **Exception Flows**: Error handling paths

### Optional Elements
- **Secondary Actors**: Other participants
- **Business Rules**: Applicable rules
- **Scenario (Before/After)**: Context, before state, after state, impact
- **Related Requirements**: Links to PRD requirements
- **Related Epic/Stories**: Links to implementation artifacts

## Creation Process

### Step 1: Identify Use Cases

1. Review PRD for key user interactions
2. Identify distinct user goals
3. Group related interactions
4. Prioritize by business value

**Questions to Ask:**
- What are the main things users want to accomplish?
- What are the critical business processes?
- Where are the complex decision points?

### Step 2: Define Actors

1. List all user types (roles)
2. Identify external systems that interact
3. Define primary vs secondary actors per use case

### Step 3: Draft Main Flows

For each use case:
1. Start with the trigger event
2. List steps in actor-system exchange format
3. Keep steps at consistent granularity
4. End with the goal achieved

**Format:**
```
1. [Actor] does [action]
2. System [responds/validates/processes]
3. [Actor] [continues/confirms]
...
```

### Step 4: Add Alternative Flows

1. Identify decision points in main flow
2. Document variations (not errors)
3. Reference branch point from main flow

### Step 5: Add Exception Flows

1. Identify potential failures
2. Document system response to each
3. Define recovery or graceful degradation

### Step 6: Add Before/After Scenarios

For key use cases, add context:
- **Context**: The business situation
- **Before**: What happens without the feature (pain point)
- **After**: What happens with the feature (benefit)
- **Impact**: The measurable improvement

## Quality Checklist

Before finalizing each use case:

- [ ] Has unique, meaningful ID
- [ ] Title clearly states the user goal
- [ ] Primary actor is identified
- [ ] Preconditions are verifiable
- [ ] Main flow has 5-12 steps
- [ ] Steps alternate between actor and system
- [ ] Postconditions describe success state
- [ ] Alternative flows cover key variations
- [ ] Exception flows handle likely errors
- [ ] Related to specific PRD requirements

## Output Format

Produce output in dual format:
1. **Markdown** (`use-cases.md`) - Human-readable document
2. **JSON** (`use-cases.json`) - Machine-processable format

### Markdown Structure

```markdown
# Use Cases

## Overview
Brief description of scope and purpose.

## Use Case: UC-01 - [Title]

**Primary Actor:** [Actor]
**Trigger:** [Event]

### Preconditions
- [Condition 1]
- [Condition 2]

### Main Flow
1. [Step 1]
2. [Step 2]
...

### Alternative Flows
#### ALT-1: [Name]
- Branch from step X
- [Steps]

### Exception Flows
#### EXC-1: [Name]
- Trigger: [Error condition]
- Handling: [System response]

### Postconditions
- [Condition 1]

### Before/After Scenario
**Context:** [Situation]
**Before:** [Pain point]
**After:** [Benefit]
**Impact:** [Measurable improvement]

---

## Use Case: UC-02 - [Title]
...
```

## Interaction Style

- Ask clarifying questions about unclear requirements
- Propose use cases based on PRD analysis
- Validate understanding before documenting
- Suggest alternative/exception flows proactively
- Reference specific PRD requirements

## Next Steps After Completion

After use cases are complete:
1. Review with stakeholders for validation
2. Use as input for epic/story creation
3. Derive acceptance criteria from flows
4. Create test cases from use case steps
