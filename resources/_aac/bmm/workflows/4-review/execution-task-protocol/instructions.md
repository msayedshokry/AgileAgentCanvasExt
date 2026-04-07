# Execution Task Protocol - Deviation Enforcement Instructions

<critical>The workflow execution engine is governed by: {bmad-path}/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {bmad-path}/bmm/workflows/4-review/execution-task-protocol/workflow.yaml</critical>
<critical>Communicate all responses in {communication_language}</critical>

<critical>DOCUMENT OUTPUT: A structured Execution Health Report covering deviation categorization, output integrity verification, acceptance criteria compliance, and a final pass/fail verdict. This report guards against shallow or incomplete task execution.</critical>

<workflow>

<step n="1" goal="Initialize Execution Review">
  <action>Confirm the scope of execution being reviewed with the user</action>
  <ask>"What execution context should I review?
  1. **Active Story** — Review a story currently being implemented
  2. **Completed Task** — Verify a task claimed as 'done'
  3. **Error State** — Triage an error or failure encountered during execution
  4. **Sprint Checkpoint** — Review overall sprint execution health"</ask>
  <action>Load the relevant story file, task list, or error context</action>
  <action>Identify the acceptance criteria and definition of done for the target</action>

<action if="no execution context provided">HALT: "Cannot review execution without a story file, task reference, or error state to evaluate."</action>
</step>

<step n="2" goal="Deviation Detection and Classification">
  <action>Scan the execution for deviations from the plan. Categorize each deviation into exactly one bucket:</action>

  <action>🐛 BUG — Code defect or regression</action>
    - Existing functionality broke during implementation
    - Test failures unrelated to current work
    - Action: Fix immediately before proceeding

  <action>📋 MISSING — Incomplete implementation</action>
    - Acceptance criteria not yet addressed
    - Tasks started but not finished
    - Edge cases acknowledged but not handled
    - Action: Complete the missing work

  <action>🚫 BLOCKING — External dependency preventing progress</action>
    - API not available, credentials missing, environment issue
    - Waiting on another team or service
    - Action: Document the blocker, propose workaround, escalate if needed

  <action>🏗️ ARCHITECTURAL — Fundamental design issue discovered</action>
    - Current approach won't work at required scale
    - Integration pattern doesn't fit the data model
    - Security or compliance concern with chosen approach
    - Action: STOP implementation, escalate to architect/PM for course correction

  <action>For each deviation found, record:</action>
    - Deviation type (Bug/Missing/Blocking/Architectural)
    - Specific description
    - Affected story/task
    - Proposed resolution
</step>

<step n="3" goal="Authentication and Authorization Gate Enforcement">
  <action>Check for auth-related errors or patterns that require special handling:</action>

  <action>401 Unauthorized errors:</action>
    - NEVER retry blindly — auth failures indicate a configuration or token issue
    - Verify: Is the token expired? Is the service account configured?
    - Action: Investigate root cause before ANY retry attempt

  <action>403 Forbidden errors:</action>
    - NEVER retry blindly — permission errors indicate a policy/role issue
    - Verify: Does the service have the required IAM role or permissions?
    - Action: Fix permissions configuration, do not retry the same request

  <action>Rate limiting (429 Too Many Requests):</action>
    - Implement exponential backoff, not immediate retries
    - Verify: Is the rate limit expected? Can it be increased?

  <action>Document any auth-gate violations found during execution</action>
  <action>Flag any patterns of blind retries in the implementation</action>
</step>

<step n="4" goal="Output Integrity Verification">
  <action>For each task or component claimed as complete, verify with concrete evidence:</action>

  <action>Verification methods (at least one MUST be present):</action>
    - ✅ Terminal output showing successful execution
    - ✅ Test suite passing (with output captured)
    - ✅ API response confirming expected behavior
    - ✅ Database query confirming data state
    - ✅ Browser/UI screenshot confirming visual correctness
    - ✅ Log output confirming expected flow

  <action>Red flags — claims of completion WITHOUT:</action>
    - ❌ No terminal output or test results shown
    - ❌ "I believe this should work" without verification
    - ❌ Skipped tests with "will test later" promise
    - ❌ TODOs or stub implementations left in place
    - ❌ Commented-out code with no explanation

  <action>For each component, record its verification status:</action>
    - VERIFIED — Concrete evidence of success exists
    - UNVERIFIED — Claimed complete but no evidence provided
    - FAILED — Evidence shows it does not work correctly
