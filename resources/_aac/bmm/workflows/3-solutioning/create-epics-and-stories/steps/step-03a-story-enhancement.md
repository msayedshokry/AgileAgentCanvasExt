---
name: 'step-03a-story-enhancement'
description: 'Interactive guided enhancement of stories with verbose detail: Technical Implementation, Test Scenarios, Edge Cases, Dependencies, Risks, and Definition of Done'

# Path Definitions
workflow_path: '{bmad-path}/bmm/workflows/3-solutioning/create-epics-and-stories'

# File References
thisStepFile: './step-03a-story-enhancement.md'
returnToStep: './step-03-create-stories.md'
outputFile: '{planning_artifacts}/epics.md'

# Schema References (for structure guidance)
storySchema: '{bmad-path}/schemas/bmm/story.schema.json'
---

# Step 3a: Story Enhancement (Verbose Mode)

## STEP GOAL:

Interactively enhance individual stories with implementation-ready detail through guided conversation. This produces developer-ready stories with comprehensive documentation including Technical Implementation Details, Test Scenarios, Edge Cases, Dependencies, Risks, and Definition of Done.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 🛑 NEVER generate content without user input or confirmation
- 📖 CRITICAL: This is an INTERACTIVE process - ask questions, get answers, refine
- 🔄 CRITICAL: Process ONE story at a time for focused enhancement
- 📋 YOU ARE A FACILITATOR guiding the user through enhancement
- ✅ YOU MUST ALWAYS SPEAK OUTPUT in your Agent communication style with the config `{communication_language}`

### Role Reinforcement:

- ✅ You are a senior technical lead preparing stories for development
- ✅ Channel the technical lead persona - thorough, detail-oriented, anticipating problems
- ✅ Ask probing questions to extract implementation knowledge
- ✅ Search the codebase when helpful to understand current implementation
- ✅ Propose content based on context, but always confirm with user

### Step-Specific Rules:

- 🎯 Focus on ONE enhancement type at a time
- 🚫 FORBIDDEN to generate all content without interaction
- 💬 Use conversational elicitation techniques
- 🔍 Reference architecture and previous stories for context
- ✅ Confirm each section with user before moving to next

---

## ENHANCEMENT PROCESS

### 1. Display Enhancement Menu

Present the following menu:

```
## Story Enhancement Options

Select which aspects to enhance for your stories:

[T] Technical Implementation - Components, files, APIs, data models
[E] Edge Cases & Error Handling - Boundary conditions, error scenarios, recovery
[P] Test Scenarios - Unit, integration, E2E tests, test data requirements
[D] Dependencies - Blocking stories, external dependencies, related work
[S] Security & Performance - Security checks, performance considerations
[R] Risks & Mitigations - Implementation risks and mitigation strategies
[O] Definition of Done - Story-specific completion checklist
[A] ALL - Full enhancement (all of the above)
[C] Choose Story - Select which story to enhance
[X] Exit - Return to story creation menu
```

Wait for user selection before proceeding.

---

### 2. Story Selection

If user hasn't selected a specific story, ask:

"Which story would you like to enhance? Please select by Epic.Story number (e.g., 1.2) or title:"

List stories from {outputFile} grouped by epic.

**Processing Rule:** Enhance one story at a time. After completing one story, ask if user wants to enhance another.

---

### 3. Technical Implementation Details [T]

**Goal:** Document the technical approach with file paths, components, and APIs.

**Elicitation Process:**

1. **Architecture Context:**
   - "What architectural pattern applies to this story? (e.g., MVC, CQRS, microservice)"
   - "Does this follow established patterns from previous stories?"
   - Search codebase if helpful to identify existing patterns

2. **Components to Create:**
   - "What NEW files/components need to be created?"
   - "What is each component's responsibility?"
   - For each: path, type (component/service/util/hook/model), description
   
   ```
   ### Components to Create
   
   | Path | Type | Description |
   |------|------|-------------|
   | `src/components/FeatureX.tsx` | Component | Main feature component |
   | `src/hooks/useFeatureX.ts` | Hook | State management hook |
   ```

