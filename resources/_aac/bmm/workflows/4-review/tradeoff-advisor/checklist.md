# Trade-off Advisor Checklist

<critical>This checklist is executed as part of: {bmad-path}/bmm/workflows/4-review/tradeoff-advisor/workflow.yaml</critical>
<critical>Work through each section systematically to produce a rigorous trade-off analysis</critical>

<checklist>

<section n="1" title="Gray Area Definition">

<check-item id="1.1">
<prompt>Confirm the technical decision is specific and bounded</prompt>
<action>Is the gray area narrowed to a concrete choice with 2-5 options?</action>
<action>Are the constraints (timeline, team, budget, compliance) documented?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="1.2">
<prompt>Load supporting context</prompt>
<action>Is the architecture document, PRD, or codebase context available?</action>
<action>Are prior architectural decisions that constrain this choice documented?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<halt-condition>
<action if="gray area is too broad">HALT: "Narrow the question to a specific choice with concrete options"</action>
</halt-condition>

</section>

<section n="2" title="Option Enumeration">

<check-item id="2.1">
<prompt>List all viable options</prompt>
<action>Are there at least 2 options and no more than 5?</action>
<action>Has the user confirmed the option set is complete?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="3" title="Pros Analysis">

<check-item id="3.1">
<prompt>Verify pros are project-specific, not generic</prompt>
<action>Does each pro reference specific project constraints or requirements?</action>
<action>Are pros backed by evidence (benchmarks, docs, team experience)?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="4" title="Cons Analysis">

<check-item id="4.1">
<prompt>Verify cons are honest and specific</prompt>
<action>Are real risks acknowledged, not softened?</action>
<action>Is severity estimated for each con (minor / significant / blocker)?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="5" title="Complexity Ranking">

<check-item id="5.1">
<prompt>Verify complexity ranks are justified</prompt>
<action>Is each 1-5 rank explained with specific reasoning?</action>
<action>Does ranking factor in team familiarity, infrastructure, and testing?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="6" title="Matrix and Recommendation">

<check-item id="6.1">
<prompt>Verify the 5-column matrix is complete</prompt>
<action>Does the table have Option, Pros, Cons, Complexity Rank, and Recommendation columns?</action>
<action>Is exactly one option marked ✅ Recommended?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="6.2">
<prompt>Verify the final recommendation is actionable</prompt>
<action>Is the primary justification clearly stated?</action>
<action>Is the biggest risk of the recommendation acknowledged with a mitigation plan?</action>
<action>Is a fallback plan described?</action>
<action>Is the point of no return estimated?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="6.3">
<prompt>Obtain user review and approval</prompt>
<action>Has the user reviewed and accepted the analysis?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<halt-condition>
<action if="no clear recommendation">HALT: "Analysis must produce an unambiguous recommendation"</action>
</halt-condition>

</section>

</checklist>

<execution-notes>
<note>Never present generic technology comparisons — every point must be relevant to THIS project</note>
<note>If the decision is genuinely close, say so explicitly and specify what would tip it</note>
<note>The recommendation must be unambiguous — "it depends" is not acceptable</note>
<note>Always include a fallback plan — what if the recommendation is wrong?</note>
</execution-notes>
