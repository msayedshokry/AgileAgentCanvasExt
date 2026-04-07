# Execution Task Protocol Checklist

<critical>This checklist is executed as part of: {bmad-path}/bmm/workflows/4-review/execution-task-protocol/workflow.yaml</critical>
<critical>Work through each section systematically to enforce execution rigor</critical>

<checklist>

<section n="1" title="Context Verification">

<check-item id="1.1">
<prompt>Confirm execution context is loaded</prompt>
<action>Is the story file, task list, or error context available?</action>
<action>Are the acceptance criteria and definition of done identified?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<halt-condition>
<action if="no context available">HALT: "Cannot review execution without a target story or task"</action>
</halt-condition>

</section>

<section n="2" title="Deviation Detection">

<check-item id="2.1">
<prompt>Scan for BUG deviations</prompt>
<action>Is any existing functionality broken or regressed?</action>
<action>Are there test failures unrelated to the current work?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="2.2">
<prompt>Scan for MISSING deviations</prompt>
<action>Are any acceptance criteria not yet addressed?</action>
<action>Are any tasks started but incomplete?</action>
<action>Are edge cases acknowledged but not handled?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="2.3">
<prompt>Scan for BLOCKING deviations</prompt>
<action>Are there external dependencies preventing progress?</action>
<action>Is the team waiting on another service, team, or approval?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="2.4">
<prompt>Scan for ARCHITECTURAL deviations</prompt>
<action>Does the current approach have a fundamental flaw?</action>
<action>Are there scalability, security, or compliance concerns?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="3" title="Auth Gate Enforcement">

<check-item id="3.1">
<prompt>Check for auth-related anti-patterns</prompt>
<action>Are 401/403 errors being blindly retried? (MUST NOT happen)</action>
<action>Is exponential backoff used for 429 rate limits?</action>
<action>Are credentials or tokens hardcoded? (MUST NOT happen)</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="4" title="Output Integrity">

<check-item id="4.1">
<prompt>Verify each component has concrete evidence of success</prompt>
<action>Is there terminal output, test results, or API responses confirming success?</action>
<action>Flag any component claiming completion without verification evidence</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="4.2">
<prompt>Check for red-flag patterns</prompt>
<action>Are there "I believe this works" claims without proof?</action>
<action>Are tests skipped with "will test later" promises?</action>
<action>Are there TODOs or stub implementations in submitted code?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="5" title="Acceptance Criteria Compliance">

<check-item id="5.1">
<prompt>Check each AC item individually</prompt>
<action>Is each AC item implemented? (Yes / Partial / No)</action>
<action>Is each AC item tested? (Unit / Integration / E2E / None)</action>
<action>Is each AC item verified with evidence?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="5.2">
<prompt>Check for scope creep</prompt>
<action>Was work done outside the acceptance criteria?</action>
<action>If yes, is it justified or is it unplanned scope?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="5.3">
<prompt>Definition of Done compliance</prompt>
<action>Are all tests passing?</action>
<action>Is documentation updated?</action>
<action>Are all TODO/FIXME markers resolved or tracked?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="6" title="Self-Audit">

<check-item id="6.1">
<prompt>Scan for anti-patterns in changed files</prompt>
<action>Check for: TODOs without tickets, stubs, commented-out code, debug statements, hardcoded values, empty catch blocks</action>
<action>Categorize: Must Fix / Acceptable with Ticket / Cleanup</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="7" title="Final Verdict">

<check-item id="7.1">
<prompt>Compile execution health report</prompt>
<action>Assign overall verdict: ✅ PASS / 🟡 PASS WITH CONDITIONS / ❌ FAIL</action>
<action>List all required actions before merge</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="7.2">
<prompt>Obtain user acknowledgment</prompt>
<action>Present report, get approval or identify remediation steps</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<halt-condition>
<action if="FAIL verdict with unresolved blockers">HALT: "Cannot approve execution — blocking deviations must be resolved"</action>
<action if="AC items at No without justification">HALT: "Cannot approve — acceptance criteria not met"</action>
</halt-condition>

</section>

</checklist>

<execution-notes>
<note>This protocol exists to prevent shallow execution — every claim of "done" must have proof</note>
<note>Auth errors are NEVER retried blindly — always investigate root cause first</note>
<note>Deviations are facts, not judgments — categorize objectively</note>
<note>The PASS WITH CONDITIONS verdict requires explicit acknowledgment of remaining risks</note>
</execution-notes>
