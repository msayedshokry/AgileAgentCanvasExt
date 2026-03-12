Feature: Extension - VS Code Extension Activation
  As an AgentCanvas user
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
    Then chat createChatParticipant should have been called with "agentcanvas.analyst"

  Scenario: Creates tree views for artifacts and wizard steps
    When I activate the extension
    Then window createTreeView should have been called with "agentcanvas.artifactsTree"
    And window createTreeView should have been called with "agentcanvas.wizardSteps"

  Scenario: Adds subscriptions to context
    When I activate the extension
    Then context subscriptions should not be empty

  # Command Registration Tests
  Scenario: Registers agentcanvas.openCanvas command
    When I activate the extension
    Then command "agentcanvas.openCanvas" should be registered

  Scenario: Registers agentcanvas.newProject command
    When I activate the extension
    Then command "agentcanvas.newProject" should be registered

  Scenario: Registers agentcanvas.loadProject command
    When I activate the extension
    Then command "agentcanvas.loadProject" should be registered

  Scenario: Registers agentcanvas.exportArtifacts command
    When I activate the extension
    Then command "agentcanvas.exportArtifacts" should be registered

  Scenario: Registers agentcanvas.syncToFiles command
    When I activate the extension
    Then command "agentcanvas.syncToFiles" should be registered

  Scenario: Registers agentcanvas.goToStep command
    When I activate the extension
    Then command "agentcanvas.goToStep" should be registered

  Scenario: Registers agentcanvas.selectArtifact command
    When I activate the extension
    Then command "agentcanvas.selectArtifact" should be registered

  Scenario: Registers agentcanvas.loadDemoData command
    When I activate the extension
    Then command "agentcanvas.loadDemoData" should be registered

  Scenario: Registers workflow session commands
    When I activate the extension
    Then command "agentcanvas.continueWorkflow" should be registered
    And command "agentcanvas.workflowStatus" should be registered
    And command "agentcanvas.cancelWorkflow" should be registered

  Scenario: Registers agentcanvas.executeWorkflowStep command
    When I activate the extension
    Then command "agentcanvas.executeWorkflowStep" should be registered

  # Command Execution Tests
  Scenario: agentcanvas.continueWorkflow opens chat with continue command
    When I activate the extension
    And I execute the command "agentcanvas.continueWorkflow"
    Then executeCommand should have been called with "workbench.action.chat.open" and query "@agentcanvas /continue"

  Scenario: agentcanvas.workflowStatus opens chat with status command
    When I activate the extension
    And I execute the command "agentcanvas.workflowStatus"
    Then executeCommand should have been called with "workbench.action.chat.open" and query "@agentcanvas /status"

  Scenario: agentcanvas.cancelWorkflow cancels session and shows message
    When I activate the extension
    And I execute the command "agentcanvas.cancelWorkflow"
    Then window showInformationMessage should have been called with "Workflow session cancelled."

  Scenario: agentcanvas.newProject prompts for project name
    When I activate the extension
    And the user enters "My New Project" in input box
    And I execute the command "agentcanvas.newProject"
    Then window showInputBox should have been called with prompt containing "project name"

  Scenario: agentcanvas.newProject does not create project if user cancels
    When I activate the extension
    And the user cancels the input box
    And I execute the command "agentcanvas.newProject"
    Then window showInformationMessage should not contain "created"

  Scenario: agentcanvas.loadProject shows quick pick to choose load location
    When I activate the extension
    And the user cancels the quick pick
    And I execute the command "agentcanvas.loadProject"
    Then window showQuickPick should have been called

  Scenario: agentcanvas.loadProject shows folder picker when Browse is selected
    When I activate the extension
    And the user selects "Browse" in quick pick
    And the user cancels the open dialog
    And I execute the command "agentcanvas.loadProject"
    Then window showOpenDialog should have been called with folder selection

  Scenario: agentcanvas.openCanvas creates webview panel
    When I activate the extension
    And I execute the command "agentcanvas.openCanvas"
    Then window createWebviewPanel should have been called with "agentcanvasCanvas"

  # File Watcher Tests
  Scenario: Creates file system watcher
    When I activate the extension
    Then workspace createFileSystemWatcher should have been called

  # Output Channel Tests
  Scenario: Exports acOutput
    When I activate the extension
    Then acOutput should be defined

  # Export Artifacts Tests
  Scenario: agentcanvas.exportArtifacts shows format quick pick
    When I activate the extension
    And the user cancels the quick pick
    And I execute the command "agentcanvas.exportArtifacts"
    Then window showQuickPick should have been called with "Markdown" format options

  Scenario: agentcanvas.exportArtifacts exports with selected format
    When I activate the extension
    And the user selects "JSON" in quick pick
    And the user selects a save location
    And I execute the command "agentcanvas.exportArtifacts"
    Then window showInformationMessage should contain "Artifacts exported as JSON"

  Scenario: agentcanvas.exportArtifacts does nothing if user cancels
    When I activate the extension
    And the user cancels the quick pick
    And I execute the command "agentcanvas.exportArtifacts"
    Then window showInformationMessage should not contain "exported"

  Scenario: agentcanvas.exportArtifacts does nothing if user cancels save dialog
    When I activate the extension
    And the user selects "JSON" in quick pick
    And the user cancels the save dialog
    And I execute the command "agentcanvas.exportArtifacts"
    Then window showInformationMessage should not contain "exported"

  # Sync Tests
  Scenario: agentcanvas.syncToFiles syncs and shows confirmation
    When I activate the extension
    And I execute the command "agentcanvas.syncToFiles"
    Then window showInformationMessage should have been called with "Artifacts synced to .agentcanvas-context"

  # goToStep Tests
  Scenario: agentcanvas.goToStep opens chat for vision step
    When I activate the extension
    And I execute the command "agentcanvas.goToStep" with arg "vision"
    Then executeCommand should have been called with "workbench.action.chat.open"

  Scenario: agentcanvas.goToStep opens chat for requirements step
    When I activate the extension
    And I execute the command "agentcanvas.goToStep" with arg "requirements"
    Then executeCommand should have been called with "workbench.action.chat.open"

  # selectArtifact Tests
  Scenario: agentcanvas.selectArtifact is callable for epic
    When I activate the extension
    And I execute the command "agentcanvas.selectArtifact" with args "epic" and "EPIC-1"
    Then command "agentcanvas.selectArtifact" should be registered

  # loadDemoData Tests
  Scenario: agentcanvas.loadDemoData shows success message with Open Canvas option
    When I activate the extension
    And I execute the command "agentcanvas.loadDemoData"
    Then window showInformationMessage should contain "Demo data loaded"

  # executeWorkflowStep Tests
  Scenario: agentcanvas.executeWorkflowStep opens chat with refine command
    When I activate the extension
    And I execute the workflow step command for "epic" "EPIC-1" action "validate"
    Then executeCommand should have been called with "workbench.action.chat.open" and query containing "@agentcanvas /refine EPIC-1"

  Scenario: agentcanvas.executeWorkflowStep shows warning when dependencies not met
    When I activate the extension
    And I execute the workflow step command with unmet dependencies for "EPIC-1"
    Then window showWarningMessage should have been called with "requires completing"

  Scenario: agentcanvas.executeWorkflowStep shows info when user clicks Run First Step
    When I activate the extension
    And the user clicks "Run First Step" on warning
    And I execute the workflow step command with unmet dependencies for "EPIC-1"
    Then window showInformationMessage should contain "Please complete"

  Scenario: agentcanvas.executeWorkflowStep continues when user clicks Continue Anyway
    When I activate the extension
    And the user clicks "Continue Anyway" on warning
    And I execute the workflow step command with unmet dependencies for "EPIC-1"
    Then executeCommand should have been called with "workbench.action.chat.open"
