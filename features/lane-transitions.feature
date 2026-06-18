Feature: Lane Transitions - Kanban Card Movement Orchestration
  As an AgileAgentCanvas user
  I want card transitions between Kanban lanes to trigger status updates and workflows
  So that moving a card from Backlog to In Progress automatically runs the dev workflow

  Background:
    Given a fresh lane transition engine

  # ─── Transition Rules ──────────────────────────────────────────────────────

  @transitions @rules
  Scenario: TRANSITION_RULES contains all standard rules
    Then the transition rules should contain more than 0 entries
    And a rule should exist for story backlog → ready-for-dev
    And a rule should exist for story ready-for-dev → in-progress
    And a rule should exist for story in-progress → review
    And a rule should exist for story review → done
    And a rule should exist for epic backlog → ready-for-dev
    And a rule should exist for epic ready-for-dev → in-progress
    And a rule should exist for prd draft → ready

  @transitions @rules
  Scenario: Story backlog → ready-for-dev rule has story-enhancement workflow
    When I find the rule for story backlog → ready-for-dev
    Then the rule workflowId should be "story-enhancement"
    And the rule confirmWithUser should be true

  @transitions @rules
  Scenario: Story ready-for-dev → in-progress rule has dev-story workflow
    When I find the rule for story ready-for-dev → in-progress
    Then the rule workflowId should be "dev-story"
    # fb918a6 dropped the dev-story confirm modal — drag-to-in-progress launches
    # the workflow directly, no Run/Skip prompt.
    And the rule confirmWithUser should be false

  # ─── Regression Guard (fb918a6 — dev-story Run/Skip modal dropped) ──────────
  # Locks the contract that the dev-story transition never prompts the user.
  # Update this scenario only if the product decision is deliberately reversed,
  # and update the comment in src/workflow/lane-transitions.ts alongside it.
  @transitions @rules @guard @regression-fb918a6
  Scenario: Guard — every dev-story rule must skip user confirmation (fb918a6)
    Then every rule for dev-story workflow should skip user confirmation
    And every dev-story rule should explicitly set confirmWithUser to false

  @transitions @rules
  Scenario: Story in-progress → review rule has code-review workflow
    When I find the rule for story in-progress → review
    Then the rule workflowId should be "code-review"
    And the rule confirmWithUser should be true

  @transitions @rules
  Scenario: Story review → done rule has no workflow
    When I find the rule for story review → done
    Then the rule workflowId should be null
    And the rule confirmWithUser should be false

  @transitions @rules
  Scenario: Epic backlog → ready-for-dev rule has epic-enhancement workflow
    When I find the rule for epic backlog → ready-for-dev
    Then the rule workflowId should be "epic-enhancement"

  @transitions @rules
  Scenario: PRD draft → ready rule has create-prd workflow
    When I find the rule for prd draft → ready
    Then the rule workflowId should be "create-prd"

  @transitions @rules
  Scenario: findRule returns undefined for unknown transition
    When I find the rule for story backlog → done
    Then the rule should be undefined

  # ─── handleTransition: Successful Transitions ──────────────────────────────

  @transitions @handle
  Scenario: Handle transition moves artifact to new status
    Given the store has a story with id "S-1" and status "backlog"
    When I handle transition for "S-1" from "backlog" to "ready-for-dev" with type "story"
    Then the transition result ok should be true
    And the transition result status should be "complete"
    And the story "S-1" status should be "ready-for-dev"

  @transitions @handle
  Scenario: Handle transition launches workflow when rule specifies one
    Given the store has a story with id "S-1" and status "backlog"
    And the user will confirm the workflow prompt
    When I handle transition for "S-1" from "backlog" to "ready-for-dev" with type "story"
    Then the transition result workflowLaunched should be true
    And the workflow executor executeLaneTransition should have been called

  @transitions @handle
  Scenario: Handle transition without workflow when user declines
    Given the store has a story with id "S-1" and status "backlog"
    And the user will decline the workflow prompt
    When I handle transition for "S-1" from "backlog" to "ready-for-dev" with type "story"
    Then the transition result ok should be true
    And the transition result workflowLaunched should be false
    And the transition result status should be "moved_without_workflow"

  @transitions @handle
  Scenario: Handle transition for review → done moves status
    Given the store has a story with id "S-1" and status "review"
    When I handle transition for "S-1" from "review" to "done" with type "story"
    Then the transition result ok should be true
    And the transition result workflowLaunched should be true
    And the transition result status should be "complete"
    And the story "S-1" status should be "done"

  # ─── handleTransition: Blocked Transitions ─────────────────────────────────

  @transitions @blocked
  Scenario: Handle transition returns blocked when artifact not found
    When I handle transition for "NONEXISTENT-99" from "backlog" to "ready-for-dev" with type "story"
    Then the transition result ok should be false
    And the transition result status should be "blocked"
    And the transition result blockedBy should contain "Artifact not found"

  @transitions @blocked
  Scenario: Handle transition returns blocked when concurrency lock held
    Given the store has a story with id "S-1" and status "backlog"
    And a lock is held on "S-1"
    When I handle transition for "S-1" from "backlog" to "ready-for-dev" with type "story"
    Then the transition result ok should be false
    And the transition result status should be "blocked"
    And the transition result blockedBy should contain "currently being processed"

  # ─── Concurrency: Lock Lifecycle ───────────────────────────────────────────

  @transitions @concurrency
  Scenario: Concurrency lock is acquired during transition
    Given the store has a story with id "S-1" and status "backlog"
    When I handle transition for "S-1" from "backlog" to "ready-for-dev" with type "story"
    Then the concurrency lock for "S-1" should have been acquired

  @transitions @concurrency
  Scenario: Concurrency lock is released after transition completes
    Given the store has a story with id "S-1" and status "backlog"
    When I handle transition for "S-1" from "backlog" to "ready-for-dev" with type "story"
    Then the concurrency lock for "S-1" should have been released

  @transitions @concurrency
  Scenario: Concurrency lock is released even when workflow fails
    Given the store has a story with id "S-1" and status "backlog"
    And the workflow executor will throw during transition
    When I handle transition for "S-1" from "backlog" to "ready-for-dev" with type "story"
    Then the concurrency lock for "S-1" should have been released
    And the transition result ok should be false

  # ─── YOLO Mode ────────────────────────────────────────────────────────────

  @transitions @yolo
  Scenario: YOLO mode skips user confirmation
    Given the store has a story with id "S-1" and status "backlog"
    And YOLO mode is enabled
    When I handle transition for "S-1" from "backlog" to "ready-for-dev" with type "story"
    Then the user should not have been prompted for confirmation
    And the transition result workflowLaunched should be true

  # ─── Pre-flight Validation (E4 Stub) ───────────────────────────────────────

  @transitions @harness
  Scenario: Pre-flight validation is skipped until harness engine is built
    Given the store has a story with id "S-1" and status "ready-for-dev"
    When I handle transition for "S-1" from "ready-for-dev" to "in-progress" with type "story"
    Then the transition result ok should be true
    And the harness pre-flight stub should have logged a debug message

  # ─── Error Handling ───────────────────────────────────────────────────────

  @transitions @errors
  Scenario: Store update failure returns blocked result
    Given the store has a story with id "S-1" and status "backlog"
    And the store updateArtifact will throw
    When I handle transition for "S-1" from "backlog" to "ready-for-dev" with type "story"
    Then the transition result ok should be false
    And the transition result status should be "blocked"

  # ─── Lane Transition Engine Singleton ──────────────────────────────────────

  @transitions @singleton
  Scenario: Lane transition engine singleton is initialized in extension.ts
    When I initialize the lane transition engine with a mock store and executor
    Then the lane transition engine singleton should be defined

  # ─── isYoloMode ───────────────────────────────────────────────────────────

  @transitions @config
  Scenario: isYoloMode reads from configuration
    When I check isYoloMode with config value true
    Then isYoloMode should return true

  @transitions @config
  Scenario: isYoloMode defaults to false
    When I check isYoloMode with config value false
    Then isYoloMode should return false
