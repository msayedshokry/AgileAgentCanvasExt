Feature: AgileAgentCanvasChatParticipant - VS Code Chat Commands
  As an AgileAgentCanvas user
  I want to use chat commands to manage my project artifacts
  So that I can interact with the AI assistant effectively

  Background:
    Given a fresh chat participant

  # Command Routing Tests
  Scenario: Routes to command handler when command is present
    When I send a chat request with command "status" and prompt ""
    Then the markdown stream should have been called
    And the result metadata command should be defined

  Scenario: Handles conversation when no command
    When I send a chat request with no command and prompt "Hello, help me with my project"
    Then the markdown stream should have been called

  Scenario: Handles unknown command
    When I send a chat request with command "unknowncommand" and prompt ""
    Then the markdown stream should contain "Unknown command"
    And the result metadata command should be "error"

  # Vision Command Tests
  Scenario: Shows input prompt when no prompt and no existing vision
    When I send a chat request with command "vision" and prompt ""
    Then the markdown stream should contain "Product Vision"
    And the markdown stream should contain "What problem"
    And the result metadata status should be "awaiting-input"

  Scenario: Uses template mode when no AI available
    Given the chat store has project "Test Project"
    When I send a chat request with command "vision" and prompt "Build a task management app"
    Then the markdown stream should contain "Template Mode"
    And the result metadata command should be "vision"

  # Requirements Command Tests
  Scenario: Shows input prompt when no PRD and no prompt
    When I send a chat request with command "requirements" and prompt ""
    Then the markdown stream should contain "Requirements Extraction"
    And the markdown stream should contain "PRD file"
    And the result metadata status should be "awaiting-input"

  Scenario: Shows no AI message when no model available for requirements
    When I send a chat request with command "requirements" and prompt "Users should be able to create accounts and login"
    Then the markdown stream should contain "AI not available"

  # Epics Command Tests
  Scenario: Shows warning when no requirements and no prompt
    When I send a chat request with command "epics" and prompt ""
    Then the markdown stream should contain "Epic Design"
    And the markdown stream should contain "No requirements"
    And the result metadata status should be "awaiting-input"

  Scenario: Creates template epic when no AI available
    Given the chat store has a requirement with id "FR-1" and title "Test Requirement"
    When I send a chat request with command "epics" and prompt ""
    Then the markdown stream should contain "template epic"
    And the chat store should have at least 1 epic

  # Stories Command Tests
  Scenario: Shows warning when no epics defined
    When I send a chat request with command "stories" and prompt ""
    Then the markdown stream should contain "Story Breakdown"
    And the markdown stream should contain "No epics"
    And the result metadata status should be "blocked"

  # Enhance Command Tests
  Scenario: Shows warning when no epics to enhance
    When I send a chat request with command "enhance" and prompt ""
    Then the markdown stream should contain "Epic Enhancement"
    And the markdown stream should contain "No epics"
    And the result metadata status should be "blocked"

  Scenario: Shows enhancement menu when no specific request
    Given the chat store has an epic with id "EPIC-1" and title "Test Epic"
    When I send a chat request with command "enhance" and prompt ""
    Then the markdown stream should contain "Use Cases"
    And the markdown stream should contain "Fit Criteria"
    And the result metadata status should be "awaiting-input"

  Scenario: Shows error for non-existent epic
    Given the chat store has an epic with id "EPIC-1" and title "Test Epic"
    When I send a chat request with command "enhance" and prompt "all EPIC-999"
    Then the markdown stream should contain "not found"
    And the result metadata status should be "error"

  # Refine Command Tests
  Scenario: Shows input prompt when no artifact specified
    When I send a chat request with command "refine" and prompt ""
    Then the markdown stream should contain "BMAD Artifact Refinement"
    And the markdown stream should contain "No artifact specified"
    And the result metadata status should be "awaiting-input"

  Scenario: Finds artifact by ID from prompt
    Given the chat store has an epic with id "EPIC-1" and title "Test Epic"
    When I send a chat request with command "refine" and prompt "EPIC-1"
    Then the markdown stream should contain "Test Epic"

  Scenario: Uses refine context when no ID in prompt
    Given the chat store has refine context with id "EPIC-2" and title "Context Epic"
    When I send a chat request with command "refine" and prompt ""
    Then the markdown stream should contain "Context Epic"

  # Apply Command Tests
  Scenario: Shows error when no pending refinements
    When I send a chat request with command "apply" and prompt ""
    Then the markdown stream should contain "Applying Refinements"
    And the markdown stream should contain "No pending refinements"
    And the result metadata status should be "no-refinements"

  Scenario: Applies refinements when context exists
    Given the chat store has refine context for "EPIC-1" with refinements
    And the chat store has an epic with id "EPIC-1" and title "Original Title"
    When I send a chat request with command "apply" and prompt ""
    Then the markdown stream should contain "Applied changes"
    And the result metadata status should be "success"

  # Review Command Tests
  Scenario: Shows completeness check
    When I send a chat request with command "review" and prompt ""
    Then the markdown stream should contain "Artifact Review"
    And the markdown stream should contain "Completeness"
    And the markdown stream should contain "Vision"
    And the result metadata command should be "review"

  Scenario: Shows validation issues when artifacts incomplete
    When I send a chat request with command "review" and prompt ""
    Then the markdown stream should contain "No product vision"

  Scenario: Shows all passed when complete
    Given the chat store has complete artifacts
    When I send a chat request with command "review" and prompt ""
    Then the markdown stream should contain "All validations passed"

  # Status Command Tests
  Scenario: Shows no active session message
    When I send a chat request with command "status" and prompt ""
    Then the markdown stream should contain "Workflow Status"
    And the markdown stream should contain "No active workflow session"
    And the result metadata status should be "no-session"

  # Continue Command Tests
  Scenario: Shows no active workflow message when no session
    When I send a chat request with command "continue" and prompt ""
    Then the markdown stream should contain "No Active Workflow"
    And the result metadata status should be "no-session"

  # Workflows Command Tests
  Scenario: Shows available workflows
    When I send a chat request with command "workflows" and prompt ""
    Then the markdown stream should have been called

  # Convert-to-JSON Command Tests
  Scenario: Shows input prompt when no folder specified
    When I send a chat request with command "convert-to-json" and prompt ""
    Then the markdown stream should contain "Convert Markdown to JSON"
    And the markdown stream should contain "specify the folder"
    And the result metadata status should be "awaiting-input"

  # Conversation Handling Tests
  Scenario: Shows no model message when AI not available
    When I send a chat request with no command and prompt "Help me create a product vision"
    Then the markdown stream should contain "AI not available"
    And the result metadata command should be "error"

  # ── Apply Command — Multiple Artifact Types ──────────────────────

  @apply
  Scenario: Apply vision refinements
    Given the chat store has refine context for vision with refinements
    When I send a chat request with command "apply" and prompt ""
    Then the markdown stream should contain "Applying Refinements"
    And the markdown stream should contain "vision"
    And the result metadata status should be "success"

  @apply
  Scenario: Apply story refinements
    Given the chat store has an epic with id "EPIC-1" and title "Test Epic"
    And the chat store has refine context for story "STORY-1-1" with refinements
    When I send a chat request with command "apply" and prompt ""
    Then the markdown stream should contain "Applying Refinements"
    And the markdown stream should contain "story"
    And the result metadata status should be "success"

  @apply
  Scenario: Apply requirement refinements
    Given the chat store has a requirement with id "FR-1" and title "Old Req"
    And the chat store has refine context for requirement "FR-1" with refinements
    When I send a chat request with command "apply" and prompt ""
    Then the markdown stream should contain "Applying Refinements"
    And the markdown stream should contain "requirement"
    And the result metadata status should be "success"

  @apply
  Scenario: Apply test-case refinements
    Given the chat store has refine context for test-case "TC-1" with refinements
    When I send a chat request with command "apply" and prompt ""
    Then the markdown stream should contain "Applying Refinements"
    And the markdown stream should contain "test-case"
    And the result metadata status should be "success"

  @apply
  Scenario: Apply test-strategy refinements
    Given the chat store has refine context for test-strategy "TS-1" with refinements
    When I send a chat request with command "apply" and prompt ""
    Then the markdown stream should contain "Applying Refinements"
    And the markdown stream should contain "test-strategy"
    And the result metadata status should be "success"

  @apply
  Scenario: Apply product-brief refinements
    Given the chat store has refine context for product-brief with refinements
    When I send a chat request with command "apply" and prompt ""
    Then the markdown stream should contain "Applying Refinements"
    And the markdown stream should contain "product-brief"
    And the result metadata status should be "success"

  @apply
  Scenario: Apply PRD refinements
    Given the chat store has refine context for prd with refinements
    When I send a chat request with command "apply" and prompt ""
    Then the markdown stream should contain "Applying Refinements"
    And the markdown stream should contain "prd"
    And the result metadata status should be "success"

  @apply
  Scenario: Apply architecture refinements
    Given the chat store has refine context for architecture with refinements
    When I send a chat request with command "apply" and prompt ""
    Then the markdown stream should contain "Applying Refinements"
    And the markdown stream should contain "architecture"
    And the result metadata status should be "success"

  @apply
  Scenario: Apply use-case refinements
    Given the chat store has refine context for use-case "UC-1-1" with refinements
    When I send a chat request with command "apply" and prompt ""
    Then the markdown stream should contain "Applying Refinements"
    And the markdown stream should contain "use-case"
    And the result metadata status should be "success"

  @apply
  Scenario: Apply unsupported artifact type returns error
    Given the chat store has refine context for unsupported type
    When I send a chat request with command "apply" and prompt ""
    Then the markdown stream should contain "Unsupported artifact type"
    And the result metadata status should be "unsupported-type"

  # ── Status Command — Active Session ──────────────────────────────

  @status
  Scenario: Shows active session details
    Given the workflow executor has an active session
    When I send a chat request with command "status" and prompt ""
    Then the markdown stream should contain "Active Session"
    And the markdown stream should contain "ws-test-123"
    And the markdown stream should contain "Test Refinement Workflow"
    And the markdown stream should contain "Completed Steps"
    And the result metadata sessionId should be defined

  @status
  Scenario: Shows active session with user inputs
    Given the workflow executor has an active session
    When I send a chat request with command "status" and prompt ""
    Then the markdown stream should contain "User Inputs"
    And the markdown stream should contain "Start the refinement"

  @status
  Scenario: Shows active session without completed steps or inputs
    Given the workflow executor has an active session with no steps or inputs
    When I send a chat request with command "status" and prompt ""
    Then the markdown stream should contain "Active Session"
    And the markdown stream should contain "ws-empty-001"
    And the markdown stream should not contain "Completed Steps"

  # ── Continue Command — Active Session ────────────────────────────

  @continue
  Scenario: Continue with no next step
    Given the workflow executor has an active session with no next step
    When I send a chat request with command "continue" and prompt ""
    Then the markdown stream should contain "Continuing Workflow"
    And the markdown stream should contain "Could not determine next step"
    And the result metadata status should be "no-next-step"

  @continue
  Scenario: Continue with active session but no model
    Given the workflow executor has an active session with a continue prompt
    When I send a chat request with command "continue" and prompt ""
    Then the markdown stream should contain "AI not available"
    And the result metadata status should be "no-model"

  # ── Workflows Command — Filters ─────────────────────────────────

  @workflows
  Scenario: Filter workflows by module
    Given the workflow executor has module workflows
    When I send a chat request with command "workflows" and prompt "bmm"
    Then the markdown stream should contain "BMM Module"
    And the result metadata filter should be "bmm"

  @workflows
  Scenario: Filter workflows by module shows grouped phases
    Given the workflow executor has module workflows
    When I send a chat request with command "workflows" and prompt "bmm"
    Then the markdown stream should contain "Module WF 1"
    And the markdown stream should contain "Module WF 2"
    And the markdown stream should contain "Module WF 3"

  @workflows
  Scenario: Filter by module with no workflows
    Given the workflow executor has no module workflows
    When I send a chat request with command "workflows" and prompt "tea"
    Then the markdown stream should contain "No workflows found"
    And the result metadata filter should be "tea"

  @workflows
  Scenario: Filter workflows by artifact type
    When I send a chat request with command "workflows" and prompt "story"
    Then the markdown stream should contain "Workflows for STORY"
    And the result metadata filter should be "story"

  @workflows
  Scenario: Filter by artifact type with no workflows
    Given the workflow executor has no artifact workflows
    When I send a chat request with command "workflows" and prompt "epic"
    Then the markdown stream should contain "No workflows specifically target"
    And the result metadata filter should be "epic"

  @workflows
  Scenario: Filter workflows by tag
    Given the workflow executor has tagged workflows
    When I send a chat request with command "workflows" and prompt "validation"
    Then the markdown stream should contain "Tagged WF"
    And the result metadata filter should be "validation"

  @workflows
  Scenario: Workflows shows not-initialized warning
    Given the workflow executor returns not initialized
    When I send a chat request with command "workflows" and prompt ""
    Then the markdown stream should contain "Warning"
    And the markdown stream should contain "Could not locate the BMAD framework"

  # ── Dev Command — Early Exits ────────────────────────────────────

  @dev
  Scenario: Dev command with no artifact specified
    When I send a chat request with command "dev" and prompt ""
    Then the markdown stream should contain "Start Development"
    And the markdown stream should contain "No artifact specified"
    And the result metadata status should be "awaiting-input"

  @dev
  Scenario: Dev command with non-existent artifact
    When I send a chat request with command "dev" and prompt "EPIC-999"
    Then the markdown stream should contain "not found"
    And the result metadata status should be "not-found"

  # ── Sprint Command — Early Exits ─────────────────────────────────

  @sprint
  Scenario: Sprint plan with no epics and no prompt
    When I send a chat request with command "sprint" and prompt ""
    Then the markdown stream should contain "Sprint Planning"
    And the markdown stream should contain "No epics"
    And the result metadata status should be "awaiting-input"

  @sprint
  Scenario: Sprint command with no AI model
    When I send a chat request with command "sprint" and prompt "plan something"
    Then the markdown stream should contain "AI not available"
    And the result metadata status should be "no-model"

  # ── Elicit Command — Early Exits ─────────────────────────────────

  @elicit
  Scenario: Elicit with no prompt
    When I send a chat request with command "elicit" and prompt ""
    Then the markdown stream should contain "Advanced Elicitation"
    And the markdown stream should contain "No elicitation details"
    And the result metadata status should be "awaiting-input"

  @elicit
  Scenario: Elicit with unknown artifact ID
    When I send a chat request with command "elicit" and prompt "EPIC-999"
    Then the markdown stream should contain "No artifact specified or found"
    And the result metadata status should be "no-artifact"

  # ── No-Model Guard — Scenario Outline ────────────────────────────
  # These commands all check for AI availability early, returning no-model

  @no-model
  Scenario Outline: Shows no-model message for <command> command
    When I send a chat request with command "<command>" and prompt "<prompt>"
    Then the markdown stream should contain "AI not available"
    And the result metadata status should be "no-model"

    Examples:
      | command         | prompt             |
      | ux              | design ui          |
      | readiness       | check              |
      | party           | discuss topic      |
      | document        | scan project       |
      | review-code     | check code         |
      | ci              | setup pipeline     |
      | quick           | fix a bug          |
      | design-thinking | improve ux         |
      | innovate        | find opportunity   |
      | solve           | debug issue        |
      | story-craft     | craft narrative    |
      | context         | generate context   |
      | write-doc       | write api guide    |
      | mermaid         | draw flowchart     |
      | readme          | generate readme    |
      | changelog       | generate changes   |
      | api-docs        | generate api docs  |
