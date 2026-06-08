Feature: Trace Recorder - Execution Trace Recording and Viewing
  As an AgileAgentCanvas user
  I want agent actions, LLM responses, and tool calls to be recorded as traces
  So that I can inspect, search, and review what happened during a session

  Background:
    Given a fresh trace recorder with a temp output folder

  # ─── Trace Recording ───────────────────────────────────────────────────────

  @trace @record
  Scenario: Record a tool_call trace entry
    When I record a trace entry with:
      | sessionId | session-001     |
      | type      | tool_call       |
      | agent     | analyst         |
      | toolName  | read_file       |
    Then the trace should have been recorded without error
    And the trace entry should have a timestamp

  @trace @record
  Scenario: Record an llm_response trace entry
    When I record a trace entry with:
      | sessionId  | session-002     |
      | type       | llm_response    |
      | agent      | analyst         |
      | llmPrompt  | What is the goal?  |
      | llmResponse| The goal is to... |
    Then the trace entry data should contain the prompt and response

  @trace @record
  Scenario: Record an artifact_change trace entry
    When I record a trace entry with:
      | sessionId    | session-003     |
      | type         | artifact_change |
      | agent        | executor        |
      | artifactId   | EPIC-1          |
      | artifactType | epic            |
      | changeSummary| Updated title   |
    Then the trace entry artifactId should be "EPIC-1"
    And the trace entry changeSummary should be "Updated title"

  @trace @record
  Scenario: Record a decision trace entry
    When I record a trace entry with:
      | sessionId | session-004     |
      | type      | decision        |
      | agent     | harness         |
      | decision  | Policy passed   |
      | rationale | All checks ok   |
    Then the trace entry decision should be "Policy passed"

  @trace @record
  Scenario: Record an error trace entry
    When I record a trace entry with:
      | sessionId | session-005     |
      | type      | error           |
      | agent     | analyst         |
      | error     | Invalid schema |
    Then the trace entry data error should be "Invalid schema"
    And the trace entry durationMs should be undefined

  @trace @record
  Scenario: Record entries for multiple sessions
    When I record a trace entry for session "session-a"
    And I record a trace entry for session "session-b"
    Then session "session-a" should have 1 trace entry
    And session "session-b" should have 1 trace entry

  # ─── Entry Fields ─────────────────────────────────────────────────────────

  @trace @fields
  Scenario: Trace entry has durationMs when provided
    When I record a trace entry with type "tool_call" and durationMs 150
    Then the trace entry durationMs should be 150

  @trace @fields
  Scenario: Trace entry handoff fields
    When I record a trace entry with type "handoff" and:
      | sessionId   | session-006     |
      | handoffFrom | session-005     |
      | handoffTo   | session-007     |
      | contextSummary | Passed artifact |
    Then the trace entry data handoffFrom should be "session-005"
    And the trace entry data handoffTo should be "session-007"

  # ─── JSONL Flushing ────────────────────────────────────────────────────────

  @trace @flush
  Scenario: Flush writes entries to session JSONL file
    When I record 3 trace entries for session "session-flush"
    And I flush the trace for session "session-flush"
    Then the file "session-flush.jsonl" should exist
    And the file should contain 3 valid JSON lines

  @trace @flush
  Scenario: Auto-flush happens after timeout
    When I record 2 trace entries for session "session-auto"
    And I wait for the flush timer
    Then the file "session-auto.jsonl" should exist
    And the file should contain 2 valid JSON lines

  @trace @flush
  Scenario: Empty buffers are not flushed
    When I flush the trace for session "session-empty"
    Then no file should be created for "session-empty"

  @trace @flush
  Scenario: Duplicate flush timer is not scheduled
    When I record 2 trace entries for session "session-dedup"
    And I record 1 more trace entry for session "session-dedup"
    Then only 1 flush timer should have been scheduled

  # ─── getSessionTrace ──────────────────────────────────────────────────────

  @trace @retrieve
  Scenario: getSessionTrace returns entries in order
    Given 3 trace entries have been recorded for session "session-ord"
    When I get the session trace for "session-ord"
    Then I should receive 3 entries
    And the entries should be in recorded order

  @trace @retrieve
  Scenario: getSessionTrace returns empty for unknown session
    When I get the session trace for "session-unknown"
    Then I should receive an empty array

  @trace @retrieve
  Scenario: getSessionTrace handles corrupt file gracefully
    Given a valid session with 2 entries exists
    And the JSONL file has a corrupt line appended
    When I get the session trace for that session
    Then valid entries should still be returned
    And an error should not be thrown

  # ─── searchTraces ─────────────────────────────────────────────────────────

  @trace @search
  Scenario: searchTraces filters by artifactId
    Given trace entries exist across sessions
    When I search traces with artifactId "EPIC-1"
    Then only entries with artifactId "EPIC-1" should be returned

  @trace @search
  Scenario: searchTraces filters by agent
    Given trace entries exist for agents "analyst" and "harness"
    When I search traces with agent "harness"
    Then all returned entries should have agent "harness"

  @trace @search
  Scenario: searchTraces filters by type
    Given trace entries of types "tool_call", "decision", and "error"
    When I search traces with type "error"
    Then all returned entries should have type "error"

  @trace @search
  Scenario: searchTraces filters by date range
    Given trace entries from 3 days ago and today
    When I search traces with since "2 days ago"
    Then only today's entry should be returned

  @trace @search
  Scenario: searchTraces respects limit
    Given 10 trace entries exist
    When I search traces with limit 5
    Then I should receive at most 5 entries

  @trace @search
  Scenario: searchTraces returns empty when no traces dir
    Given the traces directory does not exist
    When I search traces with no filters
    Then the search results should be an empty array

  # ─── flushAll ──────────────────────────────────────────────────────────────

  @trace @flushall
  Scenario: flushAll flushes all pending buffers
    When I record entries for session "s1", "s2", and "s3"
    And I call flushAll
    Then files for "s1", "s2", and "s3" should exist

  # ─── dispose ──────────────────────────────────────────────────────────────

  @trace @dispose
  Scenario: Dispose clears all pending timeouts
    When I record entries for session "s1" and "s2"
    And I dispose the trace recorder
    Then all flush timers should be cleared
    And the pending entries should have been flushed

  # ─── Singleton ────────────────────────────────────────────────────────────

  @trace @singleton
  Scenario: initializeTraceRecorder creates singleton
    When I initialize the trace recorder with path "/tmp/traces"
    Then the trace recorder should be defined
    And the output folder should be "/tmp/traces/traces"

  @trace @singleton
  Scenario: initializeTraceRecorder replaces existing instance
    When I initialize the trace recorder with path "/tmp/first"
    And I initialize the trace recorder with path "/tmp/second"
    Then the output folder should be "/tmp/second/traces"
    And the first instance should have been disposed

  @trace @singleton
  Scenario: getTraceRecorder throws if not initialized
    Given the trace recorder is not initialized
    When I call getTraceRecorder
    Then an error should be thrown with message containing "not initialized"

  # ─── Tool Tracer Wrapper ──────────────────────────────────────────────────

  @trace @wrappertool
  Scenario: wrapToolWithTracing records successful tool call
    Given a mock language model tool
    When I wrap the tool with tracing for session "s1" and agent "analyst" and tool name "my_tool"
    And I invoke the wrapped tool with inputs { key: "value" }
    Then the tool should have returned the result
    And a "tool_call" trace entry should have been recorded for session "s1"
    And the trace entry data should contain toolName "my_tool"
    And the trace entry should have a durationMs

  @trace @wrappertool
  Scenario: wrapToolWithTracing records error on failure
    Given a mock language model tool that throws
    When I wrap the tool with tracing for session "s1" and agent "analyst" and tool name "my_tool"
    And I invoke the wrapped tool
    Then an error should have been thrown
    And an "error" trace entry should have been recorded
    And the error trace entry should contain the error message

  # ─── Trace Commands ────────────────────────────────────────────────────────

  @trace @commands
  Scenario: openTraceViewer shows picker when no session ID
    Given recent trace sessions exist
    When I execute the trace command "agileagentcanvas.openTraceViewer"
    Then a quick pick should have been shown with session options

  @trace @commands
  Scenario: openTraceViewer opens webview panel for session ID
    When I execute the trace command "agileagentcanvas.openTraceViewer" with session "session-001"
    Then a webview panel should have been created
    And the panel title should contain "session-001"

  @trace @commands
  Scenario: openTraceViewer shows info when no sessions
    Given no trace sessions exist
    When I execute the command "agileagentcanvas.openTraceViewer"
    Then trace showInformationMessage should have been called with "No trace sessions found"

  @trace @commands
  Scenario: openTraceViewer does nothing when picker cancelled
    Given recent trace sessions exist
    And the trace user cancels the quick pick
    When I execute the trace command "agileagentcanvas.openTraceViewer"
    Then no webview panel should have been created

  @trace @commands
  Scenario: clearOldTraces deletes files older than retention days
    Given trace files exist with various ages
    When I execute the trace command "agileagentcanvas.clearOldTraces"
    Then files older than 30 days should have been deleted
    And a confirmation message should have been shown with deleted count

  @trace @commands
  Scenario: clearOldTraces shows info when nothing to clear
    Given no trace files are older than 30 days
    When I execute the trace command "agileagentcanvas.clearOldTraces"
    Then trace showInformationMessage should have been called with "No traces older"
