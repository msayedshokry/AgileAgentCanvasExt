# Test Classification Strategy - Pre-Test Triage Instructions

<critical>The workflow execution engine is governed by: {bmad-path}/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {bmad-path}/bmm/workflows/4-review/test-classification/workflow.yaml</critical>
<critical>Communicate all responses in {communication_language}</critical>

<critical>DOCUMENT OUTPUT: A structured Test Classification Plan that categorizes every changed file into TDD, E2E, or Skip before any test code is written. This plan prevents wasted effort on untestable or low-value targets and ensures high-value code gets the right testing approach.</critical>

<workflow>

<step n="1" goal="Initialize Classification Scope">
  <action>Confirm the scope of files to classify with the user</action>
  <ask>"What should I classify for testing?
  1. **Story changes** — All files changed or created for a specific story
  2. **PR/Diff** — All files in a pending pull request or diff
  3. **Directory** — All files within a specific module or directory
  4. **Full audit** — Classify testability of the entire codebase"</ask>
  <action>Gather the list of target files</action>
  <action>Load the project's existing test infrastructure context:</action>
    - What test framework is in use? (Jest, Vitest, Pytest, Playwright, Cypress, etc.)
    - What is the current test coverage baseline?
    - Are there existing test patterns or conventions?

<action if="no files provided">HALT: "Cannot classify tests without a list of files to analyze. Provide a story reference, diff, or directory."</action>
</step>

<step n="2" goal="File-Level Heuristic Classification">
  <action>For each target file, apply the following heuristic rules to categorize it:</action>

  <action>Category: TDD (Test-Driven Development) 🧪</action>
  Files that contain isolated business logic and should have unit/integration tests:
    - Service classes with business rules
    - Utility/helper functions with transformations or calculations
    - Data access layers with query logic
    - Validators, parsers, formatters
    - State management logic (reducers, stores, slices)
    - API route handlers with non-trivial logic
    - Configuration builders or factories

  <action>Category: E2E (End-to-End Testing) 🌐</action>
  Files that are best tested through the running application:
    - UI components with complex user interactions
    - Page-level components that compose multiple elements
    - Multi-step workflows or wizards
    - Features requiring authentication/authorization context
    - Real-time features (WebSocket, SSE)
    - File upload/download flows
    - Payment or checkout flows

  <action>Category: SKIP ⏭️</action>
  Files where writing tests adds minimal value:
    - Auto-generated code (Prisma client, GraphQL codegen, protobuf stubs)
    - Type definition files (.d.ts, interfaces-only files)
    - Configuration files (tsconfig, eslint, prettier)
    - Static assets (images, fonts, CSS that doesn't contain logic)
    - Migration files (already tested by the migration runner)
    - Barrel/index files that only re-export
    - Constants-only files with no logic
    - Environment variable declarations

  <action>For ambiguous files, default to TDD unless the file is purely presentational</action>
</step>

<step n="3" goal="Dependency and Mock Analysis">
  <action>For each TDD-classified file, assess testability:</action>
    - Can it be tested in isolation? What needs to be mocked?
    - Does it depend on external services that require test doubles?
    - Is the dependency injection pattern clean or does it use hard-coded instantiation?
  <action>Flag files that are technically TDD-classified but difficult to test due to:</action>
    - Heavy coupling to database or file system
    - Side effects embedded in business logic
    - Global state dependencies
  <action>For these files, recommend refactoring before testing OR reclassify to E2E</action>

  <action>For each E2E-classified file, assess test environment needs:</action>
    - What services must be running? (database, auth provider, API server)
    - Are there test fixtures or seed data needed?
    - What user flows exercise this component?
</step>

<step n="4" goal="Priority Ranking">
  <action>Within each category, rank files by testing priority:</action>

  <action>Priority criteria:</action>
    - 🔴 **P0 — Critical Path**: Core business logic, payment flows, auth, data integrity
    - 🟡 **P1 — Important**: Feature logic, API handlers, data transformations
    - 🟢 **P2 — Nice to Have**: UI polish, logging, non-critical utilities

  <action>For TDD files, prioritize by:</action>
    - Cyclomatic complexity (more branches = higher priority)
    - Business impact (revenue-affecting > convenience)
    - Change frequency (frequently changed code benefits most from tests)

  <action>For E2E files, prioritize by:</action>
    - User journey criticality (can the user accomplish the primary goal?)
    - Failure visibility (what happens if this breaks in production?)
    - Test flakiness risk (stable paths first, flaky-prone paths need careful design)
</step>

<step n="5" goal="Compile Test Classification Plan">
  <action>Compile the final Test Classification Plan with the following structure:</action>

  <action>Section 1: Summary Statistics</action>
    - Total files analyzed: {{total}}
    - TDD: {{tdd_count}} | E2E: {{e2e_count}} | Skip: {{skip_count}}
    - P0 Critical: {{p0_count}} | P1 Important: {{p1_count}} | P2 Nice-to-have: {{p2_count}}

  <action>Section 2: TDD Classification Table</action>

  | File | Priority | Reasoning | Mock Requirements | Estimated Effort |
  |------|----------|-----------|-------------------|------------------|
  | ...  | ...      | ...       | ...               | ...              |

  <action>Section 3: E2E Classification Table</action>

  | File | Priority | User Flow | Prerequisites | Estimated Effort |
  |------|----------|-----------|---------------|------------------|
  | ...  | ...      | ...       | ...           | ...              |

  <action>Section 4: Skip Classification Table</action>

  | File | Skip Reason |
  |------|-------------|
  | ...  | ...         |

  <action>Section 5: Testability Risks</action>
    - Files that need refactoring before testing
    - Dependencies on unstable external systems
    - Known flaky test patterns to avoid

  <action>Present the plan to the user</action>
  <ask>Review the Test Classification Plan. Would you like to:
  1. **Override** any classifications
  2. **Adjust** priorities
  3. **Accept** and proceed to test generation</ask>
</step>

<step n="6" goal="Workflow Completion">
  <action>Summarize the classification session:</action>
    - Scope classified: {{scope_description}}
    - Total files: {{total}} (TDD: {{tdd}}, E2E: {{e2e}}, Skip: {{skip}})
    - Critical P0 test targets: {{p0_list}}
    - Testability risks: {{risk_count}}
  <action>Report workflow completion: "✅ Test Classification workflow complete, {user_name}!"</action>
  <action>Suggest next steps (e.g., generate test stubs for P0 TDD files, create Playwright tests for P0 E2E files, run testarch-automate for batch generation)</action>
</step>

</workflow>
