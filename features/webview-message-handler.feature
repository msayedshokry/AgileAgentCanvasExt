Feature: Webview Message Handler
  The handleCommonWebviewMessage function centralises message handling
  for all webview hosts.  It processes messages from the webview UI and
  dispatches them to the appropriate store or command methods.

  Background:
    Given a fresh message handler context

  # ── updateArtifact ────────────────────────────────────────────────

  Scenario: updateArtifact updates the store
    When I send an "updateArtifact" message with id "ep-1" and artifactType "epic" and updates
    Then the handler should return true
    And the store updateArtifact should have been called with "epic" and "ep-1"

  Scenario: updateArtifact defaults to epic when artifactType missing
    When I send an "updateArtifact" message with id "ep-2" and no artifactType
    Then the handler should return true
    And the store updateArtifact should have been called with "epic" and "ep-2"

  Scenario: updateArtifact initialises schema validator lazily
    When I send an "updateArtifact" message with id "ep-3" and artifactType "story" and updates
    Then the schema validator should have been initialised

  Scenario: updateArtifact sends validation errors back to webview
    Given the schema validator will report errors
    When I send an "updateArtifact" message with id "ep-4" and artifactType "story" and updates providing a webview
    Then the webview should have received a "validationError" message
    And the validation error should reference artifactType "story" and id "ep-4"

  Scenario: updateArtifact still saves when validation fails
    Given the schema validator will report errors
    When I send an "updateArtifact" message with id "ep-5" and artifactType "story" and updates providing a webview
    Then the store updateArtifact should have been called with "story" and "ep-5"

  Scenario: updateArtifact handles schema init failure gracefully
    Given the schema validator init will throw
    When I send an "updateArtifact" message with id "ep-6" and artifactType "epic" and updates
    Then the handler should return true

  # ── deleteArtifact ────────────────────────────────────────────────

  Scenario: deleteArtifact deletes from the store
    When I send a "deleteArtifact" message with id "ep-10" and artifactType "epic"
    Then the handler should return true
    And the store deleteArtifact should have been called with "epic" and "ep-10"

  Scenario: deleteArtifact defaults to epic
    When I send a "deleteArtifact" message with id "ep-11" and no artifactType
    Then the store deleteArtifact should have been called with "epic" and "ep-11"

  # ── AI command delegations ────────────────────────────────────────

  Scenario: refineWithAI delegates to refineArtifactWithAI
    When I send a "refineWithAI" message with an artifact
    Then the handler should return true
    And the "refineArtifactWithAI" command should have been called

  Scenario: breakDown delegates to breakDownArtifact
    When I send a "breakDown" message with an artifact
    Then the handler should return true
    And the "breakDownArtifact" command should have been called

  Scenario: enhanceWithAI delegates to enhanceArtifactWithAI
    When I send a "enhanceWithAI" message with an artifact
    Then the handler should return true
    And the "enhanceWithAI" command should have been called

  Scenario: elicitWithMethod delegates to elicitArtifactWithMethod
    When I send an "elicitWithMethod" message with an artifact and method "brainwriting"
    Then the handler should return true
    And the "elicitArtifactWithMethod" command should have been called

  # ── startDevelopment / startDocumentation ─────────────────────────

  Scenario: startDevelopment delegates and returns true
    When I send a "startDevelopment" message with an artifact
    Then the handler should return true
    And the "startDevelopment" command should have been called

  Scenario: startDevelopment catches errors and shows error message
    Given the startDevelopment command will throw
    When I send a "startDevelopment" message with an artifact
    Then the handler should return true
    And an error message should have been shown

  Scenario: startDocumentation delegates and returns true
    When I send a "startDocumentation" message with an artifact
    Then the handler should return true
    And the "startDocumentation" command should have been called

  Scenario: startDocumentation catches errors and shows error message
    Given the startDocumentation command will throw
    When I send a "startDocumentation" message with an artifact
    Then the handler should return true
    And an error message should have been shown

  # ── launchWorkflow ────────────────────────────────────────────────

  Scenario: launchWorkflow calls launchBmmWorkflow when trigger phrase present
    When I send a "launchWorkflow" message with triggerPhrase "generate-prd"
    Then the handler should return true
    And the "launchBmmWorkflow" command should have been called

  Scenario: launchWorkflow does nothing when no trigger phrase
    When I send a "launchWorkflow" message without a trigger phrase
    Then the handler should return true
    And the "launchBmmWorkflow" command should not have been called

  # ── exportArtifacts / importArtifacts ─────────────────────────────

  Scenario: exportArtifacts delegates to command
    When I send an "exportArtifacts" message
    Then the handler should return true
    And the "exportArtifacts" command should have been called

  Scenario: importArtifacts delegates to command
    When I send an "importArtifacts" message
    Then the handler should return true
    And the "importArtifacts" command should have been called

  # ── setOutputFormat ───────────────────────────────────────────────

  Scenario: setOutputFormat updates workspace config for json
    When I send a "setOutputFormat" message with format "json"
    Then the handler should return true
    And the workspace config should have been updated with "outputFormat" set to "json"

  Scenario: setOutputFormat updates workspace config for markdown
    When I send a "setOutputFormat" message with format "markdown"
    Then the handler should return true
    And the workspace config should have been updated with "outputFormat" set to "markdown"

  Scenario: setOutputFormat updates workspace config for dual
    When I send a "setOutputFormat" message with format "dual"
    Then the handler should return true
    And the workspace config should have been updated with "outputFormat" set to "dual"

  Scenario: setOutputFormat ignores invalid format values
    When I send a "setOutputFormat" message with format "xml"
    Then the handler should return true
    And the workspace config should not have been updated

  # ── closeDetailTab ────────────────────────────────────────────────

  Scenario: closeDetailTab returns false for caller to handle
    When I send a "closeDetailTab" message
    Then the handler should return false

  # ── fixSchemas ────────────────────────────────────────────────────

  Scenario: fixSchemas rejects when already in progress
    Given a fix is already in progress
    When I send a "fixSchemas" message providing a webview
    Then the handler should return true
    And the webview should have received a "schemaFixResult" message
    And the fix result should indicate failure with error about already in progress

  Scenario: fixSchemas sends cancelled result when user declines
    Given the user will decline the confirmation dialog
    When I send a "fixSchemas" message providing a webview
    Then the handler should return true
    And the webview should have received a "schemaFixResult" message with cancelled true

  Scenario: fixSchemas performs backup and fix when confirmed
    Given the user will confirm the fix schemas dialog
    And the store fix will succeed with 2 issues fixed
    When I send a "fixSchemas" message providing a webview
    Then the handler should return true
    And the webview should have received a "schemaFixResult" message
    And the store backup should have been called
    And the store fixAndSyncToFiles should have been called

  Scenario: fixSchemas handles top-level error
    Given the user will confirm the fix schemas dialog
    And the store runExclusiveFix will throw
    When I send a "fixSchemas" message providing a webview
    Then the handler should return true
    And an error message should have been shown
    And the webview should have received a "schemaFixResult" message with an error

  # ── validateSchemas ───────────────────────────────────────────────

  Scenario: validateSchemas reloads and sends issues to webview
    Given the store has a source folder
    When I send a "validateSchemas" message providing a webview
    Then the handler should return true
    And the store loadFromFolder should have been called
    And the webview should have received a "schemaValidateResult" message

  Scenario: validateSchemas handles reload error
    Given the store has a source folder
    And the store loadFromFolder will throw
    When I send a "validateSchemas" message providing a webview
    Then the handler should return true
    And the webview should have received a "schemaValidateResult" message with an error

  Scenario: validateSchemas skips reload when no source folder
    Given the store has no source folder
    When I send a "validateSchemas" message providing a webview
    Then the handler should return true
    And the webview should have received a "schemaValidateResult" message

  # ── canvasScreenshot ──────────────────────────────────────────────

  Scenario: canvasScreenshot warns when no data URL
    When I send a "canvasScreenshot" message with no dataUrl
    Then the handler should return true
    And a warning message should have been shown

  Scenario: canvasScreenshot saves PNG when user picks a file
    Given the user will choose a save location
    When I send a "canvasScreenshot" message with a valid dataUrl and format "png"
    Then the handler should return true
    And the file should have been written

  Scenario: canvasScreenshot does nothing when user cancels save dialog
    Given the user will cancel the save dialog
    When I send a "canvasScreenshot" message with a valid dataUrl and format "png"
    Then the handler should return true
    And the file should not have been written

  Scenario: canvasScreenshot saves PDF when format is pdf
    Given the user will choose a save location
    When I send a "canvasScreenshot" message with a valid dataUrl and format "pdf"
    Then the handler should return true
    And the file should have been written

  Scenario: canvasScreenshot shows error when write fails
    Given the user will choose a save location
    And the file write will fail
    When I send a "canvasScreenshot" message with a valid dataUrl and format "png"
    Then the handler should return true
    And an error message should have been shown

  Scenario: canvasScreenshot offers to open file after save
    Given the user will choose a save location
    And the user will click "Open File" after save
    When I send a "canvasScreenshot" message with a valid dataUrl and format "png"
    Then the handler should return true
    And the "vscode.open" command should have been executed

  # ── Unknown message ───────────────────────────────────────────────

  Scenario: Unknown message type returns false
    When I send an "unknownMessageType" message
    Then the handler should return false
