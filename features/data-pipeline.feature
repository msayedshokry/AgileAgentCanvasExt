Feature: Data Pipeline Integrity
  As an AgentCanvas user
  I want all artifact fields to survive the full data pipeline
  So that no data is silently lost when loading, displaying, or saving artifacts

  Background:
    Given a fresh data pipeline test store

  # ============================================================================
  # Layer 1: mapSchema* disk loading preserves all fields
  # ============================================================================

  @layer1 @story
  Scenario: Story loading preserves all schema fields
    Given I load a story with all schema fields populated
    Then the loaded story should have all populated fields preserved
    And the loaded story userStory should have asA "developer"
    And the loaded story userStory should have iWant "to build features"
    And the loaded story userStory should have soThat "users are happy"
    And the loaded story should have field "storyFormat" with value "prose"
    And the loaded story should have field "background" with value "Some background context"
    And the loaded story should have field "problemStatement" with value "The core problem"
    And the loaded story should have field "proposedSolution" with value "The proposed solution"
    And the loaded story should have field "technicalNotes" with value "Some technical notes"
    And the loaded story should have field "assignee" with value "alice"
    And the loaded story should have field "reviewer" with value "bob"
    And the loaded story should have field "notes" with value "Some notes"
    And the loaded story should have array field "solutionDetails" with 2 items
    And the loaded story should have array field "implementationDetails" with 2 items
    And the loaded story should have array field "definitionOfDone" with 2 items
    And the loaded story should have array field "requirementRefs" with 1 items
    And the loaded story should have array field "labels" with 2 items
    And the loaded story should have field "storyPoints" with numeric value 5
    And the loaded story should have field "estimatedEffort" with value "2 days"
    And the loaded story should have field "priority" with value "high"

  @layer1 @story
  Scenario: Story loading handles missing optional fields gracefully
    Given I load a story with only required fields
    Then the loaded story should have title "Minimal Story"
    And the loaded story should have field "storyFormat" with undefined value
    And the loaded story should have field "background" with undefined value
    And the loaded story should have field "problemStatement" with undefined value

  @layer1 @epic
  Scenario: Epic loading preserves all schema fields
    Given I load an epic with all schema fields populated
    Then the loaded epic should have all populated fields preserved
    And the loaded epic should have field "priority" with value "high"
    And the loaded epic should have field "storyCount" with numeric value 3
    And the loaded epic should have field "acceptanceSummary" with value "All criteria met"
    And the loaded epic should have array field "implementationNotes" with 2 items
    And the loaded epic should have object field "epicDependencies" with key "upstream"
    And the loaded epic should have object field "effortEstimate" with key "totalSprints"
    And the loaded epic should have array field "useCases" with 1 items

  @layer1 @epic
  Scenario: Epic inline use-case loading preserves all fields
    Given I load an epic with a fully populated inline use case
    Then the loaded epic use case should have field "primaryActor" with value "end-user"
    And the loaded epic use case should have field "trigger" with value "User clicks button"
    And the loaded epic use case should have field "notes" with value "Important note"
    And the loaded epic use case should have array field "preconditions" with 2 items
    And the loaded epic use case should have array field "postconditions" with 1 items
    And the loaded epic use case should have array field "mainFlow" with 2 items
    And the loaded epic use case should have array field "alternativeFlows" with 1 items
    And the loaded epic use case should have array field "businessRules" with 1 items

  @layer1 @requirement
  Scenario: Requirement loading preserves all schema fields
    Given I load a requirement with all schema fields populated
    Then the loaded requirement should have all populated fields preserved
    And the loaded requirement should have field "type" with value "functional"
    And the loaded requirement should have field "rationale" with value "Business need"
    And the loaded requirement should have field "source" with value "PRD.md"
    And the loaded requirement should have field "capabilityArea" with value "Authentication"
    And the loaded requirement should have field "implementationNotes" with value "Use OAuth2"
    And the loaded requirement should have field "notes" with value "Review with security team"
    And the loaded requirement should have field "verificationMethod" with value "automated-test"
    And the loaded requirement should have field "verificationNotes" with value "E2E tests required"
    And the loaded requirement should have array field "dependencies" with 2 items
    And the loaded requirement should have object field "acceptanceCriteria" with key "given"

  @layer1 @requirement
  Scenario: Requirement loading handles missing optional fields gracefully
    Given I load a requirement with only required fields
    Then the loaded requirement should have title "Minimal Requirement"
    And the loaded requirement should have field "type" with undefined value
    And the loaded requirement should have field "rationale" with undefined value
    And the loaded requirement should have field "source" with undefined value

  # ============================================================================
  # Layer 3: updateArtifact save handlers preserve all fields during round-trip
  # ============================================================================

  @layer3 @story
  Scenario: Story save handler preserves all metadata fields
    Given I have an epic with a fully populated story in the store
    When I update the story with new metadata for all fields
    Then the saved story should preserve field "storyFormat" with value "prose"
    And the saved story should preserve field "background" with value "Updated background"
    And the saved story should preserve field "problemStatement" with value "Updated problem"
    And the saved story should preserve field "proposedSolution" with value "Updated solution"
    And the saved story should preserve array field "solutionDetails" with 1 items
    And the saved story should preserve array field "implementationDetails" with 1 items
    And the saved story should preserve array field "definitionOfDone" with 1 items
    And the saved story should preserve field "notes" with value "Updated notes"
    And the saved story should preserve field "assignee" with value "charlie"
    And the saved story should preserve field "reviewer" with value "dave"
    And the saved story should preserve array field "labels" with 2 items
    And the saved story should preserve field "estimatedEffort" with value "3 days"
    And the saved story should preserve field "storyPoints" with numeric value 8

  @layer3 @requirement
  Scenario: Requirement save handler preserves all metadata fields
    Given I have a requirement with all fields in the store
    When I update the requirement with new metadata for all fields
    Then the saved requirement should preserve field "type" with value "non-functional"
    And the saved requirement should preserve field "rationale" with value "Updated rationale"
    And the saved requirement should preserve field "source" with value "Architecture.md"
    And the saved requirement should preserve field "capabilityArea" with value "Performance"
    And the saved requirement should preserve field "implementationNotes" with value "Cache queries"
    And the saved requirement should preserve field "notes" with value "Updated notes"
    And the saved requirement should preserve field "verificationMethod" with value "manual-test"
    And the saved requirement should preserve field "verificationNotes" with value "Load testing"
    And the saved requirement should preserve array field "dependencies" with 1 items

  @layer3 @prd
  Scenario: PRD save handler preserves metadata and maps title correctly
    Given I have a PRD artifact in the store
    When I update the PRD with title "New PRD Title" and metadata sections
    Then the saved PRD should have productOverview.productName "New PRD Title"
    And the saved PRD should have metadata field "scope" with value "Full system"

  @layer3 @architecture
  Scenario: Architecture save handler preserves metadata and maps title correctly
    Given I have an architecture artifact in the store
    When I update the architecture with title "New Arch Title" and metadata sections
    Then the saved architecture should have overview.projectName "New Arch Title"
    And the saved architecture should have metadata field "techStack" with value "Node.js"

  @layer3 @product-brief
  Scenario: Product-brief save handler preserves metadata and maps title correctly
    Given I have a product-brief artifact in the store
    When I update the product-brief with title "New Brief" and metadata sections
    Then the saved product-brief should have productName "New Brief"
    And the saved product-brief should have metadata field "targetMarket" with value "Enterprise"

  @layer3 @use-case
  Scenario: Use-case save handler preserves all metadata fields
    Given I have an epic with a fully populated use case in the store
    When I update the use case with new metadata for all fields
    Then the saved use case should preserve field "primaryActor" with value "admin"
    And the saved use case should preserve field "trigger" with value "Updated trigger"
    And the saved use case should preserve field "notes" with value "Updated note"
    And the saved use case should preserve array field "preconditions" with 1 items
    And the saved use case should preserve array field "postconditions" with 1 items
    And the saved use case should preserve array field "mainFlow" with 1 items
    And the saved use case should preserve array field "businessRules" with 1 items

  # ============================================================================
  # Full Round-Trip: load → store → webview metadata → save → verify
  # ============================================================================

  @roundtrip @story
  Scenario: Story data survives full round-trip through all 3 layers
    Given I have an epic with a fully populated story in the store
    When I extract story metadata as the webview would receive it
    And I save the story back using the webview metadata format
    Then the round-tripped story should have field "storyFormat" with value "prose"
    And the round-tripped story should have field "background" with value "Some background"
    And the round-tripped story should have field "problemStatement" with value "The problem"
    And the round-tripped story should have field "proposedSolution" with value "The solution"
    And the round-tripped story should have field "assignee" with value "alice"
    And the round-tripped story should have field "reviewer" with value "bob"
    And the round-tripped story should have array field "solutionDetails" with 2 items
    And the round-tripped story should have array field "definitionOfDone" with 2 items
    And the round-tripped story should have array field "labels" with 2 items

  @roundtrip @requirement
  Scenario: Requirement data survives full round-trip through all 3 layers
    Given I have a requirement with all fields in the store
    When I extract requirement metadata as the webview would receive it
    And I save the requirement back using the webview metadata format
    Then the round-tripped requirement should have field "type" with value "functional"
    And the round-tripped requirement should have field "rationale" with value "Business need"
    And the round-tripped requirement should have field "source" with value "PRD.md"
    And the round-tripped requirement should have field "implementationNotes" with value "Use OAuth2"
    And the round-tripped requirement should have field "notes" with value "Review with security team"
    And the round-tripped requirement should have array field "dependencies" with 2 items

  @roundtrip @epic
  Scenario: Epic metadata survives round-trip through store and webview
    Given I load an epic with all schema fields populated
    When I extract epic metadata as the webview would receive it
    Then the epic metadata should contain field "priority" with value "high"
    And the epic metadata should contain field "acceptanceSummary" with value "All criteria met"
    And the epic metadata should contain array field "implementationNotes" with 2 items
    And the epic metadata should contain object field "epicDependencies" with key "upstream"
    And the epic metadata should contain object field "effortEstimate" with key "totalSprints"

  @roundtrip @use-case
  Scenario: Use-case metadata survives round-trip through store and webview
    Given I have an epic with a fully populated use case in the store
    When I extract use case metadata as the webview would receive it
    Then the use case metadata should contain field "primaryActor" with value "end-user"
    And the use case metadata should contain field "trigger" with value "User clicks button"
    And the use case metadata should contain array field "preconditions" with 2 items
    And the use case metadata should contain array field "mainFlow" with 2 items
    And the use case metadata should contain field "notes" with value "Important note"