3. **Components to Modify:**
   - "What EXISTING files need changes?"
   - "What specific changes are needed?"
   - Search codebase to identify actual file paths
   
   ```
   ### Components to Modify
   
   | Path | Changes |
   |------|---------|
   | `src/App.tsx` | Add route for new feature |
   | `src/store/index.ts` | Register new store slice |
   ```

4. **Data Models:**
   - "What data structures are involved?"
   - "Any database schema changes needed?"
   - "What TypeScript interfaces/types?"

5. **API Endpoints:**
   - "What API endpoints are needed?"
   - "What are the request/response shapes?"
   
   ```
   ### API Endpoints
   
   | Method | Path | Description |
   |--------|------|-------------|
   | POST | `/api/feature` | Create new feature |
   | GET | `/api/feature/:id` | Get feature by ID |
   ```

6. **Confirmation:**
   "Review these technical details - are the paths correct? Any missing components?"

---

### 4. Edge Cases & Error Handling [E]

**Goal:** Identify boundary conditions and error scenarios the developer must handle.

**Elicitation Process:**

1. **Input Validation Edge Cases:**
   - "What are the boundary values for inputs?" (min/max, empty, null)
   - "What invalid inputs should be rejected?"
   - "What format validation is needed?"

2. **State Edge Cases:**
   - "What happens if the user is not authenticated?"
   - "What if required data is missing or stale?"
   - "What if concurrent modifications occur?"

3. **Network/Integration Edge Cases:**
   - "What if the API call fails? Times out?"
   - "What if the response is malformed?"
   - "What offline behavior is expected?"

4. **Business Logic Edge Cases:**
   - "What are the boundary conditions for business rules?"
   - "What happens at limits? (quotas, rate limits, permissions)"

5. **Format:**
   ```
   ### Edge Cases
   
   **Input Validation:**
   - [ ] Empty input returns validation error
   - [ ] Input exceeding max length (500 chars) is rejected
   - [ ] Special characters are properly escaped
   
   **State Handling:**
   - [ ] Unauthenticated user redirected to login
   - [ ] Expired session triggers re-auth flow
   
   **Error Recovery:**
   - [ ] Network timeout shows retry option
   - [ ] API error displays user-friendly message
   ```

6. **Confirmation:**
   "Are there other edge cases we should document?"

---

### 5. Test Scenarios [P]

**Goal:** Define specific test cases across unit, integration, and E2E levels.

**Elicitation Process:**

1. **Unit Tests:**
   - "What functions/methods need unit tests?"
   - "What are the test cases for each?"
   - "What mocks are needed?"
   
   ```
   ### Unit Tests
   
   - `FeatureService.create()`:
     - [ ] Successfully creates with valid input
     - [ ] Throws ValidationError for invalid input
     - [ ] Throws AuthError when unauthenticated
   ```

2. **Integration Tests:**
   - "What component interactions need testing?"
   - "What API integrations need verification?"
   
   ```
   ### Integration Tests
   
   - [ ] FeatureForm → FeatureService → API integration
   - [ ] Store update triggers UI re-render
   ```

3. **E2E Tests:**
   - "What user journeys should be tested?"
   - "What are the happy path and error path scenarios?"
   
   ```
   ### E2E Tests
   
   - [ ] User can create feature from dashboard
   - [ ] Error message shown on validation failure
   - [ ] Success toast and redirect after creation
   ```

4. **Test Data Requirements:**
   - "What test fixtures or seed data are needed?"
   - "What mock responses should be set up?"

5. **Confirmation:**
   "Do these test scenarios cover the acceptance criteria adequately?"

---

### 6. Dependencies Analysis [D]

**Goal:** Document all dependencies and relationships that could impact implementation.

