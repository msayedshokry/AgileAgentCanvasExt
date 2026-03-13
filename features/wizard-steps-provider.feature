Feature: WizardStepsProvider
  Tests for the wizard steps tree view provider

  Background:
    Given a fresh wizard steps provider

  # Constructor tests
  Scenario: Creates provider with store reference
    Then the wizard steps provider should be defined

  Scenario: Listens for selection changes on construction
    Then the provider should listen for selection changes

  # onDidChangeTreeData tests
  Scenario: Exposes onDidChangeTreeData event
    Then onDidChangeTreeData should be defined

  Scenario: Fires event on refresh
    When I register a tree data change handler
    And I call refresh on wizard steps provider
    Then the tree data change handler should have been called

  # refresh tests
  Scenario: Fires tree data change event on refresh
    When I register a tree data change handler
    And I call refresh on wizard steps provider
    Then the tree data change handler should have been called

  # getTreeItem tests
  Scenario: Returns element as-is from getTreeItem
    When I get wizard step children with no selection
    Then getTreeItem should return the first child as-is

  # Default BMAD process view
  Scenario: Shows header as first item in default view
    When I get wizard step children with no selection
    Then the first child label should be "Agile Agent Canvas Process"
    And the first child description should be "Select an artifact for detailed workflow"

  Scenario: Shows all default steps
    When I get wizard step children with no selection
    Then the wizard step labels should contain "Vision"
    And the wizard step labels should contain "Requirements"
    And the wizard step labels should contain "Epics"
    And the wizard step labels should contain "Stories"
    And the wizard step labels should contain "Enhancement"
    And the wizard step labels should contain "Review"

  Scenario: Marks vision as completed when vision exists
    When I get wizard step children with no selection
    Then the wizard step "Vision" should have contextValue "workflow-completed"

  Scenario: Marks requirements as completed when requirements exist
    Given a requirement exists in the store
    When I get wizard step children with no selection
    Then the wizard step "Requirements" should have contextValue "workflow-completed"

  Scenario: Marks epics as completed when epics exist
    Given an epic exists in the wizard store
    When I get wizard step children with no selection
    Then the wizard step "Epics" should have contextValue "workflow-completed"

  Scenario: Marks stories as completed when stories exist
    Given an epic with a story exists in the wizard store
    When I get wizard step children with no selection
    Then the wizard step "Stories" should have contextValue "workflow-completed"

  Scenario: Includes goToStep command for Vision step
    When I get wizard step children with no selection
    Then the wizard step "Vision" should have command "agileagentcanvas.goToStep"
    And the wizard step "Vision" command arguments should contain "vision"

  Scenario: Returns empty array for child elements
    When I get wizard step children with no selection
    Then getting children of the first wizard step item should return empty array

  # Epic selected view
  Scenario: Shows epic header when epic is selected
    Given an epic "Test Epic" is selected in wizard steps
    When I get wizard step children with no selection
    Then the first child label should contain "EPIC:"
    And the first child label should contain "Test Epic"

  Scenario: Shows epic workflow steps when epic is selected
    Given an epic "Test Epic" is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step labels should contain "Validate Epic"
    And the wizard step labels should contain "Enhance Epic"
    And the wizard step labels should contain "Create Stories"
    And the wizard step labels should contain "Review"

  Scenario: Marks validate as completed when epic has title and goal
    Given an epic "Test Epic" is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Validate Epic" should have contextValue "workflow-completed"

  Scenario: Marks create-stories as completed when stories exist
    Given an epic "Test Epic" with a story is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Create Stories" should have contextValue "workflow-completed"

  Scenario: Includes refine action for epic
    Given an epic "Test Epic" is selected in wizard steps
    When I get wizard step children with no selection
    Then a wizard step "Refine with AI" should exist
    And the wizard step "Refine with AI" should have command "agileagentcanvas.openChatPanel"

  Scenario: Shows blocked steps when epic dependencies not met
    Given an incomplete epic is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Enhance Epic" should have contextValue "workflow-blocked"

  # Story selected view
  Scenario: Shows story header when story is selected
    Given a story "Test Story" is selected in wizard steps
    When I get wizard step children with no selection
    Then the first child label should contain "STORY:"
    And the first child label should contain "Test Story"

  Scenario: Shows story workflow steps when story is selected
    Given a story "Test Story" is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step labels should contain "Validate Story"
    And the wizard step labels should contain "Enhance Story"
    And the wizard step labels should contain "Add Acceptance Criteria"
    And the wizard step labels should contain "Add Technical Notes"
    And the wizard step labels should contain "Implementation Ready"

  Scenario: Marks validate as completed when story has user story fields
    Given a story "Test Story" is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Validate Story" should have contextValue "workflow-completed"

  # Requirement selected view
  Scenario: Shows requirement header when requirement is selected
    Given a requirement "Test Requirement" is selected in wizard steps
    When I get wizard step children with no selection
    Then the first child label should contain "REQUIREMENT:"
    And the first child label should contain "Test Requirement"

  Scenario: Shows requirement workflow steps when requirement is selected
    Given a requirement "Test Requirement" is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step labels should contain "Validate Requirement"
    And the wizard step labels should contain "Link to Epic"
    And the wizard step labels should contain "Link to Story"
    And the wizard step labels should contain "Review"

  Scenario: Marks validate as completed when requirement has title and description
    Given a requirement "Test Requirement" is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Validate Requirement" should have contextValue "workflow-completed"

  # Vision selected view
  Scenario: Shows vision header when vision is selected
    Given a vision "Test Product" is selected in wizard steps
    When I get wizard step children with no selection
    Then the first child label should contain "VISION:"
    And the first child label should contain "Test Product"

  Scenario: Shows vision workflow steps when vision is selected
    Given a vision "Test Product" is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step labels should contain "Define Vision"
    And the wizard step labels should contain "Target Users"
    And the wizard step labels should contain "Value Proposition"
    And the wizard step labels should contain "Success Criteria"
    And the wizard step labels should contain "Approve Vision"

  Scenario: Marks all steps as completed for complete vision
    Given a vision "Test Product" is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Define Vision" should have contextValue "workflow-completed"
    And the wizard step "Target Users" should have contextValue "workflow-completed"
    And the wizard step "Value Proposition" should have contextValue "workflow-completed"
    And the wizard step "Success Criteria" should have contextValue "workflow-completed"

  # Active workflow session view
  Scenario: Shows session header for active session
    Given an active workflow session exists for "Epic Creation" on "EPIC-1"
    When I get wizard step children with no selection
    Then the first child label should be "Workflow: Epic Creation"
    And the first child description should be "epic EPIC-1"

  Scenario: Shows completed steps in session view
    Given an active workflow session exists for "Epic Creation" on "EPIC-1"
    When I get wizard step children with no selection
    Then a wizard step containing "Step 1:" should exist
    And the step containing "Step 1:" should have contextValue "workflow-completed"

  Scenario: Shows current step in session view
    Given an active workflow session exists for "Epic Creation" on "EPIC-1"
    When I get wizard step children with no selection
    Then a wizard step containing "Step 2:" should exist
    And the step containing "Step 2:" should have contextValue "workflow-current"

  Scenario: Shows next step in session view
    Given an active workflow session exists for "Epic Creation" on "EPIC-1"
    When I get wizard step children with no selection
    Then a wizard step containing "Next:" should exist
    And the step containing "Next:" should have contextValue "workflow-pending"

  Scenario: Shows continue workflow action in session view
    Given an active workflow session exists for "Epic Creation" on "EPIC-1"
    When I get wizard step children with no selection
    Then the wizard step "Continue Workflow" should have command "agileagentcanvas.continueWorkflow"

  Scenario: Shows cancel workflow action in session view
    Given an active workflow session exists for "Epic Creation" on "EPIC-1"
    When I get wizard step children with no selection
    Then the wizard step "Cancel Workflow" should have command "agileagentcanvas.cancelWorkflow"

  # Inactive session - should not show session view
  Scenario: Shows default view for completed session
    Given a completed workflow session exists
    When I get wizard step children with no selection
    Then the first child label should be "Agile Agent Canvas Process"

  # Artifact icons
  Scenario: Shows icon for epic header
    Given an epic is selected in wizard steps
    When I get wizard step children with no selection
    Then the first child iconPath should be defined

  Scenario: Shows icon for story header
    Given a story is selected in wizard steps
    When I get wizard step children with no selection
    Then the first child iconPath should be defined

  Scenario: Shows icon for requirement header
    Given a requirement is selected in wizard steps
    When I get wizard step children with no selection
    Then the first child iconPath should be defined

  Scenario: Shows icon for vision header
    Given vision is selected in wizard steps
    When I get wizard step children with no selection
    Then the first child iconPath should be defined

  # Step name extraction
  Scenario: Extracts readable name from step path
    Given an active session with path-based step names
    When I get wizard step children with no selection
    Then a wizard step containing "Step 2:" should exist
    And the step containing "Step 2:" should contain "Define Goal"

  # WorkflowTreeItem
  Scenario: Sets workflow-header contextValue on header items
    When I get wizard step children with no selection
    Then the first child contextValue should be "workflow-header"

  Scenario: Has tooltip for header items
    When I get wizard step children with no selection
    Then the first child tooltip should be defined

  Scenario: Refine action is defined for selected epic
    Given an epic is selected in wizard steps
    When I get wizard step children with no selection
    Then a wizard step "Refine with AI" should exist

  Scenario: Blocked items have tooltip containing "Blocked"
    Given an incomplete epic is selected in wizard steps
    When I get wizard step children with no selection
    Then any blocked wizard step should have tooltip containing "Blocked"

  # Dependency checking
  Scenario: Blocks steps with unmet dependencies
    Given an incomplete epic is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Enhance Epic" should have contextValue "workflow-blocked"

  Scenario: Does not block validate which has no dependencies
    Given an incomplete epic is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Validate Epic" should have contextValue "workflow-current"

  Scenario: Shows command for non-blocked steps
    Given an epic "Test Epic" is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Enhance Epic" should have command "agileagentcanvas.executeWorkflowStep"

  Scenario: No command for blocked steps
    Given an incomplete epic is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Enhance Epic" should have no command

  Scenario: Shows Requires description for blocked steps
    Given an incomplete epic is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Enhance Epic" description should contain "Requires:"

  # Unknown artifact type
  Scenario: Handles unknown artifact type gracefully
    Given an unknown artifact type "unknown-type" is selected in wizard steps
    When I get wizard step children with no selection
    Then the first child label should contain "UNKNOWN-TYPE:"
    And a wizard step "Refine with AI" should exist

  # Vision approval status
  Scenario: Marks review as pending when vision not approved
    Given a draft vision "P" is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Approve Vision" should not have contextValue "workflow-completed"

  # Story review status
  Scenario: Marks review as completed when story is ready
    Given a ready story is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Implementation Ready" should have contextValue "workflow-completed"

  # Epic review status
  Scenario: Marks review as completed when epic is ready
    Given a ready epic is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Review" should have contextValue "workflow-completed"

  # Requirement linking status
  Scenario: Marks link-epic as completed when requirement has related epics
    Given a requirement with related epics is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Link to Epic" should have contextValue "workflow-completed"

  Scenario: Marks link-story as completed when requirement has related stories
    Given a requirement with related epics and stories is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Link to Story" should have contextValue "workflow-completed"

  Scenario: Marks review as completed when requirement has both linked
    Given a requirement with related epics and stories is selected in wizard steps
    When I get wizard step children with no selection
    Then the wizard step "Review" should have contextValue "workflow-completed"
