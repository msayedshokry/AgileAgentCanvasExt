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

  # ═══════════════════════════════════════════════════════════════════════
  # SECTION 2: Webview Behavior Tests (Browser/React)
  # These test AgenticKanbanApp.tsx rendering and interaction behavior.
  # They require jsdom, Playwright, or Vitest browser mode — NOT supported
  # by the Cucumber + ts-node test harness. Marked @webview for future
  # integration with a browser-based test runner.
  # ═══════════════════════════════════════════════════════════════════════

  @webview
  Scenario: Kanban board shows loading state on initial render
    Given a freshly mounted AgenticKanbanApp
    Then the board should display a loading indicator

  @webview
  Scenario: Kanban board clears loading state after artifacts arrive
    Given a freshly mounted AgenticKanbanApp
    When the webview receives an "updateArtifacts" message with 5 artifacts
    Then the loading indicator should be hidden
    And 5 cards should be rendered on the board

  @webview
  Scenario: Artifacts are grouped into correct Kanban columns
    Given the AgenticKanbanApp receives artifacts:
      | id       | status        | title              |
      | story-a  | backlog       | Backlog Story      |
      | story-b  | ready-for-dev | Ready Story        |
      | story-c  | in-progress   | Active Story       |
      | story-d  | review        | Under Review Story |
      | story-e  | done          | Completed Story    |
    Then the "Backlog" column should contain "story-a"
    And the "Ready for Dev" column should contain "story-b"
    And the "In Progress" column should contain "story-c"
    And the "Review" column should contain "story-d"
    And the "Done" column should contain "story-e"

  @webview
  Scenario: Unknown status defaults to Backlog column
    Given the AgenticKanbanApp receives an artifact "unknown-story" with status "unknown-status"
    Then the "Backlog" column should contain "unknown-story"

  @webview
  Scenario: Board shows all 5 columns with empty state when no artifacts
    Given the AgenticKanbanApp has 0 artifacts
    Then all 5 Kanban columns should be visible
    And each column should show its empty state placeholder

  @webview
  Scenario: Dragging a card between columns sends kanban:statusChanged postMessage
    Given the AgenticKanbanApp has item "story-drag" in "Backlog" column
    When the user drags "story-drag" to the "Ready for Dev" column
    Then vscode.postMessage should have been called with:
      | type         | kanban:statusChanged |
      | artifactId   | story-drag            |
      | fromStatus   | backlog               |
      | toStatus     | ready-for-dev         |
      | artifactType | story                 |

  @webview
  Scenario: Dropping a card in the same column does not send a postMessage
    Given the AgenticKanbanApp has item "story-same" in "Backlog" column
    When the user drags "story-same" and drops it in the "Backlog" column
    Then vscode.postMessage should not have been called with type "kanban:statusChanged"

  @webview
  Scenario: Optimistic UI updates card position immediately on drop
    Given the AgenticKanbanApp has item "story-optimistic" in "Backlog" column
    When the user drops "story-optimistic" in the "Ready for Dev" column
    Then "story-optimistic" should appear in the "Ready for Dev" column immediately
    And "story-optimistic" should show a queued indicator

  @webview
  Scenario: Successful transitionResult clears queued indicator
    Given the AgenticKanbanApp has a pending transition for "story-queued"
    When the webview receives a "transitionResult" for "story-queued" with ok true
    Then the queued indicator for "story-queued" should be removed
    And no toast error should be shown

  @webview
  Scenario: Failed transitionResult shows error toast
    Given the AgenticKanbanApp has a pending transition for "story-failed"
    When the webview receives a "transitionResult" for "story-failed" with:
      | ok        | false                             |
      | blockedBy | Concurrency lock held by Crafter  |
    Then an error toast should be displayed
    And the toast should contain "Concurrency lock held by Crafter"

  @webview
  Scenario: Locked card is not draggable
    Given the AgenticKanbanApp has item "story-locked" with lockInfo locked true and agentName "Crafter"
    Then the card for "story-locked" should have draggable false

  @webview
  Scenario: Lock badge displays locking agent name on card
    Given the AgenticKanbanApp has item "story-locked-2" with lockInfo locked true and agentName "Coordinator"
    Then the card for "story-locked-2" should show a lock badge
    And the lock badge should contain "Coordinator"

  @webview
  Scenario: Unlocked card is draggable
    Given the AgenticKanbanApp has item "story-free" with no lockInfo
    Then the card for "story-free" should have draggable true

  @webview
  Scenario: Agent running badge is visible on card
    Given the AgenticKanbanApp has item "story-running" with agentState status "running" and agentRole "Crafter"
    Then the card for "story-running" should show a running agent badge
    And the badge should contain "Crafter is working"

  @webview
  Scenario: Agent queued badge shows on card during pending execution
    Given the AgenticKanbanApp has item "story-pending" with agentState status "queued"
    Then the card for "story-pending" should show a queued badge
    And the badge should contain "Queued"

  @webview
  Scenario: Harness policy failure badge appears on card with blocking errors
    Given the AgenticKanbanApp has item "story-harness" with harnessResults containing a blocking failure
    Then the card for "story-harness" should show a harness failure badge
    And the badge should contain "Policy failed"

  @webview
  Scenario: Clicking a card opens the detail panel
    Given the AgenticKanbanApp has item "story-detail" with title "Add Dark Mode"
    When the user clicks the card for "story-detail"
    Then a detail panel should be visible
    And the detail panel should display "Add Dark Mode"

  @webview
  Scenario: Clicking a selected card again closes the detail panel
    Given the AgenticKanbanApp has item "story-detail" selected and detail panel open
    When the user clicks the card for "story-detail" again
    Then the detail panel should be closed

  @webview
  Scenario: Detail panel shows View Trace link when session exists
    Given the AgenticKanbanApp has item "story-trace" with agentState sessionId "acp-session-3"
    When the user clicks the card for "story-trace"
    Then the detail panel should display a "View trace" link

  @webview
  Scenario: Detail panel does not show View Trace link without session
    Given the AgenticKanbanApp has item "story-no-trace" with no agentState sessionId
    When the user clicks the card for "story-no-trace"
    Then the detail panel should not display a "View trace" link

  @webview
  Scenario: View Trace link click sends kanban:viewTrace postMessage
    Given the AgenticKanbanApp has item "story-click-trace" with agentState sessionId "acp-session-4"
    And the detail panel is open for "story-click-trace"
    When the user clicks the "View trace" link
    Then vscode.postMessage should have been called with type "kanban:viewTrace" and sessionId "acp-session-4"

  @webview
  Scenario: Refresh button sends agenticKanban:refresh postMessage
    Given the AgenticKanbanApp is fully loaded
    When the user clicks the "Refresh" button in the toolbar
    Then vscode.postMessage should have been called with type "agenticKanban:refresh"

  @webview
  Scenario: View Traces button sends openTraceViewer postMessage
    Given the AgenticKanbanApp is fully loaded
    When the user clicks the "View Traces" button in the toolbar
    Then vscode.postMessage should have been called with type "openTraceViewer"