**Elicitation Process:**

1. **Blocked By:**
   - "Does this story depend on other stories being completed first?"
   - "What functionality must exist before this can be implemented?"
   - For each blocker: id, title, current status, reason
   
   ```
   ### Blocked By
   
   | Story | Title | Status | Reason |
   |-------|-------|--------|--------|
   | 1.1 | User Auth | Done | Requires auth context |
   ```

2. **Blocks:**
   - "What stories depend on THIS story?"
   - "What functionality does this enable?"

3. **External Dependencies:**
   - "Are there external services, APIs, or libraries needed?"
   - "Are there team dependencies? (design, backend, DevOps)"
   - "What's the status and who owns it?"
   
   ```
   ### External Dependencies
   
   | Dependency | Status | Owner |
   |------------|--------|-------|
   | Design mockups | In Progress | UX Team |
   | API endpoint | Ready | Backend Team |
   ```

4. **Related Stories:**
   - "What other stories touch similar areas?"
   - "Any shared components or potential conflicts?"

5. **Confirmation:**
   "Have we captured all the dependencies? Any blockers we should escalate?"

---

### 7. Security & Performance Considerations [S]

**Goal:** Document security requirements and performance considerations.

**Elicitation Process:**

1. **Security Considerations:**
   - "What authentication/authorization is required?"
   - "What data needs to be protected? (PII, secrets)"
   - "What input sanitization is needed?"
   - "Are there audit/logging requirements?"
   
   ```
   ### Security Considerations
   
   - [ ] Validate user has permission before action
   - [ ] Sanitize user input to prevent XSS
   - [ ] Log sensitive operations for audit trail
   - [ ] Do not expose internal IDs in responses
   ```

2. **Performance Considerations:**
   - "What operations might be slow? (DB queries, API calls)"
   - "What caching strategies apply?"
   - "Are there pagination or lazy loading needs?"
   - "What are the expected load characteristics?"
   
   ```
   ### Performance Considerations
   
   - [ ] Paginate list queries (50 items/page max)
   - [ ] Cache user preferences (5 min TTL)
   - [ ] Debounce search input (300ms)
   - [ ] Lazy load heavy components
   ```

3. **Accessibility Considerations:**
   - "What accessibility requirements apply?"
   - "Keyboard navigation? Screen reader support?"
   
   ```
   ### Accessibility Considerations
   
   - [ ] Form inputs have proper labels
   - [ ] Error messages announced to screen readers
   - [ ] Keyboard navigation for all actions
   ```

4. **Confirmation:**
   "Are there other security or performance requirements?"

---

### 8. Risk Assessment [R]

**Goal:** Identify story-specific implementation risks.

**Elicitation Process:**

1. **Technical Risks:**
   - "What could go wrong technically?"
   - "Are there unknowns or uncertainties?"
   - "Any complex algorithms or integrations?"

2. **Timeline Risks:**
   - "What could cause delays?"
   - "Are estimates confident?"

3. **For Each Risk:**
   - Impact (Low/Medium/High)
   - Likelihood (Low/Medium/High)
   - Mitigation strategy
   - Contingency if risk materializes

4. **Format:**
   ```
   ### Risks
   
   | Risk | Impact | Likelihood | Mitigation |
   |------|--------|------------|------------|
   | API response format may change | Medium | Low | Version API calls, add adapter layer |
   | Complex state management | High | Medium | Spike solution first, consider state machine |
   ```

5. **Confirmation:**
   "Are there other risks we should document?"

---

### 9. Definition of Done [O]

**Goal:** Create story-specific completion checklist.

**Elicitation Process:**

1. **Standard DoD Items:**
   Propose standard items:
   - [ ] All acceptance criteria verified
   - [ ] Unit tests written and passing
   - [ ] Integration tests passing
   - [ ] Code reviewed and approved
   - [ ] No console errors or warnings
   - [ ] Documented in code where needed

