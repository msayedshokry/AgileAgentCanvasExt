Feature: artifact-commands BMM workflow utilities
  Tests for loadBmmWorkflows and launchBmmWorkflow functions

  Background:
    Given a fresh artifact commands context

  # loadBmmWorkflows — directory not found
  Scenario: Returns empty array when workflows directory does not exist
    Given no workflows directory exists
    When I call loadBmmWorkflows
    Then the result should be an empty array

  # loadBmmWorkflows — workflow.yaml parsing
  Scenario: Parses a top-level workflow.yaml file
    Given a workflow.yaml file at "document-project" with name "document-project" and description "Document brownfield projects for AI context. Use when the user says \"document this project\""
    When I call loadBmmWorkflows
    Then the result should contain 1 workflow
    And workflow 0 should have name "document-project"
    And workflow 0 should have phase "Documentation"

  Scenario: Extracts triggerPhrase from workflow.yaml description
    Given a workflow.yaml file at "document-project" with name "document-project" and description "Document brownfield projects. Use when the user says \"document this project\""
    When I call loadBmmWorkflows
    Then workflow 0 triggerPhrase should be "document this project"

  Scenario: Parses a workflow.yaml in a phase subdirectory
    Given a workflow.yaml file at "4-implementation/code-review" with name "code-review" and description "Perform adversarial code review. Use when the user says \"run code review\""
    When I call loadBmmWorkflows
    Then the result should contain 1 workflow
    And workflow 0 should have name "code-review"
    And workflow 0 should have phase "Implementation"

  # loadBmmWorkflows — workflow.md parsing
  Scenario: Parses a workflow.md file with YAML frontmatter
    Given a workflow.md file at "1-analysis/create-product-brief" with name "create-product-brief" and description "Create product brief through collaborative discovery. Use when the user says \"lets create a product brief\""
    When I call loadBmmWorkflows
    Then the result should contain 1 workflow
    And workflow 0 should have name "create-product-brief"
    And workflow 0 should have phase "Analysis"

  Scenario: Extracts triggerPhrase from workflow.md description
    Given a workflow.md file at "1-analysis/create-product-brief" with name "create-product-brief" and description "Create product brief. Use when the user says \"lets create a product brief\""
    When I call loadBmmWorkflows
    Then workflow 0 triggerPhrase should be "lets create a product brief"

  Scenario: Assigns correct phaseOrder for Analysis phase
    Given a workflow.md file at "1-analysis/create-product-brief" with name "create-product-brief" and description "Create product brief."
    When I call loadBmmWorkflows
    Then workflow 0 phaseOrder should be 1

  Scenario: Assigns correct phaseOrder for Planning phase
    Given a workflow.yaml file at "2-plan-workflows/create-prd" with name "create-prd" and description "Create a PRD."
    When I call loadBmmWorkflows
    Then workflow 0 phaseOrder should be 2

  Scenario: Assigns correct phaseOrder for Implementation phase
    Given a workflow.yaml file at "4-implementation/dev-story" with name "dev-story" and description "Execute story implementation."
    When I call loadBmmWorkflows
    Then workflow 0 phaseOrder should be 4

  Scenario: Assigns correct phaseOrder for Quick Flow phase
    Given a workflow.md file at "bmad-quick-flow/quick-spec" with name "quick-spec" and description "Create quick specs."
    When I call loadBmmWorkflows
    Then workflow 0 phaseOrder should be 5

  # loadBmmWorkflows — triggerPhrase extraction edge cases
  Scenario: Falls back to full description when no trigger pattern present
    Given a workflow.yaml file at "document-project" with name "document-project" and description "Document brownfield projects for AI context"
    When I call loadBmmWorkflows
    Then workflow 0 triggerPhrase should be "Document brownfield projects for AI context"

  Scenario: Returns non-empty id for each workflow
    Given a workflow.yaml file at "document-project" with name "document-project" and description "Some description"
    When I call loadBmmWorkflows
    Then workflow 0 id should not be empty

  # loadBmmWorkflows — multiple workflows
  Scenario: Returns multiple workflows from multiple directories
    Given a workflow.yaml file at "document-project" with name "document-project" and description "Document project."
    And a workflow.md file at "1-analysis/create-product-brief" with name "create-product-brief" and description "Create product brief."
    When I call loadBmmWorkflows
    Then the result should contain 2 workflows

  # launchBmmWorkflow
  Scenario: Calls openChat with the trigger phrase prefixed by @agentcanvas
    When I call launchBmmWorkflow with trigger "lets create a product brief"
    Then openChat should have been called with "@agentcanvas lets create a product brief"

  Scenario: launchBmmWorkflow does not throw
    When I call launchBmmWorkflow with trigger "run code review"
    Then no artifact command error should be thrown
