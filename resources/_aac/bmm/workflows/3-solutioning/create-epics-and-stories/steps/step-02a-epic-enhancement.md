---
name: 'step-02a-epic-enhancement'
description: 'Interactive guided enhancement of epics with verbose enterprise-level detail: Use Cases, Fit Criteria, Success Metrics, Risks, and Definition of Done'

# Path Definitions
workflow_path: '{bmad-path}/bmm/workflows/3-solutioning/create-epics-and-stories'

# File References
thisStepFile: './step-02a-epic-enhancement.md'
returnToStep: './step-02-design-epics.md'
outputFile: '{planning_artifacts}/epics.md'

# Schema References (for structure guidance)
useCaseSchema: '{bmad-path}/schemas/bmm/use-case.schema.json'
fitCriteriaSchema: '{bmad-path}/schemas/bmm/fit-criteria.schema.json'
successMetricsSchema: '{bmad-path}/schemas/bmm/success-metrics.schema.json'
risksSchema: '{bmad-path}/schemas/bmm/risks.schema.json'
definitionOfDoneSchema: '{bmad-path}/schemas/bmm/definition-of-done.schema.json'
---

# Step 2a: Epic Enhancement (Verbose Mode)

## STEP GOAL:

Interactively enhance epics with enterprise-level detail through guided conversation. This produces JIRA-ready epics with comprehensive documentation including Use Cases, Fit Criteria, Success Metrics, Risks & Mitigations, and Definition of Done.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 🛑 NEVER generate content without user input or confirmation
- 📖 CRITICAL: This is an INTERACTIVE process - ask questions, get answers, refine
- 🔄 CRITICAL: Process ONE epic at a time for focused enhancement
- 📋 YOU ARE A FACILITATOR guiding the user through enhancement
- ✅ YOU MUST ALWAYS SPEAK OUTPUT in your Agent communication style with the config `{communication_language}`

### Role Reinforcement:

- ✅ You are a senior business analyst eliciting detailed specifications
- ✅ Channel the analyst persona - excited about discovering requirements, thorough in exploration
- ✅ Ask probing questions to extract implicit knowledge
- ✅ Search the codebase when helpful to understand current implementation
- ✅ Propose content based on context, but always confirm with user

### Step-Specific Rules:

- 🎯 Focus on ONE enhancement type at a time
- 🚫 FORBIDDEN to generate all content without interaction
- 💬 Use conversational elicitation techniques
- 🔍 Reference requirements and architecture documents for context
- ✅ Confirm each section with user before moving to next

---

## ENHANCEMENT PROCESS

### 1. Display Enhancement Menu

Present the following menu:

```
## Epic Enhancement Options

Select which aspects to enhance for your epics:

[U] Use Cases - Real-world scenarios with Before/After states
[F] Fit Criteria - Testable functional, non-functional, security checklists  
[M] Success Metrics - Quantifiable code quality, operational, customer impact metrics
[R] Risks & Mitigations - Risk identification, impact analysis, mitigation strategies
[D] Definition of Done - Completion checklist and quality gates
[T] Technical Summary - Architecture pattern, components, files, configuration
[A] ALL - Full enhancement (all of the above)
[S] Select Specific Epic - Choose which epic to enhance
[X] Exit - Return to epic design menu
```

Wait for user selection before proceeding.

---

### 2. Epic Selection

If user hasn't selected a specific epic, ask:

"Which epic would you like to enhance? Please select by number or title:"

List all epics from {outputFile} with their titles.

**Processing Rule:** Enhance one epic at a time. After completing one epic, ask if user wants to enhance another.

---

### 3. Use Case Elicitation [U]

**Goal:** Create 3-7 real-world use cases that demonstrate the epic's value.

**Elicitation Process:**

1. **Context Gathering:**
   - "What are the main scenarios where users will interact with this feature?"
   - "What problems does this epic solve? Can you describe a typical situation?"
   - "Are there edge cases or unusual situations we should document?"

2. **Before/After Analysis:**
   For each identified scenario:
   - "What happens TODAY (without this feature) in this scenario?"
   - "What will happen AFTER this epic is implemented?"
   - "What's the measurable impact or benefit?"

3. **Use Case Structure:**
   Generate each use case with:
   ```
   ### Use Case N: [Descriptive Title]
   [Context: The situation this addresses]
   **Without [Feature]:** [Current pain point or limitation]
   **With [Feature]:** [Improved experience]
   **Impact:** [Benefit achieved]
   ```

