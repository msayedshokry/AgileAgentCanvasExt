Feature: Artifact Transformer - Store-to-Canvas Layout
  As an AgileAgentCanvas developer
  I want to transform artifact store state into a positioned canvas layout
  So that the webview can render artifacts in an organized multi-column view

  Background:
    Given a fresh artifact transformer

  # ─── Empty / Minimal State ─────────────────────────────────────────

  @transformer @empty
  Scenario: Empty store produces no artifacts
    When I build artifacts from an empty store
    Then the artifact count should be 0

  @transformer @empty
  Scenario: Store with only null top-level fields produces no artifacts
    Given the store state has null productBrief and null vision
    When I build artifacts from the store
    Then the artifact count should be 0

  # ─── Column 1: Discovery Phase ─────────────────────────────────────

  @transformer @discovery
  Scenario: Product brief produces a single card in column 1
    Given the store has a product brief with name "My Product" and tagline "Best ever"
    When I build artifacts from the store
    Then the artifact count should be 1
    And artifact "product-brief-1" should have type "product-brief"
    And artifact "product-brief-1" should have title "My Product"
    And artifact "product-brief-1" position x should be 50
    And artifact "product-brief-1" should have status "draft"
    And artifact "product-brief-1" should have 0 dependencies

  @transformer @discovery
  Scenario: Product brief uses custom id if provided
    Given the store has a product brief with id "PB-42" and name "Custom ID Product"
    When I build artifacts from the store
    Then artifact "PB-42" should have type "product-brief"
    And artifact "PB-42" should have title "Custom ID Product"

  @transformer @discovery
  Scenario: Vision card appears below product brief
    Given the store has a product brief with name "Product" and tagline "Tag"
    And the store has a vision with productName "My Vision" and problemStatement "Big problem"
    When I build artifacts from the store
    Then the artifact count should be 2
    And artifact "vision-1" should have type "vision"
    And artifact "vision-1" should have title "My Vision"
    And artifact "vision-1" position x should be 50
    And artifact "vision-1" position y should be greater than artifact "product-brief-1" position y

  @transformer @discovery
  Scenario: Vision without product brief has no parentId
    Given the store has a vision with productName "Standalone Vision" and problemStatement "Problem"
    When I build artifacts from the store
    Then the artifact count should be 1
    And artifact "vision-1" should have no parentId

  @transformer @discovery
  Scenario: Vision with product brief has product-brief-1 as parentId
    Given the store has a product brief with name "Product" and tagline "Tag"
    And the store has a vision with productName "Linked Vision" and problemStatement "Problem"
    When I build artifacts from the store
    And artifact "vision-1" parentId should be "product-brief-1"

  @transformer @discovery
  Scenario: Vision childCount reflects total requirement count
    Given the store has a vision with productName "Vision" and problemStatement "Problem"
    And the store has 3 functional requirements
    And the store has 2 non-functional requirements
    And the store has 1 additional requirements
    When I build artifacts from the store
    Then artifact "vision-1" childCount should be 6

  # ─── Column 2: Planning Phase ──────────────────────────────────────

  @transformer @planning
  Scenario: PRD card appears in column 2
    Given the store has a PRD with productName "My PRD" and purpose "Build stuff"
    When I build artifacts from the store
    Then artifact "prd-1" should have type "prd"
    And artifact "prd-1" should have title "My PRD"
    And artifact "prd-1" position x should be 390

  @transformer @planning
  Scenario: PRD with vision has vision-1 as parentId
    Given the store has a vision with productName "Vision" and problemStatement "P"
    And the store has a PRD with productName "PRD" and purpose "Purpose"
    When I build artifacts from the store
    And artifact "prd-1" parentId should be "vision-1"

  @transformer @planning
  Scenario: PRD without vision has no parentId
    Given the store has a PRD with productName "PRD" and purpose "Purpose"
    When I build artifacts from the store
    And artifact "prd-1" should have no parentId

  @transformer @planning
  Scenario: PRD risks become child risk cards
    Given the store has a PRD with productName "PRD" and purpose "Purpose"
    And the PRD has 2 risks
    When I build artifacts from the store
    Then the artifact count should be 3
    And artifact "risk-0" should have type "risk"
    And artifact "risk-0" parentId should be "prd-1"
    And artifact "risk-1" should have type "risk"
    And artifact "risk-1" parentId should be "prd-1"

  @transformer @planning
  Scenario: Functional requirements appear in column 2
    Given the store has a vision with productName "V" and problemStatement "P"
    And the store has 2 functional requirements
    When I build artifacts from the store
    Then artifact "req-0" should have type "requirement"
    And artifact "req-0" position x should be 390
    And artifact "req-0" parentId should be "vision-1"
    And artifact "req-1" should have type "requirement"

  @transformer @planning
  Scenario: Non-functional requirements produce nfr type cards
    Given the store has 2 non-functional requirements
    When I build artifacts from the store
    Then artifact "nfr-0" should have type "nfr"
    And artifact "nfr-0" position x should be 390

  @transformer @planning
  Scenario: Additional requirements produce additional-req type cards
    Given the store has 1 additional requirements
    When I build artifacts from the store
    Then artifact "add-req-0" should have type "additional-req"
    And artifact "add-req-0" position x should be 390

  @transformer @planning
  Scenario: Requirement childCount reflects related epics
    Given the store has a vision with productName "V" and problemStatement "P"
    And the store has a functional requirement with id "REQ-1" and title "Feature A"
    And the store has an epic with id "EPIC-1" linked to requirement "REQ-1"
    When I build artifacts from the store
    Then artifact "REQ-1" childCount should be 1

  # ─── Column 3: Solutioning Phase ──────────────────────────────────

  @transformer @solutioning
  Scenario: Architecture card appears in column 3
    Given the store has architecture with projectName "My Arch" and summary "Microservices"
    When I build artifacts from the store
    Then artifact "architecture-1" should have type "architecture"
    And artifact "architecture-1" should have title "My Arch"
    And artifact "architecture-1" position x should be 1450

  @transformer @solutioning
  Scenario: Architecture with PRD has prd-1 as parentId
    Given the store has a PRD with productName "PRD" and purpose "Purpose"
    And the store has architecture with projectName "Arch" and summary "Summary"
    When I build artifacts from the store
    And artifact "architecture-1" parentId should be "prd-1"

  @transformer @solutioning
  Scenario: Architecture decisions become child cards
    Given the store has architecture with projectName "Arch" and summary "S"
    And the architecture has 2 decisions
    When I build artifacts from the store
    Then artifact "arch-decision-0" should have type "architecture-decision"
    And artifact "arch-decision-0" parentId should be "architecture-1"
    And artifact "arch-decision-0" position x should be 1450

  @transformer @solutioning
  Scenario: System components become child cards
    Given the store has architecture with projectName "Arch" and summary "S"
    And the architecture has 2 system components
    When I build artifacts from the store
    Then artifact "sys-component-0" should have type "system-component"
    And artifact "sys-component-0" parentId should be "architecture-1"

  @transformer @solutioning
  Scenario: Architecture childCount reflects decisions plus components
    Given the store has architecture with projectName "Arch" and summary "S"
    And the architecture has 2 decisions
    And the architecture has 3 system components
    When I build artifacts from the store
    Then artifact "architecture-1" childCount should be 5

  # ─── Column 4+: Implementation Phase (Epics) ──────────────────────

  @transformer @implementation
  Scenario: Epic card appears in column 4
    Given the store has an epic with title "Epic One" and goal "Build feature"
    When I build artifacts from the store
    Then artifact "epic-0" should have type "epic"
    And artifact "epic-0" should have title "Epic One"
    And artifact "epic-0" position x should be 2530

  @transformer @implementation
  Scenario: Epic stories appear in column 5
    Given the store has an epic with title "Epic" and 2 stories
    When I build artifacts from the store
    Then the artifacts should contain type "story"
    And all "story" artifacts position x should be at least 2830

  @transformer @implementation
  Scenario: Story has epicId in its parentId
    Given the store has an epic with id "EPIC-1" and title "Epic" and 1 stories
    When I build artifacts from the store
    Then the first "story" artifact parentId should be "EPIC-1"

  @transformer @implementation
  Scenario: Story userStory fields compose the description
    Given the store has an epic with title "Epic" and a story with userStory "developer" "write tests" "code is reliable"
    When I build artifacts from the store
    Then the first "story" artifact description should contain "As a developer"
    And the first "story" artifact description should contain "I want write tests"
    And the first "story" artifact description should contain "so that code is reliable"

  @transformer @implementation
  Scenario: Epic with use cases produces use-case cards
    Given the store has an epic with title "Epic" and 2 use cases
    When I build artifacts from the store
    Then the artifacts should contain type "use-case"
    And all "use-case" artifacts position x should be at least 2830

  @transformer @implementation
  Scenario: Tasks under stories produce task cards
    Given the store has an epic with title "Epic" and a story with 3 tasks
    When I build artifacts from the store
    Then the artifacts should contain type "task"
    And the artifact count for type "task" should be 3

  @transformer @implementation
  Scenario: Completed task gets status "complete"
    Given the store has an epic with title "Epic" and a story with a completed task
    When I build artifacts from the store
    Then the first "task" artifact should have status "complete"

  @transformer @implementation
  Scenario: Incomplete task gets status "draft"
    Given the store has an epic with title "Epic" and a story with an incomplete task
    When I build artifacts from the store
    Then the first "task" artifact should have status "draft"

  @transformer @implementation
  Scenario: Epic roll-up computes total story points
    Given the store has an epic with title "Epic" and stories with points 3, 5, 8
    When I build artifacts from the store
    Then artifact "epic-0" metadata totalStoryPoints should be 16

  @transformer @implementation
  Scenario: Epic roll-up computes done story count
    Given the store has an epic with title "Epic" and stories with statuses "done", "draft", "done"
    When I build artifacts from the store
    Then artifact "epic-0" metadata doneStoryCount should be 2
    And artifact "epic-0" metadata totalStoryCount should be 3

  # ─── Dependencies ──────────────────────────────────────────────────

  @transformer @dependencies
  Scenario: Epic depends on its functional requirements
    Given the store has a vision with productName "V" and problemStatement "P"
    And the store has a functional requirement with id "REQ-1" and title "Feature"
    And the store has an epic with id "EPIC-1" linked to requirement "REQ-1"
    When I build artifacts from the store
    Then artifact "EPIC-1" dependencies should include "REQ-1"

  @transformer @dependencies
  Scenario: Epic upstream dependencies are added
    Given the store has an epic with id "EPIC-A" and title "First" and no stories
    And the store has an epic with id "EPIC-B" and title "Second" with upstream dependency "EPIC-A"
    When I build artifacts from the store
    Then artifact "EPIC-B" dependencies should include "EPIC-A"

  @transformer @dependencies
  Scenario: Epic downstream dependencies inject reverse deps
    Given the store has an epic with id "EPIC-A" and title "First" with downstream dependency "EPIC-B"
    And the store has an epic with id "EPIC-B" and title "Second" and no stories
    When I build artifacts from the store
    Then artifact "EPIC-B" dependencies should include "EPIC-A"

  @transformer @dependencies
  Scenario: Story blockedBy adds dependency
    Given the store has an epic with title "Epic" and 2 stories where story 1 is blocked by story 0
    When I build artifacts from the store
    Then the second "story" artifact dependencies should include the first story id

  @transformer @dependencies
  Scenario: Story blocks adds reverse dependency
    Given the store has an epic with title "Epic" and 2 stories where story 0 blocks story 1
    When I build artifacts from the store
    Then the second "story" artifact dependencies should include the first story id

  # ─── Test Cases ────────────────────────────────────────────────────

  @transformer @testcases
  Scenario: Story-linked test cases produce a test-coverage card under the story
    Given the store has an epic with id "EPIC-1" and title "Epic" and 1 stories
    And the store has 2 test cases linked to story "story-0-0" and epic "EPIC-1"
    When I build artifacts from the store
    Then the artifacts should contain type "test-coverage"
    And artifact "TC-COV-story-0-0" should have type "test-coverage"
    And artifact "TC-COV-story-0-0" parentId should be "story-0-0"

  @transformer @testcases
  Scenario: Epic-only test cases produce a test-coverage card under the epic
    Given the store has an epic with id "EPIC-1" and title "Epic" and 1 stories
    And the store has 2 test cases linked to epic "EPIC-1" with no story
    When I build artifacts from the store
    Then artifact "TC-COV-EPIC-1" should have type "test-coverage"
    And artifact "TC-COV-EPIC-1" parentId should be "EPIC-1"

  @transformer @testcases
  Scenario: Orphan test cases produce a test-coverage card at the bottom
    Given the store has 3 orphan test cases
    When I build artifacts from the store
    Then artifact "TC-COV-ORPHAN" should have type "test-coverage"
    And artifact "TC-COV-ORPHAN" metadata totalCount should be 3

  @transformer @testcases
  Scenario: Test coverage status reflects pass/fail counts
    Given the store has an epic with id "EPIC-1" and title "Epic" and 1 stories
    And the store has test cases for story "story-0-0" with statuses "passed", "failed", "draft"
    When I build artifacts from the store
    Then artifact "TC-COV-story-0-0" metadata passCount should be 1
    And artifact "TC-COV-story-0-0" metadata failCount should be 1
    And artifact "TC-COV-story-0-0" metadata draftCount should be 1
    And artifact "TC-COV-story-0-0" should have status "blocked"

  @transformer @testcases
  Scenario: All-passing test coverage gets status complete
    Given the store has an epic with id "EPIC-1" and title "Epic" and 1 stories
    And the store has test cases for story "story-0-0" with statuses "passed", "completed"
    When I build artifacts from the store
    Then artifact "TC-COV-story-0-0" should have status "complete"

  @transformer @testcases
  Scenario: All-draft test coverage gets status draft
    Given the store has an epic with id "EPIC-1" and title "Epic" and 1 stories
    And the store has test cases for story "story-0-0" with statuses "draft", "draft"
    When I build artifacts from the store
    Then artifact "TC-COV-story-0-0" should have status "draft"

  # ─── Test Strategy ─────────────────────────────────────────────────

  @transformer @teststrategy
  Scenario: Standalone test strategy produces a test-strategy card
    Given the store has a test strategy with title "Integration Tests" and scope "All APIs"
    When I build artifacts from the store
    Then artifact "TS-1" should have type "test-strategy"
    And artifact "TS-1" should have title "Integration Tests"

  @transformer @teststrategy
  Scenario: Per-epic test strategy produces a test-strategy card under the epic
    Given the store has an epic with id "EPIC-1" and title "Epic" and a test strategy "Unit Tests"
    When I build artifacts from the store
    Then the artifacts should contain type "test-strategy"
    And the first "test-strategy" artifact parentId should be "EPIC-1"

  @transformer @teststrategy
  Scenario: Test strategy with vision depends on vision
    Given the store has a vision with productName "V" and problemStatement "P"
    And the store has a test strategy with title "Strategy" and scope "Scope"
    When I build artifacts from the store
    Then artifact "TS-1" dependencies should include "vision-1"

  # ─── Card Sizing ───────────────────────────────────────────────────

  @transformer @sizing
  Scenario: Card widths match expected values per type
    Given the store has a product brief with name "P" and tagline "T"
    And the store has architecture with projectName "A" and summary "S"
    And the store has an epic with title "E" and 1 stories
    When I build artifacts from the store
    Then artifact "product-brief-1" width should be 280
    And artifact "architecture-1" width should be 280
    And artifact "epic-0" width should be 260
    And the first "story" artifact width should be 250

  @transformer @sizing
  Scenario: Long title increases card height
    Given the store has a product brief with name "This Is A Very Long Product Name That Should Cause Extra Title Height" and tagline "T"
    When I build artifacts from the store
    Then artifact "product-brief-1" height should be greater than 120

  @transformer @sizing
  Scenario: Long description increases card height up to cap
    Given the store has a vision with productName "V" and a very long problemStatement
    When I build artifacts from the store
    Then artifact "vision-1" height should be greater than 110

  # ─── Full Pipeline ─────────────────────────────────────────────────

  @transformer @pipeline
  Scenario: Full pipeline produces all expected artifact types
    Given the store has a full project with all phases
    When I build artifacts from the store
    Then the artifacts should contain type "product-brief"
    And the artifacts should contain type "vision"
    And the artifacts should contain type "prd"
    And the artifacts should contain type "architecture"
    And the artifacts should contain type "epic"
    And the artifacts should contain type "story"
    And the artifacts should contain type "requirement"
    And the artifact count should be at least 7

  @transformer @pipeline
  Scenario: Artifacts have non-overlapping Y positions within same column
    Given the store has a vision with productName "V" and problemStatement "P"
    And the store has 3 functional requirements
    When I build artifacts from the store
    Then all "requirement" artifacts should have non-overlapping Y positions
