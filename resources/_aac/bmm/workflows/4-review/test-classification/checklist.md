# Test Classification Strategy Checklist

<critical>This checklist is executed as part of: {bmad-path}/bmm/workflows/4-review/test-classification/workflow.yaml</critical>
<critical>Work through each section systematically to produce an accurate test classification</critical>

<checklist>

<section n="1" title="Scope Verification">

<check-item id="1.1">
<prompt>Confirm file list is complete</prompt>
<action>Is the target scope clearly defined (story, PR, directory, or full audit)?</action>
<action>Are all relevant files included in the analysis?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="1.2">
<prompt>Verify test infrastructure context is loaded</prompt>
<action>What test framework is in use?</action>
<action>Are there existing test patterns or conventions to follow?</action>
<action>What is the current test coverage baseline?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<halt-condition>
<action if="no files to classify">HALT: "Cannot proceed without a file list to classify"</action>
</halt-condition>

</section>

<section n="2" title="TDD Classification">

<check-item id="2.1">
<prompt>Identify all files containing isolated business logic</prompt>
<action>Flag service classes, utilities, validators, parsers, data access layers</action>
<action>Flag state management logic and API handlers with non-trivial logic</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="2.2">
<prompt>Assess testability of TDD-classified files</prompt>
<action>Can each file be tested in isolation?</action>
<action>What needs to be mocked or stubbed?</action>
<action>Flag any files that need refactoring before testing</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="3" title="E2E Classification">

<check-item id="3.1">
<prompt>Identify all files requiring integration or browser testing</prompt>
<action>Flag complex UI components, multi-step flows, auth-dependent features</action>
<action>Flag real-time features and file upload/download flows</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="3.2">
<prompt>Document E2E test environment prerequisites</prompt>
<action>What services must be running?</action>
<action>What test fixtures or seed data are needed?</action>
<action>What user flows exercise each component?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="4" title="Skip Classification">

<check-item id="4.1">
<prompt>Identify all files that should be skipped</prompt>
<action>Flag auto-generated code, type definitions, configuration files</action>
<action>Flag constants-only files, barrel exports, static assets</action>
<action>Verify each skip has a clear, documented justification</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="5" title="Priority Ranking">

<check-item id="5.1">
<prompt>Assign priority to TDD files</prompt>
<action>Rate by: cyclomatic complexity, business impact, change frequency</action>
<action>Assign P0 (Critical) / P1 (Important) / P2 (Nice-to-have)</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="5.2">
<prompt>Assign priority to E2E files</prompt>
<action>Rate by: user journey criticality, failure visibility, flakiness risk</action>
<action>Assign P0 / P1 / P2</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="6" title="Plan Compilation and Review">

<check-item id="6.1">
<prompt>Verify classification plan completeness</prompt>
<action>Does the plan include summary statistics, TDD table, E2E table, Skip table, and Risks?</action>
<action>Is every file classified exactly once (no duplicates, no missing)?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="6.2">
<prompt>Obtain user review and approval</prompt>
<action>Present the plan and get approval or iterate on overrides</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<halt-condition>
<action if="P0 files have no test strategy">HALT: "Critical-path files must have a defined test approach before proceeding"</action>
</halt-condition>

</section>

</checklist>

<execution-notes>
<note>The heuristic rules are guidelines, not laws — use judgment for ambiguous files</note>
<note>When in doubt, classify as TDD — unit tests are cheaper to write and maintain</note>
<note>Skip classifications must always be justified — never skip because "it's hard to test"</note>
<note>Priority ranking prevents analysis paralysis — start with P0 and work down</note>
</execution-notes>
