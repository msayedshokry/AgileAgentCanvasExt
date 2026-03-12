Feature: AgentCanvasViewProvider
  Tests for the AgentCanvas webview view provider

  Background:
    Given a fresh canvas view provider

  # Constructor tests
  Scenario: Creates provider with store reference
    Then the canvas view provider should be defined

  Scenario: Has correct view type
    Then the viewType should be "agentcanvas.canvasView"

  Scenario: Listens for artifact changes on construction
    Then the provider should have registered an artifact change listener

  # resolveWebviewView tests
  Scenario: Sets webview options on resolve
    When I resolve the webview view
    Then the webview options should have enableScripts true
    And the webview options should have localResourceRoots defined

  Scenario: Sets webview html content on resolve
    Given the build does not exist
    When I resolve the webview view
    Then the webview html should contain "<!DOCTYPE html>"

  Scenario: Registers message handler on resolve
    When I resolve the webview view
    Then the webview onDidReceiveMessage should have been called

  Scenario: Registers visibility change handler on resolve
    When I resolve the webview view
    Then the webview onDidChangeVisibility should have been called

  # Message handling tests
  Scenario: Sends artifacts on ready message
    Given the build does not exist
    When I resolve the webview view
    And I send message type "ready"
    Then postMessage should have been called with type "updateArtifacts"

  Scenario: Calls store updateArtifact on updateArtifact message
    Given the build does not exist
    When I resolve the webview view
    And I send updateArtifact message for "epic" id "EPIC-1" with title "Updated"
    Then the canvas store updateArtifact should have been called

  Scenario: Handles addArtifact message for epic
    Given the build does not exist
    When I resolve the webview view
    And I send addArtifact message for type "epic"
    Then the canvas store updateArtifact should have been called

  Scenario: Handles selectArtifact message without error
    Given the build does not exist
    When I resolve the webview view
    And I send selectArtifact message for id "EPIC-1"
    Then no error should be thrown

  Scenario: Handles refineWithAI message
    Given the build does not exist
    When I resolve the webview view
    And I send refineWithAI message for artifact id "EPIC-1"
    Then canvas executeCommand should have been called with "workbench.action.chat.open"

  # showAICursor tests
  Scenario: Posts aiCursorMove message from showAICursor
    Given the build does not exist
    When I resolve the webview view
    And I call showAICursor with id "EPIC-1" action "refining" label "Enhancing epic"
    Then postMessage should have been called with type "aiCursorMove"
    And the aiCursorMove message should contain targetId "EPIC-1"

  Scenario: showAICursor does not throw if view not initialized
    When I call showAICursor without resolving view first
    Then no error should be thrown

  # hideAICursor tests
  Scenario: Posts aiCursorHide message from hideAICursor
    Given the build does not exist
    When I resolve the webview view
    And I call hideAICursor
    Then postMessage should have been called with type "aiCursorHide"

  Scenario: hideAICursor does not throw if view not initialized
    When I call hideAICursor without resolving view first
    Then no error should be thrown

  # stateToArtifacts transformation tests
  Scenario: Transforms vision to artifact
    Given the build does not exist
    And the vision "Test Product" exists in canvas store
    When I resolve the webview view
    And I send message type "ready"
    Then the updateArtifacts message should include a "vision" artifact with id "vision-1" and title "Test Product"

  Scenario: Transforms requirements to artifacts
    Given the build does not exist
    And a requirement exists in canvas store
    When I resolve the webview view
    And I send message type "ready"
    Then the updateArtifacts message should include a "requirement" artifact with dependency "vision-1"

  Scenario: Transforms epics to artifacts
    Given the build does not exist
    And an epic exists in canvas store
    When I resolve the webview view
    And I send message type "ready"
    Then the updateArtifacts message should include a "epic" artifact

  Scenario: Transforms stories to artifacts with parentId
    Given the build does not exist
    And an epic with a story exists in canvas store
    When I resolve the webview view
    And I send message type "ready"
    Then the updateArtifacts message should include a "story" artifact

  Scenario: Calculates different Y positions for multiple epics
    Given the build does not exist
    And two epics exist in canvas store
    When I resolve the webview view
    And I send message type "ready"
    Then the two epic artifacts should have different Y positions

  Scenario: Includes metadata in transformed epic artifact
    Given the build does not exist
    And an epic with metadata exists in canvas store
    When I resolve the webview view
    And I send message type "ready"
    Then the epic artifact should have metadata defined

  # getHtmlContent tests
  Scenario: Returns fallback HTML when build does not exist
    Given the build does not exist
    When I resolve the webview view
    Then the webview html should contain "Canvas not built"
    And the webview html should contain "npm run build"

  Scenario: Returns React app HTML when build exists
    Given the build exists
    When I resolve the webview view
    Then the webview html should contain "<div id=\"root\">"
    And the webview html should contain "index.js"
    And the webview html should contain "index.css"

  Scenario: Includes Content-Security-Policy when build exists
    Given the build exists
    When I resolve the webview view
    Then the webview html should contain "Content-Security-Policy"

  # Artifact change listener tests
  Scenario: Sends artifacts when store changes after resolve
    Given the build does not exist
    When I resolve the webview view
    And I clear postMessage calls
    And I create an epic in canvas store
    Then postMessage should have been called with type "updateArtifacts"

  Scenario: Does not throw when store changes before view resolved
    When I create an epic in canvas store before resolving view
    Then no error should be thrown

  # Pending artifacts tests
  Scenario: Sends pending artifacts when view becomes ready
    Given the build does not exist
    And an epic exists in canvas store before resolving
    When I resolve the webview view
    And I send message type "ready"
    Then postMessage should have been called with type "updateArtifacts"

  # calculateNewPosition tests
  Scenario: Epic and story artifacts have different X positions
    Given the build does not exist
    When I resolve the webview view
    And I send addArtifact message for type "epic"
    And I send addArtifact message for type "story"
    And I clear postMessage calls
    And I send message type "ready"
    Then the epic and story artifacts should have different X positions

  # Test artifact canvas rendering tests
  Scenario: Transforms test strategy to artifact
    Given the build does not exist
    And a test strategy exists in canvas store
    When I resolve the webview view
    And I send message type "ready"
    Then the updateArtifacts message should include a "test-strategy" artifact

  Scenario: Transforms test case to artifact
    Given the build does not exist
    And a test case exists in canvas store
    When I resolve the webview view
    And I send message type "ready"
    Then the updateArtifacts message should include a "test-case" artifact

  Scenario: Test strategy and test case artifacts have testing column X position
    Given the build does not exist
    And a test strategy exists in canvas store
    And a test case exists in canvas store
    When I resolve the webview view
    And I send message type "ready"
    Then the test strategy artifact should be in the testing column

  Scenario: Handles addArtifact message for test-strategy
    Given the build does not exist
    When I resolve the webview view
    And I send addArtifact message for type "test-strategy"
    Then the canvas store updateArtifact should have been called

  Scenario: Handles addArtifact message for test-case
    Given the build does not exist
    When I resolve the webview view
    And I send addArtifact message for type "test-case"
    Then the canvas store updateArtifact should have been called

  # Elicitation feature tests
  Scenario: Handles elicitWithMethod message without error
    Given the build does not exist
    When I resolve the webview view
    And I send elicitWithMethod message for artifact id "EPIC-1"
    Then no error should be thrown

  Scenario: Calls elicitArtifactWithMethod when elicitWithMethod message received
    Given the build does not exist
    When I resolve the webview view
    And I send elicitWithMethod message for artifact id "EPIC-1"
    Then canvas elicitArtifactWithMethod should have been called

  # Workflow launcher tests
  Scenario: Sends bmmWorkflows to webview on ready message
    Given the build does not exist
    When I resolve the webview view
    And I send message type "ready"
    Then postMessage should have been called with type "bmmWorkflows"

  Scenario: Handles launchWorkflow message without error
    Given the build does not exist
    When I resolve the webview view
    And I send launchWorkflow message with trigger "lets create a product brief"
    Then no error should be thrown

  Scenario: Calls launchBmmWorkflow when launchWorkflow message received
    Given the build does not exist
    When I resolve the webview view
    And I send launchWorkflow message with trigger "lets create a product brief"
    Then canvas launchBmmWorkflow should have been called

  Scenario: Handles launchWorkflow message with missing triggerPhrase without error
    Given the build does not exist
    When I resolve the webview view
    And I send launchWorkflow message without trigger phrase
    Then no error should be thrown
