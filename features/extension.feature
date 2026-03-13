Feature: Extension - VS Code Extension Activation
  As an AgileAgentCanvas user
  I want the extension to activate correctly
  So that all commands and providers are available

  Background:
    Given a fresh extension activation

  # Activation Tests
  Scenario: Shows activation message
    When I activate the extension
    Then window showInformationMessage should have been called with "Agile Agent Canvas activated!"

  Scenario: Registers chat participant
    When I activate the extension
    Then chat createChatParticipant should have been called with "agileagentcanvas.analyst"

  Scenario: Creates tree views for artifacts and wizard steps
    When I activate the extension
    Then window createTreeView should have been called with "agileagentcanvas.artifactsTree"
    And window createTreeView should have been called with "agileagentcanvas.wizardSteps"

  Scenario: Adds subscriptions to context
    When I activate the extension
    Then context subscriptions should not be empty

  # Command Registration Tests
  Scenario: Registers agileagentcanvas.openCanvas command
    When I activate the extension
    Then command "agileagentcanvas.openCanvas" should be registered

  Scenario: Registers agileagentcanvas.newProject command
    When I activate the extension
    Then command "agileagentcanvas.newProject" should be registered

  Scenario: Registers agileagentcanvas.loadProject command
    When I activate the extension
    Then command "agileagentcanvas.loadProject" should be registered

  Scenario: Registers agileagentcanvas.exportArtifacts command
    When I activate the extension
    Then command "agileagentcanvas.exportArtifacts" should be registered

  Scenario: Registers agileagentcanvas.syncToFiles command
    When I activate the extension
    Then command "agileagentcanvas.syncToFiles" should be registered

  Scenario: Registers agileagentcanvas.goToStep command
    When I activate the extension
    Then command "agileagentcanvas.goToStep" should be registered

  Scenario: Registers agileagentcanvas.selectArtifact command
    When I activate the extension
    Then command "agileagentcanvas.selectArtifact" should be registered

  Scenario: Registers agileagentcanvas.loadDemoData command
    When I activate the extension
    Then command "agileagentcanvas.loadDemoData" should be registered

  Scenario: Registers workflow session commands
    When I activate the extension
    Then command "agileagentcanvas.continueWorkflow" should be registered
    And command "agileagentcanvas.workflowStatus" should be registered
    And command "agileagentcanvas.cancelWorkflow" should be registered

  Scenario: Registers agileagentcanvas.executeWorkflowStep command
    When I activate the extension
    Then command "agileagentcanvas.executeWorkflowStep" should be registered

  # Command Execution Tests
  Scenario: agileagentcanvas.continueWorkflow opens chat with continue command
    When I activate the extension
    And I execute the command "agileagentcanvas.continueWorkflow"
    Then executeCommand should have been called with "workbench.action.chat.open" and query "@agileagentcanvas /continue"

  Scenario: agileagentcanvas.workflowStatus opens chat with status command
    When I activate the extension
    And I execute the command "agileagentcanvas.workflowStatus"
    Then executeCommand should have been called with "workbench.action.chat.open" and query "@agileagentcanvas /status"

  Scenario: agileagentcanvas.cancelWorkflow cancels session and shows message
    When I activate the extension
    And I execute the command "agileagentcanvas.cancelWorkflow"
    Then window showInformationMessage should have been called with "Workflow session cancelled."

  Scenario: agileagentcanvas.newProject prompts for project name
    When I activate the extension
    And the user enters "My New Project" in input box
    And I execute the command "agileagentcanvas.newProject"
    Then window showInputBox should have been called with prompt containing "project name"

  Scenario: agileagentcanvas.newProject does not create project if user cancels
    When I activate the extension
    And the user cancels the input box
    And I execute the command "agileagentcanvas.newProject"
    Then window showInformationMessage should not contain "created"

  Scenario: agileagentcanvas.loadProject shows quick pick to choose load location
    When I activate the extension
    And the user cancels the quick pick
    And I execute the command "agileagentcanvas.loadProject"
    Then window showQuickPick should have been called

  Scenario: agileagentcanvas.loadProject shows folder picker when Browse is selected
    When I activate the extension
    And the user selects "Browse" in quick pick
    And the user cancels the open dialog
    And I execute the command "agileagentcanvas.loadProject"
    Then window showOpenDialog should have been called with folder selection

  Scenario: agileagentcanvas.openCanvas creates webview panel
    When I activate the extension
    And I execute the command "agileagentcanvas.openCanvas"
    Then window createWebviewPanel should have been called with "agileagentcanvasCanvas"

  # File Watcher Tests
  Scenario: Creates file system watcher
    When I activate the extension
    Then workspace createFileSystemWatcher should have been called

  # Output Channel Tests
  Scenario: Exports acOutput
    When I activate the extension
    Then acOutput should be defined

  # Export Artifacts Tests
  Scenario: agileagentcanvas.exportArtifacts shows format quick pick
    When I activate the extension
    And the user cancels the quick pick
    And I execute the command "agileagentcanvas.exportArtifacts"
    Then window showQuickPick should have been called with "Markdown" format options

  Scenario: agileagentcanvas.exportArtifacts exports with selected format
    When I activate the extension
    And the user selects "JSON" in quick pick
    And the user selects a save location
    And I execute the command "agileagentcanvas.exportArtifacts"
    Then window showInformationMessage should contain "Artifacts exported as JSON"

  Scenario: agileagentcanvas.exportArtifacts does nothing if user cancels
    When I activate the extension
    And the user cancels the quick pick
    And I execute the command "agileagentcanvas.exportArtifacts"
    Then window showInformationMessage should not contain "exported"

  Scenario: agileagentcanvas.exportArtifacts does nothing if user cancels save dialog
    When I activate the extension
    And the user selects "JSON" in quick pick
    And the user cancels the save dialog
    And I execute the command "agileagentcanvas.exportArtifacts"
    Then window showInformationMessage should not contain "exported"

  # Sync Tests
  Scenario: agileagentcanvas.syncToFiles syncs and shows confirmation
    When I activate the extension
    And I execute the command "agileagentcanvas.syncToFiles"
    Then window showInformationMessage should have been called with "Artifacts synced to .agileagentcanvas-context"

  # goToStep Tests
  Scenario: agileagentcanvas.goToStep opens chat for vision step
    When I activate the extension
    And I execute the command "agileagentcanvas.goToStep" with arg "vision"
    Then executeCommand should have been called with "workbench.action.chat.open"

  Scenario: agileagentcanvas.goToStep opens chat for requirements step
    When I activate the extension
    And I execute the command "agileagentcanvas.goToStep" with arg "requirements"
    Then executeCommand should have been called with "workbench.action.chat.open"

  # selectArtifact Tests
  Scenario: agileagentcanvas.selectArtifact is callable for epic
    When I activate the extension
    And I execute the command "agileagentcanvas.selectArtifact" with args "epic" and "EPIC-1"
    Then command "agileagentcanvas.selectArtifact" should be registered

  # loadDemoData Tests
  Scenario: agileagentcanvas.loadDemoData shows success message with Open Canvas option
    When I activate the extension
    And I execute the command "agileagentcanvas.loadDemoData"
    Then window showInformationMessage should contain "Demo data loaded"

  # executeWorkflowStep Tests
  Scenario: agileagentcanvas.executeWorkflowStep opens chat with refine command
    When I activate the extension
    And I execute the workflow step command for "epic" "EPIC-1" action "validate"
    Then executeCommand should have been called with "workbench.action.chat.open" and query containing "@agileagentcanvas /refine EPIC-1"

  Scenario: agileagentcanvas.executeWorkflowStep shows warning when dependencies not met
    When I activate the extension
    And I execute the workflow step command with unmet dependencies for "EPIC-1"
    Then window showWarningMessage should have been called with "requires completing"

  Scenario: agileagentcanvas.executeWorkflowStep shows info when user clicks Run First Step
    When I activate the extension
    And the user clicks "Run First Step" on warning
    And I execute the workflow step command with unmet dependencies for "EPIC-1"
    Then window showInformationMessage should contain "Please complete"

  Scenario: agileagentcanvas.executeWorkflowStep continues when user clicks Continue Anyway
    When I activate the extension
    And the user clicks "Continue Anyway" on warning
    And I execute the workflow step command with unmet dependencies for "EPIC-1"
    Then executeCommand should have been called with "workbench.action.chat.open"