</step>

<step n="5" goal="Acceptance Criteria Compliance Check">
  <action>Load the story's acceptance criteria (AC) and check each one individually:</action>

  <action>For each AC item:</action>
    - Is it implemented? (Yes / Partial / No)
    - Is there a test covering it? (Unit / Integration / E2E / None)
    - Is there verification evidence? (Terminal output / Screenshot / Test pass)

  <action>Check for scope creep:</action>
    - Was work done that is NOT in the acceptance criteria?
    - If yes, is it justified (e.g., necessary refactoring) or is it unplanned scope?

  <action>Check for definition-of-done compliance:</action>
    - Are all required tests passing?
    - Is documentation updated (if applicable)?
    - Are there no TODO/FIXME markers left unresolved?
    - Does the code follow the project's coding standards?

  <action>Compile the AC compliance table:</action>

  | AC # | Description | Implemented | Tested | Verified | Status |
  |------|-------------|-------------|--------|----------|--------|
  | ...  | ...         | ...         | ...    | ...      | ...    |
</step>

<step n="6" goal="Self-Audit for TODOs and Stubs">
  <action>Scan all changed/new files for anti-patterns that indicate incomplete work:</action>
    - `TODO` comments without associated tracking tickets
    - `FIXME` markers
    - `HACK` annotations
    - Stub functions that return hardcoded values
    - Commented-out code blocks
    - `console.log` or debug print statements left in production code
    - Empty catch blocks or swallowed errors
    - Hardcoded credentials, URLs, or configuration values

  <action>For each finding, categorize:</action>
    - **Must Fix Before Merge** — Stubs, hardcoded values, empty catch blocks
    - **Acceptable with Ticket** — TODOs with an associated tracking reference
    - **Cleanup** — Debug statements, commented code (low risk)
</step>

<step n="7" goal="Compile Execution Health Report">
  <action>Compile the final Execution Health Report with these sections:</action>

  <action>Section 1: Executive Verdict</action>
    - Overall status: ✅ PASS / 🟡 PASS WITH CONDITIONS / ❌ FAIL
    - Summary of findings

  <action>Section 2: Deviations Found</action>
    - Table of all deviations with type, description, and resolution status

  <action>Section 3: Auth Gate Compliance</action>
    - Any auth-related violations or concerns

  <action>Section 4: Output Integrity</action>
    - Verification status for each component (Verified / Unverified / Failed)

  <action>Section 5: Acceptance Criteria Compliance</action>
    - AC compliance table with implementation, test, and verification status

  <action>Section 6: Self-Audit Findings</action>
    - TODOs, stubs, and anti-patterns found with categorization

  <action>Section 7: Required Actions Before Merge</action>
    - Ordered list of actions that MUST be completed

  <action>Present the report to the user</action>
  <ask>Review the Execution Health Report. Actions needed:
  1. **Fix blockers** — Address all FAIL items
  2. **Accept conditions** — Acknowledge PASS WITH CONDITIONS items
  3. **Approve** — Mark execution as complete</ask>
</step>

<step n="8" goal="Workflow Completion">
  <action>Summarize the execution review:</action>
    - Context reviewed: {{context_description}}
    - Deviations found: {{deviation_count}} (Bug: {{bug}}, Missing: {{missing}}, Blocking: {{blocking}}, Architectural: {{arch}})
    - AC compliance: {{ac_pass_count}}/{{ac_total_count}}
    - Overall verdict: {{verdict}}
  <action>Report workflow completion: "✅ Execution Task Protocol review complete, {user_name}!"</action>
  <action>If FAIL, recommend corrective actions. If PASS, suggest next story or sprint checkpoint.</action>
</step>

</workflow>