4. **Confirmation:**
   Present all use cases and ask:
   - "Do these use cases capture the key scenarios?"
   - "Should we add, remove, or modify any?"
   - "Are the before/after descriptions accurate?"

---

### 4. Fit Criteria Generation [F]

**Goal:** Create testable acceptance criteria organized by category.

**Elicitation Process:**

1. **Functional Fit Criteria:**
   - Review the epic's requirements (FRs covered)
   - "What specific behaviors MUST the system exhibit?"
   - "What are the exact file paths, method names, or configurations?"
   - Generate checklist items with `- [ ]` format

2. **Non-Functional Fit Criteria:**
   - Review NFRs related to this epic
   - "What performance targets must be met? (latency, throughput)"
   - "What reliability/resilience requirements exist?"
   - "What backward compatibility constraints apply?"
   - Include specific metrics (e.g., "< 10ms", "> 80% coverage")

3. **Security & Compliance Fit Criteria:**
   - "Are there security requirements? (data protection, access control)"
   - "Are there compliance standards to meet? (HIPAA, GDPR, SOC2)"
   - "What audit/logging requirements exist?"

4. **Format:**
   ```
   ## Fit Criteria
   
   ### Functional Fit
   - [ ] [Specific testable criterion with details]
   - [ ] [Another criterion]
   
   ### Non-Functional Fit
   - [ ] [Performance criterion with metric]
   - [ ] [Reliability criterion]
   
   ### Security & Compliance
   - [ ] [Security criterion]
   - [ ] [Compliance criterion]
   ```

5. **Confirmation:**
   "Review these fit criteria - are they specific enough to be tested? Any missing?"

---

### 5. Success Metrics Definition [M]

**Goal:** Define measurable success criteria across multiple dimensions.

**Elicitation Process:**

1. **Code Quality Metrics:**
   - "What code improvements should this epic achieve?"
   - "Will this reduce duplication, complexity, or technical debt?"
   - Example: "Zero duplication of retry logic across codebase"

2. **Operational Metrics:**
   - "What operational improvements are expected?"
   - "Target availability, latency, throughput?"
   - "Resource usage reduction?"
   - Example: "Policy availability: 99.9%", "API request reduction: 50%+"

3. **Customer Impact Metrics:**
   - "How will users/customers benefit?"
   - "What user experience improvements?"
   - "What new capabilities are enabled?"
   - Example: "Faster startup time", "Works during network outages"

4. **Deployment Metrics:**
   - "What deployment characteristics matter?"
   - "Breaking changes, rollback capability?"
   - Example: "Zero breaking changes for existing installations"

5. **Format:**
   ```
   ## Success Metrics
   
   **Code Quality:**
   - [Metric with target]
   
   **Operational:**
   - [Metric with specific target value]
   
   **Customer Impact:**
   - [User-facing improvement]
   
   **Deployment:**
   - [Deployment characteristic]
   ```

---

### 6. Risk Assessment [R]

**Goal:** Identify risks and document mitigation strategies.

**Elicitation Process:**

1. **Risk Identification:**
   - "What could go wrong during implementation?"
   - "What technical risks exist? (complexity, unknowns)"
   - "What integration risks? (dependencies, breaking changes)"
   - "What operational risks? (performance, reliability)"

2. **For Each Risk, Elicit:**
   - Impact level (Low/Medium/High/Critical)
   - Mitigation strategy
   - Contingency plan if risk materializes

3. **Dependency Risks:**
   - "What upstream dependencies exist? (things you need)"
   - "What downstream impacts? (things that depend on this)"
   - "What related work should be coordinated?"

4. **Format (Table):**
   ```
   ## Risks & Mitigations
   
   | Risk | Impact | Mitigation |
   |------|--------|------------|
   | [Risk description] | [Level] | [Strategy] |
   
   ## Dependencies
   
   **Upstream:** [What this depends on]
   **Downstream:** [What depends on this]
   ```

---

### 7. Definition of Done Generation [D]

**Goal:** Create completion checklist ensuring quality and completeness.

**Elicitation Process:**

1. **Standard DoD Items:**
   Propose standard items based on project context:
   - Code peer reviewed (N approvals)
   - Unit tests passing (coverage target)
   - Integration tests passing
   - Performance benchmarks met
   - Documentation updated
   - Merged to main branch
   - Release notes prepared

2. **Epic-Specific Items:**
   - "What specific validations are needed for THIS epic?"
   - "What documentation must be updated?"
   - "What deployment steps are required?"

