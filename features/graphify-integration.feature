Feature: Graphify Knowledge Graph Integration
  As an AgileAgentCanvas user
  I want the extension to detect, bootstrap, and query a graphify knowledge graph
  So that AI assistance is graph-aware and the canvas shows codebase structure

  Background:
    Given a fresh graphify detector context

  # ─── CLI Detection ────────────────────────────────────────────────

  @graphify @detection
  Scenario: graphify unavailable returns correct status
    Given the graphify CLI is unavailable
    When I detect graphify for workspace "/my/project"
    Then the graphify cliForm should be "unavailable"
    And the graphify graphPresent should be false
    And the graphify recommendation should be "install"

  @graphify @detection
  Scenario: graphify CLI available but no graph present
    Given the graphify CLI is available as "cli"
    And no graph.json exists in the workspace
    When I detect graphify for workspace "/my/project"
    Then the graphify cliForm should be "cli"
    And the graphify graphPresent should be false
    And the graphify recommendation should be "bootstrap"

  @graphify @detection
  Scenario: graphify module available but no graph present
    Given the graphify CLI is available as "module"
    And no graph.json exists in the workspace
    When I detect graphify for workspace "/my/project"
    Then the graphify cliForm should be "module"
    And the graphify graphPresent should be false
    And the graphify recommendation should be "bootstrap"

  @graphify @detection
  Scenario: graph.json present but not wired into copilot-instructions
    Given the graphify CLI is available as "cli"
    And a graph.json with 50 nodes exists in the workspace
    And no copilot-instructions.md contains graphify reference
    When I detect graphify for workspace "/my/project"
    Then the graphify graphPresent should be true
    And the graphify wired should be false
    And the graphify recommendation should be "wire"

  @graphify @detection
  Scenario: graph.json present and wired into copilot-instructions
    Given the graphify CLI is available as "cli"
    And a graph.json with 50 nodes exists in the workspace
    And copilot-instructions.md contains a graphify reference
    When I detect graphify for workspace "/my/project"
    Then the graphify graphPresent should be true
    And the graphify wired should be true
    And the graphify recommendation should be "ready"

  # ─── Cache Behaviour ──────────────────────────────────────────────

  @graphify @cache
  Scenario: Detection result is cached for the same workspace root
    Given the graphify CLI is available as "cli"
    And a graph.json with 10 nodes exists in the workspace
    And copilot-instructions.md contains a graphify reference
    When I detect graphify for workspace "/my/project"
    And I detect graphify for workspace "/my/project"
    Then the graphify detection should have been called once

  @graphify @cache
  Scenario: Different workspace roots have independent caches
    Given the graphify CLI is available as "cli"
    And a graph.json with 10 nodes exists in the workspace
    And copilot-instructions.md contains a graphify reference
    When I detect graphify for workspace "/project-a"
    And I detect graphify for workspace "/project-b"
    Then the graphify cliForm should be "cli"
    And the graphify recommendation should be "ready"

  @graphify @cache
  Scenario: Clearing cache forces re-detection
    Given the graphify CLI is available as "cli"
    And a graph.json with 10 nodes exists in the workspace
    When I detect graphify for workspace "/my/project"
    And I clear the graphify cache for workspace "/my/project"
    And I detect graphify for workspace "/my/project"
    Then the graphify detection should have been called twice

  # ─── CLI Argument Builder ─────────────────────────────────────────

  @graphify @runner
  Scenario: buildArgv with bare CLI form uses graphify directly
    Given the graphify CLI is available as "cli"
    When I build argv for cliForm "cli" with args "detect ." and pythonPath "python"
    Then the argv should equal '["graphify","detect","."]'

  @graphify @runner
  Scenario: buildArgv with module form uses python -m graphify
    Given the graphify CLI is available as "cli"
    When I build argv for cliForm "module" with args "detect ." and pythonPath "python3"
    Then the argv should equal '["python3","-m","graphify","detect","."]'

  @graphify @runner
  Scenario: buildArgv with unavailable form returns empty
    When I build argv for cliForm "unavailable" with args "detect ." and pythonPath "python"
    Then the argv should equal '[]'

  # ─── Graph Loader ─────────────────────────────────────────────────

  @graphify @loader
  Scenario: Loading graph.json with nodes and edges
    Given a graph.json fixture with 12 nodes and 8 edges
    When I load the graph for workspace "/my/project"
    Then the loaded graph should have 12 nodes
    And the loaded graph should have 8 edges

  @graphify @loader
  Scenario: Loading graph.json returns null when file missing
    Given no graph.json exists at workspace "/my/project"
    When I load the graph for workspace "/my/project"
    Then the loaded graph should be null

  @graphify @loader
  Scenario: Loading communities from graph with community data
    Given a graph.json fixture with 3 communities and 6 nodes each
    When I load communities for workspace "/my/project"
    Then I should get 3 communities
    And each community should have a kind of "code-community"
    And each community should have a non-empty label
    And each community should have a size greater than 0

  @graphify @loader
  Scenario: Loading communities from graph without community data
    Given a graph.json fixture with no community data
    When I load communities for workspace "/my/project"
    Then I should get 0 communities

  @graphify @loader
  Scenario: Cached graph is returned on second load without re-reading file
    Given a graph.json fixture with 5 nodes and 3 edges
    When I load the graph for workspace "/my/project"
    And I load the graph for workspace "/my/project"
    Then the graph file read count should be 1

  # ─── Canvas Codebase Lane ─────────────────────────────────────────

  @graphify @canvas
  Scenario: No code-community cards when showCodebaseLane is disabled
    Given showCodebaseLane config is disabled
    And a graph.json fixture with 2 communities exists
    When I build artifacts from an empty store with workspace root "/my/project"
    Then no artifacts of type "code-community" should exist

  @graphify @canvas
  Scenario: No code-community cards when no graph present
    Given showCodebaseLane config is enabled
    And no graph.json exists at workspace "/my/project"
    When I build artifacts from an empty store with workspace root "/my/project"
    Then no artifacts of type "code-community" should exist

  @graphify @canvas
  Scenario: Code-community cards appear when showCodebaseLane enabled and graph present
    Given showCodebaseLane config is enabled
    And a graph.json fixture with 3 communities exists at workspace "/my/project"
    When I build artifacts from an empty store with workspace root "/my/project"
    Then 3 artifacts of type "code-community" should exist
    And each code-community artifact should have a valid position
    And each code-community artifact should have a non-empty title

  @graphify @canvas
  Scenario: Code-community cards are placed at x >= 4600
    Given showCodebaseLane config is enabled
    And a graph.json fixture with 2 communities exists at workspace "/my/project"
    When I build artifacts from an empty store with workspace root "/my/project"
    Then all code-community artifacts should have position x >= 4600
