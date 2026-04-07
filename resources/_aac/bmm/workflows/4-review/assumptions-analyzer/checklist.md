# Assumptions Analyzer Checklist

<critical>This checklist is executed as part of: {bmad-path}/bmm/workflows/4-review/assumptions-analyzer/workflow.yaml</critical>
<critical>Work through each section systematically, recording all assumptions found</critical>

<checklist>

<section n="1" title="Scope and Artifact Verification">

<check-item id="1.1">
<prompt>Confirm target artifact is loaded and accessible</prompt>
<action>Is the PRD, Epic, Architecture, or Story document available?</action>
<action>Is supporting context (codebase, related docs) accessible?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<halt-condition>
<action if="artifact is not provided">HALT: "Cannot proceed without a target artifact"</action>
</halt-condition>

</section>

<section n="2" title="Explicit Assumption Extraction">

<check-item id="2.1">
<prompt>Scan for declared assumption language</prompt>
<action>Search for "assume", "given that", "depends on", "should work because"</action>
<action>Document each explicit assumption with source location</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="2.2">
<prompt>Extract implicit availability assumptions</prompt>
<action>Identify API endpoints, services, or infrastructure assumed to exist</action>
<action>Identify data schemas or formats assumed to be stable</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="2.3">
<prompt>Extract performance and scaling assumptions</prompt>
<action>Identify throughput, latency, or volume assumptions</action>
<action>Identify resource constraints assumed (memory, CPU, storage)</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="3" title="Hidden Assumption Extraction">

<check-item id="3.1">
<prompt>Cross-reference artifact requirements against codebase reality</prompt>
<action>Does the current codebase actually support what the artifact requires?</action>
<action>Are there compatibility constraints not mentioned?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="3.2">
<prompt>Identify business and market assumptions</prompt>
<action>Are there user persona assumptions that may not hold?</action>
<action>Are there regulatory/compliance assumptions?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="3.3">
<prompt>Identify integration and third-party assumptions</prompt>
<action>Are third-party API contracts assumed stable?</action>
<action>Are authentication flows assumed to cross boundaries correctly?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="3.4">
<prompt>Identify team capability assumptions</prompt>
<action>Is technology familiarity assumed?</action>
<action>Are development velocity assumptions realistic?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="4" title="Categorization and Validation">

<check-item id="4.1">
<prompt>Categorize each assumption into tiers</prompt>
<action>Verified ✅ — evidence exists in code, tests, or docs</action>
<action>Likely 🟡 — reasonable but not proven</action>
<action>Unverified 🔴 — no evidence, could be wrong</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="4.2">
<prompt>Verify that all VERIFIED assumptions have cited evidence</prompt>
<action>Each verified assumption must reference a specific file, test, or API</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="5" title="Consequence Analysis">

<check-item id="5.1">
<prompt>Map consequences for all LIKELY and UNVERIFIED assumptions</prompt>
<action>For each: What breaks? What is the blast radius? What is the recovery cost?</action>
<action>Rate severity: 🔴 Critical / 🟡 Moderate / 🟢 Low</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="5.2">
<prompt>Identify mitigation actions for critical risks</prompt>
<action>For each 🔴 Critical consequence, specify a concrete mitigation</action>
<action>Categorize: Validate Now / Spike Required / Accept Risk / Add Guard Rail</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="6" title="Report Compilation and Review">

<check-item id="6.1">
<prompt>Verify report completeness</prompt>
<action>Does the report include all 6 sections (Summary, Verified, Likely, Unverified, Consequences, Recommendations)?</action>
<action>Are findings specific and actionable?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="6.2">
<prompt>Obtain user review</prompt>
<action>Present report to user</action>
<action>Get approval or iterate on feedback</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<halt-condition>
<action if="critical unverified assumptions exist without mitigation">HALT: "Cannot finalize report without mitigation plans for critical risks"</action>
</halt-condition>

</section>

</checklist>

<execution-notes>
<note>Ground every finding in evidence — never speculate without flagging it</note>
<note>Hidden assumptions are the highest-value finds — spend most effort here</note>
<note>The consequence map should make risks visceral: "If X is wrong, Epic 3 is blocked for 2 weeks"</note>
<note>Always suggest concrete next steps, not vague warnings</note>
</execution-notes>
