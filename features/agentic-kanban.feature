Feature: Agentic Kanban View — Execution Orchestration Surface
  As a BMAD Studio user
  I want to drag cards between Kanban columns to trigger workflows
  So that agentic execution is orchestrated through the Kanban board

  Background:
    Given a fresh agentic kanban message handler context

  # ═══════════════════════════════════════════════════════════════════════
  # SECTION 1: Message Handler Tests (Extension-Side)
  # These test handleAgenticKanbanMessage() in src/views/agentic-kanban-message-handler.ts
  # Uses the same Cucumber + ts-node pattern as webview-message-handler.feature
  # ═══════════════════════════════════════════════════════════════════════

  # ── DnD: Status Change (kanban:statusChanged) ────────────────────────────

  Scenario: Drag card to a new column updates artifact status
    Given the artifact store has artifact "story-1" with type "story" and status "backlog"
    When I send a "kanban:statusChanged" message providing a webview with:
      | artifactId   | story-1      |
      | fromStatus   | backlog      |
      | toStatus     | in-progress  |
      | artifactType | story        |
    Then the handler should return true
    And the store should have updated "story" "story-1" with status "in-progress"
    And the webview should have received a "transitionResult" message
    And the transition result should have ok true
    And the transition result should have status "complete"

  Scenario: Drag card to Done column succeeds
    Given the artifact store has artifact "story-3" with type "story" and status "review"
    When I send a "kanban:statusChanged" message with:
      | artifactId   | story-3 |
      | fromStatus   | review  |
      | toStatus     | done    |
      | artifactType | story   |
    Then the handler should return true
    And the store should have updated "story" "story-3" with status "done"

  Scenario: Artifact not found returns error to webview
    Given the artifact store does not have "missing-artifact"
    When I send a "kanban:statusChanged" message providing a webview with:
      | artifactId   | missing-artifact |
      | fromStatus   | backlog          |
      | toStatus     | ready-for-dev    |
      | artifactType | story            |
    Then the handler should return true
    And the webview should have received a "transitionResult" message
    And the transition result should have ok false
    And the transition result blockedBy should contain "Artifact not found"

  Scenario: Transition error sends error back to webview
    Given the artifact store has artifact "story-4" with type "story" and status "backlog"
    And the store updateArtifact will throw
    When I send a "kanban:statusChanged" message providing a webview with:
      | artifactId   | story-4        |
      | fromStatus   | backlog        |
      | toStatus     | ready-for-dev  |
      | artifactType | story          |
    Then the handler should return true
    And the webview should have received a "transitionResult" message
    And the transition result should have ok false
    And the transition result blockedBy should have at least 1 item

  Scenario: Status change defaults artifactType from store when not provided
    Given the artifact store has artifact "story-5" with type "story" and status "ready-for-dev"
    When I send a "kanban:statusChanged" message with:
      | artifactId   | story-5       |
      | fromStatus   | ready-for-dev |
      | toStatus     | in-progress   |
      | artifactType |               |
    Then the handler should return true
    And the store should have updated "story" "story-5" with status "in-progress"

  Scenario: Drag epic card changes epic status
    Given the artifact store has artifact "epic-1" with type "epic" and status "backlog"
    When I send a "kanban:statusChanged" message with:
      | artifactId   | epic-1        |
      | fromStatus   | backlog       |
      | toStatus     | ready-for-dev |
      | artifactType | epic          |
    Then the handler should return true
    And the store should have updated "epic" "epic-1" with status "ready-for-dev"

  Scenario: Drag from backlog to ready-for-dev succeeds
    Given the artifact store has artifact "story-backlog" with type "story" and status "backlog"
    When I send a "kanban:statusChanged" message with:
      | artifactId   | story-backlog |
      | fromStatus   | backlog       |
      | toStatus     | ready-for-dev |
      | artifactType | story         |
    Then the handler should return true
    And the store should have updated "story" "story-backlog" with status "ready-for-dev"

  Scenario: Drag from in-progress to review succeeds
    Given the artifact store has artifact "story-wip" with type "story" and status "in-progress"
    When I send a "kanban:statusChanged" message with:
      | artifactId   | story-wip    |
      | fromStatus   | in-progress  |
      | toStatus     | review       |
      | artifactType | story        |
    Then the handler should return true
    And the store should have updated "story" "story-wip" with status "review"

  # ── Refresh (agenticKanban:refresh) ──────────────────────────────────────

  Scenario: Refresh sends updated artifacts to webview
    Given the artifact store has 3 artifacts
    When I send an "agenticKanban:refresh" message providing a webview
    Then the handler should return true
    And the webview should have received an "updateArtifacts" message
    And the updateArtifacts message should contain 3 artifacts

  Scenario: Refresh handles empty artifact store
    Given the artifact store has 0 artifacts
    When I send an "agenticKanban:refresh" message providing a webview
    Then the handler should return true
    And the webview should have received an "updateArtifacts" message
    And the updateArtifacts message should contain 0 artifacts

  # ── kanban:viewTrace (E3 Stub) ──────────────────────────────────────────

  @wip
  Scenario: viewTrace shows info message indicating E3 deferred feature
    When I send a "kanban:viewTrace" message with sessionId "acp-session-1"
    Then the handler should return true
    And an information message should have been shown
    And the information message should contain "Epic 3"

  @wip
  Scenario: viewTrace includes the session ID in the info message
    When I send a "kanban:viewTrace" message with sessionId "acp-session-2"
    Then the handler should return true
    And the information message should contain "acp-session-2"

  # ── openTraceViewer (E3 Stub) ───────────────────────────────────────────

  @wip
  Scenario: openTraceViewer shows info message about E3 deferral
    When I send a kanban "openTraceViewer" message
    Then the handler should return true
    And an information message should have been shown
    And the information message should contain "Epic 3"

  # ── Unknown Message ─────────────────────────────────────────────────────

  Scenario: Unknown message type returns false for caller to handle
    When I send a kanban "unknownKanbanMessage" message
    Then the handler should return false
