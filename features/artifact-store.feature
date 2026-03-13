Feature: Artifact Store - Project Management
  As an AgileAgentCanvas user
  I want to manage projects and artifacts
  So that I can organize my product development work

  Background:
    Given a fresh artifact store

  # Project Initialization
  @project @initialization
  Scenario: Initialize a new project
    Given I initialize a project named "My Awesome App"
    Then the project name should be "My Awesome App"
    And the artifact store should have no artifacts

  @project @initialization
  Scenario: Initialize project with empty name
    Given I initialize a project named ""
    Then the project name should be ""

  @project @initialization
  Scenario: Initialize project replaces existing project
    Given I initialize a project named "First Project"
    And I create a vision artifact
    When I initialize project "Second Project"
    Then the project name should be "Second Project"
    And the artifact store should have no artifacts

  # Vision Artifacts
  @vision @crud
  Scenario: Create a vision artifact
    Given I initialize a project named "Vision Test"
    When I create vision artifact
    Then the store should contain a vision artifact
    And the vision should have default values

  @vision @crud
  Scenario: Update vision artifact
    Given I initialize a project named "Vision Test"
    And I create a vision artifact
    When I update the vision with:
      | field            | value                    |
      | productName      | Super Product            |
      | problemStatement | Users need better tools  |
      | targetAudience   | Developers               |
    Then the vision product name should be "Super Product"
    And the vision problem statement should be "Users need better tools"
    And the vision target audience should be "Developers"

  @vision @crud
  Scenario: Create or update vision is idempotent
    Given I initialize a project named "Vision Test"
    When I create vision artifact
    And I create vision artifact
    Then there should be exactly 1 vision artifact

  # Epic Artifacts
  @epic @crud
  Scenario: Add an epic
    Given I initialize a project named "Epic Test"
    When I add epic with title "User Authentication"
    Then the store should contain 1 epic
    And the epic "User Authentication" should exist

  @epic @crud
  Scenario: Add multiple epics
    Given I initialize a project named "Epic Test"
    When I add epic with title "User Authentication"
    And I add epic with title "Dashboard"
    And I add epic with title "Reporting"
    Then the store should contain 3 epics

  @epic @crud
  Scenario: Update epic title
    Given I initialize a project named "Epic Test"
    And I add an epic with title "Old Title"
    When I update the epic "Old Title" with title "New Title"
    Then the epic "New Title" should exist
    And the epic "Old Title" should not exist

  @epic @crud
  Scenario: Update epic goal via description
    Given I initialize a project named "Epic Test"
    And I add an epic with title "My Epic"
    When I update the epic "My Epic" with description "Enable users to securely log in"
    Then the epic "My Epic" should have goal "Enable users to securely log in"

  @epic @crud
  Scenario: Delete an epic
    Given I initialize a project named "Epic Test"
    And I add an epic with title "To Delete"
    When I delete the epic "To Delete"
    Then the store should contain 0 epics

  # Story Artifacts
  @story @crud
  Scenario: Create a story in an epic
    Given I initialize a project named "Story Test"
    And I add an epic with title "User Authentication"
    When I create story in epic "User Authentication"
    Then the epic "User Authentication" should contain 1 story

  @story @crud
  Scenario: Create multiple stories in an epic
    Given I initialize a project named "Story Test"
    And I add an epic with title "User Authentication"
    When I create story in epic "User Authentication"
    And I create story in epic "User Authentication"
    And I create story in epic "User Authentication"
    Then the epic "User Authentication" should contain 3 stories

  @story @crud
  Scenario: Update story user story fields
    Given I initialize a project named "Story Test"
    And I add an epic with title "User Authentication"
    And I create a story in epic "User Authentication"
    When I update the story with user story:
      | asA    | developer           |
      | iWant  | to authenticate     |
      | soThat | I can access the app|
    Then the story should have user story "As a developer, I want to authenticate, so that I can access the app"

  @story @crud
  Scenario: Delete a story from an epic
    Given I initialize a project named "Story Test"
    And I add an epic with title "User Authentication"
    And I create a story in epic "User Authentication"
    When I delete the first story from epic "User Authentication"
    Then the epic "User Authentication" should contain 0 stories

  # Requirement Artifacts
  @requirement @crud
  Scenario: Create a requirement
    Given I initialize a project named "Requirement Test"
    When I create requirement with title "System shall support OAuth2"
    Then the store should contain 1 requirement

  @requirement @crud
  Scenario: Add a requirement using addRequirement
    Given I initialize a project named "Requirement Test"
    When I add a requirement
    Then the store should contain 1 requirement

  @requirement @crud
  Scenario: Update requirement description
    Given I initialize a project named "Requirement Test"
    And I create a requirement with title "OAuth2 Support"
    When I update the requirement "OAuth2 Support" with description "Full OAuth2 flow with PKCE"
    Then the requirement "OAuth2 Support" should have description "Full OAuth2 flow with PKCE"

  @requirement @crud
  Scenario: Delete a requirement
    Given I initialize a project named "Requirement Test"
    And I create a requirement with title "To Delete"
    When I delete the requirement "To Delete"
    Then the store should contain 0 requirements

  # Artifact Selection
  @selection
  Scenario: Select an epic
    Given I initialize a project named "Selection Test"
    And I add an epic with title "Selected Epic"
    When I select epic "Selected Epic"
    Then the selected artifact type should be "epic"
    And the selected artifact should be "Selected Epic"

  @selection
  Scenario: Select the vision
    Given I initialize a project named "Selection Test"
    And I create a vision artifact
    When I select the vision
    Then the selected artifact type should be "vision"

  @selection
  Scenario: Select a requirement
    Given I initialize a project named "Selection Test"
    And I create a requirement with title "Selected Requirement"
    When I select requirement "Selected Requirement"
    Then the selected artifact type should be "requirement"
    And the selected artifact should be "Selected Requirement"

  @selection
  Scenario: Clear selection
    Given I initialize a project named "Selection Test"
    And I add an epic with title "Some Epic"
    And I select the epic "Some Epic"
    When I clear the selection
    Then no artifact should be selected

  # State Changes and Events
  @events
  Scenario: State changes trigger events
    Given I initialize a project named "Event Test"
    And I subscribe to state changes
    When I add epic with title "Trigger Event"
    Then a state change event should have been fired

  @events
  Scenario: Multiple operations trigger multiple events
    Given I initialize a project named "Event Test"
    And I subscribe to state changes
    When I add epic with title "Epic 1"
    And I add epic with title "Epic 2"
    And I add a requirement
    Then 3 state change events should have been fired

  # Test Case Artifacts
  @test-case @crud
  Scenario: Create a standalone test case
    Given I initialize a project named "Test Case Test"
    When I create a test case
    Then the store should contain 1 test case
    And the test case should have id "TC-1"

  @test-case @crud
  Scenario: Create multiple test cases
    Given I initialize a project named "Test Case Test"
    When I create a test case
    And I create a test case
    And I create a test case
    Then the store should contain 3 test cases

  @test-case @crud
  Scenario: Create a test case linked to a story
    Given I initialize a project named "Test Case Test"
    And I add an epic with title "Auth Epic"
    And I create a story in epic "Auth Epic"
    When I create a test case linked to the last story
    Then the store should contain 1 test case
    And the test case should be linked to the story
    And the test case should be linked to epic "Auth Epic"

  @test-case @crud
  Scenario: Update a test case title
    Given I initialize a project named "Test Case Test"
    And I create a test case
    When I update the test case "TC-1" with title "Login happy path"
    Then the test case "TC-1" should have title "Login happy path"

  @test-case @crud
  Scenario: Delete a test case
    Given I initialize a project named "Test Case Test"
    And I create a test case
    And I create a test case
    When I delete the test case "TC-1"
    Then the store should contain 1 test case

  # Test Strategy Artifact
  @test-strategy @crud
  Scenario: Create a test strategy
    Given I initialize a project named "Test Strategy Test"
    When I create a test strategy
    Then the store should contain a test strategy
    And the test strategy should have id "TS-1"

  @test-strategy @crud
  Scenario: Create test strategy is idempotent
    Given I initialize a project named "Test Strategy Test"
    When I create a test strategy
    And I create a test strategy
    Then there should be exactly 1 test strategy

  @test-strategy @crud
  Scenario: Update test strategy title
    Given I initialize a project named "Test Strategy Test"
    And I create a test strategy
    When I update the test strategy with title "E2E Test Strategy"
    Then the test strategy should have title "E2E Test Strategy"

  @test-strategy @crud
  Scenario: Delete the test strategy
    Given I initialize a project named "Test Strategy Test"
    And I create a test strategy
    When I delete the test strategy
    Then the store should not contain a test strategy

  # ── Factory Methods ───────────────────────────────────────────────

  @epic @factory
  Scenario: createEpic assigns next ID and default values
    Given I initialize a project named "Factory Test"
    When I use createEpic to create an epic
    Then the created epic should have id "EPIC-1"
    And the store should contain 1 epic

  @epic @factory
  Scenario: createEpic avoids ID collision after deletion
    Given I initialize a project named "Factory Test"
    And I use createEpic to create 3 epics
    And I delete the epic with id "EPIC-2"
    When I use createEpic to create an epic
    Then the created epic should have id "EPIC-4"
    And the store should contain 3 epics

  @use-case @factory
  Scenario: createUseCase creates in specified epic
    Given I initialize a project named "UC Factory Test"
    And I use createEpic to create an epic
    When I create a use case in epic "EPIC-1"
    Then the use case should have id "UC-1-1"
    And the epic "EPIC-1" should have 1 use case

  @use-case @factory
  Scenario: createUseCase throws when epic not found
    Given I initialize a project named "UC Factory Test"
    And I use createEpic to create an epic
    When I try to create a use case in epic "EPIC-999"
    Then an error should have been thrown with message containing "not found"

  @use-case @factory
  Scenario: createUseCase creates a new epic when none exist
    Given I initialize a project named "UC Factory Test"
    When I create a use case without specifying an epic
    Then the store should contain 1 epic
    And the epic "EPIC-1" should have 1 use case

  @product-brief @factory
  Scenario: createProductBrief creates singleton
    Given I initialize a project named "PB Factory Test"
    When I create a product brief
    Then the store should contain a product brief
    And the product brief should have id "product-brief-1"

  @product-brief @factory
  Scenario: createProductBrief is idempotent
    Given I initialize a project named "PB Factory Test"
    When I create a product brief
    And I create a product brief
    Then the store should contain a product brief

  @prd @factory
  Scenario: createPRD creates singleton
    Given I initialize a project named "PRD Factory Test"
    When I create a PRD
    Then the store should contain a PRD
    And the PRD should have id "prd-1"

  @prd @factory
  Scenario: createPRD is idempotent
    Given I initialize a project named "PRD Factory Test"
    When I create a PRD
    And I create a PRD
    Then the store should contain a PRD

  @architecture @factory
  Scenario: createArchitecture creates singleton
    Given I initialize a project named "Arch Factory Test"
    When I create an architecture
    Then the store should contain an architecture
    And the architecture should have id "architecture-1"

  @architecture @factory
  Scenario: createArchitecture is idempotent
    Given I initialize a project named "Arch Factory Test"
    When I create an architecture
    And I create an architecture
    Then the store should contain an architecture

  # ── Delete Artifact (additional types) ────────────────────────────

  @vision @delete
  Scenario: Delete the vision
    Given I initialize a project named "Delete Test"
    And I create a vision artifact
    When I delete artifact type "vision" with id "vision-1"
    Then the store should not contain a vision

  @product-brief @delete
  Scenario: Delete the product brief
    Given I initialize a project named "Delete Test"
    And I create a product brief
    When I delete artifact type "product-brief" with id "product-brief-1"
    Then the store should not contain a product brief

  @prd @delete
  Scenario: Delete the PRD
    Given I initialize a project named "Delete Test"
    And I create a PRD
    When I delete artifact type "prd" with id "prd-1"
    Then the store should not contain a PRD

  @architecture @delete
  Scenario: Delete the architecture
    Given I initialize a project named "Delete Test"
    And I create an architecture
    When I delete artifact type "architecture" with id "architecture-1"
    Then the store should not contain an architecture

  @epic @delete
  Scenario: Delete epic cleans up requirement links
    Given I initialize a project named "Delete Test"
    And I use createEpic to create an epic
    And I create a requirement with title "Linked Req"
    And I link requirement "Linked Req" to epic "EPIC-1"
    When I delete artifact type "epic" with id "EPIC-1"
    Then the store should contain 0 epics
    And the requirement "Linked Req" should not reference epic "EPIC-1"

  @story @delete
  Scenario: Delete story removes it from parent epic
    Given I initialize a project named "Delete Test"
    And I use createEpic to create an epic
    And I create a story in epic "EPIC-1"
    When I delete artifact type "story" with id "STORY-1-1"
    Then the epic "EPIC-1" should have 0 stories

  @use-case @delete
  Scenario: Delete use case removes it from parent epic
    Given I initialize a project named "Delete Test"
    And I use createEpic to create an epic
    And I create a use case in epic "EPIC-1"
    When I delete artifact type "use-case" with id "UC-1-1"
    Then the epic "EPIC-1" should have 0 use cases

  @requirement @delete
  Scenario: Delete requirement cleans up epic back-links
    Given I initialize a project named "Delete Test"
    And I use createEpic to create an epic
    And I create a requirement with title "To Remove"
    And I link requirement "To Remove" to epic "EPIC-1"
    When I delete artifact type "requirement" with id the id of "To Remove"
    Then the store should contain 0 requirements
    And epic "EPIC-1" should not reference requirement "To Remove"

  @test-design @delete
  Scenario: Delete the test design
    Given I initialize a project named "Delete Test"
    And I create a test design
    When I delete artifact type "test-design" with id "test-design-1"
    Then the store should not contain a test design

  # ── findArtifactById ──────────────────────────────────────────────

  @find
  Scenario: findArtifactById finds vision
    Given I initialize a project named "Find Test"
    And I create a vision artifact
    When I find artifact by id "vision-1"
    Then the found artifact type should be "vision"

  @find
  Scenario: findArtifactById finds PRD
    Given I initialize a project named "Find Test"
    And I create a PRD
    When I find artifact by id "prd-1"
    Then the found artifact type should be "prd"

  @find
  Scenario: findArtifactById finds architecture
    Given I initialize a project named "Find Test"
    And I create an architecture
    When I find artifact by id "architecture-1"
    Then the found artifact type should be "architecture"

  @find
  Scenario: findArtifactById finds product brief
    Given I initialize a project named "Find Test"
    And I create a product brief
    When I find artifact by id "product-brief-1"
    Then the found artifact type should be "product-brief"

  @find
  Scenario: findArtifactById finds epic
    Given I initialize a project named "Find Test"
    And I use createEpic to create an epic
    When I find artifact by id "EPIC-1"
    Then the found artifact type should be "epic"

  @find
  Scenario: findArtifactById finds story
    Given I initialize a project named "Find Test"
    And I use createEpic to create an epic
    And I create a story in epic "EPIC-1"
    When I find artifact by id "STORY-1-1"
    Then the found artifact type should be "story"

  @find
  Scenario: findArtifactById finds use case
    Given I initialize a project named "Find Test"
    And I use createEpic to create an epic
    And I create a use case in epic "EPIC-1"
    When I find artifact by id "UC-1-1"
    Then the found artifact type should be "use-case"

  @find
  Scenario: findArtifactById finds requirement
    Given I initialize a project named "Find Test"
    And I create a requirement with title "Findable Req"
    When I find artifact by id the id of "Findable Req"
    Then the found artifact type should be "requirement"

  @find
  Scenario: findArtifactById finds test case
    Given I initialize a project named "Find Test"
    And I create a test case
    When I find artifact by id "TC-1"
    Then the found artifact type should be "test-case"

  @find
  Scenario: findArtifactById finds test strategy
    Given I initialize a project named "Find Test"
    And I create a test strategy
    When I find artifact by id "TS-1"
    Then the found artifact type should be "test-strategy"

  @find
  Scenario: findArtifactById returns null for unknown id
    Given I initialize a project named "Find Test"
    When I find artifact by id "NONEXISTENT-99"
    Then no artifact should be found

  # ── loadFromState ─────────────────────────────────────────────────

  @state
  Scenario: loadFromState replaces entire state
    Given I initialize a project named "State Test"
    When I load state with project name "Imported Project" and a vision and 2 epics
    Then the project name should be "Imported Project"
    And the store should contain a vision artifact
    And the store should contain 2 epics

  # ── mergeFromState ────────────────────────────────────────────────

  @merge
  Scenario: mergeFromState adds new epics without removing existing
    Given I initialize a project named "Merge Test"
    And I use createEpic to create an epic
    When I merge state with 1 new epic
    Then the store should contain 2 epics

  @merge
  Scenario: mergeFromState deduplicates epics by ID
    Given I initialize a project named "Merge Test"
    And I use createEpic to create an epic
    When I merge state with a duplicate EPIC-1
    Then the store should contain 1 epic

  @merge
  Scenario: mergeFromState fills empty singleton slots only
    Given I initialize a project named "Merge Test"
    And I create a vision artifact
    When I merge state with a different vision and a PRD
    Then the vision product name should not have changed
    And the store should contain a PRD

  @merge
  Scenario: mergeFromState merges new stories into existing epic
    Given I initialize a project named "Merge Test"
    And I use createEpic to create an epic
    And I create a story in epic "EPIC-1"
    When I merge state that adds a story to EPIC-1
    Then the epic "EPIC-1" should have 2 stories

  @merge
  Scenario: mergeFromState merges requirements by ID
    Given I initialize a project named "Merge Test"
    And I create a requirement with title "Existing Req"
    When I merge state with 1 new requirement and 1 duplicate
    Then the store should contain 2 requirements

  @merge
  Scenario: mergeFromState merges test cases by ID
    Given I initialize a project named "Merge Test"
    And I create a test case
    When I merge state with 1 new test case and 1 duplicate
    Then the store should contain 2 test cases

  # ── clearProject ──────────────────────────────────────────────────

  @project @clear
  Scenario: clearProject removes all artifacts and resets state
    Given I initialize a project named "Clear Test"
    And I create a vision artifact
    And I use createEpic to create an epic
    And I create a requirement with title "Some Req"
    When I clear the project
    Then the artifact store should have no artifacts
    And the store should not contain a vision

  # ── Refine and Workflow Context ───────────────────────────────────

  @context
  Scenario: Refine context round-trip
    Given I initialize a project named "Context Test"
    When I set refine context to an artifact
    Then the refine context should not be null
    When I clear the refine context
    Then the refine context should be null

  @context
  Scenario: Pending workflow launch round-trip
    Given I initialize a project named "Context Test"
    When I set pending workflow launch with trigger "generate-prd"
    Then the pending workflow launch should have trigger "generate-prd"
    When I clear the pending workflow launch
    Then the pending workflow launch should be null

  # ── hasSelection ──────────────────────────────────────────────────

  @selection
  Scenario: hasSelection returns false when nothing selected
    Given I initialize a project named "Selection Test"
    Then hasSelection should return false

  @selection
  Scenario: hasSelection returns true after selecting an artifact
    Given I initialize a project named "Selection Test"
    And I use createEpic to create an epic
    And I select epic "EPIC-1"
    Then hasSelection should return true

  # ── generateAllArtifactsMarkdown ──────────────────────────────────

  @markdown
  Scenario: generateAllArtifactsMarkdown returns epic breakdown for initialized project
    Given I initialize a project named "MD Test"
    When I generate all artifacts markdown
    Then the markdown should contain "MD Test - Epic Breakdown"
    And the markdown should contain "## Epics"

  @markdown
  Scenario: generateAllArtifactsMarkdown includes populated artifacts
    Given I initialize a project named "MD Test"
    And I create a product brief
    And I create a PRD
    And I use createEpic to create an epic
    And I create an architecture
    And I create a test case
    And I create a test strategy
    When I generate all artifacts markdown
    Then the markdown should not contain "No artifacts have been created yet"
    And the markdown should contain "---"
