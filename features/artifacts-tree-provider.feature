Feature: ArtifactsTreeProvider - VS Code Tree View
  As an AgentCanvas user
  I want to see my project artifacts in a tree view
  So that I can navigate and manage them easily

  Background:
    Given a fresh artifacts tree provider

  # Root Items Tests
  @root
  Scenario: Returns root items when no element provided
    When I get root children
    Then the tree items should not be empty

  @root
  Scenario: Shows no project loaded when no project name
    When I get root children
    Then a tree item with context "no-project" or "project-name" should exist
    And that item label should contain "No project"

  @root
  Scenario: Shows project name when project is initialized
    Given the store has project "My Test Project"
    When I get root children
    Then a tree item with context "project-name" should exist
    And that item label should be "My Test Project"

  @root
  Scenario: Shows Vision category
    When I get root children
    Then a tree item with context "category-vision" should exist
    And that item label should be "Vision"

  @root
  Scenario: Shows Requirements category
    When I get root children
    Then a tree item with context "category-requirements" should exist
    And that item label should be "Requirements"

  @root
  Scenario: Shows Epics category
    When I get root children
    Then a tree item with context "category-epics" should exist
    And that item label should be "Epics"

  @root
  Scenario: Shows requirement count when requirements exist
    Given the store has 2 requirements
    When I get root children
    Then the "category-requirements" item description should contain "2 requirements"

  @root
  Scenario: Shows epic count when epics exist
    Given the store has 1 epic with title "Test Epic"
    When I get root children
    Then the "category-epics" item description should contain "1 epic"

  # Epic Items Tests
  @epics
  Scenario: Returns epic items when epics category is expanded
    Given the store has an epic with id "EPIC-1" and title "First Epic"
    And the store has an epic with id "EPIC-2" and title "Second Epic"
    When I expand the "category-epics" category
    Then the tree items should contain 2 items
    And item 1 label should contain "First Epic"
    And item 2 label should contain "Second Epic"

  @epics
  Scenario: Sets epic ID on tree item
    Given the store has an epic with id "EPIC-TEST" and title "Test"
    When I expand the "category-epics" category
    Then item 1 id should be "EPIC-TEST"

  @epics
  Scenario: Sets command on epic item
    Given the store has an epic with id "EPIC-1" and title "Test"
    When I expand the "category-epics" category
    Then item 1 command should be "agentcanvas.selectArtifact"
    And item 1 command arguments should be "epic" and "EPIC-1"

  @epics
  Scenario: Shows story count in epic description
    Given the store has an epic with id "EPIC-1" and title "Test"
    And the epic "EPIC-1" has 2 stories
    When I expand the "category-epics" category
    Then item 1 description should contain "2 stories"

  # Story Items Tests
  @stories
  Scenario: Returns story items when epic is expanded
    Given the store has an epic with id "EPIC-1" and title "Test Epic"
    And the epic "EPIC-1" has a story with id "STORY-1-1" and title "First Story"
    And the epic "EPIC-1" has a story with id "STORY-1-2" and title "Second Story"
    When I expand the epic "EPIC-1"
    Then the tree items should contain 2 items
    And item 1 label should contain "First Story"
    And item 2 label should contain "Second Story"

  @stories
  Scenario: Sets story ID on tree item
    Given the store has an epic with id "EPIC-1" and title "Test"
    And the epic "EPIC-1" has a story with id "STORY-1-1" and title "Test Story"
    When I expand the epic "EPIC-1"
    Then item 1 id should be "STORY-1-1"

  @stories
  Scenario: Shows story points in description
    Given the store has an epic with id "EPIC-1" and title "Test"
    And the epic "EPIC-1" has a story with id "STORY-1-1" title "Test Story" and 5 story points
    When I expand the epic "EPIC-1"
    Then item 1 description should contain "5 pts"

  @stories
  Scenario: Returns empty array for non-existent epic
    When I get children for a fake epic with id "EPIC-NONEXISTENT"
    Then the tree items should be empty

  # Requirement Items Tests
  @requirements
  Scenario: Returns items when requirements category is expanded
    Given the store has 1 requirement with id "FR-1"
    When I expand the "category-requirements" category
    Then the tree items should not be empty

  @requirements
  Scenario: Shows functional requirements count
    Given the store has 2 requirements
    When I expand the "category-requirements" category
    Then a tree item with context "req-functional" should exist
    And that item label should contain "Functional (2)"

  # Tree Item Tests
  @treeitem
  Scenario: getTreeItem returns the same element
    When I get root children
    And I call getTreeItem on the first item
    Then it should return the same item

  # Refresh Tests
  @refresh
  Scenario: Refresh fires onDidChangeTreeData event
    When I subscribe to tree data changes
    And I call refresh
    Then the tree data change event should have fired

  # Status Icon Tests
  @icons
  Scenario: Shows icon for draft status epic
    Given the store has an epic with id "EPIC-1" title "Test" and status "draft"
    When I expand the "category-epics" category
    Then item 1 iconPath should be defined

  @icons
  Scenario: Shows different icons for different statuses
    Given the store has an epic with id "EPIC-1" title "Draft Epic" and status "draft"
    And the store has an epic with id "EPIC-2" title "Done Epic" and status "done"
    When I expand the "category-epics" category
    Then item 1 iconPath should be defined
    And item 2 iconPath should be defined
