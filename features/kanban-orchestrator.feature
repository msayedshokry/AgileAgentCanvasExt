Feature: Kanban Orchestrator autonomous loop
  As a developer using the Agentic Kanban
  When auto-advance is enabled and I drop a story into In-Progress
  The orchestrator should drive it through implement -> review -> done,
  re-implementing on review failures, and stop safely on uncertainty.

  Scenario: Happy path advances the card to done
    Given a story on the agentic board
    And the lane agents will return verdicts "COMPLETED,APPROVED"
    When the orchestrator runs autonomously
    Then the run succeeds
    And the card reaches "done"

  Scenario: Review failure triggers re-implementation then approval
    Given a story on the agentic board
    And the lane agents will return verdicts "COMPLETED,NEEDS_FIXES,COMPLETED,APPROVED"
    When the orchestrator runs autonomously
    Then the run succeeds
    And the card reaches "done"
    And the card entered "in-progress" at least 2 times

  Scenario: A blocked dev gate stops the loop
    Given a story on the agentic board
    And the lane agents will return verdicts "BLOCKED"
    When the orchestrator runs autonomously
    Then the run is blocked
    And the card never reaches "done"

  Scenario: An unknown verdict never auto-advances
    Given a story on the agentic board
    And the lane agents will return verdicts "UNKNOWN"
    When the orchestrator runs autonomously
    Then the run is blocked
    And the card never reaches "done"

  Scenario: The iteration cap stops a never-approving loop
    Given a story on the agentic board
    And the maximum iterations is 2
    And the lane agents will return verdicts "COMPLETED,NEEDS_FIXES,COMPLETED,NEEDS_FIXES,COMPLETED,NEEDS_FIXES"
    When the orchestrator runs autonomously
    Then the run is blocked
    And the card never reaches "done"
