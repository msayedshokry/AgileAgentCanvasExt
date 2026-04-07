# Codebase Mapper - Structural Discovery Instructions

<critical>The workflow execution engine is governed by: {bmad-path}/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {bmad-path}/bmm/workflows/4-review/codebase-mapper/workflow.yaml</critical>
<critical>Communicate all responses in {communication_language}</critical>

<critical>DOCUMENT OUTPUT: A structured Architectural Map document covering entry points, module boundaries, dependency graph, data flows, and risk zones. This document should be actionable for any developer or agent about to work on the mapped codebase.</critical>

<workflow>

<step n="1" goal="Initialize Mapping Scope">
  <action>Confirm the target scope with the user</action>
  <ask>"What area of the codebase should I map? Options:
  1. **Full Project** — Map the entire repository structure
  2. **Specific Directory** — Focus on a particular module or package
  3. **Affected Paths** — Map only paths relevant to a specific story or epic"</ask>
  <action>Gather the file paths, directories, or artifact references to analyze</action>
  <action>Verify access to the target codebase or provided file contents</action>

<action if="no codebase context provided">HALT: "Cannot perform structural discovery without codebase access. Please provide file paths, directory listings, or paste relevant code."</action>
</step>

<step n="2" goal="Structural Discovery — Entry Points and Module Boundaries">
  <action>Identify and document all entry points in the target scope:</action>
    - Application entry points (main files, index files, server bootstrap)
    - API route handlers or controller registrations
    - Event listeners, queue consumers, or scheduled jobs
    - CLI commands or script entry points
  <action>Map the module boundaries:</action>
    - Top-level directory organization and naming conventions
    - Package/module separation patterns (monorepo, multi-package, layered)
    - Shared code vs. module-specific code
    - Public interfaces vs. internal implementation details
  <action>Identify the architectural pattern in use:</action>
    - Layered (Controller → Service → Repository)
    - Hexagonal / Ports & Adapters
    - Event-driven / Message-based
    - Monolith, Microservices, or Hybrid
  <action>Record findings in a structured summary table</action>

<action if="module boundaries are unclear">Flag as RISK: "Unclear module boundaries may indicate tightly coupled code. Document the ambiguity and proceed with best-guess mapping."</action>
</step>

<step n="3" goal="Dependency Graphing — Internal and External">
  <action>Map internal dependencies between modules/classes:</action>
    - Which modules import from which other modules?
    - Are there circular dependencies?
    - What is the dependency direction? (Does it follow the intended architecture?)
  <action>Catalog external dependencies that govern core logic:</action>
    - Frameworks (e.g., Express, Next.js, Spring Boot)
    - ORMs and database drivers
    - Authentication/authorization libraries
    - Message brokers, cache clients, cloud SDKs
  <action>Identify dependency risk factors:</action>
    - Deeply nested dependency chains (A → B → C → D)
    - Single points of failure (one library used everywhere)
    - Outdated or unmaintained dependencies
    - License incompatibilities
  <action>Produce a dependency summary (text-based or Mermaid diagram if supported)</action>
</step>

<step n="4" goal="Data Flow Analysis">
  <action>Trace how data enters the system:</action>
    - HTTP requests, WebSocket connections, file uploads
    - Queue messages, webhook payloads, cron triggers
    - User input from CLI or UI
  <action>Trace how data is transformed:</action>
    - Validation and sanitization layers
    - Business logic transformations
    - State mutations (database writes, cache updates)
    - Event emissions or message publishing
  <action>Trace how data exits the system:</action>
    - API responses, rendered views
    - Database persistence
    - External API calls, message publications
    - File outputs, logs, metrics
  <action>Document the critical data paths, especially those that touch sensitive data (PII, credentials, financial)</action>
</step>

<step n="5" goal="Risk and Coupling Assessment">
  <action>Identify structural bottlenecks:</action>
    - God classes or files with excessive responsibility
    - Modules with too many inbound or outbound dependencies
    - Shared mutable state or global singletons
  <action>Identify highly-coupled zones:</action>
    - Areas where a small change would force modifications in many other files
    - Circular dependency clusters
    - Modules that mix concerns (e.g., business logic in controllers)
  <action>Rate each risk zone:</action>
    - 🔴 **High Risk** — Changes here will likely break other modules
    - 🟡 **Medium Risk** — Changes here need careful coordination
    - 🟢 **Low Risk** — Well-isolated, safe to modify independently
  <action>Produce a risk summary table with zone, risk level, and recommendation</action>
</step>

<step n="6" goal="Produce Architectural Map Document">
  <action>Compile all findings into the final Architectural Map with these sections:</action>

  <action>Section 1: Overview</action>
    - Project type, framework, primary language
    - Architectural pattern identified
    - Total scope analyzed (directories, files, lines if available)

  <action>Section 2: Entry Points</action>
    - Table of all entry points with type, file path, and description

  <action>Section 3: Module Boundary Map</action>
    - Visual or textual representation of module organization
    - Public interfaces for each module

  <action>Section 4: Dependency Graph</action>
    - Internal dependency relationships
    - Key external dependencies and their roles

  <action>Section 5: Data Flow Summary</action>
    - Critical data paths from entry to exit
    - Sensitive data handling notes

  <action>Section 6: Risk Zones</action>
    - Risk-rated summary of problematic areas
    - Specific recommendations for each risk zone

  <action>Present the complete Architectural Map to the user</action>
  <ask>Review the map. Would you like to:
  1. **Refine** a specific section
  2. **Deep-dive** into a particular module
  3. **Accept** the map as-is</ask>
</step>

<step n="7" goal="Workflow Completion">
  <action>Summarize the mapping session:</action>
    - Scope mapped: {{scope_description}}
    - Modules identified: {{module_count}}
    - Risk zones flagged: {{risk_count}}
    - Key recommendations: {{top_recommendations}}
  <action>Report workflow completion: "✅ Codebase Mapper workflow complete, {user_name}!"</action>
  <action>Suggest next steps based on findings (e.g., run assumptions-analyzer on high-risk zones, or run code-review on coupled areas)</action>
</step>

</workflow>
