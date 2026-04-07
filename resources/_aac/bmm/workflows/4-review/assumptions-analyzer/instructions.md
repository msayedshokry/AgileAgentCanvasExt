# Assumptions Analyzer - Risk Extraction Instructions

<critical>The workflow execution engine is governed by: {bmad-path}/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {bmad-path}/bmm/workflows/4-review/assumptions-analyzer/workflow.yaml</critical>
<critical>Communicate all responses in {communication_language}</critical>

<critical>DOCUMENT OUTPUT: A structured Assumptions Report categorizing every identified assumption as Verified, Likely, or Unverified, with explicit consequence analysis for each. The report must be grounded in evidence from the codebase and project artifacts.</critical>

<workflow>

<step n="1" goal="Initialize Analysis Scope">
  <action>Confirm the target artifact with the user</action>
  <ask>"Which artifact should I analyze for hidden assumptions?
  1. **PRD** — Analyze product requirements for unstated technical/business assumptions
  2. **Epic** — Analyze a specific epic and its stories for implementation assumptions
  3. **Architecture Doc** — Analyze architectural decisions for technology/scaling assumptions
  4. **Story** — Deep-dive into a single story's acceptance criteria and technical tasks"</ask>
  <action>Load the target artifact and any related context (codebase, architecture, PRD)</action>
  <action>Confirm the user's risk appetite: Are they looking for exhaustive analysis or focused on critical risks only?</action>

<action if="no artifact provided">HALT: "Cannot analyze assumptions without a target artifact. Please provide a PRD, epic, architecture document, or story."</action>
</step>

<step n="2" goal="Extract Explicit Assumptions">
  <action>Scan the target artifact for statements that contain assumption language:</action>
    - "We assume that..."
    - "This depends on..."
    - "Assuming X is available..."
    - "Given that..."
    - "This should work because..."
  <action>Extract requirements that implicitly assume availability, performance, or compatibility:</action>
    - API endpoints assumed to exist or remain stable
    - Third-party services assumed to be available and performant
    - User behavior assumptions (adoption rates, usage patterns)
    - Infrastructure assumptions (memory, CPU, network bandwidth)
    - Data assumptions (schema stability, data quality, volume)
  <action>Document each explicit assumption with its source location in the artifact</action>
</step>

<step n="3" goal="Extract Hidden Assumptions">
  <action>Identify unstated technical assumptions by cross-referencing the artifact against the codebase:</action>
    - Does the codebase already support what the artifact requires?
    - Are there compatibility constraints not mentioned in the artifact?
    - Are there performance bounds assumed but not documented?
  <action>Identify unstated business assumptions:</action>
    - Market conditions or competitive landscape assumptions
    - User persona assumptions (technical skill, access patterns)
    - Regulatory or compliance assumptions
    - Budget and timeline assumptions
  <action>Identify integration assumptions:</action>
    - Third-party API contracts assumed to remain stable
    - Authentication/authorization flows assumed to work across boundaries
    - Data format compatibility between systems
  <action>Identify team capability assumptions:</action>
    - Technology familiarity assumed
    - Skills or tooling assumed to be in place
    - Development velocity assumptions
  <action>Document each hidden assumption with an explanation of why it is implicit</action>
</step>

<step n="4" goal="Categorize Assumptions by Verification Status">
  <action>For each identified assumption, categorize it into one of three tiers:</action>

  <action>Tier 1 — VERIFIED ✅</action>
    - Evidence exists in the codebase, tests, or documentation that this assumption is true
    - Cite the specific evidence (file path, test case, API response)
    - Example: "The Auth service supports OAuth2 — verified by auth-service/oauth2.ts"

  <action>Tier 2 — LIKELY 🟡</action>
    - No direct evidence, but reasonable based on common patterns and project context
    - Explain the reasoning and what would make it definitive
    - Example: "PostgreSQL can handle the projected 10K writes/sec — likely based on industry benchmarks, but not load-tested"

  <action>Tier 3 — UNVERIFIED 🔴</action>
    - No evidence and the assumption could be wrong
    - This category represents genuine project risk
    - Example: "The payment gateway supports multi-currency — unverified, no documentation found"

  <action>Present the categorization to the user for review</action>
  <ask>Do you want to adjust any categorizations before proceeding to consequence analysis?</ask>
</step>

<step n="5" goal="Consequence Mapping">
  <action>For every LIKELY and UNVERIFIED assumption, document the explicit consequence if the assumption is wrong:</action>

  <action>For each assumption, answer:</action>
    - **What breaks?** — Which features, stories, or epics are directly affected?
    - **Blast radius** — How far does the failure propagate? (Single story, entire epic, cross-epic?)
    - **Recovery cost** — If discovered late, how expensive is the fix? (Hours, days, weeks?)
    - **Mitigation** — What concrete action can reduce the risk NOW?

  <action>Rate each consequence by severity:</action>
    - 🔴 **Critical** — Would block the sprint or require a fundamental redesign
    - 🟡 **Moderate** — Would require scope adjustment or workaround
    - 🟢 **Low** — Easily addressed with minor changes

  <action>Compile the consequence map into a structured table</action>
</step>

<step n="6" goal="Generate Recommendations">
  <action>For all UNVERIFIED assumptions, produce specific recommendations:</action>
    - **Validate Now** — Assumptions that must be verified before implementation begins
    - **Spike Required** — Assumptions that need a technical investigation
    - **Accept Risk** — Assumptions where the consequence is low enough to proceed
    - **Add Guard Rail** — Assumptions where defensive coding can mitigate the risk

  <action>For all LIKELY assumptions, suggest verification steps:</action>
    - Specific tests that would confirm or deny the assumption
    - Documentation or stakeholder conversations needed
    - Prototype or POC work to validate

  <action>Prioritize recommendations by consequence severity</action>
</step>

<step n="7" goal="Compile Assumptions Report">
  <action>Compile the final Assumptions Report with these sections:</action>

  <action>Section 1: Executive Summary</action>
    - Total assumptions found: {{count}}
    - Verified: {{verified_count}} | Likely: {{likely_count}} | Unverified: {{unverified_count}}
    - Critical risks: {{critical_count}}

  <action>Section 2: Verified Assumptions (with evidence)</action>
  <action>Section 3: Likely Assumptions (with reasoning)</action>
  <action>Section 4: Unverified Assumptions (with consequences)</action>
  <action>Section 5: Consequence Map (severity-sorted table)</action>
  <action>Section 6: Prioritized Recommendations</action>

  <action>Present complete report to the user</action>
  <ask>Review the Assumptions Report. Would you like to:
  1. **Refine** specific sections
  2. **Deep-dive** into a particular assumption
  3. **Accept** the report as-is</ask>
</step>

<step n="8" goal="Workflow Completion">
  <action>Summarize the analysis session:</action>
    - Artifact analyzed: {{artifact_name}}
    - Total assumptions: {{total_count}}
    - Critical unverified: {{critical_unverified_count}}
    - Top recommendation: {{top_recommendation}}
  <action>Report workflow completion: "✅ Assumptions Analyzer workflow complete, {user_name}!"</action>
  <action>Suggest next steps (e.g., run tradeoff-advisor on critical unknowns, create spike stories for unverified assumptions)</action>
</step>

</workflow>