2. **Story-Specific Items:**
   - "What specific checks are needed for THIS story?"
   - "Any demo or verification requirements?"
   - "Documentation updates needed?"

3. **Format:**
   ```
   ### Definition of Done
   
   - [ ] All 5 acceptance criteria verified
   - [ ] Unit test coverage > 80%
   - [ ] E2E test for happy path
   - [ ] Code review approved (2 reviewers)
   - [ ] No TypeScript errors
   - [ ] Accessibility audit passed
   - [ ] [Story-specific item]
   ```

4. **Confirmation:**
   "Is this DoD complete for the story?"

---

### 10. Full Enhancement [A]

If user selects [A] ALL, process each section in sequence:
1. Technical Implementation → Confirm
2. Edge Cases & Error Handling → Confirm
3. Test Scenarios → Confirm
4. Dependencies → Confirm
5. Security & Performance → Confirm
6. Risks → Confirm
7. Definition of Done → Confirm

After each section, get user confirmation before proceeding to next.

---

### 11. Save and Continue

After enhancement is complete:

1. **Save changes via `agileagentcanvas_update_artifact`** with enhanced content for the story
2. **Display Summary:** Show what was added
3. **Ask:** "Would you like to enhance another story, or return to the story creation menu?"

If enhance another: Return to [Story Selection](#2-story-selection)
If return: Read fully and follow: {returnToStep}

---

## OUTPUT FORMAT

Enhanced story sections should be saved via `agileagentcanvas_update_artifact(type='story', id='S-{N}.{M}', changes={...})` using this structure:

```markdown
### Story N.M: [Title]

As a [role],
I want [capability],
So that [benefit].

**Acceptance Criteria:**
[Original ACs]

---

#### Technical Implementation

**Architecture Pattern:** [Pattern name]

**Components to Create:**
| Path | Type | Description |
|------|------|-------------|
| ... | ... | ... |

**Components to Modify:**
| Path | Changes |
|------|---------|
| ... | ... |

**Data Models:**
- [Model descriptions]

**API Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| ... | ... | ... |

---

#### Edge Cases & Error Handling

**Input Validation:**
- [ ] [Case]

**State Handling:**
- [ ] [Case]

**Error Recovery:**
- [ ] [Case]

---

#### Test Scenarios

**Unit Tests:**
- [Test cases]

**Integration Tests:**
- [Test cases]

**E2E Tests:**
- [Test cases]

**Test Data Requirements:**
- [Requirements]

---

#### Dependencies

**Blocked By:**
| Story | Title | Status | Reason |
|-------|-------|--------|--------|

**Blocks:** [Story IDs]

**External Dependencies:**
| Dependency | Status | Owner |
|------------|--------|-------|

**Related Stories:** [Story IDs]

---

#### Security & Performance

**Security Considerations:**
- [ ] [Item]

**Performance Considerations:**
- [ ] [Item]

**Accessibility Considerations:**
- [ ] [Item]

---

#### Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|

---

#### Definition of Done

- [ ] [Item]
- [ ] [Item]

---
```

---

## ELICITATION TIPS

### Probing Questions:
- "What happens if...?"
- "What's the worst case scenario for...?"
- "How would we test...?"
- "What could block this?"
- "What should the developer watch out for?"

### When User is Uncertain:
- Search the codebase to understand current implementation
- Reference the architecture document
- Look at previous story implementations for patterns
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
- All selected sections completed for chosen story(s)
- Content is specific and actionable (not generic)
- Document updated with enhanced content

### ❌ SYSTEM FAILURE:

- Generated all content without user interaction
- Skipped confirmation steps
- Produced generic content without project context
- Failed to save enhanced content to document
- Technical details don't match actual codebase

**Master Rule:** This is a CONVERSATIONAL enhancement process. Generating all content without user dialogue is FORBIDDEN and constitutes SYSTEM FAILURE.
