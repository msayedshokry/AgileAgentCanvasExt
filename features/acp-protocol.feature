Feature: ACP Protocol - Agent Coordination Protocol
  As an AgileAgentCanvas user
  I want the ACP protocol to manage multi-agent session lifecycles
  So that agents can be spawned, prompted, executed, and completed reliably

  Background:
    Given a fresh ACP session manager

  # ─── Session Lifecycle: Spawn ─────────────────────────────────────────────

  @acp @spawn
  Scenario: Spawn a new ACP session with coordinator role
    When I spawn an ACP session with spec:
      | role        | coordinator           |
      | personaId   | bmad-agent-pm         |
      | task        | Plan the sprint       |
    Then the ACP session ID should match pattern "acp-\\d+-[a-z0-9]+"
    And the session role should be "coordinator"
    And the ACP session status should be "pending"
    And the session should have 1 events

  @acp @spawn
  Scenario: Spawn session loads persona from agent-personas module
    When I spawn an ACP session with spec:
      | role        | crafter               |
      | personaId   | bmad-agent-dev        |
      | task        | Implement feature     |
    Then the session persona should be defined
    And the session persona ID should be "bmad-agent-dev"

  @acp @spawn
  Scenario: Spawn session emits spawned event
    When I subscribe to ACP events for the next session
    And I spawn an ACP session with spec:
      | role        | researcher            |
      | personaId   | bmad-agent-analyst    |
      | task        | Research requirements |
    Then a "spawned" event should have been emitted for the session

  @acp @spawn
  Scenario: Spawn session with parent session reference
    When I spawn an ACP session with parentSessionId "acp-parent-001"
    Then the session context parentSessionId should be "acp-parent-001"

  @acp @spawn
  Scenario: Spawn multiple sessions have unique IDs
    When I spawn ACP sessions with spec:
      | role        | personaId          | task             |
      | coordinator | bmad-agent-pm      | Plan sprint      |
      | crafter     | bmad-agent-dev     | Implement        |
    Then the spawned sessions should have unique IDs
    And both sessions should have status "pending"

  # ─── Session Lifecycle: Execute ───────────────────────────────────────────

  @acp @execute
  Scenario: Execute a session transitions to prompting then executing
    Given I spawn an ACP session with spec:
      | role        | coordinator           |
      | personaId   | bmad-agent-pm         |
      | task        | Plan the sprint       |
    When I execute the session with a mock model
    Then the ACP session status should be "completed"
    And a "prompting" event should have been emitted
    And an "executing" event should have been emitted

  @acp @execute
  Scenario: Execute session emits completed event on success
    Given I spawn an ACP session with spec:
      | role        | crafter               |
      | personaId   | bmad-agent-dev        |
      | task        | Implement story       |
    When I execute the session with a mock model that returns success
    Then the ACP session status should be "completed"
    And a "completed" event should have been emitted
    And the session result status should be "completed"
    And the session result toolCalls should be a number

  @acp @execute
  Scenario: Execute session emits failed event on error
    Given I spawn an ACP session with spec:
      | role        | coordinator           |
      | personaId   | bmad-agent-pm         |
      | task        | Plan sprint           |
    When I execute the session with a mock model that throws
    Then the ACP session status should be "failed"
    And a "failed" event should have been emitted
    And the session result error should be defined

  @acp @execute
  Scenario: Execute session emits cancelled event on cancellation
    Given I spawn an ACP session with spec:
      | role        | researcher            |
      | personaId   | bmad-agent-analyst    |
      | task        | Research              |
    When I execute the session with cancellation during execution
    Then the ACP session status should be "cancelled"
    And a "cancelled" event should have been emitted
    And the session result status should be "cancelled"

  @acp @execute
  Scenario: Session build prompt includes persona and task
    Given I spawn an ACP session with spec:
      | role        | coordinator           |
      | personaId   | bmad-agent-pm         |
      | task        | Define requirements   |
      | constraints | Use JSON output       |
    When I build the ACP prompt for the session
    Then the prompt should contain "Define requirements"
    And the prompt should contain "Use JSON output"
    And the persona should be included in the prompt

  # ─── Session Lifecycle: Events ────────────────────────────────────────────

  @acp @events
  Scenario: Session events are recorded in chronological order
    Given I spawn an ACP session with spec:
      | role        | coordinator           |
      | personaId   | bmad-agent-pm         |
      | task        | Plan                  |
    When I execute the session with a mock model
    Then the session events should have timestamps in order
    And the events should include types "spawned", "prompting", "executing", "completed"

  @acp @events
  Scenario: Event emitter fires for subscribers
    Given I spawn an ACP session with spec:
      | role        | crafter               |
      | personaId   | bmad-agent-dev        |
      | task        | Code                  |
    When I subscribe to events for the session
    And I execute the session with a mock model
    Then the subscriber should have received a "completed" event

  @acp @events
  Scenario: Event emitter returns noop for unknown session
    When I subscribe to events for session "non-existent-session"
    Then the disposable should be a no-op

  # ─── Session Lifecycle: Dispose ───────────────────────────────────────────

  @acp @dispose
  Scenario: Dispose session manager cancels all running sessions
    Given I spawn an ACP session with spec:
      | role        | coordinator           |
      | personaId   | bmad-agent-pm         |
      | task        | Plan                  |
    And the session is running
    When I dispose the ACP session manager
    Then the ACP session status should be "cancelled"

  @acp @dispose
  Scenario: Dispose session manager clears all sessions
    Given I spawn 3 ACP sessions
    When I dispose the ACP session manager
    Then no sessions should be retrievable

  # ─── ACP Types ────────────────────────────────────────────────────────────

  @acp @types
  Scenario: AcpSessionSpec has correct structure
    Given an ACP session spec with:
      | role        | coordinator           |
      | personaId   | bmad-agent-pm         |
      | task        | Plan                  |
    Then the spec should have required fields
    And the spec context should contain task and artifact fields

  @acp @types
  Scenario: AcpSessionResult has correct structure on completion
    Given I spawn and execute an ACP session successfully
    Then the result should have sessionId, role, status, and output
    And the result should have startedAt and completedAt timestamps
    And the result should have events array

  @acp @types
  Scenario: AcpHandoff has correct structure
    Given an ACP handoff from session "acp-1" to session "acp-2"
    Then the handoff should have fromSessionId and toSessionId
    And the handoff context should contain task and intermediateArtifacts

  @acp @types
  Scenario: AgentRole is one of the valid roles
    Given an ACP session spec with role "coordinator"
    And an ACP session spec with role "crafter"
    And an ACP session spec with role "gate"
    And an ACP session spec with role "researcher"
    Then all session specs should be valid

  # ─── Session Manager Singleton ────────────────────────────────────────────

  @acp @singleton
  Scenario: Session manager singleton is initialized in extension.ts
    When I initialize the ACP session manager with a mock executor
    Then the ACP session manager singleton should be defined

  @acp @singleton
  Scenario: getSession returns undefined for unknown session
    Given a fresh ACP session manager
    When I get session "unknown-id-123"
    Then the returned session should be undefined
