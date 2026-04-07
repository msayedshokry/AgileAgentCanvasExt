# Trade-off Advisor - Decision Matrix Instructions

<critical>The workflow execution engine is governed by: {bmad-path}/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {bmad-path}/bmm/workflows/4-review/tradeoff-advisor/workflow.yaml</critical>
<critical>Communicate all responses in {communication_language}</critical>

<critical>DOCUMENT OUTPUT: A structured Trade-off Decision Document containing one or more 5-column tradeoff matrices, supporting analysis, and a clear final recommendation for each gray area analyzed.</critical>

<workflow>

<step n="1" goal="Identify the Gray Area">
  <action>Confirm the architectural ambiguity or technical unknown with the user</action>
  <ask>"What is the specific technical decision or gray area you need evaluated?
  Examples:
  - 'Should we use PostgreSQL or MongoDB for the event store?'
  - 'REST vs GraphQL for the client API?'
  - 'Monorepo vs multi-repo for the microservices?'
  - 'Build custom auth or use Auth0/Clerk?'"</ask>
  <action>Gather context about the decision:</action>
    - What are the constraints? (timeline, team skills, budget, compliance)
    - What has already been decided that constrains this choice?
    - What are the expected scale requirements?
    - Are there existing patterns in the codebase that inform the decision?
  <action>Load relevant architecture documents, PRD, or codebase context if available</action>

<action if="gray area is not specific enough">HALT: "The question is too broad. Please narrow it to a specific technical choice with 2-5 concrete options."</action>
</step>

<step n="2" goal="Enumerate Options">
  <action>List all viable options for the gray area (minimum 2, ideally 3-5)</action>
  <action>For each option, provide a brief 1-2 sentence description of what it entails</action>
  <action>Verify with the user:</action>
  <ask>"Here are the options I've identified:
  {{option_list}}
  Are there any options I'm missing, or should any be removed?"</ask>
  <action>Finalize the option set before proceeding to analysis</action>
</step>

<step n="3" goal="Analyze Pros for Each Option">
  <action>For each option, identify concrete pros relevant to the project context:</action>
    - Performance advantages (with specifics, not vague claims)
    - Developer experience improvements
    - Ecosystem and community support
    - Long-term maintainability
    - Cost efficiency
    - Compliance or regulatory fit
    - Integration with existing stack
    - Learning curve advantages
  <action>Pros must be specific to the project, not generic technology comparisons</action>
  <action>Example of BAD: "PostgreSQL is fast"</action>
  <action>Example of GOOD: "PostgreSQL supports JSONB for the event store without requiring a separate schema migration for each event type, which fits our 12-event-type domain model"</action>
</step>

<step n="4" goal="Analyze Cons for Each Option">
  <action>For each option, identify concrete cons relevant to the project context:</action>
    - Performance limitations under expected load
    - Team skill gaps
    - Operational complexity
    - Lock-in risks
    - Cost at projected scale
    - Missing features that would require workarounds
    - Migration pain if the choice needs to be reversed
  <action>Cons must be honest and specific — don't soften real risks</action>
  <action>For each con, estimate the severity: Minor inconvenience → Significant risk → Potential blocker</action>
</step>

<step n="5" goal="Calculate Complexity Rank">
  <action>For each option, rate implementation complexity on a 1-5 scale:</action>
    - **1 — Trivial**: Drop-in solution, team has experience, minimal configuration
    - **2 — Low**: Well-documented path, minor learning curve, standard patterns
    - **3 — Moderate**: Some unknowns, requires investigation, new tooling needed
    - **4 — High**: Significant learning curve, custom integration work, operational overhead
    - **5 — Very High**: Bleeding edge, few references, high risk of unforeseen issues
  <action>Factor in:</action>
    - Team familiarity with the technology
    - Existing infrastructure compatibility
    - Testing and deployment complexity
    - Monitoring and debugging capabilities
  <action>Justify each rank with a brief explanation</action>
</step>

<step n="6" goal="Compile Trade-off Matrix">
  <action>Assemble the 5-column trade-off table:</action>

  | Option | Pros | Cons | Complexity Rank | Recommendation |
  |--------|------|------|-----------------|----------------|
  | ...    | ...  | ...  | ...             | ...            |

  <action>The Recommendation column should contain one of:</action>
    - ✅ **Recommended** — Best fit for the project
    - 🟡 **Consider** — Viable but not the best fit
    - ❌ **Not Recommended** — Too risky, too complex, or poor fit

  <action>Present the matrix to the user</action>
  <ask>Review the trade-off matrix. Would you like to:
  1. **Challenge** any specific assessment
  2. **Add criteria** that should influence the decision
  3. **Accept** the analysis</ask>
</step>

<step n="7" goal="Write Final Recommendation">
  <action>Based on the matrix, write a clear recommendation:</action>
    - State the recommended option unambiguously
    - Explain the primary justification (the single strongest reason)
    - Address the biggest risk of the recommended option and how to mitigate it
    - Describe the fallback plan if the recommendation proves wrong
    - Estimate the point of no return (when is it too late to switch?)

  <action>If the decision is genuinely close (two options are nearly equal), state that explicitly and specify what new information would tip the decision</action>
</step>

<step n="8" goal="Workflow Completion">
  <action>Summarize the advisory session:</action>
    - Gray area resolved: {{gray_area_description}}
    - Options evaluated: {{option_count}}
    - Recommendation: {{recommended_option}}
    - Confidence level: {{high/medium/low}}
  <action>Report workflow completion: "✅ Trade-off Advisor workflow complete, {user_name}!"</action>
  <action>Suggest next steps (e.g., create an ADR for the decision, update architecture doc, run assumptions-analyzer on the chosen approach)</action>
</step>

</workflow>
