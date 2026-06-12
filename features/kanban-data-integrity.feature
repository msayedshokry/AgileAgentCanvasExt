Feature: Status-only artifact updates preserve content
  Dragging a card between Kanban columns sends only a status change. Harness
  auto-fix must never mistake the real (unchanged) fields for missing ones and
  overwrite them with generic placeholders.

  Scenario: Moving a story to In-Progress keeps its title and acceptance criteria
    Given an artifact store whose harness auto-fills missing story fields
    And a story "STORY-1" titled "Real Login Story" with one acceptance criterion
    When I update story "STORY-1" status to "in-progress"
    Then story "STORY-1" still has the title "Real Login Story"
    And story "STORY-1" still has 1 acceptance criterion
    And story "STORY-1" has status "in-progress"
