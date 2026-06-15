Feature: Autonomy Webview UI — Scheduler, Budget, Goal Decomposer, and Dependency Badges
  As an Agentic Kanban user
  I want the AutonomyBar and GoalDecomposerModal to round-trip IPC messages correctly
  So that I can pause/resume the scheduler, monitor budget, decompose goals, and see blocked-by counts

  Background:
    Given a freshly mounted autonomy webview context
    And the webview posts the autonomy pull-on-mount messages

  # ═══════════════════════════════════════════════════════════════════════
  # SECTION 1: Scheduler pause / resume round-trip
  # Verifies the bar posts { type: 'setSchedulerState', state: { action } }
  # and that the echoed schedulerState message updates the bar's display.
  # ═══════════════════════════════════════════════════════════════════════

  @autonomy
  Scenario: Clicking Pause posts a setSchedulerState pause action
    Given the scheduler is in state "running" with 0 in progress
    When the user clicks the "Pause" button in the AutonomyBar
    Then autonomy vscode.postMessage should have been called with:
      | type              | setSchedulerState |
      | state.action      | pause             |

  @autonomy
  Scenario: Echoed schedulerState update switches the bar to paused
    Given the scheduler is in state "running" with 0 in progress
    When the extension broadcasts a schedulerState with:
      | state      | paused  |
      | nextUp     |         |
      | inProgress |         |
      | enabled    | true    |
    Then the AutonomyBar should show state "⏸ paused"
    And the AutonomyBar should show a "Resume" button
    And the AutonomyBar should not show a "Pause" button

  @autonomy
  Scenario: Resume action posts a setSchedulerState resume and echo returns to running
    Given the scheduler is in state "paused"
    When the user clicks the "Resume" button in the AutonomyBar
    Then autonomy vscode.postMessage should have been called with:
      | type              | setSchedulerState |
      | state.action      | resume            |
    When the extension broadcasts a schedulerState with:
      | state   | running |
      | enabled | true    |
    Then the AutonomyBar should show state "▶ running"
    And the AutonomyBar should show a "Pause" button

  @autonomy
  Scenario: Clicking Stop posts a setSchedulerState stop action
    Given the scheduler is in state "running" with 2 in progress
    When the user clicks the "Stop" button in the AutonomyBar
    Then autonomy vscode.postMessage should have been called with:
      | type              | setSchedulerState |
      | state.action      | stop              |

  @autonomy
  Scenario: Scheduler in-progress count is rendered as a "N running" meta badge
    Given the scheduler is in state "running" with 3 in progress
    Then the AutonomyBar should show a "3 running" meta badge

  @autonomy
  Scenario: Scheduler in idle state shows Start button instead of Pause
    Given the scheduler is in state "idle"
    Then the AutonomyBar should show a "Start" button
    And the AutonomyBar should not show a "Pause" button

  # ═══════════════════════════════════════════════════════════════════════
  # SECTION 2: Budget gauge render
  # Verifies that an incoming budgetStatus message populates the gauge
  # with used / cap / percent, and that anyExceeded flips the warning.
  # ═══════════════════════════════════════════════════════════════════════

  @autonomy
  Scenario: budgetStatus broadcast renders the daily gauge with used/cap/percent
    When the extension broadcasts a budgetStatus with:
      | perStory.used     | 0.5                |
      | perStory.cap      | 2                  |
      | perStory.exceeded | false              |
      | daily.used        | 1.2                |
      | daily.cap         | 10                 |
      | daily.exceeded    | false              |
      | anyExceeded       | false              |
      | remaining         | 8.8                |
    Then the budget gauge should show "$1.2000 / $10.00 (12%)"
    And the AutonomyBar should not show a "Cap hit" warning

  @autonomy
  Scenario: budgetStatus with anyExceeded=true flips the gauge to error state
    Given the budget gauge is rendered with:
      | daily.used     | 10.5 |
      | daily.cap      | 10   |
      | daily.exceeded | true |
      | anyExceeded    | true |
      | remaining      | 0    |
    Then the AutonomyBar should show a "Cap hit" warning
    And the budget gauge should show "$10.5000 / $10.00 (100%)"

  @autonomy
  Scenario: budgetStatus with daily.cap=0 shows the "No daily cap set" placeholder
    When the extension broadcasts a budgetStatus with:
      | perStory.used     | 0 |
      | perStory.cap      | 0 |
      | perStory.exceeded | false |
      | daily.used        | 0 |
      | daily.cap         | 0 |
      | daily.exceeded    | false |
      | anyExceeded       | false |
      | remaining         | 0 |
    Then the AutonomyBar should show "No daily cap set"
    And the AutonomyBar should not render a budget gauge

  @autonomy
  Scenario: Clicking the budget refresh button posts a getBudgetStatus message
    Given the budget gauge is rendered with daily.used 0.5 and daily.cap 10
    When the user clicks the "↻" button in the AutonomyBar
    Then autonomy vscode.postMessage should have been called with type "getBudgetStatus"

  # ═══════════════════════════════════════════════════════════════════════
  # SECTION 3: Goal submit → decompose → review → dispatch
  # Verifies the full lifecycle: submit posts a submitGoal, the extension's
  # goalReadyForReview opens the modal, approve posts approveGoalStories,
  # and the extension's goalReviewed + goalDispatched close the modal and
  # request a board refresh.
  # ═══════════════════════════════════════════════════════════════════════

  @autonomy
  Scenario: Submitting a goal posts a submitGoal message and clears the input
    Given no goal is pending review
    When the user types "Add dark mode" into the goal input
    And the user clicks the "Submit Goal" button
    Then autonomy vscode.postMessage should have been called with:
      | type | submitGoal |
      | text | Add dark mode |

  @autonomy
  Scenario: Submitting an empty goal does not post a submitGoal message
    Given no goal is pending review
    When the user clicks the "Submit Goal" button in the AutonomyBar
    Then autonomy vscode.postMessage should not have been called with type "submitGoal"

  @autonomy
  Scenario: goalSubmitted broadcast shows a "decomposing" toast
    When the extension broadcasts a goalSubmitted with:
      | goalId | goal-1    |
      | text   | Test goal |
    Then the webview should show a toast with text containing "decomposing"

  @autonomy
  Scenario: goalReadyForReview opens the modal and stores the proposed goal
    When the extension broadcasts a goalReadyForReview with goal:
      | id              | goal-1               |
      | goal            | Add dark mode        |
      | status          | review               |
      | proposedStories | story-1,story-2,story-3 |
    Then the GoalDecomposerModal should be open
    And the pending goal should have 3 proposed stories
    And the AutonomyBar should show a "Review" button with proposed count 3

  @autonomy
  Scenario: User approves all proposed stories in the modal and posts approveGoalStories
    Given the GoalDecomposerModal is open for goal "goal-1" with proposed stories:
      | id      | title                | priority |
      | story-1 | Implement toggle     | P1       |
      | story-2 | Persist preference   | P2       |
    When the user clicks the "Approve 2 & Dispatch" button
    Then autonomy vscode.postMessage should have been called with:
      | type       | approveGoalStories |
      | goalId     | goal-1             |
      | storyIds   | story-1,story-2    |

  @autonomy
  Scenario: User deselects a story and the approve payload omits it
    Given the GoalDecomposerModal is open for goal "goal-2" with proposed stories:
      | id      | title                | priority |
      | story-1 | Implement toggle     | P1       |
      | story-2 | Persist preference   | P2       |
    When the user deselects the story "story-2" in the modal
    And the user clicks the "Approve 1 & Dispatch" button
    Then autonomy vscode.postMessage should have been called with:
      | type     | approveGoalStories |
      | goalId   | goal-2             |
      | storyIds | story-1            |

  @autonomy
  Scenario: goalReviewed closes the modal and shows an "approved" toast
    Given the GoalDecomposerModal is open for goal "goal-1" with proposed stories:
      | id      | title                | priority |
      | story-1 | Implement toggle     | P1       |
    When the extension broadcasts a goalReviewed with status "approved" and 1 approved
    Then the GoalDecomposerModal should be closed
    And the webview should show a toast with text containing "approved"
    And the webview should show a toast with text containing "1"

  @autonomy
  Scenario: goalDispatched triggers a board refresh postMessage
    Given the GoalDecomposerModal is open for goal "goal-1" with proposed stories:
      | id      | title                | priority |
      | story-1 | Implement toggle     | P1       |
    And the extension broadcasts a goalReviewed with status "approved" and 1 approved
    When the extension broadcasts a goalDispatched with 1 persisted
    Then autonomy vscode.postMessage should have been called with type "agenticKanban:refresh"

  @autonomy
  Scenario: goalSubmitError shows an error toast
    When the extension broadcasts a goalSubmitError with error "decomposition failed"
    Then the webview should show a toast with type "error" and text containing "decomposition failed"

  # ═══════════════════════════════════════════════════════════════════════
  # SECTION 4: Dependency badge appearance
  # Verifies that an incoming updateDependencyBadges message is merged
  # into the rendered card items so KanbanCard can show "🔗 Blocked by N"
  # / "⛔ Blocked by N" badges from the live dependency graph.
  # ═══════════════════════════════════════════════════════════════════════

  @autonomy
  Scenario: updateDependencyBadges populates badge fields on the affected cards
    Given a freshly mounted autonomy webview context
    And the autonomy webview has item "story-1" in "Backlog" column
    And the autonomy webview has item "story-2" in "Backlog" column
    When the extension broadcasts an updateDependencyBadges with:
      | id           | blockedBy | hasCycle | blockerTitles      |
      | story-1      | 2         | false    | story-2,story-3    |
    Then the merged displayItem for "story-1" should have blockedBy 2
    And the merged displayItem for "story-1" should have hasCycle false
    And the merged displayItem for "story-1" should have blockerTitles:
      | story-2 |
      | story-3 |
    And the merged displayItem for "story-2" should have blockedBy 0

  @autonomy
  Scenario: updateDependencyBadges with empty array clears all badges
    Given a freshly mounted autonomy webview context
    And the autonomy webview has item "story-1" in "Backlog" column
    And the extension broadcasts an updateDependencyBadges with:
      | id      | blockedBy | hasCycle | blockerTitles   |
      | story-1 | 1         | false    | story-2         |
    And the merged displayItem for "story-1" should have blockedBy 1
    When the extension broadcasts an updateDependencyBadges with:
      | id      | blockedBy | hasCycle | blockerTitles   |
    Then the merged displayItem for "story-1" should have blockedBy 0
    And the merged displayItem for "story-1" should have blockerTitles:
      |  |

  @autonomy
  Scenario: Badge with hasCycle=true is rendered as a cycle warning
    Given a freshly mounted autonomy webview context
    And the autonomy webview has item "story-cycle" in "Backlog" column
    When the extension broadcasts an updateDependencyBadges with:
      | id           | blockedBy | hasCycle | blockerTitles      |
      | story-cycle  | 1         | true     | story-cycle        |
    Then the merged displayItem for "story-cycle" should have hasCycle true

  # Regression: newly-wired autonomy modules broadcast webview events
  # Verifies that autonomous git (#17) hook callbacks produce the expected
  # vscode.postMessage calls when the lifecycle invokes them.
  @wip
  Scenario: autonomous git hook broadcasts a gitBranch event to the webview
    Given a freshly mounted autonomy webview context
    When the autonomy lifecycle fires the git onBranch hook for story "story-1" with branch "aac/story-story-1"
    Then autonomy vscode.postMessage should have been called with:
      | type        | gitBranch            |
      | storyId     | story-1              |
      | branchName  | aac/story-story-1    |

  # ═══════════════════════════════════════════════════════════════════════
  # SECTION 5: Systemic-issue banner (issue #4)
  # Verifies that a systemicIssue broadcast renders a color-coded,
  # dismissable banner in the AutonomyBar with the correct severity and
  # pattern count.
  # ═══════════════════════════════════════════════════════════════════════

  @autonomy
  Scenario: systemicIssue broadcast renders a dismissable banner with severity color and pattern count
    When the extension broadcasts a systemicIssue with patterns:
      | policyId           | severity | count | affectedArtifactIds       | sampleMessage                    |
      | schema-conformance | critical | 4     | a1,a2,a3,a4               | Schema validation failed         |
      | required-fields    | high     | 3     | a5,a6,a7                  | Story must have a title          |
      | no-placeholders    | low      | 5     | a8,a9,a10,a11,a12         | Contains placeholder: "TODO"     |
    Then the systemic-issue banner should show severity "critical"
    And the systemic-issue banner should show summary "3 systemic issues detected"

  @autonomy
  Scenario: clicking the dismiss button clears the systemic-issue banner
    When the extension broadcasts a systemicIssue with patterns:
      | policyId           | severity | count | affectedArtifactIds | sampleMessage            |
      | schema-conformance | high     | 3     | a1,a2,a3            | Schema validation failed |
    Then the systemic-issue banner should show severity "high"
    When the user clicks the dismiss button on the systemic-issue banner
    Then the systemic-issue banner should not be visible