3. **Format:**
   ```
   ## Definition of Done
   
   - [ ] Code peer reviewed (2 approvals minimum)
   - [ ] All unit tests passing (coverage > 80%)
   - [ ] Integration tests passing
   - [ ] [Epic-specific item]
   - [ ] Merged to main branch
   - [ ] No technical debt introduced
   ```

---

### 8. Technical Summary Generation [T]

**Goal:** Document the technical implementation approach.

**Elicitation Process:**

1. **Architecture Pattern:**
   - "What's the high-level architecture approach?"
   - "What design patterns are being used?"

2. **Component Changes:**
   - "What components are involved?"
   - "What are their responsibilities?"
   - Search codebase if helpful to identify actual file paths

3. **Files Changed/Created:**
   - "What new files will be created?"
   - "What existing files will be modified?"

4. **Configuration:**
   - "What configuration changes are needed?"
   - "What settings/options are introduced?"

5. **Format:**
   ```
   ## Technical Implementation Summary
   
   ### Architecture Pattern: [Name]
   [Description of the pattern and how components interact]
   
   ### Components:
   **[Component 1]:** [Responsibility]
   **[Component 2]:** [Responsibility]
   
   ### Files Changed/Created
   **New:**
   - `path/to/new/file.ext`
   
   **Modified:**
   - `path/to/existing/file.ext` (description of changes)
   
   ### Configuration
   ```config
   [Example configuration]
   ```
   ```

---

### 9. Full Enhancement [A]

If user selects [A] ALL, process each section in sequence:
1. Use Cases → Confirm
2. Fit Criteria → Confirm
3. Success Metrics → Confirm
4. Risks & Mitigations → Confirm
5. Definition of Done → Confirm
6. Technical Summary → Confirm

After each section, get user confirmation before proceeding to next.

---

### 10. Save and Continue

After enhancement is complete:

1. **Update {outputFile}** with all enhanced content for the epic in markdown
2. **Write separate JSON files:**
   - Use Cases → `epics/epic-{N}/use-cases.json` (artifactType: `use-cases`, metadata.epicId: epic number)
   - Test Strategy → `epics/epic-{N}/tests/test-strategy.json` (artifactType: `epic-test-strategy`, metadata.epicId: epic number)
3. **Do NOT embed** useCases or testStrategy inside `epic.json` — this causes data loss
4. **Display Summary:** Show what was added
5. **Ask:** "Would you like to enhance another epic, or return to the design menu?"

If enhance another: Return to [Epic Selection](#2-epic-selection)
If return: Read fully and follow: {returnToStep}

---

## OUTPUT FORMAT

Enhanced epic sections should be appended to the epic in {outputFile} using this structure:

```markdown
## Epic N: [Title]

[Original epic content - goal, FRs covered, etc.]

---

### Use Cases

[Use case content]

---

### Fit Criteria

[Fit criteria checklists]

---

### Success Metrics

[Success metrics by category]

---

### Dependencies

[Upstream/downstream dependencies]

---

### Risks & Mitigations

[Risk table]

---

### Technical Implementation Summary

[Technical details]

---

### Definition of Done

[DoD checklist]

---

### Acceptance Summary

✅ **Epic Complete When:**
[Summary of completion criteria]

---

[Stories follow...]
```

---

## ELICITATION TIPS

### Probing Questions:
- "Can you tell me more about...?"
- "What happens if...?"
- "How would you measure success for...?"
- "What's the worst case scenario?"
- "Who else is affected by this?"

### When User is Uncertain:
- Search the codebase to understand current implementation
- Reference the PRD/Architecture documents
- Propose reasonable defaults based on context
- "Based on the architecture, I'd suggest... Does that sound right?"

### Iterative Refinement:
- Present draft content
- Ask for corrections/additions
- Refine until user approves
- "Should I adjust anything before we finalize?"

---

## 🚨 SYSTEM SUCCESS/FAILURE METRICS

### ✅ SUCCESS:

- Interactive conversation occurred for each section
- User confirmed content before proceeding
- All selected sections completed for chosen epic(s)
- Content matches the verbose format from sample project
- Document updated with enhanced content

### ❌ SYSTEM FAILURE:

- Generated all content without user interaction
- Skipped confirmation steps
- Produced generic content without project context
- Failed to save enhanced content to document

**Master Rule:** This is a CONVERSATIONAL enhancement process. Generating all content without user dialogue is FORBIDDEN and constitutes SYSTEM FAILURE.
