Feature: Agent Team - Multi-Agent Orchestration
  As an AgileAgentCanvas user
  I want to orchestrate teams of specialist agents
  So that complex tasks are decomposed and executed by role-specific agents

  Background:
    Given a fresh ACP session manager
    Given a fresh agent team orchestrator

  # ─── Team Registry ─────────────────────────────────────────────────────────

  @team @registry
  Scenario: TEAM_REGISTRY contains the dev-story team
    Then the team registry should contain team "dev-story"
    And the "dev-story" team should have 3 members
    And the "dev-story" team members should include roles "coordinator", "crafter", "gate"

  @team @registry
  Scenario: TEAM_REGISTRY contains the create-prd team
    Then the team registry should contain team "create-prd"
    And the "create-prd" team should have 3 members
    And the "create-prd" team members should include roles "researcher", "coordinator", "gate"

  @team @registry
  Scenario: Agent team members have correct order
    When I inspect team "dev-story" members
    Then member at order 1 should have role "coordinator"
    And member at order 2 should have role "crafter"
    And member at order 3 should have role "gate"

  @team @registry
  Scenario: Team references valid persona IDs
    When I inspect team "dev-story" members
    Then member with role "coordinator" should have personaId "bmad-agent-pm"
    And member with role "crafter" should have personaId "bmad-agent-dev"
    And member with role "gate" should have personaId "aac-agent-tea"

  # ─── executeTeam: Successful Execution ─────────────────────────────────────

  @team @execute
  Scenario: Execute team spawns all members in order
    When I execute team "dev-story" with task "Implement login feature" and mock model
    Then all team members should have been spawned
    And the coordinator should have been spawned first
    And the crafter should have been spawned second
    And the gate should have been spawned third

  @team @execute
  Scenario: Execute team passes artifact between members
    Given an initial artifact with title "Login Story"
    When I execute team "dev-story" with task "Implement" and mock model
    Then the coordinator should have received the initial artifact
    And the crafter should have received the coordinator output
    And the gate should have received the crafter output

  @team @execute
  Scenario: Execute team returns results for all completed members
    When I execute team "dev-story" with task "Implement login" and mock model
    Then the returned results should have 3 entries
    And each result should have status "completed"
    And each result should have a role matching the team member

  @team @execute
  Scenario: Execute team streams member status messages
    When I execute team "dev-story" with task "Implement" and mock model and a stream
    Then the stream should have received a message for each member role
    And the stream messages should contain "coordinator is working"
    And the stream messages should contain "gate completed"

  # ─── executeTeam: Failures and Cancellation ────────────────────────────────

  @team @failures
  Scenario: Execute team stops on member failure
    When I execute team "dev-story" with task "Implement" and mock model where crafter fails
    Then the coordinator should have completed
    And the crafter should have failed
    And the gate should NOT have been spawned
    And the returned results should have 2 entries

  @team @failures
  Scenario: Execute team handles cancellation mid-execution
    When I execute team "dev-story" with task "Implement" and cancellation during crafter
    Then the coordinator should have completed
    And the crafter should have started but been cancelled
    And the gate should NOT have been spawned

  @team @failures
  Scenario: Execute team throws for unknown team ID
    When I execute team "non-existent-team" with task "Task"
    Then the agent team error should contain "not found"

  @team @failures
  Scenario: Execute team error is re-thrown as-is
    When I execute team "dev-story" with task "Implement" and mock model that throws
    Then an error should have been thrown

  # ─── buildRoleTask ─────────────────────────────────────────────────────────

  @team @tasks
  Scenario: Coordinator role task asks to decompose
    When I build a role task for "coordinator" with original task "Implement login"
    Then the role task should contain "Decompose this task"
    And the role task should contain "Implement login"

  @team @tasks
  Scenario: Crafter role task includes artifact context
    When I build a role task for "crafter" with original task "Implement login" and artifact
    Then the role task should contain "Implement"
    And the role task should contain the serialized artifact

  @team @tasks
  Scenario: Gate role task includes previous outputs
    When I build a role task for "gate" with previous results
    Then the role task should contain "Verify"
    And the role task should contain "quality standards"

  @team @tasks
  Scenario: Researcher role task asks to research
    When I build a role task for "researcher" with original task "Research auth methods"
    Then the role task should contain "Research"
    And the role task should contain "Research auth methods"

  # ─── AgentTeam Interface ──────────────────────────────────────────────────

  @team @types
  Scenario: AgentTeam has required fields
    Given a team definition with:
      | id       | test-team           |
      | members  | coordinator, crafter |
      | workflow | test/workflow.yaml  |
    Then the team should have id "test-team"
    And the team should have 2 members
    And the team workflow should be "test/workflow.yaml"

  @team @types
  Scenario: Team member has role, personaId, and order
    Given a team member with:
      | role      | crafter      |
      | personaId | bmad-agent-dev |
      | order     | 2            |
    Then the member role should be "crafter"
    And the member personaId should be "bmad-agent-dev"
    And the member order should be 2

  # ─── Parent Session Tracking ──────────────────────────────────────────────

  @team @handoff
  Scenario: Each member receives parentSessionId referencing previous member
    When I execute team "dev-story" with task "Implement" and mock model
    Then the second spawned session parentSessionId should be the first session ID
    And the third spawned session parentSessionId should be the second session ID
