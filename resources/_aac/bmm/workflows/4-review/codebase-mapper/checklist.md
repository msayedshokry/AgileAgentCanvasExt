# Codebase Mapper Review Checklist

<critical>This checklist is executed as part of: {bmad-path}/bmm/workflows/4-review/codebase-mapper/workflow.yaml</critical>
<critical>Work through each section systematically, recording findings for the Architectural Map</critical>

<checklist>

<section n="1" title="Scope and Context Verification">

<check-item id="1.1">
<prompt>Confirm target scope is well-defined</prompt>
<action>Is the mapping scope clearly bounded (full project, specific directory, or affected paths)?</action>
<action>Are all target files/directories accessible for analysis?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="1.2">
<prompt>Identify the primary language and framework</prompt>
<action>What is the primary programming language?</action>
<action>What framework or runtime is used (Express, Next.js, Spring, Django, etc.)?</action>
<action>Are there secondary languages (e.g., TypeScript + Python)?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<halt-condition>
<action if="scope is undefined">HALT: "Cannot begin mapping without a defined scope"</action>
<action if="codebase is not accessible">HALT: "Cannot proceed without access to the target codebase"</action>
</halt-condition>

</section>

<section n="2" title="Entry Point Discovery">

<check-item id="2.1">
<prompt>Identify application entry points</prompt>
<action>Locate main/index files that bootstrap the application</action>
<action>Identify server startup files (e.g., server.ts, app.py, main.go)</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="2.2">
<prompt>Identify API and route entry points</prompt>
<action>Map all route registration files or controller directories</action>
<action>Identify middleware chains and their order</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="2.3">
<prompt>Identify event-driven entry points</prompt>
<action>Locate queue consumers, event listeners, webhook handlers</action>
<action>Identify scheduled jobs or cron tasks</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="3" title="Module Boundary Mapping">

<check-item id="3.1">
<prompt>Map top-level directory structure</prompt>
<action>Document the purpose of each top-level directory</action>
<action>Identify the organizational pattern (by feature, by layer, by domain)</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="3.2">
<prompt>Identify public interfaces vs. internal implementation</prompt>
<action>Which modules expose public APIs (index files, barrel exports)?</action>
<action>Which modules are internal-only?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="3.3">
<prompt>Detect shared code and cross-cutting concerns</prompt>
<action>Identify shared utilities, common types, or base classes</action>
<action>Flag cross-cutting concerns (logging, auth, error handling)</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="4" title="Dependency Analysis">

<check-item id="4.1">
<prompt>Map internal module dependencies</prompt>
<action>Which modules depend on which other modules?</action>
<action>Does the dependency direction match the intended architecture?</action>
<action>Are there any circular dependencies?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="4.2">
<prompt>Catalog critical external dependencies</prompt>
<action>List frameworks, ORMs, auth libraries, cloud SDKs</action>
<action>Flag any outdated, unmaintained, or high-risk dependencies</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="5" title="Data Flow Tracing">

<check-item id="5.1">
<prompt>Trace primary data entry paths</prompt>
<action>How does data enter the system (HTTP, WebSocket, CLI, queue)?</action>
<action>Where is data validated and sanitized?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="5.2">
<prompt>Trace data transformation and persistence</prompt>
<action>Where does business logic transform data?</action>
<action>How is state persisted (database, cache, file system)?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="5.3">
<prompt>Trace data exit paths</prompt>
<action>How does data leave the system (API responses, events, external calls)?</action>
<action>Are there any sensitive data paths that require special handling?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="6" title="Risk and Coupling Assessment">

<check-item id="6.1">
<prompt>Identify structural bottlenecks</prompt>
<action>Flag god classes or files with excessive responsibility</action>
<action>Flag modules with too many inbound or outbound dependencies</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="6.2">
<prompt>Assess coupling levels</prompt>
<action>Are there areas where a small change forces modifications in many files?</action>
<action>Are there circular dependency clusters?</action>
<action>Do any modules mix concerns (e.g., business logic in UI components)?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="6.3">
<prompt>Rate and document risk zones</prompt>
<action>Assign risk levels: 🔴 High, 🟡 Medium, 🟢 Low</action>
<action>Provide specific recommendations for each risk zone</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="7" title="Final Map Compilation">

<check-item id="7.1">
<prompt>Verify Architectural Map completeness</prompt>
<action>Does the map include all 6 required sections (Overview, Entry Points, Module Boundaries, Dependencies, Data Flows, Risk Zones)?</action>
<action>Are findings specific and actionable, not generic?</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="7.2">
<prompt>Obtain user review and approval</prompt>
<action>Present complete map to user</action>
<action>Get approval or iterate on feedback</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<halt-condition>
<action if="map is incomplete">HALT: "Cannot finalize map without completing all required sections"</action>
</halt-condition>

</section>

</checklist>

<execution-notes>
<note>Focus on actionable findings, not academic analysis</note>
<note>Use concrete file paths and code references, never vague descriptions</note>
<note>Risk assessments must be justified with specific evidence from the codebase</note>
<note>The map should be useful for any developer or agent starting work in this codebase</note>
</execution-notes>
